import { TURN } from "@whz/det";
import { describe, expect, it } from "vitest";
import { assemble, box, DEFAULT_VOXEL_BUDGET, defineModel, degrees, resolvePose, REST, revoxelise, VoxelBuilder, VoxelGrid } from "../src/index.ts";
import type { ModelSpec, PartSpec, VoxelModel } from "../src/index.ts";
import { palette } from "./helpers.ts";

const block = (size: readonly [number, number, number], material: string): VoxelGrid =>
  new VoxelBuilder(palette, size).fill(box([0, 0, 0], size), material).grid;

/** A 3 x 2 x 2 model: a wood slab, and a steel post that stands in it. */
function slabAndPost(extra: Partial<ModelSpec> = {}): VoxelModel {
  return defineModel({
    size: [3, 2, 2],
    palette,
    parts: [
      { name: "slab", grid: block([3, 1, 2], "wood.2") },
      { name: "post", grid: block([1, 2, 1], "steel.2"), at: [1, 0, 0], pivot: [0, 0, 0] },
    ],
    ...extra,
  });
}

describe("defineModel", () => {
  it("fills in the defaults and freezes the model", () => {
    const model = defineModel({ size: [2, 2, 2], palette, parts: [{ name: "a", grid: block([1, 1, 1], "wood.2") }] });
    expect(model.size).toEqual([2, 2, 2]);
    expect(model.parts.map(({ name, at, pivot, farShade }) => ({ name, at, pivot, farShade }))).toEqual([
      { name: "a", at: [0, 0, 0], pivot: [0, 0, 0], farShade: true },
    ]);
    expect(model.budget).toBe(DEFAULT_VOXEL_BUDGET);
    expect(model.tile).toBeNull();
    expect(model.symmetric).toBe(false);
    expect(model.flatSlots).toEqual([]);
    expect(model.poses).toEqual({});
    expect(model.shade.ramps).toEqual(palette.rampNames);
    expect(Object.isFrozen(model) && Object.isFrozen(model.parts) && Object.isFrozen(model.parts[0]) && Object.isFrozen(model.size)).toBe(true);
  });

  it("keeps what the spec gives", () => {
    const model = slabAndPost({ budget: 16, tile: [3, 2], symmetric: true, ramps: ["wood", "steel"], flatSlots: ["ink"], poses: { up: { post: { offset: [0, 0, 1] } } } });
    expect(model.budget).toBe(16);
    expect(model.tile).toEqual([3, 2]);
    expect(model.symmetric).toBe(true);
    expect(model.shade.ramps).toEqual(["wood", "steel"]);
    expect(model.flatSlots).toEqual(["ink"]);
    expect(Object.keys(model.poses)).toEqual(["up"]);
    expect(model.parts[1]?.at).toEqual([1, 0, 0]);
  });

  it("throws on a definition that is not a model, and names the field", () => {
    const part: PartSpec = { name: "a", grid: block([1, 1, 1], "wood.2") };
    const define = (spec: Partial<ModelSpec>) => () => defineModel({ size: [2, 2, 2], palette, parts: [part], ...spec });
    expect(define({ size: [2, 2] as unknown as [number, number, number] })).toThrow(/defineModel: size must be \[x, y, z\]/);
    expect(define({ size: [0, 2, 2] })).toThrow(/nx must be an integer in \[1, 128\]/);
    expect(define({ parts: [] })).toThrow(/voxel model: "parts" must list at least one part/);
    expect(define({ parts: [{ ...part, name: "Arm L" }] })).toThrow(/parts\[0\]\.name must be lowercase letters, digits and dashes, got "Arm L"/);
    expect(define({ parts: [part, part] })).toThrow(/the part name "a" is used twice/);
    expect(define({ parts: [{ name: "a", grid: {} as VoxelGrid }] })).toThrow(/part "a": "grid" must be a VoxelGrid/);
    expect(define({ parts: [{ ...part, at: [0, 0.5, 0] }] })).toThrow(/part a: at must hold integers/);
    expect(define({ parts: [{ ...part, pivot: [0, 0] as unknown as [number, number, number] }] })).toThrow(/part a: pivot must be \[x, y, z\]/);
    expect(define({ budget: 0 })).toThrow(/"budget" must be a positive integer, got 0/);
    expect(define({ tile: [0, 2] })).toThrow(/"tile" must be \[x, z\] in voxels, got \[0,2\]/);
    expect(define({ flatSlots: ["nope"] })).toThrow();
    expect(define({ ramps: ["nope"] })).toThrow();
    expect(define({ poses: { Up: {} } })).toThrow(/the pose name "Up" must be lowercase letters, digits and dashes/);
    expect(define({ poses: { up: { b: { offset: [0, 1, 0] } } } })).toThrow(/pose "up": no part named "b" \(parts: a\)/);
    expect(define({ poses: { up: { a: { offset: [0, 1.5, 0] } } } })).toThrow(/a\.offset must hold integers/);
    expect(define({ poses: { up: { a: { rotate: { axis: "w" as "x", angle: 0 } } } } })).toThrow(/a\.rotate\.axis must be "x", "y" or "z", got "w"/);
    expect(define({ poses: { up: { a: { rotate: { axis: "x", angle: 0.5 } } } } })).toThrow(/a\.rotate\.angle must be an integer in TURN units \(use degrees\(\)\)/);
  });
});

