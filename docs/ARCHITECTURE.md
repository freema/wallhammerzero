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
| **3 Generators** | `eng_gen_tex`, `eng_gen_mesh`, `eng_gen_arch`, `eng_gen_world`, `eng_gen_char`, `eng_gen_audio`, `eng_gen_vfx` | **tier A:** pure functions `(recipe, seed) → data`. CPU only, no GPU or files. | M3, M7–M9 |
| **4 Resources and GPU** (seam) | `eng_asset` | VFS, resource DB, refcounted graph, IO queue, ports `asset_provider` and `gen_provider`, Merkle cache, uid registry and reverse dependencies, cache GC, bake and pack (D79) | M3a |
| | `eng_gpu` | RHI built from three portable concepts (D25), SDL_GPU backend and null | M1c |
| **5 Subsystems** | `eng_render` | render graph, forward+ with clusters (D27), passes, materials | M2 |
| | `eng_world` | cells, world shape port, archetypes, instances, actors, spatial queries, streaming, LOD | M4, M5, M7 |
| | `eng_sim` | simulation clock, `player_cmd`, mass entities, global graphs (roads, lane graph from the road generator) (D44, D46, D47, D79) | M1b, M4, M6 |
| | `eng_phys` (seam) | physics port, Jolt adapter (C++ only inside), null | M4b |
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
7. **Determinism tiers (D28):** a tier A target (`eng_gen_*`, the logic of `eng_sim`) must not link a tier B target (`eng_phys`, `eng_anim`, `eng_audio`). A generator reads only its explicit context struct: no cvars, clock or files (lint). A changed golden hash without a domain version bump fails CI. A local-stability test checks that a change inside a cell does not change output outside the cell and its margin. Cosmetic GPU scatter (grass, clutter) is a separate tier with no IDs, collision, edits or golden hashes (D79).
8. **Init** is a hand-written order in `eng_runtime`, and shutdown runs in reverse.

## Asset identity, cache and edits (D79)

Generated content needs the same machinery that shipped engines had to add late. These rules hold from M0c and M3a so that saves and edit files never have to be migrated because of them.

- **Identity is not a hash.** Every recipe, preset and authored world input has a `uid` (64-bit, assigned once). References go by uid, the file path is only for display. A content hash is a cache key, never an identity.
- **Rules have an immutable id** separate from the display name. The domain manifest keeps a rename map. Object IDs use the rule id (CONVENTIONS, chapter 4).
- **References are typed.** The `ref` field kind in `eng_types` (uid + target type) makes the dependency graph and the "where used" query (`wzctl deps`, `wzctl rdeps`) generic, with no hand-written code per type.
- **Explicit generator inputs.** Each generator gets one context struct with everything it may read. Everything in it enters the cache key.
- **Cache lifecycle.** Each entry records the producer fingerprint (generator, version, build). Writes are atomic (temporary file, rename, manifest last). `wzctl cache gc` evicts. `wzctl bake --region` and `wzctl pack` produce shippable data. A cache shared between machines only after the golden hashes are green on 3 OS.
- **Blast radius.** A generator commit declares its scope. A hash change outside the scope blocks the merge. This is the main guard against AI-written generator changes.
- **Output contract.** Every archetype declares its LOD chain, impostor distance, shadow-caster flag and separately cullable parts. CI rejects an archetype without them.
- **Hand edits survive regeneration:**
  1. anchors come from input space, never from the order of outputs (lint),
  2. ordered edit layers, plus keep-out and hand-authored zones as authored inputs,
  3. an edit that loses its target goes to a visible orphan queue, never silently away,
  4. drift detection against the stored absolute position,
  5. each cell stores the domain version it was built with; a cell can be frozen on an old version, with blending at the border,
  6. undo and preview work across regeneration.
- **Version bump report.** `wzctl world diff --domain` lists changed cells, orphans and drifted edits. The owner approves it.
- **Bounded work.** A player edit re-solves at most a declared neighbourhood of cells within a work budget.
- **Iteration.** Regeneration can be paused or limited to a region. A preview-quality parameter is excluded from golden hashes. A slider drag writes no cache entries and no edits.

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

## The seam for the game

The game DLL (`game.dylib`, `.so`, `.dll`) sees a single header, `eng_api.h`: a function table with a version number (world, input, audio, jobs, debugging). It exports `game_load`, `game_fixed_update` and `game_unload`. During development the DLL is reloaded without restarting the engine (hot reload). In a released game it is linked statically. There is no scripting language (D45). Game data are text tables loaded through the type registry.

## What is deliberately not done

- A generic ECS in the engine (the game may bring its own).
- Fibers (for now; the jobs API is shaped so they can be added).
- A fully GPU-driven renderer with bindless (SDL_GPU does not have it, D5).
- A port for every small use case, DI containers and mapping between a "domain" and an "infrastructure" model.
- Hot reload of the whole engine (only the game DLL and shaders). Reloading recipes and game data (recipe change → new hash → regenerate → swap the handle) is not engine hot reload and is allowed.
- A node-graph editor for generators. Code, the recipe trace and parameter panels replace it (D79).
