// Preset previews: one sheet per preset of an asset, so the player can show the presets next
// to the variant seeds.
//
// The bake of @whz/asset-kit renders the variant seeds with the default params; presets are
// only named in the atlas. The studio's bake worker renders them too, right after the asset's
// own bake, with the asset's first variant seed (what `asset lint` checks a preset with):
//
//   build/studio/presets/<id>/<preset>.png    the sheet, in the layout of the atlas's sheets
//   build/studio/presets/<id>/presets.json    what is there, and which bake it belongs to
//
// The folder is the studio's own, outside `build/assets/`: the output of `asset bake` stays
// byte for byte what the command line writes. A sheet has the layout of the asset's atlas, so
// the runtime reads it with that atlas. presets.json is written last and names the source
// hash and the palette hash of the bake it was made with: the index shows the previews only
// while they match the atlas on disk.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { buildSheet, formatJson, layoutSheet, outputHash, renderAll } from "@whz/asset-kit";
import type { Atlas } from "@whz/asset-kit";
import { bakeDir, encodeIndexedPng, loadEntry } from "@whz/asset-kit/node";
import type { AssetEntry, AssetProject } from "@whz/asset-kit/node";

/** The `format` value of presets.json. */
export const PRESETS_FORMAT = "wz.studio-presets/1";

/** The content of presets.json. */
export interface PresetsFile {
  readonly format: typeof PRESETS_FORMAT;
  readonly id: string;
  /** The source hash and the palette hash of the atlas the previews were rendered next to. */
  readonly sourceHash: string;
  readonly paletteHash: string;
  /** The seed every preset was rendered with: the asset's first variant seed. */
  readonly seed: number;
  /** One entry per preset, in the asset's order. Empty when `error` is set. */
  readonly presets: readonly { readonly name: string; readonly sheet: string; readonly outputHash: string }[];
  /** Why the presets could not be rendered, else null. */
  readonly error: string | null;
}

const posix = (path: string): string => path.split(sep).join("/");

/** The folder of all preset previews. */
const presetsRoot = (project: AssetProject): string => join(project.outDir, "studio", "presets");

/** The folder of the preset previews of one asset. */
export function presetsDir(project: AssetProject, id: string): string {
  return join(presetsRoot(project), ...id.split("/"));
}

/**
 * Renders every preset of an asset and writes the sheets, for the bake whose atlas is given.
 * An asset without presets gets no folder. A preset that cannot be rendered leaves a
 * presets.json with the error and no sheets; it never throws for that.
 */
export async function bakePresetsToDisk(project: AssetProject, entry: AssetEntry, atlas: Pick<Atlas, "sourceHash" | "palette">): Promise<void> {
  const dir = presetsDir(project, entry.id);
  rmSync(dir, { recursive: true, force: true });
  const base = { format: PRESETS_FORMAT, id: entry.id, sourceHash: atlas.sourceHash, paletteHash: atlas.palette.hash } as const;
  const write = (content: PresetsFile): void => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "presets.json"), formatJson(content));
  };
  let seed = 0;
  try {
    const asset = await loadEntry(entry);
    const names = Object.keys(asset.presets);
    if (names.length === 0) return;
    seed = asset.variantSeeds[0] as number;
    const layout = layoutSheet(asset.meta);
    const colors = asset.palette.rgba();
    mkdirSync(dir, { recursive: true });
    const presets = names.map((name) => {
      const output = renderAll(asset, { seed, preset: name });
      writeFileSync(join(dir, `${name}.png`), encodeIndexedPng(buildSheet(output, layout), colors));
      return { name, sheet: `${name}.png`, outputHash: outputHash(output) };
    });
    write({ ...base, seed, presets, error: null });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    write({ ...base, seed, presets: [], error: error instanceof Error ? error.message : String(error) });
  }
}

/** What the index shows of an asset's preset previews. Paths are relative to the checkout. */
export interface PresetPreviews {
  readonly seed: number;
  readonly presets: readonly { readonly name: string; readonly sheet: string; readonly outputHash: string }[];
  readonly error: string | null;
}

/**
 * The preset previews on disk that belong to the given atlas, or null: none were rendered, or
 * they are from another bake (the asset was baked by the command line since).
 */
export function readPresets(project: AssetProject, id: string, atlas: Pick<Atlas, "sourceHash" | "palette">): PresetPreviews | null {
  const dir = presetsDir(project, id);
  let file: Partial<PresetsFile>;
  try {
    file = JSON.parse(readFileSync(join(dir, "presets.json"), "utf8")) as Partial<PresetsFile>;
  } catch {
    return null; // not there, or being written right now
  }
  if (file.format !== PRESETS_FORMAT || file.sourceHash !== atlas.sourceHash || file.paletteHash !== atlas.palette.hash || !Array.isArray(file.presets)) return null;
  const relDir = posix(relative(project.root, dir));
  return {
    seed: typeof file.seed === "number" ? file.seed : 0,
    presets: file.presets.map((preset) => ({ name: String(preset.name), sheet: `${relDir}/${String(preset.sheet)}`, outputHash: String(preset.outputHash) })),
    error: typeof file.error === "string" ? file.error : null,
  };
}

/**
 * Removes the preset previews of assets that have no atlas (the asset is gone, or its last
 * bake failed), and the folders that are empty after that. Returns the ids it removed.
 */
export function prunePresets(project: AssetProject): string[] {
  const root = presetsRoot(project);
  const removed: string[] = [];
  const walk = (folder: string): void => {
    const entries = readdirSync(folder, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile())) {
      const id = posix(relative(root, folder));
      if (existsSync(join(bakeDir(project, id), "atlas.json"))) return;
      rmSync(folder, { recursive: true, force: true });
      removed.push(id);
      for (let parent = dirname(folder); parent !== root && readdirSync(parent).length === 0; parent = dirname(parent)) rmSync(parent, { recursive: true });
      return;
    }
    for (const entry of entries) if (entry.isDirectory()) walk(join(folder, entry.name));
  };
  if (existsSync(root)) walk(root);
  return removed.sort();
}
