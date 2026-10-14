# Building games here: the handbook

What a Claude Code session needs to know before it builds or continues a game in this repo, or a
PixelDen game with assets made here. Each page is short: rules, patterns, budgets and a
checklist. The depth is in the research reports (all dated 2026-10-14 unless noted, each with a
Verification section whose corrections win over the body text). The handbook says what we do;
the research says why and what else was considered.

Nothing on these pages changes a decision. Decisions are in [docs/DECISIONS.md](../DECISIONS.md)
and are made only by the owner in chat; a page marks what is decided and what is a **proposal**.

## Pages

| Page | What it covers |
|---|---|
| [procgen.md](procgen.md) | Content from a seed: the two tiers, the generator chain, validation, curation, budgets, the `@whz/procgen` proposal. |
| [performance.md](performance.md) | Measure first, budgets per device tier, the perf hooks, the CPU / GPU / loading checklists for Three.js and Phaser. |
| [threejs.md](threejs.md) | Real-time 3D games on Three.js (New Hope): architecture, budgets, the look, traps. |
| [phaser.md](phaser.md) | 2D games on Phaser 4 for PixelDen, and how Wallhammer supplies their art and audio. |
| [testing.md](testing.md) | How a game is verified: the test hook, scripts, tiers, screenshots, the QA sub-agent. |
| [shipping.md](shipping.md) | Desktop, Steam, mobile and the stores: what builds in Docker, what is an owner call. |

## Three kinds of game

| Kind | Where it lives | Engine | Decided by |
|---|---|---|---|
| **Data game** (Kairosoft-style 2D sim) | `games/<id>/` as pure data, played by `packages/runtime` and `packages/sim` ([docs/game-data.md](../game-data.md), [docs/sim.md](../sim.md)) | our own runtime on WebGL2, CPU backend as the reference | D10, D15, D18 |
| **Code game** (New Hope) | `packages/new-hope-play`, a Vite + TypeScript package; its concept and story in `games/new-hope/` | Three.js 0.180 (`WebGLRenderer`, bloom), graphics still code | D28, D30 |
| **PixelDen game** | `~/projects/nodejs/pixelden/app/games/<slug>/`, another repo of the owner | Phaser 4 (the lockfile pins 4.0.0; latest is 4.2.1) | the owner's PixelDen rules; Wallhammer supplies packs (proposal) |

## Which engine for which game

From [research/phaser-pixelden.md](../../research/phaser-pixelden.md) §4 and the Three.js
reports; the first column is what the game needs, not what we like.

| The game needs | Use | Why |
|---|---|---|
| Sprites, tilemaps, tweens, arcade physics, many small games fast, a portal | **Phaser 4** (PixelDen) | Scenes, input, tweens, cameras, audio unlock and touch come free; the cost per game is the game code. |
| Real 3D: depth, perspective, lights, a city | **Three.js** | Phaser 4 has no 3D at all (`Mesh`/`Plane` were removed; `Mesh2D` is 2D triangles). |
| Bit-exact determinism, replays, digests, a second player later (Godot) | **Our runtime + `@whz/sim`** | Designed for it (D10, the determinism lint). Phaser smooths and caps its delta, so only a separate sim can replay exactly. |
| Pixel-perfect review and hashing of every frame | **Our runtime** | The CPU backend is the reference; the studio shows every asset. |
| Retro pseudo-3D (raycaster, voxel space, software polygons) | Phaser as a blitter and HUD, or our runtime | PixelDen's Redline Pursuit rasterises 384×216 on the CPU into a `CanvasTexture`; beyond about 320×240 or many triangles, Three.js is better. |

Rules that hold for every kind, from `CLAUDE.md` and the decisions: graphics are code (D12,
D18); everything runs in Docker and nothing is installed on the host (D16); a session never
writes `review.json` or `reviews/INBOX.md`, never changes an approved asset without the owner's
consent, and never writes a decision or a task note for an idea the owner has not agreed to.

## How a game is built here

The flow below is what the verified research supports and what the repo already does. Steps
5 and 6 run as `/continue-game <id> [focus]`
([.claude/skills/continue-game/SKILL.md](../../.claude/skills/continue-game/SKILL.md)), with the
game's state in `games/<id>/STATE.md`. The rest of the proposal (`/make-game`, a progress
feed, a studio page per game) is
[research/game-commands-flow.md](../../research/game-commands-flow.md): it stays a proposal
for the owner to discuss, and is not repeated here.

1. **Concept first, in chat.** The owner picks; a session proposes options with a
   recommendation. PixelDen's practice of a ledger with every pitched concept and its verdict
   (so no run re-pitches a rejected idea) is the pattern to keep
   ([research/pixelden-flow.md](../../research/pixelden-flow.md) §6).
