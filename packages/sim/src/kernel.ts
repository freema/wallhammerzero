// The kernel: fixed integer ticks, commands in, events out.
//
// One tick T (the sim is "at tick T" before it and "at tick T + 1" after it):
//   1. the commands queued for tick T are applied, in the order they were submitted;
//   2. every system in use runs its `tick`, in the fixed order of the engine registry;
//   3. the state is checked against the declared tables.
// There is no `dt` and no clock: the host decides how many ticks to run and when.

import { createRng, fnv1a32 } from "@whz/det";
import type { Rng, RngState } from "@whz/det";
import { ByteWriter } from "./bytes.ts";
import { describeSim } from "./describe.ts";
import { SimError } from "./errors.ts";
import { copyFields, encodeFields, has, isId, isPlainObject, rowProblem } from "./fields.ts";
import type { Fields, Row, RowOf, Value } from "./fields.ts";
import { compareId, compareInt, sortedKeys } from "./order.ts";
import { commandRejected, compileProgram } from "./program.ts";
import type { CompiledCommand, CompiledStateTable, CompiledSystem, Program, SimData } from "./program.ts";
import type {
  DataRecordDecl,
  DataRow,
  DataRowsDecl,
  EntitiesDecl,
  EntityRow,
  EventDecl,
  MapDecl,
  MapRow,
  OneDecl,
  SimRng,
  StateTableDecl,
  SystemContext,
  SystemDef,
} from "./system.ts";
import { ENGINE_SYSTEMS } from "./systems/index.ts";

/** A command: the only way to change the state from outside. */
export interface Command {
  /** The tick it takes effect in. Not before the tick the sim is at. */
  readonly tick: number;
  /** A command type of a system in use. */
  readonly type: string;
  /** Exactly the fields the command type declares. */
  readonly payload: Readonly<Row>;
}

/** A queued command with the sequence number `submit` gave it. */
export interface QueuedCommand extends Command {
  readonly seq: number;
}

/** What `submit` answers. A refused command is not queued and not logged. */
export type SubmitResult = { readonly ok: true; readonly seq: number } | { readonly ok: false; readonly error: string };

/** Something that happened in a tick, for the host: FX, audio cues, UI. */
export interface SimEvent {
  readonly tick: number;
  readonly type: string;
  readonly payload: Readonly<Row>;
}

export const SNAPSHOT_FORMAT = "whz-sim-snapshot";
/** Changes when the snapshot layout changes. A snapshot of another version is refused. */
export const SNAPSHOT_VERSION = 1;
/** Changes when the binary encoding behind the digest changes. */
export const ENCODING_VERSION = 1;

/**
 * The whole sim as plain data. With the same sim data it restores to a sim that continues
 * exactly as the original. Its canonical text is `canonicalJson(snapshot)`.
 */
export interface Snapshot {
  readonly format: typeof SNAPSHOT_FORMAT;
  readonly version: number;
  readonly simDataHash: string;
  readonly seed: number;
  readonly tick: number;
  readonly nextId: number;
  readonly nextSeq: number;
  /** The state of each system's random stream, by system name. */
  readonly rng: Readonly<Record<string, RngState>>;
  /** The rows of each state table, by table name. A one-row table is a list of one. */
  readonly tables: Readonly<Record<string, readonly Readonly<Row>[]>>;
  /** The commands queued for this tick or later, in the order they will be applied. */
  readonly pending: readonly QueuedCommand[];
}

/** What a state table looks like, for hosts and tools. Fields are in canonical order. */
export interface TableInfo {
  readonly name: string;
  readonly shape: "one" | "entities" | "map";
  readonly system: string;
  readonly fields: readonly string[];
}

export interface DescribeOptions {
  /** The most rows shown per table (default 40). */
  readonly maxRows?: number;
}

export interface Sim {
  readonly seed: number;
  readonly simDataHash: string;
  /** The number of ticks simulated so far; also the tick the next `step` simulates. */
  readonly tick: number;
  /** The systems in use, in the order they run. */
  readonly systems: readonly string[];

  /** Queues a command. Never throws: a command that cannot be accepted comes back with the reason. */
  submit(command: Command): SubmitResult;
  /** Simulates `ticks` ticks (default 1) and returns their events in order. */
  step(ticks?: number): SimEvent[];

