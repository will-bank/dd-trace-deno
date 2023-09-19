'use strict';

const { addHook } = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';
const tracer = require('../../dd-trace');

if (Deno.env.get('DD_TRACE_OTEL_ENABLED')) {
  addHook({
    name: '@opentelemetry/sdk-trace-node',
    file: 'build/src/NodeTracerProvider.js',
    versions: ['*'],

  }, (mod) => {
    shimmer.wrap(mod, 'NodeTracerProvider', () => {
      return tracer.TracerProvider;
    });
    return mod;
  });
}
