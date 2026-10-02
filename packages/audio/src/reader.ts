// Strict reading of JSON values: every field is named, typed and bounded, an unknown field is
// an error, and so is a key that appears twice in one object (JSON.parse would silently keep
// the last one, and a song with two "lead" lists would lose a channel without a word).

import type { Report } from "./findings.ts";

export type JsonObject = Readonly<Record<string, unknown>>;

/** Names of things in a file: instruments, channels, sections, layers, states, drum keys. */
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
/** The id of a song or an SFX: lowercase, dotted, like `bgm.shop.day`. */
const ID = /^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/;

export function isName(text: string): boolean {
  return NAME.test(text);
}

export function isId(text: string): boolean {
  return ID.test(text) && text.length <= 64;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "string") return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `a ${typeof value}`;
}

/** `path.key`, or just `key` at the top of the file. */
export function join(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

/** A JSON object (not a list, not null); reports and returns null otherwise. */
export function readObject(report: Report, value: unknown, path: string): JsonObject | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    report.error("parse", path, `must be an object, got ${describe(value)}`);
    return null;
  }
  return value as JsonObject;
}

/**
 * Checks the keys of an object: every `required` key must be there, and nothing but
 * `required` and `optional` keys may be. Returns false if a required key is missing.
 */
export function checkFields(report: Report, object: JsonObject, path: string, required: readonly string[], optional: readonly string[] = []): boolean {
  let complete = true;
  for (const key of required) {
    if (!Object.hasOwn(object, key)) {
      report.error("parse", path, `the field "${key}" is missing`);
      complete = false;
    }
  }
  for (const key of Object.keys(object)) {
    if (!required.includes(key) && !optional.includes(key)) {
      report.error("parse", join(path, key), `unknown field (known: ${[...required, ...optional].join(", ")})`);
    }
  }
  return complete;
}

export interface NumberBounds {
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}

/** A finite number within bounds; reports and returns null otherwise. */
export function readNumber(report: Report, value: unknown, path: string, bounds: NumberBounds): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    report.error("parse", path, `must be a number, got ${describe(value)}`);
    return null;
  }
  if (bounds.integer === true && !Number.isInteger(value)) {
    report.error("parse", path, `must be an integer, got ${value}`);
    return null;
  }
  if (value < bounds.min || value > bounds.max) {
    report.error("parse", path, `must be between ${bounds.min} and ${bounds.max}, got ${value}`);
    return null;
  }
  return value;
}

export function readString(report: Report, value: unknown, path: string): string | null {
  if (typeof value !== "string") {
    report.error("parse", path, `must be a string, got ${describe(value)}`);
    return null;
  }
  return value;
}

/** One of a fixed set of values. */
export function readChoice<T extends string | number>(report: Report, value: unknown, path: string, choices: readonly T[]): T | null {
  if (!choices.includes(value as T)) {
    report.error("parse", path, `must be one of ${choices.map((choice) => JSON.stringify(choice)).join(", ")}, got ${describe(value)}`);
    return null;
  }
  return value as T;
}

export function readList(report: Report, value: unknown, path: string): readonly unknown[] | null {
  if (!Array.isArray(value)) {
    report.error("parse", path, `must be a list, got ${describe(value)}`);
    return null;
  }
  return value;
}

/** A list of strings; an entry that is not a string is reported and the list is dropped. */
export function readStrings(report: Report, value: unknown, path: string): readonly string[] | null {
  const list = readList(report, value, path);
  if (list === null) return null;
  let fine = true;
  list.forEach((item, i) => {
    if (readString(report, item, `${path}[${i}]`) === null) fine = false;
  });
  return fine ? (list as readonly string[]) : null;
}

/** The keys of an object whose keys are names chosen by the author. Bad names are reported. */
export function readNames(report: Report, object: JsonObject, path: string, what: string): string[] {
  const names: string[] = [];
  for (const key of Object.keys(object)) {
    if (isName(key)) names.push(key);
    else report.error("parse", join(path, key), `${what} names are letters, digits, "_" and "-", starting with a letter (at most 32 characters)`);
  }
  return names;
}

// ---------------------------------------------------------------------------------------
// Duplicate keys

/**
 * The keys that appear twice in one object of a JSON text, as paths (`sections.A.lead`).
 * The text must be valid JSON (run JSON.parse first); this walks it only to compare keys.
 */
export function duplicateKeys(text: string): string[] {
  const found: string[] = [];
  let at = 0;

  const skipSpace = (): void => {
    while (at < text.length && " \t\n\r".includes(text.charAt(at))) at += 1;
  };
  const readStringToken = (): string => {
    const start = at;
    at += 1;
    while (at < text.length && text.charAt(at) !== '"') at += text.charAt(at) === "\\" ? 2 : 1;
    at += 1;
    return JSON.parse(text.slice(start, at)) as string;
  };
  const value = (path: string): void => {
    skipSpace();
    const first = text.charAt(at);
    if (first === "{") {
      at += 1;
      const seen = new Set<string>();
      skipSpace();
      if (text.charAt(at) === "}") {
        at += 1;
        return;
      }
      while (at < text.length) {
        skipSpace();
        const key = readStringToken();
        const here = join(path, key);
        if (seen.has(key)) found.push(here);
        seen.add(key);
        skipSpace();
        at += 1; // the colon
        value(here);
        skipSpace();
        const next = text.charAt(at);
        at += 1;
        if (next !== ",") return;
      }
    } else if (first === "[") {
      at += 1;
      skipSpace();
      if (text.charAt(at) === "]") {
        at += 1;
        return;
      }
      for (let i = 0; at < text.length; i += 1) {
        value(`${path}[${i}]`);
        skipSpace();
        const next = text.charAt(at);
        at += 1;
        if (next !== ",") return;
      }
    } else if (first === '"') {
      readStringToken();
    } else {
      // A number, true, false or null: runs to the next delimiter.
      while (at < text.length && !",]} \t\n\r".includes(text.charAt(at))) at += 1;
    }
  };

  value("");
  return found;
}

/**
 * Parses JSON text strictly: a syntax error or a duplicate key is reported, and null comes
 * back.
 */
export function readJsonText(report: Report, text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    report.error("parse", "", `not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const duplicates = duplicateKeys(text);
  for (const path of duplicates) report.error("parse", path, "this key appears twice in the same object; JSON keeps only the last one");
  return duplicates.length > 0 ? null : value;
}
