import { describe, expect, it } from "vitest";
import { bakeIso, bakeIsoLayers, box, DEFAULT_CONTOUR_GAP, defineModel, facingTurns, FACE_TOP, ISO_FACINGS, isoFrame, isoPoint, isoSize, outlineSlots, SPECK_AREA, VoxelBuilder, VoxelGrid } from "../src/index.ts";
import type { BakedIso, ModelSpec, Vec3, VoxelModel } from "../src/index.ts";
import { layerText, palette, randomGrid, slot, text } from "./helpers.ts";

const INK = slot("ink"); // 1
const SHADOW = slot("shadow"); // 2
const WOOD_DARK = slot("wood.0"); // 3
const WOOD = slot("wood.2"); // 5
const STEEL_DARK = slot("steel.0"); // 8
const STEEL = slot("steel.2"); // a

const block = (size: Vec3, material: string): VoxelGrid => new VoxelBuilder(palette, size).fill(box([0, 0, 0], size), material).grid;

/** One wood voxel. */
const voxel = (extra: Partial<ModelSpec> = {}): VoxelModel =>
  defineModel({ size: [1, 1, 1], palette, parts: [{ name: "v", grid: block([1, 1, 1], "wood.2") }], ...extra });

/**
 * The two-part fixture of the outline tests: a 4 x 1 x 4 wood floor and a steel post, three
 * voxels high, that stands on its front corner. The post covers floor that lies far behind
 * its top and close behind its foot.
 */
const floorAndPost = (extra: Partial<ModelSpec> = {}): VoxelModel =>
  defineModel({
    size: [4, 4, 4],
    palette,
    parts: [
      { name: "floor", grid: block([4, 1, 4], "wood.2") },
      { name: "post", grid: block([1, 3, 1], "steel.2"), at: [3, 1, 3] },
    ],
    ...extra,
  });

/** The pixels of a frame that have a colour, as "x,y". */
function pixelsOf(baked: BakedIso, color: number): string[] {
  const { buffer } = baked;
  const out: string[] = [];
  buffer.data.forEach((value, at) => {
    if (value === color) out.push(`${at % buffer.w},${(at - (at % buffer.w)) / buffer.w}`);
  });
  return out;
}

