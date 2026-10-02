// The sequencer and the mixer: sample-counted time, the loop, states, orchestrations.

import { describe, expect, it } from "vitest";
import { DEFAULT_SAMPLE_RATE, parseSong, SongPlayer, stepFrame } from "../src/index.ts";
import type { PlayerOptions, Song, StereoBuffer } from "../src/index.ts";
import { energyAbove } from "../src/analysis/index.ts";
import { cleanJson, cleanSong, firstDifference, peakOf, setAt, tinySong } from "./helpers.ts";

const BAR = 96000;
const SONG = cleanSong();

function buffers(song: Song, frames: number): { left: Float32Array; right: Float32Array; stems: StereoBuffer[] } {
  return {
    left: new Float32Array(frames),
    right: new Float32Array(frames),
    stems: song.channels.map(() => ({ left: new Float32Array(frames), right: new Float32Array(frames) })),
  };
}

/** Plays `frames` samples of a song in blocks of the given sizes (the last size repeats). */
function stream(song: Song, frames: number, options: PlayerOptions = {}, blocks: readonly number[] = [frames]): ReturnType<typeof buffers> {
  const player = new SongPlayer(song, options);
  const out = buffers(song, frames);
  let at = 0;
  for (let i = 0; at < frames; i += 1) {
    const size = Math.min(frames - at, blocks[Math.min(i, blocks.length - 1)] as number);
    player.process(out.left, out.right, size, at, out.stems);
    at += size;
  }
  return out;
}

describe("time", () => {
  it("counts samples: a step starts on floor(step * sampleRate * 60 / (tempo * stepsPerBeat))", () => {
    expect(DEFAULT_SAMPLE_RATE).toBe(48000);
    expect(stepFrame(SONG, 0, 48000)).toBe(0);
    expect(stepFrame(SONG, 1, 48000)).toBe(6000);
    expect(stepFrame(SONG, 32, 48000)).toBe(192000);
    const odd = parseSong(setAt(cleanJson(), ["tempo"], 108));
    // 6666.67 samples a step: floored each time from the start, so the error never adds up.
    expect(stepFrame(odd, 1, 48000)).toBe(6666);
    expect(stepFrame(odd, 2, 48000)).toBe(13333);
    expect(stepFrame(odd, 3, 48000)).toBe(20000);
    expect(stepFrame(odd, 432 * 7, 48000)).toBe(2880000 * 7);
    expect(stepFrame(odd, 1, 44100)).toBe(6125);
  });

  it("knows where the bars, the end and the loop point are", () => {
    const player = new SongPlayer(SONG);
    expect(player).toMatchObject({ sampleRate: 48000, endFrame: 192000, loopStartFrame: 0, barFrames: [0, BAR, 2 * BAR] });
    const jingle = new SongPlayer(parseSong(setAt(cleanJson(), ["loop"], false)), { sampleRate: 44100 });
    expect(jingle).toMatchObject({ sampleRate: 44100, endFrame: 176400, loopStartFrame: -1, barFrames: [0, 88200, 176400] });
  });

  it.each([7999, 96001, 44100.5, Number.NaN])("refuses the sample rate %f", (sampleRate) => {
    expect(() => new SongPlayer(SONG, { sampleRate })).toThrow(RangeError);
  });

  it("reports its position", () => {
    const song = parseSong(setAt(setAt(cleanJson(), ["order"], ["A", "A"]), ["loop"], { fromOrderIndex: 1 }));
    const player = new SongPlayer(song);
    const out = buffers(song, 4 * BAR + 10);
    expect(player.position()).toEqual({ frame: 0, timelineBar: 0, orderIndex: 0, section: "A", bar: 0, loops: 0, ended: false });
    player.process(out.left, out.right, BAR + 5);
    expect(player.position()).toMatchObject({ frame: BAR + 5, timelineBar: 1, orderIndex: 0, bar: 1, loops: 0 });
    player.process(out.left, out.right, 2 * BAR);
    expect(player.position()).toMatchObject({ frame: 3 * BAR + 5, timelineBar: 3, orderIndex: 1, bar: 1, loops: 0 });
    // The end jumps back to the loop point: order index 1, not the start.
    player.process(out.left, out.right, BAR);
    expect(player.position()).toMatchObject({ frame: 2 * BAR + 5, timelineBar: 2, orderIndex: 1, bar: 0, loops: 1, ended: false });
  });
});

