// The review images: integer zoom, numbered cells, a 1-pixel gutter, never larger than the
// edge the Read tool passes on unchanged. Checked on the pixels, not by looking.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { fnv1a64Hex } from "@whz/det";
import blinkingDot from "../../../assets/examples/blinking-dot/gen.ts";
import paletteJson from "../../../assets/palettes/example.json" with { type: "json" };
import {
  DEFAULT_REVIEW_ZOOM,
  IndexedBuffer,
  MAX_REVIEW_EDGE,
  parsePalette,
  renderAll,
  renderContext,
  renderSheet,
  reviewAsset,
  reviewPack,
} from "../src/index.ts";
import type { AnyAsset, RgbCanvas, RgbImage, SheetCell } from "../src/index.ts";
import { glyphRows } from "../src/font.ts";
import { decodePng, findAsset, loadAsset, openProject, reviewPackToDisk, reviewToDisk } from "../src/node/index.ts";
import { makeScene } from "./lint-fixtures/scene.ts";
import { makeWalker } from "./lint-fixtures/walker.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./lint-fixtures/", import.meta.url));
const palette = parsePalette(paletteJson);
const colors = palette.rgba();
const dot = blinkingDot as AnyAsset;

// The colours of the sheets (src/review.ts).
const PAGE = 0x17171c;
const TEXT = 0xe9e9f2;
const CAPTION_BG = 0x2c2c36;
const CELL_BG = 0x767b88;
const LIGHT_BG = 0xf3efe4;
const SILHOUETTE = 0x121216;
/** The height of a caption line, and where its text starts. */
const LINE_H = 20;

const temp = mkdtempSync(join(tmpdir(), "whz-review-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

function pixel(image: RgbImage, x: number, y: number): number {
  const at = (y * image.w + x) * 3;
  return ((image.data[at] as number) << 16) | ((image.data[at + 1] as number) << 8) | (image.data[at + 2] as number);
}

function slotRgb(index: number): number {
  const [r, g, b] = palette.slots[index]?.rgb as readonly [number, number, number];
  return (r << 16) | (g << 8) | b;
}

/** True if the text is drawn in the label font at (x, y), scale 2, on the given background. */
function hasText(image: RgbImage, text: string, x: number, y: number, ink: number, background: number): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const rows = glyphRows(text.charAt(i));
    for (let gy = 0; gy < 7; gy += 1) {
      for (let gx = 0; gx < 5; gx += 1) {
        const expected = (rows[gy] as string).charAt(gx) === "#" ? ink : background;
        for (const [dx, dy] of [[0, 0], [1, 1]] as const) {
          if (pixel(image, x + (i * 6 + gx) * 2 + dx, y + gy * 2 + dy) !== expected) return false;
        }
      }
    }
  }
  return true;
}

const cell = (caption: string, buffer: IndexedBuffer): SheetCell => ({ caption, buffer, colors });

