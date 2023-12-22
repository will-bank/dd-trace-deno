import log from '../../../log/index.ts';
import { Namespace } from '../../../telemetry/metrics.ts';
import { addMetricsToSpan, filterTags } from './span-tags.ts';
import { IAST_TRACE_METRIC_PREFIX } from '../tags.ts';

const DD_IAST_METRICS_NAMESPACE = Symbol('_dd.iast.request.metrics.namespace');

function initRequestNamespace(context: { [x: string]: Namespace }) {
  if (!context) return;

  const namespace = new Namespace('iast');
  context[DD_IAST_METRICS_NAMESPACE] = namespace;
  return namespace;
}

function getNamespaceFromContext(context: { [x: string]: any }) {
  return context && context[DD_IAST_METRICS_NAMESPACE];
}

function finalizeRequestNamespace(context: { [x: string]: any }, rootSpan) {
  try {
    const namespace = getNamespaceFromContext(context);
    if (!namespace) return;

    const metrics = [...namespace.metrics.values()];
    namespace.metrics.clear();

    addMetricsToSpan(rootSpan, metrics, IAST_TRACE_METRIC_PREFIX);

    merge(metrics);
  } catch (e) {
    log.error(e);
  } finally {
    if (context) {
      delete context[DD_IAST_METRICS_NAMESPACE];
    }
  }
}

function merge(metrics: any[]) {
  metrics.forEach((metric: { points: any[]; metric: any; tags: any }) =>
    metric.points.forEach((point: any[]) => {
      globalNamespace
        .count(metric.metric, getTagsObject(metric.tags))
        .inc(point[1]);
    })
  );
}

function getTagsObject(tags: string | any[]) {
  if (tags && tags.length > 0) {
    return filterTags(tags);
  }
}

class IastNamespace extends Namespace {
  constructor() {
    super('iast');
  }

  reset() {
    this.metrics.clear();

    this.distributions.clear();
  }
}

const globalNamespace = new IastNamespace();

export {
  DD_IAST_METRICS_NAMESPACE,
  finalizeRequestNamespace,
  getNamespaceFromContext,
  globalNamespace,
  initRequestNamespace,
};
