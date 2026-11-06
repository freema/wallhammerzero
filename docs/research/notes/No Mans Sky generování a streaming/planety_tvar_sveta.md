# Planet-scale vs flat worlds: world shape, LOD, precision, abstraction (research notes, compiled 2026-11-05)

Scope: how engines represent and stream spherical planets you can walk on and fly away from, compared with flat open worlds, so that Wallhammer Zero (C17, SDL3 + SDL_GPU, no bindless, CPU-deterministic generation) can expose one "world shape" port (flat grid vs cube-sphere).

Source-quality note: many headline titles (Star Citizen PTv5, Elite Odyssey, No Man's Sky, Space Engineers) are documented only through press, wikis, paid GDC Vault videos or streams. There is little primary engineering text for them. Open, citable engineering detail comes mainly from Outerra's blog, Proland's reference docs, Cesium, S2, Strugar, Ulrich, Lengyel (Transvoxel), Nathan Reed and Catlike Coding. Numbers marked "computed" are my own arithmetic from standard formulas, not taken from a source.

---

## 1. Cube-sphere / quadtree-per-face representations (mappings, seams, chunked LOD, CDLOD, Proland, Outerra, KSP, Elite, Star Citizen)

### Takeaway
The standard, well-proven design is six cube faces, each a quadtree of fixed-resolution square patches, projected onto the sphere. A warp of the face coordinate (Nowell's analytic map, a tan/"equi-angular" warp, or S2's quadratic warp) evens out cell sizes. LOD uses Ulrich-style chunks (skirts) or Strugar-style CDLOD (vertex morphing). Proland shows this exact design as flat-terrain code plus a pluggable "Deformation" (identity, sphere or cylinder). That is the closest existing template for a flat/sphere world-shape port.

### Cited Findings
**Cube→sphere mappings**
- Philip Nowell, "Mapping a Cube to a Sphere" (2005), is the commonly cited reference. Code sources use x' = x·√(1 − y²/2 − z²/2 + y²z²/3), cyclic for y and z, with cube coordinates in [−1, 1]. Note: the primary blogspot page could not be fetched here; the formula is confirmed through secondary code sources — [Ogre3D forum](https://ogre3d.org/addonforums/16/t-9602.html), [Unity forum thread (reports a bug on one face in a posted C# version)](https://discussions.unity.com/t/problems-at-mapping-cube-to-a-sphere/66729), [cfdtools docs](https://cfdtools.readthedocs.io/en/latest/examples/morph-sphere/)
- A 2023 blog post proposes an alternative mapping that it scores at "96%" quality against 79% for Nowell's. This is the blog's own metric and has not been independently verified — [hvlanalysis 2023](https://hvlanalysis.blogspot.com/2023/05/mapping-cube-to-sphere.html)
- Marc B. Reynolds (2017) discusses cube↔ball mappings and their properties (math reference) — [marc-b-reynolds.github.io](https://marc-b-reynolds.github.io/math/2017/01/27/CubeBall.html)
- Google S2 projects six cube faces to the unit sphere. It applies a non-linear per-axis transform u = f(s), v = f(t) on the biunit square "to make cells roughly the same size after projection". The default is `S2_QUADRATIC_PROJECTION`. A cell is a 64-bit S2CellId: 3-bit face, then k two-bit child positions, then a single 1 bit, then zeros. Levels run 0..30, and 6·4^30 leaf cells are "each about 1cm across on the Earth's surface". The API provides `GetEdgeNeighbors(4)`, `AppendVertexNeighbors` (usually 4 neighbours, 3 at the 8 cube corners) and `AppendAllNeighbors(level)` — [S2 cell hierarchy docs](https://s2geometry.io/devguide/s2cell_hierarchy.html)
- Outerra uses "a variant of quadrilateralized spherical cube mapping". Its tiles are generally not rectangular, and "the major deformation component is the shear". Upper quadtree levels deform non-symmetrically, while deeper levels are dominated by shear. Because the shear is affine, frustum planes can be transformed into skewed tile space for culling, and per-tile `npv = abs(R*plane)` can be cached at deep levels (post of 2012-11-17) — [Outerra blog, planet rendering label](https://outerra.blogspot.com/search/label/planet%20rendering)

**Chunked LOD / CDLOD**
- Thatcher Ulrich's "Rendering Massive Terrains using Chunked Level of Detail Control" (SIGGRAPH 2002 course) meshes chunks independently and precomputes a quadtree of chunks. Cracks or T-junctions at LOD borders are hidden with **skirts**, a strip of triangles around each chunk edge that extends below the surface. "We just place chunks beside each other, and use skirts to fill the gaps." Vertices can carry a morph target (their position at the next-coarser LOD) for geomorphing — [paper mirror](https://masters.donntu.ru/2011/fknt/liseenko/library/article1.htm), [UChicago course handout](https://klasses.cs.uchicago.edu/archive/2015/fall/23700-1/docs/project-5.pdf), [Game programming book excerpt](https://www.yaldex.com/game-programming/0131020099_ch14lev1sec5.html); demo and source are at tulrich.com/geekstuff/chunklod.html (cited by the [TUM terrain tutorial](https://www.cs.cit.tum.de/fileadmin/w00cfj/cg/Research/Tutorials/Terrain.pdf))
- The TUM tutorial lists flanges and zero-area triangles as alternatives to skirts — [TUM tutorial](https://www.cs.cit.tum.de/fileadmin/w00cfj/cg/Research/Tutorials/Terrain.pdf)
- Filip Strugar's CDLOD (paper 2010, Journal of Graphics, GPU & Game Tools via Taylor & Francis) uses a quadtree of regular grids. One LOD function based on 3D observer distance applies across the whole mesh, and a transition method needs no stitching. It renders directly from the source heightmap like clipmaps, needs Shader Model 3.0, and has a DX9 demo under the MIT license. The repo page does not mention spheres — [github.com/fstrugar/CDLOD](https://github.com/fstrugar/CDLOD)

**Proland (INRIA, Bruneton et al.)**
- Proland 4.0 `Deformation` is "a deformation of space", and its default implementation is the identity. `SphericalDeformation(R)` deforms "the plane z=0" into a sphere of radius R. Its members include `localToDeformed`, `localToDeformedDifferential`, `getVisibility` and `setUniforms`, plus uniforms such as `radiusU` and `tangentFrameToWorldU`. `CylindricalDeformation` maps the plane to a cylinder with r = R − z and a = y/R. Authors are Eric Bruneton and Antoine Begault — [Deformation](https://proland.inrialpes.fr/doc/proland-4.0/core/html/classproland_1_1Deformation.html), [SphericalDeformation](https://proland.inrialpes.fr/doc/proland-4.0/core/html/classproland_1_1SphericalDeformation.html), [members](https://proland.inrialpes.fr/doc/proland-4.0/core/html/classproland_1_1SphericalDeformation-members.html), [CylindricalDeformation](https://proland.inrialpes.fr/doc/proland-4.0/core/html/classproland_1_1CylindricalDeformation.html)
- Proland example configs declare terrain nodes with `deform="sphere"` and size `6360000` (about Earth's radius in metres). Normal producers also take `deform="sphere"`. The same quadtree and producer pipeline runs flat or spherical — [Proland terrain examples](https://proland.inrialpes.fr/doc/proland-4.0/terrain/html/page-examples.html)
- (The Proland main docs index refused connection during this research, so TerrainNode and TerrainQuad details are not verified here.)

**Games**
- KSP: planets are built with "PQS" (Procedural Quad Sphere). Source is community and modding forums only, with no official technical doc found — [KSP forum, Kopernicus](https://forum.kerbalspaceprogram.com/topic/160810-122-kopernicus-pqs-library-expansion), [KSP forum "How does KSP work"](https://forum.kerbalspaceprogram.com/topic/91108-how-does-ksp-work)
- Elite Dangerous Odyssey (2021) planet rebuild: terrain is driven by Stellar Forge simulation inputs (age, geology, gravitational stress, crust thickness, tectonic activity). A large-scale mask sets terrain-type zones, which mask subzones following flow patterns. Resources must "provide detail all the way from orbit to the surface". This is press coverage of a dev stream by Dr Kay Ross; no quadtree detail was found — [PC Gamer](https://www.pcgamer.com/heres-how-frontier-rebuilt-a-galaxys-worth-of-planets-for-elite-dangerous-odyssey), [Frontier forum repost](https://forums.frontier.co.uk/goto/post?id=8891008)
- Star Citizen Planet Tech v5 (rolled out from Alpha 4.0; called a "complete rework" in 4.11 notes): Genesis data pools add geology, soil type, soil depth and nutrients to v4's temperature and humidity. A planet shader estimates distant terrain colour from data, including not-yet-loaded assets like trees and grass, to avoid pop-in. A German report says generation is moving heavily to the GPU. All sources are wiki or press; no primary engineering breakdown exists — [starcitizen.tools PTv5](https://starcitizen.tools/Planet_Tech_v5), [Alpha 4.11.0](https://starcitizen.tools/Update%3AStar_Citizen_Alpha_4.11.0), [PCGH (de)](https://www.pcgameshardware.de/Star-Citizen-Spiel-3481/News/Star-Citizen-411-plant-grossen-Technik-Sprung-Planeten-lebendiger-1551216/)
- Light No Fire (announced at TGA, December 2023) is a single planet that Hello Games describes as "the size of Earth". Some outlets quote "bigger than earth". Sean Murray mentions mountains "miles high, taller than Everest" — [PC Gamer](https://www.pcgamer.com/hello-games-grand-follow-up-to-no-mans-sky-light-no-fire-is-an-open-world-the-size-of-the-actual-earth), [GamesRadar](https://www.gamesradar.com/no-mans-sky-lead-says-light-no-fire-will-let-you-climb-mountains-that-are-miles-high-taller-than-everest)

### Inferences
- (Computed) With plain normalisation (gnomonic, p/|p|), the area Jacobian on a unit-distance face is 1/(1+x²+y²)^{3/2}. Face-centre cells are therefore 3√3 ≈ 5.2× larger in area than corner cells. A warp (tan, Nowell, S2-quadratic) brings this to roughly 1.4–2×, which keeps texel density and LOD error metrics consistent across a face. A cheap choice for C is a per-axis warp u = tan(π/4·s) (inverse s = 4/π·atan(u)). It is separable, trivially invertible (unlike Nowell's, which needs an iterative or closed-form inverse) and keeps quadtree cell edges as great-circle-like curves.
- Seams between faces are a topology problem, not a geometry one. If patch edge vertices are generated from the same 3D sphere point (or the same 3D noise input), neighbouring faces agree bit-for-bit. Only edge-adjacency (which face, and which rotation of (u,v)) and LOD-difference handling (skirts or morph) are needed. S2 shows the edge/vertex-neighbour API shape, including the "3 neighbours at cube corners" special case.
- Proland's split (planar quadtree logic plus a `Deformation` that maps local→deformed and provides its differential and visibility) maps directly onto a C function-pointer vtable. For a flat world the deformation is identity. For a planet it is the cube-face→sphere map.
- CDLOD (distance-based, morphing, no stitching) is a better fit than chunked LOD for procedurally generated heightfield planets, because there are no precomputed meshes: a shared grid mesh is drawn per node and displaced. Without bindless, per-node height data must sit in a texture array or atlas with per-draw offsets.

### Gaps
- Primary text of Nowell (2005) not fetched (blogspot returned empty). Exact uniformity numbers for the tan and quadratic projections (S2 publishes them on its "cell statistics" page) were not retrieved.
- No primary technical source found for KSP PQS internals, Elite's planet LOD structure, or Star Citizen PTv4/v5 LOD/streaming internals (CitizenCon panels are video-only; wiki summaries are secondary).
- Geometry clipmaps on spheres: no source fetched in this pass.

---

## 2. Voxel planets (caves, overhangs) vs heightfield planets; LOD seams (Transvoxel, skirts)

### Takeaway
Heightfield cube-spheres are an order of magnitude simpler: 2D data, 2D quadtree, skirts or morphing for seams. Voxel/SDF planets buy caves, overhangs and destruction at the cost of 3D octree streaming, isosurface extraction and harder LOD seams. Transvoxel (Lengyel 2009/2010) is the established crack-free solution for marching-cubes style LOD. Large-radius voxel planets also run into engine float-precision problems (Godot issue).

### Cited Findings
- Transvoxel (Eric Lengyel, invented 2009; PhD dissertation UC Davis 2010; JGGGT 2010; used in C4 Engine) inserts "transition cells" between full-resolution and half-resolution voxel blocks. Using 9 high-resolution samples gives 512 cases in 73 equivalence classes. Retriangulation is local, so it supports real-time edits. It is "free of patent claims". Tables are on GitHub, but the page states no license. It handles only a 2:1 resolution ratio across a boundary — [transvoxel.org](https://transvoxel.org/)
- No Man's Sky's pipeline (GDC 2017, Innes McKendrick, "Continuous World Generation in No Man's Sky") is voxel-based world generation → polygonization → texturing → population → simulation. Details are behind GDC Vault — [GDC Vault 1024265](https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No), [Game Developer video post](https://gamedeveloper.com/programming/video-how-continuous-world-generation-works-in-i-no-man-s-sky-i-)
- Space Engineers 2 dev diaries (Aug and Sept 2025) cover planet overhangs, voxel material transitions spanning multiple voxels and triangles with a height "transition mask", and voxel destruction. They give no LOD-structure detail — [Marek Rosa, Aug 21 2025](https://blog.marekrosa.org/2025/08/mareks-dev-diary-august-21-2025/), [Sept 25 2025](https://blog.marekrosa.org/2025/09/mareks-dev-diary-september-25-2025/)
- Zylann's Godot Voxel Tools uses Transvoxel for smooth (SDF) terrain LOD in `VoxelLodTerrain`. In GitHub issue #639, a user tried an `SdfSphere` with radius 24,000,000 units. The answer was that Godot needs a double-precision build for large worlds, and the maintainer did not want to hard-code doubles. Scaling voxels up risks collision tunnelling — [godot_voxel issue #639](https://github.com/Zylann/godot_voxel/issues/639), [repo](https://github.com/Zylann/godot_voxel)
- Other community voxel-planet references (not verified in depth): [Surface Nets destructible voxel planets](https://jorisar.github.io/portfolio/posts/voxelplanets), [Gamasutra "Voxelplanets aka Voxels in Space"](https://www.gamedeveloper.com/programming/voxelplanets-aka-voxels-in-space)
- Skirts are the standard crack fix for heightfield chunks, and flanges or zero-area triangles are alternatives — [TUM tutorial](https://www.cs.cit.tum.de/fileadmin/w00cfj/cg/Research/Tutorials/Terrain.pdf)

### Inferences
- Recommended phasing for a small C17 team: (1) a heightfield cube-sphere as the base planet surface for all LODs, fed by a deterministic `height(dir3)` function, and (2) optional local voxel/SDF "volumes" (caves, overhangs, craters) streamed as 3D chunks only near the player and blended into the heightfield. This mirrors the common hybrid approach. Full voxel planets multiply memory and generation cost by the vertical dimension at every LOD level.
- If voxels are used, the voxel grid should live in a planet-local frame (cube-face-aligned "columns" or a plain Cartesian octree around the planet centre). Cartesian octrees are simplest for SDF meshing (Transvoxel, Surface Nets, dual contouring), but their "up" is not aligned with gravity. Face-aligned voxel columns keep layers parallel to the surface but need a warped grid.
- Dual contouring or Surface Nets with skirts or overlapping seams are simpler to implement than Transvoxel's 73 classes. Transvoxel gives watertight results.

### Gaps
- No primary source on how NMS stores voxels per region (region size, resolution), or on how Space Engineers' octree/clipmap planet LOD works.
- No sourced performance or memory comparison between heightfield and voxel planets.

---

## 3. Precision: radius scales, 64-bit CPU positions, camera-relative rendering, floating origin, depth buffer

### Takeaway
Store everything authoritative in 64-bit (doubles or integer cell + float offset), render camera-relative in float32, and use reversed-Z with a float32 depth buffer (Reed). Add logarithmic depth only if the depth range still breaks. Outerra shows log depth covers planet-to-orbit in 24 bits, at roughly 8–10% cost when written per pixel. UE5 LWC (doubles everywhere, 88 million km default WORLD_MAX) and KSP's floating origin are the two industrial patterns.

### Cited Findings
- **Reversed-Z**: Nathan Reed (2015-07-03) found float32 + reversed-Z gave 0% indistinguishable or swapped depth comparisons in his simulation, regardless of matrix composition or far plane. An infinite far plane made little difference. Reversed-Z with int24 does not help. "In any perspective projection situation, just use a floating-point depth buffer with reversed-Z!" He also says it is not a complete fix for extreme open-world ranges but is "a great start" — [Depth Precision Visualized](https://www.reedbeta.com/blog/depth-precision-visualized/)
- **Outerra logarithmic depth** (2009-08-12): a 24-bit Z with a 10,000 km far plane and C=1 gives ~1.9e-6 m resolution at 1 m and ~9.6 m at 10,000 km. It "nearly removes the need for a near clip plane", with no z-fighting at 10,000 km. An earlier split-depth approach (boundary ~5 km) failed when a detailed tile was behind a coarse one. In 2009 Outerra judged reversed float depth insufficient (float precision near 1.0 is ~1e-7) — [Outerra blog label page](https://outerra.blogspot.com/search/label/planet%20rendering)
- **Outerra 2012-11-28 update**: reversed FP32 depth (DX-style) gives slightly better resolution than 24-bit log depth across ~9 decades, at 8 extra bits per pixel. In OpenGL it needs `glDepthRangedNV(-1,1)` (NVIDIA only at the time). Log depth formula: `z = 2*log(w*C+1)/log(far*C+1) - 1`, times w. C=0.01 gives a ~10 m linear near region. A 16-bit log buffer can cover planetary scale. Writing `gl_FragDepth` disables early-z: about 10% FPS loss on a GTX 460 and 8% on an HD 7850 in a heavy scene. Without per-pixel depth, long polygons near the camera show interpolation errors. Recommendation: reversed FP32 when available, log depth otherwise — [Outerra "Maximizing depth buffer range and precision"](https://outerra.blogspot.com/2012/11/maximizing-depth-buffer-range-and.html)
- **Camera-relative**: the common approach is to store large positions as doubles and convert them to floats relative to the camera for rendering. The "3D Engine Design for Virtual Globes" book and multi-frustum are cited as references — [gamedev.net thread](https://gamedev.net/forums/topic/686539-planet-rendering-issues/). An Outerra forum developer notes values like 0.938182345394 don't fit fp32 and uses patch-local coordinate ranges — [Outerra forum](https://forum.outerra.com/index.php?topic=81.0)
- **UE5 Large World Coordinates** (Beta at the time of the doc): core types become 64-bit double. The default WORLD_MAX is 88 million km, against UE4's 21 km (restorable via `UE_USE_UE4_WORLD_MAX`). HLSL types are in `LargeWorldCoordinates.ush`. Niagara stays float and tiles the world into grid cells (float position in cell plus cell index). Chaos physics is double, with explicit casts to `FVector3f` — [UE5 LWC docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/large-world-coordinates-in-unreal-engine-5)
- **KSP floating origin / Krakensbane**: KSP uses Unity's single-precision physics with a floating origin. The active vessel sits at (0,0,0) and the world moves around it. Krakensbane resets the origin past a threshold, and `FloatingOrigin.SetOffset` is called by Krakensbane. Before v0.17 the "Deep Space Kraken" bug produced phantom forces at high velocity — [KSP modding docs (1.12.4)](https://kspmoddinglibs.github.io/KSPDocsSite/class_floating_origin.html), [KSP wiki Krakensbane](https://wiki.kerbalspaceprogram.com/wiki/API:Krakensbane), [KSP wiki Kraken](https://wiki.kerbalspaceprogram.com/wiki/Kraken)
- **Cesium for Unreal**: it works internally in ECEF (Earth-centred) coordinates. `CesiumGeoreference` places the Unreal origin at a lon/lat/height, and sub-levels each carry their own origin. `CesiumOriginShiftComponent` either switches origin on sub-level entry or updates it continuously. With UE5 doubles, users report automatic rebasing "tends to cause more problems than it solves" — [CesiumSubLevelComponent ref](https://cesium.com/learn/cesium-unreal/ref-doc/CesiumSubLevelComponent_8h_source.html), [CesiumOriginShiftComponent ref](https://cesium.com/learn/cesium-unreal/ref-doc/CesiumOriginShiftComponent_8h_source.html), [Cesium forum](https://community.cesium.com/t/cesium-origin-shift/31378)
- **Planet scales**: Proland's example planet radius is 6,360,000 m — [Proland examples](https://proland.inrialpes.fr/doc/proland-4.0/terrain/html/page-examples.html). Light No Fire targets an Earth-sized planet — [PC Gamer](https://www.pcgamer.com/hello-games-grand-follow-up-to-no-mans-sky-light-no-fire-is-an-open-world-the-size-of-the-actual-earth). Godot voxel user case: radius 24,000,000 units — [issue #639](https://github.com/Zylann/godot_voxel/issues/639)

### Inferences
- (Computed, IEEE-754) float32 spacing (ulp) at distance r from the origin: ~1 mm at 10 km, ~7.8 mm at 100 km, 0.5 m at 6,371 km. float64 at 6,371 km has ~1e-9 m spacing. Planet-centred float32 vertices are therefore unusable for Earth-sized planets even at 100 km. Float32 is fine only in a frame whose origin is within a few km of the geometry.
- Suggested scheme for Wallhammer Zero:
  - (a) Authoritative positions are `double[3]` in a planet-centred frame (or `int64` cell coordinates plus float local offset for flat worlds).
  - (b) Every patch or chunk stores float32 vertices relative to its own patch origin (a double), as Outerra's patch-local ranges do.
  - (c) Per draw, the CPU computes `patchOrigin − cameraPos` in double and uploads a float32 model-view matrix, so the GPU never sees large numbers. No bindless is needed: one small uniform push per draw via SDL_GPU uniform data.
  - (d) Use reversed-Z with D32_FLOAT and an infinite far plane on all three backends (Metal, Vulkan and D3D12 all support a [0,1] depth range and float depth natively).
  - (e) Keep a log-depth shader path as a fallback for extreme ground-to-orbit scenes or for splitting near and far passes.
- Physics: run the simulation in a local float frame around the player (floating-origin rebase every N km) or in double. With Jolt or a hand-written C solver, double-precision builds exist. The KSP history (the Kraken) shows that origin rebasing must also rebase velocities in fast reference frames, which is Krakensbane's purpose.

### Gaps
- No primary Outerra post found describing its exact camera-relative double→float pipeline (only depth posts and forum hints).
- Did not fetch Unreal's separate "LWC Rendering" doc (tile/translated-world-space details).

---

## 4. Gravity, up vector, physics, controllers and city grids on a sphere (curvature tolerance)

### Takeaway
On a sphere, "up" is simply normalize(pos − planetCentre). Every controller, ground test, jump and camera must use a per-position up axis instead of +Y (Catlike Coding pattern). Curvature is negligible for city districts on Earth-sized planets: about 8 cm drop over 1 km. On small game planets (R ≈ 100 km) it reaches metres over a district, so cities must be built in local tangent frames that are small or bent to the surface.

### Cited Findings
- Catlike Coding "Custom Gravity" (Unity 2019.2): a static `CustomGravity.GetGravity(position, out upAxis)` is used. For a planet at the origin, up = normalised position and gravity = up × magnitude. Flipping the sign allows walking on the inside of a sphere. The controller sets `upAxis` at the start of `FixedUpdate`, uses dot products with it for ground and steep tests, projects movement axes onto the gravity plane, and derives jump speed from gravity magnitude. The orbit camera keeps a `gravityAlignment` quaternion updated by the minimal rotation from the old up to the new up each frame. Rigidbodies disable built-in gravity and apply custom acceleration. Constant-magnitude gravity on small planets can trap players in orbit — [Catlike Coding Custom Gravity](https://catlikecoding.com/unity/tutorials/movement/custom-gravity/)
- Cesium for Unreal: due to Earth curvature, the farther you are from the georeference origin, the less accurate Unreal's −Z is as local "down". Unreal up and ellipsoid up align only at the origin. `CesiumGlobeAnchorComponent` keeps objects anchored to globe positions so they don't drift when the origin changes — [Cesium placing objects docs](https://cesium.com/learn/unreal/unreal-placing-objects-v1-x/), [Cesium forum](https://community.cesium.com/t/georeferencing-and-movement-over-large-distances/45697)
- Proland `SphericalDeformation` exposes a `tangentFrameToWorld` uniform. Local tangent frames are a first-class part of the deformation interface — [Proland SphericalDeformation members](https://proland.inrialpes.fr/doc/proland-4.0/core/html/classproland_1_1SphericalDeformation-members.html)

### Inferences
- (Computed) Curvature drop (sagitta) of a flat plane tangent at a point, at horizontal distance d: h ≈ d²/(2R).
  - **Earth, R = 6,371 km**: 128 m → 1.3 mm; 256 m → 5.1 mm; 1 km → 7.9 cm; 2 km → 0.31 m; 5 km → 1.96 m; 10 km → 7.9 m. The up-vector tilt is d/R rad: 1 km → 0.009°; 10 km → 0.09°.
  - **R = 600 km (Kerbin-sized)**: 256 m → 5.5 cm; 1 km → 0.83 m; 2 km → 3.3 m.
  - **R = 100 km**: 256 m → 0.33 m; 1 km → 5 m; 2 km → 20 m. The up-vector tilt is 0.57° over 1 km.
- Rule of thumb from these numbers: a flat district built in one tangent frame is safe while d²/(2R) stays below the snapping or foundation tolerance (say 5–10 cm). That gives about 1–1.1 km radius on an Earth-sized planet and only ~100 m on a 100 km planet. A practical design is one tangent frame per streaming cell (128–256 m). Each building is placed in its cell's frame (or its own frame with up = local normal), and roads or rails are generated along the surface, not in a global flat grid. Error per 256 m cell is millimetres on Earth-sized planets and decimetres on R = 100 km planets. Decimetres must be absorbed by foundations or terrain flattening under lots, which is standard in GTA-like city generators anyway.
- (Computed) Horizon distance ≈ √(2Rh). On Earth at 2 m eye height it is ~5 km; at 100 m, ~36 km; at 10 km altitude, ~357 km. On R = 100 km at 2 m it is ~630 m. Small planets therefore shrink the ground-level streaming set dramatically, while Earth-sized ones behave like flat worlds at ground level.
- Vehicles: use a per-wheel or per-body up from the planet centre and apply gravity as a vector. Suspension raycasts go along −up. For physics engines with a global gravity setting, set gravity per body or per step (as the Catlike rigidbody does).

### Gaps
- No sourced study of city or road generation on curved surfaces (e.g., how Star Citizen places landing-zone cities on rotating planets, or Light No Fire settlements). No primary source on the Star Citizen "object container" approach for planetary cities.
- No sourced treatment of rotating-planet reference frames (centrifugal and Coriolis) for character physics.

---

## 5. Abstraction design: how engines expose flat vs spherical worlds ("world topology" interface)

### Takeaway
The best precedents are Proland (`Deformation` with identity, sphere and cylinder over one planar quadtree), Cesium (ECEF global frame plus a georeference origin and per-sub-level local tangent frames plus anchors), S2 (a global hierarchical 64-bit cell ID with neighbour API) and UE5 LWC (doubles everywhere, float near the GPU). A Wallhammer "world shape" port can combine these. Cell IDs are (face, level, x, y) with face = 0 for flat worlds. The port provides cell↔world transforms, a local frame per position, neighbours across seams, a distance/priority metric and up/gravity. All terrain generation, streaming, LOD and placement code is written against it.

### Cited Findings
- Proland: one terrain quadtree and producer pipeline, with the shape chosen by `deform="sphere"` (or identity or cylinder) and the radius given as size. `Deformation` provides `localToDeformed`, its differential (Jacobian), `getVisibility` (culling) and shader uniforms (`tangentFrameToWorld`) — [Proland Deformation](https://proland.inrialpes.fr/doc/proland-4.0/core/html/classproland_1_1Deformation.html), [SphericalDeformation members](https://proland.inrialpes.fr/doc/proland-4.0/core/html/classproland_1_1SphericalDeformation-members.html), [examples](https://proland.inrialpes.fr/doc/proland-4.0/terrain/html/page-examples.html)
- Cesium for Unreal: an ECEF internal frame; `CesiumGeoreference` maps lon/lat/height to the engine's local Cartesian frame; sub-levels carry their own georeference origin; `CesiumGlobeAnchorComponent` keeps objects at global positions across origin changes — [CesiumSubLevelComponent](https://cesium.com/learn/cesium-unreal/ref-doc/CesiumSubLevelComponent_8h_source.html), [placing objects](https://cesium.com/learn/unreal/unreal-placing-objects-v1-x/)
- S2: hierarchical 64-bit cell IDs across 6 faces, 31 levels, and edge, vertex and all-neighbour queries including cube-corner special cases — [S2 cell hierarchy](https://s2geometry.io/devguide/s2cell_hierarchy.html)
- UE5: doubles in core types; float-tiled representation (cell + float offset) where floats must remain (Niagara) — [UE5 LWC](https://dev.epicgames.com/documentation/en-us/unreal-engine/large-world-coordinates-in-unreal-engine-5)
- Godot: no built-in planet support. Large worlds need a double-precision engine build, and the Voxel Tools maintainer has not committed to double support — [godot_voxel #639](https://github.com/Zylann/godot_voxel/issues/639)

### Inferences (proposed C17 interface sketch, derived from the above)
```c
typedef struct WhCellId { uint8_t face; uint8_t level; uint32_t x, y; } WhCellId; // flat: face=0, grid unbounded (int32 via bias); sphere: face 0..5, x,y < 2^level
// or pack S2-style into uint64 for hashing: 3b face | 2b per level | sentinel bit

typedef struct WhFrame { double origin[3]; float right[3], up[3], fwd[3]; } WhFrame; // local tangent frame, float axes, double origin

typedef struct WhWorldShapeVT {
    // topology
    WhCellId (*cell_at)(const void* s, const double pos[3], int level);
    int      (*neighbors)(const void* s, WhCellId c, WhCellId out[8]);       // handles cube-face seams + corner (3-neighbour) cases
    WhCellId (*parent)(WhCellId c);  void (*children)(WhCellId c, WhCellId out[4]);
    // geometry
    void   (*cell_to_world)(const void* s, WhCellId c, float u, float v, double h, double out[3]); // (u,v) in [0,1] + height along up
    void   (*cell_frame)(const void* s, WhCellId c, WhFrame* out);           // patch origin + tangent frame for float-local vertices
    void   (*up_at)(const void* s, const double pos[3], float up[3]);       // flat: (0,1,0); sphere: normalize(pos-centre)
    void   (*gravity_at)(const void* s, const double pos[3], float g[3]);
    double (*height_param)(const void* s, const double pos[3]);             // altitude above datum (sea level / radius)
    void   (*sample_dir)(const void* s, const double pos[3], double dir[3]); // deterministic noise input: flat = (x,z,0), sphere = unit dir * R (seamless 3D noise)
    // streaming / LOD
    void   (*cell_bounds)(const void* s, WhCellId c, double hmin, double hmax, double centre[3], double* radius); // incl. curvature bulge
    float  (*priority)(const void* s, WhCellId c, const double cam[3]);      // distance + horizon/occlusion term
    bool   (*horizon_visible)(const void* s, WhCellId c, const double cam[3]);
    double (*cell_size_m)(const void* s, WhCellId c);                         // approximate edge length at this level (non-uniform on cube-sphere)
} WhWorldShapeVT;
```
- Flat implementation: one "face", level-0 cells sized 128–256 m (streaming cells), LOD levels above for HLOD (2×2 merges), `up` constant, `horizon_visible` always true, the noise input is the planar position.
- Cube-sphere implementation: 6 faces, the level chosen so that leaf cell edge ≈ 128–256 m (Earth: face edge ≈ πR/2 ≈ 10,000 km → about 2^15–2^16 cells per face edge, i.e. level 15–16), with a tan or quadratic warp, `up` = normalised direction, and seam-aware neighbours.
- "City on a planet" = the cube-sphere shape plus city content in cell-local tangent frames (section 4). City HLOD uses the same cell hierarchy, so flat and spherical content pipelines share code: generator jobs receive (WhCellId, WhFrame, deterministic seed = hash(cellId)) and output float-local meshes.
- Keep deterministic generation independent of LOD-level choice: seed and noise depend on the cell ID and world-space sample position, never on camera, so worker threads can generate any cell in any order.

### Gaps
- No public source found on how Outerra, Flax, Unigine or Space Engineers structure their internal flat/sphere API, beyond Proland and Cesium. Unigine and Flax planet support was not researched in this pass.

---

## 6. Streaming priority on a sphere: horizon culling, altitude-dependent LOD, approach from orbit

### Takeaway
Horizon culling is cheap and removes over half the tiles on a globe (Cesium). Combined with a distance-based quadtree LOD (CDLOD-style ranges, which naturally coarsen with altitude), this drives orbit-to-ground streaming. From orbit only the coarse levels (whole faces down to roughly 10–100 km tiles) are needed. Detail refines as altitude drops, and the visible-cap radius shrinks with √(2Rh).

### Cited Findings
- Cesium horizon culling (Kevin Ring, 2013-04-25; technique by Frank Stoner, extending Deron Ohlarik's work):
  - Each tile is reduced to an "occludee point" in ellipsoid-scaled space (x/rX, y/rY, z/rZ makes the ellipsoid a unit sphere).
  - With C = scaled camera, T = scaled point, VT = T − C, VH² = |C|² − 1 and d = −(VT·C), the point is occluded if d > VH² and d²/|VT|² > VH².
  - It runs hundreds of times per frame. Over half the tiles in their example are below the horizon, and it culls about 15% more tiles than the previous bounding-sphere method.
  - Caveat: terrain below the ellipsoid (sea floor) needs conservative occludee points — [Cesium blog, Horizon Culling](https://cesium.com/blog/2013/04/25/horizon-culling/)
- CDLOD selects LOD by 3D observer-to-terrain distance using one LOD function across the mesh, so altitude naturally increases the distance to all nodes and coarsens the selection — [CDLOD repo](https://github.com/fstrugar/CDLOD)
- Outerra culls skewed cube-sphere tiles by transforming frustum planes into tile space, cached per tile at deep levels — [Outerra blog](https://outerra.blogspot.com/search/label/planet%20rendering)
- Elite Odyssey's design requirement is that terrain detail is "readable from afar" and scales consistently from orbit to the surface — [Frontier forum repost](https://forums.frontier.co.uk/goto/post?id=8891008)
- Star Citizen PTv5: the planet shader estimates distant terrain colour from data, including not-yet-loaded assets, to remove pop-in during approach — [starcitizen.tools PTv5](https://starcitizen.tools/Planet_Tech_v5)
- Proland's `Deformation::getVisibility` puts visibility (frustum and horizon) testing behind the shape abstraction — [Proland Deformation](https://proland.inrialpes.fr/doc/proland-4.0/core/html/classproland_1_1Deformation.html)

### Inferences
- Priority metric for both shapes: `priority = f(distance_to_bounds / cell_size)` with LOD level chosen by CDLOD ranges, multiplied by 0 if behind the horizon (sphere only) or outside the frustum, plus a movement-direction bias for fast travel. On the sphere, cell bounds must include the curvature bulge and the max/min terrain height, or horizon and frustum tests will cull visible mountains. Use a per-cell occludee point computed with min height (Cesium's caveat).
- Approach-from-orbit budget (computed with horizon distance √(2Rh)):
  - At 400 km above an Earth-sized planet the visible cap radius is ~2,300 km. Only coarse levels (~level 5–8, tiles of tens to hundreds of km) are needed.
  - At 10 km altitude the cap is ~357 km.
  - At ground level it is ~5 km.
  - Request queues should therefore be keyed by (level, priority), with coarse ancestors always resident (a "never evict root levels" rule) so that a parent tile can always be drawn while children generate. This is the standard quadtree fallback in chunked LOD and CDLOD.
- Deterministic CPU generation lets coarse levels be generated from the same noise with fewer octaves (an octave count tied to cell size). This keeps far LOD cheap and consistent with near LOD. It is a distant-colour/"data estimate" approach in the spirit of the Star Citizen PTv5 claim above.
- City HLOD on planets: the same quadtree cell hierarchy can host HLOD proxies (merged building meshes at level L), so flat-city HLOD and planet terrain LOD use one priority queue.

### Gaps
- No primary source on Star Citizen, NMS or Light No Fire streaming budgets (tiles per frame, memory) or their orbit-entry transitions.
- No sourced data on geometry-clipmap-on-sphere variants or how they compare with quadtree LOD for planets.
