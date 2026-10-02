import { describe, expect, it } from "vitest";
import { createRng, fnv1a32, hash32 } from "../src/index.ts";
import type { Rng, RngState } from "../src/index.ts";

function take(rng: Rng, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(rng.next());
  return out;
}

/** sfc32 written the slow, obvious way: BigInt arithmetic modulo 2^32. */
function referenceSfc32(state: RngState, count: number): number[] {
  const M = 0xffffffffn;
  let [a, b, c, counter] = state.map(BigInt) as [bigint, bigint, bigint, bigint];
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = (a + b + counter) & M;
    counter = (counter + 1n) & M;
    a = b ^ (b >> 9n);
    b = (c + (c << 3n)) & M;
    c = (((c << 21n) | (c >> 11n)) & M) + result;
    c &= M;
    out.push(Number(result));
  }
  return out;
}

describe("createRng", () => {
  it("gives the same sequence for the same seed and stream", () => {
    expect(take(createRng(42, "hair"), 100)).toEqual(take(createRng(42, "hair"), 100));
  });

  it("gives different sequences for different seeds and for different streams", () => {
    const base = take(createRng(42, "hair"), 8);
    expect(take(createRng(43, "hair"), 8)).not.toEqual(base);
    expect(take(createRng(42, "skin"), 8)).not.toEqual(base);
    expect(take(createRng(42, "hai"), 8)).not.toEqual(base);
  });

  it("is sfc32: the outputs match a BigInt reference from the same state", () => {
    for (const [seed, stream] of [[0, "a"], [1, "b"], [0xffffffff, "sim/customers"], [2026, "x"]] as const) {
      const rng = createRng(seed, stream);
      const state = rng.state();
      expect(take(rng, 2000)).toEqual(referenceSfc32(state, 2000));
    }
  });

  it("seeds a stream from hash32 of the stream name's FNV-1a hash, then discards 12 outputs", () => {
    const seed = 2026;
    const key = fnv1a32("sparkle");
    const start: RngState = [hash32(key, 1, seed), hash32(key, 2, seed), hash32(key, 3, seed), 1];
    const reference = referenceSfc32(start, 12 + 16);
    expect(take(createRng(seed, "sparkle"), 16)).toEqual(reference.slice(12));
  });

  it("reads a negative seed as its unsigned value", () => {
    expect(createRng(-1, "a").seed).toBe(0xffffffff);
    expect(take(createRng(-1, "a"), 8)).toEqual(take(createRng(0xffffffff, "a"), 8));
  });

  it("rejects seeds that are not 32-bit integers, and bad stream names", () => {
    expect(() => createRng(1.5, "a")).toThrow(/32-bit integer/);
    expect(() => createRng(2 ** 32, "a")).toThrow(/32-bit integer/);
    expect(() => createRng(Number.NaN, "a")).toThrow(/32-bit integer/);
    expect(() => createRng(1, "")).toThrow(/must not be empty/);
    expect(() => createRng(1, "vlasy-ž")).toThrow(/not ASCII/);
  });
});

describe("sub-streams are independent", () => {
  it("adding a stream does not change another stream's output", () => {
    const alone = take(createRng(7, "body"), 64);

    // The same stream, with other streams created and used before and in between.
    const noise = createRng(7, "sparkle");
    take(noise, 1000);
    const body = createRng(7, "body");
    const mixed: number[] = [];
    for (let i = 0; i < 64; i += 1) {
      createRng(7, `extra-${i}`).next();
      noise.int(6);
      mixed.push(body.next());
    }
    expect(mixed).toEqual(alone);
  });

  it("a fork does not depend on, or advance, its parent", () => {
    const parent = createRng(7, "sim");
    const early = take(parent.fork("customers"), 16);
    const before = parent.state();
    take(parent, 500);
    expect(take(parent.fork("customers"), 16)).toEqual(early);
    expect(take(createRng(7, "sim/customers"), 16)).toEqual(early);
    expect(parent.fork("customers").stream).toBe("sim/customers");

    const fresh = createRng(7, "sim");
    expect(fresh.state()).toEqual(before);
    fresh.fork("customers").next();
    expect(fresh.state()).toEqual(before);
  });

  it("streams of one seed are not shifted copies of each other", () => {
    const a = take(createRng(1, "a"), 4096);
    const b = new Set(take(createRng(1, "b"), 4096));
    const shared = a.filter((value) => b.has(value)).length;
    // Two independent lists of 4096 values share about 0.004 values by chance.
    expect(shared).toBeLessThanOrEqual(1);
  });
});