describe("block sizes", () => {
  it("do not change a sample: one block, 128s, or anything else", () => {
    const frames = 3 * BAR;
    const whole = stream(SONG, frames);
    const worklet = stream(SONG, frames, {}, [128]);
    const ragged = stream(SONG, frames, {}, [1, 7, 1000, 4096, 333, 95999, 2, 5000]);
    for (const other of [worklet, ragged]) {
      expect(firstDifference(whole.left, other.left)).toBe(-1);
      expect(firstDifference(whole.right, other.right)).toBe(-1);
      whole.stems.forEach((stem, c) => expect(firstDifference(stem.left, (other.stems[c] as StereoBuffer).left)).toBe(-1));
    }
    expect(peakOf(whole.left)).toBeGreaterThan(0.1);
  });

  it("do not change a sample at another sample rate or with a state and an orchestration", () => {
    const options = { sampleRate: 44100, state: "muffled", orchestration: "soft" };
    const whole = stream(SONG, 200000, options);
    const cut = stream(SONG, 200000, options, [441, 128, 3]);
    expect(firstDifference(whole.left, cut.left)).toBe(-1);
    expect(firstDifference(whole.right, cut.right)).toBe(-1);
  });

  it("is the same stream every time it is played", () => {
    const first = stream(SONG, 2 * BAR);
    const second = stream(SONG, 2 * BAR);
    expect(firstDifference(first.left, second.left)).toBe(-1);
    expect(firstDifference(first.right, second.right)).toBe(-1);
  });
});

describe("the mix", () => {
  it("is the sum of the stems, in channel order", () => {
    const out = stream(SONG, 2 * BAR);
    for (let i = 0; i < 2 * BAR; i += 997) {
      let left = 0;
      let right = 0;
      for (const stem of out.stems) {
        left += stem.left[i] as number;
        right += stem.right[i] as number;
      }
      expect(out.left[i]).toBe(Math.fround(left));
      expect(out.right[i]).toBe(Math.fround(right));
    }
  });

  it("pans a channel with constant power", () => {
    const pan = (value: number): ReturnType<typeof buffers> => {
      const song = tinySong({ bars: ["C4 - - - | - - - - | . . . . | . . . ."], channel: { pan: value } });
      return stream(song, 48000);
    };
    const left = pan(-1);
    const right = pan(1);
    const centre = pan(0);
    expect(peakOf(left.right)).toBe(0);
    expect(peakOf(right.left)).toBe(0);
    expect(firstDifference(left.left, right.right)).toBe(-1);
    expect(firstDifference(centre.left, centre.right)).toBe(-1);
    expect(peakOf(centre.left) / peakOf(left.left)).toBeCloseTo(Math.SQRT1_2, 3);
  });

  it("applies the channel gain in decibels and the velocity of a note", () => {
    const peak = (bar: string, gainDb: number): number => peakOf(stream(tinySong({ bars: [bar], channel: { gainDb } }), 20000).left);
    const reference = peak("C4 - - - | . . . . | . . . . | . . . .", 0);
    expect(peak("C4 - - - | . . . . | . . . . | . . . .", -20) / reference).toBeCloseTo(0.1, 5);
    expect(peak("C4:9 - - - | . . . . | . . . . | . . . .", 0) / reference).toBeCloseTo(9 / 7, 5);
    expect(peak("C4:1 - - - | . . . . | . . . . | . . . .", 0) / reference).toBeCloseTo(1 / 7, 5);
  });

  it("repeats a channel with its echo, in time with the tempo", () => {
    // One sixteenth note, then silence. The echo comes half a beat (12000 samples) later.
    const bar = "C5 . . . | . . . . | . . . . | . . . .";
    const dry = stream(tinySong({ bars: [bar] }), 48000).left;
    const wet = stream(tinySong({ bars: [bar], channel: { echo: { beats: 0.5, feedback: 0.5, mix: 0.5 } } }), 48000).left;
    // (The very first sample of the note is 0, so the first echoed sample that shows is the second.)
    expect(firstDifference(dry, wet)).toBeGreaterThanOrEqual(12000);
    expect(firstDifference(dry, wet)).toBeLessThan(12003);
    expect(peakOf(dry, 7000)).toBe(0);
    const first = peakOf(wet, 12000, 18500);
    const second = peakOf(wet, 24000, 30500);
    expect(first / peakOf(dry)).toBeCloseTo(0.5, 2);
    expect(second).toBeGreaterThan(first * 0.3);
    expect(second).toBeLessThan(first * 0.55);
    expect(peakOf(wet, 18500, 24000)).toBe(0);
  });
});

