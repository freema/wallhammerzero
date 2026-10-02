// bakeIso: a voxel model in, one frame of pixel art out. The output is an asset-kit
// IndexedBuffer, so a voxel model is an ordinary asset: its gen.ts builds the model and
// returns `bakeIso(model, { facing, pose })` from `render`.
//
// The steps, in order:
//
//   1. assemble   the posed parts become one grid (model.ts)
//   2. facing     the grid is turned by quarter turns: a permutation, nothing is resampled
//   3. project    faces are stamped with ramp light, AO and the far-side step (project.ts)
//   4. cleanup    specks (a part that shows as one or two pixels) join their neighbour, and a
//                 pixel whose shade no neighbour shares takes the shade around it
//   5. contours   inside the shape, a line where a nearer part covers another one: only
//                 between different parts, and only where the depth gap is large enough
//   6. outline    one pixel around the shape: ink, but on the lit side (above and to the left
//                 of the shape) the darkest step of the ramp it touches
//   7. shadow     the contact shadow on the ground, in the palette's `shadow` slot, behind
//                 everything else
//
// The rules of steps 4 to 7 are the ones a working 3D-to-pixel baker spells out
// (research/ref-procedural-pixel-creatures.md §3.5 and §8.4), written again for voxels.

import { IndexedBuffer } from "@whz/asset-kit";
import type { Palette } from "@whz/asset-kit";
import { EMPTY, requireVec3 } from "./grid.ts";
import type { Vec3, VoxelGrid } from "./grid.ts";
import { assemble, resolvePose, REST } from "./model.ts";
import type { Pose, VoxelModel } from "./model.ts";
import { isoSize, NO_DEPTH, projectIso } from "./project.ts";
import type { IsoLayers } from "./project.ts";
import { assertValidModel } from "./validate.ts";

/**
 * The four facings, named by where the model's front (+z) points on screen. `sw` is the model
 * as built: its front is the left face. Each next one is a quarter turn.
 */
export const ISO_FACINGS = ["sw", "se", "ne", "nw"] as const;
export type IsoFacing = (typeof ISO_FACINGS)[number];

/** The depth gap, in voxels, from which a nearer part draws a contour on the part behind it. */
export const DEFAULT_CONTOUR_GAP = 2;
/** A part that shows as at most this many connected pixels is a speck. */
export const SPECK_AREA = 2;

/** The contact shadow. */
export interface ShadowOptions {
  /** Voxels below this height cast it. 1 if not given: only what touches the ground. */
  readonly height?: number;
  /** How many voxels the shadow reaches beyond what casts it. 1 if not given. */
  readonly grow?: number;
}

/** Options of `bakeIso`. Everything has a default. */
export interface BakeOptions {
  /** A name of `ISO_FACINGS` or a number of quarter turns. `"sw"` if not given. */
  readonly facing?: string | number;
  /** A pose, or the name of one of the model's poses. The rest pose if not given. */
  readonly pose?: Pose | string;
  /**
   * Transparent pixels around the projection, on every side. 1 if not given: the room the
   * outline needs. The frame is `isoFrame(model.size, margin)`.
   */
  readonly margin?: number;
  /** Ambient occlusion. On if not given. */
  readonly ao?: boolean;
  /** Parts on the far side of the model one ramp step darker. On if not given. */
  readonly farShade?: boolean;
  /** The cleanup pass. On if not given. */
  readonly cleanup?: boolean;
  /** The smallest depth gap in voxels that draws an interior contour; null for no contours. `DEFAULT_CONTOUR_GAP` if not given. */
  readonly contourGap?: number | null;
  /** The outline around the shape. On if not given. */
  readonly outline?: boolean;
  /** The contact shadow: false for none, or how far it reaches. On if not given. */
  readonly shadow?: boolean | ShadowOptions;
  /** False skips the structural validation (for a viewer that shows a broken model). */
  readonly check?: boolean;
}

/** The frame of a baked model: its size, and the pixel that sits on the model's position. */
export interface IsoFrame {
  readonly size: readonly [w: number, h: number];
  /** The centre of the model's ground diamond. */
  readonly pivot: readonly [x: number, y: number];
}

/**
 * The frame `bakeIso` returns for a model of `size` voxels: the projection plus `margin`
 * pixels on every side. Every facing and every pose of a model has the same frame. Use it for
 * the `size` and `pivot` of the asset.
 */
