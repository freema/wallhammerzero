// Bake, lint and review on disk: the functions behind the `asset` CLI. The studio calls the
// same functions (in a worker), so a bake from the studio is byte for byte the bake of the
// command line.
//
// Every function takes the project and an asset entry, never throws for a broken asset, and
// returns what it wrote. Images go straight to files, never through stdout.
//
// A process loads each gen.ts once: Node caches modules. A host that re-bakes after an edit
// (the studio) runs the bake in a fresh worker.

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { bakeAsset } from "../bake.ts";
import type { Atlas } from "../bake.ts";
import { formatJson } from "../json.ts";
import { lintAsset } from "../lint.ts";
import type { LintReport } from "../lint.ts";
import { reviewAsset, reviewPack } from "../review.ts";
import type { PackEntry, ReviewImage, ReviewOptions } from "../review.ts";
import { encodeIndexedPng, encodeRgbPng } from "./png.ts";
import { findAssets, findPack, loadEntry, sourceHash } from "./project.ts";
import type { AssetEntry, AssetProject } from "./project.ts";

/** The `format` value of the error.json a failed bake leaves. */
export const BAKE_ERROR_FORMAT = "wz.bake-error/1";

/** The folder `bake` writes an asset to. */
export function bakeDir(project: AssetProject, id: string): string {
  return join(project.outDir, "assets", ...id.split("/"));
}

/** The folder `review` and `lint` write an asset's images and lint.json to; for a pack, its group sheet. */
export function reviewDir(project: AssetProject, id: string): string {
  return join(project.outDir, "review", ...id.split("/"));
}

const posix = (path: string): string => path.split(sep).join("/");

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------------------
// Bake

/** What a bake did. `files` are relative to `dir`, in the order they were written. */
export type BakeResult =
  | { readonly id: string; readonly ok: true; readonly dir: string; readonly atlas: Atlas; readonly files: readonly string[] }
  | { readonly id: string; readonly ok: false; readonly dir: string; readonly error: string };

/**
 * Bakes one asset into `build/assets/<id>/`:
 *
 *   atlas.json                                 frames, pivot, clips, facings, variants, hashes
 *   seed-<seed>.png                            the sheet of one variant, as an indexed PNG
 *   frames/seed-<seed>/<clip>.<facing>.<n>.png  every frame on its own
 *
 * The folder is emptied first and atlas.json is written last, so a reader that finds an
 * atlas finds complete files. An asset that cannot be loaded or rendered leaves only
 * error.json, never the outputs of an older bake.
 */
export async function bakeToDisk(project: AssetProject, entry: AssetEntry): Promise<BakeResult> {
  const dir = bakeDir(project, entry.id);
  let source = "";
  try {
    source = sourceHash(entry);
    const asset = await loadEntry(entry);
    const baked = bakeAsset(asset, { sourceHash: source });
    const colors = asset.palette.rgba();
    rmSync(dir, { recursive: true, force: true });
    const files: string[] = [];
    const write = (file: string, content: Uint8Array | string): void => {
      const path = join(dir, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      files.push(file);
    };
    baked.variants.forEach((variant, i) => {
      const names = baked.atlas.variants[i] as Atlas["variants"][number];
      write(names.sheet, encodeIndexedPng(variant.sheet, colors));
      variant.output.frames.forEach((frame, index) => {
        write(`${names.frames}/${(baked.atlas.frames[index] as Atlas["frames"][number]).file}`, encodeIndexedPng(frame.buffer, colors));
      });
    });
    write("atlas.json", formatJson(baked.atlas));
    return { id: entry.id, ok: true, dir, atlas: baked.atlas, files };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "error.json"), formatJson({ format: BAKE_ERROR_FORMAT, id: entry.id, sourceHash: source, message: message(error) }));
    return { id: entry.id, ok: false, dir, error: message(error) };
  }
}

/** The ids that have an output folder under `build/assets/` (an atlas.json or an error.json). */
function bakedIds(project: AssetProject): string[] {
  const root = join(project.outDir, "assets");
  const ids: string[] = [];
  const walk = (folder: string): void => {
    const entries = readdirSync(folder, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && (entry.name === "atlas.json" || entry.name === "error.json"))) {
      ids.push(posix(relative(root, folder)));
      return;
    }
    for (const entry of entries) if (entry.isDirectory()) walk(join(folder, entry.name));
  };
  if (existsSync(root)) walk(root);
  return ids;
}

/**
 * Bakes every asset of the project, in id order, and removes the output of assets that no
 * longer exist. The result of a bake does not depend on what was in `build/` before.
 */
export async function bakeAll(project: AssetProject): Promise<BakeResult[]> {
  const entries = findAssets(project);
  const results: BakeResult[] = [];
  for (const entry of entries) results.push(await bakeToDisk(project, entry));
  const root = join(project.outDir, "assets");
  for (const id of bakedIds(project)) {
    if (entries.some((entry) => entry.id === id)) continue;
    let folder = bakeDir(project, id);
    rmSync(folder, { recursive: true, force: true });
    // Folders of a pack that are empty now go too.
    for (folder = dirname(folder); folder !== root && readdirSync(folder).length === 0; folder = dirname(folder)) rmSync(folder, { recursive: true });
  }
  return results;
}

