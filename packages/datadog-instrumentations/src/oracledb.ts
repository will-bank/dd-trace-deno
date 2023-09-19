'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const connectionAttributes = new WeakMap();
const poolAttributes = new WeakMap();

const startChannel = dc.channel('apm:oracledb:query:start');
const errorChannel = dc.channel('apm:oracledb:query:error');
const finishChannel = dc.channel('apm:oracledb:query:finish');

function finish(err: { req: any; res: any } | { metadata: any; path: any; type: any }) {
  if (err) {
    errorChannel.publish(err);
  }
  finishChannel.publish(undefined);
}

addHook(
  { name: 'oracledb', versions: ['5'] },
  (oracledb: { Connection: { prototype: any }; Pool: { prototype: any } }) => {
    shimmer.wrap(
      oracledb.Connection.prototype,
      'execute',
      (execute: { apply: (arg0: any, arg1: IArguments) => any }) => {

        return function wrappedExecute(dbQuery, ...args: any[]) {
          if (!startChannel.hasSubscribers) {
            return execute.apply(this, arguments);
          }

          if (arguments.length && typeof arguments[arguments.length - 1] === 'function') {
            const cb = arguments[arguments.length - 1];
            const outerAr = new AsyncResource('apm:oracledb:outer-scope');

            arguments[arguments.length - 1] = function wrappedCb(
              err: { req: any; res: any } | { metadata: any; path: any; type: any },
              result,
            ) {
              finish(err);

              return outerAr.runInAsyncScope(() => cb.apply(this, arguments));
            };
          }

          return new AsyncResource('apm:oracledb:inner-scope').runInAsyncScope(() => {
            const connAttrs = connectionAttributes.get(this);
            startChannel.publish({ query: dbQuery, connAttrs });
            try {

              let result = execute.apply(this, arguments);

              if (result && typeof result.then === 'function') {
                result = result.then(

                  (x) => {

                    finish();
                    return x;
                  },
                  (e: { req: any; res: any } | { metadata: any; path: any; type: any }) => {
                    finish(e);
                    throw e;
                  },
                );
              }

              return result;
            } catch (err) {
              errorChannel.publish(err);
              throw err;
            }
          });
        };
      },
    );
    shimmer.wrap(
      oracledb,
      'getConnection',
      (getConnection: { apply: (arg0: any, arg1: IArguments) => Promise<any> }) => {

        return function wrappedGetConnection(connAttrs, callback: (arg0: any, arg1: any) => void) {
          if (callback) {

            arguments[1] = (err, connection) => {
              if (connection) {
                connectionAttributes.set(connection, connAttrs);
              }
              callback(err, connection);
            };

            getConnection.apply(this, arguments);
          } else {
            return getConnection.apply(this, arguments).then((connection) => {
              connectionAttributes.set(connection, connAttrs);
              return connection;
            });
          }
        };
      },
    );
    shimmer.wrap(oracledb, 'createPool', (createPool: { apply: (arg0: any, arg1: IArguments) => Promise<any> }) => {

      return function wrappedCreatePool(poolAttrs, callback: (arg0: any, arg1: any) => void) {
        if (callback) {

          arguments[1] = (err, pool) => {
            if (pool) {
              poolAttributes.set(pool, poolAttrs);
            }
            callback(err, pool);
          };

          createPool.apply(this, arguments);
        } else {
          return createPool.apply(this, arguments).then((pool) => {
            poolAttributes.set(pool, poolAttrs);
            return pool;
          });
        }
      };
    });
    shimmer.wrap(
      oracledb.Pool.prototype,
      'getConnection',
      (getConnection: { apply: (arg0: any, arg1: IArguments) => Promise<any> }) => {
        return function wrappedGetConnection() {

          let callback;
          if (typeof arguments[arguments.length - 1] === 'function') {
            callback = arguments[arguments.length - 1];
          }
          if (callback) {

            arguments[arguments.length - 1] = (err, connection) => {
              if (connection) {
                connectionAttributes.set(connection, poolAttributes.get(this));
              }

              callback(err, connection);
            };
            getConnection.apply(this, arguments);
          } else {
            return getConnection.apply(this, arguments).then((connection) => {
              connectionAttributes.set(connection, poolAttributes.get(this));
              return connection;
            });
          }
        };
      },
    );
    return oracledb;
  },
);
