// @whz/citygen: New Hope's city generator. Pure: no I/O, no clock, integers only; see README.md.

export { DIRS, DX, DY, F, FACADE_CHARS, FACADES, isFlat, isWalkable, K, KIND_CHARS, KINDS, opposite, STAIRS_CHARS } from "./cells.ts";
export type { CellKind, Dir, Facade, FacadeStyle } from "./cells.ts";
export { cellAt, cellIndex, cellPos, createGrid, inGrid } from "./grid.ts";
export type { Cell, CellGrid } from "./grid.ts";
export { BAND_NAMES, bandOf, bandsFor, DEFAULT_PARAMS, ParamsError, resolveParams } from "./params.ts";
export type { Band, BandName, Bands, DistrictParams } from "./params.ts";
export { ARCHETYPES, generateDistrict } from "./generate.ts";
export type { Archetype, Building, District, Rect, Tier } from "./generate.ts";
export { checkDistrict, forEachWalkNeighbour, reachFrom, walkConnected } from "./check.ts";
export type { DistrictCheck } from "./check.ts";
export { cellChar, districtStats, formatStats, GRID_HASH_FORMAT, gridHash, legend, sliceAscii } from "./text.ts";
export type { DistrictStats } from "./text.ts";
