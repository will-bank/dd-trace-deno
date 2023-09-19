'use strict';

const { addHook } = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';
const { createWrapRequest, createWrapGetConnection } = require('./elasticsearch');

addHook(
  { name: '@opensearch-project/opensearch', file: 'lib/Transport.js', versions: ['>=1'] },
  (Transport: { prototype: any }) => {
    shimmer.wrap(Transport.prototype, 'request', createWrapRequest('opensearch'));
    shimmer.wrap(Transport.prototype, 'getConnection', createWrapGetConnection('opensearch'));
    return Transport;
  },
);
