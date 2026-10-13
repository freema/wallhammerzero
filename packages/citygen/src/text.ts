// A district as text and numbers: one level as ASCII, counts per kind and band, the grid hash.

import { Fnv1a64 } from "@whz/det";
import { FACADE_CHARS, FACADES, K, KIND_CHARS, KINDS, STAIRS_CHARS } from "./cells.ts";
import type { CellKind, Facade } from "./cells.ts";
import { checkDistrict } from "./check.ts";
import type { DistrictCheck } from "./check.ts";
import type { Archetype, District } from "./generate.ts";
import { ARCHETYPES } from "./generate.ts";
import { cellIndex } from "./grid.ts";
import type { CellGrid } from "./grid.ts";
import { BAND_NAMES, bandOf } from "./params.ts";
import type { BandName } from "./params.ts";

/** The version of the hashed layout; it changes only when the bytes below change. */
export const GRID_HASH_FORMAT = "whz-citygen-grid/1";

/**
 * FNV-1a 64 of the grid: the format string, width, depth and levels (u16 each), then per cell
 * in index order its kind, direction, building (u16) and facade. 16 hex digits.
 */
export function gridHash(grid: CellGrid): string {
  const hasher = new Fnv1a64().ascii(GRID_HASH_FORMAT).u16(grid.width).u16(grid.depth).u16(grid.levels);
  for (let i = 0; i < grid.kind.length; i += 1) {
    hasher
      .byte(grid.kind[i] as number)
      .byte(grid.dir[i] as number)
      .u16(grid.building[i] as number)
      .byte(grid.facade[i] as number);
  }
  return hasher.hex();
}

/** The character of one cell: its kind, stairs by direction, a solid by facade when `facade` is set. */
export function cellChar(grid: CellGrid, i: number, facade = false): string {
  const kind = grid.kind[i] as number;
  if (kind === K.stairs) return STAIRS_CHARS[grid.dir[i] as number] as string;
  if (kind === K.solid && facade) return FACADE_CHARS[FACADES[grid.facade[i] as number] as Facade];
  return KIND_CHARS[KINDS[kind] as CellKind];
}

/** One level as ASCII: `depth` lines of `width` characters, north at the top. */
export function sliceAscii(grid: CellGrid, level: number, options: { facade?: boolean } = {}): string {
  if (!Number.isInteger(level) || level < 0 || level >= grid.levels) {
    throw new RangeError(`sliceAscii: level must be an integer in [0, ${grid.levels - 1}], got ${String(level)}`);
  }
  const lines: string[] = [];
  for (let y = 0; y < grid.depth; y += 1) {
    let line = "";
    for (let x = 0; x < grid.width; x += 1) line += cellChar(grid, cellIndex(grid, x, y, level), options.facade === true);
    lines.push(line);
  }
  return lines.join("\n");
}

/** The legend of the slice characters, one line. */
export function legend(): string {
  const kinds = KINDS.filter((kind) => kind !== "stairs").map((kind) => `${KIND_CHARS[kind]} ${kind}`);
  const facades = FACADES.filter((facade) => facade !== "none").map((facade) => `${FACADE_CHARS[facade]} ${facade}`);
  return `${kinds.join("  ")}  ${STAIRS_CHARS.join("")} stairs (climbing n e s w)  | --facade: ${facades.join("  ")}`;
}

export interface DistrictStats {
  readonly seed: number;
  readonly size: { readonly width: number; readonly depth: number; readonly levels: number };
  readonly hash: string;
  /** Cells of each kind per band. */
  readonly kinds: Record<BandName, Record<CellKind, number>>;
  readonly archetypes: Record<Archetype, number>;
  readonly buildings: number;
  readonly walkways: number;
  readonly check: DistrictCheck;
}

export function districtStats(district: District): DistrictStats {
  const kinds = {} as Record<BandName, Record<CellKind, number>>;
  for (const band of BAND_NAMES) {
    kinds[band] = {} as Record<CellKind, number>;
    for (const kind of KINDS) kinds[band][kind] = 0;
  }
  const plane = district.width * district.depth;
  for (let z = 0; z < district.levels; z += 1) {
    const row = kinds[bandOf(district.params.bands, z)];
    for (let i = z * plane; i < (z + 1) * plane; i += 1) row[KINDS[district.kind[i] as number] as CellKind] += 1;
  }
  const archetypes = {} as Record<Archetype, number>;
  for (const archetype of ARCHETYPES) archetypes[archetype] = 0;
  for (const building of district.buildings) archetypes[building.archetype] += 1;
  return {
    seed: district.seed,
    size: { width: district.width, depth: district.depth, levels: district.levels },
    hash: gridHash(district),
    kinds,
    archetypes,
    buildings: district.buildings.length,
    walkways: district.walkways,
    check: checkDistrict(district),
  };
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : " ".repeat(width - text.length) + text;
}

/** The stats as a text table and a few lines. */
export function formatStats(stats: DistrictStats, district: District): string {
  const shown = KINDS.filter((kind) => kind !== "empty");
  const lines: string[] = [];
  lines.push(`district ${stats.seed}: ${stats.size.width} x ${stats.size.depth} tiles x ${stats.size.levels} levels, grid hash ${stats.hash}`);
  lines.push(`buildings ${stats.buildings} (${ARCHETYPES.map((a) => `${a} ${stats.archetypes[a]}`).join(", ")}), walkways ${stats.walkways}`);
  lines.push("");
  lines.push(`${pad("band", 10)} ${pad("levels", 6)} ${shown.map((kind) => pad(kind, 7)).join(" ")}`);
  for (const band of BAND_NAMES) {
    const [lo, hi] = district.params.bands[band];
    lines.push(`${pad(band, 10)} ${pad(`${lo}-${hi}`, 6)} ${shown.map((kind) => pad(String(stats.kinds[band][kind]), 7)).join(" ")}`);
  }
  lines.push("");
  const { check } = stats;
  lines.push(
    `reachability: ${check.walkGroups.length === 1 ? "ok" : "FAIL"}, ${check.walkable} walkable cells in ${check.walkGroups.length} group(s)` +
      (check.walkGroups.length > 1 ? ` (${check.walkGroups.join(", ")})` : ""),
  );
  lines.push(`lanes: ${check.laneGroups.length === 1 ? "ok" : "FAIL"}, ${check.lanes} cells in ${check.laneGroups.length} network(s); pads ${check.pads}, without a lane ${check.padsWithoutLane}`);
  lines.push(`check: ${check.ok ? "ok" : "FAIL"}`);
  for (const problem of check.problems) lines.push(`  ${problem}`);
  return lines.join("\n");
}
