// Canonical JSON: one text for one value, on every engine. It is RFC 8785 (JCS) restricted to
// what the sim allows: safe integers, printable ASCII strings, booleans, null, arrays and
// plain objects. Keys are written in ascending order; there is no whitespace.

import { SimError } from "./errors.ts";
import { sortedKeys } from "./order.ts";

/** True for a string of printable ASCII (space to tilde). */
export function isPrintableAscii(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return false;
  }
  return true;
}

function quote(text: string, path: string): string {
  if (!isPrintableAscii(text)) {
    throw new SimError(`canonicalJson: ${path} is not printable ASCII: ${JSON.stringify(text)}`);
  }
  let out = '"';
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    out += char === '"' || char === "\\" ? `\\${char}` : char;
  }
  return `${out}"`;
}

function write(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new SimError(`canonicalJson: ${path} is ${String(value)}, not a safe integer`);
    }
    return value === 0 ? "0" : String(value);
  }
  if (typeof value === "string") return quote(value, path);
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let i = 0; i < value.length; i += 1) items.push(write(value[i], `${path}[${i}]`));
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new SimError(`canonicalJson: ${path} is not a plain object`);
    }
    const record = value as Record<string, unknown>;
    const members: string[] = [];
    for (const key of sortedKeys(record)) {
      members.push(`${quote(key, `a key of ${path}`)}:${write(record[key], `${path}.${key}`)}`);
    }
    return `{${members.join(",")}}`;
  }
  throw new SimError(`canonicalJson: ${path} is a ${typeof value}, which JSON cannot hold`);
}

/**
 * The canonical JSON text of a value. Throws a `SimError` on a float, NaN, a string that is
 * not printable ASCII, `undefined`, or an object that is not plain.
 */
export function canonicalJson(value: unknown): string {
  return write(value, "$");
}
