// generateDistrict(seed, params): one district of New Hope's city as a grid of cells.
//
// The method follows the owner's No Man's Sky notes (docs/references.md): one static seed,
// seeds below it derived from position (a hash of where a block or a lot is, not draws from
// one long stream), archetypes plus parameters, and traversability as the thing to tune.
//
// The order of the passes, each only adding to what is there:
//   1. street lines (positions from a hash of the line's index) and the blocks between them;
//   2. lots: a block is one megablock, or is cut into lots by one-tile alleys;
//   3. buildings: an archetype per lot (slab, tower, stepped tower, megablock), tiers with
//      heights from the lot's seed, terraces on the setbacks, a roof deck on top;
//   4. a lift per tier, from the street (or the terrace it stands on) to the next deck;
//   5. stairs from the street up onto megablock podiums;
//   6. landing pads on some roofs, each with a lane straight up to the lane network;
//   7. the sky lanes: a grid above every roof, and some lanes down in the street canyons;
//   8. walkways between buildings on the middle and upper bands;
//   9. undercity halls under some street segments, with stairs down from the street, and
//      deeper halls under some of them.
// A pass that opens a floor (a stairwell through a deck or a street) checks that the cells the
// opened one joined still reach each other, and undoes that one change otherwise. The result is checked by
// checkDistrict; a district that fails it is a bug in this file.

import { createRng, fnv1a32, hash32 } from "@whz/det";
import type { Rng } from "@whz/det";
import { DX, DY, F, isFlat, K, opposite } from "./cells.ts";
import type { FacadeStyle } from "./cells.ts";
import { connectedAll, forEachWalkNeighbour } from "./check.ts";
import { cellIndex, createGrid, inGrid } from "./grid.ts";
import type { CellGrid } from "./grid.ts";
import { resolveParams } from "./params.ts";
import type { DistrictParams } from "./params.ts";

export const ARCHETYPES = ["slab", "tower", "stepped", "megablock"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

/** A rectangle of tiles on the plan: `x .. x + w - 1` by `y .. y + h - 1`. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One tier of a building: its footprint is solid from level `base` to level `top`. */
export interface Tier {
  readonly rect: Rect;
  readonly base: number;
  readonly top: number;
}

export interface Building {
  /** 1.., the value of `District.building` for its cells. */
  readonly id: number;
  readonly archetype: Archetype;
  /** The facade style of the building; single storeys may differ (shopfronts, Union floors). */
  readonly style: FacadeStyle;
  /** The lot it stands on. */
  readonly lot: Rect;
  /** From the bottom up; each tier's footprint lies inside the one below. */
  readonly tiers: readonly Tier[];
  /** The level of the roof deck (the top tier's top + 1). */
  readonly roof: number;
  /** The lot's seed (a hash of its position and the district seed). */
  readonly seed: number;
}

export interface District extends CellGrid {
  readonly seed: number;
  readonly params: DistrictParams;
  /** The first tile of each street line: `columns` run north-south (an x), `rows` east-west (a y). */
  readonly streets: { readonly columns: readonly number[]; readonly rows: readonly number[] };
  readonly buildings: readonly Building[];
  /** How many walkways were built. */
  readonly walkways: number;
}

const STYLES: readonly FacadeStyle[] = ["union", "habitat", "market", "derelict", "ancient"];

/** Weights of the facade styles (in STYLES order) per archetype. */
const STYLE_WEIGHTS: Record<Archetype, readonly number[]> = {
  slab: [10, 45, 15, 30, 0],
  tower: [40, 35, 0, 15, 10],
  stepped: [45, 30, 0, 5, 20],
  megablock: [50, 40, 0, 10, 0],
};

function inset(rect: Rect, n: number, e: number, s: number, w: number): Rect {
  return { x: rect.x + w, y: rect.y + n, w: rect.w - w - e, h: rect.h - n - s };
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

/** The cells of a rectangle, row by row. */
function* cellsOf(rect: Rect): Generator<readonly [number, number]> {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) yield [x, y];
  }
}

/** A seed for one concern of the district: the same name always gives the same sub-seed. */
function subSeed(seed: number, name: string): number {
  return hash32(fnv1a32(name), 0, seed);
}

