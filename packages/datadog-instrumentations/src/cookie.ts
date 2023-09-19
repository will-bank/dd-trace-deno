'use strict';

import shimmer from '../../datadog-shimmer/index.ts';
const { channel, addHook } = await import('./helpers/instrument.ts');

const cookieParseCh = dc.channel('datadog:cookie:parse:finish');

function wrapParse(originalParse: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    const cookies = originalParse.apply(this, arguments);
    if (cookieParseCh.hasSubscribers && cookies) {
      cookieParseCh.publish({ cookies });
    }
    return cookies;
  };
}

addHook({ name: 'cookie', versions: ['>=0.4'] }, (cookie) => {
  shimmer.wrap(cookie, 'parse', wrapParse);
  return cookie;
});
