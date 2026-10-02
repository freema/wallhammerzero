// Check and render on disk: the functions behind the `audio` command. The studio can call the
// same functions, so its numbers are the numbers of the command line.
//
// Nothing here throws for a broken song: a file that cannot be read or has errors comes back
// as findings.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { formatJson } from "@whz/asset-kit";
import { encodeRgbPng } from "@whz/asset-kit/node";
import { drawPianoRoll, drawSpectrogram, measure, metricFindings, MUSIC_TARGET_LUFS, sfxRoll, songRoll, toMono, trimDb } from "../analysis/index.ts";
import type { Metrics } from "../analysis/index.ts";
import { formatFinding } from "../findings.ts";
import type { Finding } from "../findings.ts";
import { checkSongText, songStats } from "../lint.ts";
import type { SongStats } from "../lint.ts";
import { DEFAULT_SAMPLE_RATE } from "../player.ts";
import type { StereoBuffer } from "../player.ts";
import { mixState, monoHash, renderSong, stereoHash, toPcm16 } from "../render.ts";
import type { RenderPass, SongRender } from "../render.ts";
import { readSfxText, renderSfx } from "../sfx.ts";
import type { Sfx, SfxRender } from "../sfx.ts";
import type { Song } from "../song.ts";
import { encodeWav } from "../wav.ts";
import { renderDir } from "./project.ts";
import type { AudioEntry, AudioProject } from "./project.ts";

export const SIDECAR_FORMAT = "wz.audio-render/0.1";

