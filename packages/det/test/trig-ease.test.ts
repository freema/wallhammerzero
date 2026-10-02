import { describe, expect, it } from "vitest";
import table from "../data/isin.json" with { type: "json" };
import { buildSinQuarter } from "../scripts/sin-table.ts";
import { ease, EASE_STEPS, easeTable, EASINGS, FP_ONE, FP_SHIFT, icos, isin, TURN, tween } from "../src/index.ts";

describe("the sine table (data/isin.json)", () => {
  it("is what the exact integer builder gives", () => {
    expect(table.turn).toBe(TURN);
    expect(table.one).toBe(FP_ONE);
    expect(table.quarter).toEqual(buildSinQuarter(TURN, FP_ONE));
  });

  it("agrees with Math.sin to within rounding", () => {
    // Math.sin is allowed here: this is a cross-check in a test, not a decision path.
    table.quarter.forEach((value, i) => {
      const exact = Math.sin((2 * Math.PI * i) / TURN) * FP_ONE;
      expect(Math.abs(value - exact), `entry ${i}`).toBeLessThanOrEqual(0.5 + 1e-6);
    });
  });

  it("rises from 0 to FP_ONE", () => {
    expect(table.quarter[0]).toBe(0);
    expect(table.quarter[TURN / 4]).toBe(FP_ONE);
    for (let i = 1; i < table.quarter.length; i += 1) {
      expect(table.quarter[i] as number).toBeGreaterThanOrEqual(table.quarter[i - 1] as number);
    }
  });
});

describe("isin and icos", () => {
  it("hit the exact values at the quarter turns", () => {
    expect(FP_ONE).toBe(1 << FP_SHIFT);
    expect(isin(0)).toBe(0);
    expect(isin(TURN / 4)).toBe(FP_ONE);
    expect(isin(TURN / 2)).toBe(0);
    expect(isin((3 * TURN) / 4)).toBe(-FP_ONE);
    expect(icos(0)).toBe(FP_ONE);
    expect(icos(TURN / 4)).toBe(0);
    expect(icos(TURN / 2)).toBe(-FP_ONE);
    expect(isin(TURN / 8)).toBe(46341); // round(65536 / sqrt(2))
    expect(Object.is(isin(TURN / 2), 0)).toBe(true);
  });

  it("wrap any integer angle, negative ones too", () => {
    for (let angle = -TURN; angle <= TURN; angle += 1) {
      expect(isin(angle + TURN)).toBe(isin(angle));
      expect(isin(angle - 3 * TURN)).toBe(isin(angle));
      expect(isin(-angle)).toBe(-isin(angle) + 0);
      expect(icos(-angle)).toBe(icos(angle));
      expect(icos(angle)).toBe(isin(angle + TURN / 4));
    }
    expect(isin(2 ** 40 + 1)).toBe(isin(1));
    expect(isin(-(2 ** 40) - 1)).toBe(isin(-1));
  });

  it("stay on the unit circle to within rounding", () => {
    for (let angle = 0; angle < TURN; angle += 1) {
      const radius = isin(angle) * isin(angle) + icos(angle) * icos(angle);
      expect(Math.abs(radius - FP_ONE * FP_ONE)).toBeLessThanOrEqual(2 * FP_ONE);
    }
  });

  it("throw on an angle that is not an integer", () => {
    expect(() => isin(0.5)).toThrow(/safe integer/);
    expect(() => icos(Number.NaN)).toThrow(/safe integer/);
  });
});

describe("easings", () => {
  it("start at 0 and end at FP_ONE", () => {
    expect(EASINGS.length).toBe(12);
    for (const easing of EASINGS) {
      expect(ease(easing, 0), easing).toBe(0);
      expect(ease(easing, EASE_STEPS), easing).toBe(FP_ONE);
      expect(easeTable(easing).length).toBe(EASE_STEPS + 1);
    }
  });

  it("clamp t outside [0, EASE_STEPS]", () => {
    expect(ease("inQuad", -5)).toBe(0);
    expect(ease("inQuad", EASE_STEPS + 5)).toBe(FP_ONE);
    expect(() => ease("inQuad", 0.5)).toThrow(/safe integer/);
    expect(() => ease("nope" as "linear", 1)).toThrow(/unknown easing/);
  });

  it("never go backwards, except the back easings, which overshoot once", () => {
    for (const easing of EASINGS) {
      const values = easeTable(easing);
      if (easing === "inBack") {
        expect(Math.min(...values)).toBeLessThan(0);
        continue;
      }
      if (easing === "outBack") {
        expect(Math.max(...values)).toBeGreaterThan(FP_ONE);
        continue;
      }
      for (let t = 1; t <= EASE_STEPS; t += 1) {
        expect(values[t] as number, `${easing} at ${t}`).toBeGreaterThanOrEqual(values[t - 1] as number);
      }
    }
  });

  it("have the shapes their names say", () => {
    const half = EASE_STEPS / 2;
    expect(ease("linear", half)).toBe(FP_ONE / 2);
    expect(ease("inQuad", half)).toBe(FP_ONE / 4);
    expect(ease("outQuad", half)).toBe((3 * FP_ONE) / 4);
    expect(ease("inCubic", half)).toBe(FP_ONE / 8);
    expect(ease("outCubic", half)).toBe((7 * FP_ONE) / 8);
    for (const easing of ["inOutQuad", "inOutCubic", "inOutSine"] as const) {
      expect(ease(easing, half), easing).toBe(FP_ONE / 2);
    }
    expect(ease("outSine", half)).toBe(isin(TURN / 8));
    // The in and out forms mirror each other.
    for (let t = 0; t <= EASE_STEPS; t += 1) {
      expect(ease("outQuad", t)).toBe(FP_ONE - ease("inQuad", EASE_STEPS - t));
      expect(ease("outCubic", t)).toBe(FP_ONE - ease("inCubic", EASE_STEPS - t));
      expect(ease("outBack", t)).toBe(FP_ONE - ease("inBack", EASE_STEPS - t));
    }
  });

  it("easeTable returns a copy", () => {
    const copy = easeTable("linear");
    copy[1] = 12345;
    expect(ease("linear", 1)).toBe(256);
  });
});

describe("tween", () => {
  it("hits both ends and returns integers", () => {
    for (const easing of EASINGS) {
      expect(tween(easing, -3, 40, 0, 7)).toBe(-3);
      expect(tween(easing, -3, 40, 7, 7)).toBe(40);
      for (let step = 0; step <= 7; step += 1) {
        expect(Number.isInteger(tween(easing, -3, 40, step, 7))).toBe(true);
      }
    }
  });

  it("gives the documented example", () => {
    expect(tween("outQuad", 0, 8, 2, 4)).toBe(6);
    expect(tween("linear", 0, 3, 1, 2)).toBe(2);
    expect(tween("linear", 0, -3, 1, 2)).toBe(-2);
  });

  it("rejects floats and a zero step count", () => {
    expect(() => tween("linear", 0.5, 1, 0, 4)).toThrow(/safe integers/);
    expect(() => tween("linear", 0, 1, 0, 0)).toThrow(/steps >= 1/);
  });
});
