# @whz/game-data

What a game is on disk, and the package any player loads (D10: games are pure data). The
layout of `games/<id>/`, the id rules, the two hashes and how to add a table are in
[docs/game-data.md](../../docs/game-data.md); this file is the API.

Two entry points, like the other packages: `@whz/game-data` is pure (no DOM, no Node, no
files), so the player uses it in the browser; `@whz/game-data/node` reads and writes files and
is the `game` command.

## The core: `@whz/game-data`

| API | What it does |
|---|---|
| `validateGame(input, catalog)` → `{ problems, game }` | Validates the files of a game folder. `input` is `{ dir, files, unreadable?, systems?, presentation? }`: `files` maps a path inside the folder to its text. `game` is the loaded game, or `null` if there is any problem. |
| `analyseGame(input)` → `GameAnalysis`, `resolveGame(analysis, catalog)` | The same in two steps: the analysis says which assets the game refers to (`assetIds`), so the host loads only those into the catalog. |
| `Problem`, `formatProblem(problem)` | `{ file, line, col, path, rule, message }` and its one line: `<file>:<line>:<col>: <json path>: <message> [<rule>]`. Rules: `json`, `layout`, `schema`, `ref`, `string`, `sim`. |
| `LoadedGame` | `{ dir, manifest, simData, simDataHash, locales, presentation, palettes, assets, sounds }`: plain data. `simData` goes to `createSim` of `@whz/sim` as it is. |
| `Catalog`, `EMPTY_CATALOG` | The ids that live outside a game: `{ palettes, assets, sounds }`. An asset entry is `{ kind, clips, facings }` or `{ error }`. |
| `buildPackage(game, external?)` → `{ manifest, files }` | The package in memory: path → bytes. `external` are the files from outside the game folder (`{ path, kind, bytes }`: palettes, baked atlases and sheets). Deterministic. |
| `openPackage(files)` → `{ problems, opened }` | What a player calls: verifies the manifest against its schema, `sim.json` against `simDataHash`, and every file against the asset manifest. `opened` is `{ manifest, simData, files }`. |
| `PackageManifest`, `AssetManifest`, `PackageFile`, `PACKAGE_FORMAT`, `manifestHash(files)` | The shape of a package's `game.json`. |
| `parseJson(text)` → `JsonNode`, `nodeValue(node)`, `positionAt(text, offset)`, `JsonParseError` | The strict JSON reader: refuses duplicate keys, keeps every value's offset and every number's text. |
| `toCanonicalJson(value)`, `canonicalBytes(value)`, `contentHash(bytes)`, `utf8Bytes`, `utf8Text` | RFC 8785 text for integer-only data, its UTF-8 bytes, and FNV-1a 64 as 16 hex digits. A float throws a `CanonicalError`. |
| `compileSchema(name, schema, defs?)` → `CompiledSchema` | Checks a schema of the dialect and returns `check(node)` → `{ issues, refs }` and `toJsonSchema()`. A wrong schema throws a `SchemaError` (an integer without bounds, an unknown keyword, an object that does not say `additionalProperties`). |
| `GAME_SCHEMA`, `LOCALE_SCHEMA`, `PACKAGE_SCHEMA`, `tableSchema(decl)` | The schemas. `tableSchema` derives a table's schema from its declaration in a sim system. |
| `PRESENTATION`, `PresentationSlot`, `classifyFile(path)` | The presentation slots (scenes, ui, fx, audio) and what each file of a game folder is. |
| `parseRef(text)`, `RefSpec` | The reference kinds of `x-ref`. |
| `SCHEMA_VERSION`, `GAME_ID_PATTERN`, `ROW_ID_PATTERN`, `NAME_PATTERN`, `STRING_ID_PATTERN`, `LOCALE_PATTERN`, `PALETTE_ID_PATTERN`, `ASSET_ID_PATTERN` | The id rules as regular expression sources. |

