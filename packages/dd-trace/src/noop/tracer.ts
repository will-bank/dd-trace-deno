import Scope from '../noop/scope.ts';
import Span from './span.ts';

class NoopTracer {
  private _scope: any;
  private _span: any;

  constructor(config) {
    this._scope = new Scope();
    this._span = new Span(this);
  }

  configure(options) {}

  trace(name, options, fn: (arg0: any, arg1: () => void) => any) {
    return fn(this._span, () => {});
  }

  wrap(name, options, fn) {
    return fn;
  }

  scope() {
    return this._scope;
  }

  getRumData() {
    return '';
  }

  setUrl() {
  }

  startSpan(name, options) {
    return this._span;
  }

  inject(spanContext, format, carrier) {}

  extract(format, carrier) {
    return this._span.context();
  }

  setUser() {
    return this;
  }
}

export default NoopTracer;
