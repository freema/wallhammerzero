// The watcher: snapshots and their difference, the batcher's timing (with the time passed in,
// so nothing here depends on how fast the machine is), and the real thing over a temp folder.

import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createBatcher, createWatcher, diffSnapshots, isIgnored, takeSnapshot } from "../server/services/watcher.ts";
import type { Watcher } from "../server/services/watcher.ts";
import { removeTemps, tempRoot } from "./helpers.ts";

const watchers: Watcher[] = [];
afterAll(() => {
  for (const watcher of watchers) watcher.close();
  removeTemps();
});

describe("snapshots", () => {
  it("list every file by its path, without dot files, temp files and node_modules", () => {
    const dir = tempRoot("snapshot");
    mkdirSync(join(dir, "pack/one/stamps"), { recursive: true });
    mkdirSync(join(dir, "pack/node_modules/x"), { recursive: true });
    mkdirSync(join(dir, ".hidden"), { recursive: true });
    for (const path of ["pack/one/gen.ts", "pack/one/stamps/face.txt", "palettes.json", ".hidden/a.ts", "pack/node_modules/x/index.js", "pack/one/.gen.ts.swp", "pack/one/gen.ts~", "pack/one/gen.ts.123.tmp", "pack/.tmp-gen"]) {
      writeFileSync(join(dir, path), "x");
    }
    expect([...takeSnapshot(dir).keys()].sort()).toEqual(["pack/one/gen.ts", "pack/one/stamps/face.txt", "palettes.json"]);
    expect(takeSnapshot(join(dir, "no-such-folder")).size).toBe(0);
    expect([".git", ".DS_Store", "node_modules", "a~", "a.tmp", "a.swp"].every(isIgnored)).toBe(true);
    expect(["gen.ts", "tmp", "review.json"].some(isIgnored)).toBe(false);
  });

  it("differ by the files that were added, removed or changed", () => {
    const before = new Map([["a", "1:1"], ["b", "1:1"], ["c", "1:1"]]);
    const after = new Map([["a", "1:1"], ["b", "2:1"], ["d", "1:1"]]);
    expect(diffSnapshots(before, after)).toEqual(["b", "c", "d"]);
    expect(diffSnapshots(before, before)).toEqual([]);
  });

  it("see a file that was appended to, replaced by a rename, and removed", () => {
    const dir = tempRoot("snapshot-changes");
    writeFileSync(join(dir, "a.ts"), "one");
    writeFileSync(join(dir, "b.ts"), "one");
    writeFileSync(join(dir, "c.ts"), "one");
    const before = takeSnapshot(dir);
    appendFileSync(join(dir, "a.ts"), " and more");
    writeFileSync(join(dir, ".tmp-b"), "replaced, longer");
    renameSync(join(dir, ".tmp-b"), join(dir, "b.ts"));
    rmSync(join(dir, "c.ts"));
    expect(diffSnapshots(before, takeSnapshot(dir))).toEqual(["a.ts", "b.ts", "c.ts"]);
  });
});

