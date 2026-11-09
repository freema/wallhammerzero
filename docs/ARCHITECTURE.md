# Engine architecture

One map of modules and rules. It summarizes decisions D7, D25, D28, D30, D43–D46 and the research report [Open-world engine architecture](research/open-world-engine-architecture.md). Where the research report differs from this file, this file wins. The exact APIs (headers) are created together with the code.

Valid from 2026-11-06.

## The principle in one sentence

Layers after Gregory, enforced by CMake targets with one-way dependencies. Ports and adapters (hexagon) only at coarse seams: platform, GPU, assets, physics, audio and game code. Inside the layers, data-oriented design: dense arrays, generational handles, no generic ECS.

## Layers and modules

Each module is one CMake target `eng_<module>` with the folders `include/eng/` (public) and `src/` (private). A module may depend only on lower layers. Modules of the same layer do not link to each other. `eng_runtime` moves data between them.

| Layer | Modules | What they do | Milestone |
|---|---|---|---|
| **0 Base** | `eng_base` | types, assert, handle macros, inline vector math, atomics | M0a |
| **1 Platform** (seam) | `eng_platform` | the only place with SDL3: window, input, time, files and AsyncIO, threads, DLL loading | M0a |
| **2 Core** | `eng_core` | arenas, tagged heap, jobs, containers, SPSC queues | M1a |
| | `eng_log` | JSONL log, channels, `ENG_ASSERT`, `ENG_SCOPE`, crash handler | M0c |
| | `eng_cvar`, `eng_cmd` | settings and named commands (console, CLI, socket) | M0c |
| | `eng_types` | type registry: name, version, fields, serialization, JSON Schema (D43), `uid64` and the `ref` field kind (D79) | M0c, M1a |
| | `eng_prof` | Tracy, phase timers, counters, `stats.json` | M1b |
| | `eng_gen_core` | **tier A:** `detmath`, RNG, noise, `eng_cell_id`, world shape math | M0b |
| **3 Generators** | `eng_gen_tex`, `eng_gen_mesh`, `eng_gen_arch`, `eng_gen_world`, `eng_gen_char`, `eng_gen_audio`, `eng_gen_vfx` | **tier A:** pure functions `(recipe, seed) → data`. CPU only, no GPU or files. `eng_gen_arch` also emits the part graph `destruct_desc` (D80). | M2 (textures v0, D81), M3, M7–M9 |
| **4 Resources and GPU** (seam) | `eng_asset` | VFS, resource DB, refcounted graph, IO queue, ports `asset_provider` and `gen_provider`, Merkle cache, uid registry and reverse dependencies, cache GC, bake and pack (D79) | M3a |
| | `eng_gpu` | RHI built from three portable concepts (D25), SDL_GPU backend and null | M1c |
| **5 Subsystems** | `eng_render` | render graph, forward+ with clusters (D27), passes, materials | M2 |
| | `eng_world` | cells, world shape port, archetypes, instances, actors, spatial queries, streaming, LOD | M4, M5, M7 |
| | `eng_sim` | simulation clock, `player_cmd`, mass entities, global graphs (roads, lane graph from the road generator), structural graph and destruction events (D44, D46, D47, D79, D80) | M1b, M4, M6 |
| | `eng_phys` (seam) | physics port, Jolt adapter (C++ only inside), null, cosmetic debris layer (D80) | M4b |
| | `eng_audio` (seam) | mixer on top of miniaudio, voices, buses | M3d |
| | `eng_anim` | skeletons, clips, IK, springs | M9 |
| | `eng_ui` | Clay layout, own drawing, text, tables | M4c, M6 |
| | `eng_vfx` | particles and effects | M4c |
| **6 Runtime** | `eng_runtime` | mediator: init and shutdown order, frame loop, extraction protocol, `eng_api` for the game | M0c → M4 |
| **7 Tools** | `eng_tools`, `eng_debugsrv`, `eng_project` | tool registry (D30), debug server, projects | M0c, M1b |
| **Programs** | `wz`, `wz_studio`, `wzmcp`, `wzctl` | engine, studio (Dear ImGui), MCP, CLI | M0–M2 |
| **Game** | `projects/<game>/game` | game DLL, sees only `eng_api.h` | M4 |

