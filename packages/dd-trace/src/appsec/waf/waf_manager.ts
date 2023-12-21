import log from '../../log/index.ts';
import * as Reporter from '../reporter.ts';
import WAFContextWrapper from './waf_context_wrapper.ts';

const contexts = new WeakMap();

export default class WAFManager {
  config: any;
  wafTimeout: any;
  ddwaf: any;
  ddwafVersion: any;

  constructor(rules, config: { wafTimeout: any }) {
    this.config = config;
    this.wafTimeout = config.wafTimeout;
    this.ddwaf = this._loadDDWAF(rules);
    this.ddwafVersion = this.ddwaf.constructor.version();

    Reporter.reportWafInit(this.ddwafVersion, this.ddwaf.rulesInfo);
  }


  _loadDDWAF(rules) {
    try {
      // require in `try/catch` because this can throw at require time
      const { DDWAF } = await import('@datadog/native-appsec');

      const { obfuscatorKeyRegex, obfuscatorValueRegex } = this.config;
      return new DDWAF(rules, { obfuscatorKeyRegex, obfuscatorValueRegex });
    } catch (err) {
      log.error('AppSec could not load native package. In-app WAF features will not be available.');

      throw err;
    }
  }


  getWAFContext(req) {
    let wafContext = contexts.get(req);

    if (!wafContext) {
      wafContext = new WAFContextWrapper(
        this.ddwaf.createContext(),
        this.ddwaf.requiredAddresses,
        this.wafTimeout,
        this.ddwaf.rulesInfo,
        this.ddwafVersion,
      );
      contexts.set(req, wafContext);
    }

    return wafContext;
  }


  update(newRules) {
    this.ddwaf.update(newRules);

    Reporter.reportWafUpdate(this.ddwafVersion, this.ddwaf.rulesInfo.version);
  }

  destroy() {
    if (this.ddwaf) {
      this.ddwaf.dispose();
    }
  }
}
