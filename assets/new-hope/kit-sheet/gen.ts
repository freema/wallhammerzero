// New Hope building kit: the kit sheet. A small tower composed from the kit's modules into one
// voxel grid and baked once, to judge that modules stack without seams: the undercity
// (ancient foundations and ruins), the street, a building of two styles (market shops and
// flats, then two Union storeys) with no facade between its cells, a lift shaft, stairs up
// to a deck, a walkway out and a landing pad on the roof. The layout is written as text, one
// block per level from the bottom; `composeCells` derives which sides are exposed, which
// cells carry a roof and the storey of each building cell, as the city mockup will.

import { defineAsset } from "@whz/asset-kit";
import { bakeIso, ISO_FACINGS, isoFrame, outlineSlots, VoxelBuilder } from "@whz/voxel-kit";
import { checkOffsetInvariance, composeCells, KIT_FLAT_SLOTS, KIT_RAMPS, kitModel, MODULES, NEON_FLICKER_MS, SIDES, FACADE_STYLES } from "../../new-hope-lib/kit.ts";
import type { CellSpec, Layout, LayoutCell } from "../../new-hope-lib/kit.ts";
import { palette, STOREY, TILE } from "../../new-hope-lib/style.ts";

// Rows are z = 0.. (back to front in the sw view), columns x = 0.. (left to right of a row).
const LEVELS = [
  // 0: the undercity under the street: the Ancestors' foundations of the building, ruins.
  ["AA.R.", "AARR.", "R.R.R"],
  // 1: the street band: market shops, the lift (doors to +x), stairs up toward -z.
  ["MMLSS", "MMSTS", "SSSSS"],
  // 2: flats over the shops; the stairs arrive on a deck beside the lift.
  ["MMLD.", "MM...", "....."],
  // 3: the first Union storey; a walkway leaves the lift toward +x.
  ["UULWW", "UU...", "....."],
  // 4: the second Union storey, with the roof.
  ["UU...", "UU...", "....."],
  // 5: a landing pad on the roof.
  ["PP...", "PP...", "....."],
] as const;

const LEGEND: Readonly<Record<string, LayoutCell>> = {
  ".": { kind: "empty" },
  S: { kind: "street", dir: "+x" },
  M: { kind: "solid", building: 1, style: "market" },
  U: { kind: "solid", building: 1, style: "union" },
  A: { kind: "solid", building: 2, style: "ancient" },
  R: { kind: "ruin" },
  L: { kind: "lift", dir: "+x" },
  T: { kind: "stairs", dir: "-z" },
  D: { kind: "deck" },
  W: { kind: "walkway" },
  P: { kind: "pad" },
};

const CX = LEVELS[0][0].length;
const CZ = LEVELS[0].length;
const SIZE = [CX * TILE, LEVELS.length * STOREY, CZ * TILE] as const;
const MARGIN = 2;
const FRAME = isoFrame(SIZE, MARGIN);

function layout(seed: number, lit: number, frame: number): Layout {
  return {
    size: [CX, LEVELS.length, CZ],
    seed,
    lit,
    frame,
    cell(cx, level, cz) {
      const ch = (LEVELS[level] as readonly string[])[cz]?.[cx] ?? ".";
      const cell = LEGEND[ch];
      if (cell === undefined) throw new Error(`kit-sheet: no legend entry for ${JSON.stringify(ch)}`);
      return cell;
    },
  };
}

// The proof that a module does not depend on where it sits, over every module, style, side
// and exposure the sheet uses (the kit's assets check their default spec too).
for (const kind of MODULES) {
  for (const dir of SIDES) {
    for (const exposed of [SIDES, ["+x", "+z"] as const, [] as const]) {
      const specs: CellSpec[] = kind === "solid" ? FACADE_STYLES.map((style) => ({ kind, style, seed: 7, dir, exposed, storey: 0, frame: 1 })) : [{ kind, seed: 7, dir, exposed, open: true, frame: 1 }];
      for (const spec of specs) checkOffsetInvariance(spec);
    }
  }
}

export default defineAsset({
  id: "new-hope/kit-sheet",
  kind: "sprite",
  size: FRAME.size,
  pivot: FRAME.pivot,
  palette,
  clips: { lit: { frames: 1, durations: 1000 }, flicker: { frames: NEON_FLICKER_MS.length, durations: [...NEON_FLICKER_MS] } },
  facings: ISO_FACINGS,
  params: {
    lit: { type: "int", min: 0, max: 4, default: 2, description: "How many windows of four are lit." },
  },
  presets: { dark: { lit: 0 }, "all-lit": { lit: 4 } },
  variantSeeds: [1, 2, 3],
  lint: {
    allowedSlots: ["ink", "ink-deep", ...KIT_RAMPS, ...KIT_FLAT_SLOTS],
    outlineSlots: outlineSlots(palette, KIT_RAMPS),
    // A composed tower uses most of the kit's ramps and lights at once.
    maxColors: 48,
  },
  render({ params, seed, clip, frame, facing }) {
    const b = new VoxelBuilder(palette, SIZE);
    composeCells(b, layout(seed, params.lit, clip === "flicker" ? frame : 0));
    return bakeIso(kitModel(b.grid), { facing, margin: MARGIN, shadow: false });
  },
});
