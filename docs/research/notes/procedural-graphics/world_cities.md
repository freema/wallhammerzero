# Procedural generation of open worlds and cities (terrain, roads, districts, lots, buildings, vegetation) for a chunk-streamed C17 engine

Scope note: engine streams 128–256 m cells; a cell is either cooked from disk or produced by `generator(seed, cell_x, cell_y, lod)` emitting archetypes + instances + meshes, run on a work-stealing job system, must be deterministic. Below, "RUNTIME" = plausibly fast enough to run per cell during streaming; "OFFLINE" = bake/cook-time or editor-time only. Classification is my engineering judgement unless a source is cited.

Research budget note: about 20 search/fetch calls. Several primary sources (HZD slide PDF > 10 MB, GDC Vault videos, Mei et al. PDF, Vanegas PDF) could not be read in full; claims from them are limited to what abstracts, slide-text excerpts and secondary summaries showed. Those limits are listed under Gaps.

---

## 1. Road networks and turning road graphs into blocks/lots (Parish & Müller, Chen et al. tensor fields, agents, CityEngine, Vanegas parcels)

### Takeaway
Two main families exist. (a) Growth-based, e.g. Parish & Müller's extended L-system: segments are proposed, then checked against global goals (population/density maps) and local constraints (snap to nearby crossings, intersect, clip at water). (b) Field-based, e.g. Chen et al.'s tensor fields: streets are streamlines of a designer-editable field. Both produce a planar graph. Its faces become blocks, which are cut into parcels by recursive longest-edge/OBB splitting or straight-skeleton subdivision (Vanegas et al. 2012). Global growth is order-dependent, so it suits an OFFLINE or "region-level" pass better than per-cell runtime. Tensor fields are pointwise-evaluable, which helps with chunking.

