// TODO (new internal tracer): use DC events for lifecycle metrics and test them
import { performance } from 'node:perf_hooks';
const now = performance.now.bind(performance);
const dateNow = Date.now;
import SpanContext from './span_context.ts';
import id from '../id.ts';
import * as tagger from '../tagger.ts';
import * as runtimeMetrics from '../runtime_metrics.ts';
import log from '../log/index.ts';
import { storage } from '../../../datadog-core/index.ts';
import * as telemetryMetrics from '../telemetry/metrics.ts';

const tracerMetrics = telemetryMetrics.manager.namespace('tracers');

const {
  DD_TRACE_EXPERIMENTAL_STATE_TRACKING,
  DD_TRACE_EXPERIMENTAL_SPAN_COUNTS,
} = Deno.env.toObject();

const unfinishedRegistry = createRegistry('unfinished');
const finishedRegistry = createRegistry('finished');

const OTEL_ENABLED = !!Deno.env.get('DD_TRACE_OTEL_ENABLED');

const integrationCounters = {
  span_created: {},
  span_finished: {},
};

function getIntegrationCounter(event: string, integration: string) {
  const counters = integrationCounters[event];

  if (integration in counters) {
    return counters[integration];
  }

  const counter = tracerMetrics.count(event, [
    `integration_name:${integration.toLowerCase()}`,
    `otel_enabled:${OTEL_ENABLED}`,
  ]);

  integrationCounters[event][integration] = counter;

  return counter;
}

export default class DatadogSpan {
  private _parentTracer: any;
  private _debug: any;
  private _processor: any;
  private _prioritySampler: any;
  public _store: any;
  private _duration: any; // TODO (new internal tracer): use DC events for lifecycle metrics and test them

  private _name: any;
  private _integrationName: any;
  private _spanContext:
    // TODO (new internal tracer): use DC events for lifecycle metrics and test them
    any;
  private _startTime: any;

  constructor(
    tracer,
    processor,
    prioritySampler,
    fields: {
      operationName: any;
      context?: any;
      startTime: any;
      hostname: any;
      integrationName: any;
      tags: any;
      parent?: any;
    },
    debug,
  ) {
    const operationName = fields.operationName;
    const parent = fields.parent || null;

    const tags = Object.assign({}, fields.tags);
    const hostname = fields.hostname;

    this._parentTracer = tracer;
    this._debug = debug;
    this._processor = processor;
    this._prioritySampler = prioritySampler;
    this._store = storage.getStore();
    this._duration = undefined;

    // For internal use only. You probably want `context()._name`.
    // This name property is not updated when the span name changes.
    // This is necessary for span count metrics.
    this._name = operationName;
    this._integrationName = fields.integrationName || 'opentracing';

    getIntegrationCounter('span_created', this._integrationName).inc();

    this._spanContext = this._createContext(parent, fields);
    this._spanContext._name = operationName;
    this._spanContext._tags = tags;
    this._spanContext._hostname = hostname;

    this._spanContext._trace.started.push(this);

    this._startTime = fields.startTime || this._getTime();

    if (DD_TRACE_EXPERIMENTAL_SPAN_COUNTS && finishedRegistry) {
      runtimeMetrics.increment('runtime.deno.spans.unfinished');
      runtimeMetrics.increment('runtime.deno.spans.unfinished.by.name', `span_name:${operationName}`);

      runtimeMetrics.increment('runtime.deno.spans.open'); // unfinished for real
      runtimeMetrics.increment('runtime.deno.spans.open.by.name', `span_name:${operationName}`);

      unfinishedRegistry.register(this, operationName, this);
    }
  }

  toString() {
    const spanContext = this.context();
    const resourceName = spanContext._tags['resource.name'];
    const resource = resourceName.length > 100 ? `${resourceName.substring(0, 97)}...` : resourceName;
    const json = JSON.stringify({
      traceId: spanContext._traceId,
      spanId: spanContext._spanId,
      parentId: spanContext._parentId,
      service: spanContext._tags['service.name'],
      name: spanContext._name,
      resource,
    });

    return `Span${json}`;
  }

