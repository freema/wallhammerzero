# PixelDen's game flow: how Claude Code builds ~55 Phaser games, and what Wallhammer should take

*Research date: 2026-10-14. Status: proposal only.*

Legend: **[S]** sourced (a file path in PixelDen or this repo, or a link), **[O]** my opinion,
**[U]** unverified. Local paths are relative to `~/projects/nodejs/pixelden/` unless they start with
`research/`, `packages/`, `docs/` or `tasks/` of this repo. URLs are listed in [Sources](#sources).

This report builds on [game-creator.md](game-creator.md) (its `/make-game`, test protocol and QA loop)
and [code-graphics.md](code-graphics.md). It does not repeat them. Desktop and mobile packaging is
in [multiplatform.md](multiplatform.md) and in a separate report; it is only touched here
(§7.4).

---

## 0. Summary

- **The flow:** PixelDen ships games through two slash commands. `/new-game` runs research, then a
  pitch of 3 concepts, a spec, a headless core, art, wiring, a browser proof and the ship step.
  `/game-upgrade` does a ranked audit of one existing game, then fixes, proves in a browser and
  ships. Both keep their state in a ledger file in the repo, not in the session [S
  `.claude/commands/*.md`, `tasks/*-ledger.md`].
- **The output:** 12 new games between 2026-09-21 and 2026-10-13, and 41 upgrade runs [S
  `tasks/new-game-ledger.md`, `tasks/game-upgrade-ledger.md`]. [refuted 2026-10-14: the new-game
  ledger holds 11 SHIPPED/BUILDING rows in that window; the 12th, Liftwell, is not in the ledger
  at all and comes only from `git log` (commit `74e9f0e`, v0.47.0). 41 run sheets confirmed.]
- **What makes it work:**
  - the ledger and spec files as state;
  - a headless, testable core built before any art;
  - score validators tested for every way a run can end;
  - bot balance studies with numbers;
  - a written browser-proof recipe;
  - an honest `NO-ACTION` result and a stop after two failures.
- **Where it fails:**
  - **Owner playtests:** about 10 shipped games are still waiting for one, and the newest one
    (Redline Pursuit) failed its first playtest on basics after every automatic check was green.
  - **Scope:** the command asks for 2.5–5k lines, and recent games are 9.5–14k lines landing as one
    commit. [refuted 2026-10-14: not uniformly; Tumblekin is 5,619 lines and Detention Deep 18,671.
    Six of the last eight are in 9.5–14.3k.]
  - **A copy-pasted art and audio kit:** `art/raster.ts` exists in 13 games and `audio/music.ts` in
    10. [refuted 2026-10-14: `art/raster.ts` is in 12 games (9 + 2 + 1 versions, which the report's
    own arithmetic gives); `audio/music.ts` in 10 confirmed.]
  - **Portal-wide traps fixed one game at a time:** 20 of 39 upgrade rows moved HUD elements from
    under the page's fullscreen button.
  - **Docs and memory drift:** the docs no longer match the code, and about 100 memory notes live
    outside the repo. [refuted 2026-10-14: 126 note files, 125 index lines in `MEMORY.md`.]
  - **CI that does not run the 153 test files.**
- **Graphics have already moved to code:** since 2026-10-02, PixelDen has switched by itself to
  graphics and music written in code. 9 of the last 10 new games say "all art and music in code"
  in the ledger, and three upgrade runs deleted PixelLab art (14, 33 and 3 PNGs). [refuted
  2026-10-14: the ledger says "all art and music in code" in 4 rows (Rooftop Rush, Scrapwing,
  Sandcrown, Redline Pursuit); Gloop says "no PixelLab"; Detention Deep is mixed ("monsters and
  story art from PixelLab", 76 PNGs under `public/assets/games/detention-deep/`); Tumblekin says
  "code art + PixelLab backdrops"; the Wobble Cup, Furrowfield and Cue Rush rows say nothing about
  art, and Liftwell has no row. What holds by the files: every game since Gloop (10 of 10,
  Liftwell included) has an `art/raster.ts`, and 8 of them ship 1–3 PNGs (thumbnail/backdrops).
  The three PNG deletions are confirmed.] So "a PixelDen
  game made through Wallhammer" is a short step: PixelDen's in-game kit is an earlier version of
  Wallhammer's `asset-kit` and `audio`.

---

## 1. The end-to-end flow as written

### 1.1 `/new-game` (`.claude/commands/new-game.md`) [S]

| Step | What happens | Output / gate |
|---|---|---|
| 0 | **Shape:** medium size (2.5k–5k lines), one technical "hook" the portal does not have yet, readable in about 10 s, desktop and mobile. Hard exclusions (no Mode 7 racer, no Alpha Frontier, no re-skins). | — |
| 1 | **Ledger and inventory:** read `tasks/new-game-ledger.md` (every concept ever pitched, with its verdict) and grep the registry for thin categories. | Avoids loops on the same ideas |
| 2 | **Research:** web charts (itch.io, Poki, r/WebGames), Google Trends and Search Console through Metrifyr, and whether the hook can run in Phaser. Then **3 concepts** with pitch, hook, loop, demand evidence, size and risk. | **Gate: `AskUserQuestion`**; all 3 go into the ledger |
| 3 | **Spec** `tasks/<NN>-<slug>.md`: the loop, scoring formula, difficulty at minutes 1/3/5, the hook's module and its unit test, scenes, controls (keyboard and touch), viewport, asset list, and **milestones each with a verification check**. | The spec is "the state file for the rest of the run" |
| 4 | **Build:** read-before-implement first. **Playable core first** as a headless `engine.ts`/`sim.ts` with Vitest ("if the hook isn't fun as grey boxes, redesign now — not after the art bill"). Then scenes, reuse of `shared/*`, the event contract (`game-start`, `game-over` with `{score, cause, wave, durationSec, metadata}`), the registry entry, EN copy and in-game strings, `task i18n:translate` plus FAQs translated by hand, art (PixelLab), `assets:optimize`, `db:seed`. | — |
| 5 | **Verify:** `typecheck && lint && test && format:check && build`, then a browser proof: no console errors, no 404s, a full run driven by synthetic input, state read from the scene, the score POST, one mobile emulation, screenshots, the pre-release audit. | **Two failures on the same defect → stop** and write the blocker into the spec |
| 6 | **Ship:** `feat/<slug>` branch, `--no-ff` merge, push; offer a blog post; a release only after CI is green. | — |
| 7 | **Report:** LOC, files, asset ids and cost, evidence, commits, what is open. | — |

### 1.2 `/game-upgrade` (`.claude/commands/game-upgrade.md`) [S]

One run covers one game and makes one commit.

1. **Pick the target** from the ledger: the first `TODO` row, or a slug the owner names. A closed
   ledger means stop ("Do not invent work").
2. **Read** the skill protocol, the whole game, its copy and `shared/*`.
3. **Play it in the browser before writing any code.** Judge it in four buckets (gameplay depth,
   balance, UI/feel, mobile) plus hard signals (console, 404s, `game-start`, the `game-over`
   payload). Write ranked findings into a run sheet at the bottom of the ledger.
4. **If nothing is worth doing**, mark the row `NO-ACTION`, commit only the ledger and stop.
5. **Plan and fix in order:** gameplay and balance first, then UI, then mobile, then art. Every
   changed line must trace back to a finding.
6. **Verify:** the static gate, then the browser recipe (§4). Two failures → `BLOCKED`.
7. **Commit** with `Verified:` and `Assets:` lines, merge, ask about the release.

### 1.3 Flow in practice (from the ledgers and git) [S]

- **Cadence:** Gloop (10-02), Rooftop Rush (10-02), Wobble Cup (10-05), Detention Deep (10-06),
  Scrapwing (10-08), Sandcrown (10-09), Furrowfield (10-10), Liftwell and Tumblekin (10-11),
  Redline Pursuit (10-12, uncommitted). That is about one game per working day [S `git log`].
- **The pitch gate is often skipped.** "owner left every call to me (no pitch round)" (Sandcrown),
  "user-requested (no concept gate)" (Gloop). Owner briefs replace research in most recent runs
  [S new-game ledger].
- **The "merge to main" step drifted** into "BUILT, not committed yet … waiting for the owner's
  go" (Sandcrown, Redline) [S `tasks/73-sandcrown.md`, `tasks/78-redline-pursuit.md`]. That matches
  the memory rule "No premature deploys" [S memory `feedback-no-premature-deploy`]. The command
  text was never updated.
- **One multi-agent run (task 65, 2026-08-17)** left a candid report: "Parallelism was theatre
  and should be recorded as such" (Wave 2 and the wave after it ran serially on one worker); 7 of 8
  "broken game" triage tasks were NO-REPRO, because the analytics signal was "one person bouncing
  once" [S `.agent/runs/2026-08-17-report.md`]. The best saving in that run was reframing "commission
  37 images" into composing 41 share cards with `sharp` for 0 credits. Since then the commands say
  "write the code yourself — subagents only for research/verification" [S `new-game.md` header].
  That follows the owner's anger at visible-progress-free QA loops [S memory
  `feedback-implement-directly`].

---

## 2. Structure of a recent game

### 2.1 Three generations [S, LOC from `find … | wc -l`]

| Game | LOC (tests) | Layout | Art |
|---|---|---|---|
| `shadow-heist` (07/2026) | 4,140 (6 test files) | `engine/{raycast,lights,guard,pathfind,levels,scoring}` + `scenes/{boot,menu,game,summary}` | PixelLab PNGs |
| `cardholm` (07/2026, rework 10-10) | 4,079 (2) | `sim/{engine,cards,island}` + `renderer.ts` + `iso.ts` + `scenes/` | PixelLab |
| `tumblekin` (10-11) | 5,619 (4) | `engine/` (20 Hz, no RNG, `replay(li, orders)`), `levels.ts`, `solutions.ts`, `run.ts`, `scoring.ts`, `art/{palette,raster,kin,props,ground,font,bake}`, `audio/{songs,music,sfx,audio}`, `scenes/{boot,menu,game,ui,results}` | **code** + 2 PixelLab backdrops |
| `redline-pursuit` (10-12) | 11,210 (4) | the same skeleton + `render/{world,raster,models,textures}` (a software 3D renderer at 384×216) | **code** |

Other recent games: `gloop` 14,309 lines, `sandcrown` 11,021, `furrowfield` 11,171, `scrapwing` 9,518.

### 2.2 The house skeleton that emerged (not documented anywhere) [S/O]

The skeleton is:
- a pure `engine/` (fixed step);
- `scoring.ts`, which exports `maxScore`, `validateMeta` and `recomputeScore`;
- `run.ts`, which folds level stats into run metadata;
- `art/` and `audio/` as pure data plus one Phaser adapter (`art/bake.ts`, "the only art module
  that touches Phaser");
- three test files: `validation.test.ts`, `strings.test.ts` and `levels.test.ts`.

The server imports each game's `scoring.ts` into `GAME_RULES` in `app/lib/score-validation.server.ts`
(1,480 lines, one entry per game) [S]. The same functions run on client and server, and the test
replays known solutions through them [S `tumblekin/validation.test.ts`]. **[O]** This is the
best design pattern in PixelDen and it maps directly onto our `@whz/sim` digests and replays.

### 2.3 Shared modules [S `app/games/shared/`, 1,950 lines]

| Module | What it does |
|---|---|
| `touch-controls.ts` | `createTouchControls(scene, cfg)`: a joystick (4dir, 8dir or horizontal), steer buttons, up to N action buttons and `lookDrag`. `cursors` has the keyboard shape and is OR-merged with the keys. Returns `null` on non-touch. |
| `viewport.ts`, `responsive-scale.ts` | `resolveViewport` picks desktop, mobile or fullscreen sizes from the registry fields. `VIEWPORT_CHANGED_EVENT` makes scenes restart. |
| Others | `hud`, `i18n` (`t()` over `locales/<lang>/game-strings/<slug>.json`), `rng` (mulberry32), `daily`, `stats` (localStorage plus `SAVE_EVENT`), `cloud-progress` (keys validated per game), `audio` (an older SFX helper) |

The registry (`app/games/registry.ts`, 55 `registerGame` calls) is server-safe metadata:
- `slug` and `thumbnailUrl`;
- `width`/`height`, `mobileWidth`/`mobileHeight`, `fullscreenWidth`/`fullscreenHeight`;
- `genre`, `layout`, `requiresLandscape`.

Copy lives in `locales/{en,es,de}/games/<slug>.json` [S `app/games/types.ts`].

**What is *not* shared:** the code-art kit and the chiptune sequencer [S, md5 over the files]:
- `art/raster.ts` exists in 13 games: 9 byte-identical, plus 2 and 1 other versions. [refuted
  2026-10-14: 12 games (crystal-td, detention-deep, furrowfield, gloop, liftwell, prismfall,
  redline-pursuit, rooftop-rush, sandcrown, scrapwing, tumblekin, wobble-cup); the 9/2/1 split is
  right.]
- `audio/music.ts` exists in 10 games: 8 identical.
- `art/font.ts` exists in 10 games in 8 versions.
- The tumblekin spec says "pixel font (from Liftwell)" and "Chiptune sequencer (from Liftwell)".

A fix to the kit now has to be applied up to 13 times [refuted 2026-10-14: 12]. **[O]** This is the single clearest piece
of technical debt the flow creates, and the strongest argument for Wallhammer's approach of
versioned packages with their own tests.

---

## 3. Skills and knowledge: what the sessions read

| Skill | Origin | Notes |
|---|---|---|
| `phaser/` (28 topic folders) | **Third-party:** the official `phaserjs/phaser` repo's `skills/` folder (the same 28 names) [S]. Gitignored in PixelDen (`.gitignore: .claude/skills/phaser/*`). Phaser is MIT. The skills folder shows no licence of its own [U] [verified 2026-10-14: the GitHub tree of `skills/` lists only the 28 folders, no LICENSE or README; the repo-level MIT licence covers it]. | v4 migration and new features. The repo is on `phaser ^4.0.0` [S `package.json`]. [verified 2026-10-14: `pnpm-lock.yaml` resolves `phaser@4.0.0` (released 2026-04-10); npm `latest` is 4.2.1 (4.1.0, 4.2.0, 4.2.1 since). The host `node_modules/phaser` is a stale 3.90.0 symlink, so local runs on the host do not use the locked version.] |
| `phaser-gamedev` | **Third-party base**, very likely chongdashu's `phaser-gamedev` (MIT, the same "Build 2D browser games with Phaser 3" description) [S/U]. [refuted 2026-10-14: the descriptions are not the same. chongdashu's reads "Build 2D games with Phaser 3 framework. Covers scene lifecycle, sprites, physics (Arcade/Matter), tilemaps, animations, input handling, and game architecture…"; PixelDen's reads "Build 2D browser games with Phaser 3 (JS/TS): scenes, sprites, physics (Arcade/Matter), tilemaps (Tiled), animations, input…". Same name and shape, different text: the attribution stays [unconfirmed].] Hardened locally with files "Adapted from OpenGame" (Apache-2.0, CUHK MMLab, a fork of qwen-code) [S]. [refuted 2026-10-14, minor: OpenGame's README says it "builds on" / "extends" qwen-code as its agent runtime, not that it is a fork; the repo is under the personal account `leigest519`, the paper authors are CUHK MMLab; Apache-2.0 confirmed.] | `read-before-implement.md` (a 3-layer read order and a pre-implementation list of files, asset keys and scene keys), `pre-release-audit.md` (R1–R7 runtime signatures, P1–P9 grep checks) |
| `grilling` / `grill-me` | **Third-party:** Matt Pocock's skills [U, mirrors only] | Pitch interviews; memory adds "pitch first, max 3 questions" |
| `pixellab`, `pixelart-cleanup`, `image-generation` (Gemini), `seo-blog`, `seo-optimization`, `lighthouse` | The owner's own, synced to `freema/ai-skills` by `.github/workflows/sync-skills.yml` [S] | `pixellab` is long and full of tool-name corrections ("There is NO `create_object`") |
| `~/.claude/skills/code-pixel-game` | The owner's own (built from Gloop and our research) | It still says "**Not** for ordinary PixelDen games", which is outdated (§5.5) |

**Memory:**
- PixelDen's auto-memory has about 100 notes; 25 of them are about PixelLab quirks [S
  `~/.claude/projects/-Users-tomasgrasl-projects-nodejs-pixelden/memory/MEMORY.md`]. [refuted
  2026-10-14: 126 note files (125 index lines); 25 index lines mention PixelLab, 18 files carry
  it in the name.]
