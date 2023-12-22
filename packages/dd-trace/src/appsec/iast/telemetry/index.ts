import telemetryMetrics from '../../../telemetry/metrics.ts';
import telemetryLogs from './log/index.ts';
import { getVerbosity, Verbosity } from './verbosity.ts';
import { finalizeRequestNamespace, globalNamespace, initRequestNamespace } from './namespaces.ts';

function isIastMetricsEnabled(metrics) {
  // TODO: let DD_TELEMETRY_METRICS_ENABLED as undefined in config.js to avoid read here the env property
  return Deno.env.get('DD_TELEMETRY_METRICS_ENABLED') !== undefined ? metrics : true;
}

class Telemetry {
  verbosity: any;
  enabled: boolean;
  configure(config: { telemetry: { enabled: any; metrics: any } }, verbosity: string) {
    const telemetryAndMetricsEnabled = config &&
      config.telemetry &&
      config.telemetry.enabled &&
      isIastMetricsEnabled(config.telemetry.metrics);

    this.verbosity = telemetryAndMetricsEnabled ? getVerbosity(verbosity) : Verbosity.OFF;
    this.enabled = this.verbosity !== Verbosity.OFF;

    if (this.enabled) {
      telemetryMetrics.manager.set('iast', globalNamespace);
    }

    telemetryLogs.start();
  }

  stop() {
    this.enabled = false;
    telemetryMetrics.manager.delete('iast');

    telemetryLogs.stop();
  }

  isEnabled() {
    return this.enabled;
  }

  onRequestStart(context: { [x: string]: Namespace }) {
    if (this.isEnabled()) {
      initRequestNamespace(context);
    }
  }

  onRequestEnd(context: { [x: string]: any }, rootSpan) {
    if (this.isEnabled()) {
      finalizeRequestNamespace(context, rootSpan);
    }
  }
}

export default new Telemetry();
