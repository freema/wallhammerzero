// The six props of the art spike, drawn at either scale: a desk, a PC, a plant, a shelf, a
// vending machine and a sofa. Each stands on one tile; the body is drawn in the frame with a
// 2 px margin for the outline and the kit's fits-frame rule, then outlined once. The seed
// picks one thing per prop (a cloth, the books, the foliage), so the studio's variants differ:
// the headline choice cycles with the seed (`seed % n`, so the variant seeds 1, 2, 3 show every
// option), the small stuff comes from the seed's random stream.
// A prop has no ground shadow of its own: the scene draws it, in the style under comparison.

import { compose, defineAsset, IndexedBuffer } from "@whz/asset-kit";
import type { AnyAsset } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import type { Rng } from "@whz/det";
import { CLOTH, mendOutline, OUTLINE, palette, ramp, shadeBox } from "./style.ts";
import type { Ramp, Scale } from "./style.ts";

export const PROPS = ["desk", "pc", "plant", "shelf", "vending", "sofa"] as const;
export type Prop = (typeof PROPS)[number];

/** Where a prop may draw: inside a 2 px margin, standing on the ground row. */
interface Box {
  readonly w: number;
  readonly h: number;
  /** The last body row: the prop's pivot row. */
  readonly ground: number;
  /** Variant B is drawn taller: the extra rows over A. */
  readonly tall: boolean;
}

const boxOf = (scale: Scale): Box => ({ w: scale.prop[0], h: scale.prop[1], ground: scale.prop[1] - 3, tall: scale.name === "B" });

/** A box of `steps` with a lit top row and left column; the dark step on the bottom and right. */
const block = (out: IndexedBuffer, x: number, y: number, w: number, h: number, steps: Ramp): void => shadeBox(out, x, y, w, h, steps);

function desk(out: IndexedBuffer, box: Box, seed: number): void {
  const wood = ramp("wood");
  const [topH, frontH, legH] = box.tall ? [4, 5, 5] : [3, 3, 3];
  const top = box.ground - legH - frontH - topH + 1;
  // The table top, its front panel one pixel in from each side, and two legs.
  block(out, 2, top, 12, topH, wood);
  block(out, 3, top + topH, 10, frontH, wood);
  out.vline(3, top + topH, frontH, wood[1]); // the front panel stays under the top's lit edge
  out.vline(8, top + topH, frontH, wood[0]); // a drawer's seam
  const legY = top + topH + frontH;
  out.fill(3, legY, 2, legH, wood[0]);
  out.fill(11, legY, 2, legH, wood[0]);
  // Something on the desk: a stack of paper, a mug, or nothing, from the seed.
  const item = seed % 3;
  if (item === 1) out.fill(4, top - 1, 3, 1, palette.slot("white"));
  else if (item === 2) out.fill(9, top - 2, 2, 2, ramp("red")[1]);
}

function pc(out: IndexedBuffer, box: Box, seed: number, rng: Rng): void {
  const metal = ramp("metal");
  const blue = ramp("blue");
  const [monW, monH, standH, kbdH] = box.tall ? [10, 9, 3, 4] : [8, 6, 2, 3];
  const monX = (box.w - monW) >> 1;
  const kbdY = box.ground - kbdH + 1;
  const monY = kbdY - standH - monH;
  // The monitor: a metal bezel round a blue screen with a brighter top line.
  block(out, monX, monY, monW, monH, metal);
  out.fill(monX + 1, monY + 1, monW - 2, monH - 2, blue[0]);
  out.fill(monX + 2, monY + 2, monW - 4, monH - 4, blue[1]);
  out.hline(monX + 2, monY + 2, monW - 4, blue[2]);
  // What the screen shows, from the seed: lines of "text", a chart, or a blank screen.
  const screen = seed % 3;
  for (let row = monY + 4; row < monY + monH - 2; row += 2) {
    if (screen === 0) out.hline(monX + 2, row, rng.range(2, monW - 4), blue[2]);
    if (screen === 1) out.fill(monX + 2 + ((row - monY) >> 1), row, 2, monY + monH - 2 - row, blue[2]);
  }
  // The stand and the keyboard in front.
  out.fill((box.w >> 1) - 1, monY + monH, 2, standH, metal[0]);
  block(out, 3, kbdY, 10, kbdH, metal);
}

function plant(out: IndexedBuffer, box: Box, seed: number, rng: Rng): void {
  const green = ramp("plant");
  const pot = seed % 2 === 0 ? ramp("red") : ramp("wood");
  const potH = box.tall ? 7 : 5;
  const potY = box.ground - potH + 1;
  // The pot: a rim, then a body that narrows by one pixel each side.
  out.fill(4, potY, 8, 1, pot[2]);
  out.fill(5, potY + 1, 6, potH - 1, pot[1]);
  out.vline(10, potY + 1, potH - 1, pot[0]);
  out.hline(5, box.ground, 6, pot[0]);
  // The foliage: one round bush of three overlapping blobs on a short stem; the seed shifts
  // the side blobs, so the silhouette differs while the mass stays dense (no holes to outline).
  const top = 2;
  const stemH = 2;
  const bushH = potY - stemH - top;
  out.fill(7, potY - stemH, 2, stemH, green[0]);
  const dl = rng.range(0, 1);
  const dr = rng.range(0, 1);
  out.fillEllipse(3, top, 10, bushH, green[1]);
  out.fillEllipse(2, top + 1 + dl, 5, bushH - 2, green[1]);
  out.fillEllipse(9, top + 1 + dr, 5, bushH - 2, green[1]);
  out.fillEllipse(5, top + bushH - 2, 6, 2, green[0]);
  out.fillEllipse(4, top + 1 + dl, 4, 2, green[2]);
  out.hline(10, top + 2 + dr, 2, green[2]);
}

