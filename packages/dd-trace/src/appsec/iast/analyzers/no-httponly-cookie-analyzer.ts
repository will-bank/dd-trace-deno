import { NO_HTTPONLY_COOKIE } from '../vulnerabilities.ts';
import CookieAnalyzer from './cookie-analyzer.ts';

class NoHttponlyCookieAnalyzer extends CookieAnalyzer {
  constructor() {
    super(NO_HTTPONLY_COOKIE, 'HttpOnly');
  }
}

export default new NoHttponlyCookieAnalyzer();
