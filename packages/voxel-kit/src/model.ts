// A voxel model: named parts inside a bounding box, and poses that move the parts.
//
// A part is a small grid with a place in the model (`at`, the model voxel its corner (0,0,0)
// sits on) and a pivot (a lattice point of the part: the joint it turns around). A pose moves
// parts by whole voxels and, for small swings, turns a part around its pivot. A turned part is
// **re-voxelised**: every voxel of the result takes the value of the nearest voxel of the
// original (research/voxels.md §3.5), so a pose is again a crisp voxel model and the
// projection stays pixel-exact.
//
// `assemble` stacks the posed parts into one grid of the model's size. Parts are stacked in
// the order they are listed: where two overlap, the later one wins.

import { icos, idiv, isin, mulDivRound, TURN } from "@whz/det";
import type { Palette } from "@whz/asset-kit";
import { EMPTY, requireVec3, VoxelGrid } from "./grid.ts";
import type { Vec3 } from "./grid.ts";
import { ShadeTable } from "./shade.ts";

/** The voxel budget of a model that does not give one. */
export const DEFAULT_VOXEL_BUDGET = 4096;
/** A model can have at most this many parts: a part number is one byte, and 0 is "no part". */
export const MAX_PARTS = 255;

export type Axis = "x" | "y" | "z";

/** One part as written in `defineModel`. */
export interface PartSpec {
  /** Lowercase letters, digits and dashes. Poses name parts by it. */
  readonly name: string;
  readonly grid: VoxelGrid;
  /** The model voxel the part's corner (0, 0, 0) sits on. `[0, 0, 0]` if not given. */
  readonly at?: Vec3;
  /** The joint: a lattice point of the part, 0 .. size on every axis. `[0, 0, 0]` if not given. */
  readonly pivot?: Vec3;
  /** False keeps the part at its own brightness when it is on the far side of the model. */
  readonly farShade?: boolean;
}

/** How a pose changes one part. */
export interface PartPose {
  /** Whole voxels added to the part's place. */
  readonly offset?: Vec3;
  /**
   * A turn around the part's pivot. The angle is in `TURN` units (4096 per full turn, see
   * `degrees`). A positive angle turns x toward y (axis z), y toward z (axis x) and z toward x
   * (axis y).
   */
  readonly rotate?: { readonly axis: Axis; readonly angle: number };
}

/** A pose: part name -> how it moves. Parts that are not named stay at rest. */
export type Pose = Readonly<Record<string, PartPose>>;

/** The rest pose. */
export const REST: Pose = Object.freeze({});

/** What a model program passes to `defineModel`. */
export interface ModelSpec {
  /** The bounding box `[nx, ny, nz]` every pose must stay in. It fixes the size of the sprite. */
  readonly size: Vec3;
  readonly palette: Palette;
  /** The parts, back to front in stacking order: a later part overwrites an earlier one. */
  readonly parts: readonly PartSpec[];
  /** The ramps voxels are shaded along, in lookup order. All ramps of the palette if not given. */
  readonly ramps?: readonly string[];
  /** Slots that are in no ramp and are drawn unshaded on purpose (an eye in `ink`). */
  readonly flatSlots?: readonly string[];
  /** The most voxels the parts may have together. `DEFAULT_VOXEL_BUDGET` if not given. */
  readonly budget?: number;
  /** True for an archetype that must be its own mirror image along x in the rest pose. */
  readonly symmetric?: boolean;
  /** The tile the model stands on, `[x, z]` in voxels: the footprint of every pose must fit it. */
  readonly tile?: readonly [x: number, z: number];
  /** Named poses. `validateModel` checks every one of them. */
  readonly poses?: Readonly<Record<string, Pose>>;
}

/** One part of a defined model. */
export interface ModelPart {
  readonly name: string;
  readonly grid: VoxelGrid;
  readonly at: Vec3;
  readonly pivot: Vec3;
  readonly farShade: boolean;
}

