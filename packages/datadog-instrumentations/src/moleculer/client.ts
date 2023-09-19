'use strict';

const { channel, addHook, AsyncResource } = await import('../helpers/instrument.ts');
const shimmer = require('../../../datadog-shimmer');

const startChannel = dc.channel('apm:moleculer:call:start');
const finishChannel = dc.channel('apm:moleculer:call:finish');
const errorChannel = dc.channel('apm:moleculer:call:error');

function wrapCall(call: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (actionName, params, opts: { meta?: any }) {
    const callResource = new AsyncResource('bound-anonymous-fn');

    opts = arguments[2] = opts || {};
    opts.meta = opts.meta || {};

    arguments.length = Math.max(3, arguments.length);

    return callResource.runInAsyncScope(() => {
      startChannel.publish({ actionName, params, opts });


      const promise = call.apply(this, arguments);
      const broker = this;
      const ctx = promise.ctx;

      return promise
        .then(

          (result) => {
            finishChannel.publish({ broker, ctx });
            return result;
          },

          (error) => {
            errorChannel.publish(error);
            finishChannel.publish({ broker, ctx });
            throw error;
          },
        );
    });
  };
}

addHook({ name: 'moleculer', versions: ['>=0.14'] }, (moleculer: { ServiceBroker: { prototype: any } }) => {
  shimmer.wrap(moleculer.ServiceBroker.prototype, 'call', wrapCall);

  return moleculer;
});
