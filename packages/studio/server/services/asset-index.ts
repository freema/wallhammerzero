// The asset index: what the studio knows about every asset, kept in memory and read by the
// loaders. It is built from two places on disk and never runs an asset program:
//
//   assets/<pack>/<name>/gen.ts          an asset exists, and its source hash
//   build/assets/<id>/atlas.json         what the last bake drew (kind, size, clips, variants)
//   build/assets/<id>/error.json         ... or why the last bake failed
//   assets/palettes/<id>.json            the names of the palette's slots
//   build/studio/presets/<id>/           the studio's preset previews (presets.ts)
//
// A copy is written to `.studio-cache/index.json` (gitignored) for tools that want the same
// view without the server. The index is derived data: delete the cache and it comes back.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ATLAS_FORMAT, formatJson, paletteHash } from "@whz/asset-kit";
import type { Atlas } from "@whz/asset-kit";
import { BAKE_ERROR_FORMAT, bakeDir, findAssets, loadPaletteFile, sourceHash } from "@whz/asset-kit/node";
import type { AssetEntry, AssetProject } from "@whz/asset-kit/node";
import { readPresets } from "./presets.ts";
import { readReview, reviewState } from "./reviews.ts";
import type { ReviewState } from "./reviews.ts";

/** The `format` value of `.studio-cache/index.json`. */
export const INDEX_FORMAT = "wz.studio-index/1";

/**
 * - `baked`: an atlas exists and was baked from the current source files;
 * - `stale`: an atlas exists, but the asset's source files changed since;
 * - `error`: the last bake failed (the message is in `error`);
 * - `unbaked`: no output yet.
 */
export type AssetStatus = "baked" | "stale" | "error" | "unbaked";
export const ASSET_STATUSES: readonly AssetStatus[] = ["baked", "stale", "error", "unbaked"];

/** One clip, as the atlas has it. */
export interface IndexedClip {
  readonly name: string;
  readonly frames: number;
  /** Milliseconds per frame. */
  readonly durations: readonly number[];
  readonly loop: boolean;
}

/** One baked variant. */
export interface IndexedVariant {
  readonly seed: number;
  /** The identity of what was drawn (see `outputHash` in @whz/asset-kit). */
  readonly outputHash: string;
  /** The sheet PNG, as a path relative to the checkout (what `/api/files/` takes). */
  readonly sheet: string;
  /** The first frame's PNG, relative to the checkout. */
  readonly firstFrame: string;
}

/** One preset preview: the preset rendered with the asset's first variant seed (presets.ts). */
export interface IndexedPreset {
  readonly name: string;
  readonly outputHash: string;
  /** The sheet PNG, relative to the checkout. It has the layout of the atlas's sheets. */
  readonly sheet: string;
}

/** Everything the index keeps about one asset. Plain data: loaders hand it to the client as it is. */
export interface AssetRecord {
  /** `<pack>/<name>`: the folder under the assets folder. */
  readonly id: string;
  /** The first segment of the id. */
  readonly pack: string;
  /** The rest of the id. */
  readonly name: string;
  readonly status: AssetStatus;
  /** The bake error (or why the output cannot be read), else null. */
  readonly error: string | null;
  /** The hash of the asset's source files now. */
  readonly sourceHash: string;
  /** The source hash the output on disk was made from, or null without output. */
  readonly bakedSourceHash: string | null;
  /**
   * One hash for the whole output: over the seeds and output hashes of all variants. It
   * changes exactly when a drawn pixel, the frame layout or the set of variants changes.
   */
  readonly outputHash: string | null;
  /** The asset program, relative to the checkout. */
  readonly genFile: string;
  /** The output folder, relative to the checkout. */
  readonly bakeDir: string;
  /** The rest is from the atlas and null (or empty) without one. */
  readonly kind: string | null;
  readonly size: readonly [w: number, h: number] | null;
  readonly pivot: readonly [x: number, y: number] | null;
  /**
   * The palette the output was baked with. `names` are the slot names from the palette file,
   * or null when the file is not the palette of the bake any more (or cannot be read).
   */
  readonly palette: { readonly id: string; readonly hash: string; readonly colors: readonly string[]; readonly names: readonly string[] | null } | null;
  readonly sheet: { readonly w: number; readonly h: number; readonly columns: number; readonly rows: number; readonly padding: number } | null;
  readonly frameCount: number;
  readonly clips: readonly IndexedClip[];
  readonly facings: readonly string[];
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly presets: readonly string[];
  readonly reviewSeeds: readonly number[];
  readonly variants: readonly IndexedVariant[];
  /** The preset previews that belong to this bake. Empty until the studio itself baked the asset. */
  readonly presetVariants: readonly IndexedPreset[];
  /** Why the presets could not be rendered, else null. */
  readonly presetError: string | null;
  /** The owner's verdicts (reviews.ts): the last one, and whether the output changed since. */
  readonly review: ReviewState;
}