  context() {
    return this._spanContext;
  }

  tracer() {
    return this._parentTracer;
  }

  setOperationName(name) {
    this._spanContext._name = name;
    return this;
  }

  setBaggageItem(key: string | number, value) {
    this._spanContext._baggageItems[key] = value;
    return this;
  }

  getBaggageItem(key: string | number) {
    return this._spanContext._baggageItems[key];
  }

  setTag(key, value) {
    this._addTags({ [key]: value });
    return this;
  }

  addTags(keyValueMap: { [x: number]: any }) {
    this._addTags(keyValueMap);
    return this;
  }

  log() {
    return this;
  }

  logEvent() {}

  finish(finishTime?: string | number) {
    if (this._duration !== undefined) {
      return;
    }

    if (DD_TRACE_EXPERIMENTAL_STATE_TRACKING === 'true') {
      if (!this._spanContext._tags['service.name']) {
        log.error(`Finishing invalid span: ${this}`);
      }
    }

    getIntegrationCounter('span_finished', this._integrationName).inc();

    if (DD_TRACE_EXPERIMENTAL_SPAN_COUNTS && finishedRegistry) {
      runtimeMetrics.decrement('runtime.deno.spans.unfinished');
      runtimeMetrics.decrement('runtime.deno.spans.unfinished.by.name', `span_name:${this._name}`);
      runtimeMetrics.increment('runtime.deno.spans.finished');
      runtimeMetrics.increment('runtime.deno.spans.finished.by.name', `span_name:${this._name}`);

      runtimeMetrics.decrement('runtime.deno.spans.open'); // unfinished for real
      runtimeMetrics.decrement('runtime.deno.spans.open.by.name', `span_name:${this._name}`);

      unfinishedRegistry.unregister(this);
      finishedRegistry.register(this, this._name);
    }

    finishTime = parseFloat(finishTime) || this._getTime();

    this._duration = finishTime - this._startTime;
    this._spanContext._trace.finished.push(this);
    this._spanContext._isFinished = true;
    this._processor.process(this);
  }

  _createContext(
    parent: { _traceId: any; _spanId: any; _sampling: any; _baggageItems: any; _trace: any; _tracestate: any },
    fields: { context: any; traceId128BitGenerationEnabled: any },
  ) {
    let spanContext;
    let startTime;

    if (fields.context) {
      spanContext = fields.context;
      if (!spanContext._trace.startTime) {
        startTime = dateNow();
      }
    } else if (parent) {
      spanContext = new SpanContext({
        traceId: parent._traceId,
        spanId: id(),
        parentId: parent._spanId,
        sampling: parent._sampling,

        baggageItems: Object.assign({}, parent._baggageItems),
        trace: parent._trace,
        tracestate: parent._tracestate,
      });

      if (!spanContext._trace.startTime) {
        startTime = dateNow();
      }
    } else {
      const spanId = id();
      startTime = dateNow();
      spanContext = new SpanContext({
        traceId: spanId,
        spanId,
      });
      spanContext._trace.startTime = startTime;

      if (fields.traceId128BitGenerationEnabled) {
        spanContext._trace.tags['_dd.p.tid'] = Math.floor(startTime / 1000).toString(16)
          .padStart(8, '0')
          .padEnd(16, '0');
      }
    }

    spanContext._trace.ticks = spanContext._trace.ticks || now();
    if (startTime) {
      spanContext._trace.startTime = startTime;
    }

    return spanContext;
  }

  _getTime() {
    const { startTime, ticks } = this._spanContext._trace;

    return startTime + now() - ticks;
  }

  _addTags(keyValuePairs: { [x: number]: any }) {
    tagger.add(this._spanContext._tags, keyValuePairs);

    this._prioritySampler.sample(this, false);
  }
}

function createRegistry(type: string) {
  return new FinalizationRegistry((name) => {
    runtimeMetrics.decrement(`runtime.deno.spans.${type}`);
    runtimeMetrics.decrement(`runtime.deno.spans.${type}.by.name`, [`span_name:${name}`]);
  });
}
