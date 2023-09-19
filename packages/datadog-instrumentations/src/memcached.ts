'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({ name: 'memcached', versions: ['>=2.2'] }, (Memcached: { prototype: any }) => {
  const startCh = dc.channel('apm:memcached:command:start');
  const finishCh = dc.channel('apm:memcached:command:finish');
  const errorCh = dc.channel('apm:memcached:command:error');


  shimmer.wrap(
    Memcached.prototype,
    'command',
    (command: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (queryCompiler: { apply: (arg0: any, arg1: IArguments) => any }, server) {
        if (!startCh.hasSubscribers) {
          return command.apply(this, arguments);
        }

        const callbackResource = new AsyncResource('bound-anonymous-fn');
        const asyncResource = new AsyncResource('bound-anonymous-fn');

        const client = this;

        const wrappedQueryCompiler = asyncResource.bind(function () {
          const query = queryCompiler.apply(this, arguments);
          const callback = callbackResource.bind(query.callback);


          query.callback = asyncResource.bind(function (err) {
            if (err) {
              errorCh.publish(err);
            }
            finishCh.publish();

            return callback.apply(this, arguments);
          });
          startCh.publish({ client, server, query });

          return query;
        });

        return asyncResource.runInAsyncScope(() => {

          arguments[0] = wrappedQueryCompiler;


          const result = command.apply(this, arguments);

          return result;
        });
      },
  );

  return Memcached;
});
