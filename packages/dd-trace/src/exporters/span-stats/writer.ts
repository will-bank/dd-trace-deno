import { SpanStatsEncoder } from '../../encode/span-stats.ts';

import packageJson from '../../../../../package.json.ts';
import BaseWriter from '../common/writer.ts';
import request from '../common/request.ts';
import log from '../../log/index.ts';

export default class Writer extends BaseWriter {
  constructor(url: URL) {
    super(url, (writer) => new SpanStatsEncoder(writer));
  }

  _sendPayload(data, _, done: () => void) {
    makeRequest(data, this.url, (err, res) => {
      if (err) {
        log.error(err);
        done();
        return;
      }
      log.debug(`Response from the intake: ${res}`);
      done();
    });
  }
}

function makeRequest(
  data,
  url: URL,
  cb: (err: Error | null, res: any) => void,
) {
  const options = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port,
    path: '/v0.6/stats',
    method: 'PUT',
    headers: {
      'Datadog-Meta-Lang': 'typescript',
      'Datadog-Meta-Tracer-Version': packageJson.version,
      'Content-Type': 'application/msgpack',
    },
  };

  log.debug(() => `Request to the intake: ${JSON.stringify(options)}`);

  request(data, options, (err, res) => {
    cb(err, res);
  });
}
