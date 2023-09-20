// TODO: move anything related to tracing to TracingPlugin instead

import dc from 'npm:dd-trace@4.13.1/packages/diagnostics_channel/index.js';
import { storage } from '../../../datadog-core/index.ts';

class Subscription {
  private _channel: any;
  private _handler: (message: any, name: any) => void;

  constructor(event, handler: (arg0: any, arg1: any) => void) {
    this._channel = dc.channel(event);
    this._handler = (message, name) => {
      const store = storage.getStore();
      if (!store || !store.noop) {
        handler(message, name);
      }
    };
  }

  enable() {
    this._channel.subscribe(this._handler);
  }

  disable() {
    this._channel.unsubscribe(this._handler);
  }
}

class StoreBinding {
  private _transform: (
    // TODO: move anything related to tracing to TracingPlugin instead
    data: any,
  ) => any;
  private _channel: any;

  constructor(event, transform: (arg0: any) => any) {
    this._channel = dc.channel(event);
    this._transform = (data) => {
      const store = storage.getStore();

      return !store || !store.noop ? transform(data) : store;
    };
  }

  enable() {
    this._channel.bindStore(storage, this._transform);
  }

  disable() {
    this._channel.unbindStore(storage, this._transform);
  }
}

export default class Plugin {
  private _subscriptions: any[];
  private _bindings: any[]; // TODO: move anything related to tracing to TracingPlugin instead
  private _enabled: boolean;
  private _tracer: any;
  config: {};
  private _tracerConfig: any;

  constructor(tracer, tracerConfig) {
    this._subscriptions = [];
    this._bindings = [];
    this._enabled = false;
    this._tracer = tracer;
    this.config = {}; // plugin-specific configuration, unset until .configure() is called
    this._tracerConfig = tracerConfig; // global tracer configuration
  }


  get tracer() {
    return this._tracer._tracer;
  }


  enter(span, store) {
    store = store || storage.getStore();
    storage.enterWith({ ...store, span });
  }

  // TODO: Implement filters on resource name for all plugins.
  /** Prevents creation of spans here and for all async descendants. */
  skip() {
    storage.enterWith({ noop: true });
  }


  addSub(channelName, handler: (arg0: any, arg1: any) => void) {
    this._subscriptions.push(new Subscription(channelName, handler));
  }


  addBind(channelName, transform: (arg0: any) => any) {
    this._bindings.push(new StoreBinding(channelName, transform));
  }


  addError(error) {
    const store = storage.getStore();

    if (!store || !store.span) return;

    if (!store.span._spanContext._tags['error']) {
      store.span.setTag('error', error || 1);
    }
  }

  configure(config: { enabled?: any }) {
    if (typeof config === 'boolean') {
      config = { enabled: config };
    }
    this.config = config;
    if (config.enabled && !this._enabled) {
      this._enabled = true;
      this._subscriptions.forEach((sub) => sub.enable());
      this._bindings.forEach((sub: { enable: () => any }) => sub.enable());
    } else if (!config.enabled && this._enabled) {
      this._enabled = false;
      this._subscriptions.forEach((sub) => sub.disable());
      this._bindings.forEach((sub: { disable: () => any }) => sub.disable());
    }
  }
}
