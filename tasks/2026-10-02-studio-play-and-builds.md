# STUDIO: PLAY A GAME AND TRIGGER BUILDS (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** M · **Depends on:** player-loop-test-protocol, studio-live-reload

## Origin
D11: "in the studio we will be able to make that build". D23 moves builds from "later" (D22) into
the queue. The owner plays the current state of a game in the studio and makes a build with
one button; Claude gets the same build and the same checks from the command line.

## Read first
- `research/multiplatform.md` §5 (what a "Build" button can produce, what belongs to CI,
  secrets).
- `research/studio-stack.md` §8.2 (`services/jobs`: single-flight builds, logs over SSE) and
  §8.4 (`/builds`).
- `research/game-creator.md` §7.1 item 9 (build health with explicit deductions).

## Scope
1. `/games`: the games under `games/` with their validation state.
2. `/play/:game`: the game's web target embedded, rebuilt when its data or assets change
   (topic `games`). A **test-protocol panel** next to it: the state text, step N ticks, speed,
   seed, run an action script, take a shot.
3. `/builds` and a **jobs service**: single-flight per game and target, a child process in
   the studio container running the engine CLI, logs streamed over SSE, an artifact list with
   sizes and hashes, download as a zip. History in `.studio-cache/builds.json`.
4. A **target registry**: `web` now; the wrapper notes register `desktop` and `mobile`.
5. **Build health**, required before a build is green: `game validate`, reference integrity,
   a headless smoke script (N ticks, no errors) and the bundle size against a budget. The
   same check is a CLI command, `./dev npm run game -- health <id>`.
6. `docs/studio.md` gains the build section. No secret is ever read or stored by the studio.

## Out of scope
- Desktop and mobile packages (`desktop-wrapper`, `mobile-wrapper`), signing, store uploads,
  Steam, CI (not set up).

## Acceptance
- `/play/counter-shop` runs the example; stepping from the panel changes the state text;
  editing a data table reloads the game within a few seconds.
- "Build web" produces `build/games/counter-shop/web/`, the log streams live, and a second
  click while it runs does not start a second job.
- A game with a dangling id fails build health with the JSON path shown, and no artifact is
  listed.
