// Validate and pack on disk: the functions behind the `game` CLI. The studio calls the same
// functions, so a package built from the studio is byte for byte the package of the command
// line.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bakeAsset, paletteHash, parsePalette } from "@whz/asset-kit";
import type { Palette } from "@whz/asset-kit";
import { encodeIndexedPng, loadEntry, sourceHash } from "@whz/asset-kit/node";
import type { SystemDef } from "@whz/sim";
import {
  analyseGame,
  buildPackage,
  canonicalBytes,
  compareProblems,
  nodeValue,
  openPackage,
  PACKAGE_MANIFEST_FILE,
  parseJson,
  resolveGame,
} from "../index.ts";
import type { ExternalFile, GamePackage, PackageManifest, PresentationSlot, Problem, ValidationResult } from "../index.ts";
import { assetEntry, loadCatalog, readGameFiles, shownPath } from "./project.ts";
import type { GameEntry, GameProject } from "./project.ts";

/** What a host may swap: the engine registry and the presentation slots. Tests do; the CLI does not. */
export interface ValidateOptions {
  readonly systems?: readonly SystemDef[];
  readonly presentation?: readonly PresentationSlot[];
}

/** Validates the game in `entry.folder`: reads it, loads the assets it refers to, and resolves every id. */
export async function validateGameDir(project: GameProject, entry: GameEntry, options: ValidateOptions = {}): Promise<ValidationResult> {
  const { files, unreadable } = readGameFiles(entry);
  const analysis = analyseGame({ dir: entry.dir, files, unreadable, systems: options.systems, presentation: options.presentation });
  return resolveGame(analysis, await loadCatalog(project, analysis.assetIds));
}

/** The folder `pack` writes a game's package to. */
export function packageDir(project: GameProject, id: string): string {
  return join(project.outDir, "games", id, "package");
}

/** What a pack did. `files` are relative to `dir`, in ascending order. */
export type PackResult =
  | { readonly id: string; readonly ok: true; readonly dir: string; readonly manifest: PackageManifest; readonly files: readonly { path: string; bytes: number }[] }
  | { readonly id: string; readonly ok: false; readonly problems: readonly Problem[] };

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The files of a package that come from outside the game: the baked atlas and sheets of every
 * asset it refers to, and the palettes: the one game.json names and the palette of every one of
 * those assets (an asset is drawn with its own palette, which need not be the game's). The
 * per-frame PNGs of a bake are not packed: a player draws from the sheets.
 */
async function externalFiles(project: GameProject, game: { palettes: readonly string[]; assets: readonly string[] }, problems: Problem[]): Promise<ExternalFile[]> {
  const out: ExternalFile[] = [];
  const fail = (file: string, text: string): void => {
    problems.push({ file: shownPath(project, file), line: 0, col: 0, path: "", rule: "ref", message: text });
  };
  const paletteFile = (id: string): string => join(project.assetsDir, "palettes", `${id}.json`);
  const readPalette = (id: string): { value: unknown; palette: Palette } => {
    const value = nodeValue(parseJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(paletteFile(id)))));
    return { value, palette: parsePalette(value) };
  };

  /** The palettes to pack, and for the palette of an asset: the asset and the colours it was drawn with. */
  const palettes = new Map<string, { asset: string; genFile: string; hash: string } | null>(game.palettes.map((id) => [id, null]));
  for (const id of game.assets) {
    const entry = assetEntry(project, id);
    try {
      const asset = await loadEntry(entry);
      const baked = bakeAsset(asset, { sourceHash: sourceHash(entry) });
      const kind = (asset.meta.kind as string) === "font" ? "font" : "atlas";
      const colors = asset.palette.rgba();
      // The atlas goes through JSON once, so it is plain data in the form a reader will see.
      out.push({ path: `assets/${id}/atlas.json`, kind, bytes: canonicalBytes(JSON.parse(JSON.stringify(baked.atlas))) });
      baked.variants.forEach((variant, index) => {
        const sheet = (baked.atlas.variants[index] as { sheet: string }).sheet;
        out.push({ path: `assets/${id}/${sheet}`, kind, bytes: encodeIndexedPng(variant.sheet, colors) });
      });
      // The first asset that uses a palette stands for it in a message.
      if ((palettes.get(asset.palette.id) ?? null) === null) {
        palettes.set(asset.palette.id, { asset: id, genFile: entry.genFile, hash: paletteHash(asset.palette) });
      }
    } catch (error) {
      fail(entry.genFile, `the asset cannot be packed: ${message(error)}`);
    }
  }
  for (const id of [...palettes.keys()].sort()) {
    const user = palettes.get(id) ?? null;
    const file = paletteFile(id);
    if (user !== null && !existsSync(file)) {
      fail(user.genFile, `the asset "${user.asset}" is drawn with the palette "${id}", and ${shownPath(project, file)} does not exist: a package holds the palette of every asset`);
      continue;
    }
    try {
      const { value, palette } = readPalette(id);
      if (user !== null && paletteHash(palette) !== user.hash) {
        fail(user.genFile, `the asset "${user.asset}" is drawn with a palette "${id}" that is not ${shownPath(project, file)} (other slots or colours)`);
        continue;
      }
      out.push({ path: `palettes/${id}.json`, kind: "palette", bytes: canonicalBytes(value) });
    } catch (error) {
      fail(file, `the palette cannot be packed: ${message(error)}`);
    }
  }
  return out;
}

/** Every file under a package folder, by its path with `/`. */
export function readPackageDir(dir: string): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const walk = (prefix: string): void => {
    for (const item of readdirSync(join(dir, prefix), { withFileTypes: true })) {
      const path = prefix === "" ? item.name : `${prefix}/${item.name}`;
      if (item.isDirectory()) walk(path);
      else files.set(path, new Uint8Array(readFileSync(join(dir, path))));
    }
  };
  walk("");
  return files;
}

/**
 * Writes a package to a folder. The folder is emptied first and game.json is written last, so
 * a reader that finds a manifest finds complete files, and nothing of an older package stays.
 */
export function writePackageDir(dir: string, built: GamePackage): void {
  rmSync(dir, { recursive: true, force: true });
  const write = (path: string): void => {
    const file = join(dir, ...path.split("/"));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, built.files.get(path) as Uint8Array);
  };
  for (const path of built.files.keys()) if (path !== PACKAGE_MANIFEST_FILE) write(path);
  write(PACKAGE_MANIFEST_FILE);
}

/**
 * Validates a game and writes its package to `build/games/<id>/package/`. A game with a
 * problem writes nothing and leaves an older package alone. What was written is read back and
 * verified with `openPackage`.
 */
export async function packGame(project: GameProject, entry: GameEntry, options: ValidateOptions = {}): Promise<PackResult> {
  const { problems, game } = await validateGameDir(project, entry, options);
  if (game === null) return { id: entry.id, ok: false, problems };
  const late: Problem[] = [];
  const external = await externalFiles(project, game, late);
  if (late.length > 0) return { id: entry.id, ok: false, problems: late.sort(compareProblems) };

  const built = buildPackage(game, external);
  const dir = packageDir(project, entry.id);
  writePackageDir(dir, built);
  const check = openPackage(readPackageDir(dir));
  if (check.opened === null) throw new Error(`pack ${entry.id}: the package that was written does not verify: ${check.problems.join("; ")}`);
  return {
    id: entry.id,
    ok: true,
    dir,
    manifest: built.manifest,
    files: [...built.files].map(([path, bytes]) => ({ path, bytes: bytes.length })),
  };
}
