# Game data: what a game is on disk

A game is **data** (D10): a folder of JSON files under `games/`, with no code in it. The engine
supplies the code (sim systems, the player); a game picks systems and fills their tables. So
the player can be swapped (Godot later), and a game can be checked without running it.

`packages/game-data` (`@whz/game-data`) defines the layout, validates a game and compiles it
into the **package** a player loads. Its API is in
[packages/game-data/README.md](../packages/game-data/README.md). The example game is
`games/examples/counter-shop/`.

```sh
./dev npm run game -- list                     # every game under games/
./dev npm run game -- validate counter-shop    # strict JSON, schemas, reference integrity
./dev npm run game -- validate --all           # ... for every game (the gate runs this)
./dev npm run game -- pack counter-shop        # build/games/counter-shop/package/
./dev npm run game -- schema table:items       # a JSON Schema (no name: the list of schemas)
```

A game is named by its id or by its folder. Options: `--root <dir>` (the checkout), `--games
<dir>` (default `games`), `--assets <dir>` (default `assets`), `--out <dir>` (default `build`).
Exit codes: **0** fine, **1** a game has problems, **2** wrong usage.

## The source layout

```text
games/<id>/                    or games/<group>/<id>/, e.g. games/examples/counter-shop/
  game.json                    what the game is
  data/<table>.json            one content table per file: kinds as rows
  locales/<lang>.json          display text by string id
  scenes/<id>.json             presentation as data; each schema comes with its runtime note
  ui/<id>.json
  fx.json
  audio.json
  *.md                         notes for people and agents; not part of the game
```

Any other file is a validation error: a file the loader does not know is a file nobody checks.
Hidden files (a leading dot) are ignored. The game's **id is the name of its folder**, and no
two games share an id: the id names the game in commands, build outputs and saves.

### game.json

```json
{
  "schemaVersion": 1,
  "id": "counter-shop",
  "title": "Counter Shop",
  "resolution": { "width": 320, "height": 180 },
  "palette": "example",
  "systems": ["shop.arrivals", "shop.counter"],
  "rowText": { "customerKinds": ["name"], "items": ["name"] }
}
```

| Field | Meaning |
|---|---|
| `schemaVersion` | The version of this layout: `1`. Another version is refused before anything else is read. |
| `id` | The game id; must be the folder name. |
| `title` | The working title, for tools and the studio. Text the player reads is in the locales. |
| `resolution` | The native resolution in pixels (`width`, `height`, 16 to 4096). The player scales it by whole numbers. |
| `palette` | The game's palette: the id of a file under `assets/palettes/`. |
| `systems` | The engine systems the game uses (ids of `ENGINE_SYSTEMS` in `packages/sim`). A system that requires another needs it listed too. |
| `entryScene` | Optional until scenes exist: the id of the scene the game starts in (`scenes/<id>.json`). |
| `rowText` | Optional. Per data table, the display texts every row has. `"items": ["name"]` means: each row `<id>` of `items` has the string `items.<id>.name` in every locale. |

### Data tables: `data/<table>.json`

