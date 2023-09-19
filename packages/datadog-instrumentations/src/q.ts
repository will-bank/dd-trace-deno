'use strict';

const { addHook } = await import('./helpers/instrument.ts');
const { wrapThen } = require('./helpers/promise');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({
  name: 'q',
  versions: ['1'],
}, (Q: { makePromise: { prototype: any } }) => {
  shimmer.wrap(Q.makePromise.prototype, 'then', wrapThen);
  return Q;
});

addHook({
  name: 'q',
  versions: ['>=2'],
}, (Q: { Promise: { prototype: any } }) => {
  shimmer.wrap(Q.Promise.prototype, 'then', wrapThen);
  return Q;
});
