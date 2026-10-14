# Game-dev agent skills, commands, subagents and MCP servers: a survey (2025-2026)

*Research date: 2026-10-14. Status: proposal only.*

Scope: Claude Code skills, slash commands, subagents, MCP servers and AGENTS.md / Cursor-rules
setups for game development (Three.js, Phaser, WebGL, design, testing, pixel art, procedural
audio). Nothing was installed, cloned into the repo or copied. Repos were read through the GitHub
API and their web pages. This is a candidate list for the owner under the skill-intake rule
([security/skill-intake/README.md](../security/skill-intake/README.md)): any copy needs a
quarantine fetch, a skillspector scan, a triage and the owner's approval first.

Legend: **[S]** sourced (the link points to the source; all URLs are in Sources at the end),
**[O]** my opinion, **[U]** unverified. Star counts and dates come from the GitHub API on
2026-10-14 unless a line says otherwise.

---

## 0. Summary

1. **Two vendor-official skill sets exist, and the owner already uses one of them.** Phaser
   ships 28 skills in its own repo (`skills/` in phaserjs/phaser, MIT, last skill change
   2026-06-03) [S][s1]. PixelDen's `.claude/skills/phaser/` holds all 28. Every `SKILL.md` is byte-identical to
   upstream `master` today, but `v4-new-features/references/REFERENCE.md` is one upstream commit
   behind: it lacks the `MULTIPLY_TWO` tint mode added 2026-06-03 (checked by diff) [S, local]. Three.js has no
   skills, but it publishes official LLM docs: `llms.txt` (5.4 KB) and `llms-full.txt` (363 KB,
   includes TSL), in the repo since 2026-02-09 [S][s14].
2. **The best third-party Three.js game pack is `majidmanzarpour/threejs-game-skills`** (MIT,
   2.5k★, 9 skills, last commit 2026-09-28 "Tune skills for Claude Opus 5.5") [S][s5]. Its QA
   half is strong: an evidence manifest, a canvas-pixel inspector, a seeded test-hook contract
   and a bot playtest. Its asset half calls paid APIs (Tripo, Gemini, ElevenLabs), and a script
   sources the user's shell profile to probe API keys. **Recommendation: worth a scan, ideas only
   for now.** [O]
3. **The best cross-engine catalog is `gamedev-skills/awesome-gamedev-agent-skills`** (Apache-2.0,
   1.5k★, 74 skills, a router skill, a CI validator, and version baselines dated
   2026-09-25: Phaser 4.2, three.js r186) [S][s6]. Of the candidates I read, it is the most
   current and has the best engineering. **It is the one candidate I would scan with a view to
   installing parts of it** (the discipline skills, not the engine ones). [O]
4. **The test protocol that `research/game-creator.md` credits to game-creator came from OpenAI.**
   `window.render_game_to_text()` + `window.advanceTime(ms)` + a Playwright action-burst client
   is OpenAI's `develop-web-game` skill (Apache-2.0) [S][s7]. OpenAI **removed** that skill on
   2026-04-23 and replaced it with a `game-studio` plugin, which drops the protocol entirely: no
   text state, no time stepping [S][s8]. See §1 for what this changes. [refuted 2026-10-14:
   "replaced" overstates the sequence: `plugins/game-studio` first commit is 2026-03-13, six weeks
   before the removal; both existed side by side until 2026-04-23. The removal commit and the
   missing protocol are confirmed.]
5. **The trend in mature generators is fewer, thinner skills.** Godogen (7.1k★, MIT) cut its
   multi-stage skill pipeline down to a one-page runtime manifest and one engine guide on
   2026-07-02. Its stated reason was "removing guidance the current model no longer needs" [S][s11].
   Claude Code Game Studios (26k★) goes the other way, with 49 agents, 72 skills [refuted 2026-10-14: 74 `SKILL.md` under `.claude/skills/` and the README says 74] and 10+ hooks;
   a critic notes that all the "independent" reviewers are one model in one context [S][s9][s10].
   [O] For us the godogen direction is right. Write a few thick, project-specific skills with
   numeric gates, not a studio of personas.
6. **No third-party candidate fits our product rules as-is.** Most packs assume image-generation
   APIs for art, external TTS or music APIs for audio, `npm -g` or `pip --user` installs, and
   game code as the source of truth. That clashes with "graphics are code", "everything in
   Docker" and "games are pure data" (CLAUDE.md). [O]
7. **PixelDen has concrete version drift.** Its `phaser-gamedev` skill (forked from
   chongdashu/phaserjs-oakwoods, MIT) still says "Phaser 3" in its description and in 5
   reference files, while the repo runs Phaser 4 [S, local]. `app/games/ember-rise/scenes/game.ts:743`
   calls `setTintFill` through a type cast. Phaser 4 removed `setTintFill` [S][s1], and the
   repo's own `frost-hold` comment says it only logs an error now, so that flash is probably a
   no-op [U]. A Phaser-4 write guard (the idea in §3.3) would have caught it.

---

## 1. Corrections and updates to existing research

- **`research/game-creator.md` §Executive summary 6 and 11.** The "test protocol in every game"
  is not original to game-creator. OpenAI's `develop-web-game` (first commit in its current
  path 2026-01-31; game-creator was created 2026-01-28) has the same names: `render_game_to_text`,
  `advanceTime(ms)`, a Playwright client with frame-counted action bursts, and `progress.md` with
  an "Original prompt:" header [S][s7]. That skill is **Apache-2.0** (its `LICENSE.txt`).
  game-creator's licence is ambiguous ([licence flags](README.md#licence-flags)), so if we ever
  copy the client script, the Apache-2.0 original at commit `7796342` is the clean source. It
  still needs the intake. [O]
- **The protocol lost ground at OpenAI.** The successor `game-studio` plugin (MIT in
  `plugin.json`, but `openai/plugins` has no LICENSE file, so it counts as ambiguous) only says
  "when deterministic automation is not practical, do a structured manual pass" [S][s8]. [O] I
  read this as OpenAI optimising for breadth, not as evidence that the protocol fails. The
  strongest 2026 Three.js pack (s5) still has a seeded hook contract, and so do New Hope's
  `window.__nh` and PixelDen's `/new-game` verification.
- **game-creator status update.** 344★ (was 334). The last push is still 2026-05-25, so it has
  been idle for about 4.5 months [S][s12].
