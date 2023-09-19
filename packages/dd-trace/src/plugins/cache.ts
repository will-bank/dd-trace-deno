import StoragePlugin from './storage.ts';

class CachePlugin extends StoragePlugin {

  static get operation() {
    return 'command';
  }

  startSpan(options: { kind: any }) {
    if (!options.kind) {

      options.kind = this.constructor.kind;
    }

    return super.startSpan(this.operationName(), options);
  }
}

export default CachePlugin;
