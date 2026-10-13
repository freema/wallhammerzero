// New Hope's shared style (D28, D29): the palette, the voxel cell every module of the city
// fills, and the slots the baker draws flat. Every asset of assets/new-hope/ imports from here,
// so the building kit, the characters, the vehicles and the city mockup stack on one grid.

import { parsePalette } from "@whz/asset-kit";
import { outlineSlots } from "@whz/voxel-kit";
import paletteJson from "../palettes/new-hope.json" with { type: "json" };

export const palette = parsePalette(paletteJson);

/**
 * One cell of the city in voxels: a tile of 4 x 4 voxels (a 16 x 8 diamond on screen) by one
 * storey of 12 voxels (24 px). A character is 8 voxels tall, so a storey leaves headroom and a
 * one-voxel slab. Every module of the building kit fills exactly one cell, so cells stack into
 * towers and the city generator's grid maps one to one onto voxels.
 */
export const TILE = 4;
export const STOREY = 12;
export const CELL = [TILE, STOREY, TILE] as const;

/** The shaded ramps: a model shades along these. */
export const RAMPS = [
  "concrete",
  "steel",
  "glass",
  "asphalt",
  "rust",
  "ancient",
  "psion",
  "plant",
  "skin",
  "hair",
  "red",
  "union",
  "cloth",
  "paint",
] as const;

/** Light sources: in no ramp, so a model lists them in `flatSlots` and the baker draws them unshaded. */
export const FLAT_SLOTS = [
  "white",
  "neon-pink",
  "neon-pink-dim",
  "neon-cyan",
  "neon-cyan-dim",
  "neon-yellow",
  "neon-green",
  "neon-violet",
  "light-warm",
  "light-warm-dim",
  "light-cold",
] as const;

/** The slots the outline lint accepts as outline: the inks plus the darkest step of every ramp (the lit rim). */
export const OUTLINE_SLOTS = outlineSlots(palette, RAMPS);
