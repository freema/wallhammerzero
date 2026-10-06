// Live reload, from a file written under assets/ to the events the pages get: the services of
// a studio over a temp checkout, with the real watcher, the real bake worker and the real hub.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openProject } from "@whz/asset-kit/node";
import { createBakeService } from "../server/services/bake.ts";
import { readConfig } from "../server/services/config.ts";
import { createServices } from "../server/services/index.ts";
import type { AssetRecord, AssetsEvent, StudioServices } from "../server/services/index.ts";
import { paletteOf, toBake } from "../server/services/live.ts";
import { removeTemps, snapshot, tempRoot, waitFor, writeAsset, writeHangingAsset, writePalette } from "./helpers.ts";

const open: StudioServices[] = [];
afterAll(async () => {
  for (const services of open) await services.close();
  removeTemps();
});

/** A studio's services over `root`, started, with everything it publishes on the assets topic collected. */
function studio(root: string, env: Record<string, string> = {}): { services: StudioServices; events: AssetsEvent[] } {
  const services = createServices(readConfig({ WHZ_STUDIO_ROOT: root, WHZ_STUDIO_WATCH_POLL_MS: "40", ...env }), { debounceMs: 60 });
  open.push(services);
  const events: AssetsEvent[] = [];
  services.events.subscribe((event) => events.push(event.data as AssetsEvent), { topics: ["assets"] });
  services.start();
  return { services, events };
}

/** Waits until the start bake (if any) and every batch seen so far are done. */
async function quiet(services: StudioServices): Promise<void> {
  await waitFor("no bake in flight", () => services.bake.state().running === null && services.bake.state().queued === 0);
  await services.live.idle();
}

const changedIds = (events: readonly AssetsEvent[]): string[][] => events.flatMap((event) => (event.type === "changed" ? [event.changed.map((record) => `${record.id}:${record.status}`)] : []));

describe("which assets a batch re-bakes", () => {
  const record = (id: string, status: AssetRecord["status"], palette: string | null, sameSource = true): AssetRecord =>
    ({ id, status, sourceHash: "aaaa", bakedSourceHash: status === "unbaked" ? null : sameSource ? "aaaa" : "bbbb", palette: palette === null ? null : { id: palette, hash: "", colors: [] } }) as unknown as AssetRecord;
  const records = [
    record("p/baked-example", "baked", "example"),
    record("p/baked-other", "baked", "other"),
    record("p/stale", "stale", "example", false),
    record("p/unbaked", "unbaked", null),
    record("p/failed-on-this-source", "error", null),
    record("p/failed-on-older-source", "error", null, false),
  ];

  it("a change of asset files: the assets whose output is not from their current source", () => {
    expect(toBake(records, ["p/stale/gen.ts"])).toEqual(["p/stale", "p/unbaked", "p/failed-on-older-source"]);
    // Also when the changed path is not source at all: what needs a bake gets one.
    expect(toBake(records, ["p/baked-example/review.json"])).toEqual(["p/stale", "p/unbaked", "p/failed-on-older-source"]);
  });

  it("a changed palette: also the assets drawn with it, and the ones whose last bake failed", () => {
    expect(toBake(records, ["palettes/other.json"])).toEqual(["p/baked-other", "p/stale", "p/unbaked", "p/failed-on-this-source", "p/failed-on-older-source"]);
    expect(toBake(records, ["palettes/example.json"])).toContain("p/baked-example");
    expect(toBake(records, ["palettes/example.json"])).not.toContain("p/baked-other");
  });

  it("reads the palette id from the path, and from nothing else", () => {
    expect(paletteOf("palettes/example.json")).toBe("example");
    expect(paletteOf("palettes/sub/example.json")).toBeNull();
    expect(paletteOf("pack/palettes/example.json")).toBeNull();
    expect(paletteOf("palettes/example.txt")).toBeNull();
  });
});

