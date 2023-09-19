'use strict';

import shimmer from '../../datadog-shimmer/index.ts';
const { addHook, channel } = await import('./helpers/instrument.ts');
const handlers = ['use', 'pre'];
const methods = ['del', 'get', 'head', 'opts', 'post', 'put', 'patch'];

const handleChannel = dc.channel('apm:restify:request:handle');
const errorChannel = dc.channel('apm:restify:middleware:error');
const enterChannel = dc.channel('apm:restify:middleware:enter');
const exitChannel = dc.channel('apm:restify:middleware:exit');
const finishChannel = dc.channel('apm:restify:middleware:finish');
const nextChannel = dc.channel('apm:restify:middleware:next');

function wrapSetupRequest(setupRequest: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function (req, res) {
    handleChannel.publish({ req, res });
    return setupRequest.apply(this, arguments);
  };
}

function wrapMethod(method: { apply: (arg0: any, arg1: any[]) => any }) {

  return function (path) {
    const middleware = wrapMiddleware(Array.prototype.slice.call(arguments, 1));

    return method.apply(this, [path].concat(middleware));
  };
}

function wrapHandler(method: { apply: (arg0: any, arg1: any) => any }) {
  return function () {
    return method.apply(this, wrapMiddleware(arguments));
  };
}

function wrapMiddleware(middleware: IArguments | any[]) {
  return Array.prototype.map.call(middleware, wrapFn);
}

function wrapFn(fn: { apply: (arg0: any, arg1: IArguments) => any }) {
  if (Array.isArray(fn)) return wrapMiddleware(fn);


  return function (req: { route: { path: any } }, res, next) {
    if (typeof next === 'function') {
      arguments[2] = wrapNext(req, next);
    }

    const route = req.route && req.route.path;

    enterChannel.publish({ req, route });

    try {
      return fn.apply(this, arguments);
    } catch (error) {
      errorChannel.publish({ req, error });
      nextChannel.publish({ req });
      finishChannel.publish({ req });
      throw error;
    } finally {
      exitChannel.publish({ req });
    }
  };
}

function wrapNext(req: { route: { path: any } }, next: { apply: (arg0: any, arg1: IArguments) => void }) {
  return function () {
    nextChannel.publish({ req });
    finishChannel.publish({ req });

    next.apply(this, arguments);
  };
}

addHook({ name: 'restify', versions: ['>=3'], file: 'lib/server.js' }, (Server: { prototype: any }) => {
  shimmer.wrap(Server.prototype, '_setupRequest', wrapSetupRequest);
  shimmer.massWrap(Server.prototype, handlers, wrapHandler);
  shimmer.massWrap(Server.prototype, methods, wrapMethod);

  return Server;
});
