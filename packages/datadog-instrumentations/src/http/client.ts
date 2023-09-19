'use strict';

/* eslint-disable no-fallthrough */

import url from 'node:url';
const { channel, addHook } = await import('../helpers/instrument.ts');
import * as shimmer from '../../../datadog-shimmer/index.ts';

import log from '../../../dd-trace/src/log/index.ts';

const startChannel = dc.channel('apm:http:client:request:start');
const finishChannel = dc.channel('apm:http:client:request:finish');
const endChannel = dc.channel('apm:http:client:request:end');
const asyncStartChannel = dc.channel('apm:http:client:request:asyncStart');
const errorChannel = dc.channel('apm:http:client:request:error');

addHook({ name: 'https' }, hookFn);

addHook({ name: 'http' }, hookFn);

function hookFn(http: string) {
  patch(http, 'request');
  patch(http, 'get');

  return http;
}

function patch(http: string, methodName: string) {
  shimmer.wrap(http, methodName, instrumentRequest);

  function instrumentRequest(
    request: { apply: (arg0: any, arg1: IArguments) => any; call: (arg0: any, arg1: any, arg2: any) => any },
  ) {
    return function () {
      if (!startChannel.hasSubscribers) {
        return request.apply(this, arguments);
      }

      let args;

      try {
        args = normalizeArgs.apply(null, arguments);
      } catch (e) {
        log.error(e);
        return request.apply(this, arguments);
      }

      const ctx = { args, http };

      return startChannel.runStores(ctx, () => {
        let finished = false;
        let callback = args.callback;

        if (callback) {
          callback = function () {
            return asyncStartChannel.runStores(ctx, () => {
              return args.callback.apply(this, arguments);
            });
          };
        }

        const options = args.options;
        const finish = () => {
          if (!finished) {
            finished = true;
            finishChannel.publish(ctx);
          }
        };

        try {
          const req = request.call(this, options, callback);
          const emit = req.emit;

          ctx.req = req;

          req.emit = function (eventName, arg) {
            switch (eventName) {
              case 'response': {
                const res = arg;
                ctx.res = res;
                res.on('end', finish);
                res.on('error', finish);
                break;
              }
              case 'connect':
              case 'upgrade':
                ctx.res = arg;
                finish();
                break;
              case 'error':
              case 'timeout':
                ctx.error = arg;
                errorChannel.publish(ctx);
              case 'abort': // deprecated and replaced by `close` in node 17
              case 'close':
                finish();
            }

            return emit.apply(this, arguments);
          };

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
  }

  function normalizeArgs(
    inputURL: {
      agent: any;
      protocol: any;
      hostname: { startsWith: (arg0: string) => any; slice: (arg0: number, arg1: number) => any };
      host: any;
      hash: any;
      search: any;
      pathname: any;
      href: any;
      port: string;
      username: any;
      password: any;
    },
    inputOptions,
    cb,
  ) {
    const originalUrl = inputURL;
    inputURL = normalizeOptions(inputURL);

    const [callback, inputOptionsNormalized] = normalizeCallback(inputOptions, cb, inputURL);
    const options = combineOptions(inputURL, inputOptionsNormalized);
    normalizeHeaders(options);
    const uri = url.format(options);

    return { uri, options, callback, originalUrl };
  }

  function combineOptions(
    inputURL: {
      agent: any;
      protocol: any;
      hostname: { startsWith: (arg0: string) => any; slice: (arg0: number, arg1: number) => any };
      host: any;
      hash: any;
      search: any;
      pathname: any;
      href: any;
      port: string;
      username: any;
      password: any;
    },
    inputOptions,
  ) {
    if (typeof inputOptions === 'object') {
      return Object.assign(inputURL || {}, inputOptions);
    } else {
      return inputURL;
    }
  }
  function normalizeHeaders(options: { headers: {} }) {
    options.headers = options.headers || {};
  }

  function normalizeCallback(
    inputOptions,
    callback,
    inputURL: {
      agent: any;
      protocol: any;
      hostname: { startsWith: (arg0: string) => any; slice: (arg0: number, arg1: number) => any };
      host: any;
      hash: any;
      search: any;
      pathname: any;
      href: any;
      port: string;
      username: any;
      password: any;
    },
  ) {
    if (typeof inputOptions === 'function') {
      return [inputOptions, inputURL || {}];
    } else {
      return [callback, inputOptions];
    }
  }

  function normalizeOptions(
    inputURL: {
      agent: any;
      protocol: any;
      hostname: { startsWith: (arg0: string) => any; slice: (arg0: number, arg1: number) => any };
      host: any;
      hash: any;
      search: any;
      pathname: any;
      href: any;
      port: string;
      username: any;
      password: any;
    },
  ) {
    if (typeof inputURL === 'string') {
      try {
        return urlToOptions(new url.URL(inputURL));
      } catch (e) {
        return url.parse(inputURL);
      }
    } else if (inputURL instanceof url.URL) {
      return urlToOptions(inputURL);
    } else {
      return inputURL;
    }
  }

  function urlToOptions(
    url: {
      agent: any;
      protocol: any;
      hostname: { startsWith: (arg0: string) => any; slice: (arg0: number, arg1: number) => any };
      host: any;
      hash: any;
      search: any;
      pathname: any;
      href: any;
      port: string;
      username: any;
      password: any;
    },
  ) {
    const agent = url.agent || http.globalAgent;
    const options = {
      protocol: url.protocol || agent.protocol,
      hostname: typeof url.hostname === 'string' && url.hostname.startsWith('[')
        ? url.hostname.slice(1, -1)
        : url.hostname ||
          url.host ||
          'localhost',
      hash: url.hash,
      search: url.search,
      pathname: url.pathname,
      path: `${url.pathname || ''}${url.search || ''}`,
      href: url.href,
    };
    if (url.port !== '') {
      options.port = Number(url.port);
    }
    if (url.username || url.password) {
      options.auth = `${url.username}:${url.password}`;
    }
    return options;
  }
}