function shelf(out: IndexedBuffer, box: Box, _seed: number, rng: Rng): void {
  const wood = ramp("wood");
  const top = box.tall ? 3 : 3;
  const h = box.ground - top + 1;
  block(out, 3, top, 10, h, wood);
  out.fill(4, top + 1, 8, h - 2, wood[1]);
  // Boards every few rows, and books on each board: 2 px wide, a cloth colour each.
  const gap = box.tall ? 5 : 4;
  for (let y = top + gap; y < box.ground - 1; y += gap) {
    out.hline(4, y, 8, wood[0]);
    let x = 4;
    while (x < 11) {
      const w = rng.range(2, 3);
      if (x + w > 12) break;
      const cloth = ramp(rng.pick(CLOTH));
      const bookH = gap - 1 - rng.range(0, 1);
      out.fill(x, y - bookH, w, bookH, cloth[1]);
      out.vline(x + w - 1, y - bookH, bookH, cloth[0]);
      x += w + rng.range(0, 1);
    }
  }
}

function vending(out: IndexedBuffer, box: Box, seed: number, rng: Rng): void {
  const body = ramp(seed % 2 === 0 ? "blue" : "red");
  const metal = ramp("metal");
  const top = box.tall ? 2 : 3;
  const h = box.ground - top + 1;
  block(out, 3, top, 10, h, body);
  // The window with rows of goods, a side panel with a button, and the hatch at the bottom.
  const winH = box.tall ? 11 : 6;
  out.fill(4, top + 1, 6, winH, metal[0]);
  for (let y = top + 2; y + 2 <= top + 1 + winH; y += 3) {
    out.fill(4, y, 2, 2, ramp("gold")[1]);
    out.fill(7, y, 2, 2, rng.pick([ramp("green")[1], ramp("fx")[1]]));
  }
  out.fill(10, top + 2, 2, 2, ramp("gold")[2]);
  out.fill(10, top + 5, 2, winH - 4, body[0]);
  out.fill(4, box.ground - 2, 6, 2, metal[0]);
  out.hline(4, box.ground - 2, 6, metal[1]);
}

function sofa(out: IndexedBuffer, box: Box, seed: number): void {
  const cloth = ramp(CLOTH[seed % CLOTH.length]!);
  const wood = ramp("wood");
  const [backH, seatH, armH] = box.tall ? [5, 3, 5] : [3, 2, 3];
  const legH = 1;
  const seatY = box.ground - legH - seatH + 1;
  const backY = seatY - backH;
  block(out, 3, backY, 10, backH, cloth);
  out.fill(3, seatY, 10, seatH, cloth[2]);
  out.hline(3, seatY + seatH - 1, 10, cloth[0]);
  out.vline(8, seatY, seatH, cloth[1]); // the seam between the two cushions
  // The armrests, one pixel taller than the seat, and the legs.
  block(out, 2, seatY - 1, 2, armH, cloth);
  block(out, 12, seatY - 1, 2, armH, cloth);
  out.vline(13, seatY - 1, armH, cloth[0]);
  out.fill(3, box.ground, 2, legH, wood[0]);
  out.fill(11, box.ground, 2, legH, wood[0]);
}

const DRAW: Record<Prop, (out: IndexedBuffer, box: Box, seed: number, rng: Rng) => void> = { desk, pc, plant, shelf, vending, sofa };

/** What each prop draws with, for `lint.allowedSlots`. */
export const PROP_SLOTS: Record<Prop, readonly string[]> = {
  desk: ["ink", "ink-deep", "wood", "white", "red"],
  pc: ["ink", "ink-deep", "metal", "blue"],
  plant: ["ink", "ink-deep", "plant", "wood", "red"],
  shelf: ["ink", "ink-deep", "wood", "red", "blue", "green"],
  vending: ["ink", "ink-deep", "red", "blue", "metal", "gold", "green", "fx"],
  sofa: ["ink", "ink-deep", "red", "blue", "green", "wood"],
};

/** One prop as a frame: the body, then the outline. */
export function drawProp(prop: Prop, scale: Scale, seed: number): IndexedBuffer {
  const box = boxOf(scale);
  const body = new IndexedBuffer(box.w, box.h);
  DRAW[prop](body, box, seed, createRng(seed, `prop/${prop}`));
  const out = compose(box.w, box.h, [{ part: body, x: 0, y: 0 }], OUTLINE);
  mendOutline(out);
  return out;
}

/** The asset of one prop in one pack: `spike-a/desk`, `spike-b/sofa`, ... */
export function defineProp(pack: string, prop: Prop, scale: Scale): AnyAsset {
  return defineAsset({
    id: `${pack}/${prop}`,
    kind: "sprite",
    size: scale.prop,
    pivot: [scale.prop[0] >> 1, scale.prop[1] - 3],
    palette,
    clips: { idle: { frames: 1, durations: 1000 } },
    params: {},
    presets: {},
    variantSeeds: [1, 2, 3],
    lint: { allowedSlots: PROP_SLOTS[prop] },
    render({ seed }) {
      return drawProp(prop, scale, seed);
    },
  });
}
