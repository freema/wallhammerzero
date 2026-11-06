# Open-World Streaming and World Architecture in Shipped Games (for a C17 / SDL3 + SDL_GPU open-world engine)

Scope: how shipped open-world games split, stream and render their worlds, and what a solo or small-team C17 engine should copy. Every fact has a source. Anything I could not source is in the Gaps sections. Evidence labels used below: **[RE-code]** = read directly in reverse-engineered source code; **[Primary talk]** = slides or a talk from the developer; **[Official docs]** = vendor documentation; **[Modding docs]** = community file-format docs; **[Secondary]** = press or interview coverage; **[Fan/forum]** = unverified.

Research note: the re3/reVC GitHub repo (GTAmodding/re3) returned HTTP 404 on raw.githubusercontent.com when fetched on 2026-11-05. It was taken down by DMCA in 2021. The GTA III/VC code-level details below therefore come from the San Andreas reversal **gta-reversed** (github.com/gta-reversed/gta-reversed), which is still online. SA's CStreaming is a direct descendant of the III/VC one: same IMG/IDE/IPL model, same two-channel CD streamer.

---

## 1. GTA III / Vice City / San Andreas (RenderWare): how streaming worked

### Takeaway
The 3D-era GTA streamer is simple and still a good fit for a small engine. Every streamable resource (model, texture dictionary, collision, IPL chunk, animation, script) gets one global integer ID. A flat array of per-ID records holds each resource's state and its offset and size in a 2 KiB-sector IMG archive. Each frame, the game walks a 2D grid of 50 m sectors around the camera and requests every model whose `drawDistance × LOD multiplier` covers the camera. Two I/O channels read runs of consecutive files in one read. A fixed memory budget is enforced with an LRU list that evicts the least recently used unreferenced resource. HD/LOD pairs are linked per instance in IPL files. LOD instances live in a coarser grid (200 m cells) that is scanned out to the far clip plane.