- Many hard-won rules live only there: the browser recipe, the score validator rule, "fix, don't
  redesign", and viewport presets.
- **[O]** This memory is not versioned, not in the repo and not checked. It repeats the drift
  problem that [ref-sakura-crossing.md](ref-sakura-crossing.md) and
  [ref-threejs-punk.md](ref-threejs-punk.md) found, but with less visibility.

---

## 4. How games are verified

### 4.1 Static checks [S]

- **Local:** `task typecheck && task lint && task test && task format:check && task build`. Lint
  scans gitignored `ds-bundle/`, which needs manual filtering.
- **CI** (`.github/workflows/ci.yml`) runs only install, lint, typecheck and format:check. **It
  does not run Vitest**, although the repo has 153 `*.test.ts` files [S]. Whether tests ran depends
  on the session.

### 4.2 The browser proof (a recipe, not a tool) [S commands, memory `feedback-phaser-browser-testing`, `reference-headless-chrome-harness`]

1. **Load the tools:** chrome-devtools MCP, all 9 tools in one ToolSearch call.
2. **Input:**
   - `MouseEvent` with `view: window` after `game.scale.updateBounds()`.
   - `PointerEvent` alone is a no-op.
   - Without `view`, hits drift by `scrollY`.
   - Keys go through `window.dispatchEvent(new KeyboardEvent(…))`.
