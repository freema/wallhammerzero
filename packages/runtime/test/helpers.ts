// What the tests share: the example asset baked to disk the way `asset bake` does it, read
// back by the runtime's own loader, and the hashes of the check scenes on the CPU backend.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bakeToDisk, findAsset, openProject } from "@whz/asset-kit/node";
import { EXAMPLE_ID, examplePalette, parityScenes } from "../dev/scenes.ts";
import type { Scene } from "../dev/scenes.ts";
import { createCpuBackend, pixelHash } from "../src/index.ts";
import type { Atlas, PaletteTable, Sheet } from "../src/index.ts";
import { readAtlas, readSheet } from "../src/node/index.ts";

export const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** The example asset, baked into a temporary folder. */
export interface BakedExample {
  /** The bake folder: atlas.json, seed-<seed>.png, frames/. */
  readonly dir: string;
  readonly atlas: Atlas;
  /** One sheet per variant, in atlas order. */
  readonly sheets: readonly Sheet[];
  /** Removes the temporary folder. */
  remove(): void;
}

/** Bakes the example asset with the asset kit's own `bakeToDisk` and reads it with `@whz/runtime/node`. */
export async function bakeExample(): Promise<BakedExample> {
  const out = mkdtempSync(join(tmpdir(), "whz-runtime-"));
  const project = openProject({ root: REPO, out });
  const result = await bakeToDisk(project, findAsset(project, EXAMPLE_ID));
  if (!result.ok) throw new Error(`the example asset does not bake: ${result.error}`);
  const atlas = readAtlas(result.dir);
  const sheets = atlas.variants.map((variant) => readSheet(result.dir, variant.seed));
  return { dir: result.dir, atlas, sheets, remove: () => rmSync(out, { recursive: true, force: true }) };
}

/** A scene drawn by the CPU backend: its RGBA pixels. */
export function drawOnCpu(scene: Scene, palette: PaletteTable): Uint8Array {
  const cpu = createCpuBackend();
  const target = cpu.createTarget(scene.width, scene.height);
  cpu.draw(target, scene.list, { palette, clear: scene.clear });
  return cpu.readPixels(target);
}

/** The pixel hash of every check scene on the CPU backend, by scene name. */
export function cpuHashes(example: Pick<BakedExample, "atlas" | "sheets">): Record<string, string> {
  const palette = examplePalette(example.atlas);
  const hashes: Record<string, string> = {};
  for (const scene of parityScenes(example.sheets)) {
    if (scene.name in hashes) throw new Error(`two scenes are named ${JSON.stringify(scene.name)}`);
    hashes[scene.name] = pixelHash(scene.width, scene.height, drawOnCpu(scene, palette));
  }
  return hashes;
}

/** The `format` value of test/golden/parity.json. */
export const PARITY_FORMAT = "wz.runtime-parity/1";
