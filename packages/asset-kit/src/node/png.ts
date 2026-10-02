// A small PNG writer and reader on Node's zlib: chunks, CRC and two pixel formats.
//
// - Indexed (colour type 3, 8 bits): baked sheets and frames. The file holds the palette
//   indices themselves (`PLTE` + `tRNS` for the transparent slot 0), so reading it back gives
//   exactly what the asset program drew, and palette compliance can be checked from the file.
// - RGB (colour type 2, 8 bits): review images.
//
// Scanlines are written unfiltered (filter 0): pixel art compresses well as it is. The reader
// reads what the writer writes (and the same formats from other encoders, if unfiltered); it
// is for tests and for checking outputs, not a general PNG decoder.
//
// The compressed bytes can differ between zlib versions. The identity of a bake is therefore
// the output hash over the indices (src/output.ts), never a hash of PNG bytes.

import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const COLOR_RGB = 2;
const COLOR_INDEXED = 3;
/** The largest width or height the writer accepts. */
const MAX_SIZE = 16384;

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "latin1");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function header(w: number, h: number, colorType: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(w, 0);
  data.writeUInt32BE(h, 4);
  data[8] = 8; // bit depth
  data[9] = colorType;
  // compression 0, filter method 0, no interlace
  return chunk("IHDR", data);
}

function checkSize(fn: string, w: number, h: number, length: number, bytesPerPixel: number): void {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_SIZE || h > MAX_SIZE) {
    throw new RangeError(`${fn}: the size must be integers in [1, ${MAX_SIZE}], got ${String(w)} x ${String(h)}`);
  }
  if (length !== w * h * bytesPerPixel) {
    throw new RangeError(`${fn}: ${length} bytes of pixels, expected ${w} x ${h} x ${bytesPerPixel} = ${w * h * bytesPerPixel}`);
  }
}

/** Scanlines with a filter byte 0 in front of each, compressed. */
function pixels(data: Uint8Array, h: number, stride: number): Buffer {
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return chunk("IDAT", deflateSync(raw, { level: 9 }));
}

/** An image of palette indices: `w * h` bytes, row by row. An `IndexedBuffer` is one. */
export interface IndexedImage {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

/**
 * Encodes palette indices as an indexed PNG.
 * @param rgba four bytes per palette slot (`palette.rgba()`); a slot with alpha below 255 is written to `tRNS`
 */
export function encodeIndexedPng(image: IndexedImage, rgba: Uint8Array): Uint8Array {
  checkSize("encodeIndexedPng", image.w, image.h, image.data.length, 1);
  const slots = rgba.length / 4;
  if (!Number.isInteger(slots) || slots < 1 || slots > 256) {
    throw new RangeError(`encodeIndexedPng: the palette must have 1 to 256 slots of 4 bytes, got ${rgba.length} bytes`);
  }
  const plte = new Uint8Array(slots * 3);
  let translucent = 0;
  for (let slot = 0; slot < slots; slot += 1) {
    plte.set(rgba.subarray(slot * 4, slot * 4 + 3), slot * 3);
    if (rgba[slot * 4 + 3] !== 255) translucent = slot + 1;
  }
  for (let i = 0; i < image.data.length; i += 1) {
    if ((image.data[i] as number) >= slots) {
      throw new RangeError(`encodeIndexedPng: pixel ${i} has index ${image.data[i]}, but the palette has only ${slots} slots`);
    }
  }
  const parts = [SIGNATURE, header(image.w, image.h, COLOR_INDEXED), chunk("PLTE", plte)];
  if (translucent > 0) parts.push(chunk("tRNS", Uint8Array.from({ length: translucent }, (_, slot) => rgba[slot * 4 + 3] as number)));
  parts.push(pixels(image.data, image.h, image.w), chunk("IEND", new Uint8Array(0)));
  return new Uint8Array(Buffer.concat(parts));
}

/** Encodes RGB pixels (three bytes each, row by row) as a truecolour PNG. */
export function encodeRgbPng(image: IndexedImage): Uint8Array {
  checkSize("encodeRgbPng", image.w, image.h, image.data.length, 3);
  return new Uint8Array(
    Buffer.concat([SIGNATURE, header(image.w, image.h, COLOR_RGB), pixels(image.data, image.h, image.w * 3), chunk("IEND", new Uint8Array(0))]),
  );
}

/** A decoded PNG. */
export interface DecodedPng {
  readonly w: number;
  readonly h: number;
  /** `indexed`: `data` holds one palette index per pixel. `rgb`: three bytes per pixel. */
  readonly type: "indexed" | "rgb";
  readonly data: Uint8Array;
  /** For an indexed image: four bytes per palette slot, alpha from `tRNS`. */
  readonly palette: Uint8Array | null;
}

/**
 * Decodes a PNG written by this module: 8-bit indexed or RGB, not interlaced, unfiltered
 * scanlines. Checks the signature and the CRC of every chunk, and throws on anything else.
 */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const file = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (file.length < 8 || !file.subarray(0, 8).equals(SIGNATURE)) throw new Error("decodePng: not a PNG file (bad signature)");
  let w = 0;
  let h = 0;
  let colorType = -1;
  let plte: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  let ended = false;
  let offset = 8;
  while (offset < file.length) {
    if (offset + 12 > file.length) throw new Error("decodePng: the file is cut off inside a chunk");
    const length = file.readUInt32BE(offset);
    const type = file.toString("latin1", offset + 4, offset + 8);
    if (offset + 12 + length > file.length) throw new Error(`decodePng: the ${type} chunk is cut off`);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (crc32(file.subarray(offset + 4, offset + 8 + length)) !== file.readUInt32BE(offset + 8 + length)) {
      throw new Error(`decodePng: the ${type} chunk has a wrong CRC`);
    }
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9] as number;
      if (data[8] !== 8 || (colorType !== COLOR_RGB && colorType !== COLOR_INDEXED) || data[12] !== 0) {
        throw new Error(`decodePng: only 8-bit indexed or RGB, not interlaced (bit depth ${data[8]}, colour type ${colorType}, interlace ${data[12]})`);
      }
    } else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") ended = true;
    offset += 12 + length;
  }
  if (colorType < 0 || !ended) throw new Error("decodePng: the file has no IHDR or no IEND chunk");

  const stride = colorType === COLOR_RGB ? w * 3 : w;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * h) throw new Error(`decodePng: ${raw.length} bytes of pixels, expected ${(stride + 1) * h}`);
  const data = new Uint8Array(stride * h);
  for (let y = 0; y < h; y += 1) {
    const start = y * (stride + 1);
    if (raw[start] !== 0) throw new Error(`decodePng: scanline ${y} uses filter ${raw[start]}; only unfiltered files are read`);
    data.set(raw.subarray(start + 1, start + 1 + stride), y * stride);
  }
  if (colorType === COLOR_RGB) return { w, h, type: "rgb", data, palette: null };

  if (plte === null || plte.length % 3 !== 0) throw new Error("decodePng: an indexed PNG needs a PLTE chunk");
  const slots = plte.length / 3;
  const palette = new Uint8Array(slots * 4);
  for (let slot = 0; slot < slots; slot += 1) {
    palette.set(plte.subarray(slot * 3, slot * 3 + 3), slot * 4);
    palette[slot * 4 + 3] = trns !== null && slot < trns.length ? (trns[slot] as number) : 255;
  }
  for (let i = 0; i < data.length; i += 1) {
    if ((data[i] as number) >= slots) throw new Error(`decodePng: pixel ${i} has index ${data[i]}, but PLTE has only ${slots} entries`);
  }
  return { w, h, type: "indexed", data, palette };
}