2. **The core before any art, headless and tested.** A pure engine or sim module with a fixed
   step and a seeded RNG, run by bots over many seeds; "if the hook isn't fun as grey boxes,
   redesign now". In this repo that is `@whz/sim` with digests and replays, or for New Hope a
   `step()` that `advance()` and the real loop share.
3. **Assets through the kits, judged in the studio.** Sprites, tiles and scenes are
   `assets/<pack>/<name>/gen.ts` programs ([packages/asset-kit/README.md](../../packages/asset-kit/README.md)):
   lint, then review sheets, never the raw sprite ([docs/looking-at-images.md](../looking-at-images.md)).
   Music and SFX are `wz.song` and `wz.sfx` files checked by hash ([docs/audio.md](../audio.md)).
   The owner's verdicts come back as `review.json` and `reviews/INBOX.md` (D7, D21).
4. **One test hook per game, numbers before pictures.** State as text, the game steps its own
   clock, seeded scripts, counts from `renderer.info`, PNG shots read by a sub-agent:
   [testing.md](testing.md). New Hope's `window.__game` has the first verbs (`describe`,
   `digest`, `advance`, `scenario`, `runScript`, `shot`, `perf`, `errors`).
5. **One increment per run, one commit, the gate chained to it**
   (`./dev npm run check && git commit …`). The same check that failed twice stops the run; the
   report says what was verified and what only the owner can judge.
6. **The owner's playtest is the verdict.** "Agent-verified" is not quality: PixelDen shipped
   about ten games that still wait for a playtest, and its newest failed its first one on basics
   after every automatic check was green. Vague feedback ("too floaty") becomes a number with a
   direction before the next change.
7. **Portal-wide findings become checks, not per-game patches.** PixelDen fixed the same
   fullscreen-button overlap in about twenty upgrade runs. The right fix is once in the host
   plus one contract test.

Budgets that recur across the reports: a PixelDen-sized game is 2.5–5k lines (recent ones
landed at 9.5–14k in one commit, which no one can review or bisect); one commit per milestone;
every number a check reads is a count or a hash, not milliseconds, unless it was measured on
one pinned machine.

## The research behind each page

| Report | Read it for |
|---|---|
| [research/pixelden-flow.md](../../research/pixelden-flow.md) | How PixelDen's two commands work, what they got right (ledger, headless core, validators, replay proofs, string-fit tests) and where they waste (unplaytested games, giant commits, a copy-pasted kit, docs drift, CI without tests). |
| [research/phaser-pixelden.md](../../research/phaser-pixelden.md) | Phaser 4 in 2026, PixelDen's architecture, headless testing tiers, Wallhammer as PixelDen's art and audio factory. |
| [research/game-commands-flow.md](../../research/game-commands-flow.md) | The `/make-game` and `/continue-game` design proposal, the feed and the studio game page. Proposal only. |
| [research/game-skills-survey.md](../../research/game-skills-survey.md) | Which third-party skills are worth a skillspector scan (two), which are ideas only, and the six skills we would write ourselves. |
| [research/game-testing-ai.md](../../research/game-testing-ai.md) | The `window.__test` contract, tiers T0–T6, headless WebGL flags, what LLM vision can and cannot judge. |
| [research/threejs-architecture-perf.md](../../research/threejs-architecture-perf.md), [research/threejs-lessons-from-refs.md](../../research/threejs-lessons-from-refs.md), [research/threejs-gameplay.md](../../research/threejs-gameplay.md), [research/threejs-procgen-look.md](../../research/threejs-procgen-look.md), [research/new-hope-audit.md](../../research/new-hope-audit.md), [research/game-optimisation.md](../../research/game-optimisation.md) | Three.js budgets, instancing, the loop and camera, the look, and the audit of New Hope with file:line findings. Distilled in [threejs.md](threejs.md). |
| [research/procgen-for-games.md](../../research/procgen-for-games.md) | Techniques, parameters and licences for generated content. Distilled in [procgen.md](procgen.md). |
| [research/shipping-wrappers-2026.md](../../research/shipping-wrappers-2026.md), [research/multiplatform.md](../../research/multiplatform.md) (2026-10-02) | Electron, Steam, Capacitor, TWA, the stores, what builds in Docker. Distilled in [shipping.md](shipping.md). |
| [research/game-creator.md](../../research/game-creator.md), [research/code-graphics.md](../../research/code-graphics.md), [research/audio-from-code.md](../../research/audio-from-code.md) (2026-10-02) | The origins of the test protocol and of the kits. |

Licences before borrowing: [research/README.md](../../research/README.md#licence-flags) lists
code that must not be copied. Third-party skills are read for ideas only until they pass the
intake ([security/skill-intake/README.md](../../security/skill-intake/README.md)).