describe("notes", () => {
  it("ends a note where its holds end, with its release", () => {
    // Two steps of note (12000 samples), then a 5 ms release (240 samples).
    const out = stream(tinySong({ bars: ["C4 - . . | . . . . | . . . . | . . . ."] }), 20000).left;
    expect(peakOf(out, 11000, 12000)).toBeGreaterThan(0.5);
    expect(peakOf(out, 12200, 12239)).toBeGreaterThan(0);
    expect(peakOf(out, 12241)).toBe(0);
  });

  it("lets the release of a note ring under the next one", () => {
    const slow = { wave: "triangle", env: { a: 0, d: 0, s: 1, r: 0.5 } };
    const one = stream(tinySong({ bars: ["C4 . . . | . . . . | . . . . | . . . ."], instrument: slow }), 30000).left;
    const two = stream(tinySong({ bars: ["C4 G4 . . | . . . . | . . . . | . . . ."], instrument: slow }), 30000).left;
    const g = stream(tinySong({ bars: [". G4 . . | . . . . | . . . . | . . . ."], instrument: slow }), 30000).left;
    // Both notes sound together: the mix of the two is the sum of each alone.
    for (let i = 6000; i < 30000; i += 499) expect(two[i]).toBeCloseTo((one[i] as number) + (g[i] as number), 6);
  });

  it("plays a drum for its attack and decay, with no note-off", () => {
    const kit = { drums: { k: { wave: "triangle", pitch: "C3", env: { a: 0, d: 0.05, s: 0, r: 0.01 } } } };
    const out = stream(tinySong({ bars: ["k . . . | . . . . | k:3 - - - | . . . ."], instrument: kit }), 60000).left;
    expect(peakOf(out, 0, 2400)).toBeGreaterThan(0.5);
    // The gate closes 0.05 s (2400 samples) after the hit; what is left of the decay then
    // releases, at the latest 0.01 s (480 samples) later.
    expect(peakOf(out, 2400, 2900)).toBeLessThan(0.02);
    expect(peakOf(out, 2900, 48000)).toBe(0);
    expect(peakOf(out, 48000, 50400) / peakOf(out, 0, 2400)).toBeCloseTo(3 / 7, 2);
    expect(peakOf(out, 50900)).toBe(0);
  });

  it("glides from the note before it, if the instrument says so", () => {
    const bar = "C4 - - - | C5 - - - | . . . . | . . . .";
    const plain = stream(tinySong({ bars: [bar] }), 48000).left;
    const glide = stream(tinySong({ bars: [bar], instrument: { wave: "triangle", glide: 0.1, env: { a: 0, d: 0, s: 1, r: 0.005 } } }), 48000).left;
    // The first note has nothing to glide from.
    expect(firstDifference(plain, glide, 0, 24000)).toBe(-1);
    expect(firstDifference(plain, glide)).toBeGreaterThanOrEqual(24000);
    expect(firstDifference(plain, glide)).toBeLessThan(24100);
  });

  it("seeds the noise from the song's seed", () => {
    const withSeed = (seed: number): ReturnType<typeof buffers> => stream(parseSong(setAt(cleanJson(), ["seed"], seed)), BAR);
    const a = withSeed(1);
    const b = withSeed(2);
    expect(firstDifference(a.stems[0]?.left ?? [], b.stems[0]?.left ?? [])).toBe(-1);
    expect(firstDifference(a.stems[1]?.left ?? [], b.stems[1]?.left ?? [])).toBe(-1);
    expect(firstDifference(a.stems[2]?.left ?? [], b.stems[2]?.left ?? [])).toBeGreaterThanOrEqual(0);
    expect(firstDifference(a.stems[2]?.left ?? [], withSeed(1).stems[2]?.left ?? [])).toBe(-1);
  });
});

