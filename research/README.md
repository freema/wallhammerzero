# Research

Deep reports written by sub-agents on 2026-10-02 at the owner's request (the index below lists
them all). They are
**inputs, not decisions.** Every recommendation in them is a proposal until the owner agrees
([docs/DECISIONS.md](../docs/DECISIONS.md)).

Caveats:
- Several agents ran out of web-search quota partway through and switched to fetching pages
  directly. Claims they could not confirm are marked in each file (`[?]`, "unverified",
  or an `[S]/[R]/[O]` legend).
- Each report ends with its own open questions. The ones that block work are collected in
  [tasks/2026-10-02-owner-calls.md](../tasks/2026-10-02-owner-calls.md).

## Index

| Report | Topic | One-line takeaway |
|---|---|---|
| [code-graphics.md](code-graphics.md) | Graphics from code by an LLM (Opus 5.5), 2D and 3D | Quality comes from the render→inspect→revise loop. Proposal: TS generators drawing into palette-indexed buffers as the source of truth; PNG/atlas as build output; owner picks from 4–9 variants. Contains a 17-section skeleton for our own skill. |
| [audio-from-code.md](audio-from-code.md) | Music and SFX authored as code/data | One deterministic TS synth everywhere (CLI, studio, game). Songs as a step-grid JSON; SFX as named sfxr/ZzFX-style parameters. iOS audio quirks are the real risk. |
| [studio-stack.md](studio-stack.md) | The studio app | React Router 8 (framework mode; v7's successor). One shared WebGL context for all previews (browsers keep ~16). Per-asset `review.json` tied to a content hash, written only by the studio; `reviews/INBOX.md` for Claude. **Needs Node ≥ 22.22, so the studio runs in Docker.** |
| [multiplatform.md](multiplatform.md) | Shipping web-tech games everywhere | Proposal: Electron for desktop/Steam, Capacitor 8 for mobile, WebGL2 as the floor. Consoles only via porters or Godot (W4: $800/platform/year). Idea: run the same JS sim in Godot via QuickJS instead of rewriting it. |
| [voxels.md](voxels.md) | Voxels, incl. the owner's Vellum plan | Voxel→sprite baking is proven (Tiberian Sun/RA2). An integer 2:1 iso projection makes it pixel-exact. A pixel-stable look needs a fixed orthographic camera. Our own runtime fits the pixel-art priority; the Three.js decision waits for the voxel-game camera choice. |
| [ref-voxel-musou.md](ref-voxel-musou.md) | Deep code analysis: voxel-musou | Per-joint box-list models → grid → AO mesh; pose arrays + IK; strict sim/render split. Its "pixel look" is post-processing, not pixel art. Contains a model + rig format sketch with a sprite-bake block. |
| [ref-sakura-crossing.md](ref-sakura-crossing.md) | Deep code analysis: sakura-crossing | Canvas2D generators + building types as table rows. The planet bend doesn't scale to a flyable planet. Built with Claude Code: ~4.8k lines of docs, ~146 recorded traps, a `__shot` render endpoint and numeric self-checks are what keep 56k lines alive. |
| [ref-threejs-punk.md](ref-threejs-punk.md) | Deep code analysis: Threejs-Punk | AGENTS.md + docs/techniques is a good pattern, but it drifted from the code within a day, so it needs an automated check. Perf profiles + a dev perf API. **Rain shaders are CC BY-NC-SA: don't copy.** |
| [ref-nms-procgen.md](ref-nms-procgen.md) | No Man's Sky / Light No Fire procgen | A positional-seed generator chain; real numbers from the GDC 2017 talks. Changing the generator changes every world, so saves must pin the generator version. Proposal: a seed browser as a CLI for Claude plus a studio page. |
| [game-creator.md](game-creator.md) | PlayableIntelligence/game-creator | Best idea: a test protocol in every game (state as text, time stepping, seeded action scripts, QA loop with an attempt log). Don't take the real-people content, paid generators, Strudel or crypto. Licence unclear. |
| [skill-validation.md](skill-validation.md) | NVIDIA skillspector + skill intake | Static mode (`--no-llm`) needs no key; expect many false positives, so triage is mandatory. Runs via Docker (D16). Includes an intake-procedure proposal. |
| [ref-procedural-pixel-creatures.md](ref-procedural-pixel-creatures.md) | Deep code analysis: idlerunner00/procedural-pixel-creatures (Godot/C#) | Not a mask/CA generator: creatures are small 3D models of analytic primitives, CPU-rasterised and toon-shaded into palette indices, so it is closest to our **voxel baker**. Strong rules to take: selective outline, depth-gap interior contours, far-side parts one ramp darker, contact shadow as a ramp step, speck cleanup, faces as stamps drawn last, uncurated review seeds, loop-seam and pivot-baseline lints. Good at 30–90 px; doesn't reach 16×24 chibi quality. Ran in Docker (offline): deterministic across CPU architectures. |
| [scans/2026-10-02-procedural-pixel-creatures/](scans/2026-10-02-procedural-pixel-creatures/TRIAGE.md) | skillspector scan (Docker, offline, static) | Not a skill. Scanner label CRITICAL / DO_NOT_INSTALL rests on 4 HIGH **false positives**; 0 real findings. Don't run its Windows launcher (installs on the host). Contact sheets of 72 uncurated creatures in `samples/`. |
| [scans/2026-10-02-game-creator/](scans/2026-10-02-game-creator/TRIAGE.md) | First skillspector scan (Docker, offline, static) | game-creator: **risk HIGH, DO_NOT_INSTALL**, 0 CRITICAL. The real issues are the credential flows and the API-key hook; the rest is FP or coverage noise. Ideas only. |

## Conclusions that repeat across reports

1. **Determinism and integer math everywhere:** simulation, noise, audio and sprite baking.
   Outputs become testable by hash and portable to a second player (Godot). JS `Math.sin` and
   friends are not guaranteed identical across engines.
2. **An asset is a program; its output is a pure function of `(params, seed, time)`.** This
   holds for graphics, voxel models and music alike. PNG, atlas and WAV files are build
   artefacts.
3. **Quality comes from the verification loop, not the first try:** upscaled contact sheets,
   numeric lints, a pass budget, variants for the owner to pick, and verdicts tied to content
   hashes.
4. **Agent knowledge bases drift from code within days** (sakura-crossing, Threejs-Punk). If we
   write a traps/techniques knowledge base, a check must compare it with the code automatically.
5. **Every player implements one test protocol:** state as text, step time, seed, action
   scripts, a render endpoint (`__shot`).
6. **Our own runtime fits the pixel-art-first order.** Voxels can enter the 2D sims early as
   baked sprites.

## Licence flags

Do not copy these; take ideas only, or write our own:
- Threejs-Punk `surfaceRain.js` / `rainGlass.js`: CC BY-NC-SA 3.0 (via rocksdanister/rain). The
  ground ripples match an uncredited Shadertoy.
- Strudel: AGPL. Furnace and Dn-FamiTracker: GPL.
- game-creator: no LICENSE file; the README says MIT and package.json says ISC.
- sakura-crossing: code is MIT, but its MP3 is not covered.
- Fine to reference (MIT/Unlicense): sfxr, jsfxr, ZzFX/ZzFXM, voxel-musou code, sakura-crossing code.
- procedural-pixel-creatures: MIT (+ Apache-2.0 PCG32 in `Core/Math/Random.cs`, fdlibm notice in
  `Core/Math/DMath.cs`). Fine to reference; **ideas only by choice** (C#, float maths and a
  simulation-driven animator don't fit D18), so we re-implement in TypeScript.
