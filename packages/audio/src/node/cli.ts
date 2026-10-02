// The `audio` command line: `./dev npm run audio -- <command>` from the repo root.
// docs/audio.md describes the commands and what they write.
//
// `runCli` is the whole CLI as a function (arguments in, lines out, exit code back), so the
// tests run it in-process. bin.ts is the entry that Node starts.

import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { formatJson } from "@whz/asset-kit";
import { HARSH_RATIO, MAX_TRUE_PEAK_DB, measure, metricFindings, MUSIC_TARGET_LUFS, trimDb } from "../analysis/index.ts";
import type { Metrics } from "../analysis/index.ts";
import { formatFinding } from "../findings.ts";
import type { Finding } from "../findings.ts";
import { songStats } from "../lint.ts";
import type { SongStats } from "../lint.ts";
import { pcmHash } from "../render.ts";
import type { RenderPass } from "../render.ts";
import { decodeWav, pcmToFloat } from "../wav.ts";
import { analyse, checkEntry, loadEntry, renderToDisk } from "./build.ts";
import type { Loaded, Sidecar } from "./build.ts";
import { findEntries, findStrays, openProject } from "./project.ts";
import type { AudioEntry, AudioProject } from "./project.ts";

/** Where the CLI writes its lines, and the folder relative paths start from. */
export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  readonly cwd: string;
}

const USAGE = `audio <command> [options]

  list                        every song, jingle and SFX: path id, kind, id, length, key, states
  check <id>... | --all       strict parse, step and bar counts, key and chord lint, range,
                              density, repetition, and the golden: the file is rendered and
                              its PCM hash must be the one in its sidecar; exit code 1 on
                              any error
  render <id>... | --all      write build/audio/<path id>/: mix.wav, one WAV per stem and per
                              state, piano-roll.png, spectrogram.png; and the sidecar
                              <name>.render.json next to the source (hash, loudness, peak,
                              trim, warnings)
  metrics <id> | <file.wav>   print the numbers of a render without writing anything:
                              loudness, true peak, energy above 8 kHz, the loop seam, and
                              per channel the density, rests, range and repetition

An <id> is a path id (examples/music/shop-day), the "id" inside the file (bgm.shop.day) or
the path of the file.

Options
  --no-golden            check: validate only, do not render or compare with the sidecar
  --orchestration <name> render, metrics: a song with one of its orchestrations (written to a
                         subfolder; the sidecar is left alone)
  --pass first           render, metrics: a looping song from a cold start instead of the
                         steady loop (subfolder; the sidecar is left alone)
  --loop                 metrics <file.wav>: the file is a loop, measure its seam
  --json                 list, metrics: print JSON
  --root <dir>           the checkout (default: the current folder)
  --audio <dir>          the folder of songs and SFX (default: audio)
  --out <dir>            the folder for outputs (default: build)

Exit codes: 0 fine, 1 a file has an error (or a golden does not match), 2 wrong usage.`;

class UsageError extends Error {}

interface Args {
  readonly command: string;
  readonly ids: string[];
  readonly all: boolean;
  readonly json: boolean;
  readonly golden: boolean;
  readonly loop: boolean;
  readonly orchestration: string | undefined;
  readonly pass: RenderPass | undefined;
  readonly root: string | undefined;
  readonly audio: string | undefined;
  readonly out: string | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const [command = "help", ...rest] = argv;
  const ids: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;
    if (["--all", "--json", "--no-golden", "--loop", "--help", "-h"].includes(arg)) flags.add(arg);
    else if (["--orchestration", "--pass", "--root", "--audio", "--out"].includes(arg)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
      values.set(arg, value);
      i += 1;
    } else if (arg.startsWith("-")) throw new UsageError(`unknown option ${arg}`);
    else ids.push(arg);
  }
  const pass = values.get("--pass");
  if (pass !== undefined && pass !== "first" && pass !== "steady") throw new UsageError(`--pass must be "first" or "steady", got ${pass}`);
  return {
    command: flags.has("--help") || flags.has("-h") || command === "--help" || command === "-h" ? "help" : command,
    ids,
    all: flags.has("--all"),
    json: flags.has("--json"),
    golden: !flags.has("--no-golden"),
    loop: flags.has("--loop"),
    orchestration: values.get("--orchestration"),
    pass,
    root: values.get("--root"),
    audio: values.get("--audio"),
    out: values.get("--out"),
  };
}

/** The "id" inside a file, without validating it; null if the file cannot be read as JSON. */
function dataId(entry: AudioEntry): string | null {
  try {
    const value = JSON.parse(readFileSync(entry.file, "utf8")) as { id?: unknown };
    return typeof value.id === "string" ? value.id : null;
  } catch {
    return null;
  }
}

