'use strict';

import methods from 'node:methods';
const METHODS = methods.concat('all');
const pathToRegExp = require('path-to-regexp');
import shimmer from '../../datadog-shimmer/index.ts';
const { addHook, channel } = await import('./helpers/instrument.ts');

function createWrapRouterMethod(name: string) {
  const enterChannel = dc.channel(`apm:${name}:middleware:enter`);
  const exitChannel = dc.channel(`apm:${name}:middleware:exit`);
  const finishChannel = dc.channel(`apm:${name}:middleware:finish`);
  const errorChannel = dc.channel(`apm:${name}:middleware:error`);
  const nextChannel = dc.channel(`apm:${name}:middleware:next`);

  const layerMatchers = new WeakMap();
  const regexpCache = Object.create(null);

  function wrapLayerHandle(
    layer: { name: any },
    original: { _name: any; apply: (arg0: any, arg1: IArguments) => any; name: any },
  ) {
    original._name = original._name || layer.name;

    const handle = shimmer.wrap(original, function () {
      if (!enterChannel.hasSubscribers) return original.apply(this, arguments);

      const matchers = layerMatchers.get(layer);
      const lastIndex = arguments.length - 1;
      const name = original._name || original.name;
      const req = arguments[arguments.length > 3 ? 1 : 0];
      const next = arguments[lastIndex];

      if (typeof next === 'function') {
        arguments[lastIndex] = wrapNext(req, next);
      }

      let route;

      if (matchers) {
        // Try to guess which path actually matched
        for (let i = 0; i < matchers.length; i++) {
          if (matchers[i].test(layer)) {
            route = matchers[i].path;

            break;
          }
        }
      }

      enterChannel.publish({ name, req, route });

      try {
        return original.apply(this, arguments);
      } catch (error) {
        errorChannel.publish({ req, error });
        nextChannel.publish({ req });
        finishChannel.publish({ req });

        throw error;
      } finally {
        exitChannel.publish({ req });
      }
    });

    // This is a workaround for the `loopback` library so that it can find the correct express layer
    // that contains the real handle function
    handle._datadog_orig = original;

    return handle;
  }

  function wrapStack(stack, offset: number, matchers) {
    [].concat(stack).slice(offset).forEach((layer) => {
      if (layer.__handle) { // express-async-errors
        layer.__handle = wrapLayerHandle(layer, layer.__handle);
      } else {
        layer.handle = wrapLayerHandle(layer, layer.handle);
      }

      layerMatchers.set(layer, matchers);

      if (layer.route) {
        METHODS.forEach((method: string | number) => {
          if (typeof layer.route.stack === 'function') {
            layer.route.stack = [{ handle: layer.route.stack }];
          }

          layer.route[method] = wrapMethod(layer.route[method]);
        });
      }
    });
  }

  function wrapNext(req, next: { apply: (arg0: any, arg1: IArguments) => void }) {
    return function (error: string) {
      if (error && error !== 'route' && error !== 'router') {
        errorChannel.publish({ req, error });
      }

      nextChannel.publish({ req });
      finishChannel.publish({ req });

      next.apply(this, arguments);
    };
  }

  function extractMatchers(fn) {
    const arg = flatten([].concat(fn));

    if (typeof arg[0] === 'function') {
      return [];
    }

    return arg.map((pattern: string | number) => ({
      path: pattern instanceof RegExp ? `(${pattern})` : pattern,
      test: (layer: { path: any }) => {
        const matchers = layerMatchers.get(layer);

        return !isFastStar(layer, matchers) &&
          !isFastSlash(layer, matchers) &&
          cachedPathToRegExp(pattern).test(layer.path);
      },
    }));
  }

  function isFastStar(layer: { regexp: { fast_star: any } }, matchers: any[]) {
    if (layer.regexp.fast_star !== undefined) {
      return layer.regexp.fast_star;
    }

    return matchers.some((matcher: { path: string }) => matcher.path === '*');
  }

  function isFastSlash(layer: { regexp: { fast_slash: any } }, matchers: any[]) {
    if (layer.regexp.fast_slash !== undefined) {
      return layer.regexp.fast_slash;
    }

    return matchers.some((matcher: { path: string }) => matcher.path === '/');
  }

  function flatten(arr: any[]) {
    return arr.reduce(
      (acc: string | any[], val) => Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val),
      [],
    );
  }

  function cachedPathToRegExp(pattern: string | number) {
    const maybeCached = regexpCache[pattern];
    if (maybeCached) {
      return maybeCached;
    }
    const regexp = pathToRegExp(pattern);
    regexpCache[pattern] = regexp;
    return regexp;
  }

  function wrapMethod(original: { apply: (arg0: any, arg1: IArguments) => any }) {
    return function methodWithTrace(fn) {
      const offset = this.stack ? [].concat(this.stack).length : 0;
      const router = original.apply(this, arguments);

      if (typeof this.stack === 'function') {
        this.stack = [{ handle: this.stack }];
      }

      wrapStack(this.stack, offset, extractMatchers(fn));

      return router;
    };
  }

  return wrapMethod;
}

const wrapRouterMethod = createWrapRouterMethod('router');

addHook({ name: 'router', versions: ['>=1'] }, (Router: { prototype: any }) => {
  shimmer.wrap(Router.prototype, 'use', wrapRouterMethod);
  shimmer.wrap(Router.prototype, 'route', wrapRouterMethod);

  return Router;
});

module.exports = { createWrapRouterMethod };