/** A song or SFX file, read and validated. */
export interface Loaded {
  readonly entry: AudioEntry;
  /** The song, if the file is a song without errors. */
  readonly song: Song | null;
  /** The SFX, if the file is an SFX without errors. */
  readonly sfx: Sfx | null;
  /** Everything the parser and the validators found. */
  readonly findings: readonly Finding[];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads and validates one file. */
export function loadEntry(entry: AudioEntry): Loaded {
  let text: string;
  try {
    text = readFileSync(entry.file, "utf8");
  } catch (error) {
    return { entry, song: null, sfx: null, findings: [{ severity: "error", rule: "parse", path: "", message: `cannot read the file: ${message(error)}` }] };
  }
  if (entry.kind === "song") {
    const { song, findings } = checkSongText(text);
    return { entry, song, sfx: null, findings };
  }
  const { sfx, findings } = readSfxText(text);
  return { entry, song: null, sfx, findings };
}

/** The numbers of one state of a song. */
export interface StateSidecar {
  readonly state: string;
  readonly hash: string;
  readonly lufsI: number | null;
  readonly dBTP: number | null;
  readonly trimDb: number;
}

/**
 * The sidecar: `<name>.render.json` next to a song or SFX. `render` writes it and nobody
 * edits it. Its `hash` is the golden hash of the PCM; `check` renders again and compares.
 */
export interface Sidecar extends Metrics {
  readonly format: typeof SIDECAR_FORMAT;
  readonly id: string;
  readonly kind: "song" | "sfx";
  /** The file name of the song or SFX it belongs to. */
  readonly source: string;
  readonly sampleRate: number;
  readonly frames: number;
  /** Songs: true if the render is a loop (its end runs into its start). */
  readonly loop?: boolean;
  /** FNV-1a 64 over the 16-bit PCM (see `pcmHash`). */
  readonly hash: string;
  /** The gain a player applies to reach the house level. */
  readonly trimDb: number;
  /** Songs: the hash of every stem, in channel order. */
  readonly stems?: readonly { readonly channel: string; readonly hash: string }[];
  /** Songs: the mix of every state. */
  readonly states?: readonly StateSidecar[];
  /** Songs: the numbers of the density, rest and repetition checks. */
  readonly stats?: SongStats;
  /** Every finding, one line each. */
  readonly warnings: readonly string[];
}

/** A file rendered and measured, in memory. */
export interface Analysis {
  readonly loaded: Loaded;
  /** Null if the file has errors and could not be rendered. */
  readonly sidecar: Sidecar | null;
  /** The findings of the file and of the render. */
  readonly findings: readonly Finding[];
  readonly song: { readonly render: SongRender; readonly states: readonly { readonly state: string; readonly buffer: StereoBuffer }[] } | null;
  readonly sfx: SfxRender | null;
}

export interface AnalyseOptions {
  readonly sampleRate?: number | undefined;
  /** Songs: another orchestration than the one written. */
  readonly orchestration?: string | null | undefined;
  /** Songs: `first` for the cold start instead of the steady loop. */
  readonly pass?: RenderPass | undefined;
}

const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;

function roundStats(stats: SongStats): SongStats {
  return {
    bars: stats.bars,
    seconds: round(stats.seconds, 3),
    uniqueBarRatio: round(stats.uniqueBarRatio, 3),
    channels: stats.channels.map((channel) => ({
      ...channel,
      onsetsPerStep: round(channel.onsetsPerStep, 3),
      restRatio: round(channel.restRatio, 3),
      uniqueBarRatio: round(channel.uniqueBarRatio, 3),
    })),
  };
}

/** Renders a loaded file and measures the result. */
export function analyse(loaded: Loaded, options: AnalyseOptions = {}): Analysis {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const source = basename(loaded.entry.file);
  const lines = (findings: readonly Finding[]): string[] => findings.map(formatFinding);

  if (loaded.song !== null) {
    const song = loaded.song;
    const render = renderSong(song, { sampleRate, orchestration: options.orchestration, pass: options.pass });
    const metrics = measure([render.left, render.right], sampleRate, { loop: render.loop });
    const findings = [...loaded.findings, ...metricFindings(metrics, MUSIC_TARGET_LUFS)];
    const states = Object.keys(song.states).map((state) => ({ state, buffer: mixState(song, render, state) }));
    const stateRows = states.map(({ state, buffer }): StateSidecar => {
      const stateMetrics = measure([buffer.left, buffer.right], sampleRate, { loop: render.loop });
      for (const finding of metricFindings(stateMetrics, null, `states.${state}`)) findings.push({ ...finding, at: { state } });
      return { state, hash: stereoHash(buffer, sampleRate), lufsI: stateMetrics.lufsI, dBTP: stateMetrics.dBTP, trimDb: trimDb(stateMetrics, MUSIC_TARGET_LUFS) };
    });
    const sidecar: Sidecar = {
      format: SIDECAR_FORMAT,
      id: song.id,
      kind: "song",
      source,
      sampleRate,
      frames: render.frames,
      loop: render.loop,
      hash: stereoHash(render, sampleRate),
      ...metrics,
      trimDb: trimDb(metrics, MUSIC_TARGET_LUFS),
      stems: render.stems.map((stem) => ({ channel: stem.name, hash: stereoHash(stem, sampleRate) })),
      states: stateRows,
      stats: roundStats(songStats(song)),
      warnings: lines(findings),
    };
    return { loaded, sidecar, findings, song: { render, states }, sfx: null };
  }

  if (loaded.sfx !== null) {
    const render = renderSfx(loaded.sfx, { sampleRate });
    const metrics = measure([render.samples], sampleRate);
    const findings = [...loaded.findings, ...metricFindings(metrics, null)];
    const sidecar: Sidecar = {
      format: SIDECAR_FORMAT,
      id: loaded.sfx.id,
      kind: "sfx",
      source,
      sampleRate,
      frames: render.frames,
      hash: monoHash(render.samples, sampleRate),
      ...metrics,
      trimDb: trimDb(metrics, null),
      warnings: lines(findings),
    };
    return { loaded, sidecar, findings, song: null, sfx: render };
  }
  return { loaded, sidecar: null, findings: loaded.findings, song: null, sfx: null };
}

/** The text of a sidecar file. */
export function sidecarText(sidecar: Sidecar): string {
  return formatJson(sidecar, 160);
}

// ---------------------------------------------------------------------------------------
// check

export interface CheckResult {
  readonly entry: AudioEntry;
  readonly findings: readonly Finding[];
  readonly errors: number;
  readonly warnings: number;
  /** Null if the file has errors, or if the golden check was not asked for. */
  readonly sidecar: Sidecar | null;
}

function count(findings: readonly Finding[], entry: AudioEntry, sidecar: Sidecar | null): CheckResult {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  return { entry, findings, errors, warnings: findings.length - errors, sidecar };
}

/**
 * Checks one file: the strict parse and the validators, and (unless `golden` is false) the
 * golden: the file is rendered and its PCM hash must be the one in the checked-in sidecar.
 */
export function checkEntry(entry: AudioEntry, options: { readonly golden?: boolean } = {}): CheckResult {
  const loaded = loadEntry(entry);
  if (options.golden === false || (loaded.song === null && loaded.sfx === null)) return count(loaded.findings, entry, null);
  const analysis = analyse(loaded);
  const sidecar = analysis.sidecar as Sidecar;
  const findings = [...analysis.findings];
  const golden = (text: string): void => {
    findings.push({ severity: "error", rule: "golden", path: "", message: text });
  };
  const how = `run \`./dev npm run audio -- render ${entry.pathId}\` and commit the sidecar (say in the commit why the sound changed)`;
  if (!existsSync(entry.sidecar)) golden(`there is no sidecar ${basename(entry.sidecar)} with the golden hash: ${how}`);
  else {
    const stored = readFileSync(entry.sidecar, "utf8");
    let storedHash: unknown;
    try {
      storedHash = (JSON.parse(stored) as { hash?: unknown }).hash;
    } catch {
      storedHash = undefined;
    }
    if (storedHash !== sidecar.hash) golden(`the render has the PCM hash ${sidecar.hash}, the sidecar says ${JSON.stringify(storedHash)}: ${how}`);
    else if (stored !== sidecarText(sidecar)) golden(`the sidecar ${basename(entry.sidecar)} is out of date (the hash of the mix is right, something else changed): ${how}`);
  }
  return count(findings, entry, sidecar);
}

// ---------------------------------------------------------------------------------------
// render

export interface RenderResult {
  readonly entry: AudioEntry;
  readonly ok: boolean;
  /** The folder the WAV files and pictures were written to. */
  readonly dir: string;
  /** What was written, relative to `dir`, in order. */
  readonly files: readonly string[];
  /** `new`, `changed` or `unchanged`; `kept` when a variant was rendered and the sidecar left alone. */
  readonly sidecarState: "new" | "changed" | "unchanged" | "kept";
  readonly analysis: Analysis;
}

function stereoWav(buffer: StereoBuffer, sampleRate: number): Uint8Array {
  return encodeWav(toPcm16([buffer.left, buffer.right]), 2, sampleRate);
}

/**
 * Renders one file to `build/audio/<path id>/` and writes its sidecar next to the source.
 *
 *   mix.wav                 the whole mix (16-bit PCM; stereo for a song, mono for an SFX)
 *   mix.<state>.wav         songs: the mix of every state
 *   stems/<channel>.wav     songs: every channel on its own
 *   piano-roll.png          what was written (piano-roll-1.png, ... if it needs pages)
 *   spectrogram.png         what came out
 *
 * With another orchestration or pass, the files go to a subfolder (`orchestration-<name>`,
 * `pass-first`) and the sidecar is not touched: it describes the song as written.
 * A file with errors writes nothing.
 */
export function renderToDisk(project: AudioProject, entry: AudioEntry, options: AnalyseOptions = {}): RenderResult {
  const loaded = loadEntry(entry);
  const variant = [options.orchestration === undefined || options.orchestration === null ? "" : `orchestration-${options.orchestration}`, options.pass === "first" ? "pass-first" : ""].filter((part) => part !== "");
  const dir = join(renderDir(project, entry), ...variant);
  let analysis: Analysis;
  try {
    analysis = analyse(loaded, options);
  } catch (error) {
    const findings: Finding[] = [...loaded.findings, { severity: "error", rule: "render", path: "", message: message(error) }];
    return { entry, ok: false, dir, files: [], sidecarState: "kept", analysis: { loaded, sidecar: null, findings, song: null, sfx: null } };
  }
  if (analysis.sidecar === null) return { entry, ok: false, dir, files: [], sidecarState: "kept", analysis };

  // A variant lives inside the folder of the main render and must survive it being made again.
  if (variant.length > 0) rmSync(dir, { recursive: true, force: true });
  else if (existsSync(dir)) {
    for (const name of ["mix.wav", "stems", "spectrogram.png"]) rmSync(join(dir, name), { recursive: true, force: true });
    for (const name of readdirSyncSafe(dir)) if (/^(mix\..+\.wav|piano-roll(-\d+)?\.png)$/.test(name)) rmSync(join(dir, name));
  }
  const files: string[] = [];
  const write = (name: string, bytes: Uint8Array): void => {
    const file = join(dir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
    files.push(name);
  };
  const { sampleRate } = analysis.sidecar;

  if (analysis.song !== null && loaded.song !== null) {
    const { render, states } = analysis.song;
    write("mix.wav", stereoWav(render, sampleRate));
    for (const { state, buffer } of states) write(`mix.${state}.wav`, stereoWav(buffer, sampleRate));
    for (const stem of render.stems) write(`stems/${stem.name}.wav`, stereoWav(stem, sampleRate));
    const pages = drawPianoRoll(songRoll(loaded.song, analysis.findings));
    pages.forEach((page, i) => write(pages.length === 1 ? "piano-roll.png" : `piano-roll-${i + 1}.png`, encodeRgbPng(page)));
    const marks = render.bars.map((bar) => ({ frame: bar.frame, label: String(bar.timelineBar + 1) }));
    write("spectrogram.png", encodeRgbPng(drawSpectrogram(toMono([render.left, render.right]), sampleRate, { title: `${loaded.song.id}  SPECTROGRAM  BARS ON TOP`, marks })));
  } else if (analysis.sfx !== null && loaded.sfx !== null) {
    const render = analysis.sfx;
    write("mix.wav", encodeWav(toPcm16([render.samples]), 1, sampleRate));
    const pages = drawPianoRoll(sfxRoll(loaded.sfx));
    pages.forEach((page, i) => write(pages.length === 1 ? "piano-roll.png" : `piano-roll-${i + 1}.png`, encodeRgbPng(page)));
    const marks = Array.from({ length: Math.floor((render.frames / sampleRate) * 10) + 1 }, (_, i) => ({ frame: Math.round((i * sampleRate) / 10), label: String(i * 100) }));
    write("spectrogram.png", encodeRgbPng(drawSpectrogram(render.samples, sampleRate, { title: `${loaded.sfx.id}  SPECTROGRAM  MS ON TOP`, marks })));
  }

  let sidecarState: RenderResult["sidecarState"] = "kept";
  if (variant.length === 0) {
    const text = sidecarText(analysis.sidecar);
    const before = existsSync(entry.sidecar) ? readFileSync(entry.sidecar, "utf8") : null;
    sidecarState = before === null ? "new" : before === text ? "unchanged" : "changed";
    if (before !== text) writeFileSync(entry.sidecar, text);
  }
  const ok = analysis.findings.every((finding) => finding.severity !== "error");
  return { entry, ok, dir, files, sidecarState, analysis };
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
