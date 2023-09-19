'use strict';

const { addHook } = await import('./helpers/instrument.ts');
const { wrapThen } = require('./helpers/promise');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({
  name: 'promise-js',
  versions: ['>=0.0.3'],
}, (Promise: { prototype: any }) => {

  if (Promise !== global.Promise) {
    shimmer.wrap(Promise.prototype, 'then', wrapThen);
  }
  return Promise;
});
