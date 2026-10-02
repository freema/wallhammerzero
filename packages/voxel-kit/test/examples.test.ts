// Golden tests of the two example assets, assets/examples/voxel-crate and voxel-chibi.
//
// The hashes below are stored outputs. They change only when an example, this kit, the asset
// kit or the determinism kit changes what is drawn; then look at the new frames (the text
// dumps below, or `./dev npm run asset -- review examples/voxel-crate`) before updating them.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lintAsset, outputHash, renderAll, renderHash } from "@whz/asset-kit";
import type { AnyAsset } from "@whz/asset-kit";
import { loadAsset } from "@whz/asset-kit/node";
import { fnv1a64Hex } from "@whz/det";
import { describe, expect, it } from "vitest";
import voxelChibi from "../../../assets/examples/voxel-chibi/gen.ts";
import voxelCrate from "../../../assets/examples/voxel-crate/gen.ts";
import { ISO_FACINGS, isoFrame, isoSize } from "../src/index.ts";

interface Golden {
  /** Per variant seed: the output hash of every frame of every clip and facing. */
  readonly seeds: Readonly<Record<number, string>>;
  /** Per facing: FNV-1a 64 of the palette indices of frame 0 of the first clip, first variant seed. */
  readonly facings: Readonly<Record<string, string>>;
}

const EXAMPLES: readonly { asset: AnyAsset; folder: string; golden: Golden }[] = [
  {
    asset: voxelCrate as AnyAsset,
    folder: "examples/voxel-crate",
    golden: {
      seeds: { 1: "36d74a57fda596d8", 2: "339580349682d5ab", 3: "7d8e496a37adba54" },
      facings: { sw: "3db8d54d454a40f1", se: "4d5fcbc55835031f", ne: "8e18b27b2e18f521", nw: "799f79b250060ee9" },
    },
  },
  {
    asset: voxelChibi as AnyAsset,
    folder: "examples/voxel-chibi",
    golden: {
      seeds: { 1: "07620d076223892b", 2: "a9bc88a5244e734f", 8: "ffbd4376ef0f94d3" },
      facings: { sw: "818500c7073a0945", se: "3753afda2218d8ca", ne: "e9c54a83b2e137c5", nw: "ffef23737155c72e" },
    },
  },
];

// Frame 0 of the first variant seed, facing sw, as text. Crate: 1 ink, 2 shadow, 3-7 the wood
// ramp, 8-c the steel ramp. Chibi: d-g skin, h-k hair, p-s green, x-z blue.
const CRATE_SW: readonly string[] = [
  "..........................................",
  "..........................................",
  "..........................................",
  "..........................................",
  "...................3333...................",
  ".................33666633.................",
  "...............336666666633...............",
  ".............3366666666666633.............",
  "...........33666666466566666633...........",
  ".........336666664466665566666633.........",
  ".......3366666644666776665566666633.......",
  ".....88666666446667777765555566666633.....",
  "....8bbbb66446667777777777666556666661....",
  "....8bb6666444777777777777774446666661....",
  "....8aa6666667777777777777777666666441....",
  "....8aa5566666677777777777766666644441....",
  "....3555555666666777777776666664444441....",
  "....3554355556666667777666666444445441....",
  "....3554356555566666666666644445445441....",
  "....355435666555566bbbb664444555445441....",
  "....355435666665555bbbb444455555445441....",
  "....355435666664455aa99443355555445441....",
  "....355435666444444aa99333333555445441....",
  "....3554356444444445544333333335445441....",
  "....3554334444444665544553333333345441....",
  "....3554334444466665544555533333345441....",
  "....3554334447766665544555555333345441....",
  "...235555557777666655445555555555554412...",
  ".2223555665556666665544445555555665441222.",
  ".2223555566655566665544445555566644441222.",
  "...221155556665556655445555566644441122...",
  ".....22115555666555554455566644441122.....",
  ".......2211555566655544566644441122.......",
  ".........221155556555445644441122.........",
  "...........22115555554444441122...........",
  ".............2211555544441122.............",
  "...............221155441122...............",
  ".................22111122.................",
  "...................2222...................",
  "..........................................",
  "..........................................",
  "..........................................",
];

const CHIBI_SW: readonly string[] = [
  "....................",
  "....................",
  "......hhhhhhhh......",
  "....hhjjjjjjjjhh....",
  "...hjjjjjjjjjjjj1...",
  "...hjjjjjjjjjjjj1...",
  "..hhjjjjjjjjjjjjhh..",
  ".hjijjjjjjjjjjjjij1.",
  ".hjiiijjjjjjjjhhij1.",
  ".hiiiiiihhhihhhhhh1.",
  ".hii1fiiiiiihhhhhh1.",
  ".dff1ff1ijjihhhhhh1.",
  ".dfffff1iihhhheehh1.",
  "..11ffffiihheeee11..",
  "...pppffffeeeeqq1...",
  "...pqqppffeepqqq1...",
  "...deerrppppqqqq1...",
  "...deerrrrrrqqqq1...",
  "....11rrrrrrqqee1...",
  ".....xxxrrffeeee1...",
  "....2xxxyyffee11....",
  "..222xxxyy11111222..",
  "..222xxxxxxxxx1222..",
  "....2211xxxx1122....",
  "......22111122......",
  "........2222........",
  "....................",
  "....................",
];

