'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
// @deno-types="npm:@types/lodash@4.14.197/kebabcase.d.ts"
import kebabCase from 'npm:lodash@4.17.21/kebabcase.js';
import shimmer from '../../datadog-shimmer/index.ts';

const startCh = dc.channel('apm:amqplib:command:start');
const finishCh = dc.channel('apm:amqplib:command:finish');
const errorCh = dc.channel('apm:amqplib:command:error');

let methods = {};

addHook({ name: 'amqplib', file: 'lib/defs.js', versions: ['>=0.5'] }, (defs: object) => {

  methods = Object.keys(defs)

    .filter((key) => Number.isInteger(defs[key]))
    .filter((key) => isCamelCase(key))

    .reduce((acc, key) => Object.assign(acc, { [defs[key]]: kebabCase(key).replace('-', '.') }), {});
  return defs;
});

addHook(
  { name: 'amqplib', file: 'lib/channel.js', versions: ['>=0.5'] },
  (channel: { Channel: { prototype: any }; BaseChannel: { prototype: any } }) => {

    shimmer.wrap(
      channel.Channel.prototype,
      'sendImmediately',
      (sendImmediately: string | { apply: (arg0: any, arg1: any) => any } | { originalRequest: any }) =>
        function (method: string | number, fields) {

          return instrument(sendImmediately, this, arguments, methods[method], fields);
        },
    );

    shimmer.wrap(
      channel.Channel.prototype,
      'sendMessage',
      (sendMessage: string | { apply: (arg0: any, arg1: any) => any } | { originalRequest: any }) =>
        function (fields: { s: any }) {

          return instrument(sendMessage, this, arguments, 'basic.publish', fields);
        },
    );

    shimmer.wrap(
      channel.BaseChannel.prototype,
      'dispatchMessage',
      (dispatchMessage: { apply: (arg0: any, arg1: any) => any }) =>
        function (
          fields: { s: { options: { host: any; port: any } | { host?: undefined; port?: undefined } } },
          message: undefined,
        ) {
          return instrument(dispatchMessage, this, arguments, 'basic.deliver', fields, message);
        },
    );
    return channel;
  },
);

function instrument(
  send: { apply: (arg0: any, arg1: any) => any },
  channel,
  args: IArguments,
  method: string | IArguments,
  fields: { s: { options: { host: any; port: any } | { host?: undefined; port?: undefined } } },
  message: undefined,
) {
  if (!startCh.hasSubscribers) {
    return send.apply(channel, args);
  }

  const asyncResource = new AsyncResource('bound-anonymous-fn');
  return asyncResource.runInAsyncScope(() => {
    startCh.publish({ channel, method, fields, message });

    try {
      return send.apply(channel, args);
    } catch (err) {
      errorCh.publish(err);

      throw err;
    } finally {
      finishCh.publish();
    }
  });
}

function isCamelCase(str: string) {
  return /([A-Z][a-z0-9]+)+/.test(str);
}
