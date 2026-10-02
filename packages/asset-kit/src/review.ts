// Review images: what the generator session looks at instead of raw sprites.
//
// A model cannot judge a 16-pixel PNG, sees only the first frame of a GIF, and gets a
// resampled, blurred copy of an image that is too long (docs/looking-at-images.md). So every
// image here is an integer nearest-neighbour upscale, laid out as a labelled grid, and never
// larger than `MAX_REVIEW_EDGE`: a sheet that would be is split into pages, and a frame that
// does not fit at the asked zoom gets the largest integer zoom that does.
//
// This file composes RGB pixels only. `@whz/asset-kit/node` encodes them as PNG and writes
// the files; nothing here does I/O, so the studio can make the same sheets.

import type { AnyAsset, AssetKind } from "./asset.ts";
import type { IndexedBuffer } from "./buffer.ts";
import { GLYPH_ADVANCE, GLYPH_H, glyphRows, textHeight, textWidth } from "./font.ts";
import { frameRefs, renderAll } from "./output.ts";

/**
 * The longest edge of a review image, in pixels. The vision model takes up to 2576 px, but
 * Claude Code's Read tool hands over at most 2000 px and resamples anything longer (measured
 * 2026-10-02: 975 x 2166 arrived as 900 x 2000). 2000 is therefore the edge that arrives
 * pixel for pixel.
 */
export const MAX_REVIEW_EDGE = 2000;
/** The zoom of the contact sheet and the strips unless asked otherwise. */
export const DEFAULT_REVIEW_ZOOM = 8;
/** The zoom of the silhouette sheet is at most this. */
export const SILHOUETTE_ZOOM = 4;

/** An RGB image: three bytes per pixel, row by row. */
export interface RgbImage {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

const TEXT_SCALE = 2;
/** The height of a line of labels: the text and 3 px above and below. */
const LINE_H = textHeight(TEXT_SCALE) + 6;
const PAD = 6;
const GUTTER = 1;

// The colours of the sheets themselves (not of any asset): 0xRRGGBB.
const PAGE = 0x17171c;
const TEXT = 0xe9e9f2;
const TITLE = 0xffd166;
const CAPTION_BG = 0x2c2c36;
const CELL_BG = 0x767b88;
const LIGHT_BG = 0xf3efe4;
const SILHOUETTE = 0x121216;
const FLOOR_A = 0x8f8b82;
const FLOOR_B = 0x99958b;
const FLOOR_TILE = 16;

/** A canvas of RGB pixels. Drawing outside it is clipped. */
export class RgbCanvas implements RgbImage {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;

  constructor(w: number, h: number, rgb = 0) {
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
      throw new RangeError(`RgbCanvas: the size must be positive integers, got ${String(w)} x ${String(h)}`);
    }
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 3);
    if (rgb !== 0) this.fill(0, 0, w, h, rgb);
  }

  /** A filled rectangle. */
  fill(x: number, y: number, w: number, h: number, rgb: number): this {
    const x0 = Math.max(x, 0);
    const y0 = Math.max(y, 0);
    const x1 = Math.min(x + w, this.w);
    const y1 = Math.min(y + h, this.h);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    for (let py = y0; py < y1; py += 1) {
      let at = (py * this.w + x0) * 3;
      for (let px = x0; px < x1; px += 1) {
        this.data[at] = r;
        this.data[at + 1] = g;
        this.data[at + 2] = b;
        at += 3;
      }
    }
    return this;
  }

  /**
   * Draws the opaque pixels of an indexed frame, each as a `zoom` x `zoom` square.
   * @param colors four bytes per palette slot (`palette.rgba()`)
   * @param mono   draw every opaque pixel in this colour instead (a silhouette)
   */
  frame(buffer: IndexedBuffer, colors: Uint8Array, x: number, y: number, zoom: number, mono?: number): this {
    for (let sy = 0; sy < buffer.h; sy += 1) {
      for (let sx = 0; sx < buffer.w; sx += 1) {
        const index = buffer.data[sy * buffer.w + sx] as number;
        if (index === 0) continue;
        const rgb = mono ?? ((colors[index * 4] as number) << 16) | ((colors[index * 4 + 1] as number) << 8) | (colors[index * 4 + 2] as number);
        this.fill(x + sx * zoom, y + sy * zoom, zoom, zoom, rgb);
      }
    }
    return this;
  }

  /** One line of text in the label font, its top-left corner at (x, y). */
  text(text: string, x: number, y: number, rgb: number, scale: number = TEXT_SCALE): this {
    for (let i = 0; i < text.length; i += 1) {
      const rows = glyphRows(text.charAt(i));
      for (let gy = 0; gy < GLYPH_H; gy += 1) {
        const row = rows[gy] as string;
        for (let gx = 0; gx < row.length; gx += 1) {
          if (row.charAt(gx) === "#") this.fill(x + (i * GLYPH_ADVANCE + gx) * scale, y + gy * scale, scale, scale, rgb);
        }
      }
    }
    return this;
  }
}

