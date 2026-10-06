// The `game` command line: `./dev npm run game -- <command>` from the repo root.
// docs/game-data.md describes the commands and what they write.
//
// `runCli` is the whole CLI as a function (arguments in, lines out, exit code back), so the
// tests run it in-process. bin.ts is the entry that Node starts.
//
// The commands are a table. A package that builds on this one (the player: `run`, `web`) adds
// its commands by calling `runCli(argv, io, [...GAME_COMMANDS, ...its own])` from its own
// entry point; game-data cannot import the player.

import { resolve } from "node:path";
import { ENGINE_SYSTEMS } from "@whz/sim";
import { formatProblem, GAME_SCHEMA, LOCALE_SCHEMA, nodeValue, PACKAGE_SCHEMA, parseJson, PRESENTATION, tableSchema } from "../index.ts";
import type { CompiledSchema } from "../index.ts";
import { packGame, validateGameDir } from "./build.ts";
import { findGame, findGames, openGameProject, readGameFiles, shownPath } from "./project.ts";
import type { GameEntry, GameProject } from "./project.ts";

/** Where the CLI writes its lines, and the folder relative paths start from. */
export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  readonly cwd: string;
}

/** Wrong usage: the message and the exit code 2. A command throws it for bad arguments. */
export class UsageError extends Error {}

/** The arguments of one command, parsed. */
export interface CommandArgs {
  /** The game ids (or folders) given. */
  readonly ids: readonly string[];
  /** The options without a value that were given (`--all`). */
  readonly flags: ReadonlySet<string>;
  /** The options with a value that were given (`--out` → `dist`). */
  readonly values: ReadonlyMap<string, string>;
  readonly project: GameProject;
}

/** One command of the `game` CLI. */
export interface GameCommand {
  readonly name: string;
  /** Its lines of the help text. The first starts with the command and its arguments. */
  readonly help: readonly string[];
  /** Options without a value that only this command takes (`--heavy`). */
  readonly flags?: readonly string[];
  /** Options with a value that only this command takes (`--script`). */
  readonly options?: readonly string[];
  /** Help lines for those options. */
  readonly optionHelp?: readonly string[];
  /** Returns the exit code: 0 fine, 1 a game failed. */
  run(args: CommandArgs, io: CliIo): Promise<number> | number;
}

const COMMON_FLAGS = ["--all", "--json"];
const COMMON_OPTIONS = ["--root", "--games", "--assets", "--out"];

/**
 * The games a command works on: the ids given, or every game with `--all`. Throws a
 * `UsageError` for neither or both, and for an id that is not a game.
 */
