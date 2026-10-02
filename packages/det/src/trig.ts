// Integer sine and cosine from a checked-in table.
//
// `Math.sin` is "implementation-approximated" in ECMAScript and comes from the platform's C
// library in Godot, so two players can disagree in the last bit. Here an angle is an integer
// (TURN units per full turn) and the result is a 16.16 fixed-point integer read from
// data/isin.json. The table is data: scripts/sin-table.ts builds it with exact integer
// arithmetic, and a test rebuilds and compares it.

import table from "../data/isin.json" with { type: "json" };

/** Angle units in one full turn. A quarter turn is `TURN / 4`. */
export const TURN = 4096;
/** The number of fractional bits of a fixed-point value. */
export const FP_SHIFT = 16;
/** 1.0 in 16.16 fixed point. */
export const FP_ONE = 65536;

const QUARTER_TURN = TURN / 4;

if (table.turn !== TURN || table.one !== FP_ONE || table.quarter.length !== QUARTER_TURN + 1) {
  throw new Error("det: data/isin.json does not match TURN and FP_ONE");
}

const QUARTER: Int32Array = Int32Array.from(table.quarter);

/**
 * The sine of an integer angle (TURN units per turn; any integer, negative too) as a 16.16
 * fixed-point integer in `[-FP_ONE, FP_ONE]`. `isin(TURN / 4) === FP_ONE`.
 */
export function isin(angle: number): number {
  if (!Number.isSafeInteger(angle)) {
    throw new RangeError(`isin: the angle must be a safe integer, got ${String(angle)}`);
  }
  // TURN divides 2^32, so the low bits are the angle modulo TURN, for negative angles too.
  const a = angle & (TURN - 1);
  const step = a & (QUARTER_TURN - 1);
  switch (a >>> 10) {
    case 0:
      return QUARTER[step] as number;
    case 1:
      return QUARTER[QUARTER_TURN - step] as number;
    case 2:
      return -(QUARTER[step] as number) | 0;
    default:
      return -(QUARTER[QUARTER_TURN - step] as number) | 0;
  }
}

/** The cosine of an integer angle, as `isin`. `icos(0) === FP_ONE`. */
export function icos(angle: number): number {
  if (!Number.isSafeInteger(angle)) {
    throw new RangeError(`icos: the angle must be a safe integer, got ${String(angle)}`);
  }
  return isin((angle & (TURN - 1)) + QUARTER_TURN);
}
