// One voice of the synth: an oscillator, its pitch modulation and its envelope, computed
// sample by sample. Everything here is + - * / on doubles and table reads, so the same note
// gives the same samples on every engine.
//
//   pulse      duty 12.5, 25 or 50 %, band-limited with PolyBLEP at both edges, DC removed
//   triangle   smooth, or the 32-step 16-level triangle of the NES (`stepped`)
//   noise      a 15-bit LFSR clocked at 8 x the note's frequency; `long` taps bits 0 and 1
//              (period 32767), `short` taps bits 0 and 6 (period 93 or 31)
//   wave       a table of 32 four-bit samples, read without interpolation
//
// Pitch (arpeggio, glide, slide, vibrato) is recomputed every 16 samples of the voice's age,
// not per process block, so a render does not depend on how it is cut into blocks.

import type { Tone } from "./instrument.ts";
import { WAVE_MAX, WAVE_SAMPLES } from "./instrument.ts";
import { centsToHz, sinTurns } from "./tables.ts";

/** Pitch is recomputed when `age & CONTROL_MASK` is 0: every 16 samples. */
const CONTROL_MASK = 15;
/** The seconds a vibrato takes to reach its full depth once its delay is over. */
const VIBRATO_FADE_SEC = 0.1;
/** The shortest attack and release: 1 ms, so that no note starts or stops with a click. */
const MIN_RAMP_SEC = 0.001;
/** A noise note at frequency f clocks the LFSR at 8 f (A4 gives 3520 steps a second). */
const NOISE_CLOCK = 8;
/** The highest oscillator frequency, as a part of the sample rate. */
const MAX_FREQUENCY_RATIO = 0.45;
/** The lowest and highest pitch a voice is driven to, in cents from A4 (about 8 Hz to 28 kHz). */
const MIN_CENTS = -6900;
const MAX_CENTS = 7200;

const OFF = 0;
const ATTACK = 1;
const DECAY = 2;
const SUSTAIN = 3;
const RELEASE = 4;

const WAVE_PULSE = 0;
const WAVE_TRIANGLE = 1;
const WAVE_STEPPED = 2;
const WAVE_NOISE = 3;
const WAVE_TABLE = 4;

/** The NES triangle: 15 down to 0, then 0 up to 15, as levels around zero. */
const STEPPED_TRIANGLE = Float64Array.from({ length: WAVE_SAMPLES }, (_, i) => ((i < 16 ? 15 - i : i - 16) - 7.5) / 7.5);

/** What a voice is asked to play. */
export interface NoteSpec {
  readonly tone: Tone;
  /** The pitch in cents from A4. */
  readonly cents: number;
  /** Semitone offsets of an arpeggio, or null. */
  readonly arp: readonly number[] | null;
  /** The linear gain of the note (its velocity). */
  readonly gain: number;
  /** The pitch the note glides in from, in cents from A4; null for no glide. */
  readonly glideFromCents: number | null;
  /** Samples until the note releases by itself; -1 to sound until `noteOff`. */
  readonly gateFrames: number;
}

/** A number of seconds as a whole number of samples, rounded to the nearest. */
export function secondsToFrames(seconds: number, sampleRate: number): number {
  return Math.floor(seconds * sampleRate + 0.5);
}

/** The first state of a voice's noise generator: 15 bits, never zero. */
export function lfsrSeed(hash: number): number {
  const state = hash & 0x7fff;
  return state === 0 ? 1 : state;
}

export class Voice {
  private readonly sampleRate: number;
  private stage = OFF;
  private level = 0;
  private attackStep = 0;
  private decayStep = 0;
  private decayFrames = 0;
  private sustain = 0;
  private releaseFrames = 1;
  private releaseStep = 0;

  private wave = WAVE_PULSE;
  private duty = 0.5;
  private dc = 0;
  private readonly table = new Float64Array(WAVE_SAMPLES);
  private short = false;
  private lfsr: number;

  private phase = 0;
  private increment = 0;
  private age = 0;
  private gateFrames = -1;
  private gain = 0;

