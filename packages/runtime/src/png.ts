// Reads an indexed PNG (colour type 3, 8 bits per pixel): the format of baked sheets and
// frames (docs/asset-pipeline.md). The result is the palette indices themselves, which is
// what the runtime draws with; a browser's image decoder would give colours instead.
//
// It reads what `bake` writes and the same format from other encoders: any scanline filter,
// several IDAT chunks. It checks the signature, the CRC of every chunk and the checksum of the
// pixel data, so a file that is cut off or half written is an error and never a wrong picture.
// Other PNG kinds (RGB, 16 bits, interlaced) are refused: sheets are never those.

import { inflateZlib } from "./inflate.ts";

/** A decoded indexed PNG. */
export interface IndexedPng {
  readonly w: number;
  readonly h: number;
  /** One palette index per pixel, row by row, the top row first. */
  readonly data: Uint8Array;
  /** The file's own palette: four bytes per slot (RGBA; the alpha comes from `tRNS`, 255 without it). */
  readonly palette: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_SIZE = 16384;

function fail(message: string): never {
  throw new Error(`decodeIndexedPng: ${message}`);
}

let crcTable: Uint32Array | null = null;

/** CRC-32 (the PNG and zlib polynomial) of a part of `data`, as an unsigned 32-bit integer. */
export function crc32(data: Uint8Array, start = 0, end = data.length): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = start; i < end; i += 1) crc = (crcTable[(crc ^ (data[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(data: Uint8Array, at: number): number {
  return (((data[at] as number) << 24) | ((data[at + 1] as number) << 16) | ((data[at + 2] as number) << 8) | (data[at + 3] as number)) >>> 0;
}

/** Undoes the scanline filters (PNG specification §9) of an image with one byte per pixel. */
function unfilter(raw: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (w + 1)] as number;
    const from = y * (w + 1) + 1;
    const to = y * w;
    for (let x = 0; x < w; x += 1) {
      const left = x > 0 ? (out[to + x - 1] as number) : 0;
      const up = y > 0 ? (out[to - w + x] as number) : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const upLeft = x > 0 && y > 0 ? (out[to - w + x - 1] as number) : 0;
        const estimate = left + up - upLeft;
        const dLeft = Math.abs(estimate - left);
        const dUp = Math.abs(estimate - up);
        const dUpLeft = Math.abs(estimate - upLeft);
        predicted = dLeft <= dUp && dLeft <= dUpLeft ? left : dUp <= dUpLeft ? up : upLeft;
      } else if (filter !== 0) fail(`scanline ${y} has the filter type ${filter}, which does not exist`);
      out[to + x] = ((raw[from + x] as number) + predicted) & 0xff;
    }
  }
  return out;
}

/** Decodes an 8-bit indexed PNG. Throws on any other kind of file and on a damaged one. */
export function decodeIndexedPng(bytes: Uint8Array): IndexedPng {
  if (bytes.length < 8 || SIGNATURE.some((byte, i) => bytes[i] !== byte)) fail("not a PNG file (bad signature)");
  let w = 0;
  let h = 0;
  let header = false;
  let plte: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  let ended = false;
  let offset = 8;
  while (offset < bytes.length && !ended) {
    if (offset + 12 > bytes.length) fail("the file is cut off inside a chunk");
    const length = u32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4] as number, bytes[offset + 5] as number, bytes[offset + 6] as number, bytes[offset + 7] as number);
    if (offset + 12 + length > bytes.length) fail(`the ${type} chunk is cut off`);
    if (crc32(bytes, offset + 4, offset + 8 + length) !== u32(bytes, offset + 8 + length)) fail(`the ${type} chunk has a wrong CRC`);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      if (length !== 13) fail("the IHDR chunk has the wrong length");
      w = u32(data, 0);
      h = u32(data, 4);
      if (data[8] !== 8 || data[9] !== 3 || data[12] !== 0) {
        fail(`only 8-bit indexed PNG, not interlaced, is read (this file: bit depth ${data[8]}, colour type ${data[9]}, interlace ${data[12]}); baked sheets are that`);
      }
      if (w < 1 || h < 1 || w > MAX_SIZE || h > MAX_SIZE) fail(`the size ${w} x ${h} is outside [1, ${MAX_SIZE}]`);
      header = true;
    } else if (!header) fail(`the first chunk must be IHDR, got ${type}`);
    else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") ended = true;
    offset += 12 + length;
  }
  if (!header || !ended) fail("the file has no IHDR or no IEND chunk (cut off?)");
  if (plte === null || plte.length % 3 !== 0 || plte.length === 0 || plte.length > 768) fail("an indexed PNG needs a PLTE chunk of 1 to 256 colours");

  let compressed = idat[0] ?? new Uint8Array(0);
  if (idat.length > 1) {
    compressed = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of idat) {
      compressed.set(part, at);
      at += part.length;
    }
  }
  let raw: Uint8Array;
  try {
    raw = inflateZlib(compressed, (w + 1) * h);
  } catch (error) {
    return fail(`the pixel data cannot be read: ${(error as Error).message}`);
  }
  const data = unfilter(raw, w, h);

  const slots = plte.length / 3;
  const palette = new Uint8Array(slots * 4);
  for (let slot = 0; slot < slots; slot += 1) {
    palette[slot * 4] = plte[slot * 3] as number;
    palette[slot * 4 + 1] = plte[slot * 3 + 1] as number;
    palette[slot * 4 + 2] = plte[slot * 3 + 2] as number;
    palette[slot * 4 + 3] = trns !== null && slot < trns.length ? (trns[slot] as number) : 255;
  }
  for (let i = 0; i < data.length; i += 1) {
    if ((data[i] as number) >= slots) fail(`pixel ${i} has the index ${data[i]}, but the file's palette has only ${slots} colours`);
  }
  return { w, h, data, palette };
}