  /** The digest of the state: FNV-1a 32 over `encodeState()`. */
  digest(): number;
  /** The digest as 8 hex digits. */
  digestHex(): string;
  /** One digest per system (its random stream and its tables), to find where two runs differ. */
  digestParts(): { readonly system: string; readonly digest: string }[];
  /** The canonical binary encoding of the state (see docs/sim.md). */
  encodeState(): Uint8Array;

  snapshot(): Snapshot;
  /** The commands accepted since this sim was created or restored, in the order they apply. */
  commandLog(): Command[];
  /** The commands queued for this tick or later. */
  pending(): QueuedCommand[];

  /** The state tables, in digest order. */
  tables(): TableInfo[];
  /** Copies of the rows of a state table (a one-row table gives a list of one). */
  read(table: string): Row[];
  /** The state of a system's random stream. */
  rngState(system: string): RngState;
  /** The state as compact text, for agents. */
  describe(options?: DescribeOptions): string;
}

export interface SimOptions {
  /** The game's sim data: the systems it uses and their data tables. */
  readonly data: SimData;
  /** An unsigned 32-bit integer. */
  readonly seed: number;
  /** The system registry. Defaults to the engine's; tests pass their own. */
  readonly systems?: readonly SystemDef[];
}

export interface RestoreOptions {
  readonly data: SimData;
  /** A snapshot, as returned by `snapshot()` or parsed from its canonical text. */
  readonly snapshot: unknown;
  readonly systems?: readonly SystemDef[];
}

const SHAPE_CODE = { one: 0, entities: 1, map: 2 } as const;
const HEX = "0123456789abcdef";

/** An unsigned 32-bit integer as 8 lowercase hex digits. */
export function hex32(value: number): string {
  let out = "";
  for (let shift = 28; shift >= 0; shift -= 4) out += HEX.charAt((value >>> shift) & 0xf);
  return out;
}

function isU32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** The key of a row in its table: the id of an entity, the key of a map row. */
function keyName(table: CompiledStateTable): "id" | "key" | null {
  return table.decl.shape === "entities" ? "id" : table.decl.shape === "map" ? "key" : null;
}

/**
 * What a system gets of its random stream: the draws, as a frozen object of closures. The
 * generator itself stays with the kernel, so at run time (not only in the types) a system has
 * no `fork`, no `state` and no `restore`: it cannot make a stream, rewind its own, or hold an
 * object that leads to another one.
 */
function rngHandle(rng: Rng): SimRng {
  return Object.freeze({
    next: (): number => rng.next(),
    int: (n: number): number => rng.int(n),
    range: (lo: number, hi: number): number => rng.range(lo, hi),
    chance: (num: number, den: number): boolean => rng.chance(num, den),
    pick: <T>(items: ArrayLike<T>): T => rng.pick(items),
    weighted: (weights: ArrayLike<number>): number => rng.weighted(weights),
    shuffle: <T>(items: T[]): T[] => rng.shuffle(items),
  });
}

/**
 * The kernel and the system are `#private` (hidden by the language, not by the type checker)
 * and the object is frozen: a system that casts its context still finds only `rng`, `tick` and
 * the methods, and cannot swap any of them.
 */
class Context implements SystemContext {
  readonly #kernel: Kernel;
  readonly #system: CompiledSystem;
  readonly rng: SimRng;

  constructor(kernel: Kernel, system: CompiledSystem, rng: Rng) {
    this.#kernel = kernel;
    this.#system = system;
    this.rng = rngHandle(rng);
    Object.freeze(this);
  }

  get tick(): number {
    return this.#kernel.currentTick;
  }