export function isoFrame(size: Vec3, margin = 1): IsoFrame {
  if (!Number.isInteger(margin) || margin < 0 || margin > 64) {
    throw new RangeError(`isoFrame: the margin must be an integer in [0, 64], got ${String(margin)}`);
  }
  const { w, h } = isoSize(size);
  return {
    size: [w + 2 * margin, h + 2 * margin],
    pivot: [margin + size[0] + size[2], margin + 2 * size[1] + ((size[0] + size[2]) >> 1)],
  };
}

/**
 * The slots the outline of a baked model is drawn in: `ink`, and the darkest step of every
 * ramp (of the named ramps, or of all ramps of the palette). An asset passes it as
 * `lint.outlineSlots`, so the outline lint knows that the lit rim is outline too.
 */
export function outlineSlots(palette: Palette, ramps: readonly string[] = palette.rampNames): string[] {
  const indices = new Set([palette.ink, ...ramps.map((name) => palette.ramp(name)[0] as number)]);
  return palette.slots.filter((slot) => indices.has(slot.index)).map((slot) => slot.name);
}

/** The number of quarter turns of a facing. */
export function facingTurns(facing: string | number | undefined): number {
  if (facing === undefined) return 0;
  if (typeof facing === "number") {
    if (!Number.isInteger(facing)) throw new RangeError(`bakeIso: a facing is a whole number of quarter turns, got ${String(facing)}`);
    return facing & 3;
  }
  const turns = (ISO_FACINGS as readonly string[]).indexOf(facing);
  if (turns < 0) throw new RangeError(`bakeIso: no facing named ${JSON.stringify(facing)} (facings: ${ISO_FACINGS.join(", ")})`);
  return turns;
}

/**
 * Where a lattice point of a model lands in the frame, for a facing: the pixel whose top-left
 * corner is the projected point. A lattice point is a corner of voxels: `[x, y, z]` is the
 * low corner of voxel (x, y, z). For details that are stamped on the frame after the bake
 * (a face, a sign), because a voxel is too coarse for them.
 *
 * The stamp of a face follows from it. A top face covers the two rows from the pixel of its
 * back corner, two columns to either side. A right face covers the 2 x 2 pixels from the pixel
 * of its top-left corner. A left face covers the 2 x 2 pixels one row under the pixel of its
 * top-left corner.
 */
export function isoPoint(size: Vec3, point: Vec3, options: { readonly facing?: string | number; readonly margin?: number } = {}): [x: number, y: number] {
  requireVec3("isoPoint", "size", size);
  requireVec3("isoPoint", "point", point);
  const margin = options.margin ?? 1;
  const turns = facingTurns(options.facing);
  const [nx, ny, nz] = size;
  let [x, , z] = point;
  let depth = nz;
  if (turns === 1) [x, z, depth] = [z, nx - x, nx];
  else if (turns === 2) [x, z] = [nx - x, nz - z];
  else if (turns === 3) [x, z, depth] = [nz - z, x, nx];
  return [2 * (x - z) + 2 * depth + margin, x + z - 2 * point[1] + 2 * ny + margin];
}

/** Everything a bake knows, for tests and for a viewer that explains a model. */
export interface BakedIso {
  /** The frame. */
  readonly buffer: IndexedBuffer;
  /** The projection after the cleanup, before contours and outline. Pixel (x, y) of it is frame pixel (x + margin, y + margin). */
  readonly layers: IsoLayers;
  readonly margin: number;
  /** Per pixel of `layers`: 1 where an interior contour was drawn. */
  readonly contour: Uint8Array;
  /** The numbers plus 1 of the parts that were drawn one step darker, in order. */
  readonly farParts: readonly number[];
}

// ---------------------------------------------------------------------------------------
// The far side

/**
 * The parts on the far side of the model, from the part numbers of the rest pose turned to the
 * facing: those whose box lies, on the ground plane, farther from the camera than the box of
 * the whole model. It is read from the rest pose, so a leg does not change its shade while it
 * swings.
 */
