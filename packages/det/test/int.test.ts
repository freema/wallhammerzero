import { describe, expect, it } from "vitest";
import {
  clamp,
  createRng,
  divCeil,
  divRound,
  divTrunc,
  idiv,
  imod,
  isqrt,
  lerpInt,
  mulDiv,
  mulDivRound,
} from "../src/index.ts";

// Exact references in BigInt. BigInt division truncates toward zero.
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n !== b < 0n ? q - 1n : q;
}
function ceilDiv(a: bigint, b: bigint): bigint {
  return -floorDiv(-a, b);
}
function roundDiv(a: bigint, b: bigint): bigint {
  // Nearest, halves away from zero: floor((2|a| + |b|) / (2|b|)) with the sign put back.
  const abs = (v: bigint): bigint => (v < 0n ? -v : v);
  const magnitude = (2n * abs(a) + abs(b)) / (2n * abs(b));
  return a < 0n !== b < 0n ? -magnitude : magnitude;
}

/** Deterministic test inputs: small values, powers of two, and values up to 2^52. */
function samples(stream: string, count: number): number[] {
  const rng = createRng(1234, stream);
  const out = [0, 1, -1, 2, -2, 3, -3, 255, 256, -256, 65535, 65536, 2 ** 31, -(2 ** 31), 2 ** 32, 2 ** 52, -(2 ** 52)];
  while (out.length < count) {
    const bits = rng.range(1, 52);
    const high = bits > 32 ? rng.int(2 ** (bits - 32)) : 0;
    const low = bits >= 32 ? rng.next() : rng.int(2 ** bits);
    const magnitude = high * 2 ** 32 + low;
    out.push(rng.chance(1, 2) ? -magnitude : magnitude);
  }
  return out;
}

describe("integer division helpers", () => {
  const as = samples("a", 400);
  const bs = samples("b", 400).filter((b) => b !== 0);

  it("match exact BigInt arithmetic, for every sign and size", () => {
    let checked = 0;
    for (let i = 0; i < as.length; i += 1) {
      for (let j = i % 7; j < bs.length; j += 7) {
        const a = as[i] as number;
        const b = bs[j] as number;
        const A = BigInt(a);
        const B = BigInt(b);
        const floor = floorDiv(A, B);
        expect(BigInt(idiv(a, b)), `idiv(${a}, ${b})`).toBe(floor);
        expect(BigInt(imod(a, b)), `imod(${a}, ${b})`).toBe(A - floor * B);
        expect(BigInt(divTrunc(a, b)), `divTrunc(${a}, ${b})`).toBe(A / B);
        expect(BigInt(divCeil(a, b)), `divCeil(${a}, ${b})`).toBe(ceilDiv(A, B));
        expect(BigInt(divRound(a, b)), `divRound(${a}, ${b})`).toBe(roundDiv(A, B));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it("round the way their names say", () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-4);
    expect(idiv(7, -2)).toBe(-4);
    expect(idiv(-7, -2)).toBe(3);
    expect(imod(-7, 4)).toBe(1);
    expect(imod(7, -4)).toBe(-1);
    expect(imod(-8, 4)).toBe(0);
    expect(divTrunc(-7, 2)).toBe(-3);
    expect(divCeil(7, 2)).toBe(4);
    expect(divCeil(-7, 2)).toBe(-3);
    // Halves go away from zero, unlike Math.round(-2.5) === -2.
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(5, -2)).toBe(-3);
    expect(divRound(7, 3)).toBe(2);
    expect(divRound(-7, 3)).toBe(-2);
  });

  it("never return a negative zero", () => {
    for (const value of [idiv(0, -5), imod(0, -5), imod(-8, 4), divTrunc(-1, 2), divCeil(-1, 2), divRound(-1, 3), mulDiv(0, -3, 7), mulDivRound(-1, 1, 3)]) {
      expect(Object.is(value, 0)).toBe(true);
    }
  });

  it("throw on a zero divisor and on anything that is not a safe integer", () => {
    expect(() => idiv(1, 0)).toThrow(/division by zero/);
    expect(() => imod(1, 0)).toThrow(/division by zero/);
    expect(() => divRound(1, 0)).toThrow(/division by zero/);
    expect(() => idiv(1.5, 2)).toThrow(/safe integer/);
    expect(() => idiv(1, Number.NaN)).toThrow(/safe integer/);
    expect(() => imod(2 ** 53, 2)).toThrow(/safe integer/);
    expect(() => divTrunc(Number.POSITIVE_INFINITY, 2)).toThrow(/safe integer/);
  });
});

describe("mulDiv and mulDivRound", () => {
  it("match exact BigInt arithmetic", () => {
    const rng = createRng(99, "muldiv");
    for (let i = 0; i < 5000; i += 1) {
      const a = rng.range(-(2 ** 26), 2 ** 26);
      const b = rng.range(-(2 ** 26), 2 ** 26);
      const c = rng.chance(1, 2) ? rng.range(1, 2 ** 20) : -rng.range(1, 2 ** 20);
      const product = BigInt(a) * BigInt(b);
      expect(BigInt(mulDiv(a, b, c)), `mulDiv(${a}, ${b}, ${c})`).toBe(floorDiv(product, BigInt(c)));
      expect(BigInt(mulDivRound(a, b, c)), `mulDivRound(${a}, ${b}, ${c})`).toBe(roundDiv(product, BigInt(c)));
    }
  });

  it("throw when the product leaves 53 bits, instead of losing bits", () => {
    expect(() => mulDiv(2 ** 30, 2 ** 30, 3)).toThrow(/53 bits/);
    expect(() => mulDivRound(2 ** 52, 4, 3)).toThrow(/53 bits/);
    expect(mulDiv(2 ** 26, 2 ** 26, 2 ** 20)).toBe(2 ** 32);
  });
});

describe("isqrt", () => {
  it("is the floor of the square root", () => {
    const rng = createRng(5, "isqrt");
    const inputs = [0, 1, 2, 3, 4, 15, 16, 17, 2 ** 32 - 1, 2 ** 32, 2 ** 52, 2 ** 53 - 1];
    for (let i = 0; i < 2000; i += 1) inputs.push(rng.next() * rng.int(2 ** 20) + rng.next());
    for (const n of inputs) {
      const root = BigInt(isqrt(n));
      const N = BigInt(n);
      expect(root * root <= N && (root + 1n) * (root + 1n) > N, `isqrt(${n})`).toBe(true);
    }
  });

  it("throws on a negative number", () => {
    expect(() => isqrt(-1)).toThrow(/negative/);
  });
});

describe("clamp and lerpInt", () => {
  it("clamp limits a value to a range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(() => clamp(1, 3, 0)).toThrow(/above/);
  });

  it("lerpInt hits both ends and rounds halves away from zero", () => {
    expect(lerpInt(3, 17, 0, 5)).toBe(3);
    expect(lerpInt(3, 17, 5, 5)).toBe(17);
    expect(lerpInt(0, 10, 1, 4)).toBe(3);
    expect(lerpInt(0, -10, 1, 4)).toBe(-3);
    expect(lerpInt(10, 0, 1, 4)).toBe(7);
  });
});
