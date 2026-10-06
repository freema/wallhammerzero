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
 * folder has no node_modules, so the program imports the kit by its absolute path. `palette`
 * is the palette file it imports (default: the example palette of the repo).
 */
export function writeAsset(root: string, id: string, slot = "gold.1", palette = PALETTE): string {
  const dir = join(root, "assets", ...id.split("/"));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "gen.ts");
  writeFileSync(
    file,
    [
      `import { defineAsset, IndexedBuffer, parsePalette } from ${JSON.stringify(KIT)};`,
      `import paletteJson from ${JSON.stringify(palette)} with { type: "json" };`,
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

/** Writes `<root>/assets/<id>/gen.ts` whose render never returns: only the bake timeout ends it. */
export function writeHangingAsset(root: string, id: string): string {
  const dir = join(root, "assets", ...id.split("/"));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "gen.ts");
  writeFileSync(
    file,
    [
      `import { defineAsset, parsePalette } from ${JSON.stringify(KIT)};`,
      `import paletteJson from ${JSON.stringify(PALETTE)} with { type: "json" };`,
      `export default defineAsset({`,
      `  id: ${JSON.stringify(id)}, kind: "sprite", size: [6, 6], pivot: [3, 5], palette: parsePalette(paletteJson),`,
      `  clips: { idle: { frames: 1, durations: 500 } }, params: {}, variantSeeds: [1],`,
      `  render() { for (;;) { /* spins until the worker is terminated */ } },`,
      `});`,
      ``,
    ].join("\n"),
  );
  return file;
}

/**
 * Writes `<root>/assets/palettes/<id>.json`: the example palette under another id, with the
 * colour of `gold.1` set to `gold`. Returns the file.
 */
export function writePalette(root: string, id: string, gold = "#e8a43a"): string {
  const palette = JSON.parse(readFileSync(PALETTE, "utf8")) as { id: string; slots: { name: string; rgb: string }[] };
  palette.id = id;
  for (const slot of palette.slots) if (slot.name === "gold.1") slot.rgb = gold;
  const dir = join(root, "assets", "palettes");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.json`);
  writeFileSync(file, `${JSON.stringify(palette, null, 2)}\n`);
  return file;
}

/** Waits until `ready()` is true (it is asked every 20 ms). Throws with `what` after `ms`. */
export async function waitFor(what: string, ready: () => boolean, ms = 60_000): Promise<void> {
  const until = performance.now() + ms;
  while (!ready()) {
    if (performance.now() > until) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((done) => setTimeout(done, 20));
  }
}
