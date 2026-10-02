// The examples in audio/examples are the goldens of the synth: each has a checked-in sidecar
// with the hash of its PCM. A change of the synth that changes one sample of one of them
// fails here (and in `npm run examples`, which runs `audio check --all` on the same files).

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_TRUE_PEAK_DB, MUSIC_TARGET_LUFS } from "../src/analysis/index.ts";
import { monoHash, renderSfx, renderSong, stereoHash } from "../src/index.ts";
import { analyse, checkEntry, findEntries, findStrays, loadEntry, openProject, sidecarText } from "../src/node/index.ts";
import type { AudioEntry, Sidecar } from "../src/node/index.ts";
import { firstDifference, REPO } from "./helpers.ts";

const project = openProject({ root: REPO });
const entries = findEntries(project);
const examples = entries.filter((entry) => entry.pack === "examples");

function example(pathId: string): AudioEntry {
  const found = examples.find((entry) => entry.pathId === pathId);
  if (found === undefined) throw new Error(`there is no example ${pathId}`);
  return found;
}

function storedSidecar(entry: AudioEntry): Sidecar {
  return JSON.parse(readFileSync(entry.sidecar, "utf8")) as Sidecar;
}

describe("the examples", () => {
  it("are a loop, a jingle and three SFX, each with a sidecar", () => {
    expect(examples.map((entry) => `${entry.kind} ${entry.pathId}`)).toEqual([
      "song examples/music/fanfare",
      "song examples/music/shop-day",
      "sfx examples/sfx/click",
      "sfx examples/sfx/coin",
      "sfx examples/sfx/level-up",
    ]);
    for (const entry of examples) expect([entry.pathId, existsSync(entry.sidecar)]).toEqual([entry.pathId, true]);
    expect(findStrays(project)).toEqual([]);
  });

  it("have ids that no other file in the repo uses", () => {
    const ids = entries.map((entry) => {
      const loaded = loadEntry(entry);
      return loaded.song?.id ?? loaded.sfx?.id ?? `(unreadable ${entry.pathId})`;
    });
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith("(unreadable"))).toEqual([]);
  });

  it("the loop has 8 bars and more than one state; the jingle does not loop", () => {
    const loop = loadEntry(example("examples/music/shop-day")).song;
    expect(loop).not.toBeNull();
    expect(loop?.timeline.bars).toHaveLength(8);
    expect(loop?.loopFrom).toBe(0);
    expect(Object.keys(loop?.states ?? {})).toEqual(["calm", "rush", "night"]);
    expect(Object.keys(loop?.orchestrations ?? {})).toEqual(["winter"]);

    const jingle = loadEntry(example("examples/music/fanfare")).song;
    expect(jingle).not.toBeNull();
    expect(jingle?.loopFrom).toBeNull();
    expect(jingle?.timeline.loopStartStep).toBeNull();
    // The source says so in the format's own words.
    expect((JSON.parse(readFileSync(example("examples/music/fanfare").file, "utf8")) as { loop: unknown }).loop).toBe(false);
  });
});

describe.each(examples.map((entry) => [entry.pathId, entry] as const))("%s", (_pathId, entry) => {
  const stored = storedSidecar(entry);
  const analysis = analyse(loadEntry(entry));

  it("passes every validator and the golden, without one warning", () => {
    const result = checkEntry(entry);
    expect(result.findings).toEqual([]);
    expect([result.errors, result.warnings]).toEqual([0, 0]);
    expect(stored.warnings).toEqual([]);
  });

  it("renders to the PCM hash in its sidecar", () => {
    expect(stored.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(analysis.sidecar?.hash).toBe(stored.hash);
    // The whole sidecar: stems, states, loudness, peak, stats.
    expect(sidecarText(analysis.sidecar as Sidecar)).toBe(readFileSync(entry.sidecar, "utf8"));
  });

  it("renders the same samples twice", () => {
    const loaded = loadEntry(entry);
    if (loaded.song !== null) {
      const a = renderSong(loaded.song);
      const b = renderSong(loaded.song);
      expect(a.frames).toBe(stored.frames);
      expect(firstDifference(a.left, b.left)).toBe(-1);
      expect(firstDifference(a.right, b.right)).toBe(-1);
      expect(stereoHash(a, a.sampleRate)).toBe(stored.hash);
      expect(a.stems.map((stem) => ({ channel: stem.name, hash: stereoHash(stem, a.sampleRate) }))).toEqual(stored.stems);
      a.stems.forEach((stem, index) => {
        expect(firstDifference(stem.left, (b.stems[index] as (typeof b.stems)[number]).left)).toBe(-1);
      });
    } else if (loaded.sfx !== null) {
      const a = renderSfx(loaded.sfx);
      const b = renderSfx(loaded.sfx);
      expect(a.frames).toBe(stored.frames);
      expect(firstDifference(a.samples, b.samples)).toBe(-1);
      expect(monoHash(a.samples, a.sampleRate)).toBe(stored.hash);
    } else {
      throw new Error(`${entry.pathId} has errors`);
    }
  });

  it("meets the house levels", () => {
    expect(stored.clipped).toBe(0);
    expect(stored.dBTP).not.toBeNull();
    expect(stored.dBTP as number).toBeLessThanOrEqual(MAX_TRUE_PEAK_DB);
    // After the trim a player applies, the peak still has its headroom.
    expect((stored.dBTP as number) + stored.trimDb).toBeLessThanOrEqual(MAX_TRUE_PEAK_DB);
    expect(stored.energyAbove8k).toBeLessThan(0.1);
    if (entry.kind === "song") {
      // Music is written within 1 LU of the target; the trim closes the rest.
      expect(Math.abs((stored.lufsI as number) - MUSIC_TARGET_LUFS)).toBeLessThanOrEqual(1);
      expect(Math.abs((stored.lufsI as number) + stored.trimDb - MUSIC_TARGET_LUFS)).toBeLessThan(0.11);
      for (const state of stored.states ?? []) expect((state.dBTP as number) + state.trimDb).toBeLessThanOrEqual(MAX_TRUE_PEAK_DB);
    } else {
      expect(stored.trimDb).toBe(0);
      expect(stored.seconds).toBeLessThan(1.5);
    }
    if (stored.loop === true) expect(stored.seam).toMatchObject({ click: false });
    else expect(stored.seam).toBeNull();
  });
});