describe("isoFrame, facings and isoPoint", () => {
  it("the frame is the projection plus the margin on every side, the same for every facing", () => {
    expect(isoFrame([1, 1, 1])).toEqual({ size: [6, 6], pivot: [3, 4] });
    expect(isoFrame([4, 8, 4], 0)).toEqual({ size: [16, 24], pivot: [8, 20] });
    expect(isoFrame([4, 8, 4], 2)).toEqual({ size: [20, 28], pivot: [10, 22] });
    expect(isoFrame([8, 8, 8], 5)).toEqual({ size: [42, 42], pivot: [21, 29] });
    expect(isoFrame([2, 3, 6], 1).size).toEqual(isoFrame([6, 3, 2], 1).size);
    expect(() => isoFrame([1, 1, 1], -1)).toThrow(/isoFrame: the margin must be an integer in \[0, 64\]/);
    expect(() => isoFrame([1, 1, 1], 0.5)).toThrow(/the margin must be/);
  });

  it("bakeIso returns exactly that frame, for every facing and pose", () => {
    const model = defineModel({ size: [2, 3, 6], palette, parts: [{ name: "a", grid: block([2, 3, 6], "wood.2") }], poses: { up: { a: { offset: [0, 0, 0] } } } });
    for (const facing of ISO_FACINGS) {
      for (const margin of [0, 1, 4]) {
        const buffer = bakeIso(model, { facing, margin, pose: "up" });
        expect([buffer.w, buffer.h]).toEqual(isoFrame([2, 3, 6], margin).size);
      }
    }
  });

  it("a facing is a name or a number of quarter turns", () => {
    expect(ISO_FACINGS).toEqual(["sw", "se", "ne", "nw"]);
    expect(ISO_FACINGS.map(facingTurns)).toEqual([0, 1, 2, 3]);
    expect([undefined, 0, 1, 5, -1].map(facingTurns)).toEqual([0, 0, 1, 1, 3]);
    expect(() => facingTurns("north")).toThrow(/bakeIso: no facing named "north" \(facings: sw, se, ne, nw\)/);
    expect(() => facingTurns(0.5)).toThrow(/a facing is a whole number of quarter turns/);
  });

  it("a facing bakes the model turned by its quarter turns: nothing is resampled", () => {
    const grid = randomGrid([3, 3, 3], 11);
    grid.data.forEach((value, i) => {
      if (value !== 0) grid.data[i] = value % 2 === 0 ? WOOD : STEEL;
    });
    const model = defineModel({ size: [3, 3, 3], palette, parts: [{ name: "a", grid }] });
    const hashes = new Set<string>();
    ISO_FACINGS.forEach((facing, turns) => {
      const turned = defineModel({ size: [3, 3, 3], palette, parts: [{ name: "a", grid: grid.rotatedY(turns) }] });
      const baked = bakeIso(model, { facing });
      expect(baked.equals(bakeIso(turned)), facing).toBe(true);
      expect(baked.equals(bakeIso(model, { facing: turns }))).toBe(true);
      hashes.add(baked.toText());
    });
    expect(hashes.size).toBe(4);
  });

  it("isoPoint: where a corner of a voxel lands in the frame", () => {
    // The frame of one voxel at margin 1: the top is rows 1-2, columns 1-4.
    expect(isoPoint([1, 1, 1], [0, 1, 0])).toEqual([3, 1]); // the back corner of the top
    expect(isoPoint([1, 1, 1], [1, 1, 1])).toEqual([3, 3]); // the front corner: the top-left of the right face
    expect(isoPoint([1, 1, 1], [0, 1, 1])).toEqual([1, 2]); // the left corner: the left face starts one row under it
    expect(isoPoint([1, 1, 1], [0, 0, 0], { margin: 0 })).toEqual([2, 2]);
    expect(isoPoint([4, 8, 4], [2, 0, 2], { margin: 2 })).toEqual(isoFrame([4, 8, 4], 2).pivot);
    expect(() => isoPoint([1, 1, 1], [0, 0.5, 0])).toThrow(/isoPoint: point must hold integers/);
  });

  it("isoPoint follows the facing: it finds the top face of a voxel in every facing", () => {
    const size = [3, 2, 4] as const;
    for (const [vx, vy, vz] of [[0, 0, 0], [2, 1, 3], [1, 1, 2], [2, 0, 0]] as const) {
      const model = defineModel({ size, palette, parts: [{ name: "a", grid: VoxelGrid.of(size).set(vx, vy, vz, WOOD) }] });
      for (const facing of ISO_FACINGS) {
        for (const margin of [0, 2]) {
          const baked = bakeIsoLayers(model, { facing, margin, outline: false, shadow: false });
          // The four corners of the voxel's top face; the one highest on screen is its back corner.
          const corners = ([[0, 0], [1, 0], [0, 1], [1, 1]] as const).map(([dx, dz]) => isoPoint(size, [vx + dx, vy + 1, vz + dz], { facing, margin }));
          const back = corners.reduce((best, corner) => (corner[1] < best[1] ? corner : best));
          const expected: string[] = [];
          for (const dy of [0, 1]) for (const dx of [-2, -1, 0, 1]) expected.push(`${back[0] + dx},${back[1] + dy}`);
          expect(pixelsOf(baked, slot("wood.3")).sort(), `voxel ${vx},${vy},${vz} facing ${facing}`).toEqual(expected.sort());
        }
      }
    }
  });

  it("outlineSlots: ink and the darkest step of every ramp, for the outline lint", () => {
    expect(outlineSlots(palette, ["wood", "steel"])).toEqual(["ink", "wood.0", "steel.0"]);
    expect(outlineSlots(palette)).toEqual(["ink", ...palette.rampNames.map((name) => `${name}.0`)]);
    expect(outlineSlots(palette, [])).toEqual(["ink"]);
  });
});

