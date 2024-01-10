import { lookup } from 'node:dns'; // cache to avoid instrumentation
import { Buffer } from 'node:buffer';
import request from './exporters/common/request.ts';
import { isIP } from 'node:net';
import log from './log/index.ts';
import { IDogStatsD, IDogStatsDTags } from './interfaces.ts';

const TYPE_COUNTER = 'c';
const TYPE_GAUGE = 'g';
const TYPE_DISTRIBUTION = 'd';

const encoder = new TextEncoder();

type DogStatsDClientOptions = {
  metricsProxyUrl?: URL | string;
  host?: string;
  port?: number;
  prefix?: string;
  tags?: IDogStatsDTags;
};

class DogStatsDClient implements IDogStatsD {
  private _httpOptions?: { url: string; path: string };
  private _host: string;
  private _family: number;
  private _port: number;
  private _prefix: string;
  private _tags: IDogStatsDTags;
  private _queue: Uint8Array[];
  private _udp4: Deno.DatagramConn;
  private _udp6: Deno.DatagramConn;
  constructor(options: DogStatsDClientOptions = {}) {
    if (options.metricsProxyUrl) {
      this._httpOptions = {
        url: options.metricsProxyUrl.toString(),
        path: '/dogstatsd/v2/proxy',
      };
    }

    this._host = options.host || 'localhost';
    this._family = isIP(this._host);
    this._port = options.port || 8125;
    this._prefix = options.prefix || '';
    this._tags = options.tags || [];
    this._queue = [];
    this._udp4 = Deno.listenDatagram({
      transport: 'udp',
      hostname: '127.0.0.1',
      port: 0,
    });
    this._udp6 = Deno.listenDatagram({
      transport: 'udp',
      hostname: '::1',
      port: 0,
    });
  }

  increment(stat: string, value = 1, tags?: IDogStatsDTags) {
    this._add(stat, value, TYPE_COUNTER, tags);
  }

  decrement(stat: string, value = 1, tags?: IDogStatsDTags): void {
    this._add(stat, -value, TYPE_COUNTER, tags);
  }

  gauge(stat: string, value: number, tags?: IDogStatsDTags) {
    this._add(stat, value, TYPE_GAUGE, tags);
  }

  distribution(stat: string, value: number, tags?: IDogStatsDTags) {
    this._add(stat, value, TYPE_DISTRIBUTION, tags);
  }

  flush() {
    const queue = this._queue;

    log.debug(`Flushing ${queue.length} metrics via ${this._httpOptions ? 'HTTP' : 'UDP'}`);

    if (this._queue.length === 0) {
      return;
    }

    this._queue = [];

    const request = this._httpOptions ? this._sendHttp(queue) : this._sendUdp(queue);

    request.catch((err) => {
      log.error(err);
    });
  }

  _sendHttp(queue: Uint8Array[]) {
    const buffer = Buffer.concat(queue);

    return new Promise<void>((resolve, reject) => {
      request(buffer, {
        method: 'POST',
        ...this._httpOptions,
      }, (err: { stack: string; status: number }) => {
        if (!err) {
          resolve();
          return;
        }

        log.error('HTTP error from agent: ' + err.stack);

        if (err.status) {
          // Inside this if-block, we have connectivity to the agent, but
          // we're not getting a 200 from the proxy endpoint. If it's a 404,
          // then we know we'll never have the endpoint, so just clear out the
          // options. Either way, we can give UDP a try.
          if (err.status === 404) {
            this._httpOptions = undefined;
          }
          resolve(this._sendUdp(queue));
        } else {
          reject(err);
        }
      });
    });
  }

  _sendUdp(queue: Uint8Array[]) {
    if (this._family !== 0) {
      return this._sendUdpFromQueue(queue, this._host, this._family);
    }

    return new Promise<void>((resolve, reject) => {
      lookup(this._host, (err, address, family: number) => {
        if (err) {
          reject(err);
        } else {
          resolve(this._sendUdpFromQueue(queue, address, family));
        }
      });
    });
  }

