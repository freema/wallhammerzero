// Offline rendering: the passes of a loop, the stems, the states mixed from stems, 16-bit PCM
// and its hash.

import { describe, expect, it } from "vitest";
import { clippedSamples, mixState, monoHash, parseSong, PCM_HASH_TAG, pcmHash, renderSong, SongPlayer, stereoHash, toPcm16 } from "../src/index.ts";
import { cleanJson, cleanSong, firstDifference, fixtureJson, peakOf, setAt, tinySong } from "./helpers.ts";

const BAR = 96000;
const SONG = cleanSong();
const SEAM = parseSong(fixtureJson("good/music/seam-click"));

/** FNV-1a 64 over bytes, written out again here so the layout of the hash is pinned. */
function fnv1a64(bytes: readonly number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return hash.toString(16).padStart(16, "0");
}

describe("renderSong", () => {
  it("renders a loop as it sounds once it has come round, by default", () => {
    const render = renderSong(SONG);
    expect(render).toMatchObject({ sampleRate: 48000, frames: 2 * BAR, loop: true, pass: "steady", state: null, orchestration: null, leadFrames: 2 * BAR });
    expect(render.left).toHaveLength(2 * BAR);
    expect(render.stems.map((stem) => [stem.name, stem.left.length, stem.right.length])).toEqual([
      ["lead", 2 * BAR, 2 * BAR],
      ["bass", 2 * BAR, 2 * BAR],
      ["drums", 2 * BAR, 2 * BAR],
    ]);
    expect(render.bars).toEqual([
      { frame: 0, timelineBar: 0 },
      { frame: BAR, timelineBar: 1 },
    ]);
    expect(render.fullStems.every((stem) => stem.left.length === 4 * BAR)).toBe(true);
  });

  it("is the second pass of the stream a player makes; `first` is the first", () => {
    const player = new SongPlayer(SEAM);
    const end = player.endFrame;
    const left = new Float32Array(2 * end);
    const right = new Float32Array(2 * end);
    player.process(left, right);
    const steady = renderSong(SEAM);
    const first = renderSong(SEAM, { pass: "first" });
    expect(first).toMatchObject({ pass: "first", frames: end, leadFrames: 0, loop: true });
    expect(firstDifference(first.left, left.subarray(0, end))).toBe(-1);
    expect(firstDifference(steady.left, left.subarray(end))).toBe(-1);
    expect(firstDifference(steady.right, right.subarray(end))).toBe(-1);
  });

  it("starts the steady loop with what rings over from its end", () => {
    // The fixture holds a note to the last sample of the loop: its release is in the first
    // 50 ms of the steady pass, and missing from the cold start.
    const steady = renderSong(SEAM);
    const first = renderSong(SEAM, { pass: "first" });
    expect(first.left[0]).toBe(0);
    expect(Math.abs(steady.left[0] as number)).toBeGreaterThan(0.01);
    const last = first.frames - 1;
    expect(Math.abs((first.left[0] as number) - (first.left[last] as number))).toBeGreaterThan(0.1);
    expect(Math.abs((steady.left[0] as number) - (steady.left[last] as number))).toBeLessThan(0.01);
    expect(firstDifference(steady.left, first.left, 4800)).toBe(-1);
  });

  it("starts the steady loop at the loop point, not at the start of the song", () => {
    const song = parseSong(setAt(setAt(cleanJson(), ["order"], ["A", "A", "A"]), ["loop"], { fromOrderIndex: 2 }));
    const steady = renderSong(song);
    expect(steady).toMatchObject({ frames: 2 * BAR, leadFrames: 6 * BAR });
    expect(steady.bars).toEqual([
      { frame: 0, timelineBar: 4 },
      { frame: BAR, timelineBar: 5 },
    ]);
    const first = renderSong(song, { pass: "first" });
    expect(first.frames).toBe(6 * BAR);
    expect(first.bars.map((bar) => bar.frame)).toEqual([0, BAR, 2 * BAR, 3 * BAR, 4 * BAR, 5 * BAR]);
  });

  it("renders a song that does not loop until it has rung out", () => {
    const song = tinySong({ bars: [". . . . | . . . . | . . . . | C4 - - -"], instrument: { wave: "triangle", env: { a: 0, d: 0, s: 1, r: 0.25 } } });
    const render = renderSong(song, { pass: "steady" });
    expect(render).toMatchObject({ loop: false, pass: "first", leadFrames: 0 });
    // The release is 12000 samples; the render stops after the first silent block of 1024.
    expect(render.frames).toBeGreaterThan(BAR + 12000);
    expect(render.frames).toBeLessThanOrEqual(BAR + 12000 + 2 * 1024);
    expect((render.frames - BAR) % 1024).toBe(0);
    expect(peakOf(render.left, render.frames - 1024)).toBe(0);
    expect(peakOf(render.left, BAR, BAR + 100)).toBeGreaterThan(0.5);
  });

  it("gives up on a tail that never ends after five seconds", () => {
    const forever = { beats: 1, feedback: 0.9, mix: 1 };
    const song = tinySong({ bars: ["C4 - - - | . . . . | . . . . | . . . ."], channel: { echo: forever } });
    const render = renderSong(song, { sampleRate: 8000 });
    expect(render.frames).toBeLessThanOrEqual(16000 + 5 * 8000);
    expect(render.frames).toBeGreaterThan(16000 + 4 * 8000);
  });

  it("is the same samples every time", () => {
    const a = renderSong(SONG);
    const b = renderSong(SONG);
    expect(firstDifference(a.left, b.left)).toBe(-1);
    expect(firstDifference(a.right, b.right)).toBe(-1);
    expect(stereoHash(a, 48000)).toBe(stereoHash(b, 48000));
    expect(stereoHash(a, 48000)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("renders a state, an orchestration and another sample rate", () => {
    const written = renderSong(SONG);
    const calm = renderSong(SONG, { state: "calm" });
    const soft = renderSong(SONG, { orchestration: "soft" });
    const cd = renderSong(SONG, { sampleRate: 44100 });
    expect(calm.state).toBe("calm");
    expect(soft.orchestration).toBe("soft");
    expect(cd).toMatchObject({ sampleRate: 44100, frames: 176400 });
    const hashes = [written, calm, soft].map((render) => stereoHash(render, 48000));
    expect(new Set([...hashes, stereoHash(cd, 44100)]).size).toBe(4);
    expect(() => renderSong(SONG, { state: "nope" })).toThrow(RangeError);
    expect(() => renderSong(SONG, { sampleRate: 1000 })).toThrow(RangeError);
  });
});

describe("mixState", () => {
  it.each([null, "calm", "busy", "muffled"])("mixes the state %s from the stems, sample for sample what a render of it gives", (state) => {
    for (const pass of ["steady", "first"] as const) {
      const all = renderSong(SONG, { pass });
      const direct = renderSong(SONG, { state, pass });
      const mixed = mixState(SONG, all, state);
      expect(mixed.left).toHaveLength(direct.frames);
      expect(firstDifference(mixed.left, direct.left)).toBe(-1);
      expect(firstDifference(mixed.right, direct.right)).toBe(-1);
    }
  });

  it("makes different mixes of different states", () => {
    const all = renderSong(SONG);
    const hashes = ["calm", "busy", "muffled"].map((state) => stereoHash(mixState(SONG, all, state), 48000));
    expect(new Set(hashes).size).toBe(3);
    expect(hashes[1]).toBe(stereoHash(all, 48000));
  });
});

describe("16-bit PCM", () => {
  it("rounds to the nearest step, halves up, and limits to the range", () => {
    // 0.5 * 32767 is 16383.5: a half goes up, on both sides of zero.
    const pcm = toPcm16([Float32Array.of(0, 1, -1, 0.5, -0.5, 0.6 / 32767, -0.6 / 32767, 0.4 / 32767, -0.4 / 32767, 2, -2, 1 + 1 / 32767)]);
    expect(Array.from(pcm)).toEqual([0, 32767, -32767, 16384, -16383, 1, -1, 0, 0, 32767, -32768, 32767]);
  });

  it("interleaves the channels", () => {
    const pcm = toPcm16([Float32Array.of(0, 1 / 32767, 2 / 32767), Float32Array.of(-1 / 32767, -2 / 32767, -3 / 32767)]);
    expect(Array.from(pcm)).toEqual([0, -1, 1, -2, 2, -3]);
    expect(toPcm16([])).toHaveLength(0);
    expect(() => toPcm16([new Float32Array(2), new Float32Array(3)])).toThrow(RangeError);
  });

  it("counts the samples that are cut off", () => {
    expect(clippedSamples([Float32Array.of(0, 1, -1, 1.0001, -1.5), Float32Array.of(2, 0.5)])).toBe(3);
    expect(clippedSamples([renderSong(SONG).left])).toBe(0);
  });
});

describe("the PCM hash", () => {
  it("is FNV-1a 64 over a tag, the sample rate, the channel count, the length and the samples", () => {
    expect(PCM_HASH_TAG).toBe("wz.pcm16/1");
    const pcm = Int16Array.of(0, 1, -1, 32767, -32768, 258);
    const header = (rate: number, channels: number, frames: number): number[] => [
      ...Array.from(PCM_HASH_TAG, (char) => char.charCodeAt(0)),
      rate & 0xff,
      (rate >> 8) & 0xff,
      (rate >> 16) & 0xff,
      (rate >> 24) & 0xff,
      channels,
      0,
      frames,
      0,
      0,
      0,
    ];
    const samples = [0, 0, 1, 0, 0xff, 0xff, 0xff, 0x7f, 0, 0x80, 2, 1];
    expect(pcmHash(pcm, 2, 48000)).toBe(fnv1a64([...header(48000, 2, 3), ...samples]));
    expect(pcmHash(pcm, 1, 44100)).toBe(fnv1a64([...header(44100, 1, 6), ...samples]));
    // Pinned: a change of the layout must change the tag, and this value with it.
    expect(pcmHash(pcm, 2, 48000)).toBe(PINNED);
  });

  it("changes with the sample rate, the channel count and every sample", () => {
    const pcm = Int16Array.of(1, 2, 3, 4);
    const base = pcmHash(pcm, 2, 48000);
    expect(pcmHash(pcm, 2, 44100)).not.toBe(base);
    expect(pcmHash(pcm, 1, 48000)).not.toBe(base);
    expect(pcmHash(Int16Array.of(1, 2, 3, 5), 2, 48000)).not.toBe(base);
    expect(pcmHash(Int16Array.of(2, 1, 3, 4), 2, 48000)).not.toBe(base);
    expect(() => pcmHash(Int16Array.of(1, 2, 3), 2, 48000)).toThrow(RangeError);
    expect(() => pcmHash(pcm, 0, 48000)).toThrow(RangeError);
  });

  it("is taken over the 16-bit samples of a render", () => {
    const render = renderSong(SONG);
    expect(stereoHash(render, 48000)).toBe(pcmHash(toPcm16([render.left, render.right]), 2, 48000));
    expect(monoHash(render.left, 48000)).toBe(pcmHash(toPcm16([render.left]), 1, 48000));
  });
});

const PINNED = "7610f17d9c9785f5";
