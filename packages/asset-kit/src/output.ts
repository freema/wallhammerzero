// The whole output of an asset for one (params, seed), and its hash.
//
// The output hash is the identity of what an asset draws: verdicts, golden tests and the
// "did a library change alter this asset" check all compare it. It is computed over the
// palette indices and the layout, never over PNG bytes (zlib output can differ between Node
// versions) and never over RGB (a palette swap is not a new drawing).
//
// What is hashed, in this order (FNV-1a 64 from @whz/det; integers little-endian; a string is
// a u16 length and then its ASCII bytes):
//
//   "wz.asset-output/1"                      the tag, as plain ASCII bytes with no length
//   string  palette id
//   u16 w, u16 h, i32 pivot x, i32 pivot y
//   u16 clip count, then per clip: string name, u8 loop (1 or 0), u16 frame count,
//                                  u32 duration in ms for each frame
//   u16 facing count, then per facing: string name
//   the frames: for each clip, for each facing, for each frame: w * h bytes of palette indices
//
// The id, the kind, the params and the seed are not hashed: two assets, or two seeds, that
// draw the same thing have the same hash.

import { Fnv1a64 } from "@whz/det";
import type { AnyAsset, Asset, AssetMeta, ParamChoice, ParamsSchema, ParamValues } from "./asset.ts";
import type { IndexedBuffer } from "./buffer.ts";

/** The tag at the start of the hashed bytes. A change of the layout changes the tag. */
export const OUTPUT_HASH_TAG = "wz.asset-output/1";

/** Which frame: the clip, the facing and the frame number in the clip. */
export interface FrameRef {
  readonly clip: string;
  readonly facing: string;
  readonly frame: number;
}

/** One rendered frame. */
export interface RenderedFrame extends FrameRef {
  readonly buffer: IndexedBuffer;
}

/** Every frame of an asset for one choice of params and one seed. */
export interface AssetOutput<S extends ParamsSchema = ParamsSchema> {
  readonly meta: AssetMeta;
  readonly params: ParamValues<S>;
  readonly seed: number;
  /** In canonical order: by clip, then by facing, then by frame (see `frameRefs`). */
  readonly frames: readonly RenderedFrame[];
}

/** What to render: a seed, and the params (see `ParamChoice`). */
export interface RenderAllRequest<S extends ParamsSchema = ParamsSchema> extends ParamChoice<S> {
  readonly seed: number;
}

/** Every frame of an asset in canonical order: clips, then facings, then frames. */
export function frameRefs(meta: AssetMeta): FrameRef[] {
  const refs: FrameRef[] = [];
  for (const clip of meta.clips) {
    for (const facing of meta.facings) {
      for (let frame = 0; frame < clip.frames; frame += 1) refs.push({ clip: clip.name, facing, frame });
    }
  }
  return refs;
}

/** Renders every frame of an asset. */
export function renderAll<S extends ParamsSchema>(asset: Asset<S>, request: RenderAllRequest<S>): AssetOutput<S> {
  const params = asset.resolveParams(request);
  const frames = frameRefs(asset.meta).map(
    (ref): RenderedFrame => ({ ...ref, buffer: asset.render({ ...ref, params, seed: request.seed }) }),
  );
  return { meta: asset.meta, params, seed: request.seed, frames };
}

function writeString(hasher: Fnv1a64, text: string): void {
  hasher.u16(text.length).ascii(text);
}

/** The output hash: 16 lowercase hex digits. The layout is described at the top of this file. */
export function outputHash(output: Pick<AssetOutput, "meta" | "frames">): string {
  const { meta, frames } = output;
  const [w, h] = meta.size;
  const hasher = new Fnv1a64().ascii(OUTPUT_HASH_TAG);
  writeString(hasher, meta.paletteId);
  hasher.u16(w).u16(h).i32(meta.pivot[0]).i32(meta.pivot[1]);
  hasher.u16(meta.clips.length);
  for (const clip of meta.clips) {
    writeString(hasher, clip.name);
    hasher.byte(clip.loop ? 1 : 0).u16(clip.frames);
    for (const ms of clip.durations) hasher.u32(ms);
  }
  hasher.u16(meta.facings.length);
  for (const facing of meta.facings) writeString(hasher, facing);

  const refs = frameRefs(meta);
  if (frames.length !== refs.length) {
    throw new Error(`outputHash: asset ${JSON.stringify(meta.id)} has ${refs.length} frames, got ${frames.length}`);
  }
  refs.forEach((ref, i) => {
    const frame = frames[i] as RenderedFrame;
    if (frame.clip !== ref.clip || frame.facing !== ref.facing || frame.frame !== ref.frame) {
      throw new Error(`outputHash: frame ${i} of asset ${JSON.stringify(meta.id)} is out of order`);
    }
    if (frame.buffer.w !== w || frame.buffer.h !== h) {
      throw new Error(`outputHash: frame ${i} of asset ${JSON.stringify(meta.id)} is not ${w} x ${h}`);
    }
    hasher.bytes(frame.buffer.data);
  });
  return hasher.hex();
}

/** Renders every frame for one seed and returns the output hash. */
export function renderHash(asset: AnyAsset, request: RenderAllRequest): string {
  return outputHash(renderAll(asset, request));
}
