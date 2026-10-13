// New Hope's building kit (nh-building-kit, D28, D29): what one cell of the city looks like.
// The city generator (`nh-city-generator`) lays out cells; a module of this kit sculpts one
// cell (`CELL` = 4 x 12 x 4 voxels of style.ts) into a `VoxelBuilder`. A module only ever
// writes inside its own cell and depends only on its spec, never on where the cell sits, so a
// module baked alone and the same module composed into a district are the same voxels
// (`checkOffsetInvariance` proves it for every module), and cells of one building stack with
// no seam: everything is one grid and one part, so the baker draws no outline between cells.
//
// THE FUNCTION
//
//   buildCell(b: VoxelBuilder, origin: Vec3, spec: CellSpec): void
//
//   `origin` is the voxel of the builder's grid where the cell's low corner (x, y, z) sits;
//   the cell occupies origin .. origin + CELL. `spec.kind` picks the module, `spec.seed` its
//   variations, `spec.exposed` the sides that face out of the structure (see below). `empty`
//   and `lane` write nothing. `composeCells` builds a whole layout and derives `exposed`,
//   `roof` and `storey` from the neighbours, the way the city mockup will.
//
// THE CELL KINDS (`CELL_KINDS`, the names the generator and the mockup share)
//
//   empty    nothing (inside a district: air that is not a lane)
//   lane     nothing (sky-lane air; the generator uses it for traffic)
//   solid    a building's volume: a facade on every exposed side, a closed core, a roof with
//            a parapet when `roof` is set. Five facade styles (`FACADE_STYLES`).
//   deck     a walkable floor slab; a yellow-black hazard edge on exposed sides (a drop)
//   street   walkable ground: wet asphalt, a raised kerb on exposed sides, a lane dash on the
//            low lateral edge of `dir`'s axis when that edge is open, puddles from the seed
//   walkway  a bridge: a steel slab with a lit edge and railings on exposed sides
//   stairs   climbs one storey toward `dir`: three steps of 3 voxels, the fourth rise is the
//            floor slab of the cell beyond `dir` one level up
//   lift     a glass shaft cell with steel corner posts and doors on the `dir` side
//            (`open` shows the lit cabin); lift cells stack into a shaft
//   pad      a landing pad: dark plate, yellow edge on exposed sides, a target on a
//            single-cell pad, lights at exposed corners that blink with `frame`
//   ruin     the undercity: Ancestor stone floor, a broken column, a wall with an arch or a
//            rubble field, Psion crystal glowing violet; three compositions from the seed
//
// SIDES AND EXPOSURE
//
//   A side is named by the axis it faces: "+x", "+z", "-x", "-z". In the facing `sw` (the
//   grid as built) the camera sees the +z face on the left and the +x face on the right.
//   `exposed` lists the sides where the neighbour is not part of the same structure:
//   solid: not the same building; street: not street; deck, walkway, pad: a drop (air or
//   the grid's edge); lift, stairs and ruin ignore it. Every walkable surface is at local
//   y = 1 (the top of a one-voxel slab), so a character stands at level * STOREY + 1.

import { createRng, hash32 } from "@whz/det";
import { defineModel, hash3, materialIndex, ShadeTable, VoxelBuilder } from "@whz/voxel-kit";
import type { Material, Vec3, VoxelGrid, VoxelModel } from "@whz/voxel-kit";
import { palette, STOREY, TILE } from "./style.ts";

// ---------------------------------------------------------------------------------------
// The vocabulary

export const CELL_KINDS = ["empty", "lane", "solid", "deck", "street", "walkway", "stairs", "lift", "pad", "ruin"] as const;
export type CellKind = (typeof CELL_KINDS)[number];

/** The kinds that draw voxels: one module, and one asset `new-hope/kit-<kind>`, each (solid: one per style). */
export const MODULES = ["solid", "deck", "street", "walkway", "stairs", "lift", "pad", "ruin"] as const;
export type ModuleKind = (typeof MODULES)[number];

export const FACADE_STYLES = ["union", "habitat", "market", "derelict", "ancient"] as const;
export type FacadeStyle = (typeof FACADE_STYLES)[number];

export const SIDES = ["+x", "+z", "-x", "-z"] as const;
export type Side = (typeof SIDES)[number];

/** Which kinds a character walks on (the top of their slab, local y = 1). */
export const WALKABLE: readonly CellKind[] = ["deck", "street", "walkway", "stairs", "lift", "pad"];

/** The neon colours of signs; the first two have a dim slot, the others go dark when they flicker. */
export const NEON = ["neon-pink", "neon-cyan", "neon-yellow", "neon-green", "neon-violet"] as const;
const NEON_DIM: Readonly<Record<string, string>> = { "neon-pink": "neon-pink-dim", "neon-cyan": "neon-cyan-dim" };

/** Neon flicker, frame by frame: on, a dim blink, on, dark. `NEON_FLICKER_MS` are the durations. */
export const NEON_FLICKER = ["on", "dim", "on", "off"] as const;
export const NEON_FLICKER_MS = [1400, 70, 140, 90] as const;

