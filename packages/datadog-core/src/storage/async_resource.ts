import { createHook } from 'node:async_hooks';
import dc from 'node:diagnostics_channel';
import { IStore } from '../../../dd-trace/src/interfaces.ts';

const beforeCh = dc.channel('dd-trace:storage:before');
const afterCh = dc.channel('dd-trace:storage:after');
const enterCh = dc.channel('dd-trace:storage:enter');

const kResourceStore = Symbol('ddResourceStore');

export type IResource = { [kResourceStore]?: unknown };

export default abstract class AsyncResourceStorage {
  private _enabled = false;
  private _hook = createHook(this._createHook());

  disable() {
    if (!this._enabled) return;

    this._hook.disable();
    this._enabled = false;
  }

  getStore(): IStore {
    if (!this._enabled) return;

    const resource = this._executionAsyncResource();

    return resource[kResourceStore];
  }

  enterWith(store: IStore) {
    this._enable();

    const resource = this._executionAsyncResource();

    resource[kResourceStore] = store;
    enterCh.publish();
  }

  run<T extends (...args: any[]) => any>(store: IStore, callback: T, ...args: Parameters<T>): ReturnType<T> | void {
    this._enable();

    const resource = this._executionAsyncResource();
    const oldStore = resource[kResourceStore];

    resource[kResourceStore] = store;
    enterCh.publish();

    try {
      return callback(...args);
    } finally {
      resource[kResourceStore] = oldStore;
      enterCh.publish();
    }
  }

  _createHook() {
    return {
      init: this._init.bind(this),
      before() {
        beforeCh.publish();
      },
      after() {
        afterCh.publish();
      },
    };
  }

  _enable() {
    if (this._enabled) return;

    this._enabled = true;
    this._hook.enable();
  }

  _init(asyncId: number, type: string, triggerAsyncId: number, resource: IResource) {
    const currentResource = this._executionAsyncResource();

    if (Object.prototype.hasOwnProperty.call(currentResource, kResourceStore)) {
      resource[kResourceStore] = currentResource[kResourceStore];
    }
  }

  // FIXME: executionAsyncResource is not available in Deno
  abstract _executionAsyncResource(): IResource;
}
