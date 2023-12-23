import NoopTracer from './tracer.ts';
import NoopAppsecSdk from '../appsec/sdk/noop.ts';
import TracerProvider from '../opentelemetry/tracer_provider.ts';
import Config from '../config.ts';
import { IAppsec, ITracer, TracerOptions, User } from '../interfaces.ts';

export default class NoopProxyTracer implements ITracer {
  appsec: IAppsec = new NoopAppsecSdk();

  constructor(
    protected _tracer: NoopTracer = new NoopTracer(),
  ) {}

  init(options?: TracerOptions) {
    return Promise.resolve(this);
  }

  use(...args: any[]) {
    return this;
  }

  trace(name, options, fn) {
    if (!fn) {
      fn = options;
      options = {};
    }

    if (typeof fn !== 'function') return;

    options = options || {};

    return this._tracer.trace(name, options, fn);
  }

  wrap(name, options, fn) {
    if (!fn) {
      fn = options;
      options = {};
    }

    if (typeof fn !== 'function') return fn;

    options = options || {};

    return this._tracer.wrap(name, options, fn);
  }

  setUrl(...args) {
    return this._tracer.setUrl(...args);
  }

  startSpan(...args) {
    return this._tracer.startSpan(...args);
  }

  inject(...args) {
    return this._tracer.inject(...args);
  }

  extract(...args) {
    return this._tracer.extract(...args);
  }

  scope(...args) {
    return this._tracer.scope(...args);
  }

  getRumData(...args) {
    return this._tracer.getRumData(...args);
  }

  setUser(user: User) {
    this.appsec.setUser(user);
    return this;
  }

  get TracerProvider() {
    return TracerProvider;
  }
}