// ---------------------------------------------------------------------------------------
// Lint

/** What a lint run found. `report` is null when the asset could not even be loaded. */
export interface LintResult {
  readonly id: string;
  readonly report: LintReport | null;
  /** Why the asset could not be loaded, or null. */
  readonly error: string | null;
  /** The lint.json that was written, or null. */
  readonly file: string | null;
  /** True if there is no error: the asset loaded and no rule reported one. Warnings do not count. */
  readonly ok: boolean;
}

/** Options of `lintToDisk`. */
export interface LintToDiskOptions {
  /** False: check only, write no lint.json. */
  readonly write?: boolean;
}

/** Lints one asset and writes `build/review/<id>/lint.json` (the findings and the stats tables). */
export async function lintToDisk(project: AssetProject, entry: AssetEntry, options: LintToDiskOptions = {}): Promise<LintResult> {
  try {
    const source = sourceHash(entry);
    const asset = await loadEntry(entry);
    const report = lintAsset(asset);
    let file: string | null = null;
    if (options.write !== false) {
      file = join(reviewDir(project, entry.id), "lint.json");
      mkdirSync(dirname(file), { recursive: true });
      const { format, id, kind, size, pivot, paletteId, ...rest } = report;
      writeFileSync(file, formatJson({ format, id, kind, size, pivot, paletteId, sourceHash: source, ...rest }));
    }
    return { id: entry.id, report, error: null, file, ok: report.errors === 0 };
  } catch (error) {
    return { id: entry.id, report: null, error: message(error), file: null, ok: false };
  }
}

// ---------------------------------------------------------------------------------------
// Review

/** One review image on disk. */
export interface WrittenImage {
  /** The absolute path. */
  readonly path: string;
  readonly w: number;
  readonly h: number;
  /** The integer zoom of the pixel art in it. */
  readonly zoom: number;
  readonly about: string;
}

/**
 * What `reviewToDisk` and `reviewPackToDisk` did. `ok` is false when no image could be made.
 * `lint` is the lint run of the asset (null for a pack); `errors` lists the assets of a pack
 * that have an error row instead of images.
 */
export type ReviewResult =
  | {
      readonly id: string;
      readonly ok: true;
      readonly dir: string;
      readonly images: readonly WrittenImage[];
      readonly lint: LintResult | null;
      readonly errors: readonly { readonly id: string; readonly error: string }[];
    }
  | { readonly id: string; readonly ok: false; readonly dir: string; readonly error: string };

function writeImages(dir: string, images: readonly ReviewImage[]): WrittenImage[] {
  mkdirSync(dir, { recursive: true });
  // Pages of an older, longer sheet must not stay next to the new ones.
  for (const name of readdirSync(dir)) if (name.endsWith(".png")) rmSync(join(dir, name));
  return images.map(({ file, image, zoom, about }) => {
    const path = join(dir, file);
    writeFileSync(path, encodeRgbPng(image));
    return { path, w: image.w, h: image.h, zoom, about };
  });
}

/**
 * Writes the review set of one asset to `build/review/<id>/`: contact sheet, one strip per
 * clip, silhouettes, seeds, the in-context tile (see `reviewAsset`) and lint.json.
 */
export async function reviewToDisk(project: AssetProject, entry: AssetEntry, options: ReviewOptions = {}): Promise<ReviewResult> {
  const dir = reviewDir(project, entry.id);
  try {
    const asset = await loadEntry(entry);
    const images = writeImages(dir, reviewAsset(asset, options));
    return { id: entry.id, ok: true, dir, images, lint: await lintToDisk(project, entry), errors: [] };
  } catch (error) {
    return { id: entry.id, ok: false, dir, error: message(error) };
  }
}

/**
 * Writes the group sheet of a pack to `build/review/<pack>/pack.png` (`pack-1.png`, ... when
 * it needs several pages). An asset that cannot be loaded gets a row with its error.
 */
export async function reviewPackToDisk(project: AssetProject, pack: string, options: Pick<ReviewOptions, "zoom" | "maxEdge"> = {}): Promise<ReviewResult> {
  const dir = reviewDir(project, pack);
  const entries = findPack(project, pack);
  if (entries.length === 0) return { id: pack, ok: false, dir, error: `no assets in the pack ${JSON.stringify(pack)} under ${project.assetsDir}` };
  try {
    const rows: PackEntry[] = [];
    for (const entry of entries) {
      try {
        rows.push({ asset: await loadEntry(entry) });
      } catch (error) {
        rows.push({ id: entry.id, error: message(error) });
      }
    }
    const review = reviewPack(pack, rows, options);
    return { id: pack, ok: true, dir, images: writeImages(dir, review.images), lint: null, errors: review.errors };
  } catch (error) {
    return { id: pack, ok: false, dir, error: message(error) };
  }
}
