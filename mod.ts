import ProxyTracer from './packages/dd-trace/src/proxy.ts';
import NoopProxyTracer from './packages/dd-trace/src/noop/proxy.ts';

const isTraceEnabled = Boolean(Deno.env.get('DD_TRACE_ENABLED'));

export default isTraceEnabled ? new ProxyTracer() : new NoopProxyTracer();
