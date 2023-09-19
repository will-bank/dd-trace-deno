import { AgentEncoder } from './0.4.ts';

import {
  MAX_NAME_LENGTH,
  MAX_SERVICE_LENGTH,
  MAX_RESOURCE_NAME_LENGTH,
  MAX_TYPE_LENGTH,
  DEFAULT_SPAN_NAME,
  DEFAULT_SERVICE_NAME,
} from './tags-processors.ts';

function truncate(value: string | any[], maxLength: number, suffix = '') {
  if (!value) {
    return value;
  }
  if (value.length > maxLength) {
    return `${value.slice(0, maxLength)}${suffix}`;
  }
  return value;
}

class SpanStatsEncoder extends AgentEncoder {

  _encodeBool(
    bytes: {
      length: number;
      reserve: ((arg0: number) => void) | ((arg0: number) => void);
      buffer: { [x: string]: any } | { [x: string]: any };
    },
    value,
  ) {

    this._encodeByte(bytes, value ? 0xc3 : 0xc2);
  }

  makePayload() {

    const traceSize = this._traceBytes.length;

    const buffer = Buffer.allocUnsafe(traceSize);

    this._traceBytes.copy(buffer, 0, traceSize);

    this._reset();
    return buffer;
  }

  _encodeMapPrefix(
    bytes: { length: number; reserve: (arg0: number) => void; buffer: { [x: string]: any } },
    length: number,
  ) {
    const offset = bytes.length;

    bytes.reserve(1);
    bytes.length += 1;

    bytes.buffer[offset] = 0x80 + length;
  }

  _encodeBuffer(
    bytes: { length: number; reserve: (arg0: number) => void; buffer: { [x: string]: any } },
    buffer: { length: any; copy: (arg0: any, arg1: any) => void },
  ) {
    const length = buffer.length;
    const offset = bytes.length;

    bytes.reserve(5);
    bytes.length += 5;

    bytes.buffer[offset] = 0xc6;
    bytes.buffer[offset + 1] = length >> 24;
    bytes.buffer[offset + 2] = length >> 16;
    bytes.buffer[offset + 3] = length >> 8;
    bytes.buffer[offset + 4] = length;

    buffer.copy(bytes.buffer, offset + 5);
    bytes.length += length;
  }

  _encodeStat(
    bytes: {
      length: number;
      reserve: ((arg0: number) => void) | ((arg0: number) => void);
      buffer: { [x: string]: any } | { [x: string]: any };
    },
    stat: {
      Service: any;
      Name: any;
      Resource: any;
      HTTPStatusCode: any;
      Type: any;
      Hits: any;
      Errors: any;
      Duration: any;
      OkSummary: any;
      ErrorSummary: any;
      Synthetics: any;
      TopLevelHits: any;
    },
  ) {
    this._encodeMapPrefix(bytes, 12);


    this._encodeString(bytes, 'Service');
    const service = stat.Service || DEFAULT_SERVICE_NAME;

    this._encodeString(bytes, truncate(service, MAX_SERVICE_LENGTH));


    this._encodeString(bytes, 'Name');
    const name = stat.Name || DEFAULT_SPAN_NAME;

    this._encodeString(bytes, truncate(name, MAX_NAME_LENGTH));


    this._encodeString(bytes, 'Resource');

    this._encodeString(bytes, truncate(stat.Resource, MAX_RESOURCE_NAME_LENGTH, '...'));


    this._encodeString(bytes, 'HTTPStatusCode');

    this._encodeInteger(bytes, stat.HTTPStatusCode);


    this._encodeString(bytes, 'Type');

    this._encodeString(bytes, truncate(stat.Type, MAX_TYPE_LENGTH));


    this._encodeString(bytes, 'Hits');

    this._encodeLong(bytes, stat.Hits);


    this._encodeString(bytes, 'Errors');

    this._encodeLong(bytes, stat.Errors);


    this._encodeString(bytes, 'Duration');

    this._encodeLong(bytes, stat.Duration);


    this._encodeString(bytes, 'OkSummary');
    this._encodeBuffer(bytes, stat.OkSummary);


    this._encodeString(bytes, 'ErrorSummary');
    this._encodeBuffer(bytes, stat.ErrorSummary);


    this._encodeString(bytes, 'Synthetics');
    this._encodeBool(bytes, stat.Synthetics);


    this._encodeString(bytes, 'TopLevelHits');

    this._encodeLong(bytes, stat.TopLevelHits);
  }

  _encodeBucket(
    bytes: { length: number; reserve: (arg0: number) => void; buffer: { [x: string]: any } },
    bucket: { Start: any; Duration: any; Stats: any },
  ) {
    this._encodeMapPrefix(bytes, 3);


    this._encodeString(bytes, 'Start');

    this._encodeLong(bytes, bucket.Start);


    this._encodeString(bytes, 'Duration');

    this._encodeLong(bytes, bucket.Duration);


    this._encodeString(bytes, 'Stats');

    this._encodeArrayPrefix(bytes, bucket.Stats);
    for (const stat of bucket.Stats) {
      this._encodeStat(bytes, stat);
    }
  }

  _encode(
    bytes: { length: number; reserve: (arg0: number) => void; buffer: { [x: string]: any } },
    stats: {
      Hostname: any;
      Env: any;
      Version: any;
      Stats: any;
      Lang: any;
      TracerVersion: any;
      RuntimeID: any;
      Sequence: any;
    },
  ) {
    this._encodeMapPrefix(bytes, 8);


    this._encodeString(bytes, 'Hostname');

    this._encodeString(bytes, stats.Hostname);


    this._encodeString(bytes, 'Env');

    this._encodeString(bytes, stats.Env);


    this._encodeString(bytes, 'Version');

    this._encodeString(bytes, stats.Version);


    this._encodeString(bytes, 'Stats');

    this._encodeArrayPrefix(bytes, stats.Stats);
    for (const bucket of stats.Stats) {
      this._encodeBucket(bytes, bucket);
    }


    this._encodeString(bytes, 'Lang');

    this._encodeString(bytes, stats.Lang);


    this._encodeString(bytes, 'TracerVersion');

    this._encodeString(bytes, stats.TracerVersion);


    this._encodeString(bytes, 'RuntimeID');

    this._encodeString(bytes, stats.RuntimeID);


    this._encodeString(bytes, 'Sequence');

    this._encodeLong(bytes, stats.Sequence);
  }
}

export { SpanStatsEncoder };
