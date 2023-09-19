'use strict';

import shimmer from '../../datadog-shimmer/index.ts';
const { addHook, channel, AsyncResource } = await import('./helpers/instrument.ts');

const handleChannel = dc.channel('apm:hapi:request:handle');
const routeChannel = dc.channel('apm:hapi:request:route');
const errorChannel = dc.channel('apm:hapi:request:error');
const enterChannel = dc.channel('apm:hapi:extension:enter');

function wrapServer(server: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (options) {
    const app = server.apply(this, arguments);

    if (!app) return app;

    if (typeof app.ext === 'function') {
      app.ext = wrapExt(app.ext);
    }

    if (typeof app.start === 'function') {
      app.start = wrapStart(app.start);
    }

    return app;
  };
}

function wrapStart(start: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    if (this && typeof this.ext === 'function') {
      this.ext('onPreResponse', onPreResponse);
    }

    return start.apply(this, arguments);
  };
}

function wrapExt(ext: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (events, method, options) {
    if (typeof events === 'object') {
      arguments[0] = wrapEvents(events);
    } else {
      arguments[1] = wrapExtension(method);
    }

    return ext.apply(this, arguments);
  };
}

function wrapDispatch(dispatch: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (options) {
    const handler = dispatch.apply(this, arguments);

    if (typeof handler !== 'function') return handler;


    return function (req, res) {
      handleChannel.publish({ req, res });

      return handler.apply(this, arguments);
    };
  };
}

function wrapRebuild(rebuild: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (event) {
    const result = rebuild.apply(this, arguments);

    if (this && Array.isArray(this._cycle)) {
      this._cycle = this._cycle.map(wrapHandler);
    }

    return result;
  };
}

function wrapExtension(method) {
  return [].concat(method).map(wrapHandler);
}

function wrapEvents(events) {
  return [].concat(events).map((event) => {
    if (!event || !event.method) return event;


    return Object.assign({}, event, {
      method: wrapExtension(event.method),
    });
  });
}

function wrapHandler(handler: { apply: (arg0: any, arg1: IArguments) => any }) {
  if (typeof handler !== 'function') return handler;


  return function (request: { raw: { req: any } }, h) {
    const req = request && request.raw && request.raw.req;

    if (!req) return handler.apply(this, arguments);

    const asyncResource = new AsyncResource('bound-anonymous-fn');

    return asyncResource.runInAsyncScope(() => {
      enterChannel.publish({ req });


      return handler.apply(this, arguments);
    });
  };
}

function onPreResponse(request: { raw: { req: any }; response: any; route: { path: any } }, h) {
  if (!request || !request.raw) return reply(request, h);

  const req = request.raw.req;

  if (request.response instanceof Error) {
    errorChannel.publish(request.response);
  }

  if (request.route) {
    routeChannel.publish({ req, route: request.route.path });
  }

  return reply(request, h);
}

function reply(
  request: { raw: { req: any }; response: any; route: { path: any } },
  h: { (): any; (): any; continue: any },
) {
  if (h.continue) {
    return typeof h.continue === 'function' ? h.continue() : h.continue;
  } else if (typeof h === 'function') {
    return h();
  }
}

addHook({ name: '@hapi/hapi', versions: ['>=17.9'] }, (hapi) => {
  shimmer.massWrap(hapi, ['server', 'Server'], wrapServer);

  return hapi;
});

addHook({ name: '@hapi/hapi', versions: ['>=17.9'], file: 'lib/core.js' }, (Core: { prototype: any }) => {
  shimmer.wrap(Core.prototype, '_dispatch', wrapDispatch);

  return Core;
});

addHook({ name: '@hapi/hapi', versions: ['>=17.9'], file: 'lib/route.js' }, (Route: { prototype: any }) => {
  shimmer.wrap(Route.prototype, 'rebuild', wrapRebuild);

  return Route;
});

addHook({ name: 'hapi', versions: ['>=17'] }, (hapi) => {
  shimmer.massWrap(hapi, ['server', 'Server'], wrapServer);

  return hapi;
});

addHook({ name: 'hapi', versions: ['16'] }, (hapi: { Server: { prototype: any } }) => {
  shimmer.wrap(hapi.Server.prototype, 'start', wrapStart);
  shimmer.wrap(hapi.Server.prototype, 'ext', wrapExt);

  return hapi;
});

addHook({ name: 'hapi', versions: ['16'], file: 'lib/connection.js' }, (Connection: { prototype: any }) => {
  shimmer.wrap(Connection.prototype, '_dispatch', wrapDispatch);

  return Connection;
});

addHook({ name: 'hapi', versions: ['>=17'], file: 'lib/core.js' }, (Core: { prototype: any }) => {
  shimmer.wrap(Core.prototype, '_dispatch', wrapDispatch);

  return Core;
});

addHook({ name: 'hapi', versions: ['>=16'], file: 'lib/route.js' }, (Route: { prototype: any }) => {
  shimmer.wrap(Route.prototype, 'rebuild', wrapRebuild);

  return Route;
});
