// The assets of New Hope's building kit: one asset per module of kit.ts, baked alone in the
// four ISO_FACINGS. `defineKitAsset` gives every module the same frame (one cell plus a 2 px
// margin), the same lints and the knobs a module varies; the module itself lives in kit.ts.

import { defineAsset } from "@whz/asset-kit";
import type { AnyAsset, ClipSpec, IndexedBuffer, ParamsSchema } from "@whz/asset-kit";
import { bakeIso, ISO_FACINGS, isoFrame, outlineSlots, VoxelBuilder } from "@whz/voxel-kit";
import { CELL, palette } from "./style.ts";
import { buildCell, checkOffsetInvariance, KIT_FLAT_SLOTS, KIT_RAMPS, kitModel, NEON_FLICKER_MS, SIDES } from "./kit.ts";
import type { CellSpec, FacadeStyle, Side } from "./kit.ts";

/** A module alone: the outline needs 1 px and the fits-frame lint one more. No ground shadow: modules are pieces of a city, not props. */
export const KIT_MARGIN = 2;
export const KIT_FRAME = isoFrame(CELL, KIT_MARGIN);

/** Named sets of exposed sides for the `exposed` param. `corner` and `front` are what the sw camera sees of an outer corner and of a long facade. */
export const EXPOSURES: Readonly<Record<string, readonly Side[]>> = {
  all: SIDES,
  corner: ["+x", "+z"],
  front: ["+z"],
  sides: ["+z", "-z"],
  none: [],
};
const EXPOSURE_NAMES = Object.keys(EXPOSURES);

export const exposedParam = {
  type: "enum",
  values: EXPOSURE_NAMES,
  default: "all",
  description: "Which sides face out: all four, an outer corner (+x +z), one facade (+z), both long sides of a run along x (+z -z), or none.",
} as const;

/** Bakes one cell alone, in one facing. */
export function drawCell(spec: CellSpec, facing: string): IndexedBuffer {
  const b = new VoxelBuilder(palette, CELL);
  buildCell(b, [0, 0, 0], spec);
  return bakeIso(kitModel(b.grid), { facing, margin: KIT_MARGIN, shadow: false });
}

export interface KitAssetOptions<S extends ParamsSchema> {
  /** The asset's name in the pack: `kit-<name>`. */
  readonly name: string;
  readonly params: S;
  readonly presets?: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>;
  readonly clips?: Readonly<Record<string, ClipSpec>>;
  /** The spec of the cell for a render. */
  spec(params: Readonly<Record<string, string | number | boolean>>, seed: number, clip: string, frame: number): CellSpec;
  /** A lint threshold this module needs, with the reason next to it in the caller. */
  readonly maxColors?: number;
  readonly maxGroups?: number;
}

export function defineKitAsset<S extends ParamsSchema>(options: KitAssetOptions<S>): AnyAsset {
  // The module must not depend on where it sits: checked once when the asset loads.
  checkOffsetInvariance(options.spec(defaultsOf(options.params), 1, Object.keys(options.clips ?? { idle: 0 })[0] as string, 0));
  return defineAsset({
    id: `new-hope/kit-${options.name}`,
    kind: "sprite",
    size: KIT_FRAME.size,
    pivot: KIT_FRAME.pivot,
    palette,
    clips: options.clips ?? { idle: { frames: 1, durations: 1000 } },
    facings: ISO_FACINGS,
    params: options.params,
    presets: (options.presets ?? {}) as never,
    variantSeeds: [1, 2, 3],
    lint: {
      allowedSlots: ["ink", "ink-deep", ...KIT_RAMPS, ...KIT_FLAT_SLOTS],
      outlineSlots: outlineSlots(palette, KIT_RAMPS),
      ...(options.maxColors === undefined ? {} : { maxColors: options.maxColors }),
      ...(options.maxGroups === undefined ? {} : { maxGroups: options.maxGroups }),
    },
    render({ params, seed, clip, frame, facing }) {
      return drawCell(options.spec(params as Readonly<Record<string, string | number | boolean>>, seed, clip, frame), facing);
    },
  });
}

function defaultsOf(params: ParamsSchema): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(params).map(([name, spec]) => [name, spec.default]));
}

/** The exposed sides of an `exposed` param value. */
export const exposure = (name: unknown): readonly Side[] => EXPOSURES[String(name)] ?? SIDES;

/** The flicker of a neon sign as a clip. */
export const FLICKER_CLIP: ClipSpec = { frames: NEON_FLICKER_MS.length, durations: [...NEON_FLICKER_MS] };

/** The asset of one facade style of `solid`: `new-hope/kit-solid-<style>`. Market signs flicker in the `flicker` clip. */
export function defineSolidAsset(style: FacadeStyle, maxColors?: number): AnyAsset {
  const signs = style === "market";
  return defineKitAsset({
    name: `solid-${style}`,
    params: {
      exposed: exposedParam,
      roof: { type: "bool", default: true, description: "The cell above is not this building: draw the roof and the parapet." },
      lit: { type: "int", min: 0, max: 4, default: 2, description: "How many windows of four are lit (which ones: the seed)." },
      storey: { type: "int", min: 0, max: 3, default: 0, description: "Storeys of the building under this cell; market has its shops at 0." },
    },
    presets: {
      dark: { lit: 0 },
      "all-lit": { lit: 4 },
      corner: { exposed: "corner" },
      "mid-storey": { exposed: "corner", roof: false, storey: 1 },
    },
    clips: signs ? { lit: { frames: 1, durations: 1000 }, flicker: FLICKER_CLIP } : { idle: { frames: 1, durations: 1000 } },
    spec: (params, seed, clip, frame) => ({
      kind: "solid",
      style,
      seed,
      exposed: exposure(params.exposed),
      roof: params.roof === true,
      lit: Number(params.lit),
      storey: Number(params.storey),
      frame: clip === "flicker" ? frame : 0,
    }),
    ...(maxColors === undefined ? {} : { maxColors }),
  });
}