/** Tops of `n` tiers from `base` up to `top`, each at least two storeys (fewer tiers if they do not fit). */
function tierTops(base: number, top: number, n: number, rng: Rng): number[] {
  let count = n;
  while (count > 1 && top - base + 1 < 2 * count) count -= 1;
  const tops: number[] = [];
  let from = base;
  for (let k = 0; k < count - 1; k += 1) {
    const left = count - 1 - k; // tiers still to place above this one
    const t = rng.range(from + 1, top - 2 * left);
    tops.push(t);
    from = t + 1;
  }
  tops.push(top);
  return tops;
}

class Builder {
  readonly grid: CellGrid;
  readonly p: DistrictParams;
  readonly street: number;
  readonly streetCol: Uint8Array;
  readonly streetRow: Uint8Array;
  /** The building of each plan cell's ground-floor footprint, 0 for none. */
  readonly footprint: Uint16Array;

  constructor(p: DistrictParams) {
    this.p = p;
    this.grid = createGrid(p.width, p.depth, p.levels);
    this.street = p.bands.streets[0];
    this.streetCol = new Uint8Array(p.width);
    this.streetRow = new Uint8Array(p.depth);
    this.footprint = new Uint16Array(p.width * p.depth);
  }

  i(x: number, y: number, z: number): number {
    return cellIndex(this.grid, x, y, z);
  }

  kindAt(x: number, y: number, z: number): number {
    return inGrid(this.grid, x, y, z) ? (this.grid.kind[this.i(x, y, z)] as number) : -1;
  }

  set(x: number, y: number, z: number, kind: number, building = 0, facade = 0, dir = 0): void {
    const i = this.i(x, y, z);
    this.grid.kind[i] = kind;
    this.grid.building[i] = building;
    this.grid.facade[i] = facade;
    this.grid.dir[i] = dir;
  }

  /** What a cell holds, to put it back. */
  save(x: number, y: number, z: number): readonly [number, number, number, number, number, number, number] {
    const i = this.i(x, y, z);
    const g = this.grid;
    return [x, y, z, g.kind[i] as number, g.building[i] as number, g.facade[i] as number, g.dir[i] as number];
  }

  restore(saved: readonly (readonly [number, number, number, number, number, number, number])[]): void {
    for (let n = saved.length - 1; n >= 0; n -= 1) {
      const [x, y, z, kind, building, facade, dir] = saved[n] as readonly [number, number, number, number, number, number, number];
      this.set(x, y, z, kind, building, facade, dir);
    }
  }

  /** True when some stairs land on this cell (it is their low or high landing). */
  isLanding(x: number, y: number, z: number): boolean {
    for (let d = 0; d < 4; d += 1) {
      const nx = x + (DX[d] as number);
      const ny = y + (DY[d] as number);
      if (this.kindAt(nx, ny, z) === K.stairs && this.grid.dir[this.i(nx, ny, z)] === d) return true;
      if (this.kindAt(nx, ny, z - 1) === K.stairs && this.grid.dir[this.i(nx, ny, z - 1)] === opposite(d)) return true;
    }
    return false;
  }
}

/** Positions of street lines along one axis: line `n` is followed by a block of hashed size. */
function streetLines(size: number, axis: number, p: DistrictParams, seed: number): number[] {
  const lines: number[] = [];
  let pos = 0;
  for (let n = 0; pos < size; n += 1) {
    lines.push(pos);
    pos += p.streetWidth + p.blockMin + (hash32(n, axis, seed) % (p.blockMax - p.blockMin + 1));
  }
  return lines;
}

/** Spans between street lines: the blocks' extent along one axis. */
function spans(lines: readonly number[], size: number, width: number): Array<readonly [number, number]> {
  const result: Array<readonly [number, number]> = [];
  for (let n = 0; n < lines.length; n += 1) {
    const from = (lines[n] as number) + width;
    const to = (n + 1 < lines.length ? (lines[n + 1] as number) : size) - 1;
    if (to >= from) result.push([from, to]);
  }
  return result;
}

