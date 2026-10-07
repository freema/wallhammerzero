// The level-up pop of the art spike: a gold burst that grows for three frames, holds, then
// throws sparks outward while a cyan arrow rises from the centre. Eight frames, fastest at the
// start. Drawn at either scale (24 x 24 in A, 32 x 32 in B: the same drawing, radii scaled by
// 4/3). No outline: FX are light, not bodies.

import { defineAsset, IndexedBuffer } from "@whz/asset-kit";
import type { AnyAsset } from "@whz/asset-kit";
import { idiv } from "@whz/det";
import { palette, ramp, WHITE } from "./style.ts";
import type { Scale } from "./style.ts";

export const LEVELUP_DURATIONS = [60, 60, 80, 100, 80, 80, 80, 100] as const;
export const FX_SLOTS = ["white", "gold", "fx"];

/** The six spark directions as unit steps, scaled by a radius: right, up-right, up-left, left, down-left, down-right. */
const SPARKS = [
  [4, 0],
  [2, -3],
  [-2, -3],
  [-4, 0],
  [-2, 3],
  [2, 3],
] as const;

/** An up arrow of 2 px blocks (nothing thinner than two pixels: the lint's orphan rule): the tip, two wings, a stem. */
function arrow(out: IndexedBuffer, cx: number, y: number, color: number): void {
  out.fill(cx - 1, y, 2, 1, color);
  out.fill(cx - 2, y + 1, 4, 1, color);
  out.fill(cx - 3, y + 2, 2, 1, color);
  out.fill(cx + 1, y + 2, 2, 1, color);
  out.fill(cx - 1, y + 2, 2, 2, color);
}

export function drawLevelUp(scale: Scale, frame: number): IndexedBuffer {
  const [w, h] = scale.fx;
  const out = new IndexedBuffer(w, h);
  const cx = w >> 1;
  const cy = h >> 1;
  const gold = ramp("gold");
  const fx = ramp("fx");
  /** A length in variant A pixels, scaled for the frame. */
  const s = (v: number): number => (w === 24 ? v : idiv(v * 4, 3));
  const ring = (r: number, thick: number, color: number): void => {
    out.fillEllipse(cx - r, cy - r, 2 * r, 2 * r, color);
    out.fillEllipse(cx - r + thick, cy - r + thick, 2 * r - 2 * thick, 2 * r - 2 * thick, 0);
  };
  const burst = (r: number, color: number): void => {
    out.fillEllipse(cx - r, cy - r, 2 * r, 2 * r, color);
  };
  const sparks = (dist: number, size: number, color: number, count: number = SPARKS.length): void => {
    for (const [dx, dy] of SPARKS.slice(0, count)) {
      const x = cx + idiv(dx * dist, 4) - (size >> 1);
      const y = cy + idiv(dy * dist, 4) - (size >> 1);
      out.fill(x, y, size, size, color);
    }
  };
  switch (frame) {
    case 0:
      burst(s(2), gold[2]);
      out.fill(cx - 1, cy - 1, 2, 2, WHITE);
      break;
    case 1:
      burst(s(4), gold[2]);
      out.fill(cx - 1, cy - 1, 2, 2, WHITE);
      break;
    case 2:
      ring(s(6), 2, gold[1]);
      burst(s(3), gold[2]);
      out.fill(cx - 1, cy - 1, 2, 2, WHITE);
      break;
    case 3:
      ring(s(8), 2, gold[1]);
      burst(s(3), gold[2]);
      sparks(s(5), 2, gold[2]);
      break;
    case 4:
      ring(s(10), 1, gold[0]);
      sparks(s(7), 2, gold[1]);
      arrow(out, cx, cy - 2, fx[2]);
      break;
    case 5:
      sparks(s(9), 2, gold[0]);
      arrow(out, cx, cy - s(4), fx[2]);
      break;
    case 6:
      sparks(s(10), 2, fx[0], 4);
      arrow(out, cx, cy - s(6), fx[1]);
      break;
    case 7:
      arrow(out, cx, cy - s(8), fx[0]);
      break;
    default:
      throw new Error(`level-up has 8 frames, got ${String(frame)}`);
  }
  return out;
}

export function defineLevelUp(pack: string, scale: Scale): AnyAsset {
  return defineAsset({
    id: `${pack}/levelup`,
    kind: "sprite",
    size: scale.fx,
    pivot: [scale.fx[0] >> 1, scale.fx[1] - 1],
    palette,
    clips: { pop: { frames: LEVELUP_DURATIONS.length, durations: [...LEVELUP_DURATIONS], loop: false } },
    params: {},
    presets: {},
    variantSeeds: [1],
    // A burst grows, breaks into sparks and rises: the body-motion rules (area, box, contact
    // row, loop seam) are off on purpose, and the sparks are separate shapes.
    lint: { allowedSlots: FX_SLOTS, maxGroups: 8, off: ["area-change", "bbox-change", "baseline-drift", "loop-seam"] },
    render({ frame }) {
      return drawLevelUp(scale, frame);
    },
  });
}
