// One voice, the filters and the echo: the waveforms, the envelope and the pitch modulation,
// measured on the samples.

import { describe, expect, it } from "vitest";
import { EchoLine, lfsrSeed, Lowpass, OnePole, secondsToFrames, tanRatio, Voice } from "../src/index.ts";
import type { NoteSpec, Tone } from "../src/index.ts";
import { firstDifference, peakOf, risingCrossings, sine, tone } from "./helpers.ts";

const RATE = 48000;

function spec(change: Partial<NoteSpec> & { tone: Tone }): NoteSpec {
  return { cents: 0, arp: null, gain: 1, glideFromCents: null, gateFrames: -1, ...change };
}

/** Renders a note of `frames` samples on a fresh voice. */
function play(note: NoteSpec, frames: number, sampleRate = RATE, seed = 1): Float64Array {
  const voice = new Voice(sampleRate, seed);
  voice.noteOn(note);
  const out = new Float64Array(frames);
  voice.render(out, 0, frames);
  return out;
}

function mean(signal: Float64Array, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += signal[i] as number;
  return sum / (to - from);
}

function distinct(signal: Float64Array, from: number, to: number): number[] {
  const values = new Set<number>();
  for (let i = from; i < to; i += 1) values.add(Math.round((signal[i] as number) * 1e9) / 1e9);
  return [...values].sort((a, b) => a - b);
}

describe("the pulse", () => {
  it.each([0.125, 0.25, 0.5])("with a duty of %f is high for that part of the cycle and has no DC", (duty) => {
    // 440 Hz at 48 kHz: 43200 samples are 396 whole cycles.
    const out = play(spec({ tone: tone({ wave: "pulse", duty }) }), 48000);
    expect(Math.abs(mean(out, 4800, 48000))).toBeLessThan(0.005);
    let high = 0;
    for (let i = 4800; i < 48000; i += 1) if ((out[i] as number) > 0) high += 1;
    // The rounded edges add about a sample per cycle of 109.
    expect(Math.abs(high / 43200 - duty)).toBeLessThan(0.012);
    expect(risingCrossings(out, 4800, 48000)).toBe(396);
  });

  it("has rounded edges: several times less energy folded back than a naive pulse", () => {
    // A 12.5 % pulse at C7 (2093 Hz). Aliases land between the harmonics; the band under the
    // fundamental holds nothing but aliases.
    const cents = (96 - 69) * 100;
    const out = play(spec({ tone: tone({ wave: "pulse", duty: 0.125 }), cents }), 32768);
    const hz = 440 * 2 ** (cents / 1200);
    const naive = Float64Array.from({ length: 32768 }, (_, i) => (((i * hz) / RATE) % 1 < 0.125 ? 1.75 : -0.25));
    const lowBand = (signal: Float64Array): number => {
      // The power between 200 Hz and 1800 Hz, by correlation with sines every 100 Hz.
      let power = 0;
      for (let f = 200; f <= 1800; f += 100) {
        let re = 0;
        let im = 0;
        for (let i = 8192; i < 32768; i += 1) {
          const angle = (2 * Math.PI * f * i) / RATE;
          re += (signal[i] as number) * Math.cos(angle);
          im += (signal[i] as number) * Math.sin(angle);
        }
        power += re * re + im * im;
      }
      return power;
    };
    expect(lowBand(out)).toBeLessThan(lowBand(naive) / 4);
  });
});