describe("bakeIso: one voxel", () => {
  it("is the stamp with its outline: the lit rim above and to the left, ink below and to the right", () => {
    // 3 wood.0 (the darkest step of the ramp), 4-6 the right side, the left side and the top.
    expect(text(bakeIso(voxel(), { shadow: false }))).toEqual([".3333.", "366661", "366661", "355441", "355441", ".1111."]);
  });

  it("without a margin there is no room for an outline; the outline can be switched off", () => {
    expect(text(bakeIso(voxel(), { margin: 0, shadow: false }))).toEqual(["6666", "6666", "5544", "5544"]);
    expect(text(bakeIso(voxel(), { outline: false, shadow: false }))).toEqual(["......", ".6666.", ".6666.", ".5544.", ".5544.", "......"]);
  });

  it("the contact shadow is a diamond on the ground, behind everything else", () => {
    expect(text(bakeIso(voxel(), { margin: 3 }))).toEqual([
      "..........",
      "..........",
      "...3333...",
      "..366661..",
      ".23666612.",
      "2235544122",
      "2235544122",
      ".22111122.",
      "...2222...",
      "..........",
    ]);
    // It never draws over the model or its outline.
    const plain = bakeIso(voxel(), { margin: 3, shadow: false });
    const shaded = bakeIso(voxel(), { margin: 3 });
    plain.data.forEach((value, at) => {
      if (value !== 0) expect(shaded.data[at]).toBe(value);
      else expect(shaded.data[at] === 0 || shaded.data[at] === SHADOW).toBe(true);
    });
  });

  it("the shadow follows `grow` and `height`", () => {
    const count = (options: Parameters<typeof bakeIso>[1], model = voxel()): number => bakeIso(model, { margin: 6, ...options }).data.filter((value) => value === SHADOW).length;
    // Grown by nothing, the shadow is under the voxel: nothing of it shows.
    expect(count({ shadow: { grow: 0 } })).toBe(0);
    expect(count({ shadow: false })).toBe(0);
    expect(count({})).toBe(count({ shadow: true }));
    expect(count({ shadow: { grow: 1 } })).toBe(count({}));
    expect(count({ shadow: { grow: 2 } })).toBeGreaterThan(count({}));
    // A voxel that floats one voxel above the ground casts no shadow until `height` reaches it.
    const floating = defineModel({ size: [1, 2, 1], palette, parts: [{ name: "v", grid: block([1, 1, 1], "wood.2"), at: [0, 1, 0] }] });
    expect(count({}, floating)).toBe(0);
    expect(count({ shadow: { height: 2 } }, floating)).toBeGreaterThan(0);
    expect(() => bakeIso(voxel(), { shadow: { grow: 9 } })).toThrow(/shadow\.grow must be an integer in \[0, 8\]/);
    expect(() => bakeIso(voxel(), { shadow: { height: 0 } })).toThrow(/shadow\.height must be a positive integer/);
  });

  it("the shadow is cast by the rest pose: it stays on the ground while the model moves", () => {
    const model = defineModel({ size: [1, 2, 1], palette, parts: [{ name: "v", grid: block([1, 1, 1], "wood.2") }], poses: { jump: { v: { offset: [0, 1, 0] } } } });
    const rest = bakeIsoLayers(model, { margin: 3 });
    const jump = bakeIsoLayers(model, { margin: 3, pose: "jump" });
    const resting = pixelsOf(rest, SHADOW);
    const jumping = pixelsOf(jump, SHADOW);
    expect(resting.length).toBeGreaterThan(0);
    // Every shadow pixel of the rest pose is still there, plus what the voxel uncovered.
    for (const pixel of resting) expect(jumping).toContain(pixel);
    expect(jumping.length).toBeGreaterThan(resting.length);
  });
});