function findOne(project: AudioProject, entries: readonly AudioEntry[], id: string, io: CliIo): AudioEntry {
  const clean = id.replace(/\/+$/, "");
  const byPath = entries.find((entry) => entry.pathId === clean);
  if (byPath !== undefined) return byPath;
  const file = resolve(io.cwd, clean);
  const byFile = entries.find((entry) => entry.file === file || entry.file === resolve(project.root, clean));
  if (byFile !== undefined) return byFile;
  const byId = entries.filter((entry) => dataId(entry) === clean);
  if (byId.length === 1) return byId[0] as AudioEntry;
  if (byId.length > 1) throw new UsageError(`the id ${JSON.stringify(clean)} is used by ${byId.map((entry) => entry.pathId).join(" and ")}: name one by its path id`);
  const known = entries.map((entry) => entry.pathId).join(", ") || "none";
  throw new UsageError(`no song or SFX ${JSON.stringify(clean)} under ${project.audioDir} (found: ${known})`);
}

/** The entries a command works on: the named ids, or all with `--all`. */
function select(project: AudioProject, args: Args, io: CliIo): AudioEntry[] {
  if (args.all === (args.ids.length > 0)) throw new UsageError(`${args.command} needs ids or --all (not both)`);
  const entries = findEntries(project);
  return args.all ? entries : args.ids.map((id) => findOne(project, entries, id, io));
}

function findingLines(findings: readonly Finding[], limit = 20): string[] {
  const sorted = [...findings].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const lines = sorted.slice(0, limit).map((finding) => `  ${formatFinding(finding)}`);
  if (sorted.length > limit) lines.push(`  ... and ${sorted.length - limit} more`);
  return lines;
}

const signed = (value: number): string => `${value > 0 ? "+" : ""}${value}`;
const level = (value: number | null, unit: string): string => (value === null ? "silent" : `${value} ${unit}`);
const percent = (ratio: number): string => `${Math.round(ratio * 1000) / 10} %`;

function summary(sidecar: Sidecar): string {
  const loudness = sidecar.kind === "song" ? level(sidecar.lufsI, "LUFS") : `${level(sidecar.lufsMomentaryMax, "LUFS")} (loudest 400 ms)`;
  const seam = sidecar.seam === null ? "" : `  seam ${sidecar.seam.click ? "CLICKS" : "ok"}`;
  return `${sidecar.seconds} s  hash ${sidecar.hash}  ${loudness}  ${level(sidecar.dBTP, "dBTP")}  trim ${signed(sidecar.trimDb)} dB  above 8 kHz ${percent(sidecar.energyAbove8k)}${seam}`;
}

function statsLines(stats: SongStats): string[] {
  const rows = stats.channels.map((channel) => [
    channel.channel,
    String(channel.notes),
    channel.onsetsPerStep.toFixed(2),
    percent(channel.restRatio),
    channel.lowest === null ? "-" : `${channel.lowest}..${channel.highest ?? ""}`,
    percent(channel.uniqueBarRatio),
  ]);
  const table = [["channel", "notes", "onsets/step", "rests", "range", "unique bars"], ...rows];
  const widths = (table[0] as string[]).map((_, column) => Math.max(...table.map((row) => (row[column] as string).length)));
  return table.map((row) => `  ${row.map((cell, column) => cell.padEnd(widths[column] as number)).join("  ")}`.trimEnd());
}

function metricLines(metrics: Metrics, target: number | null, trim: number, hash: string): string[] {
  const lines = [`  length        ${metrics.seconds} s`];
  if (target !== null) lines.push(`  loudness      ${level(metrics.lufsI, "LUFS")} integrated (target ${target}), loudest 400 ms ${level(metrics.lufsMomentaryMax, "LUFS")}`);
  else lines.push(`  loudness      ${level(metrics.lufsMomentaryMax, "LUFS")} in the loudest 400 ms`);
  lines.push(`  true peak     ${level(metrics.dBTP, "dBTP")} (limit ${MAX_TRUE_PEAK_DB}), ${metrics.clipped} clipped sample(s)`);
  lines.push(`  trim          ${signed(trim)} dB`);
  lines.push(`  above 8 kHz   ${percent(metrics.energyAbove8k)} of the energy (warning above ${percent(HARSH_RATIO)})`);
  if (metrics.seam !== null) lines.push(`  loop seam     jump ${metrics.seam.jump}, ${metrics.seam.ratio} x the steps around it: ${metrics.seam.click ? "CLICK" : "ok"}`);
  lines.push(`  hash          ${hash}`);
  return lines;
}