/** The ramps the kit paints with (a kit model shades along these) and the flat light slots. */
export const KIT_RAMPS = ["concrete", "steel", "glass", "asphalt", "rust", "ancient", "psion", "plant", "red", "union", "cloth", "paint"] as const;
export const KIT_FLAT_SLOTS = ["white", "neon-pink", "neon-pink-dim", "neon-cyan", "neon-cyan-dim", "neon-yellow", "neon-green", "neon-violet", "light-warm", "light-warm-dim", "light-cold"] as const;

/** What one cell looks like. Only `kind` and `seed` are required. */
export interface CellSpec {
  readonly kind: CellKind;
  /** Variations: lit windows, signs, puddles, the ruin's composition. An unsigned 32-bit integer. */
  readonly seed: number;
  /** The facade style of a `solid`. `union` if not given. */
  readonly style?: FacadeStyle;
  /** The sides that face out of the structure (see the header). All four if not given. */
  readonly exposed?: readonly Side[];
  /** solid: the cell above is not this building, so draw the roof and the parapet. True if not given. */
  readonly roof?: boolean;
  /** solid: storeys of the same building under this cell (0 = the lowest; `market` has its shops there). 0 if not given. */
  readonly storey?: number;
  /** stairs: the side it climbs toward; lift: the door side; street: the travel axis is this side's axis. `-z` if not given. */
  readonly dir?: Side;
  /** solid: how many windows of four are lit, 0..4. 2 if not given. */
  readonly lit?: number;
  /** The animation frame: neon flicker (`NEON_FLICKER`), pad lights (even on, odd off). 0 if not given. */
  readonly frame?: number;
  /** lift: the doors are open. False if not given. */
  readonly open?: boolean;
}

// ---------------------------------------------------------------------------------------
// Writing one cell

const T = TILE - 1; // the last voxel along x and z
const TOP = STOREY - 1; // the last voxel along y
const shade = new ShadeTable(palette);
const indexCache = new Map<string, number>();

type Mat = Material | null; // null carves

function index(m: Material): number {
  const key = typeof m === "object" ? `${m[0]}.${m[1]}` : String(m);
  let i = indexCache.get(key);
  if (i === undefined) {
    i = materialIndex(palette, m);
    indexCache.set(key, i);
  }
  return i;
}

/** One cell of a builder's grid, in the cell's own coordinates (0..3, 0..11, 0..3). */
class Cell {
  readonly grid: VoxelGrid;
  readonly o: Vec3;
  constructor(b: VoxelBuilder, origin: Vec3) {
    const [ox, oy, oz] = origin;
    const [nx, ny, nz] = b.grid.size;
    if (ox < 0 || oy < 0 || oz < 0 || ox + TILE > nx || oy + STOREY > ny || oz + TILE > nz) {
      throw new RangeError(`buildCell: a cell at [${origin.join(", ")}] reaches outside the ${nx} x ${ny} x ${nz} grid`);
    }
    this.grid = b.grid;
    this.o = origin;
  }
  set(x: number, y: number, z: number, m: Mat): void {
    if (x < 0 || y < 0 || z < 0 || x > T || y > TOP || z > T) throw new RangeError(`buildCell: voxel [${x}, ${y}, ${z}] is outside the cell`);
    this.grid.set(this.o[0] + x, this.o[1] + y, this.o[2] + z, m === null ? 0 : index(m));
  }
  get(x: number, y: number, z: number): number {
    return this.grid.get(this.o[0] + x, this.o[1] + y, this.o[2] + z);
  }
  /** A box, `a` inclusive, `b` exclusive. */
  fill(a: Vec3, b: Vec3, m: Mat): void {
    for (let y = a[1]; y < b[1]; y += 1) for (let z = a[2]; z < b[2]; z += 1) for (let x = a[0]; x < b[0]; x += 1) this.set(x, y, z, m);
  }
  /** Moves some voxels of a box one step along their ramp, by a hash of the cell-local position. */
  jitter(a: Vec3, b: Vec3, seed: number, num: number, den: number): void {
    for (let y = a[1]; y < b[1]; y += 1) {
      for (let z = a[2]; z < b[2]; z += 1) {
        for (let x = a[0]; x < b[0]; x += 1) {
          const v = this.get(x, y, z);
          if (v === 0) continue;
          const h = hash3(x, y, z, seed);
          if ((h >>> 8) % den >= num) continue;
          this.grid.set(this.o[0] + x, this.o[1] + y, this.o[2] + z, shade.shift(v, (h & 1) === 0 ? 1 : -1));
        }
      }
    }
  }
}

/**
 * A point of a face in cell coordinates. `u` runs along the face from left to right as seen
 * from outside, `v` is the height, `d` the depth into the cell (0 = the outer layer). The
 * corner column of two faces is `u = 0` of exactly one of them and `u = 3` of the other.
 */
