// The CPU golden test: for the example asset, what the CPU backend draws is the baked indexed
// frame mapped through the palette, for every frame of every variant. Then the rules of a
// draw one by one: mirror, palette rows, clipping, depth order, the clear colour.
//
// The two sides of the golden test share no code. The expected picture comes from the asset
// kit: the per-frame PNG files of the bake, read by the asset kit's PNG reader, coloured by
// the asset's own Palette. The drawn picture comes from the runtime: the sheet PNG read by the
// runtime's reader, the frame rectangle from atlas.json, the palette table from the atlas.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAll } from "@whz/asset-kit";
import { decodePng } from "@whz/asset-kit/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import blinkingDot from "../../../assets/examples/blinking-dot/gen.ts";
import { examplePalette, frameFile, frameScenes, isBakedFrameScene } from "../dev/scenes.ts";
import { createCpuBackend, DrawList } from "../src/index.ts";
import type { PaletteTable, Rgba, Sheet } from "../src/index.ts";
import { bakeExample, drawOnCpu } from "./helpers.ts";
import type { BakedExample } from "./helpers.ts";

let example: BakedExample;
let palette: PaletteTable;
let sheet: Sheet;

beforeAll(async () => {
  example = await bakeExample();
  palette = examplePalette(example.atlas);
  sheet = example.sheets[0] as Sheet;
});
afterAll(() => example.remove());

/** Palette indices coloured through four bytes per slot. */
function colored(indices: Uint8Array, rgba: Uint8Array): Uint8Array {
  const out = new Uint8Array(indices.length * 4);
  for (let i = 0; i < indices.length; i += 1) out.set(rgba.subarray((indices[i] as number) * 4, (indices[i] as number) * 4 + 4), i * 4);
  return out;
}

const same = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

/** Draws a list into a new w x h target and returns the pixels. */
function draw(list: DrawList, w: number, h: number, clear?: Rgba): Uint8Array {
  const cpu = createCpuBackend();
  const target = cpu.createTarget(w, h);
  cpu.draw(target, list, { palette, clear });
  return cpu.readPixels(target);
}

const pixel = (pixels: Uint8Array, w: number, x: number, y: number): number[] => [...pixels.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];

describe("CPU golden: the example asset", () => {
  it("every frame of every variant equals the baked indexed frame mapped through the palette", () => {
    const rgba = blinkingDot.palette.rgba();
    const scenes = frameScenes(example.sheets).filter(isBakedFrameScene);
    // 3 variants x 2 frames, none left out.
    expect(scenes).toHaveLength(blinkingDot.variantSeeds.length * 2);
    expect(scenes).toHaveLength(example.sheets.length * example.atlas.frames.length);
    for (const scene of scenes) {
      const item = scene.list.items()[0];
      if (item === undefined) throw new Error("a frame scene has one sprite");
      const baked = decodePng(readFileSync(join(example.dir, frameFile(item.sheet, item.frame))));
      expect(baked.type, scene.name).toBe("indexed");
      expect([scene.width, scene.height], scene.name).toEqual([baked.w, baked.h]);
      const drawn = drawOnCpu(scene, palette);
      expect(same(drawn, colored(baked.data, rgba)), scene.name).toBe(true);
      // The picture is not empty: the dot is there.
      expect(drawn.some((byte) => byte !== 0), scene.name).toBe(true);
    }
  });

  it("... and equals what the asset program renders, without any file in between", () => {
    const rgba = blinkingDot.palette.rgba();
    for (const drawnSheet of example.sheets) {
      const output = renderAll(blinkingDot, { seed: drawnSheet.seed });
      output.frames.forEach((frame, index) => {
        const list = new DrawList().sprite({ sheet: drawnSheet, frame: index, x: 6, y: 6 });
        expect(same(draw(list, 12, 12), colored(frame.buffer.data, rgba)), `seed ${drawnSheet.seed}, frame ${index}`).toBe(true);
      });
    }
  });

  it("a mirrored frame is the asset kit's flipX of the frame", () => {
    const rgba = blinkingDot.palette.rgba();
    for (const drawnSheet of example.sheets) {
      const output = renderAll(blinkingDot, { seed: drawnSheet.seed });
      output.frames.forEach((frame, index) => {
        // Pivot (6, 6) of a 12 px frame: mirrored, the frame covers columns x-5 .. x+6.
        const list = new DrawList().sprite({ sheet: drawnSheet, frame: index, x: 5, y: 6, mirror: true });
        expect(same(draw(list, 12, 12), colored(frame.buffer.flipX().data, rgba)), `seed ${drawnSheet.seed}, frame ${index}`).toBe(true);
      });
    }
  });

  it("a palette row recolours without a rebake", () => {
    const output = renderAll(blinkingDot, { seed: sheet.seed });
    const indices = output.frames[0]?.buffer.data as Uint8Array;
    const row1 = palette.data.subarray(256 * 4, 2 * 256 * 4);
    const list = new DrawList().sprite({ sheet, frame: 0, x: 6, y: 6, paletteRow: 1 });
    const drawn = draw(list, 12, 12);
    expect(same(drawn, colored(indices, row1))).toBe(true);
    expect(same(drawn, draw(new DrawList().sprite({ sheet, frame: 0, x: 6, y: 6 }), 12, 12))).toBe(false);
  });
});

