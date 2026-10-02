import { describe, expect, it } from "vitest";
import { formatJson } from "../src/index.ts";
import { GLYPH_ADVANCE, GLYPH_H, GLYPH_W, glyphRows, textHeight, textWidth } from "../src/font.ts";

describe("formatJson", () => {
  it("writes the top level one field per line, and a value that fits on one line", () => {
    expect(formatJson({ format: "x/1", size: [12, 12], sheet: { w: 27, h: 14 }, empty: [], none: {}, nothing: null })).toBe(
      ['{', '  "format": "x/1",', '  "size": [12, 12],', '  "sheet": { "w": 27, "h": 14 },', '  "empty": [],', '  "none": {},', '  "nothing": null', "}", ""].join("\n"),
    );
  });

  it("breaks a value that does not fit one level at a time, and keeps a table one row per record", () => {
    const frames = [0, 1, 2].map((index) => ({ index, clip: "walk", bbox: [4, 2, 12, 18], note: null }));
    const text = formatJson({ id: "a/b", config: { off: ["one", "two"], clips: {} }, frames }, 40);
    expect(text).toBe(
      [
        "{",
        '  "id": "a/b",',
        '  "config": {',
        '    "off": ["one", "two"],',
        '    "clips": {}',
        "  },",
        '  "frames": [',
        '    { "index": 0, "clip": "walk", "bbox": [4, 2, 12, 18], "note": null },',
        '    { "index": 1, "clip": "walk", "bbox": [4, 2, 12, 18], "note": null },',
        '    { "index": 2, "clip": "walk", "bbox": [4, 2, 12, 18], "note": null }',
        "  ]",
        "}",
        "",
      ].join("\n"),
    );
    expect(JSON.parse(text)).toEqual({ id: "a/b", config: { off: ["one", "two"], clips: {} }, frames });
  });

  it("is valid JSON for any value, skips undefined fields and escapes strings", () => {
    const value = { text: 'a "quoted" line\nand a second', skipped: undefined, deep: [[1, [2, [3]]], { a: { b: { c: [true, false] } } }] };
    expect(JSON.parse(formatJson(value))).toEqual(JSON.parse(JSON.stringify(value)));
    expect(JSON.parse(formatJson(value, 10))).toEqual(JSON.parse(JSON.stringify(value)));
    expect(formatJson([1, 2, 3])).toBe("[1, 2, 3]\n");
    expect(formatJson("x")).toBe('"x"\n');
    expect(() => formatJson({ f: () => 1 })).toThrow(/cannot be written as JSON/);
  });

  it("gives the same text for the same value", () => {
    const value = { b: 1, a: [{ y: 2, x: 1 }] };
    expect(formatJson(value)).toBe(formatJson(structuredClone(value)));
  });
});

describe("the label font", () => {
  it("has 5 x 7 glyphs for digits, capitals and the punctuation the sheets use", () => {
    for (const character of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ -_.,:/#+=()%><!?*"\'[];') {
      const rows = glyphRows(character);
      expect(rows.length, character).toBe(GLYPH_H);
      expect(rows.every((row) => row.length === GLYPH_W && /^[.#]+$/.test(row)), character).toBe(true);
    }
    expect(glyphRows("1")).toEqual(["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."]);
  });

  it("every digit and letter is a different shape", () => {
    const shapes = new Set([..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((character) => glyphRows(character).join("")));
    expect(shapes.size).toBe(36);
  });

  it("draws lowercase as capitals and an unknown character as a question mark", () => {
    expect(glyphRows("a")).toBe(glyphRows("A"));
    expect(glyphRows("é")).toBe(glyphRows("?"));
    expect(glyphRows("~")).toBe(glyphRows("?"));
  });

  it("measures a line of text", () => {
    expect(GLYPH_ADVANCE).toBe(6);
    expect(textWidth("", 2)).toBe(0);
    expect(textWidth("0", 2)).toBe(10);
    expect(textWidth("12 ms", 2)).toBe(58);
    expect(textHeight(2)).toBe(14);
  });
});