export function facePoint(side: Side, u: number, v: number, d: number): [x: number, y: number, z: number] {
  switch (side) {
    case "+z":
      return [u, v, T - d];
    case "-z":
      return [T - u, v, d];
    case "+x":
      return [T - d, v, T - u];
    case "-x":
      return [d, v, u];
  }
}

/** A point of a directional module: `f` forward toward `dir`, `l` across. */
function forwardPoint(dir: Side, f: number, l: number): [x: number, z: number] {
  switch (dir) {
    case "+z":
      return [l, f];
    case "-z":
      return [l, T - f];
    case "+x":
      return [f, l];
    case "-x":
      return [T - f, l];
  }
}

const sideIndex = (side: Side): number => SIDES.indexOf(side);

/** One face of a solid, two layers deep: what each style paints. `null` carves, `undefined` leaves the core. */
interface Face {
  readonly d0: (Mat | undefined)[];
  readonly d1: (Mat | undefined)[];
}
const newFace = (): Face => ({ d0: new Array<Mat | undefined>(TILE * STOREY).fill(undefined), d1: new Array<Mat | undefined>(TILE * STOREY).fill(undefined) });
const at = (u: number, v: number): number => v * TILE + u;

interface FaceCtx {
  readonly side: Side;
  readonly seed: number;
  readonly lit: number;
  readonly storey: number;
  readonly roof: boolean;
  readonly frame: number;
}

/** True if window `n` of a face is lit: `lit` of four, by a hash of the seed, the side and the window. */
const isLit = (ctx: FaceCtx, n: number): boolean => hash32(sideIndex(ctx.side) * 16 + n, ctx.storey, ctx.seed) % 4 < ctx.lit;

/** The neon colour of a sign at this frame of the flicker: the slot, its dim slot, or the dark backing. */
function neonAt(colour: string, frame: number): Material {
  const phase = NEON_FLICKER[((frame % 4) + 4) % 4] as string;
  if (phase === "on") return colour;
  if (phase === "dim") return NEON_DIM[colour] ?? ["steel", 0];
  return ["steel", 0];
}

// ---------------------------------------------------------------------------------------
// The facade styles of `solid`

interface Style {
  /** The hidden core and the material behind a broken window. */
  readonly core: Material;
  /** The roof surface inside the parapet. */
  readonly roof: Material;
  face(f: Face, ctx: FaceCtx): void;
  /** Roof furniture inside the parapet, in cell coordinates (y = 11 is free above the roof surface at 10). */
  roofDetail?(c: Cell, seed: number, free: readonly (readonly [number, number])[]): void;
}

const fillFace = (layer: (Mat | undefined)[], u0: number, u1: number, v0: number, v1: number, m: Mat): void => {
  for (let v = v0; v < v1; v += 1) for (let u = u0; u < u1; u += 1) layer[at(u, v)] = m;
};

/**
 * A window at u 1..2, flush with the wall. A recess one voxel deep was tried first: the corner
 * pier in front of it hides the second column, so the window shrank to a 2 px slit. Recesses
 * are kept for slits and holes (derelict, ancient), where a slit is what is meant.
 */
function window(f: Face, v0: number, v1: number, pane: Mat): void {
  fillFace(f.d0, 1, 3, v0, v1, pane);
}

const union: Style = {
  core: ["concrete", 0],
  roof: ["steel", 0],
  face(f, ctx) {
    fillFace(f.d0, 0, TILE, 0, STOREY, ["concrete", 2]);
    fillFace(f.d0, 0, TILE, 0, 1, ["union", 1]); // the storey's floor line in Union blue
    fillFace(f.d0, 1, 3, 1, 2, ["concrete", 1]); // the sill
    // Tall glass in two panes and a steel transom: cold office light or dark glass.
    window(f, 2, 6, isLit(ctx, 0) ? "light-cold" : ["glass", 1]);
    window(f, 7, 11, isLit(ctx, 1) ? "light-cold" : ["glass", 2]);
    fillFace(f.d0, 1, 3, 6, 7, ["steel", 1]); // the transom
  },
  roofDetail(c, seed, free) {
    // A vent box, or an antenna mast with a red light.
    if (free.length === 0) return;
    const rng = createRng(seed, "union-roof");
    const [x, z] = rng.pick(free);
    if (rng.chance(1, 2)) c.set(x, TOP, z, ["steel", 2]);
    else c.set(x, TOP, z, ["union", 1]);
  },
};

