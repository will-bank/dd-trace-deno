import Analyzer from './vulnerability-analyzer.ts';

class InjectionAnalyzer extends Analyzer {
  _isVulnerable(value, iastContext: { [x: string]: any }) {
    // FIXME: taint-tracking is not supported
    return false;
  }

  _getEvidence(
    value,
    iastContext: {
      [x: string]: any;
      rootSpan?: { context: () => { (): any; new (): any; toSpanId: { (): any; new (): any } } };
    },
  ) {
    // FIXME: taint-tracking is not supported
    return { value, ranges: [] };
  }
}

export default InjectionAnalyzer;
