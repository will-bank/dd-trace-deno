import NoopSpanContext from './span_context.ts';
import id from '../id.ts';
import { storage } from '../../../datadog-core/index.ts'; // TODO: noop storage?

class NoopSpan {
  public _store: any;
  public _noopTracer: any;
  public _noopContext: NoopSpanContext;
  constructor(tracer, parent: { _traceId: any; _spanId: any; _baggageItems: any }) {
    this._store = storage.getStore();
    this._noopTracer = tracer;
    this._noopContext = this._createContext(parent);
  }

  context() {
    return this._noopContext;
  }
  tracer() {
    return this._noopTracer;
  }
  setOperationName(name) {
    return this;
  }
  setBaggageItem(key, value) {
    return this;
  }
  getBaggageItem(key) {}
  setTag(key, value) {
    return this;
  }
  addTags(keyValueMap) {
    return this;
  }
  log() {
    return this;
  }
  logEvent() {}
  finish(finishTime) {}

  _createContext(parent: { _traceId: any; _spanId: any; _baggageItems: any }) {
    const spanId = id();

    if (parent) {
      return new NoopSpanContext({
        noop: this,
        traceId: parent._traceId,
        spanId,
        parentId: parent._spanId,
        baggageItems: Object.assign({}, parent._baggageItems),
      });
    } else {
      return new NoopSpanContext({
        noop: this,
        traceId: spanId,
        spanId,
      });
    }
  }
}

export default NoopSpan;
