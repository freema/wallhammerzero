# No Man's Sky: runtime world streaming, generation and persistence (engine side)

Research date: 2026-11-05. Prepared for Wallhammer Zero (C17, SDL3/SDL_GPU, cells from cooked files or generator(seed, cell, LOD), refcounted resource graph, work-stealing jobs, SDL_AsyncIO, double/cell+float coordinates).

**Primary source note:** most hard numbers below come from Innes McKendrick's GDC 2017 talk "Continuous World Generation in No Man's Sky" ([GDC Vault](https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No), [YouTube video sCRzxEEcO2Y](https://www.youtube.com/watch?v=sCRzxEEcO2Y)). I pulled the full auto-generated YouTube transcript (about 11,000 words) and read all of it. The auto-captions garble some terms ("logs"/"mods" = LODs, "polygons izing" = polygonizing, "stare five" = spherify). The quotes below are lightly normalized; numbers are as spoken. These figures describe **the 2016/2017 shipped engine**. Hello Games has since rewritten parts of it (dual marching cubes in 2024, deeper oceans in 2025), so treat any number as of 2017 unless dated otherwise.

---

## 1. Spatial structure on a planet (cube-sphere, regions, voxels, LODs, seams)

### Takeaway
As of GDC 2017, NMS simulated everything in true 3D on a sphere. Voxel data was stored on a cube projection, in a shell about 128 m thick that rode on a noise-displaced "elevation" radius of ±600 m–1 km. Nearest-LOD regions were 32×32×32 m of 1 m voxels, polygonized as about 36³ voxels to include borders and overlap, at about 6 bytes per voxel. There were 6 LODs, each region twice the size of the previous one, all held in one octree per solar system. Planets as seen from space were cheap separate "2-voxel-high" spheres. Seams were hidden by overlapping the polygonization into neighbors, not by stitching. The 128 m figure is confirmed; the 36 m chunk and 6-byte voxel figures are confirmed with nuance (see below).

### Cited Findings
**How they arrived at the sphere (what they rejected):**
- First prototype: an infinite flat plane while on the planet. On takeoff the explored terrain was wrapped onto a sphere in the shader, with the poles placed as far from the player as possible, so planets in space were "entirely implicit." It was rejected for these reasons: pinching at the poles; "swimming coordinates"; "impossible places" on the flat plane that can't map to the sphere, which broke shared points of interest for networked features; precision problems with infinite generation; and the cost of noise wrapping. — [GDC 2017 talk](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Cartographic map projections were rejected because they were expensive, or expensive to invert, for many vertices/points, or were Earth-specific. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Final choice: "run our simulation on the sphere." Coordinates are "nice and consistent within our solar system… you just have this 3D continuous coordinate system." Up and gravity = direction from the planet center, recomputed constantly. They described the knock-on cost in "just about every area of code," including third-party libraries that assume a fixed up axis. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Hairy-ball theorem: there are no continuous tangents on a sphere. Mitigations: triplanar projection, single-plane projection in some places, or "local mapping" where tangents are taken from the first point where you reach the planet and carried continuously from there (continuous but not deterministic). — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)

**Cube storage:**
- "We simulate everything on that sphere; when it comes to storing voxel data we're mapping that onto a cube." Sphere→cube: normalize the direction × radius. Cube face = the axis with the largest absolute component ("a really simple bit of code… really cheap"). Generation happens in sphere space, so cube distortion only changes voxel *density* (e.g., a mountain made of fewer voxels), not shape. They rejected simulating on the cube itself because of "literal edge cases in your world" at corners and edges. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Distortion grows with distance from the sphere surface, so "we choose about **128 meters of height** for the voxel data." To get high mountains and deep oceans they add an **elevation** term: the sphere radius varies by noise, "an offset of about **600 meters to a kilometer**," with the 128 m voxel shell offset from that. "Really all we're doing is calculating a single point of noise every time we call this transform," and it is cached for the local area. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- An earlier secondary summary of McKendrick's 2015 nucl.ai talk: "the voxel regions on the planets are stored as octrees on cubes… projected onto spheres… the voxels are stored as flat arrays." — [Isaac Karth, procedural-generation blog, 2016-06-22](https://procedural-generation.isaackarth.com/2016/06/22/building-a-galaxy-procedural-generation-in-no.html)

