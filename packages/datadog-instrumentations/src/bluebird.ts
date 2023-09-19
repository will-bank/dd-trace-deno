'use strict';

const { addHook } = await import('./helpers/instrument.ts');
const { wrapThen } = require('./helpers/promise');
import shimmer from '../../datadog-shimmer/index.ts';

function createGetNewLibraryCopyWrap(originalLib) {
  return function wrapGetNewLibraryCopy(getNewLibraryCopy: { apply: (arg0: any, arg1: IArguments) => any }) {
    return function getNewLibraryCopyWithTrace() {
      const libraryCopy = getNewLibraryCopy.apply(this, arguments);
      shimmer.wrap(libraryCopy.prototype, '_then', wrapThen);
      shimmer.wrap(libraryCopy, 'getNewLibraryCopy', createGetNewLibraryCopyWrap(originalLib));
      return libraryCopy;
    };
  };
}

addHook({ name: 'bluebird', versions: ['>=2.0.2'] }, (Promise: { prototype: any }) => {
  shimmer.wrap(Promise.prototype, '_then', wrapThen);
  return Promise;
});

addHook({ name: 'bluebird', versions: ['^2.11.0', '^3.4.1'] }, (Promise) => {
  shimmer.wrap(Promise, 'getNewLibraryCopy', createGetNewLibraryCopyWrap(Promise));
  return Promise;
});
