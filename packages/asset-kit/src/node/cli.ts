// The `asset` command line: `./dev npm run asset -- <command>` from the repo root.
// docs/asset-pipeline.md describes the commands and what they write.
//
// `runCli` is the whole CLI as a function (arguments in, lines out, exit code back), so the
// tests run it in-process. bin.ts is the entry that Node starts.

import { relative } from "node:path";
import type { LintFinding } from "../lint.ts";
import { DEFAULT_REVIEW_ZOOM } from "../review.ts";
import { bakeAll, bakeToDisk, lintToDisk, reviewPackToDisk, reviewToDisk } from "./build.ts";
import type { BakeResult, LintResult, ReviewResult } from "./build.ts";
import { findAsset, findAssets, loadEntry, openProject } from "./project.ts";
import type { AssetEntry, AssetProject } from "./project.ts";

/** Where the CLI writes its lines, and the folder relative paths start from. */
export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  readonly cwd: string;
}

const USAGE = `asset <command> [options]

  list                       every asset: id, kind, size, clips, facings, variant seeds, presets
  bake <id>... | --all       write build/assets/<id>/: atlas.json, one indexed PNG sheet per
                             variant seed, and every frame as its own PNG
  review <id>                write build/review/<id>/: contact sheet, one strip per clip,
                             silhouettes, seeds, the in-context tile, and lint.json
  review --pack <pack>       write build/review/<pack>/pack.png: one row per asset of the
                             pack, review seeds as columns
  lint <id>... | --all       numeric checks; writes build/review/<id>/lint.json; exit code 1
                             if any asset has an error

Options
  --seed <n>       review: the seed of the contact sheet and the strips (default: the first variant seed)
  --preset <name>  review: render with this preset
  --zoom <n>       review: integer zoom (default ${DEFAULT_REVIEW_ZOOM}; lowered when a frame does not fit)
  --no-write       lint: check only, write no lint.json
  --json           list: print JSON
  --assets <dir>   the folder of asset programs (default: assets)
  --out <dir>      the folder for outputs (default: build)

Exit codes: 0 fine, 1 an asset failed (a lint error, a bake or render error), 2 wrong usage.`;

class UsageError extends Error {}

interface Args {
  readonly command: string;
  readonly ids: string[];
  readonly all: boolean;
  readonly json: boolean;
  readonly write: boolean;
  readonly pack: string | undefined;
  readonly preset: string | undefined;
  readonly seed: number | undefined;
  readonly zoom: number | undefined;
  readonly assets: string | undefined;
  readonly out: string | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const [command = "help", ...rest] = argv;
  const ids: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;
    if (["--all", "--json", "--no-write", "--help", "-h"].includes(arg)) flags.add(arg);
    else if (["--pack", "--preset", "--seed", "--zoom", "--assets", "--out"].includes(arg)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
      values.set(arg, value);
      i += 1;
    } else if (arg.startsWith("-")) throw new UsageError(`unknown option ${arg}`);
    else ids.push(arg.replace(/\/+$/, ""));
  }
  const integer = (name: string, min: number, max: number): number | undefined => {
    const text = values.get(name);
    if (text === undefined) return undefined;
    const value = Number(text);
    if (!/^\d+$/.test(text) || value < min || value > max) throw new UsageError(`${name} must be an integer in [${min}, ${max}], got ${text}`);
    return value;
  };
  return {
    command: flags.has("--help") || flags.has("-h") || command === "--help" || command === "-h" ? "help" : command,
    ids,
    all: flags.has("--all"),
    json: flags.has("--json"),
    write: !flags.has("--no-write"),
    pack: values.get("--pack"),
    preset: values.get("--preset"),
    seed: integer("--seed", 0, 0xffffffff),
    zoom: integer("--zoom", 1, 64),
    assets: values.get("--assets"),
    out: values.get("--out"),
  };
}

