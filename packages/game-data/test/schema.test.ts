// The schema dialect: what a schema may say (compileSchema), and what the check reports.

import { describe, expect, it } from "vitest";
import { compileSchema, JSON_SCHEMA_DIALECT, parseJson, parseRef, SchemaError } from "../src/index.ts";
import type { Schema } from "../src/index.ts";

/** `<path>: <message>` of every issue of `text` against `schema`. */
function issues(schema: Schema, text: string, defs?: Record<string, Schema>): string[] {
  return compileSchema("test", schema, defs)
    .check(parseJson(text))
    .issues.map((issue) => `${issue.path}: ${issue.message}`);
}

const INT: Schema = { type: "integer", minimum: 1, maximum: 100 };

describe("integers", () => {
  it("accepts integers within the bounds", () => {
    for (const text of ["1", "100", "42"]) expect(issues(INT, text)).toEqual([]);
    expect(issues({ type: "integer", minimum: -5, maximum: 0 }, "-5")).toEqual([]);
    expect(issues({ type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, "9007199254740991")).toEqual([]);
  });

  it.each([
    ["3.5", "$: 3.5 is not an integer: an integer from 1 to 100 is declared, written without a fraction or an exponent"],
    ["3.0", "$: 3.0 is not an integer: an integer from 1 to 100 is declared, written without a fraction or an exponent"],
    ["3e0", "$: 3e0 is not an integer: an integer from 1 to 100 is declared, written without a fraction or an exponent"],
    ["1E1", "$: 1E1 is not an integer: an integer from 1 to 100 is declared, written without a fraction or an exponent"],
    ["0", "$: 0 is outside 1..100 (an integer from 1 to 100 is declared)"],
    ["101", "$: 101 is outside 1..100 (an integer from 1 to 100 is declared)"],
    ['"3"', '$: expected an integer, found the string "3" (an integer from 1 to 100 is declared)'],
    ["true", "$: expected an integer, found true (an integer from 1 to 100 is declared)"],
    ["null", "$: expected an integer, found null (an integer from 1 to 100 is declared)"],
  ])("refuses %s", (text, issue) => {
    expect(issues(INT, text)).toEqual([issue]);
  });

  it("refuses -0 and integers a double cannot hold", () => {
    const wide: Schema = { type: "integer", minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER };
    expect(issues(wide, "-0")[0]).toMatch(/-0 is not an integer/);
    expect(issues(wide, "9007199254740993")[0]).toMatch(/is too large for an integer/);
  });
});

describe("strings", () => {
  it("checks pattern, lengths (in code points), enum and const", () => {
    const id: Schema = { type: "string", pattern: "^[a-z]+$", maxLength: 5, description: "a short id" };
    expect(issues(id, '"apple"')).toEqual([]);
    expect(issues(id, '"Apple"')).toEqual(['$: "Apple" does not match ^[a-z]+$ (a short id)']);
    expect(issues(id, '"apples"')).toEqual(["$: the string is longer than 5 characters (a short id)"]);
    expect(issues({ type: "string", minLength: 1 }, '""')).toEqual(["$: the string is empty"]);
    expect(issues({ type: "string", minLength: 3 }, '"ab"')).toEqual(['$: "ab" is shorter than 3 characters']);
    expect(issues({ type: "string", maxLength: 2 }, '"\u{1f600}\u{1f600}"')).toEqual([]);
    expect(issues({ type: "string", enum: ["a", "b"] }, '"c"')).toEqual(['$: "c" is not one of: a, b']);
    expect(issues({ type: "string", const: "x" }, '"y"')).toEqual(['$: must be "x", found "y"']);
    expect(issues({ type: "string" }, "5")).toEqual(["$: expected a string, found the number 5"]);
  });

  it("checks display text: NFC, and no control characters but a newline", () => {
    const text: Schema = { type: "string", "x-text": true };
    expect(issues(text, '"Štamgast\\nChléb"')).toEqual([]);
    expect(issues(text, '"Štamgast"')[0]).toMatch(/not in Unicode normal form NFC/);
    expect(issues(text, '"a\\tb"')[0]).toMatch(/control character U\+0009/);
    expect(issues(text, '"a\\u0085b"')[0]).toMatch(/control character U\+0085/);
  });

  it("collects references, with the object they are a field of", () => {
    const schema: Schema = {
      type: "object",
      properties: { sprite: { type: "string", "x-ref": "asset:sprite" }, clip: { type: "string", "x-ref": "clip:sprite" } },
      additionalProperties: false,
    };
    const result = compileSchema("test", schema).check(parseJson('{ "sprite": "a/b", "clip": "walk" }'));
    expect(result.issues).toEqual([]);
    expect(result.refs.map((use) => [use.ref, use.value, use.path, use.parent?.kind])).toEqual([
      ["asset:sprite", "a/b", "$.sprite", "object"],
      ["clip:sprite", "walk", "$.clip", "object"],
    ]);
  });

  it("does not collect a reference from a string that failed its checks", () => {
    const schema: Schema = { type: "string", pattern: "^[a-z]+$", "x-ref": "palette" };
    expect(compileSchema("test", schema).check(parseJson('"NOPE"')).refs).toEqual([]);
  });
});

describe("objects", () => {
  const row: Schema = {
    type: "object",
    properties: { id: { type: "string" }, price: INT },
    required: ["id", "price"],
    additionalProperties: false,
  };

  it("refuses unknown and missing fields, at the right place", () => {
    const text = '{ "id": "a", "prise": 3 }';
    const result = compileSchema("test", row).check(parseJson(text));
    expect(result.issues.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([
      '$.prise: unknown field "prise" (known: id, price)',
      '$: the field "price" is missing',
    ]);
    expect(result.issues[0]?.offset).toBe(text.indexOf('"prise"'));
  });

  it("does not take an inherited name for a declared field", () => {
    expect(issues(row, '{ "id": "a", "price": 1, "constructor": 1, "__proto__": 2 }')).toEqual([
      '$.constructor: unknown field "constructor" (known: id, price)',
      '$.__proto__: unknown field "__proto__" (known: id, price)',
    ]);
  });

  it("checks a map: key pattern and length, value schema, minimum size", () => {
    const map: Schema = {
      type: "object",
      additionalProperties: INT,
      propertyNames: { pattern: "^[a-z.]+$", maxLength: 8, description: "a dotted id" },
      minProperties: 1,
    };
    expect(issues(map, '{ "a.b": 5 }')).toEqual([]);
    expect(issues(map, '{ "A": 5, "toolongkey": 5, "c": 0 }')).toEqual([
      '$.A: the key "A" does not match ^[a-z.]+$ (a dotted id)',
      "$.toolongkey: the key is longer than 8 characters (a dotted id)",
      "$.c: 0 is outside 1..100 (an integer from 1 to 100 is declared)",
    ]);
    expect(issues(map, "{}")).toEqual(["$: 0 fields, at least 1 are needed"]);
    expect(issues(map, "[]")).toEqual(["$: expected an object, found an array"]);
  });
});

describe("arrays", () => {
  it("checks items, sizes and uniqueness", () => {
    const list: Schema = { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2, uniqueItems: true };
    expect(issues(list, '["a", "b"]')).toEqual([]);
    expect(issues(list, "[]")).toEqual(["$: 0 items, at least 1 are needed"]);
    expect(issues(list, '["a", "b", "c"]')).toEqual(["$: 3 items, at most 2 are allowed"]);
    expect(issues(list, '["a", "a"]')).toEqual(['$[1]: "a" is listed twice (first in $[0])']);
    expect(issues(list, '["a", 1]')).toEqual(["$[1]: expected a string, found the number 1"]);
    expect(issues(list, "{}")).toEqual(["$: expected an array, found an object"]);
  });

  it("checks that a field is unique among the rows (x-unique)", () => {
    const rows: Schema = {
      type: "array",
      "x-unique": "id",
      items: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
    };
    expect(issues(rows, '[{ "id": "a" }, { "id": "b" }, { "id": "a" }]')).toEqual(['$[2].id: the id "a" is used twice (first in $[0])']);
  });
});

describe("unions and $ref", () => {
  const defs: Record<string, Schema> = {
    node: {
      "x-tag": "type",
      oneOf: [
        {
          type: "object",
          properties: { type: { type: "string", const: "label" }, text: { type: "string", "x-ref": "string" } },
          required: ["type", "text"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: { type: { type: "string", const: "panel" }, children: { type: "array", items: { $ref: "#/$defs/node" } } },
          required: ["type", "children"],
          additionalProperties: false,
        },
      ],
    },
  };
  const tree: Schema = { $ref: "#/$defs/node" };

  it("checks a tree of tagged variants and collects references inside it", () => {
    const text = '{ "type": "panel", "children": [{ "type": "label", "text": "ui.title" }, { "type": "panel", "children": [] }] }';
    const result = compileSchema("ui", tree, defs).check(parseJson(text));
    expect(result.issues).toEqual([]);
    expect(result.refs.map((use) => `${use.path} ${use.ref} ${use.value}`)).toEqual(["$.children[0].text string ui.title"]);
  });

  it("names the variant problem", () => {
    expect(issues(tree, '{ "type": "button" }', defs)).toEqual(['$.type: unknown type "button" (one of: label, panel)']);
    expect(issues(tree, '{ "text": "x" }', defs)).toEqual(['$: the field "type" is missing (one of: label, panel)']);
    expect(issues(tree, '{ "type": 5 }', defs)).toEqual(["$.type: unknown type the number 5 (one of: label, panel)"]);
    expect(issues(tree, "[]", defs)).toEqual(['$: expected an object with a "type" field, found an array']);
    expect(issues(tree, '{ "type": "panel", "children": [{ "type": "label" }] }', defs)).toEqual(['$.children[0]: the field "text" is missing']);
  });

  it("writes $defs into the JSON Schema", () => {
    const json = compileSchema("ui", tree, defs).toJsonSchema();
    expect(json["$schema"]).toBe(JSON_SCHEMA_DIALECT);
    expect(json["$id"]).toBe("wz:game-data/ui");
    expect(json["$ref"]).toBe("#/$defs/node");
    expect(Object.keys(json["$defs"] as object)).toEqual(["node"]);
  });
});

describe("compileSchema refuses a schema that is wrong", () => {
  const bad = (schema: unknown, defs?: Record<string, Schema>): (() => unknown) => () => compileSchema("bad", schema as Schema, defs);

  it.each([
    [{ type: "integer" }, /an integer must declare its bounds/],
    [{ type: "integer", minimum: 0 }, /an integer must declare its bounds/],
    [{ type: "integer", minimum: 0, maximum: 1.5 }, /an integer must declare its bounds/],
    [{ type: "integer", minimum: 5, maximum: 1 }, /minimum 5 is above maximum 1/],
    [{ type: "number", minimum: 0, maximum: 1 }, /there is no "number" in game data/],
    [{ type: "float" }, /unknown type "float"/],
    [{}, /unknown type undefined/],
    ["string", /a schema must be an object/],
    [{ type: "string", patern: "x" }, /unknown keyword "patern" for type "string"/],
    [{ type: "string", pattern: "(" }, /is not a regular expression/],
    [{ type: "string", minLength: -1 }, /minLength must be a non-negative integer/],
    [{ type: "string", enum: [] }, /enum must be a non-empty list of strings/],
    [{ type: "string", "x-ref": "sprite" }, /x-ref "sprite" is not a reference kind/],
    [{ type: "string", "x-ref": "row:" }, /is not a reference kind/],
    [{ type: "object", properties: {} }, /an object must declare "additionalProperties"/],
    [{ type: "object", properties: { a: { type: "integer" } }, additionalProperties: false }, /\$\.properties\.a: an integer must declare its bounds/],
    [{ type: "object", required: ["a"], additionalProperties: false }, /required names "a", which is not in properties/],
    [{ type: "object", additionalProperties: false, propertyNames: { pattern: "x" } }, /propertyNames needs an additionalProperties schema/],
    [{ type: "object", additionalProperties: { type: "boolean" }, propertyNames: { pattern: "x", minLength: 1 } }, /only "pattern", "maxLength" and "description"/],
    [{ type: "array" }, /an array must declare its "items"/],
    [{ type: "array", items: { type: "boolean" }, uniqueItems: true }, /uniqueItems is for lists of strings or integers/],
    [{ type: "array", items: { type: "string" }, "x-unique": "id" }, /x-unique must name a required string field/],
    [
      { type: "array", "x-unique": "id", items: { type: "object", properties: { id: { type: "string" } }, additionalProperties: false } },
      /x-unique must name a required string field/,
    ],
    [{ $ref: "#/defs/node" }, /\$ref must look like "#\/\$defs\/<name>"/],
    [{ $ref: "#/$defs/node" }, /\$ref names "node", which is not in \$defs/],
    [{ oneOf: [] }, /a oneOf needs "x-tag"/],
    [{ oneOf: [], "x-tag": "type" }, /oneOf must be a non-empty list/],
    [{ oneOf: [{ type: "string" }], "x-tag": "type" }, /a variant must be an object schema/],
    [
      { oneOf: [{ type: "object", properties: { type: { type: "string" } }, required: ["type"], additionalProperties: false }], "x-tag": "type" },
      /a variant needs the required field "type" with a "const"/,
    ],
    [
      {
        "x-tag": "type",
        oneOf: [
          { type: "object", properties: { type: { type: "string", const: "a" } }, required: ["type"], additionalProperties: false },
          { type: "object", properties: { type: { type: "string", const: "a" } }, required: ["type"], additionalProperties: false },
        ],
      },
      /the type "a" is used by two variants/,
    ],
  ])("%j", (schema, message) => {
    expect(bad(schema)).toThrow(SchemaError);
    expect(bad(schema)).toThrow(message);
  });

  it("checks $defs too, and names the schema", () => {
    expect(bad({ type: "boolean" }, { broken: { type: "integer" } as unknown as Schema })).toThrow(/schema bad: \$defs\.broken: an integer must declare its bounds/);
  });
});

describe("parseRef", () => {
  it("reads every reference kind", () => {
    expect(parseRef("row:items")).toEqual({ kind: "row", table: "items" });
    expect(parseRef("table")).toEqual({ kind: "table" });
    expect(parseRef("system")).toEqual({ kind: "system" });
    expect(parseRef("string")).toEqual({ kind: "string" });
    expect(parseRef("doc:scenes")).toEqual({ kind: "doc", slot: "scenes" });
    expect(parseRef("palette")).toEqual({ kind: "palette" });
    expect(parseRef("asset")).toEqual({ kind: "asset", assetKind: null });
    expect(parseRef("asset:sprite")).toEqual({ kind: "asset", assetKind: "sprite" });
    expect(parseRef("clip:sprite")).toEqual({ kind: "clip", field: "sprite" });
    expect(parseRef("sound")).toEqual({ kind: "sound" });
  });

  it.each(["", "row", "clip", "doc", "sprite", "row:Items!", "string:x", 5, null])("refuses %j", (text) => {
    expect(() => parseRef(text)).toThrow(/is not a reference kind/);
  });
});
