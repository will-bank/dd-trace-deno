import { lookup } from 'node:dns'; // cache to avoid instrumentation
import { Buffer } from 'node:buffer';
import request from './exporters/common/request.ts';
import dgram from 'node:dgram';
import { isIP } from 'node:net';
import log from './log/index.ts';

const MAX_BUFFER_SIZE = 1024; // limit from the agent

const TYPE_COUNTER = 'c';
const TYPE_GAUGE = 'g';
const TYPE_DISTRIBUTION = 'd';

class DogStatsDClient {
  private _httpOptions: { url: any; path: string };
  private _host: any;
  private _family: any;
  private _port: any;
  private _prefix: any;
  private _tags: any;
  private _queue: any[];
  private _buffer: string;
  private _offset: number;
  private _udp4: any;
  private _udp6: any;
  constructor(options = {}) {
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
    this._buffer = '';
    this._offset = 0;
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

  increment(stat, value, tags: any[]) {
    this._add(stat, value, TYPE_COUNTER, tags);
  }

  gauge(stat, value, tags: any[]) {
    this._add(stat, value, TYPE_GAUGE, tags);
  }

  distribution(stat, value, tags: any[]) {
    this._add(stat, value, TYPE_DISTRIBUTION, tags);
  }

  flush() {
    const queue = this._enqueue();

    log.debug(`Flushing ${queue.length} metrics via ${this._httpOptions ? 'HTTP' : 'UDP'}`);

    if (this._queue.length === 0) return;

    this._queue = [];

    if (this._httpOptions) {
      this._sendHttp(queue);
    } else {
      this._sendUdp(queue);
    }
  }

  _sendHttp(queue: any[]) {
    const buffer = Buffer.concat(queue);
    request(buffer, this._httpOptions, (err: { stack: string; status: number }) => {
      if (err) {
        log.error('HTTP error from agent: ' + err.stack);
        if (err.status) {
          // Inside this if-block, we have connectivity to the agent, but
          // we're not getting a 200 from the proxy endpoint. If it's a 404,
          // then we know we'll never have the endpoint, so just clear out the
          // options. Either way, we can give UDP a try.
          if (err.status === 404) {
            this._httpOptions = null;
          }
          this._sendUdp(queue);
        }
      }
    });
  }

  _sendUdp(queue: any[]) {
    if (this._family !== 0) {
      this._sendUdpFromQueue(queue, this._host, this._family);
    } else {
      lookup(this._host, (err, address, family: number) => {
        if (err) return log.error(err);
        this._sendUdpFromQueue(queue, address, family);
      });
    }
  }

  _sendUdpFromQueue(queue: any[], address, family: number) {
    const socket = family === 6 ? this._udp6 : this._udp4;

    queue.forEach((buffer: string | any[]) => {
      log.debug(`Sending to DogStatsD: ${buffer}`);
      socket.send(buffer, 0, buffer.length, this._port, address);
    });
  }

  _add(stat, value, type: string, tags: any[]) {
    const message = `${this._prefix + stat}:${value}|${type}`;

    tags = tags ? this._tags.concat(tags) : this._tags;

    if (tags.length > 0) {
      this._write(`${message}|#${tags.join(',')}\n`);
    } else {
      this._write(`${message}\n`);
    }
  }

  _write(message: string) {
    const offset = Buffer.byteLength(message);

    if (this._offset + offset > MAX_BUFFER_SIZE) {
      this._enqueue();
    }

    this._offset += offset;
    this._buffer += message;
  }

  _enqueue() {
    if (this._offset > 0) {
      this._queue.push(new TextEncoder().encode(this._buffer));
      this._buffer = '';
      this._offset = 0;
    }

    return this._queue;
  }

  static generateClientConfig(config = {}) {
    const tags: string[] = [];

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

class NoopDogStatsDClient {
  gauge() {}

  increment() {}

  distribution() {}

  flush() {}
}

// This is a simplified user-facing proxy to the underlying DogStatsDClient instance
class CustomMetrics {
  dogstatsd: any;
  constructor(config) {
    const clientConfig = DogStatsDClient.generateClientConfig(config);
    this.dogstatsd = new DogStatsDClient(clientConfig);
  }

  increment(stat, value = 1, tags) {
    return this.dogstatsd.increment(
      stat,
      value,
      CustomMetrics.tagTranslator(tags),
    );
  }

  decrement(stat, value = 1, tags) {
    return this.dogstatsd.increment(
      stat,
      value * -1,
      CustomMetrics.tagTranslator(tags),
    );
  }

  gauge(stat, value, tags) {
    return this.dogstatsd.gauge(
      stat,
      value,
      CustomMetrics.tagTranslator(tags),
    );
  }

  distribution(stat, value, tags) {
    return this.dogstatsd.distribution(
      stat,
      value,
      CustomMetrics.tagTranslator(tags),
    );
  }

  flush() {
    return this.dogstatsd.flush();
  }

  /**
   * Exposing { tagName: 'tagValue' } to the end user
   * These are translated into [ 'tagName:tagValue' ] for internal use
   */
  static tagTranslator(objTags) {
    const arrTags: string[] = [];

    if (!objTags) return arrTags;

    for (const [key, value] of Object.entries(objTags)) {
      arrTags.push(`${key}:${value}`);
    }

    return arrTags;
  }
}

export { CustomMetrics, DogStatsDClient, NoopDogStatsDClient };
