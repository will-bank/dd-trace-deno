import { isWritable } from './request.ts';
import log from '../../log/index.ts';
import { safeJSONStringify } from './util.ts';
import { AgentEncoder } from '../../encode/0.4.ts';

export default abstract class Writer {
  protected readonly _encoder;

  constructor(
    protected url: URL | null,
    getEncoder: (writer: Writer) => AgentEncoder,
  ) {
    this._encoder = getEncoder(this);
  }

  abstract _sendPayload(data, payload: any, done: () => void);

  flush(done = () => {}) {
    const count = this._encoder.count();

    if (!isWritable()) {
      this._encoder.reset();
      done();
    } else if (count > 0) {
      const payload = this._encoder.makePayload();

      this._sendPayload(payload, count, done);
    } else {
      done();
    }
  }

  append(payload) {
    if (!isWritable()) {
      log.debug(() => `Maximum number of active requests reached. Payload discarded: ${safeJSONStringify(payload)}`);
      return;
    }

    log.debug(() => `Encoding payload: ${safeJSONStringify(payload)}`);

    this._encode(payload);
  }

  _encode(payload) {
    this._encoder.encode(payload);
  }

  setUrl(url: URL) {
    this.url = url;
  }
}
