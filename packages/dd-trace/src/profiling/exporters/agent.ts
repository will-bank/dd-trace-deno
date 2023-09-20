import { Buffer } from "https://deno.land/std@0.177.0/node/buffer.ts";
import retry from 'npm:retry@0.13.1';
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

// TODO: avoid using dd-trace internals. Make this a separate module?
import docker from '../../exporters/common/docker.ts';
import FormData from '../../exporters/common/form-data.ts';
import { storage } from '../../../../datadog-core/index.ts';
import packageJson from 'npm:dd-trace@4.13.1/package.json' assert { type: 'json' };
const containerId = docker.id();

function sendRequest(
  options: { method?: string; path?: string; headers?: any; timeout?: number; protocol?: any },
  form: FormData,
  callback: { (err: any, response: any): void; (arg0: Error, arg1: undefined): void },
) {
  const request = options.protocol === 'https:' ? httpsRequest : httpRequest;

  const store = storage.getStore();
  storage.enterWith({ noop: true });
  const req = request(options, (res: { statusCode: number }) => {
    if (res.statusCode >= 400) {
      const error = new Error(`HTTP Error ${res.statusCode}`);

      error.status = res.statusCode;

      callback(error);
    } else {
      callback(null, res);
    }
  });
  req.on('error', callback);

  if (form) form.pipe(req);
  storage.enterWith(store);
}

function getBody(
  stream: { on: (arg0: string, arg1: { (chunk: any): number; (): void }) => void },
  callback: { (err: any, body: any): void; (arg0: any, arg1: any): void },
) {

  const chunks = [];

  stream.on('error', callback);

  stream.on('data', (chunk) => chunks.push(chunk));

  stream.on('end', () => {

    callback(null, Buffer.concat(chunks));
  });
}

function computeRetries(uploadTimeout: number) {
  let tries = 0;
  while (tries < 2 || uploadTimeout > 1000) {
    tries++;
    uploadTimeout /= 2;
  }
  return [tries, Math.floor(uploadTimeout)];
}

class AgentExporter {
  private _url: any;
  private _logger: any;
  private _backoffTime: number;
  private _backoffTries: number;

  constructor({ url, logger, uploadTimeout } = {}) {
    this._url = url;
    this._logger = logger;

    const [backoffTries, backoffTime] = computeRetries(uploadTimeout);

    this._backoffTime = backoffTime;
    this._backoffTries = backoffTries;
  }


  export({ profiles, start, end, tags }) {
    const types = Object.keys(profiles);

    const fields: (string[] | any[])[] = [
      ['recording-start', start.toISOString()],
      ['recording-end', end.toISOString()],
      ['language', 'typescript'],
      ['runtime', 'deno'],
      ['runtime_version', Deno.version.deno],
      ['profiler_version', packageJson.version],
      ['format', 'pprof'],

      ['tags[]', 'language:typescript'],
      ['tags[]', 'runtime:deno'],
      ['tags[]', `runtime_version:${Deno.version.deno}`],
      ['tags[]', `profiler_version:${packageJson.version}`],
      ['tags[]', 'format:pprof'],

      ...Object.entries(tags).map(([key, value]) => ['tags[]', `${key}:${value}`]),
    ];

    this._logger.debug(() => {
      const body = fields.map(([key, value]) => `  ${key}: ${value}`).join('\n');
      return `Building agent export report: ${'\n' + body}`;
    });

    for (let index = 0; index < types.length; index++) {
      const type = types[index];
      const buffer = profiles[type];

      this._logger.debug(() => {
        const bytes = buffer.toString('hex').match(/../g).join(' ');
        return `Adding ${type} profile to agent export: ` + bytes;
      });

      fields.push([`types[${index}]`, type]);
      fields.push([`data[${index}]`, buffer, {
        filename: `${type}.pb.gz`,
        contentType: 'application/octet-stream',
        knownLength: buffer.length,
      }]);
    }


    return new Promise((resolve: () => void, reject: (arg0: Error) => void) => {
      const operation = retry.operation({
        randomize: true,
        minTimeout: this._backoffTime,
        retries: this._backoffTries,
        unref: true,
      });

      operation.attempt((attempt: number) => {
        const form = new FormData();

        for (const [key, value, options] of fields) {
          form.append(key, value, options);
        }

        const options = {
          method: 'POST',
          path: '/profiling/v1/input',
          headers: form.getHeaders(),
          timeout: this._backoffTime * Math.pow(2, attempt),
        };

        if (containerId) {
          options.headers['Datadog-Container-ID'] = containerId;
        }

        if (this._url.protocol === 'unix:') {
          options.socketPath = this._url.pathname;
        } else {
          options.protocol = this._url.protocol;
          options.hostname = this._url.hostname;
          options.port = this._url.port;
        }

        this._logger.debug(() => {
          return `Submitting profiler agent report attempt #${attempt} to: ${JSON.stringify(options)}`;
        });

        sendRequest(options, form, (err: { message: any }, response) => {
          if (operation.retry(err)) {
            this._logger.error(`Error from the agent: ${err.message}`);
            return;
          } else if (err) {
            reject(new Error('Profiler agent export back-off period expired'));
            return;
          }

          getBody(response, (err: { message: any }, body: { toString: (arg0: string) => string }) => {
            if (err) {
              this._logger.error(`Error reading agent response: ${err.message}`);
            } else {
              this._logger.debug(() => {
                const bytes = (body.toString('hex').match(/../g) || []).join(' ');
                return `Agent export response: ${bytes}`;
              });
            }
          });

          resolve();
        });
      });
    });
  }
}

export { AgentExporter, computeRetries };
