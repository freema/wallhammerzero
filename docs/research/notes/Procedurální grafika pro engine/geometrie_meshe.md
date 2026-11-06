# Procedural 3D mesh / geometry generation for a code-only C17 engine (SDL3 + SDL_GPU)

> Source-status legend. **[F]** means the source was fetched and read in this session. **[C]** means a canonical primary source (paper or official repo) that I know of but did not re-fetch here. Treat [C] items as needing a quick check before they are quoted in the final report. Items with no reliable source are under Gaps.

## 1. SDF modelling: IQ distance functions and smooth min, Dreams, Claybook, Tiny Glade

### Takeaway
SDFs are the most expressive "geometry as code" representation: primitives plus booleans plus smooth-min blends, cheap to author as parameters plus seed. Every shipped SDF-heavy game (Dreams, Claybook, Tiny Glade) needed a custom GPU renderer, such as raymarching or splatting, or a GPU generation pipeline. For a conventional SDL_GPU rasterizer, the practical route is SDF as the *authoring* representation, converted to triangles by meshing (section 2), with SDF raymarching used only where it pays off.

### Cited Findings
- **Inigo Quilez's distance-function catalogue** is the de-facto reference for SDF primitives (sphere, box, rounded box, capsule, torus, cone, and others) and operators: union/subtraction/intersection, smooth versions, elongation, rounding, onion/shelling, repetition, twist/bend, and displacement — [C: iquilezles.org/articles/distfunctions](https://iquilezles.org/articles/distfunctions/)
- **IQ smooth minimum article.** It describes several smin kernels (exponential, power, root, polynomial quadratic/cubic/quartic, circular), with trade-offs between associativity (order-independence), locality (a polynomial smin affects only the region within `k`), and a returned blend factor usable for mixing materials/colours. I could not verify it this session: both `iquilezles.org/articles/smin` and `/smin/` returned HTTP 404 to the fetcher. Cite carefully — [C: iquilezles.org/articles/smin](https://iquilezles.org/articles/smin/)
- **Media Molecule – Alex Evans, SIGGRAPH 2015**, "Learning from Failure: a Survey of Promising, Unconventional and Mostly Abandoned Renderers for 'Dreams PS4'". The talk covers only rendering. Evans says the team "tried lots of things before we settled on the painterly look." The slides are a 240 MB full PDF and a 34 MB compressed PDF at media.lolrus.mediamolecule.com/AlexEvans_SIGGRAPH-2015(-sml).pdf — [F: Media Molecule blog](https://www.mediamolecule.com/blog/article/siggraph_2015)
- **Dreams' shipped pipeline (secondary sources).** Community analysis says SDF edits are converted to a dense point representation, then rendered by a compute shader that bins points into screen tiles, sorts them per tile and composites front-to-back with a custom HiZ — [F: Beyond3D thread](https://forum.beyond3d.com/threads/signed-distance-field-rendering-pros-and-cons-as-used-in-ps4-title-dreams-spawn.57006/page-2). A quoted Sebastian Aaltonen post says the shipped renderer evaluates SDFs hierarchically, caches them in 8×8×8 bricks (an octree), raymarches the cached SDF, and also emits point splats at the surface for the painterly look — [F: quoted via linen.futureofcoding.org](https://linen.futureofcoding.org/t/42750/https-twitter-com-sebaaltonen-status-1300063944846069761-s-2). The CuRast paper says Dreams' developers found a custom atomics-based compute rasterizer drew small splats faster than the PS4 hardware pipeline — [F: CuRast, arXiv 2604.21749](https://arxiv.org/pdf/2604.21749)
- **Claybook (Second Order; Sebastian Aaltonen, GDC 2018)**, "GPU-Based Clay Simulation and Ray-Tracing Tech in 'Claybook'". The session covers a GPU clay/fluid simulator, a fully deformable world and characters, SDF modelling and ray-traced visuals at 60 fps on current-gen consoles, with the custom renderer and simulation integrated into UE4 — [F: GDC Vault listing](https://www.gdcvault.com/play/1025316/Advanced-Graphics-Techniques-Tutorial-GPU); [F: GPUOpen GDC 2018 list](https://gpuopen.com/gdc-2018-presentations/)
- **Tiny Glade (Pounce Light; Anastasia Opara, Tomasz Stachowiak).**
  - The game began as a weekend "procedural wall generator" in Bevy (Rust). The prototype's appeal was the ability to "do procedural generation on the GPU and in real-time rather than offline."
  - The team moved to Vulkan, partly because Bevy lacked compute shaders at the time. This gave them control of CPU and GPU generation and the full render pipeline.
  - "There isn't one universal algorithm": each element has its own generator with a pipeline for "creation, assembly, morphing, or deforming" — [F: 80.lv interview](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games)
- **Tiny Glade windows.** Windows add irregular plaster damage. Signed distance to the windows is encoded in a single float vertex attribute, so a mesh carries a local SDF for shading effects — [search snippet of 80.lv](https://80.lv/articles/procedural-windows-in-pounce-light-s-tiny-glade-get-an-upgrade) (snippet only, not fully read)
- **Tiny Glade rendering talk.** Stachowiak's talk "Rendering Tiny Glades With Entirely Too Much Ray Marching" was given at the Graphics Programming Conference 2024. A YouTube recording exists; I did not read its content. Digital Foundry is reported to describe ray-traced GI and reflections plus "loads of procedural tech." A Steam user reports a ~1 million brick limit and every brick being regenerated on each edit (anecdotal) — [F: search results aggregating HN/Steam](https://steamcommunity.com/app/2198150/discussions/0/4845401462973097136)

### Inferences
- SDFs suit the "program + parameters + seed" model: an asset is a small expression tree (or bytecode) evaluated on worker threads or in a compute shader. They compose well (smooth unions give organic joints for rocks, creature bodies and clay-like props). Their weakness is sharp, crisp, hard-surface detail and thin features, which need careful meshing (dual contouring) or very fine grids.
- From my memory of the Evans talk (not re-verified, since the PDF was not read): Dreams' team tried polygonising the user-sculpted SDFs and found that mesh topology, triangle counts and LOD/re-meshing on every edit were problematic for dense, constantly edited user content. They ended with splats, which also served the painterly art direction. The final report should present this as "reported", or someone should check the slides.
- For our engine, an editing-heavy Dreams/Claybook-style SDF renderer is a big R&D investment that doesn't fit SDL_GPU's rasterization-first model. The lower-risk route is to evaluate SDFs at cook or stream time, mesh them, and post-process with meshoptimizer. SDF *raymarching* stays an option for special effects only.
- The Tiny Glade approach (per-element hand-written generators, GPU-side generation, and a vertex attribute carrying a local distance field for shading) is a strong template for a code-only art pipeline: the procedural program encodes the *shape*, and baked per-vertex metadata drives shader-side detail.

### Gaps
- I could not read the Dreams slides (240 MB / 34 MB PDF), so the precise reasons for abandoning meshing are not primary-sourced here.
- The Claybook slide content (SDF volume resolution, brick or mip layout, timings) was not retrievable; GDC Vault is gated.
- The Tiny Glade GPC 2024 talk content (the actual geometry pipeline) was not transcribed. Whether walls and bricks are meshes generated on the CPU or GPU is unconfirmed.
- The IQ smin page was unreachable (404) this session.

## 2. SDF / volume to mesh: MC, DC, surface nets, transvoxel, manifold DC

### Takeaway
- **Naive surface nets** are the best default for organic SDF content: about half the faces of marching cubes, trivial to implement, and no case-table ambiguities. They produce smooth/bevelled edges.
- **Dual contouring** adds sharp features via Hermite data (normals) and a QEF solve, at the cost of robustness: vertices escape their cells, and output can self-intersect or be non-manifold.
- **Transvoxel** is the standard fix for LOD seams with marching-cubes-style chunks.
- All of these are cheap enough for worker threads during streaming at chunk sizes of about 32³ to 64³.

### Cited Findings
- **Mikola Lysenko's 0fps benchmark** (browser JS, so take it with salt):
  - At frequency 10, marching cubes produced 154,168 triangles; surface nets produced 73,133 quads (fewer than half the facets).
  - Timings were MC 29.9 to 274.6 ms vs SN 24.1 to 124.3 ms, with surface nets pulling ahead as the surface gets more complex.
  - Sphere: MC 1,140 verts / 572 faces vs SN 272 verts / 270 faces.
  - Source: [F: 0fps "Smooth voxel terrain part 2"](https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/)
- **Naive surface nets algorithm:**
  1. Sample on a grid.
  2. For each cell crossed by the surface, put one vertex at the centroid of its edge crossings. No iterative root finding is needed, unlike Gibson's original spring-relaxation surface nets.
  3. For each sign-changing grid edge, emit a quad joining the four cells around it.

  It is "about as easy to code as naive Minecraft meshing." Downsides: possible non-manifold vertices, and it can't preserve sharp features. Marching tetrahedra is manifold but about 4× larger. A reader also reported seams between separately meshed chunks — [F: 0fps](https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/)
- **Dual contouring** (Ju, Losasso, Schaefer, Warren, "Dual Contouring of Hermite Data", SIGGRAPH 2002) — [C: paper PDF](https://www.cs.rice.edu/~jwarren/papers/dualcontour.pdf). Practical notes from Boris the Brave's tutorial — [F](https://www.boristhebrave.com/2018/04/15/dual-contouring-tutorial/):
  - It needs gradients/normals at edge crossings, from analytic gradients or central differences.
  - It places one vertex per cell by minimising a QEF.
  - The QEF minimum can fall outside the cell, especially on flat areas with near-colinear normals. Fix this with constrained solving plus a bias toward the cell centre (the author found both together looked best).
  - Output can self-intersect (Ju & Udeshi address this).
  - It is non-manifold when two surfaces share a cell (features thinner than a cell).
  - It works on octrees for adaptive resolution and can remesh existing meshes.
- **Manifold dual contouring** (Schaefer, Ju, Warren, IEEE TVCG 2007) extends DC with vertex clustering on an octree, guaranteeing manifold output while keeping sharp features — [C: paper](https://people.engr.tamu.edu/schaefer/research/dualsimp_tvcg.pdf)
- **Marching cubes** (Lorensen & Cline, SIGGRAPH 1987) has ambiguous cases that need case-by-case handling. Implementations are widely available and the patent has expired — [F: 0fps](https://0fps.net/2012/07/12/smooth-voxel-terrain-part-2/)
- **Transvoxel (Eric Lengyel).** Its data tables are published on GitHub under the MIT license (repo: Transvoxel.cpp + LICENSE + README) — [F: GitHub EricLengyel/Transvoxel](https://github.com/EricLengyel/Transvoxel). The algorithm inserts special "transition cells" between chunks of different LOD so that MC-style meshes join without cracks. It is described in Lengyel's dissertation "Voxel-Based Terrain for Real-Time Virtual Simulations" (UC Davis, 2010) — [C: transvoxel.org](https://transvoxel.org/) (DNS failed for the fetcher this session)
- **Manifold's level-set mesher.** The Manifold library provides a `LevelSet` function that meshes a signed-distance function and is claimed to "improve significantly over Marching Cubes" — [F: Manifold README](https://github.com/elalish/manifold)
- **meshoptimizer** now includes experimental "voxel remeshing" in its simplification toolset — [F: meshoptimizer README](https://github.com/zeux/meshoptimizer)

### Inferences
- Recommended defaults per content type:
  - **Rocks, terrain overhangs, organic props, creature bodies:** surface nets on a chunked grid, then meshoptimizer simplify. These are robust, fast and low-triangle.
  - **Hard-surface SDF content (machined parts, masonry):** dual contouring with constrained/biased QEF. Better still, avoid SDF for hard-surface and use constructive mesh builders (section 3).
  - **Streamed LOD'd terrain from volumes:** Transvoxel (MIT tables), or surface nets with skirts or stitching. An alternative is to rely on meshoptimizer `simplify` with locked borders per chunk.
- **Runtime fit.** All three meshers are O(n³) sampling plus O(surface) output, embarrassingly parallel per chunk, and single-pass. They fit worker threads during streaming. SDF evaluation cost dominates, especially deep CSG trees, so use interval or bounding-volume pruning of the tree per chunk and evaluate per brick.
- **GPU option.** Surface nets and MC map well to compute shaders (classify → prefix-sum → emit). SDL_GPU compute pipelines can do this, but GPU float math differs across Metal/Vulkan/D3D12 drivers. That breaks bit-exact determinism, so GPU meshing is acceptable only for render-only, non-gameplay geometry (not collision or network-relevant shapes).
- **Determinism (CPU).** Avoid `-ffast-math`, disable FMA contraction (`-ffp-contract=off`), and avoid libm transcendental functions in SDF evaluation (sin/cos/pow differ between Apple libm, glibc and MSVC CRT). Ship your own polynomial approximations and own noise (integer-hash based). Give vertices fixed output ordering (iterate cells in fixed order, not thread-completion order).

### Gaps
- I found no published head-to-head of DC vs surface nets triangle counts and timings on identical inputs from a primary source.
- I did not verify Manifold `LevelSet`'s actual algorithm (it is reported to be a marching-tetrahedra variant on a BCC grid; unconfirmed here).
- I found no confirmed No Man's Sky polygonisation method (section 7).

## 3. Constructive mesh builders, CSG, half-edge, and shape grammars for buildings

### Takeaway
- For hard-surface content (buildings, vehicles, furniture), direct constructive mesh building gives crisp edges, exact UVs and far fewer triangles than SDF meshing: primitives, extrude/loft/sweep/lathe/bevel, then booleans where needed.
- **Manifold** (Apache-2.0, C++ with an official C binding `manifoldc`) is the robust boolean engine.
- **CGA-style split grammars** (Müller et al. 2006) are the proven model for buildings.

### Cited Findings
- **Manifold (Emmett Lalish):**
  - It is a C++ library for operating on manifold triangle meshes, with "guaranteed manifold output without caveats or edge cases." Its mesh Boolean is described as a guaranteed-manifold algorithm. Non-manifold imports return an error; `Merge` fixes slightly non-manifold input.
  - It carries arbitrary vertex properties and material/source-object IDs through booleans, and offers smoothing/refinement and support for sharp edges.
  - Parallelism comes from TBB with `MANIFOLD_PAR=ON`; small problems run serially. It has no required dependencies.
  - C FFI bindings are built with `MANIFOLD_CBIND=ON` and produce a `manifoldc` library.
  - License: Apache-2.0. Used by OpenSCAD, Blender, Godot, BRL-CAD and Babylon.js.
  - Source: [F: GitHub elalish/manifold](https://github.com/elalish/manifold)
- **manifoldc header.** Rust crates bind directly to the manifoldc C API: `manifold-csg-sys` (raw FFI), and `manifold3d-sys`, which runs bindgen on `manifoldc.h` and compiles `manifoldc.cpp`. This confirms a usable plain-C header — [F: docs.rs manifold-csg-sys](https://docs.rs/manifold-csg-sys); [F: manifold3d-sys build.rs](https://docs.rs/crate/manifold3d-sys/0.0.3/source/build.rs)
- **par_shapes.h (Philip Rideout).** A single-header C library (MIT):
  - Parametric generators: cylinder, cone, disk, torus, sphere, hemisphere, plane, Klein bottle, trefoil, plus a generic callback-based parametric surface.
  - Subdivided-icosahedron sphere, platonic solids, a seeded "rock", and an L-system turtle generator.
  - Operations: merge, translate/rotate/scale, invert winding, weld/unweld, remove degenerates, compute normals, and OBJ export.
  - Source: [F: par_shapes.h](https://github.com/prideout/par/blob/master/par_shapes.h)
- **Müller, Wonka, Haegler, Ulmer, Van Gool, "Procedural Modeling of Buildings"** (SIGGRAPH 2006, ACM TOG 25(3)) introduces **CGA shape**. It is a shape grammar whose rules operate on oriented scopes:
  - Mass modelling via volumetric primitives.
  - Component split, which turns a volume into faces/edges.
  - Subdivision split / repeat split along scope axes.
  - Occlusion and snap queries for context-aware facades.
  - Source: [C: ACM DL](https://dl.acm.org/doi/10.1145/1141911.1141931)
- **Earlier work.** Split grammars originate in Wonka, Wimmer, Sillion, Ribarsky, "Instant Architecture" (SIGGRAPH 2003) — [C: ACM DL](https://dl.acm.org/doi/10.1145/882262.882324). CGA was commercialised as Esri CityEngine (Procedural Inc., acquired by Esri) — [C: Esri CityEngine](https://www.esri.com/en-us/arcgis/products/arcgis-cityengine/overview)
- **libigl** is a C++ header-only geometry-processing library (MPL2), with no C API. Treat it as a reference for algorithms (e.g. winding numbers, booleans via CGAL/Cork, LSCM UV unwrapping, ARAP) rather than a dependency — [C: libigl.github.io](https://libigl.github.io/)

### Inferences
- **Suggested C17 architecture:**
  - An in-house **half-edge (or index-based "face-vertex + adjacency") mesh** for authoring operations: extrude face, inset, bevel edge loop, loft between profiles, sweep a 2D profile along a Catmull-Rom/Bézier curve with rotation-minimising (parallel-transport) frames, lathe (sweep around an axis), and mirror.
  - Convert to a flat indexed triangle buffer for GPU and for Manifold booleans. Use booleans sparingly (window/door cut-outs, damage), since they cost more than direct construction.
  - These operators are each about 100 to 500 lines of C. No library is needed; par_shapes covers primitives.
- **Building generator.** Implement CGA-like rules as data-driven C functions over oriented boxes (scopes): `split(axis, sizes...)`, `repeat(axis, size)`, `comp(faces)`, `insert(kit_piece)`.
  - Kit pieces (window frame, cornice, column, roof tile) are themselves small parametric C generators, not DCC models. This mirrors Townscaper's corner tiles and Tiny Glade's per-element generators (section 7).
  - The grammar is deterministic given a seed, and output is cacheable by hash(rule-program, params, seed).
- **Runtime fit.** Grammar evaluation plus mesh building costs milliseconds per building on one thread, so it suits streaming workers.
- **Manifold booleans:** TBB-parallel booleans on medium meshes are fast, but TBB scheduling should be checked for determinism of output vertex order. Prefer the serial build (`MANIFOLD_PAR=OFF`) inside our own job system for reproducibility and to avoid a second thread pool.
- **Manifold dependency.** It's C++17, so the engine needs a C++ compiler for that TU only; the public interface stays C via `manifoldc.h`.

### Gaps
- I did not confirm whether Manifold guarantees bit-identical output across platforms or thread counts; the README doesn't discuss determinism.
- I did not verify libigl's current license or version this session.
- I found no open-source C implementation of CGA shape. Known OSS analogues (e.g. CityEngine-like grammars in Houdini or Blender add-ons) were not researched.

## 4. Mesh post-processing: simplification/LOD, normals, cache optimisation, impostors, collision hulls

### Takeaway
- **meshoptimizer** (MIT, C-compatible header) covers almost the entire post-processing chain: indexing, vertex-cache/overdraw/fetch optimisation, simplification (incl. attribute-aware and sloppy), meshlets, Nanite-style cluster LOD (`clusterlod.h`), and compression. It should be the core dependency.
- **Collision:** V-HACD 4 (BSD-3, header-only C++, archived) or CoACD (MIT, C++, seeded).
- Impostor baking must be written in-house.

### Cited Findings
- **meshoptimizer (Arseny Kapoulkine):**
  - It provides "a C and C++ interface for all algorithms." The source is C++, but the header is C-compatible. License: MIT.
  - Algorithms:
    - Vertex remap/indexing
    - Vertex cache optimisation (adaptive and FIFO; FIFO is about 2× faster) and strip ordering
    - Overdraw optimisation
    - Vertex fetch optimisation
    - Quantisation helpers
    - Shadow index buffers
    - Simplification: standard, sloppy (topology-ignoring), attribute-aware, permissive and vertex-update variants, plus point-cloud simplification and experimental voxel remeshing
    - Meshlet building (standard, scan, spatial/SAH), per-meshlet optimisation, culling bounds and cluster partitioning
    - Vertex/index/meshlet codecs (vertex decode 3 to 6 GB/s; index codec about 1 to 1.2 bytes/triangle)
  - `clusterlod.h` is a single-header library for continuous LOD with clustered simplification ("hierarchical simplification schemes similar to Nanite").
  - Source: [F: GitHub zeux/meshoptimizer](https://github.com/zeux/meshoptimizer)
- **V-HACD 4.0** (Apr 2022 rewrite):
  - Header-only `VHACD.h` with `ENABLE_VHACD_IMPLEMENTATION`, BSD-3-Clause. The repo is **deprecated/archived and recommends CoACD**.
  - It is faster and more robust than v3 and takes a target hull count (default 32, "often far too high").
  - Parameters: voxel resolution, error threshold (`m_minimumVolumePercentErrorAllowed`), max depth, and `m_shrinkWrap`.
  - High-accuracy settings can take minutes. It has no C API (C++ callbacks).
  - Source: [F: GitHub kmammou/v-hacd](https://github.com/kmammou/v-hacd)
- **CoACD** (SIGGRAPH 2022):
  - Collision-aware approximate convex decomposition via MCTS cut search. C++ core, plus Python and Unity packages; no C API is mentioned. License: MIT.
  - It is stochastic, with a `--seed` option for reproducibility (the default is random).
  - Parameters: concavity threshold (default 0.05), max hulls, max vertices per hull (default 256), and box-approximation mode.
  - Source: [F: GitHub SarahWeiii/CoACD](https://github.com/SarahWeiii/CoACD)

### Inferences
- **Recommended chain per generated mesh:**
  1. Generator output
  2. `meshopt_generateVertexRemap` + remap (weld)
  3. Normals: angle-weighted, with a crease angle split for hard-surface; for SDF meshes, use analytic or central-difference SDF gradients instead
  4. `meshopt_simplify` / `simplifyWithAttributes` for an LOD chain (lock chunk borders for streamed tiles)
  5. `meshopt_optimizeVertexCache`, then `optimizeOverdraw`, then `optimizeVertexFetch`
  6. Optional `meshopt_buildMeshlets` (only relevant if a mesh-shader or cluster-culling path is added later; SDL_GPU currently exposes no mesh shaders)
  7. Quantise and encode for the disk cache
- All of these are CPU-only, single-threaded per call and reentrant (no global state), so they run on streaming workers. Simplification is the most expensive step: generate LODs at cook time for heavy assets, or at runtime for small props.
- **Collision:**
  - Simple props: use a single convex hull (quickhull) or primitive fits that the generator emits directly. The generator *knows* it built a box or cylinder, so it can output analytic collision shapes for free. This is a major advantage of code-defined geometry.
  - Complex shapes: CoACD or V-HACD at cook time only, given their runtime (seconds to minutes). Use CoACD with a fixed seed for determinism.
- **Impostors/billboards:** no standard C library was found. Write an in-house octahedral impostor baker. It renders N views of the mesh via SDL_GPU into an atlas (albedo + normal + depth) and runs at cook time or on first use, cached by hash.

### Gaps
- meshoptimizer's README text doesn't state determinism or thread safety explicitly; the inference is from its API style (pure functions with caller-provided buffers).
- I found no C library for impostor baking, and no specific octahedral-impostor reference was fetched (Ryan Brucks' UE4 octahedral impostors blog is the usual reference, not verified here).
- No single-header C quickhull was verified this session.

## 5. Vegetation and rocks: L-systems, space colonisation, SpeedTree-like, noise-displaced SDF rocks

### Takeaway
- **Trees:** space colonisation (Runions et al. 2007) for skeleton/branching, swept generalised cylinders for branch geometry, and instanced leaf cards. L-systems remain useful for stylised and small plants.
- **Rocks:** noise- or fBm-displaced SDF (or displaced subdivided icosphere), meshed with surface nets and simplified.
- Both are cheap and suit runtime generation on worker threads.

### Cited Findings
- **Space colonisation.** Runions, Lane, Prusinkiewicz, "Modeling Trees with a Space Colonization Algorithm", Eurographics Workshop on Natural Phenomena 2007, pp. 63–70. It extends their leaf-venation model to 3D and yields "surprisingly realistic tree structures." Parameters map to landscaping-relevant tree characteristics, giving convenient control of crown shape — [F: algorithmicbotany.org](http://algorithmicbotany.org/papers/colonization.egwnp2007.html)
- **Space-colonisation algorithm steps** (from the paper; [C], not re-read this session):
  1. Scatter attraction points in the crown envelope.
  2. Each point influences its nearest tree node within an influence radius.
  3. Each influenced node grows a new node of fixed step length along the normalised mean direction to its attractors.
  4. Attractors within the kill distance of any node are removed.
  5. Iterate until no attractors remain or growth stalls.
  6. Compute branch radii with the pipe model (r^n = Σ child r^n) — [C: paper PDF](http://algorithmicbotany.org/papers/colonization.egwnp2007.large.pdf)
- **L-systems:** Prusinkiewicz & Lindenmayer, *The Algorithmic Beauty of Plants* (1990), free PDF — [C: algorithmicbotany.org/papers/#abop](http://algorithmicbotany.org/papers/#abop)
- **par_shapes.h** includes both a seeded rock generator and an L-system turtle generator in C (MIT) — [F: par_shapes.h](https://github.com/prideout/par/blob/master/par_shapes.h)

### Inferences
- **Tree pipeline in C:**
  1. Space-colonisation skeleton (deterministic: seeded attractor sampling; kd-tree or grid for nearest-node queries)
  2. Pipe-model radii
  3. Sweep circles along branches with parallel-transport frames (shares code with section 3's sweep)
  4. Leaf cards placed by phyllotaxis rules
  5. Wind data baked into vertex colours (hierarchy level, branch phase)
  6. LOD: meshoptimizer simplify for trunks, card reduction for leaves, plus an impostor at distance

  Cost: a few ms per tree at moderate attractor counts. Precompute a library of N seeds per species at cook time and instance them, rather than making every tree unique.
- **Rocks:** an SDF with base shape (rounded box or ellipsoid), smooth-min unions, plane cuts for fractures (strata), and fBm/ridged noise displacement. Mesh it with surface nets (or DC for sharp fracture faces), then simplify, then generate triplanar UVs. Noise must be integer-hash-based for cross-platform determinism.

### Gaps
- No public technical description of SpeedTree's internal algorithms was researched (it is proprietary; its documentation describes procedural generators plus hand-editing).
- I found no benchmark numbers for space colonisation run time.

## 6. Vehicles and props from parameters (No Man's Sky ships, procedural cars, kitbashing)

### Takeaway
Little primary-source material exists for fully code-generated vehicles in shipped games. Public evidence points to **parametric kitbashing**: a grammar or descriptor picks and transforms modular parts. For a no-DCC engine, the parts themselves must be parametric generators.

### Cited Findings
- In Townscaper and Bad North, Stålberg's approach uses large tile sets: Bad North used over 300 tiles, and a Townscaper re-skin would need "somewhere in the region of 500 tiles." These are artist-made modules arranged by algorithm, not code-generated geometry — [F: Game Developer](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)

### Inferences
- **Approach for vehicles and props:**
  - Use a parameter struct (wheelbase, track width, cab height, hull profile splines, part slots), and lofts of 2D cross-section profiles along the vehicle's long axis for bodies.
  - Use lathe for wheels/rims, sweep for pipes/rails, and extrude+bevel for panels.
  - Attach slots for greebles: small parametric parts placed by seeded rules, with symmetry mirroring.
  - Panel seams and detail go in shaders (or a per-vertex distance-to-edge attribute à la Tiny Glade windows) rather than geometry.
  - Collision: emit analytic hulls per part (section 4).
- **Avoiding "procedural sameness"** needs hand-designed archetype *programs*, not one universal generator. This matches Tiny Glade's "no universal algorithm, each element has its own generator" — [F: 80.lv](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games)

### Gaps
- No Man's Sky spaceship and creature generation: no primary source was fetched. It is widely reported that NMS assembles creatures and ships from artist-made part sets selected by descriptors (i.e. not pure code geometry), but I could not verify this here.
- I found no documented shipped example of fully code-generated cars. Academic parametric car-body work (e.g. Bézier-surface car modelling) was not researched.

## 7. Shipped examples and talks: No Man's Sky, Tiny Glade, Townscaper, Teardown, Astroneer

### Takeaway
- **NMS:** runtime voxel generation plus polygonisation in the background, alongside streaming.
- **Townscaper:** an irregular quad grid, with MC-style corner tiles chosen by real-time WFC.
- **Tiny Glade:** per-element procedural generators running on CPU and GPU, with heavy ray marching in rendering.
- **Teardown and Astroneer:** voxel-based, though I did not verify details this session.

### Cited Findings
- **No Man's Sky – Innes McKendrick, GDC 2017**, "Continuous World Generation in No Man's Sky" — [F: GDC Vault](https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No)
  - The pipeline is described as voxel generation → polygonisation → texturing → population → simulation — [F: Game Developer summary](https://gamedeveloper.com/programming/video-how-continuous-world-generation-works-in-i-no-man-s-sky-i-)
  - Attendee notes:
    - 1 m voxels at 6 bytes per voxel, in 36×36×36 m chunks.
    - "Simulate on a sphere but store on a cube." Earlier 2D-grid-on-sphere attempts caused swimming textures, so the team moved to triplanar projection.
    - A linear additive density factor shapes mountains, and Perlin worms carve caves.
    - Erosion is approximated with local PCG algorithms.
    - Terrain generates at runtime, in the background alongside texture streaming: CPU on PC, compute shaders on PS4.
    - Source: [F: blather-rinse-repeat GDC notes](https://blather-rinse-repeat.blogspot.com/2018/11/gdc-2017-part-ii-main-conference-notes.html)
- **Townscaper (Oskar Stålberg):**
  - **Grid:** start with a hex grid, split it into quads, split again, then move points (relaxation). Cells can be skewed considerably before it is noticeable at street level.
  - **Tiles:** because cells aren't cubes, a marching-cubes-style approach places *corner* tiles that combine to fit each cell.
  - **WFC:** real-time WFC picks valid modules from the neighbourhood, with module priorities (e.g. gardens only in enclosed flat areas). Constraint solving runs first and decoration after. Edits ripple to neighbours, and failures are tolerated silently.
  - **Windows** are cut via stencil buffer after placement, not baked into tiles.
  - Source: [F: Game Developer](https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making)
  - Marching squares works on the irregular grid because it only cares about each quad's four corners — [F: r/gamedev recreation](https://redlib.hbubli.cc/r/gamedev/comments/jvsp7k/i_recreated_oskar_stålbergs_irregular_grid/idwiw0a/?context=3); grid construction tutorial — [F: Sylves docs](https://boristhebrave.com/docs/sylves/1/articles/tutorials/townscaper.html)
- **Tiny Glade:** see section 1. It began as a procedural wall generator, generates on the GPU in real time, has per-element generators, and moved to Vulkan for compute. The GPC 2024 talk is "Rendering Tiny Glades With Entirely Too Much Ray Marching" — [F: 80.lv](https://80.lv/articles/exclusive-tiny-glade-developers-discuss-bevy-proceduralism-publishers-cozy-games)

### Inferences
- **Townscaper's lesson for a no-DCC engine:** the grid-plus-corner-tile (dual/marching) scheme can use *code-generated* tiles. Each of the 2^8 corner configurations (reduced by symmetry) maps to a parametric generator, deformed into the irregular quad by bilinear or trilinear (cage) interpolation. This yields organic, artist-looking towns from a small code base.
- **NMS's lesson:** voxel density, then polygonisation on background workers, at about 36 m chunk granularity, is viable for continuous streaming. GPU compute is an option on consoles, but given cross-API determinism concerns, our engine should keep collision-relevant meshing on the CPU.

### Gaps
- NMS polygonisation algorithm (MC vs DC vs other) and LOD scheme: not found in accessible sources.
- **Teardown:** reportedly about 10 cm voxels in many small volumes, rendered by ray marching voxel volumes (Dennis Gustafsson, blog.voxagon.se). Not fetched this session.
- **Astroneer:** reportedly marching-cubes-style deformable voxel terrain in UE4. No primary source was found or fetched.
- Stålberg's primary talks (e.g. EPC 2018 / GDC "Wave Function Collapse in Bad North") were not fetched; the Game Developer article is a secondary write-up.

## 8. C17 usability, runtime vs offline cost, determinism — cross-cutting summary

### Takeaway
Pure C or C-header options cover most of the pipeline: meshoptimizer, par_shapes, the Transvoxel tables, and in-house meshers and builders. Only booleans (Manifold, via its C binding) and convex decomposition (V-HACD/CoACD, C++ only) need a C++ translation unit. Cross-platform determinism is achievable on the CPU with strict float settings and in-house math/noise. GPU generation should be limited to visual-only geometry.

### Cited Findings
- meshoptimizer: C-compatible header for all algorithms, MIT — [F](https://github.com/zeux/meshoptimizer)
- Manifold: C++ core, C FFI `manifoldc` (`MANIFOLD_CBIND=ON`), Apache-2.0, optional TBB — [F](https://github.com/elalish/manifold)
- par_shapes.h: single-header C, MIT — [F](https://github.com/prideout/par/blob/master/par_shapes.h)
- Transvoxel tables: MIT — [F](https://github.com/EricLengyel/Transvoxel)
- V-HACD: header-only C++, BSD-3, archived, no C API — [F](https://github.com/kmammou/v-hacd)
- CoACD: C++, MIT, `--seed` for reproducibility, no C API mentioned — [F](https://github.com/SarahWeiii/CoACD)

### Inferences
- **Runtime-capable (streaming workers):**
  - SDF evaluation plus surface nets / MC / DC per chunk
  - Constructive builders and grammar evaluation
  - par_shapes primitives
  - Space-colonisation trees with moderate parameters
  - meshoptimizer remap/optimise
  - simplify (moderate meshes)
  - single convex hulls and analytic collision shapes
- **Cook/offline-preferred:**
  - Convex decomposition (V-HACD/CoACD)
  - Impostor baking (needs the GPU, cache by hash)
  - Heavy Manifold boolean chains on big meshes
  - Cluster-LOD hierarchies for large assets
  - Large tree libraries
- **Cache-key hygiene:** hash(generator code version + parameters + seed + mesher settings + library versions). A meshoptimizer or Manifold version bump can change output, so include library versions to avoid stale or non-reproducible caches.
- **Determinism checklist:**
  - No fast-math; `-ffp-contract=off` (and `/fp:precise` on MSVC).
  - In-house sin/cos/exp/pow approximations; integer-hash noise (PCG/xxhash-style).
  - Fixed iteration and merge order across threads (per-chunk results written to pre-assigned slots, then concatenated in chunk-index order).
  - Avoid TBB-parallel paths in third-party libs, or verify they are order-stable.
  - Add CI that hashes generated meshes on macOS/Linux/Windows and compares them.

### Gaps
- I found no published cross-platform determinism tests for meshoptimizer or Manifold. This needs in-house verification.
