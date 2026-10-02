// The hash of a native frame: the identity of a picture, for golden tests and for comparing
// the backends without sending pixels around. Never a hash of PNG bytes.

import { Fnv1a64 } from "@whz/det";

/** The tag at the start of the bytes `pixelHash` hashes. */
export const PIXEL_HASH_TAG = "wz.pixels/1";

/**
 * The hash of RGBA pixels: 16 lowercase hex digits. Hashed (FNV-1a 64): the tag, the width
 * and the height as u16 little-endian, then the bytes, row by row from the top.
 */
export function pixelHash(width: number, height: number, pixels: Uint8Array): string {
  if (pixels.length !== width * height * 4) {
    throw new RangeError(`pixelHash: ${pixels.length} bytes, expected ${width} x ${height} x 4 = ${width * height * 4}`);
  }
  return new Fnv1a64().ascii(PIXEL_HASH_TAG).u16(width).u16(height).bytes(pixels).hex();
}
