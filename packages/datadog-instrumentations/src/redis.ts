'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const startCh = dc.channel('apm:redis:command:start');
const finishCh = dc.channel('apm:redis:command:finish');
const errorCh = dc.channel('apm:redis:command:error');

let createClientUrl;

function wrapAddCommand(addCommand: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function (command: string | any[]) {
    if (!startCh.hasSubscribers) {
      return addCommand.apply(this, arguments);
    }

    const name = command[0];
    const args = command.slice(1);

    const asyncResource = new AsyncResource('bound-anonymous-fn');
    return asyncResource.runInAsyncScope(() => {
      start(this, name, args, this._url);


      const res = addCommand.apply(this, arguments);

      const onResolve = asyncResource.bind(() => finish(finishCh, errorCh));
      const onReject = asyncResource.bind((err: undefined) => finish(finishCh, errorCh, err));

      res.then(onResolve, onReject);

      return res;
    });
  };
}

function wrapCommandQueueClass(cls) {
  const ret = class RedisCommandQueue extends cls {
    private _url: { host: string; port: number };
    constructor() {
      super(arguments);

      if (createClientUrl) {
        try {

          const parsed = new URL(createClientUrl);
          if (parsed) {
            this._url = { host: parsed.hostname, port: +parsed.port || 6379 };
          }
        } catch (error) {
          // ignore
        }
      }
      this._url = this._url || { host: 'localhost', port: 6379 };
    }
  };
  return ret;
}

function wrapCreateClient(request: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function (opts: { url: any }) {
    createClientUrl = opts && opts.url;
    const ret = request.apply(this, arguments);
    createClientUrl = undefined;
    return ret;
  };
}

addHook({ name: '@node-redis/client', file: 'dist/lib/client/commands-queue.js', versions: ['>=1'] }, (redis) => {
  redis.default = wrapCommandQueueClass(redis.default);
  shimmer.wrap(redis.default.prototype, 'addCommand', wrapAddCommand);
  return redis;
});

addHook(
  { name: '@node-redis/client', file: 'dist/lib/client/index.js', versions: ['>=1'] },
  (redis: { default: any }) => {
    shimmer.wrap(redis.default, 'create', wrapCreateClient);
    return redis;
  },
);

addHook({ name: '@redis/client', file: 'dist/lib/client/index.js', versions: ['>=1.1'] }, (redis: { default: any }) => {
  shimmer.wrap(redis.default, 'create', wrapCreateClient);
  return redis;
});

addHook({ name: '@redis/client', file: 'dist/lib/client/commands-queue.js', versions: ['>=1.1'] }, (redis) => {
  redis.default = wrapCommandQueueClass(redis.default);
  shimmer.wrap(redis.default.prototype, 'addCommand', wrapAddCommand);
  return redis;
});

addHook({ name: 'redis', versions: ['>=2.6 <4'] }, (redis: { RedisClient: { prototype: any } }) => {
  shimmer.wrap(
    redis.RedisClient.prototype,
    'internal_send_command',
    (internalSendCommand: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (options: { callback: any; command: any; args: any }) {
        if (!startCh.hasSubscribers) return internalSendCommand.apply(this, arguments);

        if (!options.callback) return internalSendCommand.apply(this, arguments);

        const callbackResource = new AsyncResource('bound-anonymous-fn');
        const asyncResource = new AsyncResource('bound-anonymous-fn');
        const cb = callbackResource.bind(options.callback);

        return asyncResource.runInAsyncScope(() => {
          start(this, options.command, options.args);

          options.callback = asyncResource.bind(wrapCallback(finishCh, errorCh, cb));

          try {

            return internalSendCommand.apply(this, arguments);
          } catch (err) {
            errorCh.publish(err);

            throw err;
          }
        });
      },
  );
  return redis;
});

addHook({ name: 'redis', versions: ['>=0.12 <2.6'] }, (redis: { RedisClient: { prototype: any } }) => {

  shimmer.wrap(
    redis.RedisClient.prototype,
    'send_command',
    (sendCommand: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (command, args: string | any[], callback) {
        if (!startCh.hasSubscribers) {
          return sendCommand.apply(this, arguments);
        }

        const callbackResource = new AsyncResource('bound-anonymous-fn');
        const asyncResource = new AsyncResource('bound-anonymous-fn');

        return asyncResource.runInAsyncScope(() => {
          start(this, command, args);

          if (typeof callback === 'function') {
            const cb = callbackResource.bind(callback);

            arguments[2] = asyncResource.bind(wrapCallback(finishCh, errorCh, cb));
          } else if (Array.isArray(args) && typeof args[args.length - 1] === 'function') {
            const cb = callbackResource.bind(args[args.length - 1]);
            args[args.length - 1] = asyncResource.bind(wrapCallback(finishCh, errorCh, cb));
          } else {

            arguments[2] = asyncResource.bind(wrapCallback(finishCh, errorCh));
          }

          try {

            return sendCommand.apply(this, arguments);
          } catch (err) {
            errorCh.publish(err);

            throw err;
          }
        });
      },
  );
  return redis;
});

function start(
  client: { selected_db: any; connection_options: any; connection_option: any; connectionOption: any },
  command,
  args,
  url = {},
) {
  const db = client.selected_db;
  const connectionOptions = client.connection_options || client.connection_option || client.connectionOption || url;
  startCh.publish({ db, command, args, connectionOptions });
}

function wrapCallback(
  finishCh: { metadata: any; path: any; type: any },
  errorCh: { metadata: any; once: (arg0: string, arg1: () => void) => void },
  callback: { name?: any; metadata?: any; type?: any; apply?: any },
) {
  return function (err: undefined) {
    finish(finishCh, errorCh, err);
    if (callback) {
      return callback.apply(this, arguments);
    }
  };
}

function finish(
  finishCh: {
    req?: { originalRequest: any };
    res?: { originalResponse: any };
    metadata?: any;
    path?: any;
    type?: any;
    publish?: any;
  },
  errorCh: { publish: (arg0: any) => void } | ({ metadata: any; once: (arg0: string, arg1: () => void) => void }),
  error: undefined,
) {
  if (error) {

    errorCh.publish(error);
  }
  finishCh.publish();
}
