// The SFX format and its render, and WAV files.

import { describe, expect, it } from "vitest";
import { AudioDataError, decodeWav, encodeWav, MAX_SFX_SECONDS, monoHash, parseSfx, pcmToFloat, readSfx, readSfxText, renderSfx, toPcm16 } from "../src/index.ts";
import { energyAbove } from "../src/analysis/index.ts";
import { firstDifference, fixtureJson, fixtureText, peakOf, risingCrossings, setAt } from "./helpers.ts";

const blipJson = (): Record<string, unknown> => fixtureJson("good/sfx/blip", ".sfx.json");
const ENV = { a: 0, d: 0, s: 1, r: 0.01 };

function errorsOf(json: unknown): string[] {
  const { sfx, findings } = readSfx(json);
  const errors = findings.filter((finding) => finding.severity === "error");
  expect(sfx === null).toBe(errors.length > 0);
  return errors.map((finding) => `${finding.rule} ${finding.path}`);
}

/** An SFX of one voice. A field given as `undefined` is left out, as in a JSON file. */
function oneVoice(voice: Record<string, unknown>, top: Record<string, unknown> = {}): Record<string, unknown> {
  const sfx = { format: "wz.sfx/0.1", id: "test.sfx", gainDb: 0, voices: [{ wave: "triangle", env: ENV, notes: [["A4", 0.1]], ...voice }], ...top };
  return JSON.parse(JSON.stringify(sfx)) as Record<string, unknown>;
}

