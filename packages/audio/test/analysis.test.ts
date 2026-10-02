// The measurements: loudness and true peak after BS.1770, the spectrum, the loop seam, and
// what the metrics say about a render.

import { describe, expect, it } from "vitest";
import {
  energyAbove,
  fft,
  HARSH_CUTOFF_HZ,
  HARSH_RATIO,
  kWeighting,
  loopSeam,
  LOUDNESS_TOLERANCE_LU,
  MAX_TRUE_PEAK_DB,
  measure,
  measureLoudness,
  metricFindings,
  MUSIC_TARGET_LUFS,
  SEAM_FLOOR,
  SEAM_RATIO,
  Spectrum,
  toDb,
  toMono,
  trimDb,
  truePeak,
} from "../src/analysis/index.ts";
import type { Metrics } from "../src/analysis/index.ts";
import { parseSong, renderSong } from "../src/index.ts";
import { cleanSong, fixtureJson, sine, tinySong } from "./helpers.ts";

const RATE = 48000;

function metrics(change: Partial<Metrics> = {}): Metrics {
  return { seconds: 4, lufsI: -18, lufsMomentaryMax: -16, dBTP: -6, clipped: 0, energyAbove8k: 0.02, seam: null, ...change };
}

describe("K-weighting", () => {
  it("has the coefficients of BS.1770 at 48 kHz", () => {
    const [shelf, pass] = kWeighting(48000);
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 9);
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 9);
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 9);
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 9);
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 9);
    expect([pass.b0, pass.b1, pass.b2]).toEqual([1, -2, 1]);
    expect(pass.a1).toBeCloseTo(-1.99004745483398, 9);
    expect(pass.a2).toBeCloseTo(0.99007225036621, 9);
  });

  it("weighs the same at another sample rate", () => {
    const at = (rate: number): number => measureLoudness([sine(997, 3, 0.1, rate)], rate).integrated;
    expect(at(44100)).toBeCloseTo(at(48000), 1);
    expect(at(96000)).toBeCloseTo(at(48000), 1);
    expect(at(8000)).toBeCloseTo(at(48000), 0);
  });
});

describe("loudness", () => {
  it("reads -3.01 LUFS for a full-scale 997 Hz sine in one channel, as the standard says", () => {
    expect(measureLoudness([sine(997, 5, 1)], RATE).integrated).toBeCloseTo(-3.01, 1);
  });

  it("adds the channels: the same sine in both reads 3 dB more", () => {
    const tone = sine(997, 5, 0.1);
    expect(measureLoudness([tone, tone], RATE).integrated).toBeCloseTo(-20.0, 1);
    expect(measureLoudness([tone], RATE).integrated).toBeCloseTo(-23.0, 1);
  });

  it("follows the level decibel for decibel", () => {
    const at = (amplitude: number): number => measureLoudness([sine(997, 3, amplitude)], RATE).integrated;
    expect(at(0.5) - at(0.05)).toBeCloseTo(20, 2);
  });

  it("hears bass less and treble more", () => {
    const at = (hz: number): number => measureLoudness([sine(hz, 3, 0.1)], RATE).integrated;
    expect(at(60)).toBeLessThan(at(997) - 2);
    expect(at(3000)).toBeGreaterThan(at(997) + 1.5);
  });

  it("gates silence out: a pause does not make a song quieter", () => {
    // Half tone, half silence: without the gate it would read 3 dB less. With it, only the
    // three blocks that straddle the end of the tone pull the mean down, by 0.13 dB.
    const tone = sine(997, 5, 0.1);
    const padded = new Float32Array(10 * RATE);
    padded.set(tone);
    const alone = measureLoudness([tone], RATE).integrated;
    expect(measureLoudness([padded], RATE).integrated).toBeLessThanOrEqual(alone);
    expect(measureLoudness([padded], RATE).integrated).toBeGreaterThan(alone - 0.2);
  });

  it("gates quiet passages out: 10 LU under the rest", () => {
    const signal = new Float32Array(10 * RATE);
    signal.set(sine(997, 5, 0.5));
    signal.set(sine(997, 5, 0.01), 5 * RATE);
    const alone = measureLoudness([sine(997, 5, 0.5)], RATE).integrated;
    expect(measureLoudness([signal], RATE).integrated).toBeLessThanOrEqual(alone);
    expect(measureLoudness([signal], RATE).integrated).toBeGreaterThan(alone - 0.2);
  });

  it("measures a sound shorter than a block as one block padded with silence", () => {
    const short = measureLoudness([sine(997, 0.1, 0.5)], RATE);
    const block = measureLoudness([sine(997, 0.4, 0.5)], RATE);
    // A quarter of the block is sound: 6 dB less.
    expect(short.integrated).toBeCloseTo(block.integrated - 6.02, 0);
    expect(short.momentaryMax).toBe(short.integrated);
  });

  it("reports the loudest 400 ms", () => {
    const signal = new Float32Array(4 * RATE);
    signal.set(sine(997, 4, 0.05));
    signal.set(sine(997, 1, 0.5), RATE);
    const loudness = measureLoudness([signal], RATE);
    expect(loudness.momentaryMax).toBeCloseTo(measureLoudness([sine(997, 1, 0.5)], RATE).integrated, 1);
    expect(loudness.momentaryMax).toBeGreaterThan(loudness.integrated);
  });

  it("is minus infinity for silence", () => {
    expect(measureLoudness([new Float32Array(RATE)], RATE)).toEqual({ integrated: -Infinity, momentaryMax: -Infinity });
    expect(measureLoudness([], RATE).integrated).toBe(-Infinity);
  });
});

