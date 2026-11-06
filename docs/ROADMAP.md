# Plan: milestones M0–M10

**The single valid engine plan.** It replaces the roadmaps in all six research reports (D29, D72). Where this file differs from a report, this file wins.

**Status:** valid from 2026-11-06. The analysis is closed (D36), the first code will be written as task M0a.
**Checked against sources:** [VERIFICATION.md](VERIFICATION.md) (2026-11-06), the conclusions are worked in below.
**Work is tracked in Linear:** project [Wallhammer Zero](https://linear.app/nsoft/project/wallhammer-zero-3576c061ad78), team Nsoft. M0 and M1 are broken down into tasks (D22).

## How the plan works

- **Lasting code.** Each milestone builds code in its final module with tests. Throwaway prototypes are not made.
- **Machine check.** Each milestone has a file `milestones/Mx.json`. An agent may switch an item to `passes: true` only after the command written next to it succeeds.
- **Owner gate.** Items with `owner_gate: true` are switched only by the owner. Gates are grouped and each milestone has a budget of review hours (D34).
- **Phases.** Large milestones are split into phases (M0a, M0b…) with their own check. The phases of later milestones are decided when their tasks are broken down.
- **Three test scenes.** The city block (M4), the planet seed (M5) and the strategy cutout (M6) run in CI the whole time. They guard that the engine stays general-purpose (D15, D19, D23). They are not games.

```json
{ "milestone": "M2", "owner_review_budget_h": 6,
  "items": [
    { "id": "M2.lavapipe_golden", "desc": "the reference scene passes FLIP on lavapipe",
      "cmd": "ctest -L gpu -R zoo_lavapipe", "expect": "exit 0", "passes": false },
    { "id": "M2.scale_freeze", "desc": "the owner approved the scale table on the zoo next to the references",
      "cmd": "wzctl review status scale_bible", "expect": "approved", "owner_gate": true, "passes": false } ] }
```

## Overview

| Milestone | Name | What exists afterwards |
|---|---|---|
| **M0** | Skeleton, determinism and the agent loop | build and tests on 3 OS, a deterministic generator core, logs, tools for AI |
| **M1** | Core, profiler, debug server and draw cost | memory and jobs, time stepping, RHI and a measured draw cap |
| **M2** | Stylized lighting, studio v0 and the scale zoo | the first image in the style, a studio with a viewport, a frozen scale table |
| **M3** | Assets as programs and a studio for the art director | texture, building and road generators, approval in the studio, audio basics |
| **M4** | Test scene A: city block | a playable block with a drivable car, game DLL, replay |
| **M5** | Test scene B: planet seed | the world shape port with two implementations, a flight from orbit |
| **M6** | Test scene C: strategy cutout | 100,000 entities, a player-built world, time acceleration, UI with a table |
| **M7** | Generated world, streaming and persistence | a 4×4 km city and a planet without holes, saving changes |
| **M8** | City content and the open-world renderer | a dense city with weather, 30,000+ instances |
| **M9** | Characters and animation | 200 pedestrians, ragdoll |
| **M10** | Scaling | a stable frame at 200 km/h across the whole map |

The order of M8 and M9 is reconsidered after gate M4 (D51).

## Conversion of the old numbering

| This plan | Report 5 | Report 4 (and 2) | Report 6 |
|---|---|---|---|
| M0–M3 | M0–M3 | M0–M3 | M0–M3 |
| M4 city block | M4 | part of M4, M5 (vehicles) | M5 |
| M5 planet seed | M5 | part of M9 Planet | — |
| M6 strategy cutout | — | — | — |
| M7 world and streaming | M6 | M4, part of M5 and M8 | M4 |
| M8 city content | M7 | M6 | M6 |
| M9 characters | M8 | M7 | M7 |
| M10 scaling | M9 | M8 | M8 |
| later: planet content | — | the rest of M9 | M9 |
| later: voxel volumes | — | M10 | M10 |

## M0 Skeleton, determinism and the agent loop

**M0a Skeleton and CI**
- Monorepo: `engine/`, `projects/sandbox/`, `external/`, `scripts/` (D32).
- A script that downloads cmake and ninja into `.tools/` (D6). Nothing is installed into the system.
- CMake targets by layer: `eng_base`, `eng_platform`, `eng_gpu`. A dependency lint between layers.
- SDL3 as a submodule. `wz` opens a window and clears it with a color.
- Clang on 3 OS, `-Werror`, ASan, UBSan and TSan (D24, D26).
- Windows development machine (D75): Visual Studio Build Tools, clang-cl, bootstrap and `scripts/check` as CMake scripts, `.gitattributes`.
- Tests: utest and CTest labels.
- CI: Linux, Windows and macOS (`macos-15`) hosted on every push, free because the repo is public (D76). Metal is guarded locally by `scripts/check` (D33).
- gitleaks in `.tools/` as a check before a commit and in CI (D76).
- Threads and atomics: threads from SDL3, not `<threads.h>`. Atomics through clang's `<stdatomic.h>`.
- Vendored audio libraries: miniaudio and libebur128.
- Done when: the build and unit tests are green on 3 OS and `wz` opens a window on the Mac and on the Windows machine.

**M0b Determinism**
- `eng_gen_core`: `detmath`, RNG and noise.
- FP rules and a lint against `<math.h>` for tier A targets (D28).
- `eng_cell_id` and the math of both world shapes including `det_tan` and `det_atan`.
- Golden hashes in CI.
- Measurements 7 and 16.
- Done when: the hash of 10,000 noise and RNG samples is identical on macOS-ARM64, Linux-x64 and Windows-x64. The hash of 10⁵ conversions position → cell → position is identical on 3 OS for both the flat world and the sphere.

**M0c Agent loop**
- `eng_log` (JSONL, channels, ring buffer), `ENG_ASSERT`, `ENG_SCOPE` and a crash handler.
- `eng_cvar` and `eng_cmd`.
- Run modes `--gpu=null --frames --fixed-dt --seed --script --dump`, output to `runs/<id>/`.
- `eng_project` and the project `projects/sandbox`.
- Type registry v0: name, version, fields and JSON Schema export (D43).
- `eng_tools`: the tool registry and two transports, `wzmcp` (MCP) and `wzctl` (CLI). The first three tools: `wz_status`, `golden_check` and `log_tail` (D30).
- A lint against a hard-coded "up" (D31).
- `milestones/*.json` and a progress file.
- Done when: `wz --gpu=null --frames 600 --dump` has 0 errors in `log.jsonl` on 3 OS. A deliberate assert creates `crash.txt` with the scope stack. Claude Code reads the result of `golden_check` as structured JSON through both `wzmcp` and `wzctl`.

**Owner gate:** approves the milestone format and this plan.

## M1 Core, profiler, debug server and draw cost

**M1a Core**
- Arenas and a tagged heap.
- Jobs: `jobs_run` and `jobs_wait` over a simple pool, a generator as a job.
- SPSC queues.
- Type registry v1: versioned serialization.
- Done when: parallel generation of 10,000 tiles gives the same hash with 1 and 12 workers.

**M1b Observing and controlling**
- `eng_prof`: a wrapper over Tracy, phase timers, counters and `stats.json`. On the Mac Tracy gives only CPU zones, locks and memory. GPU zones do not work through SDL_GPU.
- `eng_debugsrv`: a unix socket or pipe with a token. Methods `sim.pause`, `sim.step`, `sim.step_until`, `state.digest`, `log.tail`, `cvar.*` and `cmd.exec`.
- Simulation clock v0: pause, step and speed (D47).
- Tools `time_control`, `cvar_*`, `profile_snapshot`, `console_exec` and `project_build`.
- Done when: Claude runs `wz --agent`, steps 300 ticks and reads a digest smaller than 2 kB.

**M1c RHI and draw cost**
- RHI v0 from three portable concepts (D25). An SDL_GPU backend and a null backend that counts calls.
- **The shader compiler as the first task of the phase.** It is the biggest technical risk: SDL_shadercross has no release and Microsoft does not ship DXC for macOS.
  - SDL_shadercross pinned to a commit, DXC built once from source into `.tools/` with only Command Line Tools. The build time is measured.
  - For Metal, MSL source text is shipped, which SDL_GPU translates at startup (D35). The translation time at startup is measured.
  - DXIL does not have to be produced on the Mac. CI on Linux or Windows can produce it.
  - A Slang pilot as a fallback. On the Mac it cannot do DXIL and its Metal output is marked experimental.
- Shader hot reload.
- Metal validation (`MTL_DEBUG_LAYER`, `MTL_SHADER_VALIDATION`) enabled on every development run.
- A permanent draw cost measurement scene.
- Measurements 2, 4, 11 and 26. Measurement 2 (draw cost) runs on the Mac (Metal) and on the Windows machine (D3D12 on NVIDIA, D75). On Windows, GPU time per pass is verified in Nsight Graphics.
- Done when: the results are stored in the repo as a baseline and the section "Draw cap" below records the cap and the trigger of the native Metal backend.

**Owner gate:** none, it is a technical milestone.

## M2 Stylized lighting, studio v0 and the scale zoo

- **Renderer:** a render graph with slots for module passes. Forward+ with clustered lights (D27). Cluster culling and index compaction in the design.
  - Draw order: opaque, alpha test, transparent.
  - Depth prepass: off on Apple GPUs, an optional switch on Vulkan and D3D12.
  - Light budget: hundreds of real lights in view. Distant lights are drawn as glowing points without lighting.
  - Material textures in several texture arrays with the same size and format (SDL_GPU has no bindless, the limit is 16 samplers per stage).
- **Light in the style (D52):** ramps, hemispheric ambient, cascaded shadows, fog, palette and LUT, optional outlines.
- **Coordinates:** position in double, camera-relative matrices, D32F depth with reversed-Z and an infinite far plane.
- **Resolution:** internally 1080p, own upscale, UI native (D54). The default path is 4× MSAA and a spatial upscale in the FSR1 style. The magnification ratio on Retina is beyond the Quality mode limit, so the internal resolution will be confirmed by measurement 6 and the owner gate.
- **Transparency:** a pass with premultiplied blend, soft particles, emissive MRT and bloom damped by fog, an overdraw debug pass. A torch and neon from instanced sprites.
- **Image for machines:** `--gpu=offscreen` and readback, the tool `shot` (path and statistics), `imgdiff` (FLIP), GPU debug groups, GPU time from a fence, a text overlay. A lavapipe job in Linux CI (package `mesa-vulkan-drivers`).
- **Image debugging without Xcode (D35):** our own debug views in the engine (browsing render targets, switching passes) and a Metal HUD log for GPU time per frame. SDL_GPU does not give time per pass, queries are due in SDL 3.6.
- **Studio v0:** `wz_studio` on Dear ImGui, a viewport, console, CVars, log and profiler.
- **Scale (D53):** `style/scale.cfg`, `scale_derive()`, the scale rig, scale lint v0 and a literal lint.
- **Test scene:** the scale zoo (the scale rig and one street of primitives).
- **Measurements:** 1, 6, 12, 20 and 28.
- **Done when:** the zoo image golden passes FLIP on lavapipe in CI and on Metal locally. The scale lints pass on the zoo. `wzctl shot` returns the path and statistics. An object 10,000 km from the origin is drawn without jitter. A scene with fire and neon passes headless to a PNG and an overdraw histogram.
- **Owner gate:** stylized lighting next to the GTA III and WoW references. Freezing the scale table. The owner supplies the reference shots.

## M3 Assets as programs and a studio for the art director

**M3a Assets and cache**
- The ports `asset_provider` and `gen_provider` with a Merkle cache. The key contains style, scale, world shape and domain version. Layers pristine and edited.
- Hot reload of generator DLLs.
- `wzctl gen` (sheets), `wzctl lint`, golden tests and a dump of intermediate stages in JSON.
- Parameter schema: a panel, validation, documentation and JSON Schema come from it. Presets with distributions and a recipe trace.

**M3b Textures, geometry and the first generators**
- `eng_gen_tex`: operators, tileability, palette and derived maps. Import of AI sources with extended provenance (D14, D55).
- C2PA: the original file stays unchanged, its hash and the output of `c2patool` (binary in `.tools/`) are stored. Missing C2PA is not an error.
- Half-edge operations and meshoptimizer.
- Generators: building v0, road and sidewalk, props. All on top of the scale table.
- Measurements 5, 9, 10 and the first reading of 13.

**M3c Studio for the art director**
- Recipe document, undo with an author, a browser, A/B, Approve and Reject (writing to `review/` and golden), notes in the viewport and a lint panel.
- Tools `gen_*`, `recipe_*`, `lint_run`, `golden_accept`, `review_*` and `project_reload`.
- `review/decisions.jsonl` and `acceptance.md` for asset families.
- A second judge from another vendor for risky categories (D56).
- Project templates `city`, `planet`, `strategy` and `empty`, the command `wzctl new`.
- Measurement 8.

**M3d Audio basics and effect sources**
- `eng_audio`: output through `platform`, the miniaudio mixer, buses, pool and virtual voices, 3D with Doppler and offline render (D65).
- `eng_gen_audio`: UI sounds, modal impacts and impulse responses. An import chain for AI sounds with provenance (D58, D59).
  - ElevenLabs sound cannot be regenerated identically (the API has no seed). The stored file is the only source.
  - Generation uses the v3 model. The v2 model ends on 1 March 2027.
  - Before first use the owner chooses a plan. A commercial license starts with the Starter plan.
- Audio lints including loudness (D64), spectrograms and an A/B page.
- `eng_gen_vfx`: SDF shapes, noises, ramps and the first flipbooks. Contact sheets and effect rules in lints (D66).
- Measurement 18.

**Done when:** a change of a recipe or of generator code shows up in the running studio without a restart. 10–20 materials from both sources pass the lints. Golden hashes match on 3 OS. The LAYOUT dump of a cell is identical on 3 OS. `decisions.jsonl` has at least 30 decisions and the judge's agreement is measured. 20 generated sounds pass the lints with identical hashes on 3 OS.
**Owner gate:** approval of materials and presets, the judge's rubric and the fire and smoke flipbooks.

## M4 Test scene A: city block

One cell with an edge of about 256 m, no streaming.

**M4a Simulation and the game DLL**
- The world as an object (D48). The simulation clock with tick groups (D47). Fixed step and `FrameParams`.
- The simulation input is player commands `player_cmd` (D41).
- The game DLL with hot reload and the stable C ABI `eng_api` (D45).
- Actors with components registered by the game (D44).
- The extraction protocol into the renderer in three channels.
- Replay `.wzr` with subsystem hashes, a bug bundle and `--repro`. The replay carries a build fingerprint (engine, Jolt and compiler versions), and a replay from another build is rejected.
- Tier A rules for simulation logic (D28).

**M4b Physics and the car**
- Jolt through joltc (D42), pinned to one commit for all three OS and built with `CROSS_PLATFORM_DETERMINISTIC` from the start.
- The physics adapter: bodies get IDs from the engine, contact events are sorted by ID before they are passed to the game.
- Saving and restoring physics state in our adapter. joltc does not have it and a save needs it (D40).
- Car generator v0 and a drivable car.
- Car sound: loops by RPM and load, Doppler and impacts from contacts.
- Measurements 19 and 27.
- Before this phase the research on driving physics should be done (D71).

**M4c UI, effects and Play**
- `eng_ui` on top of Clay and SDL_ttf: HUD v0 and `ui_tree` (D57).
- Play as a subprocess, tools `play_*` and `game_state`.
- `eng_vfx`: a particle pool on the GPU, buckets, indirect drawing. Tire smoke, skid marks, sparks and decals.
- The first D3D12 check on the Windows test machine.
- Measurement 21.

**Done when:** a five-minute drive replays bit-identically on the same platform and build, on each of 3 OS. The hash of the logical simulation is identical on all 3 OS. Measurement 27 additionally compares the drive hash between OS. If they match, the gate is raised to "identical on all 3 OS". The first differing tick is reported by subsystem. The HUD golden image passes. The block's counter budgets hold in CI. The scenario "a car at 80 km/h past the listener" passes the numeric audio checks.
**Owner gate:** a street-level view and the car next to the GTA III references.

## M5 Test scene B: planet seed

- The world shape port with two implementations: a flat grid and a cube-sphere.
- "Up" and gravity by position in controllers, vehicles and the camera.
- Reversed-Z and camera-relative matrices at planetary scale.
- Coarse terrain through the same `gen_world` interfaces. Height tiles with CDLOD and horizon culling.
- A flight from orbit to the ground over one biome.
- The `planet` project from a template.
- Measurement 15.
- **Done when:** the city block from M4 runs unchanged on the flat implementation. The planet scene passes golden hashes on 3 OS. The flight digest reports no precision jumps. Both projects are in CI.
- **Owner gate:** readability of curvature and scale during the flight.

## M6 Test scene C: strategy cutout

A new milestone because of strategy games (D23, D50).

- **Simulation of the whole world (D46):** global data (road graph, building and entity tables) is in memory and ticks everywhere. Cells serve only drawing. The simulation runs off the drawing thread and drawing reads an interpolated snapshot of the state.
- **Mass entities (D44):** dense tables, own 64-bit IDs, no physics. Drawn instanced with LOD.
  - Sleeping and waking: idle entities are not iterated. An event or time wakes them.
  - Movement ticks less often than drawing (for example 10 Hz) and is interpolated between ticks.
  - Merging into groups as a recommended pattern for populations.
- **Time (D47):** pause, speed multiples, slow economy ticks and work spread across frames.
  - When the simulation cannot keep up, game time slows down. Drawing holds the frames.
  - Only independent tick groups run in parallel. Effects across a group boundary are deferred and executed in a fixed order.
- **Pathfinding:** a service with a request queue, a per-frame budget, computation on multiple cores and a cache. After a graph edit, the affected paths are invalidated. The default method is A*.
- **Player-built world (D39):** a player command (road, zone, building) is a generator input.
  - The road network is a global model: nodes, segments, lanes and turns.
  - After an action, only the changed segments and intersections are regenerated, and from them the affected cells.
  - Intersection geometry has its own set of hard cases: a sharp angle, a short segment, many arms, a slope.
- **Controls (D49):** a strategy camera with zoom from street to the whole map, selection by mouse and box, placement with snapping.
- **UI (D57):** widgets (tables, lists, tooltips, windows), data binding and a UI description in text files.
  - Clay gives only layout. `eng_ui` therefore includes own drawing through SDL_GPU, text input and a table that keeps only the visible rows in memory.
  - Formatted text with links and icons, nested tooltips, sorting and notifications.
  - Clay and SDL_ttf are pinned to a commit.
- **Map modes:** coloring the map by a simulation column, as a renderer function.
- **Game data (D45):** text tables loaded through the type registry. Whether data also includes conditions and effects waits for the owner, see [VERIFICATION.md](VERIFICATION.md).
- **Multiple worlds (D48):** two world instances at once, an overview map and a detail. Both tick at the same time.
- **The `strategy` project** from a template.
- **Test scene:** a top-down camera, 100,000 entities on a road graph, a road drawn by the player during operation, an intersection with four arms and one with a sharp angle, time acceleration, a panel with a table of 10,000 rows and one map mode.
- **Measurements:** 24 and 25.
- **Done when:**
  - the tick holds the budget in three cases: all 100,000 entities moving, 20 % moving and the rest asleep, and the top time speed (the budget is set by measurement 24),
  - the hash of the logical simulation after replaying player commands is identical on 3 OS and identical with 1 and 12 threads,
  - saving in the middle of a run, loading and continuing gives the same hash as a run without saving,
  - after drawing a road, the paths through the changed place are recomputed and the cell regenerated without a frame hitch,
  - drawing a view of the whole map holds the draw cap,
  - the golden image of the panel with a table passes and `ui_tree` returns the table,
  - the city block and the planet seed run unchanged and all three projects are in CI.
- **Owner gate:** readability of the top-down view and the panel, the feel of the camera and of drawing roads.
- Before the milestone, the research on mass simulation and UI for strategy games should be done (D71).

## M7 Generated world, streaming and persistence

- **World:** `gen_world` in levels L3–L0.
- **Streaming:** six cell states, tickets, epochs for cancelling stale work and queues with limits. A refcounted resource graph, SDL_AsyncIO and a LOD tree with a fallback.
- **Two-layer collision:** coarse from the LAYOUT state, detailed from the MESHED state.
- **Debugging:** debug draw and its dump, visualization of cells, states and tickets, a headless dump of states in JSON lines. Tools `world_query`, `world_inspect` and `world_pick`.
- **Persistence (D40):** changes on top of regeneration, stable IDs from the anchor, the full simulation state from the type registry, region change files, a world manifest, domain classes and a migration report.
- **Audio:** acoustic cell metadata, point emitters from `gen_world`, ambience by zones and banks streamed with cells.
- **Cooker and packs** only to the extent needed.
- **Measurements:** 13, 14 and 17.
- **Done when:**
  - a flight through a 4×4 km city and through a planet is without holes and blocking loads,
  - cells generated in any order have the same hashes on 3 OS,
  - a replay with delayed I/O gives identical simulation hashes,
  - a save from one OS loads on another with the same IDs,
  - during a headless drive of 8 km at 200 km/h no frame waits for generation,
  - a car drives through a cell in the LAYOUT state and does not fall through,
  - raising the version of a free domain does not break a save, and migration of a frozen domain deletes nothing.
- **Owner gate:** a map of districts and a biome seen from above.

## M8 City content and the open-world renderer

- **Content:** facades from a CGA grammar with kit parts and WFC, district palettes, street furniture, trees with impostors and SDF rocks.
- **Renderer:** GPU culling with cluster culling, HLOD, dither transitions and texture arrays. Evaluating the trigger of the native Metal backend.
- **Lints:** expressive range, district distinguishability and quotas of landmarks.
- **Weather (D68):** rain, fog and lightning with delayed thunder, wet surfaces.
- **Effects:** half-resolution smoke, neon and ambient city effects. A choice between sorting and WBOIT according to measurement.
- **Audio (D63):** occlusion, reverb zones, ducking and snapshots, a traffic voice budget, a music clock.
- **Traffic and pedestrians:** the scope is set by the research (D71).
- **Measurements:** 3, 22 and 23.
- **Done when:** the scene has 30,000+ instances. The number of draws grows with buckets, not with objects. The counter budgets hold. The range lints pass. 200 cars and rain hold the voice and fragment budget.
- **Owner gate:** a street-level view next to GTA III, district distinguishability and a street in the rain.

## M9 Characters and animation

- `eng_gen_char`: skeleton, a smooth-min body, clothing and a painted face.
- Walking, IK, springs, inertialization, getting into a car, GPU skinning, crowd LOD and active ragdoll.
- Audio: footsteps by surface, body impacts and vocal expressions.
- Effects: hits, dust from steps and weapon traces.
- **Test scene:** 200 pedestrians on slopes and stairs.
- **Done when:** the metrics of foot sliding and loop seam are below the threshold. A car hit causes a stumble or a fall identically in a replay.
- **Owner gate:** a sheet of 20 faces and characters next to the WoW references, the feel of movement while playing.

## M10 Scaling

- Full work-stealing according to profiler data.
- Running simulation N+1 in parallel with render preparation N by enabling the extraction protocol.
- Packs with BC compression, budgets and LRU with hysteresis, a predictive ticket along the road graph and a "LOD only" mode.
- Landmark stamps and lazy interiors.
- Optionally a native Metal 3 backend, if the trigger was activated.
- Minidumps, localization, gamepad navigation and menus.
- Effect quality profiles, audio bank packages and audio budgets in CI.
- **Test scene:** 200 km/h across the whole map.
- **Done when:** the frame is stable at 200 km/h with the full audio and effects load. Memory holds the budget. Profiling was done on Linux and Windows.
- **Owner gate:** the final drive-through.

## Later (no number)

| Work | Note |
|---|---|
| Planet content | biomes, villages, creatures and their voices, snow, sand and wind (D68), music from fragments (D61) |
| Voxel volumes | optional, digging and caves (D39) |
| Grand strategy in space | a galaxy map over multiple worlds (D48), scope set by research |
| Radio music | postponed (D60) |
| Steam Audio behind a port | only as needed (D63) |
| Network code | not planned (D41) |

## Measurements

Each measurement is created as a permanent test or measurement scene in the repo. The result is written to the repo as a baseline.

| # | What is measured | Milestone | What it decides |
|---|---|---|---|
| 1 | GPU cost of a synthetic city cell at four resolutions | M2 | internal resolution, number of cascades, confirmation of forward+ |
| 2 | CPU cost per draw in SDL_GPU on Metal | M1 | draw cap, native backend |
| 3 | thermal load, 30 minutes | M8 | cap on generation workers |
| 4 | `recommendedMaxWorkingSetSize` on 24 GB | M1 | GPU memory cap |
| 5 | throughput of BC7 and ASTC encoders | M3 | encode at streaming time, or at cook time |
| 6 | cost of the upscaler | M2 | image quality on Retina |
| 7 | determinism of generators on 3 OS | M0 | whether regeneration can be relied on |
| 8 | calibration of the judge against the owner's verdicts | M3 | the judge's weight |
| 9 | materials from code versus materials from AI | M3 | default source by category |
| 10 | model ability by asset category | M3 | schedule, templates |
| 11 | shader pipeline and hot reload, compiler build time and MSL translation time at startup | M1 | number of variants, compiler choice |
| 12 | Vulkan on the Linux test machine and lavapipe in CI | M2 | Vulkan coverage |
| 13 | cold latency of a 256 m cell (p50, p95) | M3, again M7 | streaming lead time |
| 14 | cost of detailed collision and navmesh versus generation | M7 | what to build only on demand |
| 15 | cost of drawing CDLOD tiles on Metal | M5 | planet terrain density |
| 16 | cost of `det_tan` and `det_atan` per vertex | M0 | use on the cube-sphere |
| 17 | replay time of the changes of a heavily edited cell | M7 | change format |
| 18 | CPU of the audio thread with 96 voices | M3 | number of real voices |
| 19 | cost of a live engine model | M4 | car sound |
| 20 | cost of a million transparent fragments at 1080p | M2 | fragment budget |
| 21 | throughput of particle append and sorting through SDL_GPU | M4 | pool size |
| 22 | 100,000 rain drops with collision | M8 | rain scope |
| 23 | cost of half-resolution composition and WBOIT | M8 | sorting, or WBOIT |
| 24 | tick cost of 100,000 mass entities, the movement tick frequency and the path budget per frame | M6 | strategy simulation budget |
| 25 | latency of regenerating a cell after a player action | M6 | smoothness of building |
| 26 | whether a native Metal layer can be created next to an SDL3 window | M1 | whether the fallback backend is feasible |
| 27 | agreement of a drive replay on the same platform and across 3 OS (Jolt through joltc and clang-cl), double precision in joltc | M4 | raising gate M4, physics on the planet |
| 28 | throughput of the owner's review (renders per hour) | from M2 | gate budgets |

Measurements 1–12 are from report 3 (the original no. 12 is replaced by D20), 13–17 from report 4, 18–23 from report 6. Measurements 24–28 were added during the review.

On the Mac, measurement is done without Xcode (D35): our own counters and frame times, `powermetrics`, the Metal HUD log (`MTL_HUD_ENABLED=1`) and Tracy. GPU time per pass cannot be measured this way.

## Points to verify

Assumptions that the reports marked as unverified. Each gets a "verify" task in its milestone.

| Assumption | Milestone |
|---|---|
| C11 atomics through clang-cl on Windows | M0a |
| Building DXC from source on the Mac and a pinned SDL_shadercross | M1c |
| Tracy overhead on Apple Silicon | M1b |
| Hot reload within a second | M3a, M4a |
| Bit identity of Manifold, if it is used | M3b |
| Double precision in joltc on Windows | M4b |
| Jolt determinism through clang-cl, for vehicles and through joltc | M4b |
| Running D3D12 through WARP on a hosted Windows runner | M2 |
| Own drawing of Clay commands through SDL_GPU (a ready one does not exist) and the state of GPU text in SDL_ttf | M4c |

## Gaps waiting for research

| Area | When it must be clear | Source |
|---|---|---|
| Light, sky and time of day | before M2 | research D71 |
| Driving physics | before M4b | research D71 |
| Mass entity simulation, traffic and pedestrians | before M6 and M8 | research D71 |
| UI for strategy games and data-driven content | before M6 | research D71 |
| Water and vegetation at scale | before M8 | no research yet |
| Game layer: input mapping, third-person camera, menus | M4, M10 | no research yet |
| Building and releasing the game for 3 OS | before the first released game | no research yet |
| Interiors | M10 | no research yet |

## Platform verification

- **Hosted CI (Linux, Windows, macOS):** from M0 on every push build, unit tests, null GPU, replay, golden hashes and shader compilation into all formats. Free for a public repo (D76).
- **Lavapipe in Linux CI:** from M2 Vulkan image goldens.
- **MacBook M4 Pro:** the script `scripts/check` before every merge. Metal goldens, time budgets and renders for review.
- **Linux on a real graphics card:** at the end of M2, M7 and M10, possibly as a second system on the Windows PC.
- **Windows PC with NVIDIA (D75):** the second development machine from M0. `scripts/check` before every merge, D3D12 and Vulkan on a real graphics card from M1c, the main machine for GPU profiling (Nsight Graphics, RenderDoc, PIX).

## Draw cap and the trigger of the native Metal backend

To be filled in after measurements 2 and 26 in M1c.

## Time estimate

There is none and none is invented. After M0 and M1 the real speed is read from Linear and the rest is estimated from it.