Generators sit low and know nothing about the GPU or files. They reach the world through the `gen_provider` port in `eng_asset`. A cell can therefore come from a generator or from a pre-baked file in the same format (D8).

## Rules that hold the structure

1. **Dependency direction** is enforced by CMake and a lint in CI. A violation is a build error.
2. **Public headers** include only `eng/base/types.h` and the standard `<stdint.h>`, `<stdbool.h>`, `<stddef.h>`. Foreign types are forward-declared.
3. **SDL3** is linked only into `eng_platform`, `eng_gpu` and the programs. **C++** only in adapters (Jolt, Dear ImGui) behind a pure C header.
4. **Handles instead of pointers:** a 32-bit index and generation. A pointer does not survive a frame, and a handle is never stored in a save (CONVENTIONS, chapter 4).
5. **Memory:** the platform reserves arenas, and modules get an allocator in `init`. Nobody calls `malloc` directly.
6. **Every system has its own `save` and `load`** through the type registry. There is no global reflection and no root class.
7. **Determinism tiers (D28):** a tier A target (`eng_gen_*`, the logic of `eng_sim`) must not link a tier B target (`eng_phys`, `eng_anim`, `eng_audio`). A generator reads only its explicit context struct: no cvars, clock or files (lint). A changed golden hash without a domain version bump fails CI. Debris physics is excluded from tier A hashes (D80). A local-stability test checks that a change inside a cell does not change output outside the cell and its margin. Cosmetic GPU scatter (grass, clutter) is a separate tier with no IDs, collision, edits or golden hashes (D79).
8. **Init** is a hand-written order in `eng_runtime`, and shutdown runs in reverse.

## Asset identity, cache and edits (D79)

Generated content needs the same machinery that shipped engines had to add late. These rules hold from M0c and M3a so that saves and edit files never have to be migrated because of them.

- **Identity is not a hash.** Every recipe, preset and authored world input has a `uid` (64-bit, assigned once). References go by uid, the file path is only for display. A content hash is a cache key, never an identity.
- **Rules have an immutable id** separate from the display name. The domain manifest keeps a rename map. Object IDs use the rule id (CONVENTIONS, chapter 4).
- **References are typed.** The `ref` field kind in `eng_types` (uid + target type) makes the dependency graph and the "where used" query (`wzctl deps`, `wzctl rdeps`) generic, with no hand-written code per type.
- **Explicit generator inputs.** Each generator gets one context struct with everything it may read. Everything in it enters the cache key.
- **Cache lifecycle.** Each entry records the producer fingerprint (generator, version, build). Writes are atomic (temporary file, rename, manifest last). `wzctl cache gc` evicts. `wzctl bake --region` and `wzctl pack` produce shippable data. A cache shared between machines only after the golden hashes are green on 3 OS.
- **Blast radius.** A generator commit declares its scope. A hash change outside the scope blocks the merge. This is the main guard against AI-written generator changes.
- **Output contract.** Every archetype declares its LOD chain, impostor distance, shadow-caster flag and separately cullable parts. Destructible archetypes add the part list, the interior material per part and the number of damage states; the cullable parts are the `destruct_desc` parts (D80). CI rejects an archetype without them.
- **Hand edits survive regeneration:**
  1. anchors come from input space, never from the order of outputs (lint),
  2. ordered edit layers, plus keep-out and hand-authored zones as authored inputs,
  3. an edit that loses its target goes to a visible orphan queue, never silently away; a destruction state edit coarsens into a ruin of the whole building, never a silent rebuild (D80),
  4. drift detection against the stored absolute position,
  5. each cell stores the domain version it was built with; a cell can be frozen on an old version, with blending at the border,
  6. undo and preview work across regeneration.
- **Version bump report.** `wzctl world diff --domain` lists changed cells, orphans and drifted edits. The owner approves it.
- **Bounded work.** A player edit re-solves at most a declared neighbourhood of cells within a work budget.
- **Iteration.** Regeneration can be paused or limited to a region. A preview-quality parameter is excluded from golden hashes. A slider drag writes no cache entries and no edits.

## Destruction: state, not geometry (D80)