describe("the loop", () => {
  it("jumps back without stopping what still rings", () => {
    // A note held to the very end of a one-bar loop, with a long release.
    const song = tinySong({ bars: [". . . . | . . . . | . . . . | C4 - - -"], instrument: { wave: "triangle", env: { a: 0, d: 0, s: 1, r: 0.25 } }, loop: true });
    const out = stream(song, 2 * BAR).left;
    expect(peakOf(out, 0, 72000)).toBe(0);
    expect(peakOf(out, BAR - 100, BAR)).toBeGreaterThan(0.5);
    // The second pass starts with the release of the first: 0.25 s = 12000 samples.
    expect(peakOf(out, BAR, BAR + 100)).toBeGreaterThan(0.5);
    expect(peakOf(out, BAR + 11000, BAR + 11990)).toBeGreaterThan(0);
    expect(peakOf(out, BAR + 12001, BAR + 72000)).toBe(0);
    expect(Math.abs((out[BAR] as number) - (out[BAR - 1] as number))).toBeLessThan(0.02);
  });

  it("plays the bars before the loop point once", () => {
    const json = setAt(setAt(cleanJson(), ["order"], ["A", "A"]), ["loop"], { fromOrderIndex: 1 });
    const song = parseSong(json);
    const player = new SongPlayer(song);
    expect(player).toMatchObject({ endFrame: 4 * BAR, loopStartFrame: 2 * BAR });
    const out = stream(song, 6 * BAR + 1000);
    const bass = out.stems[1]?.left ?? new Float32Array(0);
    // The bass has no noise and no tails over the seam: every pass of the section is the same.
    expect(firstDifference(bass.subarray(0, 2 * BAR), bass.subarray(2 * BAR, 4 * BAR))).toBe(-1);
    expect(firstDifference(bass.subarray(2 * BAR, 4 * BAR), bass.subarray(4 * BAR, 6 * BAR))).toBe(-1);
  });

  it("ends a song that does not loop, and lets its tails ring out", () => {
    const song = tinySong({ bars: [". . . . | . . . . | . . . . | C4 - - -"], instrument: { wave: "triangle", env: { a: 0, d: 0, s: 1, r: 0.25 } } });
    const player = new SongPlayer(song);
    const out = buffers(song, 2 * BAR);
    player.process(out.left, out.right, BAR - 1);
    expect(player.position().ended).toBe(false);
    player.process(out.left, out.right, BAR + 1, BAR - 1);
    expect(player.position()).toMatchObject({ ended: true, loops: 0, frame: BAR });
    expect(peakOf(out.left, BAR, BAR + 100)).toBeGreaterThan(0.5);
    expect(peakOf(out.left, BAR + 12001)).toBe(0);
  });
});

