// The scene mockup of the art spike: one room of 10 x 8 tiles at the logical resolution
// 160 x 144 (the last 16 rows are the UI strip), with the pack's tiles, props, characters and
// the level-up pop, drawn at 1x the way a game would. The ground shadows are the comparison the
// owner asked for: opaque ellipses on the left half of the room, a 2 x 2 checker on the right
// (`shadows` picks one style for the whole room); a shadow sits one row in front of the feet, so
// the body does not cover it. Variant B's wall is two tiles tall, so its room has one floor row
// less.

import { defineAsset, IndexedBuffer } from "@whz/asset-kit";
import type { AnyAsset } from "@whz/asset-kit";
import { hash32 } from "@whz/det";
import { drawChibi, lookFromSeed, pose } from "./chibi.ts";
import type { Facing } from "./chibi.ts";
import { drawNumber, numberWidth, withThousands } from "./digits.ts";
import { drawLevelUp } from "./fx.ts";
import { drawProp } from "./props.ts";
import type { Prop } from "./props.ts";
import { checkerShadow, groundShadow, palette, ramp, WHITE } from "./style.ts";
import type { Scale } from "./style.ts";
import { drawTile, TILE, TILE_CLIPS } from "./tiles.ts";
import type { TileClip } from "./tiles.ts";

export const SCENE_W = 160;
export const SCENE_H = 144;
const COLS = 10;
const ROWS = 8;
const UI_Y = SCENE_H - TILE;

const SHADOW_STYLES = ["split", "opaque", "checker"] as const;
type ShadowStyle = (typeof SHADOW_STYLES)[number];

interface Placed {
  readonly tx: number;
  readonly ty: number;
  readonly draw: () => IndexedBuffer;
  /** The pivot of the drawn frame: between the feet, on the ground row. */
  readonly pivot: readonly [x: number, y: number];
  readonly shadowW: number;
}

/** The tile of a column and row, picked by the position's hash so the floor does not repeat in step. */
function tileAt(clip: TileClip, tx: number, ty: number, seed: number): IndexedBuffer {
  return drawTile(clip, hash32(tx, ty, seed) % TILE_CLIPS[clip]);
}

function drawShadow(out: IndexedBuffer, style: ShadowStyle, cx: number, y: number, w: number): void {
  const checker = style === "checker" || (style === "split" && cx >= SCENE_W / 2);
  if (checker) checkerShadow(out, cx, y, w);
  else groundShadow(out, cx, y, w);
}

