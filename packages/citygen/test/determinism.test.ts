// The same seed and params give the same district: golden grid hashes, two runs, and seeds
// below the district seed that depend on position, not on what was drawn before.

import { describe, expect, it } from "vitest";
import { generateDistrict, gridHash } from "../src/index.ts";

/**
 * Golden grid hashes. One changes only in a commit that changes the generator on purpose and
 * says why; the slices of the city mockup and the game's saved districts change with it.
 */
const GOLDEN: ReadonlyArray<readonly [seed: number, hash: string]> = [
  [0, "a90ab602c537bceb"],
  [1, "f34ddd92abe3c0ac"],
  [42, "6752930568276cb2"],
  [0xdeadbeef, "c9f13bdd23c9741c"],
];

describe("generateDistrict is deterministic", () => {
  it.each(GOLDEN)("seed %i has its golden grid hash", (seed, hash) => {
    expect(gridHash(generateDistrict(seed))).toBe(hash);
  });

  it("gives identical grids on two runs", () => {
    for (const seed of [3, 99, 123456]) {
      const a = generateDistrict(seed);
      const b = generateDistrict(seed);
      expect(b.kind).toEqual(a.kind);
      expect(b.dir).toEqual(a.dir);
      expect(b.building).toEqual(a.building);
      expect(b.facade).toEqual(a.facade);
      expect(b.buildings).toEqual(a.buildings);
    }
  });

  it("gives different districts for different seeds", () => {
    const hashes = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((seed) => gridHash(generateDistrict(seed))));
    expect(hashes.size).toBe(8);
  });

  it("derives the buildings from their position: features drawn later do not move them", () => {
    // Walkways, pads, lanes and halls come after the buildings and draw from their own seeds,
    // so switching them off leaves every building as it was.
    for (const seed of [5, 77]) {
      const full = generateDistrict(seed);
      const bare = generateDistrict(seed, { walkwayChance: 0, padChance: 0, canyonLaneChance: 0, hallChance: 0 });
      expect(bare.buildings).toEqual(full.buildings);
      expect(bare.walkways).toBe(0);
    }
  });

  it("refuses a seed that is not an unsigned 32-bit integer", () => {
    for (const seed of [-1, 1.5, 2 ** 32, Number.NaN]) expect(() => generateDistrict(seed)).toThrow(RangeError);
  });
});