describe("reading an SFX", () => {
  it("reads the fixture", () => {
    const { sfx, findings } = readSfxText(fixtureText("good/sfx/blip", ".sfx.json"));
    expect(findings).toEqual([]);
    expect(sfx).toMatchObject({ format: "wz.sfx/0.1", id: "fixture.blip", seed: 5, gainDb: -12, play: { jitterCents: 20, maxVoices: 2, minIntervalMs: 50 } });
    expect(sfx?.voices).toHaveLength(2);
    expect(sfx?.voices[0]).toMatchObject({
      tone: { wave: "pulse", duty: 0.5 },
      notes: [
        { midi: 81, arp: null, velocity: 7, seconds: 0.03 },
        { midi: 88, arp: null, velocity: 7, seconds: 0.06 },
      ],
      startSec: 0,
      gainDb: 0,
      lowpassHz: 8000,
      highpassHz: null,
    });
    expect(sfx?.voices[1]).toMatchObject({ tone: { wave: "noise", mode: "short" }, gainDb: -8, lowpassHz: null, highpassHz: 2000 });
  });

  it("fails the broken fixture with a path for every problem", () => {
    const { sfx, findings } = readSfxText(fixtureText("bad/sfx/unknown-field", ".sfx.json"));
    expect(sfx).toBeNull();
    expect(findings.map((finding) => `${finding.severity} ${finding.rule} ${finding.path}`)).toEqual(["error parse voices[0].volume", "error token voices[0].notes[0][0]"]);
  });

  it("has defaults for the seed and the play limits", () => {
    const sfx = parseSfx(oneVoice({}));
    expect(sfx).toMatchObject({ seed: 1, play: { jitterCents: 0, maxVoices: 4, minIntervalMs: 0 } });
    expect(parseSfx(oneVoice({}, { play: { maxVoices: 1 } })).play).toEqual({ jitterCents: 0, maxVoices: 1, minIntervalMs: 0 });
  });

  it("reads notes with arpeggios, velocities and pauses", () => {
    const sfx = parseSfx(oneVoice({ notes: [["C5@047:9", 0.1], [".", 0.05], ["C6", 0.2]] }));
    expect(sfx.voices[0]?.notes).toEqual([
      { midi: 72, arp: [0, 4, 7], velocity: 9, seconds: 0.1 },
      { midi: null, arp: null, velocity: 7, seconds: 0.05 },
      { midi: 84, arp: null, velocity: 7, seconds: 0.2 },
    ]);
  });

  it.each([
    [["format"], "wz.sfx/2", "parse format"],
    [["id"], "Coin!", "parse id"],
    [["gainDb"], 7, "parse gainDb"],
    [["gainDb"], undefined, "parse "],
    [["seed"], 1.5, "parse seed"],
    [["volume"], 1, "parse volume"],
    [["voices"], [], "parse voices"],
    [["voices"], new Array(9).fill({ wave: "triangle", env: ENV, notes: [["A4", 0.1]] }), "parse voices"],
    [["play"], { maxVoices: 0 }, "parse play.maxVoices"],
    [["play"], { cooldown: 3 }, "parse play.cooldown"],
  ])("refuses %j = %j", (path, value, expected) => {
    expect(errorsOf(setAt(blipJson(), path, value))).toContain(expected);
  });

  it.each([
    [{ notes: [] }, "parse voices[0].notes"],
    [{ notes: undefined }, "parse voices[0]"],
    [{ notes: [["A4"]] }, "parse voices[0].notes[0]"],
    [{ notes: [[69, 0.1]] }, "parse voices[0].notes[0]"],
    [{ notes: [["A4", 0]] }, "parse voices[0].notes[0][1]"],
    [{ notes: [["A4", 11]] }, "parse voices[0].notes[0][1]"],
    [{ notes: [["-", 0.1]] }, "token voices[0].notes[0][0]"],
    [{ notes: [["B9", 0.1]] }, "range voices[0].notes[0][0]"],
    [{ notes: [["C9@07", 0.1]] }, "range voices[0].notes[0][0]"],
    [{ wave: "sine" }, "parse voices[0].wave"],
    [{ env: undefined }, "parse voices[0]"],
    [{ lowpassHz: 50 }, "parse voices[0].lowpassHz"],
    [{ highpassHz: 20000 }, "parse voices[0].highpassHz"],
    [{ startSec: -1 }, "parse voices[0].startSec"],
    [{ gainDb: 10 }, "parse voices[0].gainDb"],
    [{ pitch: "C4" }, "parse voices[0].pitch"],
  ])("refuses a voice with %j", (voice, expected) => {
    expect(errorsOf(oneVoice(voice))).toContain(expected);
  });

  it("refuses a sound longer than ten seconds: that is a jingle", () => {
    const json = oneVoice({ notes: [["A4", 6], ["A4", 3.995]] });
    expect(MAX_SFX_SECONDS).toBe(10);
    expect(errorsOf(json)).toEqual(["parse voices[0]"]);
    expect(readSfx(json).findings[0]?.message).toContain("a long sound is a jingle");
    expect(errorsOf(oneVoice({ notes: [["A4", 6], ["A4", 3.9]] }))).toEqual([]);
  });

  it("reports a duplicate key and text that is not JSON", () => {
    const text = fixtureText("good/sfx/blip", ".sfx.json").replace('"seed": 5,', '"seed": 5,\n  "seed": 6,');
    expect(readSfxText(text).findings.map((finding) => `${finding.rule} ${finding.path}`)).toEqual(["parse seed"]);
    expect(readSfxText("[").sfx).toBeNull();
  });

  it("throws from parseSfx", () => {
    expect(() => parseSfx(fixtureJson("bad/sfx/unknown-field", ".sfx.json"))).toThrow(AudioDataError);
    expect(() => parseSfx(fixtureJson("bad/sfx/unknown-field", ".sfx.json"))).toThrow("the SFX has 2 error(s)");
  });
});

