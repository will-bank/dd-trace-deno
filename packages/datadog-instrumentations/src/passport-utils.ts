'use strict';

import * as shimmer from '../../datadog-shimmer/index.ts';
import dc from 'npm:dd-trace/packages/diagnostics_channel/index.js';

const passportVerifyChannel = dc.channel('datadog:passport:verify:finish');

function wrapVerifiedAndPublish(
  username,
  password,
  verified: { apply: (arg0: any, arg1: IArguments) => any },
  type: string,
) {
  if (!passportVerifyChannel.hasSubscribers) {
    return verified;
  }

  return shimmer.wrap(verified, function (err, user, info) {
    const credentials = { type, username };
    passportVerifyChannel.publish({ credentials, user });
    return verified.apply(this, arguments);
  });
}

function wrapVerify(verify: { apply: (arg0: any, arg1: IArguments) => any }, passReq: boolean, type: string) {
  if (passReq) {
    return function (req, username, password, verified: { apply: (arg0: any, arg1: IArguments) => any }) {
      arguments[3] = wrapVerifiedAndPublish(username, password, verified, type);
      return verify.apply(this, arguments);
    };
  } else {
    return function (username, password, verified: { apply: (arg0: any, arg1: IArguments) => any }) {
      arguments[2] = wrapVerifiedAndPublish(username, password, verified, type);
      return verify.apply(this, arguments);
    };
  }
}

export {
  wrapVerify,
};
