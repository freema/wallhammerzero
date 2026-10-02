// Shared by the studio's server tests: the fixture folders, temp checkouts, and asset programs
// written on the fly.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The fixture assets: `shapes/square` and `ground/floor` bake, `shapes/broken` throws in render. */
export const FIXTURE_ASSETS = fileURLToPath(new URL("./fixtures/assets/", import.meta.url));
/** The hang fixture: `loops/forever` never returns; `loops/a-before` and `loops/z-after` are fine. */
export const HANG_ASSETS = fileURLToPath(new URL("./fixtures/hang/assets/", import.meta.url));

const KIT = fileURLToPath(new URL("../../asset-kit/src/index.ts", import.meta.url));
const PALETTE = fileURLToPath(new URL("../../../assets/palettes/example.json", import.meta.url));

const temps: string[] = [];

/** A new empty folder that stands for a checkout. Remove them all with `removeTemps()` in afterAll. */
export function tempRoot(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `whz-studio-${name}-`));
  temps.push(dir);
  return dir;
}

export function removeTemps(): void {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/**
 * Writes `<root>/assets/<id>/gen.ts`: a one-frame 6 x 6 sprite filled with `slot`. A temp
 * folder has no node_modules, so the program imports the kit by its absolute path.
 */
export function writeAsset(root: string, id: string, slot = "gold.1"): string {
  const dir = join(root, "assets", ...id.split("/"));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "gen.ts");
  writeFileSync(
    file,
    [
      `import { defineAsset, IndexedBuffer, parsePalette } from ${JSON.stringify(KIT)};`,
      `import paletteJson from ${JSON.stringify(PALETTE)} with { type: "json" };`,
      `const palette = parsePalette(paletteJson);`,
      `export default defineAsset({`,
      `  id: ${JSON.stringify(id)}, kind: "sprite", size: [6, 6], pivot: [3, 5], palette,`,
      `  clips: { idle: { frames: 1, durations: 500 } }, params: {}, variantSeeds: [1],`,
      `  render: () => new IndexedBuffer(6, 6).fill(1, 1, 4, 4, palette.slot(${JSON.stringify(slot)})),`,
      `});`,
      ``,
    ].join("\n"),
  );
  return file;
}

/** Every file under a folder with its content, as `relative path -> hex`. */
export function snapshot(folder: string, prefix = ""): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(join(folder, prefix), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, snapshot(folder, path));
    else files[path] = readFileSync(join(folder, path)).toString("hex");
  }
  return files;
}
