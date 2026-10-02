// Where audio is on disk.
//
//   <root>/audio/<pack>/music/<name>.song.json     a song or a jingle
//   <root>/audio/<pack>/sfx/<name>.sfx.json        a sound effect
//   <root>/audio/<pack>/.../<name>.render.json     the sidecar `render` writes next to each
//   <root>/build/audio/<pack>/<music|sfx>/<name>/  what `render` writes: WAV files and pictures
//
// The path id of a file is `<pack>/music/<name>` or `<pack>/sfx/<name>`. The `id` inside the
// file (`bgm.shop.day`) is what a game refers to; both find the file on the command line.

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export const SONG_SUFFIX = ".song.json";
export const SFX_SUFFIX = ".sfx.json";
export const SIDECAR_SUFFIX = ".render.json";

/** The folders the audio commands read and write. All paths are absolute. */
export interface AudioProject {
  readonly root: string;
  readonly audioDir: string;
  readonly outDir: string;
}

/** Options of `openProject`. Relative paths are relative to `root`. */
export interface ProjectOptions {
  /** The current folder if not given. */
  readonly root?: string | undefined;
  /** `audio` if not given. */
  readonly audio?: string | undefined;
  /** `build` if not given. */
  readonly out?: string | undefined;
}

export function openProject(options: ProjectOptions = {}): AudioProject {
  const root = resolve(options.root ?? process.cwd());
  return { root, audioDir: resolve(root, options.audio ?? "audio"), outDir: resolve(root, options.out ?? "build") };
}

/** One song or SFX file found on disk. */
export interface AudioEntry {
  readonly kind: "song" | "sfx";
  readonly pack: string;
  /** The file name without its suffix. */
  readonly name: string;
  /** `<pack>/music/<name>` or `<pack>/sfx/<name>`. */
  readonly pathId: string;
  /** The absolute path of the file. */
  readonly file: string;
  /** The absolute path of its sidecar (which may not exist yet). */
  readonly sidecar: string;
}

function folders(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
    .map((entry) => entry.name)
    .sort();
}

function files(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort();
}

/** Every song and SFX under the audio folder, sorted by path id. */
export function findEntries(project: AudioProject): AudioEntry[] {
  const found: AudioEntry[] = [];
  if (!existsSync(project.audioDir)) return found;
  for (const pack of folders(project.audioDir)) {
    for (const [folder, suffix, kind] of [
      ["music", SONG_SUFFIX, "song"],
      ["sfx", SFX_SUFFIX, "sfx"],
    ] as const) {
      const dir = join(project.audioDir, pack, folder);
      for (const fileName of files(dir, suffix)) {
        const name = fileName.slice(0, -suffix.length);
        found.push({ kind, pack, name, pathId: `${pack}/${folder}/${name}`, file: join(dir, fileName), sidecar: join(dir, `${name}${SIDECAR_SUFFIX}`) });
      }
    }
  }
  return found.sort((a, b) => (a.pathId < b.pathId ? -1 : a.pathId > b.pathId ? 1 : 0));
}

/**
 * Song and SFX files that are not where the layout wants them (a song outside a `music`
 * folder, a file one level too deep), as paths relative to the audio folder. `check --all`
 * reports them, so a misplaced file is not silently left out of the gate.
 */
export function findStrays(project: AudioProject): string[] {
  const strays: string[] = [];
  const walk = (dir: string, parts: readonly string[]): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") walk(join(dir, entry.name), [...parts, entry.name]);
        continue;
      }
      const song = entry.name.endsWith(SONG_SUFFIX);
      const sfx = entry.name.endsWith(SFX_SUFFIX);
      if (!song && !sfx) continue;
      const placed = parts.length === 2 && parts[1] === (song ? "music" : "sfx");
      if (!placed) strays.push([...parts, entry.name].join("/"));
    }
  };
  if (existsSync(project.audioDir)) walk(project.audioDir, []);
  return strays.sort();
}

/** The folder `render` writes an entry's WAV files and pictures to. */
export function renderDir(project: AudioProject, entry: Pick<AudioEntry, "pathId">): string {
  return join(project.outDir, "audio", ...entry.pathId.split("/"));
}
