'use strict';

const {

  channel,

  addHook,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

addHook({ name: 'bunyan', versions: ['>=1'] }, (Logger: { prototype: any }) => {
  const logCh = dc.channel('apm:bunyan:log');
  shimmer.wrap(Logger.prototype, '_emit', (emit: { apply: (arg0: any, arg1: IArguments) => any }) => {

    return function wrappedEmit(rec) {
      if (logCh.hasSubscribers) {
        const payload = { message: rec };
        logCh.publish(payload);
        arguments[0] = payload.message;
      }
      return emit.apply(this, arguments);
    };
  });
  return Logger;
});
