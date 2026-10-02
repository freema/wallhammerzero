// A sheet: the frames of one baked variant as palette indices, with the atlas that says where
// each frame is. It is plain data and belongs to no backend: the same sheet is drawn by the
// CPU backend and by the WebGL backend, which uploads it once as an integer texture.

import { findVariant } from "./atlas.ts";
import type { Atlas } from "./atlas.ts";
import { decodeIndexedPng } from "./png.ts";

export interface Sheet {
  readonly atlas: Atlas;
  /** The variant seed this sheet was baked with. */
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /** `width * height` palette indices, row by row, the top row first. 0 is transparent. */
  readonly pixels: Uint8Array;
}

/** Palette indices with a size: an `IndexedBuffer` of the asset kit, or a decoded PNG. */
export interface IndexedImage {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

/**
 * A sheet from an atlas and the palette indices of one of its variants (without a seed, the
 * first one). The pixels are not copied. Throws when the image is not the sheet the atlas
 * describes, or uses an index the atlas's palette does not have.
 */
export function createSheet(atlas: Atlas, image: IndexedImage, seed?: number): Sheet {
  const variant = findVariant(atlas, seed);
  const where = `sheet of ${JSON.stringify(atlas.id)} (seed ${variant.seed})`;
  if (image.w !== atlas.sheet.w || image.h !== atlas.sheet.h) {
    throw new Error(`${where}: the image is ${image.w} x ${image.h}, but the atlas describes a ${atlas.sheet.w} x ${atlas.sheet.h} sheet`);
  }
  if (image.data.length !== image.w * image.h) {
    throw new Error(`${where}: ${image.data.length} bytes of pixels, expected ${image.w} x ${image.h} = ${image.w * image.h}`);
  }
  const slots = atlas.palette.colors.length;
  for (let i = 0; i < image.data.length; i += 1) {
    if ((image.data[i] as number) >= slots) {
      throw new Error(`${where}: pixel ${i} has the index ${image.data[i]}, but the palette ${JSON.stringify(atlas.palette.id)} has only ${slots} slots`);
    }
  }
  return Object.freeze({ atlas, seed: variant.seed, width: image.w, height: image.h, pixels: image.data });
}

/**
 * A sheet from an atlas and the bytes of a variant's sheet file (an indexed PNG). Also checks
 * that the file's own palette has the atlas's colours: a file from another bake is an error.
 */
export function sheetFromPng(atlas: Atlas, png: Uint8Array, seed?: number): Sheet {
  const variant = findVariant(atlas, seed);
  const image = decodeIndexedPng(png);
  const colors = atlas.palette.colors;
  const HEX = "0123456789abcdef";
  let same = image.palette.length === colors.length * 4;
  for (let slot = 0; same && slot < colors.length; slot += 1) {
    let color = "#";
    for (let channel = 0; channel < 3; channel += 1) {
      const value = image.palette[slot * 4 + channel] as number;
      color += HEX.charAt(value >> 4) + HEX.charAt(value & 15);
    }
    same = color === colors[slot];
  }
  if (!same) {
    throw new Error(
      `sheet of ${JSON.stringify(atlas.id)} (seed ${variant.seed}): the colours in ${variant.sheet} are not the atlas's palette; the two files are from different bakes`,
    );
  }
  return createSheet(atlas, image, variant.seed);
}