describe("live reload", () => {
  it("an edited generator is re-baked alone, and the pages are told: writing, stale, the bake, baked, done", async () => {
    const root = tempRoot("live-edit");
    writeAsset(root, "pack/one", "gold.1");
    writeAsset(root, "pack/two", "gold.1");
    const { services, events } = studio(root);
    await quiet(services);
    expect(services.index.all().map((record) => record.status)).toEqual(["baked", "baked"]);
    const before = { one: services.index.get("pack/one") as AssetRecord, two: services.index.get("pack/two") as AssetRecord, run: services.bake.state().last?.number };
    events.length = 0;

    writeAsset(root, "pack/one", "red.1");
    await waitFor("pack/one baked again", () => services.index.get("pack/one")?.outputHash !== before.one.outputHash && services.index.get("pack/one")?.status === "baked");
    await quiet(services);

    // One run, for the one asset, because a file changed.
    const run = services.bake.state().last;
    expect(run).toMatchObject({ number: (before.run ?? 0) + 1, reason: "watch", all: false });
    expect(run?.items.map((item) => [item.id, item.ok])).toEqual([["pack/one", true]]);
    // The other asset was not touched: the same record object, never in an event.
    expect(services.index.get("pack/two")).toBe(before.two);
    expect(changedIds(events)).toEqual([["pack/one:stale"], ["pack/one:baked"]]);

    // The order the pages see.
    const order = events.map((event) => (event.type === "activity" ? `writing:${event.writing}` : event.type === "bake" ? (event.running === null ? "bake:end" : `bake:${event.running.done}/${event.running.total}`) : `changed:${event.changed[0]?.status}`));
    expect(order[0]).toBe("writing:true");
    expect(order.at(-1)).toBe("writing:false");
    expect(order.indexOf("changed:stale")).toBeLessThan(order.indexOf("bake:0/1"));
    expect(order.indexOf("bake:1/1")).toBeLessThan(order.indexOf("changed:baked"));
    expect(order.indexOf("changed:baked")).toBeLessThan(order.indexOf("bake:end"));
    expect(order.filter((entry) => entry.startsWith("writing"))).toEqual(["writing:true", "writing:false"]);

    // The event carries the whole new record and the revision of the index after it.
    const last = events.filter((event) => event.type === "changed").at(-1);
    expect(last).toMatchObject({ type: "changed", revision: services.index.revision, added: [], removed: [] });
    expect(last?.type === "changed" && last.changed[0]).toEqual(services.index.get("pack/one"));
    expect(services.live.state()).toEqual({ writing: false, running: null, revision: services.index.revision, watching: true });
  });

  it("a burst of 50 new assets is one batch and one bake run, and the output is that of a fresh bake of everything", async () => {
    const root = tempRoot("live-burst");
    writeAsset(root, "pack/first");
    const { services, events } = studio(root);
    await quiet(services);
    const runsBefore = services.bake.state().last?.number ?? 0;
    events.length = 0;

    const slots = ["gold.0", "gold.1", "gold.2", "red.0", "red.1"];
    const ids = Array.from({ length: 50 }, (_, i) => `burst/a${String(i).padStart(2, "0")}`);
    ids.forEach((id, i) => writeAsset(root, id, slots[i % slots.length]));
    await waitFor("the 50 assets baked", () => services.index.all().length === 51 && services.index.all().every((record) => record.status === "baked"));
    await quiet(services);

    const run = services.bake.state().last;
    expect(run?.number).toBe(runsBefore + 1);
    expect(run).toMatchObject({ reason: "watch" });
    expect(run?.items.map((item) => item.id)).toEqual(ids);
    expect(run?.items.every((item) => item.ok)).toBe(true);
    expect(events.filter((event) => event.type === "activity")).toEqual([{ type: "activity", writing: true }, { type: "activity", writing: false }]);
    // The pages heard of all 50 at once, as new assets.
    const added = events.flatMap((event) => (event.type === "changed" && event.added.length > 0 ? [event.added] : []));
    expect(added).toEqual([ids]);

    // A fresh bake of the same assets into another folder gives the same files.
    const fresh = openProject({ root, out: join(root, "fresh") });
    const freshRun = await createBakeService({ project: fresh, timeoutMs: 60_000 }).bakeAll("manual");
    expect(freshRun.items).toHaveLength(51);
    expect(snapshot(join(root, "build", "assets"))).toEqual(snapshot(join(root, "fresh", "assets")));
  });

  it("a generator that loops forever is stopped by the timeout and becomes an error record; the studio keeps re-baking the others", async () => {
    const root = tempRoot("live-hang");
    writeAsset(root, "pack/fine", "gold.1");
    const { services, events } = studio(root, { WHZ_STUDIO_BAKE_TIMEOUT_MS: "1500" });
    await quiet(services);
    events.length = 0;

    writeHangingAsset(root, "pack/forever");
    await waitFor("the hanging asset is an error", () => services.index.get("pack/forever")?.status === "error");
    await quiet(services);
    const hung = services.index.get("pack/forever");
    expect(hung?.error).toBe("the bake did not finish in 1500 ms and was stopped (a generator that never returns?)");
    expect(services.bake.state().last?.items).toMatchObject([{ id: "pack/forever", ok: false, timedOut: true }]);
    expect(changedIds(events).at(-1)).toEqual(["pack/forever:error"]);

    // The studio is still there: another edit is re-baked, and the hung asset is not tried again.
    const before = services.index.get("pack/fine")?.outputHash;
    writeAsset(root, "pack/fine", "red.1");
    await waitFor("pack/fine baked again", () => services.index.get("pack/fine")?.outputHash !== before && services.index.get("pack/fine")?.status === "baked");
    await quiet(services);
    expect(services.bake.state().last?.items.map((item) => [item.id, item.ok])).toEqual([["pack/fine", true]]);
    expect(services.index.get("pack/forever")?.status).toBe("error");

    // Fixing the generator fixes the card.
    writeAsset(root, "pack/forever", "gold.2");
    await waitFor("the fixed asset is baked", () => services.index.get("pack/forever")?.status === "baked");
    await quiet(services);
    expect(services.index.get("pack/forever")?.error).toBeNull();
  });

  it("a changed palette re-bakes the assets drawn with it, and no others", async () => {
    const root = tempRoot("live-palette");
    const mini = writePalette(root, "mini");
    writeAsset(root, "pack/with-mini", "gold.1", mini);
    writeAsset(root, "pack/with-example", "gold.1");
    const { services } = studio(root);
    await quiet(services);
    const before = { mini: services.index.get("pack/with-mini") as AssetRecord, example: services.index.get("pack/with-example") as AssetRecord };
    expect(before.mini.palette?.id).toBe("mini");

    writePalette(root, "mini", "#00ff00");
    await waitFor("the palette of pack/with-mini changed", () => services.index.get("pack/with-mini")?.palette?.hash !== before.mini.palette?.hash);
    await quiet(services);
    expect(services.bake.state().last).toMatchObject({ reason: "watch" });
    expect(services.bake.state().last?.items.map((item) => item.id)).toEqual(["pack/with-mini"]);
    const after = services.index.get("pack/with-mini") as AssetRecord;
    expect(after.palette?.colors).toContain("#00ff00");
    // The same indices were drawn (the output hash is over indices), in other colours.
    expect(after.outputHash).toBe(before.mini.outputHash);
    expect(services.index.get("pack/with-example")).toBe(before.example);
  });

  it("a changed stamp file re-bakes its asset, and no others: stamps are in the asset's own folder", async () => {
    const root = tempRoot("live-stamp");
    writeAsset(root, "pack/stamped");
    writeAsset(root, "pack/other");
    mkdirSync(join(root, "assets/pack/stamped/stamps"));
    writeFileSync(join(root, "assets/pack/stamped/stamps/dot.txt"), ".w.\n");
    const { services } = studio(root);
    await quiet(services);
    const before = { stamped: services.index.get("pack/stamped") as AssetRecord, other: services.index.get("pack/other") as AssetRecord };
    expect(before.stamped.status).toBe("baked");

    writeFileSync(join(root, "assets/pack/stamped/stamps/dot.txt"), "www\n");
    await waitFor("pack/stamped is baked from the new stamp", () => {
      const now = services.index.get("pack/stamped");
      return now?.status === "baked" && now.sourceHash !== before.stamped.sourceHash;
    });
    await quiet(services);
    expect(services.bake.state().last).toMatchObject({ reason: "watch" });
    expect(services.bake.state().last?.items.map((item) => item.id)).toEqual(["pack/stamped"]);
    expect(services.index.get("pack/other")).toBe(before.other);
  });

  it("a removed asset leaves the index and its output is removed; a file that is not source changes nothing", async () => {
    const root = tempRoot("live-remove");
    writeAsset(root, "pack/stays");
    writeAsset(root, "pack/goes");
    const { services, events } = studio(root);
    await quiet(services);
    const runs = services.bake.state().last?.number;
    events.length = 0;

    writeFileSync(join(root, "assets/pack/stays/notes.md"), "not source");
    await waitFor("the note was seen", () => events.some((event) => event.type === "activity" && !event.writing));
    await quiet(services);
    expect(events.filter((event) => event.type !== "activity")).toEqual([]);
    expect(services.bake.state().last?.number).toBe(runs);

    rmSync(join(root, "assets/pack/goes"), { recursive: true });
    await waitFor("pack/goes left the index", () => services.index.get("pack/goes") === undefined);
    await quiet(services);
    expect(events.filter((event) => event.type === "changed")).toEqual([{ type: "changed", revision: services.index.revision, changed: [], added: [], removed: ["pack/goes"] }]);
    expect(Object.keys(snapshot(join(root, "build", "assets"))).some((path) => path.startsWith("pack/goes/"))).toBe(false);
    expect(Object.keys(snapshot(join(root, "build", "assets"))).some((path) => path.startsWith("pack/stays/"))).toBe(true);
  });

  it("the output of a removed asset is removed also when a page load scanned the index before the watcher's batch", async () => {
    const root = tempRoot("live-remove-scanned");
    writeAsset(root, "pack/stays");
    writeAsset(root, "pack/goes");
    const { services } = studio(root);
    await quiet(services);
    const outputOf = (id: string): boolean => Object.keys(snapshot(join(root, "build", "assets"))).some((path) => path.startsWith(`${id}/`));
    expect(outputOf("pack/goes")).toBe(true);

    rmSync(join(root, "assets/pack/goes"), { recursive: true });
    services.index.scan(); // what a loader does
    expect(services.index.get("pack/goes")).toBeUndefined();
    await waitFor("the output of pack/goes is removed", () => !outputOf("pack/goes"));
    await quiet(services);
    expect(outputOf("pack/stays")).toBe(true);
  });

  it("with WHZ_STUDIO_WATCH=0 nothing is watched, and a bake asked for by hand is still published", async () => {
    const root = tempRoot("live-off");
    writeAsset(root, "pack/one");
    const { services, events } = studio(root, { WHZ_STUDIO_WATCH: "0", WHZ_STUDIO_BAKE_ON_START: "0" });
    expect(services.live.watcher).toBeNull();
    expect(services.live.state()).toMatchObject({ watching: false, writing: false });
    expect(services.index.get("pack/one")?.status).toBe("unbaked");

    writeAsset(root, "pack/one", "red.1");
    await new Promise((done) => setTimeout(done, 500));
    expect(services.bake.state().last).toBeNull();
    expect(events.filter((event) => event.type === "activity")).toEqual([]);

    events.length = 0;
    await services.bake.bakeAll("manual");
    expect(changedIds(events)).toEqual([["pack/one:baked"]]);
    expect(events.at(-1)).toEqual({ type: "bake", running: null });
  });
});
