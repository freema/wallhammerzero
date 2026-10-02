// Where a native-resolution image goes in a rectangle of the screen: scaled by a whole
// number and centred. Pixel art is never scaled by a fraction; the space left over stays
// background. The WebGL backend's `present` uses this, and a host uses the same numbers to
// turn a pointer position back into a native pixel.

/** A rectangle in screen (canvas) pixels. The origin is the top-left corner, y goes down. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Where the image was put: its rectangle and the zoom. It may reach outside the rectangle it was fitted to when it does not fit at 1x. */
export interface Placement extends Rect {
  /** The whole-number zoom: one native pixel is `scale` x `scale` screen pixels. */
  readonly scale: number;
}

function requireInt(fn: string, name: string, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min) throw new RangeError(`${fn}: ${name} must be an integer of at least ${min}, got ${String(value)}`);
}

/** The largest whole-number zoom at which `width` x `height` fits `w` x `h`; 1 when it does not fit at all. */
export function fitScale(width: number, height: number, w: number, h: number): number {
  return Math.max(1, Math.min(Math.floor(w / width), Math.floor(h / height)));
}

/**
 * Puts a `width` x `height` image into `rect`: at `scale`, or without one at the largest
 * zoom that fits, centred (an odd leftover pixel goes to the right and to the bottom).
 */
export function placeTarget(width: number, height: number, rect: Rect, scale?: number): Placement {
  requireInt("placeTarget", "width", width, 1);
  requireInt("placeTarget", "height", height, 1);
  requireInt("placeTarget", "rect.x", rect.x, -0x40000000);
  requireInt("placeTarget", "rect.y", rect.y, -0x40000000);
  requireInt("placeTarget", "rect.w", rect.w, 1);
  requireInt("placeTarget", "rect.h", rect.h, 1);
  const zoom = scale ?? fitScale(width, height, rect.w, rect.h);
  requireInt("placeTarget", "scale", zoom, 1);
  const w = width * zoom;
  const h = height * zoom;
  return { x: rect.x + Math.floor((rect.w - w) / 2), y: rect.y + Math.floor((rect.h - h) / 2), w, h, scale: zoom };
}

/**
 * The native pixel under a screen position, or null outside the image. For a pixel inspector:
 * `nativePixel(placement, pointerX, pointerY)`.
 */
export function nativePixel(placement: Placement, x: number, y: number): { x: number; y: number } | null {
  if (x < placement.x || y < placement.y || x >= placement.x + placement.w || y >= placement.y + placement.h) return null;
  return { x: Math.floor((x - placement.x) / placement.scale), y: Math.floor((y - placement.y) / placement.scale) };
}