function shown(io: CliIo, file: string): string {
  const path = relative(io.cwd, file);
  return path === "" || path.startsWith("..") ? file : path;
}

function describe(loaded: Loaded): Record<string, unknown> {
  const { entry, song, sfx } = loaded;
  if (song !== null) {
    const stats = songStats(song);
    return {
      pathId: entry.pathId,
      kind: song.loopFrom === null ? "jingle" : "song",
      id: song.id,
      bars: stats.bars,
      seconds: Math.round(stats.seconds * 100) / 100,
      tempo: song.tempo,
      key: song.key.name,
      channels: song.channels.map((channel) => channel.name),
      states: Object.keys(song.states),
      orchestrations: Object.keys(song.orchestrations),
    };
  }
  if (sfx !== null) return { pathId: entry.pathId, kind: "sfx", id: sfx.id, voices: sfx.voices.length };
  return { pathId: entry.pathId, kind: entry.kind, error: loaded.findings.find((finding) => finding.severity === "error")?.message ?? "cannot be read" };
}

function list(project: AudioProject, args: Args, io: CliIo): number {
  const rows = findEntries(project).map((entry) => describe(loadEntry(entry)));
  if (args.json) io.out(formatJson(rows).trimEnd());
  else {
    for (const row of rows) {
      const parts = [String(row["pathId"]), String(row["kind"])];
      if (row["error"] !== undefined) parts.push(`ERROR: ${String(row["error"])}`);
      else if (row["kind"] === "sfx") parts.push(String(row["id"]), `${String(row["voices"])} voice(s)`);
      else {
        parts.push(String(row["id"]), `${String(row["bars"])} bars`, `${String(row["seconds"])} s`, `${String(row["tempo"])} BPM`, String(row["key"]));
        const states = row["states"] as string[];
        const orchestrations = row["orchestrations"] as string[];
        if (states.length > 0) parts.push(`states: ${states.join(", ")}`);
        if (orchestrations.length > 0) parts.push(`orchestrations: ${orchestrations.join(", ")}`);
      }
      io.out(parts.join("  "));
    }
    if (rows.length === 0) io.out(`no songs or SFX under ${shown(io, project.audioDir)}`);
  }
  return rows.some((row) => row["error"] !== undefined) ? 1 : 0;
}

function check(project: AudioProject, args: Args, io: CliIo): number {
  const entries = select(project, args, io);
  let failed = 0;
  for (const entry of entries) {
    const result = checkEntry(entry, { golden: args.golden });
    const verdict = result.errors === 0 ? "ok" : `${result.errors} error(s)`;
    const warnings = result.warnings === 0 ? "" : `, ${result.warnings} warning(s)`;
    const numbers = result.sidecar === null ? "" : `  (${summary(result.sidecar)})`;
    io.out(`check ${entry.pathId}: ${verdict}${warnings}${numbers}`);
    for (const line of findingLines(result.findings)) io.out(line);
    if (result.errors > 0) failed += 1;
  }
  if (args.all) {
    // With --all the whole folder is judged: misplaced files and ids used twice.
    for (const stray of findStrays(project)) {
      io.out(`check ${stray}: 1 error(s)`);
      io.out("  error layout  (file): songs live in audio/<pack>/music/ and SFX in audio/<pack>/sfx/; this file is not checked where it is");
      failed += 1;
    }
    const ids = new Map<string, string[]>();
    for (const entry of entries) {
      const id = dataId(entry);
      if (id !== null) ids.set(id, [...(ids.get(id) ?? []), entry.pathId]);
    }
    for (const [id, users] of ids) {
      if (users.length < 2) continue;
      io.out(`check ${users.join(", ")}: 1 error(s)`);
      io.out(`  error id  id: the id "${id}" is used by ${users.length} files; an id names one sound`);
      failed += 1;
    }
    if (entries.length === 0) io.out(`check: no songs or SFX under ${shown(io, project.audioDir)}`);
  }
  if (entries.length > 1 || args.all) io.out(failed === 0 ? `check: ${entries.length} file(s) ok` : `check: ${failed} of ${entries.length} file(s) FAILED`);
  return failed > 0 ? 1 : 0;
}