describe("true peak", () => {
  it("finds the peak between the samples", () => {
    // A sine at a quarter of the sample rate, sampled 45 degrees off its peaks: every sample
    // is 0.707, the wave between them reaches 1.
    const signal = sine(12000, 0.1, 1, RATE, Math.PI / 4);
    let samplePeak = 0;
    for (const value of signal) samplePeak = Math.max(samplePeak, Math.abs(value));
    expect(samplePeak).toBeCloseTo(Math.SQRT1_2, 4);
    expect(truePeak([signal])).toBeGreaterThan(0.97);
    expect(truePeak([signal])).toBeLessThan(1.03);
  });

  it("is the sample peak of a slow wave, and the larger of the channels", () => {
    expect(truePeak([sine(100, 0.5, 0.5)])).toBeCloseTo(0.5, 3);
    expect(truePeak([sine(100, 0.5, 0.25), sine(150, 0.5, 0.75)])).toBeCloseTo(0.75, 3);
    expect(truePeak([new Float32Array(100)])).toBe(0);
  });

  it("overshoots on a hard edge, as a converter would", () => {
    const square = Float32Array.from({ length: 4800 }, (_, i) => (Math.floor(i / 24) % 2 === 0 ? 0.9 : -0.9));
    expect(truePeak([square])).toBeGreaterThan(0.95);
  });

  it("turns magnitudes into decibels", () => {
    expect(toDb(1)).toBe(0);
    expect(toDb(0.5)).toBeCloseTo(-6.0206, 4);
    expect(toDb(0)).toBe(-Infinity);
  });
});