export function selectGames(command: string, args: CommandArgs): GameEntry[] {
  const all = args.flags.has("--all");
  if (all === args.ids.length > 0) throw new UsageError(`${command} needs game ids or --all (not both)`);
  if (all) return findGames(args.project);
  return args.ids.map((id) => {
    try {
      return findGame(args.project, id);
    } catch (error) {
      throw new UsageError((error as Error).message);
    }
  });
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

const list: GameCommand = {
  name: "list",
  help: ["list                        every game under games/: id, folder, title (not validated)"],
  run(args, io) {
    const rows = findGames(args.project).map((entry) => {
      let title: string | null = null;
      try {
        const manifest = nodeValue(parseJson(readGameFiles(entry).files.get("game.json") ?? "")) as { title?: unknown } | null;
        if (typeof manifest?.title === "string") title = manifest.title;
      } catch {
        // A broken game.json is `validate`'s to report; the list still shows the game.
      }
      return { id: entry.id, dir: entry.dir, title };
    });
    if (args.flags.has("--json")) io.out(JSON.stringify(rows, null, 2));
    else if (rows.length === 0) io.out(`no games under ${shownPath(args.project, args.project.gamesDir)}`);
    else for (const row of rows) io.out(`${row.id}\t${row.dir}\t${row.title ?? "(game.json cannot be read)"}`);
    return 0;
  },
};

const validate: GameCommand = {
  name: "validate",
  help: [
    "validate <id>... | --all    check a game: strict JSON, the schemas and reference integrity",
    "                            (every id resolves). One line per problem, with file and JSON path.",
  ],
  async run(args, io) {
    const entries = selectGames("validate", args);
    let failed = 0;
    for (const entry of entries) {
      const { problems, game } = await validateGameDir(args.project, entry);
      if (game === null) {
        failed += 1;
        for (const problem of problems) io.out(formatProblem(problem));
        io.out(`FAILED ${entry.id} (${entry.dir}): ${plural(problems.length, "problem")}`);
        continue;
      }
      const strings = [...game.locales.values()].reduce((sum, text) => sum + Object.keys(text).length, 0);
      io.out(
        `ok ${entry.id} (${entry.dir}): ${plural(game.manifest.systems.length, "system")}, ` +
          `${plural(Object.keys(game.simData.tables).length, "table")}, ${plural(game.locales.size, "locale")}, ` +
          `${plural(strings, "string")}, simDataHash ${game.simDataHash}`,
      );
    }
    if (entries.length === 0) io.out(`no games under ${shownPath(args.project, args.project.gamesDir)}`);
    if (entries.length > 1) io.out(failed === 0 ? `validate: all ${entries.length} games are valid` : `validate: ${failed} of ${entries.length} games failed`);
    return failed === 0 ? 0 : 1;
  },
};

const pack: GameCommand = {
  name: "pack",
  help: [
    "pack <id>... | --all        validate, then write build/games/<id>/package/: canonical JSON,",
    "                            game.json with simDataHash and assetManifest, sim.json, locales,",
    "                            the baked atlas of every asset the game refers to, and the palettes",
    "                            (the game's own and the palette of each of those assets)",
  ],
  async run(args, io) {
    const entries = selectGames("pack", args);
    let failed = 0;
    for (const entry of entries) {
      const result = await packGame(args.project, entry);
      if (!result.ok) {
        failed += 1;
        for (const problem of result.problems) io.out(formatProblem(problem));
        io.out(`FAILED ${entry.id} (${entry.dir}): ${plural(result.problems.length, "problem")}, nothing was written`);
        continue;
      }
      const bytes = result.files.reduce((sum, file) => sum + file.bytes, 0);
      const { assetManifest, simDataHash } = result.manifest;
      io.out(`packed ${entry.id}: ${shownPath(args.project, result.dir)} (${plural(result.files.length, "file")}, ${bytes} bytes)`);
      io.out(`  simDataHash ${simDataHash}`);
      io.out(`  assetManifest ${assetManifest.hash} (${plural(assetManifest.files.length, "file")})`);
    }
    return failed === 0 ? 0 : 1;
  },
};

/** Every schema the CLI can print, by name. */
function schemas(): Map<string, CompiledSchema> {
  const found = new Map<string, CompiledSchema>([
    ["game", GAME_SCHEMA],
    ["locale", LOCALE_SCHEMA],
    ["package", PACKAGE_SCHEMA],
  ]);
  for (const slot of PRESENTATION) if (slot.schema !== null) found.set(slot.name, slot.schema);
  for (const system of ENGINE_SYSTEMS) for (const decl of system.data ?? []) found.set(`table:${decl.name}`, tableSchema(decl));
  return found;
}

const schema: GameCommand = {
  name: "schema",
  help: [
    "schema [<name>]             print a JSON Schema: game, locale, package, table:<table>.",
    "                            Without a name: the names.",
  ],
  run(args, io) {
    const known = schemas();
    if (args.ids.length === 0) {
      for (const name of known.keys()) io.out(name);
      return 0;
    }
    if (args.ids.length > 1) throw new UsageError("schema takes one name");
    const wanted = known.get(args.ids[0] as string);
    if (wanted === undefined) throw new UsageError(`no schema ${JSON.stringify(args.ids[0])} (schemas: ${[...known.keys()].join(", ")})`);
    io.out(JSON.stringify(wanted.toJsonSchema(), null, 2));
    return 0;
  },
};

/** The commands of this package. */
export const GAME_COMMANDS: readonly GameCommand[] = Object.freeze([list, validate, pack, schema]);

function usage(commands: readonly GameCommand[]): string {
  const optionHelp = commands.flatMap((command) => command.optionHelp ?? []);
  return [
    "game <command> [options]",
    "",
    ...commands.flatMap((command) => command.help.map((line) => `  ${line}`)),
    "",
    "A game is named by its id (the name of its folder) or by its folder.",
    "",
    "Options",
    ...optionHelp.map((line) => `  ${line}`),
    "  --json           list: print JSON",
    "  --root <dir>     the checkout (default: the current folder)",
    "  --games <dir>    the folder of games (default: games)",
    "  --assets <dir>   the folder of asset programs and palettes (default: assets)",
    "  --out <dir>      the folder for outputs (default: build)",
    "",
    "Exit codes: 0 fine, 1 a game has problems, 2 wrong usage.",
  ].join("\n");
}

function parseArgs(command: GameCommand, rest: readonly string[], io: CliIo): CommandArgs {
  const flagNames = [...COMMON_FLAGS, ...(command.flags ?? [])];
  const optionNames = [...COMMON_OPTIONS, ...(command.options ?? [])];
  const ids: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] as string;
    if (flagNames.includes(arg)) flags.add(arg);
    else if (optionNames.includes(arg)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${arg} needs a value`);
      values.set(arg, value);
      i += 1;
    } else if (arg.startsWith("-")) throw new UsageError(`unknown option ${arg}`);
    else ids.push(arg);
  }
  const project = openGameProject({
    root: resolve(io.cwd, values.get("--root") ?? "."),
    games: values.get("--games"),
    assets: values.get("--assets"),
    out: values.get("--out"),
  });
  return { ids, flags, values, project };
}

/**
 * Runs the `game` CLI. Returns the exit code: 0 fine, 1 a game has problems (or a command
 * failed), 2 wrong usage.
 */
export async function runCli(argv: readonly string[], io: CliIo, commands: readonly GameCommand[] = GAME_COMMANDS): Promise<number> {
  const [name = "help", ...rest] = argv;
  if (name === "help" || name === "--help" || name === "-h" || rest.includes("--help") || rest.includes("-h")) {
    io.out(usage(commands));
    return 0;
  }
  try {
    const command = commands.find((candidate) => candidate.name === name);
    if (command === undefined) throw new UsageError(`unknown command "${name}"`);
    return await command.run(parseArgs(command, rest, io), io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`game: ${error.message}`);
      io.err("");
      io.err(usage(commands));
      return 2;
    }
    io.err(`game: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
