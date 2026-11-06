# Streaming procedurally generated worlds at runtime: generate → cache → load → upload → evict (shipped games and engines)

Research date: 2026-11-05. Scope: Wallhammer Zero (C17, SDL3/SDL_GPU, cells of 256 m, deterministic generator(seed, cell, LOD) on a work-stealing job system, disk cache by content hash, hierarchical generation region → district → cell → scatter tiles, edits as diffs keyed by stable hashed IDs, 200 km/h flight and orbit-to-ground). No Man's Sky is covered by another researcher.

Source quality: the Minecraft numbers come from decompiled 1.21.11 source and minecraft.wiki. Luanti numbers come from the engine's own `settingtypes.txt` and `lua_api.md` (master branch, fetched 2026-11-05). The Unreal PCG and PSO numbers come from Epic's official docs. Horizon Zero Dawn numbers come from the GDC 2017 slides. Valheim numbers are community-documented (wiki and mods), not from the developers.

---

## 1. Minecraft (Java) chunk system: stages, neighbour radii, tickets, threading, storage

### Takeaway
Minecraft generates a chunk as a staged state machine (a "proto-chunk" advances status by status). Each step declares which earlier status it needs and at what neighbour radius. Mojang encodes this as an explicit dependency "pyramid" (`ChunkPyramid` / `ChunkStep`, 1.21+). The only wide dependency is "structure starts within 8 chunks". Everything else needs 0–1 chunk of neighbours. Loading priority is a distance field: "tickets" place levels that grow by 1 per chunk. A chunk's level decides whether it is fully simulated, only accessible, or only allowed to generate. Main-thread stalls were solved mostly by community rewrites (Starlight, then Paper/Moonrise's chunk system and C2ME). Their key enabler was making stages stateless and parallel-safe.

