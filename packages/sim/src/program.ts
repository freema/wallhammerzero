// A program: the systems a game uses, compiled and checked, with the game's data tables
// loaded. Everything that can be wrong with a declaration or with the data is found here,
// before the first tick.

import { fnv1a64Hex } from "@whz/det";
import { canonicalJson } from "./canonical.ts";
import { SimError } from "./errors.ts";
import { compileFields, copyFields, has, isId, isName, isPlainObject, rowProblem } from "./fields.ts";
import type { CompiledField, Row } from "./fields.ts";
import { sortTotal, compareId, sortedKeys } from "./order.ts";
import type { CommandDecl, DataTableDecl, EventDecl, StateTableDecl, SystemDef } from "./system.ts";
import { event } from "./system.ts";
import { field } from "./fields.ts";

/**
 * The part of a game that affects the simulation: the systems it uses and their data tables.
 * A "record" table is one object; a "rows" table is an array of objects with an `id`.
 */
export interface SimData {
  readonly systems: readonly string[];
  readonly tables: Readonly<Record<string, unknown>>;
}

export interface CompiledDataTable {
  readonly decl: DataTableDecl;
  readonly system: string;
  readonly fields: readonly CompiledField[];
}

export interface CompiledStateTable {
  readonly decl: StateTableDecl;
  readonly name: string;
  readonly system: string;
  readonly fields: readonly CompiledField[];
}

export interface CompiledCommand {
  readonly decl: CommandDecl;
  readonly systemIndex: number;
  readonly fields: readonly CompiledField[];
}

export interface CompiledEvent {
  readonly decl: EventDecl;
  readonly fields: readonly CompiledField[];
}

export interface CompiledSystem {
  readonly def: SystemDef;
  readonly name: string;
  /** The state tables of the system, ascending by name. */
  readonly tables: readonly CompiledStateTable[];
}

/** The loaded rows of one data table. */
export interface LoadedTable {
  readonly record: Readonly<Row> | null;
  readonly rows: readonly Readonly<Row>[];
  readonly byId: ReadonlyMap<string, Readonly<Row>>;
}

export interface Program {
  /** The systems in use, in kernel order (the order of the registry). */
  readonly systems: readonly CompiledSystem[];
  readonly dataTables: ReadonlyMap<string, CompiledDataTable>;
  readonly stateTables: ReadonlyMap<string, CompiledStateTable>;
  readonly commands: ReadonlyMap<string, CompiledCommand>;
  readonly events: ReadonlyMap<string, CompiledEvent>;
  readonly data: ReadonlyMap<string, LoadedTable>;
  /** The ids of every "rows" data table, for `ref` fields. */
  readonly refs: ReadonlyMap<string, ReadonlySet<string>>;
  readonly simDataHash: string;
}

/**
 * The event the kernel emits when a command's `apply` returns a reason: the command's
 * sequence number and type, and the reason id.
 */
export const commandRejected = event("command.rejected", {
  command: field.id,
  reason: field.id,
  seq: field.count,
});

/**
 * The hash of the sim data: FNV-1a 64 over its canonical JSON, as 16 hex digits. Replays,
 * snapshots and saves carry it, so they are never run against other data.
 */
export function hashSimData(data: SimData): string {
  return fnv1a64Hex(canonicalJson(data));
}

function checkRefs(fields: readonly CompiledField[], what: string, dataTables: ReadonlyMap<string, CompiledDataTable>): void {
  for (const { name, type } of fields) {
    if (type.kind !== "id" || type.ref === null) continue;
    const target = dataTables.get(type.ref);
    if (target === undefined) {
      throw new SimError(`${what}.${name}: refers to the data table "${type.ref}", which no system in use declares`);
    }
    if (target.decl.shape !== "rows") {
      throw new SimError(`${what}.${name}: refers to "${type.ref}", which is a record, not a table of rows`);
    }
  }
}