3. **Game instance:**
   - Walk the React fiber on the canvas's *parent* until you find an object with
     `.scene && .events && .loop`.
   - Then read `game.scene.getScene('Game')` directly.
4. **Assertions:** on scene state, `localStorage` keys, and
   `performance.getEntriesByType('resource')` for asset loads.
5. **Screenshots:** `game.renderer.snapshot()`, because the page's cookie banner, fullscreen
   tutorial and save-score modal cover the canvas.
6. **Cheat hooks:** temporary `?cheat` hooks (`window.__ff = this`), removed before the commit, with
   a grep to prove it.
7. **Fallbacks when the MCP is locked by another session:**
   - a raw CDP client on `--remote-debugging-port`;
   - or puppeteer-core taken from the npx cache, driven by one long-lived process, because
     emulation is scoped to a CDP session;
   - with `--enable-unsafe-swiftshader`, or WebGL renders black.

**[O]** The recipe works, but every run partly re-invents it: the harnesses sat in `/tmp` and the
scratchpad, and the cheat hooks are added and deleted each time. Nothing like our planned test
protocol (`window.__nh`-style `advance`, state as text, seeded scripts;
[game-creator.md §7.1](game-creator.md)) is committed in any game.

### 4.3 Checks that encode lessons [S]

| Check | Where | Caught |
|---|---|---|
| Score validators tested for **every end path**, plus progressive `score-update` | `<game>/validation.test.ts`, memory `feedback-score-validator-human-paths` | Gloop, Rooftop Rush and Wobble Cup silently lost scores (v0.42.1). Rejections now go to GA4 `score_reject`. |
| Level solvable by replaying a stored solution, and not solving itself | `tumblekin/levels.test.ts` + `solutions.ts` | Unwinnable layouts |
| Every locale string renders in the pixel font and fits its slot (px widths per key regex) | `tumblekin/strings.test.ts` | Clipped es/de labels (the cardholm U2 finding) |
| Bot balance study, N seeds, a table of variants | cardholm (200 seeds: 0/200 → 87/200 wins), crystal-td (strong vs weak bot across 6 HP curves) | Unwinnable or trivial economies |
| Art tests: grid widths, no orphan pixels, 9-slice invariants | `prismfall/art/art.test.ts`, `harvest-hollow/art/ui.test.ts` | Stretch artefacts |
| Pre-release greps P1–P9 | the `phaser-gamedev` reference | Missing asset or scene keys, missing `reloadDocument`, touch cleanup, viewport restart loops |

