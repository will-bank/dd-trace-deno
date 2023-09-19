'use strict';

const { addHook, AsyncResource } = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

function wrapRequest(original: { apply: (arg0: any, arg1: IArguments) => any }) {
  return function () {
    const id = arguments.length - 1;
    arguments[id] = AsyncResource.bind(arguments[id]);
    return original.apply(this, arguments);
  };
}

addHook({
  name: 'limitd-client',
  versions: ['>=2.8'],
}, (LimitdClient: { prototype: any }) => {
  shimmer.wrap(LimitdClient.prototype, '_directRequest', wrapRequest);
  shimmer.wrap(LimitdClient.prototype, '_retriedRequest', wrapRequest);
  return LimitdClient;
});
