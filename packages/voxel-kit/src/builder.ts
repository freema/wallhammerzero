// The builder: how a voxel model is written. A model is a program, not an array of voxels
// (research/voxels.md §4.2-4.4): a short list of boxes, shapes and paint operations that a
// session can read, change and check.
//
//   const b = new VoxelBuilder(palette, [4, 3, 4]);
//   b.sculpt([
//     { a: [0, 0, 0], b: [4, 3, 4], c: ["skin", 2] },            // fill a box
//     { a: [0, 2, 0], b: [4, 3, 4], c: "hair.1" },               // later boxes overwrite
//     { a: [1, 0, 1], b: [3, 1, 3], c: CARVE },                  // carve
//     { ...ellipsoid([0, 0, 0], [4, 3, 4]), c: (x, y, z) => (y === 0 ? null : "hair.2") },
//   ]);
//   b.paint(box([0, 2, 0], [4, 3, 4]), "hair", 3).jitter(b.all, { seed }).mirrorX();
//
// Coordinates are integer voxels in the grid of the part being built; `b` is exclusive. A box
// that reaches outside the grid throws: nothing is clipped silently.

import { hash32 } from "@whz/det";
import type { Palette } from "@whz/asset-kit";
import { EMPTY, VoxelGrid } from "./grid.ts";
import type { Vec3 } from "./grid.ts";
import { materialIndex, ShadeTable } from "./shade.ts";
import type { Material } from "./shade.ts";
import type { Region } from "./shapes.ts";

/** The colour of a sculpt box that removes voxels. */
export const CARVE: unique symbol = Symbol("carve");
export type Carve = typeof CARVE;

/** A per-voxel colour: a material, `CARVE`, or null to leave the voxel as it is. */
export type VoxelFn = (x: number, y: number, z: number) => Material | Carve | null;

/** One operation of `sculpt`. */
export interface SculptBox extends Region {
  /** What the voxels of the region become: a material, `CARVE`, or a function of the voxel. */
  readonly c: Material | Carve | VoxelFn;
  /** Recolour only the voxels that exist already (eyes, trim): empty voxels stay empty. */
  readonly paint?: boolean;
}

/** Options of `jitter`. */
export interface JitterOptions {
  /** The seed of the pattern: an unsigned 32-bit integer. */
  readonly seed: number;
  /** How many voxels change, as a fraction `[numerator, denominator]`. A quarter if not given. */
  readonly chance?: readonly [number, number];
}

/** A hash of a voxel position and a seed: the same voxel always gets the same value. */
export function hash3(x: number, y: number, z: number, seed: number): number {
  return hash32(x, y, hash32(z, 0x51ed, seed));
}

export class VoxelBuilder {
  readonly palette: Palette;
  readonly grid: VoxelGrid;
  private readonly shade: ShadeTable;

  /** A builder over a new empty grid of `size`, or over an existing grid. */
  constructor(palette: Palette, size: Vec3 | VoxelGrid) {
    this.palette = palette;
    this.grid = size instanceof VoxelGrid ? size : VoxelGrid.of(size);
    this.shade = new ShadeTable(palette);
  }

  /** The whole grid as a region. */
  get all(): Region {
    return { a: [0, 0, 0], b: this.grid.size };
  }

  private checkRegion(fn: string, region: Region): void {
    const { a, b } = region;
    const size = this.grid.size;
    for (let i = 0; i < 3; i += 1) {
      const lo = a[i] as number;
      const hi = b[i] as number;
      if ((lo | 0) !== lo || (hi | 0) !== hi) throw new RangeError(`${fn}: a and b must hold integers, got [${a.join(", ")}] .. [${b.join(", ")}]`);
      if (lo >= hi) throw new RangeError(`${fn}: the box [${a.join(", ")}] .. [${b.join(", ")}] is empty (b is exclusive)`);
      if (lo < 0 || hi > (size[i] as number)) {
        throw new RangeError(`${fn}: the box [${a.join(", ")}] .. [${b.join(", ")}] reaches outside the ${size.join(" x ")} grid`);
      }
    }
  }

