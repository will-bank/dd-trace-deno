import { storage } from '../../../datadog-core/index.ts'; // TODO: noop storage?
import id from '../id.ts';
import { ISpan, IStore, ITracer } from '../interfaces.ts';
import Span from '../opentelemetry/span.ts';
import NoopSpanContext from './span_context.ts';

export default class NoopSpan implements ISpan {
  protected _store: IStore;
  private readonly _noopContext: NoopSpanContext;

  readonly _context: ISpan['_context'];
  readonly _tracer: ISpan['_tracer'];

  constructor(
    _tracer: ITracer,
    parent?: NoopSpan,
  ) {
    this._store = storage.getStore();
    this._noopContext = this._createContext(parent);
    this._context = () => this._noopContext;
    this._tracer = () => _tracer;
  }

  setOperationName(name: string) {
    return this;
  }

  setBaggageItem(key: string, value: unknown) {
    return this;
  }

  getBaggageItem(key: string) {
    return undefined;
  }

  setTag(key: string, value: unknown) {
    return this;
  }

  addTags(keyValueMap: object) {
    return this;
  }

  log() {
    return this;
  }

  logEvent() {}

  finish(finishTime: number) {}

  _createContext(parent?: NoopSpan) {
    const spanId = id();

    if (parent) {
      const parentContext = parent._context();
      return new NoopSpanContext({
        noop: this,
        traceId: parentContext.toTraceId(),
        spanId,
        parentId: parentContext.toSpanId(),
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
