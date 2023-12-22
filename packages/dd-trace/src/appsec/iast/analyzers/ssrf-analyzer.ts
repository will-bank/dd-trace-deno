import InjectionAnalyzer from './injection-analyzer.ts';
import { SSRF } from '../vulnerabilities.ts';

class SSRFAnalyzer extends InjectionAnalyzer {
  constructor() {
    super(SSRF);
  }

  onConfigure() {
    this.addSub('apm:http:client:request:start', ({ args }) => {
      if (typeof args.originalUrl === 'string') {
        this.analyze(args.originalUrl);
      } else if (args.options && args.options.host) {
        this.analyze(args.options.host);
      }
    });

    this.addSub('apm:http2:client:connect:start', ({ authority }) => {
      if (authority && typeof authority === 'string') {
        this.analyze(authority);
      }
    });
  }
}

export default new SSRFAnalyzer();