function farPartsOf(model: VoxelModel, ids: VoxelGrid): number[] {
  const { nx, ny, nz } = ids;
  // Per part number: min x, max x, min z, max z.
  const boxes = new Map<number, [number, number, number, number]>();
  let i = 0;
  for (let y = 0; y < ny; y += 1) {
    for (let z = 0; z < nz; z += 1) {
      for (let x = 0; x < nx; x += 1, i += 1) {
        const id = ids.data[i] as number;
        if (id === EMPTY) continue;
        const b = boxes.get(id);
        if (b === undefined) boxes.set(id, [x, x, z, z]);
        else {
          if (x < b[0]) b[0] = x;
          if (x > b[1]) b[1] = x;
          if (z < b[2]) b[2] = z;
          if (z > b[3]) b[3] = z;
        }
      }
    }
  }
  if (boxes.size === 0) return [];
  const all = [...boxes.values()];
  // Twice the ground depth (x + z) of a box centre: an integer.
  const depth2 = (b: readonly [number, number, number, number]): number => b[0] + b[1] + b[2] + b[3];
  const whole = depth2([
    Math.min(...all.map((b) => b[0])),
    Math.max(...all.map((b) => b[1])),
    Math.min(...all.map((b) => b[2])),
    Math.max(...all.map((b) => b[3])),
  ]);
  const far: number[] = [];
  for (const [id, b] of [...boxes].sort((p, q) => p[0] - q[0])) {
    const part = model.parts[id - 1];
    if (part !== undefined && part.farShade && depth2(b) < whole) far.push(id);
  }
  return far;
}

// ---------------------------------------------------------------------------------------
// Cleanup

const NEAR4 = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const NEAR8 = [...NEAR4, [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

function copyPixel(layers: IsoLayers, to: number, from: number): void {
  layers.color[to] = layers.color[from] as number;
  layers.base[to] = layers.base[from] as number;
  layers.depth[to] = layers.depth[from] as number;
  layers.part[to] = layers.part[from] as number;
  layers.face[to] = layers.face[from] as number;
}

function erasePixel(layers: IsoLayers, at: number): void {
  layers.color[at] = 0;
  layers.base[at] = 0;
  layers.depth[at] = NO_DEPTH;
  layers.part[at] = 0;
  layers.face[at] = 0;
}

/**
 * Specks: a part that shows as a group of at most `SPECK_AREA` connected pixels. It joins the
 * part beside it; a speck with nothing beside it is removed.
 */
function removeSpecks(layers: IsoLayers): void {
  const { w, h, part } = layers;
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start += 1) {
    const id = part[start] as number;
    if (id === 0 || seen[start] === 1) continue;
    const members = [start];
    seen[start] = 1;
    for (let m = 0; m < members.length; m += 1) {
      const at = members[m] as number;
      const x = at % w;
      const y = (at - x) / w;
      for (const [dx, dy] of NEAR4) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx;
        if (seen[q] === 1 || part[q] !== id) continue;
        seen[q] = 1;
        members.push(q);
      }
    }
    if (members.length > SPECK_AREA) continue;
    members.sort((a, b) => a - b);
    let source = -1;
    for (const at of members) {
      const x = at % w;
      const y = (at - x) / w;
      for (const [dx, dy] of NEAR4) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx;
        if (part[q] !== 0 && part[q] !== id) {
          source = q;
          break;
        }
      }
      if (source >= 0) break;
    }
    for (const at of members) {
      if (source >= 0) copyPixel(layers, at, source);
      else erasePixel(layers, at);
    }
  }
}

/**
 * Isolated shade pixels: a pixel whose colour none of its eight neighbours has. It takes the
 * colour most of its neighbours of the same part have (of any part, if there are none); the
 * first in the order left, right, up, down, then the diagonals wins a tie.
 */
