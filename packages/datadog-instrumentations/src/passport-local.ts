'use strict';

import shimmer from '../../datadog-shimmer/index.ts';
const { addHook } = await import('./helpers/instrument.ts');
const { wrapVerify } = require('./passport-utils');

addHook({
  name: 'passport-local',
  file: 'lib/strategy.js',
  versions: ['>=1.0.0'],
}, (Strategy: { apply: (arg0: any, arg1: IArguments) => any }) => {
  return shimmer.wrap(Strategy, function () {
    const type = 'local';

    if (typeof arguments[0] === 'function') {
      arguments[0] = wrapVerify(arguments[0], false, type);
    } else {
      arguments[1] = wrapVerify(arguments[1], arguments[0] && arguments[0].passReqToCallback, type);
    }
    return Strategy.apply(this, arguments);
  });
});