  #loaded(decl: DataRecordDecl | DataRowsDecl) {
    const table = this.#kernel.program.dataTables.get(decl.name);
    if (table === undefined || table.decl !== decl) {
      throw new SimError(`system "${this.#system.name}": the data table "${decl.name}" is not declared by a system in use`);
    }
    const data = this.#kernel.program.data.get(decl.name);
    if (data === undefined) throw new SimError(`the data table "${decl.name}" is not loaded`);
    return data;
  }

  config<F extends Fields>(table: DataRecordDecl<F>): Readonly<RowOf<F>> {
    return this.#loaded(table).record as Readonly<RowOf<F>>;
  }

  table<F extends Fields>(table: DataRowsDecl<F>): readonly DataRow<F>[] {
    return this.#loaded(table).rows as readonly DataRow<F>[];
  }

  row<F extends Fields>(table: DataRowsDecl<F>, id: string): DataRow<F> {
    const row = this.#loaded(table).byId.get(id);
    if (row === undefined) {
      throw new SimError(`system "${this.#system.name}": the data table "${table.name}" has no row "${id}"`);
    }
    return row as DataRow<F>;
  }

  #store(decl: StateTableDecl): { table: CompiledStateTable; rows: Row[] } {
    const table = this.#kernel.program.stateTables.get(decl.name);
    if (table === undefined || table.decl !== decl) {
      throw new SimError(`system "${this.#system.name}": the state table "${decl.name}" is not declared by a system in use`);
    }
    return { table, rows: this.#kernel.rowsOf(decl.name) };
  }

  one<F extends Fields>(table: OneDecl<F>): RowOf<F> {
    return this.#store(table).rows[0] as RowOf<F>;
  }

  all<F extends Fields>(table: EntitiesDecl<F>): readonly EntityRow<F>[];
  all<F extends Fields>(table: MapDecl<F>): readonly MapRow<F>[];
  all(table: EntitiesDecl | MapDecl): readonly Row[] {
    return this.#store(table).rows.slice();
  }

  get<F extends Fields>(table: EntitiesDecl<F>, id: number): EntityRow<F> | undefined;
  get<F extends Fields>(table: MapDecl<F>, key: string): MapRow<F> | undefined;
  get(table: EntitiesDecl | MapDecl, key: number | string): Row | undefined {
    const { rows } = this.#store(table);
    const at = find(rows, table.shape === "entities" ? "id" : "key", key);
    return at.found ? rows[at.index] : undefined;
  }

  count(table: EntitiesDecl | MapDecl): number {
    return this.#store(table).rows.length;
  }

  spawn<F extends Fields>(decl: EntitiesDecl<F>, fields: Readonly<RowOf<F>>): EntityRow<F> {
    const { table, rows } = this.#store(decl);
    const problem = rowProblem(table.fields, fields, this.#kernel.program.refs);
    if (problem !== null) throw new SimError(`system "${this.#system.name}": spawn in "${decl.name}": ${problem}`);
    const row = copyFields(table.fields, fields, { id: this.#kernel.takeId() });
    // Ids only grow, so the newest row belongs at the end.
    rows.push(row);
    return row as EntityRow<F>;
  }

  put<F extends Fields>(decl: MapDecl<F>, key: string, fields: Readonly<RowOf<F>>): MapRow<F> {
    const { table, rows } = this.#store(decl);
    if (!isId(key)) throw new SimError(`system "${this.#system.name}": put in "${decl.name}": the key ${JSON.stringify(key)} is not an id`);
    const problem = rowProblem(table.fields, fields, this.#kernel.program.refs);
    if (problem !== null) throw new SimError(`system "${this.#system.name}": put in "${decl.name}": ${problem}`);
    const at = find(rows, "key", key);
    if (at.found) return copyFields(table.fields, fields, rows[at.index] as Row) as MapRow<F>;
    const row = copyFields(table.fields, fields, { key });
    rows.splice(at.index, 0, row);
    return row as MapRow<F>;
  }

  remove(table: EntitiesDecl, id: number): boolean;
  remove(table: MapDecl, key: string): boolean;
  remove(table: EntitiesDecl | MapDecl, key: number | string): boolean {
    const { rows } = this.#store(table);
    const at = find(rows, table.shape === "entities" ? "id" : "key", key);
    if (at.found) rows.splice(at.index, 1);
    return at.found;
  }

  emit<F extends Fields>(decl: EventDecl<F>, payload: Readonly<RowOf<F>>): void {
    this.#kernel.emit(decl, payload, this.#system.name);
  }
}

/** True if `a` sorts before `b`: integers by value, ids by ASCII order. */
function below(a: Value, b: Value): boolean {
  if (typeof a === "number" && typeof b === "number") return a < b;
  return typeof a === "string" && typeof b === "string" && a < b;
}

/** Binary search in rows sorted by `key`: where the key is, or where it would go. */
function find(rows: readonly Row[], key: "id" | "key", wanted: Value): { found: boolean; index: number } {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (below((rows[middle] as Row)[key] as Value, wanted)) low = middle + 1;
    else high = middle;
  }
  return { found: low < rows.length && (rows[low] as Row)[key] === wanted, index: low };
}

class Kernel implements Sim {
  readonly program: Program;
  readonly seed: number;
  currentTick = 0;
  private nextId = 1;
  private nextSeq = 0;
  private readonly store = new Map<string, Row[]>();
  private readonly rngs: Rng[] = [];
  private readonly contexts: Context[] = [];
  private queue: QueuedCommand[] = [];
  private readonly log: Command[] = [];
  /** The list the running tick adds its events to; `null` outside a tick. */
  private events: SimEvent[] | null = null;
  private failure: string | null = null;

  constructor(program: Program, seed: number) {
    if (!isU32(seed)) throw new SimError(`the seed must be an unsigned 32-bit integer, got ${String(seed)}`);
    this.program = program;
    this.seed = seed;
    for (const system of program.systems) {
      const rng = createRng(seed, system.name);
      this.rngs.push(rng);
      this.contexts.push(new Context(this, system, rng));
      for (const table of system.tables) {
        const rows: Row[] = [];
        if (table.decl.shape === "one") {
          const row: Row = {};
          for (const { name, type } of table.fields) {
            row[name] = type.kind === "int" ? Math.min(Math.max(0, type.min), type.max) : type.kind === "bool" ? false : "";
          }
          rows.push(row);
        }
        this.store.set(table.name, rows);
      }
    }
  }

  /** Runs every system's `init`, then checks the state. */
  init(): void {
    for (let i = 0; i < this.program.systems.length; i += 1) {
      (this.program.systems[i] as CompiledSystem).def.init?.(this.contexts[i] as Context);
    }
    this.checkState("after init");
  }

  get simDataHash(): string {
    return this.program.simDataHash;
  }

  get tick(): number {
    return this.currentTick;
  }

  get systems(): readonly string[] {
    return this.program.systems.map((system) => system.name);
  }

  rowsOf(table: string): Row[] {
    return this.store.get(table) as Row[];
  }

  takeId(): number {
    const id = this.nextId;
    if (id >= Number.MAX_SAFE_INTEGER) throw new SimError("the sim ran out of entity ids");
    this.nextId += 1;
    return id;
  }

  emit(decl: EventDecl, payload: Readonly<Row>, system: string): void {
    if (this.events === null) throw new SimError(`system "${system}": events can only be emitted during a tick`);
    const compiled = this.program.events.get(decl.type);
    if (compiled === undefined || compiled.decl !== decl) {
      throw new SimError(`system "${system}": the event "${decl.type}" is not declared by a system in use`);
    }
    const problem = rowProblem(compiled.fields, payload, this.program.refs);
    if (problem !== null) throw new SimError(`system "${system}": event "${decl.type}": ${problem}`);
    const copy = Object.freeze(copyFields(compiled.fields, payload));
    this.events.push(Object.freeze({ tick: this.currentTick, type: decl.type, payload: copy }));
  }

  private commandProblem(command: unknown): string | null {
    if (!isPlainObject(command)) return "a command must be an object { tick, type, payload }";
    if (sortedKeys(command).join(",") !== "payload,tick,type") {
      return "a command has exactly the fields tick, type and payload";
    }
    const { tick, type, payload } = command;
    if (!isCount(tick)) return `the tick ${typeof tick === "number" ? String(tick) : `of type ${typeof tick}`} is not a non-negative integer`;
    if (tick < this.currentTick) return `tick ${tick} is in the past (the sim is at tick ${this.currentTick})`;
    if (typeof type !== "string") return "the type must be a string";
    const compiled = this.program.commands.get(type);
    if (compiled === undefined) return `unknown command type ${JSON.stringify(type)}`;
    const problem = rowProblem(compiled.fields, payload, this.program.refs);
    return problem === null ? null : `payload of ${type}: ${problem}`;
  }

  submit(command: Command): SubmitResult {
    if (this.failure !== null) return { ok: false, error: this.failure };
    const problem = this.commandProblem(command);
    if (problem !== null) return { ok: false, error: problem };
    const { fields } = this.program.commands.get(command.type) as CompiledCommand;
    const payload = Object.freeze(copyFields(fields, command.payload));
    const tick = command.tick === 0 ? 0 : command.tick; // never a negative zero
    const seq = this.nextSeq;
    this.nextSeq += 1;
    // The newest command goes after every queued command of its tick or an earlier one.
    let index = this.queue.length;
    while (index > 0 && (this.queue[index - 1] as QueuedCommand).tick > tick) index -= 1;
    this.queue.splice(index, 0, Object.freeze({ tick, seq, type: command.type, payload }));
    this.log.splice(this.logIndex(tick), 0, Object.freeze({ tick, type: command.type, payload }));
    return { ok: true, seq };
  }

  /** Where a new command of `tick` goes in the log, which is kept in the order of application. */
  private logIndex(tick: number): number {
    let index = this.log.length;
    while (index > 0 && (this.log[index - 1] as Command).tick > tick) index -= 1;
    return index;
  }

  step(ticks = 1): SimEvent[] {
    if (!isCount(ticks)) throw new SimError(`step: ticks must be a non-negative integer, got ${String(ticks)}`);
    if (this.failure !== null) throw new SimError(this.failure);
    const events: SimEvent[] = [];
    for (let i = 0; i < ticks; i += 1) this.runTick(events);
    return events;
  }

  private runTick(events: SimEvent[]): void {
    this.events = events;
    try {
      let due = 0;
      while (due < this.queue.length && (this.queue[due] as QueuedCommand).tick === this.currentTick) due += 1;
      for (const command of this.queue.splice(0, due)) this.apply(command);
      for (let i = 0; i < this.program.systems.length; i += 1) {
        (this.program.systems[i] as CompiledSystem).def.tick?.(this.contexts[i] as Context);
      }
      this.checkState(`after tick ${this.currentTick}`);
    } catch (error) {
      // A tick that failed half-way leaves a state no replay can reach: stop for good.
      this.failure = `the sim stopped in tick ${this.currentTick}: ${describeError(error)}`;
      throw error;
    } finally {
      this.events = null;
    }
    this.currentTick += 1;
  }

  private apply(command: QueuedCommand): void {
    const compiled = this.program.commands.get(command.type);
    if (compiled === undefined) throw new SimError(`no system handles the queued command "${command.type}"`);
    const context = this.contexts[compiled.systemIndex] as Context;
    const reason = compiled.decl.apply(context, command.payload);
    if (reason === undefined) return;
    if (!isId(reason)) {
      throw new SimError(`command "${command.type}": apply must return nothing or a reason id, got ${JSON.stringify(reason)}`);
    }
    this.emit(commandRejected, { command: command.type, reason, seq: command.seq }, "kernel");
  }

  /** Throws if any table holds something its declaration does not allow. */
  private checkState(when: string): void {
    for (const system of this.program.systems) {
      for (const table of system.tables) {
        const problem = tableProblem(table, this.rowsOf(table.name), this.program.refs, this.nextId);
        if (problem !== null) throw new SimError(`state table "${table.name}" ${when}: ${problem}`);
      }
    }
  }

  private encodeSystem(index: number): Uint8Array {
    const system = this.program.systems[index] as CompiledSystem;
    const writer = new ByteWriter();
    writer.str(system.name);
    for (const word of (this.rngs[index] as Rng).state()) writer.u32(word);
    writer.u16(system.tables.length);
    for (const table of system.tables) {
      const rows = this.rowsOf(table.name);
      const key = keyName(table);
      writer.str(table.name).u8(SHAPE_CODE[table.decl.shape]).u32(rows.length);
      for (const row of rows) {
        if (key === "id") writer.i64(row.id as number);
        else if (key === "key") writer.str(row.key as string);
        encodeFields(writer, table.fields, row);
      }
    }
    return writer.finish();
  }

  encodeState(): Uint8Array {
    const writer = new ByteWriter();
    writer.bytes(Uint8Array.of(0x57, 0x48, 0x5a, 0x53)); // "WHZS"
    writer.u16(ENCODING_VERSION).i64(this.currentTick).i64(this.nextId).u16(this.program.systems.length);
    for (let i = 0; i < this.program.systems.length; i += 1) writer.bytes(this.encodeSystem(i));
    return writer.finish();
  }

  digest(): number {
    return fnv1a32(this.encodeState());
  }

  digestHex(): string {
    return hex32(this.digest());
  }

  digestParts(): { readonly system: string; readonly digest: string }[] {
    return this.program.systems.map((system, index) => ({
      system: system.name,
      digest: hex32(fnv1a32(this.encodeSystem(index))),
    }));
  }

  snapshot(): Snapshot {
    const rng: Record<string, RngState> = {};
    const tables: Record<string, Row[]> = {};
    for (let i = 0; i < this.program.systems.length; i += 1) {
      const system = this.program.systems[i] as CompiledSystem;
      rng[system.name] = (this.rngs[i] as Rng).state();
      for (const table of system.tables) tables[table.name] = this.read(table.name);
    }
    return {
      format: SNAPSHOT_FORMAT,
      version: SNAPSHOT_VERSION,
      simDataHash: this.program.simDataHash,
      seed: this.seed,
      tick: this.currentTick,
      nextId: this.nextId,
      nextSeq: this.nextSeq,
      rng,
      tables,
      pending: this.pending(),
    };
  }

  /** Puts a checked snapshot into this freshly built kernel. */
  load(snapshot: unknown): void {
    if (!isPlainObject(snapshot)) throw new SimError("snapshot: not an object");
    const keys = "format,nextId,nextSeq,pending,rng,seed,simDataHash,tables,tick,version";
    if (snapshot.format !== SNAPSHOT_FORMAT) throw new SimError(`snapshot: the format is not "${SNAPSHOT_FORMAT}"`);
    if (snapshot.version !== SNAPSHOT_VERSION) {
      throw new SimError(`snapshot: version ${JSON.stringify(snapshot.version)}, and this sim reads version ${SNAPSHOT_VERSION}`);
    }
    if (sortedKeys(snapshot).join(",") !== keys) throw new SimError(`snapshot: the fields must be exactly ${keys}`);
    if (snapshot.simDataHash !== this.program.simDataHash) {
      throw new SimError(
        `snapshot: it was taken with sim data ${JSON.stringify(snapshot.simDataHash)}, and this sim data is ${this.program.simDataHash}`,
      );
    }
    const { tick, nextId, nextSeq } = snapshot;
    if (!isCount(tick)) throw new SimError("snapshot: tick is not a non-negative integer");
    if (!isCount(nextId) || nextId < 1) throw new SimError("snapshot: nextId is not a positive integer");
    if (!isCount(nextSeq)) throw new SimError("snapshot: nextSeq is not a non-negative integer");

    const rng = snapshot.rng;
    const names = this.program.systems.map((system) => system.name);
    if (!isPlainObject(rng) || sortedKeys(rng).join(",") !== [...names].sort(compareId).join(",")) {
      throw new SimError("snapshot: rng must hold one stream state per system in use");
    }
    for (let i = 0; i < names.length; i += 1) {
      const state = rng[names[i] as string];
      if (!Array.isArray(state) || state.length !== 4 || !state.every(isU32)) {
        throw new SimError(`snapshot: the rng state of "${names[i]}" is not four unsigned 32-bit integers`);
      }
      (this.rngs[i] as Rng).restore(state as unknown as RngState);
    }

    const tables = snapshot.tables;
    if (!isPlainObject(tables)) throw new SimError("snapshot: tables is not an object");
    for (const name of sortedKeys(tables)) {
      if (!this.program.stateTables.has(name)) throw new SimError(`snapshot: no system in use has a state table "${name}"`);
    }
    for (const [name, table] of this.program.stateTables) {
      if (!has(tables, name)) throw new SimError(`snapshot: the state table "${name}" is missing`);
      const source = tables[name];
      if (!Array.isArray(source)) throw new SimError(`snapshot: the state table "${name}" is not a list of rows`);
      const problem = tableProblem(table, source, this.program.refs, nextId);
      if (problem !== null) throw new SimError(`snapshot: state table "${name}": ${problem}`);
      const key = keyName(table);
      const rows = this.rowsOf(name);
      rows.length = 0;
      for (const row of source as readonly Row[]) {
        rows.push(copyFields(table.fields, row, key === null ? {} : { [key]: row[key] as Value }));
      }
    }

    if (!Array.isArray(snapshot.pending)) throw new SimError("snapshot: pending is not a list of commands");
    const queue: QueuedCommand[] = [];
    this.currentTick = tick;
    for (let i = 0; i < snapshot.pending.length; i += 1) {
      const entry: unknown = snapshot.pending[i];
      if (!isPlainObject(entry) || sortedKeys(entry).join(",") !== "payload,seq,tick,type") {
        throw new SimError(`snapshot: pending command ${i} must have exactly payload, seq, tick and type`);
      }
      const { seq, ...command } = entry;
      const problem = this.commandProblem(command);
      if (problem !== null) throw new SimError(`snapshot: pending command ${i}: ${problem}`);
      if (!isCount(seq) || seq >= nextSeq) throw new SimError(`snapshot: pending command ${i}: seq is not below nextSeq`);
      const queued = command as unknown as Command;
      const previous = queue[queue.length - 1];
      if (previous !== undefined && (compareInt(previous.tick, queued.tick) || compareInt(previous.seq, seq)) >= 0) {
        throw new SimError(`snapshot: pending command ${i} is not after command ${i - 1} in (tick, seq) order`);
      }
      const { fields } = this.program.commands.get(queued.type) as CompiledCommand;
      queue.push(Object.freeze({ tick: queued.tick, seq, type: queued.type, payload: Object.freeze(copyFields(fields, queued.payload)) }));
    }
    this.queue = queue;
    this.nextId = nextId;
    this.nextSeq = nextSeq;
  }

  commandLog(): Command[] {
    return this.log.slice();
  }

  pending(): QueuedCommand[] {
    return this.queue.slice();
  }

  tables(): TableInfo[] {
    const out: TableInfo[] = [];
    for (const system of this.program.systems) {
      for (const table of system.tables) {
        out.push({ name: table.name, shape: table.decl.shape, system: system.name, fields: table.fields.map((f) => f.name) });
      }
    }
    return out;
  }

  read(name: string): Row[] {
    const table = this.program.stateTables.get(name);
    if (table === undefined) throw new SimError(`read: no system in use has a state table "${String(name)}"`);
    const key = keyName(table);
    return this.rowsOf(name).map((row) => copyFields(table.fields, row, key === null ? {} : { [key]: row[key] as Value }));
  }

  rngState(system: string): RngState {
    const index = this.program.systems.findIndex((candidate) => candidate.name === system);
    if (index < 0) throw new SimError(`rngState: the system "${String(system)}" is not in use`);
    return (this.rngs[index] as Rng).state();
  }

  describe(options: DescribeOptions = {}): string {
    return describeSim(this, options);
  }
}

/** Why the rows of a table are not what the table declares, or `null`. */
function tableProblem(
  table: CompiledStateTable,
  rows: readonly unknown[],
  refs: Program["refs"],
  nextId: number,
): string | null {
  const key = keyName(table);
  if (key === null && rows.length !== 1) return `a one-row table must have exactly one row, not ${rows.length}`;
  let previous: Value | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const problem = rowProblem(table.fields, row, refs, key === null ? [] : [key]);
    if (problem !== null) return `row ${i}: ${problem}`;
    if (key === null) continue;
    const value = (row as Row)[key];
    if (key === "id") {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value >= nextId) {
        return `row ${i}: the id ${JSON.stringify(value)} is not an entity id the sim gave out`;
      }
    } else if (!isId(value)) {
      return `row ${i}: the key ${JSON.stringify(value)} is not an id`;
    }
    if (previous !== null && !below(previous, value as Value)) {
      return `row ${i}: the ${key} ${JSON.stringify(value)} is not above the one before it (rows are kept in ascending ${key} order)`;
    }
    previous = value as Value;
  }
  return null;
}

/** A new sim at tick 0: the systems the data lists, initialised from its tables. */
export function createSim(options: SimOptions): Sim {
  const kernel = new Kernel(compileProgram(options.systems ?? ENGINE_SYSTEMS, options.data), options.seed);
  kernel.init();
  return kernel;
}

/**
 * The sim a snapshot was taken from, ready to continue. The snapshot must be of this
 * `SNAPSHOT_VERSION` and of the same sim data (by `simDataHash`); everything in it is
 * checked, and anything else is a `SimError`.
 */
export function restoreSim(options: RestoreOptions): Sim {
  const snapshot = options.snapshot;
  const seed = isPlainObject(snapshot) ? snapshot.seed : undefined;
  if (!isU32(seed)) throw new SimError("snapshot: the seed is not an unsigned 32-bit integer");
  const kernel = new Kernel(compileProgram(options.systems ?? ENGINE_SYSTEMS, options.data), seed);
  kernel.load(snapshot);
  return kernel;
}