function render(project: AudioProject, args: Args, io: CliIo): number {
  const entries = select(project, args, io);
  let failed = 0;
  for (const entry of entries) {
    const result = renderToDisk(project, entry, { orchestration: args.orchestration, pass: args.pass });
    const { sidecar } = result.analysis;
    if (sidecar === null) {
      io.out(`render ${entry.pathId}: FAILED, nothing written`);
      for (const line of findingLines(result.analysis.findings)) io.out(line);
      failed += 1;
      continue;
    }
    io.out(`render ${entry.pathId} -> ${shown(io, result.dir)}  (${result.files.join(", ")})`);
    io.out(`  ${summary(sidecar)}`);
    if (result.sidecarState !== "kept") io.out(`  sidecar ${shown(io, entry.sidecar)}: ${result.sidecarState}`);
    for (const line of findingLines(result.analysis.findings)) io.out(line);
    if (!result.ok) failed += 1;
  }
  return failed > 0 ? 1 : 0;
}

function metricsOfWav(file: string, args: Args, io: CliIo): number {
  const wav = decodeWav(new Uint8Array(readFileSync(file)));
  const channels = pcmToFloat(wav.pcm, wav.channels);
  const metrics = measure(channels, wav.sampleRate, { loop: args.loop });
  const hash = pcmHash(wav.pcm, wav.channels, wav.sampleRate);
  const findings = metricFindings(metrics, null);
  if (args.json) io.out(formatJson({ file: shown(io, file), sampleRate: wav.sampleRate, channels: wav.channels, hash, ...metrics, warnings: findings.map(formatFinding) }).trimEnd());
  else {
    io.out(`metrics ${shown(io, file)}  (${wav.channels} channel(s), ${wav.sampleRate} Hz${args.loop ? ", loop" : ""})`);
    for (const line of metricLines(metrics, null, trimDb(metrics, null), hash)) io.out(line);
    for (const line of findingLines(findings)) io.out(line);
  }
  return findings.some((finding) => finding.severity === "error") ? 1 : 0;
}

function metrics(project: AudioProject, args: Args, io: CliIo): number {
  if (args.ids.length !== 1 || args.all) throw new UsageError("metrics needs exactly one id or one WAV file");
  const name = args.ids[0] as string;
  const file = resolve(io.cwd, name);
  if (name.endsWith(".wav")) {
    if (!existsSync(file)) throw new UsageError(`there is no file ${name}`);
    return metricsOfWav(file, args, io);
  }
  const entry = findOne(project, findEntries(project), name, io);
  const loaded = loadEntry(entry);
  const analysis = analyse(loaded, { orchestration: args.orchestration, pass: args.pass });
  const { sidecar } = analysis;
  if (sidecar === null) {
    io.out(`metrics ${entry.pathId}: FAILED`);
    for (const line of findingLines(analysis.findings)) io.out(line);
    return 1;
  }
  if (args.json) io.out(formatJson(sidecar, 160).trimEnd());
  else {
    const kind = loaded.song === null ? "sfx" : sidecar.loop === true ? `loop, ${analysis.song?.render.pass ?? "steady"} pass` : "plays once";
    io.out(`metrics ${entry.pathId}  (${sidecar.id}, ${kind})`);
    for (const line of metricLines(sidecar, sidecar.kind === "song" ? MUSIC_TARGET_LUFS : null, sidecar.trimDb, sidecar.hash)) io.out(line);
    if (sidecar.stats !== undefined) {
      io.out(`  bars          ${sidecar.stats.bars}, ${percent(sidecar.stats.uniqueBarRatio)} of them different`);
      for (const line of statsLines(sidecar.stats)) io.out(line);
    }
    for (const state of sidecar.states ?? []) {
      io.out(`  state ${state.state}: ${level(state.lufsI, "LUFS")}, ${level(state.dBTP, "dBTP")}, trim ${signed(state.trimDb)} dB, hash ${state.hash}`);
    }
    for (const line of findingLines(analysis.findings)) io.out(line);
  }
  return analysis.findings.some((finding) => finding.severity === "error") ? 1 : 0;
}

/** Runs the `audio` command line. Returns the exit code. */
export function runCli(argv: readonly string[], io: CliIo): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.err(`audio: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (args.command === "help") {
    io.out(USAGE);
    return 0;
  }
  const project = openProject({ root: args.root === undefined ? io.cwd : resolve(io.cwd, args.root), audio: args.audio, out: args.out });
  try {
    if (args.command === "list") return list(project, args, io);
    if (args.command === "check") return check(project, args, io);
    if (args.command === "render") return render(project, args, io);
    if (args.command === "metrics") return metrics(project, args, io);
    throw new UsageError(`unknown command ${args.command} (commands: list, check, render, metrics)`);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`audio: ${error.message}`);
      return 2;
    }
    io.err(`audio: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    return 1;
  }
}
