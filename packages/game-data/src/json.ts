// The strict JSON reader. Game data is read with this, never with `JSON.parse`, because
// `JSON.parse` silently keeps the last of two equal keys and forgets where a value was.
//
// It reads RFC 8259 JSON and nothing more, refuses a duplicate key, a byte order mark, a lone
// surrogate and a raw control character, and returns a tree of nodes that remember their
// offset in the text. A number keeps the text it was written with, so the schema check can
// tell `3`, `3.0` and `3e0` apart: another player's JSON reader may read the last two as
// floats.

/** A JSON object. `members` are in the order of the file; keys are unique. */
export interface ObjectNode {
  readonly kind: "object";
  readonly offset: number;
  readonly members: readonly Member[];
}

/** One `"key": value` of an object. */
export interface Member {
  readonly key: string;
  /** The offset of the key's opening quote. */
  readonly keyOffset: number;
  readonly value: JsonNode;
}

export interface ArrayNode {
  readonly kind: "array";
  readonly offset: number;
  readonly items: readonly JsonNode[];
}

export interface StringNode {
  readonly kind: "string";
  readonly offset: number;
  readonly value: string;
}

/** A number: its value and the text it was written with (`raw`). */
export interface NumberNode {
  readonly kind: "number";
  readonly offset: number;
  readonly value: number;
  readonly raw: string;
}

export interface BooleanNode {
  readonly kind: "boolean";
  readonly offset: number;
  readonly value: boolean;
}

export interface NullNode {
  readonly kind: "null";
  readonly offset: number;
}

export type JsonNode = ObjectNode | ArrayNode | StringNode | NumberNode | BooleanNode | NullNode;

/** Text that is not strict JSON: what is wrong, where in the text, and at which JSON path. */
export class JsonParseError extends Error {
  readonly offset: number;
  readonly path: string;

  constructor(message: string, offset: number, path: string) {
    super(message);
    this.name = "JsonParseError";
    this.offset = offset;
    this.path = path;
  }
}

