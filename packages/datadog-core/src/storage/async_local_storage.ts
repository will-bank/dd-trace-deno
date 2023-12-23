import { type AsyncLocalStorage } from 'node:async_hooks';
import { assert } from 'https://deno.land/std@0.204.0/assert/assert.ts';

export default class AsyncLocalStoragePolyfill<T> implements AsyncLocalStorage<T>, Disposable {
  #key = new StorageKey();
  #unregisterToken = Symbol('unregisterToken');

  constructor() {
    fnReg.register(this, this.#key, this.#unregisterToken);
  }

  disable(): void {
    // TODO
    throw new Error('Method not implemented.');
  }

  getStore(): T | undefined {
    const currentFrame = AsyncContextFrame.current();
    return currentFrame.get(this.#key);
  }

  run<R, TArgs extends any[]>(store: T, callback: (...args: TArgs) => R, ...args: TArgs): R {
    const frame = AsyncContextFrame.create(
      null,
      new StorageEntry(this.#key, store),
    );
    Scope.enter(frame);
    let res;
    try {
      res = callback(...args);
    } finally {
      Scope.exit();
    }
    return res;
  }

  exit<R, TArgs extends any[]>(callback: (...args: TArgs) => R, ...args: TArgs): R {
    return this.run(undefined, callback, args);
  }

  enterWith(store: T): void {
    const frame = AsyncContextFrame.create(
      null,
      new StorageEntry(this.#key, store),
    );
    Scope.enter(frame);
  }

  [Symbol.dispose](): void {
    fnReg.unregister(this.#unregisterToken);
  }
}

// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.
// Copyright Joyent and Node contributors. All rights reserved. MIT license.

// This implementation is inspired by "workerd" AsyncLocalStorage implementation:
// https://github.com/cloudflare/workerd/blob/77fd0ed6ddba184414f0216508fc62b06e716cab/src/workerd/api/node/async-hooks.c++#L9

// TODO(petamoriken): enable prefer-primordials for node polyfills
// deno-lint-ignore-file prefer-primordials

const { core } = Deno[Deno.internal];
const { ops } = core;

const asyncContextStack: AsyncContextFrame[] = [];

function pushAsyncFrame(frame: AsyncContextFrame) {
  asyncContextStack.push(frame);
}

function popAsyncFrame() {
  if (asyncContextStack.length > 0) {
    asyncContextStack.pop();
  }
}

let rootAsyncFrame: AsyncContextFrame | undefined = undefined;
let promiseHooksSet = false;

const asyncContext = Symbol("asyncContext");

function setPromiseHooks() {
  if (promiseHooksSet) {
    return;
  }
  promiseHooksSet = true;

  const init = (promise: Promise<unknown>) => {
    const currentFrame = AsyncContextFrame.current();
    if (!currentFrame.isRoot()) {
      if (typeof promise[asyncContext] !== "undefined") {
        throw new Error("Promise already has async context");
      }
      AsyncContextFrame.attachContext(promise);
    }
  };
  const before = (promise: Promise<unknown>) => {
    const maybeFrame = promise[asyncContext];
    if (maybeFrame) {
      pushAsyncFrame(maybeFrame);
    } else {
      pushAsyncFrame(AsyncContextFrame.getRootAsyncContext());
    }
  };
  const after = (promise: Promise<unknown>) => {
    popAsyncFrame();
    if (!ops.op_node_is_promise_rejected(promise)) {
      // @ts-ignore promise async context
      promise[asyncContext] = undefined;
    }
  };
  const resolve = (promise: Promise<unknown>) => {
    const currentFrame = AsyncContextFrame.current();
    if (
      !currentFrame.isRoot() && ops.op_node_is_promise_rejected(promise) &&
      typeof promise[asyncContext] === "undefined"
    ) {
      AsyncContextFrame.attachContext(promise);
    }
  };

  core.setPromiseHooks(init, before, after, resolve);
}

class AsyncContextFrame {
  storage: StorageEntry[];
  constructor(
    maybeParent?: AsyncContextFrame | null,
    maybeStorageEntry?: StorageEntry | null,
    isRoot = false,
  ) {
    this.storage = [];

    setPromiseHooks();

    const propagate = (parent: AsyncContextFrame) => {
      parent.storage = parent.storage.filter((entry) => !entry.key.isDead());
      parent.storage.forEach((entry) => this.storage.push(entry.clone()));

      if (maybeStorageEntry) {
        const existingEntry = this.storage.find((entry) =>
          entry.key === maybeStorageEntry.key
        );
        if (existingEntry) {
          existingEntry.value = maybeStorageEntry.value;
        } else {
          this.storage.push(maybeStorageEntry);
        }
      }
    };

    if (!isRoot) {
      if (maybeParent) {
        propagate(maybeParent);
      } else {
        propagate(AsyncContextFrame.current());
      }
    }
  }

  static tryGetContext(promise: Promise<unknown>) {
    // @ts-ignore promise async context
    return promise[asyncContext];
  }

  static attachContext(promise: Promise<unknown>) {
    // @ts-ignore promise async context
    promise[asyncContext] = AsyncContextFrame.current();
  }

  static getRootAsyncContext() {
    if (typeof rootAsyncFrame !== "undefined") {
      return rootAsyncFrame;
    }

    rootAsyncFrame = new AsyncContextFrame(null, null, true);
    return rootAsyncFrame;
  }

  static current() {
    if (asyncContextStack.length === 0) {
      return AsyncContextFrame.getRootAsyncContext();
    }

    return asyncContextStack[asyncContextStack.length - 1];
  }

  static create(
    maybeParent?: AsyncContextFrame | null,
    maybeStorageEntry?: StorageEntry | null,
  ) {
    return new AsyncContextFrame(maybeParent, maybeStorageEntry);
  }

  static wrap(
    fn: () => unknown,
    maybeFrame: AsyncContextFrame | undefined,
    // deno-lint-ignore no-explicit-any
    thisArg: any,
  ) {
    // deno-lint-ignore no-explicit-any
    return (...args: any) => {
      const frame = maybeFrame || AsyncContextFrame.current();
      Scope.enter(frame);
      try {
        return fn.apply(thisArg, args);
      } finally {
        Scope.exit();
      }
    };
  }

  get(key: StorageKey) {
    assert(!key.isDead());
    this.storage = this.storage.filter((entry) => !entry.key.isDead());
    const entry = this.storage.find((entry) => entry.key === key);
    if (entry) {
      return entry.value;
    }
    return undefined;
  }

  isRoot() {
    return AsyncContextFrame.getRootAsyncContext() == this;
  }
}

class Scope {
  static enter(maybeFrame?: AsyncContextFrame) {
    if (maybeFrame) {
      pushAsyncFrame(maybeFrame);
    } else {
      pushAsyncFrame(AsyncContextFrame.getRootAsyncContext());
    }
  }

  static exit() {
    popAsyncFrame();
  }
}

class StorageEntry {
  key: StorageKey;
  value: unknown;
  constructor(key: StorageKey, value: unknown) {
    this.key = key;
    this.value = value;
  }

  clone() {
    return new StorageEntry(this.key, this.value);
  }
}

class StorageKey {
  #dead = false;

  reset() {
    this.#dead = true;
  }

  isDead() {
    return this.#dead;
  }
}

const fnReg = new FinalizationRegistry((key: StorageKey) => {
  key.reset();
});

function validateFunction(value, name){
  if (typeof value !== "function") {
    throw new ERR_INVALID_ARG_TYPE(name, "Function", value);
  }
}
