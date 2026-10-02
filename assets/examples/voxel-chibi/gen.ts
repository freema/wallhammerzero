// A voxel character: a 4 x 4 x 8 test chibi (16 x 24 px before the margin), baked to 2:1
// isometric pixel art in four facings, with an idle and a walk made of part offsets and one
// small rotation. It is a test of the baker, not a designed character: the art spike makes
// those. With examples/voxel-crate it is the fixture of the voxel kit's golden tests.

import { defineAsset, parsePalette } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import { bakeIso, CARVE, defineModel, degrees, ISO_FACINGS, isoFrame, isoPoint, outlineSlots, VoxelBuilder } from "@whz/voxel-kit";
import type { VoxelModel } from "@whz/voxel-kit";
import paletteJson from "../../palettes/voxel-example.json" with { type: "json" };

const palette = parsePalette(paletteJson);
const SIZE = [4, 8, 4] as const; // x, y (up), z: the model looks along +z
// Around the projection: 1 px of outline and 1 px that stays empty.
const MARGIN = 2;
const FRAME = isoFrame(SIZE, MARGIN);
const SHIRTS = ["red", "green", "gold"] as const;
const HAIRS = ["hair", "steel", "gold"] as const;
const SWING = degrees(30);

function buildChibi(seed: number): VoxelModel {
  const shirt = createRng(seed, "shirt").pick(SHIRTS);
  const hair = createRng(seed, "hair").pick(HAIRS);

  // Bases sit low on their ramps (step 1 of 4) where a material has no face that looks up, so
  // that top, left, right and the far side stay inside the 16 colours of a sprite.
  const leg = (): VoxelBuilder =>
    new VoxelBuilder(palette, [1, 2, 2]).sculpt([
      { a: [0, 0, 0], b: [1, 2, 2], c: ["blue", 1] },
      { a: [0, 0, 0], b: [1, 1, 2], c: ["blue", 0] }, // shoes: the same ramp, one step down
    ]);
  const arm = (): VoxelBuilder =>
    new VoxelBuilder(palette, [1, 3, 2]).sculpt([
      { a: [0, 0, 0], b: [1, 3, 2], c: [shirt, 2] },
      { a: [0, 0, 0], b: [1, 1, 2], c: ["skin", 2] }, // the hand
    ]);
  const body = new VoxelBuilder(palette, [2, 3, 2]).fill({ a: [0, 0, 0], b: [2, 3, 2] }, [shirt, 2]);
  // The head is written as its low-x half and mirrored, so it cannot come out lopsided.
  const head = new VoxelBuilder(palette, [4, 3, 4])
    .sculpt([
      { a: [0, 0, 0], b: [2, 3, 4], c: ["skin", 2] },
      { a: [0, 2, 0], b: [2, 3, 4], c: [hair, 1] }, // the crown
      { a: [0, 0, 0], b: [2, 3, 1], c: [hair, 1] }, // the back of the head
      { a: [0, 1, 0], b: [1, 2, 4], c: [hair, 1] }, // the side, down to the ear
      { a: [0, 2, 0], b: [1, 3, 1], c: CARVE }, // the corners of the crown, so the head reads round
      { a: [0, 2, 3], b: [1, 3, 4], c: CARVE },
    ])
    .mirrorX();

  return defineModel({
    size: SIZE,
    palette,
    // Back to front in stacking order: where the bobbing head meets the body, the head wins.
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
      // Idle: the head sinks one voxel onto the shoulders.
      breathe: { head: { offset: [0, -1, 0] } },
      // Walk: a leg steps one voxel forward while the other trails, and the arms swing against
      // them, turned around the shoulder and re-voxelised.
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

export default defineAsset({
  id: "examples/voxel-chibi", // = its folder under assets/
  kind: "sprite",
  size: FRAME.size, // 2 * (4 + 4) by (4 + 4) + 2 * 8 pixels, plus the margin
  pivot: FRAME.pivot, // the centre of the ground diamond, between the feet
  palette,
  clips: {
    idle: { frames: 2, durations: 500 },
    walk: { frames: 4, durations: 140 },
  },
  facings: ISO_FACINGS,
  params: {},
  variantSeeds: [1, 2, 8], // curated: brown hair and a green shirt, grey and green, blond and red
  lint: {
    // The lit rim of a baked model is the darkest step of the ramp it touches, not ink.
    outlineSlots: outlineSlots(palette, ["skin", "blue", ...SHIRTS, ...HAIRS]),
    // A step forward on the 2:1 grid is one pixel down the screen: the forward foot is lower.
    clips: { walk: { baselineDrift: 1 } },
  },

  render({ seed, clip, frame, facing }) {
    const pose = POSES[clip]?.[frame];
    const out = bakeIso(buildChibi(seed), { facing, pose, margin: MARGIN });
    // The face is stamped after the bake: a voxel is 2 x 2 pixels, too coarse for an eye. The
    // eyes sit on the front of the head (the plane z = 4), which two of the facings show.
    if (facing === "sw" || facing === "se") {
      const top = pose === "breathe" ? 6 : 7; // the upper edge of the eye row, in voxels
      const down = facing === "sw" ? 1 : 0; // a left face starts one row under its corner
      for (const [voxel, column] of [[1, 0], [2, 1]] as const) {
        const [x, y] = isoPoint(SIZE, [voxel, top, 4], { facing, margin: MARGIN });
        out.vline(x + column, y + down, 2, palette.ink);
      }
    }
    return out;
  },
});