describe("the batcher", () => {
  const options = { debounceMs: 200, maxWaitMs: 1000 };

  it("holds a change back until nothing changed for the debounce time, then releases one sorted batch", () => {
    const batcher = createBatcher(options);
    expect(batcher.take(0)).toBeNull();
    batcher.note(["b"], 1000);
    expect(batcher.take(1000)).toBeNull();
    expect(batcher.take(1199)).toBeNull();
    batcher.note(["a"], 1150); // a second file of the burst: the wait starts again
    expect(batcher.take(1349)).toBeNull();
    expect(batcher.size).toBe(2);
    expect(batcher.take(1350)).toEqual(["a", "b"]);
    expect(batcher.size).toBe(0);
    expect(batcher.take(5000)).toBeNull();
  });

  it("a file written in pieces is one path in one batch", () => {
    const batcher = createBatcher(options);
    for (const at of [0, 50, 100, 150, 180]) batcher.note(["gen.ts"], at);
    expect(batcher.take(379)).toBeNull();
    expect(batcher.take(380)).toEqual(["gen.ts"]);
  });

  it("a burst of 50 files is one batch", () => {
    const batcher = createBatcher(options);
    const paths = Array.from({ length: 50 }, (_, i) => `pack/a${String(i).padStart(2, "0")}/gen.ts`);
    paths.forEach((path, i) => batcher.note([path], i * 3));
    expect(batcher.take(147 + 199)).toBeNull();
    expect(batcher.take(147 + 200)).toEqual(paths);
  });

  it("releases after the maximum wait even while files keep changing", () => {
    const batcher = createBatcher(options);
    for (let at = 0; at < 1000; at += 100) {
      batcher.note([`f${at}`], at);
      expect(batcher.take(at + 50)).toBeNull();
    }
    expect(batcher.take(1000)).toHaveLength(10);
    // The next change starts a new batch with its own clock.
    batcher.note(["late"], 1010);
    expect(batcher.take(1100)).toBeNull();
    expect(batcher.take(1210)).toEqual(["late"]);
  });

  it("drop() forgets a path the studio wrote itself", () => {
    const batcher = createBatcher(options);
    batcher.note(["mine", "theirs"], 0);
    batcher.drop("mine");
    expect(batcher.take(200)).toEqual(["theirs"]);
    batcher.note(["mine"], 300);
    batcher.drop("mine");
    expect(batcher.take(10_000)).toBeNull();
  });
});

/** A watcher over a new temp folder that collects its batches. Short times: the tests wait on `idle()`, not on a clock. */
function watched(name: string, extra: { native?: boolean; onBatch?: (paths: readonly string[]) => void | Promise<void> } = {}) {
  const dir = tempRoot(name);
  const batches: string[][] = [];
  const activity: boolean[] = [];
  const watcher = createWatcher({
    dir,
    debounceMs: 60,
    maxWaitMs: 2000,
    pollMs: 40,
    native: extra.native ?? true,
    onActivity: (writing) => activity.push(writing),
    onBatch: async (paths) => {
      batches.push([...paths]);
      await extra.onBatch?.(paths);
    },
  });
  watchers.push(watcher);
  return { dir, batches, activity, watcher };
}

/** Waits until the watcher has seen and handled everything, and at least `count` batches came. */
async function settled(target: { batches: string[][]; watcher: Watcher }, count: number): Promise<void> {
  for (let i = 0; i < 1000 && target.batches.length < count; i += 1) await new Promise((done) => setTimeout(done, 10));
  await target.watcher.idle();
}

