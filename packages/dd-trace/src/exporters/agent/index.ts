import { format } from 'node:url';
import log from '../../log/index.ts';
import Writer from './writer.ts';

class AgentExporter {
  private _config: any;
  private _url: any;
  private _writer: Writer;
  private _timer: any;

  constructor(
    config: { url: any; hostname: any; port: any; lookup: any; protocolVersion: any; stats?: {} },
    prioritySampler,
  ) {
    this._config = config;
    const { url, hostname, port, lookup, protocolVersion, stats = {} } = config;
    this._url = url || new URL(format({
      protocol: 'http:',
      hostname: hostname || 'localhost',
      port,
    }));

    const headers = {};

    if (stats.enabled) {
      headers['Datadog-Client-Computed-Stats'] = 'yes';
    }

    this._writer = new Writer({
      url: this._url,
      prioritySampler,
      lookup,
      protocolVersion,
      headers,
    });

    this._timer = undefined;

    addEventListener('beforeunload', () => this._writer.flush());
  }

  setUrl(url: string | URL) {
    try {
      url = new URL(url);
      this._url = url;

      this._writer.setUrl(url);
    } catch (e) {
      log.warn(e.stack);
    }
  }

  export(spans) {
    this._writer.append(spans);

    const { flushInterval } = this._config;

    if (flushInterval === 0) {
      this._writer.flush();
    } else if (flushInterval > 0 && !this._timer) {
      this._timer = setTimeout(() => {
        this._writer.flush();
        this._timer = clearTimeout(this._timer);
      }, flushInterval);
      Deno.unrefTimer(this._timer);
    }
  }

  flush(done = () => {}) {
    this._writer.flush(done);
  }
}

export default AgentExporter;
