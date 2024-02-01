import { format } from 'node:url';

import request from './request.ts';

function fetchAgentInfo(url, callback: (arg0: any, arg1: undefined) => any) {
  request('', {
    path: '/info',
    url,
  }, (err, res: string) => {
    if (err) {
      return callback(err);
    }
    try {
      const response = JSON.parse(res);
      return callback(null, response);
    } catch (e) {
      return callback(e);
    }
  });
}

/**
 * Exporter that exposes a way to query /info endpoint from the agent and gives you the response.
 * While this._writer is not initialized, exported traces are stored as is.
 */
class AgentInfoExporter {
  private _config: any;
  protected url: any;
  private _traceBuffer: any[];
  private _isInitialized: boolean;

  constructor(tracerConfig) {
    this._config = tracerConfig;
    const { url, hostname, port } = this._config;
    this.url = url || new URL(format({
      protocol: 'http:',
      hostname: hostname || 'localhost',
      port,
    }));
    this._traceBuffer = [];
    this._isInitialized = false;
  }

  getAgentInfo(onReceivedInfo: (err: any, agentInfo: any) => void) {
    fetchAgentInfo(this.url, onReceivedInfo);
  }

  export(trace: any[]) {
    if (!this._isInitialized) {
      this._traceBuffer.push(trace);
      return;
    }
    this._export(trace);
  }

  _export(payload: any[], writer = this._writer, timerKey = '_timer') {
    writer.append(payload);

    const { flushInterval } = this._config;

    if (!flushInterval) {
      writer.flush();
    } else if (flushInterval > 0 && !this[timerKey]) {
      this[timerKey] = setTimeout(() => {
        writer.flush();

        this[timerKey] = clearTimeout(this[timerKey]);
      }, flushInterval);

      Deno.unrefTimer(this[timerKey]);
    }
  }

  getUncodedTraces() {
    return this._traceBuffer;
  }

  exportUncodedTraces() {
    this.getUncodedTraces().forEach((uncodedTrace) => {
      this.export(uncodedTrace);
    });
    this.resetUncodedTraces();
  }

  resetUncodedTraces() {
    this._traceBuffer = [];
  }
}

export default AgentInfoExporter;