describe("the triangle", () => {
  it("is smooth and reaches both ends", () => {
    const out = play(spec({ tone: tone({ wave: "triangle" }), cents: -2400 }), 9600);
    expect(peakOf(out, 1000)).toBeGreaterThan(0.99);
    expect(peakOf(out, 1000)).toBeLessThanOrEqual(1);
    expect(distinct(out, 1000, 9600).length).toBeGreaterThan(200);
    expect(Math.abs(mean(out, 960, 960 + 8640))).toBeLessThan(0.01);
  });

  it("has 16 levels in 32 steps with the 4-bit option", () => {
    const out = play(spec({ tone: tone({ wave: "triangle", stepped: true }), cents: -2400 }), 9600);
    const levels = distinct(out, 1000, 9600);
    expect(levels).toHaveLength(16);
    levels.forEach((level, k) => expect(level).toBeCloseTo((k - 7.5) / 7.5, 8));
    // 110 Hz at 48 kHz: 19.7 cycles in 8600 samples, and a cycle changes level 30 times (the
    // top and the bottom level each last two steps).
    let changes = 0;
    for (let i = 1001; i < 9600; i += 1) if (out[i] !== out[i - 1]) changes += 1;
    expect(changes).toBeGreaterThanOrEqual(585);
    expect(changes).toBeLessThanOrEqual(597);
  });
});

describe("the wave channel", () => {
  it("plays its 32 four-bit samples around zero", () => {
    const samples = Array.from("0123456789abcdeffedcba9876543210", (digit) => Number.parseInt(digit, 16));
    const out = play(spec({ tone: tone({ wave: "wave", samples }), cents: -2400 }), 9600);
    const levels = distinct(out, 1000, 9600);
    expect(levels).toHaveLength(16);
    expect(levels[0]).toBeCloseTo(-1, 8);
    expect(levels[15]).toBeCloseTo(1, 8);
    expect(risingCrossings(out, 960, 9600)).toBe(20);
  });

  it("is silent for a flat table: the mean is removed", () => {
    const out = play(spec({ tone: tone({ wave: "wave", samples: new Array<number>(32).fill(9) }) }), 4800);
    expect(peakOf(out)).toBe(0);
  });
});

describe("the noise", () => {
  // At 8 kHz the top pitch clocks the generator 8 times per sample (the most it is driven
  // to): a sample is every 8th output bit, and 8 shares no factor with either period.
  const noise = (mode: "long" | "short", seed: number, frames: number): boolean[] => {
    const out = play(spec({ tone: tone({ wave: "noise", mode }), cents: 7200 }), frames, 8000, seed);
    return Array.from(out, (value) => value > 0);
  };

  it("is a 15-bit shift register with a period of 32767 in the long mode", () => {
    const bits = noise("long", 0x1234, 16 + 2 * 32767);
    for (let i = 16; i < 16 + 32767; i += 1) if (bits[i] !== bits[i + 32767]) throw new Error(`not periodic at ${i}`);
    // 32767 = 7 * 31 * 151: no shorter period.
    for (const shorter of [32767 / 7, 32767 / 31, 32767 / 151]) {
      let same = true;
      for (let i = 16; i < 16 + 32767 && same; i += 1) same = bits[i] === bits[i + shorter];
      expect(same).toBe(false);
    }
    // A maximal-length sequence has one more 1 than 0.
    const ones = bits.slice(16, 16 + 32767).filter(Boolean).length;
    expect(ones).toBe(16384);
  });

  it("has a period of 93 (or 31) in the short mode", () => {
    for (const seed of [1, 0x1234, 0x7fff, 0x2aaa]) {
      const bits = noise("short", seed, 16 + 4 * 93);
      for (let i = 16; i < 16 + 3 * 93; i += 1) expect(bits[i]).toBe(bits[i + 93]);
      const ones = bits.slice(16, 16 + 93).filter(Boolean).length;
      expect(ones).toBeGreaterThan(0);
      expect(ones).toBeLessThan(93);
    }
  });

  it("is seeded: the same seed gives the same noise, another seed another", () => {
    expect(noise("long", 77, 2000)).toEqual(noise("long", 77, 2000));
    expect(noise("long", 77, 2000)).not.toEqual(noise("long", 78, 2000));
  });

  it("never starts from the state that would stay silent", () => {
    expect(lfsrSeed(0)).toBe(1);
    expect(lfsrSeed(0x8000)).toBe(1);
    expect(lfsrSeed(0x1234)).toBe(0x1234);
    expect(lfsrSeed(0xffff1234)).toBe(0x1234);
    const bits = noise("long", 0, 2000);
    expect(new Set(bits.slice(16)).size).toBe(2);
  });

  it("runs on from note to note: two hits are not the same samples", () => {
    const voice = new Voice(RATE, 5);
    const hit = spec({ tone: tone({ wave: "noise", env: { a: 0, d: 0.02, s: 0, r: 0 } }), cents: 3000, gateFrames: 960 });
    const first = new Float64Array(2000);
    const second = new Float64Array(2000);
    voice.noteOn(hit);
    voice.render(first, 0, 2000);
    voice.noteOn(hit);
    voice.render(second, 0, 2000);
    expect(firstDifference(first, second)).toBeGreaterThanOrEqual(0);
    expect(peakOf(first)).toBeCloseTo(peakOf(second), 6);
  });

  it("gets brighter with the pitch", () => {
    const flips = (cents: number): number => {
      const out = play(spec({ tone: tone({ wave: "noise" }), cents }), 48000);
      let count = 0;
      for (let i = 1; i < out.length; i += 1) if (out[i] > 0 !== out[i - 1] > 0) count += 1;
      return count;
    };
    // The generator steps 8 times per cycle of the note, and half of the steps flip the output.
    expect(flips(0)).toBeGreaterThan(1500);
    expect(flips(0)).toBeLessThan(2000);
    expect(flips(1200)).toBeGreaterThan(3200);
    expect(flips(1200)).toBeLessThan(3900);
  });
});

