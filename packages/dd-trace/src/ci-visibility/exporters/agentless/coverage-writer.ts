import request from '../../../exporters/common/request.ts';
import log from '../../../log/index.ts';
import { safeJSONStringify } from '../../../exporters/common/util.ts';

import { CoverageCIVisibilityEncoder } from '../../../encode/coverage-ci-visibility.ts';
import BaseWriter from '../../../exporters/common/writer.ts';

class Writer extends BaseWriter {
  private _url: any;
  private _encoder: CoverageCIVisibilityEncoder;
  private _evpProxyPrefix: string;

  constructor({ url, evpProxyPrefix = '' }) {

    super(...arguments);
    this._url = url;

    this._encoder = new CoverageCIVisibilityEncoder(this);
    this._evpProxyPrefix = evpProxyPrefix;
  }


  _sendPayload(form: { getHeaders: () => any }, _, done: () => void) {
    const options = {
      path: '/api/v2/citestcov',
      method: 'POST',
      headers: {
        'dd-api-key': Deno.env.get('DATADOG_API_KEY') || Deno.env.get('DD_API_KEY'),
        ...form.getHeaders(),
      },
      timeout: 15000,
      url: this._url,
    };

    if (this._evpProxyPrefix) {
      options.path = `${this._evpProxyPrefix}/api/v2/citestcov`;
      delete options.headers['dd-api-key'];
      options.headers['X-Datadog-EVP-Subdomain'] = 'citestcov-intake';
    }

    log.debug(() => `Request to the intake: ${safeJSONStringify(options)}`);


    request(form, options, (err, res) => {
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
