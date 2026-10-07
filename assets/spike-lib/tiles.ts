// The floor and wall tile family of the art spike: 16 x 16 tiles for both packs (the packs differ
// in their characters, not their ground). Each clip is one tile; its frames are the variants a
// scene picks by `hash32(x, y)`, so a floor does not repeat in lockstep. The floor has no edge of
// its own: `floor-shade` is the row under a wall. The wall comes whole (`wall`: cornice and
// skirting in one tile, for variant A's rooms) and split in two (`wall-upper`, `wall-lower`, for
// variant B's taller rooms), with corner tiles (`<wall tile>-end-left`, `-end-right`) that close a
// run at either end.

import { defineAsset, IndexedBuffer } from "@whz/asset-kit";
import type { AnyAsset } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import { INK, INK_DEEP, palette, ramp } from "./style.ts";

export const TILE = 16;

export const TILE_CLIPS = {
  floor: 4,
  "floor-shade": 2,
  wall: 3,
  "wall-upper": 1,
  "wall-lower": 3,
  "wall-end-left": 1,
  "wall-end-right": 1,
  "wall-upper-end-left": 1,
  "wall-upper-end-right": 1,
  "wall-lower-end-left": 1,
  "wall-lower-end-right": 1,
} as const;
export type TileClip = keyof typeof TILE_CLIPS;

export const TILE_SLOTS = ["ink", "ink-deep", "floor", "wall", "wood", "red", "blue", "green"];

/** A floor tile: 8 x 8 boards with a grout line on their bottom and right, and wear from the variant. */
function floor(out: IndexedBuffer, variant: number): void {
  const f = ramp("floor");
  out.fill(0, 0, TILE, TILE, f[1]);
  for (const at of [7, 15]) {
    out.hline(0, at, TILE, f[0]);
    out.vline(at, 0, TILE, f[0]);
  }
  // A lit edge along the top and left of each board.
  for (const bx of [0, 8]) {
    for (const by of [0, 8]) {
      out.hline(bx, by, 7, f[2]);
      out.vline(bx, by, 7, f[2]);
    }
  }
  // Wear marks: short strokes inside a board, one more in each higher variant.
  const rng = createRng(variant, "floor");
  for (let n = 0; n < variant; n += 1) {
    const x = rng.pick([0, 8]) + rng.range(1, 4);
    const y = rng.pick([0, 8]) + rng.range(1, 5);
    out.hline(x, y, 2, rng.chance(1, 2) ? f[0] : f[2]);
  }
}

/** The floor row under a wall: the floor with the wall's shadow across its top rows. */
function floorShade(out: IndexedBuffer, variant: number): void {
  floor(out, variant);
  const f = ramp("floor");
  out.fill(0, 0, TILE, 2, f[0]);
  for (let x = (variant & 1); x < TILE; x += 2) out.pset(x, 2, f[0]);
}

/** The plain wall: paint with a lit band near the top of the tile. */
function wallPaint(out: IndexedBuffer): void {
  const w = ramp("wall");
  out.fill(0, 0, TILE, TILE, w[1]);
}

/** The cornice: three light rows and a dark line under them, at the top of a tile. */
function cornice(out: IndexedBuffer): void {
  const w = ramp("wall");
  out.fill(0, 0, TILE, 3, w[2]);
  out.hline(0, 3, TILE, w[0]);
}

/** The skirting board: a dark line over a two-row board at the bottom of a tile. */
function skirting(out: IndexedBuffer): void {
  const w = ramp("wall");
  const wood = ramp("wood");
  out.hline(0, TILE - 3, TILE, w[0]);
  out.fill(0, TILE - 2, TILE, 2, wood[0]);
}

/** What hangs on a wall, by variant: nothing, a framed picture, a poster. */
function decoration(out: IndexedBuffer, variant: number, y: number): void {
  const wood = ramp("wood");
  if (variant === 1) {
    // A picture: a wood frame round a blue sky over a green hill.
    out.fill(4, y, 8, 6, wood[0]);
    out.fill(5, y + 1, 6, 4, ramp("blue")[2]);
    out.fill(5, y + 3, 6, 2, ramp("green")[1]);
    out.hline(4, y, 8, wood[1]);
  } else if (variant === 2) {
    // A poster: a red sheet with two dark lines of "text".
    out.fill(5, y, 6, 7, ramp("red")[1]);
    out.hline(6, y + 2, 4, ramp("red")[0]);
    out.hline(6, y + 4, 3, ramp("red")[0]);
    out.hline(5, y + 6, 6, ramp("red")[0]);
  }
}

/** A corner column that closes a wall run: deep ink at the outer edge, ink inside. */
function wallEnd(out: IndexedBuffer, side: "left" | "right"): void {
  const x = side === "left" ? 0 : TILE - 1;
  const inner = side === "left" ? 1 : TILE - 2;
  out.vline(x, 0, TILE, INK_DEEP);
  out.vline(inner, 0, TILE, INK);
}

export function drawTile(clip: TileClip, variant: number): IndexedBuffer {
  const end = /^(.*)-end-(left|right)$/.exec(clip);
  if (end !== null) {
    const out = drawTile(end[1] as TileClip, 0);
    wallEnd(out, end[2] === "left" ? "left" : "right");
    return out;
  }
  const out = new IndexedBuffer(TILE, TILE);
  switch (clip) {
    case "floor":
      floor(out, variant);
      break;
    case "floor-shade":
      floorShade(out, variant);
      break;
    case "wall":
      wallPaint(out);
      cornice(out);
      decoration(out, variant, 5);
      skirting(out);
      break;
    case "wall-upper":
      wallPaint(out);
      cornice(out);
      break;
    case "wall-lower":
      wallPaint(out);
      decoration(out, variant, 2);
      skirting(out);
      break;
    default:
      throw new Error(`no tile named ${clip}`);
  }
  return out;
}

/** The tile family of one pack. Both packs share the drawing; the id tells them apart in the studio. */
export function defineTiles(pack: string): AnyAsset {
  const clips = Object.fromEntries(Object.entries(TILE_CLIPS).map(([name, frames]) => [name, { frames, durations: 1000, loop: false }]));
  return defineAsset({
    id: `${pack}/tiles`,
    kind: "tiles",
    size: [TILE, TILE],
    palette,
    clips,
    params: {},
    presets: {},
    variantSeeds: [1],
    lint: { allowedSlots: TILE_SLOTS },
    render({ clip, frame }) {
      return drawTile(clip as TileClip, frame);
    },
  });
}
