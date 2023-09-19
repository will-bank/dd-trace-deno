'use strict';

const { channel, addHook, AsyncResource } = await import('./helpers/instrument.ts');

import shimmer from '../../datadog-shimmer/index.ts';

const startCh = dc.channel('apm:mariadb:query:start');
const finishCh = dc.channel('apm:mariadb:query:finish');
const errorCh = dc.channel('apm:mariadb:query:error');
const skipCh = dc.channel('apm:mariadb:pool:skip');
const unskipCh = dc.channel('apm:mariadb:pool:unskip');

function wrapCommandStart(
  start: { (): any; apply?: any },
  callbackResource: { bind: (arg0: any) => any; runInAsyncScope: (arg0: () => any) => any },
) {
  return function () {
    if (!startCh.hasSubscribers) return start.apply(this, arguments);

    const resolve = callbackResource.bind(this.resolve);
    const reject = callbackResource.bind(this.reject);

    const asyncResource = callbackResource.runInAsyncScope(() => new AsyncResource('bound-anonymous-fn'));

    shimmer.wrap(this, 'resolve', function wrapResolve() {
      return function () {
        asyncResource.runInAsyncScope(() => {
          finishCh.publish();
        });

        return resolve.apply(this, arguments);
      };
    });

    shimmer.wrap(this, 'reject', function wrapReject() {

      return function (error) {
        asyncResource.runInAsyncScope(() => {
          errorCh.publish(error);
          finishCh.publish();
        });

        return reject.apply(this, arguments);
      };
    });

    return asyncResource.runInAsyncScope(() => {
      startCh.publish({ sql: this.sql, conf: this.opts });

      return start.apply(this, arguments);
    });
  };
}

function wrapCommand(
  Command: {
    apply:
      | ((arg0: any, arg1: IArguments) => any)
      | ((arg0: any, arg1: IArguments) => any)
      | ((arg0: any, arg1: IArguments) => any);
  },
) {

  return class extends Command {
    start: () => any;

    constructor(...args) {
      super(...args);

      const callbackResource = new AsyncResource('bound-anonymous-fn');

      if (this.start) {
        this.start = wrapCommandStart(this.start, callbackResource);
      }
    }
  };
}

function createWrapQuery(options) {
  return function wrapQuery(query: { apply: (arg0: any, arg1: IArguments) => Promise<any> }) {

    return function (sql) {
      if (!startCh.hasSubscribers) return query.apply(this, arguments);

      const asyncResource = new AsyncResource('bound-anonymous-fn');

      return asyncResource.runInAsyncScope(() => {
        startCh.publish({ sql, conf: options });


        return query.apply(this, arguments)
          .then((result) => {
            finishCh.publish();
            return result;
          }, (error) => {
            errorCh.publish(error);
            finishCh.publish();
            throw error;
          });
      }, 'bound-anonymous-fn');
    };
  };
}

function createWrapQueryCallback(options) {
  return function wrapQuery(query: { apply: (arg0: any, arg1: IArguments) => any }) {

    return function (sql) {
      if (!startCh.hasSubscribers) return query.apply(this, arguments);

      const cb = arguments[arguments.length - 1];
      const asyncResource = new AsyncResource('bound-anonymous-fn');
      const callbackResource = new AsyncResource('bound-anonymous-fn');

      if (typeof cb !== 'function') {
        arguments.length = arguments.length + 1;
      }


      arguments[arguments.length - 1] = asyncResource.bind(function (err) {
        if (err) {
          errorCh.publish(err);
        }

        finishCh.publish();

        if (typeof cb === 'function') {

          return callbackResource.runInAsyncScope(() => cb.apply(this, arguments));
        }
      });

      return asyncResource.runInAsyncScope(() => {
        startCh.publish({ sql, conf: options });


        return query.apply(this, arguments);
      }, 'bound-anonymous-fn');
    };
  };
}

function wrapConnection(Connection: { apply: (arg0: any, arg1: IArguments) => void }, promiseMethod: string) {

  return function (options) {
    Connection.apply(this, arguments);

    shimmer.wrap(this, promiseMethod, createWrapQuery(options));
    shimmer.wrap(this, '_queryCallback', createWrapQueryCallback(options));
  };
}

function wrapPoolBase(PoolBase: { apply: (arg0: any, arg1: IArguments) => void }) {

  return function (options: { connOptions: any }, processTask, createConnectionPool, pingPromise) {
    arguments[1] = wrapPoolMethod(processTask);
    arguments[2] = wrapPoolMethod(createConnectionPool);

    PoolBase.apply(this, arguments);

    shimmer.wrap(this, 'query', createWrapQuery(options.connOptions));
  };
}

// It's not possible to prevent connection pools from leaking across queries,
// so instead we just skip instrumentation completely to avoid memory leaks
// and/or orphan spans.
function wrapPoolMethod(createConnection: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    skipCh.publish();
    try {
      return createConnection.apply(this, arguments);
    } finally {
      unskipCh.publish();
    }
  };
}

const name = 'mariadb';

addHook(
  { name, file: 'lib/cmd/query.js', versions: ['>=3'] },
  (
    Query: {
      apply:
        | ((arg0: any, arg1: IArguments) => any)
        | ((arg0: any, arg1: IArguments) => any)
        | ((arg0: any, arg1: IArguments) => any);
    },
  ) => {
    return wrapCommand(Query);
  },
);

addHook(
  { name, file: 'lib/cmd/execute.js', versions: ['>=3'] },
  (
    Execute: {
      apply:
        | ((arg0: any, arg1: IArguments) => any)
        | ((arg0: any, arg1: IArguments) => any)
        | ((arg0: any, arg1: IArguments) => any);
    },
  ) => {
    return wrapCommand(Execute);
  },
);

addHook({ name, file: 'lib/pool.js', versions: ['>=3'] }, (Pool: { prototype: any }) => {
  shimmer.wrap(Pool.prototype, '_createConnection', wrapPoolMethod);

  return Pool;
});

addHook(
  { name, file: 'lib/connection.js', versions: ['>=2.5.2 <3'] },
  (Connection: { apply: (arg0: any, arg1: IArguments) => void }) => {
    return shimmer.wrap(Connection, wrapConnection(Connection, '_queryPromise'));
  },
);

addHook(
  { name, file: 'lib/connection.js', versions: ['>=2.0.4 <=2.5.1'] },
  (Connection: { apply: (arg0: any, arg1: IArguments) => void }) => {
    return shimmer.wrap(Connection, wrapConnection(Connection, 'query'));
  },
);

addHook(
  { name, file: 'lib/pool-base.js', versions: ['>=2.0.4 <3'] },
  (PoolBase: { apply: (arg0: any, arg1: IArguments) => void }) => {
    return shimmer.wrap(PoolBase, wrapPoolBase(PoolBase));
  },
);
