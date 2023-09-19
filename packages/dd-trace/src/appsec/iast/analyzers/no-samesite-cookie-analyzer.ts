import { NO_SAMESITE_COOKIE } from '../vulnerabilities.ts';
import CookieAnalyzer from './cookie-analyzer.ts';

class NoSamesiteCookieAnalyzer extends CookieAnalyzer {
  constructor() {
    super(NO_SAMESITE_COOKIE, 'SameSite=strict');
  }
}

export default new NoSamesiteCookieAnalyzer();