const habitat: Style = {
  core: ["concrete", 0],
  roof: ["concrete", 1],
  face(f, ctx) {
    fillFace(f.d0, 0, TILE, 0, STOREY, ["concrete", 1]);
    fillFace(f.d0, 0, TILE, 0, 1, ["concrete", 0]); // the slab edge
    const lit = isLit(ctx, 0);
    // Warm flats: bright, dim (a screen, a lamp at the back) or dark.
    window(f, 4, 9, lit ? (hash32(ctx.seed, sideIndex(ctx.side), 7) % 3 === 0 ? "light-warm-dim" : "light-warm") : ["glass", 1]);
    const rng = createRng(ctx.seed, `habitat/${ctx.side}/${ctx.storey}`);
    switch (rng.int(4)) {
      case 0: // an AC unit under the window
        fillFace(f.d0, 1, 3, 2, 4, ["steel", 1]);
        fillFace(f.d0, 1, 3, 3, 4, ["steel", 2]);
        break;
      case 1: {
        // Laundry on a line over the window, in cloth colours.
        const cloth: readonly Material[] = [["red", 1], ["paint", 2], ["union", 2], ["cloth", 2]];
        for (let u = 0; u < TILE; u += 1) {
          if (rng.chance(3, 4)) fillFace(f.d0, u, u + 1, 9, 11, rng.pick(cloth));
        }
        break;
      }
      case 2: // a box of plants on the sill
        fillFace(f.d0, 1, 3, 3, 4, ["plant", 1]);
        fillFace(f.d0, 1, 3, 2, 3, ["rust", 1]);
        break;
      default:
        break;
    }
    if (ctx.roof) fillFace(f.d0, 0, TILE, TOP, STOREY, ["concrete", 2]);
  },
  roofDetail(c, seed, free) {
    // A water tank on two voxels, or nothing.
    if (free.length === 0) return;
    const rng = createRng(seed, "habitat-roof");
    if (rng.chance(1, 3)) return;
    const [x, z] = rng.pick(free);
    c.set(x, TOP, z, ["rust", 1]);
  },
};

const market: Style = {
  core: ["concrete", 0],
  roof: ["concrete", 1],
  face(f, ctx) {
    const rng = createRng(ctx.seed, `market/${ctx.storey}`);
    const sign = rng.pick(NEON);
    const awning = rng.pick(["red", "paint", "union", "plant"] as const);
    fillFace(f.d0, 0, TILE, 0, STOREY, ["concrete", 1]);
    if (ctx.storey === 0) {
      // The shopfront at deck level: a lit display behind a counter, a striped awning, a neon sign.
      fillFace(f.d0, 0, TILE, 0, 1, ["concrete", 0]);
      window(f, 1, 7, isLit(ctx, 0) || ctx.lit > 0 ? "light-warm" : ["glass", 1]);
      fillFace(f.d0, 1, 3, 1, 2, ["steel", 1]); // the counter
      for (let u = 0; u < TILE; u += 1) fillFace(f.d0, u, u + 1, 7, 8, (u & 1) === 0 ? [awning, 2] : [awning, 0]);
      fillFace(f.d0, 0, TILE, 9, 11, ["steel", 0]); // the sign's backing
      const glyph = hash32(ctx.seed, sideIndex(ctx.side), 0x5167);
      for (let u = 0; u < TILE; u += 1) {
        // Letters: per column the top, the bottom or both voxels glow, so it reads as writing.
        const rows = ((glyph >>> (u * 2)) & 3) || 3;
        for (let v = 9; v < 11; v += 1) if ((rows >> (v - 9)) & 1) fillFace(f.d0, u, u + 1, v, v + 1, neonAt(sign, ctx.frame));
      }
    } else {
      // Upper storeys: flats over the shops, and a vertical neon sign on the left pier of some faces.
      fillFace(f.d0, 0, TILE, 0, 1, ["concrete", 0]);
      window(f, 4, 9, isLit(ctx, 0) ? "light-warm" : ["glass", 1]);
      if (hash32(sideIndex(ctx.side), ctx.storey, ctx.seed) % 2 === 0) fillFace(f.d0, 0, 1, 2, 11, neonAt(sign, ctx.frame));
    }
    if (ctx.roof) fillFace(f.d0, 0, TILE, TOP, STOREY, ["concrete", 2]);
  },
};

const derelict: Style = {
  core: ["concrete", 0],
  roof: ["asphalt", 1],
  face(f, ctx) {
    fillFace(f.d0, 0, TILE, 0, STOREY, ["concrete", 0]);
    const rng = createRng(ctx.seed, `derelict/${ctx.side}/${ctx.storey}`);
    // The window: dark glass, a hole into the dark core, or boarded up with rusty planks.
    fillFace(f.d0, 1, 3, 3, 9, null);
    const state = rng.int(4);
    if (state === 0) fillFace(f.d1, 1, 3, 3, 9, ["glass", 0]);
    else if (state === 1) {
      fillFace(f.d1, 1, 3, 3, 9, ["glass", 0]);
      fillFace(f.d1, rng.range(1, 2), 3, 3, rng.range(5, 8), null); // a broken pane: the dark core shows
    } else if (state === 2) {
      fillFace(f.d1, 1, 3, 3, 9, ["glass", 0]);
      fillFace(f.d0, 1, 3, 4, 5, ["rust", 1]);
      fillFace(f.d0, 1, 3, 7, 8, ["rust", 1]);
    } else fillFace(f.d1, 1, 3, 3, 9, isLit(ctx, 0) ? "light-warm-dim" : ["glass", 0]); // squatters' lamp
    // A rust streak running down from the sill.
    const streak = rng.range(1, 2);
    fillFace(f.d0, streak, streak + 1, 1, 3, ["rust", 0]);
    if (ctx.roof) {
      fillFace(f.d0, 0, TILE, TOP, STOREY, ["concrete", 1]);
      if (rng.chance(1, 2)) fillFace(f.d0, rng.range(1, 2), 3, TOP, STOREY, null); // a broken parapet
    }
  },
};

