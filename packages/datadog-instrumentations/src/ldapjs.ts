'use strict';

const {

  channel,

  addHook,

  AsyncResource,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

function isString(value: any[]) {
  return typeof value === 'string' || value instanceof String;
}

function getCallbackArgIndex(args: string | IArguments | any[]) {
  let callbackIndex = -1;
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === 'function') {
      callbackIndex = i;
      break;
    }
  }
  return callbackIndex;
}

function wrapEmitter(corkedEmitter: { [x: string]: any }) {

  const callbackMap = new WeakMap();


  const addListener = (on: { apply: (arg0: any, arg1: IArguments) => any }) =>
    function (name, fn) {
      if (typeof fn === 'function') {
        let bindedFn = callbackMap.get(fn);
        if (!bindedFn) {
          const callbackResource = new AsyncResource('bound-anonymous-fn');
          bindedFn = callbackResource.bind(fn);
          callbackMap.set(fn, bindedFn);
        }
        arguments[1] = bindedFn;
      }
      return on.apply(this, arguments);
    };
  shimmer.wrap(corkedEmitter, 'on', addListener);
  shimmer.wrap(corkedEmitter, 'addListener', addListener);


  const removeListener = (off: { apply: (arg0: any, arg1: IArguments) => any }) =>
    function (name, fn) {
      if (typeof fn === 'function') {
        const emitterOn = callbackMap.get(fn);
        if (emitterOn) {
          arguments[1] = emitterOn;
        }
      }
      return off.apply(this, arguments);
    };
  shimmer.wrap(corkedEmitter, 'off', removeListener);
  shimmer.wrap(corkedEmitter, 'removeListener', removeListener);
}

addHook({ name: 'ldapjs', versions: ['>=2'] }, (ldapjs: { Client: { prototype: any } }) => {
  const ldapSearchCh = dc.channel('datadog:ldapjs:client:search');


  shimmer.wrap(
    ldapjs.Client.prototype,
    'search',
    (search: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (base, options: any[]) {
        if (ldapSearchCh.hasSubscribers) {
          let filter;
          if (isString(options)) {
            filter = options;
          } else if (typeof options === 'object' && options.filter) {

            if (isString(options.filter)) {
              filter = options.filter;
            }
          }
          ldapSearchCh.publish({ base, filter });
        }

        return search.apply(this, arguments);
      },
  );

  shimmer.wrap(
    ldapjs.Client.prototype,
    '_send',
    (_send: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function () {
        const callbackIndex = getCallbackArgIndex(arguments);
        if (callbackIndex > -1) {
          const callback = arguments[callbackIndex];

          arguments[callbackIndex] = shimmer.wrap(callback, function (err, corkedEmitter: { [x: string]: any }) {
            if (typeof corkedEmitter === 'object' && typeof corkedEmitter['on'] === 'function') {
              wrapEmitter(corkedEmitter);
            }
            callback.apply(this, arguments);
          });
        }

        return _send.apply(this, arguments);
      },
  );


  shimmer.wrap(
    ldapjs.Client.prototype,
    'bind',
    (bind: { apply: (arg0: any, arg1: IArguments) => any }) =>
      function (dn, password, controls, callback) {
        if (typeof controls === 'function') {
          arguments[2] = AsyncResource.bind(controls);
        } else if (typeof callback === 'function') {
          arguments[3] = AsyncResource.bind(callback);
        }

        return bind.apply(this, arguments);
      },
  );

  return ldapjs;
});
