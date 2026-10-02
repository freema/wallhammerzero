// Regions: where a builder operation applies. A region is a box of voxels (`a` inclusive, `b`
// exclusive) and, for a shape that is not a box, a test of single voxels inside it.
//
// The shapes here are small signed-distance primitives, sampled the way `fillEllipse` of the
// asset kit samples pixels: **a voxel is in the shape when its centre is.** All arithmetic is
// on integers, in doubled coordinates (the centre of voxel x is 2x + 1), so the same shape
// gives the same voxels on every engine.

import { requireVec3 } from "./grid.ts";
import type { Vec3 } from "./grid.ts";

/** A box of voxels and, optionally, which voxels of it count. */
export interface Region {
  /** The low corner, inclusive. */
  readonly a: Vec3;
  /** The high corner, exclusive. */
  readonly b: Vec3;
  /** If given, only the voxels of the box for which it is true are in the region. */
  readonly inside?: (x: number, y: number, z: number) => boolean;
}

function requireBox(fn: string, a: Vec3, b: Vec3): void {
  requireVec3(fn, "a", a);
  requireVec3(fn, "b", b);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] as number) >= (b[i] as number)) {
      throw new RangeError(`${fn}: the box [${a.join(", ")}] .. [${b.join(", ")}] is empty: b is exclusive and must be above a on every axis`);
    }
  }
}

/** The box from `a` (inclusive) to `b` (exclusive). */
export function box(a: Vec3, b: Vec3): Region {
  requireBox("box", a, b);
  return { a, b };
}

/** The ellipsoid inscribed in the box from `a` to `b`. A 4 x 4 x 4 box gives the 4 x 4 x 4 ball without its 8 corners and 24 edge ends. */
export function ellipsoid(a: Vec3, b: Vec3): Region {
  requireBox("ellipsoid", a, b);
  const [sx, sy, sz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const [wx, wy, wz] = [sy * sy * sz * sz, sx * sx * sz * sz, sx * sx * sy * sy];
  const limit = sx * sx * wx;
  return {
    a,
    b,
    inside(x, y, z) {
      const dx = 2 * x + 1 - a[0] - b[0];
      const dy = 2 * y + 1 - a[1] - b[1];
      const dz = 2 * z + 1 - a[2] - b[2];
      return dx * dx * wx + dy * dy * wy + dz * dz * wz <= limit;
    },
  };
}

/**
 * The box from `a` to `b` with its edges and corners rounded with a radius of `radius` voxels.
 * Because a voxel counts when its centre is inside, a radius of 1 is still the plain box and a
 * radius of 2 takes one voxel off every edge. The radius can be at most half the shortest side.
 */
export function roundBox(a: Vec3, b: Vec3, radius: number): Region {
  requireBox("roundBox", a, b);
  const shortest = Math.min(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (!Number.isInteger(radius) || radius < 0 || 2 * radius > shortest) {
    throw new RangeError(`roundBox: the radius must be an integer in [0, ${shortest >> 1}] (half the shortest side), got ${String(radius)}`);
  }
  const r2 = 2 * radius;
  return {
    a,
    b,
    inside(x, y, z) {
      const qx = Math.max(0, Math.abs(2 * x + 1 - a[0] - b[0]) - (b[0] - a[0] - r2));
      const qy = Math.max(0, Math.abs(2 * y + 1 - a[1] - b[1]) - (b[1] - a[1] - r2));
      const qz = Math.max(0, Math.abs(2 * z + 1 - a[2] - b[2]) - (b[2] - a[2] - r2));
      return qx * qx + qy * qy + qz * qz <= r2 * r2;
    },
  };
}

/**
 * A capsule: every voxel within `diameter / 2` of the line between two voxels. `from` and `to`
 * are the voxels at the two ends of its axis. With an odd diameter the axis runs through
 * their centres; with an even one it runs through the corner they share with the voxel one
 * further along every axis (so a diameter of 2 covers `from` and `from + 1`).
 */
export function capsule(from: Vec3, to: Vec3, diameter: number): Region {
  requireVec3("capsule", "from", from);
  requireVec3("capsule", "to", to);
  if (!Number.isInteger(diameter) || diameter < 1 || diameter > 64) {
    throw new RangeError(`capsule: the diameter must be an integer in [1, 64], got ${String(diameter)}`);
  }
  const low = (diameter - 1) >> 1;
  const high = diameter >> 1;
  const a: Vec3 = [Math.min(from[0], to[0]) - low, Math.min(from[1], to[1]) - low, Math.min(from[2], to[2]) - low];
  const b: Vec3 = [Math.max(from[0], to[0]) + high + 1, Math.max(from[1], to[1]) + high + 1, Math.max(from[2], to[2]) + high + 1];
  // Doubled coordinates: the axis ends, the axis vector and its squared length.
  const shift = diameter % 2 === 1 ? 1 : 2;
  const p: Vec3 = [2 * from[0] + shift, 2 * from[1] + shift, 2 * from[2] + shift];
  const d: Vec3 = [2 * (to[0] - from[0]), 2 * (to[1] - from[1]), 2 * (to[2] - from[2])];
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const rr = diameter * diameter;
  return {
    a,
    b,
    inside(x, y, z) {
      const wx = 2 * x + 1 - p[0];
      const wy = 2 * y + 1 - p[1];
      const wz = 2 * z + 1 - p[2];
      const ww = wx * wx + wy * wy + wz * wz;
      const wd = wx * d[0] + wy * d[1] + wz * d[2];
      if (wd <= 0) return ww <= rr;
      if (wd >= dd) return ww - 2 * wd + dd <= rr;
      // The squared distance to the line is ww - wd^2 / dd; compare without dividing.
      return ww * dd - wd * wd <= rr * dd;
    },
  };
}