/** A defined model. Plain frozen data plus the shade table of its palette. */
export interface VoxelModel {
  readonly size: Vec3;
  readonly palette: Palette;
  readonly shade: ShadeTable;
  readonly parts: readonly ModelPart[];
  readonly flatSlots: readonly string[];
  readonly budget: number;
  readonly symmetric: boolean;
  readonly tile: readonly [x: number, z: number] | null;
  readonly poses: Readonly<Record<string, Pose>>;
}

const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** An angle in `TURN` units from whole degrees, rounded to the nearest unit. */
export function degrees(value: number): number {
  return mulDivRound(value, TURN, 360);
}

function checkPose(fail: (message: string) => never, where: string, pose: Pose, names: readonly string[]): void {
  for (const [name, change] of Object.entries(pose)) {
    if (!names.includes(name)) fail(`${where}: no part named ${JSON.stringify(name)} (parts: ${names.join(", ")})`);
    if (change.offset !== undefined) requireVec3(where, `${name}.offset`, change.offset);
    if (change.rotate !== undefined) {
      const { axis, angle } = change.rotate;
      if (axis !== "x" && axis !== "y" && axis !== "z") fail(`${where}: ${name}.rotate.axis must be "x", "y" or "z", got ${JSON.stringify(axis)}`);
      if (!Number.isSafeInteger(angle)) fail(`${where}: ${name}.rotate.angle must be an integer in TURN units (use degrees()), got ${String(angle)}`);
    }
  }
}

/**
 * Defines a model. Checks the shape of the definition (names, sizes, the poses' part names)
 * and throws an error that names the field. Whether the model is a *good* one (inside its
 * bounds and budget, on its ramps, symmetric) is `validateModel`'s job.
 */
export function defineModel(spec: ModelSpec): VoxelModel {
  const fail = (message: string): never => {
    throw new Error(`voxel model: ${message}`);
  };
  requireVec3("defineModel", "size", spec.size);
  // The size is checked by making a grid of it.
  VoxelGrid.of(spec.size);
  if (!Array.isArray(spec.parts) || spec.parts.length === 0) fail(`"parts" must list at least one part`);
  if (spec.parts.length > MAX_PARTS) fail(`${spec.parts.length} parts, at most ${MAX_PARTS}`);
  const names: string[] = [];
  const parts = spec.parts.map((part, i): ModelPart => {
    if (typeof part.name !== "string" || !NAME.test(part.name)) {
      fail(`parts[${i}].name must be lowercase letters, digits and dashes, got ${JSON.stringify(part.name)}`);
    }
    if (names.includes(part.name)) fail(`the part name ${JSON.stringify(part.name)} is used twice`);
    names.push(part.name);
    if (!(part.grid instanceof VoxelGrid)) fail(`part ${JSON.stringify(part.name)}: "grid" must be a VoxelGrid`);
    const at = part.at ?? [0, 0, 0];
    const pivot = part.pivot ?? [0, 0, 0];
    requireVec3("defineModel", `part ${part.name}: at`, at);
    requireVec3("defineModel", `part ${part.name}: pivot`, pivot);
    return Object.freeze({
      name: part.name,
      grid: part.grid,
      at: Object.freeze([at[0], at[1], at[2]] as const),
      pivot: Object.freeze([pivot[0], pivot[1], pivot[2]] as const),
      farShade: part.farShade ?? true,
    });
  });
  const budget = spec.budget ?? DEFAULT_VOXEL_BUDGET;
  if (!Number.isInteger(budget) || budget < 1) fail(`"budget" must be a positive integer, got ${String(budget)}`);
  let tile: readonly [number, number] | null = null;
  if (spec.tile !== undefined) {
    if (!Array.isArray(spec.tile) || spec.tile.length !== 2 || !spec.tile.every((n) => Number.isInteger(n) && n >= 1)) {
      fail(`"tile" must be [x, z] in voxels, got ${JSON.stringify(spec.tile)}`);
    }
    tile = Object.freeze([spec.tile[0], spec.tile[1]] as const);
  }
  const flatSlots = spec.flatSlots ?? [];
  for (const slot of flatSlots) spec.palette.slot(slot);
  const poses = spec.poses ?? {};
  for (const [name, pose] of Object.entries(poses)) {
    if (!NAME.test(name)) fail(`the pose name ${JSON.stringify(name)} must be lowercase letters, digits and dashes`);
    checkPose(fail, `pose ${JSON.stringify(name)}`, pose, names);
  }
  return Object.freeze({
    size: Object.freeze([spec.size[0], spec.size[1], spec.size[2]] as const),
    palette: spec.palette,
    shade: new ShadeTable(spec.palette, spec.ramps),
    parts: Object.freeze(parts),
    flatSlots: Object.freeze([...flatSlots]),
    budget,
    symmetric: spec.symmetric === true,
    tile,
    poses: Object.freeze({ ...poses }),
  });
}

