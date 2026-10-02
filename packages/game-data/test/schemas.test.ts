// The schemas of the source files: the id rules agree with the sim, table schemas follow the
// system declarations, and every schema is a standard JSON Schema document.

import { counterShop, dataRecord, dataRows, ENGINE_SYSTEMS, field, isId, isName } from "@whz/sim";
import { describe, expect, it } from "vitest";
import {
  ASSET_ID_PATTERN,
  GAME_ID_PATTERN,
  GAME_SCHEMA,
  JSON_SCHEMA_DIALECT,
  LOCALE_PATTERN,
  LOCALE_SCHEMA,
  NAME_PATTERN,
  PACKAGE_SCHEMA,
  PALETTE_ID_PATTERN,
  parseJson,
  PRESENTATION,
  ROW_ID_PATTERN,
  STRING_ID_PATTERN,
  tableSchema,
} from "../src/index.ts";

const matches = (pattern: string, text: string): boolean => new RegExp(pattern, "u").test(text);

describe("the id rules", () => {
  const SAMPLES = ["apple", "shop.set-price", "a_b", "a1", "1a", "Apple", "a..b", "a.", ".a", "a-", "a b", "", "customerKinds", "é", "a/b", "x".repeat(64)];

  it("a row id is what the sim calls an id", () => {
    for (const text of SAMPLES) expect([text, matches(ROW_ID_PATTERN, text)]).toEqual([text, isId(text)]);
  });

  it("a table name is what the sim calls a name", () => {
    for (const text of SAMPLES) expect([text, matches(NAME_PATTERN, text)]).toEqual([text, isName(text)]);
  });

  it.each([
    [GAME_ID_PATTERN, ["counter-shop", "shop2", "a"], ["Counter", "counter_shop", "counter.shop", "-a", "a-", "examples/counter-shop", ""]],
    [STRING_ID_PATTERN, ["items.apple.name", "customerKinds.student.name", "ui.shop.open-button", "a"], ["items..name", ".a", "a.", "items.apple name", "", "1a"]],
    [LOCALE_PATTERN, ["en", "cs", "pt-BR", "fil"], ["EN", "en-us", "english", "e", "en_US"]],
    [PALETTE_ID_PATTERN, ["example", "shop-warm", "8bit"], ["Example", "a_b", "a/b", ""]],
    [ASSET_ID_PATTERN, ["examples/blinking-dot", "fx-core/money-pop", "a/b/c"], ["blinking-dot", "examples/", "Examples/dot", "a//b"]],
  ])("%s", (pattern, good, bad) => {
    for (const text of good) expect([text, matches(pattern, text)]).toEqual([text, true]);
    for (const text of bad) expect([text, matches(pattern, text)]).toEqual([text, false]);
  });
});