describe("renderSheet", () => {
  const red = palette.slot("red.1");
  const a = new IndexedBuffer(4, 4).fill(0, 0, 2, 2, red).pset(3, 3, palette.ink);
  const b = new IndexedBuffer(4, 4).fill(1, 1, 3, 3, palette.slot("teal.1"));
  const sheet = renderSheet({ header: "test", sections: [{ title: "idle", cells: [cell("0", a), cell("1", b)] }], zoom: 8 });
  const page = sheet.pages[0] as RgbCanvas;

  it("draws every frame pixel as a zoom x zoom square: an integer nearest-neighbour upscale", () => {
    expect([sheet.pages.length, sheet.zoom]).toEqual([1, 8]);
    sheet.cells.forEach((placed, i) => {
      const buffer = i === 0 ? a : b;
      expect([placed.page, placed.w, placed.h]).toEqual([0, 32, 32]);
      for (let y = 0; y < 32; y += 1) {
        for (let x = 0; x < 32; x += 1) {
          const index = buffer.get(x >> 3, y >> 3);
          expect(pixel(page, placed.x + x, placed.y + y)).toBe(index === 0 ? CELL_BG : slotRgb(index));
        }
      }
    });
  });

  it("numbers every cell on the line above it", () => {
    sheet.cells.forEach((placed, i) => {
      expect(hasText(page, String(i), placed.x + 2, placed.y - LINE_H + 3, TEXT, CAPTION_BG)).toBe(true);
      expect(hasText(page, String(1 - i), placed.x + 2, placed.y - LINE_H + 3, TEXT, CAPTION_BG)).toBe(false);
    });
  });

  it("keeps a 1-pixel gutter between cells", () => {
    const [first, second] = sheet.cells as [(typeof sheet.cells)[number], (typeof sheet.cells)[number]];
    expect(second.x - first.x).toBe(32 + 1);
    expect(second.y).toBe(first.y);
    for (let y = first.y - LINE_H; y < first.y + 32; y += 1) expect(pixel(page, first.x + 32, y)).toBe(PAGE);
  });

  it("silhouette mode: every opaque pixel dark, on a light background", () => {
    const mono = renderSheet({ header: "test", sections: [{ title: "idle", cells: [cell("0", a)] }], zoom: 4, mode: "silhouette" });
    const placed = mono.cells[0] as (typeof mono.cells)[number];
    const image = mono.pages[0] as RgbCanvas;
    expect(pixel(image, placed.x, placed.y)).toBe(SILHOUETTE);
    expect(pixel(image, placed.x + 15, placed.y + 15)).toBe(SILHOUETTE);
    expect(pixel(image, placed.x + 8, placed.y)).toBe(LIGHT_BG);
  });

  it("lowers the zoom to the largest integer at which the largest frame fits", () => {
    const big = renderSheet({ header: "big", sections: [{ title: "scene", cells: [cell("0", new IndexedBuffer(300, 300).fill(0, 0, 300, 300, red))] }], zoom: 8 });
    expect(big.zoom).toBe(6);
    expect(big.cells[0]).toMatchObject({ w: 1800, h: 1800 });
    const page0 = big.pages[0] as RgbCanvas;
    expect(Math.max(page0.w, page0.h)).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    // A smaller edge lowers it further.
    expect(renderSheet({ header: "big", sections: [{ title: "s", cells: [cell("0", new IndexedBuffer(300, 300))] }], zoom: 8, maxEdge: 1000 }).zoom).toBe(3);
  });

  it("splits a sheet that is too long into pages, each within the edge, and wraps rows", () => {
    const frames = Array.from({ length: 18 }, (_, i) => cell(String(i), new IndexedBuffer(100, 100).fill(0, 0, 100, 100, 1 + (i % 16))));
    const long = renderSheet({ header: "long", sections: [{ title: "walk", cells: frames }], zoom: 8 });
    expect(long.zoom).toBe(8);
    // 800 px per cell: two cells per row, two rows per page.
    expect(long.pages.length).toBe(5);
    expect(long.cells.map((placed) => placed.page)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
    for (const image of long.pages) expect(Math.max(image.w, image.h)).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    expect(long.cells[2]).toMatchObject({ x: long.cells[0]?.x, y: (long.cells[0]?.y ?? 0) + 800 + 1 + LINE_H });
    // Every cell shows its own frame, whatever page it is on.
    long.cells.forEach((placed, i) => expect(pixel(long.pages[placed.page] as RgbCanvas, placed.x + 400, placed.y + 400)).toBe(slotRgb(1 + (i % 16))));
  });

  it("refuses a frame that does not fit even at 1x, and a zoom that is not a positive integer", () => {
    const wide = { header: "wide", sections: [{ title: "s", cells: [cell("0", new IndexedBuffer(3000, 10))] }], zoom: 8 };
    expect(() => renderSheet(wide)).toThrow(/a 3000 x 10 frame does not fit a review image of 2000 px even at 1x: crop it before looking/);
    expect(() => renderSheet({ ...wide, zoom: 1.5 })).toThrow(/the zoom must be a positive integer, got 1.5/);
    expect(() => renderSheet({ ...wide, zoom: 0 })).toThrow(RangeError);
  });

  it("gives the same pixels for the same input", () => {
    const again = renderSheet({ header: "test", sections: [{ title: "idle", cells: [cell("0", a), cell("1", b)] }], zoom: 8 });
    expect(Buffer.from((again.pages[0] as RgbCanvas).data).equals(Buffer.from(page.data))).toBe(true);
  });
});

describe("renderContext", () => {
  const sprite = { buffer: new IndexedBuffer(12, 12).fill(2, 2, 8, 8, palette.slot("gold.1")), colors };

  it("shows a sprite at 1x and at 3x on a floor", () => {
    const context = renderContext({ header: "tests/sprite", kind: "sprite", frames: [sprite, sprite] });
    expect(context.zooms).toEqual([1, 3]);
    expect(context.panel).toEqual([96, 64]);
    expect([context.image.w, context.image.h]).toEqual([12 + 96 + 288 + 6, 12 + 2 * LINE_H + 64 * 3]);
    // Both panels hold the sprite's colour: 2 sprites x 64 px at 1x, 9 times as many at 3x.
    const gold = slotRgb(palette.slot("gold.1"));
    let left = 0;
    let right = 0;
    for (let y = 0; y < context.image.h; y += 1) {
      for (let x = 0; x < context.image.w; x += 1) {
        if (pixel(context.image, x, y) !== gold) continue;
        if (x < 6 + 96) left += 1;
        else right += 1;
      }
    }
    expect([left, right]).toEqual([128, 128 * 9]);
  });

  it("repeats tiles 3 x 3, and drops the 3x panel when the image would be too large", () => {
    const tile = { buffer: new IndexedBuffer(16, 16).fill(0, 0, 16, 16, palette.slot("teal.1")), colors };
    const tiles = renderContext({ header: "tests/tile", kind: "tiles", frames: [tile] });
    const teal = slotRgb(palette.slot("teal.1"));
    let count = 0;
    for (let y = 0; y < tiles.image.h; y += 1) for (let x = 0; x < 6 + 96; x += 1) if (pixel(tiles.image, x, y) === teal) count += 1;
    expect(count).toBe(16 * 16 * 9);

    const scene = { buffer: new IndexedBuffer(700, 300), colors };
    expect(renderContext({ header: "tests/scene", kind: "scene", frames: [scene] }).zooms).toEqual([1]);
    const mid = { buffer: new IndexedBuffer(500, 300), colors };
    expect(renderContext({ header: "tests/scene", kind: "scene", frames: [mid] }).zooms).toEqual([1, 2]);
    expect(() => renderContext({ header: "tests/scene", kind: "scene", frames: [{ buffer: new IndexedBuffer(2400, 300), colors }] })).toThrow(/does not fit a review image of 2000 px even at 1x/);
  });
});

describe("reviewAsset", () => {
  const images = reviewAsset(dot);
  const byFile = new Map(images.map((image) => [image.file, image]));

  it("makes the contact sheet, a strip per clip, silhouettes, seeds and the in-context tile", () => {
    expect(images.map((image) => [image.file, image.zoom])).toEqual([
      ["contact.png", DEFAULT_REVIEW_ZOOM],
      ["strip-blink.png", 8],
      ["silhouette.png", 4],
      ["seeds.png", 8],
      ["context.png", 3],
    ]);
    for (const { image } of images) {
      expect(Math.max(image.w, image.h)).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
      expect(image.data.length).toBe(image.w * image.h * 3);
    }
    expect(byFile.get("contact.png")?.about).toBe("every frame of seed 1, numbered as in atlas.json");
  });

  it("the contact sheet shows every frame of the seed at 8x, numbered with its atlas index", () => {
    const contact = byFile.get("contact.png")?.image as RgbImage;
    const frames = renderAll(dot, { seed: 1 }).frames;
    // The layout is the one of renderSheet: re-derive where the cells are.
    const sheet = renderSheet({
      header: "examples/blinking-dot  seed 1  contact  12x12",
      sections: [{ title: "blink / default  2 frames  800 ms  loop", cells: frames.map((frame, i) => cell(String(i), frame.buffer)) }],
      zoom: 8,
    });
    expect(Buffer.from((sheet.pages[0] as RgbCanvas).data).equals(Buffer.from(contact.data))).toBe(true);
    sheet.cells.forEach((placed, i) => {
      expect(hasText(contact, String(i), placed.x + 2, placed.y - LINE_H + 3, TEXT, CAPTION_BG)).toBe(true);
      const buffer = (frames[i] as (typeof frames)[number]).buffer;
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          const index = buffer.get(x, y);
          expect(pixel(contact, placed.x + x * 8 + 7, placed.y + y * 8)).toBe(index === 0 ? CELL_BG : slotRgb(index));
        }
      }
    });
  });

  it("golden: the review images of the example asset have stable hashes", () => {
    expect(Object.fromEntries(images.map(({ file, image }) => [file, `${image.w}x${image.h} ${fnv1a64Hex(image.data)}`]))).toEqual({
      "contact.png": "658x168 0aeeef2dbe1fa365",
      "strip-blink.png": "694x168 9dc5400b58194d55",
      "silhouette.png": "610x120 42f588f3229c7885",
      "seeds.png": "787x305 9248b0d0ef65171d",
      "context.png": "406x244 e754b88fad522559",
    });
  });

  it("a looping strip ends with its first frame again; the seed, the preset and the zoom can be chosen", () => {
    const strip = byFile.get("strip-blink.png");
    expect(strip?.about).toBe('the clip "blink" frame by frame, with durations; the last cell is frame 0 again');
    // Three cells of 96 px with two gutters, and the padding.
    expect(strip?.image.w).toBeGreaterThanOrEqual(3 * 96 + 2 + 12);

    const small = reviewAsset(dot, { seed: 5, preset: "small", zoom: 2 });
    expect(small.map((image) => image.zoom)).toEqual([2, 2, 2, 2, 3]);
    expect(small[0]?.about).toBe("every frame of seed 5, numbered as in atlas.json");
    expect(Buffer.from(small[0]?.image.data ?? []).equals(Buffer.from(images[0]?.image.data ?? []))).toBe(false);
    expect(() => reviewAsset(dot, { preset: "huge" })).toThrow(/huge/);
  });

  it("an asset with several clips and facings gets a strip per clip, and a scene is shown as it is", async () => {
    const face = await loadAsset(fileURLToPath(new URL("./fixtures/stamped-face/gen.ts", import.meta.url)));
    expect(reviewAsset(face).map((image) => image.file)).toEqual(["contact.png", "strip-idle.png", "strip-blink.png", "silhouette.png", "seeds.png", "context.png"]);
    const scene = reviewAsset(makeScene("tests/day", false));
    expect(scene.map((image) => image.file)).toEqual(["contact.png", "strip-still.png", "silhouette.png", "seeds.png", "context.png"]);
    expect(scene.at(-1)?.about).toBe("the variant seeds at 1x and 3x as they are");
  });
});