```ts
import { openPackage } from "@whz/game-data";
import { createSim } from "@whz/sim";

const { opened, problems } = openPackage(files); // files: Map<path, Uint8Array> of the package folder
if (opened === null) throw new Error(problems.join("\n"));
const sim = createSim({ data: opened.simData, seed });
// sim.simDataHash === opened.manifest.simDataHash
const czech = JSON.parse(new TextDecoder().decode(opened.files.get("locales/cs.json")));
```

## The file side: `@whz/game-data/node`

| API | What it does |
|---|---|
| `openGameProject({ root?, games?, assets?, out? })` → `GameProject` | The folders the commands use. Defaults: the current folder, `games`, `assets`, `build`. |
| `findGames(project)`, `findGame(project, idOrFolder)` → `GameEntry` | The games of a checkout: `{ id, folder, dir }`. A folder with a `game.json` is a game; two games with one id throw. |
| `validateGameDir(project, entry)` → `{ problems, game }` | Reads the folder, loads the assets the game refers to, validates. |
| `packGame(project, entry)` → `PackResult` | Validates, bakes the referenced assets, and writes `build/games/<id>/package/` (`packageDir`). What was written is read back and verified. |
| `readPackageDir(dir)`, `writePackageDir(dir, built)` | A package folder as `Map<path, bytes>`, and the writer (empties the folder first, writes `game.json` last). |
| `readGameFiles(entry)`, `loadCatalog(project, assetIds)` | The two inputs of `validateGame`, from disk. |
| `runCli(argv, io, commands?)`, `GAME_COMMANDS`, `GameCommand`, `selectGames`, `UsageError` | The `game` CLI as a function, and its command table. |

The CLI is `./dev npm run game -- <list|validate|pack|schema>`; the commands and their output
are in [docs/game-data.md](../../docs/game-data.md).

### Adding a command from another package

`game-data` cannot import the packages that build on it (the player needs `run` and `web`). A
command is an entry of a table, so such a package has its own entry point that runs the same
CLI with a longer table, and the root `game` script points at that entry point:

```ts
import { GAME_COMMANDS, runCli, selectGames } from "@whz/game-data/node";
import type { GameCommand } from "@whz/game-data/node";

const run: GameCommand = {
  name: "run",
  help: ["run <id> --script <file>    play an action script headless"],
  options: ["--script"], // options with a value; `flags` are the ones without
  async run(args, io) {
    const [game] = selectGames("run", args); // the ids given, or every game with --all
    io.out(`running ${game?.id} with ${args.values.get("--script")}`);
    return 0; // the exit code
  },
};

process.exitCode = await runCli(process.argv.slice(2), { out: console.log, err: console.error, cwd: process.cwd() }, [...GAME_COMMANDS, run]);
```

## The schema dialect

A strict subset of JSON Schema (draft 2020-12), written as TypeScript objects and printed as
standard JSON Schema by `toJsonSchema()`:

- `object`: `properties`, `required`, and always `additionalProperties` (`false`, or a schema for
  the other keys, with `propertyNames: { pattern, maxLength }`), `minProperties`;
- `array`: `items`, `minItems`, `maxItems`, `uniqueItems` (strings and integers), `x-unique:
  "<field>"` (rows with a unique id);
- `string`: `pattern`, `minLength`, `maxLength` (code points), `enum`, `const`, `x-ref`, `x-text`;
- `integer`: always with `minimum` and `maximum`; `boolean`;
- `oneOf` with `x-tag`: object variants told apart by a constant field; `$ref` into `$defs`.

There is no `number`, no `null` and no type lists. A keyword the dialect does not know is an
error when the schema is compiled, so a typo never turns a rule off.

## Tests

`./dev npm run check -- @whz/game-data` runs the type checks, the lint, the tests and
`validate --all` on the games of the repo. The tests cover the strict reader (every refused
form, positions), canonical JSON against the examples of RFC 8785 and against the sim's own
writer, the UTF-8 codec against `TextEncoder` and `TextDecoder`, every keyword of the dialect
and every wrong schema, every reference kind, the defect fixtures in `test/fixtures/games/`
(one game per defect; the exact line is expected), the pack acceptance (byte-identical output,
which hash a change moves, the golden replay of the sim on the packed example in normal and
heavy mode), what `openPackage` refuses, and the CLI with its exit codes.
