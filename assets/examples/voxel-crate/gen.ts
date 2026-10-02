// A voxel prop: an 8 x 8 x 8 crate, baked to 2:1 isometric pixel art in four facings. With
// examples/voxel-chibi it is the example of packages/voxel-kit/README.md and the fixture of
// the kit's golden tests.

import { defineAsset, parsePalette } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import { bakeIso, box, CARVE, defineModel, ISO_FACINGS, isoFrame, outlineSlots, VoxelBuilder } from "@whz/voxel-kit";
import type { Material, VoxelModel } from "@whz/voxel-kit";
import paletteJson from "../../palettes/voxel-example.json" with { type: "json" };

const palette = parsePalette(paletteJson);
const N = 8;
// Around the projection: the contact shadow reaches 4 px past the left and right corners of
// the crate, and 1 px stays empty.
const MARGIN = 5;
const FRAME = isoFrame([N, N, N], MARGIN);

function buildCrate(seed: number, braces: boolean): VoxelModel {
  const b = new VoxelBuilder(palette, [N, N, N]);
  b.sculpt([
    // A block of frame wood, then a panel carved one voxel deep into five of its faces. The
    // block inside shows through the panels, so it is painted as lighter planks below.
    { a: [0, 0, 0], b: [N, N, N], c: ["wood", 2] },
    { a: [1, 1, 0], b: [N - 1, N - 1, 1], c: CARVE },
    { a: [1, 1, N - 1], b: [N - 1, N - 1, N], c: CARVE },
    { a: [0, 1, 1], b: [1, N - 1, N - 1], c: CARVE },
    { a: [N - 1, 1, 1], b: [N, N - 1, N - 1], c: CARVE },
    { a: [1, N - 1, 1], b: [N - 1, N, N - 1], c: CARVE },
  ]);
  b.paint(box([1, 1, 1], [N - 1, N - 1, N - 1]), "wood", 3);
  // The planks get their grain from the seed: single voxels one ramp step up or down.
  b.jitter(box([1, 1, 1], [N - 1, N - 1, N - 1]), { seed, chance: [1, 8] });
  if (braces) {
    // A diagonal brace across each side panel, painted on the planks two ramp steps darker.
    // The seed decides which way the braces lean.
    const lean = createRng(seed, "brace").chance(1, 2);
    // Two voxels thick: on the 2:1 grid a one-voxel diagonal that falls toward the near edge
    // breaks into dots (a step is 2 px across and 3 px down), and every brace is seen that way
    // from one of the two facings that show it.
    const brace = (across: number, y: number): Material | null => {
      const off = (lean ? y : N - 1 - y) - across;
      return off === 0 || off === 1 ? ["wood", 1] : null;
    };
    b.sculpt([
      { a: [1, 1, N - 2], b: [N - 1, N - 1, N - 1], c: (x, y) => brace(x, y), paint: true },
      { a: [1, 1, 1], b: [N - 1, N - 1, 2], c: (x, y) => brace(x, y), paint: true },
      { a: [N - 2, 1, 1], b: [N - 1, N - 1, N - 1], c: (_x, y, z) => brace(z, y), paint: true },
      { a: [1, 1, 1], b: [2, N - 1, N - 1], c: (_x, y, z) => brace(z, y), paint: true },
    ]);
  }
  // Steel caps on the two top corners of the front (+z) side tell the facings apart.
  b.sculpt([
    { a: [0, N - 1, N - 1], b: [1, N, N], c: ["steel", 2], paint: true },
    { a: [N - 1, N - 1, N - 1], b: [N, N, N], c: ["steel", 2], paint: true },
  ]);
  return defineModel({
    size: [N, N, N],
    palette,
    parts: [{ name: "crate", grid: b.grid, pivot: [N / 2, 0, N / 2] }],
    budget: N * N * N,
    tile: [N, N],
  });
}

export default defineAsset({
  id: "examples/voxel-crate", // = its folder under assets/
  kind: "sprite",
  size: FRAME.size, // 2 * (8 + 8) by (8 + 8) + 2 * 8 pixels, plus the margin
  pivot: FRAME.pivot, // the centre of the ground diamond
  palette,
  clips: { idle: { frames: 1, durations: 1000 } },
  facings: ISO_FACINGS,
  params: {
    braces: { type: "bool", default: true, description: "A diagonal brace across each side panel." },
  },
  presets: { plain: { braces: false } },
  variantSeeds: [1, 2, 3],
  // The lit rim of a baked model is the darkest step of the ramp it touches, not ink.
  lint: { outlineSlots: outlineSlots(palette, ["wood", "steel"]) },

  render({ params, seed, facing }) {
    return bakeIso(buildCrate(seed, params.braces), { facing, margin: MARGIN });
  },
});