  private baseCents = 0;
  private arp: readonly number[] | null = null;
  private arpFrames = 1;
  private glideCents = 0;
  private glideFrames = 0;
  private slideCentsPerFrame = 0;
  private vibratoCents = 0;
  private vibratoTurnsPerFrame = 0;
  private vibratoDelayFrames = 0;
  private vibratoFadeFrames = 1;

  /**
   * @param lfsr the first state of the noise generator (see `lfsrSeed`). It runs on from note
   *             to note, so two hits of a drum are not the same samples.
   */
  constructor(sampleRate: number, lfsr: number) {
    this.sampleRate = sampleRate;
    this.lfsr = lfsrSeed(lfsr);
  }

  /** True while the voice makes sound (a releasing voice is still active). */
  get active(): boolean {
    return this.stage !== OFF;
  }

  /** True while the voice is held: after `noteOn`, before `noteOff` or its gate. */
  get held(): boolean {
    return this.stage !== OFF && this.stage !== RELEASE;
  }

  noteOn(spec: NoteSpec): void {
    const { tone } = spec;
    const rate = this.sampleRate;
    const minRamp = Math.max(1, secondsToFrames(MIN_RAMP_SEC, rate));

    this.wave =
      tone.wave === "pulse" ? WAVE_PULSE : tone.wave === "triangle" ? (tone.stepped ? WAVE_STEPPED : WAVE_TRIANGLE) : tone.wave === "noise" ? WAVE_NOISE : WAVE_TABLE;
    this.duty = tone.duty;
    this.dc = tone.duty * 2 - 1;
    this.short = tone.mode === "short";
    if (this.wave === WAVE_TABLE) {
      const samples = tone.samples ?? [];
      let sum = 0;
      for (let i = 0; i < WAVE_SAMPLES; i += 1) sum += samples[i] ?? 0;
      const mean = sum / WAVE_SAMPLES;
      for (let i = 0; i < WAVE_SAMPLES; i += 1) this.table[i] = ((samples[i] ?? 0) - mean) / (WAVE_MAX / 2);
    }

    this.attackStep = 1 / Math.max(minRamp, secondsToFrames(tone.env.a, rate));
    this.decayFrames = secondsToFrames(tone.env.d, rate);
    this.sustain = tone.env.s;
    this.decayStep = this.decayFrames > 0 ? (1 - tone.env.s) / this.decayFrames : 0;
    this.releaseFrames = Math.max(minRamp, secondsToFrames(tone.env.r, rate));
    this.stage = ATTACK;
    this.level = 0;

    this.baseCents = spec.cents;
    this.arp = spec.arp !== null && spec.arp.length > 0 ? spec.arp : null;
    this.arpFrames = Math.max(1, Math.floor(rate / tone.arpHz));
    this.glideFrames = spec.glideFromCents === null ? 0 : secondsToFrames(tone.glide, rate);
    this.glideCents = spec.glideFromCents === null ? 0 : spec.glideFromCents - spec.cents;
    this.slideCentsPerFrame = (tone.slideSemitonesPerSec * 100) / rate;
    if (tone.vibrato !== null && tone.vibrato.cents > 0) {
      this.vibratoCents = tone.vibrato.cents;
      this.vibratoTurnsPerFrame = tone.vibrato.hz / rate;
      this.vibratoDelayFrames = secondsToFrames(tone.vibrato.delay, rate);
      this.vibratoFadeFrames = Math.max(1, secondsToFrames(VIBRATO_FADE_SEC, rate));
    } else this.vibratoCents = 0;

    this.gain = spec.gain;
    this.gateFrames = spec.gateFrames;
    this.phase = 0;
    this.age = 0;
  }

  /** Starts the release. A voice that is off or already releasing is left alone. */
  noteOff(): void {
    if (this.stage === OFF || this.stage === RELEASE) return;
    if (this.level <= 0) {
      this.stage = OFF;
      return;
    }
    this.releaseStep = this.level / this.releaseFrames;
    this.stage = RELEASE;
  }

  /** Stops the voice at once (used when a player is reset). */
  kill(): void {
    this.stage = OFF;
    this.level = 0;
  }

