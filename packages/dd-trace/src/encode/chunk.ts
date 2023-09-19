import { Buffer } from "https://deno.land/std@0.177.0/node/buffer.ts";

const DEFAULT_MIN_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Represents a chunk of a Msgpack payload. Exposes a subset of Array and Buffer
 * interfaces so that it can be used seamlessly by any encoder code that expects
 * either.
 */
class Chunk {
  buffer: any;
  length: number;
  private _minSize: number;
  constructor(minSize = DEFAULT_MIN_SIZE) {

    this.buffer = Buffer.allocUnsafe(minSize);
    this.length = 0;
    this._minSize = minSize;
  }


  write(value) {

    const length = Buffer.byteLength(value);
    const offset = this.length;

    if (length < 0x20) { // fixstr
      this.reserve(length + 1);
      this.length += 1;
      this.buffer[offset] = length | 0xa0;
    } else if (length < 0x100000000) { // str 32
      this.reserve(length + 5);
      this.length += 5;
      this.buffer[offset] = 0xdb;
      this.buffer[offset + 1] = length >> 24;
      this.buffer[offset + 2] = length >> 16;
      this.buffer[offset + 3] = length >> 8;
      this.buffer[offset + 4] = length;
    }

    this.length += this.buffer.utf8Write(value, this.length, length);

    return this.length - offset;
  }

  copy(target: { set: (arg0: Uint8Array) => void }, sourceStart: number, sourceEnd: number) {
    target.set(new Uint8Array(this.buffer.buffer, sourceStart, sourceEnd - sourceStart));
  }

  set(array: string | any[]) {
    this.reserve(array.length);

    this.buffer.set(array, this.length);
    this.length += array.length;
  }

  reserve(size: number) {
    if (this.length + size > this.buffer.length) {
      this._resize(this._minSize * Math.ceil((this.length + size) / this._minSize));
    }
  }

  _resize(size: number) {
    const oldBuffer = this.buffer;


    this.buffer = Buffer.allocUnsafe(size);

    oldBuffer.copy(this.buffer, 0, 0, this.length);
  }
}

export default Chunk;