/** The pose a name or a pose stands for. Throws on an unknown name or part. */
export function resolvePose(model: VoxelModel, pose: Pose | string | undefined): Pose {
  if (pose === undefined) return REST;
  const fail = (message: string): never => {
    throw new Error(`voxel model: ${message}`);
  };
  if (typeof pose === "string") {
    const named = Object.hasOwn(model.poses, pose) ? model.poses[pose] : undefined;
    if (named === undefined) return fail(`no pose named ${JSON.stringify(pose)} (poses: ${Object.keys(model.poses).join(", ") || "none"})`);
    return named;
  }
  checkPose(fail, "pose", pose, model.parts.map((part) => part.name));
  return pose;
}

// ---------------------------------------------------------------------------------------
// Turning a part

/** A grid and where its corner (0, 0, 0) lies relative to the corner of the grid it came from. */
export interface PlacedGrid {
  readonly grid: VoxelGrid;
  readonly at: Vec3;
}

const FP_TWO = 131072; // 2.0 in 16.16 fixed point: source coordinates are doubled

/** The two axes a turn mixes, as indices into a Vec3: a positive angle turns `u` toward `v`. */
const PLANE: Readonly<Record<Axis, readonly [number, number]>> = { x: [1, 2], y: [2, 0], z: [0, 1] };

/**
 * A part turned around a pivot by an angle (in `TURN` units) and re-voxelised: every voxel of
 * the result takes the value of the voxel of `grid` that its centre turns back into. A turn
 * by a multiple of a quarter turn moves every voxel exactly; any other angle is a
 * nearest-neighbour resampling, so the voxel count can change by a few. The result is cropped
 * to its voxels; an empty grid comes back as a copy.
 */
