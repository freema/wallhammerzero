// The bake service: the worker gives the files of the command line, a failing asset and a
// hanging one do not stop the others, and runs are queued.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BAKE_ERROR_FORMAT, bakeAll, findAsset, openProject, sourceHash } from "@whz/asset-kit/node";
import { createBakeService } from "../server/services/bake.ts";
import type { BakeRun } from "../server/services/bake.ts";
import { FIXTURE_ASSETS, HANG_ASSETS, removeTemps, snapshot, tempRoot, writeAsset } from "./helpers.ts";

afterAll(removeTemps);

describe("bakeAll in the worker", () => {
  it("bakes every asset, reports the one that throws, and writes exactly the files of the bake command", async () => {
    const root = tempRoot("bake");
    const project = openProject({ root, assets: FIXTURE_ASSETS, out: join(root, "build") });
    const seen: BakeRun[] = [];
    const bake = createBakeService({ project, timeoutMs: 20_000, onRun: (run) => seen.push(run) });
    expect(bake.state()).toEqual({ running: null, queued: 0, last: null });

    const run = await bake.bakeAll("manual");
    expect(run).toMatchObject({ number: 1, reason: "manual", all: true, pruned: [] });
    expect(run.items.map((item) => [item.id, item.ok, item.timedOut])).toEqual([
      ["ground/floor", true, false],
      ["shapes/broken", false, false],
      ["shapes/square", true, false],
    ]);
    expect(run.items[1]?.error).toMatch(/the broken fixture always fails: no corners today/);
    expect(run.items[0]?.error).toBeNull();
    expect(seen).toEqual([run]);
    expect(bake.state()).toEqual({ running: null, queued: 0, last: run });

    // The failed asset has only error.json; the others have an atlas.
    expect(readdirSync(join(root, "build", "assets", "shapes", "broken"))).toEqual(["error.json"]);
    expect(existsSync(join(root, "build", "assets", "shapes", "square", "atlas.json"))).toBe(true);
    expect(existsSync(join(root, "build", "assets", "ground", "floor", "seed-1.png"))).toBe(true);

    // The same bake through the library in this process (what `asset bake --all` runs).
    const direct = openProject({ root, assets: FIXTURE_ASSETS, out: join(root, "direct") });
    await bakeAll(direct);
    expect(snapshot(join(root, "build", "assets"))).toEqual(snapshot(join(root, "direct", "assets")));
  });

  it("removes the output of an asset that is gone, and sees an edited program on the next run", async () => {
    const root = tempRoot("rebake");
    const file = writeAsset(root, "pack/one", "gold.1");
    writeAsset(root, "pack/two");
    const project = openProject({ root });
    const bake = createBakeService({ project, timeoutMs: 20_000 });
    mkdirSync(join(root, "build", "assets", "old", "gone"), { recursive: true });
    writeFileSync(join(root, "build", "assets", "old", "gone", "atlas.json"), "{}");

    const first = await bake.bakeAll("start");
    expect(first.items.map((item) => item.ok)).toEqual([true, true]);
    expect(first.pruned).toEqual(["old/gone"]);
    expect(existsSync(join(root, "build", "assets", "old"))).toBe(false);
    const atlas = (): { sourceHash: string; variants: { outputHash: string }[] } =>
      JSON.parse(readFileSync(join(root, "build", "assets", "pack", "one", "atlas.json"), "utf8")) as { sourceHash: string; variants: { outputHash: string }[] };
    const before = atlas();

    // Another colour: a new worker loads the edited file (the first worker's module cache is gone).
    writeAsset(root, "pack/one", "teal.1");
    expect(readFileSync(file, "utf8")).toContain("teal.1");
    const second = await bake.bake(["pack/one"], "manual");
    expect(second).toMatchObject({ number: 2, all: false, pruned: [] });
    expect(second.items.map((item) => [item.id, item.ok])).toEqual([["pack/one", true]]);
    const after = atlas();
    expect(after.sourceHash).not.toBe(before.sourceHash);
    expect(after.variants[0]?.outputHash).not.toBe(before.variants[0]?.outputHash);
  });

  it("fails an id that is not an asset, without touching the disk", async () => {
    const root = tempRoot("unknown");
    writeAsset(root, "pack/one");
    const bake = createBakeService({ project: openProject({ root }), timeoutMs: 20_000 });
    const run = await bake.bake(["pack/nope", "pack/one"], "manual");
    expect(run.items.map((item) => [item.id, item.ok])).toEqual([
      ["pack/nope", false],
      ["pack/one", true],
    ]);
    expect(run.items[0]?.error).toMatch(/no asset "pack\/nope"/);
    expect(existsSync(join(root, "build", "assets", "pack", "nope"))).toBe(false);
  });
});

