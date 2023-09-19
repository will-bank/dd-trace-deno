'use strict';

// Old instrumentation temporarily replaced with compatibility mode only instrumentation.
// See https://github.com/DataDog/dd-trace/issues/312

const {

  channel,

  addHook,

  AsyncResource,

} = await import('../helpers/instrument.ts');
const shimmer = require('../../../datadog-shimmer');

const startServerCh = dc.channel('apm:http2:server:request:start');
const errorServerCh = dc.channel('apm:http2:server:request:error');
const finishServerCh = dc.channel('apm:http2:server:request:finish');

addHook({ name: 'http2' }, (http2) => {
  shimmer.wrap(http2, 'createSecureServer', wrapCreateServer);
  shimmer.wrap(http2, 'createServer', wrapCreateServer);
  return http2;
});

function wrapCreateServer(createServer: { apply: (arg0: any, arg1: any[]) => any }) {

  return function (...args) {
    const server = createServer.apply(this, args);
    shimmer.wrap(server, 'emit', wrapEmit);
    return server;
  };
}

function wrapResponseEmit(emit: { apply: (arg0: any, arg1: IArguments) => any }) {
  const asyncResource = new AsyncResource('bound-anonymous-fn');

  return function (eventName: string, event) {
    return asyncResource.runInAsyncScope(() => {
      if (eventName === 'close' && finishServerCh.hasSubscribers) {
        finishServerCh.publish({ req: this.req });
      }


      return emit.apply(this, arguments);
    });
  };
}
function wrapEmit(emit: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (eventName: string, req, res: { req: any }) {
    if (!startServerCh.hasSubscribers) {
      return emit.apply(this, arguments);
    }

    if (eventName === 'request') {
      res.req = req;

      const asyncResource = new AsyncResource('bound-anonymous-fn');
      return asyncResource.runInAsyncScope(() => {
        startServerCh.publish({ req, res });

        shimmer.wrap(res, 'emit', wrapResponseEmit);

        try {

          return emit.apply(this, arguments);
        } catch (err) {
          errorServerCh.publish(err);

          throw err;
        }
      });
    }
    return emit.apply(this, arguments);
  };
}
