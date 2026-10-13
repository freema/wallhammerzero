// The cell grid of a district: four flat arrays indexed by `(z * depth + y) * width + x`, so a
// level is one contiguous run and a port reads them as plain bytes.

import { idiv } from "@whz/det";
import { DIRS, FACADES, K, KINDS } from "./cells.ts";
import type { CellKind, Dir, Facade } from "./cells.ts";

export interface CellGrid {
  readonly width: number;
  readonly depth: number;
  readonly levels: number;
  /** A `KINDS` index per cell. */
  readonly kind: Uint8Array;
  /** A `DIRS` index per cell: where stairs climb to, where a lift's door opens; 0 for other kinds. */
  readonly dir: Uint8Array;
  /** The building a cell belongs to (1..), 0 for none (streets, walkways, lanes, ruins, air). */
  readonly building: Uint16Array;
  /** A `FACADES` index: the style of a `solid` cell, 0 (`none`) for every other cell. */
  readonly facade: Uint8Array;
}

export function createGrid(width: number, depth: number, levels: number): CellGrid {
  const size = width * depth * levels;
  return {
    width,
    depth,
    levels,
    kind: new Uint8Array(size).fill(K.empty),
    dir: new Uint8Array(size),
    building: new Uint16Array(size),
    facade: new Uint8Array(size),
  };
}

/** The index of a cell. The caller keeps the coordinates inside the grid (`inGrid`). */
export function cellIndex(grid: CellGrid, x: number, y: number, z: number): number {
  return (z * grid.depth + y) * grid.width + x;
}

export function inGrid(grid: CellGrid, x: number, y: number, z: number): boolean {
  return x >= 0 && y >= 0 && z >= 0 && x < grid.width && y < grid.depth && z < grid.levels;
}

/** The coordinates of an index. */
export function cellPos(grid: CellGrid, index: number): { x: number; y: number; z: number } {
  const plane = grid.width * grid.depth;
  const z = idiv(index, plane);
  const rest = index - z * plane;
  const y = idiv(rest, grid.width);
  return { x: rest - y * grid.width, y, z };
}

export interface Cell {
  readonly kind: CellKind;
  /** For `stairs` and `lift`; null for the other kinds. */
  readonly dir: Dir | null;
  readonly building: number;
  readonly facade: Facade;
}

/** One cell by name. Outside the grid it is `empty`. */
export function cellAt(grid: CellGrid, x: number, y: number, z: number): Cell {
  if (!inGrid(grid, x, y, z)) return { kind: "empty", dir: null, building: 0, facade: "none" };
  const i = cellIndex(grid, x, y, z);
  const kind = grid.kind[i] as number;
  return {
    kind: KINDS[kind] as CellKind,
    dir: kind === K.stairs || kind === K.lift ? (DIRS[grid.dir[i] as number] as Dir) : null,
    building: grid.building[i] as number,
    facade: FACADES[grid.facade[i] as number] as Facade,
  };
}
