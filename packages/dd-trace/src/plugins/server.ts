import InboundPlugin from './inbound.ts';

class ServerPlugin extends InboundPlugin {

  static get operation() {
    return 'request';
  }

  static get kind() {
    return 'server';
  }

  static get type() {
    return 'web';
  } // a default that may eventually be overriden by nonweb servers
}

export default ServerPlugin;
