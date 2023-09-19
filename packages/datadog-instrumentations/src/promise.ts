'use strict';

const { addHook } = await import('./helpers/instrument.ts');
const { wrapThen } = require('./helpers/promise');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({
  name: 'promise',
  file: 'lib/core.js',
  versions: ['>=7'],
}, (Promise: { prototype: any }) => {
  shimmer.wrap(Promise.prototype, 'then', wrapThen);
  return Promise;
});
