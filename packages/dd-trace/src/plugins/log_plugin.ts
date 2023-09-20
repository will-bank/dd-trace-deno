import { LOG } from 'npm:dd-trace@4.13.1/ext/formats.js';
import Plugin from './plugin.ts';
import { storage } from '../../../datadog-core/index.ts';

const hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

function messageProxy(message, holder: { dd?: any }) {

  return new Proxy(message, {

    get(target, p: string, receiver) {

      if (p === Symbol.toStringTag) {
        return Object.prototype.toString.call(target).slice(8, -1);
      }

      if (shouldOverride(target, p)) {
        return holder.dd;
      }


      return Reflect.get(target, p, receiver);
    },

    ownKeys(target) {

      const ownKeys = Reflect.ownKeys(target);

      return hasOwn(target, 'dd') || !Reflect.isExtensible(target) ? ownKeys : ['dd', ...ownKeys];
    },

    getOwnPropertyDescriptor(target, p: string) {

      return Reflect.getOwnPropertyDescriptor(shouldOverride(target, p) ? holder : target, p);
    },
  });
}

function shouldOverride(target, p: string) {

  return p === 'dd' && !Reflect.has(target, p) && Reflect.isExtensible(target);
}

export default class LogPlugin extends Plugin {

  constructor(...args) {

    super(...args);


    this.addSub(`apm:${this.constructor.id}:log`, (arg: { message: any }) => {
      const store = storage.getStore();
      const span = store && store.span;

      // NOTE: This needs to run whether or not there is a span
      // so service, version, and env will always get injected.
      const holder = {};

      this.tracer.inject(span, LOG, holder);
      arg.message = messageProxy(arg.message, holder);
    });
  }

  configure(config: { enabled: any; logInjection: any }) {

    return super.configure({
      ...config,
      enabled: config.enabled && config.logInjection,
    });
  }
}