/** Cuts a block into lots with one-tile alleys between them (guillotine cuts, so every alley reaches a street). */
function splitLots(rect: Rect, rng: Rng, depth: number, out: Rect[]): void {
  const long = Math.max(rect.w, rect.h);
  if (depth < 2 && long >= 7 && (long >= 10 || rng.chance(1, 2))) {
    const across = rect.w > rect.h || (rect.w === rect.h && rng.chance(1, 2));
    const side = across ? rect.w : rect.h;
    const cut = rng.range(3, side - 4);
    if (across) {
      splitLots({ x: rect.x, y: rect.y, w: cut, h: rect.h }, rng, depth + 1, out);
      splitLots({ x: rect.x + cut + 1, y: rect.y, w: side - cut - 1, h: rect.h }, rng, depth + 1, out);
    } else {
      splitLots({ x: rect.x, y: rect.y, w: rect.w, h: cut }, rng, depth + 1, out);
      splitLots({ x: rect.x, y: rect.y + cut + 1, w: rect.w, h: side - cut - 1 }, rng, depth + 1, out);
    }
    return;
  }
  out.push(rect);
}

/** Insets a rectangle by 0 or 1 tile per side, keeping it at least `min` on both axes. */
function randomInset(rect: Rect, min: number, rng: Rng): Rect {
  const n = rng.int(2);
  const e = rng.int(2);
  const s = rng.int(2);
  const w = rng.int(2);
  const result = inset(rect, n, e, s, w);
  if (result.w >= min && result.h >= min) return result;
  const half = inset(rect, n, 0, s, 0);
  if (half.w >= min && half.h >= min) return half;
  return rect;
}

interface Plan {
  readonly archetype: Archetype;
  readonly lot: Rect;
  readonly seed: number;
}

function planBuilding(b: Builder, plan: Plan, id: number): Building {
  const { p } = b;
  const { bands } = p;
  const s = b.street;
  const rng = createRng(plan.seed, "building");
  const rects: Rect[] = [];
  let tops: number[];
  if (plan.archetype === "megablock") {
    const podium = plan.lot;
    rects.push(podium);
    let tower = inset(podium, rng.range(2, 3), rng.range(2, 3), rng.range(2, 3), rng.range(2, 3));
    if (tower.w < 2 || tower.h < 2) tower = inset(podium, 2, 2, 2, 2);
    rects.push(tower);
    const final = rng.range(bands.middle[1], bands.roofs[1] - 1);
    const upper = tower.w >= 5 && tower.h >= 5 && rng.chance(1, 2) ? tierTops(s + 1, final, 2, rng) : [final];
    if (upper.length === 2) rects.push(inset(tower, 1, 1, 1, 1));
    tops = [s, ...upper];
  } else if (plan.archetype === "stepped") {
    const base = randomInset(plan.lot, 5, rng);
    const min = Math.min(base.w, base.h);
    const wanted = min >= 6 ? 3 : 2;
    const final = rng.range(bands.upper[0], bands.roofs[1] - 1);
    tops = tierTops(s, final, wanted, rng);
    rects.push(base);
    for (let k = 1; k < tops.length; k += 1) rects.push(inset(rects[k - 1] as Rect, 1, 1, 1, 1));
  } else {
    rects.push(randomInset(plan.lot, 2, rng));
    tops = [plan.archetype === "slab" ? rng.range(bands.streets[1], bands.upper[0]) : rng.range(bands.middle[1], bands.roofs[1] - 1)];
  }
  const bases = tops.map((_, k) => (k === 0 ? s : (tops[k - 1] as number) + 1));
  const tiers: Tier[] = rects.map((rect, k) => ({ rect, base: bases[k] as number, top: tops[k] as number }));
  const style = STYLES[rng.weighted(STYLE_WEIGHTS[plan.archetype])] as FacadeStyle;
  const shopfront = rng.chance(1, 2);
  const colonised = rng.chance(1, 2);

  const facadeAt = (k: number, z: number): number => {
    if (plan.archetype === "megablock" && k === 0) return F.market;
    if ((style === "habitat" || style === "derelict") && z === s && shopfront) return F.market;
    if (style === "habitat" && z >= bands.upper[0] && colonised) return F.union;
    return F[style];
  };

  for (let k = 0; k < tiers.length; k += 1) {
    const tier = tiers[k] as Tier;
    for (let z = tier.base; z <= tier.top; z += 1) {
      for (const [x, y] of cellsOf(tier.rect)) b.set(x, y, z, K.solid, id, facadeAt(k, z));
    }
    const next = tiers[k + 1];
    for (const [x, y] of cellsOf(tier.rect)) {
      if (next === undefined || !contains(next.rect, x, y)) b.set(x, y, tier.top + 1, K.deck, id);
    }
  }
  for (const [x, y] of cellsOf((tiers[0] as Tier).rect)) b.footprint[y * p.width + x] = id;
  return { id, archetype: plan.archetype, style, lot: plan.lot, tiers, roof: (tiers[tiers.length - 1] as Tier).top + 1, seed: plan.seed };
}

