import { AgentEncoder } from './0.4.ts';
import Chunk from './chunk.ts';

const COVERAGE_PAYLOAD_VERSION = 2;
const COVERAGE_KEYS_LENGTH = 2;

class CoverageCIVisibilityEncoder extends AgentEncoder {
  private _coverageBytes: any;
  form: FormData;
  private _coveragesCount: number;
  private _coveragesOffset: any;
  constructor(...args) {
    super(...args);
    this._coverageBytes = new Chunk();
    this.form = new FormData();
    this._coveragesCount = 0;
    this.reset();
  }

  count() {
    return this._coveragesCount;
  }

  encode(coverage: { testId: any; sessionId: any; suiteId: any; files: any }) {
    this._coveragesCount++;
    this.encodeCodeCoverage(this._coverageBytes, coverage);
  }

  encodeCodeCoverage(bytes, coverage: { testId: any; sessionId: any; suiteId: any; files: any }) {
    if (coverage.testId) {
      this._encodeMapPrefix(bytes, 4);
    } else {
      this._encodeMapPrefix(bytes, 3);
    }

    this._encodeString(bytes, 'test_session_id');

    this._encodeId(bytes, coverage.sessionId);

    this._encodeString(bytes, 'test_suite_id');

    this._encodeId(bytes, coverage.suiteId);
    if (coverage.testId) {
      this._encodeString(bytes, 'span_id');

      this._encodeId(bytes, coverage.testId);
    }

    this._encodeString(bytes, 'files');

    this._encodeArrayPrefix(bytes, coverage.files);
    for (const filename of coverage.files) {
      this._encodeMapPrefix(bytes, 1);

      this._encodeString(bytes, 'filename');

      this._encodeString(bytes, filename);
    }
  }

  reset() {
    this._reset();
    if (this._coverageBytes) {
      this._coverageBytes.length = 0;
    }
    this._coveragesCount = 0;
    this._encodePayloadStart(this._coverageBytes);
  }

  _encodePayloadStart(bytes: { length: number; reserve: (arg0: number) => void }) {
    const payload = {
      version: COVERAGE_PAYLOAD_VERSION,

      coverages: [],
    };

    this._encodeMapPrefix(bytes, COVERAGE_KEYS_LENGTH);

    this._encodeString(bytes, 'version');

    this._encodeInteger(bytes, payload.version);

    this._encodeString(bytes, 'coverages');
    // Get offset of the coverages list to update the length of the array when calling `makePayload`
    this._coveragesOffset = bytes.length;
    bytes.reserve(5);
    bytes.length += 5;
  }

  makePayload() {
    const bytes = this._coverageBytes;

    const coveragesOffset = this._coveragesOffset;
    const coveragesCount = this._coveragesCount;

    // update with number of coverages
    bytes.buffer[coveragesOffset] = 0xdd;
    bytes.buffer[coveragesOffset + 1] = coveragesCount >> 24;
    bytes.buffer[coveragesOffset + 2] = coveragesCount >> 16;
    bytes.buffer[coveragesOffset + 3] = coveragesCount >> 8;
    bytes.buffer[coveragesOffset + 4] = coveragesCount;

    const traceSize = bytes.length;

    const buffer = Buffer.allocUnsafe(traceSize);

    bytes.buffer.copy(buffer, 0, 0, bytes.length);

    this.form.append(
      'coverage1',
      new Blob([buffer], { type: 'application/msgpack' }),
      `coverage1.msgpack`,
    );
    this.form.append(
      'event',
      // The intake requires a populated dictionary here. Simply having {} is not valid.
      // We use dummy: true but any other key/value pair would be valid.
      new Blob([JSON.stringify({ dummy: true })], { type: 'application/json' }),
      'event.json',
    );

    const form = this.form;

    this.form = new FormData();
    this.reset();

    return form;
  }
}

export { CoverageCIVisibilityEncoder };