/** A Psion vein along the left pier of an ancient face: continuous across storeys, with a jog. */
const VEIN_U = [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0] as const;

const ancient: Style = {
  core: ["ancient", 0],
  roof: ["ancient", 1],
  face(f, ctx) {
    fillFace(f.d0, 0, TILE, 0, STOREY, ["ancient", 1]);
    // A tall slit with Psion light deep inside, or dark.
    fillFace(f.d0, 1, 3, 3, 9, null);
    fillFace(f.d1, 1, 3, 3, 9, isLit(ctx, 0) ? "neon-violet" : ["psion", 0]);
    fillFace(f.d0, 1, 3, 9, 10, ["ancient", 2]); // the lintel
    for (let v = 0; v < STOREY; v += 1) {
      const u = VEIN_U[v] as number;
      if (v >= 3 && v < 9 && u > 0) continue; // the slit
      fillFace(f.d0, u, u + 1, v, v + 1, ["psion", 2]);
    }
    if (ctx.roof) fillFace(f.d0, 0, TILE, TOP, STOREY, ["ancient", 2]);
  },
  roofDetail(c, seed, free) {
    // A Psion crystal growing out of the roof.
    if (free.length === 0) return;
    const [x, z] = createRng(seed, "ancient-roof").pick(free);
    c.set(x, TOP, z, ["psion", 2]);
  },
};

const STYLES: Readonly<Record<FacadeStyle, Style>> = { union, habitat, market, derelict, ancient };

// ---------------------------------------------------------------------------------------
// The modules

interface Ctx {
  readonly c: Cell;
  readonly spec: CellSpec;
  readonly exposed: ReadonlySet<Side>;
  readonly seed: number;
  readonly frame: number;
}

function solid({ c, spec, exposed, seed, frame }: Ctx): void {
  const style = STYLES[spec.style ?? "union"];
  const roof = spec.roof ?? true;
  const storey = spec.storey ?? 0;
  const lit = spec.lit ?? 2;
  if (!Number.isInteger(lit) || lit < 0 || lit > 4) throw new RangeError(`buildCell: lit must be 0..4, got ${String(lit)}`);
  c.fill([0, 0, 0], [TILE, STOREY, TILE], style.core);
  // The recessed layer of every face first, then the outer layer: a corner column is the
  // outer layer of two faces, and the recesses (u 1..2) never touch it.
  const faces = SIDES.filter((side) => exposed.has(side)).map((side) => {
    const f = newFace();
    style.face(f, { side, seed, lit, storey, roof, frame });
    return [side, f] as const;
  });
  for (const layer of ["d1", "d0"] as const) {
    for (const [side, f] of faces) {
      for (let v = 0; v < STOREY; v += 1) {
        for (let u = 0; u < TILE; u += 1) {
          const m = f[layer][at(u, v)];
          if (m === undefined) continue;
          const [x, y, z] = facePoint(side, u, v, layer === "d0" ? 0 : 1);
          c.set(x, y, z, m);
        }
      }
    }
  }
  if (!roof) return;
  // The roof: a parapet on the exposed edges, the surface one voxel lower inside it.
  const free: [number, number][] = [];
  for (let z = 0; z < TILE; z += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const edge = (x === 0 && exposed.has("-x")) || (x === T && exposed.has("+x")) || (z === 0 && exposed.has("-z")) || (z === T && exposed.has("+z"));
      if (edge) continue;
      c.set(x, TOP, z, null);
      c.set(x, TOP - 1, z, style.roof);
      if (x > 0 && x < T && z > 0 && z < T) free.push([x, z]);
    }
  }
  style.roofDetail?.(c, seed, free);
}

/** Paints a module's exposed edges: `edge(side, u)` gives the material of the outer voxel at u of that side's slab row. */
function edges(ctx: Ctx, y: number, edge: (side: Side, u: number) => Mat | undefined): void {
  for (const side of SIDES) {
    if (!ctx.exposed.has(side)) continue;
    for (let u = 0; u < TILE; u += 1) {
      const m = edge(side, u);
      if (m === undefined) continue;
      const [x, , z] = facePoint(side, u, 0, 0);
      ctx.c.set(x, y, z, m);
    }
  }
}

function deck(ctx: Ctx): void {
  const { c, seed } = ctx;
  c.fill([0, 0, 0], [TILE, 1, TILE], ["steel", 1]);
  c.jitter([0, 0, 0], [TILE, 1, TILE], seed, 1, 3);
  // A dark trim along a drop with one yellow hazard mark per cell, in step across cells.
  edges(ctx, 0, (_side, u) => (u === 1 ? ["paint", 1] : ["steel", 0]));
}

