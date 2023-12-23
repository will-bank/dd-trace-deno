import { executionAsyncId } from 'node:async_hooks';
import AsyncResourceStorage, { IResource } from './async_resource.ts';

export default class AsyncHooksStorage extends AsyncResourceStorage {
  private _resources = new Map<number, IResource>();

  disable() {
    super.disable();

    this._resources.clear();
  }

  _createHook() {
    return {
      ...super._createHook(),
      destroy: this._destroy.bind(this),
    };
  }

  _init(asyncId: number, type: string, triggerAsyncId: number, resource: IResource) {
    super._init(asyncId, type, triggerAsyncId, resource);

    this._resources.set(asyncId, resource);
  }

  _destroy(asyncId: number) {
    this._resources.delete(asyncId);
  }

  override _executionAsyncResource() {
    const asyncId = executionAsyncId();

    if (!this._resources.has(asyncId)) {
      this._resources.set(asyncId, {});
    }

    return this._resources.get(asyncId);
  }
}
