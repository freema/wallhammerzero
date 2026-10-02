import { describe, expect, it } from "vitest";
import { box, FACE_LEFT, FACE_RIGHT, FACE_TOP, isoSize, NO_DEPTH, projectIso, ShadeTable, VoxelBuilder, VoxelGrid } from "../src/index.ts";
import type { IsoLayers } from "../src/index.ts";
import { layerText, palette, randomGrid, slot } from "./helpers.ts";

const shade = new ShadeTable(palette);
const WOOD = slot("wood.2"); // 5: its top is 6, its left side 5, its right side 4
const STEEL = slot("steel.2"); // a (10): b, a, 9

const solid = (size: readonly [number, number, number], value = WOOD): VoxelGrid => {
  const grid = VoxelGrid.of(size);
  grid.data.fill(value);
  return grid;
};

/** The box around the pixels that were drawn. */
function drawnBounds(layers: IsoLayers): { x: number; y: number; w: number; h: number } | null {
  let x0 = layers.w;
  let y0 = layers.h;
  let x1 = -1;
  let y1 = -1;
  for (let at = 0; at < layers.color.length; at += 1) {
    if (layers.color[at] === 0) continue;
    const x = at % layers.w;
    const y = (at - x) / layers.w;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

describe("projectIso: the stamp of one voxel", () => {
  const layers = projectIso(solid([1, 1, 1]), { shade });

  it("is 4 x 4 pixels: a 4 x 2 top over a 2 x 2 left side and a 2 x 2 right side", () => {
    expect([layers.w, layers.h]).toEqual([4, 4]);
    expect(layerText(layers.face, 4)).toEqual(["1111", "1111", "2233", "2233"]);
    expect([FACE_TOP, FACE_LEFT, FACE_RIGHT]).toEqual([1, 2, 3]);
    const count = (face: number): number => layers.face.filter((value) => value === face).length;
    expect([count(FACE_TOP), count(FACE_LEFT), count(FACE_RIGHT)]).toEqual([8, 4, 4]);
  });

  it("is lit by ramp steps: the top one step up, the left side as it is, the right side one step down", () => {
    expect(layerText(layers.color, 4)).toEqual(["6666", "6666", "5544", "5544"]);
    expect([...layers.base].every((value) => value === WOOD)).toBe(true);
    expect([...layers.part].every((value) => value === 1)).toBe(true);
  });

  it("knows the depth of every pixel: 2 * (x + y + z), plus 1 on the top", () => {
    expect([...layers.depth]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(NO_DEPTH).toBe(-1);
  });

  it("stops at the ends of the ramp, and leaves a flat slot as it is", () => {
    const dark = projectIso(solid([1, 1, 1], slot("wood.0")), { shade });
    expect(layerText(dark.color, 4)).toEqual(["4444", "4444", "3333", "3333"]);
    const light = projectIso(solid([1, 1, 1], slot("wood.4")), { shade });
    expect(layerText(light.color, 4)).toEqual(["7777", "7777", "7766", "7766"]);
    const flat = projectIso(solid([1, 1, 1], slot("ink")), { shade });
    expect(layerText(flat.color, 4)).toEqual(["1111", "1111", "1111", "1111"]);
  });
});

describe("projectIso: where a voxel lands", () => {
  it("screen.x = 2 * (x - z) and screen.y = (x + z) - 2 * y, from the corner of the sprite", () => {
    const size = [3, 4, 5] as const;
    const { w, h } = isoSize(size);
    expect([w, h]).toEqual([16, 16]);
    for (const [x, y, z] of [[0, 0, 0], [2, 0, 0], [0, 3, 0], [0, 0, 4], [2, 3, 4], [1, 2, 3]] as const) {
      const layers = projectIso(VoxelGrid.of(size).set(x, y, z, WOOD), { shade });
      expect([layers.w, layers.h]).toEqual([w, h]);
      // The origin of the screen formula sits at column 2 * nz - 2, row 2 * ny - 2.
      expect(drawnBounds(layers), `voxel ${x},${y},${z}`).toEqual({ x: 2 * (x - z) + 2 * 5 - 2, y: x + z - 2 * y + 2 * 4 - 2, w: 4, h: 4 });
    }
  });

  it("a box of nx x ny x nz voxels is 2 * (nx + nz) by (nx + nz) + 2 * ny pixels, to the pixel", () => {
    for (const [nx, ny, nz] of [[1, 1, 1], [4, 8, 4], [8, 8, 8], [3, 1, 5], [5, 2, 1], [1, 7, 2], [2, 3, 6]] as const) {
      const { w, h } = isoSize([nx, ny, nz]);
      expect([w, h]).toEqual([2 * (nx + nz), nx + nz + 2 * ny]);
      const layers = projectIso(solid([nx, ny, nz]), { shade });
      expect([layers.w, layers.h, layers.color.length]).toEqual([w, h, w * h]);
      // The box touches all four edges of the sprite.
      expect(drawnBounds(layers), `${nx} x ${ny} x ${nz}`).toEqual({ x: 0, y: 0, w, h });
    }
  });

  it("a filled box has no holes: every row and every column is one run of pixels", () => {
    for (const size of [[4, 8, 4], [3, 1, 5], [2, 3, 6]] as const) {
      const layers = projectIso(solid(size), { shade });
      const rows = layerText(layers.face, layers.w);
      for (const row of rows) expect(row.replace(/^\.+|\.+$/g, "").includes("."), row).toBe(false);
      for (let x = 0; x < layers.w; x += 1) {
        const column = rows.map((row) => row.charAt(x)).join("");
        expect(column.replace(/^\.+|\.+$/g, "").includes("."), `column ${x}`).toBe(false);
      }
    }
  });

  it("a cube shows its three faces: the sides 2 x 2 per voxel face, the top in whole 4 x 2 blocks", () => {
    const layers = projectIso(solid([4, 4, 4]), { shade, ao: false });
    const count = (face: number): number => layers.face.filter((value) => value === face).length;
    expect([count(FACE_LEFT), count(FACE_RIGHT)]).toEqual([64, 64]);
    // The 16 x 8 diamond of the top is 64 pixels; its lower edge is stamped in whole blocks,
    // which is where a top face wins the row it shares with a side.
    expect(count(FACE_TOP)).toBe(80);
    expect(layerText(layers.color, 16)).toEqual([
      "......6666......",
      "....66666666....",
      "..666666666666..",
      "6666666666666666",
      "6666666666666666",
      "5566666666666644",
      "5555666666664444",
      "5555556666444444",
      "5555555544444444",
      "5555555544444444",
      "5555555544444444",
      "5555555544444444",
      "5555555544444444",
      "..555555444444..",
      "....55554444....",
      "......5544......",
    ]);
  });
});

describe("projectIso: what covers what", () => {
  it("the nearer voxel wins", () => {
    // (0,0,0) and (1,1,1) land on the same 4 x 4 pixels; the second one is nearer.
    const grid = new VoxelGrid(2, 2, 2).set(0, 0, 0, WOOD).set(1, 1, 1, STEEL);
    const layers = projectIso(grid, { shade });
    expect(layerText(layers.base, 8).slice(2, 6)).toEqual(["..aaaa..", "..aaaa..", "..aaaa..", "..aaaa.."]);
    expect(layers.base.filter((value) => value === WOOD).length).toBe(0);
  });

  it("a voxel visited earlier keeps its pixels when a farther one comes later", () => {
    // (1,0,0) is visited first, and its top is nearer than the side of (0,1,0) in the layer above.
    const grid = new VoxelGrid(2, 2, 1).set(1, 0, 0, WOOD).set(0, 1, 0, STEEL);
    const layers = projectIso(grid, { shade, ao: false });
    expect(layerText(layers.base, 6)).toEqual(["aaaa..", "aaaa..", "aaaa..", "aa5555", "..5555", "..5555", "..5555"]);
  });

  it("of two faces at the same x + y + z, the top face wins", () => {
    const grid = new VoxelGrid(2, 2, 1).set(1, 0, 0, WOOD).set(0, 1, 0, STEEL);
    const layers = projectIso(grid, { shade, ao: false });
    // Row 3: the bottom row of the steel voxel's sides, and the first row of the wood top.
    expect(layerText(layers.face, 6)[3]).toBe("221111");
    expect(layerText(layers.color, 6)[3]).toBe("aa6666");
    expect([...layers.depth.slice(18, 24)]).toEqual([2, 2, 3, 3, 3, 3]);
  });

  it("carries the part of every pixel", () => {
    const grid = new VoxelGrid(2, 1, 1).set(0, 0, 0, WOOD).set(1, 0, 0, WOOD);
    const partIds = new VoxelGrid(2, 1, 1).set(0, 0, 0, 1).set(1, 0, 0, 7);
    const layers = projectIso(grid, { shade, partIds });
    expect(layerText(layers.part, 6)).toEqual(["1111..", "117777", "117777", "117777", "..7777"]);
    expect(() => projectIso(grid, { shade, partIds: new VoxelGrid(1, 1, 2) })).toThrow(/partIds must have the size of the voxel grid/);
  });
});

describe("projectIso: ambient occlusion and the far side", () => {
  // A step: two voxels on the ground, and one on top of the left one.
  const step = (): VoxelGrid => new VoxelBuilder(palette, [2, 2, 1]).fill(box([0, 0, 0], [2, 1, 1]), "wood.2").fill(box([0, 1, 0], [1, 2, 1]), "wood.2").grid;

  it("AO darkens the pixels of an occluded corner by one ramp step", () => {
    const lit = projectIso(step(), { shade, ao: false });
    const occluded = projectIso(step(), { shade });
    expect(layerText(lit.color, 6)).toEqual(["6666..", "6666..", "5544..", "556666", "556666", "555544", "..5544"]);
    // The top of the low voxel, beside the wall: its left and back corners are in the corner
    // of the step, so the left pixel of both rows and the two back pixels lose a step.
    expect(layerText(occluded.color, 6)).toEqual(["6666..", "6666..", "5544..", "555556", "555666", "555544", "..5544"]);
    // AO changes colours only: the same faces, parts and depths.
    expect(occluded.face).toEqual(lit.face);
    expect(occluded.depth).toEqual(lit.depth);
  });

  it("AO is exactly one step, however deep the corner", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const grid = randomGrid([5, 5, 5], seed);
      grid.data.forEach((value, i) => {
        if (value !== 0) grid.data[i] = WOOD;
      });
      const lit = projectIso(grid, { shade, ao: false });
      const occluded = projectIso(grid, { shade });
      let darker = 0;
      for (let at = 0; at < lit.color.length; at += 1) {
        const steps = shade.stepOf(lit.color[at] as number) - shade.stepOf(occluded.color[at] as number);
        expect(steps === 0 || steps === 1).toBe(true);
        darker += steps;
      }
      expect(darker).toBeGreaterThan(0);
    }
    // The top of (1,0,1) on a 2 x 2 floor, rows 4 and 5, columns 2..5. With one voxel diagonally
    // behind it, the back corner is occluded; with all three behind it, the back corner is still
    // one step darker, not three.
    const floor = (): VoxelGrid => new VoxelBuilder(palette, [2, 2, 2]).fill(box([0, 0, 0], [2, 1, 2]), "wood.2").grid;
    const top = (grid: VoxelGrid): string[] => layerText(projectIso(grid, { shade }).color, 8).slice(4, 6).map((row) => row.slice(2, 6));
    expect(top(floor())).toEqual(["6666", "6666"]);
    expect(top(floor().set(0, 1, 0, WOOD))).toEqual(["6556", "6666"]);
    expect(top(floor().set(0, 1, 0, WOOD).set(0, 1, 1, WOOD).set(1, 1, 0, WOOD))).toEqual(["5555", "5665"]);
  });

  it("a far part is one ramp step darker on every face", () => {
    const grid = new VoxelGrid(1, 1, 3).set(0, 0, 0, WOOD).set(0, 0, 2, WOOD);
    const partIds = new VoxelGrid(1, 1, 3).set(0, 0, 0, 1).set(0, 0, 2, 2);
    const plain = projectIso(grid, { shade, partIds });
    const far = projectIso(grid, { shade, partIds, farParts: new Set([1]) });
    expect(layerText(plain.color, 8)).toEqual(["....6666", "....6666", "66665544", "66665544", "5544....", "5544...."]);
    expect(layerText(far.color, 8)).toEqual(["....5555", "....5555", "66664433", "66664433", "5544....", "5544...."]);
    expect(far.base).toEqual(plain.base);
  });
});
