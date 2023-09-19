'use strict';

const shimmer = require('../../../datadog-shimmer');
const { addHook, channel } = await import('../helpers/instrument.ts');

const connectChannel = dc.channel('apm:http2:client:connect:start');
const startChannel = dc.channel('apm:http2:client:request:start');
const endChannel = dc.channel('apm:http2:client:request:end');
const asyncStartChannel = dc.channel('apm:http2:client:request:asyncStart');
const asyncEndChannel = dc.channel('apm:http2:client:request:asyncEnd');
const errorChannel = dc.channel('apm:http2:client:request:error');

function createWrapEmit(
  ctx: {
    headers?: any;
    authority?: any;
    options?: any;
    metadata?: any;
    path?: any;
    type?: any;
    eventName?: any;
    eventData?: any;
  },
) {
  return function wrapEmit(emit: { apply: (arg0: any, arg1: IArguments) => any }) {

    return function (event, arg1) {
      ctx.eventName = event;
      ctx.eventData = arg1;

      return asyncStartChannel.runStores(ctx, () => {
        try {

          return emit.apply(this, arguments);
        } finally {
          asyncEndChannel.publish(ctx);
        }
      });
    };
  };
}

function createWrapRequest(authority, options) {
  return function wrapRequest(request: { apply: (arg0: any, arg1: IArguments) => any }) {

    return function (headers) {
      if (!startChannel.hasSubscribers) return request.apply(this, arguments);

      const ctx = { headers, authority, options };

      return startChannel.runStores(ctx, () => {
        try {

          const req = request.apply(this, arguments);

          shimmer.wrap(req, 'emit', createWrapEmit(ctx));

          return req;
        } catch (e) {

          ctx.error = e;
          errorChannel.publish(ctx);
          throw e;
        } finally {
          endChannel.publish(ctx);
        }
      });
    };
  };
}

function wrapConnect(connect: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (authority, options) {
    if (connectChannel.hasSubscribers) {
      connectChannel.publish({ authority });
    }
    const session = connect.apply(this, arguments);

    shimmer.wrap(session, 'request', createWrapRequest(authority, options));

    return session;
  };
}

addHook({ name: 'http2' }, (http2) => {
  shimmer.wrap(http2, 'connect', wrapConnect);

  return http2;
});
