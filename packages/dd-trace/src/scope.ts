import { storage } from '../../datadog-core/index.ts';

// TODO: refactor bind to use shimmer once the new internal tracer lands

const originals = new WeakMap();

class Scope {
  active() {
    const store = storage.getStore();

    return (store && store.span) || null;
  }

  activate(span: { _store: any; setTag: (arg0: string, arg1: any) => void }, callback: { (): any; (): any }) {
    if (typeof callback !== 'function') return callback;

    const oldStore = storage.getStore();
    const newStore = span ? span._store : oldStore;

    storage.enterWith({ ...newStore, span });

    try {
      return callback();
    } catch (e) {
      if (span && typeof span.setTag === 'function') {
        span.setTag('error', e);
      }

      throw e;
    } finally {
      storage.enterWith(oldStore);
    }
  }

  bind(fn: { apply: (arg0: any, arg1: IArguments) => any }, span) {
    if (typeof fn !== 'function') return fn;

    const scope = this;
    const spanOrActive = this._spanOrActive(span);

    const bound = function () {
      return scope.activate(spanOrActive, () => {
        return fn.apply(this, arguments);
      });
    };

    originals.set(bound, fn);

    return bound;
  }

  _spanOrActive(span) {
    return span !== undefined ? span : this.active();
  }

  _isPromise(promise: Promise<any>) {
    return promise && typeof promise.then === 'function';
  }
}

export default Scope;
