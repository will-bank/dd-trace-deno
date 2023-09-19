import http from 'node:http';
import https from 'node:https';
import { storage } from '../../../../datadog-core/index.ts';

const keepAlive = true;
const maxSockets = 1;

function createAgentClass(BaseAgent) {
  class CustomAgent extends BaseAgent {
    constructor() {
      super({ keepAlive, maxSockets });
    }


    createConnection(...args) {
      return this._noop(() => super.createConnection(...args));
    }


    keepSocketAlive(...args) {
      return this._noop(() => super.keepSocketAlive(...args));
    }


    reuseSocket(...args) {
      return this._noop(() => super.reuseSocket(...args));
    }

    _noop(callback: { (): any; (): any; (): any }) {
      return storage.run({ noop: true }, callback);
    }
  }

  return CustomAgent;
}

const HttpAgent = createAgentClass(http.Agent);
const HttpsAgent = createAgentClass(https.Agent);

export const httpAgent = new HttpAgent();
export const httpsAgent = new HttpsAgent();
