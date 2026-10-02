import { describe, expect, it } from "vitest";
import { compose, IndexedBuffer, padRows, parseStamp, patchRows, shiftRows, StampError, stampRows } from "../src/index.ts";

const legend = { o: 1, r: 7, R: 6 };

function caught(run: () => unknown): StampError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(StampError);
    return error as StampError;
  }
  throw new Error("expected a StampError");
}

describe("parseStamp", () => {
  it("parses a valid stamp given as rows", () => {
    const stamp = parseStamp([".oo.", "orRo", ".oo."], legend);
    expect(stamp).toBeInstanceOf(IndexedBuffer);
    expect([stamp.w, stamp.h]).toEqual([4, 3]);
    expect(stamp.toText()).toBe([".11.", "1761", ".11."].join("\n"));
  });

  it("parses the same stamp given as text: indented, with comments and a final newline", () => {
    const fromText = parseStamp(
      `
      # a dot with a shaded side
      .oo.
      orRo
      .oo.
      `,
      legend,
    );
    expect(fromText.equals(parseStamp([".oo.", "orRo", ".oo."], legend))).toBe(true);
    expect(parseStamp(".oo.\r\norRo\r\n.oo.\r\n", legend).equals(fromText)).toBe(true);
  });

  it("throws on an unknown letter, with its position", () => {
    const error = caught(() => parseStamp([".oo.", "orXo", ".oo."], legend));
    expect(error.message).toBe('stamp: unknown letter "X" at row 2, column 3 (legend: o r R)');
    expect([error.row, error.column]).toEqual([2, 3]);
  });

  it("does not treat a space as a transparent pixel", () => {
    expect(caught(() => parseStamp(["o o"], legend)).message).toMatch(/unknown letter " " at row 1, column 2/);
  });

  it("throws on a wrong row length, with the row", () => {
    const error = caught(() => parseStamp([".oo.", "orRo", ".oo"], legend));
    expect(error.message).toBe("stamp: row 3 is 3 wide, expected 4 (the width of row 1)");
    expect([error.row, error.column]).toEqual([3, 0]);
    expect(caught(() => parseStamp([".oo.", "orRo.", ".oo."], legend)).row).toBe(2);
  });

  it("counts rows of a text without its comment lines, and fails on a blank line between rows", () => {
    const error = caught(() => parseStamp("# comment\n.oo.\n\n.oo.\n", legend));
    expect(error.message).toBe("stamp: row 2 is 0 wide, expected 4 (the width of row 1)");
  });

  it("throws on an empty stamp", () => {
    expect(caught(() => parseStamp([], legend)).message).toBe("stamp: the stamp is empty");
    expect(caught(() => parseStamp("\n  \n# only a comment\n", legend)).message).toBe("stamp: the stamp is empty");
    expect(caught(() => parseStamp([""], legend)).message).toBe("stamp: the stamp is empty");
  });

  it("names the stamp in errors when a name is given", () => {
    expect(() => parseStamp(["x"], legend, "stamps/face.txt")).toThrow(/^stamps\/face.txt: unknown letter "x" at row 1, column 1/);
  });
});

describe("stampRows", () => {
  it("trims lines and drops comments and the blank lines at both ends", () => {
    expect(stampRows("\n\n  # head\n  .o.  \n\tooo\n\n")).toEqual([".o.", "ooo"]);
    expect(stampRows("")).toEqual([]);
  });
});

describe("padRows, patchRows and shiftRows", () => {
  const rows = [".oo", "oooo", "o"];

  it("padRows pads tapered rows so the strict parser takes them", () => {
    expect(() => parseStamp(rows, legend)).toThrow(/row 2 is 4 wide, expected 3/);
    expect(padRows(rows)).toEqual([".oo.", "oooo", "o..."]);
    expect(parseStamp(padRows(rows), legend).w).toBe(4);
  });

  it("patchRows replaces single rows in a copy", () => {
    const base = ["oooo", "orro", "oooo"];
    expect(patchRows(base, { 1: "oRRo" })).toEqual(["oooo", "oRRo", "oooo"]);
    expect(patchRows(base, { 0: "....", 2: "...." })).toEqual(["....", "orro", "...."]);
    expect(base[1]).toBe("orro");
    expect(() => patchRows(base, { 3: "oooo" })).toThrow(/row 3 does not exist \(the stamp has 3 rows\)/);
    expect(() => patchRows(base, { [-1]: "oooo" })).toThrow(/does not exist/);
  });

  it("shiftRows moves rows down or up inside the same height", () => {
    const base = ["oo", "rr", "RR"];
    expect(shiftRows(base, 1)).toEqual(["..", "oo", "rr"]);
    expect(shiftRows(base, -1)).toEqual(["rr", "RR", ".."]);
    expect(shiftRows(base, 0)).toEqual(base);
    expect(shiftRows(base, 5)).toEqual(["..", "..", ".."]);
    expect(() => shiftRows(base, 0.5)).toThrow(/integer/);
  });
});

describe("compose", () => {
  const body = parseStamp(["rrr", "rRR"], legend);
  const head = parseStamp(["rr"], legend);

  it("stacks parts back to front and outlines the result once", () => {
    const sprite = compose(7, 6, [{ part: body, x: 2, y: 2 }, { part: head, x: 2, y: 1 }], { ink: 1, shadowInk: 2 });
    expect(sprite.toText().split("\n")).toEqual([
      "..11...",
      ".1772..",
      ".17772.",
      ".17662.",
      "..222..",
      ".......",
    ]);
    // One outline around the union: no ink between the head and the body.
    expect(sprite.get(2, 2)).toBe(7);
  });

  it("draws later layers over earlier ones, and mirrors a part", () => {
    const over = compose(3, 2, [{ part: body, x: 0, y: 0 }, { part: parseStamp(["o"], legend), x: 1, y: 0 }], null);
    expect(over.toText()).toBe("717\n766");
    const mirrored = compose(3, 2, [{ part: body, x: 0, y: 0, mirror: true }], null);
    expect(mirrored.toText()).toBe("777\n667");
  });

  it("with a null outline adds none, and with only an ink uses it for the whole rim", () => {
    expect(compose(5, 4, [{ part: body, x: 1, y: 1 }], null).opaqueCount()).toBe(6);
    const plain = compose(5, 4, [{ part: body, x: 1, y: 1 }], { ink: 1 });
    expect(plain.toText().split("\n")).toEqual([".111.", "17771", "17661", ".111."]);
  });

  it("keeps thin details thin when they are drawn after the outline", () => {
    const sprite = compose(7, 5, [{ part: body, x: 1, y: 1 }], { ink: 1 });
    const outlinedPixels = sprite.opaqueCount();
    sprite.line(5, 1, 5, 3, 7);
    expect(sprite.opaqueCount()).toBe(outlinedPixels + 3);
  });
});
