import Tracer from './opentracing/tracer.ts';
import * as tags from 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/ext/tags.js';
import Scope from './scope.ts';
import { storage } from '../../datadog-core/index.ts';
import { isError } from './util.ts';
import { setStartupLogConfig } from './startup-log.ts';
import { ERROR_MESSAGE, ERROR_STACK, ERROR_TYPE } from '../../dd-trace/src/constants.ts';
import { DataStreamsProcessor } from './datastreams/processor.ts';
import { decodePathwayContext } from './datastreams/pathway.ts';
import * as version from 'https://esm.sh/dd-trace@4.13.1&pin=v135&no-dts/version.js';

import * as DataStreamsContext from './data_streams_context.ts';

const { SPAN_TYPE, RESOURCE_NAME, SERVICE_NAME, MEASURED } = tags;

class DatadogTracer extends Tracer {
  private _dataStreamsProcessor: any;
  private _scope: any;
  constructor(config) {
    super(config);
    this._dataStreamsProcessor = new DataStreamsProcessor(config);
    this._scope = new Scope();
    setStartupLogConfig(config);
  }

  configure({ env, sampler }) {
    this._prioritySampler.configure(env, sampler);
  }

  // todo[piochelepiotr] These two methods are not related to the tracer, but to data streams monitoring.
  // They should be moved outside of the tracer in the future.
  setCheckpoint(edgeTags) {
    const ctx = this._dataStreamsProcessor.setCheckpoint(edgeTags, DataStreamsContext.getDataStreamsContext());
    DataStreamsContext.setDataStreamsContext(ctx);
    return ctx;
  }

  decodeDataStreamsContext(data) {
    const ctx = decodePathwayContext(data);
    // we erase the previous context everytime we decode a new one
    DataStreamsContext.setDataStreamsContext(ctx);
    return ctx;
  }

  trace(name, options: { childOf: any; orphanable: boolean }, fn: string | any[]) {
    options = Object.assign({
      childOf: this.scope().active(),
    }, options);

    if (!options.childOf && options.orphanable === false && version.DD_MAJOR < 4) {
      return fn(null, () => {});
    }

    const span = this.startSpan(name, options);

    addTags(span, options);

    try {
      if (fn.length > 1) {
        return this.scope().activate(span, () =>
          fn(span, (err: { name?: any; message: any; stack?: any }) => {
            addError(span, err);
            span.finish();
          }));
      }

      const result = this.scope().activate(span, () => fn(span));

      if (result && typeof result.then === 'function') {
        return result.then(
          (value) => {
            span.finish();
            return value;
          },
          (err: { name?: any; message: any; stack?: any }) => {
            addError(span, err);
            span.finish();
            throw err;
          },
        );
      } else {
        span.finish();
      }

      return result;
    } catch (e) {
      addError(span, e);
      span.finish();
      throw e;
    }
  }

  wrap(name, options, fn: { apply: (arg0: any, arg1: IArguments) => any }) {
    const tracer = this;

    return function () {
      const store = storage.getStore();

      if (store && store.noop) return fn.apply(this, arguments);

      let optionsObj = options;
      if (typeof optionsObj === 'function' && typeof fn === 'function') {
        optionsObj = optionsObj.apply(this, arguments);
      }

      if (optionsObj && optionsObj.orphanable === false && !tracer.scope().active() && version.DD_MAJOR < 4) {
        return fn.apply(this, arguments);
      }

      const lastArgId = arguments.length - 1;
      const cb = arguments[lastArgId];

      if (typeof cb === 'function') {
        const scopeBoundCb = tracer.scope().bind(cb);
        return tracer.trace(name, optionsObj, (span, done: (arg0: any) => void) => {
          arguments[lastArgId] = function (err) {
            done(err);
            return scopeBoundCb.apply(this, arguments);
          };

          return fn.apply(this, arguments);
        });
      } else {
        return tracer.trace(name, optionsObj, () => fn.apply(this, arguments));
      }
    };
  }

  setUrl(url) {
    this._exporter.setUrl(url);
  }

  scope() {
    return this._scope;
  }

  getRumData() {
    if (!this._enableGetRumData) {
      return '';
    }
    const span = this.scope().active().context();
    const traceId = span.toTraceId();
    const traceTime = Date.now();
    return `\
<meta name="dd-trace-id" content="${traceId}" />\
<meta name="dd-trace-time" content="${traceTime}" />`;
  }
}

function addError(
  span: { addTags: (arg0: { [x: number]: any }) => void },
  error: { name?: any; message: any; stack?: any },
) {
  if (isError(error)) {
    span.addTags({
      [ERROR_TYPE]: error.name,
      [ERROR_MESSAGE]: error.message,
      [ERROR_STACK]: error.stack,
    });
  }
}

function addTags(
  span: { addTags: (arg0: {}) => void },
  options: { type: any; service: any; resource: any; measured: any } | { childOf: any; orphanable: boolean },
) {
  const tags = {};

  if (options.type) tags[SPAN_TYPE] = options.type;
  if (options.service) tags[SERVICE_NAME] = options.service;
  if (options.resource) tags[RESOURCE_NAME] = options.resource;

  tags[MEASURED] = options.measured;

  span.addTags(tags);
}

export default DatadogTracer;