/** The boundary cells of a rectangle with each outward direction, row by row. */
function boundary(rect: Rect): Array<readonly [number, number, number]> {
  const out: Array<readonly [number, number, number]> = [];
  for (const [x, y] of cellsOf(rect)) {
    for (let d = 0; d < 4; d += 1) {
      if (!contains(rect, x + (DX[d] as number), y + (DY[d] as number))) out.push([x, y, d]);
    }
  }
  return out;
}

/** A lift per tier: from the street (tier 0) or the terrace below, up to the tier's roof or terrace deck. */
function placeLifts(b: Builder, building: Building): void {
  const rng = createRng(building.seed, "lifts");
  let prevHead: readonly [number, number] | null = null;
  for (let k = 0; k < building.tiers.length; k += 1) {
    const tier = building.tiers[k] as Tier;
    const head = tier.top + 1;
    const candidates = boundary(tier.rect).filter(([x, y, d]) => {
      const ox = x + (DX[d] as number);
      const oy = y + (DY[d] as number);
      if (prevHead !== null && ox === prevHead[0] && oy === prevHead[1]) return false;
      const want = k === 0 ? K.street : K.deck;
      if (b.kindAt(ox, oy, tier.base) !== want) return false;
      for (let e = 0; e < 4; e += 1) {
        if (b.kindAt(x + (DX[e] as number), y + (DY[e] as number), head) === K.deck) return true;
      }
      return false;
    });
    if (candidates.length === 0) throw new Error(`citygen: building ${building.id} tier ${k} has no place for a lift`);
    const [x, y, d] = rng.pick(candidates);
    for (let z = tier.base; z < head; z += 1) b.set(x, y, z, K.lift, building.id, 0, d);
    const turn = rng.int(4);
    let door = -1;
    for (let n = 0; n < 4 && door < 0; n += 1) {
      const e = (turn + n) & 3;
      if (b.kindAt(x + (DX[e] as number), y + (DY[e] as number), head) === K.deck) door = e;
    }
    b.set(x, y, head, K.lift, building.id, 0, door);
    prevHead = [x, y];
  }
}

/** Opens a stairwell: stairs at (x, y, z) climbing toward `d`, the cell above emptied. Undone if it cuts the walk network. */
function tryStairs(b: Builder, x: number, y: number, z: number, d: number, building: number): boolean {
  const lx = x - (DX[d] as number);
  const ly = y - (DY[d] as number);
  const hx = x + (DX[d] as number);
  const hy = y + (DY[d] as number);
  if (!isFlat(b.kindAt(lx, ly, z)) || !isFlat(b.kindAt(hx, hy, z + 1))) return false;
  if (b.kindAt(x, y, z + 1) !== K.empty && (!isFlat(b.kindAt(x, y, z + 1)) || b.isLanding(x, y, z + 1))) return false;
  // The cell itself must not be a way already, nor the headroom of stairs below.
  if (b.kindAt(x, y, z) === K.stairs || b.kindAt(x, y, z) === K.lift || b.kindAt(x, y, z - 1) === K.stairs) return false;
  // The cells that must still reach each other: both landings and whatever the opened cell joined.
  const targets = [b.i(lx, ly, z), b.i(hx, hy, z + 1)];
  if (isFlat(b.kindAt(x, y, z + 1))) forEachWalkNeighbour(b.grid, b.i(x, y, z + 1), (j) => targets.push(j));
  const saved = [b.save(x, y, z), b.save(x, y, z + 1)];
  b.set(x, y, z, K.stairs, building, 0, d);
  b.set(x, y, z + 1, K.empty);
  if (connectedAll(b.grid, targets)) return true;
  b.restore(saved);
  return false;
}

