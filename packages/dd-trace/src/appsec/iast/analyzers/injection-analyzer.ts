import Analyzer from './vulnerability-analyzer.ts';
import { getRanges, isTainted } from '../taint-tracking/operations.ts';

class InjectionAnalyzer extends Analyzer {
  _isVulnerable(value, iastContext: { [x: string]: any }) {
    if (value) {
      return isTainted(iastContext, value);
    }
    return false;
  }

  _getEvidence(
    value,
    iastContext: {
      [x: string]: any;
      rootSpan?: { context: () => { (): any; new (): any; toSpanId: { (): any; new (): any } } };
    },
  ) {
    const ranges = getRanges(iastContext, value);
    return { value, ranges };
  }
}

export default InjectionAnalyzer;
