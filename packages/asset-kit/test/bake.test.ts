// The bake: the sheet layout, the atlas, and the files on disk. The golden values are the
// output hashes of the example asset (the same ones as in example-asset.test.ts) and the
// hashes of its baked sheets.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { fnv1a64Hex } from "@whz/det";
import blinkingDot from "../../../assets/examples/blinking-dot/gen.ts";
import { ATLAS_FORMAT, bakeAsset, formatJson, layoutSheet, paletteHash, parsePalette, renderAll } from "../src/index.ts";
import type { AnyAsset, Atlas } from "../src/index.ts";
import { BAKE_ERROR_FORMAT, bakeAll, bakeToDisk, decodePng, findAsset, findAssets, loadAsset, openProject, sourceHash } from "../src/node/index.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./lint-fixtures/", import.meta.url));
const dot = blinkingDot as AnyAsset;

/** The output hash of each variant seed of the example asset. */
const OUTPUT: Record<number, string> = { 1: "ff98ad430bb70a8f", 2: "98e464e59024775b", 5: "2b7d30fc34ab0333" };
/** FNV-1a 64 of the indices of each baked sheet (27 x 14) of the example asset. */
const SHEET: Record<number, string> = { 1: "1969a86d767d0b93", 2: "2a1a2cdddda5ded3", 5: "b3799c4460bc9997" };

