'use strict';

import shimmer from '../../datadog-shimmer/index.ts';
const { addHook } = await import('./helpers/instrument.ts');
const { wrapVerify } = require('./passport-utils');

addHook({
  name: 'passport-http',
  file: 'lib/passport-http/strategies/basic.js',
  versions: ['>=0.3.0'],
}, (BasicStrategy: { apply: (arg0: any, arg1: IArguments) => any }) => {
  return shimmer.wrap(BasicStrategy, function () {
    const type = 'http';

    if (typeof arguments[0] === 'function') {
      arguments[0] = wrapVerify(arguments[0], false, type);
    } else {
      arguments[1] = wrapVerify(arguments[1], arguments[0] && arguments[0].passReqToCallback, type);
    }
    return BasicStrategy.apply(this, arguments);
  });
});
