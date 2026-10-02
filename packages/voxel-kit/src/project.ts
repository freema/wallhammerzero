// The projection: voxels to pixels, with integers only (research/voxels.md §3.2).
//
//   screen.x = 2 * (x - z)        y is up; screen y grows downward
//   screen.y = (x + z) - 2 * y
//
// This is the classic 2:1 "isometric" pixel grid. The camera looks down the (1, 1, 1)
// diagonal, so it sees three faces of a voxel: the top (+y), the left one on screen (+z) and
// the right one (+x). Every visible face is stamped as a fixed block of pixels:
//
//   TTTT     the top:   4 x 2
//   TTTT
//   LLRR     the sides: 2 x 2 each
//   LLRR
//
// A lone voxel is that 4 x 4 block; a model of nx x ny x nz voxels is a sprite of
// 2 * (nx + nz) by (nx + nz) + 2 * ny pixels. Where blocks overlap, the nearer voxel wins
// (depth = x + y + z), and of two faces at the same depth the top face wins. Nothing is
// resampled, so there is no "pixel flicker" to clean up between poses or facings.
//
// Light is a step along the palette ramp, never a new colour (§3.4): the top is the voxel's
// own colour + 1, the left side + 0, the right side - 1. Ambient occlusion and the far-side
// rule each take one more step off. AO follows the per-corner rule of
// https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/ : a corner of a
// face is occluded when one of the three voxels that touch it in front of the face is filled.
// Each pixel of a stamp belongs to one corner, and an occluded corner darkens its pixels by
// exactly one step: there is no gradient.

import { EMPTY } from "./grid.ts";
import type { Vec3, VoxelGrid } from "./grid.ts";
import type { ShadeTable } from "./shade.ts";

/** The value of `IsoLayers.face` for a pixel of a top face. */
export const FACE_TOP = 1;
/** ... of a left face (the voxel's +z side). */
export const FACE_LEFT = 2;
/** ... of a right face (the voxel's +x side). */
export const FACE_RIGHT = 3;

/** The value of `IsoLayers.depth` where nothing was drawn. */
export const NO_DEPTH = -1;

/** The pixel size of the projection of a box of voxels. */
export function isoSize(size: Vec3): { readonly w: number; readonly h: number } {
  return { w: 2 * (size[0] + size[2]), h: size[0] + size[2] + 2 * size[1] };
}

/** What the projection knows about every pixel. All layers are row-major, `w * h` long. */
export interface IsoLayers {
  readonly w: number;
  readonly h: number;
  /** The shaded palette index; 0 where nothing was drawn. */
  readonly color: Uint8Array;
  /** The palette index of the voxel itself, before light. */
  readonly base: Uint8Array;
  /** `2 * (x + y + z)` of the voxel, plus 1 on a top face; larger is nearer. `NO_DEPTH` where empty. */
  readonly depth: Int32Array;
  /** The part number plus 1 (see `Assembled.partIds`); 0 where nothing was drawn. */
  readonly part: Uint8Array;
  /** `FACE_TOP`, `FACE_LEFT` or `FACE_RIGHT`; 0 where nothing was drawn. */
  readonly face: Uint8Array;
}

/** Options of `projectIso`. */
export interface ProjectOptions {
  readonly shade: ShadeTable;
  /** A grid of the same size with a part number plus 1 per voxel. Every voxel is part 1 if not given. */
  readonly partIds?: VoxelGrid;
  /** Ambient occlusion as one ramp step. On if not given. */
  readonly ao?: boolean;
  /** Part numbers plus 1 that are drawn one ramp step darker. */
  readonly farParts?: ReadonlySet<number>;
}