// ---------------------------------------------------------------------------------------
// The grid sheet: sections of labelled cells

/** One cell: a frame and the caption on the line above it. */
export interface SheetCell {
  readonly caption: string;
  readonly buffer: IndexedBuffer;
  /** Four bytes per palette slot (`palette.rgba()`). */
  readonly colors: Uint8Array;
}

/** A titled group of cells. The cells flow left to right and wrap. */
export interface SheetSection {
  readonly title: string;
  readonly cells: readonly SheetCell[];
}

export interface SheetSpec {
  /** The first line of every page. The zoom and the page number are added to it. */
  readonly header: string;
  readonly sections: readonly SheetSection[];
  /** The zoom asked for. The sheet uses the largest integer zoom up to it that fits. */
  readonly zoom: number;
  /** `silhouette`: every opaque pixel dark, on a light background. */
  readonly mode?: "color" | "silhouette";
  /** `MAX_REVIEW_EDGE` if not given. */
  readonly maxEdge?: number;
}

/** Where a cell's frame was drawn. */
export interface PlacedCell {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface RenderedSheet {
  readonly pages: readonly RgbCanvas[];
  /** The zoom the sheet was drawn at. */
  readonly zoom: number;
  /** The frame rectangle of every cell, in the order of the spec. */
  readonly cells: readonly PlacedCell[];
}

interface RowCell {
  readonly cell: SheetCell;
  readonly x: number;
  readonly w: number;
}

type Item = { readonly title: string } | { readonly title: string; readonly row: readonly RowCell[]; readonly h: number };

/** Lays out and draws a grid sheet. Throws if a single frame does not fit an image at 1x. */
export function renderSheet(spec: SheetSpec): RenderedSheet {
  const maxEdge = spec.maxEdge ?? MAX_REVIEW_EDGE;
  const innerW = maxEdge - 2 * PAD;
  // What one row of cells needs around it on a page: the header, a title and the padding.
  const overhead = 2 * PAD + 2 * LINE_H + GUTTER;
  const captionW = (cell: SheetCell): number => textWidth(cell.caption, TEXT_SCALE) + 4;
  const all = spec.sections.flatMap((section) => section.cells);
  if (!Number.isInteger(spec.zoom) || spec.zoom < 1) throw new RangeError(`renderSheet: the zoom must be a positive integer, got ${String(spec.zoom)}`);

  let zoom = spec.zoom;
  const fits = (z: number): boolean =>
    all.every((cell) => Math.max(cell.buffer.w * z, captionW(cell)) <= innerW && LINE_H + cell.buffer.h * z + overhead <= maxEdge);
  while (zoom > 1 && !fits(zoom)) zoom -= 1;
  if (!fits(zoom)) {
    const big = all.find((cell) => cell.buffer.w > innerW || LINE_H + cell.buffer.h + overhead > maxEdge);
    throw new Error(
      `a ${big?.buffer.w ?? "?"} x ${big?.buffer.h ?? "?"} frame does not fit a review image of ${maxEdge} px even at 1x: crop it before looking`,
    );
  }

  // Rows.
  const items: Item[] = [];
  for (const section of spec.sections) {
    items.push({ title: section.title });
    let row: RowCell[] = [];
    let x = 0;
    for (const cell of section.cells) {
      const w = Math.max(cell.buffer.w * zoom, captionW(cell));
      if (row.length > 0 && x + w > innerW) {
        items.push({ title: section.title, row, h: LINE_H + Math.max(...row.map((placed) => placed.cell.buffer.h)) * zoom });
        row = [];
        x = 0;
      }
      row.push({ cell, x, w });
      x += w + GUTTER;
    }
    if (row.length > 0) items.push({ title: section.title, row, h: LINE_H + Math.max(...row.map((placed) => placed.cell.buffer.h)) * zoom });
  }

  // Pages: a title stays with the row under it, and a section that continues repeats its title.
  type Line = { readonly y: number; readonly item: Item; readonly title: string | null };
  const pages: Line[][] = [[]];
  const top = PAD + LINE_H;
  let y = top;
  items.forEach((item, i) => {
    const page = pages[pages.length - 1] as Line[];
    if (!("row" in item)) {
      const next = items[i + 1];
      const needed = LINE_H + (next !== undefined && "row" in next ? next.h + GUTTER : 0);
      if (page.length > 0 && y + needed + PAD > maxEdge) {
        pages.push([]);
        y = top;
      }
      (pages[pages.length - 1] as Line[]).push({ y, item, title: item.title });
      y += LINE_H;
      return;
    }
    if (page.length > 0 && y + item.h + PAD > maxEdge) {
      pages.push([{ y: top, item: { title: item.title }, title: `${item.title} (continued)` }]);
      y = top + LINE_H;
    }
    (pages[pages.length - 1] as Line[]).push({ y, item, title: null });
    y += item.h + GUTTER;
  });

  const silhouette = spec.mode === "silhouette";
  const cells = new Map<SheetCell, PlacedCell>();
  const canvases = pages.map((lines, pageIndex) => {
    const header = `${spec.header}  zoom ${zoom}x${pages.length > 1 ? `  page ${pageIndex + 1}/${pages.length}` : ""}`;
    let contentW = textWidth(header, TEXT_SCALE);
    let bottom = top;
    for (const line of lines) {
      if (line.title !== null) contentW = Math.max(contentW, textWidth(line.title, TEXT_SCALE));
      if ("row" in line.item) {
        const last = line.item.row[line.item.row.length - 1] as RowCell;
        contentW = Math.max(contentW, last.x + last.w);
        bottom = Math.max(bottom, line.y + line.item.h);
      } else {
        bottom = Math.max(bottom, line.y + LINE_H);
      }
    }
    const canvas = new RgbCanvas(Math.min(maxEdge, contentW + 2 * PAD), bottom + PAD, PAGE);
    canvas.text(header, PAD, PAD + 3, TEXT);
    for (const line of lines) {
      if (line.title !== null) canvas.text(line.title, PAD, line.y + 3, TITLE);
      if (!("row" in line.item)) continue;
      for (const placed of line.item.row) {
        const { buffer } = placed.cell;
        const x = PAD + placed.x;
        canvas.fill(x, line.y, placed.w, LINE_H, CAPTION_BG);
        canvas.text(placed.cell.caption, x + 2, line.y + 3, TEXT);
        canvas.fill(x, line.y + LINE_H, placed.w, buffer.h * zoom, silhouette ? LIGHT_BG : CELL_BG);
        const fx = x + ((placed.w - buffer.w * zoom) >> 1);
        canvas.frame(buffer, placed.cell.colors, fx, line.y + LINE_H, zoom, silhouette ? SILHOUETTE : undefined);
        cells.set(placed.cell, { page: pageIndex, x: fx, y: line.y + LINE_H, w: buffer.w * zoom, h: buffer.h * zoom });
      }
    }
    return canvas;
  });
  return { pages: canvases, zoom, cells: all.map((cell) => cells.get(cell) as PlacedCell) };
}

// ---------------------------------------------------------------------------------------
// The in-context tile: the asset at 1x and at 3x on a neutral floor

export interface ContextSpec {
  readonly header: string;
  readonly kind: AssetKind;
  /** The frames to place, left to right (for a sprite: one per variant seed). */
  readonly frames: readonly { readonly buffer: IndexedBuffer; readonly colors: Uint8Array }[];
  /** `MAX_REVIEW_EDGE` if not given. */
  readonly maxEdge?: number;
}

export interface RenderedContext {
  readonly image: RgbCanvas;
  /** The zooms of the panels in the image, left to right: `[1, 3]` unless the image would be too large. */
  readonly zooms: readonly number[];
  /** The size of one panel at 1x. */
  readonly panel: readonly [w: number, h: number];
}

/**
 * One image with the same small scene twice: at 1x, the size the game shows it at, and at 3x.
 * A sprite stands on a neutral floor, tiles are repeated 3 x 3 so their seams show, and a
 * scene is shown as it is.
 */
export function renderContext(spec: ContextSpec): RenderedContext {
  const maxEdge = spec.maxEdge ?? MAX_REVIEW_EDGE;
  const repeat = spec.kind === "tiles" ? 3 : 1;
  const gap = spec.kind === "scene" ? 4 : 8;
  const items = spec.frames.map((frame) => ({ ...frame, w: frame.buffer.w * repeat, h: frame.buffer.h * repeat }));
  const panelW = Math.max(96, items.reduce((sum, item) => sum + item.w + gap, gap));
  const panelH = Math.max(64, Math.max(...items.map((item) => item.h)) + 2 * gap);

  const size = (zooms: readonly number[]): [number, number] => [
    2 * PAD + zooms.reduce((sum, zoom) => sum + panelW * zoom, 0) + (zooms.length - 1) * PAD,
    2 * PAD + 2 * LINE_H + panelH * Math.max(...zooms),
  ];
  const zooms = [[1, 3], [1, 2], [1]].find((candidate) => size(candidate).every((edge) => edge <= maxEdge));
  if (zooms === undefined) {
    throw new Error(`a ${panelW} x ${panelH} context panel does not fit a review image of ${maxEdge} px even at 1x: crop it before looking`);
  }

  const header = `${spec.header}  in context`;
  const [w, h] = size(zooms);
  const canvas = new RgbCanvas(Math.min(maxEdge, Math.max(w, textWidth(header, TEXT_SCALE) + 2 * PAD)), h, PAGE);
  canvas.text(header, PAD, PAD + 3, TEXT);
  let x = PAD;
  for (const zoom of zooms) {
    const y = PAD + 2 * LINE_H;
    canvas.text(`${zoom}x`, x, PAD + LINE_H + 3, TITLE);
    for (let ty = 0; ty * FLOOR_TILE < panelH; ty += 1) {
      for (let tx = 0; tx * FLOOR_TILE < panelW; tx += 1) {
        const tw = Math.min(FLOOR_TILE, panelW - tx * FLOOR_TILE);
        const th = Math.min(FLOOR_TILE, panelH - ty * FLOOR_TILE);
        canvas.fill(x + tx * FLOOR_TILE * zoom, y + ty * FLOOR_TILE * zoom, tw * zoom, th * zoom, (tx + ty) % 2 === 0 ? FLOOR_A : FLOOR_B);
      }
    }
    // The items share the panel's width evenly and stand on one line.
    const slack = panelW - items.reduce((sum, item) => sum + item.w, 0);
    const space = Math.floor(slack / (items.length + 1));
    let ix = space;
    for (const item of items) {
      const iy = (panelH - item.h) >> 1;
      for (let ry = 0; ry < repeat; ry += 1) {
        for (let rx = 0; rx < repeat; rx += 1) {
          canvas.frame(item.buffer, item.colors, x + (ix + rx * item.buffer.w) * zoom, y + (iy + ry * item.buffer.h) * zoom, zoom);
        }
      }
      ix += item.w + space;
    }
    x += panelW * zoom + PAD;
  }
  return { image: canvas, zooms, panel: [panelW, panelH] };
}

// ---------------------------------------------------------------------------------------
// The review set of one asset, and the group sheet of a pack

/** One image of a review set, ready to be encoded. */
export interface ReviewImage {
  /** The file name inside the review folder, e.g. `contact.png` or `contact-2.png`. */
  readonly file: string;
  readonly image: RgbImage;
  /** The integer zoom of the pixel art in the image (for the context tile: the largest). */
  readonly zoom: number;
  /** One line: what the image shows. */
  readonly about: string;
}

/** Options of `reviewAsset`. */
export interface ReviewOptions {
  /** The seed of the contact sheet, the strips and the silhouettes. The first variant seed if not given. */
  readonly seed?: number | undefined;
  /** A preset to render everything with. The default params if not given. */
  readonly preset?: string | undefined;
  /** `DEFAULT_REVIEW_ZOOM` if not given. */
  readonly zoom?: number | undefined;
  /** `MAX_REVIEW_EDGE` if not given. */
  readonly maxEdge?: number | undefined;
}

function named(name: string, sheet: RenderedSheet, about: string): ReviewImage[] {
  return sheet.pages.map((image, i) => ({
    file: sheet.pages.length === 1 ? `${name}.png` : `${name}-${i + 1}.png`,
    image,
    zoom: sheet.zoom,
    about: sheet.pages.length === 1 ? about : `${about} (page ${i + 1} of ${sheet.pages.length})`,
  }));
}

/**
 * The review images of one asset:
 *
 * - `contact`: every frame of one seed, each numbered with its index in atlas.json;
 * - `strip-<clip>`: one clip, frame by frame with its durations; a looping clip ends with its
 *   first frame again, so the seam can be seen;
 * - `silhouette`: every frame as a dark shape on a light background;
 * - `seeds`: the first frame for every variant seed and every review seed;
 * - `context`: the variants at 1x and 3x on a neutral floor.
 */
export function reviewAsset(asset: AnyAsset, options: ReviewOptions = {}): ReviewImage[] {
  const { meta } = asset;
  const colors = asset.palette.rgba();
  const seed = options.seed ?? (asset.variantSeeds[0] as number);
  const preset = options.preset;
  const zoom = options.zoom ?? DEFAULT_REVIEW_ZOOM;
  const maxEdge = options.maxEdge;
  const what = `${meta.id}  seed ${seed}${preset === undefined ? "" : `  preset ${preset}`}`;
  const output = renderAll(asset, { seed, preset });
  const refs = frameRefs(meta);
  const images: ReviewImage[] = [];

  const byClip = (caption: (index: number) => string): SheetSection[] =>
    meta.clips.flatMap((clip) =>
      meta.facings.map((facing): SheetSection => {
        const total = clip.durations.reduce((sum, ms) => sum + ms, 0);
        return {
          title: `${clip.name} / ${facing}  ${clip.frames} frames  ${total} ms${clip.loop ? "  loop" : ""}`,
          cells: output.frames.flatMap((frame, index) =>
            frame.clip === clip.name && frame.facing === facing ? [{ caption: caption(index), buffer: frame.buffer, colors }] : [],
          ),
        };
      }),
    );

  images.push(
    ...named(
      "contact",
      renderSheet({ header: `${what}  contact  ${meta.size[0]}x${meta.size[1]}`, sections: byClip(String), zoom, maxEdge }),
      `every frame of seed ${seed}, numbered as in atlas.json`,
    ),
  );

  for (const clip of meta.clips) {
    const sections = meta.facings.map((facing): SheetSection => {
      const cells = output.frames
        .filter((frame) => frame.clip === clip.name && frame.facing === facing)
        .map((frame): SheetCell => ({ caption: `${frame.frame}  ${clip.durations[frame.frame]}ms`, buffer: frame.buffer, colors }));
      // The seam of a loop: the first frame again, after the last.
      if (clip.loop && clip.frames > 1) cells.push({ ...(cells[0] as SheetCell), caption: "> 0" });
      return { title: facing, cells };
    });
    images.push(
      ...named(
        `strip-${clip.name}`,
        renderSheet({ header: `${what}  strip ${clip.name}${clip.loop ? "  loop" : ""}`, sections, zoom, maxEdge }),
        `the clip "${clip.name}" frame by frame, with durations${clip.loop ? "; the last cell is frame 0 again" : ""}`,
      ),
    );
  }

  images.push(
    ...named(
      "silhouette",
      renderSheet({
        header: `${what}  silhouette`,
        sections: byClip(String),
        zoom: Math.min(zoom, SILHOUETTE_ZOOM),
        mode: "silhouette",
        maxEdge,
      }),
      "every frame as a dark shape on a light background",
    ),
  );

  const first = refs[0] as { clip: string; facing: string; frame: number };
  const firstFrame = (of: number): SheetCell => ({
    caption: `seed ${of}`,
    buffer: asset.render({ ...first, seed: of, preset }),
    colors,
  });
  const variants = asset.variantSeeds.map(firstFrame);
  images.push(
    ...named(
      "seeds",
      renderSheet({
        header: `${meta.id}${preset === undefined ? "" : `  preset ${preset}`}  seeds  ${first.clip} frame 0`,
        sections: [
          { title: "variant seeds (curated)", cells: variants },
          { title: "review seeds (never curated)", cells: asset.reviewSeeds.map(firstFrame) },
        ],
        zoom,
        maxEdge,
      }),
      "the first frame for every variant seed and every review seed",
    ),
  );

  const context = renderContext({ header: `${meta.id}${preset === undefined ? "" : `  preset ${preset}`}`, kind: meta.kind, frames: variants, maxEdge });
  images.push({
    file: "context.png",
    image: context.image,
    zoom: Math.max(...context.zooms),
    about: `the variant seeds at ${context.zooms.map((z) => `${z}x`).join(" and ")} ${meta.kind === "tiles" ? "repeated 3 x 3" : meta.kind === "scene" ? "as they are" : "on a neutral floor"}`,
  });
  return images;
}

/** One asset of a pack sheet, or the reason it could not be loaded. */
export type PackEntry = { readonly asset: AnyAsset } | { readonly id: string; readonly error: string };

/** The pages of a pack sheet, and the assets that have an error row instead of cells. */
export interface PackReview {
  readonly images: ReviewImage[];
  readonly errors: { readonly id: string; readonly error: string }[];
}

/**
 * The group sheet of a pack: one row per asset, its review seeds as columns (the first frame
 * of the first clip). The cheap way to judge whether a pack is consistent. An asset that
 * cannot be loaded or rendered gets a row with the error instead of cells.
 */
export function reviewPack(pack: string, entries: readonly PackEntry[], options: Pick<ReviewOptions, "zoom" | "maxEdge"> = {}): PackReview {
  const errors: { id: string; error: string }[] = [];
  const failed = (id: string, error: string): SheetSection => {
    errors.push({ id, error });
    return { title: `${id}  ERROR ${error}`.slice(0, 120), cells: [] };
  };
  const sections = entries.map((entry): SheetSection => {
    if (!("asset" in entry)) return failed(entry.id, entry.error);
    const { asset } = entry;
    const { meta } = asset;
    const first = frameRefs(meta)[0] as { clip: string; facing: string; frame: number };
    const colors = asset.palette.rgba();
    try {
      const cells = asset.reviewSeeds.map((seed): SheetCell => ({ caption: `seed ${seed}`, buffer: asset.render({ ...first, seed }), colors }));
      return { title: `${meta.id}  ${meta.kind} ${meta.size[0]}x${meta.size[1]}  ${first.clip} frame 0`, cells };
    } catch (error) {
      return failed(meta.id, (error as Error).message);
    }
  });
  const sheet = renderSheet({
    header: `pack ${pack}  ${entries.length} assets  review seeds`,
    sections,
    zoom: options.zoom ?? DEFAULT_REVIEW_ZOOM,
    maxEdge: options.maxEdge,
  });
  return { images: named("pack", sheet, `one row per asset of the pack "${pack}", review seeds as columns`), errors };
}