describe("tableSchema", () => {
  it("turns a rows declaration into an array of rows with a unique id, fields in name order", () => {
    const schema = tableSchema(counterShop.items);
    expect(schema.name).toBe("table/items");
    expect(schema.schema).toEqual({
      type: "array",
      "x-unique": "id",
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: ROW_ID_PATTERN, maxLength: 64, description: "a row id: lowercase ASCII words joined by . - or _" },
          price: { type: "integer", minimum: 1, maximum: 100000 },
          stock: { type: "integer", minimum: 0, maximum: 1000000 },
          unitCost: { type: "integer", minimum: 0, maximum: 100000 },
          weight: { type: "integer", minimum: 0, maximum: 1000 },
        },
        required: ["id", "price", "stock", "unitCost", "weight"],
        additionalProperties: false,
      },
    });
  });

  it("turns a record declaration into one object", () => {
    expect(tableSchema(counterShop.shopConfig).schema).toEqual({
      type: "object",
      properties: { serviceTicks: { type: "integer", minimum: 1, maximum: 1000 }, startMoney: { type: "integer", minimum: 0, maximum: 1000000000 } },
      required: ["serviceTicks", "startMoney"],
      additionalProperties: false,
    });
  });

  it("maps every field type: bounded integers, booleans, ids and row references", () => {
    const decl = dataRows("recipes", { input: field.ref("kinds"), fast: field.bool, tag: field.id, ticks: field.int(-3, 7) });
    const row = (tableSchema(decl).schema as { items: { properties: Record<string, unknown> } }).items.properties;
    expect(row["input"]).toEqual({ type: "string", pattern: ROW_ID_PATTERN, maxLength: 64, "x-ref": "row:kinds", description: "the id of a row of kinds" });
    expect(row["tag"]).toEqual({ type: "string", pattern: ROW_ID_PATTERN, maxLength: 64, description: "an id" });
    expect(row["fast"]).toEqual({ type: "boolean" });
    expect(row["ticks"]).toEqual({ type: "integer", minimum: -3, maximum: 7 });
  });

  it("accepts and refuses rows as the sim would", () => {
    const check = (text: string): string[] =>
      tableSchema(counterShop.customerKinds)
        .check(parseJson(text))
        .issues.map((issue) => `${issue.path}: ${issue.message}`);
    expect(check('[{ "id": "student", "weight": 5, "budgetMin": 2, "budgetMax": 6, "patience": 12 }]')).toEqual([]);
    expect(check('[{ "id": "Student", "weight": 1001, "budgetMin": 2, "budgetMax": 6 }]')).toEqual([
      '$[0].id: "Student" does not match ^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$ (a row id: lowercase ASCII words joined by . - or _)',
      "$[0].weight: 1001 is outside 0..1000 (an integer from 0 to 1000 is declared)",
      '$[0]: the field "patience" is missing',
    ]);
    expect(tableSchema(dataRecord("lab", { n: field.count })).check(parseJson("[]")).issues[0]?.message).toBe("expected an object, found an array");
  });

  it("works for every data table of the engine", () => {
    for (const system of ENGINE_SYSTEMS) for (const decl of system.data ?? []) expect(() => tableSchema(decl)).not.toThrow();
  });
});

describe("the schemas as JSON Schema documents", () => {
  it("are plain JSON with $schema and $id", () => {
    for (const schema of [GAME_SCHEMA, LOCALE_SCHEMA, PACKAGE_SCHEMA, tableSchema(counterShop.items)]) {
      const json = JSON.parse(JSON.stringify(schema.toJsonSchema())) as Record<string, unknown>;
      expect(json["$schema"]).toBe(JSON_SCHEMA_DIALECT);
      expect(json["$id"]).toBe(`wz:game-data/${schema.name}`);
    }
    expect(GAME_SCHEMA.toJsonSchema()["required"]).toEqual(["schemaVersion", "id", "title", "resolution", "palette", "systems"]);
  });

  it("declare bounds on every integer and strictness on every object", () => {
    // compileSchema enforces it; this walks the documents to prove the rule holds in what is shipped.
    const walk = (value: unknown, path: string): void => {
      if (typeof value !== "object" || value === null) return;
      const node = value as Record<string, unknown>;
      if (node["type"] === "integer") {
        expect([path, Number.isSafeInteger(node["minimum"]), Number.isSafeInteger(node["maximum"])]).toEqual([path, true, true]);
      }
      if (node["type"] === "object") expect([path, "additionalProperties" in node]).toEqual([path, true]);
      for (const [key, child] of Object.entries(node)) walk(child, `${path}.${key}`);
    };
    for (const schema of [GAME_SCHEMA, LOCALE_SCHEMA, PACKAGE_SCHEMA]) walk(schema.toJsonSchema(), schema.name);
    for (const system of ENGINE_SYSTEMS) for (const decl of system.data ?? []) walk(tableSchema(decl).toJsonSchema(), decl.name);
  });
});

describe("the presentation slots", () => {
  it("reserve scenes, ui, fx and audio for the runtime notes", () => {
    expect(PRESENTATION.map((slot) => `${slot.name}:${slot.shape}`)).toEqual(["scenes:folder", "ui:folder", "fx:file", "audio:file"]);
    for (const slot of PRESENTATION) expect(slot.note).not.toBe("");
  });
});
