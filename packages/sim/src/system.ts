// What a system is. Systems are engine modules (code); a game is data that lists the systems
// it uses and fills their data tables (D10). A system declares everything it touches: the
// data tables it reads, the state tables it owns, the commands it accepts and the events it
// emits. The kernel checks all four against the declarations.

import type { Fields, RowOf } from "./fields.ts";

/** A data table with exactly one record (settings). In the game data it is one object. */
export interface DataRecordDecl<F extends Fields = Fields> {
  readonly name: string;
  readonly shape: "record";
  readonly fields: F;
}

/** A data table of rows, each with a unique `id`. In the game data it is an array. */
export interface DataRowsDecl<F extends Fields = Fields> {
  readonly name: string;
  readonly shape: "rows";
  readonly fields: F;
}

export type DataTableDecl = DataRecordDecl | DataRowsDecl;

/** A state table with exactly one row. It starts with zeros and `false`. */
export interface OneDecl<F extends Fields = Fields> {
  readonly name: string;
  readonly shape: "one";
  readonly fields: F;
}

/** A state table of entities: rows with a stable integer `id`, kept in ascending id order. */
export interface EntitiesDecl<F extends Fields = Fields> {
  readonly name: string;
  readonly shape: "entities";
  readonly fields: F;
}

/** A state table that is a map: rows with a unique id `key`, kept in ascending key order. */
export interface MapDecl<F extends Fields = Fields> {
  readonly name: string;
  readonly shape: "map";
  readonly fields: F;
}

export type StateTableDecl = OneDecl | EntitiesDecl | MapDecl;

/** A row of a "rows" data table. Frozen. */
export type DataRow<F extends Fields> = Readonly<RowOf<F>> & { readonly id: string };
/** A row of an entity table. The fields may be changed in place; the id may not. */
export type EntityRow<F extends Fields> = RowOf<F> & { readonly id: number };
/** A row of a map table. The fields may be changed in place; the key may not. */
export type MapRow<F extends Fields> = RowOf<F> & { readonly key: string };

/** An event type and its payload. */
export interface EventDecl<F extends Fields = Fields> {
  readonly type: string;
  readonly payload: F;
}

/**
 * A command type, its payload and what it does. `apply` runs at the start of the command's
 * tick, before the systems. It returns nothing when the command took effect, or a reason id
 * (`"not-enough-money"`) when the state does not allow it: the kernel then emits
 * `command.rejected`. It must not change the state before it returns a reason.
 */
export interface CommandDecl<F extends Fields = Fields> {
  readonly type: string;
  readonly payload: F;
  apply(ctx: SystemContext, payload: Readonly<RowOf<F>>): string | void;
}

/** The random numbers a system may draw: its own stream, and no way to make another. */
export interface SimRng {
  /** The next unsigned 32-bit integer. */
  next(): number;
  /** A uniform integer in `[0, n)`. */
  int(n: number): number;
  /** A uniform integer in `[lo, hi]`. */
  range(lo: number, hi: number): number;
  /** True with probability `num / den`. */
  chance(num: number, den: number): boolean;
  /** One element of a non-empty list. */
  pick<T>(items: ArrayLike<T>): T;
  /** An index chosen with probability `weights[i] / sum`. */
  weighted(weights: ArrayLike<number>): number;
  /** Shuffles in place and returns the list. */
  shuffle<T>(items: T[]): T[];
}

/** What a system sees while it initialises, applies a command or runs its tick. */
export interface SystemContext {
  /** The tick being simulated (0 during `init`). */
  readonly tick: number;
  /** The random stream of this system. */
  readonly rng: SimRng;

  /** The record of a settings table. */
  config<F extends Fields>(table: DataRecordDecl<F>): Readonly<RowOf<F>>;
  /** The rows of a data table, in the order of the game data. */
  table<F extends Fields>(table: DataRowsDecl<F>): readonly DataRow<F>[];
  /** One row of a data table by id. Throws if there is none. */
  row<F extends Fields>(table: DataRowsDecl<F>, id: string): DataRow<F>;

  /** The row of a one-row state table. Change its fields in place. */
  one<F extends Fields>(table: OneDecl<F>): RowOf<F>;
  /**
   * The rows of an entity table by ascending id, or of a map table by ascending key. The
   * list is a copy made now: it is safe to spawn and remove while looping over it (a new row
   * is not in it, a removed row still is). The rows are the live ones.
   */
  all<F extends Fields>(table: EntitiesDecl<F>): readonly EntityRow<F>[];
  all<F extends Fields>(table: MapDecl<F>): readonly MapRow<F>[];
  /** One row by id or key, or `undefined`. */
  get<F extends Fields>(table: EntitiesDecl<F>, id: number): EntityRow<F> | undefined;
  get<F extends Fields>(table: MapDecl<F>, key: string): MapRow<F> | undefined;
  /** The number of rows. */
  count(table: EntitiesDecl | MapDecl): number;
  /** Adds an entity with the next free id and returns its row. */
  spawn<F extends Fields>(table: EntitiesDecl<F>, fields: Readonly<RowOf<F>>): EntityRow<F>;
  /** Adds the row of `key` to a map, or replaces its fields. Returns the row. */
  put<F extends Fields>(table: MapDecl<F>, key: string, fields: Readonly<RowOf<F>>): MapRow<F>;
  /** Removes a row by id or key. Returns whether there was one. */
  remove(table: EntitiesDecl, id: number): boolean;
  remove(table: MapDecl, key: string): boolean;

  /** Adds an event to this tick's list. Not available during `init`. */
  emit<F extends Fields>(event: EventDecl<F>, payload: Readonly<RowOf<F>>): void;
}

/** An engine system. */
export interface SystemDef {
  /** An id (`shop.arrivals`). It is also the name of the system's random stream. */
  readonly name: string;
  /** Systems whose tables this one reads or changes. A game that uses this one must list them. */
  readonly requires?: readonly string[];
  readonly data?: readonly DataTableDecl[];
  readonly state?: readonly StateTableDecl[];
  readonly commands?: readonly CommandDecl[];
  readonly events?: readonly EventDecl[];
  /** Sets the initial state from the game data. Runs once, in system order. */
  init?(ctx: SystemContext): void;
  /** One tick. Runs after this tick's commands, in system order. */
  tick?(ctx: SystemContext): void;
}

/** Declares a settings table (one record). */
export function dataRecord<F extends Fields>(name: string, fields: F): DataRecordDecl<F> {
  return { name, shape: "record", fields };
}

/** Declares a data table of rows with ids. */
export function dataRows<F extends Fields>(name: string, fields: F): DataRowsDecl<F> {
  return { name, shape: "rows", fields };
}

/** Declares a one-row state table. */
export function stateOne<F extends Fields>(name: string, fields: F): OneDecl<F> {
  return { name, shape: "one", fields };
}

/** Declares an entity table. */
export function stateEntities<F extends Fields>(name: string, fields: F): EntitiesDecl<F> {
  return { name, shape: "entities", fields };
}

/** Declares a map table. */
export function stateMap<F extends Fields>(name: string, fields: F): MapDecl<F> {
  return { name, shape: "map", fields };
}

/** Declares an event type. */
export function event<F extends Fields>(type: string, payload: F): EventDecl<F> {
  return { type, payload };
}

/** Declares a command type. */
export function command<F extends Fields>(
  type: string,
  payload: F,
  apply: (ctx: SystemContext, payload: Readonly<RowOf<F>>) => string | void,
): CommandDecl<F> {
  return { type, payload, apply };
}
