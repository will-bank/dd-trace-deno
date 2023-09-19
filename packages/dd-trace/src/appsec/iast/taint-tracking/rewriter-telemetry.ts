import iastTelemetry from './telemetry.ts';
import { Verbosity } from '../telemetry/verbosity.ts';
import { INSTRUMENTED_PROPAGATION } from '../telemetry/iast-metric.ts';

const telemetryRewriter = {

  off(content, filename, rewriter: { rewrite: (arg0: any, arg1: any) => any }) {
    return rewriter.rewrite(content, filename);
  },


  information(content, filename, rewriter: { rewrite: (arg0: any, arg1: any) => any }) {
    const response = this.off(content, filename, rewriter);

    const metrics = response.metrics;
    if (metrics && metrics.instrumentedPropagation) {

      INSTRUMENTED_PROPAGATION.add(metrics.instrumentedPropagation);
    }

    return response;
  },
};

function getRewriteFunction(rewriter: { rewrite: (arg0: any, arg1: any) => any }) {
  switch (iastTelemetry.verbosity) {
    case Verbosity.OFF:

      return (content, filename) => telemetryRewriter.off(content, filename, rewriter);
    default:

      return (content, filename) => telemetryRewriter.information(content, filename, rewriter);
  }
}

export { getRewriteFunction };
