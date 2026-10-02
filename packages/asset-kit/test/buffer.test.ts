import { describe, expect, it } from "vitest";
import { bayer4, IndexedBuffer, MAX_BUFFER_SIZE, TRANSPARENT } from "../src/index.ts";

/** A buffer from rows of `toText` characters (`.` and 1..9, a..z). */
function fromText(rows: string[]): IndexedBuffer {
  const symbols = ".123456789abcdefghijklmnopqrstuvwxyz";
  const buffer = new IndexedBuffer((rows[0] as string).length, rows.length);
  rows.forEach((row, y) => [...row].forEach((char, x) => buffer.pset(x, y, symbols.indexOf(char))));
  return buffer;
}

function text(buffer: IndexedBuffer): string[] {
  return buffer.toText().split("\n");
}

describe("IndexedBuffer basics", () => {
  it("starts transparent, with w * h bytes", () => {
    const buffer = new IndexedBuffer(4, 3);
    expect(buffer.w).toBe(4);
    expect(buffer.h).toBe(3);
    expect(buffer.data).toBeInstanceOf(Uint8Array);
    expect(buffer.data.length).toBe(12);
    expect(buffer.opaqueCount()).toBe(0);
    expect(TRANSPARENT).toBe(0);
  });

  it("rejects sizes that are not integers in [1, MAX_BUFFER_SIZE], and data of the wrong length", () => {
    expect(() => new IndexedBuffer(0, 4)).toThrow(/w must be an integer/);
    expect(() => new IndexedBuffer(4, 2.5)).toThrow(/h must be an integer/);
    expect(() => new IndexedBuffer(MAX_BUFFER_SIZE + 1, 1)).toThrow(/w must be an integer/);
    expect(() => new IndexedBuffer(2, 2, new Uint8Array(3))).toThrow(/3 bytes, expected 2 x 2 = 4/);
  });

  it("pset and get clip outside the buffer", () => {
    const buffer = new IndexedBuffer(3, 2).pset(1, 1, 7).pset(-1, 0, 5).pset(3, 0, 5).pset(0, 2, 5);
    expect(buffer.get(1, 1)).toBe(7);
    expect(buffer.get(-1, 0)).toBe(0);
    expect(buffer.get(3, 1)).toBe(0);
    expect(buffer.opaqueCount()).toBe(1);
  });

  it("is integer-only: a float, NaN or undefined coordinate or colour throws", () => {
    const buffer = new IndexedBuffer(4, 4);
    expect(() => buffer.pset(0.5, 0, 1)).toThrow(/x must be a 32-bit integer, got 0.5/);
    expect(() => buffer.pset(0, Number.NaN, 1)).toThrow(/y must be a 32-bit integer/);
    expect(() => buffer.pset(0, 0, 256)).toThrow(/palette index 0..255, got 256/);
    expect(() => buffer.pset(0, 0, -1)).toThrow(/palette index/);
    expect(() => buffer.pset(0, 0, undefined as unknown as number)).toThrow(/palette index 0..255, got undefined/);
    expect(() => buffer.fill(0, 0, 1.5, 1, 1)).toThrow(/w must be a non-negative integer/);
    expect(() => buffer.fill(0, 0, -1, 1, 1)).toThrow(/w must be a non-negative integer/);
    expect(() => buffer.line(0, 0, 3, 2.5, 1)).toThrow(/y1 must be a 32-bit integer/);
    expect(() => buffer.fillEllipse(0, 0, 0, 3, 1)).toThrow(/w must be an integer in \[1/);
    expect(() => buffer.get(0.5, 0)).toThrow(/32-bit integer/);
    expect(buffer.opaqueCount()).toBe(0);
  });

  it("toText shows indices as . 1-9 a-z and # above 35", () => {
    const buffer = new IndexedBuffer(5, 1).pset(1, 0, 1).pset(2, 0, 10).pset(3, 0, 35).pset(4, 0, 36);
    expect(buffer.toText()).toBe(".1az#");
  });
});

describe("rectangles and lines", () => {
  it("fill, hline, vline and rect, clipped at the edges", () => {
    const buffer = new IndexedBuffer(6, 5)
      .fill(1, 1, 3, 2, 1)
      .hline(-2, 4, 5, 2)
      .vline(5, -1, 3, 3)
      .rect(3, 2, 5, 3, 4);
    expect(text(buffer)).toEqual([
      ".....3",
      ".111.3",
      ".11444",
      "...4..",
      "222444",
    ]);
  });

  it("a rect of size 1 is a pixel and of size 0 is nothing", () => {
    expect(new IndexedBuffer(3, 3).rect(1, 1, 1, 1, 5).opaqueCount()).toBe(1);
    expect(new IndexedBuffer(3, 3).rect(1, 1, 0, 3, 5).opaqueCount()).toBe(0);
    expect(new IndexedBuffer(3, 3).fill(0, 0, 3, 0, 5).opaqueCount()).toBe(0);
  });

  it("line is the integer Bresenham line, both ends included, in every direction", () => {
    expect(text(new IndexedBuffer(6, 4).line(0, 0, 5, 3, 1))).toEqual([
      "1.....",
      ".11...",
      "...11.",
      ".....1",
    ]);
    // The same pixels whichever end comes first is not guaranteed; the ends and the count are.
    for (const [x0, y0, x1, y1] of [[0, 0, 7, 2], [7, 2, 0, 0], [3, 7, 1, 0], [0, 5, 7, 5], [4, 0, 4, 7], [7, 7, 0, 0]] as const) {
      const buffer = new IndexedBuffer(8, 8).line(x0, y0, x1, y1, 1);
      expect(buffer.get(x0, y0)).toBe(1);
      expect(buffer.get(x1, y1)).toBe(1);
      expect(buffer.opaqueCount()).toBe(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1);
    }
    expect(new IndexedBuffer(4, 4).line(2, 2, 2, 2, 3).opaqueCount()).toBe(1);
  });

  it("a line that leaves the buffer is clipped, not wrapped", () => {
    expect(text(new IndexedBuffer(4, 3).line(-2, 1, 9, 1, 1))).toEqual(["....", "1111", "...."]);
  });
});

describe("ellipses", () => {
  const rowWidths = (buffer: IndexedBuffer): number[] =>
    text(buffer).map((row) => [...row].filter((char) => char !== ".").length);

  it("fillEllipse gives the classic pixel circles", () => {
    expect(rowWidths(new IndexedBuffer(1, 1).fillEllipse(0, 0, 1, 1, 1))).toEqual([1]);
    expect(rowWidths(new IndexedBuffer(2, 2).fillEllipse(0, 0, 2, 2, 1))).toEqual([2, 2]);
    expect(rowWidths(new IndexedBuffer(4, 4).fillEllipse(0, 0, 4, 4, 1))).toEqual([2, 4, 4, 2]);
    expect(rowWidths(new IndexedBuffer(5, 5).fillEllipse(0, 0, 5, 5, 1))).toEqual([3, 5, 5, 5, 3]);
    expect(rowWidths(new IndexedBuffer(6, 6).fillEllipse(0, 0, 6, 6, 1))).toEqual([4, 6, 6, 6, 6, 4]);
    expect(rowWidths(new IndexedBuffer(7, 7).fillEllipse(0, 0, 7, 7, 1))).toEqual([3, 5, 7, 7, 7, 5, 3]);
    expect(rowWidths(new IndexedBuffer(8, 8).fillEllipse(0, 0, 8, 8, 1))).toEqual([4, 6, 8, 8, 8, 8, 6, 4]);
  });

  it("fillEllipse is symmetric and fills its box from edge to edge", () => {
    for (const [w, h] of [[9, 5], [12, 7], [3, 11], [16, 16], [2, 9], [10, 2]] as const) {
      const buffer = new IndexedBuffer(w, h).fillEllipse(0, 0, w, h, 1);
      expect(buffer.equals(buffer.flipX()), `${w} x ${h} left-right`).toBe(true);
      expect(buffer.equals(buffer.flipY()), `${w} x ${h} top-bottom`).toBe(true);
      expect(buffer.bounds()?.h, `${w} x ${h} height`).toBe(h);
    }
  });

  it("ellipse draws the rim of the filled ellipse", () => {
    expect(text(new IndexedBuffer(9, 7).ellipse(1, 1, 7, 5, 1))).toEqual([
      ".........",
      "..11111..",
      ".1.....1.",
      ".1.....1.",
      ".1.....1.",
      "..11111..",
      ".........",
    ]);
    // Rim = filled pixels that touch the outside; filling the rim's inside gives the filled ellipse.
    for (const [w, h] of [[5, 5], [8, 8], [11, 6], [4, 9]] as const) {
      const rim = new IndexedBuffer(w + 2, h + 2).ellipse(1, 1, w, h, 1);
      const filled = new IndexedBuffer(w + 2, h + 2).fillEllipse(1, 1, w, h, 1);
      for (let y = 0; y < h + 2; y += 1) {
        for (let x = 0; x < w + 2; x += 1) {
          const inside = filled.get(x, y) === 1;
          const touchesOutside =
            filled.get(x - 1, y) === 0 || filled.get(x + 1, y) === 0 || filled.get(x, y - 1) === 0 || filled.get(x, y + 1) === 0;
          expect(rim.get(x, y), `${w} x ${h} at (${x}, ${y})`).toBe(inside && touchesOutside ? 1 : 0);
        }
      }
    }
  });
});

describe("flood fill", () => {
  it("fills the 4-connected area of one index and stops at other indices", () => {
    const buffer = fromText([
      "..1...",
      "..1.2.",
      "111...",
      "...1..",
    ]);
    expect(text(buffer.clone().floodFill(0, 0, 5))).toEqual([
      "551...",
      "551.2.",
      "111...",
      "...1..",
    ]);
    // The area does not leak through the diagonal gap into the bottom-left pocket.
    expect(text(buffer.clone().floodFill(5, 0, 5))).toEqual([
      "..1555",
      "..1525",
      "111555",
      "...155",
    ]);
  });

  it("does nothing outside the buffer or when the area already has the colour", () => {
    const buffer = fromText(["11", "1."]);
    expect(buffer.clone().floodFill(5, 5, 3).equals(buffer)).toBe(true);
    expect(buffer.clone().floodFill(0, 0, 1).equals(buffer)).toBe(true);
  });

  it("fills a large area without recursion", () => {
    const buffer = new IndexedBuffer(512, 512).floodFill(100, 100, 9);
    expect(buffer.opaqueCount()).toBe(512 * 512);
  });
});

describe("blit, crop and mirrors", () => {
  const part = fromText(["12", "3."]);

  it("blit skips transparent source pixels and clips", () => {
    const buffer = new IndexedBuffer(4, 3).clear(9).blit(part, 1, 1).blit(part, 3, 2).blit(part, -1, -1);
    expect(text(buffer)).toEqual([
      "9999",
      "9129",
      "9391",
    ]);
  });

  it("blit mirrors left-right and top-bottom", () => {
    expect(text(new IndexedBuffer(2, 2).blit(part, 0, 0, { mirrorX: true }))).toEqual(["21", ".3"]);
    expect(text(new IndexedBuffer(2, 2).blit(part, 0, 0, { mirrorY: true }))).toEqual(["3.", "12"]);
    expect(text(new IndexedBuffer(2, 2).blit(part, 0, 0, { mirrorX: true, mirrorY: true }))).toEqual([".3", "21"]);
    expect(text(part.flipX())).toEqual(["21", ".3"]);
    expect(text(part.flipY())).toEqual(["3.", "12"]);
  });

  it("crop returns a new buffer; parts outside the source are transparent", () => {
    const source = fromText(["123", "456", "789"]);
    expect(text(source.crop(1, 1, 2, 2))).toEqual(["56", "89"]);
    expect(text(source.crop(2, 2, 2, 2))).toEqual(["9.", ".."]);
    expect(text(source.crop(-1, 0, 2, 1))).toEqual([".1"]);
  });

  it("clone is independent of the original", () => {
    const copy = part.clone().pset(1, 1, 8);
    expect(part.get(1, 1)).toBe(0);
    expect(copy.get(1, 1)).toBe(8);
    expect(part.equals(copy)).toBe(false);
    expect(part.equals(part.clone())).toBe(true);
    expect(part.equals(new IndexedBuffer(2, 3))).toBe(false);
  });
});

describe("remap and silhouette", () => {
  const source = fromText(["12", "3."]);

  it("remap replaces indices and leaves the source alone", () => {
    expect(text(source.remap({ 1: 7, 3: 8 }))).toEqual(["72", "8."]);
    expect(text(source.remap(new Map([[2, 0]])))).toEqual(["1.", "3."]);
    expect(text(source)).toEqual(["12", "3."]);
  });

  it("remap reads the original for every pixel, so a swap works", () => {
    expect(text(source.remap({ 1: 2, 2: 1 }))).toEqual(["21", "3."]);
  });

  it("remap rejects indices outside 0..255", () => {
    expect(() => source.remap({ 1: 256 })).toThrow(/palette index/);
    expect(() => source.remap({ 300: 1 })).toThrow(/palette index/);
  });

  it("silhouette turns every opaque pixel into one colour", () => {
    expect(text(source.silhouette(5))).toEqual(["55", "5."]);
  });
});

describe("ordered dither", () => {
  it("level 0 sets nothing, 16 everything, 8 a checkerboard", () => {
    expect(new IndexedBuffer(8, 8).dither(0, 0, 8, 8, 1, 0).opaqueCount()).toBe(0);
    expect(new IndexedBuffer(8, 8).dither(0, 0, 8, 8, 1, 16).opaqueCount()).toBe(64);
    expect(text(new IndexedBuffer(4, 4).dither(0, 0, 4, 4, 1, 8))).toEqual(["1.1.", ".1.1", "1.1.", ".1.1"]);
  });

  it("each level sets level/16 of the pixels and contains the level below", () => {
    let previous = new IndexedBuffer(8, 8);
    for (let level = 1; level <= 16; level += 1) {
      const buffer = new IndexedBuffer(8, 8).dither(0, 0, 8, 8, 1, level);
      expect(buffer.opaqueCount()).toBe(level * 4);
      for (let i = 0; i < 64; i += 1) expect((previous.data[i] as number) <= (buffer.data[i] as number)).toBe(true);
      previous = buffer;
    }
  });

  it("is anchored to the buffer, so two neighbouring areas line up", () => {
    const whole = new IndexedBuffer(8, 4).dither(0, 0, 8, 4, 1, 5);
    const halves = new IndexedBuffer(8, 4).dither(0, 0, 3, 4, 1, 5).dither(3, 0, 5, 4, 1, 5);
    expect(halves.equals(whole)).toBe(true);
    expect(bayer4(0, 0)).toBe(0);
    expect(bayer4(5, 2)).toBe(bayer4(1, 2));
    expect(bayer4(-1, -1)).toBe(bayer4(3, 3));
    expect(() => new IndexedBuffer(2, 2).dither(0, 0, 2, 2, 1, 17)).toThrow(/level/);
  });
});

describe("outline", () => {
  it("puts ink on the top and left rim and the darker ink under and right of the shape", () => {
    const buffer = new IndexedBuffer(6, 5).fill(2, 1, 2, 2, 5).outline(1, 2);
    expect(text(buffer)).toEqual([
      "..11..",
      ".1552.",
      ".1552.",
      "..22..",
      "......",
    ]);
  });

  it("uses one ink when no darker ink is given, and outlines holes too", () => {
    const ring = new IndexedBuffer(7, 7).rect(1, 1, 5, 5, 5).outline(1);
    expect(text(ring)).toEqual([
      ".11111.",
      "1555551",
      "1511151",
      "151.151",
      "1511151",
      "1555551",
      ".11111.",
    ]);
  });

  it("does not outline its own outline, and is clipped at the edge", () => {
    const buffer = new IndexedBuffer(3, 3).pset(0, 0, 5).outline(1, 2);
    expect(text(buffer)).toEqual(["52.", "2..", "..."]);
  });
});

describe("orphanCount and bounds", () => {
  it("counts opaque pixels with no neighbour of the same index among the eight around", () => {
    expect(fromText(["1.2", "...", "3.1"]).orphanCount()).toBe(4);
    expect(fromText(["1..", ".1.", "..2"]).orphanCount()).toBe(1);
    expect(fromText(["12", "21"]).orphanCount()).toBe(0);
    expect(fromText(["11", "11"]).orphanCount()).toBe(0);
    expect(new IndexedBuffer(3, 3).orphanCount()).toBe(0);
    expect(new IndexedBuffer(1, 1).pset(0, 0, 4).orphanCount()).toBe(1);
  });

  it("bounds is the box around the opaque pixels, or null", () => {
    expect(new IndexedBuffer(4, 4).bounds()).toBeNull();
    expect(fromText(["....", ".1..", "..2.", "...."]).bounds()).toEqual({ x: 1, y: 1, w: 2, h: 2 });
  });
});
