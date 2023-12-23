// 'use strict';

// // TODO: default to AsyncLocalStorage when it supports triggerAsyncResource

// const semver = require('semver');

// // https://github.com/nodejs/node/pull/33801
// const hasJavaScriptAsyncHooks = semver.satisfies(process.versions.node, '>=14.5');

// if (hasJavaScriptAsyncHooks) {
//   module.exports = require('./async_resource');
// } else {
//   module.exports = require('./async_hooks');
// }

// export { default } from './async_hooks.ts';

import { AsyncLocalStorage } from 'node:async_hooks';

export default typeof AsyncLocalStorage.prototype.enterWith === 'function'
  ? AsyncLocalStorage
  : (await import('./async_local_storage.ts')).default;