/** Frame 0 of the first clip for one facing. */
function firstFrame(asset: AnyAsset, facing: string, seed = asset.variantSeeds[0] as number) {
  return asset.render({ seed, clip: asset.meta.clips[0]?.name as string, frame: 0, facing });
}

describe.each(EXAMPLES)("assets/$folder", ({ asset, folder, golden }) => {
  it("its id is its folder under assets/, and it has the four facings", () => {
    expect(asset.meta.id).toBe(folder);
    expect(readdirSync(fileURLToPath(new URL(`../../../assets/${folder}/`, import.meta.url)))).toContain("gen.ts");
    expect(asset.meta.facings).toEqual([...ISO_FACINGS]);
    expect(asset.meta.paletteId).toBe("voxel-example");
    expect(asset.variantSeeds.map(Number)).toEqual(Object.keys(golden.seeds).map(Number));
  });

  it("golden: every facing gives its stored hash", () => {
    const hashes = Object.fromEntries(asset.meta.facings.map((facing) => [facing, fnv1a64Hex(firstFrame(asset, facing).data)]));
    expect(hashes).toEqual(golden.facings);
    // Four facings are four different pictures.
    expect(new Set(Object.values(hashes)).size).toBe(4);
  });

  it("golden: every variant seed gives its stored output hash", () => {
    const hashes = Object.fromEntries(asset.variantSeeds.map((seed) => [seed, renderHash(asset, { seed })]));
    expect(hashes).toEqual(golden.seeds);
    expect(new Set(Object.values(hashes)).size).toBe(asset.variantSeeds.length);
  });

  it("baking twice gives byte-identical output", () => {
    for (const seed of [...asset.variantSeeds, ...asset.reviewSeeds.slice(0, 2)]) {
      const first = renderAll(asset, { seed });
      const second = renderAll(asset, { seed });
      expect(first.frames.length).toBe(asset.meta.clips.reduce((sum, clip) => sum + clip.frames, 0) * 4);
      first.frames.forEach((frame, i) => {
        const again = second.frames[i]?.buffer;
        expect(again).not.toBe(frame.buffer);
        expect(Buffer.from(frame.buffer.data).equals(Buffer.from(again?.data ?? [])), `seed ${seed}, frame ${i}`).toBe(true);
      });
      expect(outputHash(first)).toBe(outputHash(second));
    }
  });

  it("the frames do not depend on the order they are rendered in", () => {
    const seed = asset.variantSeeds[1] as number;
    const before = firstFrame(asset, "ne", seed);
    for (const facing of ["nw", "sw", "se"]) firstFrame(asset, facing, asset.variantSeeds[2] as number);
    expect(firstFrame(asset, "ne", seed).equals(before)).toBe(true);
  });

  it("passes every lint of the asset kit, for every variant seed, review seed and preset", () => {
    const report = lintAsset(asset);
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
    expect(report.errors).toBe(0);
    expect(report.subjects.every((subject) => subject.outputHash !== null)).toBe(true);
  });

  it("loads from its file the way the bake CLI does", async () => {
    const loaded = await loadAsset(new URL(`../../../assets/${folder}/gen.ts`, import.meta.url));
    expect(loaded.meta).toEqual(asset.meta);
    const seed = asset.variantSeeds[0] as number;
    expect(renderHash(loaded, { seed })).toBe(golden.seeds[seed]);
  });
});

