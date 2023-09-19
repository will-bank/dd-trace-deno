'use strict';

import shimmer from '../../datadog-shimmer/index.ts';
const { addHook, channel } = await import('./helpers/instrument.ts');

const enterChannel = dc.channel('apm:koa:middleware:enter');
const exitChannel = dc.channel('apm:koa:middleware:exit');
const errorChannel = dc.channel('apm:koa:middleware:error');
const nextChannel = dc.channel('apm:koa:middleware:next');
const finishChannel = dc.channel('apm:koa:middleware:finish');
const handleChannel = dc.channel('apm:koa:request:handle');
const routeChannel = dc.channel('apm:koa:request:route');

const originals = new WeakMap();

function wrapCallback(callback: { metadata?: any; path?: any; type?: any; apply?: any }) {
  return function callbackWithTrace() {
    const handleRequest = callback.apply(this, arguments);

    if (typeof handleRequest !== 'function') return handleRequest;


    return function handleRequestWithTrace(req, res) {
      handleChannel.publish({ req, res });

      return handleRequest.apply(this, arguments);
    };
  };
}

function wrapUse(use: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function useWithTrace() {
    const result = use.apply(this, arguments);

    if (!Array.isArray(this.middleware)) return result;

    const fn = this.middleware.pop();

    this.middleware.push(wrapMiddleware(fn));

    return result;
  };
}

function wrapRegister(register: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function registerWithTrace(path, methods, middleware, opts) {
    const route = register.apply(this, arguments);

    if (!Array.isArray(path) && route && Array.isArray(route.stack)) {
      wrapStack(route);
    }

    return route;
  };
}

function wrapRouterUse(use: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function useWithTrace() {
    const router = use.apply(this, arguments);

    router.stack.forEach(wrapStack);

    return router;
  };
}

function wrapStack(layer: { stack: any[] }) {
  layer.stack = layer.stack.map((middleware) => {
    if (typeof middleware !== 'function') return middleware;

    const original = originals.get(middleware);

    middleware = original || middleware;


    const handler = shimmer.wrap(middleware, wrapMiddleware(middleware, layer));

    originals.set(handler, middleware);

    return handler;
  });
}

function wrapMiddleware(fn: IArguments | any[], layer: { path: any }) {
  if (typeof fn !== 'function') return fn;


  const name = fn.name;


  return function (ctx: { req: any }, next) {

    if (!ctx || !enterChannel.hasSubscribers) return fn.apply(this, arguments);

    const req = ctx.req;

    const path = layer && layer.path;

    const route = typeof path === 'string' && !path.endsWith('(.*)') && !path.endsWith('([^/]*)') && path;

    enterChannel.publish({ req, name, route });

    if (typeof next === 'function') {
      arguments[1] = wrapNext(req, next);
    }

    try {

      const result = fn.apply(this, arguments);

      if (result && typeof result.then === 'function') {
        return result.then(

          (result) => {

            fulfill(ctx);
            return result;
          },
          (err: undefined) => {
            fulfill(ctx, err);
            throw err;
          },
        );
      } else {

        fulfill(ctx);
        return result;
      }
    } catch (e) {
      fulfill(ctx, e);
      throw e;
    } finally {
      exitChannel.publish({ req });
    }
  };
}

function fulfill(ctx: { req: any; routePath: any } | { req: any }, error: undefined) {
  const req = ctx.req;

  const route = ctx.routePath;

  if (error) {
    errorChannel.publish({ req, error });
  }

  // TODO: make sure that the parent class cannot override this in `enter`
  if (route) {
    routeChannel.publish({ req, route });
  }

  finishChannel.publish({ req });
}

function wrapNext(req: { route: { path: any } }, next: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    nextChannel.publish({ req });

    return next.apply(this, arguments);
  };
}

addHook({ name: 'koa', versions: ['>=2'] }, (Koa: { prototype: any }) => {
  shimmer.wrap(Koa.prototype, 'callback', wrapCallback);
  shimmer.wrap(Koa.prototype, 'use', wrapUse);

  return Koa;
});

addHook({ name: '@koa/router', versions: ['>=8'] }, (Router: { prototype: any }) => {
  shimmer.wrap(Router.prototype, 'register', wrapRegister);
  shimmer.wrap(Router.prototype, 'use', wrapRouterUse);

  return Router;
});

addHook({ name: 'koa-router', versions: ['>=7'] }, (Router: { prototype: any }) => {
  shimmer.wrap(Router.prototype, 'register', wrapRegister);
  shimmer.wrap(Router.prototype, 'use', wrapRouterUse);

  return Router;
});
