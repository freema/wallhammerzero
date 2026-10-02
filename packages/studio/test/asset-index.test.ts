// The asset index: what it reads from assets/ and build/, the four statuses, and the cache file.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openProject } from "@whz/asset-kit/node";
import { createAssetIndex, INDEX_FORMAT, needsBake } from "../server/services/asset-index.ts";
import type { IndexFile } from "../server/services/asset-index.ts";
import { createBakeService } from "../server/services/bake.ts";
import { readConfig } from "../server/services/config.ts";
import { createServices } from "../server/services/index.ts";
import { FIXTURE_ASSETS, removeTemps, tempRoot, writeAsset } from "./helpers.ts";

afterAll(removeTemps);

describe("the index over the fixture assets", () => {
  it("lists every asset as unbaked before a bake, and reads the atlases and the error after it", async () => {
    const root = tempRoot("index");
    const project = openProject({ root, assets: FIXTURE_ASSETS, out: join(root, "build") });
    const index = createAssetIndex(project, join(root, ".studio-cache"));
    expect(index.all()).toEqual([]);

    const before = index.scan();
    expect(before.map((record) => [record.id, record.status, record.kind])).toEqual([
      ["ground/floor", "unbaked", null],
      ["shapes/broken", "unbaked", null],
      ["shapes/square", "unbaked", null],
    ]);
    expect(before.every(needsBake)).toBe(true);
    expect(before[0]).toMatchObject({ pack: "ground", name: "floor", error: null, outputHash: null, variants: [], clips: [], bakedSourceHash: null, bakeDir: "build/assets/ground/floor" });
    expect(before[0]?.sourceHash).toMatch(/^[0-9a-f]{16}$/);

    await createBakeService({ project, timeoutMs: 20_000 }).bakeAll("manual");
    const after = index.scan();
    expect(after.map((record) => [record.id, record.status, record.kind])).toEqual([
      ["ground/floor", "baked", "tiles"],
      ["shapes/broken", "error", null],
      ["shapes/square", "baked", "sprite"],
    ]);
    expect(after.some(needsBake)).toBe(false); // the broken one failed on its current source: baking again changes nothing

    const square = index.get("shapes/square");
    expect(square).toMatchObject({
      id: "shapes/square",
      pack: "shapes",
      name: "square",
      status: "baked",
      error: null,
      kind: "sprite",
      size: [10, 10],
      pivot: [5, 9],
      frameCount: 3,
      clips: [
        { name: "idle", frames: 1, durations: [500], loop: true },
        { name: "pulse", frames: 2, durations: [120, 240], loop: false },
      ],
      facings: ["default"],
      params: { inset: 1 },
      presets: ["tight"],
      bakeDir: "build/assets/shapes/square",
    });
    expect(square?.bakedSourceHash).toBe(square?.sourceHash);
    expect(square?.outputHash).toMatch(/^[0-9a-f]{16}$/);
    expect(square?.palette).toMatchObject({ id: "example" });
    expect(square?.palette?.colors[1]).toBe("#3b2f4a");
    expect(square?.sheet).toMatchObject({ w: 23, h: 23, padding: 1 });
    expect(square?.variants.map((variant) => [variant.seed, variant.sheet, variant.firstFrame])).toEqual([
      [1, "build/assets/shapes/square/seed-1.png", "build/assets/shapes/square/frames/seed-1/idle.default.0.png"],
      [2, "build/assets/shapes/square/seed-2.png", "build/assets/shapes/square/frames/seed-2/idle.default.0.png"],
    ]);
    // The two seeds draw different colours.
    expect(square?.variants[0]?.outputHash).not.toBe(square?.variants[1]?.outputHash);
    for (const variant of square?.variants ?? []) {
      expect(existsSync(join(root, variant.sheet))).toBe(true);
      expect(existsSync(join(root, variant.firstFrame))).toBe(true);
    }

    const broken = index.get("shapes/broken");
    expect(broken).toMatchObject({ status: "error", kind: null, variants: [], outputHash: null });
    expect(broken?.error).toMatch(/the broken fixture always fails: no corners today/);
    expect(broken?.bakedSourceHash).toBe(broken?.sourceHash);
    expect(index.get("shapes/nope")).toBeUndefined();
  });

  it("writes the same records to .studio-cache/index.json", async () => {
    const root = tempRoot("cache");
    writeAsset(root, "pack/one");
    const project = openProject({ root });
    const index = createAssetIndex(project, join(root, ".studio-cache"));
    expect(index.file).toBe(join(root, ".studio-cache", "index.json"));
    expect(existsSync(index.file)).toBe(false);

    index.scan();
    const read = (): IndexFile => JSON.parse(readFileSync(index.file, "utf8")) as IndexFile;
    expect(read()).toEqual({ format: INDEX_FORMAT, assetsDir: "assets", outDir: "build", assets: JSON.parse(JSON.stringify(index.all())) as unknown });
    expect(read().assets[0]).toMatchObject({ id: "pack/one", status: "unbaked", genFile: "assets/pack/one/gen.ts" });

    await createBakeService({ project, timeoutMs: 20_000 }).bakeAll("manual");
    index.scan();
    expect(read().assets[0]).toMatchObject({ id: "pack/one", status: "baked", kind: "sprite" });
    // No temp file is left behind.
    expect(existsSync(`${index.file}.${process.pid}.tmp`)).toBe(false);

    // The cache is derived: without it the next scan writes it again.
    rmSync(join(root, ".studio-cache"), { recursive: true });
    const again = createAssetIndex(project, join(root, ".studio-cache"));
    again.scan();
    expect(read().assets[0]).toMatchObject({ id: "pack/one", status: "baked" });
  });
});