describe("the spectrum", () => {
  it("transforms an impulse into a flat spectrum and a sine into one bin", () => {
    const re = new Float64Array(64);
    const im = new Float64Array(64);
    re[0] = 1;
    fft(re, im);
    for (let bin = 0; bin < 64; bin += 1) {
      expect(re[bin]).toBeCloseTo(1, 12);
      expect(im[bin]).toBeCloseTo(0, 12);
    }
    const wave = Float64Array.from({ length: 64 }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / 64));
    const zero = new Float64Array(64);
    fft(wave, zero);
    wave.forEach((value, bin) => expect(Math.hypot(value, zero[bin] as number)).toBeCloseTo(bin === 5 || bin === 59 ? 32 : 0, 9));
  });

  it("needs a power of two", () => {
    expect(() => fft(new Float64Array(48), new Float64Array(48))).toThrow(RangeError);
    expect(() => fft(new Float64Array(64), new Float64Array(32))).toThrow(RangeError);
  });

  it("reads 1 in the bin of a full-scale sine", () => {
    const spectrum = new Spectrum(1024);
    // Bin 64 of 1024 at 48 kHz is 3000 Hz.
    const power = spectrum.at(sine(3000, 0.1, 1), 100);
    expect(power).toHaveLength(513);
    expect(power[64]).toBeCloseTo(1, 3);
    expect(power[200]).toBeLessThan(1e-9);
    const half = spectrum.at(sine(3000, 0.1, 0.5), 100);
    expect(half[64]).toBeCloseTo(0.25, 3);
  });

  it("reads silence outside the signal", () => {
    const spectrum = new Spectrum(256);
    const power = spectrum.at(sine(3000, 0.01, 1), 100000);
    expect(Math.max(...power)).toBe(0);
  });

  it("measures the share of the energy above a frequency", () => {
    expect(HARSH_CUTOFF_HZ).toBe(8000);
    expect(energyAbove(sine(1000, 1, 0.5), RATE, 8000)).toBeLessThan(1e-6);
    expect(energyAbove(sine(12000, 1, 0.5), RATE, 8000)).toBeGreaterThan(0.999);
    const low = sine(1000, 1, 0.5);
    const high = sine(12000, 1, 0.5);
    expect(energyAbove(low.map((value, i) => value + (high[i] as number)), RATE, 8000)).toBeCloseTo(0.5, 2);
    // A tenth of the amplitude is a hundredth of the energy.
    expect(energyAbove(low.map((value, i) => value + (high[i] as number) / 10), RATE, 8000)).toBeCloseTo(0.0099, 3);
    expect(energyAbove(new Float32Array(RATE), RATE, 8000)).toBe(0);
    // The cutoff can be any frequency.
    expect(energyAbove(low, RATE, 500)).toBeGreaterThan(0.999);
    // An offset is not sound: next to a wave it changes nothing.
    expect(energyAbove(low.map((value) => value + 0.4), RATE, 8000)).toBeLessThan(1e-4);
  });

  it("mixes two channels down for it", () => {
    const left = Float32Array.of(1, 0.5, -1);
    expect(toMono([left])).toBe(left);
    expect(Array.from(toMono([left, Float32Array.of(0, 0.5, 1)]))).toEqual([0.5, 0.5, 0]);
  });
});

describe("the loop seam", () => {
  it("is quiet for a wave that ends where it starts", () => {
    // 100 Hz for a second: whole cycles.
    const seam = loopSeam([sine(100, 1, 0.5)], RATE);
    expect(seam.click).toBe(false);
    expect(seam.ratio).toBeLessThan(1.5);
  });

  it("clicks for a wave cut in the middle of a cycle", () => {
    // 100.25 Hz for a second ends a quarter of a cycle in: at its peak, and starts at zero.
    const seam = loopSeam([sine(100.25, 1, 0.5)], RATE);
    expect(seam.jump).toBeCloseTo(0.5, 2);
    expect(seam.local).toBeLessThan(0.01);
    expect(seam.ratio).toBeGreaterThan(50);
    expect(seam.click).toBe(true);
  });

  it("does not call a jump a click when the signal jumps like that all the time", () => {
    // Noise: every step is as large as the seam.
    let state = 12345;
    const noise = Float32Array.from({ length: RATE }, () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return (state / 0x100000000 - 0.5) * 0.8;
    });
    const seam = loopSeam([noise], RATE);
    expect(seam.jump).toBeLessThan(seam.local * SEAM_RATIO);
    expect(seam.click).toBe(false);
  });

  it("does not call a tiny jump a click", () => {
    const quiet = sine(100.25, 1, 0.015);
    const seam = loopSeam([quiet], RATE);
    expect(seam.jump).toBeLessThan(SEAM_FLOOR);
    expect(seam.ratio).toBeGreaterThan(SEAM_RATIO);
    expect(seam.click).toBe(false);
  });

  it("takes the worse of the channels, and handles silence", () => {
    const seam = loopSeam([sine(100, 1, 0.5), sine(100.25, 1, 0.5)], RATE);
    expect(seam.click).toBe(true);
    expect(loopSeam([new Float32Array(RATE)], RATE)).toEqual({ jump: 0, local: 0, ratio: 0, click: false });
    expect(loopSeam([new Float32Array(1)], RATE).click).toBe(false);
  });

  it("flags the fixture with a click at the loop point, and not its seamless render", () => {
    const song = parseSong(fixtureJson("good/music/seam-click"));
    // A cold-start render cuts the held note off at the loop point.
    const cut = renderSong(song, { pass: "first" });
    const cutMetrics = measure([cut.left, cut.right], RATE, { loop: true });
    expect(cutMetrics.seam).toMatchObject({ click: true });
    expect(cutMetrics.seam?.jump).toBeGreaterThan(0.1);
    expect(cutMetrics.seam?.ratio).toBeGreaterThan(20);
    expect(metricFindings(cutMetrics, MUSIC_TARGET_LUFS).map((finding) => `${finding.severity} ${finding.rule}`)).toEqual(["warning loop-seam"]);
    // The steady render lets the release ring over the seam.
    const steady = renderSong(song);
    const steadyMetrics = measure([steady.left, steady.right], RATE, { loop: true });
    expect(steadyMetrics.seam).toMatchObject({ click: false });
    expect(steadyMetrics.seam?.ratio).toBeLessThan(SEAM_RATIO);
    expect(metricFindings(steadyMetrics, MUSIC_TARGET_LUFS)).toEqual([]);
  });

  it("finds no click in the clean song either way", () => {
    for (const pass of ["steady", "first"] as const) {
      const render = renderSong(cleanSong(), { pass });
      expect(measure([render.left, render.right], RATE, { loop: true }).seam?.click).toBe(false);
    }
  });
});