  async _sendUdpFromQueue(queue: Uint8Array[], address: string, family: number) {
    const socket = family === 6 ? this._udp6 : this._udp4;

    for (const buffer of queue) {
      log.debug(`Sending to DogStatsD: ${buffer}`);
      await socket.send(buffer, {
        transport: 'udp',
        hostname: address,
        port: this._port,
      });
    }
  }

  _add(stat: string, value: number, type: string, tags?: IDogStatsDTags) {
    const message = `${this._prefix + stat}:${value}|${type}`;

    tags = tags ? this._tags.concat(tags) : this._tags;

    if (tags.length > 0) {
      this._write(`${message}|#${tags.join(',')}\n`);
    } else {
      this._write(`${message}\n`);
    }
  }

  _write(message: string) {
    this._queue.push(
      encoder.encode(message),
    );
  }

  static generateClientConfig(config = {}) {
    const tags: IDogStatsDTags = [];

    if (config.tags) {
      Object.keys(config.tags)
        .filter((key) => typeof config.tags[key] === 'string')
        .filter((key) => {
          // Skip runtime-id unless enabled as cardinality may be too high
          if (key !== 'runtime-id') return true;
          return (config.experimental && config.experimental.runtimeId);
        })
        .forEach((key) => {
          // https://docs.datadoghq.com/tagging/#defining-tags
          const value = config.tags[key].replace(/[^a-z0-9_:./-]/ig, '_');

          tags.push(`${key}:${value}`);
        });
    }

    const clientConfig = {
      host: config.dogstatsd.hostname,
      port: config.dogstatsd.port,
      tags,
    };

    if (config.url) {
      clientConfig.metricsProxyUrl = config.url;
    } else if (config.port) {
      clientConfig.metricsProxyUrl = new URL(`http://${config.hostname || 'localhost'}:${config.port}`);
    }

    return clientConfig;
  }
}

class NoopDogStatsDClient implements IDogStatsD {
  increment(stat: string, value?: number, tags?: IDogStatsDTags): void {
  }
  decrement(stat: string, value?: number, tags?: IDogStatsDTags): void {
  }
  distribution(stat: string, value?: number, tags?: IDogStatsDTags): void {
  }
  gauge(stat: string, value?: number, tags?: IDogStatsDTags): void {
  }
  flush(): void {
  }
}

// This is a simplified user-facing proxy to the underlying DogStatsDClient instance
class CustomMetrics {
  constructor(readonly dogstatsd?: IDogStatsD) {
  }

  static noop(): CustomMetrics {
    return new CustomMetrics();
  }

  static forConfig(config): CustomMetrics {
    const clientConfig = DogStatsDClient.generateClientConfig(config);
    const dogstatsd = new DogStatsDClient(clientConfig);

    return new CustomMetrics(dogstatsd);
  }

  increment(stat: string, value = 1, tags?: Record<string, unknown>) {
    return this.dogstatsd?.increment(
      stat,
      value,
      CustomMetrics.tagTranslator(tags),
    );
  }

  decrement(stat: string, value = 1, tags?: Record<string, unknown>) {
    return this.dogstatsd?.increment(
      stat,
      value * -1,
      CustomMetrics.tagTranslator(tags),
    );
  }

  gauge(stat: string, value: number, tags?: Record<string, unknown>) {
    return this.dogstatsd?.gauge(
      stat,
      value,
      CustomMetrics.tagTranslator(tags),
    );
  }

  distribution(stat: string, value: number, tags?: Record<string, unknown>) {
    return this.dogstatsd?.distribution(
      stat,
      value,
      CustomMetrics.tagTranslator(tags),
    );
  }

  flush() {
    return this.dogstatsd?.flush();
  }

  /**
   * Exposing { tagName: 'tagValue' } to the end user
   * These are translated into [ 'tagName:tagValue' ] for internal use
   */
  static tagTranslator(objTags?: Record<string, unknown>) {
    const arrTags: IDogStatsDTags = [];

    if (!objTags) return arrTags;

    for (const [key, value] of Object.entries(objTags)) {
      arrTags.push(`${key}:${value}`);
    }

    return arrTags;
  }
}

export { CustomMetrics, DogStatsDClient, NoopDogStatsDClient };