describe("degrees", () => {
  it("turns whole degrees into TURN units, rounded", () => {
    expect(TURN).toBe(4096);
    expect([0, 90, 180, 360, -90].map(degrees)).toEqual([0, 1024, 2048, 4096, -1024]);
    expect(degrees(45)).toBe(512);
    expect(degrees(30)).toBe(341); // 341.33
    expect(degrees(-30)).toBe(-341);
    expect(degrees(1)).toBe(11); // 11.38
  });
});

describe("resolvePose", () => {
  const model = slabAndPost({ poses: { up: { post: { offset: [0, 0, 1] } } } });

  it("gives the rest pose, a named pose, or the pose itself", () => {
    expect(resolvePose(model, undefined)).toBe(REST);
    expect(resolvePose(model, "up")).toBe(model.poses["up"]);
    const inline = { slab: { offset: [0, 0, 0] } } as const;
    expect(resolvePose(model, inline)).toBe(inline);
  });

  it("throws on an unknown pose name or part", () => {
    expect(() => resolvePose(model, "down")).toThrow(/voxel model: no pose named "down" \(poses: up\)/);
    expect(() => resolvePose(slabAndPost(), "up")).toThrow(/no pose named "up" \(poses: none\)/);
    expect(() => resolvePose(model, "toString")).toThrow(/no pose named "toString"/);
    expect(() => resolvePose(model, { lid: {} })).toThrow(/pose: no part named "lid" \(parts: slab, post\)/);
  });
});

describe("assemble", () => {
  it("stacks the parts in order: a later part overwrites, and every voxel knows its part", () => {
    const { voxels, partIds, outside } = assemble(slabAndPost());
    expect(voxels.size).toEqual([3, 2, 2]);
    expect(voxels.slice(0)).toBe("5a5\n555");
    expect(voxels.slice(1)).toBe(".a.\n...");
    expect(partIds.slice(0)).toBe("121\n111");
    expect(partIds.slice(1)).toBe(".2.\n...");
    expect(outside).toEqual([0, 0]);
  });

  it("moves a part by the offset of a pose, given inline or by name", () => {
    const model = slabAndPost({ poses: { front: { post: { offset: [1, 0, 1] } } } });
    const moved = assemble(model, "front");
    expect(moved.voxels.slice(0)).toBe("555\n55a");
    expect(moved.voxels.slice(1)).toBe("...\n..a");
    expect(assemble(model, { post: { offset: [1, 0, 1] } }).voxels.equals(moved.voxels)).toBe(true);
    // The rest pose is untouched by it.
    expect(assemble(model).voxels.slice(0)).toBe("5a5\n555");
  });

  it("drops the voxels that leave the model's size, and counts them per part", () => {
    const { voxels, outside } = assemble(slabAndPost(), { post: { offset: [0, 1, 0] }, slab: { offset: [-1, 0, 0] } });
    expect(outside).toEqual([2, 1]);
    expect(voxels.slice(0)).toBe("55.\n55.");
    expect(voxels.slice(1)).toBe(".a.\n...");
  });

  it("turns a part around its pivot", () => {
    // The post lies down along +x: a quarter turn around z that takes y toward x is -90 degrees.
    const { voxels, outside } = assemble(slabAndPost(), { post: { rotate: { axis: "z", angle: degrees(-90) } } });
    // Turned around the pivot at the post's low corner, it would lie under the floor: y = -1.
    expect(outside).toEqual([0, 2]);
    expect(voxels.slice(0)).toBe("555\n555");
    const lifted = assemble(slabAndPost(), { post: { offset: [0, 2, 0], rotate: { axis: "z", angle: degrees(-90) } } });
    expect(lifted.outside).toEqual([0, 0]);
    expect(lifted.voxels.slice(1)).toBe(".aa\n...");
  });
});