describe("assets/examples/voxel-crate", () => {
  it("is an 8 x 8 x 8 crate: 32 x 32 pixels of projection in a 42 x 42 frame", () => {
    expect(isoSize([8, 8, 8])).toEqual({ w: 32, h: 32 });
    expect(voxelCrate.meta.size).toEqual(isoFrame([8, 8, 8], 5).size);
    expect(voxelCrate.meta.size).toEqual([42, 42]);
    expect(voxelCrate.meta.pivot).toEqual([21, 29]);
    expect(voxelCrate.meta.clips).toEqual([{ name: "idle", frames: 1, durations: [1000], loop: true }]);
    // The crate itself is exactly the projection: the outline is one pixel around it.
    const frame = firstFrame(voxelCrate as AnyAsset, "sw");
    const shadow = voxelCrate.palette.shadow;
    let x0 = 99;
    let x1 = -1;
    let y0 = 99;
    let y1 = -1;
    frame.data.forEach((value, at) => {
      if (value === 0 || value === shadow) return;
      const x = at % frame.w;
      const y = (at - x) / frame.w;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    });
    expect([x0, y0, x1 - x0 + 1, y1 - y0 + 1]).toEqual([4, 4, 34, 34]);
  });

  it("draws a crate: a lit top, a lit rim above, ink below, the shadow on the ground", () => {
    const rows = firstFrame(voxelCrate as AnyAsset, "sw").toText().split("\n");
    expect(rows).toEqual(CRATE_SW);
  });

  it("the brace param and the preset change the output, and the seed changes the grain", () => {
    const asset = voxelCrate as AnyAsset;
    expect(Object.keys(voxelCrate.params)).toEqual(["braces"]);
    expect(renderHash(asset, { seed: 1, preset: "plain" })).toBe(renderHash(asset, { seed: 1, params: { braces: false } }));
    expect(renderHash(asset, { seed: 1, preset: "plain" })).not.toBe(renderHash(asset, { seed: 1 }));
    const plain = [1, 2, 3, 4, 5].map((seed) => renderHash(asset, { seed, preset: "plain" }));
    expect(new Set(plain).size).toBe(5);
  });

  it("is the example of the README, character for character", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const source = readFileSync(new URL("../../../assets/examples/voxel-crate/gen.ts", import.meta.url), "utf8");
    const block = /```ts\n([\s\S]*?)```/.exec(readme)?.[1];
    expect(block).toBe(source.slice(source.indexOf("import ")));
  });
});

describe("assets/examples/voxel-chibi", () => {
  it("is a 4 x 4 x 8 chibi: 16 x 24 pixels of projection in a 20 x 28 frame", () => {
    expect(isoSize([4, 8, 4])).toEqual({ w: 16, h: 24 });
    expect(voxelChibi.meta.size).toEqual(isoFrame([4, 8, 4], 2).size);
    expect(voxelChibi.meta.size).toEqual([20, 28]);
    expect(voxelChibi.meta.pivot).toEqual([10, 22]);
    expect(voxelChibi.meta.clips).toEqual([
      { name: "idle", frames: 2, durations: [500, 500], loop: true },
      { name: "walk", frames: 4, durations: [140, 140, 140, 140], loop: true },
    ]);
  });

  it("draws a chibi: hair, a face with two eyes, a shirt, legs, a shadow", () => {
    const rows = firstFrame(voxelChibi as AnyAsset, "sw").toText().split("\n");
    expect(rows).toEqual(CHIBI_SW);
  });

  it("the poses move it: the idle breathes, the walk has four frames of two different steps", () => {
    const asset = voxelChibi as AnyAsset;
    const frame = (clip: string, n: number, facing = "sw") => asset.render({ seed: 1, clip, frame: n, facing });
    expect(frame("idle", 0).equals(frame("idle", 1))).toBe(false);
    // The passing frames of the walk are the rest pose; the two steps differ.
    expect(frame("walk", 1).equals(frame("idle", 0))).toBe(true);
    expect(frame("walk", 3).equals(frame("walk", 1))).toBe(true);
    expect(frame("walk", 0).equals(frame("walk", 2))).toBe(false);
    expect(frame("walk", 0).equals(frame("walk", 1))).toBe(false);
    // The eyes are on the front of the head: two facings show them, two show the back.
    const ink = (facing: string): number => {
      const buffer = frame("idle", 0, facing);
      let count = 0;
      // Ink inside the head: rows 6-12 of the frame, away from the outline.
      for (let y = 6; y <= 12; y += 1) for (let x = 2; x <= 17; x += 1) if (buffer.get(x, y) === asset.palette.ink) count += 1;
      return count;
    };
    expect([ink("sw"), ink("se"), ink("ne"), ink("nw")]).toEqual([4, 4, 0, 0]);
  });

  it("the variant seeds are three looks", () => {
    const asset = voxelChibi as AnyAsset;
    const colors = asset.variantSeeds.map((seed) => new Set(firstFrame(asset, "sw", seed).data));
    const has = (set: Set<number>, slot: string): boolean => set.has(asset.palette.slot(slot));
    // Seed 1: brown hair and a green shirt. Seed 2: grey hair, green. Seed 8: blond hair, red.
    expect([has(colors[0] as Set<number>, "hair.1"), has(colors[0] as Set<number>, "green.2")]).toEqual([true, true]);
    expect([has(colors[1] as Set<number>, "steel.1"), has(colors[1] as Set<number>, "green.2")]).toEqual([true, true]);
    expect([has(colors[2] as Set<number>, "gold.1"), has(colors[2] as Set<number>, "red.2")]).toEqual([true, true]);
    // A sprite stays inside 16 colours.
    for (const seed of asset.variantSeeds) {
      const used = new Set<number>();
      for (const { buffer } of renderAll(asset, { seed }).frames) buffer.data.forEach((value) => used.add(value));
      used.delete(0);
      expect(used.size, `seed ${seed}`).toBeLessThanOrEqual(16);
    }
  });
});
