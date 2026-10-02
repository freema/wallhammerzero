// The golden hashes of the check scenes (test/golden/parity.json), and the scenes themselves.
//
// The dev page draws the same scenes with the WebGL backend in a real browser and compares
// its hashes with this file (window.__runtime.parity(), see README.md). Containers have no
// GPU, so that half is not part of the gate; this half pins what the WebGL half must match.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { examplePalette, GRID_CELLS, gridPreviews, parityScenes, twentySprites } from "../dev/scenes.ts";
import { pixelHash, spriteRect } from "../src/index.ts";
import { bakeExample, cpuHashes, drawOnCpu, PARITY_FORMAT } from "./helpers.ts";
import type { BakedExample } from "./helpers.ts";

let example: BakedExample;

beforeAll(async () => {
  example = await bakeExample();
});
afterAll(() => example.remove());

describe("test/golden/parity.json", () => {
  it("holds the CPU backend's hash of every check scene (npm run golden -w @whz/runtime rewrites it)", () => {
    const golden = JSON.parse(readFileSync(fileURLToPath(new URL("./golden/parity.json", import.meta.url)), "utf8")) as {
      format: string;
      scenes: Record<string, string>;
    };
    expect(golden.format).toBe(PARITY_FORMAT);
    expect(golden.scenes).toEqual(cpuHashes(example));
    // Every frame of every variant, as baked and mirrored with the other palette row, and the 20-sprite list.
    expect(Object.keys(golden.scenes)).toHaveLength(example.sheets.length * example.atlas.frames.length * 2 + 1);
    expect(new Set(Object.values(golden.scenes)).size).toBe(Object.keys(golden.scenes).length);
  });
});

describe("the check scenes", () => {
  it("the 20-sprite list has 20 sprites, mirrored and not, on two palette rows, sharing depth keys, some cut by the edges", () => {
    const scene = twentySprites(example.sheets);
    const items = scene.list.items();
    expect(items).toHaveLength(20);
    expect(new Set(items.map((item) => item.mirror))).toEqual(new Set([true, false]));
    expect(new Set(items.map((item) => item.paletteRow))).toEqual(new Set([0, 1]));
    expect(new Set(items.map((item) => item.sheet)).size).toBe(example.sheets.length);
    expect(new Set(items.map((item) => item.frame))).toEqual(new Set([0, 1]));
    expect(new Set(items.map((item) => item.depth)).size).toBeLessThan(items.length);
    const cut = items.filter((item) => {
      const rect = spriteRect(item);
      return rect.x < 0 || rect.y < 0 || rect.x + rect.w > scene.width || rect.y + rect.h > scene.height;
    });
    expect(cut.length).toBeGreaterThan(0);
    expect(cut.length).toBeLessThan(items.length);
    // Sprites overlap, so the order decides pixels: drawn in the order of adding, the picture differs.
    const sortedOrder = scene.list.sorted().map((item) => item.order);
    expect(sortedOrder).not.toEqual(items.map((item) => item.order));
  });

  it("are the same scenes every time", () => {
    const palette = examplePalette(example.atlas);
    const hashes = (): string[] => parityScenes(example.sheets).map((scene) => pixelHash(scene.width, scene.height, drawOnCpu(scene, palette)));
    expect(hashes()).toEqual(hashes());
  });

  it("the grid has 16 previews; cell 0 is the example asset as baked, following the clip", () => {
    const palette = examplePalette(example.atlas);
    const at = (timeMs: number): string[] => gridPreviews(example.sheets, timeMs).map(({ scene }) => pixelHash(scene.width, scene.height, drawOnCpu(scene, palette)));
    expect(gridPreviews(example.sheets, 0)).toHaveLength(GRID_CELLS);
    expect(GRID_CELLS).toBe(16);
    const golden = cpuHashes(example);
    // blink: frame 0 for 600 ms, frame 1 for 200 ms, looping.
    expect(at(0)[0]).toBe(golden["frame seed-1 blink.default.0"]);
    expect(at(599)[0]).toBe(golden["frame seed-1 blink.default.0"]);
    expect(at(600)[0]).toBe(golden["frame seed-1 blink.default.1"]);
    expect(at(800)[0]).toBe(golden["frame seed-1 blink.default.0"]);
    // The grid at a time is a pure function of the time.
    expect(at(1234)).toEqual(at(1234));
    expect(at(1234)).not.toEqual(at(1834));
  });
});