Destruction is stored as a small state per generated part, never as geometry. Research: [environment-destruction.md](research/environment-destruction.md).

1. **The authoritative state is `part uid → damage state`**, kept as a state edit `(cell, uid, state, impact, seed)` in the edit layers. Each cell has a policy: `persist`, `reset_after` or `rebuild_by_sim`.
2. **The building generator knows the structure.** `eng_gen_arch` emits `destruct_desc` next to the mesh: parts with a stable `uid64` from the building anchor and grammar path, material, role, fixed-point mass, convex pieces and ground anchors, and bonds with the shared face. The per-part state vector is an explicit generator input and part of the cache key. The part graph exists already in the LAYOUT cell state, so an event on an unloaded cell needs no meshes.
3. **Tier A decides what breaks** (`eng_sim`): canonical destruction events from `player_cmd` or the simulation, a hit test against the convex pieces, connectivity from the anchors in uid order and an optional fixed-iteration fixed-point stress solver. Tier A also chooses the rubble archetype and footprint at the moment of the event.
4. **Jolt only moves debris.** Debris is cosmetic (tier B1), lives in its own object layer, is never saved and never read by tier A. When it sleeps or its lifetime ends it is swapped for the rubble that tier A already chose.
5. **Only the rubble footprint** feeds navigation tiles, lane blocking, cover and saves.
6. **Damage ladder per part:** intact → cracked (shader mask) → breached (cut by the same grammar rule as window openings) → fractured (seeded convex clipping in `detmath`) → gone (rubble).
7. **The save delta is the network snapshot.** The event log is compacted into per-part states.
8. **Rendering without bindless:** a per-instance damage sphere slot and a vertex damage channel, swapped part meshes, instanced debris, HLOD and impostors regenerated after damage.
9. **Indestructible by default:** ground and foundations. Landmarks and zones are protected through keep-out inputs (D79).
10. **Terrain destruction** waits for voxel volumes (later). Blast is a reference design, not a dependency.

## Three classes of objects (D44)

| Class | Count | Storage | Example |
|---|---|---|---|
| Static instances | tens of thousands per cell | SoA arrays per cell, archetype + transform | buildings, lamps, trees |
| Actors | thousands | component managers with dense arrays, components registered by the game | player car, NPCs, doors |
| Mass entities | hundreds of thousands | dense tables, no physics, own 64-bit IDs | cars and pedestrians in a strategy game |

## One frame

```
platform: SDL events ──► input ──► player_cmd (tick N)
                                          │
simulation (fixed step, tier A):          ▼
  eng_sim tick ─► game DLL game_fixed_update ─► eng_phys step
                                          │
extraction (eng_runtime):                 ▼
  transform and instance changes ─► render world (FrameParams)
                                          │
render:                                   ▼
  culling ─► render graph ─► eng_gpu (SDL_GPU / null) ─► image
```

- **Simulation** runs at a fixed step and does not depend on rendering, audio or the camera. A headless run (`--gpu=null`) is a full mode, not a shortcut.
- **Input** to the simulation is only player commands (`player_cmd`). Replay, the AI agent and the future network use the same channel.
- **Threads:** the main thread owns the window and GPU submission. Jobs (`jobs_run`, `jobs_wait`) do generation, streaming and simulation batches. Audio has its own thread. Full work-stealing and running simulation N+1 in parallel with rendering N come in M10.
- **Streaming:** 256 m cells, six cell states, tickets by distance and speed, cancelling stale work by epoch. The parent LOD stays visible until the children arrive.

## Camera (D84, D89)

One free camera per view: a position in double, an orientation and a projection. No game type is built into it.

- **Rig definition and rig instance.** The definition is text data with the numbers. The instance holds state between frames (damped angles, occlusion timers, recentering). An instance can be reset, and is told when the target teleports or the origin shifts.
- **Rig types are engine code** (free fly, orbit, follow, strategy); data only tunes them. A project that needs another kind writes it in C against the same interface.
- **A camera director per view** holds the live rigs with priorities, cuts or blends between them, and takes an override for cinematics. Blending happens on target, yaw, pitch, distance and field of view.
- **Layers after the blend:** collision and occlusion, then shake. Shake never feeds back into rig state.
- **Inputs of a rig:** the target (position, velocity, orientation, local up, ground state), shaped player input and scene queries. Rig state is relative to the target and the projection is a rig output, so the same rigs work on a planet and in double precision.
- The studio uses the same mechanism with its own parameter sets. The module that holds the camera is settled with the code in M2.

