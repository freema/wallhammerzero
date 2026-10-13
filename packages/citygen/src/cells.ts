// The cell vocabulary of a district: what a cell is (its kind), which way it points (stairs and
// lifts), and the facade style of a building's volume. The names are shared with the building
// kit (assets/new-hope-lib/kit.ts) and the city mockup, so they never change meaning.
//
// A cell is one tile by one storey (CELL in assets/new-hope-lib/style.ts). A walkable cell is
// a place a person stands on: its floor is the bottom of the cell.

/** Cell kinds, in the order of their numeric codes (`District.kind` stores the index). */
export const KINDS = ["empty", "solid", "deck", "street", "walkway", "stairs", "lift", "pad", "ruin", "lane"] as const;
export type CellKind = (typeof KINDS)[number];

/** The numeric code of each kind. */
export const K = {
  empty: 0,
  solid: 1,
  deck: 2,
  street: 3,
  walkway: 4,
  stairs: 5,
  lift: 6,
  pad: 7,
  ruin: 8,
  lane: 9,
} as const satisfies Record<CellKind, number>;

/** Facade styles of a `solid` cell; index 0 (`none`) is every other cell. */
export const FACADES = ["none", "union", "habitat", "market", "derelict", "ancient"] as const;
export type Facade = (typeof FACADES)[number];
export type FacadeStyle = Exclude<Facade, "none">;

export const F = { none: 0, union: 1, habitat: 2, market: 3, derelict: 4, ancient: 5 } as const satisfies Record<Facade, number>;

/**
 * Directions on the plan. `x` grows to the east, `y` to the south, `z` (the level) upward.
 * Stairs climb toward their direction; a lift's direction is the side its door opens to.
 */
export const DIRS = ["n", "e", "s", "w"] as const;
export type Dir = (typeof DIRS)[number];
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

/** The opposite of a direction code. */
export function opposite(dir: number): number {
  return (dir + 2) & 3;
}

/** Kinds a person can stand on. */
export function isWalkable(kind: number): boolean {
  return kind === K.street || kind === K.deck || kind === K.walkway || kind === K.pad || kind === K.stairs || kind === K.lift;
}

/** Walkable kinds with a level floor: what stairs land on and lift doors open to. */
export function isFlat(kind: number): boolean {
  return kind === K.street || kind === K.deck || kind === K.walkway || kind === K.pad;
}

/** One ASCII character per kind, for slices. Stairs show their direction instead. */
export const KIND_CHARS = {
  empty: ".",
  solid: "#",
  deck: "=",
  street: ":",
  walkway: "-",
  stairs: "^",
  lift: "H",
  pad: "P",
  ruin: "%",
  lane: "~",
} as const satisfies Record<CellKind, string>;

/** Stairs by the direction they climb toward (n, e, s, w). */
export const STAIRS_CHARS = ["^", ">", "v", "<"] as const;

/** A `solid` cell by its facade style, for slices with `facade: true`. */
export const FACADE_CHARS = {
  none: "#",
  union: "u",
  habitat: "h",
  market: "m",
  derelict: "d",
  ancient: "a",
} as const satisfies Record<Facade, string>;