describe("the envelope", () => {
  // Noise is +1 or -1, so the magnitude of a sample is the envelope itself.
  const env = { a: 0.01, d: 0.02, s: 0.5, r: 0.03 };
  const noisy = tone({ wave: "noise", env });

  it("rises, decays to the sustain level, holds, and releases in straight lines", () => {
    const voice = new Voice(RATE, 3);
    voice.noteOn(spec({ tone: noisy, gain: 0.8 }));
    const held = new Float64Array(4800);
    voice.render(held, 0, 4800);
    const level = (signal: Float64Array, i: number): number => Math.abs(signal[i] as number) / 0.8;
    expect(level(held, 0)).toBeCloseTo(1 / 480, 9);
    expect(level(held, 239)).toBeCloseTo(0.5, 9);
    expect(level(held, 479)).toBeCloseTo(1, 9);
    // Sums of 1/480 do not land on 1 exactly, so the top may come one sample late.
    expect(level(held, 480)).toBeGreaterThan(0.998);
    expect(level(held, 479 + 480)).toBeCloseTo(0.75, 2);
    expect(level(held, 479 + 961)).toBeCloseTo(0.5, 9);
    expect(level(held, 4799)).toBe(0.5);
    expect(voice.held).toBe(true);

    voice.noteOff();
    expect(voice.held).toBe(false);
    expect(voice.active).toBe(true);
    const released = new Float64Array(2000);
    voice.render(released, 0, 2000);
    expect(level(released, 719)).toBeCloseTo(0.25, 6);
    expect(level(released, 1430)).toBeCloseTo((0.5 * 9) / 1440, 6);
    expect(peakOf(released, 1441)).toBe(0);
    expect(voice.active).toBe(false);
  });

  it("never starts or stops faster than 1 ms", () => {
    const voice = new Voice(RATE, 3);
    voice.noteOn(spec({ tone: tone({ wave: "noise", env: { a: 0, d: 0, s: 1, r: 0 } }) }));
    const out = new Float64Array(200);
    voice.render(out, 0, 100);
    expect(Math.abs(out[0] as number)).toBeCloseTo(1 / 48, 9);
    expect(Math.abs(out[47] as number)).toBe(1);
    voice.noteOff();
    voice.render(out, 100, 200);
    expect(Math.abs(out[100] as number)).toBeCloseTo(47 / 48, 9);
    expect(Math.abs(out[146] as number)).toBeCloseTo(1 / 48, 9);
    expect(peakOf(out, 147)).toBe(0);
  });

  it("releases by itself at its gate", () => {
    const out = play(spec({ tone: tone({ wave: "noise" }), gateFrames: 1000 }), 2000);
    expect(Math.abs(out[999] as number)).toBe(1);
    expect(Math.abs(out[1000] as number)).toBeCloseTo(47 / 48, 9);
    expect(peakOf(out, 1047)).toBe(0);
  });

  it("stops when a sustain of 0 is reached", () => {
    const voice = new Voice(RATE, 3);
    voice.noteOn(spec({ tone: tone({ wave: "noise", env: { a: 0, d: 0.01, s: 0, r: 0.5 } }) }));
    const out = new Float64Array(2000);
    voice.render(out, 0, 2000);
    expect(Math.abs(out[48 + 239] as number)).toBeCloseTo(0.5, 2);
    expect(peakOf(out, 48 + 480)).toBe(0);
    expect(voice.active).toBe(false);
  });

  it("scales with the gain of the note, and can be killed", () => {
    const loud = play(spec({ tone: noisy, gain: 9 / 7 }), 2000);
    const soft = play(spec({ tone: noisy, gain: 3 / 7 }), 2000);
    expect(peakOf(loud) / peakOf(soft)).toBeCloseTo(3, 9);
    const voice = new Voice(RATE, 3);
    voice.noteOn(spec({ tone: noisy }));
    voice.kill();
    expect(voice.active).toBe(false);
    const out = new Float64Array(100);
    voice.render(out, 0, 100);
    expect(peakOf(out)).toBe(0);
  });

  it("adds to what is in the buffer", () => {
    const voice = new Voice(RATE, 3);
    voice.noteOn(spec({ tone: tone({ wave: "triangle" }) }));
    const out = new Float64Array(500).fill(10);
    voice.render(out, 100, 400);
    expect(out[99]).toBe(10);
    expect(out[400]).toBe(10);
    expect(Math.abs((out[300] as number) - 10)).toBeLessThanOrEqual(1);
    expect(firstDifference(out, new Float64Array(500).fill(10), 100, 400)).toBeGreaterThanOrEqual(100);
  });
});

