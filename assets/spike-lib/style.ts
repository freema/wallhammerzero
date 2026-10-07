// The art spike's shared style: the palette, the two scales (A: 16 x 16, B: 16 x 24), the
// outline and the ground shadow. Every asset of spike-a/ and spike-b/ imports from here, so
// the two variants differ only in their scale table (assets/STYLE.md).

import { parsePalette } from "@whz/asset-kit";
import type { IndexedBuffer } from "@whz/asset-kit";
import type { OutlineStyle } from "@whz/asset-kit";
import paletteJson from "../palettes/spike32.json" with { type: "json" };

export const palette = parsePalette(paletteJson);

/** `ink` all round, the deeper ink on the shadow side (under and to the right). */
export const OUTLINE: OutlineStyle = { ink: palette.ink, shadowInk: palette.slot("ink-deep") };
export const INK = palette.ink;
export const INK_DEEP = palette.slot("ink-deep");
export const SHADOW = palette.slot("shadow");
export const WHITE = palette.slot("white");

/** A three-step ramp as `[dark, mid, light]`. */
export type Ramp = readonly [dark: number, mid: number, light: number];
export function ramp(name: string): Ramp {
  const steps = palette.ramp(name);
  const dark = steps[0];
  const mid = steps[1] ?? dark;
  const light = steps[2] ?? mid;
  if (dark === undefined) throw new Error(`ramp ${name} is empty`);
  return [dark, mid, light];
}

/** The cloth ramps an outfit can take. */
export const CLOTH = ["red", "blue", "green"] as const;
export type Cloth = (typeof CLOTH)[number];

/** The hair colours: a ramp name, or the two inks plus a metal step for black hair. */
export const HAIR = ["brown", "black", "blond", "red"] as const;
export type Hair = (typeof HAIR)[number];
export function hairRamp(hair: Hair): Ramp {
  switch (hair) {
    case "brown":
      return ramp("hair");
    case "black":
      return [INK_DEEP, INK, palette.slot("metal.0")];
    case "blond":
      return ramp("gold");
    case "red":
      return ramp("red");
  }
}

/** The sizes of one variant: everything a character, a prop or an FX needs to know. */
export interface Scale {
  readonly name: "A" | "B";
  /** The character frame. */
  readonly frame: readonly [w: number, h: number];
  /** The pivot of a character: between the feet, on the ground row. */
  readonly pivot: readonly [x: number, y: number];
  readonly head: { readonly w: number; readonly h: number; readonly hairRows: number };
  readonly torso: { readonly w: number; readonly h: number };
  readonly leg: { readonly w: number; readonly h: number; readonly gap: number };
  readonly arm: { readonly w: number; readonly h: number };
  /** A 2 x 2 eye with a shine pixel (B), or a 2 x 2 eye without (A). */
  readonly eyeShine: boolean;
  /** The frame of a prop that stands on one tile; its pivot is the bottom row's middle. */
  readonly prop: readonly [w: number, h: number];
  readonly fx: readonly [w: number, h: number];
}

export const SCALE_A: Scale = {
  name: "A",
  frame: [16, 16],
  pivot: [8, 13],
  head: { w: 7, h: 6, hairRows: 2 },
  torso: { w: 6, h: 4 },
  leg: { w: 2, h: 3, gap: 1 },
  arm: { w: 2, h: 3 },
  eyeShine: false,
  prop: [16, 16],
  fx: [24, 24],
};

export const SCALE_B: Scale = {
  name: "B",
  frame: [16, 24],
  pivot: [8, 21],
  head: { w: 9, h: 8, hairRows: 2 },
  torso: { w: 7, h: 6 },
  leg: { w: 2, h: 5, gap: 1 },
  arm: { w: 2, h: 5 },
  eyeShine: true,
  prop: [16, 24],
  fx: [32, 32],
};

/**
 * Where the outline turns a concave corner, one ink pixel can end up with only ink-deep around
 * it (or the other way round): an orphan for the lint and a speck for the eye. Give it the ink
 * of its neighbours.
 */
export function mendOutline(out: IndexedBuffer): void {
  const inks = [INK, INK_DEEP];
  for (const [x, y] of out.orphanPixels().map((i) => [i % out.w, (i / out.w) | 0] as const)) {
    const color = out.get(x, y);
    if (!inks.includes(color)) continue;
    const other = color === INK ? INK_DEEP : INK;
    let near = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx !== 0 || dy !== 0) && out.inside(x + dx, y + dy) && out.get(x + dx, y + dy) === other) near += 1;
    if (near > 0) out.pset(x, y, other);
  }
}

/** A ground shadow: an ellipse of `shadow`, `w` wide and 2 rows tall, centred on `cx` with its bottom on `y`. */
export function groundShadow(out: IndexedBuffer, cx: number, y: number, w: number): void {
  out.fillEllipse(cx - (w >> 1), y - 1, w, 2, SHADOW);
}

/** A ground shadow as a 2 x 2 checker: the dithered alternative the scene shows side by side. */
export function checkerShadow(out: IndexedBuffer, cx: number, y: number, w: number): void {
  const x0 = cx - (w >> 1);
  for (let yy = y - 1; yy <= y; yy += 1) {
    for (let xx = x0; xx < x0 + w; xx += 1) {
      if (((xx + yy) & 1) === 0 && out.inside(xx, yy)) out.pset(xx, yy, SHADOW);
    }
  }
}

/** The light-direction shading of a box: the light step on the top row and left column, the dark step on the bottom row and right column. */
export function shadeBox(out: IndexedBuffer, x: number, y: number, w: number, h: number, steps: Ramp): void {
  const [dark, mid, light] = steps;
  out.fill(x, y, w, h, mid);
  out.hline(x, y, w, light);
  out.vline(x, y, h, light);
  out.hline(x, y + h - 1, w, dark);
  out.vline(x + w - 1, y, h, dark);
}
