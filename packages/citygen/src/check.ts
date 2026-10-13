// Traversability: the movement rules on foot and the invariants every district must hold.
//
// On foot (the same rules the engine's player will follow):
//   - flat cells (street, deck, walkway, pad) connect to the flat cells beside them on the
//     same level;
//   - stairs climb one storey toward their direction: they connect to the flat cell behind
//     them on their own level (the low landing) and to the flat cell in front of them one
//     level up (the high landing); the cell above them is open (headroom);
//   - a lift connects to the lift cells directly above and below it, and through its door to
//     the flat cell on the door side.
// Lanes are air: they connect to the lanes beside, above and below them.
//
// The invariants (checkDistrict): every walkable cell reaches every other one; every stairs
// has both landings and its headroom; every pad touches a lane; the lanes are one network;
// a solid cell has a building and a facade, no other cell has a facade.

import { DX, DY, isFlat, isWalkable, K, KINDS, opposite } from "./cells.ts";
import { cellIndex, cellPos, inGrid } from "./grid.ts";
import type { CellGrid } from "./grid.ts";

/** Calls `visit` with every cell one step away on foot from walkable cell `i`. */
export function forEachWalkNeighbour(grid: CellGrid, i: number, visit: (j: number) => void): void {
  const { kind, dir } = grid;
  const k = kind[i] as number;
  const { x, y, z } = cellPos(grid, i);
  if (isFlat(k)) {
    for (let d = 0; d < 4; d += 1) {
      const nx = x + (DX[d] as number);
      const ny = y + (DY[d] as number);
      if (inGrid(grid, nx, ny, z)) {
        const j = cellIndex(grid, nx, ny, z);
        const nk = kind[j] as number;
        if (isFlat(nk)) visit(j);
        else if (nk === K.lift && dir[j] === opposite(d)) visit(j);
        else if (nk === K.stairs && dir[j] === d) visit(j); // we are its low landing
      }
      if (inGrid(grid, nx, ny, z - 1)) {
        const j = cellIndex(grid, nx, ny, z - 1);
        if (kind[j] === K.stairs && dir[j] === opposite(d)) visit(j); // we are its high landing
      }
    }
    return;
  }
  if (k === K.stairs) {
    const d = dir[i] as number;
    const lx = x - (DX[d] as number);
    const ly = y - (DY[d] as number);
    if (inGrid(grid, lx, ly, z) && isFlat(kind[cellIndex(grid, lx, ly, z)] as number)) visit(cellIndex(grid, lx, ly, z));
    const hx = x + (DX[d] as number);
    const hy = y + (DY[d] as number);
    if (inGrid(grid, hx, hy, z + 1) && isFlat(kind[cellIndex(grid, hx, hy, z + 1)] as number)) visit(cellIndex(grid, hx, hy, z + 1));
    return;
  }
  if (k === K.lift) {
    if (z > 0 && kind[cellIndex(grid, x, y, z - 1)] === K.lift) visit(cellIndex(grid, x, y, z - 1));
    if (z + 1 < grid.levels && kind[cellIndex(grid, x, y, z + 1)] === K.lift) visit(cellIndex(grid, x, y, z + 1));
    const d = dir[i] as number;
    const nx = x + (DX[d] as number);
    const ny = y + (DY[d] as number);
    if (inGrid(grid, nx, ny, z) && isFlat(kind[cellIndex(grid, nx, ny, z)] as number)) visit(cellIndex(grid, nx, ny, z));
  }
}

/**
 * The walkable cells reached on foot from `start`, as a 0/1 mark per cell, and how many. A
 * BFS over the movement rules; the queue is a typed array, so a district costs no allocations
 * per cell.
 */
export function reachFrom(grid: CellGrid, start: number): { reached: Uint8Array; count: number } {
  const reached = new Uint8Array(grid.kind.length);
  const queue = new Int32Array(grid.kind.length);
  let head = 0;
  let tail = 0;
  reached[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const i = queue[head++] as number;
    forEachWalkNeighbour(grid, i, (j) => {
      if (reached[j] === 0) {
        reached[j] = 1;
        queue[tail++] = j;
      }
    });
  }
  return { reached, count: tail };
}

/**
 * True when the walkable cells `targets` are all connected on foot to each other. The search
 * stops as soon as the last one is found, so a local change is checked locally: after taking
 * one cell out of a connected network, the network is still connected exactly when the cell's
 * former neighbours still reach each other.
 */
export function connectedAll(grid: CellGrid, targets: readonly number[]): boolean {
  if (targets.length < 2) return true;
  const wanted = new Set(targets);
  const seen = new Uint8Array(grid.kind.length);
  const queue = new Int32Array(grid.kind.length);
  const start = targets[0] as number;
  let left = wanted.size - 1;
  let head = 0;
  let tail = 0;
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail && left > 0) {
    forEachWalkNeighbour(grid, queue[head++] as number, (j) => {
      if (seen[j] === 0) {
        seen[j] = 1;
        queue[tail++] = j;
        if (wanted.has(j)) left -= 1;
      }
    });
  }
  return left === 0;
}

/** The walkable cells of the grid, counted, and the lowest index of one (or -1). */
function walkableCount(grid: CellGrid): { total: number; first: number } {
  let total = 0;
  let first = -1;
  for (let i = 0; i < grid.kind.length; i += 1) {
    if (isWalkable(grid.kind[i] as number)) {
      if (first < 0) first = i;
      total += 1;
    }
  }
  return { total, first };
}

