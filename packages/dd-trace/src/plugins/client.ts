import OutboundPlugin from './outbound.ts';

class ClientPlugin extends OutboundPlugin {
  static get operation() {
    return 'request';
  }

  static get kind() {
    return 'client';
  }

  static get type() {
    return 'web';
  } // overridden by storage and other client type plugins
}

export default ClientPlugin;
