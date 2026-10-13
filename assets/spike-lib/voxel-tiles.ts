// The iso floor and wall tiles of the art spike (variant C): a floor slab of 4 x 1 x 4 voxels
// (a 16 x 8 diamond with its grout as the baker's outline), four variants by jitter; wall
// slabs one voxel thick along the left edge (x = 0), the right edge (z = 0) or both (the
// corner), six voxels tall, with a skirting row and a lit cornice. Every tile lives in the
// props' 4 x 6 x 4 box, so one frame and one pivot serve the whole pack.

import { defineAsset } from "@whz/asset-kit";
import type { AnyAsset, IndexedBuffer } from "@whz/asset-kit";
import { bakeIso, box, defineModel, ISO_FACINGS, outlineSlots, VoxelBuilder } from "@whz/voxel-kit";
import type { VoxelModel } from "@whz/voxel-kit";
import { palette } from "./style.ts";
import { PROP_FRAME, PROP_MARGIN, PROP_SIZE } from "./voxel-props.ts";

export const VOXEL_TILE_CLIPS = { floor: 4, "wall-left": 1, "wall-right": 1, "wall-corner": 1 } as const;
export type VoxelTileClip = keyof typeof VOXEL_TILE_CLIPS;
const TILE_RAMPS = ["floor", "wall", "wood"];

/** A wall one voxel thick along the tile's left edge (x = 0) or right edge (z = 0), with a skirting row and a lit cornice. */
function wallSlab(b: VoxelBuilder, side: "left" | "right"): void {
  const [nx, ny, nz] = PROP_SIZE;
  const end: [number, number, number] = side === "left" ? [1, ny, nz] : [nx, ny, 1];
  b.fill(box([0, 0, 0], end), ["wall", 1]);
  b.fill(box([0, 0, 0], [end[0], 1, end[2]]), ["wood", 0]);
  b.fill(box([0, ny - 1, 0], end), ["wall", 2]);
}

export function buildTile(clip: VoxelTileClip, variant: number): VoxelModel {
  const b = new VoxelBuilder(palette, PROP_SIZE);
  if (clip === "floor") {
    b.fill(box([0, 0, 0], [4, 1, 4]), ["floor", 1]);
    b.jitter(box([0, 0, 0], [4, 1, 4]), { seed: variant, chance: [variant, 6] });
  } else {
    if (clip !== "wall-right") wallSlab(b, "left");
    if (clip !== "wall-left") wallSlab(b, "right");
  }
  return defineModel({
    size: PROP_SIZE,
    palette,
    parts: [{ name: clip, grid: b.grid, pivot: [2, 0, 2] }],
    ramps: TILE_RAMPS,
    budget: PROP_SIZE[0] * PROP_SIZE[1] * PROP_SIZE[2],
    tile: [4, 4],
  });
}

export function drawVoxelTile(clip: VoxelTileClip, variant: number, facing = "sw"): IndexedBuffer {
  return bakeIso(buildTile(clip, variant), { facing, margin: PROP_MARGIN, shadow: false });
}

export function defineVoxelTiles(pack: string): AnyAsset {
  const clips = Object.fromEntries(Object.entries(VOXEL_TILE_CLIPS).map(([name, frames]) => [name, { frames, durations: 1000, loop: false }]));
  return defineAsset({
    id: `${pack}/tiles`,
    kind: "tiles",
    size: PROP_FRAME.size,
    pivot: PROP_FRAME.pivot,
    palette,
    clips,
    facings: ISO_FACINGS,
    params: {},
    presets: {},
    variantSeeds: [1],
    lint: { allowedSlots: ["ink", "ink-deep", ...TILE_RAMPS], outlineSlots: outlineSlots(palette, TILE_RAMPS) },
    render({ clip, frame, facing }) {
      return drawVoxelTile(clip as VoxelTileClip, frame, facing);
    },
  });
}