/** The content of `.studio-cache/index.json`. */
export interface IndexFile {
  readonly format: typeof INDEX_FORMAT;
  /** The folders the index was built from, relative to the checkout. */
  readonly assetsDir: string;
  readonly outDir: string;
  readonly assets: readonly AssetRecord[];
}

/** What one scan changed. Ids are sorted. */
export interface IndexChange {
  /** The revision of the index after the scan. */
  readonly revision: number;
  /** The records that are new or differ from the scan before (new ones are also in `added`). */
  readonly changed: readonly AssetRecord[];
  /** Ids that were not in the index before. */
  readonly added: readonly string[];
  /** Ids that are gone. */
  readonly removed: readonly string[];
}

/** The index as the rest of the server sees it. */
export interface AssetIndex {
  /** Reads the disk again, replaces the records and writes the cache file if they changed. */
  scan(): readonly AssetRecord[];
  /** `scan()` if the last scan is older than `maxAgeMs`; the records either way. */
  refresh(maxAgeMs?: number): readonly AssetRecord[];
  /** The records of the last scan, sorted by id. */
  all(): readonly AssetRecord[];
  get(id: string): AssetRecord | undefined;
  /**
   * A number that grows whenever a scan finds the records changed (0 before the first scan).
   * Loaders hand it to the page with the records, and events carry it, so a page can tell which
   * of two views of an asset is the newer one.
   */
  readonly revision: number;
  /** Calls `listener` after every scan that changed a record. Returns the function that stops it. */
  onChange(listener: (change: IndexChange) => void): () => void;
  /** The absolute path of the cache file. */
  readonly file: string;
}

const posix = (path: string): string => path.split(sep).join("/");

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return JSON.parse(text) as unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** One hash over all variants of an asset. */
function combinedHash(variants: readonly { seed: number; outputHash: string }[]): string {
  const hash = createHash("sha256");
  for (const variant of variants) hash.update(`${variant.seed}:${variant.outputHash}\n`);
  return hash.digest("hex").slice(0, 16);
}

const EMPTY = {
  outputHash: null,
  kind: null,
  size: null,
  pivot: null,
  palette: null,
  sheet: null,
  frameCount: 0,
  clips: [],
  facings: [],
  params: {},
  presets: [],
  reviewSeeds: [],
  variants: [],
  presetVariants: [],
  presetError: null,
} as const;

/**
 * The slot names of the palette a bake used: read from the palette file, and only if that
 * file still has the hash the atlas names (the hash covers names and colours).
 */
function slotNames(project: AssetProject, id: string, hash: string): string[] | null {
  try {
    const palette = loadPaletteFile(join(project.assetsDir, "palettes", `${id}.json`));
    return paletteHash(palette) === hash ? palette.slots.map((slot) => slot.name) : null;
  } catch {
    return null;
  }
}

