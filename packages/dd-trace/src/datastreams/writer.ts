import packageJson from '../../../../package.json.ts';
import log from '../log/index.ts';
import request from '../exporters/common/request.ts';
import { format } from 'node:url';
import msgpack from 'https://esm.sh/msgpack-lite@0.1.26';
import zlib from 'node:zlib';
const codec = msgpack.createCodec({ int64: true });

function makeRequest(
  data,
  url: { protocol: any; hostname: any; port: any },
  cb: { (err: any, res: any): void; (err: any, res: any): void; (arg0: any, arg1: any): void },
) {
  const options = {
    path: '/v0.1/pipeline_stats',
    method: 'POST',
    headers: {
      'Datadog-Meta-Lang': 'typescript',
      'Datadog-Meta-Tracer-Version': packageJson.version,
      'Content-Type': 'application/msgpack',
      'Content-Encoding': 'gzip',
    },
  };

  options.protocol = url.protocol;

  options.hostname = url.hostname;

  options.port = url.port;

  log.debug(() => `Request to the intake: ${JSON.stringify(options)}`);

  request(data, options, (err, res) => {
    cb(err, res);
  });
}

class DataStreamsWriter {
  private _url: any;
  constructor(config: { hostname: any; port: any; url: any }) {
    const { hostname = '127.0.0.1', port = 8126, url } = config;
    this._url = url || new URL(format({
      protocol: 'http:',
      hostname: hostname || 'localhost',
      port,
    }));
  }

  flush(
    payload: {
      Env: any;
      Service: any;
      Stats: { Start: any; Duration: any; Stats: any[] }[];
      TracerVersion: any;
      Lang: string;
    },
  ) {
    if (!request.writable) {
      log.debug(() => `Maximum number of active requests reached. Payload discarded: ${JSON.stringify(payload)}`);
      return;
    }
    const encodedPayload = msgpack.encode(payload, { codec });

    zlib.gzip(encodedPayload, { level: 1 }, (err, compressedData) => {
      if (err) {
        log.error(err);
        return;
      }
      makeRequest(compressedData, this._url, (err, res) => {
        log.debug(`Response from the agent: ${res}`);
        if (err) {
          log.error(err);
        }
      });
    });
  }
}

export { DataStreamsWriter };
