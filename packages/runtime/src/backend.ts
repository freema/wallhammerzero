// What a backend is. A backend draws a draw list into a native-resolution target and gives
// the target's pixels back. Two exist: the CPU backend (`createCpuBackend`, plain TypeScript,
// runs in Node) and the WebGL2 backend (`@whz/runtime/webgl`). For the same list, palette
// and clear colour they give the same bytes; the CPU backend is the reference.
//
// Nothing here keeps time or state between draws: a draw is a function of its arguments.

import type { DrawList } from "./draw-list.ts";
import type { PaletteTable } from "./palette.ts";
import type { Sheet } from "./sheet.ts";

/** A colour as four bytes, 0..255 each. */
export type Rgba = readonly [r: number, g: number, b: number, a: number];

const TRANSPARENT: Rgba = Object.freeze([0, 0, 0, 0] as const);

/** The largest width or height of a target. */
export const MAX_TARGET_SIZE = 4096;

/** A native-resolution image a backend draws into. Made by `createTarget` of the backend that draws into it. */
export interface Target {
  readonly width: number;
  readonly height: number;
}

export interface DrawOptions {
  /** The colours. A sprite's `paletteRow` is a row of this table. */
  readonly palette: PaletteTable;
  /** What the target is filled with before the list is drawn. Default: transparent, `[0, 0, 0, 0]`. */
  readonly clear?: Rgba | undefined;
}

export interface Backend {
  readonly kind: "cpu" | "webgl2";
  /** A target of `width` x `height` pixels: the native resolution, never the screen's. */
  createTarget(width: number, height: number): Target;
  /**
   * Clears the target and draws the list into it, in the list's order. A pixel of a sprite
   * is drawn when its colour in the sprite's palette row is opaque; it then replaces what was
   * there (no blending). Sprites are clipped to the target.
   */
  draw(target: Target, list: DrawList, options: DrawOptions): void;
  /** The target's pixels as RGBA bytes, row by row, the top row first. A copy. */
  readPixels(target: Target): Uint8Array;
  /** Frees what the backend holds for a target, a sheet or a palette table. Using it again makes it anew. */
  release(resource: Target | Sheet | PaletteTable): void;
  /** Frees everything. The backend must not be used afterwards. */
  dispose(): void;
}

/** Checks the size of a new target. */
export function checkTargetSize(width: number, height: number): void {
  for (const [name, value] of [["width", width], ["height", height]] as const) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_TARGET_SIZE) {
      throw new RangeError(`createTarget: ${name} must be an integer in [1, ${MAX_TARGET_SIZE}], got ${String(value)}`);
    }
  }
}

/** Checks the arguments of a draw that both backends check, and returns the clear colour. */
export function checkDraw(list: DrawList, options: DrawOptions): Rgba {
  const { rows } = options.palette;
  for (const item of list.items()) {
    if (item.paletteRow >= rows) {
      throw new RangeError(`draw: a sprite of ${JSON.stringify(item.sheet.atlas.id)} asks for palette row ${item.paletteRow}, but the table has rows 0..${rows - 1}`);
    }
  }
  const clear = options.clear ?? TRANSPARENT;
  if (clear.length !== 4 || clear.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new RangeError(`draw: "clear" must be four bytes [r, g, b, a], got ${JSON.stringify(clear)}`);
  }
  return clear;
}