describe("measure", () => {
  it("rounds every number, so a sidecar is the same file everywhere", () => {
    const tone = sine(997, 2, 0.1);
    const result = measure([tone, tone], RATE);
    expect(result).toEqual({ seconds: 2, lufsI: -20, lufsMomentaryMax: -20, dBTP: -20, clipped: 0, energyAbove8k: 0, seam: null });
    expect(Object.is(result.energyAbove8k, 0)).toBe(true);
  });

  it("measures the seam only of a loop", () => {
    const cut = sine(100.25, 1, 0.5);
    expect(measure([cut], RATE).seam).toBeNull();
    // The largest step of the sine is 0.5 * 2 pi * 100.25 / 48000 = 0.00656; the seam is 76 of them.
    expect(measure([cut], RATE, { loop: true }).seam).toEqual({ jump: 0.5, ratio: 76.2, click: true });
  });

  it("has nulls for silence, not infinities", () => {
    expect(measure([new Float32Array(RATE)], RATE)).toEqual({ seconds: 1, lufsI: null, lufsMomentaryMax: null, dBTP: null, clipped: 0, energyAbove8k: 0, seam: null });
  });

  it("counts clipped samples", () => {
    const loud = sine(100, 0.1, 1.5);
    expect(measure([loud], RATE).clipped).toBeGreaterThan(1000);
  });
});

describe("the trim", () => {
  it("brings music to the target, up or down", () => {
    expect(MUSIC_TARGET_LUFS).toBe(-18);
    expect(MAX_TRUE_PEAK_DB).toBe(-1);
    expect(trimDb(metrics({ lufsI: -14, dBTP: -3 }), MUSIC_TARGET_LUFS)).toBe(-4);
    expect(trimDb(metrics({ lufsI: -20.5, dBTP: -9 }), MUSIC_TARGET_LUFS)).toBe(2.5);
    expect(trimDb(metrics({ lufsI: -18, dBTP: -6 }), MUSIC_TARGET_LUFS)).toBe(0);
  });

  it("never lifts the true peak above -1 dBTP", () => {
    expect(trimDb(metrics({ lufsI: -24, dBTP: -3 }), MUSIC_TARGET_LUFS)).toBe(2);
    expect(trimDb(metrics({ lufsI: -24, dBTP: -0.5 }), MUSIC_TARGET_LUFS)).toBe(-0.5);
  });

  it("only takes an SFX down, and only for its peak", () => {
    expect(trimDb(metrics({ lufsI: -30, dBTP: -5 }), null)).toBe(0);
    expect(trimDb(metrics({ lufsI: -5, dBTP: 0.5 }), null)).toBe(-1.5);
    expect(trimDb(metrics({ lufsI: null, dBTP: null }), null)).toBe(0);
    expect(trimDb(metrics({ lufsI: null, dBTP: null }), MUSIC_TARGET_LUFS)).toBe(0);
  });
});

