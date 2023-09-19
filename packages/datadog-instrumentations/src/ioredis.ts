'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const startCh = dc.channel('apm:ioredis:command:start');
const finishCh = dc.channel('apm:ioredis:command:finish');
const errorCh = dc.channel('apm:ioredis:command:error');

addHook({ name: 'ioredis', versions: ['>=2'] }, (Redis: { prototype: any }) => {

  shimmer.wrap(
    Redis.prototype,
    'sendCommand',
    (sendCommand: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (command: { promise: Promise<any>; name: any; args: any }, stream) {
        if (!startCh.hasSubscribers) return sendCommand.apply(this, arguments);

        if (!command || !command.promise) return sendCommand.apply(this, arguments);

        const options = this.options || {};
        const connectionName = options.connectionName;
        const db = options.db;
        const connectionOptions = { host: options.host, port: options.port };

        const asyncResource = new AsyncResource('bound-anonymous-fn');
        return asyncResource.runInAsyncScope(() => {
          startCh.publish({ db, command: command.name, args: command.args, connectionOptions, connectionName });


          const onResolve = asyncResource.bind(() => finish(finishCh, errorCh));
          const onReject = asyncResource.bind((err: undefined) => finish(finishCh, errorCh, err));

          command.promise.then(onResolve, onReject);

          try {

            return sendCommand.apply(this, arguments);
          } catch (err) {
            errorCh.publish(err);

            throw err;
          }
        });
      },
  );
  return Redis;
});

function finish(
  finishCh: { req?: any; res?: any; publish?: any } | { metadata: any; path: any; type: any },
  errorCh: { publish: (arg0: any) => void } | ({ metadata: any; once: (arg0: string, arg1: () => void) => void }),
  error: undefined,
) {
  if (error) {

    errorCh.publish(error);
  }

  finishCh.publish();
}