export function revoxelise(grid: VoxelGrid, pivot: Vec3, axis: Axis, angle: number): PlacedGrid {
  requireVec3("revoxelise", "pivot", pivot);
  if (!Number.isSafeInteger(angle)) throw new RangeError(`revoxelise: the angle must be an integer in TURN units, got ${String(angle)}`);
  const source = grid.bounds();
  if (source === null || (angle & (TURN - 1)) === 0) return { grid: grid.clone(), at: [0, 0, 0] };
  const [u, v] = PLANE[axis];
  const cos = icos(angle);
  const sin = isin(angle);
  const pu = 2 * (pivot[u] as number);
  const pv = 2 * (pivot[v] as number);

  // Where the turned box can reach: turn the corners of the occupied box forward. Doubled
  // coordinates relative to the pivot, results in 16.16 fixed point.
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const cu of [source.min[u] as number, source.max[u] as number]) {
    for (const cv of [source.min[v] as number, source.max[v] as number]) {
      const ru = 2 * cu - pu;
      const rv = 2 * cv - pv;
      const tu = ru * cos - rv * sin;
      const tv = ru * sin + rv * cos;
      uMin = Math.min(uMin, tu);
      uMax = Math.max(uMax, tu);
      vMin = Math.min(vMin, tv);
      vMax = Math.max(vMax, tv);
    }
  }
  const lo: [number, number, number] = [source.min[0], source.min[1], source.min[2]];
  const hi: [number, number, number] = [source.max[0], source.max[1], source.max[2]];
  lo[u] = idiv(uMin + pu * 65536, FP_TWO) - 1;
  hi[u] = idiv(uMax + pu * 65536, FP_TWO) + 2;
  lo[v] = idiv(vMin + pv * 65536, FP_TWO) - 1;
  hi[v] = idiv(vMax + pv * 65536, FP_TWO) + 2;

  const wide = new VoxelGrid(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const at: [number, number, number] = [0, 0, 0];
  const from: [number, number, number] = [0, 0, 0];
  for (at[1] = 0; at[1] < wide.ny; at[1] += 1) {
    for (at[2] = 0; at[2] < wide.nz; at[2] += 1) {
      for (at[0] = 0; at[0] < wide.nx; at[0] += 1) {
        from[0] = at[0] + lo[0];
        from[1] = at[1] + lo[1];
        from[2] = at[2] + lo[2];
        // The centre of the target voxel, turned back by the angle.
        const ru = 2 * from[u] + 1 - pu;
        const rv = 2 * from[v] + 1 - pv;
        from[u] = idiv(ru * cos + rv * sin + pu * 65536, FP_TWO);
        from[v] = idiv(-ru * sin + rv * cos + pv * 65536, FP_TWO);
        const value = grid.get(from[0], from[1], from[2]);
        if (value !== EMPTY) wide.data[(at[1] * wide.nz + at[2]) * wide.nx + at[0]] = value;
      }
    }
  }

  const kept = wide.bounds();
  if (kept === null) return { grid: new VoxelGrid(1, 1, 1), at: [lo[0], lo[1], lo[2]] };
  const [kx, ky, kz] = kept.min;
  const out = new VoxelGrid(kept.max[0] - kx, kept.max[1] - ky, kept.max[2] - kz);
  for (let y = 0; y < out.ny; y += 1) {
    for (let z = 0; z < out.nz; z += 1) {
      for (let x = 0; x < out.nx; x += 1) out.data[(y * out.nz + z) * out.nx + x] = wide.get(x + kx, y + ky, z + kz);
    }
  }
  return { grid: out, at: [lo[0] + kx, lo[1] + ky, lo[2] + kz] };
}

// ---------------------------------------------------------------------------------------
// Assembling

/** A posed model as one grid. */
export interface Assembled {
  /** The palette indices, in the model's size. */
  readonly voxels: VoxelGrid;
  /** For every voxel, the number of the part it came from plus 1 (0 = empty). Same size. */
  readonly partIds: VoxelGrid;
  /** Per part: how many of its voxels fell outside the model's size and were dropped. */
  readonly outside: readonly number[];
}

/** Stacks the posed parts of a model into one grid. Voxels outside the model's size are dropped and counted. */
export function assemble(model: VoxelModel, pose: Pose | string = REST): Assembled {
  const resolved = resolvePose(model, pose);
  const voxels = VoxelGrid.of(model.size);
  const partIds = VoxelGrid.of(model.size);
  const outside: number[] = [];
  model.parts.forEach((part, number) => {
    const change = Object.hasOwn(resolved, part.name) ? resolved[part.name] : undefined;
    const offset = change?.offset ?? [0, 0, 0];
    const turned: PlacedGrid =
      change?.rotate === undefined ? { grid: part.grid, at: [0, 0, 0] } : revoxelise(part.grid, part.pivot, change.rotate.axis, change.rotate.angle);
    const ox = part.at[0] + offset[0] + turned.at[0];
    const oy = part.at[1] + offset[1] + turned.at[1];
    const oz = part.at[2] + offset[2] + turned.at[2];
    const { grid } = turned;
    let dropped = 0;
    let i = 0;
    for (let y = 0; y < grid.ny; y += 1) {
      for (let z = 0; z < grid.nz; z += 1) {
        for (let x = 0; x < grid.nx; x += 1, i += 1) {
          const value = grid.data[i] as number;
          if (value === EMPTY) continue;
          if (!voxels.inside(x + ox, y + oy, z + oz)) {
            dropped += 1;
            continue;
          }
          const to = ((y + oy) * voxels.nz + z + oz) * voxels.nx + x + ox;
          voxels.data[to] = value;
          partIds.data[to] = number + 1;
        }
      }
    }
    outside.push(dropped);
  });
  return { voxels, partIds, outside };
}