describe("what the metrics say", () => {
  const said = (change: Partial<Metrics>, target: number | null = MUSIC_TARGET_LUFS): string[] =>
    metricFindings(metrics(change), target).map((finding) => `${finding.severity} ${finding.rule}`);

  it("is nothing for a render at the targets", () => {
    expect(said({})).toEqual([]);
  });

  it("fails clipping, and warns about a true peak above -1 dBTP", () => {
    expect(said({ clipped: 12, dBTP: 1.2 })).toEqual(["error clip"]);
    expect(said({ dBTP: -0.4 })).toEqual(["warning peak"]);
    expect(said({ dBTP: -1 })).toEqual([]);
  });

  it("warns about a mix more than 3 LU from the target: the trim would do the mixing", () => {
    expect(LOUDNESS_TOLERANCE_LU).toBe(3);
    expect(said({ lufsI: -13.9 })).toEqual(["warning loudness"]);
    expect(said({ lufsI: -21.1 })).toEqual(["warning loudness"]);
    expect(said({ lufsI: -21 })).toEqual([]);
    // An SFX has no loudness target.
    expect(said({ lufsI: -5 }, null)).toEqual([]);
  });

  it("warns about harsh treble, a clicking loop and silence", () => {
    expect(said({ energyAbove8k: HARSH_RATIO + 0.01 })).toEqual(["warning harsh"]);
    expect(said({ energyAbove8k: HARSH_RATIO })).toEqual([]);
    expect(said({ seam: { jump: 0.3, ratio: 40, click: true } })).toEqual(["warning loop-seam"]);
    expect(said({ seam: { jump: 0.001, ratio: 1, click: false } })).toEqual([]);
    expect(said({ lufsI: null, lufsMomentaryMax: null, dBTP: null })).toEqual(["warning silent"]);
  });

  it("names the render in the path", () => {
    const [finding] = metricFindings(metrics({ dBTP: 0 }), null, "states.rush");
    expect(finding).toMatchObject({ path: "states.rush", rule: "peak" });
    expect(finding?.message).toBe("the true peak is 0 dBTP, above -1 dBTP (the trim brings it down, but the headroom is gone)");
  });
});

describe("the harsh threshold", () => {
  const shareOf = (bars: readonly string[], instrument: Record<string, unknown>): number => {
    const render = renderSong(tinySong({ bars, instrument, loop: true }));
    return measure([render.left, render.right], RATE, { loop: true }).energyAbove8k;
  };
  const env = { a: 0.005, d: 0.1, s: 0.7, r: 0.05 };

  it("is a tenth of the energy", () => {
    expect(HARSH_RATIO).toBe(0.1);
  });

  it("passes a lead alone in the middle of the keyboard and an octave above, at any duty", () => {
    const melody = ["C5 - E5 - | G5 - - - | E5 - C5 - | G4 - - -"];
    const higher = ["C6 - E6 - | G6 - - - | E6 - C6 - | G5 - - -"];
    for (const duty of [0.125, 0.25, 0.5]) {
      expect(shareOf(melody, { wave: "pulse", duty, env })).toBeLessThan(HARSH_RATIO / 3);
      expect(shareOf(higher, { wave: "pulse", duty, env })).toBeLessThan(HARSH_RATIO / 2);
    }
    expect(shareOf(melody, { wave: "triangle", env })).toBeLessThan(0.001);
  });

  it("flags a thin pulse played in the top octave on its own", () => {
    const top = ["C7 - B6 - | C7 - - - | G6 - C7 - | B6 - - -"];
    expect(shareOf(top, { wave: "pulse", duty: 0.125, env })).toBeGreaterThan(HARSH_RATIO * 1.3);
    // The same notes with a wider duty or as a triangle are bright but not harsh.
    expect(shareOf(top, { wave: "pulse", duty: 0.5, env })).toBeLessThan(HARSH_RATIO / 2);
    expect(shareOf(top, { wave: "triangle", env })).toBeLessThan(HARSH_RATIO / 10);
  });

  it("flags a wall of bright noise", () => {
    const hats = ["h h h h | h h h h | h h h h | h h h h"];
    const kit = { drums: { h: { wave: "noise", pitch: "C8", env: { a: 0, d: 0.05, s: 0, r: 0.01 } } } };
    expect(shareOf(hats, kit)).toBeGreaterThan(HARSH_RATIO * 3);
    // A snare-like noise two octaves lower is under the line even on its own.
    const snare = { drums: { h: { wave: "noise", pitch: "A5", env: { a: 0, d: 0.05, s: 0, r: 0.01 } } } };
    expect(shareOf(hats, snare)).toBeLessThan(HARSH_RATIO);
  });
});
