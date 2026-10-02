// The bake: an asset program turned into its build outputs, in memory. Per variant seed one
// sheet of palette indices, and one atlas (plain data, written as atlas.json) that says where
// every frame is. No I/O here: `@whz/asset-kit/node` encodes the sheets as indexed PNG and
// writes the files, and the studio can run this part in the browser or in a worker.
//
// The sheet. One row per clip and facing, frames left to right, in canonical order (clips,
// then facings, then frames: `frameRefs`). A clip with more frames than fit the width wraps
// onto the next row. Every frame has `SHEET_PADDING` transparent pixels around it, so a
// sampler that is half a pixel off never reads a neighbour. The layout depends only on the
// meta, so all variants of an asset share it.

import { Fnv1a64 } from "@whz/det";
import type { AnyAsset, AssetKind, AssetMeta, ParamValues } from "./asset.ts";
import { IndexedBuffer, MAX_BUFFER_SIZE } from "./buffer.ts";
import { frameRefs, outputHash, renderAll } from "./output.ts";
import type { AssetOutput } from "./output.ts";
import type { Palette } from "./palette.ts";

/** The `format` value of atlas.json. A change of its shape changes the number. */
export const ATLAS_FORMAT = "wz.atlas/1";
/** Transparent pixels around every frame of a sheet. */
export const SHEET_PADDING = 1;
/** The tag at the start of the bytes `paletteHash` hashes. */
export const PALETTE_HASH_TAG = "wz.palette-colors/1";

/** Where the frames are in a sheet. */
export interface SheetLayout {
  readonly w: number;
  readonly h: number;
  readonly columns: number;
  readonly rows: number;
  readonly padding: number;
  /** The top-left corner of each frame, in canonical frame order. */
  readonly cells: readonly { readonly x: number; readonly y: number }[];
}

/** One frame of the atlas. `index` is its place in canonical order and its number on review sheets. */
export interface AtlasFrame {
  readonly index: number;
  readonly clip: string;
  readonly facing: string;
  /** The frame number inside the clip, from 0. */
  readonly frame: number;
  /** The frame's rectangle in the sheet. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** How long the frame is shown, in milliseconds. */
  readonly duration: number;
  /** The frame's own PNG, inside the variant's `frames` folder. */
  readonly file: string;
}

/** One clip of the atlas. */
export interface AtlasClip {
  readonly name: string;
  readonly frames: number;
  /** One duration per frame, in milliseconds. */
  readonly durations: readonly number[];
  readonly loop: boolean;
  /** Per facing: the `index` of the clip's first frame. The clip's frames follow it. */
  readonly start: Readonly<Record<string, number>>;
}

/** One baked variant: a curated seed with the default params. */
export interface AtlasVariant {
  readonly seed: number;
  /** The sheet, next to atlas.json. */
  readonly sheet: string;
  /** The folder of the per-frame PNGs, next to atlas.json. */
  readonly frames: string;
  /** `outputHash` of the variant: the identity of what was drawn (indices, not PNG bytes). */
  readonly outputHash: string;
}

/** The content of atlas.json. Plain data: a player needs this file and the sheets, nothing else. */
export interface Atlas {
  readonly format: typeof ATLAS_FORMAT;
  readonly id: string;
  readonly kind: AssetKind;
  /** Frame width and height. Every frame has this size. */
  readonly size: readonly [w: number, h: number];
  /** The pixel of a frame that sits on the asset's position. The same for every frame. */
  readonly pivot: readonly [x: number, y: number];
  readonly palette: {
    readonly id: string;
    /** A hash of the slot names and colours: it changes when the palette file is edited. */
    readonly hash: string;
    /** `#rrggbb` per slot. Slot 0 is transparent. */
    readonly colors: readonly string[];
  };
  readonly clips: readonly AtlasClip[];
  readonly facings: readonly string[];
  /** The params the variants were rendered with: the defaults. */
  readonly params: ParamValues;
  /** The names of the asset's presets. They are not baked. */
  readonly presets: readonly string[];
  readonly reviewSeeds: readonly number[];
  /** A hash of the asset's own source files (see `sourceHash` in @whz/asset-kit/node). */
  readonly sourceHash: string;
  readonly sheet: Omit<SheetLayout, "cells">;
  readonly frames: readonly AtlasFrame[];
  readonly variants: readonly AtlasVariant[];
}

/** One variant in memory. */
export interface BakedVariant {
  readonly seed: number;
  readonly output: AssetOutput;
  readonly outputHash: string;
  /** The sheet as palette indices. */
  readonly sheet: IndexedBuffer;
}

/** What `bakeAsset` returns. `variants` are in the order of `atlas.variants`. */
export interface BakedAsset {
  readonly atlas: Atlas;
  readonly variants: readonly BakedVariant[];
}

