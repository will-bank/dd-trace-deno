'use strict';

const { addHook } = await import('./helpers/instrument.ts');
const { wrapThen } = require('./helpers/promise');
const { AsyncResource } = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

function wrapAddQueue(addQueue: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function addQueueWithTrace(name: string | number) {
    if (typeof name === 'function') {
      arguments[0] = AsyncResource.bind(name);
    } else if (typeof this[name] === 'function') {

      arguments[0] = AsyncResource.bind((...args) => this[name](...args));
    }

    return addQueue.apply(this, arguments);
  };
}

addHook({
  name: 'mongoose',
  versions: ['>=4.6.4 <5', '5', '6', '>=7'],
}, (mongoose: { Promise: { prototype: any }; Collection: { prototype: any } }) => {

  if (mongoose.Promise !== global.Promise) {
    shimmer.wrap(mongoose.Promise.prototype, 'then', wrapThen);
  }

  shimmer.wrap(mongoose.Collection.prototype, 'addQueue', wrapAddQueue);
  return mongoose;
});
