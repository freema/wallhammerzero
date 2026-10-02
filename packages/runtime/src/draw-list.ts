// The draw list: what to draw, with no word about how. A caller (the studio's player, a game's
// view) fills a list, and a backend draws it. Both backends read the same list in the same
// order, which is what makes their pixels comparable.
//
// Today the only item is a sprite. Later notes add kinds (text, tiles, FX) to `DrawItem`.
//
// Order: items are drawn by ascending depth key, so a higher key is in front. Items with the
// same key are drawn in the order they were added. The order is total and has no ties, so no
// engine's sort can change a picture.

import type { AtlasFrame } from "./atlas.ts";
import type { Sheet } from "./sheet.ts";

/** What `DrawList.sprite` takes. */
export interface SpriteSpec {
  readonly sheet: Sheet;
  /** The atlas frame index: `frameIndex(atlas, clip, frame, facing)`. */
  readonly frame: number;
  /** Where the frame's pivot pixel goes in the target. Whole pixels. */
  readonly x: number;
  readonly y: number;
  /** Mirror left to right. The pivot pixel stays on (x, y). Default false. */
  readonly mirror?: boolean | undefined;
  /** The row of the palette table to draw with. Default 0. */
  readonly paletteRow?: number | undefined;
  /** The depth key: a higher key is drawn later, in front. Default 0. */
  readonly depth?: number | undefined;
}

/** A sprite in a list. */
export interface SpriteItem {
  readonly kind: "sprite";
  readonly sheet: Sheet;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly mirror: boolean;
  readonly paletteRow: number;
  readonly depth: number;
  /** Its place in the order of adding: the tie-break of the sort. */
  readonly order: number;
}

export type DrawItem = SpriteItem;

/** Where a sprite lands: the rectangle in the target and its source rectangle in the sheet. */
export interface SpriteRect {
  /** The top-left corner in the target. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** The top-left corner of the frame in the sheet. */
  readonly sx: number;
  readonly sy: number;
}

function requireInt(name: string, value: number): void {
  if ((value | 0) !== value) throw new RangeError(`DrawList.sprite: ${name} must be a 32-bit integer, got ${String(value)}`);
}

/**
 * The rectangle a sprite covers. Pixel (i, j) of the rectangle shows frame pixel (i, j), or
 * (w - 1 - i, j) when mirrored. The pivot pixel lands on (x, y) either way.
 */
export function spriteRect(item: SpriteItem): SpriteRect {
  const { atlas } = item.sheet;
  const frame = atlas.frames[item.frame] as AtlasFrame;
  const [pivotX, pivotY] = atlas.pivot;
  return {
    x: item.mirror ? item.x - (frame.w - 1 - pivotX) : item.x - pivotX,
    y: item.y - pivotY,
    w: frame.w,
    h: frame.h,
    sx: frame.x,
    sy: frame.y,
  };
}

export class DrawList {
  private readonly added: DrawItem[] = [];
  private order: readonly DrawItem[] | null = null;

  /** The number of items. */
  get length(): number {
    return this.added.length;
  }

  /** Adds a sprite. Positions, the depth key and the palette row are integers; anything else throws. */
  sprite(spec: SpriteSpec): this {
    const frames = spec.sheet.atlas.frames.length;
    if (!Number.isInteger(spec.frame) || spec.frame < 0 || spec.frame >= frames) {
      throw new RangeError(`DrawList.sprite: ${JSON.stringify(spec.sheet.atlas.id)} has frames 0..${frames - 1}, got ${String(spec.frame)}`);
    }
    const paletteRow = spec.paletteRow ?? 0;
    const depth = spec.depth ?? 0;
    requireInt("x", spec.x);
    requireInt("y", spec.y);
    requireInt("depth", depth);
    if (!Number.isInteger(paletteRow) || paletteRow < 0) {
      throw new RangeError(`DrawList.sprite: paletteRow must be a row number from 0, got ${String(paletteRow)}`);
    }
    this.added.push({
      kind: "sprite",
      sheet: spec.sheet,
      frame: spec.frame,
      x: spec.x,
      y: spec.y,
      mirror: spec.mirror === true,
      paletteRow,
      depth,
      order: this.added.length,
    });
    this.order = null;
    return this;
  }

  /** Empties the list, to fill it again for the next frame. */
  clear(): this {
    this.added.length = 0;
    this.order = null;
    return this;
  }

  /** The items in the order they were added. */
  items(): readonly DrawItem[] {
    return this.added;
  }

  /** The items in drawing order: by depth key, then by the order of adding. */
  sorted(): readonly DrawItem[] {
    this.order ??= [...this.added].sort((a, b) => (a.depth !== b.depth ? (a.depth < b.depth ? -1 : 1) : a.order - b.order));
    return this.order;
  }
}