/** Projects a grid of voxels. The result is exactly `isoSize(voxels.size)` pixels. */
export function projectIso(voxels: VoxelGrid, options: ProjectOptions): IsoLayers {
  const { nx, ny, nz } = voxels;
  const { shade, partIds } = options;
  if (partIds !== undefined && (partIds.nx !== nx || partIds.ny !== ny || partIds.nz !== nz)) {
    throw new RangeError("projectIso: partIds must have the size of the voxel grid");
  }
  const ao = options.ao !== false;
  const { w, h } = isoSize(voxels.size);
  const layers: IsoLayers = {
    w,
    h,
    color: new Uint8Array(w * h),
    base: new Uint8Array(w * h),
    depth: new Int32Array(w * h).fill(NO_DEPTH),
    part: new Uint8Array(w * h),
    face: new Uint8Array(w * h),
  };
  const solid = (x: number, y: number, z: number): boolean => voxels.get(x, y, z) !== EMPTY;

  let base = 0;
  let part = 0;
  let depth = 0;
  let face = 0;
  let light = 0;
  /** One pixel of the face being stamped; `occluded` is the AO of the corner it belongs to. */
  const plot = (px: number, py: number, occluded: boolean): void => {
    const at = py * w + px;
    if (depth <= (layers.depth[at] as number)) return;
    layers.depth[at] = depth;
    layers.color[at] = shade.shift(base, light - (ao && occluded ? 1 : 0));
    layers.base[at] = base;
    layers.part[at] = part;
    layers.face[at] = face;
  };

  for (let y = 0; y < ny; y += 1) {
    for (let z = 0; z < nz; z += 1) {
      for (let x = 0; x < nx; x += 1) {
        base = voxels.get(x, y, z);
        if (base === EMPTY) continue;
        part = partIds === undefined ? 1 : partIds.get(x, y, z);
        const far = options.farParts?.has(part) === true ? 1 : 0;
        const d = 2 * (x + y + z);
        const c0 = 2 * (x - z) + 2 * nz - 2;
        const r0 = x + z - 2 * y + 2 * ny - 2;

        if (!solid(x, y + 1, z)) {
          // The corners of the top face, by where they are on screen. The three voxels that
          // touch a corner in the layer above: two beside the face, one diagonal.
          const corner = (sx: number, sz: number): boolean =>
            solid(x + sx, y + 1, z) || solid(x, y + 1, z + sz) || solid(x + sx, y + 1, z + sz);
          const back = corner(-1, -1);
          const right = corner(1, -1);
          const left = corner(-1, 1);
          const front = corner(1, 1);
          depth = d + 1;
          face = FACE_TOP;
          light = 1 - far;
          plot(c0, r0, left);
          plot(c0 + 1, r0, back);
          plot(c0 + 2, r0, back);
          plot(c0 + 3, r0, right);
          plot(c0, r0 + 1, left);
          plot(c0 + 1, r0 + 1, front);
          plot(c0 + 2, r0 + 1, front);
          plot(c0 + 3, r0 + 1, right);
        }
        if (!solid(x, y, z + 1)) {
          // The left face: +x is to the right on screen, +y is up. One pixel per corner.
          const corner = (sx: number, sy: number): boolean =>
            solid(x + sx, y, z + 1) || solid(x, y + sy, z + 1) || solid(x + sx, y + sy, z + 1);
          depth = d;
          face = FACE_LEFT;
          light = -far;
          plot(c0, r0 + 2, corner(-1, 1));
          plot(c0 + 1, r0 + 2, corner(1, 1));
          plot(c0, r0 + 3, corner(-1, -1));
          plot(c0 + 1, r0 + 3, corner(1, -1));
        }
        if (!solid(x + 1, y, z)) {
          // The right face: +z is to the left on screen.
          const corner = (sz: number, sy: number): boolean =>
            solid(x + 1, y, z + sz) || solid(x + 1, y + sy, z) || solid(x + 1, y + sy, z + sz);
          depth = d;
          face = FACE_RIGHT;
          light = -1 - far;
          plot(c0 + 2, r0 + 2, corner(1, 1));
          plot(c0 + 3, r0 + 2, corner(-1, 1));
          plot(c0 + 2, r0 + 3, corner(1, -1));
          plot(c0 + 3, r0 + 3, corner(-1, -1));
        }
      }
    }
  }
  return layers;
}
