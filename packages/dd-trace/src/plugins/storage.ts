import ClientPlugin from './client.ts';

class StoragePlugin extends ClientPlugin {
  system: any;

  static get type() {
    return 'storage';
  }

  constructor(...args) {
    super(...args);

    this.system = this.constructor.system || this.component;
  }

  startSpan(name, options: { service: string }) {
    if (!options.service && this.system) {
      options.service = `${this.tracer._service}-${this.system}`;
    }

    return super.startSpan(name, options);
  }
}

export default StoragePlugin;