### Cited Findings
**Stages (Java Edition, current):**
- The generation steps in order are: empty → structure_starts → structure_references → biomes → (noise, surface, carvers, which the wiki describes together as "terrain") → features → initialize_light → light → spawn → full. — [minecraft.wiki: World generation](https://minecraft.wiki/w/World_generation)
- "Incomplete chunks that are temporarily frozen at a step are called proto-chunks". The "level chunks" are the ones ready for players. The game may freeze chunks far from players at an early step and resume them as a player approaches. At `full` the proto-chunk becomes a level chunk, and block updates deferred in earlier steps run. — [minecraft.wiki: World generation](https://minecraft.wiki/w/World_generation)
- Chunks are 16×16 blocks wide and span the full height (overworld 384 blocks = 98,304 blocks per chunk), divided into 16-block-tall sections. — [minecraft.wiki: Chunk](https://minecraft.wiki/w/Chunk)

**Exact neighbour dependency radii (decompiled `ChunkPyramid.GENERATION_PYRAMID`, MC 1.21.11):** — [decompiled source mirror, ChunkPyramid.java](https://github.com/RecaniteButOnGit/Minecraft-1.21.11/blob/main/server/world/level/chunk/status/ChunkPyramid.java)
- STRUCTURE_STARTS: no requirement (task `generateStructureStarts`)
- STRUCTURE_REFERENCES: requires STRUCTURE_STARTS at radius **8**
- BIOMES: requires STRUCTURE_STARTS at radius 8
- NOISE: requires STRUCTURE_STARTS at radius 8 and BIOMES at radius **1**; `blockStateWriteRadius(0)`
- SURFACE: requires STRUCTURE_STARTS at radius 8 and BIOMES at radius 1; write radius 0
- CARVERS: requires STRUCTURE_STARTS at radius 8; write radius 0
- FEATURES: requires STRUCTURE_STARTS at radius 8 and CARVERS at radius **1**; **`blockStateWriteRadius(1)`**, so features may write blocks into the 8 neighbouring chunks
- INITIALIZE_LIGHT: no extra requirement
- LIGHT: requires INITIALIZE_LIGHT at radius 1
- SPAWN: requires BIOMES at radius 1
- FULL: no extra requirement
- A separate `LOADING_PYRAMID` is used when chunks are loaded from disk rather than generated. Its STRUCTURE_STARTS task is `loadStructureStarts`, and only LIGHT keeps a radius-1 requirement. Loading saved chunks needs a much smaller neighbourhood than generating them. — same source
- Each `ChunkStep` stores `targetStatus`, `directDependencies`, `accumulatedDependencies`, `blockStateWriteRadius` and `task`. The builder computes accumulated (transitive) dependencies. This exists in 1.21, 1.21.5, 1.21.11 and the 25w snapshots. — [mappings.dev ChunkStep 1.21.11](https://mappings.dev/1.21.11/net/minecraft/world/level/chunk/status/ChunkStep.html)
- An older (2018, 1.14-era) Spigot issue shows that requesting a chunk at FULL can promote its neighbours to earlier stages, because features and structures extend across adjacent chunks. — [SPIGOT-4862](https://hub.spigotmc.org/jira/si/jira.issueviews:issue-html/SPIGOT-4862/SPIGOT-4862.html)

**Ticket and level system (loading priority):**
- Levels: ≤31 = entity ticking (everything available), 32 = block ticking ("lazy"), 33 = border (accessible, no simulation), ≥34 = inaccessible, but world generation happens there. Regular gameplay uses 22–44, and levels above 44 unload instantly. Levels propagate from a ticket's source chunk, increasing by 1 per chunk step, and "only the lowest level matters". — [minecraft.wiki: Chunk](https://minecraft.wiki/w/Chunk)
- Tickets have a level, a radius and a lifetime:

  | Ticket | Level | Radius | Timeout |
  |---|---|---|---|
  | player spawn | 30 | 3 | 1 s, refreshed |
  | dragon | 24 | 9 | none |
  | player loading | 31 | n/a | none |
  | forced | 31 | n/a | persisted |
  | portal | 30 | 3 | 15 s, persisted |
  | ender pearl | n/a | n/a | 2 s, refreshed |
  | unknown | n/a | n/a | 1 tick, issued when data is needed before a chunk reaches a required step |

  — [minecraft.wiki: Chunk](https://minecraft.wiki/w/Chunk)
- Entity-ticking area side = min(2s+1, 63) and block ticking = min(2s+3, 65) chunks, where s = simulation distance. — [minecraft.wiki: Chunk](https://minecraft.wiki/w/Chunk)

**Threading and stall avoidance (community rewrites):**
- Starlight (light engine rewrite) measured ~28× faster than vanilla on glowstone remove, ~12× on glowstone place, and ~13×/~37× on block remove/place at y=254 (1.20-rc1, Ryzen 9 7950X). A key trick is to initialise light data only within 1 section of a non-empty section, so empty air sections are skipped. — [Starlight TECHNICAL_DETAILS.md](https://github.com/PaperMC/Starlight/blob/fabric/TECHNICAL_DETAILS.md)
- Starlight's README says its "stateless" light design lets the chunk system run light work in parallel, which is "critical to allowing the chunk system to scale beyond 10 worker threads". It links this to the 1.19 Folia patch "Increase parallelism for neighbour writing chunk statuses". The repo was archived on 2024-03-08, and work continues in Moonrise. — [Starlight README](https://github.com/PaperMC/Starlight)
- Moonrise (Fabric/NeoForge port of Paper's chunk system, which contains the official continuation of Starlight) optimises chunk loading, generation and saving. It lowers the default worker thread count on low-core systems ("trading chunk loading speed for stability") and is configured via `config/moonrise.yml`. It is incompatible with C2ME because both replace the chunk system. — [Moonrise GitHub](https://github.com/Tuinity/Moonrise)
- C2ME ("Concurrent chunk management engine") parallelises chunk generation, I/O and loading across cores. Its modules include `rewrites-chunk-system`, `rewrites-chunkio`, `opts-scheduling`, `threading-lighting`, `opts-worldgen-biome-cache`, native math and OpenCL acceleration. It ships `CheckedThreadLocalRandom` to detect mods misusing the world random. Its README states that vanilla world generation is non-deterministic, so worlds "will vary significantly run-to-run even with the same seed". — [C2ME README](https://github.com/RelativityMC/C2ME-fabric)

**Storage of generated chunks (region / Anvil files):**
- One file holds 32×32 chunks (1024 chunks, 512×512 blocks) in 4 KiB sectors. The header is two 4 KiB tables: 1024 big-endian location entries (3-byte sector offset plus 1-byte sector count) and 1024 timestamps. The maximum in-file chunk is 255 sectors = 1020 KiB. Larger chunks spill to `c.x.z.mcc` with the compression byte +128. Compression: 2 = zlib (the client default), 3 = none, 4 = LZ4 (since 24w04a), 127 = custom (since 24w05a). Anvil `.mca` replaced `.mcr` in 1.2.1. — [minecraft.wiki: Region file format](https://minecraft.wiki/w/Region_file_format)
- Chunk NBT stores a generation `Status` (features, carvers, light and so on), so partially generated proto-chunks are saved and resumed. — [Minecraft Wiki (Fandom): Chunk format](https://minecraft.fandom.com/wiki/Chunk_format)

### Inferences
- Accumulated radius, my calculation: a FULL chunk transitively needs FEATURES on itself and LIGHT on radius 1. LIGHT needs neighbours at INITIALIZE_LIGHT, which implies FEATURES at radius 1, then CARVERS at radius 2, then STRUCTURE_STARTS at radius 2+8 = 10. That is about 10–11 chunks (~160–176 blocks) of partially generated ring around every fully generated chunk. This matches the wiki's level range: FULL/border at 33 and max level 44, so 11 levels of "generation-only" ring. Keep the analogous ring for Wallhammer Zero's (WZ) hierarchy explicit and small. "Region reads within fixed radius" is the same pyramid idea, and WZ should compute the accumulated pyramid at startup and prefetch the coarse levels for the whole ring.
- Minecraft's `blockStateWriteRadius(1)` for features means that features write into neighbours. This forces neighbour locking and order-dependent results, and C2ME reports non-determinism in vanilla. WZ's design is better: each level reads only coarser levels and each cell writes only to itself, which gives order-independence and safe parallelism. If scatter objects must cross cell borders, generate them from the coarser parent level (owner = the cell containing the anchor point) and let neighbours query them read-only.
- The ticket/level distance field is a clean scheduling abstraction to copy. Every interested system (player, camera, predicted position, teleport target, scripted event) adds a ticket with level and radius, and a cell's state target is min(level). The state machine is then: unloaded → coarse-generated → fine-generated → meshed → GPU-resident → simulated.
- Separate generation and loading pyramids are a cheap win. Loading cached or cooked output needs no neighbour ring.

### Gaps
- No primary Mojang write-up of the 1.14 chunk system rewrite (worker pool sizes, mailbox/`ProcessorMailbox` design). Not found in this pass.
- Moonrise/Paper's priority-scheduler internals (priority classes, thread counts) are not documented in the README. The details are in the source only.
- No benchmark numbers for C2ME speedups in its README.

---

## 2. Other generated-world engines

### Takeaway
The recurring pattern: a fixed generation unit larger than the storage or streaming unit (Luanti mapchunk 80³ vs mapblock 16³; Vintage Story map region 16×16 columns vs 32³ chunks). Generation is split into passes that are flagged by neighbour need. One "emerge" API returns a cell from memory, disk or generator, with bounded queues and cancellation. Persistence ranges from "save everything generated" (Minecraft, Luanti, Valheim) to "save only modified objects, regenerate the rest from seed" (Space Engineers procedural asteroids, 2014).

### Cited Findings
**Luanti (Minetest), from engine docs, master branch, 2026:**
- A mapblock (16×16×16 nodes) is the unit stored in the DB, sent to clients and handled by the engine. A mapchunk is normally 5×5×5 mapblocks = 80×80×80 nodes and "is the volume of world generated in one operation by the map generator… chosen to optimize map generation". — [Luanti lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md)
- `chunksize` defaults to 5 (range 1–10) with the warning: "There is no benefit, and there are several dangers, in increasing this value above 5. Reducing this value increases cave and dungeon density." The generation unit size therefore leaks into the output, so the generator is not invariant to chunk size. — [Luanti settingtypes.txt](https://github.com/luanti-org/luanti/blob/master/builtin/settingtypes.txt)
- "Emerging" means loaded from disk, or generated, or (in some cases) created empty. `core.emerge_area(pos1,pos2,cb)` queues blocks "to be asynchronously fetched from memory, loaded from disk, or if inexistent, generates them". The callback reports `EMERGE_FROM_MEMORY`, `EMERGE_FROM_DISK`, `EMERGE_GENERATED`, `EMERGE_CANCELLED` (shutdown, already being emerged, outside limits) or `EMERGE_ERRORED`. — [Luanti lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md)
- `on_generated(vmanip, minp, maxp, blockseed)` runs after the core mapgen finishes a chunk and before it is written to the map. The VoxelManip covers a larger emerged area than `minp..maxp` (an overgeneration shell). The `blockseed` is a u32 derived from block position and the u64 world seed. The mapgen environment (on worker threads) cannot touch the rest of the map, has no node metadata, and passes results to the main environment via "gennotify". — [Luanti lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md)
- Default settings: `max_block_generate_distance` = 10 mapblocks (160 nodes), `max_block_send_distance` = 13 mapblocks, `active_block_range` = 4 mapblocks (simulation), `viewing_range` = 200, `server_unload_unused_data_timeout` = 29 s, `server_map_save_interval` = 5.3 s, `client_mapblock_limit` = 9300, `max_simultaneous_block_sends_per_client` = 50, `block_send_optimize_distance` = 4. — [Luanti settingtypes.txt](https://github.com/luanti-org/luanti/blob/master/builtin/settingtypes.txt)
- Emerge queue bounds: `emergequeue_limit_total` = 1200 blocks, `emergequeue_limit_diskonly` = 150 per player, `emergequeue_limit_generate` = 150 per player. `num_emerge_threads` = 0 means automatic, with the warning "There are known bugs in the default map generators (v6, v7, ...) when using more than 1 thread. The automatic choice will avoid this." — [Luanti settingtypes.txt](https://github.com/luanti-org/luanti/blob/master/builtin/settingtypes.txt)
- Loaded ≠ active: blocks are loaded in a broad area and active (entities, ABMs, timers) in a smaller one. "There is **no** guarantee that an active mapblock has already been filled by the map generator." — [Luanti lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md)

**Vintage Story (official modding wiki, 1.19-era):**
- A chunk is 32×32×32. A chunk column is a vertical stack (256 height = 8 chunks). A map chunk holds per-column 2D data (rain height, snow). A map region covers 16×16 chunk columns and holds "weather and maps required for world generation". — [VS wiki: WorldGen Concept](https://wiki.vintagestory.at/index.php/Modding:WorldGen_Concept)
- Passes (`EnumWorldGenPass`): Terrain (rock strata, caves; **no** neighbours needed) → TerrainFeatures (deposits, structures, ponds; needs neighbours) → Vegetation (patches, trees, in-chunk sunlight; needs neighbours) → NeighbourSunLightFlood (snow, light into neighbours; needs neighbours) → PreDone (creatures spawn; neighbours may still add content) → Done. — [VS wiki: WorldGen Concept](https://wiki.vintagestory.at/index.php/Modding:WorldGen_Concept); [VS API EnumWorldGenPass](https://apidocs.vintagestory.at/api/Vintagestory.API.Server.EnumWorldGenPass.html)

**Space Engineers (Marek Rosa dev blog, 2014-12-17):**
- Procedural asteroids are generated "at the moment they are required" (player nearby, or a floating object collides). A generated asteroid stores only a noise seed and position. Its voxels are not kept in memory after insertion into physics. Unaltered asteroids are dropped and later re-created with "the exact same shape". Only shape or material changes are made permanent. Storing asteroids as a noise function cuts save and load times. — [Marek Rosa blog 2014-12](https://blog.marekrosa.org/2014/12/space-engineers-super-large-worlds_17/)
- The new multi-level LOD system lets distant asteroids "request coarse, faster generation". An "asteroid field generator" allocates and frees asteroids as the player travels. The world is split into physics clusters of at least 20 km (typically 50–100 km), with 64-bit object positions and 32-bit Havok physics. — [Marek Rosa blog 2014-12](https://blog.marekrosa.org/2014/12/space-engineers-super-large-worlds_17/)
- In contrast, Space Engineers (1) planets are pre-built voxel models with no procedural generation per game. — [Space Engineers wiki: Planets](https://spaceengineers.wiki.gg/wiki/Planets)

**Valheim (community sources only):**
- The world is split into 64×64 m zones. 5×5 zones load around each player, loaded with staggering. Generated zones include objects and terrain, and spawners run only in "active" zones (~96 m cardinal / 136 m diagonal from zone centre). The game tracks per-zone last-activity time so it can catch up when a zone becomes active again. — [Valheim Fandom wiki: Zones](https://valheim.fandom.com/wiki/Zones) (fetched via search summary; the page returned HTTP 402 on direct fetch)
- The Render Limits mod exposes separate generated, loaded and active zone counts. The Upgrade World mod's glossary says the world generator creates content up to 500 m from visited places. Upgrade World exists to regenerate or upgrade already-generated areas, which suggests generated zone content is saved rather than regenerated. That last point is inferred, not stated by the developers. — [Render Limits (Thunderstore)](https://thunderstore.io/c/valheim/p/JereKuusela/Render_Limits/v/1.15.0/); [Upgrade World (Thunderstore)](https://thunderstore.io/c/valheim/p/JereKuusela/Upgrade_World/v/1.3.1/)

**Enshrouded (Keen Games, Holistic engine):**
- The in-house voxel engine (Vulkan) is described as "fully dynamic". A Graphics Programming Conference talk "Vulkan in Enshrouded" (Jakub Kolesik) mentions a "handcrafted voxel engine" built by a small team. No public streaming details. — [Khronos GPC listing](https://www.khronos.org/events/graphics-programming-conference); [PCGH 1.0 tech test](https://www.pcgameshardware.de/Enshrouded-Spiel-74267/Specials/1-0-Technik-Test-Benchmarks-Release-1556566/)

### Inferences
- Luanti's `emerge_area` is exactly the interface WZ needs: `request(cell, lod, ticket) → {from_memory | from_cache | from_pack | generated | cancelled | error}`. "Cancelled" is a normal non-error outcome. Bounded per-source queues (disk-only vs generate) stop generation from starving disk loads, and vice versa.
- Luanti's chunksize warning is a cautionary tale. If generation-unit size changes the output, then the cell size becomes part of the generator version. WZ should make generator output depend only on (seed, world position, LOD), never on job granularity, and hash `cell_size` into the cache key if it can change.
- Vintage Story's map region (16×16 columns of 2D climate and maps) is the same as WZ's "region/district" levels. Region data is small 2D maps, cheap to generate first for a large radius.
- Space Engineers 2014 is the canonical "don't store what you can regenerate" design. It only works if generation is fully deterministic and stable across versions (see section 6).

### Gaps
- Hytale: no public technical streaming or worldgen documentation was found in this pass.
- Teardown, Astroneer, Dual Universe: not researched in this pass (tool-call budget). No primary sources collected.
- Valheim: no developer (Iron Gate) primary source found. Figures are community-documented, and the version is unclear.
- Space Engineers save format for voxel deltas (storage granularity, e.g. per-octree-node): not found.
- Vintage Story: no dev-blog source on worldgen threading or scheduling.

---

## 3. Scheduling patterns (priority, cancellation, budgets, fine-grained jobs, logical vs visual, GPU upload, PSO hitches)

### Takeaway
Shipped schedulers prioritise by distance plus view direction, with frustum awareness, and add hysteresis: cleanup radius > generation radius. They bound in-flight work (concurrent-job caps, queue limits), pool the runtime objects, and keep a per-frame main-thread budget for integration. Separately from CPU generation, the biggest hitch source on modern APIs is first-use pipeline (PSO) compilation. The fix is to precompile when content is requested, not when it is first drawn, and to defer drawing (or substitute a fallback material) until the pipeline is ready.

### Cited Findings
**Unreal Engine PCG runtime generation (official docs, UE 5.5+):**
- Components are generated or cleaned up near "Generation Sources" (player controllers, World Partition streaming sources, custom source components, editor viewport). Radii are set per partition grid size (Runtime Generation > Generation Radii). Each grid size's radius should be larger than the next smaller one's. Cleanup happens at generation radius × **Cleanup Radius Multiplier** (hysteresis). — [UE docs: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- The default scheduling policy prioritises by distance and view direction, favouring components in front of and near a source. In 5.5 the "HiGen Grid Size Exponential" increased the weight of view direction. Optional frustum culling has Generate and Cleanup bounds modifiers, with cleanup ≥ generate. — same
- Hierarchical generation: data cascades from larger to smaller grids only, never the reverse. A node with inputs from several grid sizes runs on the smallest. "Unbounded" runs once per component. Passing data down can duplicate points across partitions, which "Cull Points Outside Actor Bounds" fixes. — same
- Defaults: `pcg.RuntimeGeneration.NumGeneratingComponents` = **16** in parallel; `pcg.RuntimeGeneration.EnablePooling` = on with `BasePoolSize` = **100** partition actors; `FramesBetweenGraphSchedules` = 0; `pcg.FrameTime` = **16.667 ms** per-frame PCG budget (50 ms in editor). Lowering parallelism changes effective priority, because parallel completion order is not guaranteed. — same

**Horizon Zero Dawn GPU procedural placement (Guerrilla, GDC 2017, Jaap van Muijden):**
- All nature is placed procedurally at runtime around the player: 500+ asset types, 100,000+ objects in scene, **~250 µs average GPU busy load**. Design goals: data-driven, **deterministic, locally stable**, art-directable. It started on CPU and moved to GPU. — [GDC 2017 slides (PDF)](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)
- Inputs are "WorldData": 2D maps, "streamed in sections", all generated and all paintable, about **4 MB/km²**. Resolutions are 0.5 m (heights, erosion, roads, water: 16-bit / BC6U / BC7) to 1–2 m (placement densities, ecotopes: BC7). — same
- Pipeline: graph → flattened layers → DENSITYMAP → GENERATE (one sample per GPU thread: range test, threshold test, position, normal; ~10 µs per dispatch) → PLACEMENT (~7 µs) → point cloud (Mat3x4) copied to CPU memory. The pipeline is instantiated 64 times, interleaved to avoid flushes. — same
- Scope goes beyond rocks and trees: "sounds, effects, wildlife and game-play elements" are placed the same way, assembling the environment "while the player walks through them". — [Guerrilla talk page](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)

**Minecraft / Luanti queue control:**
- Luanti caps the emerge queue at 1200 total and 150 generate + 150 disk per player. Requests can come back `CANCELLED` (for example "already being emerged"). — [Luanti settingtypes.txt](https://github.com/luanti-org/luanti/blob/master/builtin/settingtypes.txt); [lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md)
- Minecraft's "unknown" ticket lives 1 tick and "expires during the chunk source tick even if not fully loaded". Short-lived tickets are how obsolete requests get dropped. — [minecraft.wiki: Chunk](https://minecraft.wiki/w/Chunk)
- Luanti's `full_block_send_enable_min_time_from_building` = 2.0 s delays sending blocks near where players build. — [Luanti settingtypes.txt](https://github.com/luanti-org/luanti/blob/master/builtin/settingtypes.txt)

**Logical vs visual separation:**
- Luanti's mapgen thread env has no node metadata and cannot access the map outside the chunk. Logical side-data (for example dungeon loot positions) goes back through `save_gen_notify`/gennotify to the main env. — [Luanti lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md)
- HZD places gameplay elements (pickups, natural resources, stealth plants, destructibility regions) through the same deterministic placement maps as visuals, for example `Placement_PickUps` and `Placement_Natural_Resources` at 2.0 m. — [GDC 2017 slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)

**PSO / pipeline creation hitches (UE official docs):**
- A draw blocks if its PSO is not compiled. Misses in Insights produced 5–10 ms hitches, and one reached **117 ms**. The default hitch-report threshold is 20 ms. Even driver-cache hits on first use "can take a long time" (a few ms). — [UE docs: PSO Precaching](https://dev.epicgames.com/documentation/en-us/unreal-engine/pso-precaching-for-unreal-engine)
- Fix: components collect their PSOs at load time (PostLoad) and compile asynchronously on background threads (pool = 75% of hardware threads, minimum 2; up to 2 GB per compiling thread). Proxy creation is delayed until the PSO is ready (default), or a default material is substituted (`r.PSOPrecache.ProxyCreationDelayStrategy=1`). Loading screens wait until `NumPrecompilesRemaining()` == 0. Test with `-clearPSODriverCache` and with the game limited to 8 cores. — same

### Inferences
- **Arithmetic for WZ:** 200 km/h = 55.6 m/s, so one 256 m cell is crossed every 4.6 s. If the end-to-end latency L (generate → cache write → mesh → upload → PSO ready) is, say, 1–2 s on a cold cache, the "must be ready" ring must lead the player by ≥ v·L + one cell (≈ 110 + 256 m). Keep the generation ring at least 2–3 cells ahead along the velocity vector. Use a predicted position (p + v·t_lookahead) as an extra ticket source, as Minecraft adds tickets and UE adds generation sources.
- **Priority key suggestion:** priority = f(state-distance from the needed state, distance to the nearest ticket source, angle to view/velocity direction, LOD level). Coarse LOD first: never schedule fine LOD for a cell until its coarse LOD (and its coarse parents within the radius) are resident. That is the UE rule "data cascades larger → smaller" plus the Minecraft pyramid.
- **Cancellation:** jobs should check a per-cell generation counter or epoch at stage boundaries and drop out if the cell's target state fell below what the job produces. Treat "cancelled" as normal (Luanti). Bounded in-flight caps (UE 16 components; Luanti 150 per class) keep the work-stealing pool responsive and stop a flood of stale far jobs from delaying near ones.
- **Main-thread budget:** only integration (handing results to the world, registering IDs, GPU upload submission) touches the main thread, under a ms budget. UE's PCG default of 16.667 ms is effectively "a whole frame" and is too generous for a hitch-free 60+ fps target. WZ should aim for ≈ 1–2 ms main-thread integration plus a byte cap for uploads per frame. Those numbers are my design suggestion, not sourced.
- **GPU vs CPU scatter:** HZD shows that dense scatter (100k+ instances) can be regenerated on GPU every time for ~0.25 ms of GPU time. Storing it costs more than regenerating it. WZ's "scatter tiles" level could be GPU compute driven by CPU-generated, cached density maps (~4 MB/km² in HZD), which makes the disk cache unnecessary for that level.
- **PSOs:** in a generated world the set of materials and pipelines is finite and known from the generator's asset palette. Compile all of them during boot or loading (SDL_GPU `SDL_CreateGPUGraphicsPipeline` for every material × vertex-format permutation used by the generator). Never create pipelines lazily on cell arrival.

### Gaps
- No primary source with concrete per-frame GPU upload budgets (MB/frame) from a shipped generated-world game was found in this pass.
- No public scheduler details for Minecraft's vanilla worker pool, Moonrise priorities, or Enshrouded.

---

## 4. LOD for generated content (coarse first, macro-only distance, impostors and HLOD, coarse/fine consistency)

### Takeaway
Shipped systems generate cheap coarse representations far away (Space Engineers' "coarse, faster generation" for distant asteroids; UE PCG hierarchical grid sizes with larger radii for larger grids; Minecraft keeping distant chunks frozen at early statuses). Consistency comes from determinism plus "local stability": the same seed and inputs at the same location give the same result regardless of what else is generated. Coarse levels act as the authoritative input to fine levels.

### Cited Findings
- Space Engineers: "when generating geometry for procedural asteroids at a distance, the game requests only coarse low-detail procedural generation". The LOD system has many levels. — [Marek Rosa blog 2014-12](https://blog.marekrosa.org/2014/12/space-engineers-super-large-worlds_17/)
- UE PCG: radii per hierarchical grid size, where each larger grid needs a larger radius than the next smaller one. Data flows only from larger to smaller grids. — [UE docs: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- Minecraft keeps far chunks as proto-chunks frozen at an early status (for example structure starts or biomes) and advances them as players approach. The ≥34 "inaccessible" ring exists purely for generation. — [minecraft.wiki: World generation](https://minecraft.wiki/w/World_generation); [minecraft.wiki: Chunk](https://minecraft.wiki/w/Chunk)
- HZD lists "Deterministic" and "Locally stable" as explicit placement goals. — [GDC 2017 slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)
- Distant Horizons (Minecraft mod, since 2020) "renders simplified chunks outside of the normal render distance". No technical details are on its landing page. — [Distant Horizons GitLab](https://gitlab.com/distant-horizons-team/distant-horizons)
- Luanti: `chunksize` changes cave and dungeon density, so the generator is not invariant to its work unit. This is an anti-example for coarse/fine consistency. — [Luanti settingtypes.txt](https://github.com/luanti-org/luanti/blob/master/builtin/settingtypes.txt)

### Inferences
- **Monotone refinement rule for WZ:** LOD k+1 = LOD k + detail, where detail is a function of (seed, position, k+1) and the coarser data. Never re-derive macro features at fine LOD with a different sample pattern. Sample macro fields (heightfield, biome, road graph) once at their native resolution and store them in the coarse-level cache. Fine LODs read the identical stored values, or evaluate the same function at the same coordinates, so coarse and fine agree at shared vertices.
- **Distant cells at macro level only:** for orbit-to-ground, keep a quadtree or cube-sphere of region-level data (heights and colours, a few MB per region). Request district or cell levels only when screen-space error demands it. Space Engineers' and Minecraft's "generate the cheap part far away" both support this.
- **Impostors/HLOD from generated data:** I found no primary source in this pass describing a shipped game that bakes HLOD or impostors from runtime-generated content. Treat this as a design proposal: bake per-district HLOD meshes and impostor atlases as an extra cached output keyed by (generator version, seed, district, LOD).

### Gaps
- No primary sources found for runtime HLOD or impostor generation from procedural content. No Man's Sky is covered by another researcher.
- Distant Horizons' generation modes and SQLite storage were not confirmed (its README and docs were not fetched).

---

## 5. Caching (keys, invalidation, cache vs regenerate, memory budgets and eviction)

### Takeaway
Shipped games mostly persist generated output into the save (Minecraft region files, Luanti map DB, Valheim world file). As a result they cannot pick up generator improvements in already-visited areas without explicit tools. The alternative of regenerating unmodified content (Space Engineers asteroids, HZD placement every time) avoids storage and versioning trouble but costs CPU or GPU at each revisit. Eviction is time- and distance-based with grace periods (Luanti 29 s unload timeout; Minecraft ticket timeouts and level > 44 unload).

### Cited Findings
- Minecraft stores every generated chunk (including partial-status proto-chunks) in 32×32-chunk region files with 4 KiB sectors and per-chunk timestamps. zlib is the default compression, and LZ4 is selectable since 24w04a. — [minecraft.wiki: Region file format](https://minecraft.wiki/w/Region_file_format)
- Luanti saves all emerged blocks to the world DB. Unused blocks unload after `server_unload_unused_data_timeout` = 29 s ("Higher value is smoother, but will use more RAM"). Important changes are saved every 5.3 s. The client keeps ≤ 9300 mapblocks by default. — [Luanti settingtypes.txt](https://github.com/luanti-org/luanti/blob/master/builtin/settingtypes.txt)
- Space Engineers drops unmodified asteroid voxels from memory and regenerates them identically on revisit. It persists only seed, position and modifications. — [Marek Rosa blog 2014-12](https://blog.marekrosa.org/2014/12/space-engineers-super-large-worlds_17/)
- HZD does not store placement output. It regenerates from ~4 MB/km² of streamed 2D WorldData at ~250 µs GPU on average. — [GDC 2017 slides](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf)
- UE PCG pools runtime partition actors (100 by default) to avoid allocation churn. — [UE docs: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- Minecraft levels give natural hysteresis: chunks above level 44 unload, while the levels between border (33) and 44 keep generation-only data. Tickets carry timeouts (1 s to 15 s), so recently needed areas stay warm briefly. — [minecraft.wiki: Chunk](https://minecraft.wiki/w/Chunk)

### Inferences
- **Cache key for WZ:** `H(generator_version, generator_params_hash, seed, level, cell_coords, lod, cell_size, output_kind)`. Also include the hashes of the coarse inputs consumed (a Merkle-style key), so a change in a region generator automatically invalidates its dependent districts and cells, and nothing else.
- **Cache vs regenerate:** cache when regeneration cost per byte is high and the output is compact (erosion-simulated heightfields, road networks, district layouts, cooked meshes needing heavy CPU work). Regenerate when output is large and cheap to make (dense scatter: HZD's 100k objects at 0.25 ms GPU; noise-only voxels: Space Engineers). A rule of thumb (my suggestion): cache if `gen_time > disk_read_time(size) × ~5`. At NVMe ~2–3 GB/s, 1 MB reads in ~0.5 ms, so anything taking > ~3 ms per MB is worth caching.
- **Memory budget and eviction:** LRU keyed on distance-weighted last-needed time, with pin counts from tickets (any ticket keeps a cell pinned) and a grace timeout (Luanti 29 s; Minecraft 1–15 s per ticket type). Evict GPU-resident data (largest) first, then decoded CPU data, and keep compressed cache blobs longest. On 24 GB unified memory, set separate budgets for GPU-resident cells, CPU-decoded cells and compressed in-RAM cache.
- **Cache file layout:** Minecraft's 32×32 region file with a sector table is a good, simple pattern: few file handles, 4 KiB aligned, per-entry timestamps for invalidation, and an overflow file for big entries. A content-addressed WZ cache could use the same "pack of N×N cells + header table + per-entry hash" layout.

### Gaps
- No primary source found for shipped games that keep a separate, invalidatable generation cache distinct from the save (all examples found either persist into the save or regenerate).
- No concrete memory-budget numbers from shipped generated-world games beyond Luanti's client block limit.

---

## 6. Deltas and persistence (edits over generated data, ID stability, generator version changes)

### Takeaway
Two shipped strategies. (a) Persist generated output, which freezes visited areas: generator updates only affect new terrain, and visible seams appear at borders (Minecraft and Valheim need explicit regeneration tools or mods). (b) Persist only edits over regenerated output (Space Engineers asteroids), which needs bit-exact deterministic generation across versions. Luanti adds a useful versioning primitive: per-block "last active" timestamps plus per-LBM introduction timestamps, so new post-processing runs once on old blocks when they next load.

### Cited Findings
- Space Engineers persists only shape or material changes to procedural asteroids. The rest is regenerated from seed and position with "the exact same shape". — [Marek Rosa blog 2014-12](https://blog.marekrosa.org/2014/12/space-engineers-super-large-worlds_17/)
- Luanti LBMs: each mapblock has a "last active" timestamp (also set at generation), and each LBM has an introduction timestamp stored in world data. On activation, "only LBMs whose introduction timestamp is newer than the mapblock's timestamp are run". Maps generated in 5.11.0 or older often lack the timestamp, which shows the cost of not versioning from day one. To modify mapgen output reliably you **must** use `on_generated`, not LBMs. — [Luanti lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md)
- Valheim: the community Upgrade World mod is used to regenerate or upgrade content in already-generated zones after game updates. This implies generated zones are persisted, but that is inferred, not stated by Iron Gate. — [Upgrade World (Thunderstore)](https://thunderstore.io/c/valheim/p/JereKuusela/Upgrade_World/v/1.3.1/)
- Minecraft stores a per-chunk generation `Status` and timestamps in region headers, so partial generation can resume after a reload. — [Minecraft Wiki (Fandom): Chunk format](https://minecraft.fandom.com/wiki/Chunk_format); [minecraft.wiki: Region file format](https://minecraft.wiki/w/Region_file_format)
- Luanti `blockseed` is derived from block position and world seed "in a mapgen-specific way", so changing the mapgen changes the per-block random stream. — [Luanti lua_api.md](https://github.com/luanti-org/luanti/blob/master/doc/lua_api.md)
- C2ME notes that vanilla Minecraft generation is not deterministic run-to-run with the same seed. Delta-over-regeneration would be unsafe there. — [C2ME README](https://github.com/RelativityMC/C2ME-fabric)

### Inferences
- **WZ ID stability:** derive object IDs as `H(seed, level, owner_cell, generator_rule_id, local_index_within_rule)`. Do not use a global counter or iteration order. `rule_id` must be a stable authored name hash, not an array index, so adding a new rule doesn't shift existing IDs. Store diffs as {ID → removed | transform-override | property-override} plus "added objects" lists keyed by cell.
- **Generator version change (migration):** store `generator_version` per cell in the save. On load, if the cell has diffs and the version changed: regenerate with the new generator, re-apply diffs by ID, and report orphaned diffs (ID no longer generated). Choose a policy per diff type: keep player-built "added" objects always, drop "removed" orphans, and flag terrain edits for review. If the cell has no diffs, just regenerate. Alternatively, pin cells with heavy edits to their old generator version (versioned generator modules), as Minecraft and Valheim effectively do by persisting output.
- **Luanti-style timestamps:** give every cell a `generated_with` version and a `last_processed` epoch. Register post-generation fix-ups with an introduction epoch so they run once on older cells. This avoids full regeneration for small changes.
- **Terrain edits:** store voxel or height edits as sparse brushes or ops (CSG list) or as sparse per-chunk delta blocks keyed to stable cell coordinates. Ops lists survive a generator change semantically (re-apply "dig sphere at X" to new terrain), while absolute deltas only make sense on the identical base.

### Gaps
- No primary source describing a shipped game's automated world migration across generator versions (re-applying player diffs to new generator output). Minecraft's DataFixerUpper deals with format, not generation, and was not researched here.
- Space Engineers delta storage granularity and format were not found.

---

## 7. Teleports and fast travel (blocking load vs progressive; hiding loads)

### Takeaway
Engines handle teleports by pre-placing a high-priority, time-limited "interest" at the destination before or while moving the player (Minecraft portal and ender-pearl tickets). They hold the player or the reveal until critical state (including compiled pipelines) is ready. Progressive refinement then continues after control returns.

### Cited Findings
- Minecraft portal ticket: level 30 (above entity ticking), radius 3, 15 s lifetime, persisted. It loads and simulates the destination and keeps the target dimension active. Ender pearl ticket: 2 s, refreshed while in flight, which preloads where the pearl will land. Player spawn ticket: level 30, radius 3, 1 s refreshed. — [minecraft.wiki: Chunk](https://minecraft.wiki/w/Chunk)
- UE recommends that loading screens wait until `FShaderPipelineCache::NumPrecompilesRemaining()` is zero, and that proxies delay drawing until their PSO is ready, so no compile hitch happens after reveal. — [UE docs: PSO Precaching](https://dev.epicgames.com/documentation/en-us/unreal-engine/pso-precaching-for-unreal-engine)
- UE PCG runtime generation can be driven by any "Generation Source" component attached to any actor, not only the player. A destination marker can therefore start generation before arrival. — [UE docs: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)

### Inferences
- For WZ fast travel: (1) on travel intent (menu open, cutscene start), add a ticket at the destination with a high level and small radius. Generate coarse levels outward and fine levels near the arrival point. (2) Hide the 1–N s gap with gameplay: transition animation, fade, or "orbit descent" where the camera path itself is the progressive LOD. Orbit to ground is naturally a coarse-to-fine refinement if the descent speed is capped by the measured refinement throughput. (3) Gate the reveal on a minimal set (collision and near-ring at playable LOD, PSOs compiled, IDs and diffs applied), not on the full radius.
- Keep teleport tickets time-limited (Minecraft 2–15 s), so a cancelled travel doesn't pin memory.

### Gaps
- No primary source found on specific games that hide procedural-world loads with gameplay (for example warp or descent sequences). No Man's Sky warp and planet-entry are covered by another researcher.
- No measured fast-travel load times for generated worlds were found.