describe("CPU backend: the rules of a draw", () => {
  it("clears to the clear colour, transparent by default", () => {
    expect(draw(new DrawList(), 3, 2).every((byte) => byte === 0)).toBe(true);
    const filled = draw(new DrawList(), 3, 2, [10, 20, 30, 255]);
    expect([...filled]).toEqual(new Array(6).fill([10, 20, 30, 255]).flat());
  });

  it("clears again on every draw: nothing of the last picture stays", () => {
    const cpu = createCpuBackend();
    const target = cpu.createTarget(12, 12);
    cpu.draw(target, new DrawList().sprite({ sheet, frame: 0, x: 6, y: 6 }), { palette });
    expect(cpu.readPixels(target).some((byte) => byte !== 0)).toBe(true);
    cpu.draw(target, new DrawList(), { palette });
    expect(cpu.readPixels(target).every((byte) => byte === 0)).toBe(true);
  });

  it("leaves the clear colour under transparent pixels and replaces it under opaque ones", () => {
    const clear: Rgba = [1, 2, 3, 255];
    const drawn = draw(new DrawList().sprite({ sheet, frame: 0, x: 6, y: 6 }), 12, 12, clear);
    const plain = draw(new DrawList().sprite({ sheet, frame: 0, x: 6, y: 6 }), 12, 12);
    let opaque = 0;
    for (let i = 0; i < 144; i += 1) {
      const transparent = plain[i * 4 + 3] === 0;
      expect([...drawn.subarray(i * 4, i * 4 + 4)]).toEqual(transparent ? [...clear] : [...plain.subarray(i * 4, i * 4 + 4)]);
      if (!transparent) opaque += 1;
    }
    expect(opaque).toBeGreaterThan(20);
    // Opaque pixels have alpha 255: there is no blending, a pixel is drawn or not.
    for (let i = 0; i < 144; i += 1) expect([0, 255]).toContain(plain[i * 4 + 3]);
  });

  it("clips a sprite at every edge and draws nothing for one that is outside", () => {
    const whole = draw(new DrawList().sprite({ sheet, frame: 0, x: 6, y: 6 }), 12, 12);
    for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-7, -9], [8, 8]] as const) {
      const moved = draw(new DrawList().sprite({ sheet, frame: 0, x: 6 + dx, y: 6 + dy }), 12, 12);
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const fromX = x - dx;
          const fromY = y - dy;
          const expected = fromX >= 0 && fromX < 12 && fromY >= 0 && fromY < 12 ? pixel(whole, 12, fromX, fromY) : [0, 0, 0, 0];
          expect(pixel(moved, 12, x, y), `moved by (${dx}, ${dy}), pixel (${x}, ${y})`).toEqual(expected);
        }
      }
    }
    for (const [x, y] of [[-6, 6], [18, 6], [6, -6], [6, 18], [-1000000, 2000000]] as const) {
      expect(draw(new DrawList().sprite({ sheet, frame: 0, x, y }), 12, 12).every((byte) => byte === 0), `at (${x}, ${y})`).toBe(true);
    }
  });

  it("draws a higher depth key in front, whatever the order of adding", () => {
    const front = { sheet, frame: 0, x: 6, y: 6, paletteRow: 1, depth: 2 };
    const back = { sheet, frame: 0, x: 6, y: 6, paletteRow: 0, depth: 1 };
    const alone = draw(new DrawList().sprite(front), 12, 12);
    expect(same(draw(new DrawList().sprite(front).sprite(back), 12, 12), alone)).toBe(true);
    expect(same(draw(new DrawList().sprite(back).sprite(front), 12, 12), alone)).toBe(true);
  });

  it("draws equal depth keys in the order of adding: the later one is in front", () => {
    const first = { sheet, frame: 0, x: 6, y: 6, paletteRow: 0 };
    const second = { sheet, frame: 0, x: 6, y: 6, paletteRow: 1 };
    expect(same(draw(new DrawList().sprite(first).sprite(second), 12, 12), draw(new DrawList().sprite(second), 12, 12))).toBe(true);
    expect(same(draw(new DrawList().sprite(second).sprite(first), 12, 12), draw(new DrawList().sprite(first), 12, 12))).toBe(true);
  });

  it("refuses a palette row the table does not have, and a target of another backend", () => {
    const cpu = createCpuBackend();
    const target = cpu.createTarget(12, 12);
    expect(() => cpu.draw(target, new DrawList().sprite({ sheet, frame: 0, x: 0, y: 0, paletteRow: 2 }), { palette })).toThrow(/palette row 2, but the table has rows 0\.\.1/);
    expect(() => cpu.draw({ width: 12, height: 12 }, new DrawList(), { palette })).toThrow(/targets made by its own createTarget/);
    expect(() => cpu.draw(target, new DrawList(), { palette, clear: [0, 0, 0, 256] })).toThrow(/"clear" must be four bytes/);
    expect(() => cpu.createTarget(0, 12)).toThrow(RangeError);
    expect(() => cpu.createTarget(12, 5000)).toThrow(RangeError);
  });

  it("readPixels is a copy; pixels is the live buffer", () => {
    const cpu = createCpuBackend();
    const target = cpu.createTarget(12, 12);
    cpu.draw(target, new DrawList().sprite({ sheet, frame: 0, x: 6, y: 6 }), { palette });
    const copy = cpu.readPixels(target);
    expect(copy).not.toBe(cpu.pixels(target));
    cpu.draw(target, new DrawList(), { palette });
    expect(copy.some((byte) => byte !== 0)).toBe(true);
    expect(cpu.pixels(target).every((byte) => byte === 0)).toBe(true);
  });
});