describe("the watcher over a real folder", () => {
  it("does not report what was there when it started", async () => {
    const target = watched("start");
    writeFileSync(join(target.dir, "old.ts"), "x");
    target.watcher.start();
    await new Promise((done) => setTimeout(done, 300));
    expect(target.batches).toEqual([]);
    expect(target.watcher.writing()).toBe(false);
  });

  it.each([[true], [false]])("reports a burst of 50 new files in new folders as one batch (native events: %s)", async (native) => {
    const target = watched(`burst-${native}`, { native });
    target.watcher.start();
    const paths: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      const path = `pack/a${String(i).padStart(2, "0")}/gen.ts`;
      mkdirSync(join(target.dir, path, ".."), { recursive: true });
      writeFileSync(join(target.dir, path), `// ${i}`);
      paths.push(path);
    }
    await settled(target, 1);
    expect(target.batches).toEqual([paths]);
    // Writing was announced once, and called off once everything was handled.
    expect(target.activity).toEqual([true, false]);
  });

  it("reports a change, a replacement by rename and a removal, each with the path of the file", async () => {
    const target = watched("kinds");
    for (const name of ["a.ts", "b.ts", "c.ts"]) writeFileSync(join(target.dir, name), "one");
    target.watcher.start();
    appendFileSync(join(target.dir, "a.ts"), " more");
    writeFileSync(join(target.dir, ".tmp-b"), "another text");
    renameSync(join(target.dir, ".tmp-b"), join(target.dir, "b.ts"));
    rmSync(join(target.dir, "c.ts"));
    await settled(target, 1);
    expect(target.batches).toEqual([["a.ts", "b.ts", "c.ts"]]);
  });

  it("what changes while a batch is being handled becomes the next batch, and no handler runs beside another", async () => {
    let inFlight = 0;
    let overlap = false;
    let release: () => void = () => undefined;
    const target = watched("serial", {
      onBatch: async (paths) => {
        inFlight += 1;
        if (inFlight > 1) overlap = true;
        if (paths.includes("first.ts")) {
          await new Promise<void>((done) => (release = done));
        }
        inFlight -= 1;
      },
    });
    target.watcher.start();
    writeFileSync(join(target.dir, "first.ts"), "x");
    for (let i = 0; i < 1000 && target.batches.length < 1; i += 1) await new Promise((done) => setTimeout(done, 10));
    expect(target.batches).toEqual([["first.ts"]]);
    // The first batch is still being handled. Two more files change meanwhile.
    writeFileSync(join(target.dir, "second.ts"), "x");
    writeFileSync(join(target.dir, "third.ts"), "x");
    await new Promise((done) => setTimeout(done, 400));
    expect(target.batches).toHaveLength(1);
    expect(target.watcher.writing()).toBe(true);
    release();
    await settled(target, 2);
    expect(target.batches).toEqual([["first.ts"], ["second.ts", "third.ts"]]);
    expect(overlap).toBe(false);
    expect(target.activity).toEqual([true, false]);
  });

  it("echo suppression: a file the studio wrote itself and named with wrote() is not reported; a later change by someone else is", async () => {
    const target = watched("echo");
    mkdirSync(join(target.dir, "pack/one"), { recursive: true });
    writeFileSync(join(target.dir, "pack/one/gen.ts"), "x");
    target.watcher.start();

    const review = join(target.dir, "pack/one/review.json");
    writeFileSync(review, '{"verdict":"approved"}');
    target.watcher.wrote([review]);
    writeFileSync(join(target.dir, "pack/one/note.txt"), "by the studio too");
    target.watcher.wrote(["pack/one/note.txt"]); // a path relative to the folder works as well
    await new Promise((done) => setTimeout(done, 400));
    expect(target.batches).toEqual([]);
    expect(target.activity).toEqual([]);

    // Someone else changes the same file: that is news.
    writeFileSync(review, '{"verdict":"rejected","by":"another writer"}');
    await settled(target, 1);
    expect(target.batches).toEqual([["pack/one/review.json"]]);

    // The studio removes a file and says so.
    rmSync(join(target.dir, "pack/one/note.txt"));
    target.watcher.wrote(["pack/one/note.txt"]);
    await new Promise((done) => setTimeout(done, 300));
    expect(target.batches).toHaveLength(1);
  });

  it("without wrote(), the studio's own write is reported like any other (the hook is what suppresses it)", async () => {
    const target = watched("no-echo-hook");
    target.watcher.start();
    writeFileSync(join(target.dir, "review.json"), "{}");
    await settled(target, 1);
    expect(target.batches).toEqual([["review.json"]]);
  });

  it("a handler that throws is reported and the watcher goes on", async () => {
    const dir = tempRoot("throws");
    const errors: unknown[] = [];
    const batches: string[][] = [];
    const watcher = createWatcher({
      dir,
      debounceMs: 60,
      pollMs: 40,
      onError: (error) => errors.push(error),
      onBatch: (paths) => {
        batches.push([...paths]);
        if (batches.length === 1) throw new Error("the first batch fails");
      },
    });
    watchers.push(watcher);
    watcher.start();
    writeFileSync(join(dir, "a.ts"), "x");
    await settled({ batches, watcher }, 1);
    writeFileSync(join(dir, "b.ts"), "x");
    await settled({ batches, watcher }, 2);
    expect(batches).toEqual([["a.ts"], ["b.ts"]]);
    expect(errors.map((error) => (error as Error).message)).toEqual(["the first batch fails"]);
  });

  it("close() stops it: later changes are not reported", async () => {
    const target = watched("close");
    target.watcher.start();
    target.watcher.close();
    writeFileSync(join(target.dir, "late.ts"), "x");
    await new Promise((done) => setTimeout(done, 300));
    expect(target.batches).toEqual([]);
    await target.watcher.idle();
  });
});
