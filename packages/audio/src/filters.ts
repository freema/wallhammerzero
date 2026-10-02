// The filters and the echo. Both filters are "topology-preserving" forms (trapezoidal
// integrators) whose one coefficient is g = tan(pi * cutoff / sampleRate), read from the
// checked-in table (tables.ts). They stay stable while the cutoff moves, and they need only
// + - * /.

import { tanRatio } from "./tables.ts";

/** 1 / Q of the two-pole low-pass: sqrt(2), the Butterworth response (no resonance peak). */
const DAMPING = 1.4142135623730951;

/** A one-pole filter (6 dB per octave): low-pass, or high-pass as the input minus the low-pass. */
export class OnePole {
  private gain = 0;
  private state = 0;

  constructor(cutoffHz: number, sampleRate: number) {
    this.setCutoff(cutoffHz, sampleRate);
  }

  setCutoff(cutoffHz: number, sampleRate: number): void {
    const g = tanRatio(cutoffHz / sampleRate);
    this.gain = g / (1 + g);
  }

  lowpass(input: number): number {
    const v = (input - this.state) * this.gain;
    const low = v + this.state;
    this.state = low + v;
    return low;
  }

  highpass(input: number): number {
    return input - this.lowpass(input);
  }

  reset(): void {
    this.state = 0;
  }
}

/** A two-pole low-pass (12 dB per octave, Butterworth): a state-variable filter. */
export class Lowpass {
  private g = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private ic1 = 0;
  private ic2 = 0;

  constructor(cutoffHz: number, sampleRate: number) {
    this.setG(tanRatio(cutoffHz / sampleRate));
  }

  /** The coefficient g = tan(pi * cutoff / sampleRate) the filter runs with. */
  get coefficient(): number {
    return this.g;
  }

  /** Sets g directly: a player that glides the cutoff moves g in a straight line. */
  setG(g: number): void {
    this.g = g;
    this.a1 = 1 / (1 + g * (g + DAMPING));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  process(input: number): number {
    const v3 = input - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }

  reset(): void {
    this.ic1 = 0;
    this.ic2 = 0;
  }
}

/** The cutoff of the low-pass inside the echo's feedback loop: each repeat is a little duller. */
const ECHO_DAMPING_HZ = 5000;

/** A feedback delay on one channel: `out = in + mix * delayed`, with a low-pass in the loop. */
export class EchoLine {
  private readonly buffer: Float64Array;
  private readonly feedback: number;
  private readonly mix: number;
  private readonly damping: OnePole;
  private at = 0;

  constructor(delayFrames: number, feedback: number, mix: number, sampleRate: number) {
    this.buffer = new Float64Array(Math.max(1, delayFrames));
    this.feedback = feedback;
    this.mix = mix;
    this.damping = new OnePole(ECHO_DAMPING_HZ, sampleRate);
  }

  process(input: number): number {
    const delayed = this.buffer[this.at] as number;
    this.buffer[this.at] = input + this.feedback * this.damping.lowpass(delayed);
    this.at += 1;
    if (this.at === this.buffer.length) this.at = 0;
    return input + this.mix * delayed;
  }
}