### Cited Findings
**Parish & Müller 2001 (L-system roads):**
- Citation: Y. Parish, P. Müller, "Procedural Modeling of Cities", SIGGRAPH 2001, pp. 301–308 — [SIGGRAPH history archive](https://history.siggraph.org/?p=116923); [Wonka et al. tutorial PDF](https://peterwonka.net/Publications/pdfs/2008.CGA.Watson.ProceduralModelingTutorial.pdf)
- They extended L-systems with "global goals and local constraints", which also reduces the complexity of production rules. Inputs are image maps such as land/water boundaries and population density — [phiresky procedural-cities presentation (secondary)](https://phiresky.github.io/procedural-cities/presentation.html); [CSDN reproduction of abstract](https://blog.youkuaiyun.com/humanerr/article/details/88730481)
- Global goals: highways try to connect population centres. Candidate directions are sampled and the one with the highest population is chosen. Streets branch only where population density is above a threshold — [phiresky presentation](https://phiresky.github.io/procedural-cities/presentation.html)
- Local constraints: if two streets intersect, generate a crossing. If a street ends close to an existing crossing, extend it to reach that crossing. If it ends in an obstacle (water, park), shorten or rotate the segment to fit — [phiresky presentation](https://phiresky.github.io/procedural-cities/presentation.html); [tfdml blog implementation notes](https://tfdml.blogspot.com/2015/03/procedural-city-generation.html)
- Lots: blocks are recursively divided along the longest edges that are approximately parallel, and lots without street access are discarded. Buildings come from a geometry L-system plus a texture-element system — [phiresky presentation](https://phiresky.github.io/procedural-cities/presentation.html)

**Chen, Esch, Wonka, Müller, Zhang 2008 (tensor fields):**
- "Interactive Procedural Street Modeling" (SIGGRAPH 2008). Tensor fields guide street-graph generation, and users edit either the underlying tensor field or the graph directly. A city of reasonable complexity can be modelled in about 5 minutes plus refinement time — [project page (Utah)](https://www.sci.utah.edu/~chengu/street_sig08/street_project.htm); [project page (UH)](https://www2.cs.uh.edu/~chengu/Publications/streetModeling/street_modeling.html); [SIGGRAPH archive](https://history.siggraph.org/?p=112908)
- The Watson/Müller/Wonka et al. 2008 tutorial says the tensor field lets you change layouts "indirectly by manipulating the tensor field or directly by reshaping the roads" — [Procedural Urban Modeling in Practice (typeset mirror)](https://typeset.io/pdf/procedural-urban-modeling-in-practice-5e7xjuujy6.pdf)
- A modern open implementation (Rust crate `symbios-tensor`) does terrain-aware tensor-field road networks plus building lots. Roads follow heightmap topography, and streamlines are traced bidirectionally with RK2 (midpoint) integration — [docs.rs symbios-tensor](https://docs.rs/crate/symbios-tensor/latest)
- Galin et al. 2011 build a three-level road hierarchy (highways, major roads, minor roads) connecting cities over terrain with a cost-based procedural method — [Galin et al. CGF 2011 PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Galin11CGF.pdf)
- Teng & Bidarra 2017 propose patch-based road network generation with semantic tags on road patches, combined with parametric methods. They note that many procedural methods are complex, hard to control and need specialized input data — [TU Delft](https://graphics.tudelft.nl/Publications-new/2017/TB17)

**Parcels (Vanegas et al. 2012):**
- C. Vanegas, T. Kelly, B. Weber, J. Halatsch, D. Aliaga, P. Müller, "Procedural Generation of Parcels in Urban Modeling", Computer Graphics Forum 31(2), Eurographics 2012, DOI 10.1111/j.1467-8659.2012.03047.x. Block interiors are subdivided by either an OBB (oriented bounding box) recursive-split method or a straight-skeleton method, driven by user subdivision attributes and style parameters. The results resemble real-world parcel configurations, and parcels are kept consistent across edit operations — [EG digital library](https://diglib.eg.org/handle/10.1111/v31i2pp681-690); [Purdue PDF](https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf)
- Tom Kelly's PhD thesis (Glasgow 2014), "Unwritten procedural modeling with the straight skeleton", applies the straight skeleton to block→parcel subdivision — [Glasgow theses](https://theses.gla.ac.uk/4975)
- Open-source reimplementations exist: a Godot OBB-parcelling project — [GitHub stavguo/obb-parcelling](https://github.com/stavguo/obb-parcelling). A student project implementing both OBB and straight skeleton — [AuCiGen](https://www.Github.com/keldaan-ag/AuCiGenPart4). A Houdini forum reports that naive straight-skeleton parcelling gives diagonal edges at block corners, and that §4.2.2 of the paper addresses this (forum claim, unverified) — [SideFX forum](https://www.sidefx.com/forum/post/307409)

### Inferences
- For a small C17 team, the most tractable road pipeline is: (1) coarse arterial/highway graph from a global, cheap, deterministic process (Parish-Müller-style growth OFFLINE or at world-init, or a hierarchical cost-based approach like Galin's); (2) local streets per district via a tensor field (grid + radial + boundary-aligned basis fields blended by distance) traced as streamlines; (3) planar-graph face extraction → blocks; (4) OBB recursive split → parcels (much simpler than a robust straight skeleton in C; straight skeleton is notoriously fragile numerically).
- Order-dependence: Parish-Müller growth uses a priority queue in which each accepted segment changes later decisions, so the result for cell (x,y) depends on the whole growth history. It cannot be evaluated cell-locally. Tensor-field streamlines are also global in principle, since a streamline started in one cell crosses into others and separation tests reference earlier streamlines. See §2 for how to restrict both to bounded "regions".
- OBB split per block is deterministic and local to a block once the block polygon is known, so it is RUNTIME-feasible (microseconds to milliseconds per block).

### Gaps
- Could not locate Martin Evans' blog posts on procedural cities/roads ("probabilistic cities"). Searches for martindevans.me and "Procedural Generation For Dummies" returned nothing relevant, so no claims about his work are included.
- No direct reading of CityEngine documentation (CGA shape grammar, street growth parameters) in this session.
- Agent-based road approaches (e.g. Lechner et al.) were not researched for lack of budget.
- Full Chen et al. paper (separation distance, seed placement, major/minor eigenvector alternation) not read. The details are from my background knowledge and should be verified against the paper.

---

## 2. Hierarchical / multi-pass chunked generation with determinism and neighbour consistency (Minecraft stages, padding, NMS, infinite cities, Subversion, Pixel City)

### Takeaway
Every successful chunked generator separates content by spatial extent. Small things are generated per cell and must not cross the border. Medium things have a bounded reach, and the generator looks at a neighbourhood of radius r around the cell. Large things are decided on a coarser grid, are hashed from that coarse cell's coordinates, and are re-derived by any fine cell that needs them. Minecraft makes this explicit with a status pipeline (structure_starts → structure_references → biomes → terrain → features → light → full) and bounded feature/structure reach. Seeds are derived by hashing cell coordinates (Greuter 2003 used Thomas Wang's 32-bit mix).

### Cited Findings
- Minecraft Java chunk statuses in order: empty → structure_starts (for structures starting in this chunk, all piece positions are generated and stored) → structure_references (nearby chunks store references to chunks with a structure start) → biomes → terrain (3D noise, splines, noise caves, aquifers, ore veins, surface, carvers) → features (places features and structure pieces, then heightmaps) → initialize_light → light → spawn → full. Chunks far from players can stay frozen at an early step as "proto-chunks" — [Minecraft Wiki: World generation](https://minecraft.wiki/w/World_generation)
- Minecraft structure placement uses "structure sets" with spacing (average distance in chunks), separation (minimum distance) and frequency (probability a determined position is used), plus a biome check at the position. Strongholds instead use concentric rings — [Minecraft Wiki](https://minecraft.wiki/w/World_generation)
- Modding notes (community, version-dependent): features have a 3×3-chunk area they can safely write into but should stay in their own chunk. Structures have a hard limit of a 17×17 chunk area. Historically, decoration of a chunk was delayed until its +X/+Z neighbours existed — [delvr modding gist](https://gist.github.com/delvr/bfac43cd48675ec74b905ffe640a6a11); [XI64 gist](https://gist.github.com/XI64/0480256ed2836e4d301210899551c659)
- Older Minecraft feature decoration stages: RAW_GENERATION, LAKES, LOCAL_MODIFICATIONS, UNDERGROUND_STRUCTURES, SURFACE_STRUCTURES, STRONGHOLDS, UNDERGROUND_ORES, UNDERGROUND_DECORATION, VEGETAL_DECORATION, TOP_LAYER_MODIFICATION — [delvr gist](https://gist.github.com/delvr/bfac43cd48675ec74b905ffe640a6a11)
- Vintage Story's world-gen pass enum similarly has passes flagged "requires neighbour chunks" (e.g. vegetation) — [Vintage Story API EnumWorldGenPass](https://apidocs.vintagestory.at/api/Vintagestory.API.Server.EnumWorldGenPass.html)
- No Man's Sky (Innes McKendrick, GDC 2017, "Continuous World Generation in No Man's Sky"): the pipeline is voxel-based world generation → polygonization → texturing → population → simulation. Full content is behind the GDC Vault paywall — [GDC Vault](https://gdcvault.com/play/1024265/Continuous-World-Generation-in-No); [Game Developer coverage](https://gamedeveloper.com/programming/video-how-continuous-world-generation-works-in-i-no-man-s-sky-i-)
- Greuter, Parker, Stewart, Leach, "Real-time procedural generation of 'pseudo infinite' cities" (GRAPHITE 2003): buildings on a grid, each cell's position hashed to a seed (Thomas Wang's 32-bit integer mix) that seeds a PRNG at render time. Uses caching and avoids computation outside the view frustum — [paper PDF (McGill mirror)](https://svn.sable.mcgill.ca/sable/courses/COMP763/oldpapers/greuter-03-real-time.pdf); [p-g-c blog summary](https://p-g-c.blogspot.com/2010/10/real-time-procedural-generation-of.html); [Banf et al. survey](https://mi.informatik.uni-siegen.de/publications/banf10proceduralcities.pdf)
- Related: "Procedural Generation of Infinite Cities" (Eurographics digital library) — [EG diglib](https://diglib.eg.org/items/1704c432-13e2-4008-9a58-f54590b382ba). Kelly & McCabe "Interactive generation of cities for real-time applications" (Citygen) — [SIGGRAPH archive](https://history.siggraph.org/?p=139434). A 2010 student paper on on-demand infinite procedural cities (terrain + road network + houses) — [IADIS](https://iadisportal.org/digital-library/on-demand-creation-of-procedural-cities)
- Introversion's Subversion (unreleased): planned to procedurally generate the entire city, and the prototype went down to individual building floors. The project was shelved — [Venus Patrol interview](https://venuspatrol.com/2009/04/ragdoll-metaphysics-introversi); [eightbar](https://www.eightbar.com/2008/02/07/building-cities-by-generation-introversion/index.html)
- Shamus Young's Pixel City (2009) is a rule-based night city regenerated on each run, documented in a ~12–15 part blog series ("Procedural City") — [Part 12: Finishing Touches](https://www.shamusyoung.com/twentysidedtale/?p=3231); [FlowingData](https://flowingdata.com/2009/05/14/pixel-city-computer-generated-city/)

### Inferences
Recommended architecture for this engine (synthesis, not from a single source):
- Hierarchy of grids, each level hashed independently: e.g. L3 "region" 4–8 km (macro: coastline, mountains, highways, city centres, district map); L2 "district" ~1 km (arterial graph + tensor field for that district); L1 = streaming cell 128–256 m (blocks, parcels, buildings, props); L0 = sub-cell scatter tiles (vegetation, clutter). Any job generating an L1 cell computes (or fetches from a cache) the L2/L3 data covering it plus a neighbour ring. Because L2/L3 are pure functions of `(world_seed, level, coord)`, two cells that independently compute the same district get bit-identical results, so road endpoints at cell borders match by construction.
- Rule: content at level k may only read data at level ≥ k, or at the same level within a fixed radius (Minecraft's 3×3 feature reach / 17×17 structure reach is the precedent). Never read data produced at a finer level by a neighbour. This removes generation-order dependence and lets the work-stealing scheduler run cells in any order.
- Seed derivation: `seed_k = hash64(world_seed, level, x, y, stream_id)` using a stateless mixer (SplitMix64/Wang/PCG-hash). Use a separate `stream_id` per sub-system (roads, parcels, trees…) so adding one more random draw in one system doesn't shift all others. Use integer or fixed-point math, or a strictly specified float path, for anything topological (graph intersections). Different compilers/FMA contraction can change float results across macOS/Linux/Windows, so compile with `-ffp-contract=off`, avoid `-ffast-math`, and avoid platform libm transcendentals in decisions (or ship own sin/cos).
- Road graph across cells: generate the arterial graph per district (L2) with cross-district connection points fixed on district borders (e.g. a hashed point on each shared edge, as in "edge-seeded" tiling: both neighbours hash the same edge ID → identical portal). Local tensor-field streets are traced only within the district, clipped at the district polygon, with deterministic seed-point order. This mirrors Minecraft's "structure start + references" in that the owner computes and others re-derive or reference.
- Two-phase cell build (like Minecraft proto-chunks): phase A (data: graph, parcels, building footprints, height adjustments) can be cached in RAM for a wider radius. Phase B (meshes, instances) only for cells being loaded. LOD levels can stop after phase A plus impostor generation.
- Job graph: L3/L2 jobs are dependencies of L1 jobs. Memoize them in a concurrent cache keyed by (level, x, y), and protect against duplicate generation with a "computing" state plus wait or recompute (recompute is safe since it is deterministic).

### Gaps
- NMS talk specifics (how voxel regions are generated in parallel with noise, LOD) not accessible (paywalled video, no slides found).
- Elite Dangerous Stellar Forge: not researched in this session.
- Minecraft's exact structure-grid math (region = spacing × spacing chunks, random offset in [0, spacing − separation)) is from my background knowledge, not verified this session.

---

## 3. Terrain: noise heightmaps, GPU hydraulic/thermal erosion, terrain–city integration, tiles/clipmaps

### Takeaway
Use noise (fBm, ridged, domain-warped) evaluated pointwise for runtime-chunkable terrain. Erosion (Mei et al. 2007 virtual-pipe shallow-water model on GPU, or particle droplet erosion) is non-local and iterative, so it belongs OFFLINE on a coarse global heightmap or as a per-region bake with overlap. Cities need the terrain flattened under roads and parcels, which is done as a deterministic post-pass using road/parcel data from the hierarchy.

### Cited Findings
- Mei, Decaudin, Hu, "Fast Hydraulic Erosion Simulation and Visualization on GPU", Pacific Graphics 2007, pp. 47–56. Simulates erosion from rainfall and river flows, fast for large terrains. It adapts a shallow-water model and uses "virtual pipes" between cells for water exchange, which is what makes it parallel — [HAL/core.ac.uk PDF](https://core.ac.uk/download/52631892.pdf); [hgpu summary](https://hgpu.org/?p=2256)
- The virtual-pipe idea comes from O'Brien & Hodgins 1995. Mei et al. simplified it to 4-neighbour pipes on GPU, and later papers (e.g. Jákó & Tóth 2011) improve on it — [Jákó CESCG 2011](https://www.old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf); [Salamin & Szénási](https://szfi.nik.uni-obuda.hu/storage/app/media/szakirany-publikaciok/salamin_szenasi.pdf)
- Šťava et al. 2008 "Interactive Terrain Modeling Using Hydraulic Erosion" is an interactive GPU erosion editor — [Purdue PDF](https://www.cs.purdue.edu/cgvlab/www/resources/papers/Stava-2008-Interactive_Terrain_Modeling_Using_Hydraulic_Erosion.pdf)
- Ghost Recon Wildlands (Ubisoft Paris) gave the GDC 2017 talk "Terrain Technology and Tools" (Guillaume Werlé, Benoit Martinez). A small team built a Houdini-based procedural world-building pipeline that let them design the playable area at a fraction of the time and manpower. Roads were one of the first procedural tasks, and earlier Future Soldier tools could "terraform, carve road, add details and preserve UVs" — [GDC Vault listing](http://www.gdcvault.com/play/1024029/-Ghost-Recon-Wildlands-Terrain); [80.lv: procedural world building in GRW](https://80.lv/articles/procedural-world-building-in-ghost-recon-wildlands/); [80.lv: procedural technology in GRW](https://80.lv/articles/procedural-technology-in-ghost-recon-wildlands/); [SideFX: GRW](https://www.sidefx.com/community/ubisofts-ghost-recon-wildlands); [80.lv: landscape and material pipeline](https://80.lv/articles/landscape-and-material-pipeline-of-ghost-recon-wildlands/)
- World Machine was also reportedly used on Wildlands (forum thread) — [World Machine forum](https://forum.world-machine.com/t/wm-used-in-ghost-recon-wildlands/4435)
- `symbios-tensor` couples roads to terrain: roads follow heightmap topography — [docs.rs](https://docs.rs/crate/symbios-tensor/latest). Galin et al. 2011 route roads over terrain using cost functions including slope — [Galin11 PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Galin11CGF.pdf)

### Inferences
- RUNTIME terrain per cell: `h(x,y) = macro(x,y) + detail_noise(x,y)`, where `macro` is sampled from an OFFLINE-baked, eroded, low-resolution global heightmap (e.g. 4–16 m/texel, possibly hand-edited), and `detail_noise` is pointwise fBm (deterministic, chunk-independent). This gets erosion's believable drainage without running erosion per cell. Erosion on the full-res tile at runtime would create border seams, since erosion is non-local. If needed, run it with a generous apron (overlap) and cross-fade, and accept that it is order-independent only if each tile's erosion reads only the macro heightmap, never neighbours' eroded results.
- Road/parcel flattening as a deterministic post-pass: for each cell, gather road segments and parcels from the L2 data in a radius covering the max blend distance. Compute a signed distance to road centrelines/parcel polygons, and blend `h` toward the road profile height (a 1D height function along the road computed at L2 from the macro terrain with grade limits). Because road profiles are computed at L2, both sides of a cell border agree.
- Clipmaps / heightmap tiles are orthogonal to generation: the generator outputs a heightmap tile per cell per LOD. Coarse LODs can sample `macro` only, plus cheap noise octaves.
- Erosion tools (e.g. Sebastian Lague's droplet-based hydraulic erosion, Mei-style pipe model) belong in the OFFLINE world-cook tool, possibly running on SDL_GPU compute.

### Gaps
- Did not verify Sebastian Lague's erosion project details or Red Blob Games (Amit Patel) map-generation articles this session.
- No sources fetched on clipmap terrain rendering or on thermal erosion specifics.
- Wildlands talk slides/video not accessible, so the specific road-carving algorithms are unknown.

---

## 4. Placement / scattering (HZD GPU placement, Poisson disk, density maps, ecosystem rules, Ubisoft Houdini pipelines)

### Takeaway
Horizon Zero Dawn's system is the key reference. Vegetation and props are evaluated at runtime on the GPU from streamed 2D world-data maps through artist-authored density graphs. Placement uses dithering against footprint-sized grids, so results are deterministic and locally stable: editing one area doesn't reshuffle others. It covered nearly all vegetation with 500+ asset types, 100,000+ objects and about 250 µs average GPU load. This is the right model for the L0 scatter layer of this engine (on GPU compute or a CPU job).

### Cited Findings
- Jaap van Muijden, "GPU-Based Run-Time Procedural Placement in Horizon Zero Dawn", GDC 2017. The system dynamically creates the world around the player, placing not only rocks/trees but also sounds, effects, wildlife and gameplay elements. Artists author rules in a graph editor. Demos show painting tree lines, redirecting roads, moving mountains and turning a desert into a tropical swamp — [Guerrilla publication page](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn); [GDC Vault](https://www.gdcvault.com/play/1024120/GPU-Based-Run-Time-Procedural)
- Slide text (via search excerpt of the slide PDF): goals "fully data driven, deterministic and locally stable". It covers nearly all vegetation, with "500+ asset types, 100.000+ objects in scene, ~250µs avg busy load on GPU". Inputs are a set of 2D world-data maps streamed in sections at ~32 bits per square metre. The pipeline goes density map (world data discretized into a mip-mapped texture) → generate (range and threshold tests, position generation, normals), with dithering as the discretizing step. Overlap between objects of the same footprint is resolved by "layered dithering" (layered density maps with two values and a two-sided threshold test, more work but no flushes). Different footprints involve read-back/dependencies — [GDC2017 slides PDF](https://www.guerrilla-games.com/media/News/Files/GDC2017_VanMuijden_GPUBasedProceduralPlacementInHorizonZeroDawn.pdf) (excerpt only, PDF too large to fetch fully)
- Community reimplementations: a Unity port with two footprints (0.5 m grass, 4 m trees; not Guerrilla's numbers) — [Medium, K. Szwajka](https://medium.com/@kacper.szwajka842/gpu-run-time-procedural-placement-on-terrain-cc874e39bbfb); [80.lv guide to runtime procedural placement in Unity](https://80.lv/articles/a-comprehensive-guide-on-run-time-procedural-placement-in-unity); [80.lv HZD article](https://80.lv/articles/real-time-procedural-placement-in-horizon-zero-dawn/?amp=1)
- Ubisoft Wildlands used Houdini to procedurally build the environment (terrain, roads, details) as an OFFLINE pipeline with a small team — [80.lv](https://80.lv/articles/procedural-world-building-in-ghost-recon-wildlands/); [SideFX GDC 2017 page](https://sidefx.com/community/gdc-2017/)

### Inferences
- Port the HZD model to this engine: each cell has world-data channels (height, slope, biome/district id, road SDF, parcel mask, painted designer masks, moisture/erosion flow from the offline macro bake). Each scatter layer is a small expression graph over those channels producing density ∈ [0,1]. Placement uses an ordered-dither threshold matrix (e.g. a tiled blue-noise or Bayer matrix at the layer's footprint size, offset by a hashed world-space position). A point is placed where density > threshold, then jittered within its footprint cell by a hash of its world-space integer cell. Because both the threshold and jitter are functions of absolute world coordinates, results are independent of cell boundaries and generation order ("locally stable"). This is RUNTIME-cheap on CPU jobs too.
- Poisson-disk across chunks: true Bridson Poisson disk is sequential and order-dependent. Chunk-safe alternatives are (a) dithered footprints as above; (b) precomputed tileable Poisson/blue-noise point sets (Wang-tiled or toroidal tile) indexed by world position; (c) "hash grid + reject against lower-priority layers" (big trees first, then bushes reject within radius of trees: Minecraft-like layer ordering with neighbour lookups limited to the max footprint radius).
- Ecosystem rules (big trees suppress undergrowth, species clustering) fit as cross-layer density modulation: compute layer A, splat its footprints into a mask, and feed that mask into layer B's density. This requires a neighbour ring of radius = max footprint of A, which is the same padding principle as in §2.
- Roads/buildings must write exclusion masks (road SDF, parcel footprints) before vegetation scatter. This is the dependency order cell data → masks → scatter.

### Gaps
- Exact HZD tile sizes, generation radius, and how GPU readback feeds collision/gameplay were not obtained (PDF too large). Watch the GDC Vault video or download the PPT locally.
- Far Cry 5 GDC talks (e.g. Etienne Carrier, "Procedural World Generation of Far Cry 5", GDC 2018) not fetched this session, so no claims.

---

## 5. Wave Function Collapse, model synthesis, Townscaper

### Takeaway
WFC (Gumin) is a constraint-propagation generator (lowest-entropy observe + AC-4 propagate). It derives from Paul Merrell's model synthesis, which used AC-3 and incremental modification to reduce failures. It suits bounded domains such as a building facade, a block's props, an interior floor plan or tile-based districts. Townscaper runs it in real time on an irregular quad grid with about 500 corner-based tiles. Across unbounded chunked worlds, plain WFC is order-dependent and can contradict, so it needs fixed borders or Merrell-style block-wise modification.

### Cited Findings
- WFC has two models. Overlapping extracts N×N patterns (N typically 3) from a sample and matches their frequencies. Simple-tiled uses explicit adjacency rules with tile symmetry types. The loop is: observe the lowest nonzero-entropy cell, collapse it weighted by frequency, propagate, and stop at completion or contradiction. Deciding whether a valid completion exists is NP-hard, though contradictions are "rare in practice". The core has no backtracking, which some ports add. It works in 3D but performance becomes a concern. fast-wfc is about 10× faster for the overlapping model — [mxgmn/WaveFunctionCollapse README](https://github.com/mxgmn/WaveFunctionCollapse)
- Relation to Merrell: model synthesis derived adjacency constraints from an example model and used AC-3. WFC generalizes this to N×N overlapping patterns, adds the lowest-entropy heuristic and symmetry, uses AC-4, and does not use Merrell's incremental modification technique for reducing failures — [WFC README](https://github.com/mxgmn/WaveFunctionCollapse)
- Games listed as using WFC: Bad North, Caves of Qud, Townscaper, Dead Static Drive, The Matrix Awakens. Ports exist for UE5, Unity, Godot 4 and Houdini — [WFC README](https://github.com/mxgmn/WaveFunctionCollapse)
- Townscaper: a hex grid is split into quads, split again, and points are relaxed/moved to make an irregular quad grid, so that "any graph could be on a quadrilateral graph". WFC picks valid modules per cell in real time (Bad North generated islands ahead of time instead). Decoration is separate from generation. Unsatisfiable constraints "fail silently". Tiles are corner pieces placed marching-cubes style (~500 tiles). Modules have priorities: gardens get high priority but are allowed only where enclosed by walls. Large shapes are predictable, while small details (walls, colours, plot divisions) vary more. Windows are cut via a stencil buffer — [Game Developer: How Townscaper Works](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)
- Irregular-grid marching squares works because it only needs each quad's corner points, even when a vertex has ≠4 adjacent quads. Module meshes are deformed to fit the irregular quads — [reddit recreation thread](https://redlib.hbubli.cc/r/gamedev/comments/jvsp7k/i_recreated_oskar_stålbergs_irregular_grid/idwiw0a/?context=3); [sketchpunklabs irregular grid demo](https://sketchpunklabs.github.io/irregular_grid)
- Stålberg's IndiCade Europe 2019 talk is cited as the technical reference for this — [threadreader thread](https://threadreaderapp.com/thread/1261950965189672961.html)

### Inferences
- Where WFC fits this engine (RUNTIME, bounded): building facades (grid = floors × bays), roofs, block-interior props, interior room layouts on a small grid, sidewalk/street-furniture strips. Domains are bounded by a parcel, so there are no cross-cell issues if the parcel is owned by exactly one cell (assign ownership by parcel centroid). Use the parcel's hashed seed. Deterministic as long as the entropy tie-break uses the seeded RNG and iteration order is fixed.
- For WFC over a chunked infinite area (e.g. district-level tile grids), pre-collapse border strips from a hash of the shared edge, or use Merrell's model-synthesis "modify in blocks" approach. Both are bounded-cost per cell. Budget for contradictions: on failure, retry with seed+1 up to N times, then use a guaranteed fallback tile. Determinism holds because the retry sequence is deterministic.
- Townscaper's lesson for "procedural sameness": predictable macro shapes + varied micro details + priority rules for rare "discoverable" modules.

### Gaps
- Merrell's original model-synthesis papers (2007/2009) and later "Modifying in Blocks" were not fetched. Claims about them come only via Gumin's README.
- No benchmark numbers found for 3D WFC at building scale.

---

## 6. Interiors, building variety, and avoiding procedural sameness (hybrid pipelines, landmarks)

### Takeaway
Shipped large worlds (HZD, Wildlands) use procedural systems as artist tools driven by painted/authored inputs, not as a replacement for authorship. HZD's rules are graph-authored and its world-data maps painted. Wildlands' Houdini pipeline is run by a small team. Grammar-based building generation (Parish & Müller's building L-system; CityEngine CGA lineage) plus hand-authored modules and landmarks layered on top is the standard hybrid.

### Cited Findings
- HZD placement is "fully data driven". Artists define rules in a graph editor, and edits like painting a tree line or redirecting a road immediately reflow the procedural result — [Guerrilla](https://www.guerrilla-games.com/read/gpu-based-procedural-placement-in-horizon-zero-dawn)
- Wildlands: Houdini procedural pipeline lets a small team design the playable area "at a fraction of the time and manpower" — [SideFX/80.lv](https://www.sidefx.com/community/80-level-ghost-recon-wildlands/)
- Parish & Müller's buildings use an L-system for geometry plus a texture-element system — [phiresky presentation](https://phiresky.github.io/procedural-cities/presentation.html). Their follow-up line (CGA shape grammar / CityEngine) is surveyed in Watson et al. 2008 — [tutorial PDF](https://peterwonka.net/Publications/pdfs/2008.CGA.Watson.ProceduralModelingTutorial.pdf)
- Subversion's generator went down to individual building floors (interiors) — [Venus Patrol](https://venuspatrol.com/2009/04/ragdoll-metaphysics-introversi)
- Townscaper: predictable macro, varied micro, priority modules, and rules such as "gardens only when enclosed" — [Game Developer](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)
- Greuter 2003 explicitly hashes each cell's position into a seed to avoid generating similar buildings — [paper PDF](https://svn.sable.mcgill.ca/sable/courses/COMP763/oldpapers/greuter-03-real-time.pdf)

### Inferences
- Variety levers in priority order: (1) district-level style parameters (era, density, wealth, zoning) from a low-frequency map so neighbourhoods differ coherently, not per-building noise; (2) parcel-driven footprint variety (OBB parcels of varying size → varied footprints); (3) a facade grammar with a library of hand-made modules (doors, windows, cornices, signage) per style; (4) rare "hero" variants with low weight; (5) hand-placed landmarks via an override layer.
- Landmark integration: landmarks are authored as "stamps" that reserve a polygon at L2 (district) level before road/parcel generation, with road anchors as constraints for the street generator, much as Parish-Müller treat water/parks as obstacles. Since the stamp list is static data, determinism is preserved.
- Interiors: generate lazily (only when the player enters or is near a door). Use bounded floor-plan subdivision (recursive split or a WFC on a small grid) seeded from the building's ID. Keep most buildings shell-only, as GTA does, with a hand-authored set of enterable interiors.

### Gaps
- No sources fetched on procedural interior generation algorithms (e.g. Marson & Musse squarified treemaps; Lopes et al. 2010 constrained growth). Background knowledge only, so not cited.
- No sourced GTA-specific (Rockstar) information about procedural use; Rockstar has published little on this.

---

## 7. Persistence: storing player/designer edits as diffs over generated content

### Takeaway
No primary source specific to this was fetched. The standard approach follows from the determinism requirement: since generated content is a pure function of (seed, cell, LOD), store only deltas keyed by stable IDs.

### Cited Findings
- Minecraft distinguishes proto-chunks (partially generated, can be frozen at early stages) from level chunks. Once a chunk is "full" it is saved as data, and the generator is no longer consulted for it — [Minecraft Wiki](https://minecraft.wiki/w/World_generation). (This is the "snapshot" alternative to diffs.)
- Vanegas et al. 2012 maintain parcel correspondence across edit operations, i.e. stable mapping of parcels when the road network is edited. This is relevant to keeping designer edits attached after regeneration — [EG diglib](https://diglib.eg.org/handle/10.1111/v31i2pp681-690)

### Inferences
- Give every generated entity a stable ID = hash(level, coord, subsystem, local index in deterministic order), e.g. `parcel_id = hash(district, face_index)` and `tree_id = hash(layer, world_footprint_cell)`. HZD-style dithered placement gives naturally stable IDs because each candidate is tied to a world-space footprint cell.
- Edit log per cell: {removed IDs}, {modified IDs → component overrides}, {added hand-placed instances}. On load: generate → apply diff. Designer edits at higher levels (moving a road, adding a landmark stamp) are stored as inputs to the generator (L2/L3 override data), not as diffs, so downstream content regenerates consistently. Player edits (destroyed objects) are small runtime diffs.
- Generator versioning: store `generator_version` with saves and cooked data. Any change to generation code invalidates diffs keyed by index, which is a strong reason to key by spatial hashes rather than sequential indices.
- Cooked vs generated: "cook" = run the generator offline, apply designer diffs, write the result. The runtime path can then load cooked cells for authored areas (city core) and generate wilderness live, matching the engine's existing dual path.

### Gaps
- No primary sources found/fetched on diff-based persistence in shipped open-world games (e.g. NMS base/terrain edits, Minecraft-like delta saves). Worth a dedicated search.

---

### Cross-cutting summary: RUNTIME vs OFFLINE (engineering judgement)
- RUNTIME per cell (C17 CPU jobs and/or SDL_GPU compute): hash-based seeds; pointwise noise terrain detail; sampling baked macro maps; tensor-field street tracing within a cached district; planar face extraction; OBB parcel split; grammar/WFC facades per parcel; HZD-style dithered scatter; road/parcel terrain flattening via SDF.
- Per-region, cached in RAM (bounded latency, computed on demand as a dependency job): district arterial graph, district tensor field, road height profiles, landmark stamps.
- OFFLINE / editor: global macro terrain + hydraulic/thermal erosion (Mei et al. GPU pipe model; droplet erosion); highway network via global growth (Parish & Müller) or cost-based routing (Galin et al.); population/zoning maps; straight-skeleton parcels if desired; Houdini-style authored pipelines; cooking of authored cells with designer diffs.
