import request from '../../../exporters/common/request.ts';
import { safeJSONStringify } from '../../../exporters/common/util.ts';
import log from '../../../log/index.ts';

import { AgentlessCiVisibilityEncoder } from '../../../encode/agentless-ci-visibility.ts';
import BaseWriter from '../../../exporters/common/writer.ts';

class Writer extends BaseWriter {
  private _url: any;
  private _encoder: AgentlessCiVisibilityEncoder;
  private _evpProxyPrefix: string;

  constructor({ url, tags, evpProxyPrefix = '' }) {

    super(...arguments);
    const { 'runtime-id': runtimeId, env, service } = tags;
    this._url = url;
    this._encoder = new AgentlessCiVisibilityEncoder(this, { runtimeId, env, service });
    this._evpProxyPrefix = evpProxyPrefix;
  }


  _sendPayload(data, _, done: () => void) {
    const options = {
      path: '/api/v2/citestcycle',
      method: 'POST',
      headers: {
        'dd-api-key': Deno.env.get('DATADOG_API_KEY') || Deno.env.get('DD_API_KEY'),
        'Content-Type': 'application/msgpack',
      },
      timeout: 15000,
      url: this._url,
    };

    if (this._evpProxyPrefix) {
      options.path = `${this._evpProxyPrefix}/api/v2/citestcycle`;
      delete options.headers['dd-api-key'];

      options.headers['X-Datadog-EVP-Subdomain'] = 'citestcycle-intake';
    }

    log.debug(() => `Request to the intake: ${safeJSONStringify(options)}`);


    request(data, options, (err, res) => {
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

export default Writer;