  /** The pitch of the voice now, with every modulation, as the phase increment per sample. */
  private control(): void {
    const age = this.age;
    let cents = this.baseCents;
    if (this.arp !== null) cents += (this.arp[Math.floor(age / this.arpFrames) % this.arp.length] as number) * 100;
    if (age < this.glideFrames) cents += this.glideCents * (1 - age / this.glideFrames);
    cents += this.slideCentsPerFrame * age;
    if (this.vibratoCents > 0 && age > this.vibratoDelayFrames) {
      const since = age - this.vibratoDelayFrames;
      const depth = since >= this.vibratoFadeFrames ? 1 : since / this.vibratoFadeFrames;
      cents += this.vibratoCents * depth * sinTurns(since * this.vibratoTurnsPerFrame);
    }
    if (cents < MIN_CENTS) cents = MIN_CENTS;
    else if (cents > MAX_CENTS) cents = MAX_CENTS;
    let ratio = centsToHz(cents) / this.sampleRate;
    if (this.wave === WAVE_NOISE) {
      // Steps of the LFSR per sample; at most 8, so that a sample costs a bounded amount.
      ratio *= NOISE_CLOCK;
      this.increment = ratio > 8 ? 8 : ratio;
    } else this.increment = ratio > MAX_FREQUENCY_RATIO ? MAX_FREQUENCY_RATIO : ratio;
  }

  /** Adds the voice's samples to `out[from .. to)`. */
  render(out: Float64Array, from: number, to: number): void {
    if (this.stage === OFF) return;
    for (let i = from; i < to; i += 1) {
      if ((this.age & CONTROL_MASK) === 0) this.control();
      if (this.age === this.gateFrames) this.noteOff();

      // The envelope: straight lines between the stages.
      if (this.stage === ATTACK) {
        this.level += this.attackStep;
        if (this.level >= 1) {
          this.level = 1;
          this.stage = DECAY;
          if (this.decayFrames === 0) {
            this.level = this.sustain;
            this.stage = SUSTAIN;
          }
        }
      } else if (this.stage === DECAY) {
        this.level -= this.decayStep;
        if (this.level <= this.sustain) {
          this.level = this.sustain;
          this.stage = SUSTAIN;
        }
      } else if (this.stage === RELEASE) {
        this.level -= this.releaseStep;
        if (this.level <= 0) this.level = 0;
      }
      if (this.level <= 0 && this.stage !== ATTACK) {
        // A sustain of 0 that was reached, or a release that ran out: nothing more to hear.
        this.stage = OFF;
        return;
      }

      const increment = this.increment;
      let phase = this.phase;
      let value: number;
      if (this.wave === WAVE_PULSE) {
        value = phase < this.duty ? 1 : -1;
        // PolyBLEP: round the rising edge at phase 0 and the falling edge at the duty.
        if (phase < increment) {
          const x = phase / increment;
          value += x + x - x * x - 1;
        } else if (phase > 1 - increment) {
          const x = (phase - 1) / increment;
          value += x * x + x + x + 1;
        }
        let fall = phase - this.duty;
        if (fall < 0) fall += 1;
        if (fall < increment) {
          const x = fall / increment;
          value -= x + x - x * x - 1;
        } else if (fall > 1 - increment) {
          const x = (fall - 1) / increment;
          value -= x * x + x + x + 1;
        }
        value -= this.dc;
      } else if (this.wave === WAVE_TRIANGLE) {
        let shifted = phase + 0.25;
        if (shifted >= 1) shifted -= 1;
        value = 1 - 4 * Math.abs(shifted - 0.5);
      } else if (this.wave === WAVE_STEPPED) {
        value = STEPPED_TRIANGLE[Math.floor(phase * WAVE_SAMPLES)] as number;
      } else if (this.wave === WAVE_TABLE) {
        value = this.table[Math.floor(phase * WAVE_SAMPLES)] as number;
      } else {
        value = (this.lfsr & 1) === 1 ? 1 : -1;
      }

      phase += increment;
      if (this.wave === WAVE_NOISE) {
        while (phase >= 1) {
          phase -= 1;
          const bit = (this.lfsr ^ (this.lfsr >> (this.short ? 6 : 1))) & 1;
          this.lfsr = (this.lfsr >> 1) | (bit << 14);
        }
      } else if (phase >= 1) phase -= 1;
      this.phase = phase;

      out[i] = (out[i] as number) + value * this.level * this.gain;
      this.age += 1;
    }
  }
}