describe("reviewPack", () => {
  it("one row per asset with its review seeds as columns, and an error row for an asset that fails", () => {
    const walker = makeWalker("pack/walker");
    const review = reviewPack("pack", [{ asset: dot }, { asset: walker }, { id: "pack/broken", error: "cannot be loaded" }, { asset: makeWalker("pack/odd", "wrong-frame-size", 0) }]);
    expect(review.images.map((image) => image.file)).toEqual(["pack.png"]);
    expect(review.images[0]?.zoom).toBe(8);
    // The fourth asset renders frame 0 fine: only its frame 3 has the wrong size.
    expect(review.errors).toEqual([{ id: "pack/broken", error: "cannot be loaded" }]);
    const image = review.images[0]?.image as RgbImage;
    expect(Math.max(image.w, image.h)).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    // 8 review seeds of the dot at 8x in one row.
    expect(image.w).toBeGreaterThanOrEqual(8 * 96 + 7 + 12);
  });

  it("an asset whose first frame cannot be rendered gets an error row too", () => {
    const review = reviewPack("pack", [{ asset: makeWalker("pack/off", "off-palette") }, { asset: dot }]);
    expect(review.errors).toMatchObject([{ id: "pack/off", error: expect.stringContaining("has index 200") }]);
    expect(review.images.length).toBe(1);
  });
});

