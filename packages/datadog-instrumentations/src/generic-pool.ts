'use strict';

const { addHook, AsyncResource } = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

function createWrapAcquire() {
  return function wrapAcquire(acquire: { apply: (arg0: any, arg1: IArguments) => any }) {

    return function acquireWithTrace(callback, priority) {
      if (typeof callback === 'function') {
        arguments[0] = AsyncResource.bind(callback);
      }

      return acquire.apply(this, arguments);
    };
  };
}

function createWrapPool() {
  return function wrapPool(Pool: { apply: (arg0: any, arg1: IArguments) => any }) {
    if (typeof Pool !== 'function') return Pool;


    return function PoolWithTrace(factory) {
      const pool = Pool.apply(this, arguments);

      if (pool && typeof pool.acquire === 'function') {
        shimmer.wrap(pool, 'acquire', createWrapAcquire());
      }

      return pool;
    };
  };
}

addHook({
  name: 'generic-pool',
  versions: ['^2.4'],
}, (genericPool: { Pool: { prototype: any } }) => {
  shimmer.wrap(genericPool.Pool.prototype, 'acquire', createWrapAcquire());
  return genericPool;
});

addHook({
  name: 'generic-pool',
  versions: ['2 - 2.3'],

}, (genericPool) => {
  shimmer.wrap(genericPool, 'Pool', createWrapPool());
  return genericPool;
});
