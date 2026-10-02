import { hash32 } from "@whz/det";
import { describe, expect, it } from "vitest";
import { box, capsule, CARVE, ellipsoid, hash3, materialIndex, roundBox, ShadeTable, VoxelBuilder, VoxelGrid } from "../src/index.ts";
import type { Region, Vec3 } from "../src/index.ts";
import { palette, slot } from "./helpers.ts";

/** The layers of a grid, bottom first, each with its z lines joined by `|`. */
function layers(grid: VoxelGrid): string[] {
  const rows: string[] = [];
  for (let y = 0; y < grid.ny; y += 1) rows.push(grid.slice(y).split("\n").join("|"));
  return rows;
}

/** A region filled into an otherwise empty grid. */
function filled(size: Vec3, region: Region): VoxelGrid {
  return new VoxelBuilder(palette, size).fill(region, "wood.2").grid;
}

describe("the example palette", () => {
  it("has the slots the tests name by number", () => {
    expect([slot("ink"), slot("shadow"), slot("wood.0"), slot("wood.2"), slot("wood.4"), slot("steel.0"), slot("steel.2")]).toEqual([1, 2, 3, 5, 7, 8, 10]);
    expect(palette.ramp("wood")).toEqual([3, 4, 5, 6, 7]);
    expect(palette.ramp("skin")).toEqual([13, 14, 15, 16]);
  });
});

describe("ShadeTable", () => {
  const shade = new ShadeTable(palette);

  it("knows the ramp and the step of a slot; a slot in no ramp is flat", () => {
    expect(shade.rampOf(5)).toBe("wood");
    expect(shade.stepOf(5)).toBe(2);
    expect(shade.rampOf(slot("steel.4"))).toBe("steel");
    expect(shade.stepOf(slot("steel.4"))).toBe(4);
    expect(shade.rampOf(slot("ink"))).toBeNull();
    expect(shade.stepOf(slot("ink"))).toBe(-1);
    expect(shade.rampOf(200)).toBeNull();
  });

  it("shifts along the ramp and stops at its ends; a flat slot stays", () => {
    expect(shade.shift(5, 1)).toBe(6);
    expect(shade.shift(5, -1)).toBe(4);
    expect(shade.shift(5, 9)).toBe(7);
    expect(shade.shift(5, -9)).toBe(3);
    expect(shade.shift(slot("skin.3"), 1)).toBe(slot("skin.3"));
    expect(shade.shift(slot("ink"), -1)).toBe(slot("ink"));
  });

  it("the darkest step of a ramp is its step 0; of a flat slot, ink", () => {
    expect(shade.darkest(6)).toBe(3);
    expect(shade.darkest(slot("steel.2"))).toBe(slot("steel.0"));
    expect(shade.darkest(slot("shadow"))).toBe(slot("ink"));
  });

  it("with a list of ramps, the slots of the other ramps are flat", () => {
    const woodOnly = new ShadeTable(palette, ["wood"]);
    expect(woodOnly.ramps).toEqual(["wood"]);
    expect(woodOnly.shift(5, 1)).toBe(6);
    expect(woodOnly.stepOf(slot("steel.2"))).toBe(-1);
    expect(woodOnly.shift(slot("steel.2"), 1)).toBe(slot("steel.2"));
    expect(() => new ShadeTable(palette, ["nope"])).toThrow();
  });
});

describe("materialIndex", () => {
  it("reads a slot name, an index and [ramp, step]", () => {
    expect(materialIndex(palette, "wood.2")).toBe(5);
    expect(materialIndex(palette, 5)).toBe(5);
    expect(materialIndex(palette, ["wood", 2])).toBe(5);
    expect(materialIndex(palette, ["steel", 0])).toBe(8);
  });

  it("throws on an unknown slot or ramp, a step the ramp does not have, and the transparent slot", () => {
    expect(() => materialIndex(palette, "nope")).toThrow();
    expect(() => materialIndex(palette, ["nope", 0])).toThrow();
    expect(() => materialIndex(palette, ["wood", 5])).toThrow(/the ramp "wood" of palette "voxel-example" has the steps 0\.\.4/);
    expect(() => materialIndex(palette, ["wood", 0.5])).toThrow(/has the steps/);
    expect(() => materialIndex(palette, palette.size)).toThrow(/has the indices 1\.\./);
    expect(() => materialIndex(palette, 0)).toThrow(/cannot be painted transparent; carve it/);
    expect(() => materialIndex(palette, "transparent")).toThrow(/cannot be painted transparent/);
  });
});

