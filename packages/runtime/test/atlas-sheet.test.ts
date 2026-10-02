// Atlas parsing and sheets: the runtime reads what `asset bake` writes, and refuses what is
// not a `wz.atlas/1` file.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bakeAsset } from "@whz/asset-kit";
import { encodeIndexedPng } from "@whz/asset-kit/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import blinkingDot from "../../../assets/examples/blinking-dot/gen.ts";
import { createSheet, findClip, findVariant, frameIndex, parseAtlas, sheetFromPng } from "../src/index.ts";
import type { Atlas } from "../src/index.ts";
import { readAtlas, readSheet } from "../src/node/index.ts";
import { bakeExample } from "./helpers.ts";
import type { BakedExample } from "./helpers.ts";

let example: BakedExample;
let json: Record<string, unknown>;

beforeAll(async () => {
  example = await bakeExample();
  json = JSON.parse(readFileSync(join(example.dir, "atlas.json"), "utf8")) as Record<string, unknown>;
});
afterAll(() => example.remove());

/** The baked atlas.json with some fields replaced. */
const edited = (changes: Record<string, unknown>): Record<string, unknown> => ({ ...structuredClone(json), ...changes });

describe("parseAtlas on the baked example asset", () => {
  it("reads the fields the runtime draws with", () => {
    const atlas = parseAtlas(json);
    expect(atlas.format).toBe("wz.atlas/1");
    expect(atlas.id).toBe("examples/blinking-dot");
    expect(atlas.size).toEqual([12, 12]);
    expect(atlas.pivot).toEqual([6, 6]);
    expect(atlas.palette.id).toBe("example");
    expect(atlas.palette.colors).toHaveLength(17);
    expect(atlas.palette.colors[1]).toBe("#3b2f4a");
    expect(atlas.facings).toEqual(["default"]);
    expect(atlas.clips).toEqual([{ name: "blink", frames: 2, durations: [600, 200], loop: true, start: { default: 0 } }]);
    expect(atlas.sheet).toEqual({ w: 27, h: 14 });
    expect(atlas.frames).toEqual([
      { index: 0, clip: "blink", facing: "default", frame: 0, x: 1, y: 1, w: 12, h: 12, duration: 600 },
      { index: 1, clip: "blink", facing: "default", frame: 1, x: 14, y: 1, w: 12, h: 12, duration: 200 },
    ]);
    expect(atlas.variants).toEqual([
      { seed: 1, sheet: "seed-1.png" },
      { seed: 2, sheet: "seed-2.png" },
      { seed: 5, sheet: "seed-5.png" },
    ]);
  });

  it("keeps only those fields, frozen", () => {
    const atlas = parseAtlas(json);
    expect(Object.keys(atlas).sort()).toEqual(["clips", "facings", "format", "frames", "id", "palette", "pivot", "sheet", "size", "variants"]);
    expect(Object.isFrozen(atlas)).toBe(true);
    expect(Object.isFrozen(atlas.frames)).toBe(true);
    expect(Object.isFrozen(atlas.frames[0])).toBe(true);
  });

  it("an atlas baked in memory by the asset kit is an Atlas as it is, and parses to the same", () => {
    const baked = bakeAsset(blinkingDot, { sourceHash: "0".repeat(16) });
    const direct: Atlas = baked.atlas; // the types line up: no conversion
    expect(parseAtlas(JSON.parse(JSON.stringify(direct)))).toEqual(parseAtlas(json));
  });
});

describe("parseAtlas refuses", () => {
  const cases: [string, () => unknown, RegExp][] = [
    ["a value that is not an object", () => [], /must hold a JSON object/],
    ["another format", () => edited({ format: "wz.atlas/2" }), /"format" must be "wz\.atlas\/1", got "wz\.atlas\/2"/],
    ["a size that is not two positive integers", () => edited({ size: [12, 0] }), /"size" must be two integers/],
    ["a pivot that is not integers", () => edited({ pivot: [6.5, 6] }), /"pivot" must be two integers/],
    ["a palette colour that is not #rrggbb", () => edited({ palette: { id: "example", colors: ["#000000", "red"] } }), /palette\.colors\[1\] must be "#rrggbb"/],
    ["more than 256 palette slots", () => edited({ palette: { id: "example", colors: new Array<string>(257).fill("#000000") } }), /at most 256/],
    ["no clips", () => edited({ clips: [] }), /"clips" must be a list with at least one entry/],
    ["a facing listed twice", () => edited({ facings: ["default", "default"] }), /names a facing twice/],
    ["a sheet larger than 4096", () => edited({ sheet: { w: 5000, h: 14 } }), /"sheet\.w" and "sheet\.h"/],
    [
      "a clip with a duration of 0",
      () => edited({ clips: [{ name: "blink", frames: 2, durations: [600, 0], loop: true, start: { default: 0 } }] }),
      /the duration of frame 1 must be whole milliseconds/,
    ],
    [
      "a clip without a start for a facing",
      () => edited({ clips: [{ name: "blink", frames: 2, durations: [600, 200], loop: true, start: {} }] }),
      /start\.default must be the index of its first frame/,
    ],
    [
      "a clip with more frames than the atlas has",
      () => edited({ clips: [{ name: "blink", frames: 3, durations: [600, 200, 1], loop: true, start: { default: 0 } }] }),
      /"frames" must be an integer in \[1, 2\]/,
    ],
    ["no variants", () => edited({ variants: [] }), /"variants" must be a list with at least one entry/],
    [
      "a seed listed twice",
      () => edited({ variants: [{ seed: 1, sheet: "a.png" }, { seed: 1, sheet: "b.png" }] }),
      /the variant seed 1 is listed twice/,
    ],
  ];
  for (const [name, make, message] of cases) {
    it(name, () => {
      expect(() => parseAtlas(make())).toThrow(message);
    });
  }

  const withFrame = (index: number, changes: Record<string, unknown>): unknown => {
    const copy = structuredClone(json);
    Object.assign((copy["frames"] as Record<string, unknown>[])[index] as Record<string, unknown>, changes);
    return copy;
  };
  const frameCases: [string, Record<string, unknown>, RegExp][] = [
    ["a frame out of order", { index: 0 }, /frames\[1\]\.index must be 1, got 0/],
    ["a frame of an unknown clip", { clip: "walk" }, /frames\[1\]\.clip "walk" is not a clip/],
    ["a frame of an unknown facing", { facing: "north" }, /frames\[1\]\.facing "north" is not a facing/],
    ["a frame number outside the clip", { frame: 2 }, /frames\[1\]\.frame must be in \[0, 1\]/],
    ["a frame that is not where its clip says", { frame: 0 }, /is frame 0 of blink\.default, but that clip starts at index 0/],
    ["a frame of another size", { w: 13 }, /is 13 x 12, but every frame must be 12 x 12/],
    ["a frame that reaches outside the sheet", { x: 16 }, /at \(16, 1\) is not inside the 27 x 14 sheet/],
    ["a frame whose duration is not the clip's", { duration: 600 }, /duration is 600, but the clip says 200/],
  ];
  for (const [name, changes, message] of frameCases) {
    it(name, () => {
      expect(() => parseAtlas(withFrame(1, changes))).toThrow(message);
    });
  }

  it("names the atlas in the error", () => {
    expect(() => parseAtlas(edited({ facings: [] }))).toThrow(/^atlas "examples\/blinking-dot": /);
  });
});

