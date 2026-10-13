// Traversability as an invariant (the note's acceptance): over many seeds, every walkable cell
// reaches every other one on foot, every stairs has its landings and headroom, every pad
// touches a lane and the lanes are one network. A failing seed is a bug in the generator.

import { describe, expect, it } from "vitest";
import { checkDistrict, districtStats, generateDistrict, K } from "../src/index.ts";
import type { DistrictParams } from "../src/index.ts";

function failures(seeds: Iterable<number>, params: Partial<DistrictParams> = {}): string[] {
  const failed: string[] = [];
  for (const seed of seeds) {
    const check = checkDistrict(generateDistrict(seed, params));
    if (!check.ok) failed.push(`seed ${seed}: ${check.problems.join("; ")}`);
  }
  return failed;
}

function range(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, n) => from + n);
}

describe("every district passes its checks", () => {
  it("for 200 seeds at the default size", () => {
    expect(failures(range(0, 200))).toEqual([]);
  });

  it("for spread-out seeds", () => {
    expect(failures(range(0, 50).map((n) => (n * 0x9e3779b1) >>> 0))).toEqual([]);
  });

  it("for small, large and odd sizes", () => {
    expect(failures(range(0, 40), { width: 12, depth: 12, levels: 10 })).toEqual([]);
    expect(failures(range(0, 20), { width: 20, depth: 40 })).toEqual([]);
    expect(failures(range(0, 10), { width: 64, depth: 48, levels: 24 })).toEqual([]);
    expect(failures(range(0, 20), { streetWidth: 3, blockMin: 6, blockMax: 14 })).toEqual([]);
  });

  it("with every feature at full density", () => {
    const params = { walkwayChance: 100, padChance: 100, canyonLaneChance: 100, hallChance: 100, deepHallChance: 100, megablockChance: 100 };
    expect(failures(range(0, 30), params)).toEqual([]);
  });
});

describe("a district has what the note asks for", () => {
  it("has every kind of cell and every archetype across a few seeds", () => {
    const kinds = new Set<number>();
    const archetypes = new Set<string>();
    for (const seed of range(0, 10)) {
      const district = generateDistrict(seed);
      for (const kind of district.kind) kinds.add(kind);
      for (const building of district.buildings) archetypes.add(building.archetype);
    }
    expect([...kinds].sort((a, b) => a - b)).toEqual(Object.values(K).sort((a, b) => a - b));
    expect([...archetypes].sort()).toEqual(["megablock", "slab", "stepped", "tower"]);
  });

  it("keeps each feature in its band", () => {
    for (const seed of range(0, 20)) {
      const stats = districtStats(generateDistrict(seed));
      const { kinds } = stats;
      expect(kinds.undercity.street + kinds.undercity.solid + kinds.undercity.walkway + kinds.undercity.lane).toBe(0);
      expect(kinds.streets.street).toBeGreaterThan(0);
      expect(kinds.middle.street + kinds.upper.street + kinds.roofs.street + kinds.lanes.street).toBe(0);
      expect(kinds.streets.walkway + kinds.roofs.walkway + kinds.lanes.walkway + kinds.undercity.walkway).toBe(0);
      expect(kinds.lanes.solid + kinds.lanes.deck + kinds.lanes.pad + kinds.lanes.lift).toBe(0);
      expect(kinds.undercity.ruin).toBeGreaterThan(0);
      expect(kinds.lanes.lane).toBeGreaterThan(0);
    }
  });
});