  private each(region: Region, visit: (x: number, y: number, z: number, at: number) => void): void {
    const { a, b, inside } = region;
    const { nx, nz } = this.grid;
    for (let y = a[1]; y < b[1]; y += 1) {
      for (let z = a[2]; z < b[2]; z += 1) {
        for (let x = a[0]; x < b[0]; x += 1) {
          if (inside === undefined || inside(x, y, z)) visit(x, y, z, (y * nz + z) * nx + x);
        }
      }
    }
  }

  /**
   * Applies boxes in order: a later box overwrites, carves or repaints what an earlier one
   * made. An error names the box by its position in the list.
   */
  sculpt(boxes: readonly SculptBox[]): this {
    boxes.forEach((entry, i) => {
      const fn = `sculpt (box ${i})`;
      this.checkRegion(fn, entry);
      const { c } = entry;
      const paintOnly = entry.paint === true;
      const { data } = this.grid;
      if (typeof c === "function") {
        this.each(entry, (x, y, z, at) => {
          if (paintOnly && data[at] === EMPTY) return;
          const value = c(x, y, z);
          if (value === null) return;
          data[at] = value === CARVE ? EMPTY : materialIndex(this.palette, value);
        });
        return;
      }
      if (c === CARVE && paintOnly) throw new RangeError(`${fn}: a paint box recolours voxels; it cannot carve`);
      const index = c === CARVE ? EMPTY : materialIndex(this.palette, c);
      this.each(entry, (_x, _y, _z, at) => {
        if (!paintOnly || data[at] !== EMPTY) data[at] = index;
      });
    });
    return this;
  }

  /** Fills a region with one material. */
  fill(region: Region, material: Material): this {
    return this.sculpt([{ ...region, c: material }]);
  }

  /** Empties a region. */
  carve(region: Region): this {
    return this.sculpt([{ ...region, c: CARVE }]);
  }

  /** Recolours the existing voxels of a region with a step of a ramp (0 = darkest). */
  paint(region: Region, ramp: string, step: number): this {
    return this.sculpt([{ ...region, c: [ramp, step], paint: true }]);
  }

  /**
   * Texture without new colours: moves some voxels of a region one step up or down their own
   * ramp. Which voxels, and which way, comes from a hash of the voxel position and the seed.
   * A voxel never leaves its ramp, and a voxel of a slot that is in no ramp stays.
   */
  jitter(region: Region, options: JitterOptions): this {
    this.checkRegion("jitter", region);
    const [num, den] = options.chance ?? [1, 4];
    if (!Number.isInteger(num) || !Number.isInteger(den) || den < 1 || num < 0 || num > den) {
      throw new RangeError(`jitter: chance must be [numerator, denominator] with 0 <= numerator <= denominator, got ${JSON.stringify(options.chance)}`);
    }
    if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) {
      throw new RangeError(`jitter: the seed must be an integer in [0, 4294967295], got ${String(options.seed)}`);
    }
    const { data } = this.grid;
    this.each(region, (x, y, z, at) => {
      const index = data[at] as number;
      if (index === EMPTY) return;
      const h = hash3(x, y, z, options.seed);
      if ((h >>> 8) % den >= num) return;
      data[at] = this.shade.shift(index, (h & 1) === 0 ? 1 : -1);
    });
    return this;
  }

  /**
   * Makes the grid symmetric along x: the half with the lower x is copied, mirrored, onto the
   * other half. Write one side, mirror, then add what is deliberately one-sided.
   */
  mirrorX(): this {
    const { nx, ny, nz, data } = this.grid;
    for (let row = 0; row < ny * nz; row += 1) {
      for (let x = 0; x < nx >> 1; x += 1) data[row * nx + nx - 1 - x] = data[row * nx + x] as number;
    }
    return this;
  }
}