function street(ctx: Ctx): void {
  const { c, seed, exposed } = ctx;
  const dir = ctx.spec.dir ?? "-z";
  c.fill([0, 0, 0], [TILE, 1, TILE], ["asphalt", 0]);
  c.jitter([0, 0, 0], [TILE, 1, TILE], seed, 1, 4);
  const rng = createRng(seed, "street");
  // Wet asphalt: a puddle of two voxels that holds a neon reflection now and then.
  if (rng.chance(2, 3)) {
    const px = rng.range(1, 2);
    const pz = rng.range(1, 2);
    c.set(px, 0, pz, ["glass", 1]);
    c.set(px - 1, 0, pz, rng.chance(1, 2) ? (rng.chance(1, 2) ? "neon-pink-dim" : "neon-cyan-dim") : ["glass", 1]);
  }
  // A lane dash on the low lateral edge, when that edge is not a kerb.
  const alongX = dir === "+x" || dir === "-x";
  const lowSide: Side = alongX ? "-z" : "-x";
  if (!exposed.has(lowSide)) {
    for (let f = 1; f < 3; f += 1) {
      if (alongX) c.set(f, 0, 0, ["paint", 1]);
      else c.set(0, 0, f, ["paint", 1]);
    }
  }
  // A raised kerb, one voxel wide, on every exposed side.
  edges(ctx, 0, () => ["concrete", 1]);
  edges(ctx, 1, () => ["concrete", 1]);
}

function walkway(ctx: Ctx): void {
  const { c, seed } = ctx;
  c.fill([0, 0, 0], [TILE, 1, TILE], ["steel", 1]);
  c.jitter([0, 0, 0], [TILE, 1, TILE], seed, 1, 4);
  // Along an open side: a dashed light in the slab's edge, one post in the middle of the
  // side and a low rail. Corner posts were tried first: four posts and a closed
  // rail ring made a single cell read as a crate.
  edges(ctx, 0, (_side, u) => (u === 1 || u === 2 ? "neon-cyan-dim" : undefined));
  for (const side of SIDES) {
    if (!ctx.exposed.has(side)) continue;
    const [x, y, z] = facePoint(side, 1, 1, 0);
    c.set(x, y, z, ["steel", 0]);
  }
  // Knee height: a rail at 3 voxels covered half of a one-cell bridge. Dark, so it reads as a
  // line against the light floor.
  edges(ctx, 2, () => ["steel", 0]);
}

function stairs(ctx: Ctx): void {
  const { c, seed } = ctx;
  const dir = ctx.spec.dir ?? "-z";
  // f = 0 is the landing (the slab), f = 1..3 are steps with their tops at 4, 7, 10; the
  // fourth rise is the floor slab of the cell beyond `dir` one storey up (top at 13).
  for (let f = 0; f < TILE; f += 1) {
    const top = f === 0 ? 1 : 1 + 3 * f;
    for (let l = 0; l < TILE; l += 1) {
      const [x, z] = forwardPoint(dir, f, l);
      for (let y = 0; y < top - 1; y += 1) c.set(x, y, z, ["concrete", 1]);
      c.set(x, top - 1, z, f === 0 ? ["steel", 1] : l === 0 || l === T ? ["paint", 1] : ["steel", 1]);
    }
  }
  c.jitter([0, 0, 0], [TILE, 1, TILE], seed, 1, 4);
}

function lift(ctx: Ctx): void {
  const { c, seed } = ctx;
  const door = ctx.spec.dir ?? "-z";
  const open = ctx.spec.open ?? false;
  c.fill([0, 0, 0], [TILE, 1, TILE], ["steel", 0]);
  for (const side of SIDES) {
    for (let v = 1; v < STOREY; v += 1) {
      for (let u = 0; u < TILE; u += 1) {
        const [x, y, z] = facePoint(side, u, v, 0);
        const post = u === 0 || u === T;
        if (post) c.set(x, y, z, ["steel", 1]);
        else if (v === TOP) c.set(x, y, z, ["steel", 1]); // the ring beam
        else if (side !== door) c.set(x, y, z, v === 6 ? ["steel", 0] : ["glass", 2]); // shaft glass with a rail
        else if (v >= 9) c.set(x, y, z, v === 9 && u === 1 ? (open ? "neon-green" : "neon-yellow") : ["steel", 1]);
        else if (!open) c.set(x, y, z, ["steel", 2]); // the doors
      }
    }
  }
  // The lit cabin shows through the open doors.
  if (open) c.fill([1, 1, 1], [3, 9, 3], "light-cold");
  c.jitter([0, 0, 0], [TILE, 1, TILE], seed, 1, 4);
}