const temp = mkdtempSync(join(tmpdir(), "whz-bake-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

/** Every file under a folder with its content, as `relative path -> hex`. */
function snapshot(folder: string, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(join(folder, prefix), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, snapshot(folder, path));
    else files[path] = readFileSync(join(folder, path)).toString("hex");
  }
  return files;
}

describe("layoutSheet", () => {
  it("puts one clip and facing per row, frames left to right, with a 1-pixel transparent border around each frame", () => {
    const layout = layoutSheet({
      id: "tests/layout",
      size: [4, 6],
      clips: [
        { name: "idle", frames: 2, durations: [100, 100], loop: true },
        { name: "walk", frames: 3, durations: [100, 100, 100], loop: true },
      ],
      facings: ["down", "side"],
    });
    expect(layout).toMatchObject({ w: 16, h: 29, columns: 3, rows: 4, padding: 1 });
    expect(layout.cells).toEqual([
      { x: 1, y: 1 },
      { x: 6, y: 1 },
      { x: 1, y: 8 },
      { x: 6, y: 8 },
      { x: 1, y: 15 },
      { x: 6, y: 15 },
      { x: 11, y: 15 },
      { x: 1, y: 22 },
      { x: 6, y: 22 },
      { x: 11, y: 22 },
    ]);
  });

  it("wraps a clip that is longer than the sheet is wide, and refuses frames that cannot fit", () => {
    const clip = { name: "long", frames: 5, durations: [1, 1, 1, 1, 1], loop: true };
    const wide = layoutSheet({ id: "tests/wide", size: [1500, 10], clips: [clip], facings: ["default"] });
    expect(wide).toMatchObject({ columns: 2, rows: 3, w: 3003, h: 34 });
    expect(wide.cells[4]).toEqual({ x: 1, y: 23 });
    expect(() => layoutSheet({ id: "tests/tall", size: [1500, 2000], clips: [clip], facings: ["default"] })).toThrow(
      /asset "tests\/tall": 5 frames of 1500 x 2000 do not fit one 4096 x 4096 sheet/,
    );
    expect(() => layoutSheet({ id: "tests/huge", size: [4096, 8], clips: [clip], facings: ["default"] })).toThrow(/do not fit/);
  });
});

describe("bakeAsset (in memory)", () => {
  const baked = bakeAsset(dot, { sourceHash: "0123456789abcdef" });

  it("golden: the atlas of the example asset", () => {
    expect(baked.atlas).toEqual({
      format: ATLAS_FORMAT,
      id: "examples/blinking-dot",
      kind: "sprite",
      size: [12, 12],
      pivot: [6, 6],
      palette: { id: "example", hash: paletteHash(dot.palette), colors: dot.palette.slots.map((slot) => `#${Buffer.from(slot.rgb).toString("hex")}`) },
      clips: [{ name: "blink", frames: 2, durations: [600, 200], loop: true, start: { default: 0 } }],
      facings: ["default"],
      params: { diameter: 6 },
      presets: ["small", "big"],
      reviewSeeds: [1, 2, 3, 4, 5, 6, 7, 8],
      sourceHash: "0123456789abcdef",
      sheet: { w: 27, h: 14, columns: 2, rows: 1, padding: 1 },
      frames: [
        { index: 0, clip: "blink", facing: "default", frame: 0, x: 1, y: 1, w: 12, h: 12, duration: 600, file: "blink.default.0.png" },
        { index: 1, clip: "blink", facing: "default", frame: 1, x: 14, y: 1, w: 12, h: 12, duration: 200, file: "blink.default.1.png" },
      ],
      variants: [
        { seed: 1, sheet: "seed-1.png", frames: "frames/seed-1", outputHash: OUTPUT[1] },
        { seed: 2, sheet: "seed-2.png", frames: "frames/seed-2", outputHash: OUTPUT[2] },
        { seed: 5, sheet: "seed-5.png", frames: "frames/seed-5", outputHash: OUTPUT[5] },
      ],
    } satisfies Atlas);
    expect(baked.atlas.palette.colors.slice(0, 2)).toEqual(["#000000", "#3b2f4a"]);
  });

  it("golden: the sheets have stable hashes", () => {
    const hashes = Object.fromEntries(baked.variants.map((variant) => [variant.seed, fnv1a64Hex(variant.sheet.data)]));
    expect(hashes).toEqual(SHEET);
  });

  it("every frame is in the sheet at its atlas rectangle, and the rest of the sheet is transparent", () => {
    for (const variant of baked.variants) {
      const { sheet } = variant;
      const covered = new Uint8Array(sheet.data.length);
      baked.atlas.frames.forEach((frame, i) => {
        const source = variant.output.frames[i]?.buffer;
        expect(sheet.crop(frame.x, frame.y, frame.w, frame.h).equals(source as never), `seed ${variant.seed}, frame ${i}`).toBe(true);
        for (let y = frame.y; y < frame.y + frame.h; y += 1) covered.fill(1, y * sheet.w + frame.x, y * sheet.w + frame.x + frame.w);
      });
      expect(sheet.data.every((index, at) => covered[at] === 1 || index === 0)).toBe(true);
    }
  });

  it("baking twice gives the same atlas and the same sheets", () => {
    const again = bakeAsset(dot, { sourceHash: "0123456789abcdef" });
    expect(formatJson(again.atlas)).toBe(formatJson(baked.atlas));
    again.variants.forEach((variant, i) => expect(variant.sheet.equals(baked.variants[i]?.sheet as never)).toBe(true));
  });

  it("the palette hash follows the colours and the slot names, which the output hash does not", () => {
    const json = JSON.parse(readFileSync(join(REPO, "assets/palettes/example.json"), "utf8")) as { slots: { name: string; rgb: string }[] };
    expect(paletteHash(parsePalette(json))).toBe(baked.atlas.palette.hash);
    (json.slots[5] as { rgb: string }).rgb = "#8f2d4b";
    expect(paletteHash(parsePalette(json))).not.toBe(baked.atlas.palette.hash);
  });
});

describe("bakeToDisk", () => {
  const project = openProject({ root: REPO, out: join(temp, "repo") });
  const entry = findAsset(project, "examples/blinking-dot");

  it("finds the assets of the repo by their folder", () => {
    const entries = findAssets(project);
    expect(entries.map((found) => found.id)).toContain("examples/blinking-dot");
    expect(entries.every((found) => found.genFile.endsWith("gen.ts"))).toBe(true);
    expect(() => findAsset(project, "examples/missing")).toThrow(/no asset "examples\/missing" under .*assets \(assets: .*examples\/blinking-dot/);
  });

  it("writes atlas.json, a sheet per variant and every frame, and the PNG files hold the indices", async () => {
    const result = await bakeToDisk(project, entry);
    if (!result.ok) throw new Error(result.error);
    expect(result.dir).toBe(join(temp, "repo", "assets", "examples", "blinking-dot"));
    expect(Object.keys(snapshot(result.dir))).toEqual([
      "atlas.json",
      "frames/seed-1/blink.default.0.png",
      "frames/seed-1/blink.default.1.png",
      "frames/seed-2/blink.default.0.png",
      "frames/seed-2/blink.default.1.png",
      "frames/seed-5/blink.default.0.png",
      "frames/seed-5/blink.default.1.png",
      "seed-1.png",
      "seed-2.png",
      "seed-5.png",
    ]);
    expect(result.files.at(-1)).toBe("atlas.json"); // written last

    const atlas = JSON.parse(readFileSync(join(result.dir, "atlas.json"), "utf8")) as Atlas;
    expect(atlas).toEqual(JSON.parse(JSON.stringify(result.atlas)));
    expect(atlas.variants.map((variant) => variant.outputHash)).toEqual([OUTPUT[1], OUTPUT[2], OUTPUT[5]]);
    expect(atlas.sourceHash).toBe(sourceHash(entry));

    for (const variant of atlas.variants) {
      const output = renderAll(dot, { seed: variant.seed });
      const sheet = decodePng(readFileSync(join(result.dir, variant.sheet)));
      expect([sheet.type, sheet.w, sheet.h]).toEqual(["indexed", atlas.sheet.w, atlas.sheet.h]);
      expect(fnv1a64Hex(sheet.data)).toBe(SHEET[variant.seed]);
      expect(Buffer.from(sheet.palette ?? []).equals(Buffer.from(dot.palette.rgba()))).toBe(true);
      for (const frame of atlas.frames) {
        const png = decodePng(readFileSync(join(result.dir, variant.frames, frame.file)));
        expect([png.w, png.h]).toEqual([12, 12]);
        expect(Buffer.from(png.data).equals(Buffer.from(output.frames[frame.index]?.buffer.data ?? []))).toBe(true);
      }
    }
  });

  it("baking twice gives identical files, byte for byte", async () => {
    const first = snapshot(join(temp, "repo", "assets", "examples", "blinking-dot"));
    const again = await bakeToDisk(project, entry);
    expect(again.ok).toBe(true);
    expect(snapshot(again.dir)).toEqual(first);
    // And so does a bake into an empty folder by another call.
    const other = openProject({ root: REPO, out: join(temp, "other") });
    await bakeToDisk(other, findAsset(other, "examples/blinking-dot"));
    expect(snapshot(join(temp, "other", "assets", "examples", "blinking-dot"))).toEqual(first);
  });
});

describe("the source hash", () => {
  it("covers every file of the asset's folder except the studio's verdicts and notes", () => {
    const folder = join(temp, "source", "pack", "thing");
    mkdirSync(join(folder, "stamps"), { recursive: true });
    writeFileSync(join(folder, "gen.ts"), "export default 1;\n");
    writeFileSync(join(folder, "stamps", "face.txt"), "ab\n");
    const before = sourceHash({ folder });
    expect(before).toMatch(/^[0-9a-f]{16}$/);
    expect(sourceHash({ folder })).toBe(before);

    writeFileSync(join(folder, "review.json"), "{}");
    writeFileSync(join(folder, "NOTES.md"), "notes");
    expect(sourceHash({ folder })).toBe(before);

    writeFileSync(join(folder, "stamps", "face.txt"), "ac\n");
    const edited = sourceHash({ folder });
    expect(edited).not.toBe(before);
    writeFileSync(join(folder, "stamps", "hat.txt"), "");
    expect(sourceHash({ folder })).not.toBe(edited);
  });
});

describe("bakeAll", () => {
  it("bakes every asset, leaves error.json for one that fails, and removes the output of assets that are gone", async () => {
    const out = join(temp, "all");
    const project = openProject({ root: REPO, assets: FIXTURES, out });
    // Output of an asset that no longer exists, and stale output of one that will fail.
    mkdirSync(join(out, "assets", "old", "gone"), { recursive: true });
    writeFileSync(join(out, "assets", "old", "gone", "atlas.json"), "{}");
    mkdirSync(join(out, "assets", "defects", "wrong-frame-size", "frames"), { recursive: true });
    writeFileSync(join(out, "assets", "defects", "wrong-frame-size", "atlas.json"), "{}");

    const results = await bakeAll(project);
    expect(results.map((result) => result.id)).toEqual(findAssets(project).map((entry) => entry.id));
    expect(results.length).toBe(15);
    // A lint defect is still a drawing: only the two that cannot be rendered fail to bake.
    expect(results.filter((result) => !result.ok).map((result) => result.id)).toEqual(["defects/off-palette", "defects/wrong-frame-size"]);

    const failed = results.find((result) => result.id === "defects/wrong-frame-size");
    expect(failed !== undefined && !failed.ok && failed.error).toMatch(/19 x 22/);
    expect(readdirSync(join(out, "assets", "defects", "wrong-frame-size"))).toEqual(["error.json"]);
    const error = JSON.parse(readFileSync(join(out, "assets", "defects", "wrong-frame-size", "error.json"), "utf8")) as Record<string, string>;
    expect(error).toMatchObject({ format: BAKE_ERROR_FORMAT, id: "defects/wrong-frame-size" });
    expect(error["message"]).toMatch(/19 x 22/);
    expect(error["sourceHash"]).toMatch(/^[0-9a-f]{16}$/);
    expect(existsSync(join(out, "assets", "old"))).toBe(false);

    // A walker has 4 frames in one row; a scene is one frame.
    const walker = JSON.parse(readFileSync(join(out, "assets", "clean", "walker", "atlas.json"), "utf8")) as Atlas;
    expect(walker.sheet).toEqual({ w: 85, h: 24, columns: 4, rows: 1, padding: 1 });
    expect(walker.frames.map((frame) => frame.x)).toEqual([1, 22, 43, 64]);
    expect(walker.clips).toEqual([{ name: "walk", frames: 4, durations: [150, 150, 150, 150], loop: true, start: { default: 0 } }]);
    const scene = JSON.parse(readFileSync(join(out, "assets", "clean", "scene", "atlas.json"), "utf8")) as Atlas;
    expect([scene.kind, scene.sheet.w, scene.sheet.h, scene.frames.length]).toEqual(["scene", 50, 34, 1]);

    // A second bake of everything leaves exactly the same tree.
    const first = snapshot(join(out, "assets"));
    await bakeAll(project);
    expect(snapshot(join(out, "assets"))).toEqual(first);
  });

  it("an asset whose id is not its folder fails with a message that says so", async () => {
    const root = join(temp, "misplaced");
    mkdirSync(join(root, "assets", "wrong", "place"), { recursive: true });
    writeFileSync(
      join(root, "assets", "wrong", "place", "gen.ts"),
      `export { default } from ${JSON.stringify(join(REPO, "assets/examples/blinking-dot/gen.ts"))};\n`,
    );
    const project = openProject({ root });
    const [result] = await bakeAll(project);
    expect(result !== undefined && !result.ok && result.error).toMatch(/its id is "examples\/blinking-dot", but its folder says "wrong\/place"/);
  });

  it("loads the example the same way the tests import it", async () => {
    const loaded = await loadAsset(join(REPO, "assets/examples/blinking-dot/gen.ts"));
    expect(bakeAsset(loaded, { sourceHash: "x" }).atlas.variants.map((variant) => variant.outputHash)).toEqual([OUTPUT[1], OUTPUT[2], OUTPUT[5]]);
  });
});
