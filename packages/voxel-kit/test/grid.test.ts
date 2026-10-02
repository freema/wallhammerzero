import { describe, expect, it } from "vitest";
import { EMPTY, MAX_GRID_SIZE, mirrorDiff, VoxelGrid } from "../src/index.ts";
import { randomGrid } from "./helpers.ts";

describe("VoxelGrid basics", () => {
  it("starts empty, with nx * ny * nz bytes", () => {
    const grid = new VoxelGrid(4, 3, 2);
    expect(grid.size).toEqual([4, 3, 2]);
    expect(grid.data).toBeInstanceOf(Uint8Array);
    expect(grid.data.length).toBe(24);
    expect(grid.count()).toBe(0);
    expect(grid.bounds()).toBeNull();
    expect(EMPTY).toBe(0);
  });

  it("rejects sizes that are not integers in [1, MAX_GRID_SIZE], and data of the wrong length", () => {
    expect(() => new VoxelGrid(0, 1, 1)).toThrow(/nx must be an integer/);
    expect(() => new VoxelGrid(1, 2.5, 1)).toThrow(/ny must be an integer/);
    expect(() => new VoxelGrid(1, 1, MAX_GRID_SIZE + 1)).toThrow(/nz must be an integer/);
    expect(() => new VoxelGrid(2, 2, 2, new Uint8Array(7))).toThrow(/data has 7 bytes, expected 2 x 2 x 2 = 8/);
    expect(() => VoxelGrid.of([1, 2] as unknown as [number, number, number])).toThrow(/size must be \[x, y, z\]/);
  });

  it("reads 0 outside, ignores writes outside, and throws on a float or a value that is not a byte", () => {
    const grid = new VoxelGrid(2, 2, 2).set(1, 0, 1, 7).set(5, 0, 0, 3).set(0, -1, 0, 3);
    expect(grid.get(1, 0, 1)).toBe(7);
    expect(grid.get(5, 0, 0)).toBe(0);
    expect(grid.get(0, -1, 0)).toBe(0);
    expect(grid.count()).toBe(1);
    expect(() => grid.set(0.5, 0, 0, 1)).toThrow(/x must be a 32-bit integer/);
    expect(() => grid.set(0, 0, 0, 256)).toThrow(/value must be 0\.\.255/);
  });

  it("stores the voxel (x, y, z) at (y * nz + z) * nx + x", () => {
    const grid = new VoxelGrid(4, 3, 2).set(3, 2, 1, 9);
    expect(grid.data[(2 * 2 + 1) * 4 + 3]).toBe(9);
  });

  it("counts, bounds, clones and compares", () => {
    const grid = new VoxelGrid(4, 4, 4).set(1, 0, 2, 5).set(2, 3, 2, 6);
    expect(grid.count()).toBe(2);
    expect(grid.bounds()).toEqual({ min: [1, 0, 2], max: [3, 4, 3] });
    const copy = grid.clone();
    expect(copy).not.toBe(grid);
    expect(copy.data).not.toBe(grid.data);
    expect(copy.equals(grid)).toBe(true);
    copy.set(0, 0, 0, 1);
    expect(copy.equals(grid)).toBe(false);
    expect(new VoxelGrid(4, 4, 2).equals(new VoxelGrid(4, 2, 4))).toBe(false);
  });

  it("prints a layer as text, seen from above: a line per z, a character per x", () => {
    const grid = new VoxelGrid(3, 2, 2).set(0, 0, 0, 1).set(2, 0, 1, 12).set(1, 1, 0, 36);
    expect(grid.slice(0)).toBe("1..\n..c");
    expect(grid.slice(1)).toBe(".#.\n...");
  });
});

describe("rotatedY: the four facings", () => {
  it("a quarter turn moves the front (+z) to +x and swaps the x and z sizes", () => {
    // One voxel on the front edge (z = nz - 1) of a 2 x 1 x 3 grid, at x = 0.
    const grid = new VoxelGrid(2, 1, 3).set(0, 0, 2, 5);
    const turned = grid.rotatedY(1);
    expect(turned.size).toEqual([3, 1, 2]);
    // The front is now the +x edge, and the voxel is at the far end of the other axis.
    expect(turned.get(2, 0, 1)).toBe(5);
    expect(turned.count()).toBe(1);
    expect(turned.slice(0)).toBe("...\n..5");
  });

  it("rotating a grid 4 x 90 degrees returns the identical grid", () => {
    for (const [size, seed] of [[[4, 8, 4], 1], [[5, 3, 2], 2], [[1, 1, 7], 3], [[8, 8, 8], 4]] as const) {
      const grid = randomGrid(size, seed);
      const back = grid.rotatedY(1).rotatedY(1).rotatedY(1).rotatedY(1);
      expect(back.size).toEqual(grid.size);
      expect(Buffer.from(back.data).equals(Buffer.from(grid.data)), `size ${size.join("x")}`).toBe(true);
      expect(grid.rotatedY(4).equals(grid)).toBe(true);
      expect(grid.rotatedY(0)).not.toBe(grid);
    }
  });

  it("turns compose: 2 is two quarter turns, 3 is three, -1 is 3, and no turn loses a voxel", () => {
    const grid = randomGrid([5, 3, 2], 7);
    expect(grid.rotatedY(2).equals(grid.rotatedY(1).rotatedY(1))).toBe(true);
    expect(grid.rotatedY(3).equals(grid.rotatedY(1).rotatedY(1).rotatedY(1))).toBe(true);
    expect(grid.rotatedY(-1).equals(grid.rotatedY(3))).toBe(true);
    expect(grid.rotatedY(5).equals(grid.rotatedY(1))).toBe(true);
    for (const turns of [1, 2, 3]) expect(grid.rotatedY(turns).count()).toBe(grid.count());
    expect(() => grid.rotatedY(0.5)).toThrow(/quarterTurns must be a 32-bit integer/);
  });

  it("keeps the height: a layer stays in its layer", () => {
    const grid = new VoxelGrid(2, 3, 2).set(0, 2, 0, 4);
    for (const turns of [1, 2, 3]) expect(grid.rotatedY(turns).bounds()?.min[1]).toBe(2);
  });
});

describe("mirroredX and mirrorDiff", () => {
  it("mirrors along x and is its own inverse", () => {
    const grid = new VoxelGrid(3, 1, 2).set(0, 0, 0, 1).set(1, 0, 1, 2);
    expect(grid.mirroredX().slice(0)).toBe("..1\n.2.");
    expect(grid.mirroredX().mirroredX().equals(grid)).toBe(true);
  });

  it("counts the voxels without a mirror image, and with `colors` also the pairs of two values", () => {
    const grid = new VoxelGrid(4, 1, 1).set(0, 0, 0, 1).set(3, 0, 0, 1).set(1, 0, 0, 2);
    expect(mirrorDiff(grid)).toBe(1); // x = 1 has no partner at x = 2
    grid.set(2, 0, 0, 3);
    expect(mirrorDiff(grid)).toBe(0);
    expect(mirrorDiff(grid, { colors: true })).toBe(1); // 2 against 3
    // The middle column of an odd width is its own mirror image.
    expect(mirrorDiff(new VoxelGrid(3, 1, 1).set(1, 0, 0, 5))).toBe(0);
  });
});
