import { describe, expect, it } from "vitest";
import { assertValidModel, box, defineModel, degrees, VALIDATION_RULES, validateModel, VoxelBuilder, VoxelGrid } from "../src/index.ts";
import type { ModelSpec, PartSpec, ValidationReport, Vec3 } from "../src/index.ts";
import { palette, slot } from "./helpers.ts";

const block = (size: Vec3, material = "wood.2"): VoxelGrid => new VoxelBuilder(palette, size).fill(box([0, 0, 0], size), material).grid;

/** A model of 4 x 2 x 2 with the given parts; one block that fills it if none are given. */
function check(spec: Partial<ModelSpec> = {}, parts?: readonly PartSpec[]): ValidationReport {
  return validateModel(defineModel({ size: [4, 2, 2], palette, parts: parts ?? [{ name: "a", grid: block([4, 2, 2]) }], ...spec }));
}

const rules = (report: ValidationReport): string[] => report.findings.map((finding) => finding.rule);

describe("validateModel", () => {
  it("lists its rules", () => {
    expect(VALIDATION_RULES).toEqual(["bounds", "budget", "palette", "pivot", "empty", "tile", "mirror"]);
  });

  it("a good model has no findings, and the report carries its numbers", () => {
    const report = check({ budget: 16, tile: [4, 2], symmetric: true });
    expect(report).toEqual({ ok: true, findings: [], voxels: 16, budget: 16, footprint: [4, 2], mirrorDiff: 0 });
    expect(() => assertValidModel(defineModel({ size: [1, 1, 1], palette, parts: [{ name: "a", grid: block([1, 1, 1]) }] }))).not.toThrow();
  });

  it("bounds: a voxel of a part lies outside the model's size", () => {
    const report = check({}, [{ name: "a", grid: block([4, 2, 2]), at: [1, 0, 0] }]);
    expect(report.ok).toBe(false);
    expect(report.findings).toEqual([
      { rule: "bounds", part: "a", pose: "rest", message: `pose "rest": 4 voxel(s) of part "a" lie outside the model's size 4 x 2 x 2` },
    ]);
    // The empty rim of a part's grid does not count: only voxels do.
    expect(check({}, [{ name: "a", grid: new VoxelGrid(4, 2, 2).set(0, 0, 0, slot("wood.2")), at: [3, 1, 1] }]).ok).toBe(true);
  });

  it("bounds: every named pose is checked, and any pose passed in", () => {
    const model = defineModel({
      size: [4, 2, 2],
      palette,
      parts: [{ name: "a", grid: block([1, 2, 1]), pivot: [0, 0, 0] }],
      poses: { lean: { a: { rotate: { axis: "z", angle: degrees(-90) } } }, hop: { a: { offset: [1, 0, 0] } } },
    });
    const report = validateModel(model);
    // Leaning over around the pivot at its foot, the part ends up under the ground.
    expect(report.findings).toEqual([{ rule: "bounds", part: "a", pose: "lean", message: `pose "lean": 2 voxel(s) of part "a" lie outside the model's size 4 x 2 x 2` }]);
    const extra = validateModel(model, { poses: { fly: { a: { offset: [0, 1, 0] } } } });
    expect(extra.findings.map((finding) => finding.pose)).toEqual(["lean", "fly"]);
    expect(() => assertValidModel(model)).toThrow(/voxel model: 1 problem\(s\):\n {2}\[bounds\] pose "lean": 2 voxel\(s\)/);
  });

  it("budget: the parts have more voxels together than the budget", () => {
    const report = check({ budget: 15 });
    expect(report.findings).toEqual([{ rule: "budget", message: "16 voxels, but the budget is 15" }]);
    expect([report.voxels, report.budget]).toEqual([16, 15]);
    // Voxels that another part covers still count: the budget is about what is written.
    const stacked = check({ budget: 16 }, [
      { name: "a", grid: block([4, 2, 2]) },
      { name: "b", grid: block([1, 1, 1]) },
    ]);
    expect(rules(stacked)).toEqual(["budget"]);
    expect(stacked.voxels).toBe(17);
  });

  it("palette: a voxel is not a slot of the palette, or is in no ramp and not a flat slot", () => {
    const stray = check({}, [{ name: "a", grid: block([4, 2, 2]).set(0, 0, 0, 200).set(1, 0, 0, 200) }]);
    expect(stray.findings).toEqual([
      { rule: "palette", part: "a", message: `part "a": 2 voxel(s) have the index 200, but palette "voxel-example" has only ${palette.size} slots` },
    ]);
    const ink = [{ name: "a", grid: block([4, 2, 2]).set(0, 0, 0, slot("ink")) }];
    expect(check({}, ink).findings[0]?.message).toMatch(/part "a": 1 voxel\(s\) use "ink", which is in no ramp of the model \(.*\); paint with a ramp, or list the slot in flatSlots/);
    expect(check({ flatSlots: ["ink"] }, ink).ok).toBe(true);
    // A model that names its ramps treats the slots of the other ramps as flat.
    const steel = [{ name: "a", grid: block([4, 2, 2], "steel.2") }];
    expect(rules(check({ ramps: ["wood"] }, steel))).toEqual(["palette"]);
    expect(check({ ramps: ["wood", "steel"] }, steel).ok).toBe(true);
  });

  it("pivot: the joint of a part is not a lattice point of the part", () => {
    expect(check({}, [{ name: "a", grid: block([1, 2, 1]), pivot: [1, 2, 1] }]).ok).toBe(true);
    const report = check({}, [{ name: "a", grid: block([1, 2, 1]), pivot: [0, 3, 0] }]);
    expect(report.findings).toEqual([
      { rule: "pivot", part: "a", message: `part "a": the pivot [0, 3, 0] is outside the part, whose lattice is [0, 0, 0] .. [1, 2, 1]` },
    ]);
    expect(rules(check({}, [{ name: "a", grid: block([1, 2, 1]), pivot: [-1, 0, 0] }]))).toEqual(["pivot"]);
  });

  it("empty: a part has no voxels", () => {
    const report = check({}, [
      { name: "a", grid: block([4, 2, 2]) },
      { name: "ghost", grid: new VoxelGrid(1, 1, 1) },
    ]);
    expect(report.findings).toEqual([{ rule: "empty", part: "ghost", message: `part "ghost" has no voxels` }]);
  });

  it("tile: the footprint of a pose is larger than the tile the model stands on", () => {
    expect(check({ tile: [4, 2] }).ok).toBe(true);
    const report = check({ tile: [3, 2] });
    expect(report.findings).toEqual([{ rule: "tile", pose: "rest", message: `pose "rest": the footprint is 4 x 2 voxels, but the tile is 3 x 2` }]);
    expect(report.footprint).toEqual([4, 2]);
    // A pose that steps off the tile, inside the model's size.
    const stepping = check({ tile: [1, 1], poses: { step: { foot: { offset: [1, 0, 0] } } } }, [
      { name: "body", grid: block([1, 2, 1]) },
      { name: "foot", grid: block([1, 1, 1]) },
    ]);
    expect(stepping.findings).toEqual([{ rule: "tile", pose: "step", message: `pose "step": the footprint is 2 x 1 voxels, but the tile is 1 x 1` }]);
    expect(stepping.footprint).toEqual([2, 1]);
  });

  it("mirror: a model marked symmetric is not its own mirror image along x", () => {
    const lopsided = [{ name: "a", grid: block([4, 2, 2]).set(0, 1, 0, 0) }];
    const report = check({ symmetric: true }, lopsided);
    expect(report.findings).toEqual([
      { rule: "mirror", pose: "rest", message: "the model is marked symmetric, but 1 voxel(s) of the rest pose have no mirror image along x" },
    ]);
    expect(report.mirrorDiff).toBe(1);
    // Not marked: the number is reported, and it is no finding. Colours never count.
    expect(check({}, lopsided)).toMatchObject({ ok: true, mirrorDiff: 1 });
    expect(check({ symmetric: true }, [{ name: "a", grid: block([4, 2, 2]).set(0, 0, 0, slot("steel.2")) }]).ok).toBe(true);
    // Only the rest pose has to be symmetric: a walk is not.
    const walking = check({ symmetric: true, poses: { step: { a: { offset: [0, 0, 0] }, b: { offset: [0, 0, 1] } } } }, [
      { name: "a", grid: block([4, 1, 1]) },
      { name: "b", grid: block([1, 1, 1]) },
    ]);
    expect(walking.ok).toBe(true);
  });

  it("reports every problem at once, and assertValidModel lists them all", () => {
    const model = defineModel({
      size: [4, 2, 2],
      palette,
      budget: 2,
      tile: [1, 1],
      symmetric: true,
      parts: [
        { name: "a", grid: block([3, 2, 2]).set(0, 0, 0, slot("ink")), at: [2, 0, 0], pivot: [9, 0, 0] },
        { name: "ghost", grid: new VoxelGrid(1, 1, 1) },
      ],
    });
    const report = validateModel(model);
    expect(new Set(rules(report))).toEqual(new Set(VALIDATION_RULES));
    expect(() => assertValidModel(model)).toThrow(new RegExp(`voxel model: ${report.findings.length} problem\\(s\\):`));
    try {
      assertValidModel(model);
    } catch (error) {
      const lines = (error as Error).message.split("\n");
      expect(lines.length).toBe(report.findings.length + 1);
      report.findings.forEach((finding, i) => expect(lines[i + 1]).toBe(`  [${finding.rule}] ${finding.message}`));
    }
  });
});