**Regions and voxels (verifying "1 m voxels, 6 bytes, 36 m chunks"):**
- "At the nearest LOD all of our voxels are **one meter cubed**… our regions are **32 by 32 by 32 meters** in game." They need one extra row of voxels around the edge to polygonize (vertices sit between 8 voxels), "plus we want to polygonize a little bit outside each region and have some overlap… to cover seams due to precision issues. So in the end we end up polygonizing an area that's about **36 by 36 by 36 voxels**." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
  - **Verification:** the region is 32 m; the 36 figure is the *padded polygonization window in voxels*. "36 m chunks" is a common misquote. (McKendrick himself later says "our 36 by 36 by 36 meter regions" loosely.)
- "Individual voxels are about **six bytes**": 2 bytes of density; 2 materials (e.g., grass/rock/sand, used for texturing and object placement); and 2 bytes for the blend between the materials. The captions are garbled here, but the split is approximately density(2) + material IDs(2) + blend(2). — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Arithmetic check: 36³ × 6 B ≈ 280 KB per nearest-LOD region (computed by me from the talk's numbers).

**LODs:**
- "We deal with **6 LODs**, each one being twice the size of the last," with the same edge overlap. Lower LODs also reduce voxel density inside the region, more vertically than horizontally ("we tend to do it in the height a lot more than in the X and Z"). The 128 m shell = 4 stacked 32 m regions at the nearest LOD, so lower LODs quickly become "incredibly cheap." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Regions are stored in an **octree** that "lets us keep up to date with where our regions are as we move around the cube" and gives fast neighbor lookups. "We have an octree that exists **one for the whole solar system** and we just swap it between the planets," creating and destroying regions as needed. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- "We can't cover one of our large planets with even our lowest LOD voxel data, so we also have much cheaper low-res voxel spheres… created as you fly into the system… just **two voxels high**… we just generate six separately polygonized cube faces that map onto our sphere," giving every planet in the system a mesh "from any point in the system all of the time." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)

