'use strict';

import shimmer from '../../datadog-shimmer/index.ts';
const { addHook, channel } = await import('./helpers/instrument.ts');

const routeChannel = dc.channel('apm:find-my-way:request:route');

function wrapOn(on: { apply: (arg0: any, arg1: IArguments) => any }) {

  return function onWithTrace(method, path, opts) {
    const index = typeof opts === 'function' ? 2 : 3;
    const handler = arguments[index];

    const wrapper = function (req) {
      routeChannel.publish({ req, route: path });

      return handler.apply(this, arguments);
    };

    if (typeof handler === 'function') {
      arguments[index] = wrapper;
    }

    return on.apply(this, arguments);
  };
}

addHook({ name: 'find-my-way', versions: ['>=1'] }, (Router: { prototype: any }) => {
  shimmer.wrap(Router.prototype, 'on', wrapOn);

  return Router;
});