- **Headless WebGL.** The 2026-07-16 commit of s5 ("Fix headless Playwright rendering on
  SwiftShader instead of the GPU") and godogen's Babylon guide both say that headless Chrome
  falls back silently to SwiftShader or llvmpipe. Both read the WebGL `RENDERER` string and warn
  [S][s5][s11]. This matches our "containers have no GPU" rule. Any game-verify skill we write
  should assert the renderer string, not assume it. [O]

---

## 2. What the owner already has

### Owner's global skills (`~/.claude/skills`)

| Skill | Lines | What it is |
|---|---|---|
| `code-pixel-game` | 89 + 8 references + 5 scripts [refuted 2026-10-14: `scripts/` holds 9 files: cdp.mjs, crop-snap.js, errs.js, find-game.js, chrome.sh, key.js, montage.js, pv.js, pv.sh] | Code-drawn pixel games (from Gloop's Escape). The art kit, the render → look → revise loop, and a headless-Chrome review harness (`cdp.mjs`, `crop-snap.js`). It has a lessons log. |
| `dev-stage-orchestration` | 106 + a workflow template | Orchestrator + workers + live user feedback, with an escalation ladder. |
| `godot-game-testing` | 114 + 1 reference | Freeze/step game time, verify from state digests, keep visual checks in sub-agents. |
| `synced/…` | n/a | The claude.ai-synced Anthropic skills (docx, pdf, pptx, skill-creator and others). |

[S, local] [O] `godot-game-testing` already carries the right philosophy for a web `game-verify`
skill ("make the game observable on your clock, verify from data rather than pixels"). A web
version is mostly a port of that text to `window.__nh`-style hooks.

### PixelDen (`~/projects/nodejs/pixelden/.claude`)

| Item | Origin | Notes |
|---|---|---|
| `skills/phaser/` (28 skills, 532 KB of `SKILL.md`) | **phaserjs/phaser** official [S][s1] | All 28 `SKILL.md` match upstream `master` (diffed 2026-10-14; re-diffed by sha256 in verification: 28/28 identical). The copy dates from 2026-04-27 [refuted 2026-10-14: the files' mtime is 2026-04-25 01:21; `.claude/skills/phaser/*` is gitignored in PixelDen, so there is no commit date] and misses the one later change (2026-06-03, `v4-new-features/references/REFERENCE.md`: tint mode `MULTIPLY_TWO`). Upstream has 42 commits touching `skills/`. |
| `skills/phaser-gamedev/` (234 + ~4.4k lines) | Fork of **chongdashu/phaserjs-oakwoods** (MIT, 86★) [S][s3] | The owner extended it heavily (read-before-implement, pre-release-audit, raycasting, keyboard-in-React). It still says **Phaser 3** in its description and in `core-patterns.md`, `arcade-physics.md`, `keyboard-input.md`, `performance.md` and `tilemaps.md`. |
| `skills/pixellab/`, `skills/image-generation/` | Owner | PixelLab MCP and Gemini image pipelines. **Neither has YAML frontmatter**, so neither has a `description` for auto-triggering [S, local]; the docs say frontmatter is read only when `---` is the first line [S][s29]. |
| `skills/pixelart-cleanup/`, `lighthouse/`, `seo-*` | Owner | Not game-dev. |
| `skills/grill-me/`, `grilling/` | Matt Pocock's skill, the #2 most-installed skill on skills.sh (745k installs, 2026-08-04) [S][s31] | Third-party. There is no skill-intake record in PixelDen [O]. |
| `commands/new-game.md`, `commands/game-upgrade.md` | Owner | Ledger-driven flows: one run = one game. They already contain the protocol pieces: the React-fiber walk to the `Phaser.Game`, synthetic `MouseEvent` with `view: window`, and asserting real state. |

Budget: the 35 skill descriptions in PixelDen add up to 9,738 characters [unconfirmed: a re-count
on 2026-10-14 of the `description:` lines of the 35 frontmatter-bearing `SKILL.md` files gives
9,283 characters; the order of magnitude holds] (about 2.5k tokens) that
are listed in every session [S, local]. Claude Code truncates each `description` +
`when_to_use` at 1,536 characters [S][s29]. That is acceptable, but adding the 74-skill
gamedev catalog wholesale would roughly triple it. [O]

**Trap found:** the host's `node_modules/phaser` in PixelDen is a pnpm link to
`phaser@3.90.0` (dated 2026-04-17), while `pnpm-lock.yaml` pins `phaser@4.0.0` [S, local].
PixelDen runs in Docker, so the container has the right version. But any host-side agent that
"reads the installed types" (a pattern several packs recommend, e.g. godogen's `babylon-help`)
would read Phaser 3 types. [O]

### Wallhammer Zero (`.claude/skills/implement-tasks`)

This is the one project skill: the serial queue loop (`disable-model-invocation: true`). There
are no game-specific skills yet.

---

## 3. Candidates

Columns: ★ = stars; **Scan?** = is a skillspector intake worth the time. "Ideas" means read
for ideas without an intake.

### 3.1 Vendor-official and first-party

| Candidate | Licence · ★ · activity | Contents | Quality [O] | Risk | Scan? |
|---|---|---|---|---|---|
| **phaserjs/phaser `skills/`** [S][s1] | MIT · 40k★ · skills changed 2026-06-03 | 28 topic skills (cameras … v4-new-features, v3-to-v4-migration), each ≤500 lines with `Key source paths:` into `src/`. | High: written by the engine team and kept in step with API changes. Big; on-demand loading makes that fine. | Markdown only. No hooks, scripts or MCP. | Owner already uses it. It is first-party but not `anthropics/skills`, so the rule technically asks for an intake. **Yes, a cheap formality**; expect ~0 findings. |
| **three.js `llms.txt` / `docs/llms-full.txt`** [S][s14] | MIT · 116k★ · since 2026-02-09 | Rules for LLMs (import maps, WebGL vs WebGPU, TSL) plus the full docs. | High, but tracks `dev` (r186). **It is not in the r180 tag** that New Hope pins (`three@0.180.0`, released 2025-09-03) [S][s15]. | None (docs). | No (not a skill). Reference it from our own skill, pinned to a tag. |
| **anthropics/skills `webapp-testing`** [S][s19] | Apache-2.0 (per skill) · 181k★ | Python Playwright + `with_server.py`; "reconnaissance-then-action". | Generic web QA. Knows nothing of canvas or game time. | Python on the host. | Exempt (official). Low value for games. |
| **anthropics/skills `algorithmic-art`, `canvas-design`** | Apache-2.0 | p5.js generative art; static design. | Not game-shaped. | – | Exempt. Skip. |
| **claude-plugins-official → playwright** [S][s20] | Apache-2.0 · 38k★ | Wraps microsoft/playwright-mcp [S][s22]. | Fine. | `npx` of an MCP server. | The MCP itself is Apache-2.0 from Microsoft. Owner call; we already have Chrome DevTools MCP. |
| **Chrome DevTools MCP** [S][s21] | Apache-2.0 · 53k★ · daily | Navigation, `evaluate_script`, screenshots, perf traces, heap snapshots, Lighthouse. | The tool the owner already uses for New Hope and PixelDen. | Already installed. | n/a |
| **Phaser Editor MCP** [S][s17] | No licence file · 36★ · last push 2025-09-19 | Drives a running Phaser Editor v5 (`ide-get-all-scenes-in-project`, `ide-create-new-scene`…). | "Still under development" per the docs. Needs the editor. | Host app. | No. |
| **Phaser Game Agent MCP** [S][s18] | Proprietary, cloud · 2026-07-08 | `npx @phaserjs/game-agent` installs a CLI globally and writes MCP config into every detected agent. Builds run in Phaser's cloud sandbox; billed per minute from $0.01, and "a fully featured game typically costs around 500 credits". Exports to Web/Windows/macOS/Linux. | Unknown. | Global install, cloud lock-in, code lives on their servers, and their image/audio generation goes against our rules. | **No.** [O] It does not fit PixelDen's "Claude writes the code in our repo" model. Worth knowing only as a competitor. |

### 3.2 Three.js

| Candidate | Licence · ★ · activity | Contents | Quality [O] | Risk | Scan? |
|---|---|---|---|---|---|
| **majidmanzarpour/threejs-game-skills** [S][s5] | MIT · 2.5k★ · 2026-09-28 (single author, 11 commits) | 9 skills: `threejs-game-director` (router + lead/worker rules), `gameplay-systems` (+ a Vite/TS scaffold with `Loop.ts`, `random.ts`, `dispose.ts`, and bot-playtest and visual-regression templates), `aaa-graphics-builder` (shader cookbook, a 10-category visual scorecard with anchor images), `game-ui-designer`, `debug-profiler`, `qa-release` (a 24 KB `inspect-threejs-canvas.mjs`), plus 3 paid generators. | The best Three.js game QA material found. Good details: the `window.__THREE_GAME_TEST_HOOKS__` contract (seed, `setState`, `setPausedForScreenshot`, `setReducedMotion`, `hideDebugUi`); the capture order "unpause → seed → state → freeze → stabilise particles → hide debug → wait for fonts"; the debug playbook's blank-canvas checklist; and the `__THREE_GAME_DIAGNOSTICS__` = `renderer.info` object. | `probe_asset_credentials.sh` runs `zsh -lc 'source ~/.zprofile; source ~/.zshrc'` to find `TRIPO_API_KEY`, `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`. Paid APIs. `install.sh` writes to `~/.claude/skills`. Python scripts (a 72 KB Tripo client). | **Yes**: scan `threejs-qa-release` and `threejs-debug-profiler`, with ideas only for the rest. |
| **gamedev-skills/awesome-gamedev-agent-skills** [S][s6] | Apache-2.0 (+ NOTICE) · 1.5k★ · 2026-10-09 · 87 of ~107 commits by one author | 74 skills: `router/`, 15 disciplines (game-feel, procedural-gen, save-systems with versioning and migration, performance-optimization with profiling budgets, physics-tuning timestep + CCD, camera-systems…), 9 genres, web engines (`threejs-scene-setup`, `threejs-gltf-loading`, `threejs-materials-lighting`, `phaser-core`, `phaser-arcade-physics`, `pixijs-rendering`), Godot, Unity, Unreal, Bevy and Roblox. `docs/VERSION-SUPPORT.md` with dated baselines and a quarterly review rule. `scripts/validate-skills.py` in CI. | Current (r186, Phaser 4.2, `setAnimationLoop` + `THREE.Timer`), concise (5-9 KB per skill), with "when *not* to use" sections. The discipline skills are engine-agnostic and fit New Hope (save versioning, timestep, game feel). | `create-game-assets` treats image generation as a normal tool, and its scripts need Pillow. Codex `agents/openai.yaml` files. Mostly Markdown. | **Yes, the top intake candidate.** Scan `skills/disciplines/` and `skills/web-engines/` separately. |
| **CloudAI-X/threejs-skills** [S][s4] | **No licence** · 3.6k★ · content frozen since 2026-01-19 | 10 tutorial skills (fundamentals … postprocessing), 11-16 KB each. | Tutorial grade: `requestAnimationFrame` loops, no TSL, no BatchedMesh, and a section titled "WebGPU Post-Processing (Three.js r150+)". The README tells you to clone a *different* repo (pinkforest/threejs-playground). | No licence: no copy, ever. | **No.** Popular, but stale and unlicensed. |
| **Impertio-Studio/Three.js-Claude-Skill-Package** [S][s33] | MIT · 20★ · 2026-07-08 | 24 skills for r160+, including IFC/BIM and R3F. | [U] Not read in depth. AEC-oriented. | – | No. |
| **openai/plugins `game-studio`** [S][s8] | `plugin.json` says MIT; the repo has **no LICENSE** · 7.4k★ · 2026-06-08 | 8 thin skills (≤6 KB) [refuted 2026-10-14: 9 skill folders; `web-game-foundations` is missing from this list]: a router, `three-webgl-game`, `react-three-fiber-game`, `phaser-2d-game`, `game-playtest`, `sprite-pipeline`, `web-3d-asset-pipeline`, `game-ui-frontend`, plus 14 short references. | Sound architecture rules ("keep simulation state outside Three.js objects; the render graph is an adapter"; DOM HUD; "low-chrome first playable"; a module split `simulation/ render/ physics/ ui/ diagnostics/`). Shallow on verification. | Codex-oriented. | Ideas only. |
| **threejs-devtools-mcp** [S][s16] | MIT · 119★ · 2026-04-07 | 59 tools: the scene tree, materials, shaders, `renderer.info`, memory leaks. A proxy injects a bridge into `<head>` and opens a browser on `:9222`. | Useful for "why is it invisible" questions. | Runs through `npx`, proxies the dev server and injects script; port 9222 is Chrome's usual debug port. | **Maybe later.** [O] `window.__nh.info()` and Chrome DevTools `evaluate_script` cover most of it with nothing new installed. |

### 3.3 Phaser

| Candidate | Licence · ★ · activity | Contents | Quality [O] | Risk | Scan? |
|---|---|---|---|---|---|
| **chongdashu/phaserjs-oakwoods** [S][s3] | MIT · 86★ · 2026-01-23 (a one-day "vibe coded" demo) | `phaser-gamedev` (PixelDen's root) and `playwright-testing`, whose `phaser-canvas-testing.md` covers a `?test=1` deterministic mode, a seeded `Math.random`, `game.loop.forceSetTimeOut`, a `window.__TEST__` seam, and `imgdiff.py`. | Phaser 3. Superseded by the official skills for API facts. The testing reference is still good. | Small. | No (already forked; the owner owns the fork). |
| **Yakoub-ai/phaser4-gamedev** [S][s13] | **No licence** · 28★ · 2026-08-27 | A plugin: 5 agents (architect, coder, debugger 35 KB, playtester, asset-advisor), 10 commands (`/phaser-new`, `/phaser-gdd`, `/phaser-playtest`, `/phaser-release`…), and hooks: a **PreToolUse `Write|Edit` guard `check-v3-api.sh`** that warns on `preFX/postFX`, `setPipeline`, `BitmapMask`, `createGeometryMask`, `tintFill`, `Geom.Point`, module-level `GAME_WIDTH` constants and more, plus an async SessionStart detector. | The v3-API guard is the most directly useful idea for PixelDen (§0.7). It is warn-only (`exit 0`). | No licence, so no copying. Hooks run on every write. | No. **Write our own guard** (§4.5). |
| **onmax/nuxt-skills `phaser-best-practices`** [S][s32] | No licence · 721★ | Phaser 3, pixel-art camera rules. The most-installed Phaser skill on skills.sh (696 installs, Aug 2026) [S][s31] [unconfirmed: s31 does not mention this skill or the figure; the skills.sh page shows 879 installs on 2026-10-14 and no pixel-art camera rules, only "blurry pixel art" as a debugging symptom; "most-installed Phaser skill" was not checked]. | Phaser 3. | – | No. |
| **gamedev-skills `phaser-core`, `phaser-arcade-physics`** [S][s6] | Apache-2.0 | Phaser 4.2 baseline. "Do not silently rewrite a Phaser 3 project as Phaser 4." | Good, but redundant with the official 28. | – | Included in the s6 scan. |

### 3.4 Whole-pipeline "make a game" systems

| Candidate | Licence · ★ · activity | Shape | What to take [O] | Scan? |
|---|---|---|---|---|
| **PlayableIntelligence/game-creator** [S][s12] | Ambiguous · 344★ · idle since 2026-05-25 | 31 skills, 4 agents, 1 hook; `/make-game` (docs-first, multi-session) and `/viral-game` (one-shot). | Already analysed ([game-creator.md](game-creator.md)); scanned, `DO_NOT_INSTALL`. | Done. |
| **Donchitos/Claude-Code-Game-Studios** [S][s9] | MIT · 26k★ · v1.1.3, 2026-10-08 · 585 files | 49 agents in 3 tiers (directors → leads → specialists), 72 skills [refuted 2026-10-14: 74] (`/gate-check`, `/smoke-check`, `/dev-story`, `/story-done`, `/architecture-decision`…), 13 shell hooks (session start/stop, pre/post-compact, `validate-commit.sh`, `validate-assets.sh`), a statusline, `!`-injected `yaml-helper.sh` config resolution in skills, a "CCGS Skill Testing Framework", and engine references for Godot, Unity and Unreal (no web engines). | Ideas: **gates as named skills** (`gate-check`, `smoke-check` writes `production/qa/smoke-[date].md`), the process-weight setting (`qa.level: minimal / standard / full`), and pre/post-compact hooks that save state. Do not take: the persona hierarchy. A critic notes that the 49 agents share one context and one model, so the "independent review" is weak [S][s10]. | No (too large, hooks + `!cmd`, wrong engines). Ideas only. |
| **htdt/godogen** [S][s11] | MIT · 7.1k★ · 2026-10-01 | After 2026-07-02 it ships only `prompts/runtime.md` (≈20 lines) [refuted 2026-10-14: 11 lines, 1,127 bytes], one engine guide (`engines/babylon.md` ≈ 60 lines) [refuted 2026-10-14: 35 lines, 3,189 bytes] and the `asset-gen` skill (paid image, 3D and video APIs, rembg). | Ideas: (a) **"Judge progress from the running game, never from a clean build."** (b) Read the task framing: an open-ended request gets the live game early and checkpoints at taste/scope/cost decisions; a finished brief runs through and ends with a **15-20 s proof video** "watched back before done". (c) Keep durable status in one file. (d) Engine traps live in the engine guide. | No (asset-gen is paid APIs). Ideas only. |
| **openai develop-web-game** (removed) [S][s7] | Apache-2.0 · in history at `7796342` | The original protocol plus `web_game_playwright_client.js` (10 KB). | The cleanest licensed source of the protocol. It tells the agent to `npm install -g @playwright/mcp@latest` if npx is missing, which breaks our rules. | Only if we decide to copy the client; otherwise ideas. |

### 3.5 Pixel art

| Candidate | Licence · ★ | Contents | Fit [O] | Scan? |
|---|---|---|---|---|
| **Gamezxz/pixel-art-studio** [S][s23] | MIT · 81★ · 2026-07 | "Claude IS the pixel artist": a Python/Pillow `pixelstudio.py` (Sprite, ramp with hue shift, selective outline, dither, `save_silhouette`, `stats()`, spritesheet + JSON). The loop is brief → `build.py` → preview at 10× → critique against `validations.md` → fix, at least 2-3 passes. It has a "study a file and grow the knowledge base" mode. | Same philosophy as `code-pixel-game` and our asset-kit, in Python. It hard-codes `/Users/game/Projects/...` and suggests `pip3 install --user pillow`. Nothing to adopt: our TS kit is further along. One idea to borrow: **`save_silhouette()` as a standard review view.** | No. |
| **Aseprite MCPs**: willibrandon/pixel-mcp + pixel-plugin (MIT, 150★/360★, idle since 2025-10), diivi/aseprite-mcp (MIT, 690★, 104 tools) [S][s24][s25] | MIT | Drive a host Aseprite through Lua. | Needs Aseprite on the host and makes the editor file the source. That goes against "graphics are code" and "install nothing on the host". | No. |
| omer-metin/skills-for-antigravity `pixel-art` [S][s37] | Apache-2.0 · 165★ · Jan 2026 | Guidance only (palettes, dithering, sub-pixel animation). | Generic. | No. |

### 3.6 Procedural audio

I found **no skill for deterministic, code-defined game audio** (sfxr/ZzFX-style parameters, step
sequencers) worth adopting. What exists:

- **Strudel MCP servers**: williamzujkowski/live-coding-music-mcp (AGPL-3.0, 244★, active) and
  p-poss/dj-claude (AGPL-3.0) [S][s26][s27]. Strudel is already on our do-not-copy list (AGPL).
  These servers drive strudel.cc in a browser, so the output is not a reproducible artefact. **No.**
- **threejs-audio-generator** (s5): ElevenLabs SFX, music and TTS. Paid, not code. Its Web Audio
  runtime checklist is useful (gesture unlock, event-driven SFX, loops stop on pause/restart,
  no duplicate sources after a visibility resume). Ideas only.
- **game-creator `game-audio`**: already analysed.
- [O] Our `packages/audio` plus [audio-from-code.md](audio-from-code.md) is ahead of every public
  option. Audio is a place where we should write our own skill, not look for one.

### 3.7 Generic subagents, catalogs, AGENTS.md / Cursor rules

- **VoltAgent/awesome-claude-code-subagents `game-developer`** (MIT, 25.7k★) [S][s28]: a persona
  with a buzzword checklist ("60 FPS stable maintained… Player retention high measurably"). It has
  no executable checks. **No.** [O]
- **Catalogs** (for discovery only, none game-specific): VoltAgent/awesome-agent-skills (35.7k★),
  ComposioHQ/awesome-claude-skills (77k★), travisvn/awesome-claude-skills (15k★),
  hesreallyhim/awesome-claude-code (55.6k★), sickn33/agentic-awesome-skills (47.6k★, has a
  `web-games` framework-selection skill) [S][s34][s36]. Registries such as skills.sh,
  claudemarketplaces, skillselion and tomevault mirror GitHub. Several of them carry no
  signature or provenance, and their pages say so [S][s31] [unconfirmed: s31 says only that its
  catalog is "refreshed daily from skills.sh, GitHub and MCP registries"; it says nothing about
  signatures or provenance. The skills.sh page checked shows third-party "security audit" badges
  (Gen Agent Trust Hub, Socket, Snyk), which is not provenance either]. **Always go to the GitHub source and
  pin the SHA.**
- **Cursor rules / AGENTS.md for Three.js:** I found no canonical community rules file. Current
  Cursor uses `.cursor/rules/*.mdc` (`description`, `globs`, `alwaysApply`) or a plain
  `AGENTS.md`; a Cursor forum answer says there is no official example setup [S][s35]. The best
  "rules" source for Three.js is the official `docs/llms.txt` [S][s14]. AGENTS.md has been
  part of the cross-vendor Agent Skills / agents ecosystem since Dec 2025 [S][s30]; [U] on the
  exact date (sources say 16 or 18 Dec 2025). [refuted 2026-10-14: agentskills.io does not mention
  AGENTS.md at all; AGENTS.md is a separate convention (agents.md, 2025) and is not part of the
  Agent Skills format. What happened in Dec 2025 is the release of Agent Skills as an open
  standard: 2025-12-18 (VentureBeat, The New Stack, Unite.ai). The Cursor forum answer (s35) is
  from 2026-05-21 and says "There isn't a single official canonical example".]

---

## 4. Skills worth writing ourselves

The Claude Code facts below come from the skills docs [S][s29]. Keep `SKILL.md` under 500 lines
and move detail into references. After compaction each skill keeps its first 5,000 tokens, and
all re-attached skills share 25,000 tokens. Useful frontmatter: `disable-model-invocation`,
`context: fork` + `agent`, `paths` globs, `allowed-tools`, and `` !`cmd` `` injection, which
aborts the invocation if the command fails. Commands and skills are now the same mechanism.

[O] Design rules for all of them, taken from what worked above:
1. **Project skills live in the repo** (`.claude/skills/` in WHZ and in PixelDen), and the docs
   check covers them. Global skills are only for cross-repo craft (`code-pixel-game`).
2. **Every skill ends in a numeric gate**, not in "looks good": an exit code, a digest, a
   `renderer.info` budget, a hash-bound verdict.
3. **Thin entry, thick references.** Godogen's ~20-line runtime is the model for the entry file.
4. **No `!cmd` that can fail on a fresh clone** (it aborts the invocation), and no hooks that read
   the shell profile.

### 4.1 `threejs-game` (WHZ project skill, New Hope)

- **Trigger:** `paths: ["packages/new-hope-play/**"]`, plus "New Hope", "three.js".
- **Contains:** the pinned version and how to read it (`three@0.180.0` from the lockfile). The
  rule "the official `llms.txt` describes r186; check every API against
  `node_modules/three/src` inside `./dev`". Example: `THREE.Timer` is in core at r180 (`src/core/Timer.js`
  exists at the r180 tag but not at r178) [S][s15], and `Clock` is deprecated only from r183 [S][s6].
  The New Hope architecture rules, adapted from s8: simulation outside meshes, the render graph
  as an adapter, a DOM HUD. Performance budgets: draw calls, triangles, textures and DPR cap,
  read from `renderer.info` through `window.__nh.info()`. The instancing patterns already in
  `sky.ts` and `traffic.ts`. A traps file (bloom + fog colour, disposal on restart, a single
  `setAnimationLoop`). The traps file must be checked against the code by the docs-check, given
  conclusion 4 in [README.md](README.md#conclusions-that-repeat-across-reports).
- **Size:** ≤200 lines in SKILL.md, plus `references/traps.md` and `references/budgets.md`.

### 4.2 `game-verify` (WHZ project skill, later shared with PixelDen)

- **What:** one verification protocol for every player (conclusion 5 in research/README). A port
  of `godot-game-testing` to the web: `advance(seconds)` without the frame clock; `info()` /
  `render_game_to_text`-style state as JSON; seeded action scripts; a hook contract like s5's
  (`seed`, `setState`, `pauseForScreenshot`, `hideDebugUi`, `reducedMotion`); an assertion on
  the renderer string (fail on SwiftShader when a GPU number is claimed); console and network
  errors; and a short proof capture (frame strip + a numeric check, because CLAUDE.md says a GIF
  shows one frame).
- **Run as** `context: fork` with a QA agent, so screenshots stay out of the main context, as
  CLAUDE.md already asks.
- **Output:** a JSON report the studio can read (§4.3).

### 4.3 `studio-progress` (WHZ project skill)

- **What:** the contract between a running build flow and the studio. The flow writes
  step records (a step id, status, a started/finished time from the host, artefact paths, the
  gate exit code, the evidence file). The studio shows them live through its existing watch
  topics ([docs/studio.md](../docs/studio.md)). It must not write `review.json` or `INBOX.md`
  (CLAUDE.md).
- **Why a skill:** so that `/make-game` and `/continue-game` report in one format. CCGS's
  `smoke-[date].md` and s5's `artifacts/evidence.json` (declared viewport/state pairs + a
  run id) are the two models to take ideas from.

### 4.4 `/make-game` and `/continue-game` (commands, `disable-model-invocation: true`)

- **What:** the owner's goal flows. PixelDen's `/new-game` and `/game-upgrade` already prove the
  shape: a ledger in the repo, one run = one game, research → 3 concepts → owner pick → spec →
  playable core first → verify → ship.
- **Add from the survey:** godogen's framing rule (checkpoint only at taste, scope and cost
  decisions); s5's "the user's words set the bar"; CCGS's process weight
  (`minimal | standard | full`); and a final proof capture plus `game-verify`.
- **WHZ specifics:** the game is data under `games/` (validated with
  `./dev npm run game -- validate <id>`), and assets go through the asset pipeline and verdicts,
  not into game code.

### 4.5 `phaser4-guard` (PixelDen hook + skill)

- **What:** a PreToolUse `Write|Edit` hook on `app/games/**`, warn-only like Yakoub's but
  written by us. The pattern list comes from the official `v3-to-v4-migration` skill [S][s1]
  (`setTintFill`, `tintFill`, `preFX/postFX`, `setPipeline`, `BitmapMask`,
  `createGeometryMask` [refuted 2026-10-14: `createGeometryMask` does not appear in the official
  migration skill; it comes from Yakoub's `check-v3-api.sh`. The other seven patterns are in the
  official skill], `Geom.Point`, `Mesh/Plane`), plus a lint rule in `task lint` so the
  check also runs where hooks don't.
- **Also:** fix the "Phaser 3" description and references in `phaser-gamedev`, add frontmatter
  to `pixellab` and `image-generation`, and record the official Phaser skills (pinned to the
  upstream commit) and `grill-me` in a PixelDen intake registry. [O]

### 4.6 `game-audio-code` (global or WHZ)

- **What:** the event-matrix approach (only sounds for events the game has), the Web Audio
  runtime checklist (from s5's debug playbook), and our deterministic synth: songs as step-grid
  JSON and SFX as named parameters ([audio-from-code.md](audio-from-code.md)). New Hope's
  `src/audio.ts` is the first consumer. No external services.

### 4.7 Not worth writing [O]

A persona hierarchy (directors, leads), a generic "game-developer" agent, or an Aseprite skill.

---

## 5. What this means for us

**New Hope (Three.js r180).**
- Do not install a Three.js pack. Write `threejs-game` (§4.1) with the version pin as its
  first rule. Every popular pack targets r186 (s6, s14) or is stale (s4).
- `window.__nh` is already 80% of s5's hook contract. Missing pieces: `seed` [refuted 2026-10-14:
  `__nh.seed` already exists in `packages/new-hope-play/src/main.ts` as a read-only value taken
  from `?seed=`; what is missing is a setter / reseed, not the field], `setState(name)`,
  a screenshot freeze, `hideDebugUi`, and a `diagnostics` block exposing `renderer.info`
  (`__nh.info()` already returns `renderer.info.render`; the memory and programs parts are not
  exposed). Adding
  them is cheaper than any MCP. [O]
- Verify in the host browser through Chrome DevTools MCP (already set up), and check the
  `RENDERER` string. [O]

**Wallhammer Zero studio and generator.**
- `game-verify` + `studio-progress` are the two skills that turn "make this game" into a flow
  the studio can show. The rest (art, audio, sim) already has repo tooling and docs. [O]
- Intake queue proposal for the owner, in order of value per hour:
  (1) gamedev-skills `disciplines/` + `web-engines/` at a pinned SHA;
  (2) threejs-game-skills `threejs-qa-release` + `threejs-debug-profiler`;
  (3) phaserjs/phaser `skills/` (a formality, for PixelDen's record).
  Everything else is ideas only. Each scan is offline and static (D16, D27), roughly one session.

**PixelDen (Phaser 4, 53 game folders [refuted 2026-10-14: 54 directories besides `shared/`] plus `shared/` under `app/games`).**
- Keep the official Phaser skills; they are the best Phaser source there is. Re-sync them when the
  upstream skills change (42 commits so far; the copy already misses the 2026-06-03 one).
- Fix the Phaser-3 drift in `phaser-gamedev`, then add `phaser4-guard` (§4.5). First concrete
  catch: `app/games/ember-rise/scenes/game.ts:743` (`setTintFill` through a cast) [S, local; U on the
  runtime effect].
- Desktop/mobile packaging is covered by [multiplatform.md](multiplatform.md) and by a separate
  agent in this run. The only packaging skill I found was a Tauri one (travisjneuman/.claude),
  which I did not read [U]. No Capacitor or Electron game skill surfaced.

---

## 6. Open questions for the owner

1. Do we run intakes on gamedev-skills (disciplines + web engines) and on
   threejs-game-skills (QA + profiler) with a view to installing parts, or keep both as ideas only?
2. Should the official Phaser skills in PixelDen get a formal intake record (they are
   first-party but not `anthropics/skills`), and does `grill-me` need one?
3. Which of the own skills in §4 go into `tasks/` first? My recommendation: `game-verify` →
   `threejs-game` → `studio-progress` → `/make-game`.
4. Should New Hope move from r180 to r186? The official LLM docs and the current packs target
   r186.
5. Are the PixelDen fixes (§4.5) a PixelDen task now, or after the WHZ skills?

---

## Sources

All accessed 2026-10-14. Dates in brackets are the source's own (last commit, release or post).

- [s1] phaserjs/phaser, `skills/` (MIT; skill commits 2026-03-25 … 2026-06-03): https://github.com/phaserjs/phaser/tree/master/skills
- [s3] chongdashu/phaserjs-oakwoods (MIT; 2026-01-23): https://github.com/chongdashu/phaserjs-oakwoods
- [s4] CloudAI-X/threejs-skills (no licence; content 2026-01-19, push 2026-07-09): https://github.com/CloudAI-X/threejs-skills
- [s5] majidmanzarpour/threejs-game-skills (MIT; 2026-09-28): https://github.com/majidmanzarpour/threejs-game-skills
- [s6] gamedev-skills/awesome-gamedev-agent-skills (Apache-2.0; 2026-10-09), incl. `docs/VERSION-SUPPORT.md` (checked 2026-09-25): https://github.com/gamedev-skills/awesome-gamedev-agent-skills
- [s7] openai/skills `develop-web-game` at commit 7796342 (Apache-2.0; 2026-02-02) and its removal in 11c6438 (2026-04-23): https://github.com/openai/skills/tree/7796342/skills/.curated/develop-web-game · https://github.com/openai/skills/commit/11c6438
- [s8] openai/plugins `game-studio` (plugin.json MIT, no repo LICENSE; 2026-06-08): https://github.com/openai/plugins/tree/main/plugins/game-studio
- [s9] Donchitos/Claude-Code-Game-Studios (MIT; v1.1.3, 2026-10-08): https://github.com/Donchitos/Claude-Code-Game-Studios
- [s10] "Claude Code Game Studios: 49 Agents, One Context Window", Game Production Alchemist (2026, exact date [U]) [verified 2026-10-14: published 2026-05-19 by Rob Sandberg; the substack URL now 301-redirects to https://www.productionalchemist.com/p/claude-code-game-studios-49-agents]: https://gameproductionalchemist.substack.com/p/claude-code-game-studios-49-agents
- [s11] htdt/godogen (MIT; 2026-10-01), CHANGELOG entry 2026-07-02 and `engines/babylon.md`: https://github.com/htdt/godogen · https://github.com/htdt/godogen/blob/master/CHANGELOG.md
- [s12] PlayableIntelligence/game-creator (licence ambiguous; 2026-05-25): https://github.com/PlayableIntelligence/game-creator
- [s13] Yakoub-ai/phaser4-gamedev (no licence; 2026-08-27), `hooks/hooks.json`, `hooks/scripts/check-v3-api.sh`: https://github.com/Yakoub-ai/phaser4-gamedev
- [s14] three.js LLM docs (`llms.txt` since 2026-02-09): https://github.com/mrdoob/three.js/blob/dev/docs/llms.txt · https://threejs.org/docs/llms-full.txt
- [s15] three.js releases r180 (2025-09-03) and r186 (2026-09-24): https://github.com/mrdoob/three.js/releases/tag/r180 · https://github.com/mrdoob/three.js/releases/tag/r186
- [s16] DmitriyGolub/threejs-devtools-mcp (MIT; 2026-04-07): https://github.com/DmitriyGolub/threejs-devtools-mcp
- [s17] Phaser Editor MCP server docs and repo (2025-09-19): https://docs.phaser.io/phaser-editor/ai/mcp-server · https://github.com/phaserjs/editor-mcp-server
- [s18] Phaser Game Agent MCP (2026-07-08): https://phaser.io/news/2026/07/phaser-game-agent-mcp-setup · https://phaser.io/agent/mcp
- [s19] anthropics/skills `webapp-testing` (Apache-2.0; repo push 2026-10-09): https://github.com/anthropics/skills/tree/main/skills/webapp-testing
- [s20] anthropics/claude-plugins-official (Apache-2.0; 2026-10-14): https://github.com/anthropics/claude-plugins-official
- [s21] ChromeDevTools/chrome-devtools-mcp (Apache-2.0; 2026-10-14): https://github.com/ChromeDevTools/chrome-devtools-mcp
- [s22] microsoft/playwright-mcp (Apache-2.0; 2026-10-08): https://github.com/microsoft/playwright-mcp
- [s23] Gamezxz/pixel-art-studio (MIT; 2026-07-11): https://github.com/Gamezxz/pixel-art-studio
- [s24] willibrandon/pixel-plugin and pixel-mcp (MIT; 2025-10-19): https://github.com/willibrandon/pixel-plugin · https://github.com/willibrandon/pixel-mcp
- [s25] diivi/aseprite-mcp (MIT; 2026-07-29): https://github.com/diivi/aseprite-mcp
- [s26] williamzujkowski/live-coding-music-mcp (AGPL-3.0; 2026-10-12): https://github.com/williamzujkowski/live-coding-music-mcp
- [s27] p-poss/dj-claude (AGPL-3.0; 2026-06-02): https://github.com/p-poss/dj-claude
- [s28] VoltAgent/awesome-claude-code-subagents, `game-developer.md` (MIT; 2026-10-11): https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/07-specialized-domains/game-developer.md
- [s29] Claude Code docs, "Skills" (fetched 2026-10-14): https://code.claude.com/docs/en/skills
- [s30] Agent Skills open format (Dec 2025): https://agentskills.io/
- [s31] Skillselion, skills.sh install leaderboard (2026-08-04): https://dev.to/skillselion/grill-me-just-passed-anthropics-frontend-design-to-become-the-2-most-installed-claude-code-skill-3fm0
- [s32] onmax/nuxt-skills (no licence; 2026-10-12): https://github.com/onmax/nuxt-skills
- [s33] Impertio-Studio/Three.js-Claude-Skill-Package (MIT; 2026-07-08): https://github.com/Impertio-Studio/Three.js-Claude-Skill-Package
- [s34] Catalogs: https://github.com/VoltAgent/awesome-agent-skills · https://github.com/ComposioHQ/awesome-claude-skills · https://github.com/travisvn/awesome-claude-skills · https://github.com/hesreallyhim/awesome-claude-code
- [s35] Cursor forum, "Cursor setup with rules, mdc, agents.md and hooks" (2026): https://forum.cursor.com/t/cursor-setup-with-rules-mdc-agents-md-and-hooks/161005
- [s36] sickn33/agentic-awesome-skills (MIT; 2026-10-14): https://github.com/sickn33/agentic-awesome-skills
- [s37] omer-metin/skills-for-antigravity (Apache-2.0; 2026-01-22): https://github.com/omer-metin/skills-for-antigravity

Local sources ([S, local]): `~/projects/nodejs/pixelden/.claude/` (skills, commands,
`pnpm-lock.yaml`, `node_modules/phaser`, `app/games/ember-rise/scenes/game.ts`,
`app/games/frost-hold/scenes/game.ts`); `~/.claude/skills/`; this repo's
`packages/new-hope-play/README.md` and `package-lock.json`.

[s1]: https://github.com/phaserjs/phaser/tree/master/skills
[s3]: https://github.com/chongdashu/phaserjs-oakwoods
[s4]: https://github.com/CloudAI-X/threejs-skills
[s5]: https://github.com/majidmanzarpour/threejs-game-skills
[s6]: https://github.com/gamedev-skills/awesome-gamedev-agent-skills
[s7]: https://github.com/openai/skills/tree/7796342/skills/.curated/develop-web-game
[s8]: https://github.com/openai/plugins/tree/main/plugins/game-studio
[s9]: https://github.com/Donchitos/Claude-Code-Game-Studios
[s10]: https://gameproductionalchemist.substack.com/p/claude-code-game-studios-49-agents
[s11]: https://github.com/htdt/godogen
[s12]: https://github.com/PlayableIntelligence/game-creator
[s13]: https://github.com/Yakoub-ai/phaser4-gamedev
[s14]: https://github.com/mrdoob/three.js/blob/dev/docs/llms.txt
[s15]: https://github.com/mrdoob/three.js/releases/tag/r180
[s16]: https://github.com/DmitriyGolub/threejs-devtools-mcp
[s17]: https://docs.phaser.io/phaser-editor/ai/mcp-server
[s18]: https://phaser.io/news/2026/07/phaser-game-agent-mcp-setup
[s19]: https://github.com/anthropics/skills/tree/main/skills/webapp-testing
[s20]: https://github.com/anthropics/claude-plugins-official
[s21]: https://github.com/ChromeDevTools/chrome-devtools-mcp
[s22]: https://github.com/microsoft/playwright-mcp
[s23]: https://github.com/Gamezxz/pixel-art-studio
[s24]: https://github.com/willibrandon/pixel-plugin
[s25]: https://github.com/diivi/aseprite-mcp
[s26]: https://github.com/williamzujkowski/live-coding-music-mcp
[s27]: https://github.com/p-poss/dj-claude
[s28]: https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/07-specialized-domains/game-developer.md
[s29]: https://code.claude.com/docs/en/skills
[s30]: https://agentskills.io/
[s31]: https://dev.to/skillselion/grill-me-just-passed-anthropics-frontend-design-to-become-the-2-most-installed-claude-code-skill-3fm0
[s32]: https://github.com/onmax/nuxt-skills
[s33]: https://github.com/Impertio-Studio/Three.js-Claude-Skill-Package
[s34]: https://github.com/VoltAgent/awesome-agent-skills
[s35]: https://forum.cursor.com/t/cursor-setup-with-rules-mdc-agents-md-and-hooks/161005
[s36]: https://github.com/sickn33/agentic-awesome-skills
[s37]: https://github.com/omer-metin/skills-for-antigravity

---

## Verification (2026-10-14)

Adversarial fact-check by a separate agent. Method: GitHub API (`gh api`) for stars, licences,
dates, trees and file contents; WebFetch for the non-GitHub pages; local reads of this repo,
`~/projects/nodejs/pixelden` and `~/.claude/skills`. 43 claims checked. Corrections are inline
as `[refuted 2026-10-14: …]`, doubts as `[unconfirmed]`.

**Confirmed (unchanged in the text):**

- phaserjs/phaser `skills/`: 28 skill folders, MIT, 40.5k★, 42 commits touching `skills/`
  (2026-03-25 … 2026-06-03), the last one adds `MULTIPLY_TWO` to
  `v4-new-features/references/REFERENCE.md`. PixelDen's 28 `SKILL.md` are byte-identical
  (sha256) to upstream `master`; PixelDen's `REFERENCE.md` has no `MULTIPLY_TWO`; the 28
  `SKILL.md` total 532,487 bytes. The official `v3-to-v4-migration` skill lists `setTintFill()`
  as removed.
- three.js: `docs/llms.txt` 5,404 B and `llms-full.txt` 363,106 B, first commit 2026-02-09
  (b6d40ae); r180 published 2025-09-03, r183 2026-02-20, r186 2026-09-24 (latest);
  `src/core/Timer.js` exists at tag r180 and not at r178; `Clock.js` carries `@deprecated since
  r183`. New Hope pins `three@^0.180.0`, lockfile 0.180.0.
- majidmanzarpour/threejs-game-skills: MIT, 2,501★, 11 commits, last 2026-09-28 "Tune skills
  for Claude Opus 5.5, cut QA token cost, and add music generation"; 9 skill folders;
  `probe_asset_credentials.sh` (in `threejs-game-director/scripts/`) runs `zsh -lc` sourcing
  `~/.zprofile` and reports `TRIPO_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`;
  `install.sh` exists; `inspect-threejs-canvas.mjs` is 24,769 B; the Tripo client
  `threejs_3d_asset.py` is 72,710 B; the SwiftShader commit is dated 2026-07-16.
- gamedev-skills/awesome-gamedev-agent-skills: Apache-2.0, 1,496★, 74 `SKILL.md`, 109 commits,
  `NOTICE`, `scripts/validate-skills.py`, `agents/openai.yaml` files; `docs/VERSION-SUPPORT.md`
  "Checked 2026-09-25", Phaser 4.2, three.js r186.
- openai/skills: `develop-web-game` first commit 2026-01-31 (0ed635a), commit 7796342 is
  2026-02-02, Apache-2.0 `LICENSE.txt`, `web_game_playwright_client.js` 9,963 B, SKILL.md
  names `render_game_to_text`, `advanceTime(ms)` and `Original prompt:`; removed in 11c6438
  "Remove curated frontend and web game skills (#370)" on 2026-04-23. openai/plugins has no
  LICENSE file; `game-studio/.codex-plugin/plugin.json` says MIT, v0.1.2; `game-playtest` has
  the "when deterministic automation is not practical" line; last change 2026-06-08.
- htdt/godogen: MIT, 7,115★, CHANGELOG "2026-07-02 — Docs-only runtime" with the quoted
  "removing guidance the current model no longer needs" and the 15–20 s proof recording;
  `engines/babylon.md` has the SwiftShader/llvmpipe `RENDERER` warning.
- Donchitos/Claude-Code-Game-Studios: MIT, 26,412★, v1.1.3 published 2026-10-08, 585 blobs,
  49 files in `.claude/agents/`, 14 `.sh` in `.claude/hooks/` (13 hooks + `yaml-helper.sh`).
  The s10 article (2026-05-19) says "all 49 agents share one session context".
- Yakoub-ai/phaser4-gamedev: no licence, 28★, 5 agents, 10 commands, `hooks.json` with
  PreToolUse `Write|Edit` and an async SessionStart; `check-v3-api.sh` warns on `Geom.Point`,
  `preFX/postFX`, `BitmapMask`, `createGeometryMask`, `tintFill`, `setPipeline`, `GAME_WIDTH`
  and exits 0; `phaser-debugger.md` is 35,668 B.
- CloudAI-X/threejs-skills: no licence, 3,566★, 10 skills, last content commit 2026-01-19,
  push 2026-07-09. game-creator: 344★, created 2026-01-28, pushed 2026-05-25, no detected
  licence; the WHZ intake registry records its `DO_NOT_INSTALL`.
- Stars/licences as stated: chongdashu/phaserjs-oakwoods 86★ MIT, threejs-devtools-mcp 119★ MIT
  (README: "59 tools", port 9222, injection), Impertio 20★ MIT, anthropics/skills 181k★,
  claude-plugins-official 37.9k★ Apache-2.0, chrome-devtools-mcp 53.5k★, playwright-mcp 38.1k★,
  editor-mcp-server 36★ no licence pushed 2025-09-19, VoltAgent subagents 25.7k★, nuxt-skills
  721★ no licence, pixel-art-studio 81★, aseprite-mcp 690★, pixel-mcp 150★ / pixel-plugin 360★
  (2025-10), live-coding-music-mcp 244★ AGPL, dj-claude AGPL, skills-for-antigravity 165★
  Apache-2.0, VoltAgent/awesome-agent-skills 35.7k★, ComposioHQ 77k★, travisvn 15.4k★,
  hesreallyhim 55.6k★, sickn33 47.6k★.
- Claude Code skills docs: 1,536-character cap on `description` + `when_to_use`, 5,000 tokens
  per re-attached skill and a 25,000-token shared budget after compaction, "keep SKILL.md under
  500 lines", frontmatter read only when `---` is line 1, a failed `` !`cmd` `` aborts the
  invocation, `context: fork` / `agent` / `paths`, commands merged into skills.
- Phaser Game Agent: news page 2026-07-08 says the setup installs the CLI globally, writes MCP
  config and bills "from $0.01 per minute"; `/agent/mcp` says `npx @phaserjs/game-agent`,
  "around 500 credits", exports Web/Windows/macOS/Linux.
- skills.sh leaderboard article (s31): grill-me 745,804 installs, #2, 2026-08-04.
- PixelDen local: `phaser-gamedev` says "Phaser 3" in `SKILL.md` and exactly the 5 named
  reference files (234 + 4,426 lines); `ember-rise/scenes/game.ts:743` calls `setTintFill`
  through a cast; `frost-hold/scenes/game.ts:2538` has the "only logs an error" comment;
  `pixellab` and `image-generation` `SKILL.md` have no frontmatter; `node_modules/phaser` is a
  pnpm symlink to `phaser@3.90.0` dated 17 Apr while `pnpm-lock.yaml` and `package.json` say
  `phaser@4.0.0` / `^4.0.0`; `grill-me` and `grilling` exist; `new-game.md` and
  `game-upgrade.md` contain the React-fiber walk, `MouseEvent` with `view: window` and
  `game.scale.updateBounds()`.
- WHZ local: `.claude/skills/implement-tasks` is the only project skill, with
  `disable-model-invocation: true`; `window.__nh` is defined in
  `packages/new-hope-play/src/main.ts`; `sky.ts`, `traffic.ts`, `audio.ts` exist; the
  `research/README.md` anchors `#licence-flags` and `#conclusions-that-repeat-across-reports`
  exist; `research/game-creator.md` executive-summary items 6 and 11 are as described.
- Global skills: `code-pixel-game/SKILL.md` 89 lines with 8 references,
  `dev-stage-orchestration` 106, `godot-game-testing` 114.

**Refuted (corrected inline):** code-pixel-game has 9 scripts, not 5; PixelDen has 54 game
folders, not 53; `game-studio` has 9 skills (adds `web-game-foundations`) and predates the
`develop-web-game` removal by six weeks (first commit 2026-03-13), so "replaced" is loose; CCGS
has 74 skills, not 72; godogen's `runtime.md` is 11 lines and `babylon.md` 35 lines, not ≈20
and ≈60; the PixelDen Phaser-skill copy is dated 2026-04-25 by mtime, not 2026-04-27 (the
folder is gitignored); `createGeometryMask` is not in the official migration skill;
`window.__nh.seed` already exists (read-only); AGENTS.md is not part of the Agent Skills format
and agentskills.io does not mention it (the open standard itself dates from 2025-12-18).

**Unconfirmed (marked inline):** the 9,738-character description total (a re-count gives
9,283); the "696 installs, Aug 2026" figure and "most-installed Phaser skill" for
`phaser-best-practices` (not in s31; skills.sh shows 879 today); the claim that registry pages
"say so" about missing signatures/provenance (s31 does not).

**Not checked (gaps):** the Impertio package contents (already [U]); the `__THREE_GAME_TEST_HOOKS__`
member names and the capture order in s5's `threejs-qa-release` (a grep of its SKILL.md found
only `evidence.json`; the names may live in references or scripts); the "87 of ~107 commits by
one author" and "single author, 11 commits" authorship splits; the Tauri skill in
travisjneuman/.claude (already [U]); the exact `llms-full.txt` TSL coverage; that no game
packaging skill for Capacitor/Electron exists (a negative claim, not searchable to closure);
the Strudel servers' behaviour beyond their licence; the phaser.io 3→4 migration article; and
the claim that `anthropics/skills` is Apache-2.0 "per skill" (the repo reports no top-level
licence to the API).
