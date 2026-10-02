// Canonical JSON for the game package: one text, and so one sequence of bytes, for one value.
// It is RFC 8785 (JCS) restricted to integers: object keys in ascending order of their UTF-16
// code units, no whitespace, strings escaped the way ECMAScript's JSON.stringify escapes them,
// and UTF-8 on disk. Game data has no floats (bounded integers and fixed point instead), so
// the one hard part of RFC 8785, the shortest text of a double, never comes up: a number that
// is not a safe integer is refused.
//
// For ASCII data this gives the same text as `canonicalJson` of @whz/sim, which is why the
// `simDataHash` of a package equals the hash the sim computes.

import { fnv1a64Hex } from "@whz/det";

/** A value that canonical JSON cannot hold, or bytes that are not UTF-8. */
export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalError";
  }
}

function write(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new CanonicalError(`${path} is ${String(value)}, not a safe integer`);
    return value === 0 ? "0" : String(value);
  }
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw new CanonicalError(`${path} holds half of a surrogate pair`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let i = 0; i < value.length; i += 1) items.push(write(value[i], `${path}[${i}]`));
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new CanonicalError(`${path} is not a plain object`);
    const record = value as Record<string, unknown>;
    const members: string[] = [];
    // The default sort compares UTF-16 code units, which is the order RFC 8785 asks for.
    for (const key of Object.keys(record).sort()) {
      if (!key.isWellFormed()) throw new CanonicalError(`a key of ${path} holds half of a surrogate pair`);
      members.push(`${JSON.stringify(key)}:${write(record[key], `${path}[${JSON.stringify(key)}]`)}`);
    }
    return `{${members.join(",")}}`;
  }
  throw new CanonicalError(`${path} is ${typeof value === "undefined" ? "undefined" : `a ${typeof value}`}, which JSON cannot hold`);
}

/**
 * The canonical JSON text of a value. Throws a `CanonicalError` on a number that is not a
 * safe integer, `undefined`, a lone surrogate or an object that is not plain.
 */
export function toCanonicalJson(value: unknown): string {
  return write(value, "$");
}

/** The UTF-8 bytes of well-formed text. */
export function utf8Bytes(text: string): Uint8Array {
  let size = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.codePointAt(i) as number;
    if (code > 0xffff) i += 1;
    else if (code >= 0xd800 && code <= 0xdfff) throw new CanonicalError("the text holds half of a surrogate pair");
    size += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.codePointAt(i) as number;
    if (code > 0xffff) i += 1;
    if (code < 0x80) {
      bytes[at++] = code;
    } else if (code < 0x800) {
      bytes[at++] = 0xc0 | (code >> 6);
      bytes[at++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      bytes[at++] = 0xe0 | (code >> 12);
      bytes[at++] = 0x80 | ((code >> 6) & 0x3f);
      bytes[at++] = 0x80 | (code & 0x3f);
    } else {
      bytes[at++] = 0xf0 | (code >> 18);
      bytes[at++] = 0x80 | ((code >> 12) & 0x3f);
      bytes[at++] = 0x80 | ((code >> 6) & 0x3f);
      bytes[at++] = 0x80 | (code & 0x3f);
    }
  }
  return bytes;
}

/**
 * The text of UTF-8 bytes. Strict: an overlong form, a surrogate, a value above U+10FFFF or a
 * cut-off sequence throws a `CanonicalError` that names the byte.
 */
export function utf8Text(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  let at = 0;
  const bad = (index: number): never => {
    throw new CanonicalError(`byte ${index} is not valid UTF-8`);
  };
  while (at < bytes.length) {
    const first = bytes[at] as number;
    let code = first;
    let more = 0;
    let min = 0;
    if (first >= 0x80) {
      if (first >= 0xc2 && first <= 0xdf) [code, more, min] = [first & 0x1f, 1, 0x80];
      else if (first >= 0xe0 && first <= 0xef) [code, more, min] = [first & 0x0f, 2, 0x800];
      else if (first >= 0xf0 && first <= 0xf4) [code, more, min] = [first & 0x07, 3, 0x10000];
      else bad(at);
    }
    for (let i = 1; i <= more; i += 1) {
      const next = bytes[at + i];
      if (next === undefined || (next & 0xc0) !== 0x80) bad(at);
      code = code * 64 + ((next as number) & 0x3f);
    }
    if (code < min || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) bad(at);
    chunk += String.fromCodePoint(code);
    at += more + 1;
    if (chunk.length >= 4096) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}

/** The bytes of a value in a package: its canonical JSON as UTF-8, with no newline at the end. */
export function canonicalBytes(value: unknown): Uint8Array {
  return utf8Bytes(toCanonicalJson(value));
}

/** The content hash of a file of a package: FNV-1a 64 over its bytes, as 16 hex digits. */
export function contentHash(bytes: Uint8Array): string {
  return fnv1a64Hex(bytes);
}
