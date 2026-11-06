# PCG frameworks in current game engines (state 2025–2026), compared with Wallhammer Zero

Research date: 2026-11-06. Epic doc pages fetched today render as "Unreal Engine 5.8 Documentation", so the descriptions below are current as of UE 5.8 docs unless a version is stated. Our baseline for comparison: C17 pure generators `(recipe, seed) -> data`, tier-A determinism, L3–L0 cell hierarchy (4 km / 1 km / 256 m), stable IDs from hash(world seed, rule hash, anchor key), per-cell deltas, versioned generator domains, no node editor (wallhammerzero/docs/ARCHITECTURE.md).

## 1. Unreal Engine PCG framework (5.2–5.8)

### Takeaway
UE PCG is a node graph over spatial and point data. Points carry a position-derived seed. Generation is partitioned on a grid, can be hierarchical (several grid sizes, larger grids feed smaller ones through a cache), and can run at runtime around "generation sources" with per-grid radii. It became production-ready in 5.7 (Sept/Nov 2025). GPU execution is Beta or Experimental. The engine gives no bit-exact cross-platform guarantee, and manual edits are handled by editor "dirty modes" and baking, not by a delta layer like ours.

### Cited Findings
**Status and versions**
- UE 5.7 declares the PCG framework production-ready. Epic says it is "suitable for use in final projects" and recommends "verifying runtime performance and scalability before adoption". 5.7 also adds a dedicated PCG Editor Mode and GPU compute optimizations. — [Digital Production, 2025-11-12](https://digitalproduction.com/2025/11/12/unreal-engine-5-7-foliage-pcg-and-in-editor-ai/)
- 5.7 PCG is reported as "almost twice as fast" as in 5.5. 5.7 adds GPU parameter overrides and lets PCG graphs run in standalone mode. — [TweakTown, 5.7 preview](https://www.tweaktown.com/news/107858/unreal-engine-5-7-preview-now-out-with-production-ready-procedural-content-generation-framework/index.html) (secondary source)
- 5.6 brought GPU-performance improvements for dense instance scenes, multithreading, a 3D viewport preview in the PCG editor, and PCG Biome Core v2 (per-biome blending, biome layering). — [Puget Systems, 2025-06-19](https://www.pugetsystems.com/blog/2025/06/19/unreal-engine-5-6-faster-open-worlds-smoother-animation-better-icvfx/); [UE forum, 5.6 released](https://forums.unrealengine.com/t/unreal-engine-5-6-released/2538952)
- Known 5.6.1 issue: "[PCG] RuntimeGen broken when PCG Volume assigned to Data Layer". FastGeo also rejects non-spatially-loaded actors on runtime data layers. — [UE forum, 5.6.1 hotfix](https://forums.unrealengine.com/t/5-6-1-hotfix-released/2639316)

**Graph model and data**
- Data types:
  - Spatial data: volumes, surfaces (e.g. Landscape mapped to XY), lines (splines, landscape splines), points (point clouds with bounds) and Polygon2D.
  - Composite data: union, intersection and difference, evaluated lazily until converted back to explicit data.
  - Attribute sets: user variables stored as metadata. — [Epic: PCG data types reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-framework-data-types-reference-in-unreal-engine)
- Point properties: Transform, BoundsMin/Max, Color, Density (0–1), Steepness and Seed. — [Epic: data types reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-framework-data-types-reference-in-unreal-engine)
- The point Seed "is computed from the position in order to be world-position consistent". Attributes can drive node settings through "advanced pins" (parameter override). — [Epic: data types reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-framework-data-types-reference-in-unreal-engine)
- APIs exist for seeds and random streams: `ComputeSeedFromPosition`, `GetRandomStreamFromPoint` (point seed combined with the settings or component seed) and a Mutate Seed node (position + user seed). The exact hash is not documented. — [API: ComputeSeedFromPosition 5.5](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/PCG/Helpers/UPCGBlueprintHelpers/ComputeSeedFromPosition?application_version=5.5); [API: GetRandomStreamFromPoint](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/PCG/Helpers/UPCGBlueprintHelpers/GetRandomStreamFromPoint?application_version=5.5); [API: UPCGMutateSeedSettings](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/PCG/UPCGMutateSeedSettings)

**Partitioned, hierarchical and runtime generation**
- Partitioned generation:
  - Turned on with "Is Partitioned".
  - Grid size is "Partition Grid Size" on the PCGWorldActor. Changing it requires Cleanup and then Generate on each PCG asset.
  - Supports World Partition streaming and Level Instancing. — [Epic: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- Hierarchical Generation (HiGen):
  - Requires partitioning.
  - A "Grid Size" node sets the grid for all downstream nodes. Large grids are meant for big, sparse meshes and small grids for numerous small ones.
  - "Unbounded" runs once for the whole component.
  - A node with inputs from several grid sizes outputs at the smallest one.
  - Subgraphs inherit the grid size. — [Epic: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- Caching runs only from larger to smaller grids: data from a coarse grid is available as cached input to finer grids. Passing coarse data down can duplicate points into every cell, and "Cull Points Outside Actor Bounds" removes them. Actor pooling (`pcg.RuntimeGeneration.EnablePooling`) is separate from data caching. — [Epic: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- Runtime generation:
  - Turned on with Generation Trigger = "Generate at Runtime". Components are generated and cleaned up near Generation Sources, in the editor, PIE and standalone builds.
  - Source types: the editor viewport, player controllers, World Partition streaming sources, and PCG Generation Source Components attachable to any actor. — [Epic: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- Radius and scheduling:
  - "Generation Radii" are set per grid size and can be overridden per component. Radii must grow with grid size.
  - A Cleanup Radius Multiplier gives hysteresis.
  - Scheduling prioritizes by distance and view direction ("Direction Weight").
  - Optional frustum culling, with Generate and Cleanup Bounds Modifiers. — [Epic: PCG generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)

**GPU execution**
- PCG GPU processing is labelled Beta, and the GPU spawning path Experimental. GPU-capable nodes:
  - Copy Points
  - Static Mesh Spawner
  - Custom HLSL
  - Attribute Partition
  - Cull Points Outside Actor Bounds
  - Data Count
  - Normal to Density
  - Transform Points — [Epic: PCG with GPU processing](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-with-gpu-processing-in-unreal-engine)
- The Custom HLSL node has four kernel types (Point Processor, Point Generator, Attribute Processor, Custom), a Seed property and no CPU fallback. — [Epic: PCG GPU](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-with-gpu-processing-in-unreal-engine)
- GPU Static Mesh Spawner:
  - Builds instances in GPU memory, and they are not persisted.
  - Has no collision, navigation, ray tracing, distance fields, baked lighting or HLOD.
  - Componentless spawning through FastGeo is experimental. — [Epic: PCG GPU](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-with-gpu-processing-in-unreal-engine)
- Weighted mesh selection on the GPU breaks if point seeds are identical (instances can go missing), so the docs recommend `ComputeSeedFromPosition()`. The doc does not discuss determinism. — [Epic: PCG GPU](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-with-gpu-processing-in-unreal-engine)

**Manual edits and regeneration**
- `EPCGEditorDirtyMode` has three values:
  - Normal: generation dirties and saves the generated resources.
  - Preview: generation changes are never saved.
  - Load as Preview: normal until the next load, then transient, keeping the last saved generation until regenerated. — [API: EPCGEditorDirtyMode](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Plugins/PCG/EPCGEditorDirtyMode); [Python API 5.7](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/PCGEditorDirtyMode?application_version=5.7)
- I found no Epic document describing per-instance "override" layers that survive regeneration. The documented mechanisms are dirty modes, Cleanup/Generate, and exclusion through graph inputs (volumes, splines, Polygon2D used as difference). See Gaps.

**Determinism in practice (third-party)**
- A practitioner blog (bugnet.io, low-to-medium reliability, no engine version) lists causes of non-deterministic PCG:
  - Nodes not seeded "From Component".
  - Merge order of parallel branches.
  - Async completion order.
  - Float differences across CPUs and compilers near thresholds.

  Its fixes:
  - Sort merged inputs by a stable key.
  - Use synchronous generation.
  - Quantize to an integer grid before inclusion decisions and apply jitter with a separate seed.
  - For bit-exact multiplayer, generate on the server and replicate. — [bugnet.io](https://bugnet.io/blog/fix-unreal-pcg-determinism-different-results)
- The same post says `Seed From Position` is stable "as long as the graph structure doesn't change". — [bugnet.io](https://bugnet.io/blog/fix-unreal-pcg-determinism-different-results)

**PCG Biome Core**
- Biome Core is an experimental, data-driven biome plugin, and Epic recommends copying it before production use. The pipeline:
  1. Build a Biome Cache from biome actors.
  2. Generator graphs produce root points.
  3. Apply biomes and run filters (filter graphs write a filter attribute from logic or texture projection).
  4. Spawn assets.
- Biome Core Runtime is a separate PCG component and graph for detail near the camera, on grid cells driven by streaming or generation sources. It is configured with data assets. The sample shows attribute-set tables, feedback loops, recursive subgraphs and runtime hierarchical generation. — [Epic: Biome Core reference 5.5](https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-reference-guide-in-unreal-engine?application_version=5.5); [Biome Core overview 5.5](https://dev.epicgames.com/documentation/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine?application_version=5.5); [Biome Core Runtime](https://dev.epicgames.com/documentation/unreal-engine/biome-core-runtime)

**Procedural Vegetation Editor (5.7, Experimental)**
- The PVE is a node-based tool built on PCG nodes for creating Nanite-ready foliage. You can adjust tree structure under gravity, scale branches and leaves, swap models, and export static or skeletal meshes. It ships with Quixel Megaplants presets that are editable in the graph. — [AlternativeTo, 5.7 news](https://alternativeto.net/news/2025/11/unreal-engine-5-7-adds-procedural-content-generation-nanite-foliage-and-metahuman-updates); [cgpress 5.7 preview](https://cgpress.org/archives/unreal-engine-5-7-preview-released-with-new-procedural-and-material-tools.html)
- Nanite Foliage (Experimental) combines Nanite Assemblies, Nanite Skinning (wind) and Nanite Voxels. Physics, collision and wind support are incomplete. — [Digital Production](https://digitalproduction.com/2025/11/12/unreal-engine-5-7-foliage-pcg-and-in-editor-ai/)
- A user report on 5.7.4 says non-Nanite export from the PVE is broken. — [UE forum](https://forums.unrealengine.com/t/procedural-vegetation-editor-cannot-export-non-nanite-foliage/2718593)

**Mass and City Sample (procedural city, crowds, traffic)**
- The City Sample city (layout, roads, freeway, lots, buildings, street furniture) is generated offline in Houdini 18.5.532 with Houdini Engine 3.5.2. It is exported as a huge point cloud that an Unreal "Rule Processor" converts into instances. Build stages follow dependency order (layout, roads, freeway, lots/sidewalks, traffic/buildings/ground, furniture/decals/audio). Buildings use a shape grammar on volumes. — [Epic: City Sample](https://dev.epicgames.com/documentation/en-us/unreal-engine/city-sample-project-unreal-engine-demonstration)
- Crowds and traffic:
  - MassEntity, a data-oriented framework, drives both.
  - Mass Spawners combine an Entity Type with Spawn Data Generators.
  - Entity Definitions are trait bundles (visuals, LOD, behavior).
  - Spawn points are generated along ZoneGraph lanes (a lightweight corridor graph with tags) that are derived from the Houdini data.
  - Crowds use StateTree. Traffic does not.
  - Distant crowd members are vertex-animated static meshes. — [Epic: City Sample](https://dev.epicgames.com/documentation/en-us/unreal-engine/city-sample-project-unreal-engine-demonstration)
- Community: users struggle to reproduce City Sample traffic without the Houdini pipeline. The traffic code lives in a modified plugin that did not carry over cleanly between engine versions. — [UE forum](https://forums.unrealengine.com/t/my-mass-traffic-ai-cant-run-abide-by-the-traffic-rule/585838); [UE forum, 5.1](https://forums.unrealengine.com/t/unreal-engine-5-1-released/691237/113)

### Inferences
- UE's HiGen (coarse grid feeding finer grids through a one-way cache, with radius growing per level) is structurally the same as our L3→L0 hierarchy. Our design already matches it. The ideas worth copying are:
  - Per-level generation and cleanup radii with hysteresis.
  - Scheduling weighted by view direction.
  - The "inputs from several levels → output at the finest level" rule.
- UE's point seed is position-derived. Our anchor-key hash is stronger: it survives position jitter or small moves if the anchor key is logical rather than positional.
- UE does not promise bit-exact results. Its users fall back on server-side generation plus replication, so our tier A is a real differentiator.
- The duplicated-points-across-cells problem (coarse data passed into fine cells) maps to our need for an explicit ownership rule: each object is owned by exactly one cell, at the level that generated it.
- Manual edits in UE come down to "bake or don't". Our per-cell delta layer is more capable. UE does have exclusion-by-shape inputs (difference with volumes, splines, Polygon2D), which we could support as recipe-level "masks" separate from deltas.
- GPU generation in UE trades persistence, collision and determinism for speed. That fits our rule that generators are CPU-only at tier A. A GPU pass could at most be a tier-B cosmetic layer (grass).
- City Sample shows the pattern of offline generation into point clouds, a rule processor that turns them into instances, and lane graphs that feed crowds and traffic. That matches our `eng_sim` global graphs (roads) plus mass entities.

### Gaps
- The exact `ComputeSeedFromPosition` hash and whether it is stable across engine versions are not documented. The Epic 5.7 release-notes page returned 403.
- No official Epic statement on cross-platform PCG determinism was found.
- No first-party doc was found on per-instance overrides that persist through regeneration.
- No detailed source was found on the 5.6 point-data refactor or the PCG shape grammar nodes, and no source on PCG ↔ Mass integration beyond City Sample.

## 2. Houdini Engine and Houdini-driven pipelines

### Takeaway
HDAs are versioned, parameterized node networks cooked inside a host (editor) session or in batch (PDG/TOPs). Cooked outputs stay temporary until "baked" into native assets. Studios keep results stable by versioning HDA definitions (`ns::name::2.0`) and by baking, rather than by runtime determinism.

### Cited Findings
- There are two versioning systems:
  - Version in the internal name (`mynode::2.0`). Old and new versions coexist, and old nodes keep their old behavior with no automatic upgrade.
  - The asset definition's Version field. When an instance sees a changed version string it can run an upgrade handler script, which SideFX calls "mostly useful in a studio environment".
- For incompatible changes, SideFX says to create a new asset with the same name and namespace and a higher version. — [SideFX: asset versioning](https://sidefx.com/docs/houdini/assets/versioning_systems.html)
- Namespaces carry the studio or project. Pipelines keep the operator version in sync with the file-path version. Upgrading a parent HDA can break embedded child HDAs tied to its namespace. — [TAO wiki](https://techartorg.github.io/TAO-Wiki/Houdini/Houdini-HDA-Naming-Conventions); [Prism forum](https://prism-pipeline.com/forum/topic/houdini-hda-management/); [SideFX forum](https://www.sidefx.com/forum/topic/90228/)
- Houdini Engine for Unreal with PDG:
  - The PDG Asset Link cooks a TOP network embedded in an HDA and imports the results as Unreal assets.
  - Outputs are owned by the Houdini Asset Actor and can be overwritten or destroyed on recook until you Bake, which detaches them.
  - Auto Cook is optional. — [SideFX: Unreal PDG](https://www.sidefx.com/docs/houdini/unreal/pdg.html); [PDG settings (Houdini 22.0 docs)](https://www.sidefx.com/docs/houdini/unreal/pdgsettings.html)
- City Sample used Houdini 18.5 / HE 3.5.2 offline. The building generator HDA requires a SideFX license. — [Epic: City Sample](https://dev.epicgames.com/documentation/en-us/unreal-engine/city-sample-project-unreal-engine-demonstration)

### Inferences
- Houdini's "namespace::version" scheme is the same idea as our versioned generator domains. The `::2.0` coexistence model, where saves pin the old version and old content keeps the old generator, is the strongest precedent for keeping old generator versions callable rather than migrating.
- The upgrade-handler idea maps to a delta migration function per domain version bump.
- "Bake detaches output from the generator" is the industry's main answer to regeneration instability. Our D8 equivalent is "a cell can come from a generator or a pre-baked file in the same format".

### Gaps
- No 2024–2026 talk was found on how studios guarantee identical HDA output across Houdini versions. Floating-point and solver drift between Houdini releases is anecdotally known, but I found no source.

## 3. Unity (first-party and third-party)

### Takeaway
As of 2025–2026 Unity has no first-party PCG framework comparable to UE PCG. Unity shipped Graph Toolkit, a framework for building custom node editors, as an experimental package in Unity 6.2. Procedural world generation in Unity remains the domain of third-party tools such as MapMagic 2 and Gaia.

### Cited Findings
- Graph Toolkit:
  - Shipped as `com.unity.graphtoolkit` 0.1.0-exp.1 with Unity 6.2. 6.2 is a hard requirement with no backports.
  - It evolved from Graph Tools Foundation and is meant for building custom graph tools. Samples show how to connect the graph UI to runtime execution.
  - Early users complain that internals are locked down. — [Unity Discussions: Graph Toolkit in 6.2](https://discussions.unity.com/t/unity-s-graph-toolkit-experimental-available-today-in-unity-6-2/1664909); [Graph Toolkit Q1 2025 update](https://discussions.unity.com/t/unity-graph-toolkit-update-q1-2025/1614727); [page 13 user feedback](https://discussions.unity.com/t/unity-s-graph-toolkit-experimental-available-today-in-unity-6-2/1664909?page=13)
- MapMagic 2:
  - A node-based generator (noise, voronoi, blend, curve, erosion) for endless maps that generates terrain tiles in play mode, with a "pinned" pre-generated mode.
  - A threading singleton prevents running two at once.
  - 2020 reports mention ungenerated tiles in IL2CPP builds and seams between tiles. These are old and may be fixed. — [Fab listing](https://www.fab.com/listings/94f02067-7728-4fb1-a39d-d6372a6161a7?lang=tr); [Unity forum thread](https://discussions.unity.com/t/map-magic-world-generator-a-node-based-procedural-and-infinite-game-map-tool/619852?page=191); [quire tracker #585](https://quire.io/w/mapmagic2/585)

### Inferences
- In Unity, the "engine-level PCG framework" is a graph-editor toolkit plus whatever runtime the user writes. This is closer to our "generators are code" stance than UE is.
- MapMagic's seam and threading issues show what goes wrong with tiled runtime generation when neighbor dependencies are not formalized. Our hierarchical parent-cell inputs address this.

### Gaps
- I found no official 2025–2026 Unity roadmap item for a first-party PCG system. A gamineai.com blog claims "procedural generation tools" on Unity's roadmap but cites no official source, so I excluded it.
- No sources were gathered on DOTS/ECS procedural workflows or on Gaia specifics.

## 4. Godot 4

### Takeaway
Godot has no built-in PCG framework. The common stack is ProtonScatter (scattering) plus Terrain3D (C++ clipmap terrain), both community addons.

### Cited Findings
- ProtonScatter (MIT, about 3k stars):
  - Rewritten for Godot 4 and incompatible with Godot 3 scatter objects.
  - A `ProtonScatter` node holds a Blender-like modifier stack: point creators (grid, random, along edge) and transform modifiers. `ScatterItem` chooses assets. `ScatterShape` (Box, Sphere, Path, combinable) defines areas, and negative shapes exclude.
  - Described as "procedural, non-destructive".
  - The README says nothing about seed or determinism guarantees. — [GitHub HungryProton/scatter](https://github.com/HungryProton/scatter)
- Terrain3D: an editable terrain system for Godot 4, written in C++, using clipmap geometry. — [GitHub (fork) Terrain3D](https://github.com/Nader-B10/Terrain3D)
- The two are used together in commercial asset packs, for example the Canyon Terrain Pack. — [itch.io devlog](https://loafbrr.itch.io/canyon-terrain-asset/devlog/675457/canyon-terrain-pack)

### Inferences
- The modifier-stack model, an ordered list of point ops written as data, is a good template for our text recipes. It is a linear pipeline without a graph and is easy to diff.

### Gaps
- Not covered: ProtonScatter's seed/runtime behavior, Terrain3D's official repo (TokisanGames) and its feature list, and other Godot PCG addons. The fork link is not the canonical repo.

## 5. Node graph vs code

### Takeaway
I found no rigorous comparison. Practitioner opinion says graphs win for artist iteration and visibility of intermediate steps, and text wins for diffing, merging, scale and maintainability. The industry trend is hybrid: graphs whose nodes are written in code (UE Custom HLSL and C++ PCG nodes, Houdini VEX inside SOP networks, Unity Graph Toolkit as a framework).

### Cited Findings
- A Houdini artist preferred nodes over VEX for geometry building because seeing each SOP step makes the process easier to follow, and called it a matter of preference. — [80.lv](https://80.lv/articles/006sdf-using-houdini-to-simulate-buildings/)
- The procedural-network case: one-off work is faster in layer-based tools, while work repeated "a hundred times with changes" favors a procedural network. VEX coexists with nodes. — [SuperRendersFarm](https://superrendersfarm.com/article/what-is-houdini) (vendor blog)
- Against visual scripting: graphs are hard to diff, lack merge support ("you can lock but there's no merge"), and turn into "spaghetti" after hours of work. In favor: state machines and flow control. — [r/gamedev thread, 2023](https://redlib.hbubli.cc/r/gamedev/comments/17wslpv/programmers_has_visual_scripting_helped_you_in); [gamedev.net](https://gamedev.net/forums/topic/675396-visual-scripting-vs-coding) (older)
- Hybrid examples in UE:
  - The Custom HLSL node injects code into the graph.
  - Compute Source assets share HLSL between nodes.
  - Attributes override node parameters through pins. — [Epic: PCG GPU](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-with-gpu-processing-in-unreal-engine)

### Inferences
- An AI-authored, code-only pipeline removes the graph's main advantage (a human artist iterating visually) and keeps the code advantages (diffs, review, determinism control).
- What graphs give that we must replace with tooling:
  - Inspecting intermediate data at any node (UE Attributes List, Houdini node-by-node view).
  - Partial recook of only the changed downstream nodes.
- Cheap equivalents for us:
  - Named stages inside a generator.
  - A debug dump of each stage's point set per cell in `wz_studio`.
  - A Merkle cache keyed by (stage, inputs hash), which is already in `eng_asset`.

### Gaps
- No 2024–2026 talk or blog by Inigo Quilez, Oskar Stålberg or the PCG workshop community on graph vs code was retrieved, so practitioner opinion here rests on forums and vendor blogs.

## 6. Determinism features: seeds, ordering, versioning, regeneration stability

### Takeaway
Engines handle determinism with position-derived seeds and component seeds. They do not guarantee cross-platform bit-exactness, stable ordering under parallel merge, or generator-version pinning. Studios get stability by baking (Houdini, City Sample point cloud) and by asset versioning (HDA `::version`). "Small change → local change" is achieved structurally through partition grids, so a change re-generates only the affected cells.

### Cited Findings
- UE: per-point seed from world position; component and node seeds; Mutate Seed; `ComputeSeedFromPosition`. — [Epic data types](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-framework-data-types-reference-in-unreal-engine); [API Mutate Seed](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/PCG/UPCGMutateSeedSettings)
- Non-determinism sources in UE PCG practice: merge order, async completion, float drift; fixes are stable sort keys and quantization. — [bugnet.io](https://bugnet.io/blog/fix-unreal-pcg-determinism-different-results)
- Partition grid changes require full Cleanup and Generate, so the grid is part of the "version". — [Epic generation modes](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-generation-modes-in-unreal-engine)
- HDA versioning lets old and new generator versions coexist, with optional upgrade scripts. — [SideFX versioning](https://sidefx.com/docs/houdini/assets/versioning_systems.html)
- Third-party PCGEx "Refresh Seed" ensures points at the same location get the same seed, with an optional base-seed offset. — [PCGEx docs](https://pcgex.gitbook.io/pcgex/node-library/metadata/modify/refresh-seed)

### Inferences
- Features we likely already exceed: cross-platform bit-exactness (tier A), logical anchor-key IDs instead of position seeds, and versioned domains with deltas.
- Features worth checking that we might be missing:
  1. Explicit stable ordering rules for every merge or union step: sort by stable ID before any order-dependent random draw.
  2. Separate RNG streams per purpose (placement vs jitter vs variant), so tweaking one rule does not shift others. UE users approximate this with Mutate Seed; we can derive sub-seeds from the rule hash.
  3. Changing a cell size is a breaking version change, as in UE.
  4. Exclusion and mask inputs (volumes, splines, polygons) as authored data, distinct from deltas.
  5. Generation and cleanup radii per hierarchy level with hysteresis, plus view-direction priority.
  6. A per-stage cache from coarse to fine levels, never upward.
  7. A "Preview vs save" mode for generated output in tools.
  8. A regression test that hashes each cell's output per domain version (golden hashes) to detect unintended non-local changes. No engine documents this as a feature; Houdini studios rely on baking instead.

### Gaps
- I found no published metric or talk on "regeneration stability" (how far a parameter change propagates) in UE PCG or Houdini pipelines. Older Ubisoft (Far Cry 5, GDC 2018) and Guerrilla (Horizon Zero Dawn, GDC 2017) talks are relevant but outside 2024–2026 and were not fetched.
