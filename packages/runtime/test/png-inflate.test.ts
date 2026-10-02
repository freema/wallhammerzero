// The runtime's own inflate and indexed-PNG reader, checked against Node's zlib and the asset
// kit's PNG writer.

import { constants, crc32 as zlibCrc32, deflateSync } from "node:zlib";
import { encodeIndexedPng, encodeRgbPng } from "@whz/asset-kit/node";
import { createRng } from "@whz/det";
import { describe, expect, it } from "vitest";
import { adler32, crc32, decodeIndexedPng, inflateZlib } from "../src/index.ts";

/** Test data of several kinds: empty, tiny, runs, a repeating pattern, noise, and sprite-like indices. */
function samples(): [string, Uint8Array][] {
  const rng = createRng(11, "inflate-test");
  const noise = new Uint8Array(70_000);
  for (let i = 0; i < noise.length; i += 1) noise[i] = rng.int(256);
  const indices = new Uint8Array(40_000);
  for (let i = 0; i < indices.length; i += 1) indices[i] = rng.chance(9, 10) ? ((i >> 6) % 5) : rng.int(17);
  const pattern = new Uint8Array(100_000);
  for (let i = 0; i < pattern.length; i += 1) pattern[i] = (i * 7) % 251;
  return [
    ["empty", new Uint8Array(0)],
    ["one byte", Uint8Array.of(42)],
    ["a long run", new Uint8Array(300_000).fill(3)],
    ["a pattern", pattern],
    ["noise", noise],
    ["sprite-like indices", indices],
  ];
}

const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

describe("inflateZlib", () => {
  const settings: [string, Parameters<typeof deflateSync>[1]][] = [
    ["stored blocks (level 0)", { level: 0 }],
    ["level 1", { level: 1 }],
    ["level 9 (what the bake writes)", { level: 9 }],
    ["fixed Huffman codes only", { level: 9, strategy: constants.Z_FIXED }],
    ["Huffman only, no matches", { strategy: constants.Z_HUFFMAN_ONLY }],
    ["run-length matches", { strategy: constants.Z_RLE }],
    ["a small window", { level: 9, windowBits: 9 }],
  ];
  for (const [setting, options] of settings) {
    it(`gives back what zlib compressed: ${setting}`, () => {
      for (const [name, data] of samples()) {
        expect(same(inflateZlib(deflateSync(data, options), data.length), data), name).toBe(true);
      }
    });
  }

  it("refuses a stream that is cut off, at any length", () => {
    const data = samples()[5]?.[1] as Uint8Array;
    const stream = deflateSync(data, { level: 9 });
    for (const length of [0, 1, 5, 6, 20, stream.length >> 1, stream.length - 5, stream.length - 1]) {
      expect(() => inflateZlib(stream.subarray(0, length), data.length), `${length} of ${stream.length} bytes`).toThrow(/^inflate: /);
    }
  });

  it("refuses a wrong checksum, a wrong size and a wrong header", () => {
    const data = Uint8Array.from({ length: 2000 }, (_, i) => (i * i) % 17);
    const stream = deflateSync(data, { level: 9 });
    const badSum = Uint8Array.from(stream);
    badSum[badSum.length - 1] = (badSum[badSum.length - 1] as number) ^ 1;
    expect(() => inflateZlib(badSum, data.length)).toThrow(/checksum \(Adler-32\) does not match/);
    expect(() => inflateZlib(stream, data.length - 1)).toThrow(/more than the expected 1999 bytes/);
    expect(() => inflateZlib(stream, data.length + 1)).toThrow(/holds 2000 bytes, expected 2001/);
    const badHeader = Uint8Array.from(stream);
    badHeader[0] = 0x79;
    expect(() => inflateZlib(badHeader, data.length)).toThrow(/not a zlib stream|header check failed/);
  });

  it("refuses damaged data instead of returning something", () => {
    const data = samples()[5]?.[1] as Uint8Array;
    const stream = deflateSync(data, { level: 9 });
    const rng = createRng(3, "inflate-damage");
    for (let round = 0; round < 200; round += 1) {
      const damaged = Uint8Array.from(stream);
      const at = 2 + rng.int(damaged.length - 6);
      damaged[at] = (damaged[at] as number) ^ (1 << rng.int(8));
      // Every single-bit error is caught: by the decoder, or at the latest by the checksum.
      expect(() => inflateZlib(damaged, data.length), `bit flipped in byte ${at}`).toThrow(/^inflate: /);
    }
  });
});

describe("adler32 and crc32", () => {
  it("match the published check values", () => {
    const text = new TextEncoder().encode("123456789");
    expect(crc32(text)).toBe(0xcbf43926);
    expect(adler32(new TextEncoder().encode("Wikipedia"))).toBe(0x11e60398);
    expect(adler32(new Uint8Array(0))).toBe(1);
  });

  it("crc32 agrees with zlib on long data and on a part of a buffer", () => {
    const [, noise] = samples()[4] as [string, Uint8Array];
    expect(crc32(noise)).toBe(zlibCrc32(noise));
    expect(crc32(noise, 100, 5000)).toBe(zlibCrc32(noise.subarray(100, 5000)));
  });
});

