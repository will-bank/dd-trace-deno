import DatadogSpanContext from '../opentracing/span_context.ts';
import * as priority from 'npm:dd-trace@4.13.1/ext/priority.js';

class NoopSpanContext extends DatadogSpanContext {
  constructor(
    props: {
      noop: any;
      traceId: any;
      spanId: any;
      parentId?: any;
      baggageItems?: any;
      sampling?: any;
      traceparent?: any;
      tracestate?: any;
      name?: any;
      isFinished?: any;
      tags?: any;
      trace?: any;
    },
  ) {
    super(props);

    this._sampling.priority = priority.USER_REJECT;
  }
}

export default NoopSpanContext;
