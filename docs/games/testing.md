# Testing a game

How a Claude Code session verifies a game it built or changed, without a human at the screen:
the hook every game exposes, scripted play, numeric checks, screenshots, perf checks, and what
must be true before a session says "done". The depth is in
[research/game-testing-ai.md](../../research/game-testing-ai.md) (verified 2026-10-14; the
protocol, the headless-WebGL facts, the LLM-vision numbers, the postmortems) and the test rows
of [research/threejs-lessons-from-refs.md](../../research/threejs-lessons-from-refs.md) §1.6
and [research/new-hope-audit.md](../../research/new-hope-audit.md) §11. This page only says
what we do.

Status: the rules under "The four rules" and "Reading images" are what the repo already does
for assets and sims. The hook contract, the script format, the tiers and the budgets are a
**proposal**: they match the queued player note
[tasks/2026-10-02-player-loop-test-protocol.md](../../tasks/2026-10-02-player-loop-test-protocol.md)
(#18, `window.__wz`) and the `__game` design in
[research/game-commands-flow.md](../../research/game-commands-flow.md), and the owner decides
whether New Hope adopts them before #18 lands. Nothing here edits a task note.

## The four rules

1. **State beats pixels.** Everyone who ships agent-built games reads the game's state through
   a window hook and treats screenshots as a secondary check (OpenAI's `develop-web-game`,
   game-creator, sakura-crossing, PixelDen's own `/game-upgrade`). A check asserts on numbers
   and ids; an image answers only the questions numbers cannot.
2. **The game owns time.** A `step(frames)` that runs fixed 1/60 s steps with no
   `requestAnimationFrame` works in a hidden tab, from Chrome DevTools MCP, from Playwright and
   from Node. It needs every gameplay timer on sim time and no `Math.random` in gameplay; then
   same seed + same script ⇒ same `state()`, and a bug is a replayable script.
3. **Count, don't time**, except on one pinned machine. Draw calls, triangles, live geometries
   and textures and heap are stable on any renderer; milliseconds mean something only on the
   owner's browser with its renderer string logged. Software WebGL (SwiftShader) gives 5–9 fps:
   fine for correctness, useless for frame time.
4. **Test `input → state change` on more than one device profile.** The failures that reached
   players in every 2025–2026 postmortem were wiring that rendered but did not respond, phone
   DPR, taps swallowed by an overlay, and low-end performance: conditions the agent never
   exercised. A page that loads and looks plausible proves nothing.

And the known limit of the reviewer: **LLM vision is a glitch detector, not a regression or a
fun detector.** On VideoGameQA-Bench the best models find glitches in a single image at 82.8 %
but visual regressions at 45.2 %; on VideoGameBench the best model finished 0.48 % of games;
Claude "out of the box" talks itself out of the issues it finds. So the owner's playtest is the
real verdict, a separate evaluator with hard per-criterion thresholds is the second-best, and a
pixel diff is the regression detector.

## The hook: `window.__game`

Every game exposes one small, versioned object in dev and test builds (`import.meta.env.DEV`
or `?test=1`; stripped from production). Code games implement it directly; data games get it
from the player (`__wz` in #18, the same verbs). New Hope keeps `__nh` as an alias and as its
rich console. **What exists** is the hook of [packages/play-kit](../../packages/play-kit/README.md)
(`describe`, `state`, `digest`, `advance`, `key`/`press`/`hold`, `scenario`, `act`,
`runScript`, `shot`, `perf`, `errors`), which every code game gets from `./dev npm run play -- new`.
The fuller shape below, merged from the three reports, is still a **proposal**:

```ts
interface GameHook {
  v: 1;
  info(): { game: string; build: string; seed: number; renderer: string; dpr: number;
            w: number; h: number };                       // renderer = UNMASKED_RENDERER_WEBGL
  describe(): object;        // state as JSON: a coordinate-system note, mode, player, counts,
                             // entities near the player; no pixels, no DOM
  step(frames: number): object;        // fixed 1/60 s sim steps, no rAF; returns describe()
  setSeed(n: number): void;  // the gameplay RNG; ?seed stays the world seed
  reset(): void;
  command(c: { key?: string; down?: boolean; action?: string; value?: number;
               tap?: [number, number] }): void;           // through the action map
  runScript(script: Script): RunResult;  // steps, commands, expectations, shots; stops on the first failure
  shot(opts?: { name?: string; pose?: string }): Promise<string>;  // PNG, see "Screenshots"
  perf(): { calls: number; triangles: number; geometries: number; textures: number;
            programs: number; tier: string; dpr: number; heapMB?: number };
  check(): { ok: boolean; fails: string[] };             // the game's invariants
  errors(): string[];        // window.onerror + unhandledrejection since load
  flags: Record<string, boolean>;                         // bloom, shadows, crowd, … for A/B
  assets(): string[];        // registry ids the running game used (commands-flow proposal)
}
```

What New Hope has today (`packages/new-hope-play/src/main.ts`): `advance(seconds)` at exactly
1/60 per step (works in a hidden tab), `key(code, down)`, `teleport`, `place`, `look`, and
narrow getters (`jobs`, `police`, `wanted(stars)`, `pass`, `psi`, `crowd`, `rain`, `target`,
`info`). What it lacks: one `describe()`, `shot()`, `errors()`, `check()`, a gameplay seed, and
a correct `info()` (see "Perf checks"). `advance()` also runs the HUD writes, the rain CPU loop
and the audio automation per step; the real loop uses variable `dt`, so a scripted run and a
played run integrate differently. The fixes are the per-frame rules of
[threejs.md](threejs.md): a fixed-step `step()` shared by both paths, a seeded RNG per concern,
presentation once per presented frame.

Rules for the hook:

- `describe()` is small and stable: ids and rounded numbers, a `coords` note ("x east, y up,
  z south, metres"), never a dump of every entity. It is what a sub-agent reads.
- `command()` goes through the action map, so scripts survive a rebinding
  (`{ action: "vehicle.enter" }`, not `{ key: "KeyF" }`; the key form stays for raw input tests).
- `step()` is synchronous and never touches rAF; `shot()` is the only async verb.
- `check()` runs the invariants below and returns names, never throws.
- Keep the proven input recipes inside the hook so no session rediscovers them (PixelDen's
  `MouseEvent` with `view: window` after `game.scale.updateBounds()` is the example).

## Scripts

A script is data, so the studio can show and edit it, and a failing step names its index:

```json
[
  { "note": "steal a cruiser, get arrested, lose 30 % of the credits" },
  { "setSeed": 7 },
  { "teleport": [96, 40, 96] },
  { "command": { "action": "vehicle.enter" } },
  { "step": 60 },
  { "expect": "state.driving.kind == 'cruiser'" },
  { "expect": "state.police.stars >= 1" },
  { "command": { "action": "vehicle.thrust", "value": 0 } },
  { "step": 240 },
  { "expect": "state.police.arrested == true" },
  { "expect": "state.credits == floor(start.credits * 0.7)" },
  { "shot": "busted" }
]
```

Expectations are paths and comparisons over `describe()`, not code. `start` is the state at the
first step. `runScript` stops at the first failing expectation or the first new console error
and returns `{ ok, failedAt, state, perf, errors, shots }`. Scripts live next to the game
(`test/scripts/*.json` in the package) and the runner (`test/run.mjs`) is a file a session
passes to DevTools MCP `evaluate_script` with `sourcePath` today and Playwright runs in Docker
later. Results go to `build/runs/<game>/<timestamp>/` (`result.json`, `perf.json`,
`shots/*.png`), gitignored, which the studio can list as build progress.

The five scripts every New Hope change runs (the "features" of the game, one script each):

1. **Walk and ride:** walk to a lift, ride it up, `player.y` rises by one band; railings hold.
2. **Fare:** get into a parked car, fly to `target()`, land on the pad; credits rise by
   `60 + 1.2·distance`; the beacon moves.
3. **Heat:** steal a cruiser → stars ≥ 1 → hover slow for 3 s → arrested → credits −30 %, Kylo
   back on the first roof; out of sight the stars drop one per ≤ 10 s.
4. **Body passing:** pass seen by a guard (+1 star) and unseen (−2 stars); psi drops by 60 and
   regenerates at 6/s.
5. **Leak and budget:** switch district ten times (`reset()` with a new seed); `perf().geometries`
   and `.textures` equal before and after; `perf()` at the fixed poses within the budget.

Design-intent scripts (from game-creator and Anthropic's harness): **a no-input run must not
win**, active input must do better than idle, restart returns the start state. For a PixelDen
or Kairosoft game with a pure engine, these are Vitest bots over a thousand seeds, not browser
scripts.

Teleport-and-read is the cheapest way to test a feature (Willison's agent verified a chase by
teleporting next to the dog, reading state, then taking one screenshot). `teleport`, `place`,
`wanted(stars)` and `rain(on)` exist for exactly this.

## Numeric checks

`check()` runs after every `step` in a script. New Hope's invariants (**proposal**; each a
function returning `{ ok, detail }`):

- no `NaN` in any position or velocity; Kylo's feet ≥ the floor of his cell − 0.05 m; a car's
  box is in no solid cell (`blocksPoint`); `speed × dt ≤ cell / 2` (the tunnelling guard);
- heat cools: with no new crimes, stars drop by one per ≤ 10 s out of sight; units ≤ stars + 1
  ≤ 6;
- the job target is a pad on a cell citygen calls landable, and reachable on foot from a lift;
- counts bounded: crowd ≤ N, traffic ≤ N; `geometries`/`textures` stable across resets;
- `perf().calls` and `.triangles` at each fixed pose within the budget.

Unit tests in Node, run by the package's `check` (New Hope is the only package whose `check`
lacks `vitest run`; **proposal:** add it): `floorAt`/`blocksPoint` on a hand-made 3×3×3 grid;
a heat timeline (report → cool 10 s → star drops); the fare formula; the tunnelling invariant;
a 600-tick replay digest (`fnv1a64Hex` of `describe()` from `@whz/det`); and the play-level
check the grid invariants miss: **drive the `Walker` physics without a renderer between
citygen's `reachFrom` pairs and prove the 3D walker can walk what the grid calls walkable**
(sakura's "walkable equals visible, to the bit"). That needs `world/` to import no three scene
class, which is the layout rule in [threejs.md](threejs.md).

For PixelDen: `state().mode` in a known set; score never negative or `NaN`; restart gives 0;
exactly one score request on game over; no console error; no 404 under the game's asset path.
For the data games: `@whz/sim` replays and digests already are this layer
([docs/sim.md](../sim.md)).

## Screenshots

Rules, in order of how often they bite:

1. **Render and read in one task.** WebGL clears the drawing buffer after compositing;
   `toDataURL` later returns blank. `shot()` calls `composer.render()` then
   `canvas.toDataURL("image/png")` synchronously. Do not set `preserveDrawingBuffer: true`
   globally (it costs every frame).
2. **PNG, never JPEG, never a browser screenshot of the page** when the frame itself is the
   subject (a page shot includes the DOM HUD, hover states and scrollbars; for the composited
   page, take a DevTools `take_screenshot` with `filePath` so the image stays out of context).
3. **A dev-only `POST /__shot` Vite plugin** (`apply: "serve"`, in the game's `vite.config.ts`)
   writes `build/shots/<game>/<name>.png` and `<name>.json` (the `perf()` numbers, the pose,
   the seed, the renderer string). The name is sanitised to `[\w.-]+` and nothing is written
   outside that folder. The pattern is sakura-crossing's (MIT), rewritten; sakura forces JPEG,
   we do not. The session then Reads the file from the host.
4. **A named shot list per game**, taken before and after any change that could touch it: for
   New Hope the start roof, a street canyon, the undercity, a lift interior, a high flight over
   the skyline, a rain shot, for seeds 2, 7 and 42. Each pose is `{ teleport, look, flags }`
   with rain off and `time` frozen where a shader reads it, so two runs of the same build match.
5. **Two device profiles:** DPR 1 and DPR 3 mobile (`emulate` with viewport
   `"390x844x3,mobile,touch"` in Chrome DevTools MCP; the DPR suffix belongs to the `emulate`
   tool's viewport string, not to the `--viewport` CLI flag, which takes `WxH` only). Willison's
   DPR bug rendered the canvas at 2× on real phones after a DPR-1 pass was green.
6. **Non-blank first.** A black canvas screenshots fine. Check the pixel standard deviation (or
   a histogram) before anything else; wait two rAFs after load.
7. **Diffs are a smoke signal, never the verdict.** Exact hashes only for deterministic frames
   on one pinned renderer (the `@whz/runtime` parity check does this). For a 3D frame, a
   pixelmatch diff (ISC; `threshold` 0.1 is a colour distance, not a share of pixels; three.js
   diffs at 0.1 % of pixels with frozen time and a patched `Math.random`) sends a contact sheet
   to a reviewer; it does not fail the run. No retries: they hide flakes.
8. **Baselines are per renderer.** A golden taken on the M4 means nothing under SwiftShader or
   on Linux; store the renderer string and the Chrome version next to every baseline and compare
   like with like.

### Reading images

The rules of [docs/looking-at-images.md](../looking-at-images.md) apply unchanged to game
shots: upscale by an integer factor, tile into a contact sheet under 2000 px on the long edge,
compare against a reference in the same image, never judge motion from a frame, and run
screenshot-heavy checks in a sub-agent that returns text. Ask the reviewer **single-frame,
binary, named questions with a reference image**: "Is Kylo visible and standing on the roof? Is
the HUD readable? Is anything black, magenta or stretched? Does the far skyline end in a
visible seam?" Never "does it look good", never a regression between two similar frames, never
timing, never fun.

## Perf checks

- **Fix the counters first.** three.js resets `renderer.info` on every `render()` call while
  `info.autoReset` is true, so under `EffectComposer` the numbers after a frame are the last
  pass's (New Hope's first `__nh.info()` reported one triangle). `renderer.info.autoReset = false`,
  one `reset()` at the top of each presented frame, and `perf()` returns a copy. New Hope does
  this since 2026-10-14.
- **Two tiers of perf test:**
  - **Counts, any renderer, can run in Docker:** `calls`, `triangles`, `geometries`,
    `textures`, `programs`, bundle size, request count, against a committed `perf-budget.json`
    per game with a ±5 % band. The budget numbers start from the table in
    [threejs.md](threejs.md) "Performance budgets" and are replaced by measured ones.
  - **Milliseconds, host only:** a bench script on the owner's M4 in pinned Chrome: fixed
    seed, fixed camera path (roof start, a flight over the district, the undercity), 600 frames
    through the real rAF loop, median and p95 frame time, plus the same under DevTools MCP
    `emulate` with `cpuThrottlingRate: 4` as the low-end proxy. Results carry the renderer
    string and the Chrome version; they are advisory, never a gate.
- **Flags for bisection:** `flags.bloom = false`, then shadows, crowd, skyline, in that order,
  reading `perf()` after each; one `evaluate_script` call per flag.
- **Leaks:** `perf().geometries` before and after ten spawn/despawn cycles of the thing under
  test; `take_heapsnapshot` and `compare_heapsnapshots` in DevTools MCP (needs
  `--memoryDebugging=true`) when the JS heap, not the GPU, is suspected.
- **Headless WebGL in Docker** needs the opt-in since Chrome 139: `--use-gl=angle
  --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`; `--disable-gpu` alone fails
  context creation. Whether Playwright and its Chromium may live in the dev image (inside the
  image, nothing on the host) is an owner question; until then correctness runs on the host
  through DevTools MCP, and only the Node tests and the counts run in the gate.
- Log the renderer string (`WEBGL_debug_renderer_info` → `UNMASKED_RENDERER_WEBGL`) in every run
  record. A number without it is noise.

## Tiers

| Tier | What | Where | Gate? |
|---|---|---|---|
| T0 static | typecheck, lint, build, data validation, docs check | Docker, `./dev npm run check` | yes (exists) |
| T1 logic | pure sim and engine tests, bots over many seeds, collision and floor tests in Node, replay digests | Docker | yes |
| T2 boot smoke | load, `info().renderer` logged, 0 console errors, 0 404s, canvas not uniform | host via DevTools MCP today; Docker Playwright + SwiftShader if allowed | yes once in Docker |
| T3 scripted play | the game's scripts: each feature's input → state change, design intent, restart cycles, `check()` after every step, same-seed replay equality | same as T2 | yes |
| T4 visual | `shot()` at the fixed poses × {DPR 1, DPR 3 mobile}; exact hash where frozen, else non-blank plus a contact sheet to a text-only reviewer with named questions | host (GPU), or Docker for goldens | advisory |
| T5 perf | counts vs `perf-budget.json`; median/p95 and 4× CPU throttle on the host | counts in Docker, ms on host | counts yes, ms advisory |
| T6 playtest | the owner plays; vague feedback becomes a measurable criterion and a script | owner | the real verdict |

## The QA sub-agent

One forked skill per stack (`context: fork`, so it does not see the conversation) runs T2–T5
and returns text only: `QA <game> <run-id>: PASS|FAIL`, one line per tier, each failing
expectation with its step index and path, the renderer string, the file paths of the shots.
No images in the reply. The fixer gets the failure plus the attempt log (which approaches were
already tried, so it does not repeat one); **two consecutive verification failures on the same
item stop the run** (PixelDen's rule). A repeatable check that lives only in a prompt will
drift: anything run twice becomes a script file.

## What an agent must verify before saying done

- [ ] `./dev npm run check` is green, as an exit code, not a grep.
- [ ] The feature's own script exists and passes: a command changed the state the feature
      promises (`input → state change`), with `check()` green after every step.
- [ ] A same-seed replay of that script gives the same `describe()`; if it cannot (the loop is
      not fixed-step yet), the report says so.
- [ ] `errors()` is empty after the run; no console error, no 404.
- [ ] The named shots were retaken and Read as a contact sheet, at DPR 1 and DPR 3; the
      reviewer's named questions were answered; a visible defect is listed in the report, not
      argued away.
- [ ] `perf()` at the fixed poses is within the budget, or the overrun is in the report with a
      number. Counts were read with `autoReset = false`; the renderer string is in the run
      record.
- [ ] No GPU leak: `geometries` and `textures` equal after ten cycles of what the change
      spawns.
- [ ] A touch or gamepad path exists for every new input, or the report lists the gap.
- [ ] An asset whose output changed is named (the studio marks it "changed since verdict";
      the owner decides); no `review.json` was written.
- [ ] The report ends with what the owner should play and look for (T6), in one or two lines.

Not evidence of done: unit tests alone, a `curl` of the page, "the page loads", a screenshot
that was not Read, a frame rate measured in the container, a sub-agent's praise.

## Traps

| Thing | Why | Symptom |
|---|---|---|
| `renderer.info` after `composer.render()` | counters reset per `render()` call | `calls: 1`, `triangles: 1` on a 1,000-mesh scene |
| `toDataURL` in a later task | the drawing buffer is cleared after compositing | a blank or black PNG |
| a page screenshot of a canvas game | includes the DOM, hover, scrollbars | diffs on every run |
| DPR 1 only | real phones render at 2–3× | a 2× canvas, invisible or clipped sprites |
| variable `dt` in play, 1/60 in `advance` | two integrations | a jump height that differs between script and play |
| `Math.random` in a system | an unseeded stream | a script that passes on one run and fails on the next |
| `visible = false` on a group with a light | the light is not counted | a hitch and a recompile of every lit material on first use |
| software WebGL timings | SwiftShader is 5–9 fps | a "regression" that is the renderer |
| JPEG goldens | lossy | pixel-art hashes never match |
| retries in the runner | hide intermittent failures | a flaky check that is "green" |
| a stale host `node_modules` | the container has its own | greps of library internals that are wrong by construction |

## PixelDen

The same protocol, one hook: register `window.__game` (or `__pd`) in the one place every
`Phaser.Game` is created (`app/components/game-canvas.tsx` in the PixelDen repo), with
`describe()` calling an optional per-game `testState(scene)`, `step(frames)` driving the loop by
hand (not verified on Phaser 4.0.0; its `headlessStep` exists, manual `game.step` driving is
undocumented), `shot()` via `game.renderer.snapshot`, `errors()`. That replaces the React-fiber
walk and the temporary `?cheat` hooks of `/game-upgrade`. Per game an optional `test.ts` with
`testState`, `scripts` and `invariants`; games with a pure engine get Vitest bots over a
thousand seeds. The `Verified:` commit line quotes the run id. Any check must run in the
container: the host `node_modules` there holds Phaser 3.90 while the lockfile pins 4.0.0.

## Further reading

- [research/game-testing-ai.md](../../research/game-testing-ai.md): the sources behind every
  rule here; headless renderers; screenshot traps; the MCP tool comparison; the postmortems.
- [research/new-hope-audit.md](../../research/new-hope-audit.md) §8 and §11: determinism and
  the `__nh` gaps with `file:line`.
- [research/threejs-lessons-from-refs.md](../../research/threejs-lessons-from-refs.md) §1.6
  and §2.3: the `__shot` plugin pattern, the shot list, flood fills instead of eyes.
- [research/game-commands-flow.md](../../research/game-commands-flow.md): how the runs and
  shots reach the studio page.
- [research/game-creator.md](../../research/game-creator.md) §4 and
  [research/ref-sakura-crossing.md](../../research/ref-sakura-crossing.md) §5: the earlier
  reports this protocol descends from.
- [docs/looking-at-images.md](../looking-at-images.md), [docs/sim.md](../sim.md),
  [docs/studio.md](../studio.md): reading images, replays and digests, the studio.
