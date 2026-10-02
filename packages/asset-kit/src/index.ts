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
export { ATLAS_FORMAT, bakeAsset, buildSheet, layoutSheet, PALETTE_HASH_TAG, paletteColors, paletteHash, SHEET_PADDING, variantFiles } from "./bake.ts";
export type { Atlas, AtlasClip, AtlasFrame, AtlasVariant, BakedAsset, BakedVariant, BakeOptions, SheetLayout } from "./bake.ts";
export { bayer4, IndexedBuffer, MAX_BUFFER_SIZE, TRANSPARENT } from "./buffer.ts";
export type { BlitOptions, Bounds, RemapTable } from "./buffer.ts";
export { compose } from "./compose.ts";
export type { Layer, OutlineStyle } from "./compose.ts";
export { formatJson } from "./json.ts";
export { changedPixels, LINT_FORMAT, lintAsset, lintFrames, lintSubjects, lintTiming } from "./lint.ts";
export type { ClipStats, FrameLint, FrameStats, LintFinding, LintFramesInput, LintMeta, LintOptions, LintReport, LintSubject } from "./lint.ts";
export { BBOX_CHANGE_FLOOR_PX, clipLint, LINT_RULES, LINT_RULES_ALWAYS_ON, resolveLintConfig } from "./lint-config.ts";
export type { ClipLintConfig, LintConfig, LintRule, LintTarget, ResolvedClipLint, ResolvedLintConfig } from "./lint-config.ts";
export { frameRefs, OUTPUT_HASH_TAG, outputHash, renderAll, renderHash } from "./output.ts";
export type { AssetOutput, FrameRef, RenderAllRequest, RenderedFrame } from "./output.ts";
export { MAX_PALETTE_SLOTS, Palette, PALETTE_FORMAT, parsePalette } from "./palette.ts";
export type { Legend, PaletteSlot } from "./palette.ts";
export { DEFAULT_REVIEW_ZOOM, MAX_REVIEW_EDGE, renderContext, renderSheet, reviewAsset, reviewPack, RgbCanvas, SILHOUETTE_ZOOM } from "./review.ts";
export type {
  ContextSpec,
  PackEntry,
  PackReview,
  PlacedCell,
  RenderedContext,
  RenderedSheet,
  ReviewImage,
  ReviewOptions,
  RgbImage,
  SheetCell,
  SheetSection,
  SheetSpec,
} from "./review.ts";
export { padRows, parseStamp, patchRows, shiftRows, StampError, stampRows } from "./stamp.ts";