### Cited Findings
**Archive format (IMG)**
- IMG v1 (GTA III, VC) has a separate `.dir` file of 32-byte entries (4-byte offset in sectors, 4-byte size in sectors, 24-byte name) and no header. IMG v2 (SA) is a single file with an 8-byte "VER2" header plus entry count. IMG v3 (GTA IV) has a 20-byte header and optional AES-256 encryption. — [GTAMods: IMG archive](https://gtamods.com/wiki/IMG_archive) [Modding docs]
- Every file is aligned to **2048-byte sectors**. Offsets and sizes are stored in sectors, so a 123-byte file still takes 2 KiB. — [GTAMods: IMG archive](https://gtamods.com/wiki/IMG_archive)
- Directory entries should follow the order of the stored files with no gaps, "because it may read several files in one system call". Locality is a real dependency of the streamer, not just tidiness. — [GTAMods: IMG archive](https://gtamods.com/wiki/IMG_archive)
- SA's v2 entry has a "streaming size" field that stock files never use. The wiki thinks it was meant for compression that never shipped, so the 3D-era IMGs are **uncompressed**. — [GTAMods: IMG archive](https://gtamods.com/wiki/IMG_archive)
- SA and VC load at most **8 IMG archives**. Going over crashes the game. — [GTAMods: IMG archive](https://gtamods.com/wiki/IMG_archive)

**Definitions vs placements (IDE / IPL)**
- IDE files are text (CSV-like, 256-char line limit). `OBJS` defines simple objects. `TOBJ` defines time-of-day objects with two extra hour parameters. Objects are placed through the `INST` section of IPL files. — [GTAMods: Item Definition](https://gtamods.com/wiki/Item_Definition) [Modding docs]
- IDE flags include GTA III `DO_NOT_FADE (2)`, `DRAW_LAST (4)`, `ADDITIVE (8)`, `NO_ZBUFFER_WRITE (64)`. VC adds `IS_ROAD (1)`, `IGNORE_DRAW_DISTANCE (256)` (example given: "LOD models, North Bridge"). SA adds `IS_TREE`, `IS_DAMAGABLE`, `IS_BREAKABLE_STATUE` and others. — [GTAMods: Item Definition](https://gtamods.com/wiki/Item_Definition)
- VC rule from the wiki's reference table: models with `DO_NOT_FADE` stop streaming at their largest LOD distance **+30.0**, other models at **+50.0**. A model whose LOD distance is **> 2500.0** (or that has IGNORE_DRAW_DISTANCE) is treated as a top-level/LOD entity. — [GTAMods: Item Definition](https://gtamods.com/wiki/Item_Definition)
- GTA IV switched IDE keys from array indices to **hashes of model names** in a hash table. — [GTAMods: Item Definition](https://gtamods.com/wiki/Item_Definition)
- IPL `INST` record (SA binary form): position XYZ, rotation quaternion XYZW (floats), object ID (index into IDE), interior (int32), **LOD index (int32)**. Each record is 40 bytes. SA binary IPLs start with "bnry" and are **streamed from IMG** as `name_streamN.ipl`. — [GTAMods: Item Placement](https://gtamods.com/wiki/Item_Placement) [Modding docs]
- GTA IV moved most placement data into binary WPL files. — [GTAMods: Item Placement](https://gtamods.com/wiki/Item_Placement)

**CStreaming internals (SA, from gta-reversed)** — [gta-reversed: Streaming.h / Streaming.cpp / World.h](https://github.com/gta-reversed/gta-reversed) [RE-code]
- **One global resource ID space**: DFF models 0..19999, TXD from 20000, COL from 25000, IPL from 25255, DAT (path nodes) from 25511, IFP (anims) from 25575, RRR (vehicle recordings) from 25755, SCM (streamed scripts) from 26230. That makes **26,316** `CStreamingInfo` entries in one static array (`ms_aInfoForModel`). The same array also holds sentinel nodes for the intrusive "loaded" and "requested" doubly linked lists.
- **Memory budget**: `ms_memoryAvailable` is set to **50 MB** in `Init2` (comment says the original default was 25,600,000 bytes). `stream.ini` can override it (`memory` / `devkit_memory` in kB). `desiredNumVehiclesLoaded = 22`. `ms_rwObjectInstances.Init(12000)`.
- **Two I/O channels** (`ms_channel[2]`), with states IDLE / READING / STARTED / ERR. One buffer is allocated with size = the largest file in all IMGs, then split in half, one half per channel. A "big" model that doesn't fit in half the buffer is read alone through channel 0 in two phases.
- `RequestModelStream` reads **up to 16 consecutive files** that sit next to each other on disc in one `CdStreamRead`, using `GetNextFileOnCd(pos + size)`. Request order is effectively **disc order**. Priority requests (`ms_numPriorityRequests`) are served first.
- **World grid**: world is ±3000 units (6000 × 6000). The HD sector grid is **120 × 120 → 50-unit sectors**. A separate **LOD pointer-list grid is 30 × 30 → 200-unit cells**. There is also a 16 × 16 "repeat sector" grid for peds and vehicles.
- **Per-frame `CStreaming::Update()`**: if the camera is **≥ 50 units above ground**, it only calls `AddLodsToRequestList` (LOD objects within the far clip plane). Otherwise it calls `AddModelsToRequestList(camPos)` with a radius of **80 units outdoors / 40 units indoors**. Then it streams peds and vehicles, loads requested models, and makes sure **collision (CColStore) and IPL chunks (CIplStore) are in memory around the player**, or around the remote-controlled vehicle.
- **Request test per entity** (`ProcessEntitiesInSectorList`): skip if already loaded, flagged don't-stream, invisible, wrong interior area, or a timed object outside its hours. Otherwise request if the entity is inside the 2D rect and inside a circle of radius `min(TheCamera.m_fLODDistMultiplier × modelInfo->m_fDrawDistance, scanRadius)`. Per-entity **scan codes** stop an entity from being processed twice in one pass.
- **Eviction**: `RemoveLeastUsedModel` walks the loaded list from the tail (LRU) and frees the first DFF with `m_nRefCount == 0`, TXD with no refs that no pending request needs, unreferenced IFP or unused script. Fallbacks: delete RW objects of the least recently used entities (off-screen first), remove ped zone models (if > 4 loaded) or vehicles (if > 7 loaded, or > 4 indoors). `DeleteRwObjectsBehindCamera` frees geometry in sectors **behind the camera's forward vector** first.
- Flags `GAME_REQUIRED`, `MISSION_REQUIRED`, `KEEP_IN_MEMORY`, `PRIORITY_REQUEST` and `LOADING_SCENE` pin resources against eviction. `LoadScene(point)` does a blocking synchronous load for teleports and cutscenes.

### Inferences
- The whole design rests on **separating archetypes (IDE: what a thing is) from instances (IPL: where it is)**. Instances are always resident and cheap (40 bytes in SA). Only the heavy archetype data (meshes, textures, collision) is streamed and reference-counted. Per-instance LOD links (a parent index in the placement file) form a two-level HD/LOD tree. This maps cleanly onto C17 POD arrays.
- The radius in the "is this needed" test comes from the **archetype's draw distance**, not one global radius. Big buildings stream from far away and small props only up close, without any extra machinery. Copy this.
- Disc-order reads plus "read N adjacent files in one call" was SA's answer to slow optical media. On SSDs it still pays off as fewer syscalls and fewer decompression blocks (see section 5).
- The memory budget is a single number, with an LRU fallback chain that has game-specific rules (peds and cars evicted before world geometry when flying). A small engine can start with one budget per pool (CPU asset heap, GPU buffers, GPU textures) and LRU on refcount==0.
- The "above 50 m → LOD-only" rule is a cheap speed/altitude heuristic. Planes and fast cars get LODs instead of a choking HD request queue.

### Gaps
- I could not fetch re3/reVC source (404, DMCA'd). Exact III/VC constants (memory budget, sector grid size for III's smaller map) are therefore **not verified** here. SA values may differ.
- The exact HD↔LOD linking rule for III/VC (which used name-prefix "LOD" matching rather than SA's explicit LOD index) is commonly claimed, but the GTAMods pages I fetched did not document it.
- `STREAMING_SECTOR_SIZE` in the code is assumed to equal the 2048-byte IMG sector from GTAMods. I did not print its definition.

---

## 2. RAGE (GTA IV, GTA V, RDR2): what is publicly known

### Takeaway
Rockstar has published very little about RAGE internals. What is solid: (a) the GTA V frame breakdown that Adrian Courrèges reverse-engineered from GPU captures, (b) GTA IV's archive and placement formats (IMG v3, WPL, hash-keyed IDE) from modding docs, (c) GTA V map data structure (ymap entities with `lodDist`, `childLodDist`, `parentIndex`, `lodLevel`, `numChildren`; ytyp archetypes) from FiveM and CodeWalker tools, and (d) Euphoria's integration (GTA IV first). Claims about Bullet physics inside RAGE and the exact HD/LOD/SLOD distances are **not** reliably sourced.

### Cited Findings
**Verified – GTA V rendering (Courrèges, from GPU captures)** — [Adrian Courrèges, "GTA V – Graphics Study" (2015)](https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/) [Primary analysis]
- **Culling and LOD selection run in a compute shader**. LOD is picked by distance, and distant grass and flowers are not drawn at all.
- **LOD transitions use dithered "alpha stippling"**: a checkerboard keeps pixels where `(x+y)%2==0`, pixels with alpha < 0.75 are discarded, and a post-pass fixes the dithering by sampling up to 2 neighbors.
- Deferred G-buffer: 5 RTs (diffuse, normal, specular, irradiance, plus reversed-Z **logarithmic depth**), all RGBA8 LDR. Stencil IDs separate player, vehicles, NPCs, vegetation and sky.
- About 1900 G-buffer draw calls, opaque drawn front to back. CSM: **4 cascades packed in one 1024×4096 texture**, about 1000 draw calls. Environment cubemap of 6 × **128×128** faces regenerated **every frame** with about 30 draws per face, showing only terrain, sky and some buildings. It is then converted to a dual-paraboloid map. Ocean planar reflection at **240×120**, about 650 draws.
- Whole frame: **4155 draw calls, 1113 textures, 88 render targets**. The article gives PS3 memory as 256 MB RAM + 256 MB VRAM.
- The article does **not** cover texture or mip streaming policy.

**Verified – GTA IV formats (modding docs)**
- IMG v3: 20-byte header, 16-byte item entries carrying a resource type, optional AES-256 ECB encryption. — [GTAMods: IMG archive](https://gtamods.com/wiki/IMG_archive)
- Most placements are in binary WPL files. IDE keys are name hashes. Interiors are defined as MLO in IDE and placed with MLO+ in IPL. — [GTAMods: Item Placement](https://gtamods.com/wiki/Item_Placement); [GTAMods: Item Definition](https://gtamods.com/wiki/Item_Definition)

**Community-verified tool data – GTA V ymap/ytyp** [Modding docs]
- An LOD entity sets `childLodDist` equal to its HD child's `lodDist`, sets its own `lodDist` larger based on the desired streaming distance, sets `lodLevel = LODTYPES_DEPTH_LOD`, and sets `numChildren`. The HD entity lives in a separate ymap and points to the LOD through `parentIndex` (changed from −1 to 0 in the example). — [FiveM docs: Part 6 – LODs](https://docs.fivem.net/docs/assets-manual/beginner-series/part-6/)
- CodeWalker-exported entity XML shows the fields `parentIndex, lodDist, childLodDist, lodLevel, numChildren`. Archetypes in a ytyp carry their own default `lodDist` (1200 in the sample). — [CodeWalker export gist](https://gist.github.com/Stuyk/d31aa4f901c9c7532316b937c329d2c0)
- Mod authors split ytyps by location and by LOD/SLOD level so that only the needed LOD/SLOD models load for the current position. — [gta5mod.net mod page](https://gta5mod.net/?p=53455) [Fan]

**Verified – Euphoria**
- Euphoria (NaturalMotion) is integrated into RAGE. GTA IV was the first Rockstar game to use it, then Red Dead Redemption. It drives live characters (active ragdoll), not only dead-body ragdolls. — [Wikipedia: Euphoria (software)](https://en.wikipedia.org/wiki/Euphoria_(software)); [Wikipedia: RAGE](https://en.wikipedia.org/wiki/Rockstar_Advanced_Game_Engine)

**Unverified / speculation**
- **Bullet physics in RAGE (GTA IV/RDR)**: the only search hit was a forum post claiming Bullet "bonded with RAGE alongside Euphoria". **No authoritative source found. Treat as unverified.** — [NeoGAF thread](https://www.neogaf.com/threads/why-rockstar-rage-engine-outclasses-commercial-tech.1699203/latest) [Fan/forum]
- Exact distances for HD → LOD → SLOD1 → SLOD2 → SLOD3 tiers in GTA V or RDR2: **not found in any authoritative source**.

### Inferences
- RAGE kept the III/SA idea (archetype definitions + instance placements + a per-instance parent LOD link). It generalized it into an **n-level LOD tree per instance** (`parentIndex`, `numChildren`, `lodDist`/`childLodDist`) and moved data into **map-chunk files (ymap) that are themselves streamed**, like SA's binary stream IPLs. For a new engine: a placement chunk = list of instances + a local LOD tree, archetype tables keyed by a 32-bit name hash.
- Rule implied by `childLodDist`: a parent LOD is drawn when the camera is beyond `childLodDist` and within its own `lodDist`. Children are drawn inside `childLodDist`, but only once they are resident; until then the parent stays. A simple fallback rule like this gives pop-free streaming without blocking.
- GTA V's dithered cross-fade is cheap and works with deferred and opaque passes. It suits SDL_GPU better than real alpha blending.
- A low-res reflection probe rebuilt every frame with only big scenery is a cheap trick worth keeping for a day/night open world.

### Gaps
- No primary Rockstar talk on RAGE streaming exists as far as I found. Everything about RAGE's streaming scheduler, budgets and RDR2 internals beyond file formats is unsourced.
- I did not verify RDR2-specific data (ybn collision format details, terrain system).

---

## 3. Other shipped references: Spider-Man, Horizon Zero Dawn (Decima), Witcher 3, Unreal World Partition/HLOD

### Takeaway
The best primary source found is Guerrilla's **"Streaming the World of Horizon Zero Dawn"** slides. They describe a reference-counted file graph, "streaming strategies" (tile-based, area-based, program-based, always-loaded), 4 tile LOD rings (9/9/9/12 tiles), 256 KiB compressed pack blocks in depth-first order, and a flexible CPU/GPU memory pool with GPU defragmentation. Spider-Man used about 800 tiles of roughly 128 m. Witcher 3 terrain uses a clipmap over a tile grid. UE5 World Partition makes the spatial grid, loading range and per-cell HLOD stand-ins explicit.

### Cited Findings
**Horizon Zero Dawn / Decima** — [Guerrilla: Streaming the World of Horizon Zero Dawn (page)](https://www.guerrilla-games.com/read/Streaming-the-World-of-Horizon-Zero-Dawn); [slides PDF](https://d3d3g8mu99pzk9.cloudfront.net/AstridHuntjens/Streaming%20the%20world%20of%20Horizon%20Zero%20Dawn.pdf) [Primary talk; page dated 21 March 2023, speaker Jan-Jaap, Senior Principal Tech Programmer]
- Design goals: no loading screens except startup and fast travel, no corridors, continuous loading, and **faster iteration by not packing data during development**.
- Content: **300,000 CoreText files, 16 million objects, 20 million links**. After conversion: 189,000 Core files (20 GiB), 30,000 CoreStream files (15 GiB), plus 1.2 GiB of localized data per language.
- The content is an **acyclic graph of files**. A graph must always be loaded fully. Subgraphs overlap, and **"Streaming Links" separate subgraphs** (roots = tiles, characters, weapons).
- Load phases per object: deserialize → link-resolve (patch pointers) → initialize → activate (add to world and physics). Order is **depth-first**, so dependencies are initialized first.
- **Files are reference counted**. Already-loaded files are skipped and just get another reference. "No object is ever loaded more than once." A file unloads automatically on its last release.
- **Prefetch files**: a precomputed description of the whole game's file hierarchy (~**20 MiB**). It lets the game get the full dependency graph of any root without reading the files themselves.
- **Streaming strategies** are evaluated once per frame to queue loads and unloads:
  - AlwaysLoaded: system assets, world data, the player.
  - **TileBased: four tile resolutions. 9 High (full res), 9 Medium (medium geometry + physics mesh), 9 Low (low-res baked geometry), 12 Very Low (always loaded).**
  - AreaBased: primary hull = loading hint, secondary hull = activation hint (quests, scenes).
  - ProgramBased: designer-authored logic.
- A separate Decima deck says tiles are defined by streaming groups rather than purely spatially, aiming for **consistent tile size for load balancing**. — [Decima Engine: Visibility in Horizon Zero Dawn (SlideShare)](https://www.slideshare.net/guerrillagames/decima-engine-visibility-in-horizon-zero-dawn)
- **Packaging**: about 220,000 files exceeded the PS4 package limit. Files are recombined into a few large **PackFiles** that stay open, with the directory held in memory, using only `pread` (no open/lseek/close). Files are grouped by streaming-link subgraph and **ordered depth-first in graph order**. They are written to **256 KiB blocks, each compressed, with an index from logical to physical offsets**.
- **Patches** are just another PackFile whose index overlays the gold master's (no delta compression). Patch 1.30 was ~98 MiB.
- **Development**: no PackFiles at all. Files are served from the host PC over a socket.
- I/O: Killzone (~3000 large files) ~50 MiB/s. Horizon from a memory cache (~200k files) ~90 MiB/s. Horizon shipped package (4 package files, ~200k logical files) ~60 MiB/s.
- **Memory**: ~800 MiB fixed heap (DLMalloc), ~500 MiB GNM video pool, ~300 MiB GNM shared pool. A variable-size **RenderData pool (textures, meshes, shaders)** and a variable-size **AssetMemory pool (object data)** share physical memory. RenderData gives up 64 MiB chunks on demand by **unstreaming low-priority mesh LODs and texture mips**, and takes chunks back to stream them in again.
- RenderData has static assets plus "streaming" assets (optional mesh LODs and mips). It is **defragmented continuously**: up to **16 MiB copied per frame** using async compute, and old blocks linger for one frame.
- Asset allocator: block allocator over 1 GiB virtual ranges in 128 KiB blocks. Small-block allocator for ≤ 32 KiB (size-class buckets in 2 MiB blocks), large-block allocator for > 32 KiB, and a **linear allocator for allocations with identical lifetime** (bump pointer, free all at once).
- CPU: job scheduler with frame jobs and non-frame (long-running) jobs, three priorities each. I/O has its own threads.
- Planned improvement: "Load object graphs, not file graphs."

**Marvel's Spider-Man (Insomniac, 2018)**
- The open world was split into about **800 tiles of roughly 128 m square**, streamed in and out as the player moves. — [Engadget (2018)](https://engadget.com/2018/09/07/spider-man-ps4-game-new-york-city) [Secondary; attributed to Insomniac's Mike Fitzgerald]
- Elan Ruskin's GDC 2019 "A Technical Postmortem" covered the growing asset count and adapting rendering, streaming and lighting to "build a New York City that fits on a Blu-Ray". The public abstract and summaries give no numbers. — [GDC Vault 1026496](https://gdcvault.com/play/1026496); [80.lv summary](https://80.lv/articles/marvels-spider-man-a-technical-postmortem)
- The Fisk Tower interior was too large to hold in memory alongside Manhattan. Insomniac hid the swap with "careful camerawork". — [Kotaku](https://kotaku.com/insomniac-reveals-one-of-the-camera-tricks-that-makes-s-1834246823) [Secondary]

**The Witcher 3 (REDengine 3)** — [GDC 2014 "Landscape Creation and Rendering in REDengine 3" (Marcin Gollent)](https://www.gdcvault.com/play/1020394/Landscape-Creation-and-Rendering-in); [slides copy on Scribd](https://es.scribd.com/document/369764097/Gollent-Marcin-Landscape-Creation-And) [Primary talk, via search summary of the slides]
- Terrain is held as a **clipmap** stored as a texture array, fed from a tile grid. Novigrad test setup: **46×46 tiles of 512×512**, a 1024×1024 window, **5 clipmap levels**, ~**30 MB** for elevation + normal + control maps.
- Terrain shadows are a separate clipmap of maximum heights, updated when the streaming clipmap moves or the time of day changes.
- The control map stores texture indices, UV scale and slope threshold. Terrain tiles stream by player location. — [witcher3-heightmaps repo](https://www.github.com/Til-Weimann/witcher3-heightmaps) [Fan data]

**Unreal Engine 5 World Partition + HLOD** [Official docs]
- One persistent level, divided into streamable cells on a configurable **2D runtime hash grid**. Using more than one grid can hurt performance. Doc examples use a **256 m cell size and 768 m loading radius**. The editor spatial-hash sample uses `CellSize=51200` (512 m). — [UE docs: World Partition](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)
- Cells load around **streaming sources**: player controllers by default, plus extra source components with shape, priority and a target state of *Loaded* or *Activated*. When sources overlap, the cell takes the highest priority and highest target state. "Block on Slow Streaming" can pause the game. Actors that reference each other are bundled into the same cell. — [UE docs: World Partition](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)
- **One File Per Actor** for multi-user editing. Data Layers switch sets of actors on and off. — [UE docs: World Partition](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)
- **HLOD**: "Content in unloaded cells is replaced with HLODs." HLODs are built per cell from static actors in HLOD Layers. Layer types: Instancing (lowest LOD as instanced mesh, good for trees), Merged Mesh, Simplified Mesh. HLOD actors have their own runtime grid with its own Cell Size and Loading Range. A Parent Layer setting chains HLOD levels. HLODs rebuild only when their sources change. — [UE docs: World Partition HLOD](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition---hierarchical-level-of-detail-in-unreal-engine)

### Inferences
- Guerrilla separates **"what is loaded" (a ref-counted dependency graph)** from **"why it is loaded" (pluggable streaming strategies that hold references to graph roots)**. This is the most transferable idea in this research, and it is small enough for C17: `strategy_update()` functions add and release refs on root IDs, and the resource system resolves dependencies and does I/O.
- HZD's **4 rings of tiles at different resolutions, with the lowest ring always loaded**, is the tile version of RAGE's HD/LOD/SLOD tree and UE's HLOD grid. All three converge on one pattern: **full-detail streamed cells near the player, pre-baked merged proxies for far cells, and an always-resident lowest level for the horizon**.
- Typical cell sizes seen: GTA SA 50 m (instance grid) / 200 m (LOD grid), Spider-Man ~128 m, UE examples 256 m runtime grid / 512 m editor grid, Witcher terrain tiles of 512² samples. A **128–256 m streaming cell plus a coarser 1–2 km HLOD cell** is a well-trodden choice for a GTA-scale city.
- Loose files during development and packing only for shipping (HZD) removes a whole class of iteration pain for a solo developer. The pack format can then be added late.

### Gaps
- No primary source found for Spider-Man's tile-ring count, LOD scheme or per-tile memory. The 128 m / 800-tile figure is secondary reporting.
- Assassin's Creed (Anvil) and Just Cause (Avalanche/Apex) streaming: **not researched within the tool budget. No sourced findings.**
- The HZD talk's event and year are not stated on Guerrilla's page. The page date is 2023, but the content describes HZD's 2017 PS4 shipping state.

---

## 4. Large-world precision: floating origin, camera-relative rendering, doubles, cell sizes

### Takeaway
Shipped answers: UE5 moved CPU-side world positions to doubles (LWC). Star Citizen spent about 8 months moving to 64-bit world positions and finished by making rendering camera-relative, because the GPU stays 32-bit. Niagara uses a "cell + float offset" representation. For a GTA-sized map (≤ ~10 km), plain float32 with **camera-relative rendering** is enough. A cell-relative or double world position becomes worthwhile beyond roughly 10–20 km.

### Cited Findings
- UE5 LWC adds double-precision variants of core types. Default `WORLD_MAX` is **88 million km**, versus UE4's **21 km** limit. LWC is labelled Beta. HLSL helpers live in `LargeWorldCoordinates.ush`. **Niagara keeps floats and splits the world into grid cells: one float for position inside the cell, one value identifying the cell.** Chaos physics uses doubles, with explicit double→float conversion. — [UE docs: Large World Coordinates](https://dev.epicgames.com/documentation/en-us/unreal-engine/large-world-coordinates-in-unreal-engine-5)
- Star Citizen: about **8 months** to move to 64-bit world-space positions. The final step was making rendering **camera-relative**, because "GPUs generally work in 32-bit". 64-bit positions came with a "zone system" of local grids instead of octrees. Physics had to be refactored, but AI didn't care. — [GamersNexus: Sean Tracy 64-bit interview](https://gamersnexus.net/gg/2622-star-citizen-sean-tracy-64bit-engine-tech-edge-blending); [GamersNexus: Chris Roberts interview](https://gamersnexus.net/gg/2019-star-citizen-multi-crew-interview-chris-roberts) [Secondary interviews]
- Tom Forsyth's "A matter of precision" argues for **fixed-point (integer) world positions** with float model-local vertices, and against doubles. I could only reach this secondhand. A forum summary also gives the rule of thumb that float32 can't hold 0.001 m precision much beyond about 10 km. — [Handmade Network thread](https://hero.handmade.network/forums/code-discussion/t/293/p/2159) [Secondary/forum]
- The general pattern is double-precision CPU positions plus camera-relative float vertices on the GPU (Unigine 2 and other engines). — [gamedev.net: Unigine 2 64-bit thread](https://www.gamedev.net/forums/topic/689162-unigine-2-and-its-64-bits-coordinate-precision/) [Forum]
- GTA V uses a **logarithmic reversed-Z depth buffer**, which addresses depth precision over long view distances. — [Courrèges](https://www.adriancourreges.com/blog/2015/11/02/gta-v-graphics-study/)
- GTA SA's whole world fits in ±3000 units of float coordinates. — [gta-reversed World.h](https://github.com/gta-reversed/gta-reversed)

### Inferences
- Float32 spacing (my arithmetic, IEEE-754): at 4,096 m the step is ~0.49 mm, at 8,192 m ~0.98 mm, at 16,384 m ~1.95 mm, at 65,536 m ~7.8 mm. Vertex jitter becomes visible around a few mm, but physics and animation problems start earlier (velocity integration, contact jitter). An **8×8 km GTA-V-class map** is fine in float32 **if** rendering is camera-relative.
- Recommended for this engine:
  1. **World positions stored as `int32 cell_x, cell_y` + `float` local offset** (Niagara/Forsyth style), or as `double` on the CPU. Cell = the streaming cell (e.g. 256 m). This keeps the streaming grid and the precision scheme the same thing.
  2. **Camera-relative rendering**: on the CPU, subtract the camera position (in high precision) from each instance origin, then upload float32 model→view-relative matrices. Never upload absolute world positions to SDL_GPU.
  3. **Reversed-Z depth** (float depth, clear to 0, GREATER test) for long draw distances.
  4. Physics can stay float32 within a local region. A floating origin can be re-centered only when the player crosses a threshold (e.g. 2–4 km), to avoid re-basing every frame.
- Cell-size choice depends on (a) streaming granularity (one cell should load within about 1 s at max player speed) and (b) authoring granularity (one file per cell or chunk for merge-friendly version control). 128–256 m fits both for a car-speed city.

### Gaps
- Could not fetch Forsyth's original post. The stance is reported secondhand.
- No source found for Rockstar's precision handling in GTA V/RDR2 (map ~ ±8 km by fan accounts, unverified).

---

## 5. Asset pipeline for streaming: cooking, relocatable formats, packs, compression, locality

### Takeaway
The pattern across sources: author in a text or editor format, **convert offline to runtime binaries**, **pack** into a few large archives that stay open, with an in-memory directory, **ordered by streaming locality** (disc order in GTA, depth-first dependency order in HZD), compressed in fixed-size blocks (HZD: 256 KiB) with a logical→physical offset index. Load as deserialize → pointer fix-up → init → activate.

### Cited Findings
- GTA 3D era: uncompressed 2 KiB-sector IMG archives. Files read in directory order, up to 16 adjacent files per read. At most 8 archives. — [GTAMods: IMG archive](https://gtamods.com/wiki/IMG_archive); [gta-reversed Streaming.cpp](https://github.com/gta-reversed/gta-reversed)
- SA reserves one I/O buffer sized to the largest file, and resource IDs index straight into a table with archive and sector offsets. No filename lookup at runtime. — [gta-reversed Streaming.cpp/h](https://github.com/gta-reversed/gta-reversed)
- GTA IV keys archetypes by name hashes instead of indices. — [GTAMods: Item Definition](https://gtamods.com/wiki/Item_Definition)
- HZD: text CoreText source → converter → `Core` (game data), `CoreStream` (streamable LODs and mips), `CoreDebug`, plus dependency data. The converter also **generates loading hints** (prefetch files, ~20 MiB covering the whole game's dependency graph). Shipping: PackFiles with **256 KiB compressed blocks**, depth-first graph order, files held open, `pread` only, in-memory directory, patch = overlay PackFile. Dev: loose files over a network socket. — [HZD slides](https://d3d3g8mu99pzk9.cloudfront.net/AstridHuntjens/Streaming%20the%20world%20of%20Horizon%20Zero%20Dawn.pdf)
- HZD load phases: deserialization → link resolving (set pointers to linked objects) → initialization → activation. — [HZD slides](https://d3d3g8mu99pzk9.cloudfront.net/AstridHuntjens/Streaming%20the%20world%20of%20Horizon%20Zero%20Dawn.pdf)
- HZD splits a mesh or texture into a static part (always loaded with the object) and an optional streaming part (extra LODs or mips) that the memory system can drop under pressure. — [HZD slides](https://d3d3g8mu99pzk9.cloudfront.net/AstridHuntjens/Streaming%20the%20world%20of%20Horizon%20Zero%20Dawn.pdf)
- UE World Partition HLOD builds are incremental: they rebuild only when source actors, meshes, materials or textures change. — [UE docs: WP HLOD](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition---hierarchical-level-of-detail-in-unreal-engine)

### Inferences
- Concrete format plan for a C17 engine:
  - **Runtime asset blob** = header + sections, with all internal pointers stored as **32-bit offsets relative to the blob base** (relocatable). After a single `pread` into an aligned buffer, fix-up is either a no-op (use offsets everywhere) or a one-pass pointer patch. GPU-bound sections (vertex/index buffers, BC7/BC5 texture mips) are uploaded straight from the blob into an SDL_GPU transfer buffer.
  - **Pack file**: `[header][directory: hash64 → (block, offset, size, flags)][compressed 64–256 KiB blocks]`. Order files by cell, then by dependency depth-first (HZD), so one cell's data is mostly contiguous. Patch packs are overlays (HZD).
  - **Compression**: block-level, so random access needs only one block decompressed. LZ4 is good for fast decode, zstd for a better ratio (see Gaps). Textures stay in a GPU block-compressed format inside the compressed block.
  - **Dev mode**: loose cooked files on disk, same IDs, no packing (HZD's lesson). Packing is a ship-time step.
  - **Archetype vs instance split** (GTA IDE/IPL, RAGE ytyp/ymap): per-cell files hold only instance transforms, archetype hash and LOD parent index. Archetype assets (meshes, textures, collision) are shared, ref-counted resources.
- Keep a **build-time dependency manifest** (HZD prefetch file). It turns "load cell X" into a known flat list of file IDs and sizes before any I/O happens, which makes budgeting and prioritising trivial.

### Gaps
- **Oodle / LZ4 / zstd usage in specific shipped titles (and Insomniac's or Sony's patterns, PS5 Kraken hardware decode) were not researched within the tool budget. No sourced claims are made here.** Recommendations on codecs above are inference, not sourced fact.
- No primary source found on Insomniac's asset or package format.

---

## 6. Priority systems: distance + velocity direction, budgets, eviction

### Takeaway
Shipped systems use simple, layered heuristics, not one clever scorer: per-archetype draw-distance radius (GTA), disc order within the request queue plus a priority flag (GTA), LRU eviction of unreferenced resources with pinning flags (GTA), behind-camera-first freeing (GTA), altitude- and speed-based LOD-only mode (GTA), ring-based tile resolutions (HZD), multiple streaming sources with priority and target state (UE), and a memory system that sheds optional mips and LODs first (HZD).

### Cited Findings
- GTA SA request radius = `min(m_fLODDistMultiplier × archetype drawDistance, 80 outdoors / 40 indoors)` for HD. When the camera is ≥ 50 above ground, it switches to LOD-only requests across the far clip plane. Collision and IPL chunks are always ensured around the player. — [gta-reversed Streaming.cpp](https://github.com/gta-reversed/gta-reversed)
- GTA SA eviction: LRU tail walk, refcount==0, TXD/anim not needed by pending requests. Then behind-camera / off-screen entity geometry, then ped and vehicle models above minimum counts. Pinned flags: GAME_REQUIRED, MISSION_REQUIRED, KEEP_IN_MEMORY. Priority requests jump the queue. `LoadScene` blocks for teleports. — [gta-reversed Streaming.cpp/h](https://github.com/gta-reversed/gta-reversed)
- GTA SA `DeleteRwObjectsBehindCamera` uses the camera forward vector to pick sector ranges behind the camera (offsets 10 and 2 sectors) to free first. — [gta-reversed Streaming.cpp](https://github.com/gta-reversed/gta-reversed)
- HZD: per-frame strategies queue loads and unloads. Area strategy uses two hulls (load hint vs activation hint). Under memory pressure, RenderData "unstreams low prio LODs/MIPs" in 64 MiB chunks. Defrag is capped at 16 MiB per frame. Job scheduler has frame vs non-frame jobs × 3 priorities. — [HZD slides](https://d3d3g8mu99pzk9.cloudfront.net/AstridHuntjens/Streaming%20the%20world%20of%20Horizon%20Zero%20Dawn.pdf)
- UE: streaming source components with priority and target state Loaded vs Activated. A cell overlapped by several sources takes the max of both. "Block on Slow Streaming" can stall the game when cells fall behind. — [UE docs: World Partition](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine)
- Spider-Man hid an interior↔city memory swap behind camera work rather than streaming both. — [Kotaku](https://kotaku.com/insomniac-reveals-one-of-the-camera-tricks-that-makes-s-1834246823)

### Inferences
- A practical scorer for this engine (inference, not sourced): `priority = class_weight × (1 / max(dist_to_camera_or_predicted_point, ε))`, where the predicted point = `player_pos + velocity × lookahead_s` (lookahead ~1–2 s). Add a second "streaming source" at the predicted point (UE-style multiple sources), rather than a complicated directional formula. Classes in descending order: collision around the player > cell instance lists > LOD/HLOD proxies > HD meshes > high texture mips > ambient peds/vehicles.
- Two target states like UE and HZD (**Loaded** = in memory, **Activated** = physics/AI/scripts live) at different radii keep CPU cost down while data is already resident.
- Eviction: LRU over refcount==0 resources, with **optional streaming parts (top mips, HD LODs) dropped first** (HZD), behind-camera first (GTA). Pin flags for mission and script-required assets (GTA).
- Always have a **guaranteed fallback** visible (always-resident lowest tile ring in HZD, LOD parent drawn until HD children are ready in GTA/RAGE). Then streaming can be late without holes. Keep a blocking `load_scene(pos)` for teleports, fast travel and save loads (GTA `LoadScene`, HZD only allows loading screens for startup and fast travel).
- Altitude and speed rule (GTA): above some height or speed, stop requesting HD and only stream LOD/HLOD. Cheap protection for flying vehicles.

### Gaps
- No primary source found for a velocity-predictive streaming formula in a shipped game. The look-ahead source is a recommendation, not a documented practice from these sources.
- Concrete per-cell memory budgets for Spider-Man, RAGE or Witcher 3 were not found.
