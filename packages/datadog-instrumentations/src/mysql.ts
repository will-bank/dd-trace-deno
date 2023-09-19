'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({ name: 'mysql', file: 'lib/Connection.js', versions: ['>=2'] }, (Connection: { prototype: any }) => {
  const startCh = dc.channel('apm:mysql:query:start');
  const finishCh = dc.channel('apm:mysql:query:finish');
  const errorCh = dc.channel('apm:mysql:query:error');

  shimmer.wrap(Connection.prototype, 'query', (query: { apply: (arg0: any, arg1: IArguments) => any }) =>
    function () {
      if (!startCh.hasSubscribers) {
        return query.apply(this, arguments);
      }

      const sql = arguments[0].sql || arguments[0];
      const conf = this.config;
      const payload = { sql, conf };

      const callbackResource = new AsyncResource('bound-anonymous-fn');
      const asyncResource = new AsyncResource('bound-anonymous-fn');

      return asyncResource.runInAsyncScope(() => {
        startCh.publish(payload);


        if (arguments[0].sql) {

          arguments[0].sql = payload.sql;
        } else {

          arguments[0] = payload.sql;
        }
        try {

          const res = query.apply(this, arguments);

          if (res._callback) {
            const cb = callbackResource.bind(res._callback);

            res._callback = asyncResource.bind(function (error, result) {
              if (error) {
                errorCh.publish(error);
              }
              finishCh.publish(result);

              return cb.apply(this, arguments);
            });
          } else {
            const cb = asyncResource.bind(function () {
              finishCh.publish(undefined);
            });
            res.on('end', cb);
          }

          return res;
        } catch (err) {
          err.stack; // trigger getting the stack at the original throwing point
          errorCh.publish(err);

          throw err;
        }
      });
    });

  return Connection;
});

addHook({ name: 'mysql', file: 'lib/Pool.js', versions: ['>=2'] }, (Pool: { prototype: any }) => {
  const startPoolQueryCh = dc.channel('datadog:mysql:pool:query:start');
  const finishPoolQueryCh = dc.channel('datadog:mysql:pool:query:finish');


  shimmer.wrap(
    Pool.prototype,
    'getConnection',
    (getConnection: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (cb) {
        arguments[0] = AsyncResource.bind(cb);
        return getConnection.apply(this, arguments);
      },
  );

  shimmer.wrap(Pool.prototype, 'query', (query: { apply: (arg0: any, arg1: IArguments) => any }) =>
    function () {
      if (!startPoolQueryCh.hasSubscribers) {
        return query.apply(this, arguments);
      }

      const asyncResource = new AsyncResource('bound-anonymous-fn');

      const sql = arguments[0].sql || arguments[0];

      return asyncResource.runInAsyncScope(() => {
        startPoolQueryCh.publish({ sql });

        const finish = asyncResource.bind(function () {
          finishPoolQueryCh.publish();
        });


        const cb = arguments[arguments.length - 1];
        if (typeof cb === 'function') {

          arguments[arguments.length - 1] = shimmer.wrap(cb, function () {
            finish();
            return cb.apply(this, arguments);
          });
        }


        const retval = query.apply(this, arguments);

        if (retval && retval.then) {
          retval.then(finish).catch(finish);
        }

        return retval;
      });
    });

  return Pool;
});
