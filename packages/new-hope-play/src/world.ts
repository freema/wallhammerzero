// The district as a 3D world: metres, cell lookups, what blocks a body and where the floor is.
//
// A citygen cell is one tile by one storey. Here a tile is TILE metres square and a storey is
// STOREY metres tall. Axes: citygen x (east) is three.js +x, citygen y (south) is three.js +z,
// citygen z (the level) is three.js +y. So the cell (x, y, z) spans
// [x*TILE, (x+1)*TILE] x [z*STOREY, (z+1)*STOREY] x [y*TILE, (y+1)*TILE].

import { generateDistrict, K } from "@whz/citygen";
import type { District } from "@whz/citygen";

export const TILE = 4;
export const STOREY = 4;

export interface World {
  readonly district: District;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** The level of the street band's floor. */
  readonly streetLevel: number;
  kind(x: number, y: number, z: number): number;
  dir(x: number, y: number, z: number): number;
  facade(x: number, y: number, z: number): number;
  /** Solid volumes outside the district (the endless city), set by the skyline. */
  outside: (x: number, y: number, z: number) => boolean;
  /** The highest roof of the endless city under (x, z) at or below maxY, or -Infinity. */
  outsideFloor: (x: number, z: number, maxY: number) => number;
}

export function createWorld(seed: number): World {
  const district = generateDistrict(seed >>> 0, { width: 48, depth: 48, levels: 20 });
  const { width: w, depth: d, levels: h } = district;
  const at = (x: number, y: number, z: number): number => (z * d + y) * w + x;
  const inside = (x: number, y: number, z: number): boolean => x >= 0 && y >= 0 && z >= 0 && x < w && y < d && z < h;
  return {
    district,
    w,
    d,
    h,
    streetLevel: district.params.bands.streets[0],
    kind: (x, y, z) => (inside(x, y, z) ? (district.kind[at(x, y, z)] ?? K.empty) : z < 0 ? K.ruin : K.empty),
    dir: (x, y, z) => (inside(x, y, z) ? (district.dir[at(x, y, z)] ?? 0) : 0),
    facade: (x, y, z) => (inside(x, y, z) ? (district.facade[at(x, y, z)] ?? 0) : 0),
    outside: () => false,
    outsideFloor: () => -Infinity,
  };
}

/** Volumes a body cannot enter. */
export function isOpaque(kind: number): boolean {
  return kind === K.solid || kind === K.ruin;
}

/** Cells with a level floor at their bottom. */
export function isFloor(kind: number): boolean {
  return kind === K.deck || kind === K.street || kind === K.walkway || kind === K.pad || kind === K.lift;
}

export const cellOf = (m: number, size: number): number => Math.floor(m / size);

/** Does the world block a point (metres)? Outside the district only the ground blocks. */
export function blocksPoint(world: World, x: number, y: number, z: number): boolean {
  const cx = cellOf(x, TILE);
  const cy = cellOf(z, TILE);
  const cz = cellOf(y, STOREY);
  if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.d) return y < world.streetLevel * STOREY || world.outside(x, y, z);
  return isOpaque(world.kind(cx, cy, cz));
}

/** Height of a stairs cell's ramp at a point inside it (0..STOREY above its bottom). */
function rampHeight(dir: number, fx: number, fz: number): number {
  // fx, fz: 0..1 inside the cell. n = toward -z, e = +x, s = +z, w = -x.
  const t = dir === 0 ? 1 - fz : dir === 1 ? fx : dir === 2 ? fz : 1 - fx;
  return Math.min(1, Math.max(0, t)) * STOREY;
}

/**
 * The highest walkable surface under (x, z) at or below `maxY` (metres), or -Infinity.
 * Opaque cells give their top, floor cells their bottom, stairs their ramp.
 */
export function floorAt(world: World, x: number, z: number, maxY: number): number {
  const cx = cellOf(x, TILE);
  const cy = cellOf(z, TILE);
  const ground = world.streetLevel * STOREY;
  if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.d) return Math.max(maxY >= ground ? ground : -Infinity, world.outsideFloor(x, z, maxY));
  for (let cz = Math.min(world.h - 1, cellOf(maxY, STOREY)); cz >= 0; cz--) {
    const kind = world.kind(cx, cy, cz);
    const base = cz * STOREY;
    if (isOpaque(kind)) {
      const top = base + STOREY;
      if (top <= maxY + 1e-6) return top;
      continue;
    }
    if (kind === K.stairs) {
      const fx = x / TILE - cx;
      const fz = z / TILE - cy;
      const y = base + rampHeight(world.dir(cx, cy, cz), fx, fz);
      if (y <= maxY + 1e-6) return y;
      continue;
    }
    if (isFloor(kind) && base <= maxY + 1e-6) return base;
  }
  return -Infinity;
}

/** The centre of a cell in metres, on its floor. */
export function cellCentre(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x: (x + 0.5) * TILE, y: z * STOREY, z: (y + 0.5) * TILE };
}

/** Every cell of a kind, as [x, y, z]. */
export function cellsOf(world: World, kind: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let z = 0; z < world.h; z++) for (let y = 0; y < world.d; y++) for (let x = 0; x < world.w; x++) if (world.kind(x, y, z) === kind) out.push([x, y, z]);
  return out;
}

/** A small deterministic hash for looks (not for the sim). */
export function hash3(x: number, y: number, z: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(salt | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
