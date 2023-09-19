'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

addHook(
  { name: '@elastic/transport', file: 'lib/Transport.js', versions: ['>=8'] },
  (exports: { default: { prototype: any } }) => {
    shimmer.wrap(exports.default.prototype, 'request', createWrapRequest('elasticsearch'));
    shimmer.wrap(exports.default.prototype, 'getConnection', createWrapGetConnection('elasticsearch'));
    return exports;
  },
);

addHook(
  { name: '@elastic/elasticsearch', file: 'lib/Transport.js', versions: ['>=5.6.16 <8', '>=8'] },
  (Transport: { prototype: any }) => {
    shimmer.wrap(Transport.prototype, 'request', createWrapRequest('elasticsearch'));
    shimmer.wrap(Transport.prototype, 'getConnection', createWrapGetConnection('elasticsearch'));
    return Transport;
  },
);

addHook(
  { name: 'elasticsearch', file: 'src/lib/transport.js', versions: ['>=10'] },
  (Transport: { prototype: any }) => {
    shimmer.wrap(Transport.prototype, 'request', createWrapRequest('elasticsearch'));
    return Transport;
  },
);

addHook(
  { name: 'elasticsearch', file: 'src/lib/connection_pool.js', versions: ['>=10'] },
  (ConnectionPool: { prototype: any }) => {

    shimmer.wrap(ConnectionPool.prototype, 'select', createWrapSelect('elasticsearch'));
    return ConnectionPool;
  },
);

function createWrapGetConnection(name) {
  const connectCh = dc.channel(`apm:${name}:query:connect`);
  return function wrapRequest(request: { apply: (arg0: any, arg1: IArguments) => any }) {
    return function () {
      const connection = request.apply(this, arguments);
      if (connectCh.hasSubscribers && connection && connection.url) {
        connectCh.publish(connection.url);
      }
      return connection;
    };
  };
}

function createWrapSelect() {
  const connectCh = dc.channel('apm:elasticsearch:query:connect');
  return function wrapRequest(request: { apply: (arg0: any, arg1: IArguments) => any }) {
    return function () {
      if (arguments.length === 1) {
        const cb = arguments[0];

        arguments[0] = function (err, connection: { host: { host: any; port: any } }) {
          if (connectCh.hasSubscribers && connection && connection.host) {
            connectCh.publish({ hostname: connection.host.host, port: connection.host.port });
          }
          cb(err, connection);
        };
      }
      return request.apply(this, arguments);
    };
  };
}

function createWrapRequest(name) {
  const startCh = dc.channel(`apm:${name}:query:start`);
  const finishCh = dc.channel(`apm:${name}:query:finish`);
  const errorCh = dc.channel(`apm:${name}:query:error`);

  return function wrapRequest(request: { apply: (arg0: any, arg1: IArguments) => any }) {

    return function (params, options, cb: { apply: (arg0: any, arg1: IArguments) => any }) {
      if (!startCh.hasSubscribers) {
        return request.apply(this, arguments);
      }

      if (!params) return request.apply(this, arguments);

      const parentResource = new AsyncResource('bound-anonymous-fn');
      const asyncResource = new AsyncResource('bound-anonymous-fn');

      return asyncResource.runInAsyncScope(() => {
        startCh.publish({ params });

        try {

          const lastIndex = arguments.length - 1;

          cb = arguments[lastIndex];

          if (typeof cb === 'function') {
            cb = parentResource.bind(cb);


            arguments[lastIndex] = asyncResource.bind(function (error: undefined) {
              finish(params, error);
              return cb.apply(null, arguments);
            });

            return request.apply(this, arguments);
          } else {

            const promise = request.apply(this, arguments);
            if (promise && typeof promise.then === 'function') {

              const onResolve = asyncResource.bind(() => finish(params));
              const onReject = asyncResource.bind((e: undefined) => finish(params, e));

              promise.then(onResolve, onReject);
            } else {

              finish(params);
            }
            return promise;
          }
        } catch (err) {
          err.stack; // trigger getting the stack at the original throwing point
          errorCh.publish(err);

          throw err;
        }
      });
    };
  };


  function finish(params, error: undefined) {
    if (error) {
      errorCh.publish(error);
    }
    finishCh.publish({ params });
  }
}

module.exports = { createWrapRequest, createWrapGetConnection };