function pad(ctx: Ctx): void {
  const { c, exposed, frame } = ctx;
  c.fill([0, 0, 0], [TILE, 1, TILE], ["asphalt", 1]);
  // Yellow dashes along the open edges: a full yellow rim and a target were tried first and
  // turned a single pad into a yellow blob.
  edges(ctx, 0, (_side, u) => (u === 1 || u === 2 ? ["paint", 1] : undefined));
  // A light set into the slab on every corner where two open sides meet. Lamps standing on
  // the slab were tried first: four green voxels outweighed the pad.
  // The seed picks the operator's colour: green (public), cyan (Union) or pink (private).
  const light = createRng(ctx.seed, "pad").pick(["neon-green", "neon-cyan", "neon-pink"] as const);
  const on = (frame & 1) === 0;
  for (const side of SIDES) {
    const next = SIDES[(sideIndex(side) + 1) % 4] as Side; // the face whose u = 3 is this face's u = 0
    if (!exposed.has(side) || !exposed.has(next)) continue;
    const [x, , z] = facePoint(side, 0, 0, 0);
    c.set(x, 0, z, on ? light : ["steel", 0]);
  }
}

function ruin({ c, seed }: Ctx): void {
  const rng = createRng(seed, "ruin");
  c.fill([0, 0, 0], [TILE, 1, TILE], ["ancient", 1]);
  c.jitter([0, 0, 0], [TILE, 1, TILE], seed, 1, 3);
  const crystal = (x: number, z: number, h: number): void => {
    // A shard of Psion crystal: dark at the root, light at the tip, a violet glow at its heart.
    for (let y = 1; y <= h; y += 1) c.set(x, y, z, y === h ? ["psion", 2] : y === 1 ? ["psion", 0] : ["psion", 1]);
    if (h >= 3) c.set(x, 2, z, "neon-violet");
  };
  switch (rng.int(3)) {
    case 0: {
      // A broken column of two by two, its top knocked off at one corner, crystal at its foot.
      const h = rng.range(6, 10);
      c.fill([1, 1, 1], [3, h, 3], ["ancient", 1]);
      c.fill([1, h - 1, 1], [3, h, 3], ["ancient", 2]);
      c.set(rng.range(1, 2), h - 1, rng.range(1, 2), null);
      c.set(0, 1, 2, ["ancient", 0]);
      crystal(3, 0, rng.range(3, 4));
      crystal(3, 1, 2);
      break;
    }
    case 1: {
      // A wall along one side with a broken top and a doorway; a vein of crystal in it.
      const side = rng.pick(SIDES);
      const tops = [rng.range(6, 9), rng.range(5, 9), rng.range(4, 8), rng.range(2, 6)];
      for (let u = 0; u < TILE; u += 1) {
        for (let v = 1; v < (tops[u] as number); v += 1) {
          const [x, y, z] = facePoint(side, u, v, 1);
          c.set(x, y, z, v === (tops[u] as number) - 1 ? ["ancient", 2] : ["ancient", 1]);
        }
      }
      for (let v = 1; v < 4; v += 1) {
        const [x, y, z] = facePoint(side, 1, v, 1);
        c.set(x, y, z, null); // the doorway
      }
      const [vx, vy, vz] = facePoint(side, 2, 2, 1);
      c.set(vx, vy, vz, ["psion", 2]);
      c.set(vx, vy + 1, vz, ["psion", 2]);
      const [rx, , rz] = facePoint(side, rng.range(0, 3), 0, 3);
      c.set(rx, 1, rz, ["ancient", 0]); // a fallen block
      break;
    }
    default: {
      // Rubble and a crystal cluster.
      for (let i = 0; i < 4; i += 1) {
        const x = rng.range(0, T);
        const z = rng.range(0, T);
        c.set(x, 1, z, rng.chance(1, 2) ? ["ancient", 0] : ["ancient", 2]);
      }
      crystal(1, 2, rng.range(4, 5));
      crystal(2, 2, 3);
      crystal(1, 1, 2);
      break;
    }
  }
}

const BUILDERS: Readonly<Record<ModuleKind, (ctx: Ctx) => void>> = { solid, deck, street, walkway, stairs, lift, pad, ruin };

/** Sculpts one cell into `b` with its low corner at `origin`. `empty` and `lane` write nothing. */
export function buildCell(b: VoxelBuilder, origin: Vec3, spec: CellSpec): void {
  if (!(CELL_KINDS as readonly string[]).includes(spec.kind)) throw new RangeError(`buildCell: no cell kind ${JSON.stringify(spec.kind)} (kinds: ${CELL_KINDS.join(", ")})`);
  if (spec.kind === "empty" || spec.kind === "lane") return;
  const c = new Cell(b, origin);
  BUILDERS[spec.kind]({ c, spec, exposed: new Set(spec.exposed ?? SIDES), seed: spec.seed >>> 0, frame: spec.frame ?? 0 });
}

// ---------------------------------------------------------------------------------------
// Composing a layout

/** One cell of a layout, as the generator gives it. */
export interface LayoutCell {
  readonly kind: CellKind;
  /** The building a `solid` belongs to: cells of one building join without facades between them. */
  readonly building?: number;
  readonly style?: FacadeStyle;
  readonly dir?: Side;
  /** The cell's seed; derived from the position and the layout's seed if not given. */
  readonly seed?: number;
  readonly open?: boolean;
}

