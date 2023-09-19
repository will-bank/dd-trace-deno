'use strict';

const { addHook, channel } = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

const qsParseCh = dc.channel('datadog:qs:parse:finish');

function wrapParse(originalParse: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    const qsParsedObj = originalParse.apply(this, arguments);
    if (qsParseCh.hasSubscribers && qsParsedObj) {
      qsParseCh.publish({ qs: qsParsedObj });
    }
    return qsParsedObj;
  };
}

addHook({
  name: 'qs',
  versions: ['>=1'],

}, (qs) => {
  shimmer.wrap(qs, 'parse', wrapParse);
  return qs;
});
