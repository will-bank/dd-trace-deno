function getRootSpan(tracer: { scope: () => { (): any; new (): any; active: { (): any; new (): any } } }) {
  const span = tracer.scope().active();
  return span && span.context()._trace.started[0];
}

export { getRootSpan };
