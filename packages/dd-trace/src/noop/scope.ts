import { IScope, ISpan } from '../interfaces.ts';

export default class NoopScope implements IScope {
  active() {
    return null;
  }

  activate<T>(span: ISpan, fn: (...args: any[]) => T): T {
    return fn();
  }

  bind<T>(fn: T, span?: ISpan | null): T {
    return fn;
  }
}