describe("the timeout", () => {
  it("stops a generator that never returns, leaves an error.json for it, and bakes the assets after it", async () => {
    const root = tempRoot("hang");
    const project = openProject({ root, assets: HANG_ASSETS, out: join(root, "build") });
    const bake = createBakeService({ project, timeoutMs: 4000 });
    const started = performance.now();
    const run = await bake.bakeAll("manual");
    const took = performance.now() - started;

    expect(run.items.map((item) => [item.id, item.ok, item.timedOut])).toEqual([
      ["loops/a-before", true, false],
      ["loops/forever", false, true],
      ["loops/z-after", true, false],
    ]);
    expect(run.items[1]?.error).toBe("the bake did not finish in 4000 ms and was stopped (a generator that never returns?)");
    expect(took).toBeGreaterThan(3900);

    expect(readdirSync(join(root, "build", "assets", "loops", "forever"))).toEqual(["error.json"]);
    const error = JSON.parse(readFileSync(join(root, "build", "assets", "loops", "forever", "error.json"), "utf8")) as Record<string, string>;
    expect(error).toEqual({
      format: BAKE_ERROR_FORMAT,
      id: "loops/forever",
      sourceHash: sourceHash(findAsset(project, "loops/forever")),
      message: "the bake did not finish in 4000 ms and was stopped (a generator that never returns?)",
    });
    expect(existsSync(join(root, "build", "assets", "loops", "a-before", "atlas.json"))).toBe(true);
    expect(existsSync(join(root, "build", "assets", "loops", "z-after", "atlas.json"))).toBe(true);
  });
});

describe("the queue", () => {
  it("runs one bake at a time, in the order asked, and shows the run in flight", async () => {
    const root = tempRoot("queue");
    writeAsset(root, "pack/one");
    writeAsset(root, "pack/two");
    const order: number[] = [];
    const bake = createBakeService({ project: openProject({ root }), timeoutMs: 20_000, onRun: (run) => order.push(run.number) });

    const first = bake.bakeAll("manual");
    const second = bake.bake(["pack/two"], "manual");
    expect(bake.state().queued).toBe(2);
    await Promise.resolve();
    await Promise.resolve();
    // The first run has started and the second waits.
    expect(bake.state().running).toMatchObject({ reason: "manual", total: 2 });
    expect(bake.state().queued).toBe(1);

    const runs = await Promise.all([first, second]);
    expect(runs.map((run) => run.number)).toEqual([1, 2]);
    expect(runs.map((run) => run.items.length)).toEqual([2, 1]);
    expect(order).toEqual([1, 2]);
    expect(bake.state()).toMatchObject({ running: null, queued: 0, last: { number: 2 } });
  });

  it("close() stops a run in flight and blames no asset", async () => {
    const root = tempRoot("close");
    const project = openProject({ root, assets: HANG_ASSETS, out: join(root, "build") });
    const bake = createBakeService({ project, timeoutMs: 60_000 });
    const run = bake.bake(["loops/forever"], "manual");
    await new Promise((done) => setTimeout(done, 1500));
    await bake.close();
    expect((await run).items).toEqual([]);
    expect(existsSync(join(root, "build", "assets", "loops", "forever", "error.json"))).toBe(false);
  });
});