describe("bakeIso: interior contours on the two-part fixture", () => {
  // The frame at margin 1; layer pixel (x, y) is frame pixel (x + 1, y + 1).
  //   the floor: rows 7-16. the post: columns 7-10, from its top in rows 7-8 down to row 14.
  it("draws a contour on the farther part, only where the depth gap reaches the threshold", () => {
    const baked = bakeIsoLayers(floorAndPost(), { contourGap: 3, shadow: false });
    // Beside the post, the floor is 8, 7, 6, 4, 3, 2, 2 voxels farther than the post, top to
    // bottom. With a threshold of 3 the two rows at its foot get no contour.
    expect(layerText(baked.contour, 16)).toEqual([
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      ".....1....1.....",
      ".....1....1.....",
      ".....1....1.....",
      ".....1....1.....",
      ".....1....1.....",
      "................",
      "................",
      "................",
      "................",
    ]);
    // Every contour pixel belongs to the floor (part 1), the farther part, never to the post.
    baked.contour.forEach((value, at) => {
      if (value === 1) expect(baked.layers.part[at]).toBe(1);
    });
    // The contour is the darkest step of the floor's ramp (3), drawn on the floor. (The 5 in
    // row 13 is AO: the post stands in that corner of the floor's top.)
    expect(text(baked.buffer)).toEqual([
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      "..................",
      ".......8888.......",
      ".....33bbbb33.....",
      "...3363bbbb3633...",
      ".336663aa99366633.",
      "3666663aa993666661",
      "3666663aa993666661",
      "3556663aa993666441",
      "3555565aa996644441",
      ".115555aa99444411.",
      "...115555444411...",
      ".....11554411.....",
      ".......1111.......",
    ]);
  });

  it("the gap is measured in voxels of depth, per pixel pair", () => {
    const columns = (gap: number | null): number[] => {
      const { contour } = bakeIsoLayers(floorAndPost(), { contourGap: gap, shadow: false, cleanup: false });
      // The rows of the left contour line, column 5.
      const rows: number[] = [];
      for (let y = 0; y < 16; y += 1) if (contour[y * 16 + 5] === 1) rows.push(y);
      // The line on the other side of the post is its mirror image.
      for (let y = 0; y < 16; y += 1) expect(contour[y * 16 + 10]).toBe(contour[y * 16 + 5]);
      expect(contour.filter((value) => value === 1).length).toBe(2 * rows.length);
      return rows;
    };
    expect(DEFAULT_CONTOUR_GAP).toBe(2);
    expect(columns(2)).toEqual([7, 8, 9, 10, 11, 12, 13]);
    expect(columns(3)).toEqual([7, 8, 9, 10, 11]);
    expect(columns(4)).toEqual([7, 8, 9, 10]);
    expect(columns(5)).toEqual([7, 8, 9]);
    expect(columns(6)).toEqual([7, 8, 9]);
    expect(columns(7)).toEqual([7, 8]);
    expect(columns(8)).toEqual([7]);
    expect(columns(9)).toEqual([]);
    expect(columns(null)).toEqual([]);
    // The depth layer says the same: the top of the post is 9 voxels deep, the floor beside it 1.
    const { layers } = bakeIsoLayers(floorAndPost(), { shadow: false });
    expect([(layers.depth[7 * 16 + 6] as number) >> 1, (layers.depth[7 * 16 + 5] as number) >> 1]).toEqual([9, 1]);
    expect([(layers.depth[13 * 16 + 6] as number) >> 1, (layers.depth[13 * 16 + 5] as number) >> 1]).toEqual([7, 5]);
  });

  it("the default threshold is used when none is given, and a bad one throws", () => {
    const byDefault = bakeIsoLayers(floorAndPost(), { shadow: false });
    expect(byDefault.contour).toEqual(bakeIsoLayers(floorAndPost(), { shadow: false, contourGap: DEFAULT_CONTOUR_GAP }).contour);
    expect(byDefault.contour.filter((value) => value === 1).length).toBe(14);
    expect(() => bakeIso(floorAndPost(), { contourGap: 0 })).toThrow(/contourGap must be a positive integer or null, got 0/);
    expect(() => bakeIso(floorAndPost(), { contourGap: 1.5 })).toThrow(/contourGap must be/);
  });

  it("there is no contour inside one part, however large the depth gap", () => {
    // The same shape as one part: the post covers the floor exactly as before.
    const grid = new VoxelBuilder(palette, [4, 4, 4]).fill(box([0, 0, 0], [4, 1, 4]), "wood.2").fill(box([3, 1, 3], [4, 4, 4]), "steel.2").grid;
    const one = defineModel({ size: [4, 4, 4], palette, parts: [{ name: "all", grid }] });
    const baked = bakeIsoLayers(one, { contourGap: 1, shadow: false, cleanup: false });
    expect(baked.contour.filter((value) => value === 1).length).toBe(0);
    // The pixels are those of the two-part model without contours.
    expect(baked.buffer.equals(bakeIso(floorAndPost(), { contourGap: null, shadow: false, cleanup: false }))).toBe(true);
  });

  it("a contour that would change nothing is drawn in ink", () => {
    // A floor that is already the darkest step of its ramp: the contour cannot go darker.
    const dark = defineModel({
      size: [4, 4, 4],
      palette,
      parts: [
        { name: "floor", grid: block([4, 1, 4], "wood.0") },
        { name: "post", grid: block([1, 3, 1], "steel.2"), at: [3, 1, 3] },
      ],
    });
    const baked = bakeIsoLayers(dark, { shadow: false });
    const contourColors = new Set<number>();
    baked.contour.forEach((value, at) => {
      if (value === 1) contourColors.add(baked.buffer.get((at % 16) + 1, (at - (at % 16)) / 16 + 1));
    });
    // Tops of wood.0 are wood.1 (4), so the contour there is wood.0 (3); on the sides, which
    // are wood.0 already, it is ink.
    expect([...contourColors].sort()).toEqual([INK, WOOD_DARK]);
  });
});