describe("statuses", () => {
  it("turns stale when a source file changes after the bake, and baked again after a re-bake", async () => {
    const root = tempRoot("stale");
    writeAsset(root, "pack/one", "gold.1");
    const project = openProject({ root });
    const index = createAssetIndex(project, join(root, ".studio-cache"));
    const bake = createBakeService({ project, timeoutMs: 20_000 });

    await bake.bakeAll("manual");
    const baked = index.scan()[0];
    expect(baked).toMatchObject({ status: "baked" });

    writeAsset(root, "pack/one", "teal.1");
    const stale = index.scan()[0];
    expect(stale).toMatchObject({ status: "stale", bakedSourceHash: baked?.sourceHash, outputHash: baked?.outputHash });
    expect(stale?.sourceHash).not.toBe(baked?.sourceHash);
    expect(stale !== undefined && needsBake(stale)).toBe(true);

    await bake.bakeAll("manual");
    const fresh = index.scan()[0];
    expect(fresh).toMatchObject({ status: "baked", sourceHash: stale?.sourceHash });
    expect(fresh?.outputHash).not.toBe(baked?.outputHash);
  });

  it("asks for a new bake of a failed asset only after its source changed", () => {
    const root = tempRoot("failed");
    writeAsset(root, "pack/one");
    const project = openProject({ root });
    const index = createAssetIndex(project, join(root, ".studio-cache"));
    const source = index.scan()[0]?.sourceHash ?? "";
    const dir = join(root, "build", "assets", "pack", "one");
    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, "error.json"), JSON.stringify({ format: "wz.bake-error/1", id: "pack/one", sourceHash: source, message: "it broke" }));
    const same = index.scan()[0];
    expect(same).toMatchObject({ status: "error", error: "it broke", bakedSourceHash: source });
    expect(same !== undefined && needsBake(same)).toBe(false);

    writeFileSync(join(dir, "error.json"), JSON.stringify({ format: "wz.bake-error/1", id: "pack/one", sourceHash: "0000000000000000", message: "it broke" }));
    const edited = index.scan()[0];
    expect(edited !== undefined && needsBake(edited)).toBe(true);
  });

  it("shows output it cannot read as an error instead of failing the scan", () => {
    const root = tempRoot("garbage");
    writeAsset(root, "pack/half");
    writeAsset(root, "pack/other");
    writeAsset(root, "pack/fine");
    const project = openProject({ root });
    const index = createAssetIndex(project, join(root, ".studio-cache"));
    for (const [name, text] of [["half", '{"format": "wz.atlas/1", "id"'], ["other", '{"format":"something/9"}']] as const) {
      mkdirSync(join(root, "build", "assets", "pack", name), { recursive: true });
      writeFileSync(join(root, "build", "assets", "pack", name, "atlas.json"), text);
    }
    const records = index.scan();
    expect(records.map((record) => [record.id, record.status])).toEqual([
      ["pack/fine", "unbaked"],
      ["pack/half", "error"],
      ["pack/other", "error"],
    ]);
    expect(index.get("pack/half")?.error).toMatch(/^cannot read the output in build\/assets\/pack\/half: /);
    expect(index.get("pack/other")?.error).toBe("build/assets/pack/other/atlas.json is not a wz.atlas/1 file");
  });

  it("refresh() scans again only when the last scan is older than the given age", () => {
    const root = tempRoot("refresh");
    writeAsset(root, "pack/one");
    const index = createAssetIndex(openProject({ root }), join(root, ".studio-cache"));
    expect(index.refresh().map((record) => record.id)).toEqual(["pack/one"]);
    writeAsset(root, "pack/two");
    expect(index.refresh(60_000).map((record) => record.id)).toEqual(["pack/one"]);
    expect(index.refresh(0).map((record) => record.id)).toEqual(["pack/one", "pack/two"]);
  });
});

describe("createServices", () => {
  it("scans on start, bakes what has no current output, and serves only the output folder", async () => {
    const root = tempRoot("services");
    writeAsset(root, "pack/one");
    writeFileSync(join(root, "top-secret.txt"), "x");
    const services = createServices(readConfig({ WHZ_STUDIO_ROOT: root }));
    services.start();
    expect(services.index.all().map((record) => record.status)).toEqual(["unbaked"]);
    // The start bake is queued; wait for it through the queue.
    const run = await services.bake.bake([], "manual");
    expect(run.number).toBe(2);
    expect(services.bake.state().last?.number).toBe(2);
    expect(services.index.all().map((record) => record.status)).toEqual(["baked"]);

    expect(services.files.resolve("build/assets/pack/one/atlas.json").ok).toBe(true);
    expect(services.files.resolve("top-secret.txt")).toMatchObject({ ok: false, reason: "forbidden" });
    expect(services.files.resolve("assets/pack/one/gen.ts")).toMatchObject({ ok: false, reason: "forbidden" });
    await services.close();
  });

  it("does not bake on start when that is switched off", () => {
    const root = tempRoot("no-bake");
    writeAsset(root, "pack/one");
    const services = createServices(readConfig({ WHZ_STUDIO_ROOT: root, WHZ_STUDIO_BAKE_ON_START: "0" }));
    services.start();
    expect(services.bake.state()).toEqual({ running: null, queued: 0, last: null });
    expect(services.index.all().map((record) => record.status)).toEqual(["unbaked"]);
  });
});