/** True when every walkable cell reaches every other one on foot (or there are none). */
export function walkConnected(grid: CellGrid): boolean {
  const { total, first } = walkableCount(grid);
  if (total === 0) return true;
  return reachFrom(grid, first).count === total;
}

/** Sizes of the connected groups of cells for which `member` holds, largest first. */
function components(grid: CellGrid, member: (i: number) => boolean, step: (i: number, visit: (j: number) => void) => void): number[] {
  const seen = new Uint8Array(grid.kind.length);
  const queue = new Int32Array(grid.kind.length);
  const sizes: number[] = [];
  for (let s = 0; s < grid.kind.length; s += 1) {
    if (seen[s] === 1 || !member(s)) continue;
    let head = 0;
    let tail = 0;
    seen[s] = 1;
    queue[tail++] = s;
    while (head < tail) {
      step(queue[head++] as number, (j) => {
        if (seen[j] === 0 && member(j)) {
          seen[j] = 1;
          queue[tail++] = j;
        }
      });
    }
    sizes.push(tail);
  }
  return sizes.sort((a, b) => b - a);
}

/** Calls `visit` with the six cells beside, above and below `i` that are in the grid. */
function forEachSixNeighbour(grid: CellGrid, i: number, visit: (j: number) => void): void {
  const { x, y, z } = cellPos(grid, i);
  if (x > 0) visit(i - 1);
  if (x + 1 < grid.width) visit(i + 1);
  if (y > 0) visit(i - grid.width);
  if (y + 1 < grid.depth) visit(i + grid.width);
  const plane = grid.width * grid.depth;
  if (z > 0) visit(i - plane);
  if (z + 1 < grid.levels) visit(i + plane);
}

export interface DistrictCheck {
  /** True when every invariant holds. */
  readonly ok: boolean;
  readonly walkable: number;
  /** Sizes of the groups of walkable cells connected on foot, largest first (one when ok). */
  readonly walkGroups: readonly number[];
  readonly lanes: number;
  /** Sizes of the connected groups of lane cells, largest first (one when ok). */
  readonly laneGroups: readonly number[];
  readonly pads: number;
  readonly padsWithoutLane: number;
  /** What broke, at most 20 lines, each naming a cell as `kind@x,y,z`. */
  readonly problems: readonly string[];
}

function name(grid: CellGrid, i: number): string {
  const { x, y, z } = cellPos(grid, i);
  return `${KINDS[grid.kind[i] as number] as string}@${x},${y},${z}`;
}

/** Checks every invariant of a district. A district that fails is a bug of the generator. */
export function checkDistrict(grid: CellGrid): DistrictCheck {
  const problems: string[] = [];
  const problem = (text: string): void => {
    if (problems.length < 20) problems.push(text);
  };
  const { kind, dir, building, facade } = grid;
  let walkable = 0;
  let lanes = 0;
  let pads = 0;
  let padsWithoutLane = 0;
  for (let i = 0; i < kind.length; i += 1) {
    const k = kind[i] as number;
    const { x, y, z } = cellPos(grid, i);
    if (isWalkable(k)) walkable += 1;
    if (k === K.lane) lanes += 1;
    if (k === K.solid && (building[i] === 0 || facade[i] === 0)) problem(`${name(grid, i)} has no building or no facade`);
    if (k !== K.solid && facade[i] !== 0) problem(`${name(grid, i)} has a facade but is not solid`);
    if (k !== K.stairs && k !== K.lift && dir[i] !== 0) problem(`${name(grid, i)} has a direction`);
    if (k === K.stairs) {
      const d = dir[i] as number;
      const low = [x - (DX[d] as number), y - (DY[d] as number), z] as const;
      const high = [x + (DX[d] as number), y + (DY[d] as number), z + 1] as const;
      if (!inGrid(grid, ...low) || !isFlat(kind[cellIndex(grid, ...low)] as number)) problem(`${name(grid, i)} has no low landing`);
      if (!inGrid(grid, ...high) || !isFlat(kind[cellIndex(grid, ...high)] as number)) problem(`${name(grid, i)} has no high landing`);
      if (!inGrid(grid, x, y, z + 1) || kind[cellIndex(grid, x, y, z + 1)] !== K.empty) problem(`${name(grid, i)} has no headroom`);
    }
    if (k === K.pad) {
      pads += 1;
      let touches = false;
      forEachSixNeighbour(grid, i, (j) => {
        if (kind[j] === K.lane) touches = true;
      });
      if (!touches) {
        padsWithoutLane += 1;
        problem(`${name(grid, i)} touches no lane`);
      }
    }
  }
  const walkGroups = components(
    grid,
    (i) => isWalkable(kind[i] as number),
    (i, visit) => forEachWalkNeighbour(grid, i, visit),
  );
  if (walkGroups.length > 1) {
    const { first } = walkableCount(grid);
    const { reached } = reachFrom(grid, first);
    let shown = 0;
    for (let i = 0; i < kind.length && shown < 5; i += 1) {
      if (isWalkable(kind[i] as number) && reached[i] === 0) {
        problem(`${name(grid, i)} is not reachable on foot from ${name(grid, first)}`);
        shown += 1;
      }
    }
  }
  const laneGroups = components(
    grid,
    (i) => kind[i] === K.lane,
    (i, visit) => forEachSixNeighbour(grid, i, visit),
  );
  if (laneGroups.length > 1) problem(`the lanes are ${laneGroups.length} networks (${laneGroups.join(", ")} cells), not one`);
  return {
    ok: problems.length === 0,
    walkable,
    walkGroups,
    lanes,
    laneGroups,
    pads,
    padsWithoutLane,
    problems,
  };
}