function loadTable(table: CompiledDataTable, value: unknown): LoadedTable {
  const name = table.decl.name;
  if (table.decl.shape === "record") {
    const problem = rowProblem(table.fields, value, null);
    if (problem !== null) throw new SimError(`data table "${name}": ${problem}`);
    const record = Object.freeze(copyFields(table.fields, value as Record<string, unknown>));
    return { record, rows: [], byId: new Map() };
  }
  if (!Array.isArray(value)) throw new SimError(`data table "${name}": must be an array of rows`);
  const rows: Readonly<Row>[] = [];
  const byId = new Map<string, Readonly<Row>>();
  for (let i = 0; i < value.length; i += 1) {
    const source: unknown = value[i];
    const problem = rowProblem(table.fields, source, null, ["id"]);
    if (problem !== null) throw new SimError(`data table "${name}", row ${i}: ${problem}`);
    const rowId = (source as Record<string, unknown>).id;
    if (!isId(rowId)) throw new SimError(`data table "${name}", row ${i}: the id ${JSON.stringify(rowId)} is not an id`);
    if (byId.has(rowId)) throw new SimError(`data table "${name}", row ${i}: the id "${rowId}" is used twice`);
    const row = Object.freeze(copyFields(table.fields, source as Record<string, unknown>, { id: rowId }));
    rows.push(row);
    byId.set(rowId, row);
  }
  return { record: null, rows: Object.freeze(rows), byId };
}

/** Checks the registry itself: the names of the systems are ids and unique. */
function checkRegistry(registry: readonly SystemDef[]): void {
  const seen = new Set<string>();
  for (const def of registry) {
    if (!isId(def.name)) throw new SimError(`system ${JSON.stringify(def.name)}: the name is not an id`);
    if (seen.has(def.name)) throw new SimError(`system "${def.name}" is registered twice`);
    seen.add(def.name);
  }
}

/**
 * Compiles the systems `data.systems` lists (in registry order) and loads `data.tables`.
 * Throws a `SimError` that names what is wrong and where.
 */