describe("VoxelBuilder.sculpt", () => {
  it("applies boxes in order: fill, overwrite, carve", () => {
    const b = new VoxelBuilder(palette, [3, 1, 2]).sculpt([
      { a: [0, 0, 0], b: [3, 1, 2], c: ["wood", 2] },
      { a: [1, 0, 0], b: [3, 1, 1], c: "steel.2" },
      { a: [2, 0, 0], b: [3, 1, 2], c: CARVE },
    ]);
    expect(b.grid.slice(0)).toBe("5a.\n55.");
  });

  it("a function colours voxel by voxel: a material, CARVE, or null to leave the voxel", () => {
    const b = new VoxelBuilder(palette, [3, 1, 3]).fill(box([0, 0, 0], [3, 1, 3]), "wood.2");
    b.sculpt([{ a: [0, 0, 0], b: [3, 1, 3], c: (x, _y, z) => (x === z ? CARVE : x > z ? ["steel", 0] : null) }]);
    expect(b.grid.slice(0)).toBe(".88\n5.8\n55.");
  });

  it("a paint box recolours only the voxels that exist", () => {
    const b = new VoxelBuilder(palette, [3, 1, 1]).fill(box([0, 0, 0], [2, 1, 1]), "wood.2");
    b.sculpt([{ a: [1, 0, 0], b: [3, 1, 1], c: "steel.2", paint: true }]);
    expect(b.grid.slice(0)).toBe("5a.");
    b.sculpt([{ a: [0, 0, 0], b: [3, 1, 1], c: () => ["wood", 4], paint: true }]);
    expect(b.grid.slice(0)).toBe("77.");
    b.paint(b.all, "skin", 0);
    expect(b.grid.slice(0)).toBe("dd.");
    expect(() => b.sculpt([{ a: [0, 0, 0], b: [1, 1, 1], c: CARVE, paint: true }])).toThrow(/sculpt \(box 0\): a paint box recolours voxels; it cannot carve/);
  });

  it("a region with a test fills only the voxels the test accepts", () => {
    const b = new VoxelBuilder(palette, [2, 1, 2]).fill({ a: [0, 0, 0], b: [2, 1, 2], inside: (x, _y, z) => x !== z }, "wood.2");
    expect(b.grid.slice(0)).toBe(".5\n5.");
  });

  it("fill and carve are one-box sculpts", () => {
    const b = new VoxelBuilder(palette, [2, 2, 2]).fill(box([0, 0, 0], [2, 2, 2]), ["wood", 2]).carve(box([0, 1, 0], [2, 2, 1]));
    expect(layers(b.grid)).toEqual(["55|55", "..|55"]);
  });

  it("throws on a box that leaves the grid, is empty or is not on integers, and names the box", () => {
    const b = new VoxelBuilder(palette, [3, 1, 2]);
    expect(() =>
      b.sculpt([
        { a: [0, 0, 0], b: [1, 1, 1], c: "wood.2" },
        { a: [0, 0, 0], b: [4, 1, 2], c: "wood.2" },
      ]),
    ).toThrow(/sculpt \(box 1\): the box \[0, 0, 0\] \.\. \[4, 1, 2\] reaches outside the 3 x 1 x 2 grid/);
    expect(() => b.sculpt([{ a: [-1, 0, 0], b: [1, 1, 1], c: "wood.2" }])).toThrow(/reaches outside/);
    expect(() => b.sculpt([{ a: [1, 0, 0], b: [1, 1, 1], c: "wood.2" }])).toThrow(/is empty \(b is exclusive\)/);
    expect(() => b.sculpt([{ a: [0, 0, 0], b: [1.5, 1, 1], c: "wood.2" }])).toThrow(/a and b must hold integers/);
    expect(() => b.sculpt([{ a: [0, 0, 0], b: [1, 1, 1], c: "nope" }])).toThrow();
    // The first box of the failed list was applied; nothing was clipped silently.
    expect(b.grid.count()).toBe(1);
  });

  it("builds on an existing grid when given one", () => {
    const grid = new VoxelGrid(2, 1, 1).set(0, 0, 0, 5);
    const b = new VoxelBuilder(palette, grid);
    expect(b.grid).toBe(grid);
    expect(b.all).toEqual({ a: [0, 0, 0], b: [2, 1, 1] });
    b.paint(b.all, "wood", 0);
    expect(grid.slice(0)).toBe("3.");
  });
});

