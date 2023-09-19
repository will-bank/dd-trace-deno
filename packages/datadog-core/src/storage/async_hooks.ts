'use strict';

import { executionAsyncId } from 'node:async_hooks';
import AsyncResourceStorage from './async_resource.ts';

export default class AsyncHooksStorage extends AsyncResourceStorage {
  private _resources: any;
  constructor() {
    super();

    this._resources = new Map();
  }

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

  _init(asyncId, type, triggerAsyncId, resource) {
    super._init.apply(this, arguments);

    this._resources.set(asyncId, resource);
  }

  _destroy(asyncId) {
    this._resources.delete(asyncId);
  }

  _executionAsyncResource() {
    const asyncId = executionAsyncId();

    let resource = this._resources.get(asyncId);

    if (!resource) {
      this._resources.set(asyncId, resource = {});
    }

    return resource;
  }
}