**Seams / LOD transitions:**
- LOD boundaries are matched by "polygonizing a little bit over [the edge]… we tend not to get holes between LODs," and the boundary is far enough away that the density step isn't noticed. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Zylann's summary of the talk (godot_voxel author, 2019): they "handle seams by simply polygonizing a small distance over neighboring blocks, using a lower isolevel so they match up with very little artifacts." He also reported that the approach gave Z-fighting in Godot's renderer. — [godot_voxel issue #24](https://github.com/Zylann/godot_voxel/issues/24)
- Mesher: "We started out with marching cubes" and moved to **dual contouring** to keep sharp corners, clamping vertices that fall outside the cell ("mass points"). — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- **Changed in 2024:** "Terrain generation has been rewritten to incorporate **dual marching cubes** voxel meshing, which reduces vertex count, increases terrain generation speed, improves framerate and saves significant amounts of memory." "Underlying terrain shapes have not been reset and existing planetary bases will not be moved." — [Worlds Part I (5.0) patch notes, July 2024](https://www.nomanssky.com/worlds-part-i-update/)
- **Changed in 2025:** Worlds Part II (5.5) added "significantly deeper oceans," with seas "stretching miles beneath the surface," and "colossal worlds on a scale never before seen." "Terrain in existing systems has not been regenerated." — [Worlds Part II patch notes, Jan/Feb 2025](https://www.nomanssky.com/worlds-part-ii-update/)

**Multiple meshers per region:**
- Dual contouring for terrain at all distances. A cheap, vertex-heavy, Minecraft-like **cube mesher** for terrain-resource deposits, near LODs only. A third, trivial **flat-plane polygonizer for water**, run across the planet because elevation can put water far above the voxel shell. McKendrick expected water to move to an implicit shader later. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Vertex format: a smooth normal (used for texturing) plus a face normal (used for lighting), both octahedron-encoded; 2 materials plus a blend value. Triplanar projection is done in *planet-global* axes, with textures at two scales continuously swapped as you approach. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)

### Inferences
- The 128 m voxel shell plus the scalar elevation offset is effectively "heightfield + thin 3D detail band." 3D features such as caves and overhangs only exist within about 128 m of the elevated surface. Worlds Part II's "miles"-deep oceans imply that this band, or the elevation range, was extended after 2017. No public detail on how.
- For Wallhammer: NMS cells are not cube-face quadtree tiles. They are octree nodes of a cube that wraps a thin shell. Generator(seed, cell, LOD) maps cleanly onto that: a cell = octree node, LOD = octree depth.
- Overlap-and-lower-isolevel seams avoid Transvoxel-style stitching and avoid cross-cell dependencies at mesh time. Each cell polygonizes independently from its own padded voxel block, which fits a work-stealing job system. The cost is overdraw/Z-fighting at boundaries and fixed padding (36³ vs 32³ ≈ +42% voxels).

### Gaps
- Exact LOD distance thresholds (how far each of the 6 LODs reaches) were not given in the talk. No other source found.
- Post-2024 dual-marching-cubes region sizes, voxel format, and LOD scheme are unpublished.
- Planet radii in metres: no authoritative source found. "Colossal worlds" (5.5) sizes are unpublished.

---

## 2. Runtime generation scheduling (threads vs compute, priority, budgets, fast flight, space→ground, hitches)

### Takeaway
As of 2017: a simple threading model of one main update thread plus one render thread, synced once per frame, with all region work done as jobs. Jobs ran on CPU on PC; on PS4, some jobs, explicitly including object placement, ran as compute shaders. The pipeline per region: generate → polygonize → spherify → physics mesh → navmesh → populate. Only the steps that touch shared world state run as main-thread sync points. Priority was visual: fill low LOD fast everywhere first, then refine, front-of-camera first, spreading outward. Fast flight is handled by time-based dither fades and object re-snapping rather than by blocking. Later patches (2024–2025) claim large generation and loading speedups.

### Cited Findings
- Load-time vs runtime hierarchy: "ideally if we could do everything offline… we can't, so we do as much as we can at load time [rendering procedural textures, loading vertex data for models], and then we do what we have to as the player is moving around." Terrain is generated "in the background along with things like texture streaming." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- **Per-region stage pipeline:** "first we generate… filling in the voxel data from noise… we polygonize it so we have a vertex mesh, we then spherify it… we then construct a physics mesh, we construct a navmesh for creatures, and then we finish off by covering that region in plants and creatures and buildings." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- **Threading model:** "Threading in our game is relatively simple: we have a main update thread and a main graphics thread and we have a sync point each frame… we do it off the main thread using a job system." "**On PC all these jobs are handled on the CPU but on PS4 we do some of them in compute shaders**." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Sync points: "at some point we have to get hold of a vertex data buffer to fill in, at some point we have to add our physics to the main physics of the world, we have to add all our creatures and position models… almost everything else we can split off and just run as a job." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Cost distribution: physics and navigation meshes "you also have to calculate as jobs in real time, and that takes up a way more significant chunk of our time than actually generating or polygonizing the terrain." Object placement "can end up to be quite a significant cost," and is "something that we do in compute shaders on PS4." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- **Ordering/priority:** "The way that we order those is based really highly on visuals; there's no real driving factor aside from what the player experiences." Low LOD is filled quickly first ("we're able to fill in this low LOD really quick and then we start to bring in more detailed terrain over the top"). "We generate using a point-based system, so the stuff in front of us… generates first and then the stuff around about us, spreading out from the camera." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- 2D pre-pass: a per-voxel-column 2D pass (elevation, plus how much mountain/plain/river) is "stored into a 2D array so that'll be cheap to look up later" and kept only until 3D generation finishes. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- **Fast flight / pop handling:** objects are placed per LOD (big objects on low-LOD terrain). When terrain is replaced by a higher LOD, trees "reposition onto the surface… fading between impostors and real models and also readjusting to the surface… it's kind of cheesy that they interpolate like that but it's far better than popping." Regions fade in with a shader dither driven by a 0→1 value passed for "all of our terrain and our objects"; "this is all time-based: we kick off fading as that region is ready to come in." Grass uses distance-based thinning. McKendrick would prefer distance-based fading everywhere, "but it needs you to have generated enough terrain far enough away… if your terrain comes in quite late then you really need to fade it in as quickly as possible." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Space→ground continuity: cheap 2-voxel-high planet spheres exist for every planet from system entry. The octree regions then refine as you approach. Texture scale is continuously halved/swapped while descending. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- **Lookahead for gameplay content:** buildings must be known from space, so they use an **offset grid** (one jittered point per grid cell) "so we can take any point on the sphere and determine the nearest building" without generating terrain. Creature paths are generated ahead, but creatures are instantiated only when the camera gets close; because placement is deterministic, "we can go away and come back and have those creatures remain in their same positions." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Performance regression: a "smoke test tool" captures screenshots and perf on the *same planets* every build, because planets differ hugely in cost. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- 2024: "The rendering of planetary objects such as trees, rocks, and grass has been rewritten… moved to a more modern **GPU-based system**." Optimisations in "metadata usage, texture streaming, LOD generation and procedural mesh generation"; "the component system has been reworked." — [Worlds Part I notes, July 2024](https://www.nomanssky.com/worlds-part-i-update/)
- 2024: Hello Games engine programmer Martin Griffiths posted a PS5 clip visiting three planets in about 50 seconds with no loading screens. — [80.lv, 2024-07-23](https://80.lv/articles/3-planets-in-under-a-minute-a-closer-look-at-the-power-of-no-man-s-sky-s-engine) (original post: [x.com/Griff_/status/1815495093500936502](https://twitter.com/Griff_/status/1815495093500936502)). A search-engine summary of GamesRadar coverage says "generation speed has nearly doubled" since Worlds. I could not open the article to verify. — [GamesRadar](https://gamesradar.com/games/open-world/no-mans-sky-dev-proves-its-not-all-smoke-and-mirrors-in-space-games-by-zipping-across-3-planets-in-50-seconds-to-show-how-powerful-the-engine-really-is)
- 2025: "Load times are up to 4x faster, and **improved data caching reduces hitches during transitions**"; "the filesystem has been reworked to take advantage of cutting-edge compression technology" (more than 10% smaller install); "introduced a performance optimisation for terrain generation" and "…for planetary props"; "…related to culling drawn objects." — [Worlds Part II (5.5) notes](https://www.nomanssky.com/worlds-part-ii-update/)

### Inferences
- NMS's 2017 scheduler is a priority queue of (region, stage) jobs. Priority = (LOD coarse-first) then (view-direction / distance from camera). Main-thread "commit" steps are serialized. This maps 1:1 onto Wallhammer's job system plus a per-frame commit budget. The talk gave no per-frame millisecond budget.
- The "fade when ready" approach means NMS never blocks the frame on generation. Quality degrades (low LOD visible longer, fades) when the player outruns the generator. This is the standard pattern to copy for fast low-altitude flight.
- Physics and navmesh dominate cost. So a Wallhammer generator should produce collision lazily, only for cells near dynamic actors, and populate objects on the GPU (as NMS did on PS4 and again since 2024).

### Gaps
- No public per-frame budget, thread counts, or velocity-aware prefetch details. The talk mentions only camera-forward priority, not velocity.
- No official technical write-up of the 2024 dual-marching-cubes or GPU prop systems, or of the 5.5 "data caching" (whether it caches *generated* data or just asset I/O is unknown).
- I found no Digital Foundry *interview* with Hello Games about streaming internals, only DF performance analyses (not fetched).

---

## 3. Memory: residency, caching/eviction, disk caching

### Takeaway
As of 2017, voxel data for live regions stayed resident, uncompressed, for fast edits and height queries. Region count was bounded by memory and LOD refinement; regions were created and destroyed as the octree moved. There was no indication of caching generated terrain to disk. Memory remains NMS's tightest constraint on handhelds (2026).

### Cited Findings
- "We retain these [voxels] in memory right throughout running the game, so there's definitely limited quantities that we can store. That's just to let us do really quick terrain edits, and we do height tests and other tests against the voxels fairly often… it would be possible to discard it and load it again; similarly it would probably be possible to compress it and we just haven't done that." Compression is less effective than Minecraft's binary voxels because density varies and they want it lossless. "Probably something that we'll look at in future as we try and regain more memory." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- "Our 36×36×36 regions, we can only have a limited number of those… it's pretty obvious that we're going to need to deal with LODs." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- One octree per solar system, swapped between planets, "creating regions as we need to as we move around." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- The 2D generation data is "a much larger amount of data but only retained for a short period of time" (transient per-region scratch). — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- 2024: "saves significant amounts of memory" from dual marching cubes; memory optimisations in "metadata usage, texture streaming, LOD generation and procedural mesh generation." — [Worlds Part I](https://www.nomanssky.com/worlds-part-i-update/)
- 2021: "Introduced a significant memory optimisation for PlayStation 4." — [Patch 3.73 via mp1st, 2021-11-24](https://mp1st.com/news/no-mans-sky-update-3-73-patch-notes-revisits-expeditions-this-nov-24)
- April 2026: Martin Griffiths (Hello Games engine programmer) said Switch 1, Switch 2 and Steam Deck updates involve "impossible memory constraints" and that "a bunch of us at Hello Games probably spend 2-3x more time to make these updates seamlessly work." — [FRVR, 2026-04-15](https://frvr.com/blog/no-mans-sky-dev-impossible-memory-constraints-switch-2-steam-deck-updates-take-longer/)
- Switch port (2022): Sean Murray said the Switch shows the same terrain shapes and same trees in the same places as other platforms. This is from a search-result summary; the source page was not fetched. — [TheGamer](https://www.thegamer.com/sean-murray-no-mans-sky-switch-port-parity-procedural-generation/)

### Inferences
- Determinism plus regenerate-on-demand is NMS's "cache": evicted regions are simply regenerated. An edited region must be regenerated *plus* have its edit deltas replayed (section 5).
- Cross-platform parity of generated content (same trees in the same places on Switch) implies that generation results must not depend on platform float behavior or LOD budget. Placement is seeded per point or grid cell, not per frame. Wallhammer should guarantee bit-stable generator outputs across x86/ARM, e.g., integer hashing and no FMA-sensitive paths for placement decisions.

### Gaps
- No resident-memory figures (MB of voxel or region data) published.
- No evidence either way about on-disk caching of generated terrain. Worlds II's "improved data caching" is unspecified.

---

## 4. Coordinates, precision, universe scale, orbits, gravity

### Takeaway
Within a solar system NMS uses one continuous 3D coordinate space, with gravity/up toward the planet center. Across the galaxy it uses a discrete 48-bit galactic address (region voxel X/Y/Z + system index + planet index). In the released game planets do not orbit or rotate (community-observed; pre-release claims said otherwise). I found no public detail of NMS's floating-origin or double-precision scheme.

### Cited Findings
- "Our coordinates are nice and consistent within our solar system; you can be standing on the planet, you can be in space, and you just have this 3D continuous coordinate system." Up vector = "your position relative to the center," which is "cheap and simple." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Precision is cited as a reason the infinite flat-plane approach was abandoned ("our infinite generation has precision issues"). Region overlap partly exists "to cover seams between the terrain due to precision issues." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Galactic address layout (community reverse engineering): a 48-bit value. Planet index 4 bits (47–44), solar system index 12 bits (43–32), "VoxelY" 8-bit signed (31–24), and 12-bit Z and X region fields. Portal glyphs = 12 hex digits [P][SSS][YY][ZZZ][XXX]. Signal-booster coordinates use a corner origin; portal coordinates use the galactic center. — [nms-core Rust crate docs](https://docs.rs/nms-core/latest/nms_core/address/struct.GalacticAddress.html); system index 0x79 = black hole, 0x7A = Atlas station per the fandom wiki (via search summary).
- Saved terrain edits are keyed by `GalacticAddresses` (section 5), i.e., the same address space. — [gamepretty, 2022-10-23](https://gamepretty.com/no-mans-sky-how-to-clear-all-terrain-edits-using-the-save-editor/)
- Orbits/rotation: pre-release press (2016) said planets "uniquely rotate" with day/night from real rotation. Players report that in the released game "planets never move, and don't even rotate." No official Hello Games explanation found. — search-result summary of [Daily Herald 2016](https://www.dailyherald.com/article/20160404/entlife/160409812/) and [Steam discussion](https://steamcommunity.com/app/275850/discussions/0/727997387701809649) (community; treat as unverified, though widely observed).

### Inferences
- With planets static in a system-local frame, NMS avoids moving-reference-frame physics. A system-scale floating origin (or doubles for positions plus float render offsets) suffices. Wallhammer's double/cell+float design covers this. If Wallhammer later wants rotating or orbiting planets, it needs a planet-local frame for terrain and physics. NMS evidently decided this wasn't worth it.
- Galactic address = hierarchical integer cell ID → seed. This is exactly the generator(seed, cell) pattern, applied at galaxy scale, with continuous coordinates only inside the active system.

### Gaps
- No primary source on NMS's float/double usage, origin rebasing, or physics-engine coordinate handling.
- No official numbers on planet radius or how distances inside a system are scaled. Reports suggest planets are a few km in radius, but I found no reliable source.

---

## 5. Persistence: terrain edits, bases, save format, multiplayer

### Takeaway
NMS persists player changes as a **bounded global buffer of terrain-edit records** keyed by galactic address, with age and "protected" flags. Old unprotected edits are evicted when the buffer fills, which causes the well-known "terrain regrowth." Bases are stored separately as lists of parts relative to a base computer, with per-base and per-save part caps, and are uploaded/downloaded via Hello Games servers. Edits are reapplied on top of deterministic regeneration. Base-related edits are marked protected (since Synthesis, 2020) but can still be lost.

### Cited Findings
- Save structure: `PlayerStateData > TerrainEditData` holds six arrays: `GalacticAddresses, BufferSizes, BufferAges, BufferAnchors, BufferProtected, Edits`. Emptying them clears all terrain edits. — [gamepretty guide, 2022-10-23](https://gamepretty.com/no-mans-sky-how-to-clear-all-terrain-edits-using-the-save-editor/)
- Cap: "the game caches **30,000** total terrain edits per save"; when full, edits revert "based on age and protection status," and some rules "can still revert protected edits," sometimes refilling bases. — [gamepretty, 2022](https://gamepretty.com/no-mans-sky-how-to-clear-all-terrain-edits-using-the-save-editor/). Contradicted (in number) by a Steam user's "roughly 20,000+" (via search summary). The exact cap is **unverified/possibly changed by version**.
- Community observations (Steam, 2023-07-28): "Everything you dig counts, but it's only what you do on bases that causes problems"; "the space you have available to save changed terrain is quite limited… guess it has to do with… consoles"; one player saw regrowth "even though I was far from reaching the buffer limit"; "the more places you go, the better chance that it will erase changes made on an earlier planet." — [Steam thread](https://steamcommunity.com/app/275850/discussions/0/3802778195617637990) (anecdotal)
- Official patch history:
  - Beyond 2.16 (2019-11-07): "Prevented terrain edits from being made inside any bases that you do not have permission to edit, or within 2km of a featured base"; "small bases made on planets with a featured base are no longer automatically downloaded to all players." — [nomanssky.com](https://nomanssky.com/2019/11/beyond-patch-2-16)
  - Synthesis (2.2, Nov 2019 – Jan 2020): introduced "protected terrain edits": once you flatten a hill in a base, "it stays flattened." Terrain Manipulator edits within base bounds are "protected in the same way as edits made by base parts." Search-result summaries of [TechSpot](https://www.techspot.com/news/82974-no-man-sky-synthesis-update-adds-highly-requested.html) and [Twinfinite](https://twinfinite.net/?p=521350); I could not fetch either page directly.
  - 3.73 (2021-11-24): "Fixed an issue that could cause protected terrain edits inside a player's base to occasionally be overwritten when downloading a large number of terrain edits from other player's bases." Also "a significant base-building networking optimisation" and "Fixed a rare issue that could cause very large player bases to crash when loading." — [mp1st](https://mp1st.com/news/no-mans-sky-update-3-73-patch-notes-revisits-expeditions-this-nov-24) (the full fix line is from a search summary; the page fetch truncated it)
  - A patch (version unconfirmed) "fixed an issue where terrain edits caused by building parts would regenerate in multiplayer." — search summary of PlayStation LifeStyle.
- Base limits (community/wiki): up to 3,000 parts per base can be uploaded to the shared server (larger bases still exist locally but only the first 3,000 parts upload). Per-save totals are cited as about 16,000 parts in bases (one Reddit reply adds 4,000 outside bases) and about 400–450 bases. — search summaries of the [NMS fandom wiki "Base building"](https://nomanssky.fandom.com/wiki/Base_building) and Steam/Reddit threads. The fandom wiki itself returned HTTP 402 to my fetch, so these are **unverified secondhand**.
- Save file format (community tooling): saves (`save*.hg`) are sequences of **LZ4 blocks** (magic `0xFEEDA1E5`, null-padded) containing **JSON with obfuscated keys**. These are deobfuscated using MBINCompiler's `mapping.json`; an obfuscated save begins with `{"F2P"` (the obfuscated "Version" key). — [nms-save crate (docs.rs)](https://docs.rs/nms-save/0.2.0/src/nms_save/lib.rs.html); [NMS Base File Editor](https://github.com/NightCodeOfficial/NMS-Base-File-Editor)
- Worlds I/II explicitly avoided invalidating edits: "Underlying terrain shapes have not been reset and existing planetary bases will not be moved" (5.0); "Terrain in existing systems has not been regenerated, and bases have not been reset" (5.5). — [Worlds I](https://www.nomanssky.com/worlds-part-i-update/), [Worlds II](https://www.nomanssky.com/worlds-part-ii-update/)
- From 2017: voxels are kept in memory "to let us do really quick terrain edits." Points of interest must be identical for all players, which is one reason for the true-sphere design ("we have some network aspects that use that"). — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)

### Inferences
- The array names suggest a design of: per galactic address (planet), a buffer of edit operations with a size, an age (timestamp/sequence) and a protected flag, positioned relative to an **anchor** (likely a region or local origin, so edits can be stored compactly in floats or small ints relative to the anchor). `Edits` likely holds compact operation records (position, radius/shape, add/subtract/flatten, material), not voxel snapshots. This is inferred from the field names only; I found no authoritative schema.
- Reapplication model (inferred): regenerate region voxels deterministically → replay all edits overlapping the region in order → polygonize. This is why new generator versions risk shifting terrain under old edits, and why Hello Games repeatedly promises that "underlying terrain shapes have not been reset." **Key lesson for Wallhammer:** version the generator per world or cell and freeze the version for any cell with deltas, or store edits as absolute target densities rather than relative ops.
- The global-cap + LRU-by-age + "protected" pin is a pragmatic answer to unbounded edit growth across 18 quintillion planets. Its failure mode (silent regrowth, base burial) is the most-complained-about persistence bug. A better design for Wallhammer: per-cell delta files (sparse voxel diffs) with pinning tied to ownership. Eviction only for unpinned, never-revisited, low-magnitude edits, with UI disclosure.
- Multiplayer: everyone generates the same world locally from seed. Only deltas (terrain edits, base part lists) are exchanged, peer-to-peer in session and through Hello Games servers for uploaded bases. Downloaded edits from others enter the same bounded buffer (implied by the 3.73 fix), so other players' bases can evict yours.

### Gaps
- No official documentation of the edit record format, the cap value per version, the eviction policy, or how/when edits sync in sessions.
- Fandom wiki pages (Terrain Manipulator, Base building) were blocked (HTTP 402/Anubis), so wiki-stated caps are only from search snippets.

---

## 6. Engine and tech details, ports (threading, interviews, Switch/PS5/Mac)

### Takeaway
NMS runs on a small team's custom C++ engine that is "agnostic to procedural content." Hello Games publishes little deep tech beyond GDC 2017 and patch notes. The Mac port (June 2023, not 2024) moved to Metal 3/MetalFX with a "new rendering pipeline." Handheld ports are memory-bound. Engine evolution since 2024 is visible only through patch notes and developer social posts.

### Cited Findings
- "We work on our own engine and that's written in C++." It was chosen about 4 years before 2017 because no visible voxel projects existed in Unreal/Unity, and because of source-access concerns. About 20 people (about 10 programmers, 5 artists) at the time. "We ship simultaneously on PC and PS4." "Our engine is really agnostic to procedural content… our engine doesn't really care whether we generate the content online or whether we loaded it… a texture is a texture." — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Generator chain: positional seed → solar system info → planet info (+ planet seed) → terrain generator → voxels. Intermediate data between generators is stored "mostly as XML data that we can write out and store," so any stage can be dumped, reloaded, and replayed for debugging and perf regression. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Generation must be "data-local": "if we're generating a single voxel it can't know anything about any of the other voxels round about it — it is stateless." Erosion is modeled as an end-state look, not a simulation. — [GDC 2017](https://www.youtube.com/watch?v=sCRzxEEcO2Y)
- Mac: released 2023-06-01 (Steam, Mac App Store), using Metal 3 and MetalFX upscaling, "built from the ground up with a new rendering pipeline to take full advantage of Metal and Apple silicon." Cross-save with PC; cross-play. Marketing statements only; no technical deep dive found. — search summaries of [nomanssky.com "No Man's Sky on Mac" (2023-06)](https://www.nomanssky.com/2023/06/no-mans-sky-on-mac) and [TechSpot](https://www.techspot.com/news/98915-no-man-sky-landed-macos-crossplay-cross-save.html). A [Tom's Guide exclusive interview](https://www.tomsguide.com/features/exclusive-no-mans-sky-developer-shares-how-they-brought-it-to-macos-and-whats-next-for-mac-gaming) exists but its contents could not be retrieved.
- Worlds Part II added 120 Hz/VRR on PS5, reworked GTAO, shadows, materials, and water. — [Worlds II notes](https://www.nomanssky.com/worlds-part-ii-update/)
- Martin Griffiths (engine programmer): handheld updates under "impossible memory constraints" (2026). PS5 3-planets-in-50-s demo (2024). — [FRVR](https://frvr.com/blog/no-mans-sky-dev-impossible-memory-constraints-switch-2-steam-deck-updates-take-longer/), [80.lv](https://80.lv/articles/3-planets-in-under-a-minute-a-closer-look-at-the-power-of-no-man-s-sky-s-engine)
- Community reverse engineering: a 2016 3D Game Dev Blog analysis of procedural model assembly was covered by [PC Gamer](https://www.pcgamer.com/code-analysis-of-no-mans-sky-praises-engine-criticises-unfinished-game) and [Game Developer](https://gamedeveloper.com/programming/what-the-code-of-i-no-man-s-sky-i-says-about-procedural-generation); not fetched in detail. Sean Murray's separate GDC 2017 talk "Building Worlds Using Math(s)" covers noise and terrain math, not streaming. — [GDC Vault 1024514](https://gdcvault.com/play/1024514/Building-Worlds-Using)

### Inferences
- "Engine agnostic to procedural content" is the same principle as Wallhammer's "cell from cooked file or generator, same data." NMS validates it at shipping scale, including generator outputs that are serializable (XML) for debugging. Wallhammer should make generator output serializable to the same cooked cell format, which also gives a free disk cache and golden-file tests.
- The 2017 two-thread-plus-jobs model was adequate for PS4-class hardware. Wallhammer's work-stealing design is strictly more capable. The main lesson is to minimize main-thread commit points (buffer upload, physics insert, entity spawn) and to batch them per frame.

### Gaps
- No Digital Foundry *technical interview* with Hello Games on streaming found. No Switch-port technical breakdown from Hello Games beyond PR quotes (the Nintendo Life interview returned 403).
- No public info on whether NMS uses Vulkan on PC (it has a Vulkan renderer since ~2019 per general knowledge, but I did not source it in this session, so treat it as unverified here).

---

## 7. Comparable techniques (patterns to fill gaps)

### Takeaway
Minecraft gives the clearest documented model for **staged generation with neighbor dependencies** (ChunkStatus / proto-chunks) and **ticket-based load levels**. Valheim shows simple fixed-grid zone tiers (active/loaded/distant). Space Engineers stores planet edits as a per-planet delta file that grows with modification. These sources fill gaps in NMS: explicit stage graph, load-level propagation, delta storage.

### Cited Findings
- **Minecraft (Java) chunk statuses**, current order: `empty → structure_starts → structure_references → biomes → terrain → features → initialize_light → light → spawn → full`. All statuses before `full` are "proto-chunks." In 26.3 snapshot 10, `noise`, `surface` and `carvers` were merged into `terrain`; 23w16a removed `liquid_carvers` and `heightmaps` and added `initialize_light`. — [Minecraft Wiki: Chunk format](https://minecraft.wiki/w/Chunk_format)
- Stage semantics: structure_starts computes piece positions for structures starting in the chunk. structure_references stores references in *nearby* chunks (a cross-chunk dependency). features places features and structure pieces and builds heightmaps. full converts the proto-chunk to a level chunk and executes "all block updates deferred in the above steps." Far chunks "may be frozen at an early step"; as a player approaches, they continue through the remaining steps. — [Minecraft Wiki: World generation](https://minecraft.wiki/w/World_generation)
- **Tickets and load levels:** a chunk loads when it receives a ticket (type, level, ticks-remaining). The lowest level wins. Levels propagate to neighbors +1 per step up to 44. Entity Ticking ≤31; Block Ticking 32; Border 33; Inaccessible 34+ ("world generation still occurs"). Example ticket types: player loading (31), forced (31, persisted, `/forceload`), portal (30, radius 3, 15 s), spawn (30, radius 3). — [Minecraft Wiki: Chunk](https://minecraft.wiki/w/Chunk)
- **Valheim:** world split into 64×64 m zones managed by `ZoneSystem`; each zone can hold one location plus vegetation. — [Jötunn modding docs](https://valheim-modding.github.io/Jotunn/tutorials/zones.html). Tiers: active area = current zone + neighbors; loaded area (default 3 zones) where structures are visible; distant area (default 5 zones) where large static objects like trees appear, and most objects in it are destroyed right after generation. — [Nexus mod page (mod defaults)](https://www.nexusmods.com/valheim/mods/1842)
- **Space Engineers:** each planet has a `.vx2` file that grows as voxels are mined or blasted. Edited procedural asteroids get their own file. — [Steam discussion](https://steamcommunity.com/app/244850/discussions/0/3460470383682489144) (community). A Keen QA report notes that heavy voxel removal grew a cache until loading slowed noticeably (Won't Fix). — via search summary of support.keenswh.com.

### Inferences
- For Wallhammer, combine three patterns. From NMS: coarse-first, view-prioritized, fade-in, deterministic per-cell generation. From Minecraft: an explicit per-cell status machine where some stages require neighbors at stage N−1 (needed for anything crossing cell borders: structures, roads, city blocks). From Minecraft tickets: integer load levels propagated from sources (player, camera lookahead, scripted forceload, portals or cutscene targets) that drive both generation depth and simulation tier. Velocity-based lookahead can be expressed as an extra ticket placed ahead of the player. NMS's equivalent is its "point-based, in-front-first" ordering.
- Minecraft's proto-chunk "frozen at stage" idea is directly useful for cities. Generate the city layout (structure_starts/references equivalents) far out cheaply, and finish mesh, physics and props only near the player.

### Gaps
- Enshrouded and Astroneer: no sources gathered in this session (time budget). Minecraft's per-stage neighbor radii and worker-thread model are not documented on the wiki pages fetched.