function mergeIsolatedShades(layers: IsoLayers): void {
  const { w, h, color, part } = layers;
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const at = y * w + x;
        const own = color[at] as number;
        if (own === 0) continue;
        const around: number[] = [];
        let alone = true;
        for (const [dx, dy] of NEAR8) {
          const qx = x + dx;
          const qy = y + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (color[q] === 0) continue;
          if (color[q] === own) {
            alone = false;
            break;
          }
          around.push(q);
        }
        if (!alone) continue;
        if (around.length === 0) {
          erasePixel(layers, at);
          changed = true;
          continue;
        }
        const samePart = around.filter((q) => part[q] === part[at]);
        const pool = samePart.length > 0 ? samePart : around;
        let best = pool[0] as number;
        let bestCount = 0;
        for (const q of pool) {
          const count = pool.filter((other) => color[other] === color[q]).length;
          if (count > bestCount) {
            best = q;
            bestCount = count;
          }
        }
        color[at] = color[best] as number;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

// ---------------------------------------------------------------------------------------
// The last cleanup step, on the finished frame

const ROLE_FILL = 1;
const ROLE_CONTOUR = 2;
const ROLE_RIM = 3;
const ROLE_SHADOW = 4;

/**
 * Contours, rims and the shadow can leave a pixel whose colour no neighbour has: one pixel of
 * contour, a rim pixel between two ramps, a shadow pixel that peeks out. Such a pixel reads
 * as noise, so it gives way: a contour pixel goes back to its fill, a rim pixel takes the
 * colour of the rim beside it (or ink), a shadow pixel is dropped, and a fill pixel takes the
 * colour most fill pixels around it have.
 */
function settleOrphans(buffer: IndexedBuffer, role: Uint8Array, layers: IsoLayers, margin: number, contour: Uint8Array, ink: number): void {
  const { w, h, data } = buffer;
  const layerAt = (x: number, y: number): number => (y - margin) * layers.w + x - margin;
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const at = y * w + x;
        const own = data[at] as number;
        if (own === 0) continue;
        const around: number[] = [];
        let alone = true;
        for (const [dx, dy] of NEAR8) {
          const qx = x + dx;
          const qy = y + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (data[q] === own) {
            alone = false;
            break;
          }
          if (data[q] !== 0) around.push(q);
        }
        if (!alone) continue;
        const kind = role[at] as number;
        if (kind === ROLE_CONTOUR) {
          data[at] = layers.color[layerAt(x, y)] as number;
          role[at] = ROLE_FILL;
          contour[layerAt(x, y)] = 0;
          changed = true;
        } else if (kind === ROLE_SHADOW) {
          data[at] = 0;
          role[at] = 0;
          changed = true;
        } else if (kind === ROLE_RIM) {
          const beside = around.find((q) => role[q] === ROLE_RIM);
          const next = beside === undefined ? ink : (data[beside] as number);
          if (next !== own) {
            data[at] = next;
            changed = true;
          }
        } else {
          const fills = around.filter((q) => role[q] === ROLE_FILL);
          const samePart = fills.filter((q) => layers.part[layerAt(q % w, (q - (q % w)) / w)] === layers.part[layerAt(x, y)]);
          const pool = samePart.length > 0 ? samePart : fills;
          if (pool.length === 0) continue;
          let best = pool[0] as number;
          let bestCount = 0;
          for (const q of pool) {
            const count = pool.filter((other) => data[other] === data[q]).length;
            if (count > bestCount) {
              best = q;
              bestCount = count;
            }
          }
          data[at] = data[best] as number;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

// ---------------------------------------------------------------------------------------
// The bake

function shadowCells(voxels: VoxelGrid, options: ShadowOptions): Set<number> {
  const height = options.height ?? 1;
  const grow = options.grow ?? 1;
  if (!Number.isInteger(height) || height < 1) throw new RangeError(`bakeIso: shadow.height must be a positive integer, got ${String(height)}`);
  if (!Number.isInteger(grow) || grow < 0 || grow > 8) throw new RangeError(`bakeIso: shadow.grow must be an integer in [0, 8], got ${String(grow)}`);
  const { nx, nz } = voxels;
  const span = nx + 2 * grow;
  const cells = new Set<number>();
  for (let z = 0; z < nz; z += 1) {
    for (let x = 0; x < nx; x += 1) {
      let casts = false;
      for (let y = 0; y < Math.min(height, voxels.ny) && !casts; y += 1) casts = voxels.get(x, y, z) !== EMPTY;
      if (!casts) continue;
      for (let dz = -grow; dz <= grow; dz += 1) {
        for (let dx = -grow; dx <= grow; dx += 1) cells.add((z + dz + grow) * span + x + dx + grow);
      }
    }
  }
  return cells;
}

/** Models that passed `assertValidModel`. A model is frozen, so the answer cannot change. */
const VALID = new WeakSet<VoxelModel>();

/** Bakes one frame and returns it with the layers it was made from. */
export function bakeIsoLayers(model: VoxelModel, options: BakeOptions = {}): BakedIso {
  const pose = resolvePose(model, options.pose);
  if (options.check !== false) {
    // The model with its named poses is checked once; a pose written inline is checked every time.
    if (typeof options.pose === "object") assertValidModel(model, { poses: { "this pose": pose } });
    else if (!VALID.has(model)) {
      assertValidModel(model);
      VALID.add(model);
    }
  }
  const turns = facingTurns(options.facing);
  const margin = options.margin ?? 1;
  const frame = isoFrame(model.size, margin);
  const { shade, palette } = model;

  const posed = assemble(model, pose);
  const voxels = posed.voxels.rotatedY(turns);
  const partIds = posed.partIds.rotatedY(turns);
  // The far side and the shadow are read from the rest pose: they do not change with a pose.
  const rest = assemble(model, REST);
  const farParts = options.farShade === false ? [] : farPartsOf(model, rest.partIds.rotatedY(turns));
  const layers = projectIso(voxels, { shade, partIds, ao: options.ao !== false, farParts: new Set(farParts) });
  const { w, h } = layers;

  if (options.cleanup !== false) {
    removeSpecks(layers);
    mergeIsolatedShades(layers);
  }

  // Interior contours: on the farther pixel, where the pixel beside it belongs to another
  // part and is nearer by the gap or more. The contour is the darkest step of the ramp of the
  // part behind; where that changes nothing (the pixel is that dark already, or flat), ink.
  const contour = new Uint8Array(w * h);
  const gap = options.contourGap === undefined ? DEFAULT_CONTOUR_GAP : options.contourGap;
  if (gap !== null) {
    if (!Number.isInteger(gap) || gap < 1) throw new RangeError(`bakeIso: contourGap must be a positive integer or null, got ${String(gap)}`);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const at = y * w + x;
        if (layers.part[at] === 0) continue;
        for (const [dx, dy] of NEAR4) {
          const qx = x + dx;
          const qy = y + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (layers.part[q] === 0 || layers.part[q] === layers.part[at]) continue;
          if (((layers.depth[q] as number) >> 1) - ((layers.depth[at] as number) >> 1) >= gap) {
            contour[at] = 1;
            break;
          }
        }
      }
    }
  }

  // What every pixel of the frame is, for the last cleanup step.
  const buffer = new IndexedBuffer(frame.size[0], frame.size[1]);
  const role = new Uint8Array(buffer.data.length);
  const fw = buffer.w;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const at = y * w + x;
      let color = layers.color[at] as number;
      if (color === 0) continue;
      if (contour[at] === 1) {
        const dark = shade.darkest(layers.base[at] as number);
        color = dark === color ? palette.ink : dark;
      }
      const to = (y + margin) * fw + x + margin;
      buffer.data[to] = color;
      role[to] = contour[at] === 1 ? ROLE_CONTOUR : ROLE_FILL;
    }
  }

  // The outline: every empty pixel of the frame that touches the shape. A pixel under the
  // shape, or to the right of it, is ink. A pixel above the shape, or to the left of it, is on
  // the lit side and takes the darkest step of the ramp it touches.
  if (options.outline !== false && margin > 0) {
    const covered = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : (layers.base[y * w + x] as number));
    for (let fy = 0; fy < buffer.h; fy += 1) {
      for (let fx = 0; fx < fw; fx += 1) {
        const x = fx - margin;
        const y = fy - margin;
        if (covered(x, y) !== 0) continue;
        const above = covered(x, y - 1);
        const left = covered(x - 1, y);
        const below = covered(x, y + 1);
        const right = covered(x + 1, y);
        let rim = 0;
        if (above !== 0) rim = palette.ink;
        else if (below !== 0) rim = shade.darkest(below);
        else if (left !== 0) rim = palette.ink;
        else if (right !== 0) rim = shade.darkest(right);
        if (rim === 0) continue;
        buffer.data[fy * fw + fx] = rim;
        role[fy * fw + fx] = ROLE_RIM;
      }
    }
  }

  // The contact shadow: the ground cells under the lowest voxels of the rest pose, grown,
  // stamped as ground diamonds wherever the frame is still empty. It stays where it is while
  // the model moves above it.
  if (options.shadow !== false) {
    const shadow = options.shadow === undefined || options.shadow === true ? {} : options.shadow;
    const grow = shadow.grow ?? 1;
    const span = voxels.nx + 2 * grow;
    for (const cell of [...shadowCells(rest.voxels.rotatedY(turns), shadow)].sort((a, b) => a - b)) {
      const x = (cell % span) - grow;
      const z = (cell - (cell % span)) / span - grow;
      const c0 = 2 * (x - z) + 2 * voxels.nz - 2 + margin;
      const r0 = x + z + 2 * voxels.ny + margin;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 4; dx += 1) {
          if (!buffer.inside(c0 + dx, r0 + dy) || buffer.data[(r0 + dy) * fw + c0 + dx] !== 0) continue;
          buffer.data[(r0 + dy) * fw + c0 + dx] = palette.shadow;
          role[(r0 + dy) * fw + c0 + dx] = ROLE_SHADOW;
        }
      }
    }
  }

  if (options.cleanup !== false) settleOrphans(buffer, role, layers, margin, contour, palette.ink);

  return { buffer, layers, margin, contour, farParts };
}

/** Bakes one frame of a model: `isoFrame(model.size, margin)` pixels of palette indices. */
export function bakeIso(model: VoxelModel, options: BakeOptions = {}): IndexedBuffer {
  return bakeIsoLayers(model, options).buffer;
}
