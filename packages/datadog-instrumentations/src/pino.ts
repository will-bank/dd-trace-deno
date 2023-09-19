'use strict';

const {

  channel,

  addHook,

} = await import('./helpers/instrument.ts');
import shimmer from '../../datadog-shimmer/index.ts';

function wrapPino(
  symbol: PropertyKey,
  wrapper: {
    (asJson: any): (obj: any, msg: any, num: any, time: any) => any;
    (mixin: any): () => {};
    (mixin: any): () => {};
    (arg0: any): any;
  },
  pino: { apply: (arg0: any, arg1: IArguments) => any },
) {
  return function pinoWithTrace() {
    const instance = pino.apply(this, arguments);

    Object.defineProperty(instance, symbol, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: wrapper(instance[symbol]),
    });

    return instance;
  };
}

function wrapAsJson(asJson: { apply: (arg0: any, arg1: IArguments) => any }) {
  const ch = dc.channel('apm:pino:log');

  return function asJsonWithTrace(obj, msg, num, time) {
    obj = arguments[0] = obj || {};

    const payload = { message: obj };
    ch.publish(payload);
    arguments[0] = payload.message;

    return asJson.apply(this, arguments);
  };
}

function wrapMixin(mixin: { apply: (arg0: any, arg1: IArguments) => {} }) {
  const ch = dc.channel('apm:pino:log');
  return function mixinWithTrace() {
    let obj = {};

    if (mixin) {
      obj = mixin.apply(this, arguments);
    }

    const payload = { message: obj };
    ch.publish(payload);

    return payload.message;
  };
}

function wrapPrettifyObject(prettifyObject: { apply: (arg0: any, arg1: IArguments) => any }) {
  const ch = dc.channel('apm:pino:log');
  return function prettifyObjectWithTrace(input: { input: any }) {
    const payload = { message: input.input };
    ch.publish(payload);
    input.input = payload.message;
    return prettifyObject.apply(this, arguments);
  };
}

function wrapPrettyFactory(prettyFactory: { apply: (arg0: any, arg1: IArguments) => any }) {
  const ch = dc.channel('apm:pino:log');
  return function prettyFactoryWithTrace() {
    const pretty = prettyFactory.apply(this, arguments);

    return function prettyWithTrace(obj) {
      const payload = { message: obj };
      ch.publish(payload);
      arguments[0] = payload.message;
      return pretty.apply(this, arguments);
    };
  };
}

addHook({ name: 'pino', versions: ['2 - 3', '4', '>=5 <5.14.0'] }, (pino: { symbols: { asJsonSym: any } }) => {
  const asJsonSym = (pino.symbols && pino.symbols.asJsonSym) || 'asJson';


  return shimmer.wrap(pino, wrapPino(asJsonSym, wrapAsJson, pino));
});

addHook({ name: 'pino', versions: ['>=5.14.0 <6.8.0'] }, (pino: { symbols: { mixinSym: any } }) => {
  const mixinSym = pino.symbols.mixinSym;


  return shimmer.wrap(pino, wrapPino(mixinSym, wrapMixin, pino));
});

addHook({ name: 'pino', versions: ['>=6.8.0'] }, (pino: { symbols: { mixinSym: any } }) => {
  const mixinSym = pino.symbols.mixinSym;


  const wrapped = shimmer.wrap(pino, wrapPino(mixinSym, wrapMixin, pino));
  wrapped.pino = wrapped;
  wrapped.default = wrapped;

  return wrapped;
});

addHook({ name: 'pino-pretty', file: 'lib/utils.js', versions: ['>=3'] }, (utils) => {
  shimmer.wrap(utils, 'prettifyObject', wrapPrettifyObject);
  return utils;
});

addHook(
  { name: 'pino-pretty', versions: ['1 - 2'] },
  (prettyFactory: { apply: (arg0: any, arg1: IArguments) => any }) => {
    return shimmer.wrap(prettyFactory, wrapPrettyFactory(prettyFactory));
  },
);