describe("findClip, findVariant and frameIndex", () => {
  it("find by name and by seed", () => {
    const { atlas } = example;
    expect(findClip(atlas, "blink").durations).toEqual([600, 200]);
    expect(findVariant(atlas).seed).toBe(1);
    expect(findVariant(atlas, 5).sheet).toBe("seed-5.png");
    expect(frameIndex(atlas, "blink", 0)).toBe(0);
    expect(frameIndex(atlas, "blink", 1, "default")).toBe(1);
  });

  it("say what exists when the name is wrong", () => {
    const { atlas } = example;
    expect(() => findClip(atlas, "walk")).toThrow(/no clip named "walk" \(clips: blink\)/);
    expect(() => findVariant(atlas, 3)).toThrow(/no variant with seed 3 \(seeds: 1, 2, 5\)/);
    expect(() => frameIndex(atlas, "blink", 0, "north")).toThrow(/no facing named "north" \(facings: default\)/);
    expect(() => frameIndex(atlas, "blink", 2)).toThrow(/has frames 0\.\.1, got 2/);
  });
});

describe("sheets", () => {
  it("readSheet reads the bake folder: the sheet's pixels are the asset kit's sheet", () => {
    const baked = bakeAsset(blinkingDot, { sourceHash: "0".repeat(16) });
    expect(example.sheets.map((sheet) => sheet.seed)).toEqual([1, 2, 5]);
    example.sheets.forEach((sheet, i) => {
      const kit = baked.variants[i]?.sheet;
      expect([sheet.width, sheet.height]).toEqual([kit?.w, kit?.h]);
      expect(Buffer.from(sheet.pixels).equals(Buffer.from(kit?.data ?? []))).toBe(true);
    });
    expect(readSheet(example.dir).seed).toBe(1);
    expect(readAtlas(example.dir)).toEqual(example.atlas);
  });

  it("createSheet takes the asset kit's in-memory sheet without a PNG round trip", () => {
    const baked = bakeAsset(blinkingDot, { sourceHash: "0".repeat(16) });
    const variant = baked.variants[1];
    if (variant === undefined) throw new Error("the example asset has three variants");
    const sheet = createSheet(baked.atlas, variant.sheet, 2);
    expect(sheet.seed).toBe(2);
    expect(sheet.pixels).toBe(variant.sheet.data);
    expect(Buffer.from(sheet.pixels).equals(Buffer.from(example.sheets[1]?.pixels ?? []))).toBe(true);
  });

  it("refuses an image that is not the sheet the atlas describes", () => {
    const { atlas } = example;
    expect(() => createSheet(atlas, { w: 26, h: 14, data: new Uint8Array(26 * 14) })).toThrow(/the image is 26 x 14, but the atlas describes a 27 x 14 sheet/);
    expect(() => createSheet(atlas, { w: 27, h: 14, data: new Uint8Array(10) })).toThrow(/10 bytes of pixels/);
    expect(() => createSheet(atlas, { w: 27, h: 14, data: new Uint8Array(27 * 14).fill(17) })).toThrow(/index 17, but the palette "example" has only 17 slots/);
    expect(() => createSheet(atlas, { w: 27, h: 14, data: new Uint8Array(27 * 14) }, 3)).toThrow(/no variant with seed 3/);
  });

  it("refuses a sheet file whose colours are not the atlas's palette", () => {
    const { atlas } = example;
    const other = blinkingDot.palette.rgba();
    other[1 * 4] = 0xff; // another red for the ink slot
    const png = encodeIndexedPng({ w: 27, h: 14, data: new Uint8Array(27 * 14) }, other);
    expect(() => sheetFromPng(atlas, png)).toThrow(/the colours in seed-1\.png are not the atlas's palette; the two files are from different bakes/);
  });

  it("readAtlas says how to bake when the folder has no atlas", () => {
    expect(() => readAtlas(join(example.dir, "missing"))).toThrow(/bake the asset first/);
  });
});
