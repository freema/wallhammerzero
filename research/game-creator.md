# Research: `game-creator` (PlayableIntelligence / OpusGameLabs)

- **Date:** 2026-10-02
- **Method:** read-only shallow clone of `https://github.com/PlayableIntelligence/game-creator` at commit `4e64b83b5fe400b34ad3a484d9b4a6090b26d512` (2026-05-25). I installed nothing, ran nothing, and copied nothing into this project. I read the GitHub API for metadata, issues and PRs. Git LFS binaries and the 3 submodules were not fetched.
- **How to read this:** facts cite a repo path (relative to the repo root at that commit) or a URL. **Opinion:** marks my own assessment. **Uncertain:** marks things I could not verify.

---

## Executive summary

1. **Which repo is canonical:** `PlayableIntelligence/game-creator` is the canonical repo. `opusgamelabs/game-creator` is the same repo under its old owner: the GitHub API resolves it to `PlayableIntelligence/game-creator`, and the last commit is "Update README: rename OpusGameLabs to playableintelligence". It is a Claude Code plugin and an `npx skills` bundle with 31 skills, 4 agents and 1 hook. From a prompt or a tweet it produces small arcade browser games (Phaser or Three.js), deploys them to here.now and monetizes them through Play.fun.
2. **Maturity:** 334 stars, 41 forks and 189 commits. It was created 2026-01-28 and the last commit was 2026-05-25, so it has been idle for about 4 months. One developer wrote 151 of the 189 commits. There are 6 open, unmerged PRs (#21, #23, #27, #28, #34, #35) and clear documentation drift. **The licence is unclear:** there is no LICENSE file, the README and skill frontmatter say MIT, `package.json` says ISC, and GitHub detects no licence.
3. **Sprites are written as code.** Each sprite is a 2D array of palette indices, painted to a canvas at runtime by `renderPixelArt()` / `renderSpriteSheet()`. The repo ships 3 named 11-colour palettes, 6 archetypes, a scale table, a rule of 2–4 animation frames, speckled tile variants, and FX built from tweens or parametric frame functions. **Opinion:** this is very close to our "programs compute pixels" approach, but the quality bar is "readable at 16×16", well below Kairosoft quality.
4. **For named characters and for 3D, the defaults are not code-generated.** Characters "starring" real public figures default to photo heads composited onto cartoon bodies (10 real people ship in `assets/characters/`), plus real company logos and meme images. The 3D path defaults to paid AI services (Meshy, World Labs) and Sketchfab downloads. All of this is off-limits for us.
5. **Audio is close to music-as-data.** It is a zero-dependency Web Audio step sequencer that plays note strings (`"C4 R E4 G4"`), plus oscillator-based SFX presets and a mixing table. Strudel is offered as an "optional" upgrade, but it is AGPL-3.0 and 17 of the 22 examples depend on it.
6. **Verification is the strongest part.** Every game exposes `window.render_game_to_text()`, `window.advanceTime(ms)` and `window.__GAME__`. `iterate-client.js` replays JSON action scripts and saves a screenshot, the game state and any console errors. A QA subagent runs 5 phases (build, runtime, gameplay, architecture, visual) after every step, with up to 3 autofix attempts and a ledger of past attempts. The Playwright suites include "doing nothing must lose" design-intent tests.
7. **Verification has weak spots.** Visual review is an LLM looking at screenshots, plus screenshot diffs with a 3000-pixel tolerance. The architecture "validators" are regex checks. There is no per-asset review or approval loop, and no automated CI for the skills.
8. **There are two orchestration paths.** `/viral-game` is a one-shot, roughly 10-minute pipeline in which the orchestrator delegates each step to a subagent. `/make-game` v2 is a multi-session, docs-first workflow: gameplan, tech, ADRs, milestones whose acceptance criteria (AC) link to tests, `STATE.md`, a backlog and a live-iterate loop. **Opinion:** `/make-game` maps well onto our "Claude session plus repo files" generator.
9. **The architecture is the opposite of ours.** Each game is its own JS codebase with EventBus, GameState and Constants singletons, and `Constants.js` reads `window` and DPR when it loads. Wallhammer Zero wants games as pure data, playable by a swappable player.
10. **There is no voxel content at all.** Searching for "voxel" returns 0 hits. The 3D side is a Three.js template, InstancedMesh performance guidance and GLB/Gaussian-splat pipelines. A few pieces are useful for the voxel planet: CPU-side performance metrics, instancing, a per-model normalisation manifest, and headless SwiftShader rendering (see §6).
11. **Borrow ideas, not code.** The main ideas worth taking are: a generic test protocol in the player, the code-sprite rules (enforced by a linter), music as note-string data, the QA/autofix/attempt-ledger loop, and the `make-game` document templates (STATE, backlog, milestone, ADR, playtest-repro).
12. **The skillspector scan applies only if we copy files.** In that case the scan must cover the hook (highest risk: it reads every prompt and writes `.env`), the agents, the skill text (including a 127 KB `llms-full.txt`), the scripts and the 3 unpinned submodules.

---

## 1. Identity, maintainers, licence, maturity

| Item | Finding | Source |
|---|---|---|
| Canonical repo | `PlayableIntelligence/game-creator` (org "Playable Intelligence", 2 public repos) | `https://api.github.com/repos/PlayableIntelligence/game-creator`; `https://api.github.com/orgs/PlayableIntelligence` |
| `opusgamelabs/game-creator` | The same repo. The API resolves it to `PlayableIntelligence/game-creator`, with the same stars and push date. `package.json`, `.claude-plugin/*.json` and `CLAUDE.md` still say OpusGameLabs. | API call on `repos/opusgamelabs/game-creator`; `package.json` (`repository.url`); `.claude-plugin/marketplace.json` |
| Other names | `skills-lock.json` lists the source as `M4cs/game-creator`, which returns 404 (a stale fork or provenance). `make-game/templates/agents.md` installs from `opusgamelabs/game-creator`. | `skills-lock.json`; `skills/make-game/templates/agents.md` |
| Maintainers | Ryan Shtirmer (`rshtirmer`, 151 commits) and Max Bridgland (`M4cs`, 11 commits as M4cs, plus PRs merged under that name); 7 other contributors (15 commits or fewer each) | `https://api.github.com/repos/PlayableIntelligence/game-creator/contributors` |
| Self-description | "The game studio for the agent internet… Play.fun (OpenGameProtocol)… share on Moltbook" | `CLAUDE.md` L5; `package.json` description |
| Licence | **Ambiguous.** There is no LICENSE file. README L211 and all SKILL.md frontmatter say MIT; `package.json` says `"license": "ISC"`; GitHub API `license: null`. Strudel (`@strudel/web`) is AGPL-3.0 and the README warns about it. | `README.md` L209–211; `package.json`; API |
| Activity | Created 2026-01-28. 189 commits. Last commit and push 2026-05-25. Only one tag (`v1.3.0`), no releases. Open PRs updated as late as 2026-08-24 (#35 MuAPI, #34 Atlas Cloud; both external, unmerged). | API: commits pagination (189 pages at per_page=1), tags, issues |
| Popularity | 334 stars, 41 forks, 10 open issues and PRs | API |
| Known issues | #14 repo too big for `npx skills add` (my clone is 372 MB, mostly LFS pointers, examples and character photos); #29 demo links return 404; #30 headless Chromium crashes inside the macOS sandbox (relevant to us); #32 skills fail in Copilot CLI because of an array-shaped `argument-hint` | `https://github.com/PlayableIntelligence/game-creator/issues/14`, `/29`, `/30`, `/32` |
| Unmerged work of interest | #28 "Three-axis evaluator: debug-protocol port + eval-game" (static cross-file key checks, build-health score); #10 performance benchmark harness and "agent-skills standard"; #21 game-creator-plus; #22 "Gate public-figure work on explicit mention" (**not merged**, so `main` has no gating); #27 refactor of viral-game onto make-game | `/pull/28`, `/pull/10`, `/pull/21`, `/pull/22`, `/pull/27` |

**Documentation drift** (all verified in files). **Opinion:** this is a maturity signal.
- The README and docs say "Phaser 3 (`^3.90.0`)", but `templates/phaser-2d/package.json` depends on `"phaser": "^4.1.0"`.
- README L172 and `skills/viral-game/step-details.md` L26 say both templates "ship with `scripts/verify-runtime.mjs`, `iterate-client.js`…", but `templates/*/` contain no `scripts/` folder. The copies live only in `examples/*/scripts/`.
- `skills/threejs-game/SKILL.md` says to disable shadows on the first pass (also in the pre-ship checklist), but `templates/threejs-3d/src/core/Game.js` sets `shadowMap.enabled = true`.
- The docs say three `^0.183.0`, but the template pins `^0.180.0`, because of the Spark 2.0 peer dependency (`skills/worldlabs/SKILL.md` L116).
- `CLAUDE.md` says audio is zero-dependency Web Audio with Strudel optional. `agents/game-creator.md` Step 3 says "Install `@strudel/web` if needed", and 17 of the 22 `examples/*/package.json` depend on `@strudel`.
- `skills/game-assets/sprite-catalog.md` L310+: `GRAVESTONE`, `BONE_PILE` and `TORCH` use palette indices 12, 18 and 19, but every shipped palette has only 11 entries. `renderPixelArt` silently skips `palette[idx] == null`, so these pixels would come out transparent.
- `scripts/intercept-api-key.mjs` does not handle `RETRODIFFUSION_API_KEY`, yet `skills/retrodiffusion/SKILL.md` promises that this key "will be saved to .env and redacted".

---

## 2. Repository structure and full inventory

```
.claude-plugin/{plugin.json, marketplace.json}   plugin manifest (v1.3.0, owner OpusGameLabs)
settings.json                                    agent: game-creator; env CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1; UserPromptSubmit hook
CLAUDE.md, README.md, TROUBLESHOOTING.md
agents/        4 agent definitions
skills/        31 skill dirs with SKILL.md + 2 symlinks into submodules + 1 empty submodule dir
scripts/       15 Node scripts (QA loop, validators, external-API generators, photo pipeline, key hook)
templates/     phaser-2d, threejs-3d (runnable starters, procedural placeholder graphics)
examples/      22 generated games (10 Phaser, 12 Three.js), most with progress.md and copied scripts
assets/        characters/ (10 real-person photo-composite spritesheets, 140 MB), 3d-characters/ (6 GLB via LFS)
site/          gallery builder, thumbnail capture (Playwright + sharp), telemetry server (Express + Postgres on Railway)
tests/         manual skill-trigger tests, 7 flow test scripts, eval targets
submodules/    playdotfun (playdotfun/skills), unity-mcp (CoplayDev/unity-mcp, beta); skills/sub-games → git@github.com:subdotgames/skills
```

### 2.1 Skills: one line each

**Workflow / slash-command skills**

| Skill | What it does |
|---|---|
| `make-game` | Multi-session, docs-first workflow (idea → scaffold → development). Writes `docs/gameplan.md`, `tech.md`, ADRs, milestones, `STATE.md` and `backlog.md`, and has 11 sub-pipelines (`skills/make-game/`). |
| `viral-game` | One-shot pipeline: tweet, story or prompt → scaffold → gateables → assets → design → promo video → audio → tests → here.now deploy → Play.fun monetisation → review, with QA after each code step (`SKILL.md` 652 lines, `step-details.md` 876 lines). |
| `quick-game` | Scaffold plus core loop only, with no assets, audio, deploy or monetisation. |
| `use-template` | Copies a gallery example into a new project. Sends an opt-out telemetry ping to Railway (`skills/use-template/SKILL.md` L133–140). |
| `add-feature` | Adds one mechanic while following the EventBus / GameState / Constants rules. |
| `add-assets` | Replaces shapes with code pixel-art sprites (loads `game-assets`). |
| `add-3d-assets` | Replaces Three.js primitives with GLB models (loads `game-3d-assets`). |
| `add-audio` | Adds Web Audio BGM, SFX and a mute toggle (loads `game-audio`). |
| `design-game` | Visual-polish audit with a 1–5 rubric, then implementation (loads `game-designer`). |
| `improve-game` | Audits 13 areas on a 1–5 scale ("X / 65"), proposes the top 5–8 improvements and implements the ones the user picks. |
| `review-game` | Read-only review of architecture, performance and best practices. |
| `qa-game` | Adds a Playwright suite (gameplay, visual, perf) to a game. |
| `record-promo` | Records a promo video (standalone command). |
| `promo-video` | The technique behind it: 50 FPS capture by slowing the game to 0.5×, recording at 25 FPS, then speeding up 2× with ffmpeg. |
| `monetize-game` | Play.fun registration, SDK injection and redeploy. |
| `scaffold-gateables` | Skins, continue-after-death, daily challenge and similar features behind `isEntitled()` hooks. |
| `add-multiplayer` | PartyKit (Cloudflare Durable Objects) room server plus a NetworkManager client. |
| `retrodiffusion` | Paid Retro Diffusion API for pixel-art sprites, tilesets and animations. |
| `meshyai` | Paid Meshy AI: text or image to 3D, auto-rig, animate. |
| `worldlabs` | World Labs Marble API: Gaussian-splat environments plus a collider GLB, rendered with SparkJS 2. |
| `fetch-tweet` | Fetches tweet JSON through `api.fxtwitter.com`. |

**Reference skills** (loaded by other skills)

| Skill | What it does |
|---|---|
| `phaser` | Phaser patterns, plus 8 companions including `no-asset-design.md` (procedural backgrounds, parallax). |
| `threejs-game` | Three.js architecture, renderer choice, perf rules, TSL, input. Bundles `reference/llms.txt` (5 KB) and `llms-full.txt` (127 KB). |
| `threejs-perf` | InstancedMesh patterns for static and moving objects, with measured before/after numbers. |
| `game-architecture` | EventBus, GameState, Constants and orchestrator; restart safety; pitfalls; pre-ship checklist. |
| `game-assets` | Code pixel-art system, palettes, archetypes, plus the photo-composite pipeline for real people. |
| `game-3d-assets` | GLB sourcing tiers, AssetLoader, clip maps, animated characters. |
| `game-designer` | Juice/polish catalog and a "viral spectacle" rubric. |
| `game-audio` | Web Audio sequencer, SFX engine, mixing; optional Strudel. |
| `game-qa` | Playwright patterns, gameplay invariants, visual regression, clock control, MCP, iterate client. |
| `game-deploy` | Deploy to here.now (default), GitHub Pages, Vercel, Netlify or itch.io. |
| `playdotfun` | Symlink to submodule (not in the clone): Play.fun SDK and API. |
| `unity-mcp` | Symlink to submodule (CoplayDev, beta branch): Unity Editor automation over MCP. |
| `sub-games` | Empty submodule (SSH URL): sub.games community platform. |

### 2.2 Agents

| Agent | What it does |
|---|---|
| `agents/game-creator.md` | Autonomous `/viral-game`-style pipeline. Delegates every code step to subagents, then runs the 5-phase QA, then autofix (max 3 attempts), with no user confirmation between steps. |
| `agents/game-qa-runner.md` | Runs Playwright suites and fixes the game code. "You never weaken test assertions." Preloads `game-qa` and `game-architecture`. |
| `agents/game-reviewer.md` | Reviews architecture, performance red flags and monetisation readiness. |
| `agents/game-deploy.md` | Deploys with pre- and post-validation. May run `npm install -g vercel` (L121). |

### 2.3 Hooks and settings

- `settings.json` contains:
  - `"agent": "game-creator"`. **Uncertain:** whether Claude Code applies this from a plugin; if it does, the plugin's agent becomes the default main agent.
  - `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
  - a `UserPromptSubmit` hook: `node scripts/intercept-api-key.mjs` (relative path).
- `scripts/intercept-api-key.mjs` reads every prompt and regex-matches keys (`MESHY_API_KEY`, `WLT_*`, `SKETCHFAB_TOKEN`…, or bare `msy_`, `wlt_`, `sk_` prefixes). It upserts them into `.env` (chmod 600), appends `.env` to `.gitignore`, **blocks the prompt** (exit 2) and injects context telling Claude where the key is.

### 2.4 Scripts

| Script | What it does |
|---|---|
| `scripts/iterate-client.js` | Playwright loop: action JSON → frames → canvas screenshot, `state-N.json`, `errors-N.json`; also restart-cycle testing. |
| `scripts/verify-runtime.mjs` | Loads the page headless, waits 3 s, fails on `pageerror` or `console.error`. |
| `scripts/validate-architecture.mjs`, `scripts/validate-architecture-threejs.mjs` | Regex checks for `render_game_to_text`, `reset(`, `SAFE_ZONE`, the button pattern and event constants; warns on magic numbers. |
| `scripts/example-actions.json` | Default action script. |
| `scripts/meshy-generate.mjs`, `scripts/worldlabs-generate.mjs`, `scripts/retrodiffusion-generate.mjs`, `scripts/find-3d-asset.mjs` | External API clients (Sketchfab, Poly Haven, Poly.pizza). |
| `scripts/optimize-glb.mjs` | Calls gltf-transform through `execSync`. |
| `scripts/build-character.mjs`, `scripts/crop-head.mjs`, `scripts/process-head.mjs`, `scripts/build-spritesheet.mjs` | Photo pipeline for real people: ML background removal (`@imgly/background-removal-node`), face-api face detection, spritesheet assembly. |

### 2.5 Tests

There is no automated CI.
- `tests/trigger-tests.md` and `tests/trigger-{positive,negative}.txt` are manual prompts that check which skill triggers.
- `tests/flows/01–07` are manual end-to-end checklists.
- `tests/evals-README.md` sets targets: trigger recall ≥90%, false positives ≤10%, flow success ≥8/10, at most 2 clarifying questions.

---

## 3. How it generates game assets as code

### 3.1 Sprite representation (fact)

- A sprite is a `number[][]` of palette indices. **Index 0 is always transparent.** The arrays live in `src/sprites/*.js` modules (`player.js`, `enemies.js`, `items.js`, `projectiles.js`, `tiles.js`, `palette.js`) (`skills/game-assets/pixel-renderer.md`).
- `renderPixelArt(scene, pixels, palette, key, scale)` creates a canvas and `fillRect`s each non-zero cell `scale×scale`, then registers it with `scene.textures.addCanvas`. `renderSpriteSheet` lays the frames out in a horizontal strip and calls `addSpriteSheet` (`skills/game-assets/pixel-renderer.md`).
- Rendering happens at runtime, in the browser, inside the game. Nothing is baked to PNG.
- `examples/maze-tanks/src/sprites/effects.js` L21–60 builds 32×32 FX frames from a function of distance to the centre: `buildFrame(d => d<=4 ? W : d<=7 ? Y : …)`. The 4 explosion frames are 4 lambdas. `examples/maze-tanks/src/sprites/registerSprites.js` registers every texture at one integer scale and reuses one body matrix with 4 tank palettes (palette swaps).

### 3.2 Palettes (fact; the palette identification is my opinion)

- `PALETTE.DARK`, `BRIGHT` and `RETRO` each have 11 entries with fixed slot semantics: 1 = outline, 2 = shadow, 3 = accent/red, 4 = highlight/yellow, 5 = skin, 8 = white (eyes), 9 = purple, 10 = green (`skills/game-assets/pixel-renderer.md`).
- **Opinion:** `BRIGHT` looks like a subset of DawnBringer DB32 and `RETRO` like NES-palette approximations. **Uncertain:** nothing in the repo states this.
- Rules (`skills/game-assets/SKILL.md` L100–104): every sprite in a game shares one palette; enemies are told apart by which slots they use, not by new colours; no inline hex in matrices.
- `skills/game-designer/visual-catalog.md` adds a second, semantic palette layer for UI and backgrounds: `{base, light, dark}` per role.
- `skills/phaser/no-asset-design.md` says 3–5 colours maximum for procedural games.

### 3.3 Archetypes (fact)

`skills/game-assets/sprite-catalog.md` gives worked matrices and design notes for:
- Humanoid, 16×16: idle plus 2 walk frames.
- Flying creature: bat idle/flap.
- Ground creature: zombie.
- Item: gem, heart, 8×8.
- Projectile: fireball 8×8, bolt 6×6.
- Background tile: 16×16 speckle.
- Decorative props: gravestone, bones, torch.
- "Personality character": 32×48 at scale 4. Used for real people, with "exaggerate their most recognizable feature".

### 3.4 Animation rules (fact)

From `skills/game-assets/SKILL.md` L92–98:
- Walk: shift the legs 1–2 px per frame, 2–4 frames.
- Fly: 2 frames.
- Idle: a 1 px bob done with a tween, not with frames.
- No attack frames at 16×16; use flash or shake instead.
- **Never rotate sprites smaller than 24×24.**

Elsewhere:
- Frame order for walking is `[IDLE, WALK1, IDLE, WALK2]` (`skills/game-assets/sprite-catalog.md`).
- Static pickups get a tween bob (`skills/game-assets/SKILL.md` checklist).
- Expression frames 0–3 (normal, happy, angry, surprised) with a 600 ms hold, wired to events (`skills/game-assets/character-pipeline.md`). This exists for the photo characters, but the event → expression-frame idea is generic.

### 3.5 Scale guide (fact)

From `skills/game-assets/SKILL.md` L105–112, for a 540 px canvas:

| Entity | Grid | Scale | On screen | Share of canvas |
|---|---|---|---|---|
| Tiny | 8×8 | 3 | 24 px | 4% |
| Small | 12×12 | 3 | 36 px | 7% |
| Medium | 16×16 | 3 | 48 px | 9% |
| Large | 24–32 | 3 | 72–96 px | 13–18% |
| Personality | 32×48 | 4 | 128×192 px | 35% |

Further rules:
- Items smaller than 16×16 should use bold geometric silhouettes.
- Small sprites get a 2 px outline.
- Hostile and collectible silhouettes must differ.
- The sprite size and the physics body size must agree.

The rendering setup is **not pixel-perfect** (fact; the impact is my opinion):
- `templates/phaser-2d/src/core/GameConfig.js` uses `antialias: true`.
- `templates/phaser-2d/src/core/Constants.js` computes a fractional `PX` (canvas pixels per design pixel).
- `examples/maze-tanks/src/sprites/registerSprites.js` admits "a small fractional rescale … produces minimal blur".
- `pixelArt: true` is mentioned only in the `phaser` and `retrodiffusion` skills.

**Opinion:** Kairosoft-style art needs integer scaling and nearest-neighbour filtering. Do not copy this setup.

### 3.6 Backgrounds, tiles and props (fact)

- Ground uses 2–3 low-contrast 16×16 tile variants at scale 2, mixed 70% / 15% / 15% at random. It is drawn either as a tileSprite or as a random grid (`skills/game-assets/sprite-catalog.md`, "Tiled Background Rendering").
- 20–50 decorative props are scattered at alpha 0.5–0.8.
- Depth layers: tiles −10, decorations −5, entities 5–15.
- Sky: a vertical gradient drawn one row per `fillRect` with lerped colours. Parallax clouds are clusters of ellipses moving at layer speed (`skills/game-designer/visual-catalog.md`).
- Time-of-day palette lerp and parallax with 3–4 layers at speeds 0.1 / 0.3 / 0.6 / 1.0 (`skills/phaser/no-asset-design.md`).
- **There is nothing on autotiling, isometric projection, rooms or furniture,** which is the core of Kairosoft-style building. Searching for isometric, tilemap, wang or autotile only finds the paid Retro Diffusion API styles.

### 3.7 FX (fact)

Source: `skills/game-designer/SKILL.md` and `skills/game-designer/visual-catalog.md`.
- Screen shake, camera flash, a 60 ms hit-freeze, death slow-mo (timeScale 0.3 for 400 ms).
- Tween particle bursts (`emitBurst`), Phaser particle-emitter trails, combo text that scales with the combo count, streak announcements, a score pulse with additive blending, pop-in and slam-in entrances, button hover/press tweens.
- Fade and curtain-wipe transitions.
- Every FX value goes into a `SPECTACLE` constants block, and FX are triggered through EventBus `spectacle:*` events.
- Mobile cap: 15–20 concurrent tween particles; use pools for continuous emitters.

**Opinion:** the guiding "viral spectacle" philosophy (motion in every frame, a shake every 2 s, rainbow backgrounds) suits 13-second silent social clips. It is wrong for calm, information-dense management sims.

### 3.8 Audio and music (fact)

- **Engine:** `AudioManager` with a lazily created AudioContext and a master GainNode for mute (`skills/game-audio/SKILL.md`). `AudioBridge` maps EventBus events to music and SFX. Audio starts on the first user gesture via an `AUDIO_INIT` event.
- **Music as data:** a look-ahead scheduler (100 ms ahead, 25 ms tick) runs parallel layers parsed from strings with `parsePattern('C3 R C3 R G3 …', 'triangle', gain, lpf)`. Each step creates oscillator → lowpass → gain (`skills/game-audio/sequencer-pattern.md`).
- **Anti-repetition:** phrase variations, layer lengths with a large lowest common multiple, random note omission, filter sweeps, and "30 s or more before an exact repeat" (`skills/game-audio/sequencer-pattern.md` L106–126; `skills/game-audio/bgm-patterns.md` L16–51).
- **SFX:** `playTone(freq, type, dur, gain, lpf)`, `playNotes([...])` and `playNoise(dur, gain, lpf, hpf)`, with presets for score, jump, death, click, power-up, hit, whoosh and select (`skills/game-audio/sfx-engine.md`).
- **Mixing table:** lead 0.10–0.18, bass 0.15–0.22, arpeggio 0.03–0.08, SFX 0.2–0.3. Plus style guides for retro, ambient and casual (`skills/game-audio/mixing-guide.md`).
- Optional Strudel BGM is AGPL-3.0 (`skills/game-audio/strudel-reference.md`, `bgm-patterns.md`).

### 3.9 Assets that are not code (fact)

The tier lists in `skills/game-assets/SKILL.md` ("Asset Tiers") and `skills/game-3d-assets/SKILL.md` include:
- photo-composite heads of real people found via WebSearch, with background removal and face cropping (`skills/game-assets/character-pipeline.md` Tiers 1–4);
- real company logos ("When a game features OpenAI, Anthropic, Google… download their logo");
- meme images from tweets;
- Kenney and OpenGameArt downloads;
- Retro Diffusion (paid);
- Meshy, World Labs, Sketchfab, Poly Haven and Poly.pizza for 3D.

Code-generated pixel art is explicitly the **fallback** for named people.

---

## 4. How it verifies output

### 4.1 A test API built into every game (fact)

Every game's `src/main.js` exposes a test API. See `templates/phaser-2d/src/main.js`, `templates/threejs-3d/src/main.js`, `CLAUDE.md` rules 6–8, and `skills/game-qa/SKILL.md` "Testability Requirements".
- `window.__GAME__`, `__GAME_STATE__`, `__EVENT_BUS__`, `__EVENTS__`.
- `window.render_game_to_text()` returns compact JSON: a coordinate-system note (`"origin:top-left x:right y:down"` in 2D, `"origin:center x:right y:up z:toward-camera"` in 3D), `mode` (`playing` / `game_over`), score, player position and velocity, and visible entities only. Its purpose: "AI agents can read the game without interpreting pixels".
- `window.advanceTime(ms)` waits that much real time across requestAnimationFrame callbacks. For frame-exact control, Playwright's `page.clock.install()` + `runFor()` is preferred (`skills/game-qa/clock-control.md`).
- `progress.md` at the project root records the original prompt, decisions, TODOs and gotchas after each step.

### 4.2 Scripts (fact)

**`scripts/iterate-client.js`:**
- Injects a virtual-time shim before the page loads (L150), so `advanceTime` exists even if the game does not provide it.
- Launches Chromium with `--use-gl=angle --use-angle=swiftshader` (software WebGL, L409).
- Waits until `__GAME__.isBooted` (Phaser) or `__GAME__.renderer` (Three.js) is set.
- Replays `{buttons:[…], frames:N, mouse_x, mouse_y}` steps frame by frame.
- Saves `shot-N.png` + `state-N.json` + `errors-N.json`.
- **Stops on the first new console error** (L509).
- Screenshot capture has three fallbacks: `canvas.toDataURL` → element screenshot → page clip. It also probes for a fully transparent canvas (L226–280) and documents the known blank-WebGL-canvas problem when `preserveDrawingBuffer` is false (`skills/viral-game/verification-protocol.md`). The Phaser template sets `preserveDrawingBuffer: true` for this reason.
- `--restart-cycles N` checks that the score resets to 0 and the mode leaves `game_over` after a restart (L514–620).

**Other scripts:**
- `scripts/verify-runtime.mjs` loads headless, waits 3 s, and exits 1 on any page or console error.
- `scripts/validate-architecture*.mjs` run regex presence checks and warn on magic numbers. **Opinion:** shallow.

### 4.3 The QA subagent protocol and autofix (fact)

Source: `agents/game-creator.md` and `skills/viral-game/verification-protocol.md`. After every code-modifying step, a QA subagent runs:

1. build
2. runtime
3. gameplay: iterate-client; some state must show `score > 0` and some `game_over`. Death may come back SKIPPED.
4. architecture validator
5. visual: Playwright MCP screenshots checked for entity visibility, safe zone, entity size, readable button labels and a mute button.

It returns a fixed text block (`QA RESULT: PASS|FAIL`, one line per phase, `ISSUES:`, `SCREENSHOTS:`), with **no images in the reply**, so the orchestrator's context stays small.

If QA fails, a fix subagent receives the ISSUES list plus earlier failed attempts from `output/autofix-history.json` (`{step, issue, fix_attempted, result, timestamp}`), so it does not repeat a failed approach. The cycle allows 3 attempts. After that the agent logs the failure, skips the step and continues; the skill version asks the user instead.

### 4.4 Playwright suites (fact)

**Layout and config:** `tests/e2e/{game,visual,perf}.spec.js`, a `gamePage` fixture and a Mulberry32 `seed-random.js` injected through `addInitScript` (it overrides `Math.random`). The Playwright `webServer` starts Vite automatically (`skills/game-qa/SKILL.md`; `skills/game-qa/visual-regression.md`).

**Gameplay invariants** (`skills/game-qa/gameplay-invariants.md`):
1. The player can score at least 1 point.
2. The fail condition triggers through normal play.
3. Game-over buttons have visible text (checks Text objects in the scene graph).
4. `render_game_to_text` parses and contains `mode` and `score`.
5. **Design intent** (L103+): "player loses when providing no input" is non-negotiable; "a no-input win is a bug". Opponent pressure must reach 25% of the maximum within half the round. Active input must lead to a win. Thresholds come from `Constants` or `design-brief.md`.
6. Entity-interaction asymmetry audit (adds a `// QA FLAG` comment rather than failing).
7. Mute toggles with the M key.

**Visual regression:** screenshots compared with `maxDiffPixels` 200–3000 and `threshold 0.3`. The examples use 3000 "because parallax clouds scroll" (`CLAUDE.md` Notes; `examples/flight-simulator/tests/e2e/visual.spec.js`).

**Performance and accessibility:** load in under 3 s and FPS > 30 (> 5 in headless, since SwiftShader gives about 7–9 FPS). axe-core runs on the HTML around the canvas.

### 4.5 Subjective review (fact)

- `game-designer` scores 14 areas from 1 to 5. **Any area below 4 must be fixed** (`skills/game-designer/SKILL.md` L98).
- `improve-game` scores 13 areas (out of 65) and reports the score before and after.
- Playwright MCP is used for "does it look good?" checks. If missing, it is installed via `claude mcp add playwright …`, which requires the user to restart (`skills/game-qa/playwright-mcp.md`).

### 4.6 Gaps

**Opinion:**
- No deterministic golden images.
- Seeding happens only at test time, by monkey-patching `Math.random`.
- There is no asset-level test (palette compliance, outline presence, frame-size consistency). The catalog's own invalid palette indices prove it would be useful (§1).
- No schema or reference-integrity validation. Unmerged PR #28 starts on this for Phaser asset, scene and animation keys.
- "Visual PASS" is an LLM judgement on a single screenshot.

---

## 5. End-to-end orchestration

### 5.1 `/viral-game` and the `game-creator` agent (fact)

From `skills/viral-game/SKILL.md` and `agents/game-creator.md`:
- **Step 0:** parse the input (prompt or tweet URL; a tweet goes through `fetch-tweet` with an explicit "untrusted content" boundary, `tweet-pipeline.md`). Ask the monetisation intent (none, Play.fun, sub.games, both). Create the task list and `progress.md`.
- **Step 1:** the main thread copies the template, runs `npm install` and `npx playwright install chromium` (which needs network access) and starts the dev server. A subagent then implements the core loop in a fixed order: input → movement → fail → score → restart. Scope: 1 scene, 1 mechanic. The subagent must also write a game-specific `example-actions.json` with at least 150 frames, enough play to score, and an idle tail long enough to die.
- **Step 1.25:** gateable features.
- **Step 1.5:** pixel art (2D) or Meshy and World Labs assets (3D).
- **Step 2:** design.
- **Step 2.5:** promo video.
- **Step 3:** audio.
- **Step 3.5:** Playwright suite.
- **Step 4:** here.now deploy.
- **Step 5:** Play.fun.
- **Step 5.5:** review.
- The QA protocol from §4.3 runs after each code-modifying step. The orchestrator never writes game code itself.

### 5.2 `/make-game` v2 (fact)

From `skills/make-game/`:
- **Hard rules:** no code before a plan exists. The idea phase must produce `docs/gameplan.md`, `docs/tech.md` and ADR-0001, and the user must confirm them.
- **Idea-phase checklist** (`phase-pipelines/idea.md`): core loop verbs, session shape, win/lose/progression, session length, hook, anti-goals, perspective, visual style, palette/mood, asset sourcing, audio direction, input model, scope ceiling, multiplayer.
- **Session start** (`sub-pipelines/session-start.md`): read `STATE.md` → gameplan → tech → the earliest open milestone → backlog. Infer the phase. Confirm the next step with the user.
- **Milestone template** (`templates/milestone.md`): every acceptance criterion links to a test (`— test: path::name`) or is explicitly tagged `— verified by user playtest`. The exit condition must read "User does X → observes Y". Tests are written to fail first.
- **Backlog** (`templates/backlog.md`): append-only. Promoted items get a ✓ and a milestone link; rejected items are struck through with a reason.
- **One feature per session:** `sub-pipelines/scope-triage.md` narrows the request and defers the rest.
- **Live iterate** (`sub-pipelines/live-iterate.md`): console → `render_game_to_text` → `advanceTime` → screenshot → regression smoke test → verdict of **Verified / Off-target / Broken** → one focused question to the user.
- **Playtest-repro** (`sub-pipelines/playtest-repro.md`): turns "feels floaty" into measurable variables and a confirmed numeric acceptance criterion.
- Also: a state-machine convention (transitions as data, no boolean soup, invalid-transition logging), a doc-drift audit, and `AGENTS.md` / `CLAUDE.md` bootstrap.

### 5.3 Tech stack of the generated games (fact)

- JavaScript ES modules, Vite 7, Phaser 3 or 4 (2D) or Three.js r172–r183 (3D).
- Web Audio (and in practice Strudel); Playwright and axe-core for tests.
- Hosting on here.now; Play.fun SDK from a CDN for monetisation.
- Mobile-first input: touch, gyro or joystick.
- No title screen ("Play.fun handles the chrome").
- The 2D design resolution is 960×540 or 540×960, with DPR-scaled canvases.

### 5.4 Iteration and feedback (fact, then opinion)

Feedback reaches the agent through:
- the QA ISSUES lists and the autofix ledger;
- `progress.md` or `STATE.md` for handoff between sessions;
- the `improve-game` and `design-game` score deltas;
- live-iterate's single focused question;
- playtest-repro for vague feedback.

**Opinion:** none of these is a structured place where a human approves or rejects a specific asset. In Wallhammer Zero, the Studio fills exactly that gap.

---

## 6. 3D, Three.js and voxels

This section was added at the owner's request: Wallhammer Zero will also make 3D voxel games on a seed-generated procedural planet, probably with Three.js and graphics as code.

### 6.1 Voxels (fact)

There are **none.** `grep -ri voxel` over the whole repo, including the 127 KB `llms-full.txt`, returns 0 hits. There is also no noise, heightmap, chunking, LOD or seeded world generation anywhere. Searching for simplex, perlin or heightmap finds nothing. The only "terrain" is a flat plane with random vertex-colour jitter in `examples/flight-simulator/src/level/LevelBuilder.js`, using `Math.random()` with no seed.

### 6.2 The 3D content that does exist (fact)

**Template** (`templates/threejs-3d/`):
- `WebGLRenderer` with antialias, DPR capped at 2, shadows enabled, fog, a `PlaneGeometry` ground.
- Third-person `OrbitControls`; movement relative to the camera azimuth.
- `InputSystem` merging touch and keyboard; a `Menu` HTML overlay.
- `src/level/AssetLoader.js`: GLTFLoader with `MeshoptDecoder`, a promise cache, `SkeletonUtils.clone` for skinned meshes, `preloadAll(onProgress)`, `disposeAll()`.
- `Constants.CHARACTER = {path, scale, offsetY, facingOffset, clipMap}`; the player loads Soldier.glb.
- three is pinned to `^0.180.0` for the Spark 2 peer dependency.

**`skills/threejs-game/`:**
- Required folders: `core/`, `systems/`, `gameplay/`, `level/`, `ui/`.
- `renderer.setAnimationLoop`; delta capped at 0.1 (template 0.05); DPR capped at 2.
- No post-processing and no shadows on the first pass; pooled temporary vectors; `dispose()` everything.
- WebGPU only when TSL or compute is needed (`tsl-guide.md`).
- A mobile input matrix with gyro, virtual joystick and tap zones (`input-patterns.md`).
- `reference/llms.txt` and `reference/llms-full.txt`: an LLM-oriented Three.js guide with links to threejs.org. **Uncertain:** the exact upstream source URL is not stated in the files.

**`skills/threejs-perf/`:**
- Static InstancedMesh: a 140×140 cube grid goes from 19,365 draw calls to 2, and render CPU p95 from 28.5 ms to 0.5 ms.
- Moving entities: a flat state buffer plus batched `setMatrixAt` for 8,000 entities goes from 8,000 draw calls to 1.
- Decision tree: repeated 50+ times → instance it.
- **Methodology note:** CPU-side metrics (draw calls, render CPU p95, update loop, build time) are trustworthy in headless SwiftShader; FPS is not.
- **The benchmark harness is not in `main`.** It is in unmerged PR #10, so the numbers cannot be reproduced from this repo.

**3D examples (12):**
- `castle-siege`: a sunset sky dome built from vertex colours, a pooled particle system (300 particles, scorch marks, trails), ACES tone mapping, 2048 px shadow maps.
- `singularity-run`: InstancedMesh "matrix rain".
- `flight-simulator`: rings plus the jittered plane.
- `labyrinth`: gyro-controlled marble maze.
- `3d-asset-test`: switching between GLB characters.
- `worldlabs-arcade`: Gaussian splats.
- `trump-vs-biden`: GLBs of real people.
- Also `crowd-dash`, `flappy-bird-3d`, `rock-em-sock-em`, `lowball-blitz` and `gigachad-sim`.

### 6.3 How 3D assets are made (fact)

Asset tiers, in order (`skills/game-3d-assets/SKILL.md`):
1. Meshy AI (paid): text or image → GLB, then rigging.
2. Pre-built GLBs in `assets/3d-characters/`: Soldier, Xbot, Robot and Fox (three.js and Khronos samples), plus Trump and Biden from Sketchfab under CC-BY.
3. Sketchfab search through `find-3d-asset.mjs`.
4. Poly Haven.
5. Poly.pizza.
6. **"Procedural geometry (last resort)"**.

Environments can come from World Labs Gaussian splats (`.spz`) plus a collider GLB (`skills/worldlabs/SKILL.md`).

**Opinion:** this is the opposite of graphics-as-code. The only code-built 3D in the repo is example scenery (primitives, vertex-colour domes, instanced quads).

### 6.4 How 3D is verified (fact)

- **Same 5-phase QA as 2D.** iterate-client waits for `__GAME__.renderer` and renders through SwiftShader. `render_game_to_text` reports a 3D coordinate note and the player position rounded to 0.01.
- **Model checks** (`skills/meshyai/verification-patterns.md`): log the bounding box size and centre after load; auto-scale to a target height; centre on X and Z and set `y = -box.min.y` for floor alignment; keep a per-model `rotationY` / facing offset in Constants; then take a screenshot to confirm facing and fit. `assets/3d-characters/manifest.json` stores `scale`, `facingOffset` and `clipMap` per model as data.
- **Visual regression:** full-page screenshots with a 3000-pixel tolerance (`examples/flight-simulator/tests/e2e/visual.spec.js`). Perf tests use FPS > 5 in headless (`TROUBLESHOOTING.md` L71–75).
- **Known environment problem:** headless Chromium crashes inside the macOS sandbox (issue #30). This matches our environment: a Claude Code sandbox on macOS.

### 6.5 What this means for the seed-generated voxel planet

All of §6.5 is **opinion**.

**Worth borrowing:**
1. **A world-state text dump.** Give the 3D player a `render_world_to_text()` / `advanceTime` equivalent: seed, planet parameters, loaded chunk count, chunk-mesh triangle count, `renderer.info.render.calls` and `.triangles`, camera pose, and entities near the camera. A Claude session can then check generation and streaming without looking at pixels. The pattern comes from `templates/threejs-3d/src/main.js`.
2. **Golden renders per seed.** Fixed seed, fixed camera poses, SwiftShader (`scripts/iterate-client.js` L409), exact pixel hash or a tight diff. This replaces their 3000-pixel tolerance, and it works for us because our generator is deterministic by construction. **Determinism must live in the generator** (seed → PRNG passed explicitly), not in a test-time `Math.random` override.
3. **CPU-side performance gates** (draw calls, render CPU p95, mesh-build time per chunk) instead of FPS in headless. Methodology from `skills/threejs-perf/SKILL.md`, "Methodology notes".
4. **InstancedMesh for repeated props** on the planet (trees, rocks, voxel "decorations") (`skills/threejs-perf/instancing-static.md`, `instancing-moving.md`). Terrain itself should be chunk meshes (for example, greedy-meshed). **Uncertain:** the repo offers no guidance on that. See `research/voxels.md` (another agent).
5. **A model normalisation manifest as data** (scale, pivot or floor offset, facing, clip map), plus automated bounding-box, floor and facing checks for generated voxel models (`assets/3d-characters/manifest.json`; `skills/meshyai/verification-patterns.md`). For us these should be automatic gates, not a "take a screenshot" instruction.
6. **Hygiene rules:** cap DPR, cap delta, `setAnimationLoop`, `dispose()` everything, no post-processing or shadows until there is a performance budget (`skills/threejs-game/SKILL.md`, "Performance Rules").

**Not worth borrowing:**
- The external 3D generators and downloads (Meshy, World Labs, Sketchfab, Poly.pizza). They are not graphics-as-code, they carry licence risk, and they need API keys.
- Gaussian splats: they are not voxels and they are not data our player could swap.
- The third-person OrbitControls default.
- Unseeded `Math.random` scenery.
- Treating the `threejs-perf` numbers as established: the harness is not in `main`.

---

## 7. Recommendations for Wallhammer Zero

All recommendations are **opinion**, based on the facts above. Paths refer to the game-creator repo. "Borrow" means re-implement the idea in our own stack (TypeScript, our WebGL runtime, data files). It does not mean copying code.

### 7.1 What to borrow

1. **A test protocol at the player level, written into the player spec from day one.**
   - Expose `renderStateToText()`, `advanceTime(ms)` or `step(frames)`, `setSeed()`, and a JSON action-script runner that outputs a screenshot, a state dump and errors.
   - Since our games are pure data, this is **one implementation shared by every game**, not per-game code as in game-creator. A future Godot player must implement the same protocol (for example, over a debug socket) so both players can be checked against the same scripts.
   - Refs: `templates/phaser-2d/src/main.js`, `templates/threejs-3d/src/main.js`, `scripts/iterate-client.js` (action format, virtual-time shim, transparent-canvas probe, screenshot fallbacks, stop on first error, restart-cycle checks), `skills/game-qa/clock-control.md`.
2. **Design-intent invariants, adapted to management sims.**
   - Their "no-input must lose" and "active input can win" tests become checks such as: "an idle player stagnates or goes bankrupt within N in-game months", "a scripted competent policy reaches milestone X by year N", "no resource grows without bound over 10 simulated years", "every building or staff type is reachable".
   - Run them headless on the simulation data only, much faster than real time.
   - Refs: `skills/game-qa/gameplay-invariants.md` §5 (L103–160), `scripts/iterate-client.js` restart cycles.
3. **The code-sprite model as data, with a linter.**
   - Use a palette-index grid with index 0 transparent and fixed slot semantics (outline, shadow, highlight…), one shared palette per game, palette swaps for variants, horizontal frame strips, and parametric FX frames (`frame = f(distance, t)`).
   - Store the output of our pixel programs as data (for example JSON or indexed PNG plus metadata) that both players can load.
   - Add an automated sprite lint: every index exists in the palette (their own catalog fails this), an outline is present on sprites ≤16 px, frame sizes are consistent, no rotation flag on sprites <24 px, and the size matches the scale table.
   - Refs: `skills/game-assets/pixel-renderer.md`, `sprite-catalog.md`, `SKILL.md` L70–112, `examples/maze-tanks/src/sprites/effects.js`, `registerSprites.js`.
4. **Sprite design rules as Studio review criteria.**
   - Silhouette first, two tones minimum plus an outline, high-contrast eyes, minimal animation (legs shift 1–2 px, 2–4 frames, bob via transform), palette discipline, distinct silhouettes for hostile and friendly objects, and the scale table.
   - Show them as a checklist or 1–5 rubric beside each asset in the Studio, with an "any criterion below threshold → reject" rule like their `<4 must fix`.
   - Refs: `skills/game-assets/SKILL.md` L66–112, `skills/game-designer/SKILL.md` L76–98.
5. **Music and SFX as portable data.**
   - Note-string layers with waveform, gain and lowpass per layer, BPM and steps per beat, plus SFX as parameter tuples (`tone`, `notes`, `noise` with ADSR and filters).
   - Adopt the anti-repetition rules and the mixing table.
   - Specify the synth precisely enough that the Godot player can reproduce it. Avoid Strudel because it is AGPL.
   - Refs: `skills/game-audio/sequencer-pattern.md`, `sfx-engine.md`, `mixing-guide.md`, `bgm-patterns.md` L16–51.
6. **The QA, autofix and attempt-ledger loop for the generator.**
   - A QA subagent returns a fixed PASS/FAIL text block with no images.
   - A fix subagent gets the issue list plus `autofix-history.json`, so it does not repeat failed attempts. Cap at 3 attempts, then escalate.
   - Map this onto the Studio: an owner verdict ("rejected: walk cycle too stiff") becomes a ledger entry the next Claude session must read before regenerating that asset.
   - Refs: `agents/game-creator.md` ("Verification Protocol", "Autofix Logic"), `skills/viral-game/verification-protocol.md`.
7. **The `make-game` document shapes for repo-file continuity.**
   - `STATE.md` (last action, next step, blockers), the append-only backlog with promoted and rejected trails, milestones whose acceptance criteria link to tests or are tagged `verified by user playtest`, ADRs, the session-start read order, one feature per session, live-iterate verdicts (**Verified / Off-target / Broken**), and playtest-repro (vague feedback → measurable acceptance criterion).
   - The Studio's "comment → task note in `tasks/`" flow should run playtest-repro.
   - Refs: `skills/make-game/SKILL.md`, `templates/*.md`, `sub-pipelines/{session-start,live-iterate,playtest-repro,scope-triage,state-machine}.md`.
8. **The idea-phase checklist as the game-concept page template.**
   - Core verbs, session shape, win/lose/progression, session length, hook, anti-goals, perspective, style, palette, asset sourcing, audio direction, input, scope ceiling.
   - Ref: `skills/make-game/phase-pipelines/idea.md` L24–63.
9. **Static reference-integrity checks**, the idea from unmerged PR #28.
   - In a data-only game: every sprite, animation, sound, building and event id referenced anywhere resolves. Plus a "build health" score with explicit deductions, for example "all frames blank −50" or "uncaught exception −20".
   - Ref: `https://github.com/PlayableIntelligence/game-creator/pull/28`.
10. **Skill hygiene for our own skills.**
    - Progressive disclosure (a short SKILL.md plus flat companion files), a split between reference skills and workflow skills, and positive/negative trigger tests with targets.
    - Refs: `CLAUDE.md` "Skill Companion Files Convention", "Reference vs User-Invocable Skills"; `tests/trigger-tests.md`; `tests/evals-README.md`.
11. **Studio animation previews (minor).**
    - Their promo technique (slow time to 0.5×, record, speed up) shows that Playwright video tops out at 25 FPS.
    - For animation previews, prefer deterministic frame-by-frame rendering through `step()` and encode afterwards.
    - Ref: `skills/promo-video/SKILL.md`, `skills/promo-video/scripts/convert-highfps.sh`.

### 7.2 What not to borrow, and why

| Item | Where | Why not |
|---|---|---|
| Real people, real brands, memes | `assets/characters/` (10 real politicians and CEOs), `assets/3d-characters/models/{trump,biden}.glb`, `skills/game-assets/character-pipeline.md` (WebSearch photo scraping), `sprite-catalog.md` "Push the Pose", `viral-game/step-details.md` L70 (CEO-per-company mapping), logo and meme download in `integration-patterns.md`, `tweet-pipeline.md` celebrity detection | Likeness, defamation and trademark risk; store and platform certification risk (Steam, consoles); conflicts with our original-IP sims. The gating PR (#22) is not merged. |
| Paid or external AI asset generators and model downloads | `retrodiffusion`, `meshyai`, `worldlabs`, `game-3d-assets` tiers 1, 3–5, `scripts/*-generate.mjs`, `find-3d-asset.mjs` | Conflicts with "graphics produced by code". Needs API keys and secrets. Licences vary per asset. Output is not reproducible from a seed. |
| Per-game code architecture | `game-architecture`, `templates/*/src/core/*`, `Constants.js` computed from `window` and DPR at import time | Conflicts with "games are pure data, swappable player". **Opinion:** keep the ideas (central state, events as a contract, no magic numbers) but express them as data schemas the player interprets. |
| The "viral spectacle" design philosophy | `skills/game-designer/SKILL.md` ("Viral Spectacle Philosophy", rubric rows "First Impression / Viral Appeal", "Thematic Identity") | Kairosoft sims are calm, readable and dense with information. Constant shake and rainbow backgrounds would hurt them. |
| Monetisation and distribution stack | Play.fun (wallet and on-chain rewards), sub.games, Moltbook, here.now, `SAFE_ZONE` 75 px for the Play.fun widget, "no title screen" | Irrelevant to Steam, mobile or console. Adds crypto, platform and policy risk. |
| Strudel | `skills/game-audio/strudel-reference.md`, `bgm-patterns.md`; 17 example `package.json` files | AGPL-3.0 conflicts with commercial closed distribution and cannot be ported to Godot. |
| The API-key interception hook | `settings.json`, `scripts/intercept-api-key.mjs` | Reads every prompt, writes `.env` and `.gitignore`, blocks prompts, runs from a relative path (whatever is at `./scripts/` in the current directory), and coverage is incomplete. Our rule: never handle secrets. |
| Plugin-level defaults | `settings.json` (`"agent"` override, experimental agent-teams env), `claude mcp add` mid-pipeline, `npm install -g vercel`, telemetry in `use-template` | Global side effects. Conflicts with "never install globally or into ~/.claude". |
| Their visual QA thresholds | `maxDiffPixels: 3000`, LLM screenshot judgement as the gate, regex architecture validators | Too weak for deterministic code-generated assets; we can and should do exact goldens plus lint. |
| Non-pixel-perfect scaling | `templates/phaser-2d/src/core/GameConfig.js` (`antialias: true`), fractional `PX` | Kairosoft look requires integer scaling and nearest-neighbour filtering. |
| Test-time determinism hack | `tests/helpers/seed-random.js` overriding `Math.random` | Seeding must be part of the data and runtime contract, especially for the seeded planet. |
| Copying code at all | Whole repo | Licence ambiguous (no LICENSE file; MIT vs ISC). **Opinion:** re-implement from scratch; at most copy small, well-understood snippets after the scan and a licence decision. |

### 7.3 What needs the skillspector scan before any reuse

Scope: only files we would copy or install, or whose text we would paste into our own skills. Reading for ideas, as here, involves none of them.

| Path | Kind | Why scan; risk |
|---|---|---|
| `settings.json`, `scripts/intercept-api-key.mjs` | Hook | **High.** Runs on every prompt, writes files, blocks prompts, relative-path execution. |
| `agents/game-creator.md`, `game-qa-runner.md`, `game-deploy.md`, `game-reviewer.md` | Agent prompts | Autonomous installs (`npm install`, `npx playwright install`, `npm install -g vercel`), deploys, no confirmation gates. |
| `skills/**/SKILL.md` and companions, especially `viral-game/{SKILL,step-details,tweet-pipeline,verification-protocol}.md`, `game-assets/character-pipeline.md`, `game-qa/playwright-mcp.md`, `use-template/SKILL.md`, `monetize-game/SKILL.md`, `game-deploy/SKILL.md`, `make-game/**` | Instruction text | Prompt-injection surface. Ingests untrusted web content (tweets, image search). Contains `claude mcp add` and `npx skills add` instructions and telemetry code. |
| `skills/threejs-game/reference/llms-full.txt` (127 KB), `llms.txt` | Large text blob | Hard to review by hand; prompt-injection surface. **Opinion:** fetch from Three.js upstream instead. |
| `scripts/iterate-client.js`, `verify-runtime.mjs`, `validate-architecture*.mjs`, `example-actions.json`; `examples/*/scripts/*` (copies) | Executable code | The files we would most likely adapt. They launch a browser and write files. |
| `scripts/{meshy,worldlabs,retrodiffusion}-generate.mjs`, `find-3d-asset.mjs`, `optimize-glb.mjs` (`execSync`), `build-character.mjs`, `crop-head.mjs`, `process-head.mjs`, `build-spritesheet.mjs`; `skills/promo-video/scripts/convert-highfps.sh` | Executable code, network | External APIs, keys, shell execution, native ML dependencies. Not intended for reuse. |
| `site/build.js`, `site/capture-screenshots.js`, `site/telemetry/*` | Executable code | Fetches telemetry at build time; Express + Postgres server. |
| `submodules/playdotfun` (includes `playfun-auth.js` credential store, localhost:9876 callback), `submodules/unity-mcp` (beta branch), `skills/sub-games` (SSH URL) | Third-party submodules | Unpinned, unreviewed, not in this clone. Must be fetched and scanned separately. |
| `skills-lock.json` | Provenance | Hashes point at `M4cs/game-creator`, which returns 404. Cannot verify where the skills came from. |
| `package.json` dependencies (`@tensorflow/tfjs-node`, `@vladmandic/face-api`, `@imgly/background-removal-node`, `canvas`, `sharp`), `templates/*/package*.json` | Supply chain | Native binaries with install scripts. |

---

## 8. Open questions for the owner

1. **Test protocol in the player spec.** Should a generic "state-as-text / step / seed / action-script" debug protocol become part of the player contract now, so the future Godot player must implement it too?
2. **Palette policy.** One project-wide master palette (for example 32 colours) with per-game subsets, or a palette per game? Should we adopt the "index 0 = transparent, index 1 = outline" convention?
3. **Studio review form.** Approve, reject and comment only, or also a 1–5 rubric per criterion (silhouette, palette, readability at game scale, animation smoothness) with an auto-reject threshold?
4. **Audio approach.** Is a procedural chiptune synth (music and SFX as note and parameter data) acceptable as the default? If so, how exact must sound parity be between the web and Godot players?
5. **Headless rendering for goldens.** Is SwiftShader software rendering acceptable as the reference renderer for pixel-exact goldens, given the known Chromium crash in the macOS sandbox (issue #30), or should golden renders run outside the sandbox or in CI?
6. **AI image or model tools.** Are they excluded entirely, or allowed for moodboards and reference only, never as shipped assets?
7. **Real-world likeness and brands.** Confirm a hard ban in the generator guidelines (no real people, logos or trademarks).
8. **3D renderer.** For the voxel planet, Three.js (as the coordinator suggests) or our own WebGL runtime extended to 3D? This decides whether Three.js-specific lessons (`renderer.info`, InstancedMesh) carry over directly.
9. **Code reuse policy.** Given the ambiguous licence, may we copy anything at all (for example ~50 lines of the screenshot-fallback logic) after a skillspector scan, or is it ideas only (clean room)?

---

## 9. Sources

**Repository and metadata**
- https://github.com/PlayableIntelligence/game-creator (cloned at commit `4e64b83b5fe400b34ad3a484d9b4a6090b26d512`, 2026-05-25)
- https://github.com/opusgamelabs/game-creator (resolves to the repo above through the GitHub API)
- https://api.github.com/repos/PlayableIntelligence/game-creator (stars, forks, dates, licence = null)
- https://api.github.com/repos/PlayableIntelligence/game-creator/contributors
- https://api.github.com/repos/PlayableIntelligence/game-creator/commits (189 commits)
- https://api.github.com/orgs/PlayableIntelligence
- https://github.com/M4cs/game-creator (referenced in `skills-lock.json`; returns 404)

**Issues and PRs**
- https://github.com/PlayableIntelligence/game-creator/issues/14
- https://github.com/PlayableIntelligence/game-creator/issues/29
- https://github.com/PlayableIntelligence/game-creator/issues/30
- https://github.com/PlayableIntelligence/game-creator/issues/32
- https://github.com/PlayableIntelligence/game-creator/pull/10
- https://github.com/PlayableIntelligence/game-creator/pull/17
- https://github.com/PlayableIntelligence/game-creator/pull/21
- https://github.com/PlayableIntelligence/game-creator/pull/22
- https://github.com/PlayableIntelligence/game-creator/pull/26
- https://github.com/PlayableIntelligence/game-creator/pull/27
- https://github.com/PlayableIntelligence/game-creator/pull/28
- https://github.com/PlayableIntelligence/game-creator/pull/34
- https://github.com/PlayableIntelligence/game-creator/pull/35

**Files read in the clone** (local path `/private/tmp/claude-501/-Users-tomasgrasl-projects-game-engine-wallhammerzero/94411d00-4979-44f2-bb4e-7690895cabd1/scratchpad/repos/game-creator`)
- Top level: `README.md`, `CLAUDE.md`, `TROUBLESHOOTING.md`, `package.json`, `settings.json`, `.claude-plugin/*`, `.gitmodules`, `.gitattributes`, `skills-lock.json`
- `agents/*.md`
- `skills/game-assets/*`, `skills/game-audio/*`, `skills/game-qa/*`, `skills/game-designer/*`, `skills/game-architecture/*`
- `skills/make-game/**`, `skills/viral-game/{SKILL,verification-protocol,tweet-pipeline,step-details}.md`
- `skills/threejs-game/*`, `skills/threejs-perf/**`, `skills/game-3d-assets/SKILL.md`, `skills/meshyai/verification-patterns.md`, `skills/worldlabs/SKILL.md`, `skills/retrodiffusion/SKILL.md`, `skills/promo-video/*`, `skills/improve-game/SKILL.md`, `skills/add-assets/SKILL.md`, `skills/phaser/{SKILL,no-asset-design}.md`, the frontmatter of every skill
- `scripts/{iterate-client.js,verify-runtime.mjs,validate-architecture.mjs,validate-architecture-threejs.mjs,intercept-api-key.mjs,example-actions.json}`
- `templates/{phaser-2d,threejs-3d}/**`
- `examples/maze-tanks/src/sprites/*`, `examples/castle-siege/{progress.md,src/level/LevelBuilder.js}`, `examples/flight-simulator/{src/level/LevelBuilder.js,tests/**,playwright.config.js}`, `examples/barn-defense/src/core/Constants.js`, `examples/*/package.json`
- `assets/{characters,3d-characters}/manifest.json`, `site/{manifest.json,capture-screenshots.js}`, `tests/**`
