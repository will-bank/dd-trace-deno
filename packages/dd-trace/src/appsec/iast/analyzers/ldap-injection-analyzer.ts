import InjectionAnalyzer from './injection-analyzer.ts';
import { LDAP_INJECTION } from '../vulnerabilities.ts';
import { getNodeModulesPaths } from '../path-line.ts';

const EXCLUDED_PATHS = getNodeModulesPaths('ldapjs-promise');

class LdapInjectionAnalyzer extends InjectionAnalyzer {
  constructor() {
    super(LDAP_INJECTION);
  }

  onConfigure() {

    this.addSub('datadog:ldapjs:client:search', ({ base, filter }) => this.analyzeAll(base, filter));
  }

  _getExcludedPaths() {
    return EXCLUDED_PATHS;
  }
}

export default new LdapInjectionAnalyzer();
