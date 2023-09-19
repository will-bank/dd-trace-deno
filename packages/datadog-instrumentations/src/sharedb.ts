'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

/**
 * @description The enum values in this map are not exposed from ShareDB, so the keys are hard-coded here.
 * The values were derived from: https://github.com/share/sharedb/blob/master/lib/client/connection.js#L196
 */
const READABLE_ACTION_NAMES = {
  hs: 'handshake',
  qf: 'query-fetch',
  qs: 'query-subscribe',
  qu: 'query-unsubscribe',
  bf: 'bulk-fetch',
  bs: 'bulk-subscribe',
  bu: 'bulk-unsubscribe',
  f: 'fetch',
  s: 'subscribe',
  u: 'unsubscribe',
  op: 'op',
  nf: 'snapshot-fetch',
  nt: 'snapshot-fetch-by-ts',
  p: 'presence-broadcast',
  pr: 'presence-request',
  ps: 'presence-subscribe',
  pu: 'presence-unsubscribe',
};

addHook({ name: 'sharedb', versions: ['>=1'], file: 'lib/agent.js' }, (Agent: { prototype: any }) => {
  const startCh = dc.channel('apm:sharedb:request:start');
  const finishCh = dc.channel('apm:sharedb:request:finish');
  const errorCh = dc.channel('apm:sharedb:request:error');

  shimmer.wrap(
    Agent.prototype,
    '_handleMessage',
    (origHandleMessageFn: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (request: { a: any }, callback: { apply: (arg0: any, arg1: IArguments) => any }) {
        const callbackResource = new AsyncResource('bound-anonymous-fn');
        const asyncResource = new AsyncResource('bound-anonymous-fn');

        const action = request.a;
        const actionName = getReadableActionName(action);

        return asyncResource.runInAsyncScope(() => {
          startCh.publish({ actionName, request });

          callback = callbackResource.bind(callback);


          arguments[1] = asyncResource.bind(function (error, res) {
            if (error) {
              errorCh.publish(error);
            }
            finishCh.publish({ request, res });

            return callback.apply(this, arguments);
          });

          try {

            return origHandleMessageFn.apply(this, arguments);
          } catch (error) {
            errorCh.publish(error);

            throw error;
          }
        });
      },
  );
  return Agent;
});

function getReadableActionName(action: string | number) {

  const actionName = READABLE_ACTION_NAMES[action];
  if (actionName === undefined) {
    return action;
  }
  return actionName;
}
