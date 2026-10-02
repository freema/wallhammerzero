import { crc32, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import paletteJson from "../../../assets/palettes/example.json" with { type: "json" };
import { IndexedBuffer, parsePalette } from "../src/index.ts";
import { decodePng, encodeIndexedPng, encodeRgbPng } from "../src/node/index.ts";

const palette = parsePalette(paletteJson);

/** The chunks of a PNG file: type, data and whether the stored CRC is right. */
function chunks(bytes: Uint8Array): { type: string; data: Buffer; crcOk: boolean }[] {
  const file = Buffer.from(bytes);
  const found = [];
  for (let offset = 8; offset < file.length; ) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("latin1", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    found.push({ type, data, crcOk: crc32(file.subarray(offset + 4, offset + 8 + length)) === file.readUInt32BE(offset + 8 + length) });
    offset += 12 + length;
  }
  return found;
}

describe("encodeIndexedPng", () => {
  const buffer = new IndexedBuffer(5, 3).fill(1, 0, 3, 2, palette.slot("red.1")).pset(4, 2, palette.ink);
  const png = encodeIndexedPng(buffer, palette.rgba());

  it("writes the signature and the chunks IHDR, PLTE, tRNS, IDAT, IEND, each with a correct CRC", () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const all = chunks(png);
    expect(all.map((chunk) => chunk.type)).toEqual(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
    expect(all.every((chunk) => chunk.crcOk)).toBe(true);
  });

  it("is an 8-bit indexed image: colour type 3, the palette of the asset, slot 0 transparent", () => {
    const [ihdr, plte, trns, idat] = chunks(png).map((chunk) => chunk.data) as [Buffer, Buffer, Buffer, Buffer];
    expect(ihdr.readUInt32BE(0)).toBe(5);
    expect(ihdr.readUInt32BE(4)).toBe(3);
    expect([...ihdr.subarray(8)]).toEqual([8, 3, 0, 0, 0]); // depth, colour type, compression, filter, interlace
    expect(plte.length).toBe(palette.size * 3);
    expect([...plte.subarray(3, 6)]).toEqual([0x3b, 0x2f, 0x4a]); // ink
    expect([...trns]).toEqual([0]);
    // The pixel data is the indices themselves, one filter byte 0 per row.
    const raw = inflateSync(idat);
    expect([...raw]).toEqual([0, 0, 6, 6, 6, 0, 0, 0, 6, 6, 6, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("reads back as exactly the indices that were written", () => {
    const decoded = decodePng(png);
    expect(decoded.type).toBe("indexed");
    expect([decoded.w, decoded.h]).toEqual([5, 3]);
    expect(Buffer.from(decoded.data).equals(Buffer.from(buffer.data))).toBe(true);
    expect(Buffer.from(decoded.palette ?? []).equals(Buffer.from(palette.rgba()))).toBe(true);
  });

  it("gives the same bytes for the same pixels", () => {
    expect(Buffer.from(encodeIndexedPng(buffer.clone(), palette.rgba())).equals(Buffer.from(png))).toBe(true);
  });

  it("refuses an index outside the palette and a palette of the wrong shape", () => {
    const bad = new IndexedBuffer(2, 2).pset(1, 1, 40);
    expect(() => encodeIndexedPng(bad, palette.rgba())).toThrow(/pixel 3 has index 40, but the palette has only 17 slots/);
    expect(() => encodeIndexedPng(buffer, new Uint8Array(5))).toThrow(/1 to 256 slots of 4 bytes/);
    expect(() => encodeIndexedPng({ w: 2, h: 2, data: new Uint8Array(3) }, palette.rgba())).toThrow(/3 bytes of pixels, expected 2 x 2 x 1 = 4/);
  });
});

describe("encodeRgbPng", () => {
  it("round-trips RGB pixels", () => {
    const data = Uint8Array.from({ length: 4 * 3 * 3 }, (_, i) => (i * 37) % 256);
    const png = encodeRgbPng({ w: 4, h: 3, data });
    expect(chunks(png).map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const decoded = decodePng(png);
    expect(decoded.type).toBe("rgb");
    expect(decoded.palette).toBeNull();
    expect([...decoded.data]).toEqual([...data]);
  });
});

describe("decodePng", () => {
  const png = encodeIndexedPng(new IndexedBuffer(3, 3).fill(0, 0, 3, 3, 4), palette.rgba());

  it("rejects a file that is not a PNG, a damaged chunk and a truncated file", () => {
    expect(() => decodePng(new Uint8Array(20))).toThrow(/bad signature/);
    const damaged = png.slice();
    damaged[20] = (damaged[20] as number) ^ 0xff; // inside IHDR
    expect(() => decodePng(damaged)).toThrow(/IHDR chunk has a wrong CRC/);
    expect(() => decodePng(png.subarray(0, png.length - 6))).toThrow(/cut off/);
  });
});
