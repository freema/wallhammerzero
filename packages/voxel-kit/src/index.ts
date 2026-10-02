// @whz/voxel-kit: voxel models as programs, and the software baker that turns them into 2:1
// isometric pixel art. See README.md. No I/O: it runs unchanged in Node and in the browser.

export { bakeIso, bakeIsoLayers, DEFAULT_CONTOUR_GAP, facingTurns, ISO_FACINGS, isoFrame, isoPoint, outlineSlots, SPECK_AREA } from "./bake.ts";
export type { BakedIso, BakeOptions, IsoFacing, IsoFrame, ShadowOptions } from "./bake.ts";
export { CARVE, hash3, VoxelBuilder } from "./builder.ts";
export type { Carve, JitterOptions, SculptBox, VoxelFn } from "./builder.ts";
export { EMPTY, MAX_GRID_SIZE, mirrorDiff, VoxelGrid } from "./grid.ts";
export type { Vec3, VoxelBounds } from "./grid.ts";
export { assemble, DEFAULT_VOXEL_BUDGET, defineModel, degrees, MAX_PARTS, resolvePose, REST, revoxelise } from "./model.ts";
export type { Assembled, Axis, ModelPart, ModelSpec, PartPose, PartSpec, PlacedGrid, Pose, VoxelModel } from "./model.ts";
export { FACE_LEFT, FACE_RIGHT, FACE_TOP, isoSize, NO_DEPTH, projectIso } from "./project.ts";
export type { IsoLayers, ProjectOptions } from "./project.ts";
export { materialIndex, ShadeTable } from "./shade.ts";
export type { Material } from "./shade.ts";
export { box, capsule, ellipsoid, roundBox } from "./shapes.ts";
export type { Region } from "./shapes.ts";
export { assertValidModel, VALIDATION_RULES, validateModel } from "./validate.ts";
export type { ValidateOptions, ValidationFinding, ValidationReport, ValidationRule } from "./validate.ts";