/** Stairs from the street up onto a megablock's podium deck, cut into the podium's edge. */
function placePodiumStairs(b: Builder, building: Building): void {
  const rng = createRng(building.seed, "podium-stairs");
  const podium = building.tiers[0] as Tier;
  const s = b.street;
  const candidates = rng.shuffle(
    boundary(podium.rect).filter(([x, y, o]) => {
      let outward = 0;
      for (let e = 0; e < 4; e += 1) if (!contains(podium.rect, x + (DX[e] as number), y + (DY[e] as number))) outward += 1;
      return outward === 1 && b.kindAt(x + (DX[o] as number), y + (DY[o] as number), s) === K.street && b.kindAt(x, y, s) === K.solid;
    }),
  );
  let placed = 0;
  const want = rng.range(1, 3);
  for (const [x, y, o] of candidates) {
    if (placed >= want) break;
    if (tryStairs(b, x, y, s, opposite(o), building.id)) placed += 1;
  }
}

/** Landing pads on some roofs, each with a lane straight up to the lane level and on to the nearest lane row. */
function placePads(b: Builder, buildings: readonly Building[]): void {
  const { p } = b;
  const laneLevel = p.bands.lanes[0];
  for (const building of buildings) {
    const rng = createRng(building.seed, "pad");
    if (!rng.chance(p.padChance, 100)) continue;
    const top = building.tiers[building.tiers.length - 1] as Tier;
    const decks = [...cellsOf(top.rect)].filter(([x, y]) => b.kindAt(x, y, building.roof) === K.deck);
    if (decks.length < 3) continue;
    const [x, y] = rng.pick(decks);
    b.set(x, y, building.roof, K.pad, building.id);
    for (let z = building.roof + 1; z <= laneLevel; z += 1) b.set(x, y, z, K.lane);
    let row = -1;
    for (let dy = 0; row < 0 && dy < p.depth; dy += 1) {
      if (y - dy >= 0 && b.streetRow[y - dy] === 1) row = y - dy;
      else if (y + dy < p.depth && b.streetRow[y + dy] === 1) row = y + dy;
    }
    for (let yy = Math.min(row, y); yy <= Math.max(row, y); yy += 1) {
      if (b.kindAt(x, yy, laneLevel) === K.empty) b.set(x, yy, laneLevel, K.lane);
    }
  }
}

/** The lane grid above the roofs, and lanes down in some street canyons. */
function placeLanes(b: Builder, seed: number, streets: { columns: readonly number[]; rows: readonly number[] }): void {
  const { p } = b;
  const [lo, hi] = p.bands.lanes;
  const crossLevel = hi > lo ? lo + 1 : lo;
  for (let y = 0; y < p.depth; y += 1) {
    for (let x = 0; x < p.width; x += 1) {
      if (b.streetRow[y] === 1 && b.kindAt(x, y, lo) === K.empty) b.set(x, y, lo, K.lane);
      if (b.streetCol[x] === 1 && b.kindAt(x, y, crossLevel) === K.empty) b.set(x, y, crossLevel, K.lane);
    }
  }
  const canyonSeed = subSeed(seed, "canyon-lanes");
  const [ulo, uhi] = p.bands.upper;
  for (let axis = 0; axis < 2; axis += 1) {
    const lines = axis === 0 ? streets.rows : streets.columns;
    const length = axis === 0 ? p.width : p.depth;
    const across = axis === 0 ? p.depth : p.width;
    for (const start of lines) {
      const h = hash32(start, axis, canyonSeed);
      if (h % 100 >= p.canyonLaneChance) continue;
      const level = ulo + (((h >>> 8) & 0xffff) % (uhi - ulo + 1));
      for (let a = 0; a < length; a += 1) {
        for (let c = start; c < start + p.streetWidth && c < across; c += 1) {
          const [x, y] = axis === 0 ? [a, c] : [c, a];
          if (b.kindAt(x, y, level) === K.empty) b.set(x, y, level, K.lane);
        }
      }
      // The way up: a shaft of lane in the middle of the line, to the lane level above it.
      const mid = (h >>> 24) % length;
      const [x, y] = axis === 0 ? [mid, start] : [start, mid];
      const to = axis === 0 ? lo : crossLevel;
      for (let z = level + 1; z <= to; z += 1) {
        if (b.kindAt(x, y, z) === K.empty) b.set(x, y, z, K.lane);
      }
    }
  }
}

