// Reads what `asset bake` wrote for one asset (docs/asset-pipeline.md): atlas.json and the
// indexed PNG sheet of a variant.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findVariant, parseAtlas } from "../atlas.ts";
import type { Atlas } from "../atlas.ts";
import { sheetFromPng } from "../sheet.ts";
import type { Sheet } from "../sheet.ts";

/** The atlas in a bake folder (`build/assets/<id>/`). */
export function readAtlas(dir: string): Atlas {
  const file = join(dir, "atlas.json");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(`${file} cannot be read; bake the asset first (./dev npm run asset -- bake <id>): ${(error as Error).message}`, { cause: error });
  }
  try {
    return parseAtlas(JSON.parse(text));
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`, { cause: error });
  }
}

/** The sheet of one variant of a bake folder; without a seed, the first variant. */
export function readSheet(dir: string, seed?: number): Sheet {
  const atlas = readAtlas(dir);
  const variant = findVariant(atlas, seed);
  const file = join(dir, variant.sheet);
  try {
    return sheetFromPng(atlas, readFileSync(file), variant.seed);
  } catch (error) {
    throw new Error(`${file}: ${(error as Error).message}`, { cause: error });
  }
}
