'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const startCh = dc.channel('apm:cassandra-driver:query:start');
const finishCh = dc.channel('apm:cassandra-driver:query:finish');
const errorCh = dc.channel('apm:cassandra-driver:query:error');
const connectCh = dc.channel(`apm:cassandra-driver:query:connect`);

addHook({ name: 'cassandra-driver', versions: ['>=3.0.0'] }, (cassandra: { Client: { prototype: any } }) => {

  shimmer.wrap(
    cassandra.Client.prototype,
    'batch',
    (batch: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (queries, options, callback) {
        if (!startCh.hasSubscribers) {
          return batch.apply(this, arguments);
        }
        const callbackResource = new AsyncResource('bound-anonymous-fn');
        const asyncResource = new AsyncResource('bound-anonymous-fn');
        const lastIndex = arguments.length - 1;
        let cb = arguments[lastIndex];

        if (typeof cb === 'function') {
          cb = callbackResource.bind(cb);
          arguments[lastIndex] = wrapCallback(finishCh, errorCh, asyncResource, cb);
        }

        return asyncResource.runInAsyncScope(() => {
          const contactPoints = this.options && this.options.contactPoints;
          startCh.publish({ keyspace: this.keyspace, query: queries, contactPoints });
          try {

            const res = batch.apply(this, arguments);
            if (typeof res === 'function' || !res) {
              return wrapCallback(finishCh, errorCh, asyncResource, res);
            } else {
              const promiseAsyncResource = new AsyncResource('bound-anonymous-fn');
              return res.then(

                promiseAsyncResource.bind(() => finish(finishCh, errorCh)),
                promiseAsyncResource.bind((err: undefined) => finish(finishCh, errorCh, err)),
              );
            }
          } catch (e) {
            finish(finishCh, errorCh, e);
            throw e;
          }
        });
      },
  );
  return cassandra;
});

addHook({ name: 'cassandra-driver', versions: ['>=4.4'] }, (cassandra: { Client: { prototype: any } }) => {

  shimmer.wrap(
    cassandra.Client.prototype,
    '_execute',
    (_execute: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (query, params, execOptions, callback) {
        if (!startCh.hasSubscribers) {
          return _execute.apply(this, arguments);
        }
        const asyncResource = new AsyncResource('bound-anonymous-fn');
        return asyncResource.runInAsyncScope(() => {
          const contactPoints = this.options && this.options.contactPoints;
          startCh.publish({ keyspace: this.keyspace, query, contactPoints });

          const promise = _execute.apply(this, arguments);

          const promiseAsyncResource = new AsyncResource('bound-anonymous-fn');

          promise.then(

            promiseAsyncResource.bind(() => finish(finishCh, errorCh)),
            promiseAsyncResource.bind((err: undefined) => finish(finishCh, errorCh, err)),
          );
          return promise;
        });
      },
  );
  return cassandra;
});

addHook({ name: 'cassandra-driver', versions: ['3 - 4.3'] }, (cassandra: { Client: { prototype: any } }) => {
  shimmer.wrap(
    cassandra.Client.prototype,
    '_innerExecute',
    (_innerExecute: { apply: (arg0: any, arg1: IArguments) => any }) =>

      function (query, params, execOptions, callback) {
        if (!startCh.hasSubscribers) {
          return _innerExecute.apply(this, arguments);
        }
        const callbackResource = new AsyncResource('bound-anonymous-fn');
        const asyncResource = new AsyncResource('bound-anonymous-fn');
        const isValid = (args: string | IArguments | any[]) => {
          return args.length === 4 || typeof args[3] === 'function';
        };

        if (!isValid(arguments)) {
          return _innerExecute.apply(this, arguments);
        }

        return asyncResource.runInAsyncScope(() => {
          const contactPoints = this.options && this.options.contactPoints;
          startCh.publish({ keyspace: this.keyspace, query, contactPoints });


          const lastIndex = arguments.length - 1;

          let cb = arguments[lastIndex];

          if (typeof cb === 'function') {
            cb = callbackResource.bind(cb);

            arguments[lastIndex] = wrapCallback(finishCh, errorCh, asyncResource, cb);
          }

          try {

            return _innerExecute.apply(this, arguments);
          } catch (e) {
            finish(finishCh, errorCh, e);
            throw e;
          }
        });
      },
  );
  return cassandra;
});

addHook(
  { name: 'cassandra-driver', versions: ['>=3.3'], file: 'lib/request-execution.js' },
  (RequestExecution: { prototype: any }) => {
    shimmer.wrap(
      RequestExecution.prototype,
      '_sendOnConnection',
      (_sendOnConnection: { apply: (arg0: any, arg1: IArguments) => any }) =>
        function () {
          if (!startCh.hasSubscribers) {
            return _sendOnConnection.apply(this, arguments);
          }
          connectCh.publish({ hostname: this._connection.address, port: this._connection.port });
          return _sendOnConnection.apply(this, arguments);
        },
    );
    return RequestExecution;
  },
);

addHook(
  { name: 'cassandra-driver', versions: ['3.3 - 4.3'], file: 'lib/request-execution.js' },
  (RequestExecution: { prototype: any }) => {
    shimmer.wrap(
      RequestExecution.prototype,
      'start',
      (start: { apply: (arg0: any, arg1: IArguments) => any }) =>
        function (getHostCallback: { apply: (arg0: any, arg1: IArguments) => any }) {
          if (!startCh.hasSubscribers) {
            return getHostCallback.apply(this, arguments);
          }
          const asyncResource = new AsyncResource('bound-anonymous-fn');
          const execution = this;

          if (!isRequestValid(this, arguments, 1)) {
            return start.apply(this, arguments);
          }

          getHostCallback = asyncResource.bind(getHostCallback);

          arguments[0] = AsyncResource.bind(function () {
            connectCh.publish({ hostname: execution._connection.address, port: execution._connection.port });
            return getHostCallback.apply(this, arguments);
          });

          return start.apply(this, arguments);
        },
    );
    return RequestExecution;
  },
);

addHook(
  { name: 'cassandra-driver', versions: ['3 - 3.2'], file: 'lib/request-handler.js' },
  (RequestHandler: { prototype: any }) => {

    shimmer.wrap(
      RequestHandler.prototype,
      'send',
      (send: { apply: (arg0: any, arg1: IArguments) => any }) =>
        function (request, options, callback: { apply: (arg0: any, arg1: IArguments) => any }) {
          if (!startCh.hasSubscribers) {
            return send.apply(this, arguments);
          }
          const handler = this;

          if (!isRequestValid(this, arguments, 3)) {
            return send.apply(this, arguments);
          }
          const asyncResource = new AsyncResource('bound-anonymous-fn');

          callback = asyncResource.bind(callback);

          arguments[2] = AsyncResource.bind(function () {
            connectCh.publish({ hostname: handler.connection.address, port: handler.connection.port });
            return callback.apply(this, arguments);
          });

          return send.apply(this, arguments);
        },
    );
    return RequestHandler;
  },
);

function finish(
  finishCh: { req?: any; res?: any; publish?: any } | { metadata: any; path: any; type: any },
  errorCh: { publish: (arg0: any) => void } | ({ metadata: any; once: (arg0: string, arg1: () => void) => void }),
  error: undefined,
) {
  if (error) {

    errorCh.publish(error);
  }

  finishCh.publish(undefined);
}

function wrapCallback(
  finishCh: { metadata: any; path: any; type: any },
  errorCh: undefined,
  asyncResource: { name?: any; metadata?: any; type?: any; bind?: any },
  callback: { (): void; apply?: any },
) {
  return asyncResource.bind(function (err: undefined) {
    finish(finishCh, errorCh, err);
    if (callback) {
      return callback.apply(this, arguments);
    }
  });
}

function isRequestValid(exec, args: string | IArguments | any[], length: number) {
  if (!exec) return false;
  if (args.length !== length || typeof args[length - 1] !== 'function') return false;

  return true;
}