describe("rendering an SFX", () => {
  const blip = parseSfx(blipJson());

  it("lasts as long as its longest voice, its release and 5 ms more", () => {
    // 0.03 + 0.06 s of notes, 0.05 s of release, 0.005 s of tail.
    const render = renderSfx(blip);
    expect(render).toMatchObject({ sampleRate: 48000, frames: 6960 });
    expect(render.samples).toHaveLength(6960);
    expect(Math.abs(renderSfx(blip, { sampleRate: 44100 }).frames - 0.145 * 44100)).toBeLessThanOrEqual(0.5);
    expect(peakOf(render.samples)).toBeGreaterThan(0.1);
    expect(peakOf(render.samples)).toBeLessThan(1);
  });

  it("is the same samples every time", () => {
    expect(firstDifference(renderSfx(blip).samples, renderSfx(blip).samples)).toBe(-1);
    expect(monoHash(renderSfx(blip).samples, 48000)).toBe(monoHash(renderSfx(blip).samples, 48000));
  });

  it("changes its noise with the seed, and nothing else", () => {
    const reseeded = parseSfx(setAt(blipJson(), ["seed"], 6));
    expect(monoHash(renderSfx(reseeded).samples, 48000)).not.toBe(monoHash(renderSfx(blip).samples, 48000));
    const tonal = oneVoice({});
    expect(firstDifference(renderSfx(parseSfx(tonal)).samples, renderSfx(parseSfx({ ...tonal, seed: 99 })).samples)).toBe(-1);
  });

  it("plays its notes one after another, each releasing under the next", () => {
    const sfx = parseSfx(oneVoice({ notes: [["A4", 0.5], ["A5", 0.5]] }));
    const { samples } = renderSfx(sfx);
    expect(risingCrossings(samples, 30, 24030)).toBe(220);
    // The second half is A5, with the 10 ms release of the A4 under its start.
    expect(risingCrossings(samples, 24600, 48000 - 30)).toBeGreaterThanOrEqual(427);
    expect(risingCrossings(samples, 24600, 48000 - 30)).toBeLessThanOrEqual(429);
    expect(samples).toHaveLength(48000 + 480 + 240);
    expect(peakOf(samples, 48000 + 485)).toBe(0);
  });

  it("waits for startSec and for a pause", () => {
    const late = renderSfx(parseSfx(oneVoice({ startSec: 0.1 }))).samples;
    expect(peakOf(late, 0, 4800)).toBe(0);
    expect(peakOf(late, 4800, 9600)).toBeGreaterThan(0.9);
    const paused = renderSfx(parseSfx(oneVoice({ notes: [["A4", 0.05], [".", 0.1], ["A4", 0.05]] }))).samples;
    expect(peakOf(paused, 0, 2400)).toBeGreaterThan(0.9);
    expect(peakOf(paused, 2400 + 485, 7200)).toBe(0);
    expect(peakOf(paused, 7200, 9600)).toBeGreaterThan(0.9);
  });

  it("detunes the whole sound: the game's pitch jitter", () => {
    const sfx = parseSfx(oneVoice({ notes: [["A4", 1]] }));
    const cycles = (detuneCents: number): number => risingCrossings(renderSfx(sfx, { detuneCents }).samples, 30, 48030);
    expect(cycles(0)).toBe(440);
    expect(cycles(1200)).toBe(880);
    expect(cycles(-1200)).toBe(220);
    expect(Math.abs(cycles(50) - 440 * 2 ** (50 / 1200))).toBeLessThan(1);
  });

  it("applies the gains of the voice and of the sound", () => {
    const peak = (voiceDb: number, masterDb: number): number => peakOf(renderSfx(parseSfx(oneVoice({ gainDb: voiceDb }, { gainDb: masterDb }))).samples);
    expect(peak(0, 0)).toBeGreaterThan(0.99);
    expect(peak(0, 0)).toBeLessThanOrEqual(1);
    expect(peak(-20, 0) / peak(0, 0)).toBeCloseTo(0.1, 6);
    expect(peak(-6, -14) / peak(0, 0)).toBeCloseTo(0.1, 6);
  });

  it("filters a voice: a low-pass takes the treble, a high-pass the bass", () => {
    const noise = { wave: "noise", notes: [["A6", 0.5]] };
    const share = (voice: Record<string, unknown>, hz: number): number => energyAbove(renderSfx(parseSfx(oneVoice({ ...noise, ...voice }))).samples, 48000, hz);
    expect(share({}, 4000)).toBeGreaterThan(0.3);
    expect(share({ lowpassHz: 1000 }, 4000)).toBeLessThan(0.02);
    expect(share({}, 1000)).toBeLessThan(0.97);
    expect(share({ highpassHz: 8000 }, 1000)).toBeGreaterThan(0.97);
  });

  it("refuses a sample rate the synth does not take", () => {
    expect(() => renderSfx(blip, { sampleRate: 4000 })).toThrow(RangeError);
    expect(() => renderSfx(blip, { sampleRate: 48000.5 })).toThrow(RangeError);
  });
});

