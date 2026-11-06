---
name: make-game
description: "From an idea (or none) to a first playable game in the browser, in one session: pitch 2–3 concepts, the owner picks, scaffold with @whz/play-kit, build the core verb with a script that measures it, give it a first look and sound from code, hand off with STATE.md and a report in Czech. Then the game continues with /continue-game. Run as /make-game [idea]."
argument-hint: "[idea]"
disable-model-invocation: true
---

# make-game: an idea to a first playable build

The idea: `$ARGUMENTS` (empty means: pitch freely). The target is **something the owner can
play after one session**, with as little paperwork as the gate needs. A 3D game with a
generated world and its own physics fills a long session; a 2D one with a single verb takes
less. The owner's playtest is the verdict; green checks are not quality.

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
- Edit files only with the editor tools or `./dev` commands. Never run the host's `node` or
  `python` to rewrite a file (CLAUDE.md: nothing runs on the host).

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
   is the only question before code. If the ledger has no owner's words on what they disliked
   or liked in earlier games, add one line asking for them in the same message: they become
   the look criteria of M3.

A pitch at real scale also names **the length of a first run** (two to five minutes): the
distances, speeds and timers follow from it, not the other way round.

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
   The HUD says **where to go and what to do next** in words (a bearing, a distance, the next
   key), not only in a symbol: a new player with no legend gets lost first.
4. The hook's `start` scenario resets the whole game (score, timers, the seeded draws), so
   scripts give the same numbers in any order. The start screen pauses the simulation until a
   click or a hook call.
5. Verify: the package check (`./dev npm run check -- @whz/<id>-play`), then every script in
   `play/`. Then prove the goal can be reached **with keys only**: a short loop in the page
   that presses keys from `state()` and `advance`s until the goal (or the timer) ends; write
   the time it took into STATE.md.
6. Then **one blind sub-agent** (sonnet) gets the URL, the controls and the pitch, never the
   code, plays it through `window.__game` (keys, `advance`, `describe`, a few screenshots) and
   reports: does the verb work as pitched, what confused it, what broke. Give it a **frozen
   build**, not the dev server, which reloads under it on every edit:
   `./dev npm run build -w @whz/<id>-play`, then in the background
   `./dev -p <port+1> npx vite preview --config packages/<id>-play/vite.config.ts --port <port+1>`.
   Tell it to open its own tab and close it, and to stay under about 45 tool calls. Fix what
   it found that a new player would hit; stop the preview server.

## M3 First look and sound

Enough that the game reads as itself, all of it computed in code (D12): a sky or a background,
one set of materials or a small palette of sprites, one effect for the verb (a flash, a trail,
particles), and sound from WebAudio code (one bed, one cue for the verb, one for failure).
Mute with M, and suspend audio in a hidden tab.

- Before: name 3–5 **look criteria** from the pitch ("the night sky stays saturated, not
  grey", "sprites read at 4× upscale").
- While building the look, the main session may Read a few of its own shots (about six in
  all, upscaled for pixel art): a look cannot be tuned blind. Aim each shot at what a
  criterion is about (the camera on the target, the village, the effect); a scripted camera
  snaps to its place instead of easing.
- Then the independent verdict: `__game.shot(<name>)` from 3–5 scenarios, and **one
  sub-agent** (sonnet) reads them against the criteria and the owner's words in the ledger
  and returns a text verdict per criterion. Check each FAIL against the shot before acting on
  it: a reader misjudges scale and misses what is out of frame.
- Measure `__game.perf()` (Three.js: draw calls, triangles, geometries) in the busiest and the
  emptiest place and write the numbers as the first budgets. Its render time is the CPU's
  submit time, not the GPU's.

## M4 Hand-off (then owner gate B)

1. Fill `games/<id>/STATE.md`: status `waiting: owner`, how to run, **Plays now**, the controls,
   **Next** (at most three items, from the pitch), **Budgets** (the measured numbers, the
   scripts that pass). Update the package README's controls and file table.
2. Set the ledger row to `built`.
3. Commit, the gate chained to it:
   `./dev npm run check && git add <files> && git commit -m "<Title>: the first playable build"`.
   Never pipe the gate through `tail` or `grep`. Do not push.
4. **Report in Czech** and stop:
   - **Play**: the URL, `./dev compose up <id>`, the controls, what to try first;
   - **Verified**: the scripts and their numbers, the blind player's findings, the shot verdict;
   - **Unverified**: is it fun, does it feel good, the sound, the look in motion: only the owner
     can judge these;
   - **Next**: the first Next item, run as `/continue-game <id>`;
   - **Skill**: one or two lines on where this skill helped or got in the way (input for
     improving it), and a request to read `/usage` and say what the run cost.
