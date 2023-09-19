import { isFalse } from './util.ts';

const getProxy = async () => {
  // Global `jest` is only present in Jest workers.
  const inJestWorker = typeof jest !== 'undefined';

  const isTracerEnabled = !isFalse(Deno.env.get('DD_TRACE_ENABLED')) && inJestWorker;

  const { default: proxy } = await import(isTracerEnabled ? './proxy.ts' : './noop/proxy.ts');
  return proxy;
};

export default getProxy();
