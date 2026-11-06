# Project status

Where we are, what is resolved, what is open and what comes next. Updated after every session and every decision.

**Last updated:** 2026-11-06
**Phase:** the analysis is closed (D36). Next is the implementation of milestone M0. The first code will be written as task M0a on the owner's go.
**Plan:** [ROADMAP.md](ROADMAP.md), work in Linear: [Wallhammer Zero](https://linear.app/nsoft/project/wallhammer-zero-3576c061ad78).

## Done
- [x] The old project backed up to GitHub (`freema/wallhammerzero`, branch `implementation`) and deleted. A new folder is ready, `git init`.
- [x] Development machine checked: MacBook Pro 14" M4 Pro, 12 cores (8P+4E), 16-core GPU, 24 GB, Metal 3, 160 GB free space. `cmake` and `ninja` are missing; they will be installed locally into the project (D6).
- [x] **Research 1: engine architecture.** See [research/open-world-engine-architecture.md](research/open-world-engine-architecture.md).
  Conclusion: Gregory's layers as CMake targets, ports and adapters only at seams, no generic ECS, work-stealing jobs without fibers, streaming by cells of 128–256 m, a thin RHI over SDL_GPU, milestones M0–M7.
- [x] Research 2: procedural graphics (textures, geometry, world and cities, animation and characters, style, determinism, tools). All five notes are done.
- [x] Research 3: what AI can do in 3D (research, shaders and visual evaluation, practice, demands on the M4 Pro). All four notes are done.

## Done: research and consolidation
- [x] Report from research 2: [research/procedural-graphics.md](research/procedural-graphics.md), including D12–D14.
  Conclusion:
  - **Style:** stylized textured 3D, light baked into textures, ramp lighting, palette and LUT.
  - **Generators:** half-edge builders and CGA grammar for buildings, SDF and surface nets for rocks, characters from capsules joined by smooth-min.
  - **Animation:** springs, IK and "Euphoria-lite" ragdoll through Jolt/joltc.
  - **World:** hierarchy L3–L0.
  - **Determinism:** CPU only, no `<math.h>` in generators.
  - **Architecture:** a new port `asset_provider`, targets `eng_gen_*`, milestones M0–M8.
- [x] Report from research 3: [research/ai-capabilities-in-procedural-3d.md](research/ai-capabilities-in-procedural-3d.md).
  Conclusion:
  - **What AI can do:** it reliably writes generator code. It is strong on the city, roads, terrain, buildings, props and light; it reaches the GTA III bar. With more iterations it handles vehicles, vegetation and the WoW-style look. Characters, faces, animals and the "feel" of animation are risky.
  - **Visual judgment:** when evaluating images, AI agrees with humans in only 0.66 of cases, so the main check is done by lints and a separate judge.
  - **M4 Pro:** 60 fps at 1080p or 1512×982 with own upscale, the engine should fit into ≤6 GB of GPU and 2–3 GB of CPU memory.
  - **Before implementation:** 12 measurements at the start of implementation, without a prototype.
- [x] **Research 4: No Man's Sky, generation and streaming.** Report: [research/no-mans-sky-generation-and-streaming.md](research/no-mans-sky-generation-and-streaming.md).
  Conclusion:
  - **World shape port:** a 64-bit cell ID in the S2 style. Two implementations: a flat grid and a cube-sphere with CDLOD. "Up" and gravity are given by the port.
  - **Coordinates:** position in double on the CPU, float relative to the cell or camera, reversed-Z. `int32 cell + float` from report 1 is dropped.
  - **Streaming:** six cell states, tickets including prediction for 200 km/h, and epochs for cancelling stale work.
  - **Deltas and versions:** deltas per cell without a global cap, versioned generator domains.
  - **Milestones:** new M9 Planet and M10 Voxel volumes (optional).
  - **Key measurement:** cold latency of a 256 m cell on the M4 Pro.
- [x] In-depth analysis of the code of the reference repos, see [research/notes/reference-repos/](research/notes/reference-repos/). The TODO sections in Vellum are filled in, including corrections of the original claims, and all three notes have `status: done`.
  - **Sakura Crossing:** the bottleneck is draw calls, not resolution. Half resolution did not help (19.3 → 19.1 ms). So we must merge geometry by cells and materials.
    We will take: toon ramp with tinted shadow, ink lines from the second difference of depth, cars as table rows, terrain checks as lints.
  - **Voxel Musou:** we will take the contract between simulation and render (fixed 60 Hz step, a headless bot with a JSON timeline as the basis of golden tests), procedural animation (the weapon as its own channel, IK), crowds through instancing with three LODs, and fog, aerial perspective and the tone curve.
    The voxel mesher does not reach the GTA III / WoW bar; it will serve only for LOD and placeholders.
  - **Threejs-Punk:** we will take GPU rain with a height map, which also gives dry spots under roofs, bloom only from an emissive buffer, a planar mirror for a wet street, cached static shadows and a look as ~16 numbers per preset.
    Not to take: 8-bit buffers. The night lighting of the city (local lights) remains open.
- [x] **Research 5: comparison with practice and proposals for improving the path.** Report: [research/engine-comparison-and-improvements.md](research/engine-comparison-and-improvements.md).
  Conclusion:
  - **The core of the design holds.** But observing and controlling the engine (debug server, MCP, studio) comes late.
  - **Three layers are missing:** a simulation shaped as a server with `player_cmd`, a type registry with versioned serialization and explicit extraction into the renderer.
  - **SDL_GPU stays.** An RHI from 3 portable concepts, native Metal only with a trigger. The draw call cost measurement goes into M1.
  - **Pipeline:** the art director's side needs strengthening: parameter schemas, presets, a calibrated judge.
  - **Unified plan M0–M9:**
    | Milestone | Content |
    |---|---|
    | M2 | Scale zoo |
    | M4 | Test A: city block |
    | M5 | Test B: planet seed |
  - **Lists:** 24 improvements and 18 owner decisions.
  - **Note:** the milestone numbering replaces the one from reports 1, 2 and 4 (where the planet is M9).
- [x] **Research 6: audio, music and visual effects.** Report: [research/audio-music-and-vfx.md](research/audio-music-and-vfx.md).
  Conclusion:
  - **Audio:** SDL3 only as the device, miniaudio as the mixer and 3D, on top of it our own `eng_audio` (virtual voices, occlusion, reverb zones, ducking).
  - **Music:** fragments in the style of Pulse from NMS.
  - **Effects:** one GPU particle pool, 5 buckets, each with one indirect draw. So neither bindless nor MDI on Metal is a problem. Effects are data with a schema, Riot's rules are lints.
  - **Budgets:** in counts (fragments, particles, voices).
  - **Waiting for the owner:** A1 AI audio (recommended effects and ambience only), A3 radio, A5 sound style, V1–V3.
  - **Note:** the report uses the old milestone numbering (planet M9). The unified plan from report 5 applies.
- [x] Proposal of the world shape port (D15): it is in report 4, in the section "World shape port".
- [x] **Documentation review (2026-11-06):** weak spots are in [REVIEW.md](REVIEW.md).
  Conclusion: the design is coherent, the weak part is consolidation (four roadmaps, contradictions between reports, about 30 undecided points), unexplored areas (pedestrians and traffic, driving physics, light and sky) and several unverified assumptions (mainly the bit-identical simulation replay on 3 OS).
- [x] **List of decisions with recommendations (2026-11-06):** [DECISION-PROPOSALS.md](DECISION-PROPOSALS.md), 48 items in five groups.
- [x] **D23 strategy games:** the impact on the design is in the introduction of the same file.
- [x] **The owner confirmed all 48 proposals (2026-11-06)**, except proposal 12: Xcode is not installed (D35). Recorded as D24–D71.
- [x] **[ROADMAP.md](ROADMAP.md):** one plan M0–M10 with reports 4 and 6 worked in, the strategy scene (M6), phases of M0, M1, M3 and M4, a list of 28 measurements and a table of gaps.
- [x] **[CONVENTIONS.md](CONVENTIONS.md):** axes and units, positions, cell ID, stable IDs, determinism, names, programs, repo structure, secret keys.
- [x] **Project in Linear (D22):** [Wallhammer Zero](https://linear.app/nsoft/project/wallhammer-zero-3576c061ad78), team Nsoft, milestones M0–M10, tasks for M0 and M1.
- [x] **Checking the plan against web sources (2026-11-06):** notes in [research/notes/plan-verification/](research/notes/plan-verification/), conclusions in [VERIFICATION.md](VERIFICATION.md).
  Conclusion: no decision fell. The justification of physics determinism was corrected (Jolt can do identity across OS), as were the scope of the game UI and strategy games in M6. The shader compiler is the first technical risk. The fixes are recorded as D74.
- [x] **Research 7: procedural pipeline and modern engines (2026-11-06).** Report: [research/procedural-pipeline-and-modern-engines.md](research/procedural-pipeline-and-modern-engines.md). The procedural core holds up. Gaps are in the machinery around it: stable recipe and rule identity, an explicit generator input contract, a dependency registry, cache lifecycle and hand edits that survive a generator version change. Accepted as D79 and written into ARCHITECTURE, CONVENTIONS and ROADMAP.
- [x] **Repo translated to English (D78).**
- [x] **Research 8: environment destruction (2026-11-06).** Report: [research/environment-destruction.md](research/environment-destruction.md). Accepted as D80: destruction is stored as part states, tier A decides, debris is cosmetic. Early work in M3b–M8, the milestone MD and measurements 31–36.

## Resolved (briefly; details in DECISIONS.md)
| Topic | State | Decision |
|---|---|---|
| A new beginning, old code as inspiration | ✅ | D1 |
| Platforms macOS, Linux, Windows | ✅ | D2 |
| Purely a 3D open world | ✅ | D3 |
| Language C17, clang on 3 OS | ✅ | D4, D24, D26 |
| SDL3 + SDL_GPU under our own RHI | ✅ | D5, D25 |
| Do not clutter the system, no Xcode | ✅ | D6, D35 |
| Architecture (layers, ports at seams, no ECS) | ✅ per research | D7 |
| All graphics from code, no Blender | ✅ | D8 |
| No photorealism | ✅ | D9 |
| Full 3D, free perspective camera, no isometry or pixel art | ✅ | D12 |
| Quality bar: GTA III / WoW | ✅ | D13 |
| Textures from code and from an AI image model | ✅ | D14 |
| Analysis first, then code | ✅ | D11 |
| A general-purpose engine (city and planet), not for one game | ✅ | D15 |
| Scale and proportions governed by a central table and lints | ✅ default profile, frozen in M2 | D16, D53 |
| Debugging tools, headless mode, logging from the first milestones | ✅ principle and design (report 5) | D17 |
| Built-in studio, MCP server in the engine, UI, project system | ✅ principle and design (report 5) | D18 |
| D15 stands, the "engine for one game" warning rejected | ✅ | D19 |
| Mac primarily, Linux and Windows test machines, no macOS upgrade | ✅ | D20 |
| Second development machine: a Windows PC with NVIDIA, sharing through GitHub | ✅ | D75 |
| Public repo with security, CI on 3 OS for free | ✅ | D76 |
| Everything in the repository is in English | ✅ | D78 |
| No Three.js and no JS in the engine, only ideas from references | ✅ | D21 |
| Implementation plan in Linear, step by step | ✅ | D22 |
| The engine supports strategy games too (Cities: Skylines, Stellaris) | ✅ | D23, D44, D46–D50 |
| Forward+ with clustered lights | ✅ confirmed by measurement in M2 | D27 |
| Determinism in two tiers | ✅ | D28 |
| One plan M0–M10, conventions | ✅ | D29, D72, D73 |
| Tools for AI: one registry, MCP and CLI | ✅ | D30 |
| Z axis up, monorepo, CI | ✅ | D31–D33 |
| End of the analysis | ✅ conditions met | D36 |
| World, persistence, network, physics, entities, simulation time | ✅ | D38–D49 |
| Art style: stylized painted 3D | ✅ confirmed by gate M2 | D52 |
| Resolution, AI sources, judge, UI | ✅ | D54–D57 |
| Audio and effects | ✅ | D58–D68 |

## Open questions
Three questions for the owner from checking the plan, in detail in [VERIFICATION.md](VERIFICATION.md). None blocks M0.
1. ~~Hosted macOS in CI~~: resolved in D76, the repo is public and CI is free.
4. License of the public repo (D76). None yet, so "all rights reserved".
2. May game data assemble conditions and effects from parts programmed in C? Recommendation: yes.
3. May the GTA III and WoW reference screenshots be sent to AI services? Recommendation: no, only locally.

5. Before M7 (D79): the default policy for orphaned edits, whether frozen domains keep old generator source, whether the two machines share a cache.
6. D80 defaults for destruction (scope, persistence per mode, position of MD) may be changed by the owner; MD position is decided at gate M4.

The rest will be decided by a measurement or a milestone gate.

## References from Vellum (`projects/grafika-reference/`)
Three Three.js repos and one technical analysis, recorded 2026-09-24. The in-depth code analysis is done, see [research/notes/reference-repos/](research/notes/reference-repos/).
- **Sakura Crossing**: ~56k lines of JS, zero models and textures. Proof that stylized graphics from pure code are possible. Toon light with color-shifted shadows, ink lines from depth, building and car generators as table rows, merging by material because of draw calls.
- **Voxel Musou**: ~9.3k lines, zero assets. A voxel character builder, procedural rig and animation, crowds through instancing, a deterministic 60 Hz tick.
- **Threejs-Punk**: render techniques (rain with collision through a height map on the GPU, wet surface, post pipeline, performance levers). Note, it uses GLB models and textures, take only the techniques.
- **No Man's Sky / Light No Fire**: a cascade of seeds from position, storing only deltas, a cube-sphere with an octree, archetypes and parameters.

## Known risks
- SDL_GPU has no bindless and multi-draw on Metal is a CPU loop. A fully GPU-driven renderer is therefore not possible and there is a risk of a draw call limit.
- Nobody has yet shown a WoW-style painted look with pure code. Hence D14.
- Characters, faces and natural movement are the weakest category for AI.
- AI evaluates images reliably only in broad features. Fine geometry must be guarded by lints in code, and the owner approves style and movement.
- Inconsistent scale between generators (previous project: giant characters in a small city) → D16.
- The 14" chassis throttles performance under simultaneous CPU and GPU load.
- The research reports use the older milestone numbering. Only `ROADMAP.md` and its conversion table apply.
- Without Xcode (D35), GPU time per pass cannot be broken down on the Mac. Budgets are kept in counts.
- Shader compiler: SDL_shadercross has no release and DXC for macOS must be built from source. The first task of M1c will verify it.
- Game UI is more work than expected: Clay gives only layout.
- joltc cannot save physics state, it will be written in our own adapter.
- Strategy games (D23) add two large subsystems the plan did not count on so far: mass entity simulation and data-rich UI.

## Next step
0. On the Windows PC: clone the repo, install Visual Studio Build Tools and Claude Code, add the graphics card model to D75 (task NSO-620 in Linear).
1. The owner answers the three questions above.
2. On the owner's go, M0a starts (skeleton and CI). The tasks are in Linear.
3. In parallel, four gap research topics (D71). Light and sky must be done before M2.