---

## 5. Where it fails or wastes effort

### 5.1 Agent-verified ≠ good, and the owner playtest is the bottleneck [S]

The ledgers and memory show these games shipped but "waiting for a playtest":
Spire Tycoon, Crystal TD, Scrapwing, Detention Deep, Wobble Cup, Rooftop Rush, Sandcrown,
Furrowfield, Liftwell and Tumblekin.

Redline Pursuit passed typecheck, lint, tests, build, bot runs and a browser run of all four roads.
The owner's first playtest then found:
- "handling too hard (even AI slides)";
- "square wheels";
- "holes in track and objects".

Four fix rounds (1, 1b, 1c, 1d) followed [S `tasks/78-redline-pursuit.md`]. **[O]** The flow has no
step where feel is measured or where the owner's time is planned. It optimises throughput of
"verified" games, not of games the owner has accepted. Our memory note "agent-verified is not
quality" is the same lesson.

### 5.2 Scope creep against the command's own budget [S]

- **Size:** the command says 2.5k–5k lines. The last 8 games are 9.5k–14k. [refuted 2026-10-14:
  measured (`*.ts`/`*.tsx` per game folder): gloop 14,309, detention-deep 18,671, scrapwing
  9,518, sandcrown 11,021, furrowfield 11,171, liftwell 11,289, tumblekin 5,619, redline-pursuit
  11,210. Range 5.6k–18.7k; six of eight are in 9.5–14.3k.]
- **Commits:**
  - Tumblekin: one commit, 6,160 insertions.
  - Furrowfield: 13,744.
  - Detention Deep: 21,117 (153 files).
  - v0.47.0: 23,835 insertions in 154 files, which mixes a new game, cloud progress, achievements
    for every game and a score overhaul.
- **[O]** Commits that size cannot be reviewed, and a bisect cannot find anything in them.

### 5.3 Portal traps fixed one game at a time [S, counted over the 39 closed ledger rows] [unconfirmed 2026-10-14: the counts below depend on how a row was classified and could not be reproduced exactly; keyword counts over the 42 table rows give fullscreen 22, resize/rotation 12, `game-start` 11, copy/FAQ 28, pause 17, "best" 21. Same order of magnitude, treat the figures as ±3.]

| Trap | Rows that fixed it |
|---|---|
| HUD or buttons under the page's fullscreen button | 20 |
| A resize, rotation or fullscreen toggle wiped the run | 13 |
| Retries or new runs did not emit `game-start`, so plays were not counted | 13 |
| Copy or FAQ fixes, often "copy documented things that do not exist" | 28 |
| Pause added | 17 |
| Personal best added | 15 |