describe("integer draws", () => {
  it("int(n) stays in [0, n) and is uniform", () => {
    const rng = createRng(3, "int");
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60000; i += 1) {
      const value = rng.int(6);
      counts[value] = (counts[value] as number) + 1;
    }
    expect(counts.length).toBe(6);
    // 10000 expected per face; the standard deviation is about 91.
    for (const count of counts) {
      expect(count).toBeGreaterThan(10000 - 450);
      expect(count).toBeLessThan(10000 + 450);
    }
    expect(rng.int(1)).toBe(0);
  });

  it("int(n) has no modulo bias for an n that does not divide 2^32", () => {
    // With n = 3 * 2^30, a plain `next() % n` would give the low quarter twice as often.
    const n = 3 * 2 ** 30;
    const rng = createRng(4, "bias");
    let low = 0;
    const draws = 30000;
    for (let i = 0; i < draws; i += 1) if (rng.int(n) < 2 ** 30) low += 1;
    // Unbiased: 1/3 of the draws (10000, standard deviation about 82). Biased: 1/2 (15000).
    expect(low).toBeGreaterThan(10000 - 400);
    expect(low).toBeLessThan(10000 + 400);
  });

  it("int(2^32) is next()", () => {
    expect(createRng(5, "full").int(2 ** 32)).toBe(createRng(5, "full").next());
  });

  it("range(lo, hi) includes both ends", () => {
    const rng = createRng(6, "range");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(rng.range(-2, 2));
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
    expect(rng.range(9, 9)).toBe(9);
  });

  it("chance(num, den) is never true for 0 and always true for den", () => {
    const rng = createRng(7, "chance");
    let hits = 0;
    for (let i = 0; i < 1000; i += 1) {
      expect(rng.chance(0, 5)).toBe(false);
      expect(rng.chance(5, 5)).toBe(true);
      if (rng.chance(1, 4)) hits += 1;
    }
    expect(hits).toBeGreaterThan(190);
    expect(hits).toBeLessThan(310);
  });

  it("weighted(weights) follows the weights and never picks a zero weight", () => {
    const rng = createRng(8, "weighted");
    const counts = [0, 0, 0];
    for (let i = 0; i < 7000; i += 1) {
      const index = rng.weighted([6, 0, 1]);
      counts[index] = (counts[index] as number) + 1;
    }
    expect(counts[1]).toBe(0);
    expect(counts[0]).toBeGreaterThan(5800);
    expect(counts[0]).toBeLessThan(6200);
  });

  it("pick returns an element and shuffle returns a permutation", () => {
    const rng = createRng(9, "pick");
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i += 1) expect(items).toContain(rng.pick(items));
    const deck = Array.from({ length: 52 }, (_, i) => i);
    const shuffled = rng.shuffle([...deck]);
    expect(shuffled).not.toEqual(deck);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(deck);
  });

  it("rejects arguments outside its integer contract", () => {
    const rng = createRng(1, "errors");
    expect(() => rng.int(0)).toThrow(/\[1, 4294967296\]/);
    expect(() => rng.int(2.5)).toThrow(/integer/);
    expect(() => rng.int(2 ** 32 + 1)).toThrow(/integer/);
    expect(() => rng.range(3, 2)).toThrow(/lo <= hi/);
    expect(() => rng.range(0, 2 ** 33)).toThrow(/hi - lo \+ 1/);
    expect(() => rng.chance(2, 1)).toThrow(/num/);
    expect(() => rng.pick([])).toThrow(/items.length/);
    expect(() => rng.weighted([0, 0])).toThrow(/sum/);
    expect(() => rng.weighted([1, -1])).toThrow(/non-negative/);
    expect(() => rng.fork("")).toThrow(/must not be empty/);
  });
});

describe("state and restore", () => {
  it("a restored generator continues the same sequence", () => {
    const rng = createRng(11, "save");
    take(rng, 37);
    const state = rng.state();
    const expected = take(rng, 50);
    const other = createRng(999, "elsewhere").restore(state);
    expect(take(other, 50)).toEqual(expected);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("rejects a state that is not four unsigned 32-bit integers", () => {
    const rng = createRng(1, "a");
    expect(() => rng.restore([1, 2, 3] as unknown as RngState)).toThrow(/four words/);
    expect(() => rng.restore([1, 2, 3, -1])).toThrow(/unsigned 32-bit/);
  });
});