export function drawScene(scale: Scale, seed: number, shadows: ShadowStyle): IndexedBuffer {
  const out = new IndexedBuffer(SCENE_W, SCENE_H);
  const wallRows = scale.name === "B" ? 2 : 1;

  // The room: a wall across the back with closed ends, the shadow row under it, then the floor.
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      let clip: TileClip;
      if (ty < wallRows) {
        const base = wallRows === 1 ? "wall" : ty === 0 ? "wall-upper" : "wall-lower";
        const end = tx === 0 ? "-end-left" : tx === COLS - 1 ? "-end-right" : "";
        clip = `${base}${end}` as TileClip;
      } else {
        clip = ty === wallRows ? "floor-shade" : "floor";
      }
      out.blit(tileAt(clip, tx, ty, seed), tx * TILE, ty * TILE);
    }
  }

  // What stands in the room, in painter's order (back rows first). Props stand on a tile;
  // characters are placed between tiles too, as they would be mid-walk.
  const firstFloor = wallRows;
  const prop = (name: Prop, tx: number, ty: number): Placed => ({
    tx,
    ty,
    draw: () => drawProp(name, scale, seed),
    pivot: [scale.prop[0] >> 1, scale.prop[1] - 3],
    shadowW: 14,
  });
  const chibi = (role: "staff" | "visitor", tx: number, ty: number, facing: Facing, clip: string, frame: number, who: number): Placed => ({
    tx,
    ty,
    draw: () => drawChibi(scale, lookFromSeed(seed * 10 + who, role, "random", "random"), facing, clip, pose(clip, frame, facing), false),
    pivot: scale.pivot,
    shadowW: 10,
  });
  const placed: Placed[] = [
    prop("shelf", 1, firstFloor),
    prop("vending", 8, firstFloor),
    prop("plant", 0, firstFloor + 2),
    prop("desk", 2, firstFloor + 2),
    prop("pc", 3, firstFloor + 2),
    prop("sofa", 7, firstFloor + 3),
    chibi("staff", 5, firstFloor + 1, "side", "walk", 1, 1),
    chibi("staff", 3, firstFloor + 4, "down", "work", 0, 2),
    chibi("visitor", 7, firstFloor + 2, "up", "idle", 0, 3),
    chibi("visitor", 5, firstFloor + 5, "down", "walk", 2, 4),
  ];
  placed.sort((a, b) => a.ty - b.ty || a.tx - b.tx);
  for (const item of placed) {
    const frame = item.draw();
    const px = item.tx * TILE + (TILE >> 1);
    const py = item.ty * TILE + TILE - 3;
    drawShadow(out, shadows, px, py + 2, item.shadowW);
    out.blit(frame, px - item.pivot[0], py - item.pivot[1]);
  }

  // The level-up pop over the working staff member's head, on its hold frame.
  const pop = drawLevelUp(scale, 3);
  const worker = placed.find((item) => item.ty === firstFloor + 4 && item.tx === 3);
  if (worker !== undefined) {
    const px = worker.tx * TILE + (TILE >> 1);
    const py = worker.ty * TILE + TILE - 3 - scale.frame[1];
    out.blit(pop, px - (pop.w >> 1), py - (pop.h >> 1) + 2);
  }

  drawUiStrip(out, seed);
  return out;
}

/** The UI strip over the last 16 rows: a dark band, a money panel with a coin and a counter, and three stat bars. */
export function drawUiStrip(out: IndexedBuffer, seed: number): void {
  const ui = ramp("ui");
  const gold = ramp("gold");
  out.fill(0, UI_Y, SCENE_W, TILE, ui[0]);
  out.hline(0, UI_Y, SCENE_W, ui[1]);
  out.fill(2, UI_Y + 3, 56, 11, ui[1]);
  out.fillEllipse(4, UI_Y + 5, 7, 7, gold[1]);
  out.fillEllipse(5, UI_Y + 6, 3, 2, gold[2]);
  out.fillEllipse(7, UI_Y + 9, 3, 2, gold[0]);
  const money = withThousands(12500 + (seed % 7) * 1250);
  drawNumber(out, 56 - numberWidth(money), UI_Y + 6, money, WHITE);
  const bars: readonly [number, number][] = [
    [ramp("green")[1], 11],
    [ramp("fx")[2], 7],
    [ramp("red")[1], 4],
  ];
  bars.forEach(([color, len], i) => {
    const y = UI_Y + 4 + i * 4;
    out.fill(SCENE_W - 16, y, 14, 2, ui[1]);
    out.fill(SCENE_W - 16, y, len, 2, color);
  });
}

export function defineScene(pack: string, scale: Scale): AnyAsset {
  return defineAsset({
    id: `${pack}/scene`,
    kind: "scene",
    size: [SCENE_W, SCENE_H],
    palette,
    clips: { still: { frames: 1, durations: 1000 } },
    params: {
      shadows: { type: "enum", values: [...SHADOW_STYLES], default: "split", description: "The ground shadows: opaque on the left and checker on the right, or one style for the whole room." },
    },
    presets: { opaque: { shadows: "opaque" }, checker: { shadows: "checker" } },
    variantSeeds: [1, 2],
    reviewSeeds: [1, 2],
    lint: { allowedSlots: ["ink", "ink-deep", "shadow", "white", "skin", "hair", "wood", "red", "blue", "green", "metal", "plant", "floor", "wall", "ui", "gold", "fx"] },
    render({ params, seed }) {
      return drawScene(scale, seed, params.shadows as ShadowStyle);
    },
  });
}
