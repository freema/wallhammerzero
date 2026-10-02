// Part layers. A character is a stack of parts (legs, torso, head, prop), each a small buffer.
// `compose` stacks them back to front and outlines the result once, so the parts read as one
// shape with one outline. Order matters: a far arm goes under the torso, a near arm over it.
//
// Thin details (strings, sparkles, face stamps) are drawn after `compose`, on the returned
// buffer: outlined, a 1-pixel string becomes a 3-pixel pole.

import { IndexedBuffer } from "./buffer.ts";

/** One part and where its top-left corner goes. */
export interface Layer {
  readonly part: IndexedBuffer;
  readonly x: number;
  readonly y: number;
  /** Draw the part mirrored left to right. */
  readonly mirror?: boolean;
}

/** The outline `compose` adds. */
export interface OutlineStyle {
  /** The palette index of the outline (usually `palette.ink`). */
  readonly ink: number;
  /** The index for the rim under and to the right of the shape; `ink` if not given. */
  readonly shadowInk?: number;
}

/**
 * A new w x h buffer with `layers` drawn in order (the first is the farthest back), then
 * outlined once. Pass `null` as the outline for none. Leave a 1-pixel margin around the
 * parts, or the outline is clipped at the edge.
 */
export function compose(w: number, h: number, layers: readonly Layer[], outline: OutlineStyle | null): IndexedBuffer {
  const buffer = new IndexedBuffer(w, h);
  for (const layer of layers) {
    buffer.blit(layer.part, layer.x, layer.y, { mirrorX: layer.mirror === true });
  }
  if (outline !== null) buffer.outline(outline.ink, outline.shadowInk ?? outline.ink);
  return buffer;
}
