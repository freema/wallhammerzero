// The chibi of the art spike as a voxel model (variant C): a 4 x 4 x 8 staff member in the
// 16 x 24 px frame of variant B, baked to 2:1 isometric pixel art in four facings, with an
// idle (2 f) and a walk (4 f) made of part offsets and one small arm swing. The look (skin,
// hair, cloth) comes from the same seed rule as the 2D packs (`lookFromSeed`), so seed 1 is
// the same person in A, B and C. The face is stamped after the bake: a voxel is too coarse
// for an eye.

import { defineAsset } from "@whz/asset-kit";
import type { AnyAsset, IndexedBuffer } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import { bakeIso, CARVE, defineModel, degrees, ISO_FACINGS, isoFrame, isoPoint, outlineSlots, VoxelBuilder } from "@whz/voxel-kit";
import type { VoxelModel } from "@whz/voxel-kit";
import { lookFromSeed } from "./chibi.ts";
import type { Look } from "./chibi.ts";
import { palette } from "./style.ts";

export const CHIBI_SIZE = [4, 8, 4] as const;
/** The outline and one empty pixel; the chibi's shadow stays inside the tile. */
export const CHIBI_MARGIN = 2;
export const CHIBI_FRAME = isoFrame(CHIBI_SIZE, CHIBI_MARGIN);
/** The hair colours a voxel model can take: black hair is ink, which no ramp shades. */
const VOXEL_HAIR = ["brown", "blond", "red"] as const;
const SWING = degrees(30);

export function voxelLook(seed: number): Look {
  return lookFromSeed(seed, "staff", "random", createRng(seed, "voxel-hair").pick(VOXEL_HAIR));
}

export function buildChibi(look: Look): VoxelModel {
  const leg = (): VoxelBuilder =>
    new VoxelBuilder(palette, [1, 2, 2]).sculpt([
      { a: [0, 0, 0], b: [1, 2, 2], c: look.legs[1] },
      { a: [0, 0, 0], b: [1, 1, 2], c: look.legs[0] }, // the shoes
    ]);
  const arm = (): VoxelBuilder =>
    new VoxelBuilder(palette, [1, 3, 2]).sculpt([
      { a: [0, 0, 0], b: [1, 3, 2], c: look.cloth[1] },
      { a: [0, 0, 0], b: [1, 1, 2], c: look.skin[1] }, // the hand
    ]);
  const body = new VoxelBuilder(palette, [2, 3, 2]).sculpt([
    { a: [0, 0, 0], b: [2, 3, 2], c: look.cloth[1] },
    { a: [0, 0, 1], b: [2, 1, 2], c: look.cloth[0] }, // the apron's hem on the front
  ]);
  // The head: its low-x half, mirrored. Hair on the crown, the back and the sides; the crown's
  // corners carved so the head reads round.
  const head = new VoxelBuilder(palette, [4, 3, 4])
    .sculpt([
      { a: [0, 0, 0], b: [2, 3, 4], c: look.skin[1] },
      { a: [0, 2, 0], b: [2, 3, 4], c: look.hair[1] },
      { a: [0, 0, 0], b: [2, 3, 1], c: look.hair[1] },
      { a: [0, 1, 0], b: [1, 2, 4], c: look.hair[1] },
      { a: [0, 2, 0], b: [1, 3, 1], c: CARVE },
      { a: [0, 2, 3], b: [1, 3, 4], c: CARVE },
    ])
    .mirrorX();

  return defineModel({
    size: CHIBI_SIZE,
    palette,
    parts: [
      { name: "leg-r", grid: leg().grid, at: [1, 0, 1], pivot: [0, 2, 1] },
      { name: "leg-l", grid: leg().grid, at: [2, 0, 1], pivot: [1, 2, 1] },
      { name: "body", grid: body.grid, at: [1, 2, 1], pivot: [1, 0, 1] },
      { name: "arm-r", grid: arm().grid, at: [0, 2, 1], pivot: [0, 3, 1] },
      { name: "arm-l", grid: arm().grid, at: [3, 2, 1], pivot: [1, 3, 1] },
      { name: "head", grid: head.grid, at: [0, 5, 0], pivot: [2, 0, 2] },
    ],
    budget: 128,
    symmetric: true,
    tile: [4, 4],
    poses: {
      breathe: { head: { offset: [0, -1, 0] } },
      "step-l": {
        "leg-l": { offset: [0, 0, 1] },
        "leg-r": { offset: [0, 0, -1] },
        "arm-l": { rotate: { axis: "x", angle: SWING } },
        "arm-r": { rotate: { axis: "x", angle: -SWING } },
      },
      "step-r": {
        "leg-l": { offset: [0, 0, -1] },
        "leg-r": { offset: [0, 0, 1] },
        "arm-l": { rotate: { axis: "x", angle: -SWING } },
        "arm-r": { rotate: { axis: "x", angle: SWING } },
      },
    },
  });
}

const POSES: Readonly<Record<string, readonly (string | undefined)[]>> = {
  idle: [undefined, "breathe"],
  walk: ["step-l", undefined, "step-r", undefined],
};

export function drawVoxelChibi(look: Look, clip: string, frame: number, facing: string): IndexedBuffer {
  const pose = POSES[clip]?.[frame];
  const out = bakeIso(buildChibi(look), { facing, pose, margin: CHIBI_MARGIN });
  // The eyes, on the front of the head (the plane z = 4), which two facings show: 1 x 2 px of
  // ink each, one column in from the head's corners.
  if (facing === "sw" || facing === "se") {
    const top = pose === "breathe" ? 6 : 7;
    const down = facing === "sw" ? 1 : 0;
    for (const [voxel, column] of [[1, 0], [2, 1]] as const) {
      const [x, y] = isoPoint(CHIBI_SIZE, [voxel, top, 4], { facing, margin: CHIBI_MARGIN });
      out.vline(x + column, y + down, 2, palette.ink);
    }
  }
  return out;
}

const RAMPS = ["skin", "wood", "hair", "gold", "red", "blue", "green", "metal"]; // wood: the darker skin tone

export function defineVoxelChibi(pack: string): AnyAsset {
  return defineAsset({
    id: `${pack}/staff`,
    kind: "sprite",
    size: CHIBI_FRAME.size,
    pivot: CHIBI_FRAME.pivot,
    palette,
    clips: {
      idle: { frames: 2, durations: [600, 400] },
      walk: { frames: 4, durations: 140 },
    },
    facings: ISO_FACINGS,
    params: {},
    presets: {},
    variantSeeds: [1, 2, 3],
    lint: {
      allowedSlots: ["ink", "ink-deep", "shadow", ...RAMPS],
      outlineSlots: outlineSlots(palette, RAMPS),
      // A step forward on the 2:1 grid is one pixel down the screen.
      clips: { walk: { baselineDrift: 1 } },
    },
    render({ seed, clip, frame, facing }) {
      return drawVoxelChibi(voxelLook(seed), clip, frame, facing);
    },
  });
}
