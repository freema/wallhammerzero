// Where games are on disk: finding the games of a checkout, reading a game's folder, and the
// catalog of what lives outside a game (palettes, assets).
//
//   <root>/games/<id>/game.json            a game; its id is the name of its folder
//   <root>/games/<group>/<id>/game.json    ... also inside a grouping folder (games/examples/)
//   <root>/assets/palettes/<id>.json       the palettes
//   <root>/assets/<pack>/<name>/gen.ts     the asset programs
//   <root>/build/games/<id>/package/       what `pack` writes

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { GEN_FILE, loadEntry } from "@whz/asset-kit/node";
import type { Catalog, CatalogAsset } from "../index.ts";

/** The folders the game commands read and write. All paths are absolute. */
export interface GameProject {
  /** The checkout. */
  readonly root: string;
  /** The folder that holds the games. */
  readonly gamesDir: string;
  /** The folder that holds the asset programs and the palettes. */
  readonly assetsDir: string;
  /** The folder for build outputs. */
  readonly outDir: string;
}

/** Options of `openGameProject`. Relative paths are relative to `root`. */
export interface GameProjectOptions {
  /** The current folder if not given. */
  readonly root?: string | undefined;
  /** `games` if not given. */
  readonly games?: string | undefined;
  /** `assets` if not given. */
  readonly assets?: string | undefined;
  /** `build` if not given. */
  readonly out?: string | undefined;
}

export function openGameProject(options: GameProjectOptions = {}): GameProject {
  const root = resolve(options.root ?? process.cwd());
  return {
    root,
    gamesDir: resolve(root, options.games ?? "games"),
    assetsDir: resolve(root, options.assets ?? "assets"),
    outDir: resolve(root, options.out ?? "build"),
  };
}

/** One game found on disk. */
export interface GameEntry {
  /** The name of its folder: what the `id` in its game.json must be. */
  readonly id: string;
  /** The absolute path of the folder. */
  readonly folder: string;
  /** The folder as messages show it: relative to the checkout, with `/` (`games/examples/counter-shop`). */
  readonly dir: string;
}

const posix = (path: string): string => path.split(sep).join("/");

/** A path as messages show it: relative to the checkout when it is inside it. */
export function shownPath(project: Pick<GameProject, "root">, path: string): string {
  const rel = relative(project.root, path);
  return rel === "" || rel.startsWith("..") ? posix(path) : posix(rel);
}

/**
 * Every game under the games folder, sorted by id. A folder with a game.json is a game;
 * folders inside it belong to it. Throws if two games have the same id, because the id names
 * the game in commands, in build outputs and in saves.
 */
export function findGames(project: GameProject): GameEntry[] {
  const found: GameEntry[] = [];
  const walk = (folder: string): void => {
    const entries = readdirSync(folder, { withFileTypes: true });
    if (folder !== project.gamesDir && entries.some((entry) => entry.isFile() && entry.name === "game.json")) {
      found.push({ id: basename(folder), folder, dir: shownPath(project, folder) });
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") walk(join(folder, entry.name));
    }
  };
  if (existsSync(project.gamesDir)) walk(project.gamesDir);
  found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.dir < b.dir ? -1 : 1));
  for (let i = 1; i < found.length; i += 1) {
    const [a, b] = [found[i - 1] as GameEntry, found[i] as GameEntry];
    if (a.id === b.id) throw new Error(`two games have the id ${JSON.stringify(a.id)}: ${a.dir} and ${b.dir}`);
  }
  return found;
}

/** The entry of one game, by its id or by its folder. Throws with the known ids if there is no such game. */
export function findGame(project: GameProject, name: string): GameEntry {
  const games = findGames(project);
  const wanted = name.replace(/\/+$/, "");
  const entry = games.find((game) => game.id === wanted) ?? games.find((game) => game.dir === wanted || game.folder === resolve(project.root, wanted));
  if (entry === undefined) {
    const known = games.map((game) => game.id).join(", ") || "none";
    throw new Error(`no game ${JSON.stringify(name)} under ${shownPath(project, project.gamesDir)} (games: ${known})`);
  }
  return entry;
}

/** The files of a game's folder, ready for `analyseGame`. */
export interface GameFiles {
  /** Path inside the folder (with `/`) and text. Only JSON files are read; any other file is listed with empty text. */
  readonly files: Map<string, string>;
  /** Files that are not UTF-8 text or not regular files, and why. */
  readonly unreadable: Map<string, string>;
}

/** Reads a game's folder. Hidden files and folders (a leading dot) are not part of a game. */
export function readGameFiles(entry: Pick<GameEntry, "folder">): GameFiles {
  const files = new Map<string, string>();
  const unreadable = new Map<string, string>();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const walk = (prefix: string): void => {
    for (const item of readdirSync(join(entry.folder, prefix), { withFileTypes: true })) {
      if (item.name.startsWith(".")) continue;
      const path = prefix === "" ? item.name : `${prefix}/${item.name}`;
      if (item.isDirectory()) walk(path);
      else if (!item.isFile()) unreadable.set(path, "it is not a regular file");
      else if (!item.name.endsWith(".json")) files.set(path, "");
      else {
        try {
          files.set(path, decoder.decode(readFileSync(join(entry.folder, path))));
        } catch {
          unreadable.set(path, "it is not UTF-8 text");
        }
      }
    }
  };
  walk("");
  return { files, unreadable };
}

/** The ids of the palettes under `<assets>/palettes/`. */
export function findPalettes(project: GameProject): string[] {
  const folder = join(project.assetsDir, "palettes");
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort();
}

/** Where an asset program is, whether or not it exists. */
export function assetEntry(project: GameProject, id: string): { id: string; folder: string; genFile: string } {
  const folder = join(project.assetsDir, ...id.split("/"));
  return { id, folder, genFile: join(folder, GEN_FILE) };
}

/**
 * The catalog of a checkout: every palette, and the kind and clips of the assets named in
 * `assetIds` (an asset program is loaded only when a game refers to it). Sounds come with the
 * audio notes; until then no sound id resolves.
 */
export async function loadCatalog(project: GameProject, assetIds: readonly string[]): Promise<Catalog> {
  const assets = new Map<string, CatalogAsset>();
  for (const id of assetIds) {
    const entry = assetEntry(project, id);
    if (!existsSync(entry.genFile)) continue;
    try {
      const { meta } = await loadEntry(entry);
      assets.set(id, { kind: meta.kind, clips: meta.clips.map((clip) => clip.name), facings: meta.facings });
    } catch (error) {
      assets.set(id, { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { palettes: new Set(findPalettes(project)), assets, sounds: new Set<string>() };
}
