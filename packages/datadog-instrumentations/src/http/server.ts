'use strict';

const { AbortController } = require('node-abort-controller'); // AbortController is not available in node <15
const {
  channel,
  addHook,
} = await import('../helpers/instrument.ts');
const shimmer = require('../../../datadog-shimmer');

const startServerCh = dc.channel('apm:http:server:request:start');
const exitServerCh = dc.channel('apm:http:server:request:exit');
const errorServerCh = dc.channel('apm:http:server:request:error');
const finishServerCh = dc.channel('apm:http:server:request:finish');
const finishSetHeaderCh = dc.channel('datadog:http:server:response:set-header:finish');

const requestFinishedSet = new WeakSet();

addHook({ name: 'https' }, (http: { Server: { prototype: any } }) => {
  // http.ServerResponse not present on https
  shimmer.wrap(http.Server.prototype, 'emit', wrapEmit);
  return http;
});

addHook({ name: 'http' }, (http: { ServerResponse: { prototype: any }; Server: { prototype: any } }) => {
  shimmer.wrap(http.ServerResponse.prototype, 'emit', wrapResponseEmit);
  shimmer.wrap(http.Server.prototype, 'emit', wrapEmit);
  return http;
});

function wrapResponseEmit(emit: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function (eventName, event) {
    if (!startServerCh.hasSubscribers) {
      return emit.apply(this, arguments);
    }

    if (['finish', 'close'].includes(eventName) && !requestFinishedSet.has(this)) {
      finishServerCh.publish({ req: this.req });
      requestFinishedSet.add(this);
    }

    return emit.apply(this, arguments);
  };
}
function wrapEmit(emit: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function (eventName: string, req, res: { req: any }) {
    if (!startServerCh.hasSubscribers) {
      return emit.apply(this, arguments);
    }

    if (eventName === 'request') {
      res.req = req;

      const abortController = new AbortController();

      startServerCh.publish({ req, res, abortController });

      try {
        if (abortController.signal.aborted) {
          // TODO: should this always return true ?
          return this.listenerCount(eventName) > 0;
        }
        if (finishSetHeaderCh.hasSubscribers) {
          wrapSetHeader(res);
        }
        return emit.apply(this, arguments);
      } catch (err) {
        errorServerCh.publish(err);

        throw err;
      } finally {
        exitServerCh.publish({ req });
      }
    }
    return emit.apply(this, arguments);
  };
}

function wrapSetHeader(res: { req: any }) {
  shimmer.wrap(res, 'setHeader', (setHeader: { apply: (arg0: any, arg1: IArguments) => any }) => {
    return function (name, value) {
      const setHeaderResult = setHeader.apply(this, arguments);
      finishSetHeaderCh.publish({ name, value, res });
      return setHeaderResult;
    };
  });
}
