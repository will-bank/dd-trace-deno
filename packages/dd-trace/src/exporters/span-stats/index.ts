import { format } from 'node:url';

import Writer from './writer.ts';

class SpanStatsExporter {
  private url: URL;
  private writer: Writer;

  constructor(config: { hostname?: '127.0.0.1'; port?: 8126; tags: any; url: any }) {
    const { hostname = '127.0.0.1', port = 8126, tags, url } = config;
    this.url = url || new URL(format({
      protocol: 'http:',
      hostname: hostname || 'localhost',
      port,
    }));

    // FIXME: also pass tags to Writer
    this.writer = new Writer(this.url);
  }

  export(payload) {
    this.writer.append(payload);

    this.writer.flush();
  }
}

export { SpanStatsExporter };