describe("revoxelise", () => {
  // A bar along y with three different values, bottom to top.
  const bar = (): VoxelGrid => new VoxelGrid(1, 3, 1).set(0, 0, 0, 3).set(0, 1, 0, 5).set(0, 2, 0, 7);

  it("a quarter turn moves every voxel exactly", () => {
    // Around z, a positive angle turns x toward y: the bar that stood along +y lies along -x.
    const left = revoxelise(bar(), [0, 0, 0], "z", degrees(90));
    expect(left.at).toEqual([-3, 0, 0]);
    expect(left.grid.size).toEqual([3, 1, 1]);
    expect(left.grid.slice(0)).toBe("753");
    const right = revoxelise(bar(), [0, 0, 0], "z", degrees(-90));
    expect(right.at).toEqual([0, -1, 0]);
    expect(right.grid.slice(0)).toBe("357");
    // Around x, a positive angle turns y toward z.
    const forward = revoxelise(bar(), [0, 0, 0], "x", degrees(90));
    expect(forward.at).toEqual([0, -1, 0]);
    expect(forward.grid.size).toEqual([1, 1, 3]);
    expect(forward.grid.slice(0)).toBe("3\n5\n7");
    // Around y, the bar turns in place around the pivot.
    const spun = revoxelise(bar(), [0, 0, 0], "y", degrees(90));
    expect(spun.at).toEqual([0, 0, -1]);
    expect(spun.grid.equals(bar())).toBe(true);
  });

  it("turns around the pivot it is given", () => {
    const top = revoxelise(bar(), [0, 3, 0], "z", degrees(90));
    // The pivot is the top-left corner of the bar: the bar hangs from it, then points along +x.
    expect(top.at).toEqual([0, 3, 0]);
    expect(top.grid.slice(0)).toBe("753");
  });

  it("four quarter turns around the centre give the grid back", () => {
    const square = new VoxelGrid(2, 2, 1).set(0, 0, 0, 3).set(1, 0, 0, 4).set(0, 1, 0, 5).set(1, 1, 0, 6);
    const once = revoxelise(square, [1, 1, 0], "z", degrees(90));
    expect(once.at).toEqual([0, 0, 0]);
    expect([once.grid.slice(0), once.grid.slice(1)]).toEqual(["53", "64"]);
    let grid = square;
    for (let turn = 0; turn < 4; turn += 1) grid = revoxelise(grid, [1, 1, 0], "z", degrees(90)).grid;
    expect(grid.equals(square)).toBe(true);
    const half = revoxelise(square, [1, 1, 0], "z", degrees(180));
    expect(half.grid.equals(revoxelise(once.grid, [1, 1, 0], "z", degrees(90)).grid)).toBe(true);
  });

  it("a full turn, no turn and an empty grid come back as a copy", () => {
    for (const angle of [0, TURN, -TURN, 3 * TURN]) {
      const same = revoxelise(bar(), [0, 3, 0], "x", angle);
      expect(same.at).toEqual([0, 0, 0]);
      expect(same.grid.equals(bar())).toBe(true);
      expect(same.grid).not.toBe(bar());
    }
    const empty = revoxelise(new VoxelGrid(2, 2, 2), [0, 0, 0], "x", degrees(30));
    expect(empty.grid.count()).toBe(0);
    expect(empty.at).toEqual([0, 0, 0]);
  });

  it("an angle is periodic", () => {
    const a = revoxelise(bar(), [0, 3, 0], "x", degrees(30));
    const b = revoxelise(bar(), [0, 3, 0], "x", degrees(30) + TURN);
    const c = revoxelise(bar(), [0, 3, 0], "x", degrees(30) - TURN);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("a small swing is a nearest-voxel resampling: the part keeps its size, give or take a voxel, and stays whole", () => {
    // The arm of the test chibi: 1 x 3 x 2, hanging from the shoulder at its top.
    const arm = new VoxelBuilder(palette, [1, 3, 2]).sculpt([
      { a: [0, 0, 0], b: [1, 3, 2], c: ["red", 2] },
      { a: [0, 0, 0], b: [1, 1, 2], c: ["skin", 2] },
    ]).grid;
    for (const angle of [10, 20, 30, 45, -30, -45]) {
      const swung = revoxelise(arm, [0, 3, 1], "x", degrees(angle));
      const count = swung.grid.count();
      expect(Math.abs(count - 6), `${angle} degrees: ${count} voxels`).toBeLessThanOrEqual(1);
      // It stays one voxel thick, and it still has a hand and a sleeve.
      expect(swung.grid.nx).toBe(1);
      const values = new Set(swung.grid.data);
      expect(values.has(palette.slot("skin.2")) && values.has(palette.slot("red.2")), `${angle} degrees`).toBe(true);
      // The same input gives the same voxels.
      expect(revoxelise(arm, [0, 3, 1], "x", degrees(angle))).toEqual(swung);
    }
    // A swing forward and a swing back are mirror images along z around the pivot.
    const forward = revoxelise(arm, [0, 3, 1], "x", degrees(30));
    const back = revoxelise(arm, [0, 3, 1], "x", degrees(-30));
    expect(forward.grid.rotatedY(2).equals(back.grid)).toBe(true);
    expect(forward.at[1]).toBe(back.at[1]);
  });

  it("throws on an angle that is not an integer", () => {
    expect(() => revoxelise(bar(), [0, 0, 0], "x", 0.5)).toThrow(/revoxelise: the angle must be an integer in TURN units/);
    expect(() => revoxelise(bar(), [0, 0] as unknown as [number, number, number], "x", 0)).toThrow(/pivot must be \[x, y, z\]/);
  });
});