describe("review on disk", () => {
  it("writes the PNG files and lint.json, and removes pages of an older review", async () => {
    const project = openProject({ root: REPO, out: join(temp, "repo") });
    const dir = join(temp, "repo", "review", "examples", "blinking-dot");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "contact-7.png"), "stale");

    const result = await reviewToDisk(project, findAsset(project, "examples/blinking-dot"));
    if (!result.ok) throw new Error(result.error);
    expect(result.dir).toBe(dir);
    expect(readdirSync(dir).sort()).toEqual(["contact.png", "context.png", "lint.json", "seeds.png", "silhouette.png", "strip-blink.png"]);
    expect(result.lint?.ok).toBe(true);
    for (const written of result.images) {
      const png = decodePng(readFileSync(written.path));
      expect([png.type, png.w, png.h]).toEqual(["rgb", written.w, written.h]);
      expect(Math.max(png.w, png.h)).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    }
    // The file holds the pixels reviewAsset made.
    const contact = decodePng(readFileSync(join(dir, "contact.png")));
    expect(Buffer.from(contact.data).equals(Buffer.from(reviewAsset(dot)[0]?.image.data ?? []))).toBe(true);
  });

  it("an asset with lint errors still gets its images; one that cannot be rendered does not", async () => {
    const project = openProject({ root: REPO, assets: FIXTURES, out: join(temp, "fixtures") });
    const orphan = await reviewToDisk(project, findAsset(project, "defects/orphan-pixel"));
    expect(orphan.ok && orphan.images.length).toBe(5);
    expect(orphan.ok && orphan.lint?.ok).toBe(false);

    const broken = await reviewToDisk(project, findAsset(project, "defects/wrong-frame-size"));
    expect(broken).toMatchObject({ ok: false, error: expect.stringContaining("19 x 22") });
  });

  it("the group sheet of a pack", async () => {
    const project = openProject({ root: REPO, assets: FIXTURES, out: join(temp, "packs") });
    const clean = await reviewPackToDisk(project, "clean");
    if (!clean.ok) throw new Error(clean.error);
    expect(clean.images.map((image) => image.path)).toEqual([join(temp, "packs", "review", "clean", "pack.png")]);
    expect(clean.errors).toEqual([]);
    expect(existsSync(join(temp, "packs", "review", "clean", "pack.png"))).toBe(true);

    const defects = await reviewPackToDisk(project, "defects");
    expect(defects.ok && defects.errors.map((problem) => problem.id)).toEqual(["defects/off-palette"]);

    expect(await reviewPackToDisk(project, "nothing")).toMatchObject({ ok: false, error: expect.stringContaining('no assets in the pack "nothing"') });
  });
});
