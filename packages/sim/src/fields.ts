// Field types: what a value in a data table, a state table, a command payload or an event
// payload may be. There are three: a bounded integer, a boolean and an ASCII id. There is no
// float, no free text, no null and no nesting: a list is a table.

import type { ByteWriter } from "./bytes.ts";
import { SimError } from "./errors.ts";
import { compareId, sortedKeys } from "./order.ts";

/** An integer in `[min, max]`. Both bounds are safe integers. */
export interface IntField {
  readonly kind: "int";
  readonly min: number;
  readonly max: number;
}

export interface BoolField {
  readonly kind: "bool";
}

/** An ASCII id (see `isId`). With `ref`, it must be the id of a row of that data table. */
export interface IdField {
  readonly kind: "id";
  readonly ref: string | null;
}

export type FieldType = IntField | BoolField | IdField;

/** The fields of a table row or a payload, by name. */
export type Fields = Readonly<Record<string, FieldType>>;

/** A value the sim can hold. */
export type Value = number | boolean | string;

/** A row of plain data. */
export type Row = Record<string, Value>;

type ValueOf<T extends FieldType> = T extends IntField ? number : T extends BoolField ? boolean : string;

/** The TypeScript shape of a row with the fields `F`. */
export type RowOf<F extends Fields> = { -readonly [K in keyof F]: ValueOf<F[K]> };

/** The largest signed 32-bit integer. Sim values normally stay within 32 bits. */
export const I32_MAX = 0x7fffffff;
/** The smallest signed 32-bit integer. */
export const I32_MIN = -0x80000000;

/**
 * The field types, for declarations: `field.int(0, 100)`, `field.count`, `field.i32`,
 * `field.bool`, `field.id`, `field.ref("items")`.
 */
export const field = {
  /** An integer in `[min, max]`. Bounds outside 32 bits are encoded in 64 bits (hard cap 2^53). */
  int(min: number, max: number): IntField {
    return { kind: "int", min, max };
  },
  /** Any signed 32-bit integer. */
  i32: { kind: "int", min: I32_MIN, max: I32_MAX } as IntField,
  /** A count: an integer from 0 to 2^31 - 1. */
  count: { kind: "int", min: 0, max: I32_MAX } as IntField,
  /** A boolean. */
  bool: { kind: "bool" } as BoolField,
  /** An ASCII id that is not checked against a table. */
  id: { kind: "id", ref: null } as IdField,
  /** The id of a row of the data table `table` (a "rows" table of a system in use). */
  ref(table: string): IdField {
    return { kind: "id", ref: table };
  },
} as const;

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const MAX_NAME_LENGTH = 64;

/**
 * True for an id: lowercase ASCII letters and digits in groups joined by `.`, `-` or `_`,
 * starting with a letter, at most 64 characters (`apple`, `shop.set-price`). Rows of data
 * tables, systems, command types and event types are named by ids.
 */
export function isId(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_NAME_LENGTH && ID_PATTERN.test(value);
}

/** True for a table or field name: a camelCase ASCII identifier of at most 64 characters. */
export function isName(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_NAME_LENGTH && NAME_PATTERN.test(value);
}

/** One field, compiled: its name, its type and whether it needs 64 bits in the encoding. */
export interface CompiledField {
  readonly name: string;
  readonly type: FieldType;
  readonly wide: boolean;
}

/**
 * Checks a field declaration and returns its fields in the canonical order: ascending by
 * name. `reserved` names (the `id` of an entity, the `key` of a map row) cannot be fields.
 */
