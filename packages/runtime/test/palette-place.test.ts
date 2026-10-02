// The palette table, the integer placement of a target on the screen, and the pixel hash.

import { describe, expect, it } from "vitest";
import { fitScale, nativePixel, PaletteTable, pixelHash, placeTarget } from "../src/index.ts";

describe("PaletteTable", () => {
  it("holds 256 RGBA slots per row; slot 0 and the slots a row does not give are transparent", () => {
    const table = new PaletteTable([
      ["#123456", "#ff8000", "#0a0b0c"],
      ["#000000", "#FFFFFF"],
    ]);
    expect(table.rows).toBe(2);
    expect(table.data).toHaveLength(2 * 256 * 4);
    expect([...table.data.subarray(0, 12)]).toEqual([0, 0, 0, 0, 255, 128, 0, 255, 10, 11, 12, 255]);
    expect([...table.data.subarray(12, 16)]).toEqual([0, 0, 0, 0]);
    expect([...table.data.subarray(256 * 4, 256 * 4 + 12)]).toEqual([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0]);
  });

  it("setRow replaces a row and counts the change", () => {
    const table = new PaletteTable([["#000000", "#111111", "#222222"]]);
    expect(table.version).toBe(0);
    table.setRow(0, ["#000000", "#333333"]);
    expect(table.version).toBe(1);
    expect([...table.data.subarray(4, 12)]).toEqual([0x33, 0x33, 0x33, 255, 0, 0, 0, 0]);
  });

  it("refuses bad rows and colours", () => {
    expect(() => new PaletteTable([])).toThrow(RangeError);
    expect(() => new PaletteTable([[]])).toThrow(RangeError);
    expect(() => new PaletteTable([new Array<string>(257).fill("#000000")])).toThrow(RangeError);
    expect(() => new PaletteTable([["#000000", "red"]])).toThrow(/row 0, slot 1 must be "#rrggbb", got "red"/);
    expect(() => new PaletteTable([["#000000"]]).setRow(1, ["#000000"])).toThrow(/rows 0\.\.0, got 1/);
  });
});

describe("placeTarget", () => {
  it("picks the largest whole zoom that fits and centres the image", () => {
    expect(fitScale(12, 12, 144, 112)).toBe(9);
    expect(placeTarget(12, 12, { x: 144, y: 112, w: 144, h: 112 })).toEqual({ x: 162, y: 114, w: 108, h: 108, scale: 9 });
    expect(placeTarget(64, 48, { x: 0, y: 0, w: 144, h: 112 })).toEqual({ x: 8, y: 8, w: 128, h: 96, scale: 2 });
  });

  it("takes a given zoom, and never goes below 1x", () => {
    expect(placeTarget(12, 12, { x: 0, y: 0, w: 100, h: 100 }, 4)).toEqual({ x: 26, y: 26, w: 48, h: 48, scale: 4 });
    expect(fitScale(320, 180, 100, 100)).toBe(1);
    // Too large even at 1x: centred, reaching outside the rectangle (the scissor clips it).
    expect(placeTarget(320, 180, { x: 10, y: 10, w: 100, h: 100 })).toEqual({ x: -100, y: -30, w: 320, h: 180, scale: 1 });
  });

  it("puts an odd leftover pixel right and below", () => {
    expect(placeTarget(2, 2, { x: 0, y: 0, w: 5, h: 7 })).toEqual({ x: 0, y: 1, w: 4, h: 4, scale: 2 });
  });

  it("refuses fractions and a zoom below 1", () => {
    expect(() => placeTarget(12, 12, { x: 0.5, y: 0, w: 10, h: 10 })).toThrow(RangeError);
    expect(() => placeTarget(12, 12, { x: 0, y: 0, w: 0, h: 10 })).toThrow(RangeError);
    expect(() => placeTarget(12, 12, { x: 0, y: 0, w: 100, h: 100 }, 1.5)).toThrow(RangeError);
    expect(() => placeTarget(12, 12, { x: 0, y: 0, w: 100, h: 100 }, 0)).toThrow(RangeError);
  });

  it("nativePixel turns a screen position back into a native pixel", () => {
    const place = placeTarget(12, 12, { x: 144, y: 112, w: 144, h: 112 });
    expect(nativePixel(place, 162, 114)).toEqual({ x: 0, y: 0 });
    expect(nativePixel(place, 170, 122)).toEqual({ x: 0, y: 0 });
    expect(nativePixel(place, 171, 123)).toEqual({ x: 1, y: 1 });
    expect(nativePixel(place, 269, 221)).toEqual({ x: 11, y: 11 });
    expect(nativePixel(place, 270, 221)).toBeNull();
    expect(nativePixel(place, 161, 114)).toBeNull();
  });
});

describe("pixelHash", () => {
  it("depends on the pixels and on the size", () => {
    const pixels = new Uint8Array(4 * 6);
    const a = pixelHash(3, 2, pixels);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(pixelHash(2, 3, pixels)).not.toBe(a);
    pixels[5] = 1;
    expect(pixelHash(3, 2, pixels)).not.toBe(a);
    expect(() => pixelHash(3, 3, pixels)).toThrow(RangeError);
  });
});
