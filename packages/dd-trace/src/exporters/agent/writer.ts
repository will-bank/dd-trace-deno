import request from '../common/request.ts';
import { startupLog } from '../../startup-log.ts';
import * as runtimeMetrics from '../../runtime_metrics.ts';
import log from '../../log/index.ts';
import packageJson from '../../../../../package.json.ts';
import BaseWriter from '../common/writer.ts';
import { AgentEncoder as AgentEncoderV04 } from '../../encode/0.4.ts';
import { AgentEncoder as AgentEncoderV05 } from '../../encode/0.5.ts';

const METRIC_PREFIX = 'datadog.tracer.deno.exporter.agent';

export default class Writer extends BaseWriter {
  private _prioritySampler: any;
  private _lookup: any;
  private _protocolVersion: any;
  private _headers: any;

  constructor({ url, prioritySampler, lookup, protocolVersion, headers }) {
    super(url, (writer) => {
      const AgentEncoder = getEncoder(protocolVersion);
      return new AgentEncoder(writer);
    });

    this._prioritySampler = prioritySampler;
    this._lookup = lookup;
    this._protocolVersion = protocolVersion;
    this._headers = headers;
  }

  _sendPayload(data, count: { (err: any, res: any): void; (err: any, res: any): void }, done: () => void) {
    runtimeMetrics.increment(`${METRIC_PREFIX}.requests`, true);

    const { _headers, _lookup, _protocolVersion, url } = this;
    makeRequest(
      _protocolVersion,
      data,
      count,
      url,
      _headers,
      _lookup,
      true,
      (err: { name: any; code: any }, res: string, status) => {
        if (status) {
          runtimeMetrics.increment(`${METRIC_PREFIX}.responses`, true);
          runtimeMetrics.increment(`${METRIC_PREFIX}.responses.by.status`, `status:${status}`, true);
        } else if (err) {
          runtimeMetrics.increment(`${METRIC_PREFIX}.errors`, true);
          runtimeMetrics.increment(`${METRIC_PREFIX}.errors.by.name`, `name:${err.name}`, true);

          if (err.code) {
            runtimeMetrics.increment(`${METRIC_PREFIX}.errors.by.code`, `code:${err.code}`, true);
          }
        }

        startupLog({ agentError: err });

        if (err) {
          log.error(err);
          done();
          return;
        }

        log.debug(`Response from the agent: ${res}`);

        try {
          this._prioritySampler.update(JSON.parse(res).rate_by_service);
        } catch (e) {
          log.error(e);

          runtimeMetrics.increment(`${METRIC_PREFIX}.errors`, true);
          runtimeMetrics.increment(`${METRIC_PREFIX}.errors.by.name`, `name:${e.name}`, true);
        }
        done();
      },
    );
  }
}

function setHeader(headers: { [x: string]: any }, key: string, value: string) {
  if (value) {
    headers[key] = value;
  }
}

function getEncoder(protocolVersion: string) {
  return protocolVersion === '0.5' ? AgentEncoderV05 : AgentEncoderV04;
}

function makeRequest(
  version,
  data,
  count: { (err: any, res: any): void; (err: any, res: any): void },
  url: undefined,
  headers: undefined,
  lookup: undefined,
  needsStartupLog: boolean,
  cb: { (err: any, res: any, status: any): void; (arg0: any, arg1: any, arg2: any): void },
) {
  const options = {
    path: `/v${version}/traces`,
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/msgpack',
      'Datadog-Meta-Tracer-Version': packageJson.version,
      'X-Datadog-Trace-Count': String(count),
    },
    lookup,
    url,
  };

  setHeader(options.headers, 'Datadog-Meta-Lang', 'deno');
  setHeader(options.headers, 'Datadog-Meta-Lang-Version', Deno.version.deno);
  setHeader(options.headers, 'Datadog-Meta-Lang-Interpreter', 'v8');

  log.debug(() => `Request to the agent: ${JSON.stringify(options)}`);

  request(data, options, (err, res, status: number) => {
    if (needsStartupLog) {
      // Note that logging will only happen once, regardless of how many times this is called.
      startupLog({
        agentError: status !== 404 && status !== 200 ? err : undefined,
      });
    }
    cb(err, res, status);
  });
}
