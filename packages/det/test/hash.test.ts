import { describe, expect, it } from "vitest";
import { asciiBytes, createRng, Fnv1a64, fnv1a32, fnv1a64Hex, hash32, mix32 } from "../src/index.ts";

function bitCount(value: number): number {
  let count = 0;
  for (let v = value >>> 0; v !== 0; v >>>= 1) count += v & 1;
  return count;
}

describe("fnv1a32 and fnv1a64", () => {
  it("give the published FNV-1a test values", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });

  it("fnv1a64 on two 32-bit halves matches the textbook 64-bit loop", () => {
    const rng = createRng(3, "fnv64");
    for (let round = 0; round < 200; round += 1) {
      const bytes = new Uint8Array(rng.int(300));
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = rng.int(256);
      let h = 0xcbf29ce484222325n;
      for (const byte of bytes) h = ((h ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
      expect(fnv1a64Hex(bytes)).toBe(h.toString(16).padStart(16, "0"));
    }
  });

  it("hash in pieces as in one go", () => {
    const whole = asciiBytes("wz.asset-output/1 palette");
    expect(fnv1a32(whole.subarray(9), fnv1a32(whole.subarray(0, 9)))).toBe(fnv1a32(whole));
    const pieces = new Fnv1a64().bytes(whole.subarray(0, 9)).bytes(whole.subarray(9));
    expect(pieces.hex()).toBe(fnv1a64Hex(whole));
  });

  it("writes integers little-endian", () => {
    expect(new Fnv1a64().u16(0x1234).hex()).toBe(fnv1a64Hex(Uint8Array.of(0x34, 0x12)));
    expect(new Fnv1a64().u32(0x89abcdef).hex()).toBe(fnv1a64Hex(Uint8Array.of(0xef, 0xcd, 0xab, 0x89)));
    expect(new Fnv1a64().i32(-2).hex()).toBe(fnv1a64Hex(Uint8Array.of(0xfe, 0xff, 0xff, 0xff)));
    expect(() => new Fnv1a64().u16(65536)).toThrow(/16-bit/);
    expect(() => new Fnv1a64().u32(-1)).toThrow(/32-bit/);
    expect(() => new Fnv1a64().i32(1.5)).toThrow(/32-bit/);
  });

  it("refuse text that is not ASCII, so ports agree on the bytes", () => {
    expect(() => fnv1a32("žluťoučký")).toThrow(/not ASCII/);
    expect(() => new Fnv1a64().ascii("é")).toThrow(/not ASCII/);
  });
});

describe("mix32", () => {
  it("is the MurmurHash3 finalizer", () => {
    expect(mix32(0)).toBe(0);
    expect(mix32(1)).toBe(0x514e28b7);
    expect(mix32(0xffffffff)).toBe(0x81f16f39);
  });

  it("returns unsigned 32-bit integers and reads its input modulo 2^32", () => {
    for (const value of [0, 1, -1, 2 ** 31, 2 ** 32 + 5, -(2 ** 31)]) {
      const out = mix32(value);
      expect(Number.isInteger(out) && out >= 0 && out <= 0xffffffff).toBe(true);
      expect(mix32(value + 2 ** 32)).toBe(out);
    }
  });

  it("flips about half of the output bits when one input bit flips", () => {
    const rng = createRng(8, "avalanche");
    let flipped = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i += 1) {
      const value = rng.next();
      flipped += bitCount(mix32(value) ^ mix32(value ^ (1 << rng.int(32))));
    }
    const average = flipped / trials;
    expect(average).toBeGreaterThan(15);
    expect(average).toBeLessThan(17);
  });
});

describe("hash32", () => {
  it("depends on x, y and the seed", () => {
    const base = hash32(3, 4, 5);
    expect(hash32(3, 4, 5)).toBe(base);
    expect(hash32(4, 3, 5)).not.toBe(base);
    expect(hash32(3, 5, 5)).not.toBe(base);
    expect(hash32(3, 4, 6)).not.toBe(base);
    expect(hash32(3, 4)).toBe(hash32(3, 4, 0));
  });

  it("has no collisions along a row or a column", () => {
    for (const seed of [0, 1, 99]) {
      const row = new Set<number>();
      const column = new Set<number>();
      for (let i = -2048; i < 2048; i += 1) {
        row.add(hash32(i, 7, seed));
        column.add(hash32(7, i, seed));
      }
      expect(row.size).toBe(4096);
      expect(column.size).toBe(4096);
    }
  });

  it("spreads neighbouring cells evenly over 16 buckets", () => {
    const buckets = new Array<number>(16).fill(0);
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 128; x += 1) {
        const bucket = hash32(x, y, 2026) % 16;
        buckets[bucket] = (buckets[bucket] as number) + 1;
      }
    }
    // 16384 cells, 1024 expected per bucket; the standard deviation is about 31.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(1024 - 160);
      expect(count).toBeLessThan(1024 + 160);
    }
  });

  it("flips about half of the output bits when x, y or the seed changes by one bit", () => {
    const rng = createRng(21, "avalanche");
    let flipped = 0;
    const trials = 3000;
    for (let i = 0; i < trials; i += 1) {
      const x = rng.int(4096);
      const y = rng.int(4096);
      const seed = rng.next();
      const bit = 1 << rng.int(12);
      const which = i % 3;
      const other = hash32(which === 0 ? x ^ bit : x, which === 1 ? y ^ bit : y, which === 2 ? seed ^ bit : seed);
      flipped += bitCount(hash32(x, y, seed) ^ other);
    }
    const average = flipped / trials;
    expect(average).toBeGreaterThan(15);
    expect(average).toBeLessThan(17);
  });
});
