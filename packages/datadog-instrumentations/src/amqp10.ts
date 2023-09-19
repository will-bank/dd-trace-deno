'use strict';

const {
  channel,
  addHook,
  AsyncResource,
} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({ name: 'amqp10', file: 'lib/sender_link.js', versions: ['>=3'] }, (SenderLink: { prototype: any }) => {
  const startCh = dc.channel('apm:amqp10:send:start');
  const finishCh = dc.channel('apm:amqp10:send:finish');
  const errorCh = dc.channel('apm:amqp10:send:error');
  shimmer.wrap(
    SenderLink.prototype,
    'send',
    (send: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (msg, options) {
        if (!startCh.hasSubscribers) {
          return send.apply(this, arguments);
        }
        const asyncResource = new AsyncResource('bound-anonymous-fn');
        return asyncResource.runInAsyncScope(() => {
          startCh.publish({ link: this });
          try {
            const promise = send.apply(this, arguments);

            if (!promise) {
              finish(finishCh, errorCh);
              return promise;
            }

            promise.then(
              asyncResource.bind(() => finish(finishCh, errorCh)),
              asyncResource.bind((e: undefined) => finish(finishCh, errorCh, e)),
            );

            return promise;
          } catch (err) {
            finish(finishCh, errorCh, err);
            throw err;
          }
        });
      },
  );
  return SenderLink;
});

addHook({ name: 'amqp10', file: 'lib/receiver_link.js', versions: ['>=3'] }, (ReceiverLink: { prototype: any }) => {
  const startCh = dc.channel('apm:amqp10:receive:start');
  const finishCh = dc.channel('apm:amqp10:receive:finish');
  const errorCh = dc.channel('apm:amqp10:receive:error');
  shimmer.wrap(
    ReceiverLink.prototype,
    '_messageReceived',
    (messageReceived: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (transferFrame: { aborted: any; more: any }) {
        if (!transferFrame || transferFrame.aborted || transferFrame.more) {
          return messageReceived.apply(this, arguments);
        }
        const asyncResource = new AsyncResource('bound-anonymous-fn');
        return asyncResource.runInAsyncScope(() => {
          startCh.publish({ link: this });
          try {
            return messageReceived.apply(this, arguments);
          } catch (err) {
            errorCh.publish(err);
            throw err;
          } finally {
            finishCh.publish();
          }
        });
      },
  );
  return ReceiverLink;
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
