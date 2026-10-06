// What a preview draws, as data for the runtime: the draw list of one frame of a clip (with
// the onion skin under it), the palette table it is drawn with, and what a pixel of the frame
// is (for the pixel inspector). Pure: the same functions run in the browser, where the WebGL
// backend draws the list, and in the tests, where the CPU backend does.

import { DrawList, frameIndex, PaletteTable } from "@whz/runtime";
import type { AtlasFrame, Sheet } from "@whz/runtime";

/** The rows of a preview's palette table: the asset's colours, then the two onion tints. */
export const PALETTE_ROW = 0;
export const ONION_PAST_ROW = 1;
export const ONION_NEXT_ROW = 2;

/** The onion skin's tints: the frame before is red, the frame after is blue. */
export const ONION_PAST_TINT: readonly [number, number, number] = [232, 72, 72];
export const ONION_NEXT_TINT: readonly [number, number, number] = [72, 128, 232];

const hex = (value: number): string => value.toString(16).padStart(2, "0");

/** Every colour mixed half and half with a tint: the frame keeps its shading and takes the tint's hue. */
export function tintColors(colors: readonly string[], tint: readonly [number, number, number]): string[] {
  return colors.map((color) => {
    const value = Number.parseInt(color.slice(1), 16);
    const mix = (channel: number, to: number): string => hex((channel + to + 1) >> 1);
    return `#${mix(value >>> 16, tint[0])}${mix((value >>> 8) & 0xff, tint[1])}${mix(value & 0xff, tint[2])}`;
  });
}

/** The palette table of a preview: row 0 is the palette as baked, rows 1 and 2 are the onion tints. */
export function previewPalette(colors: readonly string[]): PaletteTable {
  return new PaletteTable([colors, tintColors(colors, ONION_PAST_TINT), tintColors(colors, ONION_NEXT_TINT)]);
}

/** Which frame of which clip a preview shows. `prev` and `next` are the onion skin's frames, or null. */
export interface FrameChoice {
  readonly clip: string;
  readonly facing: string;
  readonly frame: number;
  readonly prev?: number | null | undefined;
  readonly next?: number | null | undefined;
}

/**
 * The draw list of one frame, for a target of the atlas's frame size: the frame as baked, pixel
 * for pixel. With an onion skin the frame before and the frame after are drawn under it in their
 * tints; they show where the current frame is transparent.
 */
export function frameList(sheet: Sheet, choice: FrameChoice): DrawList {
  const { atlas } = sheet;
  const [x, y] = atlas.pivot;
  const list = new DrawList();
  const add = (frame: number, paletteRow: number, depth: number): void => {
    list.sprite({ sheet, frame: frameIndex(atlas, choice.clip, frame, choice.facing), x, y, paletteRow, depth });
  };
  if (choice.prev !== null && choice.prev !== undefined) add(choice.prev, ONION_PAST_ROW, 0);
  if (choice.next !== null && choice.next !== undefined) add(choice.next, ONION_NEXT_ROW, 1);
  add(choice.frame, PALETTE_ROW, 2);
  return list;
}

/**
 * The choice if the sheet's atlas can show it, else null. A page may ask for a clip the loaded
 * sheet does not have yet (the asset was re-baked and its new sheet is still loading); such a
 * preview is skipped for a frame instead of failing.
 */
export function validChoice(sheet: Sheet, choice: FrameChoice): FrameChoice | null {
  const { atlas } = sheet;
  const clip = atlas.clips.find((candidate) => candidate.name === choice.clip);
  if (clip === undefined || !atlas.facings.includes(choice.facing)) return null;
  const inClip = (frame: number | null | undefined): boolean => frame === null || frame === undefined || (Number.isInteger(frame) && frame >= 0 && frame < clip.frames);
  return inClip(choice.frame) && inClip(choice.prev) && inClip(choice.next) ? choice : null;
}

/** What the pixel inspector says about one pixel. */
export interface PixelInfo {
  readonly x: number;
  readonly y: number;
  /** The palette index of the pixel. 0 is transparent. */
  readonly slot: number;
  /** The slot's name in the palette file, or null if the names are not known. */
  readonly name: string | null;
  /** `#rrggbb`, or null for the transparent slot. */
  readonly color: string | null;
  /** The colour's channels, or null for the transparent slot. */
  readonly rgb: readonly [number, number, number] | null;
}

/**
 * The pixel (x, y) of a frame of a clip, read from the sheet's palette indices: the truth of
 * what was baked, whatever is drawn over or under it. Null outside the frame.
 */
export function inspectPixel(sheet: Sheet, choice: Pick<FrameChoice, "clip" | "facing" | "frame">, x: number, y: number, names: readonly string[] | null): PixelInfo | null {
  const { atlas } = sheet;
  const frame = atlas.frames[frameIndex(atlas, choice.clip, choice.frame, choice.facing)] as AtlasFrame;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= frame.w || y >= frame.h) return null;
  const slot = sheet.pixels[(frame.y + y) * sheet.width + frame.x + x] as number;
  const color = slot === 0 ? null : (atlas.palette.colors[slot] ?? null);
  const value = color === null ? 0 : Number.parseInt(color.slice(1), 16);
  return { x, y, slot, name: names?.[slot] ?? null, color, rgb: color === null ? null : [value >>> 16, (value >>> 8) & 0xff, value & 0xff] };
}

// ---------------------------------------------------------------------------------------
// Where a preview is on the canvas

/** A rectangle in whole canvas (device) pixels. */
export interface DeviceRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * How many device pixels one native pixel takes at a zoom: a whole number, so pixel art is
 * never scaled by a fraction, whatever the display's pixel ratio. At a ratio of 1 or 2 it is
 * exactly `zoom` CSS pixels.
 */
export function deviceScale(zoom: number, pixelRatio: number): number {
  return Math.max(1, Math.floor(zoom * pixelRatio + 1e-6));
}

/** The CSS size of one native pixel at a zoom: what `deviceScale` device pixels are. */
export function cssPixel(zoom: number, pixelRatio: number): number {
  return deviceScale(zoom, pixelRatio) / pixelRatio;
}

/**
 * The canvas rectangle of an element: its CSS rectangle (relative to the viewport, as
 * `getBoundingClientRect` gives it) in device pixels, with the corner snapped to a whole
 * pixel and a size of `width` x `height` native pixels at the device scale.
 */
export function deviceRect(css: { readonly left: number; readonly top: number }, width: number, height: number, scale: number, pixelRatio: number): DeviceRect {
  return { x: Math.round(css.left * pixelRatio), y: Math.round(css.top * pixelRatio), w: width * scale, h: height * scale };
}

/** True if any part of the rectangle is inside a canvas of that size. */
export function onCanvas(rect: DeviceRect, canvasWidth: number, canvasHeight: number): boolean {
  return rect.x < canvasWidth && rect.y < canvasHeight && rect.x + rect.w > 0 && rect.y + rect.h > 0;
}