describe("states", () => {
  it("mute the channels of the layers that are not in the state", () => {
    const calm = stream(SONG, 2 * BAR, { state: "calm" });
    for (let i = 0; i < 2 * BAR; i += 991) {
      expect(calm.left[i]).toBe(Math.fround((calm.stems[0]?.left[i] as number) + (calm.stems[1]?.left[i] as number)));
    }
    // The stems are the same whatever the state: a state is a mix.
    const all = stream(SONG, 2 * BAR);
    all.stems.forEach((stem, c) => expect(firstDifference(stem.left, calm.stems[c]?.left ?? [])).toBe(-1));
    const busy = stream(SONG, 2 * BAR, { state: "busy" });
    expect(firstDifference(all.left, busy.left)).toBe(-1);
  });

  it("change on the next bar line, and fade", () => {
    const calm = stream(SONG, 3 * BAR, { state: "calm" });
    const busy = stream(SONG, 3 * BAR, { state: "busy" });
    const player = new SongPlayer(SONG, { state: "calm" });
    const out = buffers(SONG, 3 * BAR);
    player.process(out.left, out.right, 1000);
    player.setState("busy", 1);
    expect(player.state).toBe("calm");
    player.process(out.left, out.right, BAR - 1001, 1000);
    expect(player.state).toBe("calm");
    player.process(out.left, out.right, 2, BAR - 1);
    expect(player.state).toBe("busy");
    player.process(out.left, out.right, 2 * BAR - 1, BAR + 1);

    // Bar 1 is still calm. The drums fade in over one beat (24000 samples) from the bar line.
    expect(firstDifference(out.left, calm.left, 0, BAR)).toBe(-1);
    const fadeStart = firstDifference(out.left, calm.left, BAR);
    expect(fadeStart).toBeGreaterThanOrEqual(BAR);
    expect(fadeStart).toBeLessThan(BAR + 500);
    expect(firstDifference(out.left, busy.left, BAR, BAR + 24000)).toBeGreaterThanOrEqual(BAR);
    // After the fade it is the busy mix, sample for sample.
    expect(firstDifference(out.left, busy.left, BAR + 24000)).toBe(-1);
    expect(firstDifference(out.right, busy.right, BAR + 24000)).toBe(-1);
  });

  it("change at once on a bar line, and without a fade if asked", () => {
    const busy = stream(SONG, BAR, { state: "busy" });
    const player = new SongPlayer(SONG, { state: "calm" });
    player.setState("busy", 0);
    const out = buffers(SONG, BAR);
    player.process(out.left, out.right, BAR);
    expect(player.state).toBe("busy");
    expect(firstDifference(out.left, busy.left)).toBe(-1);
  });

  it("fade a low-pass in over the mix", () => {
    const calm = stream(SONG, 3 * BAR, { state: "calm" });
    const muffled = stream(SONG, 3 * BAR, { state: "muffled" });
    const player = new SongPlayer(SONG, { state: "calm" });
    const out = buffers(SONG, 3 * BAR);
    player.process(out.left, out.right, 1000);
    player.setState("muffled", 2);
    player.process(out.left, out.right, 3 * BAR - 1000, 1000);
    // Calm for the first bar; neither during the fade of two beats (48000 samples); the
    // muffled mix after it (the filter has long forgotten the bar it ran open).
    expect(firstDifference(out.left, calm.left, 0, BAR)).toBe(-1);
    expect(firstDifference(out.left, calm.left, BAR, BAR + 48000)).toBeGreaterThanOrEqual(BAR);
    expect(firstDifference(out.left, muffled.left, BAR, BAR + 48000)).toBeGreaterThanOrEqual(BAR);
    let worst = 0;
    for (let i = 2 * BAR; i < 3 * BAR; i += 1) worst = Math.max(worst, Math.abs((out.left[i] as number) - (muffled.left[i] as number)));
    expect(worst).toBeLessThan(1e-6);
    // The muffled mix has lost its treble.
    const treble = (signal: Float32Array): number => energyAbove(signal.subarray(BAR, 2 * BAR), 48000, 3000);
    expect(treble(calm.left)).toBeGreaterThan(0.01);
    expect(treble(muffled.left)).toBeLessThan(treble(calm.left) / 10);
  });

  it("refuse a state the song does not have", () => {
    const player = new SongPlayer(SONG);
    expect(() => player.setState("nope")).toThrow(RangeError);
    expect(() => player.setState("calm", -1)).toThrow(RangeError);
    expect(() => new SongPlayer(SONG, { state: "nope" })).toThrow(RangeError);
    player.setState(null);
    expect(player.state).toBeNull();
  });
});

describe("orchestrations", () => {
  it("change the instruments of the notes that start from the next bar line on", () => {
    const written = stream(SONG, 2 * BAR);
    const soft = stream(SONG, 2 * BAR, { orchestration: "soft" });
    const player = new SongPlayer(SONG);
    const out = buffers(SONG, 2 * BAR);
    player.process(out.left, out.right, 500, 0, out.stems);
    player.setOrchestration("soft");
    expect(player.orchestration).toBeNull();
    player.process(out.left, out.right, 2 * BAR - 500, 500, out.stems);
    expect(player.orchestration).toBe("soft");

    const lead = (set: ReturnType<typeof buffers>): Float32Array => set.stems[0]?.left ?? new Float32Array(0);
    expect(firstDifference(lead(out), lead(written), 0, BAR)).toBe(-1);
    // (The last note of bar 1 still releases with the old instrument: 0.05 s, 2400 samples.)
    expect(firstDifference(lead(out), lead(soft), BAR, BAR + 2400)).toBeGreaterThanOrEqual(BAR);
    expect(firstDifference(lead(out), lead(soft), BAR + 2401)).toBe(-1);
    expect(firstDifference(lead(written), lead(soft))).toBeGreaterThanOrEqual(0);
    // Only the lead is patched: the bass is the same samples.
    expect(firstDifference(written.stems[1]?.left ?? [], soft.stems[1]?.left ?? [])).toBe(-1);
  });

  it("refuse an orchestration the song does not have", () => {
    expect(() => new SongPlayer(SONG, { orchestration: "nope" })).toThrow(RangeError);
    expect(() => new SongPlayer(SONG).setOrchestration("nope")).toThrow(RangeError);
  });
});
