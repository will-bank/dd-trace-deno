import Plugin from './plugin.ts';
import { storage } from '../../../datadog-core/index.ts';
import analyticsSampler from './analytics_sampler.ts';
import { COMPONENT } from '../constants.ts';
import Nomenclature from './service-naming.ts';

class TracingPlugin extends Plugin {
  component: any;
  operation: any;

  constructor(...args) {

    super(...args);


    this.component = this.constructor.component || this.constructor.id;

    this.operation = this.constructor.operation;

    this.addTraceSubs();
  }


  get activeSpan() {
    const store = storage.getStore();

    return store && store.span;
  }

  serviceName(opts = {}) {
    const {

      type = this.constructor.type,

      id = this.constructor.id,

      kind = this.constructor.kind,
    } = opts;

    return Nomenclature.serviceName(type, kind, id, opts);
  }

  operationName(opts = {}) {
    const {

      type = this.constructor.type,

      id = this.constructor.id,

      kind = this.constructor.kind,
    } = opts;

    return Nomenclature.opName(type, kind, id, opts);
  }

  configure(config: { hooks: any }) {

    return super.configure({
      ...config,
      hooks: {
        [this.operation]: () => {},
        ...config.hooks,
      },
    });
  }

  start() {} // implemented by individual plugins

  finish() {
    this.activeSpan?.finish();
  }

  error(error: { error: any }) {
    this.addError(error);
  }

  addTraceSubs() {
    const events = ['start', 'end', 'asyncStart', 'asyncEnd', 'error', 'finish'];

    for (const event of events) {
      const bindName = `bind${event.charAt(0).toUpperCase()}${event.slice(1)}`;


      if (this[event]) {
        this.addTraceSub(event, (message) => {

          this[event](message);
        });
      }


      if (this[bindName]) {

        this.addTraceBind(event, (message) => this[bindName](message));
      }
    }
  }

  addTraceSub(eventName: string, handler: (message: any) => void) {

    const prefix = this.constructor.prefix || `apm:${this.component}:${this.operation}`;

    this.addSub(`${prefix}:${eventName}`, handler);
  }

  addTraceBind(eventName: string, transform: (message: any) => any) {

    const prefix = this.constructor.prefix || `apm:${this.component}:${this.operation}`;

    this.addBind(`${prefix}:${eventName}`, transform);
  }

  addError(error: { error: any }, span = this.activeSpan) {
    if (!span._spanContext._tags['error']) {
      // Errors may be wrapped in a context.
      error = (error && error.error) || error;
      span.setTag('error', error || 1);
    }
  }


  startSpan(name, { childOf, kind, meta, metrics, service, resource, type } = {}, enter = true) {
    const store = storage.getStore();

    if (store && childOf === undefined) {
      childOf = store.span;
    }


    const span = this.tracer.startSpan(name, {
      childOf,
      tags: {
        [COMPONENT]: this.component,

        'service.name': service || this.tracer._service,
        'resource.name': resource,
        'span.kind': kind,
        'span.type': type,
        ...meta,
        ...metrics,
      },
      integrationName: type,
    });


    analyticsSampler.sample(span, this.config.measured);

    // TODO: Remove this after migration to TracingChannel is done.
    if (enter) {
      storage.enterWith({ ...store, span });
    }

    return span;
  }
}

export default TracingPlugin;
