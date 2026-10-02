// The scenes of the runtime's checks, built from the example asset. Two readers use this one
// file, so they draw the same things: the tests in Node (CPU backend, golden hashes in
// test/golden/parity.json) and the dev page in the browser (WebGL backend against the CPU
// backend and against those hashes).
//
// Everything is a pure function of the sheets and the time: positions come from a seeded
// stream of @whz/det, never from Math.random.

import { createRng } from "@whz/det";
import { clipFrame, DrawList, findClip, frameIndex, PaletteTable } from "../src/index.ts";
import type { Atlas, Rgba, Sheet } from "../src/index.ts";

/** The asset every check draws. */
export const EXAMPLE_ID = "examples/blinking-dot";
/** The clip the grid plays. */
export const EXAMPLE_CLIP = "blink";

/** One picture: a draw list, the native size it is drawn at, and the clear colour. */
export interface Scene {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly clear: Rgba;
  readonly list: DrawList;
}

/** One cell of the grid: a scene and the background its rectangle of the canvas gets. */
export interface Preview {
  readonly scene: Scene;
  readonly background: Rgba;
}

const TRANSPARENT: Rgba = [0, 0, 0, 0];
const NIGHT: Rgba = [28, 22, 38, 255];

/**
 * The palette table of the checks. Row 0 is the atlas's own palette; row 1 is the same
 * colours with the slots in reverse order (slot 0 stays transparent): a palette swap that
 * changes every pixel.
 */
export function examplePalette(atlas: Atlas): PaletteTable {
  const colors = atlas.palette.colors;
  const swapped = [colors[0] as string, ...colors.slice(1).reverse()];
  return new PaletteTable([colors, swapped]);
}

/** The file of one frame inside a bake folder (docs/asset-pipeline.md). */
export function frameFile(sheet: Sheet, frame: number): string {
  const { clip, facing, frame: n } = sheet.atlas.frames[frame] as Atlas["frames"][number];
  return `frames/seed-${sheet.seed}/${clip}.${facing}.${n}.png`;
}

/**
 * Every frame of every variant on its own, in a target of the frame's size: once as baked
 * (row 0, not mirrored) and once mirrored with the swapped palette.
 */
export function frameScenes(sheets: readonly Sheet[]): Scene[] {
  const scenes: Scene[] = [];
  for (const sheet of sheets) {
    const { atlas } = sheet;
    const [width, height] = atlas.size;
    const [pivotX, pivotY] = atlas.pivot;
    for (const frame of atlas.frames) {
      const name = `frame seed-${sheet.seed} ${frame.clip}.${frame.facing}.${frame.frame}`;
      scenes.push({ name, width, height, clear: TRANSPARENT, list: new DrawList().sprite({ sheet, frame: frame.index, x: pivotX, y: pivotY }) });
      scenes.push({
        name: `${name} mirrored, palette row 1`,
        width,
        height,
        clear: TRANSPARENT,
        // Mirrored around the pivot column, the frame covers the columns the other way round.
        list: new DrawList().sprite({ sheet, frame: frame.index, x: width - 1 - pivotX, y: pivotY, mirror: true, paletteRow: 1 }),
      });
    }
  }
  return scenes;
}

/** True for the scenes of `frameScenes` that show a frame exactly as it was baked. */
export function isBakedFrameScene(scene: Scene): boolean {
  return scene.name.startsWith("frame ") && !scene.name.includes("mirrored");
}

/**
 * Twenty sprites on a 64 x 48 target: all variants and frames, mirrored and not, two palette
 * rows, overlapping, some cut by the edges, and only five depth keys, so many sprites share
 * one and the order of adding decides.
 */
export function twentySprites(sheets: readonly Sheet[]): Scene {
  const rng = createRng(20261002, "runtime/twenty-sprites");
  const list = new DrawList();
  const width = 64;
  const height = 48;
  for (let i = 0; i < 20; i += 1) {
    const sheet = rng.pick(sheets);
    list.sprite({
      sheet,
      frame: rng.int(sheet.atlas.frames.length),
      x: rng.range(-3, width + 2),
      y: rng.range(-3, height + 2),
      mirror: rng.chance(1, 2),
      paletteRow: rng.int(2),
      depth: rng.range(-2, 2),
    });
  }
  return { name: "twenty sprites", width, height, clear: NIGHT, list };
}

/** Every scene with a golden hash: the frames, then the twenty sprites. */
export function parityScenes(sheets: readonly Sheet[]): Scene[] {
  return [...frameScenes(sheets), twentySprites(sheets)];
}

const BACKGROUNDS: readonly Rgba[] = [TRANSPARENT, [40, 36, 58, 255], [214, 212, 220, 255], [31, 94, 110, 255]];

/** How many previews the grid has. */
export const GRID_CELLS = 16;

/**
 * The 16 previews of the grid at a time (whole milliseconds). Cells 0..11 are one animated
 * sprite each, at its native size: every variant, mirrored or not, either palette row, each
 * cell a little later in the clip than the one before. Cells 12..15 are small scenes of
 * several sprites. Cell 0 is the example asset as baked: first variant, row 0, not mirrored.
 */
export function gridPreviews(sheets: readonly Sheet[], timeMs: number): Preview[] {
  const previews: Preview[] = [];
  for (let cell = 0; cell < GRID_CELLS; cell += 1) {
    const background = BACKGROUNDS[cell % BACKGROUNDS.length] as Rgba;
    const sheet = sheets[cell % sheets.length] as Sheet;
    const { atlas } = sheet;
    const clip = findClip(atlas, EXAMPLE_CLIP);
    if (cell < 12) {
      const [width, height] = atlas.size;
      const [pivotX, pivotY] = atlas.pivot;
      const mirror = (cell & 1) === 1;
      const list = new DrawList().sprite({
        sheet,
        frame: frameIndex(atlas, clip.name, clipFrame(clip, timeMs + cell * 130)),
        x: mirror ? width - 1 - pivotX : pivotX,
        y: pivotY,
        mirror,
        paletteRow: (cell >> 1) & 1,
      });
      previews.push({ scene: { name: `cell ${cell}`, width, height, clear: TRANSPARENT, list }, background });
      continue;
    }
    const rng = createRng(cell, "runtime/grid-scene");
    const width = 40;
    const height = 24;
    const list = new DrawList();
    for (let i = 0; i < 7; i += 1) {
      const of = rng.pick(sheets);
      const y = rng.range(4, height - 2);
      list.sprite({
        sheet: of,
        frame: frameIndex(of.atlas, clip.name, clipFrame(clip, timeMs + rng.int(800))),
        x: rng.range(2, width - 3),
        y,
        mirror: rng.chance(1, 2),
        paletteRow: rng.int(2),
        depth: y, // lower on the screen is in front
      });
    }
    previews.push({ scene: { name: `cell ${cell}`, width, height, clear: cell === 13 ? NIGHT : TRANSPARENT, list }, background });
  }
  return previews;
}
