# HARDENING AFTER THE FIRST WAVES: STABLE GATE, TIGHTER LINT, TRUE DOCS (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** none

## Origin
Twelve notes (#1–#7, #12, #15–#17, #24) were built by parallel agents on 2026-10-02 and each
was checked by a blind verifier. All passed, but the verifiers reported problems that no note
covered. They are collected here, so the next waves build on a stable base.

## Read first
- `docs/dev-environment.md` (the gate, the file-watch probe), `docs/progress.md`.
- `eslint.config.js` and `tools/lint/` (the determinism lint and its scopes).
- `research/README.md`, conclusions 1 and 4 (determinism; docs drift from the code).

## Scope
1. **A gate that stays green under load.** Several tests hit Vitest's default 5 s timeout
   while other gate runs shared the Docker VM (`asset-kit` bakeAll, the `audio` suite, `sim`
   heavy mode). Give every package one shared Vitest config with generous test and hook
   timeouts, so a slow machine cannot turn the gate red.
2. **Determinism lint without back doors:**
   - inline `eslint-disable` comments do not work in the deterministic scopes;
   - `packages/game-data/src` joins the deterministic scopes (pack output must be
     byte-identical);
   - `eval`, `new Function`, dynamic `import()` and Node built-in imports are banned in
     `assets/**`;
   - the lint's README lists what it cannot catch (float literals and plain `/` division) and
     what guards those instead (the integer state check, golden hashes).
3. **Sim:** a system's RNG handle cannot fork or reach another stream at runtime, not only in
   the types; `docs/sim.md` says what is true.
4. **Game package:** `pack` includes the palette of every asset the game references (today
   only the palette named in `game.json` is packed), in the package and in `assetManifest`. An
   on-disk fixture covers a dangling row id.
5. **Asset lints:** defect fixtures on disk for `bbox-change`, `palette-index` and
   `frame-size`, so each rule can turn the gate red.
6. **Dev wrapper:** a host-side self-test script for `./dev` (exit codes pass through; usage
   errors; a failing check exits non-zero), documented in `docs/dev-environment.md`. The gate
   itself runs inside the container and cannot test the wrapper.
7. **Studio dev server:** the browser may load the workspace packages it needs (`runtime`,
   `asset-kit`, `voxel-kit`, `det`) and nothing else of the checkout.
8. **Task queue tool:** a new row never reuses a number that was used before.
9. **Skill intake:** the default report folder is unique per scanned source, so two scans of
   folders with the same name do not overwrite each other.
10. **Docs that are true again:** the status paragraphs of `CLAUDE.md` and `README.md` (code
    exists: name the packages and the commands); the probe section of
    `docs/dev-environment.md` (a replaced file can lose its event even singly, the temp-name
    event is not guaranteed, events can be later than 2 s under load, so a watcher must rescan
    or poll); the sheet sizes in `docs/looking-at-images.md`; the stale example in
    `docs/game-data.md`.

## Out of scope
- Whether `/loop` can start the `implement-tasks` skill while it has
  `disable-model-invocation: true`: the owner reviews that skill first.
- Running anything on a second JS engine (`sim-conformance-quickjs`).
- New features of any kind.

## Acceptance
- `./dev npm run check` passes three times in a row while two other full gate runs are in
  progress in scratch clones of the repo (clones and their volumes removed afterwards).
- A fixture asset with `// eslint-disable-next-line` above `Math.random()` fails the lint; so
  do fixtures with `eval`, a dynamic `import()` and an `fs` import.
- A sim test proves a system cannot fork its RNG or read another system's stream at runtime.
- Packing a game that uses an asset with a second palette puts that palette into the package
  and the manifest.
- Each of the three lint rules has a fixture that makes `lint` exit non-zero through that rule.
- The `./dev` self-test passes on the host and is described in the doc.
- The task-queue tool gives a fresh number after the highest-numbered note is closed (test).
