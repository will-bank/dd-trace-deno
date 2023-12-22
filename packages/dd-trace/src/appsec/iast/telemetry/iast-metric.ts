import { getNamespaceFromContext, globalNamespace } from './namespaces.ts';

const Scope = {
  GLOBAL: 'GLOBAL',
  REQUEST: 'REQUEST',
};

const PropagationType = {
  STRING: 'STRING',
  JSON: 'JSON',
  URL: 'URL',
};

const TagKey = {
  VULNERABILITY_TYPE: 'vulnerability_type',
  SOURCE_TYPE: 'source_type',
  PROPAGATION_TYPE: 'propagation_type',
};

class IastMetric {
  name: any;
  scope: any;
  tagKey: any;

  constructor(name: string, scope, tagKey: undefined) {
    this.name = name;
    this.scope = scope;
    this.tagKey = tagKey;
  }

  getNamespace(context: { [x: string]: any }) {
    return getNamespaceFromContext(context) || globalNamespace;
  }

  getTag(tagValue) {
    return tagValue ? { [this.tagKey]: tagValue } : undefined;
  }

  addValue(value: number, tagValue, context: { [x: string]: any }) {
    this.getNamespace(context)
      .count(this.name, this.getTag(tagValue))
      .inc(value);
  }

  add(value: number, tagValue: any[], context: undefined) {
    if (Array.isArray(tagValue)) {
      tagValue.forEach((tag) => this.addValue(value, tag, context));
    } else {
      this.addValue(value, tagValue, context);
    }
  }

  inc(tagValue: any[], context: undefined) {
    this.add(1, tagValue, context);
  }
}

function getExecutedMetric(tagKey) {
  return tagKey === TagKey.VULNERABILITY_TYPE ? EXECUTED_SINK : EXECUTED_SOURCE;
}

function getInstrumentedMetric(tagKey) {
  return tagKey === TagKey.VULNERABILITY_TYPE ? INSTRUMENTED_SINK : INSTRUMENTED_SOURCE;
}

const INSTRUMENTED_PROPAGATION = new IastMetric('instrumented.propagation', Scope.GLOBAL);
const INSTRUMENTED_SOURCE = new IastMetric('instrumented.source', Scope.GLOBAL, TagKey.SOURCE_TYPE);
const INSTRUMENTED_SINK = new IastMetric('instrumented.sink', Scope.GLOBAL, TagKey.VULNERABILITY_TYPE);

const EXECUTED_SOURCE = new IastMetric('executed.source', Scope.REQUEST, TagKey.SOURCE_TYPE);
const EXECUTED_SINK = new IastMetric('executed.sink', Scope.REQUEST, TagKey.VULNERABILITY_TYPE);

const REQUEST_TAINTED = new IastMetric('request.tainted', Scope.REQUEST);

// DEBUG using metrics
const EXECUTED_PROPAGATION = new IastMetric('executed.propagation', Scope.REQUEST);
const EXECUTED_TAINTED = new IastMetric('executed.tainted', Scope.REQUEST);

// DEBUG using distribution endpoint
const INSTRUMENTATION_TIME = new IastMetric('instrumentation.time', Scope.GLOBAL);

export {
  EXECUTED_PROPAGATION,
  EXECUTED_SINK,
  EXECUTED_SOURCE,
  EXECUTED_TAINTED,
  getExecutedMetric,
  getInstrumentedMetric,
  IastMetric,
  INSTRUMENTATION_TIME,
  INSTRUMENTED_PROPAGATION,
  INSTRUMENTED_SINK,
  INSTRUMENTED_SOURCE,
  PropagationType,
  REQUEST_TAINTED,
  TagKey,
};
