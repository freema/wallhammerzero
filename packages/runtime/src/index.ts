// @whz/runtime: the renderer games and the studio share. See README.md.
//
// This entry is the backend-neutral part and the CPU reference backend. It uses no DOM and no
// Node API, so it runs unchanged in the browser, in a worker and in Node. The WebGL2 backend
// is `@whz/runtime/webgl`; reading baked files from disk is `@whz/runtime/node`.

export { ATLAS_FORMAT, findClip, findVariant, frameIndex, MAX_SHEET_SIZE, parseAtlas } from "./atlas.ts";
export type { Atlas, AtlasClip, AtlasFrame, AtlasVariant } from "./atlas.ts";
export { checkDraw, checkTargetSize, MAX_TARGET_SIZE } from "./backend.ts";
export type { Backend, DrawOptions, Rgba, Target } from "./backend.ts";
export { clipDuration, clipFrame, frameStart, sampleClip } from "./clip.ts";
export type { ClipSample, ClipTiming } from "./clip.ts";
export { createCpuBackend } from "./cpu.ts";
export type { CpuBackend } from "./cpu.ts";
export { DrawList, spriteRect } from "./draw-list.ts";
export type { DrawItem, SpriteItem, SpriteRect, SpriteSpec } from "./draw-list.ts";
export { PIXEL_HASH_TAG, pixelHash } from "./hash.ts";
export { adler32, inflateZlib } from "./inflate.ts";
export { PALETTE_SLOTS, PaletteTable } from "./palette.ts";
export { fitScale, nativePixel, placeTarget } from "./place.ts";
export type { Placement, Rect } from "./place.ts";
export { crc32, decodeIndexedPng } from "./png.ts";
export type { IndexedPng } from "./png.ts";
export { createSheet, sheetFromPng } from "./sheet.ts";
export type { IndexedImage, Sheet } from "./sheet.ts";