export function compileFields(fields: Fields, what: string, reserved: readonly string[] = []): CompiledField[] {
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    throw new SimError(`${what}: the fields must be an object of field types`);
  }
  const compiled: CompiledField[] = [];
  for (const name of sortedKeys(fields)) {
    if (!isName(name)) throw new SimError(`${what}: "${name}" is not a field name (a camelCase ASCII identifier)`);
    if (reserved.includes(name)) throw new SimError(`${what}: the field name "${name}" is reserved`);
    const type = fields[name] as FieldType | undefined;
    if (typeof type !== "object" || type === null) throw new SimError(`${what}.${name}: not a field type`);
    if (type.kind === "int") {
      if (!Number.isSafeInteger(type.min) || !Number.isSafeInteger(type.max) || type.min > type.max) {
        throw new SimError(`${what}.${name}: int needs safe integer bounds with min <= max, got ${String(type.min)} and ${String(type.max)}`);
      }
      compiled.push({ name, type, wide: type.min < I32_MIN || type.max > I32_MAX });
    } else if (type.kind === "bool") {
      compiled.push({ name, type, wide: false });
    } else if (type.kind === "id") {
      if (type.ref !== null && !isName(type.ref)) {
        throw new SimError(`${what}.${name}: ref "${String(type.ref)}" is not a table name`);
      }
      compiled.push({ name, type, wide: false });
    } else {
      throw new SimError(`${what}.${name}: unknown field kind ${JSON.stringify((type as { kind?: unknown }).kind)}`);
    }
  }
  return compiled;
}

/** The ids of each "rows" data table, for checking `ref` fields. */
export type RefIds = ReadonlyMap<string, ReadonlySet<string>>;

/** Why `value` does not fit the field type, or `null` if it does. */
export function valueProblem(type: FieldType, value: unknown, refs: RefIds | null): string | null {
  if (type.kind === "int") {
    if (typeof value !== "number" || !Number.isSafeInteger(value)) return `${show(value)} is not an integer`;
    if (value < type.min || value > type.max) return `${value} is outside [${type.min}, ${type.max}]`;
    return null;
  }
  if (type.kind === "bool") {
    return typeof value === "boolean" ? null : `${show(value)} is not a boolean`;
  }
  if (!isId(value)) return `${show(value)} is not an id`;
  if (type.ref !== null && refs !== null) {
    const ids = refs.get(type.ref);
    if (ids === undefined) return `the data table "${type.ref}" it refers to is not in use`;
    if (!ids.has(value)) return `"${value}" is not a row of the data table "${type.ref}"`;
  }
  return null;
}

function show(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return String(value);
  return Array.isArray(value) ? "an array" : `a ${typeof value}`;
}

/** True if `record` has the own property `key`. */
export function has(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** True for a plain object (not null, not an array, no class). */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Why `record` is not exactly a row of `fields` (plus the `extra` keys, which the caller
 * checks), or `null` if it is. Unknown and missing fields are both problems.
 */
export function rowProblem(
  fields: readonly CompiledField[],
  record: unknown,
  refs: RefIds | null,
  extra: readonly string[] = [],
): string | null {
  if (!isPlainObject(record)) return "not a plain object";
  let known = 0;
  for (const field of fields) {
    if (!has(record, field.name)) return `the field "${field.name}" is missing`;
    const problem = valueProblem(field.type, record[field.name], refs);
    if (problem !== null) return `${field.name}: ${problem}`;
    known += 1;
  }
  for (const name of extra) {
    if (has(record, name)) known += 1;
  }
  const keys = Object.keys(record);
  if (keys.length !== known) {
    const names = fields.map((field) => field.name);
    const unknown = keys.filter((key) => !names.includes(key) && !extra.includes(key)).sort(compareId);
    return `unknown field ${unknown.map((key) => `"${key}"`).join(", ")}`;
  }
  return null;
}

/**
 * A copy of the declared fields of `record`, in canonical order. The caller checked it.
 * A negative zero is stored as zero, so what is stored is what a snapshot gives back.
 */
export function copyFields(fields: readonly CompiledField[], record: Readonly<Record<string, unknown>>, into: Row = {}): Row {
  for (const { name } of fields) {
    const value = record[name] as Value;
    into[name] = value === 0 ? 0 : value;
  }
  return into;
}

/** Writes the declared fields of a checked row, in canonical order. */
export function encodeFields(writer: ByteWriter, fields: readonly CompiledField[], row: Readonly<Row>): void {
  for (const field of fields) {
    const value = row[field.name];
    if (field.type.kind === "int") {
      if (field.wide) writer.i64(value as number);
      else writer.i32(value as number);
    } else if (field.type.kind === "bool") {
      writer.u8(value === true ? 1 : 0);
    } else {
      writer.str(value as string);
    }
  }
}