// A PNG writer for the tests that can do what the bake's writer does not: scanline filters and
// several IDAT chunks. Colour type 3, 8 bits.
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  out.set(data, 8);
  out.writeUInt32BE(zlibCrc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function filteredPng(w: number, h: number, data: Uint8Array, filterOf: (y: number) => number, idatParts = 1, slots = 17): Uint8Array {
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const filter = filterOf(y);
    raw[y * (w + 1)] = filter;
    for (let x = 0; x < w; x += 1) {
      const value = data[y * w + x] as number;
      const left = x > 0 ? (data[y * w + x - 1] as number) : 0;
      const up = y > 0 ? (data[(y - 1) * w + x] as number) : 0;
      const upLeft = x > 0 && y > 0 ? (data[(y - 1) * w + x - 1] as number) : 0;
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] as number;
      raw[y * (w + 1) + 1 + x] = (value - predicted) & 0xff;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 3;
  const plte = new Uint8Array(slots * 3);
  for (let i = 0; i < plte.length; i += 1) plte[i] = (i * 37) & 0xff;
  const compressed = deflateSync(raw, { level: 9 });
  const idat: Buffer[] = [];
  const step = Math.ceil(compressed.length / idatParts);
  for (let at = 0; at < compressed.length; at += step) idat.push(chunk("IDAT", compressed.subarray(at, at + step)));
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("PLTE", plte),
      chunk("tRNS", Uint8Array.of(0)),
      ...idat,
      chunk("IEND", new Uint8Array(0)),
    ]),
  );
}

function spriteLike(w: number, h: number): Uint8Array {
  const rng = createRng(w * 1000 + h, "png-test");
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i += 1) data[i] = rng.chance(3, 4) ? ((i % w) >> 3) % 17 : rng.int(17);
  return data;
}

describe("decodeIndexedPng", () => {
  it("reads what the bake's PNG writer writes: indices and the palette", () => {
    const data = spriteLike(53, 31);
    const rgba = new Uint8Array(17 * 4);
    for (let slot = 1; slot < 17; slot += 1) rgba.set([slot * 13, 255 - slot * 9, slot * 5, 255], slot * 4);
    const png = decodeIndexedPng(encodeIndexedPng({ w: 53, h: 31, data }, rgba));
    expect([png.w, png.h]).toEqual([53, 31]);
    expect(same(png.data, data)).toBe(true);
    expect(same(png.palette, rgba)).toBe(true);
  });

  it("reads every scanline filter, alone and mixed", () => {
    const data = spriteLike(40, 25);
    for (const filter of [0, 1, 2, 3, 4]) {
      expect(same(decodeIndexedPng(filteredPng(40, 25, data, () => filter)).data, data), `filter ${filter}`).toBe(true);
    }
    expect(same(decodeIndexedPng(filteredPng(40, 25, data, (y) => y % 5)).data, data), "mixed").toBe(true);
    expect(same(decodeIndexedPng(filteredPng(40, 25, data, (y) => (y * 3 + 4) % 5)).data, data), "mixed, starting with Paeth").toBe(true);
  });

  it("reads pixel data split over several IDAT chunks", () => {
    const data = spriteLike(64, 64);
    expect(same(decodeIndexedPng(filteredPng(64, 64, data, () => 0, 7)).data, data)).toBe(true);
  });

  it("refuses other kinds of PNG, naming what it reads", () => {
    const rgb = encodeRgbPng({ w: 2, h: 2, data: new Uint8Array(12) });
    expect(() => decodeIndexedPng(rgb)).toThrow(/only 8-bit indexed PNG, not interlaced, is read \(this file: bit depth 8, colour type 2/);
    expect(() => decodeIndexedPng(new TextEncoder().encode("not a png at all"))).toThrow(/not a PNG file/);
  });

  it("refuses a damaged or cut-off file", () => {
    const data = spriteLike(40, 25);
    const png = filteredPng(40, 25, data, () => 0);
    for (const length of [8, 20, 60, png.length - 13, png.length - 1]) {
      expect(() => decodeIndexedPng(png.subarray(0, length)), `${length} of ${png.length} bytes`).toThrow(/^decodeIndexedPng: /);
    }
    const flipped = Uint8Array.from(png);
    flipped[png.length - 30] = (flipped[png.length - 30] as number) ^ 0x10;
    expect(() => decodeIndexedPng(flipped)).toThrow(/has a wrong CRC/);
  });

  it("refuses a filter type that does not exist and an index the file's palette does not have", () => {
    const data = spriteLike(8, 4);
    expect(() => decodeIndexedPng(filteredPng(8, 4, data, () => 5))).toThrow(/scanline 0 has the filter type 5/);
    expect(() => decodeIndexedPng(filteredPng(8, 4, new Uint8Array(32).fill(9), () => 0, 1, 9))).toThrow(/index 9, but the file's palette has only 9 colours/);
  });
});