/**
 * How a walkway end at cell (x, y, z), with the walkway on side `d`, joins the walk network:
 * a deck joins as it is (a pad does not: it is for cars), a lift whose door faces the walkway too; a facade cell becomes
 * a lift shaft down to the street below the walkway. Returns the cells to turn into lift, or
 * null when the end cannot join.
 */
function attachEnd(b: Builder, x: number, y: number, z: number, d: number): Array<readonly [number, number, number]> | null {
  const g = b.grid;
  const i = b.i(x, y, z);
  const kind = g.kind[i] as number;
  if (kind === K.deck) return [];
  if (kind === K.lift) return g.dir[i] === d ? [] : null;
  if (kind !== K.solid) return null;
  const s = b.street;
  if (b.kindAt(x + (DX[d] as number), y + (DY[d] as number), s) !== K.street) return null;
  const owner = g.building[i] as number;
  const convert: Array<readonly [number, number, number]> = [];
  for (let zz = s; zz <= z; zz += 1) {
    const j = b.i(x, y, zz);
    if (g.kind[j] === K.solid && g.building[j] === owner) convert.push([x, y, zz]);
    else if (!(g.kind[j] === K.lift && g.dir[j] === d)) return null;
  }
  return convert;
}

/** Walkways across the air between two buildings on the middle and upper bands. */
function placeWalkways(b: Builder, seed: number): number {
  const { p, grid: g } = b;
  const walkSeed = subSeed(seed, "walkways");
  const pairs = new Map<string, number[]>();
  let built = 0;
  for (let z = p.bands.middle[0]; z <= p.bands.upper[1]; z += 1) {
    for (let y = 0; y < p.depth; y += 1) {
      for (let x = 0; x < p.width; x += 1) {
        const i = b.i(x, y, z);
        const from = g.building[i] as number;
        if (from === 0) continue;
        for (const d of [1, 2]) {
          if (hash32(i, d, walkSeed) % 100 >= p.walkwayChance) continue;
          const dx = DX[d] as number;
          const dy = DY[d] as number;
          let end = -1;
          for (let step = 1; step <= p.walkwayMaxSpan + 1; step += 1) {
            const k = b.kindAt(x + dx * step, y + dy * step, z);
            if (k === K.empty) continue;
            if (k >= 0 && step >= 2) {
              const to = g.building[b.i(x + dx * step, y + dy * step, z)] as number;
              if (to !== 0 && to !== from) end = step;
            }
            break;
          }
          if (end < 0) continue;
          const ex = x + dx * end;
          const ey = y + dy * end;
          const to = g.building[b.i(ex, ey, z)] as number;
          const key = from < to ? `${from}-${to}` : `${to}-${from}`;
          const levels = pairs.get(key) ?? [];
          if (levels.length >= 2 || levels.some((level) => Math.abs(level - z) < 3)) continue;
          let beside = false;
          for (let step = 1; step < end; step += 1) {
            for (const side of [(d + 1) & 3, (d + 3) & 3]) {
              if (b.kindAt(x + dx * step + (DX[side] as number), y + dy * step + (DY[side] as number), z) === K.walkway) beside = true;
            }
          }
          if (beside) continue;
          const a = attachEnd(b, x, y, z, d);
          const c = attachEnd(b, ex, ey, z, opposite(d));
          if (a === null || c === null) continue;
          for (const [cx, cy, cz] of a) b.set(cx, cy, cz, K.lift, from, 0, d);
          for (const [cx, cy, cz] of c) b.set(cx, cy, cz, K.lift, to, 0, opposite(d));
          for (let step = 1; step < end; step += 1) b.set(x + dx * step, y + dy * step, z, K.walkway);
          levels.push(z);
          pairs.set(key, levels);
          built += 1;
        }
      }
    }
  }
  return built;
}