describe("the pitch", () => {
  const triangle = tone({ wave: "triangle" });
  /**
   * Cycles in `[from, to)`. The triangle starts at zero going up, so a window that starts on a
   * whole number of cycles has a crossing on its very edge; the count is taken 30 samples later.
   */
  const cycles = (signal: Float64Array, from: number, to: number): number => risingCrossings(signal, from + 30, to + 30);

  it("is 440 Hz for A4, and doubles per octave", () => {
    expect(cycles(play(spec({ tone: triangle }), RATE + 30), 0, RATE)).toBe(440);
    expect(cycles(play(spec({ tone: triangle, cents: 1200 }), RATE + 30), 0, RATE)).toBe(880);
    expect(Math.abs(cycles(play(spec({ tone: triangle, cents: -900 }), RATE + 30), 0, RATE) - 261.6)).toBeLessThan(1);
  });

  it("is the same note at another sample rate", () => {
    expect(cycles(play(spec({ tone: triangle }), 44130, 44100), 0, 44100)).toBe(440);
    expect(cycles(play(spec({ tone: triangle }), 8030, 8000), 0, 8000)).toBe(440);
  });

  it("steps through an arpeggio at arpHz", () => {
    // 10 steps a second: 4800 samples on A4, then 4800 on A5.
    const out = play(spec({ tone: tone({ wave: "triangle", arpHz: 10 }), arp: [0, 12] }), 19230);
    expect(cycles(out, 0, 4800)).toBe(44);
    expect(cycles(out, 4800, 9600)).toBe(88);
    expect(cycles(out, 9600, 14400)).toBe(44);
    expect(cycles(out, 14400, 19200)).toBe(88);
  });

  it("slides by semitones per second", () => {
    // An octave up in a second from 220 Hz: 220 / ln 2 = 317.4 cycles.
    const up = play(spec({ tone: tone({ wave: "triangle", slideSemitonesPerSec: 12 }), cents: -1200 }), RATE);
    expect(Math.abs(risingCrossings(up, 0, RATE) - 317.4)).toBeLessThan(1.5);
    // The second half is faster than the first.
    expect(risingCrossings(up, 24000, 48000)).toBeGreaterThan(risingCrossings(up, 0, 24000) + 40);
    const down = play(spec({ tone: tone({ wave: "triangle", slideSemitonesPerSec: -12 }), cents: 0 }), RATE);
    expect(Math.abs(risingCrossings(down, 0, RATE) - 317.4)).toBeLessThan(1.5);
  });

  it("glides in from the note before it", () => {
    // From A3 to A4 over 0.1 s: 0.1 * 220 / ln 2 = 31.7 cycles instead of 44, then 440 Hz.
    const out = play(spec({ tone: tone({ wave: "triangle", glide: 0.1 }), glideFromCents: -1200 }), RATE);
    expect(Math.abs(risingCrossings(out, 0, 4800) - 31.7)).toBeLessThan(1.5);
    expect(risingCrossings(out, 4800, RATE)).toBe(396);
    const plain = play(spec({ tone: tone({ wave: "triangle", glide: 0.1 }), glideFromCents: null }), RATE);
    expect(cycles(plain, 0, 4800)).toBe(44);
  });

  it("starts its vibrato after the delay and fades it in", () => {
    const vibrato = { cents: 100, hz: 5, delay: 0.1 };
    const plain = play(spec({ tone: triangle }), RATE);
    const wobbly = play(spec({ tone: tone({ wave: "triangle", vibrato }) }), RATE);
    // Pitch is set every 16 samples; the first block after the delay is the first to move.
    expect(firstDifference(plain, wobbly)).toBeGreaterThanOrEqual(4816);
    expect(firstDifference(plain, wobbly)).toBeLessThan(4816 + 32);
    // A sine around the note: the count of cycles hardly changes.
    expect(Math.abs(risingCrossings(wobbly, 0, RATE) - 440)).toBeLessThanOrEqual(2);
    // Deep in the vibrato the period swings by a semitone each way: cycles of 103 to 116 samples.
    const periods: number[] = [];
    let last = -1;
    for (let i = 24001; i < RATE; i += 1) {
      if ((wobbly[i - 1] as number) < 0 && (wobbly[i] as number) >= 0) {
        if (last >= 0) periods.push(i - last);
        last = i;
      }
    }
    expect(Math.min(...periods)).toBeLessThanOrEqual(104);
    expect(Math.max(...periods)).toBeGreaterThanOrEqual(115);
  });

  it("is limited, so no pitch leaves the range the oscillators can make", () => {
    const out = play(spec({ tone: tone({ wave: "pulse", slideSemitonesPerSec: 480 }), cents: 6000 }), 4800);
    expect(out.every((value) => Number.isFinite(value))).toBe(true);
    const low = play(spec({ tone: tone({ wave: "triangle", slideSemitonesPerSec: -480 }), cents: -6000 }), 4800);
    expect(low.every((value) => Number.isFinite(value))).toBe(true);
  });
});