describe("bakeIso: the outline on the two-part fixture", () => {
  const baked = bakeIsoLayers(floorAndPost(), { shadow: false });
  const { buffer, layers } = baked;
  /** The base colour of the model at a frame pixel; 0 where the model is not. */
  const model = (x: number, y: number): number => (x < 1 || y < 1 || x > 16 || y > 16 ? 0 : (layers.base[(y - 1) * 16 + x - 1] as number));
  const rim: { x: number; y: number; color: number }[] = [];
  for (let y = 0; y < buffer.h; y += 1) {
    for (let x = 0; x < buffer.w; x += 1) {
      if (model(x, y) === 0 && buffer.get(x, y) !== 0) rim.push({ x, y, color: buffer.get(x, y) });
    }
  }

  it("is one pixel around the shape, in ink and in the darkest steps of the ramps it touches", () => {
    // 16 pixels above the shape, 16 under it, 4 at its left corner and 4 at its right one.
    expect(rim.length).toBe(40);
    expect([...new Set(rim.map((pixel) => pixel.color))].sort((a, b) => a - b)).toEqual([INK, WOOD_DARK, STEEL_DARK]);
    // Every rim pixel touches the shape by an edge, and every empty pixel that does is rim.
    for (let y = 0; y < buffer.h; y += 1) {
      for (let x = 0; x < buffer.w; x += 1) {
        if (model(x, y) !== 0) continue;
        const touches = model(x - 1, y) !== 0 || model(x + 1, y) !== 0 || model(x, y - 1) !== 0 || model(x, y + 1) !== 0;
        expect(buffer.get(x, y) !== 0, `${x},${y}`).toBe(touches);
      }
    }
  });

  it("the lit-side rim uses the darkest step of the ramp it touches, not ink", () => {
    // Above the shape: the rim over the steel post is steel.0, over the wood floor wood.0.
    const above = rim.filter((pixel) => model(pixel.x, pixel.y + 1) !== 0 && model(pixel.x, pixel.y - 1) === 0);
    expect(above.length).toBe(16);
    for (const pixel of above) {
      const under = model(pixel.x, pixel.y + 1);
      expect(pixel.color, `${pixel.x},${pixel.y}`).toBe(under === STEEL ? STEEL_DARK : WOOD_DARK);
      expect(pixel.color).not.toBe(INK);
    }
    expect(above.filter((pixel) => pixel.color === STEEL_DARK).map((pixel) => `${pixel.x},${pixel.y}`)).toEqual(["7,6", "8,6", "9,6", "10,6"]);
    // To the left of the shape: the floor's left corner.
    expect([buffer.get(0, 10), buffer.get(0, 11), buffer.get(0, 12), buffer.get(0, 13)]).toEqual([WOOD_DARK, WOOD_DARK, WOOD_DARK, WOOD_DARK]);
  });

  it("the rim under the shape and to its right is ink", () => {
    const below = rim.filter((pixel) => model(pixel.x, pixel.y - 1) !== 0);
    expect(below.length).toBe(16);
    for (const pixel of below) expect(pixel.color, `${pixel.x},${pixel.y}`).toBe(INK);
    expect([buffer.get(17, 10), buffer.get(17, 11), buffer.get(17, 12), buffer.get(17, 13)]).toEqual([INK, INK, INK, INK]);
  });

  it("a slot that is in no ramp has no darker step: its lit rim is ink", () => {
    const flatPost = floorAndPost({ ramps: ["wood"], flatSlots: ["steel.2"] });
    const flat = bakeIso(flatPost, { shadow: false });
    expect(text(flat).slice(6, 9)).toEqual([".......1111.......", ".....33aaaa33.....", "...3363aaaa3633..."]);
  });

  it("the outline leaves no stray pixels: no pixel of the frame is alone in its colour", () => {
    for (const facing of ISO_FACINGS) expect(bakeIso(floorAndPost(), { facing }).orphanPixels(), facing).toEqual([]);
  });
});

