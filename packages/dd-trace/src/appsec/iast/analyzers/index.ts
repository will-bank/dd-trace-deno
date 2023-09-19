import analyzers from './analyzers.ts';
import setCookiesHeaderInterceptor from './set-cookies-header-interceptor.ts';

function enableAllAnalyzers(tracerConfig) {
  setCookiesHeaderInterceptor.configure({ enabled: true, tracerConfig });
  for (const analyzer in analyzers) {
    analyzers[analyzer].configure({ enabled: true, tracerConfig });
  }
}

function disableAllAnalyzers() {
  setCookiesHeaderInterceptor.configure(false);
  for (const analyzer in analyzers) {
    analyzers[analyzer].configure(false);
  }
}

export { disableAllAnalyzers, enableAllAnalyzers };