/** The record of one asset: its source hash, and what its output folder says. */
export function readRecord(project: AssetProject, entry: AssetEntry): AssetRecord {
  const dir = bakeDir(project, entry.id);
  const relDir = posix(relative(project.root, dir));
  const slash = entry.id.indexOf("/");
  const base = {
    id: entry.id,
    pack: slash < 0 ? entry.id : entry.id.slice(0, slash),
    name: slash < 0 ? entry.id : entry.id.slice(slash + 1),
    genFile: posix(relative(project.root, entry.genFile)),
    bakeDir: relDir,
  };
  const review = readReview(entry);
  let source: string;
  try {
    source = sourceHash(entry);
  } catch (error) {
    return { ...base, ...EMPTY, status: "error", error: `cannot read the asset's files: ${(error as Error).message}`, sourceHash: "", bakedSourceHash: null, review: reviewState(review, null) };
  }
  const failed = (message: string, bakedSourceHash: string | null = null): AssetRecord => ({
    ...base,
    ...EMPTY,
    status: "error",
    error: message,
    sourceHash: source,
    bakedSourceHash,
    review: reviewState(review, null),
  });

  try {
    const atlas = readJson(join(dir, "atlas.json"));
    if (atlas === undefined) {
      const error = readJson(join(dir, "error.json"));
      if (error === undefined) return { ...base, ...EMPTY, status: "unbaked", error: null, sourceHash: source, bakedSourceHash: null, review: reviewState(review, null) };
      if (!isRecord(error) || error["format"] !== BAKE_ERROR_FORMAT) return failed(`${relDir}/error.json is not a ${BAKE_ERROR_FORMAT} file`);
      return failed(String(error["message"] ?? "the bake failed"), typeof error["sourceHash"] === "string" ? error["sourceHash"] : null);
    }
    if (!isRecord(atlas) || atlas["format"] !== ATLAS_FORMAT) return failed(`${relDir}/atlas.json is not a ${ATLAS_FORMAT} file`);
    const baked = atlas as unknown as Atlas;
    const first = baked.frames[0];
    const variants = baked.variants.map((variant) => ({
      seed: variant.seed,
      outputHash: variant.outputHash,
      sheet: `${relDir}/${variant.sheet}`,
      firstFrame: first === undefined ? `${relDir}/${variant.sheet}` : `${relDir}/${variant.frames}/${first.file}`,
    }));
    const previews = readPresets(project, entry.id, baked);
    return {
      ...base,
      status: baked.sourceHash === source ? "baked" : "stale",
      error: null,
      sourceHash: source,
      bakedSourceHash: baked.sourceHash,
      outputHash: combinedHash(variants),
      kind: baked.kind,
      size: [baked.size[0], baked.size[1]],
      pivot: [baked.pivot[0], baked.pivot[1]],
      palette: { id: baked.palette.id, hash: baked.palette.hash, colors: [...baked.palette.colors], names: slotNames(project, baked.palette.id, baked.palette.hash) },
      sheet: { w: baked.sheet.w, h: baked.sheet.h, columns: baked.sheet.columns, rows: baked.sheet.rows, padding: baked.sheet.padding },
      frameCount: baked.frames.length,
      clips: baked.clips.map((clip) => ({ name: clip.name, frames: clip.frames, durations: [...clip.durations], loop: clip.loop })),
      facings: [...baked.facings],
      params: { ...baked.params },
      presets: [...baked.presets],
      reviewSeeds: [...baked.reviewSeeds],
      variants,
      presetVariants: previews === null ? [] : previews.presets,
      presetError: previews?.error ?? null,
      review: reviewState(review, combinedHash(variants)),
    };
  } catch (error) {
    // A file that is being written right now, or one that something else left there.
    return failed(`cannot read the output in ${relDir}: ${(error as Error).message}`);
  }
}

/** True if the output of the asset is not what its current source would give: bake it. */
export function needsBake(record: AssetRecord): boolean {
  return record.status === "unbaked" || record.status === "stale" || (record.status === "error" && record.bakedSourceHash !== record.sourceHash);
}

/** Opens the index of a project. Nothing is read until the first `scan()` or `refresh()`. */
export function createAssetIndex(project: AssetProject, cacheDir: string): AssetIndex {
  const file = join(cacheDir, "index.json");
  let records: readonly AssetRecord[] = [];
  let byId = new Map<string, AssetRecord>();
  let scannedAt = Number.NEGATIVE_INFINITY;
  let written: string | null = null;
  let revision = 0;
  /** Each record as JSON text: how a scan tells a changed record from an unchanged one. */
  let texts = new Map<string, string>();
  const listeners = new Set<(change: IndexChange) => void>();

  const scan = (): readonly AssetRecord[] => {
    const next = findAssets(project).map((entry) => readRecord(project, entry));
    const nextTexts = new Map(next.map((record) => [record.id, JSON.stringify(record)]));
    const changed = next.filter((record) => texts.get(record.id) !== nextTexts.get(record.id));
    const added = changed.filter((record) => !texts.has(record.id)).map((record) => record.id);
    const removed = [...texts.keys()].filter((id) => !nextTexts.has(id)).sort();
    // An unchanged record keeps its object, so `get(id)` is stable between scans.
    records = next.map((record) => (changed.includes(record) ? record : (byId.get(record.id) ?? record)));
    byId = new Map(records.map((record) => [record.id, record]));
    texts = nextTexts;
    scannedAt = performance.now();
    const differs = changed.length > 0 || removed.length > 0;
    if (differs) revision += 1;
    const content: IndexFile = {
      format: INDEX_FORMAT,
      assetsDir: posix(relative(project.root, project.assetsDir)),
      outDir: posix(relative(project.root, project.outDir)),
      assets: records,
    };
    const text = formatJson(content);
    if (text !== written) {
      // Temp file + rename: a reader never sees half a file.
      mkdirSync(cacheDir, { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, text);
      renameSync(temp, file);
      written = text;
    }
    if (differs) {
      const change: IndexChange = { revision, changed, added, removed };
      for (const listener of [...listeners]) listener(change);
    }
    return records;
  };

  return {
    file,
    scan,
    refresh: (maxAgeMs = 1000) => (performance.now() - scannedAt > maxAgeMs ? scan() : records),
    all: () => records,
    get: (id) => byId.get(id),
    get revision() {
      return revision;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
