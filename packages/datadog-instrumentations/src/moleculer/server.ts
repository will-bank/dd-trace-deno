'use strict';

const { channel, addHook, AsyncResource } = await import('../helpers/instrument.ts');
const shimmer = require('../../../datadog-shimmer');

const startChannel = dc.channel('apm:moleculer:action:start');
const finishChannel = dc.channel('apm:moleculer:action:finish');
const errorChannel = dc.channel('apm:moleculer:action:error');

function wrapRegisterMiddlewares(registerMiddlewares: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (userMiddlewares) {
    if (this.middlewares && this.middlewares.add) {
      this.middlewares.add(createMiddleware());
    }

    return registerMiddlewares.apply(this, arguments);
  };
}

function createMiddleware() {
  return {
    name: 'Datadog',


    localAction(next: (arg0: any) => Promise<any>, action) {
      const broker = this;


      return function datadogMiddleware(ctx) {
        const actionResource = new AsyncResource('bound-anonymous-fn');

        return actionResource.runInAsyncScope(() => {
          startChannel.publish({ action, ctx, broker });

          try {
            return next(ctx).then(
              (result) => {
                finishChannel.publish();
                return result;
              },
              (error) => {
                errorChannel.publish(error);
                finishChannel.publish();
                throw error;
              },
            );
          } catch (e) {
            errorChannel.publish(e);
            finishChannel.publish();
          }
        });
      };
    },
  };
}

addHook({ name: 'moleculer', versions: ['>=0.14'] }, (moleculer: { ServiceBroker: { prototype: any } }) => {
  shimmer.wrap(moleculer.ServiceBroker.prototype, 'registerMiddlewares', wrapRegisterMiddlewares);

  return moleculer;
});
