// What the player needs from the server beyond the atlas: the preset previews the studio's
// bake renders (server/services/presets.ts), and the slot names of the palette in the index.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { buildSheet, layoutSheet, outputHash, renderAll } from "@whz/asset-kit";
import { bakeAll, decodePng, encodeIndexedPng, findAsset, loadEntry, openProject } from "@whz/asset-kit/node";
import { createAssetIndex } from "../server/services/asset-index.ts";
import { createBakeService } from "../server/services/bake.ts";
import { PRESETS_FORMAT, presetsDir, prunePresets } from "../server/services/presets.ts";
import type { PresetsFile } from "../server/services/presets.ts";
import { FIXTURE_ASSETS, removeTemps, snapshot, tempRoot, writeAsset, writePalette } from "./helpers.ts";

afterAll(removeTemps);

const KIT = fileURLToPath(new URL("../../asset-kit/src/index.ts", import.meta.url));
const PALETTE = fileURLToPath(new URL("../../../assets/palettes/example.json", import.meta.url));

/** A studio bake of the fixture assets into a temp checkout, and the index over it. */
async function bakedFixtures(name: string) {
  const root = tempRoot(name);
  const project = openProject({ root, assets: FIXTURE_ASSETS, out: join(root, "build") });
  const bake = createBakeService({ project, timeoutMs: 20_000 });
  await bake.bakeAll("manual");
  const index = createAssetIndex(project, join(root, ".studio-cache"));
  index.scan();
  return { root, project, bake, index };
}