describe("bakeIso: the far side", () => {
  // Two posts on the diagonal of a 4 x 2 x 4 box: one at the back corner, one at the front.
  const posts = (farShade?: boolean): VoxelModel =>
    defineModel({
      size: [4, 2, 4],
      palette,
      parts: [
        { name: "back", grid: block([1, 2, 1], "wood.2"), farShade },
        { name: "front", grid: block([1, 2, 1], "wood.2"), at: [3, 0, 3] },
      ],
      poses: { aside: { back: { offset: [3, 0, 0] } } },
    });

  it("a part behind the middle of the model is one ramp step darker", () => {
    const baked = bakeIsoLayers(posts(), { shadow: false, outline: false, margin: 0 });
    expect(baked.farParts).toEqual([1]);
    // The back post: top 5, left 4, right 3. The front post: 6, 5, 4.
    expect(layerText(baked.layers.color, 16)).toEqual([
      "......5555......",
      "......5555......",
      "......4433......",
      "......4433......",
      "......4433......",
      "......4433......",
      "......6666......",
      "......6666......",
      "......5544......",
      "......5544......",
      "......5544......",
      "......5544......",
    ]);
  });

  it("follows the facing, and can be switched off for a bake or for a part", () => {
    expect(bakeIsoLayers(posts(), { facing: "ne" }).farParts).toEqual([2]);
    expect(bakeIsoLayers(posts(), { facing: "se" }).farParts).toEqual([]);
    expect(bakeIsoLayers(posts(), { farShade: false }).farParts).toEqual([]);
    expect(bakeIsoLayers(posts(false)).farParts).toEqual([]);
  });

  it("is read from the rest pose: a part keeps its shade while it moves", () => {
    // Moved to the right corner, the back post is as near as the middle of the model.
    const moved = bakeIsoLayers(posts(), { pose: "aside", shadow: false, outline: false, margin: 0 });
    expect(moved.farParts).toEqual([1]);
    const colors = new Set(moved.layers.color.filter((_, at) => moved.layers.part[at] === 1));
    expect([...colors].sort()).toEqual([3, 4, 5]);
  });
});

