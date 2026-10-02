// The checked-in tables: they are what the build script makes, and the functions that read
// them agree with the real 2^x, tan and sin.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pow2Text, tanText } from "../scripts/make-data.ts";
import { A4_HZ, centsToHz, dbToGain, MAX_CUTOFF_RATIO, midiToHz, panGains, pow2Cents, sinTurns, tanRatio } from "../src/index.ts";

const dataText = (name: string): string => readFileSync(fileURLToPath(new URL(`../data/${name}`, import.meta.url)), "utf8");

describe("the checked-in tables", () => {
  it("are exactly what scripts/make-data.ts builds", () => {
    expect(dataText("pow2.json")).toBe(pow2Text());
    expect(dataText("tan.json")).toBe(tanText());
  });

  it("hold integers only, so a port does not depend on how decimals are parsed", () => {
    for (const name of ["pow2.json", "tan.json"]) {
      const { values, bits } = JSON.parse(dataText(name)) as { values: number[]; bits: number };
      expect(bits).toBe(40);
      expect(values.every((value) => Number.isSafeInteger(value) && value >= 0)).toBe(true);
    }
  });

  it("start and end where the mathematics says", () => {
    const pow2 = JSON.parse(dataText("pow2.json")) as { values: number[] };
    expect(pow2.values).toHaveLength(1201);
    expect(pow2.values[0]).toBe(2 ** 40);
    expect(pow2.values[1200]).toBe(2 ** 41);
    const tan = JSON.parse(dataText("tan.json")) as { values: number[]; last: number };
    expect(tan.values).toHaveLength(tan.last + 1);
    expect(tan.values[0]).toBe(0);
    // tan(pi / 4) is exactly 1.
    expect(tan.values[1024]).toBe(2 ** 40);
  });
});

describe("pow2Cents", () => {
  it("is exact for whole octaves", () => {
    expect(pow2Cents(0)).toBe(1);
    expect(pow2Cents(1200)).toBe(2);
    expect(pow2Cents(-1200)).toBe(0.5);
    expect(pow2Cents(-3600)).toBe(0.125);
    expect(pow2Cents(6000)).toBe(32);
  });

  it("agrees with 2^(cents / 1200) to 11 digits on whole cents", () => {
    for (const cents of [1, 100, 700, 1199, -1, -700, 2350, -4899]) {
      const exact = 2 ** (cents / 1200);
      expect(Math.abs(pow2Cents(cents) / exact - 1)).toBeLessThan(1e-11);
    }
  });

  it("interpolates fractions of a cent to better than a millionth", () => {
    for (const cents of [0.5, 12.25, 699.9, -0.5, -33.3]) {
      const exact = 2 ** (cents / 1200);
      expect(Math.abs(pow2Cents(cents) / exact - 1)).toBeLessThan(1e-7);
    }
  });

  it("never decreases", () => {
    let last = 0;
    for (let cents = -2400; cents <= 2400; cents += 0.25) {
      const value = pow2Cents(cents);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });

  it("refuses a pitch outside 64 octaves", () => {
    expect(() => pow2Cents(80000)).toThrow(RangeError);
    expect(() => pow2Cents(Number.NaN)).toThrow(RangeError);
  });
});

describe("pitch and gain", () => {
  it("tunes A4 to 440 Hz and the other notes in equal temperament", () => {
    expect(A4_HZ).toBe(440);
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBe(880);
    expect(midiToHz(57)).toBe(220);
    expect(midiToHz(60)).toBeCloseTo(261.6255653, 6);
    expect(centsToHz(-900)).toBeCloseTo(261.6255653, 6);
  });

  it("turns decibels into gain", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-20)).toBeCloseTo(0.1, 7);
    expect(dbToGain(-6.020599913279624)).toBeCloseTo(0.5, 7);
    expect(dbToGain(6)).toBeCloseTo(10 ** (6 / 20), 6);
    expect(dbToGain(-60)).toBeCloseTo(0.001, 8);
  });
});

describe("tanRatio", () => {
  it("agrees with tan(pi * ratio)", () => {
    expect(tanRatio(0)).toBe(0);
    expect(tanRatio(0.25)).toBe(1);
    for (const ratio of [100 / 48000, 1000 / 48000, 5000 / 48000, 1800 / 44100, 0.3, 0.44]) {
      expect(Math.abs(tanRatio(ratio) / Math.tan(Math.PI * ratio) - 1)).toBeLessThan(1e-5);
    }
  });

  it("clamps the ratio to 0 .. 0.45", () => {
    expect(MAX_CUTOFF_RATIO).toBe(0.45);
    expect(tanRatio(-1)).toBe(0);
    expect(tanRatio(0.6)).toBe(tanRatio(0.45));
    expect(tanRatio(0.45)).toBeCloseTo(Math.tan(Math.PI * 0.45), 3);
  });
});

describe("sinTurns and panGains", () => {
  it("is the sine of a phase in turns", () => {
    expect(sinTurns(0)).toBe(0);
    expect(sinTurns(0.25)).toBe(1);
    expect(sinTurns(0.75)).toBe(-1);
    for (const phase of [0.01, 0.2, 0.3333, 0.61, 0.99, 3.4, -0.2]) {
      expect(Math.abs(sinTurns(phase) - Math.sin(2 * Math.PI * phase))).toBeLessThan(1e-4);
    }
  });

  it("pans with constant power", () => {
    expect(panGains(-1)).toEqual({ left: 1, right: 0 });
    expect(panGains(1)).toEqual({ left: 0, right: 1 });
    const centre = panGains(0);
    expect(centre.left).toBe(centre.right);
    expect(centre.left).toBeCloseTo(Math.SQRT1_2, 4);
    for (const pan of [-0.7, -0.2, 0.1, 0.5]) {
      const { left, right } = panGains(pan);
      expect(left * left + right * right).toBeCloseTo(1, 4);
      expect(pan < 0 ? left > right : right > left).toBe(true);
    }
    expect(panGains(5)).toEqual(panGains(1));
  });
});
