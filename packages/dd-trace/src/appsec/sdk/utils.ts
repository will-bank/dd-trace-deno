import { ITracer } from '../../interfaces.ts';

function getRootSpan(tracer: ITracer) {
  const span = tracer.scope().active();
  return span && span.context()._trace.started[0];
}

export { getRootSpan };
