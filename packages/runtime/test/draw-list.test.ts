// The draw list: validation, the drawing order, and where a sprite lands.

import { createRng } from "@whz/det";
import { describe, expect, it } from "vitest";
import { createSheet, DrawList, parseAtlas, spriteRect } from "../src/index.ts";
import type { Sheet, SpriteItem } from "../src/index.ts";

/** A hand-made sheet: two 4 x 3 frames side by side with 1 pixel of padding, pivot at (1, 2). */
function tinySheet(): Sheet {
  const atlas = parseAtlas({
    format: "wz.atlas/1",
    id: "test/tiny",
    size: [4, 3],
    pivot: [1, 2],
    palette: { id: "test", colors: ["#000000", "#ff0000", "#00ff00"] },
    clips: [{ name: "idle", frames: 2, durations: [100, 100], loop: true, start: { default: 0 } }],
    facings: ["default"],
    sheet: { w: 11, h: 5 },
    frames: [
      { index: 0, clip: "idle", facing: "default", frame: 0, x: 1, y: 1, w: 4, h: 3, duration: 100 },
      { index: 1, clip: "idle", facing: "default", frame: 1, x: 6, y: 1, w: 4, h: 3, duration: 100 },
    ],
    variants: [{ seed: 1, sheet: "seed-1.png" }],
  });
  return createSheet(atlas, { w: 11, h: 5, data: new Uint8Array(55) });
}

const sheet = tinySheet();

describe("DrawList.sprite", () => {
  it("fills in the defaults", () => {
    const list = new DrawList().sprite({ sheet, frame: 1, x: 5, y: -7 });
    expect(list.length).toBe(1);
    expect(list.items()[0]).toEqual({ kind: "sprite", sheet, frame: 1, x: 5, y: -7, mirror: false, paletteRow: 0, depth: 0, order: 0 });
  });

  it("refuses a frame the atlas does not have", () => {
    expect(() => new DrawList().sprite({ sheet, frame: 2, x: 0, y: 0 })).toThrow(/frames 0\.\.1, got 2/);
    expect(() => new DrawList().sprite({ sheet, frame: -1, x: 0, y: 0 })).toThrow(RangeError);
  });

  it("refuses positions, depth keys and palette rows that are not integers", () => {
    expect(() => new DrawList().sprite({ sheet, frame: 0, x: 0.5, y: 0 })).toThrow(/x must be a 32-bit integer/);
    expect(() => new DrawList().sprite({ sheet, frame: 0, x: 0, y: Number.NaN })).toThrow(/y must be a 32-bit integer/);
    expect(() => new DrawList().sprite({ sheet, frame: 0, x: 0, y: 0, depth: 1.5 })).toThrow(/depth must be a 32-bit integer/);
    expect(() => new DrawList().sprite({ sheet, frame: 0, x: 0, y: 0, paletteRow: -1 })).toThrow(/paletteRow/);
    expect(() => new DrawList().sprite({ sheet, frame: 0, x: 0, y: 0, paletteRow: 0.5 })).toThrow(/paletteRow/);
  });
});

describe("DrawList.sorted", () => {
  const depths = (list: DrawList): number[] => list.sorted().map((item) => item.depth);
  const xs = (list: DrawList): number[] => list.sorted().map((item) => item.x);

  it("orders by ascending depth key, negative keys first", () => {
    const list = new DrawList();
    for (const depth of [3, -1, 2, 0, -5, 2147483647, -2147483648]) list.sprite({ sheet, frame: 0, x: 0, y: 0, depth });
    expect(depths(list)).toEqual([-2147483648, -5, -1, 0, 2, 3, 2147483647]);
  });

  it("keeps the order of adding among equal keys", () => {
    const list = new DrawList();
    // x records the order of adding.
    [1, 0, 1, 0, 1, 0, 0, 1].forEach((depth, i) => list.sprite({ sheet, frame: 0, x: i, y: 0, depth }));
    expect(xs(list)).toEqual([1, 3, 5, 6, 0, 2, 4, 7]);
  });

  it("is a total order: a shuffled list of unique (depth, order) pairs always sorts the same way", () => {
    const rng = createRng(7, "draw-list-test");
    const list = new DrawList();
    for (let i = 0; i < 500; i += 1) list.sprite({ sheet, frame: rng.int(2), x: i, y: 0, depth: rng.range(-3, 3) });
    const sorted = list.sorted();
    for (let i = 1; i < sorted.length; i += 1) {
      const before = sorted[i - 1] as SpriteItem;
      const after = sorted[i] as SpriteItem;
      expect(before.depth < after.depth || (before.depth === after.depth && before.order < after.order)).toBe(true);
    }
    expect(new Set(sorted).size).toBe(500);
  });

  it("does not change the order of adding, and follows later changes", () => {
    const list = new DrawList().sprite({ sheet, frame: 0, x: 0, y: 0, depth: 5 }).sprite({ sheet, frame: 0, x: 1, y: 0, depth: 1 });
    expect(xs(list)).toEqual([1, 0]);
    expect(list.items().map((item) => item.x)).toEqual([0, 1]);
    list.sprite({ sheet, frame: 0, x: 2, y: 0, depth: 3 });
    expect(xs(list)).toEqual([1, 2, 0]);
    expect(list.clear().length).toBe(0);
    expect(list.sorted()).toEqual([]);
    list.sprite({ sheet, frame: 0, x: 9, y: 0 });
    expect(list.items()[0]?.order).toBe(0);
  });
});

describe("spriteRect", () => {
  const item = (spec: { frame: number; x: number; y: number; mirror?: boolean }): SpriteItem =>
    new DrawList().sprite({ sheet, ...spec }).items()[0] as SpriteItem;

  it("puts the pivot pixel on the sprite's position", () => {
    expect(spriteRect(item({ frame: 0, x: 10, y: 20 }))).toEqual({ x: 9, y: 18, w: 4, h: 3, sx: 1, sy: 1 });
    expect(spriteRect(item({ frame: 1, x: 0, y: 0 }))).toEqual({ x: -1, y: -2, w: 4, h: 3, sx: 6, sy: 1 });
  });

  it("keeps the pivot pixel there when mirrored", () => {
    // The pivot is column 1 of 4; mirrored it is column 2 of the rectangle.
    expect(spriteRect(item({ frame: 0, x: 10, y: 20, mirror: true }))).toEqual({ x: 8, y: 18, w: 4, h: 3, sx: 1, sy: 1 });
  });
});