describe("preset previews", () => {
  it("the studio's bake renders every preset with the first variant seed, as a sheet in the atlas's layout", async () => {
    const { root, project, index } = await bakedFixtures("presets");
    const square = index.get("shapes/square");
    expect(square?.presets).toEqual(["tight"]);
    expect(square?.presetVariants).toEqual([{ name: "tight", sheet: "build/studio/presets/shapes/square/tight.png", outputHash: expect.stringMatching(/^[0-9a-f]{16}$/) as string }]);
    expect(square?.presetError).toBeNull();

    // The sheet is what the kit gives for that preset and seed 1, in the layout of the atlas.
    const asset = await loadEntry(findAsset(project, "shapes/square"));
    const output = renderAll(asset, { seed: 1, preset: "tight" });
    const expected = encodeIndexedPng(buildSheet(output, layoutSheet(asset.meta)), asset.palette.rgba());
    const written = readFileSync(join(root, "build/studio/presets/shapes/square/tight.png"));
    expect(written.equals(expected)).toBe(true);
    expect(square?.presetVariants[0]?.outputHash).toBe(outputHash(output));
    const png = decodePng(written);
    expect([png.w, png.h]).toEqual([square?.sheet?.w, square?.sheet?.h]);
    // The preset draws something else than the default params.
    expect(written.equals(readFileSync(join(root, "build/assets/shapes/square/seed-1.png")))).toBe(false);

    const file = JSON.parse(readFileSync(join(presetsDir(project, "shapes/square"), "presets.json"), "utf8")) as PresetsFile;
    expect(file).toEqual({
      format: PRESETS_FORMAT,
      id: "shapes/square",
      sourceHash: square?.sourceHash,
      paletteHash: square?.palette?.hash,
      seed: 1,
      presets: [{ name: "tight", sheet: "tight.png", outputHash: outputHash(output) }],
      error: null,
    });
  });

  it("writes nothing for an asset without presets or with a failed bake, and leaves build/assets as the command line writes it", async () => {
    const { root, project, index } = await bakedFixtures("presets-none");
    expect(index.get("ground/floor")).toMatchObject({ status: "baked", presets: [], presetVariants: [], presetError: null });
    expect(index.get("shapes/broken")).toMatchObject({ status: "error", presetVariants: [] });
    expect(Object.keys(snapshot(join(root, "build", "studio", "presets"))).sort()).toEqual(["shapes/square/presets.json", "shapes/square/tight.png"]);

    const cli = openProject({ root, assets: FIXTURE_ASSETS, out: join(root, "cli") });
    await bakeAll(cli);
    expect(snapshot(join(project.outDir, "assets"))).toEqual(snapshot(join(cli.outDir, "assets")));
    expect(existsSync(join(cli.outDir, "studio"))).toBe(false);
  });

  it("does not show previews that are from another bake than the atlas on disk", async () => {
    const { project, index } = await bakedFixtures("presets-other");
    const file = join(presetsDir(project, "shapes/square"), "presets.json");
    const content = JSON.parse(readFileSync(file, "utf8")) as PresetsFile;

    writeFileSync(file, JSON.stringify({ ...content, sourceHash: "0000000000000000" }));
    expect(index.scan().find((record) => record.id === "shapes/square")).toMatchObject({ status: "baked", presets: ["tight"], presetVariants: [] });
    writeFileSync(file, JSON.stringify({ ...content, paletteHash: "0000000000000000" }));
    expect(index.scan().find((record) => record.id === "shapes/square")?.presetVariants).toEqual([]);
    writeFileSync(file, "{ half a fi");
    expect(index.scan().find((record) => record.id === "shapes/square")?.presetVariants).toEqual([]);
    writeFileSync(file, JSON.stringify(content));
    expect(index.scan().find((record) => record.id === "shapes/square")?.presetVariants).toHaveLength(1);
  });

  it("a preset that cannot be rendered is an error on the record, and the asset itself is still baked", async () => {
    const root = tempRoot("presets-fail");
    const dir = join(root, "assets/pack/moody");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "gen.ts"),
      [
        `import { defineAsset, IndexedBuffer, parsePalette } from ${JSON.stringify(KIT)};`,
        `import paletteJson from ${JSON.stringify(PALETTE)} with { type: "json" };`,
        `const palette = parsePalette(paletteJson);`,
        `export default defineAsset({`,
        `  id: "pack/moody", kind: "sprite", size: [6, 6], pivot: [3, 5], palette,`,
        `  clips: { idle: { frames: 1, durations: 500 } }, variantSeeds: [3],`,
        `  params: { bad: { type: "bool", default: false, description: "Makes render throw." } },`,
        `  presets: { fine: {}, boom: { bad: true } },`,
        `  render({ params }) {`,
        `    if (params.bad) throw new Error("the boom preset cannot be drawn");`,
        `    return new IndexedBuffer(6, 6).fill(1, 1, 4, 4, palette.ink);`,
        `  },`,
        `});`,
        ``,
      ].join("\n"),
    );
    const project = openProject({ root });
    const run = await createBakeService({ project, timeoutMs: 20_000 }).bakeAll("manual");
    expect(run.items).toMatchObject([{ id: "pack/moody", ok: true }]);
    const index = createAssetIndex(project, join(root, ".studio-cache"));
    const record = index.scan()[0];
    expect(record).toMatchObject({ status: "baked", presets: ["fine", "boom"], presetVariants: [] });
    expect(record?.presetError).toMatch(/the boom preset cannot be drawn/);
    // No half set of sheets is left.
    expect(Object.keys(snapshot(presetsDir(project, "pack/moody")))).toEqual(["presets.json"]);
  });

  it("prunePresets removes the previews of an asset that has no atlas any more, and nothing else", async () => {
    const { root, project, bake } = await bakedFixtures("presets-prune");
    expect(prunePresets(project)).toEqual([]);
    rmSync(join(root, "build/assets/shapes/square"), { recursive: true });
    expect(prunePresets(project)).toEqual(["shapes/square"]);
    expect(existsSync(join(root, "build/studio/presets/shapes"))).toBe(false);

    // A bake run ends with the same sweep: bake the square again, break its atlas, bake another asset.
    await bake.bake(["shapes/square"], "manual");
    expect(existsSync(join(root, "build/studio/presets/shapes/square/tight.png"))).toBe(true);
    rmSync(join(root, "build/assets/shapes/square"), { recursive: true });
    await bake.bake(["ground/floor"], "manual");
    expect(existsSync(join(root, "build/studio/presets/shapes/square"))).toBe(false);
  });
});

describe("the slot names of the palette in the index", () => {
  it("come from the palette file while it is the palette of the bake, and are null once it is not", async () => {
    const root = tempRoot("palette-names");
    const mini = writePalette(root, "mini");
    writeAsset(root, "pack/a", "gold.1", mini);
    const project = openProject({ root });
    await createBakeService({ project, timeoutMs: 20_000 }).bakeAll("manual");
    const index = createAssetIndex(project, join(root, ".studio-cache"));

    const baked = index.scan()[0];
    expect(baked?.palette?.id).toBe("mini");
    expect(baked?.palette?.names).toHaveLength(baked?.palette?.colors.length ?? -1);
    expect(baked?.palette?.names?.slice(0, 5)).toEqual(["transparent", "ink", "ink-deep", "shadow", "white"]);
    expect(baked?.palette?.names?.[9]).toBe("gold.1");

    // The file changed and the asset was not baked with it: its names may not fit the indices.
    writePalette(root, "mini", "#00ff00");
    expect(index.scan()[0]).toMatchObject({ status: "baked", palette: { id: "mini", names: null } });
    rmSync(mini);
    expect(index.scan()[0]?.palette?.names).toBeNull();
  });
});
