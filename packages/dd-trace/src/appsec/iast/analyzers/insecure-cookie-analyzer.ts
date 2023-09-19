import { INSECURE_COOKIE } from '../vulnerabilities.ts';
import CookieAnalyzer from './cookie-analyzer.ts';

class InsecureCookieAnalyzer extends CookieAnalyzer {
  constructor() {
    super(INSECURE_COOKIE, 'secure');
  }
}

export default new InsecureCookieAnalyzer();
