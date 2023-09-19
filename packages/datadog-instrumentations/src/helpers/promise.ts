'use strict';

import { AsyncResource } from 'node:async_hooks';

exports.wrapThen = function wrapThen(origThen: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function then(onFulfilled: () => void, onRejected: () => void, onProgress: () => void) {
    const ar = new AsyncResource('bound-anonymous-fn');

    arguments[0] = wrapCallback(ar, onFulfilled);
    arguments[1] = wrapCallback(ar, onRejected);

    // not standard but sometimes supported
    if (onProgress) {
      arguments[2] = wrapCallback(ar, onProgress);
    }

    return origThen.apply(this, arguments);
  };
};

function wrapCallback(
  ar: { metadata?: any; path?: any; type?: any; runInAsyncScope?: any },
  callback: { apply: (arg0: any, arg1: IArguments) => any },
) {
  if (typeof callback !== 'function') return callback;

  return function () {
    return ar.runInAsyncScope(() => {
      return callback.apply(this, arguments);
    });
  };
}