## Review pages (D86, D88)

The owner approves visual results in two places that write the same record, `review/decisions.jsonl`: the studio (live tuning) and a review page (a phone, the second machine, a headless run).

- `wzctl review export` writes one self-contained static HTML page from a review set: renders, contact sheets, A/B pairs with the FLIP value, lint results and the recipe trace.
- **A verdict belongs to an item and the content hash of the exact render.** It has four states: `untriaged`, `approved`, `changes_requested`, `rejected`. A note can be pinned to a rectangle on the image.
- `wzctl review import` reads the verdicts back from a named return path (a verdict file or the host's stored state) that carries the review set id and a nonce. It refuses a verdict whose hash no longer matches the current render. `golden_accept` accepts only the approved hash.
- **Every row says who really acted:** the actor kind (owner, agent, automatic rule), the transport, and whether the transport proved the identity. A verdict that opens an owner gate or accepts a golden must come through a channel the agent cannot fill in alone; that channel is designed in M2, and until then such verdicts are listed back to the owner.
- **Platforms:** the owner approves the look on one reference configuration. Other platforms' goldens are accepted automatically within the calibrated FLIP threshold and recorded as automatic rows.
- **The log only grows.** The last row per item and hash wins, and a withdrawal is a new row.
- The engine knows only export and import. How the page reaches the owner (a file on disk, a Claude Artifact published by the agent, a static host) is outside the engine.
- The page is a report format. The engine and the game contain no JavaScript and no web runtime (D21).
- References from other games never go on the page. It has a slot that shows a file from the owner's disk without uploading it (D85).

## Guards (D87, D88)

Claude writes the code and the guards that check it, so the guards are protected from their author.

- **CI is the judge.** It computes `passes` of every milestone item, and runs every lint on a known-bad and a valid input.
- **Guard paths** are listed in one file: milestone items with their commands, thresholds and fixtures, budgets and baselines, CI workflows, `scripts/check`, the lint harness, the review script and brief, `CLAUDE.md`.
- **A ratchet.** A CI job run from the base branch reports every change in the guard paths. Tightening passes by itself; loosening or removing waits for the owner.
- **The second review (D83)** is one more filter, not a judge, and never a reason to relax a guard.

## Data files and the type registry (D90)

- **On disk:** our own line format with a written grammar, one strict parser and one canonical writer that keeps comments. Every file has a lossless JSON view for tools, JSON Schema and agents.
- **Strict reading:** an unknown key, a dangling reference and a duplicate uid are errors.
- **Three versions:** file syntax, type schema, generator (domain).
- **Uids are minted by a tool.** A reference carries the uid and a readable hint. Table rows are keyed by a readable name with a rename map.
- **The registry describes more than fields:** rename aliases, tombstones, converters, defaults, ranges, units, descriptions and usage flags. A changed default is a version bump with a migration. The registry dump is committed and CI checks it for drift.

## The seam for the game

The game DLL (`game.dylib`, `.so`, `.dll`) sees a single header, `eng_api.h`: a function table with a version number (world, input, audio, jobs, debugging). It exports `game_load`, `game_fixed_update` and `game_unload`. During development the DLL is reloaded without restarting the engine (hot reload). In a released game it is linked statically. There is no scripting language (D45). Game data are text tables loaded through the type registry.

## What is deliberately not done

- A generic ECS in the engine (the game may bring its own).
- Fibers (for now; the jobs API is shaped so they can be added).
- A fully GPU-driven renderer with bindless (SDL_GPU does not have it, D5).
- A port for every small use case, DI containers and mapping between a "domain" and an "infrastructure" model.
- Hot reload of the whole engine (only the game DLL and shaders). Reloading recipes and game data (recipe change → new hash → regenerate → swap the handle) is not engine hot reload and is allowed.
- A node-graph editor for generators. Code, the recipe trace and parameter panels replace it (D79).