describe("rendering in pieces", () => {
  it("gives the same samples however the note is cut into blocks", () => {
    const note = spec({
      tone: tone({ wave: "pulse", duty: 0.25, env: { a: 0.01, d: 0.05, s: 0.6, r: 0.1 }, vibrato: { cents: 30, hz: 6, delay: 0.02 }, slideSemitonesPerSec: 3 }),
      arp: [0, 4, 7],
      gateFrames: 5000,
    });
    const whole = play(note, 12000);
    const voice = new Voice(RATE, 1);
    voice.noteOn(note);
    const pieces = new Float64Array(12000);
    let at = 0;
    for (const size of [1, 7, 128, 1000, 333, 16, 15, 4096, 6404]) {
      voice.render(pieces, at, at + size);
      at += size;
    }
    expect(at).toBe(12000);
    expect(firstDifference(whole, pieces)).toBe(-1);
  });
});

describe("seconds as samples", () => {
  it("rounds to the nearest sample", () => {
    expect(secondsToFrames(0.001, 48000)).toBe(48);
    expect(secondsToFrames(0.0001, 44100)).toBe(4);
    expect(secondsToFrames(0, 48000)).toBe(0);
    expect(secondsToFrames(1.00001, 48000)).toBe(48000);
  });
});

describe("the low-pass", () => {
  const amplitude = (filter: (x: number) => number, hz: number): number => {
    const input = sine(hz, 0.5, 1);
    let peak = 0;
    input.forEach((x, i) => {
      const y = filter(x);
      if (i > 12000) peak = Math.max(peak, Math.abs(y));
    });
    return peak;
  };

  it("passes what is below its cutoff, is 3 dB down at it, and falls 12 dB per octave above", () => {
    const at = (hz: number): number => {
      const filter = new Lowpass(1000, RATE);
      return amplitude((x) => filter.process(x), hz);
    };
    expect(at(100)).toBeCloseTo(1, 3);
    expect(at(1000)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(at(4000) / at(8000)).toBeGreaterThan(3.9);
    expect(at(8000)).toBeLessThan(0.016);
  });

  it("settles on a constant input", () => {
    const filter = new Lowpass(1000, RATE);
    let y = 0;
    for (let i = 0; i < 4000; i += 1) y = filter.process(1);
    expect(y).toBeCloseTo(1, 9);
    filter.reset();
    expect(filter.process(0)).toBe(0);
  });

  it("takes its coefficient from the table, and lets a player move it", () => {
    const filter = new Lowpass(1000, RATE);
    expect(filter.coefficient).toBe(tanRatio(1000 / RATE));
    filter.setG(0.5);
    expect(filter.coefficient).toBe(0.5);
    // A cutoff above the highest the table holds is clamped.
    expect(new Lowpass(30000, RATE).coefficient).toBe(tanRatio(0.45));
  });

  it("has a one-pole sibling: low-pass and high-pass", () => {
    const low = (hz: number): number => {
      const filter = new OnePole(1000, RATE);
      return amplitude((x) => filter.lowpass(x), hz);
    };
    const high = (hz: number): number => {
      const filter = new OnePole(1000, RATE);
      return amplitude((x) => filter.highpass(x), hz);
    };
    expect(low(1000)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(high(1000)).toBeCloseTo(Math.SQRT1_2, 2);
    expect(low(100)).toBeGreaterThan(0.99);
    expect(high(100)).toBeLessThan(0.11);
    expect(high(10000)).toBeGreaterThan(0.99);
    const filter = new OnePole(1000, RATE);
    let y = 1;
    for (let i = 0; i < 4000; i += 1) y = filter.highpass(1);
    expect(Math.abs(y)).toBeLessThan(1e-9);
  });
});

describe("the echo", () => {
  it("repeats the input after the delay, each repeat quieter and duller", () => {
    const echo = new EchoLine(100, 0.5, 0.25, RATE);
    const out = Float64Array.from({ length: 400 }, (_, i) => echo.process(i === 0 ? 1 : 0));
    expect(out[0]).toBe(1);
    expect(peakOf(out, 1, 100)).toBe(0);
    expect(out[100]).toBe(0.25);
    expect(peakOf(out, 101, 200)).toBe(0);
    // The second repeat went through the loop's low-pass: the same energy, spread out.
    expect(out[200]).toBeGreaterThan(0.02);
    expect(out[200]).toBeLessThan(0.125);
    let sum = 0;
    for (let i = 200; i < 300; i += 1) sum += out[i] as number;
    expect(sum).toBeCloseTo(0.125, 4);
    let third = 0;
    for (let i = 300; i < 400; i += 1) third += out[i] as number;
    expect(third).toBeCloseTo(0.0625, 3);
  });

  it("passes the input through untouched", () => {
    const echo = new EchoLine(10, 0.5, 0, RATE);
    for (let i = 0; i < 100; i += 1) expect(echo.process(i / 100)).toBe(i / 100);
  });
});