/** A street segment: the cells of one street line between two crossings. */
interface Segment {
  readonly axis: number; // 0: along x (a row), 1: along y (a column)
  readonly from: number; // first cell along the axis
  readonly to: number; // last cell along the axis
  readonly lanes: readonly number[]; // the rows (or columns) of the street, clipped to the grid
}

function segments(b: Builder, streets: { columns: readonly number[]; rows: readonly number[] }): Segment[] {
  const { p } = b;
  const out: Segment[] = [];
  for (let axis = 0; axis < 2; axis += 1) {
    const lines = axis === 0 ? streets.rows : streets.columns;
    const length = axis === 0 ? p.width : p.depth;
    const across = axis === 0 ? p.depth : p.width;
    const crossing = axis === 0 ? b.streetCol : b.streetRow;
    for (const start of lines) {
      const lanes: number[] = [];
      for (let c = start; c < start + p.streetWidth && c < across; c += 1) lanes.push(c);
      let a = 0;
      while (a < length) {
        if (crossing[a] === 1) {
          a += 1;
          continue;
        }
        let e = a;
        while (e + 1 < length && crossing[e + 1] === 0) e += 1;
        out.push({ axis, from: a, to: e, lanes });
        a = e + 1;
      }
    }
  }
  return out;
}

function at(segment: Segment, along: number, lane: number): readonly [number, number] {
  return segment.axis === 0 ? [along, lane] : [lane, along];
}

/** Undercity halls under some street segments, entered by stairs from a street crossing, and deeper halls under some of them. */
function placeUndercity(b: Builder, seed: number, streets: { columns: readonly number[]; rows: readonly number[] }): void {
  const { p } = b;
  const s = b.street;
  const hall = s - 1;
  const hallSeed = subSeed(seed, "halls");
  for (const segment of segments(b, streets)) {
    const [sx, sy] = at(segment, segment.from, segment.lanes[0] as number);
    const rng = createRng(hash32(sx, sy, hallSeed), segment.axis === 0 ? "hall-row" : "hall-column");
    if (!rng.chance(p.hallChance, 100)) continue;
    const carved: Array<ReturnType<Builder["save"]>> = [];
    for (let a = segment.from; a <= segment.to; a += 1) {
      for (const lane of segment.lanes) {
        const [x, y] = at(segment, a, lane);
        if (b.kindAt(x, y, hall) === K.ruin) {
          carved.push(b.save(x, y, hall));
          b.set(x, y, hall, K.deck);
        }
      }
    }
    // Entrances: stairs in the crossing at either end, climbing out of the hall.
    const plus = segment.axis === 0 ? 1 : 2;
    const ends: Array<readonly [number, number]> = [
      [segment.from - 1, opposite(plus)],
      [segment.to + 1, plus],
    ];
    const lanes = rng.shuffle([...segment.lanes]);
    let entrances = 0;
    const wanted = rng.chance(1, 3) ? 2 : 1;
    for (const [along, d] of rng.shuffle(ends)) {
      if (entrances >= wanted) break;
      for (const lane of lanes) {
        const [x, y] = at(segment, along, lane);
        if (b.kindAt(x, y, hall) !== K.ruin || b.kindAt(x, y, s) !== K.street) continue;
        if (b.isLanding(x, y, s)) continue;
        if (tryStairs(b, x, y, hall, d, 0)) {
          entrances += 1;
          break;
        }
      }
    }
    if (entrances === 0) {
      b.restore(carved);
      continue;
    }
    // A deeper hall under part of this one, with stairs up into it.
    const length = segment.to - segment.from + 1;
    if (hall - 1 < 0 || length < 5 || !rng.chance(p.deepHallChance, 100)) continue;
    const run = rng.range(3, Math.min(6, length - 2));
    const start = segment.from + rng.range(0, length - run - 2);
    const deep: Array<ReturnType<Builder["save"]>> = [];
    for (let a = start; a < start + run; a += 1) {
      for (const lane of segment.lanes) {
        const [x, y] = at(segment, a, lane);
        if (b.kindAt(x, y, hall - 1) === K.ruin) {
          deep.push(b.save(x, y, hall - 1));
          b.set(x, y, hall - 1, K.deck);
        }
      }
    }
    let joined = false;
    for (const lane of lanes) {
      const [x, y] = at(segment, start + run, lane);
      if (b.kindAt(x, y, hall - 1) !== K.ruin) continue;
      if (tryStairs(b, x, y, hall - 1, plus, 0)) {
        joined = true;
        break;
      }
    }
    if (!joined) b.restore(deep);
  }
}

