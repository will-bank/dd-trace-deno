import NoopTracer from './tracer.ts';
import NoopAppsecSdk from '../appsec/sdk/noop.ts';
import TracerProvider from '../opentelemetry/tracer_provider.ts';
import Config from "../config.ts";

const noop = new NoopTracer();
const noopAppsec = new NoopAppsecSdk();

export default class Tracer {
  private _tracer: any;
  appsec: any;
  constructor() {
    this._tracer = noop;
    this.appsec = noopAppsec;
  }

  async init(options: ConstructorParameters<typeof Config>[0]) {
    return this;
  }

  use() {
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
    this._tracer.setUrl(...args);
    return this;
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

  setUser(user) {
    this.appsec.setUser(user);
    return this;
  }

  get TracerProvider() {
    return TracerProvider;
  }
}
