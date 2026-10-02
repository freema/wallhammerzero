// @whz/asset-kit: the library asset programs are written with. See README.md.
// This entry runs unchanged in Node and in the browser; file loading is in @whz/asset-kit/node.

export { ASSET_FORMAT, ASSET_KINDS, defineAsset, isAsset, MAX_CLIP_FRAMES, REVIEW_SEEDS } from "./asset.ts";
export type {
  AnyAsset,
  Asset,
  AssetKind,
  AssetMeta,
  AssetSpec,
  BoolParam,
  ClipMeta,
  ClipSpec,
  EnumParam,
  IntParam,
  ParamChoice,
  ParamSpec,
  ParamsSchema,
  ParamValue,
  ParamValues,
  RenderContext,
  RenderRequest,
} from "./asset.ts";
export { bayer4, IndexedBuffer, MAX_BUFFER_SIZE, TRANSPARENT } from "./buffer.ts";
export type { BlitOptions, Bounds, RemapTable } from "./buffer.ts";
export { compose } from "./compose.ts";
export type { Layer, OutlineStyle } from "./compose.ts";
export { frameRefs, OUTPUT_HASH_TAG, outputHash, renderAll, renderHash } from "./output.ts";
export type { AssetOutput, FrameRef, RenderAllRequest, RenderedFrame } from "./output.ts";
export { MAX_PALETTE_SLOTS, Palette, PALETTE_FORMAT, parsePalette } from "./palette.ts";
export type { Legend, PaletteSlot } from "./palette.ts";
export { padRows, parseStamp, patchRows, shiftRows, StampError, stampRows } from "./stamp.ts";
