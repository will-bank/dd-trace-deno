'use strict';

const { addHook } = await import('./helpers/instrument.ts');
const { wrapThen } = require('./helpers/promise');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({
  name: 'when',
  file: 'lib/Promise.js',
  versions: ['>=3'],
}, (Promise: { prototype: any }) => {
  shimmer.wrap(Promise.prototype, 'then', wrapThen);
  return Promise;
});
