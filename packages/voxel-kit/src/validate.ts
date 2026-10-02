// Structural validation of a voxel model (research/voxels.md §4.5): the checks that need no
// image. A model that fails one is wrong before it is baked, so `bakeIso` refuses it.
//
//   bounds    a voxel of a posed part lies outside the model's size
//   budget    the parts have more voxels together than the budget
//   palette   a voxel's index is not a slot of the palette, or is in no ramp of the model
//             and not in its `flatSlots`
//   pivot     a part's pivot is not a lattice point of the part
//   empty     a part has no voxels
//   tile      the footprint of a pose is larger than the model's tile
//   mirror    a `symmetric` model is not its own mirror image along x in the rest pose
//
// The rest pose and every named pose of the model are checked, plus any pose passed in.

import { EMPTY, mirrorDiff } from "./grid.ts";
import { assemble, REST } from "./model.ts";
import type { Pose, VoxelModel } from "./model.ts";

export const VALIDATION_RULES = ["bounds", "budget", "palette", "pivot", "empty", "tile", "mirror"] as const;
export type ValidationRule = (typeof VALIDATION_RULES)[number];

/** One problem of a model. */
export interface ValidationFinding {
  readonly rule: ValidationRule;
  readonly message: string;
  /** The part, where the rule is about one. */
  readonly part?: string;
  /** The pose, where the rule is about one ("rest" for the rest pose). */
  readonly pose?: string;
}

/** What `validateModel` returns. */
export interface ValidationReport {
  readonly ok: boolean;
  readonly findings: readonly ValidationFinding[];
  /** The voxels of all parts together, and the budget they are held against. */
  readonly voxels: number;
  readonly budget: number;
  /** The largest footprint over the checked poses, `[x, z]` in voxels. */
  readonly footprint: readonly [x: number, z: number];
  /** Voxels of the rest pose without a mirror image along x (see `mirrorDiff`). */
  readonly mirrorDiff: number;
}

/** Options of `validateModel`. */
export interface ValidateOptions {
  /** More poses to check, by a label for the messages. */
  readonly poses?: Readonly<Record<string, Pose>>;
}

/** Checks a model. Never throws for a problem of the model: every problem is a finding. */
export function validateModel(model: VoxelModel, options: ValidateOptions = {}): ValidationReport {
  const findings: ValidationFinding[] = [];
  const { palette, shade } = model;
  const flat = new Set(model.flatSlots.map((name) => palette.slot(name)));

  let voxels = 0;
  for (const part of model.parts) {
    const { grid } = part;
    const count = grid.count();
    voxels += count;
    if (count === 0) findings.push({ rule: "empty", part: part.name, message: `part "${part.name}" has no voxels` });

    const size = grid.size;
    if (part.pivot.some((value, axis) => value < 0 || value > (size[axis] as number))) {
      findings.push({
        rule: "pivot",
        part: part.name,
        message: `part "${part.name}": the pivot [${part.pivot.join(", ")}] is outside the part, whose lattice is [0, 0, 0] .. [${size.join(", ")}]`,
      });
    }

    const bad = new Map<number, number>();
    for (let i = 0; i < grid.data.length; i += 1) {
      const index = grid.data[i] as number;
      if (index === EMPTY) continue;
      if (index >= palette.size || (shade.stepOf(index) < 0 && !flat.has(index))) bad.set(index, (bad.get(index) ?? 0) + 1);
    }
    for (const [index, times] of [...bad].sort((a, b) => a[0] - b[0])) {
      const slot = palette.slots[index];
      findings.push({
        rule: "palette",
        part: part.name,
        message:
          slot === undefined
            ? `part "${part.name}": ${times} voxel(s) have the index ${index}, but palette "${palette.id}" has only ${palette.size} slots`
            : `part "${part.name}": ${times} voxel(s) use "${slot.name}", which is in no ramp of the model (${shade.ramps.join(", ") || "none"}); paint with a ramp, or list the slot in flatSlots`,
      });
    }
  }
  if (voxels > model.budget) {
    findings.push({ rule: "budget", message: `${voxels} voxels, but the budget is ${model.budget}` });
  }

  const poses: [string, Pose][] = [["rest", REST], ...Object.entries(model.poses), ...Object.entries(options.poses ?? {})];
  let footX = 0;
  let footZ = 0;
  let mirror = 0;
  for (const [label, pose] of poses) {
    const assembled = assemble(model, pose);
    assembled.outside.forEach((dropped, number) => {
      if (dropped === 0) return;
      const name = (model.parts[number] as { name: string }).name;
      findings.push({
        rule: "bounds",
        part: name,
        pose: label,
        message: `pose "${label}": ${dropped} voxel(s) of part "${name}" lie outside the model's size ${model.size.join(" x ")}`,
      });
    });
    const bounds = assembled.voxels.bounds();
    if (bounds !== null) {
      const x = bounds.max[0] - bounds.min[0];
      const z = bounds.max[2] - bounds.min[2];
      footX = Math.max(footX, x);
      footZ = Math.max(footZ, z);
      if (model.tile !== null && (x > model.tile[0] || z > model.tile[1])) {
        findings.push({
          rule: "tile",
          pose: label,
          message: `pose "${label}": the footprint is ${x} x ${z} voxels, but the tile is ${model.tile[0]} x ${model.tile[1]}`,
        });
      }
    }
    if (label === "rest") {
      mirror = mirrorDiff(assembled.voxels);
      if (model.symmetric && mirror > 0) {
        findings.push({
          rule: "mirror",
          pose: label,
          message: `the model is marked symmetric, but ${mirror} voxel(s) of the rest pose have no mirror image along x`,
        });
      }
    }
  }

  return { ok: findings.length === 0, findings, voxels, budget: model.budget, footprint: [footX, footZ], mirrorDiff: mirror };
}

/** Throws an error that lists every finding, if there is one. */
export function assertValidModel(model: VoxelModel, options: ValidateOptions = {}): void {
  const report = validateModel(model, options);
  if (report.ok) return;
  throw new Error(`voxel model: ${report.findings.length} problem(s):\n${report.findings.map((finding) => `  [${finding.rule}] ${finding.message}`).join("\n")}`);
}
