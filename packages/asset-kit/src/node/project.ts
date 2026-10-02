// Where assets are on disk: finding the asset programs of a checkout, loading one, and the
// hash of its source files.
//
//   <root>/assets/<pack>/<name>/gen.ts      the program; its id is the folder, <pack>/<name>
//   <root>/assets/<pack>/<name>/stamps/     its stamp files
//   <root>/build/assets/<id>/               what `bake` writes
//   <root>/build/review/<id>/               what `review` and `lint` write

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { AnyAsset } from "../asset.ts";
import { loadAsset } from "./load.ts";

/** The file name of an asset program. */
export const GEN_FILE = "gen.ts";

/** Files in an asset's folder that are not its source: the studio's verdicts and notes. */
const NOT_SOURCE = (name: string): boolean => name === "review.json" || name.endsWith(".md");

/** The folders the asset commands read and write. All paths are absolute. */
export interface AssetProject {
  /** The checkout. */
  readonly root: string;
  /** The folder that holds the asset programs. */
  readonly assetsDir: string;
  /** The folder for build outputs. */
  readonly outDir: string;
}

/** Options of `openProject`. Relative paths are relative to `root`. */
export interface ProjectOptions {
  /** The current folder if not given. */
  readonly root?: string | undefined;
  /** `assets` if not given. */
  readonly assets?: string | undefined;
  /** `build` if not given. */
  readonly out?: string | undefined;
}

export function openProject(options: ProjectOptions = {}): AssetProject {
  const root = resolve(options.root ?? process.cwd());
  return { root, assetsDir: resolve(root, options.assets ?? "assets"), outDir: resolve(root, options.out ?? "build") };
}

/** One asset program found on disk. */
export interface AssetEntry {
  /** The folder under the assets folder, with `/` separators: what the program's `id` must be. */
  readonly id: string;
  /** The absolute path of the asset's folder. */
  readonly folder: string;
  /** The absolute path of its gen.ts. */
  readonly genFile: string;
}

/**
 * Every asset program under the assets folder, sorted by id. A folder with a gen.ts is an
 * asset; folders inside it belong to it and are not searched for more assets.
 */
export function findAssets(project: AssetProject): AssetEntry[] {
  const found: AssetEntry[] = [];
  const walk = (folder: string): void => {
    const entries = readdirSync(folder, { withFileTypes: true });
    if (folder !== project.assetsDir && entries.some((entry) => entry.isFile() && entry.name === GEN_FILE)) {
      found.push({ id: relative(project.assetsDir, folder).split(sep).join("/"), folder, genFile: join(folder, GEN_FILE) });
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") walk(join(folder, entry.name));
    }
  };
  if (existsSync(project.assetsDir)) walk(project.assetsDir);
  return found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The entry of one asset. Throws with the known ids if there is no such asset. */
export function findAsset(project: AssetProject, id: string): AssetEntry {
  const entries = findAssets(project);
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) {
    const known = entries.map((candidate) => candidate.id).join(", ") || "none";
    throw new Error(`no asset ${JSON.stringify(id)} under ${project.assetsDir} (assets: ${known})`);
  }
  return entry;
}

/** The assets of a pack: every asset whose id starts with `<pack>/`. */
export function findPack(project: AssetProject, pack: string): AssetEntry[] {
  return findAssets(project).filter((entry) => entry.id.startsWith(`${pack}/`));
}

function sourceFiles(folder: string, prefix = ""): string[] {
  return readdirSync(join(folder, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(folder, path);
      return entry.isFile() && !NOT_SOURCE(entry.name) ? [path] : [];
    })
    .sort();
}

/**
 * The source hash of an asset: 16 hex digits (the start of a SHA-256) over every file in its
 * folder, by path and content. `review.json` and Markdown notes are not source. It tells
 * whether the asset's own files changed; shared code and the palette are not in it (the
 * output hash and the palette hash of the atlas show their effect).
 */
export function sourceHash(entry: Pick<AssetEntry, "folder">): string {
  const hash = createHash("sha256");
  for (const path of sourceFiles(entry.folder)) {
    const content = readFileSync(join(entry.folder, path));
    hash.update(`${path}\0${content.length}\0`).update(content);
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * Loads the asset program of an entry, ready to render. Throws if the program's `id` is not
 * its folder.
 */
export async function loadEntry(entry: AssetEntry): Promise<AnyAsset> {
  const asset = await loadAsset(entry.genFile);
  if (asset.meta.id !== entry.id) {
    throw new Error(`asset program ${entry.genFile}: its id is ${JSON.stringify(asset.meta.id)}, but its folder says ${JSON.stringify(entry.id)}`);
  }
  return asset;
}