/** Deeper nesting than this is refused: no game file needs it, and it bounds the recursion. */
export const MAX_JSON_DEPTH = 64;

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The JSON path of a member: `$.price`, or `$["items.apple.name"]` for a key that is not a plain name. */
export function memberPath(path: string, key: string): string {
  return PLAIN_KEY.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

/** The JSON path of an array item: `$[3]`. */
export function itemPath(path: string, index: number): string {
  return `${path}[${index}]`;
}

/** The 1-based line and column of an offset. A column counts UTF-16 code units. */
export function positionAt(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let lineStart = 0;
  const end = offset < text.length ? offset : text.length;
  for (let i = 0; i < end; i += 1) {
    if (text.charCodeAt(i) === 0x0a) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, col: end - lineStart + 1 };
}

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const ESCAPES: Readonly<Record<string, string>> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

function shown(text: string, at: number): string {
  if (at >= text.length) return "the end of the file";
  const code = text.codePointAt(at) as number;
  if (code < 0x20) return `a control character (U+${code.toString(16).padStart(4, "0").toUpperCase()})`;
  return JSON.stringify(String.fromCodePoint(code));
}

/**
 * Reads strict JSON. Throws a `JsonParseError` on the first thing that is wrong: a syntax
 * error, a duplicate key, a byte order mark, a lone surrogate, a number too large for a
 * double, or nesting deeper than `MAX_JSON_DEPTH`.
 */
export function parseJson(text: string): JsonNode {
  let at = 0;

  const fail = (message: string, offset: number, path: string): never => {
    throw new JsonParseError(message, offset, path);
  };

  const skipSpace = (): void => {
    for (;;) {
      const code = text.charCodeAt(at);
      if (code === 0x20 || code === 0x0a || code === 0x0d || code === 0x09) at += 1;
      else return;
    }
  };

  const readString = (path: string): string => {
    const start = at;
    at += 1;
    let out = "";
    for (;;) {
      if (at >= text.length) fail("a string is not closed", start, path);
      const code = text.charCodeAt(at);
      if (code === 0x22) {
        at += 1;
        break;
      }
      if (code < 0x20) fail(`${shown(text, at)} inside a string: write it as an escape (\\n, \\t, \\u00XX)`, at, path);
      if (code !== 0x5c) {
        out += text.charAt(at);
        at += 1;
        continue;
      }
      const escape = text.charAt(at + 1);
      if (escape === "u") {
        const hex = text.slice(at + 2, at + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("\\u must be followed by four hex digits", at, path);
        out += String.fromCharCode(Number.parseInt(hex, 16));
        at += 6;
      } else {
        const char = ESCAPES[escape];
        if (char === undefined || escape === "") fail(`unknown escape \\${escape}`, at, path);
        out += char;
        at += 2;
      }
    }
    if (!out.isWellFormed()) fail("the string holds half of a surrogate pair, which is not text", start, path);
    return out;
  };

  const readValue = (path: string, depth: number): JsonNode => {
    skipSpace();
    const offset = at;
    const char = text.charAt(at);

    if (char === "{") {
      if (depth >= MAX_JSON_DEPTH) fail(`nested deeper than ${MAX_JSON_DEPTH} levels`, offset, path);
      at += 1;
      const members: Member[] = [];
      const seen = new Set<string>();
      skipSpace();
      if (text.charAt(at) === "}") {
        at += 1;
        return { kind: "object", offset, members };
      }
      for (;;) {
        skipSpace();
        if (text.charAt(at) !== '"') fail(`expected a key in double quotes, found ${shown(text, at)}`, at, path);
        const keyOffset = at;
        const key = readString(path);
        const keyPath = memberPath(path, key);
        if (seen.has(key)) fail(`duplicate key ${JSON.stringify(key)}: an object may hold a key only once`, keyOffset, keyPath);
        seen.add(key);
        skipSpace();
        if (text.charAt(at) !== ":") fail(`expected ":" after the key, found ${shown(text, at)}`, at, keyPath);
        at += 1;
        members.push({ key, keyOffset, value: readValue(keyPath, depth + 1) });
        skipSpace();
        const next = text.charAt(at);
        at += 1;
        if (next === "}") return { kind: "object", offset, members };
        if (next !== ",") fail(`expected "," or "}", found ${shown(text, at - 1)}`, at - 1, path);
      }
    }

    if (char === "[") {
      if (depth >= MAX_JSON_DEPTH) fail(`nested deeper than ${MAX_JSON_DEPTH} levels`, offset, path);
      at += 1;
      const items: JsonNode[] = [];
      skipSpace();
      if (text.charAt(at) === "]") {
        at += 1;
        return { kind: "array", offset, items };
      }
      for (;;) {
        items.push(readValue(itemPath(path, items.length), depth + 1));
        skipSpace();
        const next = text.charAt(at);
        at += 1;
        if (next === "]") return { kind: "array", offset, items };
        if (next !== ",") fail(`expected "," or "]", found ${shown(text, at - 1)}`, at - 1, path);
      }
    }

    if (char === '"') return { kind: "string", offset, value: readString(path) };

    if (char === "-" || (char >= "0" && char <= "9")) {
      NUMBER.lastIndex = at;
      const match = NUMBER.exec(text);
      if (match === null) fail(`expected a number, found ${shown(text, at)}`, offset, path);
      const raw = (match as RegExpExecArray)[0];
      at += raw.length;
      const after = text.charAt(at);
      if ((after >= "0" && after <= "9") || after === "." || after === "e" || after === "E") {
        fail(`${text.slice(offset, at + 1)} is not a JSON number (no leading zero, digits after the point)`, offset, path);
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) fail(`the number ${raw} is too large`, offset, path);
      return { kind: "number", offset, value, raw };
    }

    for (const [word, node] of [
      ["true", { kind: "boolean", offset, value: true }],
      ["false", { kind: "boolean", offset, value: false }],
      ["null", { kind: "null", offset }],
    ] as const) {
      if (text.startsWith(word, at)) {
        at += word.length;
        return node;
      }
    }
    return fail(`expected a value, found ${shown(text, at)}`, offset, path);
  };

  if (text.charCodeAt(0) === 0xfeff) fail("the file starts with a byte order mark: save it as UTF-8 without one", 0, "$");
  const root = readValue("$", 0);
  skipSpace();
  if (at < text.length) fail(`unexpected ${shown(text, at)} after the end of the value`, at, "$");
  return root;
}

/** The member of an object node with this key, or `undefined`. */
export function memberOf(node: ObjectNode, key: string): Member | undefined {
  return node.members.find((member) => member.key === key);
}

/**
 * The plain value of a node: objects, arrays, strings, numbers, booleans and null. A key such
 * as `__proto__` becomes an ordinary own property.
 */
export function nodeValue(node: JsonNode): unknown {
  if (node.kind === "object") {
    const out: Record<string, unknown> = {};
    for (const member of node.members) {
      Object.defineProperty(out, member.key, { value: nodeValue(member.value), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  if (node.kind === "array") return node.items.map(nodeValue);
  if (node.kind === "null") return null;
  return node.value;
}