export function compileProgram(registry: readonly SystemDef[], data: SimData): Program {
  checkRegistry(registry);
  if (!isPlainObject(data) || sortedKeys(data).join(",") !== "systems,tables") {
    throw new SimError('sim data: must be an object with exactly "systems" and "tables"');
  }
  if (!Array.isArray(data.systems)) throw new SimError("sim data: systems must be an array of system names");
  if (!isPlainObject(data.tables)) throw new SimError("sim data: tables must be an object of tables by name");

  const wanted = new Set<string>();
  for (const name of data.systems as readonly unknown[]) {
    if (typeof name !== "string" || !registry.some((def) => def.name === name)) {
      const known = sortTotal(registry.map((def) => def.name), compareId).join(", ");
      throw new SimError(`sim data: unknown system ${JSON.stringify(name)} (the engine has: ${known})`);
    }
    if (wanted.has(name)) throw new SimError(`sim data: the system "${name}" is listed twice`);
    wanted.add(name);
  }

  const systems: CompiledSystem[] = [];
  const dataTables = new Map<string, CompiledDataTable>();
  const stateTables = new Map<string, CompiledStateTable>();
  const commands = new Map<string, CompiledCommand>();
  const events = new Map<string, CompiledEvent>();
  events.set(commandRejected.type, {
    decl: commandRejected,
    fields: compileFields(commandRejected.payload, `event "${commandRejected.type}"`),
  });

  for (const def of registry) {
    if (!wanted.has(def.name)) continue;
    for (const required of def.requires ?? []) {
      if (!wanted.has(required)) {
        throw new SimError(`sim data: the system "${def.name}" requires "${required}", which the game does not list`);
      }
    }
    const systemIndex = systems.length;
    for (const decl of def.data ?? []) {
      const what = `data table "${decl.name}" of system "${def.name}"`;
      if (!isName(decl.name)) throw new SimError(`${what}: the name is not a camelCase identifier`);
      if (dataTables.has(decl.name)) throw new SimError(`${what}: another system in use declares a data table of that name`);
      if (decl.shape !== "record" && decl.shape !== "rows") throw new SimError(`${what}: unknown shape`);
      dataTables.set(decl.name, {
        decl,
        system: def.name,
        fields: compileFields(decl.fields, what, decl.shape === "rows" ? ["id"] : []),
      });
    }
    const tables: CompiledStateTable[] = [];
    for (const decl of def.state ?? []) {
      const what = `state table "${decl.name}" of system "${def.name}"`;
      if (!isName(decl.name)) throw new SimError(`${what}: the name is not a camelCase identifier`);
      if (stateTables.has(decl.name)) throw new SimError(`${what}: another system in use declares a state table of that name`);
      if (decl.shape !== "one" && decl.shape !== "entities" && decl.shape !== "map") throw new SimError(`${what}: unknown shape`);
      const reserved = decl.shape === "entities" ? ["id"] : decl.shape === "map" ? ["key"] : [];
      const table = { decl, name: decl.name, system: def.name, fields: compileFields(decl.fields, what, reserved) };
      if (decl.shape === "one") {
        for (const { name, type } of table.fields) {
          if (type.kind === "id" && type.ref !== null) {
            // A one-row table starts with zeros; a ref has no default row to point at.
            throw new SimError(`${what}.${name}: a one-row table cannot hold a ref; use a plain id and set it in init`);
          }
        }
      }
      stateTables.set(decl.name, table);
      tables.push(table);
    }
    for (const decl of def.commands ?? []) {
      const what = `command "${decl.type}" of system "${def.name}"`;
      if (!isId(decl.type)) throw new SimError(`${what}: the type is not an id`);
      if (commands.has(decl.type)) throw new SimError(`${what}: another system in use declares that command`);
      if (typeof decl.apply !== "function") throw new SimError(`${what}: apply is not a function`);
      commands.set(decl.type, { decl, systemIndex, fields: compileFields(decl.payload, what) });
    }
    for (const decl of def.events ?? []) {
      const what = `event "${decl.type}" of system "${def.name}"`;
      if (!isId(decl.type)) throw new SimError(`${what}: the type is not an id`);
      if (events.has(decl.type)) throw new SimError(`${what}: that event type is already declared`);
      events.set(decl.type, { decl, fields: compileFields(decl.payload, what) });
    }
    systems.push({ def, name: def.name, tables: sortTotal(tables, (a, b) => compareId(a.name, b.name)) });
  }

  for (const [name, table] of dataTables) checkRefs(table.fields, `data table "${name}"`, dataTables);
  for (const [name, table] of stateTables) checkRefs(table.fields, `state table "${name}"`, dataTables);
  for (const [type, compiled] of commands) checkRefs(compiled.fields, `command "${type}"`, dataTables);
  for (const [type, compiled] of events) checkRefs(compiled.fields, `event "${type}"`, dataTables);

  const loaded = new Map<string, LoadedTable>();
  const refs = new Map<string, ReadonlySet<string>>();
  for (const name of sortedKeys(data.tables)) {
    const table = dataTables.get(name);
    if (table === undefined) {
      throw new SimError(`sim data: no system in use declares the data table "${name}"`);
    }
    const tableData = loadTable(table, data.tables[name]);
    loaded.set(name, tableData);
    if (table.decl.shape === "rows") refs.set(name, new Set(tableData.byId.keys()));
  }
  for (const [name, table] of dataTables) {
    if (!has(data.tables, name)) {
      throw new SimError(`sim data: the data table "${name}" of system "${table.system}" is missing`);
    }
  }
  // The second pass: every ref inside the data points at a row that exists.
  for (const [name, table] of dataTables) {
    const tableData = loaded.get(name) as LoadedTable;
    const rows = tableData.record === null ? tableData.rows : [tableData.record];
    for (let i = 0; i < rows.length; i += 1) {
      const problem = rowProblem(table.fields, rows[i], refs, ["id"]);
      if (problem !== null) throw new SimError(`data table "${name}", row ${i}: ${problem}`);
    }
  }

  return { systems, dataTables, stateTables, commands, events, data: loaded, refs, simDataHash: hashSimData(data) };
}
