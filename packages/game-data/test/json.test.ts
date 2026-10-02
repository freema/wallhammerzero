// The strict JSON reader: what it accepts, what it refuses and where it says the problem is.

import { describe, expect, it } from "vitest";
import { JsonParseError, MAX_JSON_DEPTH, itemPath, memberOf, memberPath, nodeValue, parseJson, positionAt } from "../src/index.ts";
import type { ObjectNode } from "../src/index.ts";

/** The error of text that must not parse. */
function refused(text: string): JsonParseError {
  try {
    parseJson(text);
  } catch (error) {
    if (error instanceof JsonParseError) return error;
    throw error;
  }
  throw new Error(`parsed, but should not: ${text}`);
}

describe("what it reads", () => {
  it("gives the same values as JSON.parse for valid JSON", () => {
    const texts = [
      '{"a":1,"b":[true,false,null,"x"],"c":{"d":-2.5e3,"e":""}}',
      ' [ 1 , 2 ,\n\t3 ] ',
      '"\\" \\\\ \\/ \\b \\f \\n \\r \\t \\u00e9 \\ud83d\\ude00 \u00e9 \u{1f600}"',
      "0",
      "-0",
      "1e30",
      "{}",
      "[]",
      '{"":0}',
    ];
    for (const text of texts) expect(nodeValue(parseJson(text))).toEqual(JSON.parse(text));
  });

  it("keeps the text of a number, so 3, 3.0 and 3e0 can be told apart", () => {
    const node = parseJson("[3, 3.0, 3e0, -0]");
    expect(node.kind === "array" && node.items.map((item) => (item.kind === "number" ? item.raw : null))).toEqual(["3", "3.0", "3e0", "-0"]);
  });

  it("remembers where every value and key is", () => {
    const text = '{\n  "items": [\n    { "id": "apple" }\n  ]\n}';
    const root = parseJson(text) as ObjectNode;
    const items = memberOf(root, "items");
    expect(positionAt(text, items?.keyOffset ?? -1)).toEqual({ line: 2, col: 3 });
    const list = items?.value;
    const id = list?.kind === "array" && list.items[0]?.kind === "object" ? memberOf(list.items[0], "id") : undefined;
    expect(positionAt(text, id?.value.offset ?? -1)).toEqual({ line: 3, col: 13 });
    expect(memberOf(root, "nothing")).toBeUndefined();
  });

  it("makes __proto__ an ordinary key", () => {
    const value = nodeValue(parseJson('{"__proto__": {"x": 1}, "constructor": 2}')) as Record<string, unknown>;
    expect(Object.keys(value)).toEqual(["__proto__", "constructor"]);
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)["x"]).toBeUndefined();
  });

  it("writes JSON paths", () => {
    expect(memberPath("$", "price")).toBe("$.price");
    expect(memberPath("$", "items.apple.name")).toBe('$["items.apple.name"]');
    expect(itemPath("$.rows", 3)).toBe("$.rows[3]");
  });
});

describe("what it refuses", () => {
  it("a duplicate key, with the path and the position of the second one", () => {
    const text = '[\n  { "id": "a", "weight": 1, "weight": 2 }\n]';
    const error = refused(text);
    expect(error.message).toBe('duplicate key "weight": an object may hold a key only once');
    expect(error.path).toBe("$[0].weight");
    expect(positionAt(text, error.offset)).toEqual({ line: 2, col: 29 });
    // JSON.parse would quietly keep the last one.
    expect((JSON.parse(text) as { weight: number }[])[0]?.weight).toBe(2);
  });

  it("a duplicate key written with an escape", () => {
    expect(refused('{"a": 1, "\\u0061": 2}').message).toMatch(/^duplicate key "a"/);
  });

  it.each([
    ["", /expected a value, found the end of the file/],
    ["{", /expected a key in double quotes, found the end of the file/],
    ['{"a" 1}', /expected ":" after the key/],
    ['{"a":1,}', /expected a key in double quotes, found "}"/],
    ["[1,]", /expected a value, found "]"/],
    ["[1 2]", /expected "," or "]", found "2"/],
    ['{"a":1 "b":2}', /expected "," or "}"/],
    ["{a:1}", /expected a key in double quotes/],
    ["'a'", /expected a value/],
    ["01", /is not a JSON number/],
    ["1.", /is not a JSON number/],
    [".5", /expected a value/],
    ["+1", /expected a value/],
    ["-", /expected a number/],
    ["NaN", /expected a value/],
    ["1e999", /the number 1e999 is too large/],
    ["tru", /expected a value/],
    ["1 2", /unexpected "2" after the end of the value/],
    ['"abc', /a string is not closed/],
    ['"a\tb"', /a control character \(U\+0009\) inside a string/],
    ['"\\x41"', /unknown escape \\x/],
    ['"\\u12G4"', /\\u must be followed by four hex digits/],
    ['"\\ud83d"', /half of a surrogate pair/],
    ['"\\ude00\\ud83d"', /half of a surrogate pair/],
    ["// note\n1", /expected a value/],
    ["\ufeff{}", /byte order mark/],
  ])("%j", (text, message) => {
    expect(refused(text).message).toMatch(message);
  });

  it("nesting deeper than the limit, and no deeper", () => {
    const nested = (depth: number): string => "[".repeat(depth) + "]".repeat(depth);
    expect(() => parseJson(nested(MAX_JSON_DEPTH))).not.toThrow();
    expect(refused(nested(MAX_JSON_DEPTH + 1)).message).toBe(`nested deeper than ${MAX_JSON_DEPTH} levels`);
  });

  it("says where a syntax error is", () => {
    const text = '{\n  "a": [1, 2,\n  "b": 3\n}';
    const error = refused(text);
    expect(error.path).toBe("$.a");
    expect(positionAt(text, error.offset)).toEqual({ line: 3, col: 6 });
  });
});

describe("positionAt", () => {
  it("counts lines and columns from 1", () => {
    expect(positionAt("ab\ncd", 0)).toEqual({ line: 1, col: 1 });
    expect(positionAt("ab\ncd", 2)).toEqual({ line: 1, col: 3 });
    expect(positionAt("ab\ncd", 3)).toEqual({ line: 2, col: 1 });
    expect(positionAt("ab\ncd", 99)).toEqual({ line: 2, col: 3 });
  });
});
