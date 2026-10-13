// The parameters of a district: its size, the level bands of games/new-hope/README.md and the
// densities of the features. Every number is an integer; chances are percentages.

import { idiv } from "@whz/det";

/** An inclusive range of levels. */
export type Band = readonly [lo: number, hi: number];

/** The bands from the bottom up. Together they cover levels `0 .. levels - 1` with no gap. */
export interface Bands {
  /** Ancestor and Psion ruins under the streets. */
  readonly undercity: Band;
  /** The old ground: the street level is `streets[0]`, the band's other levels are the ground storeys. */
  readonly streets: Band;
  /** Walkways between towers, half-settled floors, markets. */
  readonly middle: Band;
  /** The colonised city: walkways, Union floors. */
  readonly upper: Band;
  /** The highest roofs and their pads. A roof deck is never above `roofs[1]`. */
  readonly roofs: Band;
  /** Sky lanes: the flying network above every roof. */
  readonly lanes: Band;
}

export const BAND_NAMES = ["undercity", "streets", "middle", "upper", "roofs", "lanes"] as const;
export type BandName = (typeof BAND_NAMES)[number];

export interface DistrictParams {
  /** Tiles along x (east). */
  readonly width: number;
  /** Tiles along y (south). */
  readonly depth: number;
  /** Storeys, level 0 at the bottom. */
  readonly levels: number;
  readonly bands: Bands;
  /** Width of a street in tiles (2..4). */
  readonly streetWidth: number;
  /** The side of a block between two streets, in tiles. */
  readonly blockMin: number;
  readonly blockMax: number;
  /** Chance that a block big enough is one megablock: a podium deck with towers on it. */
  readonly megablockChance: number;
  /** Chance that a candidate walkway is built (there are many candidates; small numbers). */
  readonly walkwayChance: number;
  /** The longest walkway, in tiles of open air between the two ends. */
  readonly walkwayMaxSpan: number;
  /** Chance that a roof gets a landing pad. */
  readonly padChance: number;
  /** Chance that a street line carries a sky lane down in its canyon (in the upper band). */
  readonly canyonLaneChance: number;
  /** Chance that a street segment has an undercity hall under it. */
  readonly hallChance: number;
  /** Chance that a hall has a deeper hall under part of it. */
  readonly deepHallChance: number;
}

/** Bands for a number of levels: the shape of the default 16, scaled. */
export function bandsFor(levels: number): Bands {
  requireInt("levels", levels, 10, 64);
  const undercity = Math.max(1, idiv(levels * 3, 16));
  const lanes = 2;
  const roofs = 2;
  const streets = 2;
  const rest = levels - undercity - streets - roofs - lanes;
  const middle = rest - idiv(rest, 2);
  const upper = rest - middle;
  let at = 0;
  const band = (n: number): Band => {
    const result: Band = [at, at + n - 1];
    at += n;
    return result;
  };
  return {
    undercity: band(undercity),
    streets: band(streets),
    middle: band(middle),
    upper: band(upper),
    roofs: band(roofs),
    lanes: band(lanes),
  };
}

export const DEFAULT_PARAMS: DistrictParams = {
  width: 32,
  depth: 32,
  levels: 16,
  bands: bandsFor(16),
  streetWidth: 2,
  blockMin: 7,
  blockMax: 11,
  megablockChance: 20,
  walkwayChance: 4,
  walkwayMaxSpan: 6,
  padChance: 45,
  canyonLaneChance: 30,
  hallChance: 45,
  deepHallChance: 40,
};

export class ParamsError extends Error {
  override name = "ParamsError";
}

function requireInt(name: string, value: unknown, lo: number, hi: number): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < lo || value > hi) {
    throw new ParamsError(`${name} must be an integer in [${lo}, ${hi}], got ${String(value)}`);
  }
}

/**
 * The full parameters: the defaults, then `params` over them. When `levels` is given without
 * `bands`, the bands are `bandsFor(levels)`. Throws `ParamsError` on a value out of range or
 * bands that do not cover the levels in order.
 */
export function resolveParams(params: Partial<DistrictParams> = {}): DistrictParams {
  const levels = params.levels ?? DEFAULT_PARAMS.levels;
  requireInt("levels", levels, 10, 64);
  const resolved: DistrictParams = {
    ...DEFAULT_PARAMS,
    ...params,
    bands: params.bands ?? (levels === DEFAULT_PARAMS.levels ? DEFAULT_PARAMS.bands : bandsFor(levels)),
  };
  requireInt("width", resolved.width, 12, 256);
  requireInt("depth", resolved.depth, 12, 256);
  requireInt("streetWidth", resolved.streetWidth, 2, 4);
  requireInt("blockMin", resolved.blockMin, 5, 64);
  requireInt("blockMax", resolved.blockMax, resolved.blockMin, 64);
  requireInt("walkwayMaxSpan", resolved.walkwayMaxSpan, 1, 32);
  for (const name of ["megablockChance", "walkwayChance", "padChance", "canyonLaneChance", "hallChance", "deepHallChance"] as const) {
    requireInt(name, resolved[name], 0, 100);
  }
  let next = 0;
  for (const name of BAND_NAMES) {
    const band = resolved.bands[name];
    if (!Array.isArray(band) || band.length !== 2) throw new ParamsError(`bands.${name} must be [lo, hi]`);
    const [lo, hi] = band;
    if (lo !== next) throw new ParamsError(`bands.${name} must start at level ${next} (the bands cover the levels in order), got ${String(lo)}`);
    requireInt(`bands.${name}[1]`, hi, lo, levels - 1);
    next = hi + 1;
  }
  if (next !== levels) throw new ParamsError(`the bands end at level ${next - 1}, the district has ${levels} levels`);
  const { streets, middle, upper } = resolved.bands;
  if (streets[0] < 1) throw new ParamsError("the undercity needs at least one level under the streets");
  if (middle[0] - streets[0] < 1 || upper[0] - streets[0] < 2) throw new ParamsError("the street, middle and upper bands are too thin for buildings");
  return resolved;
}

/** The band a level is in. */
export function bandOf(bands: Bands, level: number): BandName {
  for (const name of BAND_NAMES) {
    const [lo, hi] = bands[name];
    if (level >= lo && level <= hi) return name;
  }
  throw new RangeError(`level ${level} is in no band`);
}