**[O]** Each of these is a host-contract problem: a reserved safe area, "a resize must keep the
run", "every run start emits `game-start`". The right fix is once in the wrapper plus one
contract test that every game must pass. Instead, prose in a skill was read 39 times. This is
exactly our implement-tasks principle 5 ("every failure that reached verification is a missing
check").

### 5.4 Docs that no longer describe the system [S]

- **`docs/GAME-DEVELOPMENT.md`** (last real edit 2026-03-06) still describes:
  - Gemini sprite generation;
  - one PNG per frame swapped on a timer ("We use individual PNG files per frame, not sprite
    atlases");
  - a mandatory neon starfield background;
  - a table of 5 games.
- **`docs/adding-games.md`** says the process takes "cca 30 minut".
- **`CLAUDE.md`'s touch table** lists 11 of 55 games.
- **`new-game.md` step 6** says PixelLab is the art path, while 9 of the last 10 games drew in code.
  [refuted 2026-10-14, see §0: by the files all 10 games since Gloop have a code-art kit, but
  Detention Deep still ships 76 PixelLab PNGs and Tumblekin 2 PixelLab backdrops; the ledger
  text itself says "all art and music in code" for 4 of them.]

**[O]** The commands and memory carry the real process. The docs are dead weight that a fresh
session will read and believe.

### 5.5 PixelLab cost and friction, then abandonment [S]

- **Friction:** 25 memory notes on PixelLab: tool names that never existed, review-grid gates,
  `Read` on a generated PNG crashing the API, the nginx immutable cache forcing a filename bump,
  and mixed animation canvases changing sprite size.
- **The switch:** then Gloop (10-02) tested art in code. From then on, owner briefs say "all art
  and music in code". The upgrade runs replaced PixelLab art with code in prismfall (14 PNGs
  removed), harvest-hollow (3) and crystal-td (33), for reasons such as "the PixelLab 9-slice panel
  smears" and "stills that do not match each other in scale or outline".
- **[O]** The owner has voted with practice: code art won on consistency and on cost (no
  credits, no 404s, no `assets:optimize`, palette swaps for free) [S `code-pixel-game` SKILL.md
  "Runtime bake"].

### 5.6 Smaller wastes [S]

- `task assets:optimize` rewrites the assets of every game, so each run must `git checkout`
  everything else.
- `i18n:translate` silently skips arrays, so the FAQs are hand-translated each time.
- Post-ship crash fixes in git: a Scrapwing turret `startFrame` threw in the loop (`80ed639`), a
  Columns hard drop crashed (`b62ac31`), and Cue Rush resumed a finished run after rotation
  (`f012d3d`). **[O]** A 60-second seeded soak per level in a headless browser would have caught
  the first and the third.

---

## 6. What makes it work (the transferable core) [O, grounded in §1–4]

1. **State in the repo, one unit per run.** A ledger row has a status set
   (`TODO`/`DONE`/`NO-ACTION`/`BLOCKED`), and each run appends a run sheet with findings, plan and
   evidence. A new session needs nothing from the last one.
2. **The core comes before art, and it is headless.** Pure engine modules with replay and bots
   make balance a measurable question (tables of bot win rates) and not a matter of opinion.
3. **Findings before code, ranked by what players feel.** The order is gameplay, balance, UI,
   mobile, art. "An honest NO-ACTION beats a cosmetic diff."
4. **Hard stop rules.** Two failures on the same item mean `BLOCKED` and a report, never a third
   attempt.
5. **Evidence lines in the commit** (`Verified:`, `Assets:`). The report names exact numbers.
6. **The same scoring module runs on client, server and in tests.**
7. **Strings are tested against the real pixel font in all locales.**

---

## 7. What this means for us

### 7.1 Proposed `make-game` for Wallhammer [O]

A slash command (or skill) whose phases map onto what already exists here.

| Phase | Wallhammer piece | Gate |
|---|---|---|
| 0. Brief or pitch | 3 concepts, recorded in `games/LEDGER.md` (all pitches with verdicts, PixelDen's best anti-loop device) | **The owner picks** (our rule: discuss before writing). Skip only when the owner gives a full brief. |
| 1. Concept page | `games/<id>/concept.md` = the PixelDen spec (loop, scoring, difficulty at minutes 1/3/5, hook, asset list, **milestones each with a check**). It becomes the studio concept page (queue #26). | The owner says yes in chat |
| 2. Core | `@whz/sim` module with digests, replay, a bot, invariants ("idle loses", "competent bot wins"; [game-creator.md §7.1](game-creator.md)) | `./dev npm run check` green; bot table in the run sheet |
| 3. Assets | `assets/<id>/…` with `asset-kit`; lint → review sheets → studio gallery | Owner verdicts (`review.json`), not chat |
| 4. Audio | `audio/<id>/…` with `@whz/audio` | `audio check`; the owner listens in the studio (queue #29) |
| 5. Integration | the player with the **test protocol** (state text, `advance`, seed, action scripts) | Smoke soak per level; one blind browser pass (implement-tasks principle 4) |
| 6. BUILT | a run report, one commit **per milestone** (not one 14k-line commit) | — |
| 7. PLAYTESTED | the owner plays; findings → `continue-game` | **WIP limit [O]:** do not start game N+1 while 2 games wait for a playtest |

### 7.2 Proposed `continue-game` [O]

This is `/game-upgrade` with our rules:

1. **Read first:** `docs/progress.md`, `reviews/INBOX.md`, the game's run sheets and the owner's
   playtest notes.
2. **Play through the test protocol.**
3. **Rank findings** in the four buckets (plus "owner said").
4. **Choose one of:** fix, `NO-ACTION`, or `BLOCKED` after 2 failures.
5. **Commit** with `Verified:` and the evidence.

Two rules come from PixelDen's mistakes:
- **Every finding of a host-wide class becomes a check in the shared player or gate**, not a
  per-game patch (§5.3).
- **Vague owner feedback goes through playtest-repro** ("handling too hard" → yaw rate, slide
  decay and test numbers, as Redline round 1c did by hand) ([game-creator.md §5.2](game-creator.md)).

### 7.3 The studio showing build progress [O]

PixelDen's run sheets are prose. For a studio, make the run machine-readable as well:
- **Run files:** `games/<id>/runs/<date>-<n>.json` with `{phase, milestone, checks: [{name,
  status, evidence}], assets: [ids], commit}`, written by the command at each phase change.
- **The studio service** reads those files the same way it reads `assets/` (watch + SSE, as in
  [docs/studio.md](../docs/studio.md#live-reload)).
- **A `/games/<id>` page:** the concept, the game's asset pack (gallery filtered by pack), audio,
  the run timeline, the latest checks, and the playtest checklist. It fits naturally next to
  queue #26 (concept pages) and #30 (play and builds).
- **Open conflict:** CLAUDE.md says `tasks/` is the only work queue, and the New Hope practice is
  "no queue notes". The game's own run files must be *state*, not a second queue. That is an owner
  call (Open questions).

### 7.4 Packaging and the portal coupling [O]

PixelDen games are bound to the portal by:
- the `game-canvas.tsx` wrapper;
- the `/api/scores` and `/api/plays` run tokens;
- cloud progress;
- i18n loaded per route.

A standalone desktop or mobile build of a PixelDen game needs a host shim with local scores,
bundled locales and no `reloadDocument` concern. Details belong to the packaging report and
[multiplatform.md](multiplatform.md).

### 7.5 Producing a PixelDen game through Wallhammer [S/O]

**Why it is a short step.**
- **The code art is the same.** PixelDen's art is RGBA string grids + legends (`tumblekin/art/raster.ts`),
  parts and a bake into Phaser canvas textures at boot. Wallhammer's `asset-kit` is the hardened
  successor: palette-indexed, integer-only, under the determinism lint, with lint, review sheets
  and an output hash [S `packages/asset-kit/README.md`; `code-pixel-game` says the asset-kit
  "overrides it once it exists"].
- **The music is the same.** PixelDen's music is NES-style step strings
  (`tumblekin/audio/songs.ts`) played by `OscillatorNode`s. `@whz/audio` is the same idea with
  validators and golden hashes.
- **The audio core is small.** It depends only on `@whz/det` and is about 3k lines of TS plus 48 KB
  of tables [S `packages/audio/src`, `data/`]. [refuted 2026-10-14: `packages/audio/package.json`
  depends on `@whz/det` **and** `@whz/asset-kit`; a worklet bundle for PixelDen must tree-shake or
  cut that second dependency. 3,017 lines outside `analysis/` and `node/` (4,667 with them) and
  48 KB in `data/` confirmed.]

**What it needs:**

1. **Asset packs per PixelDen game:** `assets/pixelden-<slug>/…` and
   `palettes/pixelden-<slug>.json`. The studio reviews them, with verdicts as for any asset. No
   code change in the studio [O].
2. **A Phaser adapter, about 60 lines,** in PixelDen `app/games/shared/wz-atlas.ts`:
   - `asset bake` already writes a sheet PNG and `wz.atlas/1` JSON (frames with `x,y,w,h`, a
     per-frame `duration`, clips with `loop` and `start` per facing, `pivot`, palette colours) [S
     `packages/asset-kit/src/bake.ts`].
   - Map it with `texture.add(name, 0, x, y, w, h)`, `anims.create` and `setOrigin(pivot/size)`.
   - **Trap:** in Phaser, a frame's `duration` is *added* to the base `msPerFrame` [S
     `.claude/skills/phaser/animations/SKILL.md`]. Set a 1000 fps base and subtract 1 ms from each
     frame, or drive frames with a small timer. Test this against a clip with unequal durations [U].
     [refuted 2026-10-14: the skill text is outdated. In Phaser v4.0.0 (PixelDen's locked version)
     and in 3.90.0, `Animation.getFirstTick`/`getNextTick` set
     `state.nextTick = state.frameRate === state.currentAnim.frameRate ? state.currentFrame.duration || state.msPerFrame : state.msPerFrame`,
     i.e. a non-zero frame `duration` **replaces** `msPerFrame` (as long as the play call does not
     override `frameRate`), and `AnimationFrame.duration` is documented as "The duration, in ms, of
     this frame". So the atlas's per-frame `durations` map straight onto `frames[i].duration`; no
     1000 fps base, no subtraction. Keep the test against a clip with unequal durations.]
3. **Delivery: two options.**
   - **(a) Build outputs (recommended [O]).** Copy the sheets and atlases into
     `public/assets/games/<slug>/`, named with the output hash (which fixes the nginx 1-year
     immutable cache for free, memory `feedback-nginx-static-cache`).
   - **(b) Bake at boot as Gloop does.** Bundle `asset-kit` and the asset programs into the game
     chunk: no binaries, but `asset-kit` (with its lint and review code) enters a client bundle,
     and PixelDen would need a tree-shaken entry.
   - Either way, **cross-repo writing is new:** the `./dev` container mounts only this repo. Option
     (a) needs either an export command that writes to a mounted PixelDen path, or a PixelDen-side
     `task wz:import` that reads Wallhammer's `build/`. That is an owner call, because it touches
     the "Docker only" and repo-boundary rules.
4. **Music at runtime.** `SongPlayer.process(left, right)` renders blocks, and an `AudioWorklet`
   asks for 128-frame blocks per `process()` call (MDN, 2025-10-30). So a ~40-line worklet wrapper
   can play song JSON directly [S API; fit is O]. [verified 2026-10-14; MDN adds that the block
   size may change in a future spec revision and that code must read the array length rather than
   assume 128, which `process(left, right, frames)` already allows.]
   - Pre-rendered WAV is the wrong default: at 48 kHz, 16-bit stereo it is 192 KB/s, about 11.5 MB
     per minute of loop [O, arithmetic].
   - This overlaps queue #25 (runtime audio). Doing that note first and reusing it in PixelDen
     avoids a third sequencer copy.
   - The usual iOS unlock-on-gesture rules apply ([audio-from-code.md](audio-from-code.md)).
5. **Fonts.** PixelDen's in-game strings tests need glyph coverage and pixel widths per string.
   An asset-kit font export plus a metrics JSON lets `strings.test.ts` stay as it is [O;
   `packages/asset-kit/src/font.ts` exists, and its export shape for BitmapText is U].
6. **What stays in PixelDen:**
   - the registry, scoring and `GAME_RULES`;
   - i18n and FAQ, achievements and cloud keys;
   - the blog, share cards (`scripts/og-cards.mjs`) and thumbnails;
   - the browser proof.

   `/new-game` step 6 ("Art (PixelLab)") becomes "Art and audio: Wallhammer pack `pixelden-<slug>`,
   approved in the studio".
7. **Licences.** Both repos are the owner's (PixelDen is MIT, © Tomáš Grasl) [S `LICENSE`], so
   PixelDen's kit and tests may be copied. The `phaser-gamedev` base (chongdashu, MIT)
   [unconfirmed: attribution not established, see §3] and the
   OpenGame-derived files (Apache-2.0) are fine to read. Copying them needs attribution, and the
   skill intake applies if they would come in as skills [S licences; O on the procedure].

**Order of work [O]:**
1. Runtime audio (#25), designed to run in a plain `AudioWorklet` outside our player.
2. The Phaser atlas adapter plus one pilot asset (e.g. a Tumblekin kin redone in `asset-kit`).
3. The export/import step.
4. A first PixelDen game end to end.

**Effort [O]:** S for steps 1–2 on top of #25, M for the delivery step and the docs on both sides.

---

## 8. Takeaways for Wallhammer, ranked [O]

1. Keep **ledger + run sheet + one unit per run + `NO-ACTION` + `BLOCKED` after 2** as is. They
   are proven over 41 upgrade runs.
2. Build the **test protocol into the player once.** PixelDen's fiber walk and per-run cheat hooks
   are the cost of not doing that.
3. **Turn every host-wide finding into a check.** 20 fullscreen-button fixes is the anti-example.
4. **Plan the owner playtest as a phase with a WIP limit.** Throughput without acceptance piled
   up 10 unplaytested games.
5. **Milestone commits and a size budget per game.**
6. **The kit lives in packages, never copied into games.** We already do this. PixelDen shows the
   alternative.
7. **Docs, skills and memory must be checked against the code** (our `docs-check`), or they rot
   as PixelDen's did within months.

---

## Open questions (owner only)

1. Should Wallhammer produce PixelDen asset and audio packs at all, or should PixelDen keep its own
   in-game kit?
2. If yes, may the Wallhammer container write into the PixelDen checkout (an export), or does
   PixelDen import from Wallhammer's `build/`?
3. Should the `make-game` / `continue-game` state for a game (`games/<id>/runs/*.json`, a ledger)
   live beside `tasks/`, given the rule that `tasks/` is the only work queue?
4. A WIP limit on unplaytested games: what number, and does it apply to PixelDen too?
5. Should the pitch gate (3 concepts) be mandatory in `make-game`, or skippable by a full brief as
   PixelDen does in practice?

---

## Sources

Local (read 2026-10-14):

**PixelDen:**
- `CLAUDE.md`
- `.claude/commands/{new-game,game-upgrade}.md`
- `tasks/{new-game-ledger,game-upgrade-ledger,72..78-*}.md`
- `docs/{GAME-DEVELOPMENT,adding-games,README,dev-tools}.md`
- `.claude/skills/*` and `.claude/skills/phaser-gamedev/references/{read-before-implement,pre-release-audit}.md`
- `.agent/runs/2026-08-17-report.md`, `.agent/pathmap.json`
- `app/games/{shadow-heist,cardholm,tumblekin,redline-pursuit}/**`, `app/games/shared/*`,
  `app/games/types.ts`, `app/games/registry.ts`
- `app/lib/score-validation.server.ts`
- `.github/workflows/*.yml`, `package.json`, `LICENSE`
- `git log` (358 commits)
- The auto-memory under `~/.claude/projects/-Users-tomasgrasl-projects-nodejs-pixelden/memory/`

**Elsewhere:**
- `~/.claude/skills/code-pixel-game/SKILL.md`

**This repo:**
- `packages/asset-kit/{README.md,src/bake.ts}`
- `packages/audio/README.md`
- `docs/{studio,audio}.md`
- `tasks/2026-10-02-studio-play-and-builds.md`
- `.claude/skills/implement-tasks/SKILL.md`
- `research/game-creator.md`

Web:
- OpenGame (CUHK MMLab; Apache-2.0; fork of qwen-code [refuted 2026-10-14: "builds on"/"extends" qwen-code per its README]; release news dated 2026-04-21): https://github.com/leigest519/OpenGame (accessed 2026-10-14)
- Official Phaser skills folder (28 skills, matches PixelDen's `phaser/`): https://github.com/phaserjs/phaser/tree/master/skills (accessed 2026-10-14; no date shown)
- Directory listing of `phaserjs/phaser` skills: https://claudemarketplaces.com/skills/phaserjs/phaser (accessed 2026-10-14)
- chongdashu `phaser-gamedev` skill (MIT): https://github.com/chongdashu/phaserjs-oakwoods (accessed 2026-10-14; no date shown; its SKILL.md: https://raw.githubusercontent.com/chongdashu/phaserjs-oakwoods/main/.claude/skills/phaser-gamedev/SKILL.md)
- Phaser `Animation.js` at the locked tag, per-frame `duration` handling (`getFirstTick`/`getNextTick`): https://raw.githubusercontent.com/phaserjs/phaser/v4.0.0/src/animations/Animation.js (accessed 2026-10-14)
- npm registry, `phaser` dist-tags (latest 4.2.1; 4.0.0 published 2026-04-10): https://registry.npmjs.org/phaser (accessed 2026-10-14)
- Matt Pocock "grilling" skill mirror: https://skills.sh/mattpocock/skills/grilling (accessed 2026-10-14; the upstream repo was not checked)
- MDN, `AudioWorkletProcessor.process()` (128-frame blocks; page modified 2025-10-30): https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process
- PixelLab MCP docs (as cited in PixelDen's `pixellab` skill; not fetched): https://api.pixellab.ai/mcp/docs

---

## Verification (2026-10-14)

Adversarial fact-check of the report above. Local claims were checked against the files in
`~/projects/nodejs/pixelden` (working tree at `cd3edde`-era state, 358 commits) and this repo;
web claims were fetched on 2026-10-14. Corrections are inline, marked `[refuted 2026-10-14: …]`
or `[unconfirmed]`.

**Confirmed (unchanged):**

| Claim | Evidence |
|---|---|
| `phaser ^4.0.0` in `package.json`; CI runs install, lint, typecheck, format:check and no Vitest | `package.json:41`, `.github/workflows/ci.yml` |
| 55 `registerGame` calls; 153 `*.test.ts` files; `score-validation.server.ts` 1,480 lines; `shared/` 1,950 lines | counted |
| `.gitignore: .claude/skills/phaser/*`; 28 skill folders with the same names as `phaserjs/phaser/skills` | local `ls`, GitHub tree |
| LOC and test-file counts of the four games in §2.1; gloop 14,309, sandcrown 11,021, furrowfield 11,171, scrapwing 9,518 | counted (`*.ts`/`*.tsx`) |
| `audio/music.ts` in 10 games, 8 identical; `art/font.ts` in 10 games, 8 versions | `md5` |
| Commit sizes: Tumblekin `9fbc9de` 6,160 insertions; Furrowfield `a8c7a9e` 13,744; Detention Deep `b74ec6a` 21,117 in 153 files; v0.47.0 `74e9f0e` 23,835 in 154 | `git show --shortstat` |
| `80ed639`, `b62ac31`, `f012d3d` exist with the described fixes | `git log` |
| Cadence dates in §1.3; Redline Pursuit uncommitted (`?? app/games/redline-pursuit/`); Sandcrown/Redline "BUILT, not committed" | `git log`, `git status`, `tasks/73-*.md:3`, `tasks/78-*.md:3` |
| Owner playtest findings on Redline ("handling too hard (even AI slides), square wheels, holes in track and objects") | `tasks/78-redline-pursuit.md:86` |
| 41 run sheets in the upgrade ledger; 42 rows, 39 DONE + 3 TODO; PNG removals 14 (prismfall), 3 (harvest-hollow), 33 (crystal-td) | ledger lines 46, 1689, 1719, 1762 |
| 2026-08-17 report: "Parallelism was theatre…", 7 of 8 T2 tasks NO-REPRO, "one person bouncing once", 41 share cards | `.agent/runs/2026-08-17-report.md:7,85,120` |
| `new-game.md`: "Write the code yourself — subagents only for research/verification", target 2.5k–5k LOC, step 6 "Art (PixelLab)" | lines 8, 16, 68 |
| `docs/GAME-DEVELOPMENT.md` last content edit 2026-03-06 (Prettier-only on 04-06), Gemini sprites, "individual PNG files per frame", starfield; `adding-games.md` "cca 30 minut"; CLAUDE.md touch table has 11 games | `git log`, grep |
| `pixellab` SKILL.md: "There is **NO** `create_object`" (line 34) | grep |
| `read-before-implement.md` and `pre-release-audit.md` say "Adapted from OpenGame" | lines 5 |
| `sync-skills.yml` syncs from `freema/ai-skills` | line 23 |
| `code-pixel-game` SKILL.md: "**Not** for ordinary PixelDen games"; "Runtime bake: no PNGs, no 404s, no `assets:optimize`, and palette swaps for free"; "its `asset-kit` package overrides it once it exists" | lines 14, 20, 61 |
| LICENSE: MIT, © 2026 Tomáš Grasl | `LICENSE` |
| `packages/asset-kit/src/bake.ts` exports `ATLAS_FORMAT = "wz.atlas/1"` with per-clip `durations`, `loop`, `start`, `pivot`; `font.ts` exists | source |
| `SongPlayer.process(left, right, frames, offset, stems)`; MDN: 128-frame blocks, page modified 2025-10-30 | `packages/audio/src/player.ts:396`, MDN |
| Queue numbers #25, #26, #29, #30 and implement-tasks principles 4 and 5 | `tasks/README.md:88-93`, `.claude/skills/implement-tasks/SKILL.md:27-29` |
| OpenGame: Apache-2.0, CUHK MMLab authors, release news 2026-04-21; chongdashu repo MIT; grilling is from `mattpocock/skills` | GitHub, skills.sh |

**Refuted or corrected (inline):**

1. "12 new games … [S ledger]": the ledger has 11; Liftwell is only in git.
2. `art/raster.ts` in 13 games → 12.
3. "Recent / last 8 games are 9.5–14k lines" → 5.6k (Tumblekin) to 18.7k (Detention Deep).
4. "About 100 memory notes" → 126.
5. "9 of the last 10 new games say 'all art and music in code' in the ledger" → 4 rows say it;
   Detention Deep (76 PNGs) and Tumblekin (PixelLab backdrops) are mixed; three rows say nothing.
6. `phaser-gamedev` has "the same description" as chongdashu's → different wording; attribution
   stays unconfirmed.
7. OpenGame "a fork of qwen-code" → "builds on / extends" qwen-code (README wording).
8. `@whz/audio` "depends only on `@whz/det`" → also on `@whz/asset-kit`.
9. **Phaser per-frame `duration` is "added to msPerFrame"** → in Phaser 4.0.0 and 3.90.0 the
   duration *replaces* `msPerFrame` (`state.currentFrame.duration || state.msPerFrame`). The
   proposed 1000 fps workaround in §7.5.2 is unnecessary; the PixelDen `phaser/animations` skill
   is wrong on this point.

**Unconfirmed:**

- The §5.3 trap counts (20/13/13/28/17/15): classification-dependent; keyword counts land within
  ±3 of each.
- `phaser-gamedev` origin (chongdashu) and the grilling skill's licence.
- The official `phaserjs/phaser` `skills/` folder has no licence file of its own (the GitHub tree
  shows none; the repo-level MIT applies).

**Gaps worth knowing:**

- PixelDen's lock file pins `phaser@4.0.0` (2026-04-10) while npm `latest` is 4.2.1; the host
  `node_modules/phaser` is a stale 3.90.0 install, so anything run on the host without a fresh
  `pnpm install` tests against Phaser 3. The report does not mention either.
- The upgrade ledger never used `NO-ACTION` or `BLOCKED` in a row (only DONE/TODO); the "status
  set" in §6 is the command's, not yet exercised in practice.
- Trap counts and the Liftwell gap mean the ledger is not a complete record of shipped games;
  §6.1 ("a new session needs nothing from the last one") is weaker than stated.