export interface Layout {
  /** Cells along x, levels, cells along z. */
  readonly size: readonly [cx: number, levels: number, cz: number];
  /** The seed cells derive theirs from. */
  readonly seed: number;
  /** The cell at a position; outside the layout is never asked. */
  cell(cx: number, level: number, cz: number): LayoutCell;
  /** solid: lit windows of four. 2 if not given. */
  readonly lit?: number;
  readonly frame?: number;
}

const STEP: Readonly<Record<Side, readonly [number, number]>> = { "+x": [1, 0], "+z": [0, 1], "-x": [-1, 0], "-z": [0, -1] };

/** The spec of the cell at a position of a layout: `exposed`, `roof` and `storey` from its neighbours. */
export function cellSpecAt(layout: Layout, cx: number, level: number, cz: number): CellSpec {
  const [w, h, d] = layout.size;
  const here = layout.cell(cx, level, cz);
  const get = (x: number, l: number, z: number): LayoutCell | null => (x < 0 || l < 0 || z < 0 || x >= w || l >= h || z >= d ? null : layout.cell(x, l, z));
  const sameBuilding = (o: LayoutCell | null): boolean => o !== null && o.kind === "solid" && o.building === here.building;
  const isDrop = (o: LayoutCell | null): boolean => o === null || o.kind === "empty" || o.kind === "lane";
  const exposed = SIDES.filter((side) => {
    const [dx, dz] = STEP[side];
    const o = get(cx + dx, level, cz + dz);
    if (here.kind === "solid") return !sameBuilding(o);
    // Beyond the layout's edge a street goes on (no kerb), and everything else meets a drop.
    if (here.kind === "street") return o !== null && o.kind !== "street";
    if (here.kind === "pad") return o === null || o.kind !== "pad";
    return isDrop(o);
  });
  let storey = 0;
  if (here.kind === "solid") while (sameBuilding(get(cx, level - storey - 1, cz))) storey += 1;
  const spec: CellSpec = {
    kind: here.kind,
    seed: here.seed ?? hash32(cx, cz, hash32(level, here.building ?? 0, layout.seed)),
    exposed,
    roof: here.kind === "solid" ? !sameBuilding(get(cx, level + 1, cz)) : true,
    storey,
    lit: layout.lit ?? 2,
    frame: layout.frame ?? 0,
    open: here.open ?? false,
    ...(here.style === undefined ? {} : { style: here.style }),
    ...(here.dir === undefined ? {} : { dir: here.dir }),
  };
  return spec;
}

/** Builds every cell of a layout into `b`, cell (cx, level, cz) at `origin + (cx, level, cz) * CELL`. */
export function composeCells(b: VoxelBuilder, layout: Layout, origin: Vec3 = [0, 0, 0]): void {
  const [w, h, d] = layout.size;
  for (let level = 0; level < h; level += 1) {
    for (let cz = 0; cz < d; cz += 1) {
      for (let cx = 0; cx < w; cx += 1) {
        buildCell(b, [origin[0] + cx * TILE, origin[1] + level * STOREY, origin[2] + cz * TILE], cellSpecAt(layout, cx, level, cz));
      }
    }
  }
}

/** A model of a kit grid: one part (so no contour between cells), the kit's ramps and light slots. */
export function kitModel(grid: VoxelGrid): VoxelModel {
  const [nx, ny, nz] = grid.size;
  return defineModel({
    size: [nx, ny, nz],
    palette,
    parts: [{ name: "kit", grid, pivot: [nx >> 1, 0, nz >> 1] }],
    ramps: KIT_RAMPS,
    flatSlots: KIT_FLAT_SLOTS,
    budget: nx * ny * nz,
    tile: [nx, nz],
  });
}

/**
 * Builds a cell alone and the same cell at an offset inside a larger grid, and throws if one
 * voxel differs: the proof that modules compose without depending on where they sit.
 */
export function checkOffsetInvariance(spec: CellSpec, offset: Vec3 = [TILE, STOREY, 2 * TILE]): void {
  const alone = new VoxelBuilder(palette, [TILE, STOREY, TILE]);
  buildCell(alone, [0, 0, 0], spec);
  const big = new VoxelBuilder(palette, [offset[0] + 2 * TILE, offset[1] + 2 * STOREY, offset[2] + 2 * TILE]);
  buildCell(big, offset, spec);
  for (let y = 0; y < STOREY; y += 1) {
    for (let z = 0; z < TILE; z += 1) {
      for (let x = 0; x < TILE; x += 1) {
        if (alone.grid.get(x, y, z) !== big.grid.get(offset[0] + x, offset[1] + y, offset[2] + z)) {
          throw new Error(`kit: the ${spec.kind} module differs at [${x}, ${y}, ${z}] when built at [${offset.join(", ")}]`);
        }
      }
    }
  }
  if (big.grid.count() !== alone.grid.count()) throw new Error(`kit: the ${spec.kind} module writes outside its cell`);
}