describe("VoxelBuilder.jitter", () => {
  const block = (material: string): VoxelBuilder => new VoxelBuilder(palette, [6, 6, 6]).fill(box([0, 0, 0], [6, 6, 6]), material);

  it("moves voxels one step along their own ramp, and only that", () => {
    const b = block("wood.2").jitter(box([0, 0, 0], [6, 6, 6]), { seed: 7 });
    const seen = new Set(b.grid.data);
    expect([...seen].sort()).toEqual([4, 5, 6]);
    const changed = b.grid.data.filter((value) => value !== 5).length;
    // A quarter of 216 voxels, give or take what a hash gives.
    expect(changed).toBeGreaterThan(30);
    expect(changed).toBeLessThan(80);
  });

  it("is a function of the seed and the voxel position", () => {
    const a = block("wood.2").jitter(box([0, 0, 0], [6, 6, 6]), { seed: 7 }).grid;
    const again = block("wood.2").jitter(box([0, 0, 0], [6, 6, 6]), { seed: 7 }).grid;
    const other = block("wood.2").jitter(box([0, 0, 0], [6, 6, 6]), { seed: 8 }).grid;
    expect(again.equals(a)).toBe(true);
    expect(other.equals(a)).toBe(false);
    // Jittering a part of the block gives the same voxels there as jittering all of it.
    const part = block("wood.2").jitter(box([2, 2, 2], [4, 4, 4]), { seed: 7 }).grid;
    for (let y = 0; y < 6; y += 1) {
      for (let z = 0; z < 6; z += 1) {
        for (let x = 0; x < 6; x += 1) {
          const inPart = x >= 2 && x < 4 && y >= 2 && y < 4 && z >= 2 && z < 4;
          expect(part.get(x, y, z)).toBe(inPart ? a.get(x, y, z) : 5);
        }
      }
    }
  });

  it("follows `chance`: none, all, and the direction from the lowest bit of the hash", () => {
    expect(block("wood.2").jitter(box([0, 0, 0], [6, 6, 6]), { seed: 7, chance: [0, 1] }).grid.equals(block("wood.2").grid)).toBe(true);
    const all = block("wood.2").jitter(box([0, 0, 0], [6, 6, 6]), { seed: 7, chance: [1, 1] }).grid;
    expect(all.data.every((value) => value === 4 || value === 6)).toBe(true);
    expect(all.get(1, 2, 3)).toBe((hash3(1, 2, 3, 7) & 1) === 0 ? 6 : 4);
    expect(hash3(1, 2, 3, 7)).toBe(hash32(1, 2, hash32(3, 0x51ed, 7)));
  });

  it("never leaves the ramp, leaves a flat slot alone, and skips empty voxels", () => {
    const top = block("wood.4").jitter(box([0, 0, 0], [6, 6, 6]), { seed: 3, chance: [1, 1] }).grid;
    expect(top.data.every((value) => value === 6 || value === 7)).toBe(true);
    const flat = block("ink").jitter(box([0, 0, 0], [6, 6, 6]), { seed: 3, chance: [1, 1] }).grid;
    expect(flat.data.every((value) => value === 1)).toBe(true);
    const empty = new VoxelBuilder(palette, [2, 2, 2]).jitter(box([0, 0, 0], [2, 2, 2]), { seed: 3, chance: [1, 1] }).grid;
    expect(empty.count()).toBe(0);
  });

  it("throws on a bad chance, seed or region", () => {
    const b = block("wood.2");
    expect(() => b.jitter(b.all, { seed: 1, chance: [2, 1] })).toThrow(/chance must be \[numerator, denominator\]/);
    expect(() => b.jitter(b.all, { seed: 1, chance: [1, 0] })).toThrow(/chance must be/);
    expect(() => b.jitter(b.all, { seed: -1 })).toThrow(/the seed must be an integer in \[0, 4294967295\]/);
    expect(() => b.jitter(b.all, { seed: 1.5 })).toThrow(/the seed must be/);
    expect(() => b.jitter(box([0, 0, 0], [7, 6, 6]), { seed: 1 })).toThrow(/jitter: the box .* reaches outside the 6 x 6 x 6 grid/);
  });
});

