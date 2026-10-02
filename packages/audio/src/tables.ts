// The numbers of the synth that would need Math.pow, Math.exp, Math.tan or Math.sin.
//
// Those functions are "implementation-approximated": two engines, or a later port, may
// disagree in the last bit, and one bit is enough to change a PCM hash. So every
// transcendental value is read from a checked-in table and interpolated with + - * / only,
// which IEEE 754 defines exactly:
//
//   data/pow2.json   2^(i / 1200), one octave in cents. Pitch (a note is a number of cents
//                    from A4 = 440 Hz), cents of vibrato and slide, and decibels (a gain is
//                    2^(dB * log2(10) / 20)) all go through `pow2Cents`.
//   data/tan.json    tan(pi * cutoff / sampleRate), the one coefficient of both filters.
//   isin (@whz/det)  the sine of the vibrato LFO and of the pan law.
//
// The tables hold integers (the value times 2^40), so a port reads them without depending on
// how its JSON parser rounds decimal fractions. scripts/make-data.ts builds them with exact
// integer arithmetic, and a test rebuilds and compares them.

import { FP_ONE, isin, TURN } from "@whz/det";
import pow2Data from "../data/pow2.json" with { type: "json" };
import tanData from "../data/tan.json" with { type: "json" };

/** Entries per octave of the pow2 table: one per cent. */
const POW2_STEPS = 1200;
/** Entries per unit of `cutoff / sampleRate` in the tan table. */
const TAN_STEPS = 4096;
/** 2^40: what a stored integer is divided by. */
const TABLE_ONE = 1099511627776;

if (pow2Data.steps !== POW2_STEPS || pow2Data.bits !== 40 || pow2Data.values.length !== POW2_STEPS + 1) {
  throw new Error("audio: data/pow2.json does not match the synth");
}
if (tanData.steps !== TAN_STEPS || tanData.bits !== 40 || tanData.values.length !== tanData.last + 1) {
  throw new Error("audio: data/tan.json does not match the synth");
}

const POW2 = Float64Array.from(pow2Data.values, (value) => value / TABLE_ONE);
const TAN = Float64Array.from(tanData.values, (value) => value / TABLE_ONE);

/** 2^n for n in [-64, 64], by doubling and halving: exact. */
const OCTAVES = new Float64Array(129);
OCTAVES[64] = 1;
for (let n = 1; n <= 64; n += 1) {
  OCTAVES[64 + n] = (OCTAVES[64 + n - 1] as number) * 2;
  OCTAVES[64 - n] = (OCTAVES[64 - n + 1] as number) / 2;
}

/** The frequency of A4, the note every pitch is measured from. */
export const A4_HZ = 440;
/** The MIDI number of A4. */
export const A4_MIDI = 69;
/** Cents per decibel of gain: 1200 * log2(10) / 20. */
const CENTS_PER_DB = 199.31568569324173;
/** The highest `cutoff / sampleRate` a filter is given; higher cutoffs are clamped to it. */
export const MAX_CUTOFF_RATIO = 0.45;

/**
 * 2^(cents / 1200): the frequency ratio of an interval. Whole cents are table entries (so
 * every equal-tempered note is exact to 2^-40); fractions of a cent are interpolated
 * linearly. `cents` is any finite number between -76800 and 76800 (64 octaves).
 */
export function pow2Cents(cents: number): number {
  const octave = Math.floor(cents / POW2_STEPS);
  if (!(octave >= -64 && octave < 64)) throw new RangeError(`pow2Cents: ${String(cents)} cents is out of range`);
  const position = cents - octave * POW2_STEPS;
  let index = Math.floor(position);
  if (index >= POW2_STEPS) index = POW2_STEPS - 1;
  const low = POW2[index] as number;
  const value = low + ((POW2[index + 1] as number) - low) * (position - index);
  return value * (OCTAVES[64 + octave] as number);
}

/** The frequency in Hz of a pitch given in cents above A4 (negative: below). */
export function centsToHz(cents: number): number {
  return A4_HZ * pow2Cents(cents);
}

/** The frequency in Hz of a MIDI note number (69 = A4 = 440 Hz). */
export function midiToHz(midi: number): number {
  return centsToHz((midi - A4_MIDI) * 100);
}

/** The linear gain of a level in decibels. `dbToGain(-6.0206)` is 0.5. */
export function dbToGain(db: number): number {
  return pow2Cents(db * CENTS_PER_DB);
}

/**
 * tan(pi * ratio) for `ratio = cutoff / sampleRate`, the coefficient `g` of the filters.
 * The ratio is clamped to [0, MAX_CUTOFF_RATIO]; between table entries it is interpolated.
 */
export function tanRatio(ratio: number): number {
  const clamped = ratio < 0 ? 0 : ratio > MAX_CUTOFF_RATIO ? MAX_CUTOFF_RATIO : ratio;
  const position = clamped * TAN_STEPS;
  const index = Math.floor(position);
  const low = TAN[index] as number;
  return low + ((TAN[index + 1] as number) - low) * (position - index);
}

/** The sine of a phase in turns (1 = a full cycle), from the integer table of @whz/det. */
export function sinTurns(phase: number): number {
  const position = (phase - Math.floor(phase)) * TURN;
  const index = Math.floor(position);
  const low = isin(index);
  return (low + (isin(index + 1) - low) * (position - index)) / FP_ONE;
}

/**
 * Constant-power pan gains for a pan position in [-1, 1]: left = cos, right = sin of an
 * angle between 0 and a quarter turn. The centre is -3 dB on both sides.
 */
export function panGains(pan: number): { left: number; right: number } {
  const clamped = pan < -1 ? -1 : pan > 1 ? 1 : pan;
  // 512 steps from hard left to hard right; a quarter turn is TURN / 4 = 1024 table steps.
  const step = Math.floor((clamped + 1) * 256 + 0.5);
  return { left: isin(TURN / 4 - step * 2) / FP_ONE, right: isin(step * 2) / FP_ONE };
}
