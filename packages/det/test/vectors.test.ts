// The checked-in test vectors, checked the way a port checks them: read the JSON, feed the
// inputs to the implementation, compare with `out`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import vectors from "../data/vectors.json" with { type: "json" };
import { stringifyData } from "../scripts/json.ts";
import { buildVectors } from "../scripts/vectors.ts";
import {
  createRng,
  divCeil,
  divRound,
  divTrunc,
  EASE_STEPS,
  easeTable,
  EASINGS,
  fnv1a32,
  fnv1a64Hex,
  FP_ONE,
  hash32,
  icos,
  idiv,
  imod,
  isin,
  isqrt,
  lerpInt,
  mix32,
  mulDiv,
  mulDivRound,
  TURN,
  tween,
} from "../src/index.ts";
import type { Easing } from "../src/index.ts";

function take(count: number, next: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(next());
  return out;
}

describe("data/vectors.json", () => {
  it("is up to date with the implementation (rebuild with `npm run make-data -w @whz/det`)", () => {
    const onDisk = readFileSync(new URL("../data/vectors.json", import.meta.url), "utf8");
    expect(onDisk).toBe(stringifyData(buildVectors()));
  });

  it("holds only integers below 2^53, strings and booleans", () => {
    const visit = (value: unknown, path: string): void => {
      if (typeof value === "number") expect(Number.isSafeInteger(value), path).toBe(true);
      else if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${path}[${i}]`));
      else if (value !== null && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) visit(item, `${path}.${key}`);
      } else expect(["string", "boolean"]).toContain(typeof value);
    };
    visit(vectors, "vectors");
  });

  it("constants", () => {
    expect(vectors.format).toBe("wz.det-vectors/1");
    expect(vectors.constants).toEqual({ TURN, FP_ONE, EASE_STEPS });
  });

  it("mix32, hash32, fnv1a32, fnv1a64", () => {
    expect(vectors.mix32.length).toBeGreaterThan(0);
    for (const v of vectors.mix32) expect(mix32(v.value)).toBe(v.out);
    expect(vectors.hash32.length).toBeGreaterThan(0);
    for (const v of vectors.hash32) expect(hash32(v.x, v.y, v.seed)).toBe(v.out);
    for (const v of vectors.fnv1a32) expect(fnv1a32(v.text)).toBe(v.out);
    for (const v of vectors.fnv1a64) expect(fnv1a64Hex(v.text)).toBe(v.out);
  });

  it("rng: seeding state and raw outputs of every seed and stream", () => {
    expect(vectors.rng.streams.length).toBe(40);
    for (const v of vectors.rng.streams) {
      const rng = createRng(v.seed, v.stream);
      expect([...rng.state()]).toEqual(v.state);
      expect(take(v.next.length, () => rng.next())).toEqual(v.next);
    }
  });

  it("rng: int, range, chance, weighted, shuffle, fork", () => {
    for (const v of vectors.rng.int) {
      const rng = createRng(v.seed, v.stream);
      expect(take(v.out.length, () => rng.int(v.n))).toEqual(v.out);
    }
    for (const v of vectors.rng.range) {
      const rng = createRng(v.seed, v.stream);
      expect(take(v.out.length, () => rng.range(v.lo, v.hi))).toEqual(v.out);
    }
    for (const v of vectors.rng.chance) {
      const rng = createRng(v.seed, v.stream);
      expect(take(v.out.length, () => (rng.chance(v.num, v.den) ? 1 : 0))).toEqual(v.out);
    }
    for (const v of vectors.rng.weighted) {
      const rng = createRng(v.seed, v.stream);
      expect(take(v.out.length, () => rng.weighted(v.weights))).toEqual(v.out);
    }
    for (const v of vectors.rng.shuffle) {
      const items = Array.from({ length: v.length }, (_, i) => i);
      expect(createRng(v.seed, v.stream).shuffle(items)).toEqual(v.out);
    }
    for (const v of vectors.rng.fork) {
      const child = createRng(v.seed, v.stream).fork(v.name);
      expect(child.stream).toBe(v.childStream);
      expect(take(v.next.length, () => child.next())).toEqual(v.next);
    }
  });

  it("idiv, imod, divTrunc, divCeil, divRound, mulDiv, mulDivRound, lerpInt, isqrt", () => {
    expect(vectors.idiv.length).toBe(198);
    for (const v of vectors.idiv) expect(idiv(v.a, v.b)).toBe(v.out);
    for (const v of vectors.imod) expect(imod(v.a, v.b)).toBe(v.out);
    for (const v of vectors.divTrunc) expect(divTrunc(v.a, v.b)).toBe(v.out);
    for (const v of vectors.divCeil) expect(divCeil(v.a, v.b)).toBe(v.out);
    for (const v of vectors.divRound) expect(divRound(v.a, v.b)).toBe(v.out);
    for (const v of vectors.mulDiv) expect(mulDiv(v.a, v.b, v.c)).toBe(v.out);
    for (const v of vectors.mulDivRound) expect(mulDivRound(v.a, v.b, v.c)).toBe(v.out);
    for (const v of vectors.lerpInt) expect(lerpInt(v.from, v.to, v.num, v.den)).toBe(v.out);
    for (const v of vectors.isqrt) expect(isqrt(v.n)).toBe(v.out);
  });

  it("isin, icos, easing tables, tween", () => {
    expect(vectors.isin.length).toBeGreaterThan(30);
    for (const v of vectors.isin) expect(isin(v.angle)).toBe(v.out);
    for (const v of vectors.icos) expect(icos(v.angle)).toBe(v.out);
    expect(Object.keys(vectors.ease.tables)).toEqual([...EASINGS]);
    for (const [easing, values] of Object.entries(vectors.ease.tables)) {
      expect([...easeTable(easing as Easing)]).toEqual(values);
    }
    expect(vectors.tween.length).toBeGreaterThan(100);
    for (const v of vectors.tween) {
      expect(tween(v.easing as Easing, v.from, v.to, v.step, v.steps)).toBe(v.out);
    }
  });
});
