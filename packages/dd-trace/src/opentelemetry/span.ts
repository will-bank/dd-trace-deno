import api from 'https://esm.sh/@opentelemetry/api@1.4.1';

import { performance } from 'node:perf_hooks';
const { timeOrigin } = performance;

import { timeInputToHrTime } from 'https://esm.sh/@opentelemetry/core@1.15.2';

import tracer from '../proxy.ts';
import DatadogSpan from '../opentracing/span.ts';
import { ERROR_MESSAGE, ERROR_STACK, ERROR_TYPE } from '../constants.ts';
import { RESOURCE_NAME, SERVICE_NAME } from 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/ext/tags.js';

import SpanContext from './span_context.ts';

// The one built into OTel rounds so we lose sub-millisecond precision.
function hrTimeToMilliseconds(time: number[]) {
  return time[0] * 1e3 + time[1] / 1e6;
}

export default class Span {
  private _ddSpan: DatadogSpan;
  private _parentTracer: any;
  private _context: any;
  private _hasStatus: boolean;
  startTime: any;
  kind: any;
  links: any[];
  constructor(
    parentTracer,
    context,
    spanName,
    spanContext: { _ddContext: any },
    kind,
    links = [],
    timeInput,
  ) {
    const { _tracer } = tracer;

    const hrStartTime = timeInputToHrTime(timeInput || (performance.now() + timeOrigin));
    const startTime = hrTimeToMilliseconds(hrStartTime);

    this._ddSpan = new DatadogSpan(_tracer, _tracer._processor, _tracer._prioritySampler, {
      operationName: spanName,
      context: spanContext._ddContext,
      startTime,
      hostname: _tracer._hostname,
      integrationName: 'otel',
      tags: {
        [SERVICE_NAME]: _tracer._service,
        [RESOURCE_NAME]: spanName,
      },
    }, _tracer._debug);

    this._parentTracer = parentTracer;
    this._context = context;

    this._hasStatus = false;

    // NOTE: Need to grab the value before setting it on the span because the
    // math for computing opentracing timestamps is apparently lossy...
    this.startTime = hrStartTime;
    this.kind = kind;
    this.links = links;
    this._spanProcessor.onStart(this, context);
  }

  get parentSpanId() {
    const { _parentId } = this._ddSpan.context();
    return _parentId && _parentId.toString(16);
  }

  // Expected by OTel
  get resource() {
    return this._parentTracer.resource;
  }
  get instrumentationLibrary() {
    return this._parentTracer.instrumentationLibrary;
  }
  get _spanProcessor() {
    return this._parentTracer.getActiveSpanProcessor();
  }

  get name() {
    return this._ddSpan.context()._name;
  }

  spanContext() {
    return new SpanContext(this._ddSpan.context());
  }

  setAttribute(key, value) {
    this._ddSpan.setTag(key, value);
    return this;
  }

  setAttributes(attributes: { [x: number]: any }) {
    this._ddSpan.addTags(attributes);
    return this;
  }

  addEvent(name, attributesOrStartTime, startTime) {
    api.diag.warn('Events not supported');
    return this;
  }

  setStatus({ code, message }) {
    if (!this.ended && !this._hasStatus && code) {
      this._hasStatus = true;
      if (code === 2) {
        this._ddSpan.addTags({
          [ERROR_MESSAGE]: message,
        });
      }
    }
    return this;
  }

  updateName(name) {
    if (!this.ended) {
      this._ddSpan.setOperationName(name);
    }
    return this;
  }

  end(timeInput) {
    if (this.ended) {
      api.diag.error('You can only call end() on a span once.');
      return;
    }

    const hrEndTime = timeInputToHrTime(timeInput || (performance.now() + timeOrigin));
    const endTime = hrTimeToMilliseconds(hrEndTime);

    this._ddSpan.finish(endTime);
    this._spanProcessor.onEnd(this);
  }

  isRecording() {
    return this.ended === false;
  }

  recordException(exception: { name: any; message: any; stack: any }) {
    this._ddSpan.addTags({
      [ERROR_TYPE]: exception.name,
      [ERROR_MESSAGE]: exception.message,
      [ERROR_STACK]: exception.stack,
    });
  }

  get duration() {
    return this._ddSpan._duration;
  }

  get ended() {
    return typeof this.duration !== 'undefined';
  }
}