describe("bakeIso: cleanup", () => {
  // Part a: three voxels around a corner. Part b: one voxel behind them, of which only the
  // bottom row of one side shows: two pixels.
  const speck = (): VoxelModel =>
    defineModel({
      size: [2, 2, 2],
      palette,
      parts: [
        { name: "a", grid: new VoxelGrid(2, 2, 2).set(0, 1, 0, WOOD).set(1, 0, 0, WOOD).set(0, 1, 1, WOOD) },
        { name: "b", grid: new VoxelGrid(1, 1, 1).set(0, 0, 0, STEEL) },
      ],
    });
  const bare = { shadow: false, outline: false, contourGap: null, margin: 0 } as const;

  it("a part that shows as a speck joins the part beside it", () => {
    expect(SPECK_AREA).toBe(2);
    const raw = bakeIsoLayers(speck(), { ...bare, cleanup: false });
    expect(layerText(raw.layers.part, 8)).toEqual(["..1111..", "111111..", "111111..", "11111111", "11111111", "..221111", "....1111", "........"]);
    expect(text(raw.buffer)[5]).toBe("..994544");
    const clean = bakeIsoLayers(speck(), bare);
    expect(layerText(clean.layers.part, 8)).toEqual(["..1111..", "111111..", "111111..", "11111111", "11111111", "..111111", "....1111", "........"]);
    expect(text(clean.buffer)[5]).toBe("..444544");
    expect(clean.buffer.data.includes(slot("steel.1"))).toBe(false);
  });

  it("a pixel whose shade no neighbour shares takes the shade around it", () => {
    const raw = bakeIso(speck(), { ...bare, cleanup: false });
    const clean = bakeIso(speck(), bare);
    // One AO pixel of wood.0 in the inner corner, alone among wood.1 and wood.2.
    expect(text(raw)[4]).toBe("55435666");
    expect(raw.orphanPixels().length).toBeGreaterThan(0);
    expect(text(clean)[4]).toBe("55445666");
    expect(clean.orphanPixels()).toEqual([]);
  });

  it("cleanup changes nothing where there is nothing to clean", () => {
    const cube = defineModel({ size: [3, 3, 3], palette, parts: [{ name: "a", grid: block([3, 3, 3], "wood.2") }] });
    for (const model of [voxel(), cube]) {
      expect(bakeIso(model, { margin: 3, cleanup: false }).equals(bakeIso(model, { margin: 3 }))).toBe(true);
    }
    // At a margin of 1 the corners of the voxel's shadow peek out as single pixels: they go.
    expect(bakeIso(voxel(), { cleanup: false }).orphanPixels().length).toBe(2);
    expect(bakeIso(voxel()).equals(bakeIso(voxel(), { shadow: false }))).toBe(true);
  });

  it("a contour of one pixel goes back to its fill", () => {
    // With a threshold of 8 the fixture's contour is one pixel on either side of the post's
    // top. Without a margin there is no rim beside it, so each is alone in its colour.
    const bareFrame = { contourGap: 8, shadow: false, margin: 0 } as const;
    const raw = bakeIsoLayers(floorAndPost(), { ...bareFrame, cleanup: false });
    expect(raw.contour.filter((value) => value === 1).length).toBe(2);
    expect(raw.buffer.orphanPixels().length).toBeGreaterThanOrEqual(2);
    const clean = bakeIsoLayers(floorAndPost(), bareFrame);
    expect(clean.contour.filter((value) => value === 1).length).toBe(0);
    expect(clean.buffer.equals(bakeIso(floorAndPost(), { ...bareFrame, contourGap: null }))).toBe(true);
    expect(clean.buffer.orphanPixels()).toEqual([]);
    // A line of contour stays as it is.
    const line = { contourGap: 3, shadow: false, margin: 0 } as const;
    expect(bakeIsoLayers(floorAndPost(), line).contour).toEqual(bakeIsoLayers(floorAndPost(), { ...line, cleanup: false }).contour);
  });
});