/** The entries a command works on: the named ids, or all with `--all`. */
function select(project: AssetProject, args: Args): AssetEntry[] {
  if (args.all === (args.ids.length > 0)) throw new UsageError(`${args.command} needs asset ids or --all (not both)`);
  return args.all ? findAssets(project) : args.ids.map((id) => findAsset(project, id));
}

function where(finding: LintFinding): string {
  const parts: string[] = [];
  if (finding.preset !== undefined && finding.preset !== null) parts.push(`preset ${finding.preset}`);
  if (finding.clip !== undefined) parts.push(finding.facing === undefined ? finding.clip : `${finding.clip}/${finding.facing}`);
  if (finding.frame !== undefined) parts.push(`frame ${finding.frame}`);
  return parts.join(" ");
}

/** The findings as lines: the same finding on several seeds is one line. */
function findingLines(findings: readonly LintFinding[], limit: number): string[] {
  const groups = new Map<string, { finding: LintFinding; seeds: number[] }>();
  for (const finding of findings) {
    const key = [finding.severity, finding.rule, where(finding), finding.message].join("\n");
    const group = groups.get(key) ?? { finding, seeds: [] };
    if (finding.seed !== undefined) group.seeds.push(finding.seed);
    groups.set(key, group);
  }
  const all = [...groups.values()].sort((a, b) => (a.finding.severity === b.finding.severity ? 0 : a.finding.severity === "error" ? -1 : 1));
  const lines = all.slice(0, limit).map(({ finding, seeds }) => {
    const seedText = seeds.length === 0 ? "" : seeds.length > 4 ? `${seeds.length} seeds (${seeds.slice(0, 3).join(", ")}, ...)` : `seed ${seeds.join(", ")}`;
    const place = [seedText, where(finding)].filter((part) => part !== "").join(" ");
    return `  ${finding.severity} ${finding.rule}${place === "" ? "" : `  ${place}`}: ${finding.message}`;
  });
  if (all.length > limit) lines.push(`  ... and ${all.length - limit} more: see lint.json`);
  return lines;
}

function lintLines(result: LintResult, io: CliIo): string[] {
  if (result.report === null) return [`lint ${result.id}: FAILED to load: ${result.error ?? ""}`];
  const { report } = result;
  const counts = `${report.subjects.length} renders, ${report.frames.length} frames`;
  const file = result.file === null ? "" : `  -> ${relative(io.cwd, result.file)}`;
  const verdict = report.errors === 0 ? "ok" : `${report.errors} error(s)`;
  const warnings = report.warnings === 0 ? "" : `, ${report.warnings} warning(s)`;
  return [`lint ${result.id}: ${verdict}${warnings}  (${counts})${file}`, ...findingLines(report.findings, 12)];
}

async function list(project: AssetProject, args: Args, io: CliIo): Promise<number> {
  const rows: Record<string, unknown>[] = [];
  let failed = 0;
  for (const entry of findAssets(project)) {
    try {
      const asset = await loadEntry(entry);
      const { meta } = asset;
      rows.push({
        id: meta.id,
        kind: meta.kind,
        size: meta.size,
        clips: meta.clips.map((clip) => ({ name: clip.name, frames: clip.frames })),
        facings: meta.facings,
        variants: asset.variantSeeds,
        presets: Object.keys(asset.presets),
      });
      if (!args.json) {
        const clips = meta.clips.map((clip) => `${clip.name}(${clip.frames})`).join(" ");
        const presets = Object.keys(asset.presets).join(",") || "none";
        io.out(
          `${meta.id}  ${meta.kind} ${meta.size[0]}x${meta.size[1]}  clips ${clips}  facings ${meta.facings.join(",")}  variants ${asset.variantSeeds.join(",")}  presets ${presets}`,
        );
      }
    } catch (error) {
      failed += 1;
      rows.push({ id: entry.id, error: (error as Error).message });
      if (!args.json) io.out(`${entry.id}  ERROR ${(error as Error).message}`);
    }
  }
  if (args.json) io.out(JSON.stringify(rows, null, 2));
  else io.out(`${rows.length} asset(s)${failed > 0 ? `, ${failed} cannot be loaded` : ""}`);
  return failed > 0 ? 1 : 0;
}