The content of a game is tables whose rows are **kinds**: an item, a customer kind, later a
room or a staff type. Adding content is adding a row, never a code path
([research/ref-sakura-crossing.md](../research/ref-sakura-crossing.md), "one generator, many
tenants").

- One file per table. The file name is the table's name in the sim system that declares it.
- A **rows** table is an array of objects, each with a unique `id`. A **record** table (settings)
  is one object.
- A value is a bounded integer, a boolean or an id. There are no floats (use basis points or
  fixed point), no nulls, no nesting and **no text**: display text is in the locales.
- **The order of rows is kept and matters.** A system may walk a table in file order (a weighted
  pick does), so reordering rows changes the `simDataHash` and the golden digests.
- The game must have exactly the tables its systems declare: a missing file and a file no
  system declares are both errors.

The schema of a table is **derived from its declaration** in the system
(`dataRows("items", { price: field.int(1, 100000), ... })` in `packages/sim/src/systems/`), so
the data, the sim and the schema cannot disagree. `./dev npm run game -- schema table:items`
prints it.

### Locales: `locales/<lang>.json`

One flat object per language: string id → text. The file name is the locale (`en`, `cs`,
`pt-BR`). Text is Unicode in NFC with no control characters but a newline.

```json
{
  "items.apple.name": "Jablko",
  "items.bread.name": "Chléb"
}
```

A game needs at least one locale. **Every locale has the same strings:** a string that is used
(by `rowText`, later by UI and other presentation data) or that any locale has must be in every
locale.

### Presentation: scenes, UI, FX and audio cues

Presentation is data too, so a second player does not have to rewrite it by hand
([research/multiplatform.md](../research/multiplatform.md) §4.1). The four slots are reserved
in `packages/game-data/src/layout.ts`, each with the note that adds its schema:
`scenes/<id>.json` (`runtime-tilemap-scene`), `ui/<id>.json` (`runtime-text-ui`), `fx.json`
(`fx-emitters`) and `audio.json` (`runtime-audio`). Until a slot has its schema, a game with
such a file does not validate. [Adding a presentation schema](#adding-a-presentation-schema)
says how a note fills a slot.

## The id rules

Every id is ASCII, so it sorts, hashes and compares the same in every language (never by
locale) and is safe as a file name. Ids are **stable**: saves, replays and locales refer to
them, so renaming one is a migration, not a cleanup.

| Id | Looks like | Rule |
|---|---|---|
| Game, scene, UI file | `counter-shop` | Lowercase letters and digits in words joined by `-`, starting with a letter. It is a folder or file name. |
| Row, system, command, event | `apple`, `shop.set-price` | Lowercase letters and digits in groups joined by `.`, `-` or `_`, starting with a letter, at most 64 characters (the sim's `isId`). |
| Table, field, `rowText` suffix | `customerKinds` | A camelCase identifier, at most 64 characters (the sim's `isName`). |
| String | `items.apple.name` | Names and ids joined by dots. For row text: `<table>.<row id>.<suffix>`. |
| Locale | `en`, `pt-BR` | Language, and a region if needed. |
| Palette | `example` | Lowercase letters, digits and dashes: the file name under `assets/palettes/`. |
| Asset | `examples/blinking-dot` | `<pack>/<name>`: the asset's folder under `assets/`. |

## validate

`validate` reads every file with a **strict JSON reader** (never `JSON.parse`), checks it
against its schema, and then checks **reference integrity**: every id used anywhere resolves.
One line per problem, with the file, the line and column, the JSON path and the rule:

```text
games/x/data/items.json:3:22: $[1].price: 6.5 is not an integer: an integer from 1 to 100000 is declared, written without a fraction or an exponent [schema]
games/x/data/items.json:4:11: $[2].id: the string "items.cake.name" is missing in the locale "cs" (locales/cs.json) [string]
games/x/game.json:6:14: $.palette: no palette "exmaple": assets/palettes/exmaple.json does not exist (palettes: example) [ref]
```

| Rule | What fails |
|---|---|
| `json` | Text that is not strict JSON: a **duplicate key** (`JSON.parse` would silently keep the last one), a trailing comma, a comment, a byte order mark, half of a surrogate pair. |
| `layout` | A missing `game.json`, a missing or undeclared table file, an unknown or unreadable file, no locale, a presentation file whose schema has not landed. |
| `schema` | An **unknown field**, a missing field, a wrong type, an integer outside its declared bounds, a **number that is not written as an integer** (`6.5`, but also `6.0` and `6e0`: another player's JSON reader may read those as floats), a bad id, two rows with one id, another `schemaVersion`. |
| `ref` | An id that does not resolve: a row of another table, a table, a system (or one a listed system requires), the palette, the entry scene, an asset, a clip of an asset, a sound. |
| `string` | A display text that is used, or that another locale has, and is missing in a locale. |
| `sim` | The data fits the schemas and the sim still refuses it (a rule only the system knows, such as "the weights add up to 0"). Checked last, by creating the sim once. |

The reference kinds are annotations in the schemas (`x-ref`), listed in
`packages/game-data/src/refs.ts`. Rows, tables, systems, strings and scenes resolve inside the
game; palettes, assets and clips resolve against `assets/` (an asset program is loaded only
when a game refers to it). Sounds resolve against nothing yet: the audio notes add them.

`packages/game-data/test/fixtures/games/` holds one small game per defect, and the tests expect
the exact line for each. A session can run them:

```sh
./dev npm run game -- validate --games packages/game-data/test/fixtures/games --all
```

## pack: the game package

`pack` validates the game and writes `build/games/<id>/package/`, the only thing a player
loads. A game with a problem writes nothing.

```text
game.json              the manifest: the fields of the source game.json, plus
                       format ("wz.game-package/1"), locales, simDataHash, assetManifest
sim.json               { "systems": [...], "tables": {...} }: exactly what the sim gets
locales/<lang>.json    display text
palettes/<id>.json     the palettes the game names
assets/<id>/           atlas.json and the sheets (seed-<n>.png) of every asset the game refers to
scenes/, ui/, fx.json, audio.json    presentation documents
```

- **Canonical JSON.** Every JSON file is written as RFC 8785 text in UTF-8: keys in ascending
  order of their UTF-16 code units, no whitespace, no newline at the end. Game data has only
  integers, so the hard part of RFC 8785 (the text of a double) never comes up; a float is
  refused. **Packing the same game twice gives the same bytes.**
- The folder is emptied first and `game.json` is written last: a reader that finds a manifest
  finds complete files.
- A package is never edited by hand. `openPackage` (what a player calls) refuses a package
  whose manifest does not fit its schema, whose JSON is not canonical, or whose files are not
  exactly the ones the manifest lists.

### The two hashes

After EU4's checksum, which covers gameplay files and not graphics or localisation
([research/multiplatform.md](../research/multiplatform.md) §4.1):

| Hash | Covers | Changes when | Used by |
|---|---|---|---|
| `simDataHash` | `sim.json`: the systems and the data tables. It is FNV-1a 64 over the bytes of that file, and equal to `hashSimData` of the sim. | A price, a row, the order of rows, the systems. | Replays, snapshots and saves carry it, so they never run against other data. |
| `assetManifest` | Every other file, each with `path`, `kind` (`atlas`, `audio`, `font`, `locale`, `palette`, `presentation`), `bytes` and `hash` (FNV-1a 64 over the file's bytes); plus one `hash` over that list. | A translation, a palette colour, a sprite, a scene, a UI layout. | Caching and "did the art change"; a player verifies what it loaded. |

A new translation or a recoloured sprite leaves the `simDataHash` alone, so old replays and
saves still load. The title and the resolution are in the manifest and in neither hash.

The example game's `simDataHash` is the one the golden replay of the sim stores, and the gate
runs that replay on the packed example (normal and heavy mode):

```sh
./dev npm run game -- pack counter-shop
./dev npm run sim -- replay packages/sim/golden/counter-shop.replay.json --data build/games/counter-shop/package/sim.json
```

`packages/sim/golden/counter-shop.data.json` is the sim package's own copy of the same tables
(the sim cannot depend on this package). A test keeps the two equal, so a change to the
example's `data/` is a change to the golden data: record the replay again in the same commit
and say why ([sim.md](sim.md#digest-snapshot-replay)).

## How to add a table

1. **Declare it in a system** (`packages/sim/src/systems/`): `dataRows("rooms", { cost:
   field.int(0, 100000), size: field.int(1, 8) })` for rows, `dataRecord` for settings. Every
   integer gets bounds; a field that names a row of another table is `field.ref("items")`. Add
   the declaration to the system's `data` list. The contract for systems is in
   [packages/sim/README.md](../packages/sim/README.md#writing-a-system).
2. **Write `data/rooms.json`** in each game that uses the system: an array of rows with `id`
   and exactly the declared fields.
3. **If rows have display text**, add the table to `rowText` in `game.json`
   (`"rooms": ["name", "blurb"]`) and add `rooms.<id>.name` and `rooms.<id>.blurb` to every
   locale.
4. **Run `./dev npm run game -- validate <id>`.** It names the file and the JSON path of
   anything that is missing or does not fit.
5. A new table changes the `simDataHash` of the games that use the system. If a golden replay
   runs on such a game, record it again in the same commit and say why.

Adding a **row** is steps 2 to 4: a row in the table file, its strings in every locale.

## Adding a presentation schema

For the notes that fill a slot (or add one, such as view bindings):

1. Write the schema as a TypeScript object and compile it with `compileSchema(name, schema,
   defs)` (`packages/game-data/src/schema.ts`). The dialect is a strict subset of JSON Schema:
   `object` (with `additionalProperties` always said), `array`, `string`, `integer` (always with
   `minimum` and `maximum`), `boolean`, `oneOf` with an `x-tag` field for variants, and `$ref`
   into `$defs` for trees. There is no `number`. An unknown keyword is an error.
2. Mark every id with `x-ref`, so validation resolves it: `row:<table>`, `table`, `system`,
   `string`, `doc:scenes`, `palette`, `asset`, `asset:<kind>`, `clip:<field>` (a clip of the
   asset named by a sibling field), `sound`. Mark display text with `x-text`.
3. Put the compiled schema into the slot in `packages/game-data/src/layout.ts` (or add a slot).
   `pack` then writes the document into the package as canonical JSON and lists it in the asset
   manifest as `presentation`; every asset it refers to is baked and packed with it.
4. Add tests and, for each new way to be wrong, a fixture game.

A package that builds on this one adds commands to the `game` CLI by passing a longer command
table to `runCli` from its own entry point (see the README of the package).
