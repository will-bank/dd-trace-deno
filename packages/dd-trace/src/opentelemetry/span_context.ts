import api from 'https://esm.sh/@opentelemetry/api@1.4.1';
import * as priority from 'https://esm.sh/dd-trace@4.13.1/ext/priority.js';
import DatadogSpanContext from '../opentracing/span_context.ts';
import id from '../id.ts';

function newContext() {
  const spanId = id();
  return new DatadogSpanContext({
    traceId: spanId,
    spanId,
  });
}

class SpanContext {
  private _ddContext: any;
  constructor(context: DatadogSpanContext) {
    if (!(context instanceof DatadogSpanContext)) {
      context = context ? new DatadogSpanContext(context) : newContext();
    }
    this._ddContext = context;
  }

  get traceId() {
    return this._ddContext._traceId.toString(16);
  }

  get spanId() {
    return this._ddContext._spanId.toString(16);
  }

  get traceFlags() {
    return this._ddContext._sampling.priority >= priority.AUTO_KEEP ? 1 : 0;
  }

  get traceState() {
    const ts = this._ddContext._tracestate;
    return api.createTraceState(ts ? ts.toString() : '');
  }
}

export default SpanContext;