function bakeLines(result: BakeResult, io: CliIo): string[] {
  if (!result.ok) return [`bake ${result.id}: FAILED: ${result.error}`];
  const { atlas } = result;
  return [
    `bake ${result.id}: ${atlas.variants.length} variant(s) x ${atlas.frames.length} frame(s), sheet ${atlas.sheet.w}x${atlas.sheet.h}  -> ${relative(io.cwd, result.dir)}`,
    ...atlas.variants.map((variant) => `  seed ${variant.seed}  ${variant.sheet}  output hash ${variant.outputHash}`),
  ];
}

async function bake(project: AssetProject, args: Args, io: CliIo): Promise<number> {
  const entries = select(project, args);
  const results: BakeResult[] = [];
  if (args.all) results.push(...(await bakeAll(project)));
  else for (const entry of entries) results.push(await bakeToDisk(project, entry));
  for (const result of results) for (const line of bakeLines(result, io)) io.out(line);
  const failed = results.filter((result) => !result.ok).length;
  io.out(`${results.length - failed} asset(s) baked${failed > 0 ? `, ${failed} FAILED` : ""}`);
  return failed > 0 ? 1 : 0;
}

async function lint(project: AssetProject, args: Args, io: CliIo): Promise<number> {
  const entries = select(project, args);
  let failed = 0;
  for (const entry of entries) {
    const result = await lintToDisk(project, entry, { write: args.write });
    if (!result.ok) failed += 1;
    for (const line of lintLines(result, io)) io.out(line);
  }
  io.out(`${entries.length - failed} of ${entries.length} asset(s) pass the lints`);
  return failed > 0 ? 1 : 0;
}

function reviewLines(result: ReviewResult, io: CliIo): string[] {
  if (!result.ok) return [`review ${result.id}: FAILED: ${result.error}`];
  return [
    `review ${result.id}  -> ${relative(io.cwd, result.dir)}`,
    ...result.images.map((image) => `  ${relative(io.cwd, image.path)}  ${image.w}x${image.h}  zoom ${image.zoom}x  ${image.about}`),
    ...result.errors.map((problem) => `  ERROR ${problem.id}: ${problem.error}`),
  ];
}

async function review(project: AssetProject, args: Args, io: CliIo): Promise<number> {
  const options = { seed: args.seed, preset: args.preset, zoom: args.zoom };
  if (args.pack !== undefined) {
    if (args.ids.length > 0 || args.all) throw new UsageError("review takes one asset id or --pack <pack>, not both");
    const result = await reviewPackToDisk(project, args.pack.replace(/\/+$/, ""), options);
    for (const line of reviewLines(result, io)) io.out(line);
    return result.ok && result.errors.length === 0 ? 0 : 1;
  }
  if (args.ids.length !== 1 || args.all) throw new UsageError("review takes one asset id, or --pack <pack>");
  const result = await reviewToDisk(project, findAsset(project, args.ids[0] as string), options);
  for (const line of reviewLines(result, io)) io.out(line);
  if (!result.ok) return 1;
  if (result.lint !== null) for (const line of lintLines(result.lint, io)) io.out(line);
  return result.lint === null || result.lint.ok ? 0 : 1;
}

/** Runs the CLI. Returns the exit code: 0 fine, 1 an asset failed, 2 wrong usage. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    const args = parseArgs(argv);
    const project = openProject({ root: io.cwd, assets: args.assets, out: args.out });
    switch (args.command) {
      case "help":
        io.out(USAGE);
        return 0;
      case "list":
        return await list(project, args, io);
      case "bake":
        return await bake(project, args, io);
      case "lint":
        return await lint(project, args, io);
      case "review":
        return await review(project, args, io);
      default:
        throw new UsageError(`unknown command ${JSON.stringify(args.command)}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`asset: ${error.message}`);
      io.err("");
      io.err(USAGE);
      return 2;
    }
    io.err(`asset: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