/**
 * One district from a seed. `seed` is an unsigned 32-bit integer; `params` are merged over
 * `DEFAULT_PARAMS`. The same seed and params give the same district on every engine.
 */
export function generateDistrict(seed: number, params: Partial<DistrictParams> = {}): District {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError(`generateDistrict: seed must be an unsigned 32-bit integer, got ${String(seed)}`);
  }
  const p = resolveParams(params);
  const b = new Builder(p);
  const s = b.street;

  // 1. Streets and blocks.
  const streetSeed = subSeed(seed, "streets");
  const columns = streetLines(p.width, 0, p, streetSeed);
  const rows = streetLines(p.depth, 1, p, streetSeed);
  for (const c of columns) for (let x = c; x < c + p.streetWidth && x < p.width; x += 1) b.streetCol[x] = 1;
  for (const r of rows) for (let y = r; y < r + p.streetWidth && y < p.depth; y += 1) b.streetRow[y] = 1;
  const streets = { columns, rows };
  for (let z = 0; z < s; z += 1) for (let y = 0; y < p.depth; y += 1) for (let x = 0; x < p.width; x += 1) b.set(x, y, z, K.ruin);
  for (let y = 0; y < p.depth; y += 1) for (let x = 0; x < p.width; x += 1) b.set(x, y, s, K.street);

  // 2. Lots and 3. buildings, block by block.
  const blockSeed = subSeed(seed, "blocks");
  const lotSeed = subSeed(seed, "lots");
  const plans: Plan[] = [];
  for (const [y0, y1] of spans(rows, p.depth, p.streetWidth)) {
    for (const [x0, x1] of spans(columns, p.width, p.streetWidth)) {
      const block: Rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      if (block.w < 3 || block.h < 3) continue;
      const rng = createRng(hash32(x0, y0, blockSeed), "block");
      if (block.w >= 7 && block.h >= 7 && rng.chance(p.megablockChance, 100)) {
        plans.push({ archetype: "megablock", lot: block, seed: hash32(x0, y0, lotSeed) });
        continue;
      }
      const lots: Rect[] = [];
      splitLots(block, rng, 0, lots);
      for (const lot of lots) {
        const lotRng = createRng(hash32(lot.x, lot.y, lotSeed), "lot");
        const min = Math.min(lot.w, lot.h);
        const max = Math.max(lot.w, lot.h);
        const archetype: Archetype = min >= 5 && lotRng.chance(45, 100) ? "stepped" : max >= 2 * min || lotRng.chance(30, 100) ? "slab" : "tower";
        plans.push({ archetype, lot, seed: hash32(lot.x, lot.y, lotSeed) });
      }
    }
  }
  const buildings = plans.map((plan, n) => planBuilding(b, plan, n + 1));

  // 4. Lifts, 5. podium stairs.
  for (const building of buildings) placeLifts(b, building);
  for (const building of buildings) if (building.archetype === "megablock") placePodiumStairs(b, building);

  // 6. Pads, 7. lanes, 8. walkways, 9. the undercity.
  placePads(b, buildings);
  placeLanes(b, seed, streets);
  const walkways = placeWalkways(b, seed);
  placeUndercity(b, seed, streets);

  return { ...b.grid, seed, params: p, streets, buildings, walkways };
}
