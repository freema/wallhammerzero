// The checker finds what breaks: a district is cut on purpose and the check must say so.

import { describe, expect, it } from "vitest";
import { cellIndex, checkDistrict, DX, DY, generateDistrict, isWalkable, K, reachFrom } from "../src/index.ts";
import type { District } from "../src/index.ts";

function copy(district: District): District {
  return { ...district, kind: district.kind.slice(), dir: district.dir.slice(), building: district.building.slice(), facade: district.facade.slice() };
}

function find(district: District, kind: number): number {
  const i = district.kind.indexOf(kind);
  if (i < 0) throw new Error(`no ${kind} cell`);
  return i;
}

/** An empty cell of `level` whose six neighbours are empty too. */
function isolated(district: District, level: number): number {
  const plane = district.width * district.depth;
  for (let y = 1; y + 1 < district.depth; y += 1) {
    for (let x = 1; x + 1 < district.width; x += 1) {
      const i = cellIndex(district, x, y, level);
      const around = [i, i - 1, i + 1, i - district.width, i + district.width, i - plane, i + plane];
      if (around.every((j) => district.kind[j] === K.empty)) return i;
    }
  }
  throw new Error(`no isolated cell on level ${level}`);
}

describe("checkDistrict", () => {
  const base = generateDistrict(11);

  it("passes the generated district", () => {
    const check = checkDistrict(base);
    expect(check.problems).toEqual([]);
    expect(check.ok).toBe(true);
    expect(check.walkGroups).toHaveLength(1);
    expect(check.laneGroups).toHaveLength(1);
  });

  it("finds stairs without a landing", () => {
    const broken = copy(base);
    const i = find(broken, K.stairs);
    const d = broken.dir[i] as number;
    const low = i - (DX[d] as number) - (DY[d] as number) * broken.width;
    broken.kind[low] = K.empty;
    const check = checkDistrict(broken);
    expect(check.ok).toBe(false);
    expect(check.problems.some((p) => p.includes("no low landing"))).toBe(true);
  });

  it("finds a pad without a lane", () => {
    const broken = copy(base);
    const pad = find(broken, K.pad);
    const plane = broken.width * broken.depth;
    for (let i = pad + plane; i < broken.kind.length && broken.kind[i] === K.lane; i += plane) broken.kind[i] = K.empty;
    const check = checkDistrict(broken);
    expect(check.padsWithoutLane).toBe(1);
    expect(check.ok).toBe(false);
  });

  it("finds a walkable cell nobody reaches", () => {
    const broken = copy(base);
    // A deck floating in the air, with nothing around it.
    broken.kind[isolated(broken, broken.params.bands.upper[1])] = K.deck;
    const check = checkDistrict(broken);
    expect(check.walkGroups.length).toBeGreaterThan(1);
    expect(check.problems.some((p) => p.includes("not reachable"))).toBe(true);
  });

  it("finds a district cut in two", () => {
    const broken = copy(base);
    // A wall across the whole district, at every level, where anything walkable was.
    for (let z = 0; z < broken.levels; z += 1) {
      for (let x = 0; x < broken.width; x += 1) {
        const i = cellIndex(broken, x, 12, z);
        if (isWalkable(broken.kind[i] as number)) {
          broken.kind[i] = K.solid;
          broken.building[i] = 1;
          broken.facade[i] = 1;
          broken.dir[i] = 0;
        }
      }
    }
    expect(checkDistrict(broken).walkGroups.length).toBeGreaterThan(1);
  });

  it("finds lanes in two networks", () => {
    const broken = copy(base);
    broken.kind[isolated(broken, broken.params.bands.middle[0])] = K.lane;
    const check = checkDistrict(broken);
    expect(check.laneGroups.length).toBe(2);
    expect(check.ok).toBe(false);
  });

  it("reaches every walkable cell from any one", () => {
    const start = find(base, K.pad);
    expect(reachFrom(base, start).count).toBe(checkDistrict(base).walkable);
  });
});