describe("WAV", () => {
  const pcm = Int16Array.of(0, 1, -1, 32767, -32768, 258, 1000, -1000);

  it("writes the 44-byte header of 16-bit PCM", () => {
    const bytes = encodeWav(pcm, 2, 48000);
    expect(bytes).toHaveLength(44 + 16);
    const view = new DataView(bytes.buffer);
    const text = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(view.getUint32(4, true)).toBe(36 + 16);
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(192000);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(16);
    expect(Array.from(bytes.subarray(44, 56))).toEqual([0, 0, 1, 0, 0xff, 0xff, 0xff, 0x7f, 0, 0x80, 2, 1]);
  });

  it("reads back what it wrote", () => {
    for (const [channels, rate] of [
      [1, 44100],
      [2, 48000],
    ] as const) {
      const decoded = decodeWav(encodeWav(pcm, channels, rate));
      expect(decoded.channels).toBe(channels);
      expect(decoded.sampleRate).toBe(rate);
      expect(Array.from(decoded.pcm)).toEqual(Array.from(pcm));
    }
    expect(Array.from(encodeWav(pcm, 2, 48000))).toEqual(Array.from(encodeWav(pcm, 2, 48000)));
  });

  it("skips chunks it does not know, and reads a file inside a larger buffer", () => {
    const plain = encodeWav(pcm, 1, 8000);
    // Put a LIST chunk of 5 bytes (padded to 6) between fmt and data.
    const list = Uint8Array.of(0x4c, 0x49, 0x53, 0x54, 5, 0, 0, 0, 1, 2, 3, 4, 5, 0);
    const bytes = new Uint8Array(3 + plain.length + list.length);
    bytes.set(plain.subarray(0, 36), 3);
    bytes.set(list, 3 + 36);
    bytes.set(plain.subarray(36), 3 + 36 + list.length);
    const decoded = decodeWav(bytes.subarray(3));
    expect(decoded).toMatchObject({ channels: 1, sampleRate: 8000 });
    expect(Array.from(decoded.pcm)).toEqual(Array.from(pcm));
  });

  it("refuses what it cannot read", () => {
    expect(() => decodeWav(Uint8Array.of(1, 2, 3))).toThrow("not a WAV file");
    const float = encodeWav(pcm, 1, 8000);
    float[20] = 3;
    expect(() => decodeWav(float)).toThrow("only 16-bit PCM is read");
    expect(() => decodeWav(encodeWav(pcm, 1, 8000).subarray(0, 36))).toThrow("no data chunk");
    expect(() => encodeWav(pcm, 3, 48000)).toThrow(RangeError);
    expect(() => encodeWav(Int16Array.of(1, 2, 3), 2, 48000)).toThrow(RangeError);
  });

  it("turns samples back into floats, per channel", () => {
    const [left, right] = pcmToFloat(Int16Array.of(32767, -32767, 0, 16384), 2);
    expect(Array.from(left ?? [])).toEqual([1, 0]);
    expect(Array.from(right ?? [])).toEqual([-1, Math.fround(16384 / 32767)]);
    // A round trip through 16 bits gives the same 16 bits.
    const { samples } = renderSfx(parseSfx(blipJson()));
    const once = toPcm16([samples]);
    const twice = toPcm16(pcmToFloat(once, 1));
    expect(firstDifference(once, twice)).toBe(-1);
  });
});
