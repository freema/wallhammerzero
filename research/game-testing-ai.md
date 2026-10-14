# Testing and verifying browser games built by AI agents (2025–2026)

*Research date: 2026-10-14. Status: proposal only.*

Legend: **[S]** sourced (link inline, full list with dates in [Sources](#sources)), **[O]** my
opinion, **[U]** unverified. "Repo" claims about Wallhammer and PixelDen were read from the code
on 2026-10-14 and count as [S] with a file path.

This report builds on [game-creator.md](game-creator.md) §4 and §7 (the test protocol idea),
[ref-sakura-crossing.md](ref-sakura-crossing.md) (`__shot`, "count draw calls, not ms"),
[studio-stack.md](studio-stack.md) §7.5 (the render service and the Chrome 139 SwiftShader
change) and the queued note
[tasks/2026-10-02-player-loop-test-protocol.md](../tasks/2026-10-02-player-loop-test-protocol.md).
It does not repeat them; §1 lists what it corrects.

---

## 0. Key findings

1. **State beats pixels, and everyone who ships agent-built games has converged on it.** OpenAI's
   `develop-web-game` skill, game-creator, sakura-crossing and PixelDen's own `/game-upgrade`
   all read game state through a window hook and treat screenshots as a secondary check
   [S: [skills.sh develop-web-game](https://skills.sh/openai/skills/develop-web-game),
   game-creator.md §4.1, PixelDen `.claude/commands/game-upgrade.md` §6].
2. **Time must be owned by the game, not by the browser.** New Hope already has
   `__nh.advance(seconds)` with a fixed 1/60 s step, but its gameplay draws from `Math.random`
   (police, crowd timers, rain), so the same script does not give the same run [S: repo].
   Playwright's `page.clock` can drive `requestAnimationFrame` [S: [Playwright clock](https://playwright.dev/docs/clock)],
   but a game-owned `step()` is simpler and also works from Chrome DevTools MCP.
3. **Headless WebGL is a configuration problem, not a capability problem.** Since Chrome 139,
   WebGL no longer falls back to SwiftShader silently; you opt in with
   `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`
   [S: [Chromium SwiftShader doc](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)].
   Software rendering is fine for correctness and goldens, useless for frame time.
4. **Screenshot diffs fail in boring ways:** a cleared drawing buffer, a silent black canvas,
   devicePixelRatio, per-OS baselines, post-processing, unseeded particles. The three.js
   project itself diffs at 0.1 % of pixels with frozen time and a patched `Math.random`
   [S: [three.js puppeteer.js](https://github.com/mrdoob/three.js/blob/dev/test/e2e/puppeteer.js)];
   game-creator's 3000-pixel tolerance is far looser (game-creator.md §4.4).
5. **LLM vision is a glitch detector, not a regression detector or a fun detector.** On
   VideoGameQA-Bench the best models reach 82.8 % on image glitch detection but 45.2 % on visual
   regression [S: [arXiv 2505.15952](https://arxiv.org/html/2505.15952v2)]. On VideoGameBench
   the best VLM finished 0.48 % of games [S: [arXiv 2505.18134](https://arxiv.org/abs/2505.18134v2)].
   Anthropic reports that Claude "out of the box" talks itself out of the issues it finds
   [S: [Anthropic, harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)].
6. **Real postmortems agree on where agent-built games break:** input wiring that looks done but
   does nothing, mobile/DPR differences, CSS overlays that swallow taps, and performance on
   low-end hardware. The games run; they are shallow
   [S: [Willison 2026-08-05](https://simonwillison.net/2026/Aug/5/raccoon-heist/),
   [Anthropic harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps),
   [itch.io Abduction Run](https://itch.io/post/16024370)].
7. **Performance in CI: count, don't time.** Draw calls, triangles, live geometries/textures
   and heap are stable on any renderer; milliseconds only mean something on one pinned GPU
   [S: [Dave Snider 2026-02-23](https://davesnider.com/posts/gputests); ref-sakura-crossing.md].
8. **Agent workflows that hold up:** a machine-readable feature list with `passes` flags, one
   feature per session, end-to-end checks in a browser, and a separate, calibrated evaluator
   [S: [Anthropic, long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)].
   PixelDen's "two failures then stop" rule and `Verified:` commit line already match this.

---

## 1. What this corrects or adds to earlier research

- **game-creator.md §4.2** quotes `--use-gl=angle --use-angle=swiftshader` for software WebGL.
  On Chrome ≥ 139 that alone fails context creation; the opt-in flag
  `--enable-unsafe-swiftshader` (and `swiftshader-webgl` for the WebGL-only fallback) is
  required [S: [Chromium SwiftShader doc](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md),
  [Samsung policy page](https://developer.samsung.com/browser/policy/enable-unsafe-swift-shader.html)].
  The deprecation started in Chrome 130 [S: same] [refuted 2026-10-14: neither the Chromium
  doc nor the Samsung page names Chrome 130; the source is the blink-dev "Intent to Remove:
  SwiftShader Fallback" (2025-02-13): "This deprecation period began in Chrome 130", shipping
  estimated for 137, enforced in 139 per Samsung/chromedp]. studio-stack.md §7.5 was right that the
  automatic fallback is gone; it did not name the opt-in flag.
- **studio-stack.md §7.5** asked whether headless Chromium on the M4 gets GPU WebGL. Still
  [U] (nothing found specific to macOS). Chrome's own guide says "By default, Headless Chrome
  disables GPU" and documents only Linux/Vulkan flags
  [S: [Chrome blog, 2024-01-16](https://developer.chrome.com/blog/supercharge-web-ai-testing)].
  Our practice (the host Chrome through Chrome DevTools MCP) sidesteps it.
- **game-creator.md §4.1** reports `advanceTime(ms)` as "waits real time across rAF". The
  upstream origin of that convention is OpenAI's Codex skill `develop-web-game`
  (`render_game_to_text`, `advanceTime` [unconfirmed: the skills.sh page shows the Playwright
  client script `scripts/web_game_playwright_client.js` and `references/action_payloads.json`,
  first seen 2026-02-01, 1.1 K installs, but neither function name], a Playwright client script and
  `references/action_payloads.json`); game-creator is a descendant [unconfirmed]
  [S: [skills.sh](https://skills.sh/openai/skills/develop-web-game), search mirrors]. The
  licence of the OpenAI skill was not checked [U]; ideas only, as with all third-party skills.
- **The repo of game-creator** now shows as `playableintelligence/game-creator` on skills.sh,
  first seen 2026-02-21, ~1.0 K installs [S: [skills.sh game-qa](https://skills.sh/opusgamelabs/game-creator/game-qa)].
  Nothing in it changes the verdict of game-creator.md.
- **New, not in any earlier report:** Chrome DevTools MCP now has memory (heap snapshot diff)
  tools, `--slim` (3 tools), a `--viewport WxHxDPR` emulation string [refuted 2026-10-14: the
  CLI option `--viewport` takes `WxH` only (e.g. `1280x720`); the
  `WxHxDPR[,mobile][,touch][,landscape]` string is the `viewport` parameter of the `emulate`
  tool] and WebMCP tools (`list_webmcp_tools`, `execute_webmcp_tool`; they need
  `--categoryExperimentalWebmcp=true`, and `compare_heapsnapshots` needs `--memoryDebugging=true`)
  [S: [tool reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md),
  [configuration](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md)].
  §8 maps them onto our checks.

---

## 2. Deterministic stepping and test hooks

### 2.1 The loop

- **[S]** A variable `dt` fed into physics makes behaviour depend on the frame rate (tunnelling,
  exploding springs); only fully fixed steps give repeatable results; clamp the number of steps
  per frame to avoid the "spiral of death"; render with an interpolation `alpha`
  ([Fiedler, "Fix Your Timestep", 2004](https://gafferongames.com/post/fix_your_timestep/);
  old but still the reference).
- **[S: repo]** New Hope's loop is `dt = Math.min(0.05, (now - last) / 1000); frame(dt)`
  (`packages/new-hope-play/src/main.ts` L326–333). In play, the sim step is the browser's frame
  time; in `__nh.advance` it is exactly 1/60 s (L373–377). So **a scripted run and a played run
  integrate differently** [O]: a jump height or a car's top speed measured by a script may not
  match what a 30 fps laptop shows.
- **[O]** Recommendation for New Hope: a fixed-step accumulator (60 Hz sim, ≤ 5 steps per frame),
  render once per frame. `advance()` then calls the same step function the real loop does.

### 2.2 Who owns time

| Approach | How | Good for | Weak spot |
|---|---|---|---|
| Game-owned step | `__nh.advance(s)` / `step(frames)` loops `frame(1/60)` without rAF | Works in a hidden tab, from DevTools MCP, from Playwright, from Node | Needs every timer in the game to use sim time (no `setTimeout`, no `performance.now()` inside gameplay) |
| Playwright clock | `page.clock.install()` then `runFor(ms)`; overrides `requestAnimationFrame`, `performance`, timers, `Date` [S: [Playwright clock](https://playwright.dev/docs/clock)] | Games we cannot modify | `install` must be the first clock call [S]; behaviour of `performance.now()` "not specified" on the page [unconfirmed: neither the Clock guide nor the `Clock` API page says this; both only list `performance` among the faked globals]; not available through DevTools MCP |
| Page injection (three.js e2e) | `evaluateOnNewDocument` freezes `Date.now`/`performance.now` at 0, replaces `Math.random` with a sine-based sequence, fires rAF once on a `_renderStarted` handshake [S: [deterministic-injection.js](https://github.com/mrdoob/three.js/blob/dev/test/e2e/deterministic-injection.js)] | Still frames of examples | Only one frame; workers need a source rewrite (they rewrite `Math.random()` in served build files) [S: [puppeteer.js](https://github.com/mrdoob/three.js/blob/dev/test/e2e/puppeteer.js)] |
| Engine headless mode | Phaser `type: Phaser.HEADLESS`, `audio: { noAudio: true }`, `banner: false`; `Game.headlessStep` runs updates without rendering [S: [Phaser 4.2.1 tests/helper.js](https://app.unpkg.com/phaser@4.2.1/files/tests/helper.js), [Phaser 4.0.0 Game.js](https://app.unpkg.com/phaser@4.0.0/files/src/core/Game.js)] | Scene logic in Vitest/Node with real Game Objects | Phaser's own test helper still lets the loop run on its own; manual driving of `game.step(time, delta)` is not documented [U] |

**[O]** The game-owned step is the primary path for both stacks. Playwright's clock is the
fallback for games without hooks. Page injection is a trick for still frames only.

### 2.3 Randomness

- **[S: repo]** New Hope gameplay calls `Math.random` in `police.ts` L83 (unit timers),
  `actors.ts` L173 (walk phase), `fx.ts` L24–26 (rain), `audio.ts` (noise buffers) and
  `main.ts` L283 (a new district seed). The city itself is deterministic (citygen).
- **[S]** game-creator seeds only at test time by overriding `Math.random` (game-creator.md §4.4).
  three.js does the same for its screenshots (above).
- **[O]** Put one seeded PRNG into the game (`rng = mulberry32(seed ^ runSalt)`), pass it to
  police, traffic, crowd and FX; keep audio noise on `Math.random` (it never affects state or
  pixels we compare). Then "same seed + same script ⇒ same `state()`" becomes a check. This is
  the conclusion of game-creator.md §7.1 item 2 ("determinism must live in the generator"),
  extended from the city to the gameplay.

### 2.4 The hook surface

- **[S]** The convention across `develop-web-game` and game-creator: `render_game_to_text()`
  (compact JSON, a coordinate-system note, mode, score, player, visible entities) and
  `advanceTime(ms)`; one canvas; the client is re-run after every meaningful change
  ([skills.sh](https://skills.sh/openai/skills/develop-web-game); game-creator.md §4.1).
- **[S: repo]** New Hope's `__nh` already has the verbs (`advance`, `key`, `teleport`, `place`,
  `look`, `info`, `jobs`, `police`, `wanted`, `pass`, `psi`, `crowd`, `rain`) but no single
  `state()`, no `shot()`, no `errors()`, no invariants and no seed for gameplay
  (`main.ts` L336–378).
- **[S: repo]** PixelDen has **no global game handle**. `/game-upgrade` §6 tells the agent to
  walk the React fiber of the canvas's parent to find an object with `.scene && .events && .loop`,
  and to add temporary `?cheat` hooks that must be removed before commit. All games are created
  in one place: `app/components/game-canvas.tsx` L404 (`new Phaser.Game({...config})`).
- **[S]** WebMCP lets a page register tools (`registerTool` with name, description, input
  schema); Chrome's docs moved the example from `navigator.modelContext` to
  `document.modelContext` in May 2026, and it is an early preview behind a flag
  [refuted 2026-10-14: the page (published 2026-05-18, updated 2026-09-21) uses
  `document.modelContext` throughout and says nothing about a move; it carries an "Origin
  trial" badge, not a flag. Third-party blogs date the `navigator`→`document` move to July 2026
  with `navigator.modelContext` deprecated in Chrome 150 and the origin trial running Chrome
  149–156: unconfirmed]
  ([Chrome WebMCP imperative API, 2026-05-28](https://developer.chrome.com/docs/ai/webmcp/imperative-api);
  search results conflict on the Chrome version [U]). Chrome DevTools MCP can list and call them
  [S: tool reference]. **[O]** Promising for "the game describes its own test verbs", too early
  to depend on; a plain `window.__test` object costs nothing and can be wrapped later.

---

## 3. Headless WebGL: the options

| Renderer | How | Speed / fidelity | Use for |
|---|---|---|---|
| SwiftShader (SwANGLE) | `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader` [S: Chromium doc] | Slow: game-creator saw 7–9 FPS (game-creator.md §4.4); Table Slayer's suite took 5+ min per test [S: Snider] | Deterministic goldens in a pinned container; correctness smoke |
| Mesa llvmpipe | Picked up from the system GL on Linux runners | ~3× faster than SwiftShader in one report (1.6 min vs 5+ min) [S: Snider] | Faster software runs; different pixels from SwiftShader, so separate baselines |
| Mesa Lavapipe (Vulkan) | three.js CI: `VK_DRIVER_FILES=…/lvp_icd.x86_64.json`, `--enable-features=Vulkan --disable-vulkan-surface --ignore-gpu-blocklist` [S: three.js puppeteer.js] | Enough for 400×250 screenshots of every example, split across 5 CI jobs [S] | The three.js way; Linux only |
| Real GPU, Linux | Headed Chromium under `xvfb-run`, `--use-angle=vulkan --enable-features=Vulkan --use-gl=angle --ignore-gpu-blocklist`, `modprobe nvidia nvidia_uvm` [S: Snider] | T4: canvas loads < 1 s, suite 1.4 min; GPU minutes cost 3–4× but runs were shorter [S] | Perf in CI (we have none) |
| Host Chrome via DevTools MCP | What New Hope and `@whz/runtime` parity do now [S: repo READMEs] | Real M4 GPU, real timings | Owner-machine perf, WebGL2 parity, final visual pass |

Further facts and traps:
- **[S]** Playwright's default headless is the "chromium headless shell"; `channel: 'chromium'`
  selects new headless, "the real Chrome browser" [unconfirmed quote; the page says "You can
  opt into the new headless mode by using 'chromium' channel"], and branded Chrome/Edge always use new headless
  ([Playwright browsers](https://playwright.dev/docs/browsers)). Expect different GPU behaviour
  between them [O].
- **[S]** `--disable-gpu` breaks WebGL on Chrome 130+ unless SwiftShader is explicitly allowed
  (a chromedp fix and a third-party CLI commit; secondary)
  ([chromedp v0.14.1](https://chromium.googlesource.com/external/github.com/chromedp/chromedp/+/refs/tags/v0.14.1)).
- **[S]** A successful screenshot proves nothing: headless WebGPU without its flag yields a
  silent black canvas; Vercel's agent-browser guide checks the screenshot's pixel standard
  deviation and waits for two rAFs after load
  ([vgpu.labs.vercel.dev](https://vgpu.labs.vercel.dev/guides/agent-browser-webgpu)).
- **[O]** Every run must log the renderer string (`WEBGL_debug_renderer_info` →
  `UNMASKED_RENDERER_WEBGL`) next to its results. A golden or a perf number without the
  renderer is meaningless.

---

## 4. Screenshot diffing and its traps

1. **Cleared drawing buffer.** WebGL clears after compositing; reading later returns blank.
   Fix: `preserveDrawingBuffer: true` (costs performance, set at context creation) or read in the
   same task that rendered [S: [webglfundamentals tips](https://webglfundamentals.org/webgl/lessons/webgl-tips.html)].
   New Hope creates its renderer without it (`main.ts` L26) [S: repo]. **[O]** Do not turn it on
   globally; make `shot()` call `composer.render()` and `canvas.toDataURL('image/png')` in one
   synchronous block.
2. **Composited page vs canvas pixels.** A page screenshot includes DOM overlays (New Hope's HUD
   is DOM; PixelDen has cookie banners and modals), hover states and scrollbars. Playwright warns
   to move the mouse away (`page.mouse.move(-1,-1)`) [S: [Playwright snapshots](https://playwright.dev/docs/test-snapshots)];
   PixelDen already uses `game.renderer.snapshot()` when chrome covers the canvas [S: repo].
3. **Per-host baselines.** Playwright names baselines per browser and platform
   (`chromium-darwin`) and says rendering "can vary based on the host OS, version, settings,
   hardware"; generate and compare in one environment [S: Playwright snapshots].
4. **Threshold semantics differ.** pixelmatch's `threshold` default is 0.1 (colour distance,
   not a share of pixels) and it skips anti-aliased pixels unless `includeAA: true`
   [S: [pixelmatch](https://github.com/mapbox/pixelmatch), ISC]; Playwright's default is 0.2
   [S]. three.js uses 0.1 per pixel and 0.1 % of pixels, on 400×250 JPEG references
   [S: three.js puppeteer.js]. game-creator uses `maxDiffPixels` up to 3000 because "parallax
   clouds scroll" (game-creator.md §4.4); that would miss a missing character [O].
5. **Device pixel ratio.** Willison's agent tested at DPR 1; on real phones a `cssText`
   assignment wiped Three.js's inline sizing and the canvas rendered at 2× [S: Willison].
   **[O]** Every visual check runs at DPR 1 and DPR 3 (`emulate viewport "390x844x3,mobile,touch"`).
6. **Time-driven shaders and post FX.** New Hope's sky, windows and bloom read time; rain is
   random. Freeze `time` and seed FX, or exclude them (a `look` preset with rain off) [O].
7. **Retries hide flakes.** Retries "might hide actual failures that only happen a fraction of
   the time" [S: [Sourcegraph CI write-up](https://sourcegraph.com/blog/how-we-run-end-to-end-e2e-tests-in-buildkite-ci)];
   three.js does not retry at all [S].
8. **JPEG.** Never for goldens of pixel art (ref-sakura-crossing.md §5); three.js uses JPEG 95
   for photographic examples only [S].

**[O] Policy:** exact hashes only for deterministic frames in one pinned renderer (our
`@whz/runtime` parity already does this); for 3D gameplay use (a) a non-blank / histogram check,
(b) numeric state checks, (c) a tolerance diff as a smoke signal that sends a contact sheet to a
reviewer, never as the verdict.

---

## 5. Numeric state checks

- **[S]** sakura-crossing's rule "count draw calls, not ms" and `renderer.info` in its shot
  results (ref-sakura-crossing.md §5).
- **[S]** three.js `renderer.info`: `render.calls`, `render.triangles` per frame,
  `memory.geometries`, `memory.textures` live counts; `autoReset` (default `true`) resets per
  `render()` call, so apps with several passes "must call `renderer.info.reset()` once per frame
  manually" with `autoReset = false` ([three.js Info docs](https://threejs.org/docs/pages/Info.html)).
  New Hope renders through an `EffectComposer` with bloom, so `__nh.info()` today reports the last
  pass only [O, inferred from `main.ts` L321 `composer.render(dt)`; verify] [confirmed
  2026-10-14: three.js r180 `WebGLRenderer.render()` runs `if (this.info.autoReset === true)
  this.info.reset();` just before "// render scene", so every composer pass that calls
  `renderer.render` zeroes the counters; after `composer.render()` they hold the last pass. Note
  the docs' condition is "apps which manage their own animation loop", not "several passes";
  and the `Info.html` page documents the WebGPU `Info` class, while r180 `WebGLInfo` has
  `render.{frame,calls,triangles,points,lines}` and `memory.{geometries,textures}`].
- **[O] New Hope invariants** (each a function returning `{ok, detail}`, run after every
  `advance`):
  - no `NaN` in any position or velocity; Kylo's feet ≥ floor at his cell minus 0.05 m;
    a car's AABB not inside a solid cell (from `world.ts`);
  - heat cools: with no new crimes, stars drop by 1 per ≤ 10 s out of sight (README rule);
  - a job target is reachable (pad on a roof that `world.ts` says is walkable/landable);
  - counts bounded: crowd ≤ N, police units ≤ stars × k, live geometries/textures equal before
    and after 10 district switches (leak check);
  - per-frame budget: `render.calls` ≤ B₁, `render.triangles` ≤ B₂ at fixed camera poses.
- **[O] PixelDen invariants:** `state().mode` in a known set; score never negative, never
  `NaN`; restart returns score 0; one `/api/scores/<slug>` request on game over (already in
  `/new-game` §5); no console error; no 404 under `/assets/games/<slug>/`.

---

## 6. Scripted playthroughs and bots

- **[S]** Action scripts: `develop-web-game` ships `action_payloads.json` (keyboard + mouse,
  frames per step, capture per frame); game-creator's iterate client replays
  `{buttons, frames, mouse_x, mouse_y}` and stops on the first new console error; it also runs
  N restart cycles (game-creator.md §4.2).
- **[S]** Design-intent tests: "a no-input win is a bug", active input must win
  (game-creator.md §4.4). Anthropic's sprint contracts list explicit criteria per feature (27
  for one level-editor sprint) before code is written
  [S: [harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)].
- **[S]** Willison's agent verified a guard-dog chase by **teleporting the player next to the
  dog, reading state, then taking one screenshot**, and ran playthroughs for pickup, banking,
  chase/caught, dawn, night progression and lose/retry on desktop, portrait and landscape
  ([Willison](https://simonwillison.net/2026/Aug/5/raccoon-heist/)). That is exactly the shape
  New Hope's `teleport`/`place`/`wanted` verbs allow.
- **[S]** Bots on a simulator, not the client: EA rebuilt The Sims Mobile's core rules as a
  separate app reading the game's JSON tuning, got ~1000× speed and ~1000 actions/s, used A*
  with designer heuristics, and found a tuning exploit (an event best "won" by letting it time
  out) [unconfirmed: not found in the paper's text] and a 3× imbalance between event types
  [refuted 2026-10-14: the paper reports the Romantic relationship's second event needing
  "about two times more experience than any other second event" (13 appointments vs fewer for
  Friendship/Rivalry); no 3× figure]
  ([Silva et al., arXiv 1811.06962](https://arxiv.org/abs/1811.06962), 2018, old but the clearest
  case). Driving the real client was too slow and broke with every build [S: same].
- **[S]** VLM agents cannot play: best 0.48 % completion on VideoGameBench; failures at
  dragging, 2D grid navigation and clicking
  ([arXiv 2505.18134](https://arxiv.org/abs/2505.18134v2), May 2025).
- **[O]** Bots must read state and act through the hook API, never through pixels. For PixelDen
  games with a pure `engine.ts` (arcane-spires, ember-rise, hophazard, sudoku…), write bots in
  Vitest and run thousands of seeds; for Phaser-only games, a script through `__pd.step`.
  For the Kairosoft sims, `@whz/sim` replays are already this simulator.

---

## 7. Performance regression tests

- **[S]** A 2012 WebGL perf harness ran ≥ 10 frames and ≥ 300 ms per test and reported the
  median; its authors said such tests only catch regressions "in a given browser and system"
  ([Khronos public_webgl](https://www.khronos.org/webgl/public-mailing-list/public_webgl/1203/msg00159.php)).
- **[S]** On software renderers, timing is noise: Table Slayer's suite took 5+ min on
  SwiftShader and 1.4 min on a T4 (Snider). game-creator lowered its FPS threshold to > 5 in
  headless (game-creator.md §4.4).
- **[S]** Chrome DevTools MCP gives the host-side tools: `performance_start_trace` /
  `stop_trace` / `analyze_insight`, `emulate` with `cpuThrottlingRate` and a viewport string,
  and heap snapshots with `compare_heapsnapshots` (most memory tools need
  `--memoryDebugging=true`) [S: tool reference].
- **[S]** The player complaint about a 40k-line agent-built Three.js game was performance on
  low-end hardware, discovered after the jam ([itch.io](https://itch.io/post/16024370)).
- **[O] Two tiers:**
  - **CI / Docker (any renderer):** counts only — draw calls, triangles, geometries, textures,
    `performance.memory`-style heap where available, bundle size, load requests. Compare against
    a committed `perf-budget.json` with a ±5 % band.
  - **Host (owner's M4, pinned Chrome):** a "bench" script: fixed seed, fixed camera path,
    600 frames via the real rAF loop, report median and p95 frame time, plus the same under
    `cpuThrottlingRate: 4` as a low-end proxy. Store results with the renderer string and the
    Chrome version; compare only like with like.

---

## 8. Browser-automation MCPs used by coding agents

| Tool | What it gives an agent | For games |
|---|---|---|
| **Chrome DevTools MCP** (Google, public preview 2025-09-23, Apache-2.0) | `evaluate_script` (function or a file via `sourcePath`, output to `filePath`), `take_screenshot` (PNG/JPEG/WebP, element `uid`, `filePath`), console with source-mapped stacks, network, traces, `emulate`, heap tools, `--isolated`, `--viewport`, `--chrome-arg`, `--slim` (3 tools) [S: [Osmani](https://addyosmani.com/blog/devtools-mcp/), [README](https://github.com/ChromeDevTools/chrome-devtools-mcp), tool reference, configuration] | Our current path. `evaluate_script` + `__nh`/`__pd` is the whole protocol; `filePath` keeps images out of context |
| **Playwright MCP** (Microsoft, Apache-2.0) | Accessibility-tree snapshots by default; `--caps=vision` for coordinate clicks; `browser_evaluate`; its README now says coding agents "might benefit from using the CLI+SKILLS instead" (token cost) [S: [playwright-mcp](https://github.com/microsoft/playwright-mcp)] | The a11y tree sees nothing inside a canvas [O]; useful only for the DOM around the game |
| **Puppeteer MCP** (Anthropic's harness) | Browser e2e as a user; **cannot see browser-native `alert` modals** [S: [Anthropic, long-running](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)] | Avoid native dialogs in games |
| **agent-browser** (Vercel, CLI over CDP) | `--webgpu`, auto-Xvfb, `doctor` self-check [S: Vercel guide] | Ideas for a self-check before a run |

**[O]** Split: MCP for exploration and one-off verification in a session; a **checked-in
script** (Node + Playwright, or a JS file passed to `evaluate_script` via `sourcePath`) for
anything repeatable. A repeatable check that lives only in a prompt will drift.

---

## 9. Visual verification by LLMs: what works

- **[S]** VideoGameQA-Bench (NeurIPS 2025 D&B; v2 2025-12-18), best model per task: image glitch
  detection 82.8 %, video glitch detection 78.1 %, visual unit testing 53.0 %, UI unit testing
  40.0 %, visual regression 45.2 %, needle-in-a-haystack 36.0 %, bug reports ~52–54 %; "Visual
  regression testing remains one of the most challenging tasks for VLMs"
  ([arXiv 2505.15952](https://arxiv.org/html/2505.15952v2)). Temporal glitches are harder than
  spatial ones [S, secondary: TempGlitch abstract via search].
- **[S]** Claude vision: images are read in 28×28-px patches; Claude 4.7+ models (our Opus 5.5)
  take up to 2576 px on the long edge / 4784 visual tokens; counting and localisation are
  "approximate"; images under 200 px are unreliable; animated images use the first frame only
  ([Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). Our own
  measurements (Read resamples to 2000 px; 4× zoom minimum for pixel art) are in
  [docs/looking-at-images.md](../docs/looking-at-images.md) and still apply to Claude Code's
  Read tool.
- **[S]** Anthropic: agents "confidently praise the work"; out of the box Claude found real
  issues and then "talk[ed] itself into deciding they weren't a big deal"; a separate evaluator
  with few-shot calibration and hard per-criterion thresholds fixed it
  ([harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)).
- **[S]** Willison: the agent's screenshots caught an invisible raccoon on mobile, but it did
  not notice a wrongly applied metal texture or title art cropped to its top third, and the game
  was "very, very easy to beat" (Willison).

**[O] What to ask an LLM reviewer:** single-frame, binary, named questions with a reference
image ("Is Kylo visible and standing on the roof? Is the HUD readable? Is anything black,
magenta or stretched?"), on an upscaled contact sheet of fixed camera poses, by a sub-agent that
returns text only. **Not** "does it look good", not regressions between two similar frames
(use a pixel diff), not animation timing (use numbers), not fun (owner playtest).

---

## 10. Postmortems of agent-built games

- **fly.pieter.com (levels.io, 2025-02-22).** Built "mostly live on X", "100% with Cursor" in
  about 3 h by his account, $1 M ARR in 17 days (self-reported)
  [S: [levels.io](https://levels.io/full-multiplayer-python-websockets-game-ai);
  [404 Media](https://404media.co/this-game-created-by-ai-vibe-coding-makes-50-000-a-month-yours-probably-wont)]
  [attribution fixed 2026-10-14: "mostly live on X" and "$1M ARR in just 17 days" are on
  levels.io; "made my own flight simulator 100% with Cursor in I'd say 3 hours" is Levels quoted
  by Decrypt (2025-02-26); 404 Media (2025-03-05) says "$50,000 a month" and "in just 30 minutes
  with AI tools" and mentions neither Cursor nor the ARR figure].
  **No written postmortem on bugs, testing or cheating was found**; the build log lives in an X
  thread I could not read [U]. Critics note thin mechanics; one senior developer estimated
  "x100–1000 the effort" to make it work well for many players [S: via
  [Decrypt](https://decrypt.co/?p=307892)]. **[O]** Lesson for us: the business result came from
  instant load + spectacle, not from depth; it says nothing about how to keep a game healthy.
- **Vibe Jam 2025 (April 2025).** ≥ 80 % AI-written, instantly playable, no login, no loading
  screens, own domain, Three.js recommended; 1,000+ entries; winners: The Great Taxi Assignment,
  Vibeware, Vector Tango ([vibejam.com/2025](https://vibejam.com/2025/)). No testing or judging
  method published [S: same].
- **Raccoon Heist (Simon Willison, 2026-08-05).** One prompt, Claude Code for web, ~35 min,
  7 commits, Playwright screenshots and automated playthroughs at three viewports; bugs found:
  2× canvas on phones (DPR), a tap-swallowing inherited CSS overlay; verdict "mediocre" as a game
  (Willison). The same prompt in another agent gave a better game [S: same].
- **Retro game maker (Anthropic, 2026-03-24).** Solo run (20 min, $9): "entities appeared on
  screen but nothing responded to input" — the entity definitions were not wired to the runtime.
  Full planner/generator/evaluator harness (6 h, $200): playable, with rough physics
  (harness design).
- **Abduction Run (AI Browser Game Jam 2).** react-three-fiber, ~40 k lines, 1,500+ commits,
  "100 % agent-written", 4–5 parallel Claude/Codex sessions; problems: performance on low-end
  hardware, third-party asset quirks (scale, facing, clip indexes) needing babysitting
  ([itch.io](https://itch.io/post/16024370); date not shown [U]; the page showed "162 days
  ago" on 2026-10-14, so about 2026-05-05).

**[O] Common pattern:** the failures that reach players are in conditions the agent did not
test (phone DPR, touch, low-end GPU) or in wiring that compiles and renders but does not respond.
A protocol must therefore test **input → state change** and **more than one device profile**,
not "the page loads and looks plausible".

---

## 11. Agent workflows that keep a game codebase healthy

- **[S]** Anthropic's long-running harness: an initializer writes `init.sh`, a progress file and
  a **JSON feature list** (`category`, `description`, `steps`, `passes: false`); coding sessions
  may only flip `passes`; JSON because models overwrite Markdown more readily; one feature per
  session; failure modes: declaring victory early, marking features done after unit tests or
  `curl` only ([long-running harnesses, 2025-11-26](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)).
- **[S]** Separate the evaluator from the generator; give it hard thresholds; calibrate it by
  reading its logs (harness design; [InfoQ summary, 2026-04-04](https://www.infoq.com/news/2026/04/anthropic-three-agent-harness-ai/)).
- **[S]** Claude Code skills: `SKILL.md` under 500 lines with supporting files loaded on demand;
  `context: fork` runs a skill in a sub-agent that does not see the conversation (fits a QA
  runner); `disable-model-invocation: true` for side-effect flows such as ship/deploy
  ([Claude Code skills docs](https://code.claude.com/docs/en/skills)).
- **[S]** Agent knowledge bases drift from code within days (ref-threejs-punk.md); we already
  gate docs against the repo ([docs/docs-check.md](../docs/docs-check.md)).
- **[S: repo]** PixelDen's `/game-upgrade` already has: playtest audit before code, a plan with
  `→ verify:` per item, "two consecutive verification failures → stop", a `Verified:` line in the
  commit and a ledger. game-creator adds an attempt ledger so a fixer does not repeat a failed
  approach (game-creator.md §4.3).
- **[O]** What is missing in both repos: the checks are prose in a command file, run by hand
  through MCP each time. Move them into a script the gate runs, and keep the prose for judgement.

---

## 12. Proposed test protocol

### 12.1 One contract for both stacks: `window.__test`

**[O]** A tiny, versioned interface every game exposes in dev and test builds (stripped from
production by `import.meta.env.DEV || ?test=1`). New Hope keeps `__nh` as its rich console and
adds `__test` as the stable subset; the Wallhammer player (`__wz` in the queued task) implements
the same subset.

```ts
interface GameTest {
  v: 1;
  info(): { game: string; build: string; seed: number; renderer: string; dpr: number;
            w: number; h: number };
  state(): object;          // JSON: coords note, mode, score, player, counts; no pixels
  step(frames: number): object;        // fixed 1/60 s steps, no rAF; returns state()
  seed(n: number): void;    // gameplay RNG (not the world seed)
  input(e: { key?: string; down?: boolean; tap?: [number, number] }): void;
  shot(opts?: { pose?: string }): string;  // PNG data URL, rendered and read in one task
  metrics(): { calls: number; tris: number; geometries: number; textures: number;
               heapMB?: number };
  check(): { ok: boolean; fails: string[] };  // game invariants
  errors(): string[];       // console errors and unhandled rejections since load
  run(script: Script): RunResult;     // steps + inputs + expectations; stops on first fail
}
```

A script is data: `[{ "input": {"key":"KeyW","down":true} }, { "step": 120 },
{ "expect": "state.player.y > 20" }, { "shot": "roof-a" }]`. Expectations are paths and
comparisons, not code (so a script can be shown and edited in the studio).

### 12.2 Tiers

| Tier | What | Where | Gate? |
|---|---|---|---|
| T0 static | typecheck, lint, build, data validation | Docker (`./dev npm run check`, `task …`) | yes (exists) |
| T1 logic | pure engine/sim tests; bots over many seeds; New Hope `world.ts` collision/floor tests in Node | Docker | yes |
| T2 boot smoke | load, `info().renderer` logged, 0 console errors, 0 404s, canvas not uniform (pixel std-dev > ε) | Docker Playwright + SwiftShader **if the owner allows Playwright in the dev image**; else host via DevTools MCP | yes once in Docker |
| T3 scripted play | the game's scripts: each feature's `input → state change`, design-intent (idle loses), restart cycles, `check()` after every step, same-seed replay equality | same as T2 | yes |
| T4 visual | `shot()` at fixed poses × {DPR 1, DPR 3 mobile}; exact hash where frozen, else non-blank + an upscaled contact sheet to a text-only reviewer sub-agent with named questions | host (GPU) or Docker for goldens | advisory |
| T5 perf | counts vs `perf-budget.json` (any renderer); median/p95 frame time + 4× CPU throttle on the owner's M4 | counts in Docker; ms on host | counts yes, ms advisory |
| T6 playtest | the owner plays; vague feedback → measurable criterion (game-creator's playtest-repro) | owner | the real verdict |

### 12.3 New Hope (Three.js)

1. Fixed-step accumulator; `advance` and the real loop share `step()` (§2.1).
2. A seeded gameplay RNG for police, crowd, traffic, rain (§2.3); `?seed` stays the world seed.
3. `__test.shot(pose)`: named camera poses (`roof`, `street`, `sky-lane`, `car-chase`) with
   rain off and time frozen; render through the composer and `toDataURL('image/png')` in one call.
4. `renderer.info.autoReset = false` and one `reset()` per frame, so `metrics()` covers bloom
   passes too.
5. Scripts in `packages/new-hope-play/test/scripts/*.json`: walk to a lift and ride it up; get in
   a car and land on the job pad (`target()`); steal a cruiser → stars ≥ 1 → arrest after 3 s →
   credits −30 %; pass into a body seen/unseen by a guard (±stars); switch district 10× → no
   geometry/texture growth.
6. A runner `packages/new-hope-play/test/run.mjs` that a session points Chrome DevTools MCP at
   (`evaluate_script` with `sourcePath`) today, and that Playwright runs in Docker later. Results
   go to `build/runs/new-hope/<timestamp>/` (`result.json`, `metrics.json`, `shots/*.png`), which
   the studio can list as "build progress".

### 12.4 PixelDen (Phaser 4)

1. In `app/components/game-canvas.tsx` (the one place every `Phaser.Game` is created), register
   `window.__pd` in dev/test: `game`, `scene(key)`, `state()` (calls an optional per-game
   `testState(scene)` export), `step(frames)` (pause the loop, call `game.step(t, 16.67)` per
   frame — [U], verify on Phaser 4.0.0), `shot()` via `game.renderer.snapshot`, `errors()`.
   This replaces the React-fiber walk and the temporary `?cheat` hooks in `/game-upgrade` §6.
2. Per game, optional `app/games/<slug>/test.ts` exporting `testState`, `scripts` and
   `invariants`. Games with a pure `engine.ts` get Vitest bots: idle loses within N steps, a
   greedy policy scores > 0, no `NaN`, 1,000 seeds.
3. Keep the proven input recipe (`MouseEvent` with `view: window` after
   `game.scale.updateBounds()`) inside `__pd.input` so no agent rediscovers it.
4. Mobile pass at DPR 3 with touch, as Willison's DPR bug shows a DPR-1 pass is not enough.
5. `/new-game` and `/game-upgrade` §5/§6 then say "run `__pd.run(scripts)`, paste the result
   line"; the `Verified:` commit line quotes the run id.

**Note [S: repo]:** PixelDen's lockfile pins `phaser@4.0.0`, but the host `node_modules`
contains `phaser@3.90.0` (stale host install; the container has its own) — any check must run in
the container.

### 12.5 The QA sub-agent

**[O]** One forked skill (`context: fork`) per stack runs T2–T5 and returns only:
`QA <game> <run-id>: PASS|FAIL`, one line per tier, failing expectations with tick and path,
the renderer string, and file paths of shots — no images in the reply (as game-creator does,
game-creator.md §4.3). The fixer gets the failure plus the attempt ledger; two failures on the
same item stop the run (PixelDen's rule).

---

## 13. What this means for us

- **New Hope:** already 70 % of a protocol (`__nh`). The cheap, high-value steps are a seeded
  gameplay RNG, a fixed-step loop, `state()`/`check()`/`shot()`/`metrics()` and five JSON
  scripts. Visual checks stay on the host GPU; correctness can move to Docker once Playwright +
  SwiftShader is allowed in the dev image.
- **Wallhammer player (task #18):** the `__wz` design in the queued note matches this report;
  add `info().renderer`, `metrics()`, `check()` and the DPR-3 pass to its acceptance.
- **Studio:** a run directory (`build/runs/<game>/<run>/`) is the natural feed for "show the
  build's progress": the studio lists runs, tiers, failing expectations and shot sheets; the
  owner's verdicts stay on assets and playtests.
- **PixelDen:** one hook in `game-canvas.tsx` removes the fiber walk and the cheat hooks from
  every future `/new-game` and `/game-upgrade` run; ~40 games [refuted 2026-10-14: 55 game
  folders under `app/games/` and 54 `slug:` entries in `app/games/registry.ts`] can adopt
  `test.ts` gradually.
- **LLM review:** keep it for glitch spotting on contact sheets with named questions; never let
  it gate regressions or fun.

---

## 14. Open questions for the owner

1. May the Docker dev image (Wallhammer) and the PixelDen container include Playwright with its
   Chromium (installed inside the image, not on the host), so T2–T3 join the gate?
2. Is gameplay determinism for New Hope worth the refactor now (seeded RNG + fixed step), or
   only after the next playable milestone?
3. Should PixelDen get a permanent dev-only `window.__pd` hook in `game-canvas.tsx`, replacing
   the "temporary `?cheat` hooks, removed before commit" rule?
4. Perf budgets: which device is the low-end target for New Hope and for PixelDen (a phone
   model or "M4 with 4× CPU throttle")?
5. Should the studio show test runs (tiers, failures, shot sheets) as the "build progress" page,
   or is that a separate view?

---

## Sources

Dates are publication or last-update dates where shown; "n.d." means none was shown.

**Repo files read (2026-10-14):** `research/game-creator.md`, `research/ref-sakura-crossing.md`,
`research/studio-stack.md`, `research/README.md`, `tasks/2026-10-02-player-loop-test-protocol.md`,
`packages/new-hope-play/README.md`, `packages/new-hope-play/src/main.ts`,
`packages/runtime/README.md`, `docs/looking-at-images.md`, `docs/DECISIONS.md`;
PixelDen `CLAUDE.md`, `.claude/commands/new-game.md`, `.claude/commands/game-upgrade.md`,
`app/components/game-canvas.tsx`, `pnpm-lock.yaml`.

**Time, hooks, engines**
- Playwright, Clock (n.d.): https://playwright.dev/docs/clock
- Glenn Fiedler, Fix Your Timestep (2004-06-10): https://gafferongames.com/post/fix_your_timestep/
- OpenAI skills, develop-web-game (listing, n.d.; licence not checked): https://skills.sh/openai/skills/develop-web-game
- game-creator game-qa listing (first seen 2026-02-21): https://skills.sh/opusgamelabs/game-creator/game-qa
- Phaser 4.2.1 tests/helper.js (2026-07): https://app.unpkg.com/phaser@4.2.1/files/tests/helper.js
- Phaser 4.0.0 src/core/Game.js (2026-04-10): https://app.unpkg.com/phaser@4.0.0/files/src/core/Game.js
- Phaser 4 download page (v4.0.0 2026-04-10): https://phaser.io/download/phaser4
- Chrome WebMCP imperative API (2026-05-28) [refuted 2026-10-14: page says published 2026-05-18, last updated 2026-09-21]: https://developer.chrome.com/docs/ai/webmcp/imperative-api
- blink-dev, Intent to Remove: SwiftShader Fallback (2025-02-13; added 2026-10-14 as the source for "Chrome 130"): https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ

**Headless WebGL and screenshots**
- Chromium, Using Chromium with SwiftShader (main, n.d.): https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
- Samsung Internet policy, EnableUnsafeSwiftShader (n.d., states M139): https://developer.samsung.com/browser/policy/enable-unsafe-swift-shader.html
- chromedp v0.14.1, `--enable-unsafe-swiftshader` with `--disable-gpu` (n.d.): https://chromium.googlesource.com/external/github.com/chromedp/chromedp/+/refs/tags/v0.14.1
- Chrome for Developers, Supercharge Web AI model testing (2024-01-16): https://developer.chrome.com/blog/supercharge-web-ai-testing
- Dave Snider, GPU tests in CI (2026-02-23): https://davesnider.com/posts/gputests
- Playwright, Browsers (n.d.): https://playwright.dev/docs/browsers
- Playwright, Visual comparisons (n.d.): https://playwright.dev/docs/test-snapshots
- three.js test/e2e/puppeteer.js (dev branch, read 2026-10-14; MIT): https://github.com/mrdoob/three.js/blob/dev/test/e2e/puppeteer.js
- three.js test/e2e/deterministic-injection.js (dev branch; MIT): https://github.com/mrdoob/three.js/blob/dev/test/e2e/deterministic-injection.js
- three.js docs, Info (n.d.): https://threejs.org/docs/pages/Info.html
- pixelmatch (ISC, n.d.): https://github.com/mapbox/pixelmatch
- WebGL Fundamentals, tips (n.d.): https://webglfundamentals.org/webgl/lessons/webgl-tips.html
- Vercel, WebGPU screenshots with agent-browser (n.d., v0.33.0): https://vgpu.labs.vercel.dev/guides/agent-browser-webgpu
- Sourcegraph, e2e tests in Buildkite CI (older, n.d.): https://sourcegraph.com/blog/how-we-run-end-to-end-e2e-tests-in-buildkite-ci
- Khronos public_webgl, perf test methodology (2012-03): https://www.khronos.org/webgl/public-mailing-list/public_webgl/1203/msg00159.php

**Browser MCPs**
- Chrome DevTools MCP README (Apache-2.0, 2026): https://github.com/ChromeDevTools/chrome-devtools-mcp
- Chrome DevTools MCP tool reference: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md
- Chrome DevTools MCP configuration: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md
- Addy Osmani, Give your AI eyes: Chrome DevTools MCP (2025-09-25): https://addyosmani.com/blog/devtools-mcp/
- Playwright MCP README (Apache-2.0, 2026): https://github.com/microsoft/playwright-mcp

**LLM vision and agents playing**
- Taesiri et al., VideoGameQA-Bench (v2 2025-12-18; NeurIPS 2025 D&B): https://arxiv.org/html/2505.15952v2
- Zhang et al., VideoGameBench (2025-05; a v3 dated 2026-05-14 exists, not read): https://arxiv.org/abs/2505.18134v2
- Claude docs, Vision (n.d., read 2026-10-14): https://platform.claude.com/docs/en/build-with-claude/vision
- Silva et al., Exploring Gameplay With AI Agents (2018): https://arxiv.org/abs/1811.06962

**Postmortems and workflows**
- levels.io, fly.pieter.com post (2025): https://levels.io/full-multiplayer-python-websockets-game-ai
- 404 Media on fly.pieter.com (n.d., 2025 per search): https://404media.co/this-game-created-by-ai-vibe-coding-makes-50-000-a-month-yours-probably-wont
- Decrypt on fly.pieter.com (n.d., 2025 per search): https://decrypt.co/?p=307892
- Vibe Coding Game Jam 2025 (2025-04): https://vibejam.com/2025/
- Simon Willison, Raccoon Heist (2026-08-05): https://simonwillison.net/2026/Aug/5/raccoon-heist/
- itch.io, Abduction Run developer post (date not shown): https://itch.io/post/16024370
- Anthropic, Effective harnesses for long-running agents (2025-11-26): https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Anthropic, Harness design for long-running application development (2026-03-24): https://www.anthropic.com/engineering/harness-design-long-running-apps
- InfoQ, Anthropic three-agent harness (2026-04-04): https://www.infoq.com/news/2026/04/anthropic-three-agent-harness-ai/
- Claude Code docs, Skills (n.d., read 2026-10-14): https://code.claude.com/docs/en/skills

**Licences of code worth borrowing:** three.js e2e harness ideas (MIT), pixelmatch (ISC),
Playwright and both MCP servers (Apache-2.0) are fine to use or reference. OpenAI
`develop-web-game` and game-creator: ideas only (third-party skills; game-creator's licence is
unclear, see [research/README.md](README.md#licence-flags)).

---

## Verification (2026-10-14)

Adversarial check by a second session: 36 claims re-read against the cited pages or the code.
Every repo line number was re-counted in the working tree; every external number was fetched
from the cited URL (or the raw file behind it), not from memory.

**Confirmed (unchanged):**
- Repo, Wallhammer: `main.ts` L26 (`WebGLRenderer` without `preserveDrawingBuffer`), L283
  (`Math.random` for a new seed), L321 (`composer.render(dt)`), L326–333 (the rAF loop with
  `Math.min(0.05, …)`), L336–379 (`__nh` and its verbs), L373–377 (`advance` at `1/60`);
  `police.ts` L83, `actors.ts` L173, `fx.ts` L24/L26, `audio.ts` L51/63/70/223 use
  `Math.random`; `three` is `^0.180.0`; task #18 and `__wz` in
  `tasks/2026-10-02-player-loop-test-protocol.md`; game-creator.md §4 (flags, 3000 px, 7–9 FPS,
  > 5 FPS, `advanceTime` waits real time, Mulberry32 override); studio-stack.md L40/L572
  (Chrome 139, no flag named); ref-threejs-punk.md and `README.md#licence-flags` exist;
  docs/looking-at-images.md (2000 px, 4×).
- Repo, PixelDen: `game-canvas.tsx` L404 `new Phaser.Game({`; `pnpm-lock.yaml` pins
  `phaser@4.0.0`, host `node_modules/phaser` is 3.90.0; `game-upgrade.md` L99 (fiber walk), L102
  (`?cheat`, remove before commit), L70 (`→ verify:`), L105 ("Two consecutive verification
  failures on the same item → stop"), L117 (`Verified:` line), L98/`new-game.md` L79 (the
  `MouseEvent` + `updateBounds()` recipe), L83/L101 (`game.renderer.snapshot()`); `new-game.md`
  L81 (`/api/scores/<slug>`); `engine.ts` exists for arcane-spires, ember-rise, hophazard,
  sudoku (and 5 more).
- SwiftShader flags `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`
  (Chromium doc); "Starting in M139, WebGL context creation will fail" (Samsung policy);
  chromedp v0.14.1 commit title.
- Phaser: `Game.headlessStep(time, delta)` exists in 4.0.0 (since 3.2.0); `tests/helper.js` in
  4.2.1 uses `type: Phaser.HEADLESS`, `audio: { noAudio: true }`, `banner: false` and lets the
  loop run; v4.0.0 dated 2026-04-10, v4.2.1 2026-07-09.
- three.js e2e: `pixelThreshold = 0.1`, `maxDifferentPixels = 0.1` (%), 400×250 at
  `viewScale = 2`, JPEG 95, `numCIJobs = 5`, no retries (only a restart on "WebGPU Device
  Lost"), `VK_DRIVER_FILES=…/lvp_icd.x86_64.json`, `--enable-features=Vulkan
  --disable-vulkan-surface --ignore-gpu-blocklist`, `Math.random` rewritten in the build files;
  `deterministic-injection.js` sine-based `Math.random`, `Date.now`/`performance.now` → 0,
  rAF fires once on `_renderStarted`. `WebGLRenderer.preserveDrawingBuffer` default `false`.
- VideoGameQA-Bench: 82.8 / 78.1 / 53.0 / 40.0 / 45.2 / 36.0 / 54.0 & 52.0 %, the "most
  challenging" sentence, v2 2025-12-18; NeurIPS 2025 Datasets & Benchmarks track confirmed via
  proceedings.neurips.cc. VideoGameBench: "Gemini 2.5 Pro completes only 0.48 %".
- Chrome DevTools MCP: tool names (incl. `screencast_*`, extensions, PWA — not in the report),
  `evaluate_script` `sourcePath` (input) and `filePath` (output), `take_screenshot`
  `filePath`/`format`/`uid`, `emulate` `cpuThrottlingRate` + viewport string, `--slim` = 3
  tools, `--isolated`, `--chrome-arg`, `--memoryDebugging`; Apache-2.0; public preview
  announced 2025-09-23 (embedded @ChromiumDev post in Osmani's 2025-09-25 article).
- Playwright: `toHaveScreenshot` threshold 0.2, `-chromium-darwin` suffixes, "can vary based on
  the host OS, version, settings, hardware", `page.mouse.move(-1, -1)`; clock overrides
  `Date`, timers, rAF, `performance`, `install` must come first, `runFor` exists; headless shell
  vs `channel: 'chromium'`; Chrome/Edge use new headless. Playwright MCP: Apache-2.0,
  `--caps=vision`, `browser_evaluate`, "might benefit from using the CLI+SKILLS instead".
- pixelmatch: `threshold` 0.1 per-pixel colour distance, `includeAA` default `false`, ISC.
- Claude vision: 28×28 patches, 2576 px / 4784 tokens for "Claude 4.7 and later", < 200 px
  unreliable, first frame of animations, counts and coordinates "approximate".
- Snider (2026-02-23): 5+ min → 1.4 min on a T4, llvmpipe ≈ 1.6 min, canvas ≈ 30 s → < 1 s,
  flags and `xvfb-run`, `modprobe nvidia`, 3–4× per-minute cost. Chrome blog (updated
  2024-01-16): "By default, Headless Chrome disables GPU", Linux Vulkan flags only. Vercel
  agent-browser v0.33.0: `--webgpu`, auto-Xvfb, `doctor`, pixel std-dev, two rAFs, silent
  black canvas. Khronos 2012-03-29: > 10 frames, ≥ 300 ms, median, "only useful to catch
  performance regressions in a given browser and system". Sourcegraph (2018-09-14) retry quote.
- Anthropic effective-harnesses (2025-11-26): `init.sh`, `claude-progress.txt`, JSON feature
  list with `category/description/steps/passes`, JSON over Markdown, one feature per session,
  Puppeteer MCP cannot see native `alert`s, the two failure modes. Harness design
  (2026-03-24): 20 min / $9, 6 h / $200, "nothing responded to input", 27 criteria (Sprint 3),
  "talk itself into deciding they weren't a big deal", "confidently praising", few-shot
  calibration (its evaluator used **Playwright** MCP). InfoQ 2026-04-04. Claude Code skills:
  < 500 lines, `context: fork`, `disable-model-invocation: true`.
- Willison (2026-08-05): Claude Code for web, ≈ 34 min by timestamps, 7 commits, Playwright at
  desktop + two phone viewports, `cssText` DPR bug, tap-swallowing inherited CSS, teleport
  next to the dog, missed metal texture and cropped title art, "mediocre", "very, very easy to
  beat", Codex made a "significantly better" game. Vibe Jam 2025 rules, 1,000+ entries,
  winners. Abduction Run: r3f, ~40 k lines, 1,500+ commits, 4–5 parallel sessions, low-end
  performance, Synty asset quirks. Decrypt (2025-02-26): "x100-1000 the effort". skills.sh
  game-qa: `playableintelligence/game-creator`, first seen 2026-02-21, 1.0 K installs.
- Silva et al. (EA): "roughly thousand fold", "about a thousand actions every second", A*
  with designer-driven heuristics, client "could only be driven as fast as the client allowed"
  and "having to rewrite the agent every time a new build".

**Refuted or corrected inline (marked `[refuted 2026-10-14: …]`):**
1. "Deprecation started in Chrome 130 [S: same]": true, but neither cited page says it; the
   source is the blink-dev Intent to Remove (2025-02-13), added to Sources.
2. "`--viewport WxHxDPR` emulation string": the CLI option is `WxH`; the DPR string belongs to
   the `emulate` tool. WebMCP tools need `--categoryExperimentalWebmcp=true`.
3. WebMCP page "moved the example … in May 2026", "behind a flag", dated 2026-05-28: the page
   is published 2026-05-18 / updated 2026-09-21, shows only `document.modelContext`, and is an
   origin trial.
4. Silva "3× imbalance": the paper says about 2× (Romantic second event).
5. "~40 games" in PixelDen: 55 folders, 54 registry slugs.
6. fly.pieter attribution: the Cursor/3 h quote is from Decrypt, not levels.io/404 Media.
7. §5 `__nh.info()` "last pass only" upgraded from [O, verify] to confirmed against r180 source.

**Unconfirmed (marked `[unconfirmed]`):** `render_game_to_text`/`advanceTime` originating in
OpenAI's `develop-web-game` (page shows the client script and `action_payloads.json`, not the
function names; the skill's files were not read); Playwright's "`performance.now()` not
specified"; Silva's "event won by letting it time out"; Playwright's "the real Chrome browser"
quote; the WebMCP `navigator`→`document` move date (third-party blogs only).

**Gaps that matter for decisions:**
- No source in the report was checked for Phaser 4 driving `game.step()` by hand (the report
  already marks it [U]); the Phaser 4 `TimeStep` API would settle §12.4 item 1.
- The three.js `Info.html` docs page is for the WebGPU `Info` class; r180's WebGL `info` has
  fewer fields (no `drawCalls`, no sizes). §5's budget fields should use `render.calls` and
  `render.triangles` as the report does.
- Harness design's evaluator used Playwright MCP, not Puppeteer; the §8 Puppeteer row is
  correctly sourced to the 2025-11 article, but the two Anthropic posts should not be read as
  one setup.
- The OpenAI skill and game-creator licences remain unchecked (report says so).
- Nothing in the report was checked against Phaser 4.2.x changes (the lockfile pins 4.0.0;
  the host `node_modules` is stale 3.90.0, so a host-side grep of Phaser internals is wrong by
  construction).
