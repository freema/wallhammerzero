// @whz/asset-kit/node: the file side of the kit, for Node only (the bake CLI, the studio
// server, tests). Asset programs never import this: they stay pure, and their files are
// handed to them.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAsset } from "../asset.ts";
import type { AnyAsset } from "../asset.ts";
import { parsePalette } from "../palette.ts";
import type { Palette } from "../palette.ts";

function toPath(file: string | URL): string {
  return resolve(file instanceof URL ? fileURLToPath(file) : file);
}

/** Reads and validates a palette file (assets/palettes/<id>.json). */
export function loadPaletteFile(file: string | URL): Palette {
  const path = toPath(file);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`palette file ${path}: ${(error as Error).message}`, { cause: error });
  }
  return parsePalette(json);
}

/**
 * The text of an asset's stamp files: `names` are read from stamps/<name>.txt in the folder
 * of the generator.
 */
export function readStampFiles(genFile: string | URL, names: readonly string[]): Record<string, string> {
  const folder = join(dirname(toPath(genFile)), "stamps");
  const texts: Record<string, string> = {};
  for (const name of names) {
    const path = join(folder, `${name}.txt`);
    try {
      texts[name] = readFileSync(path, "utf8");
    } catch (error) {
      throw new Error(`stamp file ${path}: ${(error as Error).message}`, { cause: error });
    }
  }
  return texts;
}

/**
 * Loads an asset program (a gen.ts whose default export is `defineAsset(...)`) and gives it
 * the text of its stamp files, so it is ready to render.
 */
export async function loadAsset(genFile: string | URL): Promise<AnyAsset> {
  const path = toPath(genFile);
  const module = (await import(/* @vite-ignore */ pathToFileURL(path).href)) as { default?: unknown };
  const asset = module.default;
  if (!isAsset(asset)) {
    throw new Error(`asset program ${path}: the default export must be defineAsset({ ... })`);
  }
  return asset.stampFiles.length === 0 ? asset : asset.withStamps(readStampFiles(path, asset.stampFiles));
}
