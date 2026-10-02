// The byte writer of the canonical binary encoding: little-endian integers, ASCII strings with
// a 16-bit length. Every writer checks its range, so a float or an overflow stops the digest
// instead of being hashed.

import { SimError } from "./errors.ts";

const TWO_32 = 0x100000000;

export class ByteWriter {
  private buffer = new Uint8Array(256);
  private size = 0;

  private reserve(count: number): void {
    if (this.size + count <= this.buffer.length) return;
    let capacity = this.buffer.length * 2;
    while (capacity < this.size + count) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.buffer.subarray(0, this.size));
    this.buffer = grown;
  }

  /** The number of bytes written so far. */
  get length(): number {
    return this.size;
  }

  u8(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new SimError(`ByteWriter.u8: ${String(value)} is not an unsigned 8-bit integer`);
    }
    this.reserve(1);
    this.buffer[this.size] = value;
    this.size += 1;
    return this;
  }

  u16(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new SimError(`ByteWriter.u16: ${String(value)} is not an unsigned 16-bit integer`);
    }
    this.reserve(2);
    this.buffer[this.size] = value & 0xff;
    this.buffer[this.size + 1] = value >>> 8;
    this.size += 2;
    return this;
  }

  u32(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new SimError(`ByteWriter.u32: ${String(value)} is not an unsigned 32-bit integer`);
    }
    this.reserve(4);
    this.buffer[this.size] = value & 0xff;
    this.buffer[this.size + 1] = (value >>> 8) & 0xff;
    this.buffer[this.size + 2] = (value >>> 16) & 0xff;
    this.buffer[this.size + 3] = value >>> 24;
    this.size += 4;
    return this;
  }

  /** A signed 32-bit integer, two's complement. */
  i32(value: number): this {
    if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
      throw new SimError(`ByteWriter.i32: ${String(value)} is not a signed 32-bit integer`);
    }
    return this.u32(value >>> 0);
  }

  /**
   * A safe integer (|value| < 2^53) as a signed 64-bit integer, two's complement: the low 32
   * bits, then the high 32 bits.
   */
  i64(value: number): this {
    if (!Number.isSafeInteger(value)) {
      throw new SimError(`ByteWriter.i64: ${String(value)} is not a safe integer`);
    }
    const high = Math.floor(value / TWO_32);
    const low = value - high * TWO_32;
    return this.u32(low).u32(high >>> 0);
  }

  /** An ASCII string: its length as u16, then one byte per character. */
  str(text: string): this {
    this.u16(text.length);
    this.reserve(text.length);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code > 0x7f) throw new SimError(`ByteWriter.str: ${JSON.stringify(text)} is not ASCII`);
      this.buffer[this.size + i] = code;
    }
    this.size += text.length;
    return this;
  }

  /** Raw bytes, with no length. */
  bytes(data: Uint8Array): this {
    this.reserve(data.length);
    this.buffer.set(data, this.size);
    this.size += data.length;
    return this;
  }

  /** A copy of what was written. */
  finish(): Uint8Array {
    return this.buffer.slice(0, this.size);
  }
}
