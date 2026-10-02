// Integer hashes. Everything here is 32-bit integer arithmetic (xor, shift, multiply modulo
// 2^32), so a port needs only those three operations to give the same numbers.

const GOLDEN = 0x9e3779b9;

/**
 * A 32-bit finalizer (the avalanche steps of MurmurHash3): a bijection on 32-bit integers in
 * which every input bit affects every output bit. Returns an unsigned 32-bit integer.
 */
export function mix32(value: number): number {
  let h = value | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A hash of an integer position and a seed, for positional variation: the same cell always
 * gets the same value, whatever is drawn around it. Returns an unsigned 32-bit integer.
 *
 * Inputs are taken modulo 2^32 (`| 0`). For a fixed seed and `y` it is a bijection in `x`,
 * and for a fixed seed and `x` a bijection in `y`.
 */
export function hash32(x: number, y: number, seed = 0): number {
  let h = mix32((seed | 0) + GOLDEN);
  h = mix32((h ^ x) + GOLDEN);
  h = mix32((h ^ y) + GOLDEN);
  return h;
}

/** The bytes of an ASCII string. Throws on any other character, so ports agree on the bytes. */
export function asciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) {
      throw new RangeError(`asciiBytes: character ${i} of ${JSON.stringify(text)} is not ASCII`);
    }
    bytes[i] = code;
  }
  return bytes;
}

const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;

/**
 * FNV-1a, 32 bits, over bytes or an ASCII string. Pass a previous result as `state` to
 * continue a hash over several pieces. Returns an unsigned 32-bit integer.
 */
export function fnv1a32(data: Uint8Array | string, state: number = FNV32_OFFSET): number {
  const bytes = typeof data === "string" ? asciiBytes(data) : data;
  let h = state | 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h = Math.imul(h ^ (bytes[i] as number), FNV32_PRIME);
  }
  return h >>> 0;
}

const HEX = "0123456789abcdef";

function hex32(value: number): string {
  let out = "";
  for (let shift = 28; shift >= 0; shift -= 4) out += HEX.charAt((value >>> shift) & 0xf);
  return out;
}

/**
 * FNV-1a, 64 bits, as a streaming hasher. The state is two 32-bit halves, so it needs no
 * 64-bit integers or BigInt; a port with 64-bit integers uses the textbook loop
 * (`h = (h ^ byte) * 0x100000001b3`) and gets the same digest.
 *
 * The typed writers are little-endian and length-prefix nothing: the caller decides the
 * layout of what is hashed.
 */
export class Fnv1a64 {
  // Offset basis 0xcbf29ce484222325.
  private hi = 0xcbf29ce4;
  private lo = 0x84222325;

  /** One byte (the low 8 bits of `value`). */
  byte(value: number): this {
    // (hi, lo) = ((hi, lo) ^ byte) * 0x100000001b3 modulo 2^64. The prime is 2^40 + 0x1b3,
    // so the product is `h * 0x1b3` plus `lo << 8` added into the high half.
    const lo = (this.lo ^ (value & 0xff)) >>> 0;
    const t0 = (lo & 0xffff) * 0x1b3;
    const t1 = (lo >>> 16) * 0x1b3 + (t0 >>> 16);
    this.hi = (Math.imul(this.hi, 0x1b3) + (t1 >>> 16) + (lo << 8)) >>> 0;
    this.lo = (((t1 & 0xffff) << 16) | (t0 & 0xffff)) >>> 0;
    return this;
  }

  bytes(data: Uint8Array): this {
    for (let i = 0; i < data.length; i += 1) this.byte(data[i] as number);
    return this;
  }

  /** The bytes of an ASCII string (no length, no terminator). */
  ascii(text: string): this {
    return this.bytes(asciiBytes(text));
  }

  /** An unsigned 16-bit integer, little-endian. */
  u16(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new RangeError(`Fnv1a64.u16: ${String(value)} is not an unsigned 16-bit integer`);
    }
    return this.byte(value).byte(value >>> 8);
  }

  /** An unsigned 32-bit integer, little-endian. */
  u32(value: number): this {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError(`Fnv1a64.u32: ${String(value)} is not an unsigned 32-bit integer`);
    }
    return this.byte(value).byte(value >>> 8).byte(value >>> 16).byte(value >>> 24);
  }

  /** A signed 32-bit integer, little-endian two's complement. */
  i32(value: number): this {
    if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
      throw new RangeError(`Fnv1a64.i32: ${String(value)} is not a signed 32-bit integer`);
    }
    return this.u32(value >>> 0);
  }

  /** The digest so far as 16 lowercase hex digits. The hasher can keep going afterwards. */
  hex(): string {
    return hex32(this.hi) + hex32(this.lo);
  }
}

/** FNV-1a, 64 bits, over bytes or an ASCII string, as 16 lowercase hex digits. */
export function fnv1a64Hex(data: Uint8Array | string): string {
  const hasher = new Fnv1a64();
  return (typeof data === "string" ? hasher.ascii(data) : hasher.bytes(data)).hex();
}
