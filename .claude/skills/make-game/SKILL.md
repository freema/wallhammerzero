---
name: make-game
description: "From an idea (or none) to a first playable game in the browser, in one session: pitch 2–3 concepts, the owner picks, scaffold with @whz/play-kit, build the core verb with a script that measures it, give it a first look and sound from code, hand off with STATE.md and a report in Czech. Then the game continues with /continue-game. Run as /make-game [idea]."
argument-hint: "[idea]"
disable-model-invocation: true
---

# make-game: an idea to a first playable build

The idea: `$ARGUMENTS` (empty means: pitch freely). The target is **something the owner can
play within about an hour of work**, with as little paperwork as the gate needs. The owner's
playtest is the verdict; green checks are not quality.

There are exactly **two owner gates**: (A) the pick of a pitch, (B) the playtest at the end.
Between them, decide with defaults and say each choice in one line. Never ask about tuning,
file layout, naming or which slice comes first.

## Limits (cost is the owner's)

- The main session builds. **At most one sub-agent per stage** (M2, M3), `model: sonnet`, to
  read shots or to play blind. **No Workflow.**
- **The same check fails twice: stop**, write what failed into STATE.md (status `blocked`) and
  report.
- Read the handbook pages the engine needs ([docs/games/README.md](../../../docs/games/README.md):
  `threejs.md` for 3D, `procgen.md` for generated content, `performance.md` for budgets,
  `testing.md` for the hook), not the long research reports.

## M0 Pitch (then owner gate A)

1. Read [docs/games/pitches.md](../../../docs/games/pitches.md): what the owner said about games,
   every earlier pitch and its verdict. **Never pitch what is rejected or parked there, or a
   close variant of it.**
2. Read the product rules: [docs/DECISIONS.md](../../../docs/DECISIONS.md) (D10 our runtime and
   web tech, D12 graphics are code, D30 the Three.js exception, D31).
3. Write **three pitches**, as different from each other as the idea allows (genre, view,
   mood). Each in at most six lines:
   - **name** and the fantasy in one sentence;
   - **the core verb**: what the player does every few seconds, and why it is fun;
   - **view and engine**: `three` (real-time 3D) or `canvas` (2D pixel art at a native
     resolution); an engine other than our runtime departs from D10, so say it;
   - **the hook**: one thing the repo has never done (a technique, a generator, a mechanic);
   - **the first playable build**: what plays after this run, in one line;
   - **the ceiling**: what this game will never have (keeps the scope honest).
4. Mark one as **recommended** with one line why. Append the three to the ledger in
   `docs/games/pitches.md` as `pitched`.
5. **Stop and ask the owner** to pick one (a number, "go" for the recommended, or changes). This
   is the only question before code.

When the owner answers: set the picked row to `picked` and the others to `passed`, quoting the
answer. If the pick departs from a recorded decision (for example an engine other than our
runtime, D10), add a decision row to `docs/DECISIONS.md` with the owner's words.

## M1 Skeleton

```sh
./dev npm run play -- new <id> --title "<Title>" --engine three|canvas
./dev npm install
```

- `<id>`: lowercase words joined by `-`, from the game's name. The command prints the port.
- Write the pitch into `games/<id>/README.md` (replace the comment).
- Start the dev server in the background (`./dev -p <port> npm run dev -w @whz/<id>-play`),
  open `http://127.0.0.1:<port>/?seed=1` in the host browser (DevTools MCP or Claude in
  Chrome) and run `async () => await __game.runScript("smoke")`. It passes before anything
  else is written.
- The hook, the loop and the script format: [packages/play-kit/README.md](../../../packages/play-kit/README.md).

## M2 The core verb, as grey boxes

1. **The check first:** write `play/core.json`, a script that does the verb and measures it
   with a number and a direction ("after 3 s of holding Space the kite is 10 m higher", "a
   matched row of three scores 30 and clears 3 cells"). Add scenarios and actions to the hook
   for what the script needs to set up.
2. Build the verb with the simplest shapes: all rules in the fixed-step `update`, randomness
   from `@whz/det` with the seed, so a seed and the inputs give the same run.
3. Add a goal and a failure (a score, a timer, a way to lose) so it is a game, not a toy.
4. Verify: the package check (`./dev npm run check -- @whz/<id>-play`), then every script in
   `play/`. Then **one blind sub-agent** (sonnet) gets the URL, the controls and the pitch,
   never the code, plays it through `window.__game` (keys, `advance`, `describe`, a few shots)
   and reports: does the verb work as pitched, what confused it, what broke.

## M3 First look and sound

Enough that the game reads as itself, all of it computed in code (D12): a sky or a background,
one set of materials or a small palette of sprites, one effect for the verb (a flash, a trail,
particles), and sound from WebAudio code (one bed, one cue for the verb, one for failure).
Mute with M, and suspend audio in a hidden tab.

- Before: name 3–5 **look criteria** from the pitch ("the night sky stays saturated, not
  grey", "sprites read at 4× upscale").
- Shots: `__game.shot(<name>)` from 2–3 scenarios. **One sub-agent** (sonnet) reads them
  against the criteria and the owner's words in the ledger and returns a text verdict per
  criterion. Shots do not go into the main context.
- Measure `__game.perf()` (Three.js: draw calls, triangles, geometries) and write the numbers
  as the first budgets.

## M4 Hand-off (then owner gate B)

1. Fill `games/<id>/STATE.md`: status `waiting: owner`, how to run, **Plays now**, the controls,
   **Next** (at most three items, from the pitch), **Budgets** (the measured numbers, the
   scripts that pass). Update the package README's controls and file table.
2. Set the ledger row to `built`.
3. Commit, the gate chained to it:
   `./dev npm run check && git add <files> && git commit -m "<Title>: the first playable build"`.
   Never pipe the gate through `tail` or `grep`. Do not push.
4. **Report in Czech** and stop:
   - **Hraj**: the URL, `./dev compose up <id>`, the controls, what to try first;
   - **Ověřeno**: the scripts and their numbers, the blind player's findings, the shot verdict;
   - **Neověřeno**: is it fun, does it feel good, the sound, the look in motion: only the owner
     can judge these;
   - **Dál**: the first Next item, run as `/continue-game <id>`;
   - **Skill**: one or two lines on where this skill helped or got in the way (input for
     improving it), and a request to read `/usage` and say what the run cost.
