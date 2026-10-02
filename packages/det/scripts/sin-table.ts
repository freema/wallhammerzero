// Builds the quarter-wave sine table of data/isin.json with exact integer arithmetic (BigInt),
// so the table does not depend on any engine's Math.sin. It imports nothing from src/, because
// src/trig.ts needs the table to load.

/** Decimal digits of working precision. The result needs 5; the rest is guard. */
const DIGITS = 45n;
const SCALE = 10n ** DIGITS;
/** Pi, scaled by 10^45. */
const PI = 3141592653589793238462643383279502884197169399n;

/** sin(x) for a fixed-point x in [0, pi/2], by the Taylor series. Both scaled by 10^45. */
function sinFixed(x: bigint): bigint {
  let term = x;
  let sum = x;
  for (let k = 1n; term !== 0n; k += 1n) {
    term = (-term * x * x) / (SCALE * SCALE * (2n * k) * (2n * k + 1n));
    sum += term;
  }
  return sum;
}

/**
 * `round(sin(2 * pi * i / turn) * one)` for i in [0, turn / 4]: the first quarter of the wave.
 * @param turn angle units per full turn (a multiple of 4)
 * @param one  the fixed-point value of 1.0
 */
export function buildSinQuarter(turn: number, one: number): number[] {
  if (!Number.isInteger(turn) || turn < 4 || turn % 4 !== 0) throw new RangeError("turn must be a multiple of 4");
  const quarter = turn / 4;
  const values: number[] = [];
  for (let i = 0; i <= quarter; i += 1) {
    const x = (2n * PI * BigInt(i)) / BigInt(turn);
    const scaled = sinFixed(x) * BigInt(one);
    // Round to the nearest integer. The series is good to about 40 digits; a value closer
    // than 10^-20 to a half would make the rounding doubtful, so that is an error.
    const fraction = scaled % SCALE;
    const gap = fraction > SCALE / 2n ? fraction - SCALE / 2n : SCALE / 2n - fraction;
    if (gap < SCALE / 10n ** 20n) throw new Error(`sin table: entry ${i} is too close to a half to round`);
    values.push(Number((scaled + SCALE / 2n) / SCALE));
  }
  return values;
}
