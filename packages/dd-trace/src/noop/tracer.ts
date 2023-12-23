import { ITracer, User } from '../interfaces.ts';
import NoopScope from './scope.ts';
import NoopSpan from './span.ts';

export default class NoopTracer implements ITracer {
  protected _scope = new NoopScope();
  private _span = new NoopSpan(this);

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
    return this;
  }

  startSpan(name, options) {
    return this._span;
  }

  inject(spanContext, format, carrier) {}

  extract(format, carrier) {
    return this._span._context();
  }

  setUser(user: User) {
    return this;
  }
}