/** The layout of an asset's sheets. Throws if the frames do not fit a 4096 x 4096 sheet. */
export function layoutSheet(meta: Pick<AssetMeta, "id" | "size" | "clips" | "facings">): SheetLayout {
  const [fw, fh] = meta.size;
  const padding = SHEET_PADDING;
  const longest = Math.max(...meta.clips.map((clip) => clip.frames));
  const fit = Math.floor((MAX_BUFFER_SIZE - padding) / (fw + padding));
  const columns = Math.min(longest, fit);
  const cells: { x: number; y: number }[] = [];
  let rows = 0;
  if (columns > 0) {
    for (const clip of meta.clips) {
      for (let facing = 0; facing < meta.facings.length; facing += 1) {
        for (let frame = 0; frame < clip.frames; frame += 1) {
          const column = frame % columns;
          const row = rows + Math.floor(frame / columns);
          cells.push({ x: padding + column * (fw + padding), y: padding + row * (fh + padding) });
        }
        rows += Math.ceil(clip.frames / columns);
      }
    }
  }
  const w = padding + columns * (fw + padding);
  const h = padding + rows * (fh + padding);
  if (columns === 0 || h > MAX_BUFFER_SIZE) {
    throw new Error(
      `asset ${JSON.stringify(meta.id)}: ${cells.length} frames of ${fw} x ${fh} do not fit one ${MAX_BUFFER_SIZE} x ${MAX_BUFFER_SIZE} sheet; split the asset`,
    );
  }
  return { w, h, columns, rows, padding, cells };
}

/** The frames of an output drawn into one sheet. */
export function buildSheet(output: Pick<AssetOutput, "frames">, layout: SheetLayout): IndexedBuffer {
  if (output.frames.length !== layout.cells.length) {
    throw new Error(`buildSheet: the layout has ${layout.cells.length} cells, got ${output.frames.length} frames`);
  }
  const sheet = new IndexedBuffer(layout.w, layout.h);
  output.frames.forEach((frame, i) => {
    const cell = layout.cells[i] as { x: number; y: number };
    sheet.blit(frame.buffer, cell.x, cell.y);
  });
  return sheet;
}

const HEX = "0123456789abcdef";

/** The colours of a palette as `#rrggbb`, one per slot. */
export function paletteColors(palette: Palette): string[] {
  return palette.slots.map((slot) => `#${slot.rgb.map((value) => HEX.charAt(value >> 4) + HEX.charAt(value & 15)).join("")}`);
}

/**
 * A hash of a palette's slot names and colours: 16 lowercase hex digits. The output hash of
 * an asset covers the palette id only (a recolour is not a new drawing), so this is what
 * tells that the baked PNG files changed colour.
 *
 * Hashed (FNV-1a 64; integers little-endian): the tag, a u16 slot count, then per slot a u16
 * name length, the name and the three colour bytes.
 */
export function paletteHash(palette: Palette): string {
  const hasher = new Fnv1a64().ascii(PALETTE_HASH_TAG).u16(palette.size);
  for (const slot of palette.slots) {
    hasher.u16(slot.name.length).ascii(slot.name).byte(slot.rgb[0]).byte(slot.rgb[1]).byte(slot.rgb[2]);
  }
  return hasher.hex();
}

/** The file name of a variant's sheet, and the folder of its frames. */
export function variantFiles(seed: number): { sheet: string; frames: string } {
  return { sheet: `seed-${seed}.png`, frames: `frames/seed-${seed}` };
}

/** Options of `bakeAsset`. */
export interface BakeOptions {
  /** Written into the atlas as it is. Node hosts pass `sourceHash(...)` of the asset's folder. */
  readonly sourceHash: string;
}

/**
 * Bakes an asset: renders every variant seed with the default params and returns the atlas
 * and the sheets. Pure and deterministic: the same asset gives the same result, byte for byte.
 */
export function bakeAsset(asset: AnyAsset, options: BakeOptions): BakedAsset {
  const { meta } = asset;
  const [w, h] = meta.size;
  const layout = layoutSheet(meta);
  const refs = frameRefs(meta);

  const variants = asset.variantSeeds.map((seed): BakedVariant => {
    const output = renderAll(asset, { seed });
    return { seed, output, outputHash: outputHash(output), sheet: buildSheet(output, layout) };
  });

  const clips: AtlasClip[] = [];
  let next = 0;
  for (const clip of meta.clips) {
    const start: Record<string, number> = {};
    for (const facing of meta.facings) {
      start[facing] = next;
      next += clip.frames;
    }
    clips.push({ name: clip.name, frames: clip.frames, durations: clip.durations, loop: clip.loop, start });
  }

  const durations = new Map(meta.clips.map((clip) => [clip.name, clip.durations]));
  const atlas: Atlas = {
    format: ATLAS_FORMAT,
    id: meta.id,
    kind: meta.kind,
    size: meta.size,
    pivot: meta.pivot,
    palette: { id: asset.palette.id, hash: paletteHash(asset.palette), colors: paletteColors(asset.palette) },
    clips,
    facings: meta.facings,
    params: asset.resolveParams(),
    presets: Object.keys(asset.presets),
    reviewSeeds: asset.reviewSeeds,
    sourceHash: options.sourceHash,
    sheet: { w: layout.w, h: layout.h, columns: layout.columns, rows: layout.rows, padding: layout.padding },
    frames: refs.map((ref, index): AtlasFrame => {
      const cell = layout.cells[index] as { x: number; y: number };
      return {
        index,
        clip: ref.clip,
        facing: ref.facing,
        frame: ref.frame,
        x: cell.x,
        y: cell.y,
        w,
        h,
        duration: (durations.get(ref.clip) as readonly number[])[ref.frame] as number,
        file: `${ref.clip}.${ref.facing}.${ref.frame}.png`,
      };
    }),
    variants: variants.map((variant): AtlasVariant => ({ seed: variant.seed, ...variantFiles(variant.seed), outputHash: variant.outputHash })),
  };
  return { atlas, variants };
}
