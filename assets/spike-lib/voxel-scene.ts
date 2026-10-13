// The scene mockup of variant C: the same room as the 2D spikes, in 2:1 isometric, composed
// from the voxel-baked tiles, props and chibis at 1x, with the same UI strip. A tile (tx, tz)
// has its ground diamond's centre at `origin + (8·(tx − tz), 4·(tx + tz))`; everything is
// placed by its frame's pivot on that centre, back to front (by tx + tz). Walls stand on the
// tiles of the back edges; the vending machine is in use by the chibi next to it; the 2D
// level-up pop floats over the working chibi (FX stay 2D in every variant).

import { defineAsset, IndexedBuffer } from "@whz/asset-kit";
import type { AnyAsset } from "@whz/asset-kit";
import { hash32 } from "@whz/det";
import { drawLevelUp } from "./fx.ts";
import type { Prop } from "./props.ts";
import { drawUiStrip, SCENE_H, SCENE_W } from "./scene.ts";
import { palette, ramp, SCALE_B } from "./style.ts";
import { CHIBI_FRAME, drawVoxelChibi, voxelLook } from "./voxel-chibi.ts";
import { drawVoxelProp, PROP_FRAME } from "./voxel-props.ts";
import { drawVoxelTile, VOXEL_TILE_CLIPS } from "./voxel-tiles.ts";
import type { VoxelTileClip } from "./voxel-tiles.ts";

const COLS = 10;
const ROWS = 8;
/** The centre of tile (0, 0)'s ground diamond. */
const ORIGIN = [80, 36] as const;

interface Placed {
  readonly tx: number;
  readonly tz: number;
  readonly frame: IndexedBuffer;
  readonly pivot: readonly [x: number, y: number];
  /** Pixels up from the ground diamond: the floor slab hangs under the ground plane. */
  readonly lift: number;
  /** Among items of one depth, walls go first: a prop on a back-edge tile stands in front of its wall. */
  readonly order: number;
}

const centre = (tx: number, tz: number): [number, number] => [ORIGIN[0] + 8 * (tx - tz), ORIGIN[1] + 4 * (tx + tz)];

export function drawVoxelScene(seed: number): IndexedBuffer {
  const out = new IndexedBuffer(SCENE_W, SCENE_H);
  // A plain backdrop behind the room, as a sim shows the outside of a building.
  out.fill(0, 0, SCENE_W, SCENE_H, ramp("ui")[0]);
  const place = (item: Placed): void => {
    const [cx, cy] = centre(item.tx, item.tz);
    out.blit(item.frame, cx - item.pivot[0], cy - item.pivot[1] - item.lift);
  };
  // The floor: every tile, a variant by the position's hash; the slab's top is the ground.
  for (let tz = 0; tz < ROWS; tz += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      place({ tx, tz, frame: drawVoxelTile("floor", hash32(tx, tz, seed) % VOXEL_TILE_CLIPS.floor), pivot: PROP_FRAME.pivot, lift: -2, order: 0 });
    }
  }
  const items: Placed[] = [];
  const tile = (clip: VoxelTileClip, tx: number, tz: number): void => {
    items.push({ tx, tz, frame: drawVoxelTile(clip, 0), pivot: PROP_FRAME.pivot, lift: 0, order: 0 });
  };
  const prop = (name: Prop, tx: number, tz: number, facing: string, state = "idle"): void => {
    items.push({ tx, tz, frame: drawVoxelProp(name, seed, facing, state), pivot: PROP_FRAME.pivot, lift: 0, order: 1 });
  };
  const chibi = (who: number, tx: number, tz: number, facing: string, clip: string, frame: number): void => {
    items.push({ tx, tz, frame: drawVoxelChibi(voxelLook(seed * 10 + who), clip, frame, facing), pivot: CHIBI_FRAME.pivot, lift: 0, order: 1 });
  };
  // The walls along the two back edges, the corner where they meet.
  tile("wall-corner", 0, 0);
  for (let tz = 1; tz < ROWS; tz += 1) tile("wall-left", 0, tz);
  for (let tx = 1; tx < COLS; tx += 1) tile("wall-right", tx, 0);
  // The furniture against the walls faces into the room; the desk and the sofa face the viewer.
  prop("shelf", 0, 3, "se");
  prop("vending", 6, 0, "sw", "use");
  prop("plant", 0, 6, "sw");
  prop("desk", 3, 3, "sw");
  prop("pc", 3, 2, "sw");
  prop("sofa", 7, 5, "sw");
  chibi(1, 9, 1, "nw", "idle", 0); // near the machine: a tile straight in front of it would cover it (same tx - tz)
  chibi(2, 2, 4, "se", "idle", 0); // beside the desk, with the pop
  chibi(3, 5, 3, "se", "walk", 2);
  items.sort((a, b) => a.tx + a.tz - (b.tx + b.tz) || a.order - b.order || a.tx - b.tx);
  for (const item of items) place(item);
  // The level-up pop, centred over the chibi at the desk.
  const pop = drawLevelUp(SCALE_B, 3);
  const [px, py] = centre(2, 4);
  out.blit(pop, px - (pop.w >> 1), py - 24 - (pop.h >> 1));
  drawUiStrip(out, seed);
  return out;
}

export function defineVoxelScene(pack: string): AnyAsset {
  return defineAsset({
    id: `${pack}/scene`,
    kind: "scene",
    size: [SCENE_W, SCENE_H],
    palette,
    clips: { still: { frames: 1, durations: 1000 } },
    params: {},
    presets: {},
    variantSeeds: [1, 2],
    reviewSeeds: [1, 2],
    lint: { allowedSlots: ["ink", "ink-deep", "shadow", "white", "skin", "hair", "wood", "red", "blue", "green", "metal", "plant", "floor", "wall", "ui", "gold", "fx"] },
    render({ seed }) {
      return drawVoxelScene(seed);
    },
  });
}
