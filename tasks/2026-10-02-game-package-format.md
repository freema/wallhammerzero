# GAME PACKAGE FORMAT: A GAME IS VALIDATED, COMPILED DATA (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** sim-core

## Origin
D10: games must be pure data, so the player can be swapped (Godot later). D23. This note
defines what "a game" is on disk and the compile step that turns it into a package any player
can load.

## Read first
- `research/multiplatform.md` §4.1 (what a second player needs: package, two hashes, presentation
  rules as data) and "Architectural rules from day one" 7 and 9.
- `research/ref-sakura-crossing.md` §5 (ii)–(iii): kinds as table rows ("one generator, many
  tenants"), adding content means editing data.
- `research/game-creator.md` §7.1 item 9 (static reference-integrity checks, build health).

## Scope
1. The source layout `games/<id>/`:
   - `game.json`: id, title, `schemaVersion`, native resolution, palette, the systems it uses,
     the entry scene;
   - `data/*.json`: content tables with stable ASCII string ids (kinds as rows);
   - `scenes/`, `ui/`, `fx.json`, `audio.json`: presentation as data. Their schemas are added
     by the runtime notes (`runtime-tilemap-scene`, `runtime-text-ui`, `fx-emitters`,
     `runtime-audio`);
   - `locales/<lang>.json`: display text keyed by id; never text inside the data tables.
2. `packages/game-data`: JSON Schemas with `schemaVersion`, integer fields declared with
   bounds, and a strict loader that rejects duplicate keys, unknown fields and non-integral
   "integers".
3. A CLI, `./dev npm run game -- <cmd>`:
   - `validate <id>`: schemas plus **reference integrity** (every sprite, clip, sound, string,
     FX and table id used anywhere resolves), reported with file and JSON path;
   - `pack <id>`: writes `build/games/<id>/package/` as canonical JSON (RFC 8785), with
     `simDataHash` (only what affects the simulation) and `assetManifest` (atlases, palettes,
     fonts, audio and locales with per-file content hashes).
4. The example game `games/examples/counter-shop/`, using the toy systems from sim-core.
5. `docs/game-data.md`: the layout, the id rules and how to add a table.

## Out of scope
- The first real game's content (after OC-A6).
- Saves (`player-saves`); the player itself (`player-loop-test-protocol`).

## Acceptance
- `validate` passes on the example and fails, with the path, on each fixture: a dangling id, a
  duplicate key, a float where an integer is declared, a string missing in a locale.
- `pack` twice gives byte-identical output; changing a locale string changes the
  `assetManifest` but not `simDataHash`; changing a price changes `simDataHash`.
- The sim from sim-core runs the packed example and matches its golden digests.