describe("VoxelBuilder.mirrorX", () => {
  it("copies the low-x half, mirrored, onto the other half", () => {
    const b = new VoxelBuilder(palette, [4, 1, 2]).sculpt([
      { a: [0, 0, 0], b: [1, 1, 2], c: "wood.2" },
      { a: [1, 0, 1], b: [2, 1, 2], c: "steel.2" },
      { a: [3, 0, 0], b: [4, 1, 1], c: "skin.0" }, // on the high half: overwritten
    ]);
    expect(b.grid.slice(0)).toBe("5..d\n5a..");
    b.mirrorX();
    expect(b.grid.slice(0)).toBe("5..5\n5aa5");
    expect(b.grid.mirroredX().equals(b.grid)).toBe(true);
  });

  it("keeps the middle column of an odd width", () => {
    const b = new VoxelBuilder(palette, [3, 1, 1]).sculpt([
      { a: [0, 0, 0], b: [1, 1, 1], c: "wood.2" },
      { a: [1, 0, 0], b: [2, 1, 1], c: "steel.2" },
    ]);
    expect(b.mirrorX().grid.slice(0)).toBe("5a5");
  });
});

describe("shapes: a voxel is in when its centre is", () => {
  it("box: a inclusive, b exclusive; an empty box throws", () => {
    expect(filled([3, 1, 3], box([1, 0, 1], [3, 1, 2])).slice(0)).toBe("...\n.55\n...");
    expect(() => box([0, 0, 0], [0, 1, 1])).toThrow(/box: the box \[0, 0, 0\] \.\. \[0, 1, 1\] is empty/);
    expect(() => box([0, 0, 0], [1, 1] as unknown as Vec3)).toThrow(/b must be \[x, y, z\]/);
  });

  it("ellipsoid: the ball inscribed in a 4 x 4 x 4 box is 32 voxels", () => {
    const ball = filled([4, 4, 4], ellipsoid([0, 0, 0], [4, 4, 4]));
    expect(ball.count()).toBe(32);
    expect(layers(ball)).toEqual([
      "....|.55.|.55.|....",
      ".55.|5555|5555|.55.",
      ".55.|5555|5555|.55.",
      "....|.55.|.55.|....",
    ]);
  });

  it("ellipsoid: follows the box on every axis, and is symmetric", () => {
    const flat = filled([6, 2, 4], ellipsoid([0, 0, 0], [6, 2, 4]));
    expect(layers(flat)).toEqual(["..55..|.5555.|.5555.|..55..", "..55..|.5555.|.5555.|..55.."]);
    expect(flat.mirroredX().equals(flat)).toBe(true);
    expect(flat.rotatedY(2).equals(flat)).toBe(true);
    // A 1 x 1 x 1 box is its one voxel; a shifted box gives the shifted shape.
    expect(filled([1, 1, 1], ellipsoid([0, 0, 0], [1, 1, 1])).count()).toBe(1);
    expect(filled([6, 6, 6], ellipsoid([2, 2, 2], [6, 6, 6])).count()).toBe(32);
  });

  it("roundBox: radius 0 and 1 are the box, radius 2 takes a voxel off every edge", () => {
    expect(filled([4, 4, 4], roundBox([0, 0, 0], [4, 4, 4], 0)).count()).toBe(64);
    expect(filled([4, 4, 4], roundBox([0, 0, 0], [4, 4, 4], 1)).count()).toBe(64);
    expect(layers(filled([4, 4, 4], roundBox([0, 0, 0], [4, 4, 4], 2)))).toEqual([
      "....|.55.|.55.|....",
      ".55.|5555|5555|.55.",
      ".55.|5555|5555|.55.",
      "....|.55.|.55.|....",
    ]);
    // A long box keeps its flat sides: only the edges are cut.
    expect(layers(filled([6, 2, 4], roundBox([0, 0, 0], [6, 2, 4], 1)))).toEqual(["555555|555555|555555|555555", "555555|555555|555555|555555"]);
    const rounded = filled([6, 6, 6], roundBox([0, 0, 0], [6, 6, 6], 3));
    expect(rounded.count()).toBe(136);
    expect(rounded.slice(0)).toBe("......\n..55..\n.5555.\n.5555.\n..55..\n......");
    expect(rounded.slice(2)).toBe(".5555.\n555555\n555555\n555555\n555555\n.5555.");
  });

  it("roundBox: the radius is at most half the shortest side", () => {
    expect(() => roundBox([0, 0, 0], [4, 2, 4], 2)).toThrow(/roundBox: the radius must be an integer in \[0, 1\]/);
    expect(() => roundBox([0, 0, 0], [4, 4, 4], 1.5)).toThrow(/the radius must be an integer/);
  });

  it("capsule: a diameter of 1 is the line of voxels between its ends", () => {
    const upright = capsule([1, 1, 1], [1, 4, 1], 1);
    expect([upright.a, upright.b]).toEqual([[1, 1, 1], [2, 5, 2]]);
    expect(filled([3, 6, 3], upright).count()).toBe(4);
    const diagonal = filled([6, 6, 3], capsule([1, 1, 1], [4, 4, 1], 1));
    expect(diagonal.count()).toBe(4);
    for (const i of [1, 2, 3, 4]) expect(diagonal.get(i, i, 1)).toBe(5);
    // One voxel: both ends are the same.
    expect(filled([3, 3, 3], capsule([1, 1, 1], [1, 1, 1], 1)).count()).toBe(1);
  });

  it("capsule: an odd diameter is centred on the voxels, with round ends", () => {
    const region = capsule([1, 1, 1], [1, 4, 1], 3);
    expect([region.a, region.b]).toEqual([[0, 0, 0], [3, 6, 3]]);
    expect(layers(filled([3, 6, 3], region))).toEqual([
      ".5.|555|.5.",
      "555|555|555",
      "555|555|555",
      "555|555|555",
      "555|555|555",
      ".5.|555|.5.",
    ]);
    // The same capsule along x is the same shape turned.
    expect(layers(filled([6, 3, 3], capsule([1, 1, 1], [4, 1, 1], 3)))).toEqual([".5555.|555555|.5555.", "555555|555555|555555", ".5555.|555555|.5555."]);
  });

  it("capsule: an even diameter covers the end voxels and the next ones along every axis", () => {
    const region = capsule([1, 1, 1], [1, 4, 1], 2);
    expect([region.a, region.b]).toEqual([[1, 1, 1], [3, 6, 3]]);
    const grid = filled([4, 7, 4], region);
    expect(grid.count()).toBe(20);
    expect(grid.bounds()).toEqual({ min: [1, 1, 1], max: [3, 6, 3] });
  });

  it("capsule: the ends are interchangeable, and a bad diameter throws", () => {
    const one = filled([6, 6, 4], capsule([1, 1, 1], [4, 3, 2], 3));
    const other = filled([6, 6, 4], capsule([4, 3, 2], [1, 1, 1], 3));
    expect(one.equals(other)).toBe(true);
    expect(one.count()).toBeGreaterThan(20);
    expect(() => capsule([0, 0, 0], [1, 1, 1], 0)).toThrow(/capsule: the diameter must be an integer in \[1, 64\]/);
    expect(() => capsule([0, 0, 0], [1, 1, 1], 1.5)).toThrow(/the diameter must be/);
  });
});
