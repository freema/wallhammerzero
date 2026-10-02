// Easing tables. An easing maps progress `t` in [0, EASE_STEPS] to a 16.16 fixed-point
// weight: 0 at the start and FP_ONE at the end (the "back" easings leave that range on the
// way). Each table is built once from integer formulas, so it is the same on every engine;
// data/vectors.json holds all of them for ports.

import { divRound } from "./int.ts";
import { FP_ONE, icos, isin } from "./trig.ts";

/** Progress units of an easing: `t = EASE_STEPS` is the end. */
export const EASE_STEPS = 256;

const HALF = EASE_STEPS / 2;
// The overshoot constant of the "back" easings, 1.70158, in 16.16 fixed point, and that plus one.
const BACK_C1 = 111515;
const BACK_C3 = BACK_C1 + FP_ONE;
const STEPS_2 = EASE_STEPS * EASE_STEPS;
const STEPS_3 = STEPS_2 * EASE_STEPS;

const FORMULAS = {
  linear: (t: number) => t * 256,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => FP_ONE - (EASE_STEPS - t) * (EASE_STEPS - t),
  inOutQuad: (t: number) => (t < HALF ? 2 * t * t : FP_ONE - 2 * (EASE_STEPS - t) * (EASE_STEPS - t)),
  inCubic: (t: number) => divRound(t * t * t, 256),
  outCubic: (t: number) => FP_ONE - divRound((EASE_STEPS - t) * (EASE_STEPS - t) * (EASE_STEPS - t), 256),
  inOutCubic: (t: number) =>
    t < HALF
      ? divRound(t * t * t, 64)
      : FP_ONE - divRound((EASE_STEPS - t) * (EASE_STEPS - t) * (EASE_STEPS - t), 64),
  // A quarter turn is 1024 angle units, so t * 4 runs over a quarter and t * 8 over a half.
  inSine: (t: number) => FP_ONE - icos(t * 4),
  outSine: (t: number) => isin(t * 4),
  inOutSine: (t: number) => divRound(FP_ONE - icos(t * 8), 2),
  inBack: (t: number) => divRound(BACK_C3 * t * t * t, STEPS_3) - divRound(BACK_C1 * t * t, STEPS_2),
  outBack: (t: number) => {
    const u = t - EASE_STEPS;
    return FP_ONE + divRound(BACK_C3 * u * u * u, STEPS_3) + divRound(BACK_C1 * u * u, STEPS_2);
  },
} as const;

/** The name of an easing. */
export type Easing = keyof typeof FORMULAS;

/** Every easing name, in a fixed order. */
export const EASINGS: readonly Easing[] = Object.freeze(Object.keys(FORMULAS) as Easing[]);

const TABLES = new Map<Easing, Int32Array>();
for (const name of EASINGS) {
  const formula = FORMULAS[name];
  const values = new Int32Array(EASE_STEPS + 1);
  for (let t = 0; t <= EASE_STEPS; t += 1) values[t] = formula(t);
  TABLES.set(name, values);
}

function tableOf(fn: string, easing: Easing): Int32Array {
  const values = TABLES.get(easing);
  if (values === undefined) throw new RangeError(`${fn}: unknown easing ${JSON.stringify(easing)}`);
  return values;
}

/** A copy of one easing table: `EASE_STEPS + 1` fixed-point weights. */
export function easeTable(easing: Easing): Int32Array {
  return tableOf("easeTable", easing).slice();
}

/**
 * The weight of an easing at progress `t` (an integer; values outside `[0, EASE_STEPS]` are
 * clamped), in 16.16 fixed point.
 */
export function ease(easing: Easing, t: number): number {
  if (!Number.isSafeInteger(t)) throw new RangeError(`ease: t must be a safe integer, got ${String(t)}`);
  const values = tableOf("ease", easing);
  return values[t < 0 ? 0 : t > EASE_STEPS ? EASE_STEPS : t] as number;
}

/**
 * The eased value at `step` of `steps` on the way from `from` to `to`: an integer, rounded to
 * the nearest (halves away from zero). `tween("outQuad", 0, 8, 2, 4) === 6`.
 */
export function tween(easing: Easing, from: number, to: number, step: number, steps: number): number {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) {
    throw new RangeError(`tween: from and to must be safe integers, got ${String(from)} and ${String(to)}`);
  }
  if (!Number.isSafeInteger(step) || !Number.isSafeInteger(steps) || steps < 1) {
    throw new RangeError(`tween: need integers step and steps >= 1, got ${String(step)} and ${String(steps)}`);
  }
  const t = divRound(step * EASE_STEPS, steps);
  return from + divRound((to - from) * ease(easing, t), FP_ONE);
}
