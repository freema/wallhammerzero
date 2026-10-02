// Builds the two tables of the synth with exact integer arithmetic (BigInt), so they do not
// depend on any engine's Math.pow or Math.tan. It imports nothing from src/, because
// src/tables.ts needs the tables to load.
//
//   pow2: round(2^(i / 1200) * 2^40)             for i = 0 .. 1200   (one octave, in cents)
//   tan:  round(tan(pi * k / 4096) * 2^40)       for k = 0 .. 1900   (cutoff / sample rate)

/** Fractional bits of the working precision. The results need 40; the rest is guard. */
const BITS = 200n;
const ONE = 1n << BITS;

/** Fractional bits of the stored values. */
export const TABLE_BITS = 40;
/** Entries per octave of the pow2 table: one per cent. */
export const POW2_STEPS = 1200;
/** Entries per unit of `cutoff / sampleRate` in the tan table. */
export const TAN_STEPS = 4096;
/** The last entry of the tan table: cutoff / sampleRate = 1900 / 4096 = 0.4639. */
export const TAN_LAST = 1900;

/** ln 2 = sum over k >= 1 of 1 / (k * 2^k). */
function ln2(): bigint {
  let sum = 0n;
  for (let k = 1n; k <= BITS + 16n; k += 1n) sum += ONE / (k << k);
  return sum;
}

/** atan(1 / n) by its series, for an integer n > 1. */
function atanInverse(n: bigint): bigint {
  let power = ONE / n;
  let sum = power;
  for (let k = 1n; power !== 0n; k += 1n) {
    power /= n * n;
    const term = power / (2n * k + 1n);
    sum += k % 2n === 1n ? -term : term;
  }
  return sum;
}

/** Machin's formula: pi = 16 atan(1/5) - 4 atan(1/239). */
function pi(): bigint {
  return 16n * atanInverse(5n) - 4n * atanInverse(239n);
}

const mul = (a: bigint, b: bigint): bigint => (a * b) >> BITS;

/** e^x for a fixed-point x >= 0, by the Taylor series. */
function expFixed(x: bigint): bigint {
  let term = ONE;
  let sum = ONE;
  for (let n = 1n; term !== 0n; n += 1n) {
    term = mul(term, x) / n;
    sum += term;
  }
  return sum;
}

/** sin(x) and cos(x) for a fixed-point x in [0, pi / 2], by the Taylor series. */
function sinCosFixed(x: bigint): { sin: bigint; cos: bigint } {
  const xx = mul(x, x);
  let sinTerm = x;
  let sin = x;
  let cosTerm = ONE;
  let cos = ONE;
  for (let k = 1n; sinTerm !== 0n || cosTerm !== 0n; k += 1n) {
    cosTerm = -mul(cosTerm, xx) / ((2n * k - 1n) * (2n * k));
    cos += cosTerm;
    sinTerm = -mul(sinTerm, xx) / ((2n * k) * (2n * k + 1n));
    sin += sinTerm;
  }
  return { sin, cos };
}

/**
 * A working-precision value rounded to TABLE_BITS fractional bits. The series are good to
 * far more than 100 bits; a value closer than 2^-60 to a half would make the rounding
 * doubtful, so that is an error.
 */
function toTable(value: bigint, what: string): number {
  const shift = BITS - BigInt(TABLE_BITS);
  const unit = 1n << shift;
  const half = unit >> 1n;
  const fraction = value & (unit - 1n);
  const gap = fraction > half ? fraction - half : half - fraction;
  if (gap < unit >> 60n) throw new Error(`${what} is too close to a half to round`);
  return Number((value + half) >> shift);
}

/** `round(2^(i / steps) * 2^40)` for i in [0, steps]. */
export function buildPow2(steps: number = POW2_STEPS): number[] {
  const LN2 = ln2();
  const values: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    values.push(i === 0 ? 2 ** TABLE_BITS : i === steps ? 2 ** (TABLE_BITS + 1) : toTable(expFixed((LN2 * BigInt(i)) / BigInt(steps)), `pow2 entry ${i}`));
  }
  return values;
}

/** `round(tan(pi * k / steps) * 2^40)` for k in [0, last]. */
export function buildTan(steps: number = TAN_STEPS, last: number = TAN_LAST): number[] {
  if (last * 2 >= steps) throw new RangeError("the tan table must stop before a quarter turn");
  const PI = pi();
  const values: number[] = [];
  for (let k = 0; k <= last; k += 1) {
    if (k === 0) {
      values.push(0);
      continue;
    }
    const { sin, cos } = sinCosFixed((PI * BigInt(k)) / BigInt(steps));
    values.push(toTable((sin << BITS) / cos, `tan entry ${k}`));
  }
  return values;
}