describe("bakeIso: validation, poses and determinism", () => {
  const tooSmall = (): VoxelModel => defineModel({ size: [1, 1, 1], palette, parts: [{ name: "v", grid: block([1, 2, 1], "wood.2") }] });

  it("refuses a model that fails the structural validation, unless told not to check", () => {
    expect(() => bakeIso(tooSmall())).toThrow(/voxel model: 1 problem\(s\):\n {2}\[bounds\] pose "rest": 1 voxel\(s\) of part "v" lie outside the model's size 1 x 1 x 1/);
    const model = tooSmall();
    expect(() => bakeIso(model)).toThrow(/\[bounds\]/);
    expect(() => bakeIso(model)).toThrow(/\[bounds\]/); // and again: a failure is not remembered as a pass
    expect(text(bakeIso(model, { check: false, shadow: false }))).toEqual([".3333.", "366661", "366661", "355441", "355441", ".1111."]);
  });

  it("checks a pose written inline every time, and a named pose with the model", () => {
    const model = defineModel({ size: [1, 2, 1], palette, parts: [{ name: "v", grid: block([1, 1, 1], "wood.2") }], poses: { jump: { v: { offset: [0, 1, 0] } } } });
    expect(bakeIso(model, { pose: "jump" }).equals(bakeIso(model, { pose: { v: { offset: [0, 1, 0] } } }))).toBe(true);
    expect(bakeIso(model, { pose: "jump" }).equals(bakeIso(model))).toBe(false);
    expect(() => bakeIso(model, { pose: { v: { offset: [0, 2, 0] } } })).toThrow(/\[bounds\] pose "this pose": 1 voxel\(s\) of part "v"/);
    expect(() => bakeIso(model, { pose: "fly" })).toThrow(/no pose named "fly" \(poses: jump\)/);
    expect(() => bakeIso(model, { pose: { w: {} } })).toThrow(/no part named "w"/);
    const badPose = defineModel({ size: [1, 2, 1], palette, parts: [{ name: "v", grid: block([1, 1, 1], "wood.2") }], poses: { fly: { v: { offset: [0, 5, 0] } } } });
    // The rest pose is fine, but the model is not: one of its named poses leaves the box.
    expect(() => bakeIso(badPose)).toThrow(/\[bounds\] pose "fly"/);
  });

  it("baking twice gives identical bytes, in a new buffer", () => {
    const grid = randomGrid([5, 6, 5], 21);
    grid.data.forEach((value, i) => {
      if (value !== 0) grid.data[i] = [WOOD, STEEL, slot("red.2")][value % 3] as number;
    });
    const build = (): VoxelModel => defineModel({ size: [5, 6, 5], palette, parts: [{ name: "a", grid: grid.clone() }] });
    const model = build();
    for (const facing of ISO_FACINGS) {
      const first = bakeIso(model, { facing });
      const second = bakeIso(model, { facing });
      const third = bakeIso(build(), { facing });
      expect(second).not.toBe(first);
      expect(Buffer.from(second.data).equals(Buffer.from(first.data)), facing).toBe(true);
      expect(Buffer.from(third.data).equals(Buffer.from(first.data)), facing).toBe(true);
    }
    // Baking does not change the model.
    expect(model.parts[0]?.grid.equals(grid)).toBe(true);
  });

  it("the layers a bake returns are the projection, in the frame's coordinates", () => {
    const baked = bakeIsoLayers(voxel(), { margin: 2, shadow: false });
    expect(baked.margin).toBe(2);
    expect([baked.layers.w, baked.layers.h]).toEqual([isoSize([1, 1, 1]).w, isoSize([1, 1, 1]).h]);
    expect(layerText(baked.layers.color, 4)).toEqual(["6666", "6666", "5544", "5544"]);
    expect(baked.layers.face[0]).toBe(FACE_TOP);
    expect(baked.buffer.get(2, 2)).toBe(baked.layers.color[0]);
    expect(baked.farParts).toEqual([]);
  });
});
