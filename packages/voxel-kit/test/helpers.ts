// Shared by the tests: the example palette and small readers.

import { parsePalette } from "@whz/asset-kit";
import type { IndexedBuffer } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import paletteJson from "../../../assets/palettes/voxel-example.json" with { type: "json" };
import { VoxelGrid } from "../src/index.ts";
import type { Vec3 } from "../src/index.ts";

/** assets/palettes/voxel-example.json: ink 1, shadow 2, wood 3..7, steel 8..12, skin 13..16, ... */
export const palette = parsePalette(paletteJson);

/** The palette index of a slot. */
export const slot = (name: string): number => palette.slot(name);

/** A buffer as rows of `toText` characters. */
export function text(buffer: IndexedBuffer): string[] {
  return buffer.toText().split("\n");
}

/** A layer of a projection as rows of digits (`.` for 0). */
export function layerText(layer: ArrayLike<number>, w: number): string[] {
  const symbols = ".123456789abcdefghijklmnopqrstuvwxyz";
  const rows: string[] = [];
  for (let at = 0; at < layer.length; at += w) {
    let row = "";
    for (let x = 0; x < w; x += 1) row += symbols.charAt(layer[at + x] as number) || "#";
    rows.push(row);
  }
  return rows;
}

/** A grid filled from a seed: about half of its voxels, with values 1..9. */
export function randomGrid(size: Vec3, seed: number): VoxelGrid {
  const grid = VoxelGrid.of(size);
  const rng = createRng(seed, "grid");
  for (let i = 0; i < grid.data.length; i += 1) grid.data[i] = rng.chance(1, 2) ? rng.range(1, 9) : 0;
  return grid;
}
