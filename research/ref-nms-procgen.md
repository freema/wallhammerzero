# Reference: seed-driven procedural planets (No Man's Sky, Light No Fire) and how to build one in the browser

- Date: 2026-10-02. Scope: the first Wallhammer Zero voxel game, a single procedural fantasy planet in Three.js generated from one static seed, plus a studio seed-browser tool.
- Method:
  - **Primary sources were actually read.** I downloaded YouTube's auto-generated captions for both GDC 2017 No Man's Sky (NMS) talks (McKendrick, Murray), for Kniberg's Minecraft talk, Eiserloh's noise-RNG talk and Lague's planets video, then read them end to end.
  - I shallow-cloned `gistya/NoMansTerrain` (commit `b7042f1`, 2026-08-23) and read it statically. Nothing was installed or executed.
  - Light No Fire facts came from a sub-research pass over official Hello Games posts. I spot-checked the Steam store page myself.
- Conventions:
  - Plain statements are **facts**, with a source and, for talks, a `[mm:ss]` caption timestamp.
  - **Opinion:** marks my assessment or recommendation.
  - **(2nd-hand)** means a summary of a source, not the source itself. **(unverified)** means I could not confirm it.
  - Caption text is automatic speech recognition, so wording can be slightly off. The numbers quoted were cross-checked for internal consistency.
- Related studio research:
  - `research/ref-sakura-crossing.md` bends a flat-authored world onto a 160 m sphere. That is the approach NMS tried first and rejected for a fly-around planet (§1.2).
  - `research/ref-voxel-musou.md` covers archetype or part-library character builders.

---

## Executive summary

1. **NMS confirms the owner's core model: world = f(seed, position).**
   - It runs as a *top-down chain of generators*: system seed, then system data, then planet seed + position, then planet descriptors, then terrain voxels. Every intermediate result can be dumped as XML to reproduce bugs ([McKendrick 31:52–33:03](https://www.youtube.com/watch?v=sCRzxEEcO2Y)).
   - Every voxel is evaluated statelessly. It may never query its neighbours, so erosion is modelled as an *end state*, not a process (McKendrick 34:42; [Murray 30:48–31:52](https://www.youtube.com/watch?v=C9RyEiEzMiU)).
2. **Geometry: simulate on the true sphere, store on a cube.**
   - Up is `normalize(pos)`. The cube face is the one with the largest |component| (McKendrick 19:01).
   - A cheap 2D **elevation transform** offsets the radius by about 600 m to 1 km. Mountains and oceans come from that offset. The stored voxels form only a **~128 m thick shell** on top of it (20:08–21:16).
   - Noise is sampled in sphere space, so cube distortion changes sample density but never the shapes.
3. **Hard numbers from the talk:**
   - 1 m³ voxels in **32³ m regions**, meshed as **~36³** with an overlap border.
   - **~6 bytes per voxel**, kept uncompressed in RAM.
   - **6 LODs**, each 2× coarser.
   - One octree for the whole solar system.
   - A 2-voxel-thick low-res sphere per planet for distant views (21:48–26:46).
4. **Polygonisation history: marching cubes, then dual contouring (shipped 2016), then dual marching cubes.**
   - The move to dual contouring was for sharp corners (39:44).
   - **Dual marching cubes** arrived in the official Worlds Part I patch notes, 2024: "reduces vertex count, increases terrain generation speed…".
   - Seams were handled by **polygonising slightly past each region with overlap**, not by Transvoxel-style stitching (22:21, 24:35).
   - Lighting used face normals and texturing used smooth normals. That pairing is the source of the slightly faceted NMS look (42:27).
5. **"Uber noise" is one fBm function with several knobs** (Murray 36:22–39:46):
   - billow↔ridge sharpness;
   - slope erosion via **analytic derivatives**;
   - altitude damping;
   - domain warp;
   - feature amplification;
   - per-octave emphasis (de-emphasise octave 1).
   
   The knobs are themselves driven by more noise. The exact formula is unpublished. The public building blocks are de Carpentier's "Swiss/Jordan turbulence" and Quilez's `1/(1+|∇|²)` damping. "Co-developed by de Carpentier" is a community claim I could not verify.
6. **Population and simulation:**
   - Foliage is noise with a cutoff plus a density-noise layer, built as recursive clusters (tree, then bush, then pebbles).
   - Gameplay objects and buildings use a **jittered "offset grid"**, so the nearest building can be computed from any point, even from space (46:26–49:12).
   - Creatures walk precomputed paths and are spawned only on approach (49:46).
   - **Physics and navmesh build cost more than terrain generation** (45:48).
7. **Tooling and versioning were first-class.**
   - Smoke tests flew through fixed planets on every build (McKendrick 52:03–53:36; Murray 44:51).
   - Changing the generator changes the world. The Foundation update (2016) "rebuilt the universe" and relocated players (Murray 48:49).
   - Worlds Part II (2025) applied new terrain **only to new (purple) star systems**, so existing bases stayed intact.
   - **Lesson: version the generator and pin saves to a version.**
8. **Light No Fire (LNF), official facts:**
   - "A fantasy planet the size of Earth"; multiplayer; "a truly open world, with no boundaries"; boats, ridden beasts and dragons.
   - "Powered by the same engine that drives No Man's Sky" (Feb 2025).
   - The NMS Voyagers tech is "shared with … Light No Fire" (Aug 2025).
   - The Steam release date is **"To be announced"** (checked 2026-10-02). There has been **no tech talk**, so any LNF terrain detail is inference from NMS patch notes.
9. **Browser determinism is achievable in plain JS.**
   - JS `+ − × ÷ sqrt` are IEEE-754 correctly rounded on float64.
   - MDN states that **"Many Math functions have a precision that's implementation-dependent"**, so keep `Math.sin/cos/exp/pow` out of gameplay-relevant generation, and keep it off the GPU.
   - Use integer position hashes (`Math.imul`), as in Eiserloh's noise-based RNG (GDC 2017).
10. **Opinion: recommended architecture.**
    - Terrain: a **cube-sphere quadtree heightfield shell** covers the whole planet (cheap LOD, horizon, flight). A **local 3D voxel band** near the player adds caves, overhangs and edits. This is NMS's "elevation + shell" split.
    - Generation: a worker pool with transferable buffers, prioritised coarse-first and view-first.
    - Planet radius: **≈20–60 km** gives clearly visible curvature from 1 km altitude (8–15° horizon dip) and 1–4 h around the planet on a flying mount. Float32 is fine with chunk-local vertices.
11. **"Interesting AND traversable" can be measured automatically:**
    - slope histograms against walk, mount and build limits;
    - connected components (union-find on a cube-sphere grid) and detour factor;
    - biome entropy, patch statistics and forbidden adjacencies;
    - POI spacing.
    
    Then generate-and-test, and plot the "expressive range" across many seeds.
12. **Opinion: seed browser design.**
    - One **isomorphic generator package** feeds three consumers: the game, a **Node CLI** (headless metrics JSON plus PNG contact sheets Claude Code can read) and a **browser page** (contact sheet, globe, metric filters, bookmarks stored as a JSON file in the repo).
    - Add **golden-hash determinism tests** across Chromium, Firefox and WebKit.

---

## 1. What No Man's Sky actually did

### 1.1 Seeds and the generator chain

- **Fact.** Seeds are positional. "We're starting by knowing which solar system we're in and we know that by a positional seed." The system data plus "the planet's position [as] basic seed" generate planet descriptors such as cliffs, mountains and oceans. These are fed into the terrain generator (McKendrick [31:52–32:28]).
- **Fact.** Between generators the data is dumpable: "we have it mostly as XML data that we can write out and store … we can store past planets and load them again to check for … performance degradation" (McKendrick [32:28–33:03]).
- **Fact (press via Wikipedia):**
  - NMS uses a 64-bit seed (Polygon 2014).
  - "Pseudorandom numbers generated from the position of each star are used to define the planetary system … the planet's position is used as a seed to define the planetary features" (The New Yorker 2015).
  - Nothing per-planet is stored server-side.
  - "The planet terrain generation code … is only 1,400 lines" (New Yorker, May 2015, pre-release).
  - Source: [Development of No Man's Sky](https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky).
- **Fact.** The engine is "agnostic to procedural content": "a texture is a texture", whether generated or authored (McKendrick [8:29–9:05]). Their stated philosophy is that procgen should *augment* artists (5:40). Murray's numbers: the whole visible game was "generated in about 300 Megs". Most of the 2 GB download was audio (Murray [13:00–13:34]).
- **Fact.** Changing the generator changes every world:
  - **Foundation (2016):** "we rebuilt the universe … resetting all the players … we've got to take you and place you somewhere safe" (Murray [48:49–49:24]).
  - **Worlds Part II (2025):** "These new terrain settings have been applied to all planets found within purple star systems. Terrain in existing systems has not been regenerated, and bases have not been reset" ([patch notes](https://www.nomanssky.com/worlds-part-ii-update/)).
  - **Worlds Part I (2024):** "Underlying terrain shapes have not been reset" ([patch notes](https://www.nomanssky.com/worlds-part-i-update/)).

### 1.2 Planet geometry: why a real sphere

Four statements from McKendrick, in the order they come in the talk:

- **Rejected approach 1 (10:46–13:32).** An infinite flat plane, wrapped onto a sphere in the shader at take-off, with the poles placed far from the player. It was rejected for three reasons:
  - pinching and "swimming" coordinates;
  - "impossible places" that cannot map consistently to the sphere, which breaks shared points of interest;
  - precision problems with infinite generation.
- **Rejected approach 2 (13:32–14:37).** Cartographic projections. They were expensive to invert, and Earth-specific ones only work if the oceans sit where Earth's do.
- **Chosen (14:37–17:23): simulate on the sphere.** Gravity points to the centre and up is position minus centre. "It has knock-on in just about every area of code."
  - The **hairy-ball theorem** means there are no continuous tangents. This is handled with triplanar projection, or with local tangent frames that are "not deterministic but … continuous".
- **Storage on a cube (17:23–19:35).** "We simulate everything on that sphere; when it comes to store voxel data we're mapping that onto a cube."
  - The resulting distortion only changes voxel *density*: "a mountain that's composed of a lower density of voxels … probably not noticeable".
  - They avoided simulating on a cube because "having edge cases at corners, literal edge cases in your world, seems like a nightmare".
  - The transform is "normalizing that direction and multiplying it by radius", and the face is found "by taking the absolute value of the largest direction".

Two more facts from the same section of the talk:

- **Elevation transform (20:08–21:16).** Distortion grows with distance from the sphere surface, so voxels only cover **about 128 m of height**. "128 meters gives you some little hillocks." Mountains and oceans come from a noise-driven radius offset of **about 600 m to 1 km**, cached locally. "We're calculating a single point of noise every time we call this transform."
- **Murray (8:30–11:45)** gives the coding consequences: "you were never within floating point accuracy … your Y is no longer up", and "nothing can be pre-baked". Even placing a marker over the nearest building needs multithreaded searches and multiple coordinate spaces.

**Opinion.** For us, the key transferable idea is the split: a 2D radius function carries the large relief, and a thin 3D layer adds overhangs and caves. It is cheaper than a full 3D planet, and it maps directly to a heightfield quadtree for distance plus voxels near the player.

### 1.3 Voxel regions, LOD and memory (McKendrick 21:48–26:46)

| Item | Value (fact, from the talk) |
|---|---|
| Voxel size at the nearest LOD | 1 m³ |
| Region | 32 × 32 × 32 m |
| Polygonised extent | "about 36 × 36 × 36 voxels". That is 1 extra row for cell corners plus an overlap "to cover seams … due to precision issues" |
| Bytes per voxel | "about six bytes": density (2 B), two material IDs (grass, rock, mountain, sand…), and a blend weight between them (exact split unclear from the ASR) |
| Residency | Kept **uncompressed** in RAM for "really quick terrain edits" and height tests. They noted compression is less effective than with Minecraft's binary voxels because density is continuous and must be lossless |
| LODs | "6 LODs, each one being twice the size", with the same edge overlap. Lower LODs also *reduce voxel density inside the region*, more vertically than horizontally |
| Vertical stack | Four regions (2 stacked) fill the 128 m band at the nearest LOD. Coarser LODs quickly become "incredibly cheap" |
| Index | An octree "for the whole solar system", swapped between planets. Regions live on and outside the cube surface |
| Far planets | "Low density voxel spheres, just two voxels high". The six cube faces are polygonised separately and mapped onto the sphere |

- **Fact, nucl.ai 2015 (2nd-hand summary):** "voxel regions on the planets are stored as octrees on cubes, but projected onto spheres, but the voxels are stored as flat arrays." The same talk had planet-wide triplanar texturing ([Karth summary](https://procedural-generation.isaackarth.com/2016/06/22/building-a-galaxy-procedural-generation-in-no.html)).

### 1.4 Pipeline and threading (McKendrick 27:24–30:46)

- **Fact.** The hierarchy of where work happens is: offline if possible, else at load time (procedural textures, model vertex data), else at runtime (terrain, "along with things like texture streaming").
- **Fact. Per-region stages:**
  1. **generate**: fill densities from noise;
  2. **polygonise**: mesh in cube space;
  3. **spherify**: map the vertices onto the planet;
  4. **physics mesh**;
  5. **nav mesh** for creatures;
  6. **populate**: plants, creatures, buildings, gameplay.
- **Fact. Threading:**
  - There is one main update thread and one graphics thread, with a sync point each frame.
  - Everything that does not touch the world runs as jobs.
  - On PS4 some stages ran as compute shaders.
  - The hand-off points are acquiring a vertex buffer, adding physics, and spawning creatures and models.
- **Fact. Ordering is "based really highly on visuals":**
  - fill a coarse LOD fast, then bring finer terrain in over it;
  - a "point based system": the area in front of the camera first, then spreading out.
- **Fact.** "Things you'd normally bake offline … physics or navigation meshes … take up a way more significant chunk of our time than actually generating or polygonizing the terrain" (45:48).

### 1.5 The terrain generator (McKendrick 33:03–39:44)

- **Requirements, stated:**
  - direct and consistent, so designers and artists can predict output from parameters;
  - real-time;
  - varied ("load of different terrains … not have holes in them");
  - real-world *and* abstract shapes;
  - modular;
  - **data-local**: "a single voxel … can't know anything about any of the other voxels … you don't model erosion as the process of eroding, you model it as the end state."
- **2D pass, per voxel column on the sphere:**
  - An **elevation** layer: "really smooth noise … really cheap", stored in a 2D array.
  - **2D features**: block-out masks for mountain, smooth and river, plus a heightmap with rubble and noise.
- **3D pass:**
  - Layered Perlin, simplex or Voronoi/cellular noise "with some turbulence in positions".
  - To avoid "big floating islands", density is **reduced with height** above the surface.
  - Samples are generated "as though we're on the sphere".
- **Structured and subtractive features:**
  - Perlin "worms" from thresholded noise.
  - **Grid shapes**: a grid over the surface with a subset of points given cubes or distorted primitives. This is used for minable resources because it gives "real control over how often they show up".
  - **Subtractive** worms for caves, with "mouths of caves [as] big open spheres".
- **Murray (40:53–42:34):** "we mix 2D and 3D a lot … that's why you get … overhangs". There are "kilometer, 2 km high mountains". Caves are hard because a cave must *break through* the surface without knowledge of neighbours.

### 1.6 Uber noise: what is known, plus a reconstruction

Murray's path to uber noise (GDC 2017):

- **[19:16–21:31] A Minecraft clone.** "Trilinear filtered low-density Perlin noise fields stacked." Polygonised and draped "like a cloth", it became "mounds and pyramids".
- **[21:31–22:41] High-density Perlin.** This is "what Space Engine uses" and the classic Terragen look. "Features are extremely repetitive … the gradient is reasonably constant."
- **[22:41–25:31] DEM-trained noise**, after Parberry. "Noise in the real world is exponentially distributed". However, "walking in the real world is super boring", and the shapes need a different scale.
- **[25:53–39:46] Uber noise.** The required list (36:22) is:
  - domain warping;
  - erosion on slopes;
  - control over altitude erosion;
  - ridges, plateaus, terraces, rolling hills;
  - non-repeating features;
  - **"an analytical derivative returned at the end … so we can feed that into more layers of uber noise"**.
  
  In detail:
  - **Sharpness** blends billow (`abs`) and ridge (`1-abs`).
  - **Slope erosion** "controls the amount of noise and detail on your slopes".
  - **Altitude damping** gives basins that flatten out ("tectonic or glacial erosion").
  - **Perturb** (domain warp) is used "to create our coastlines, our rivers".
  - **Amplify features.**
  - **Per-octave emphasis**: "have your first octave not actually be that prominent because that's what's giving you these really repetitive sequences of mountains" (39:14).
  - Every knob is varied spatially: "you would take yet more noise over the top and generate these floating point values" (37:00).
  - He credits "IQ" (Iñigo Quilez) and "these sites", and shows images from them (32:59–33:33).
- **What is not published:** the uber-noise formula itself, SDF maintenance, terraces, and "erosion flowing into rivers" (43:42).

The NMS data names line up with Murray's list (NoMansTerrain, §1.7). `TkNoiseUberData` has these fields:

- `Octaves`, `Lacunarity` (~2), `Gain` (~0.5);
- `SharpToRoundFeatures` (−1/0/1), `AmplifyFeatures` (0–0.5), `PerturbFeatures` (−0.1–0.21);
- `SlopeErosion` (0/1), `AltitudeErosion` (0–0.25), `RidgeErosion` (0/1), `SlopeGain`, `SlopeBias`;
- `Remap From/To Min/Max`.

Published building blocks:

- **de Carpentier, "Swiss turbulence"** ([source](https://www.decarpentier.nl/scape-procedural-extensions)). Ridged noise is warped by the accumulated derivative, and amplitude fades in valleys:
  ```glsl
  for (i < octaves) {
    n = perlinNoiseDeriv((p + warp * dsum) * freq, seed + i);   // n.x value, n.yz gradient
    sum  += amp * (1 - abs(n.x));
    dsum += amp * n.yz * -n.x;
    freq *= lacunarity;
    amp  *= gain * saturate(sum);                               // "altitude" style damping
  }
  ```
- **de Carpentier, "Jordan turbulence"** (same source). Squared noise `n*n.x` gives a billowy result. Separate accumulators drive warp (`dsum_warp += warp * n2.yz`) and damping (`damped_amp = amp * (1 - damp_scale / (1 + dot(dsum_damp, dsum_damp)))`). The result is gullies that mimic fluvial erosion.
- **Quilez, derivative damping** ([source](https://iquilezles.org/articles/morenoise/)):
  ```glsl
  d += n.yz;  a += b * n.x / (1.0 + dot(d, d));  b *= 0.5;  p = m * p * 2.0;
  ```
  It gives "erosion-like effects … flat areas as well as more rough areas".
- **Credit (unverified):** "Uber noise co-developed by Giliam de Carpentier" is stated in the NoMansTerrain README and community posts. The transcript shows Murray naming only IQ. Treat the attribution as unverified. The *ideas* (derivative warp and damping) are demonstrably in de Carpentier's published code.

**Opinion: a reconstruction for our JS generator.** This is not Hello Games' code. It is assembled from the sources above and gives every knob Murray lists:

```js
// One uber-noise layer at 3D point (x,y,z) on/near the sphere (units = layer wavelengths).
// noiseD(x,y,z,seed) -> [n, dx, dy, dz] gradient noise in [-1,1] with analytic gradient.
function uber(x, y, z, seed, P) {
  let sum = 0, norm = 0, amp = 1, f = 1;
  let wx = 0, wy = 0, wz = 0;            // accumulated domain warp
  let gx = 0, gy = 0, gz = 0;            // accumulated slope (for slope erosion)
  for (let i = 0; i < P.octaves; i++) {
    const [n, dx, dy, dz] = noiseD((x + wx) * f, (y + wy) * f, (z + wz) * f, (seed + i) | 0);
    const a = Math.abs(n), sg = n < 0 ? -1 : 1, s = P.sharpness;          // -1 billow … +1 ridge
    const shaped = s >= 0 ? n + ((1 - 2 * a) - n) * s : n + ((2 * a - 1) - n) * -s;
    const dShape = s >= 0 ? 1 + (-2 * sg - 1) * s : 1 + (2 * sg - 1) * -s;  // d(shaped)/dn
    gx += amp * dShape * dx; gy += amp * dShape * dy; gz += amp * dShape * dz;
    const slopeDamp = 1 / (1 + P.slopeErosion * (gx * gx + gy * gy + gz * gz)); // Quilez-style
    const w = i === 0 ? P.firstOctaveWeight : 1;                         // Murray: de-emphasise octave 1
    sum += w * amp * shaped * slopeDamp * (1 + P.amplify * a);
    norm += w * amp;
    wx -= P.perturb * amp * dx * n; wy -= P.perturb * amp * dy * n; wz -= P.perturb * amp * dz * n; // Swiss warp
    const alt = Math.min(1, Math.max(0, 0.5 + 0.5 * sum / norm));         // 0 = low, 1 = high
    amp *= P.gain * (1 - P.altitudeErosion + P.altitudeErosion * alt);   // Swiss 'saturate(sum)' damping
    f *= P.lacunarity;
  }
  return sum / norm;   // also return (gx,gy,gz)/norm if the next layer needs the slope
}
// Murray 37:00: drive P.sharpness/perturb/slopeErosion with low-frequency noise per region
// so features change as you travel ("non-repeating features").
```

Terraces (NMS `PlateauStratas`/`PlateauSharpness`), as a simple form: `t = h*k; h' = (floor(t) + pow(fract(t), sharpness)) / k`. A remap (`Remap From/To`) is a linear window with a clamp applied before scaling by layer height.

### 1.7 NMS terrain data as modders see it (NoMansTerrain repo, read statically)

- **Fact (repo).** NoMansTerrain is a SwiftUI/SwiftCrossUI editor for NMS's `VoxelGeneratorSettings` (`TkVoxelGeneratorData`). It is not a terrain renderer, and it contains no NMS algorithm code. It models the data and approximates region masks (`NoMansTerrainCore/…/RegionMaskModel.swift`, a seeded value noise stand-in).
- **Fact (README §1–§6, confidence-tagged by its author).** "final density = Σ NoiseLayers + Σ GridLayers + Σ Features + Caves (subtracted) ± SeaLevel/building/smoothing". Each layer has `Active`, `Subtract` and `MaximumLOD`. The rosters are:
  - **8 noise layers:** Base, Hill, Mountain, Rock, UnderWater, Texture, Elevation, Continent.
  - **9 grid layers:** Small and Large pillars or floating islands, plus 7 resource grids.
  - **7 features:** River, Crater, Arches, ArchesSmall, Blobs, BlobsSmall, Substance.
  - **1 cave system:** Mouth and Tunnel.
- **Fact.** Every terrain type ships as a **Min/Max pair**. "The game picks a value somewhere between … seeded by the planet, so one terrain type yields a family of related planets" (README; [Step Mods tutorial](https://stepmodifications.org/wiki/NoMansSky:Tutorials/Terrain_Generation)).
- **Fact. Material and offset enums:**
  - voxel types `Base, Rock, Mountain, Sand, Cave, Substance_1..3, RandomRock…`;
  - `OffsetType` `Base/All/Zero/SeaLevel`, which places layers relative to sea level;
  - `WaterFade` `Above/Below/None`;
  - grid primitives including **Gielis superformula** shapes and a rounded-box "SuperPrimitive".
- **Fact: concrete scales from `Alpine_Min.xml`.** Units appear to be metres (inferred). Shown as width / height:

| Layer | Width | Height | Octaves | Notes |
|---|---|---|---|---|
| Continent | 100,000 | 200 | 5 | Lowest frequency |
| Elevation | 2,500 | 400 | 5 | |
| Mountain | 1,000 | 128 | 5 | Ridge erosion 1, altitude erosion 0.25, remap 0.5–0.7 |
| Base | 800 | 32 | 4 | Sharp→round −1, perturb 0.15 |
| Hill | 350 | 64 | 5 | Ridge 1, amplify 0.3, region ratio 0.75 |
| UnderWater | 250 | 100 | 7 | |
| Rock / Texture | 50 / 100 | 8 / 10 | 5 | Inactive in this file |
| Cave mouth / tunnel | 15 / 25 | 50 / 12.5 | 1 | Region 50 / 125, `MinimumCaveDepth` 6 |

  Building pads use `BuildingSmoothingRadius` 150 and `BuildingSmoothingHeight` 200, which flatten terrain where structures go.
- **Fact: lessons encoded in the code.**
  - `LODMax.swift`: "Lower values [of MaximumLOD] cause in-game rendering problems" (popping or seams when a layer drops out at coarse LOD).
  - `ClaudeInsaneTerrains.swift`: "very thin, high-frequency spikes tear holes in the terrain". Features thinner than the voxel grid cannot mesh.
- **Opinion.** Copy three things:
  1. the layer roster as a starting vocabulary;
  2. the Min/Max "archetype family" idea for regional variety on one planet;
  3. the two failure modes as automated checks (layer dropout across LOD; minimum feature thickness of at least 2 voxels).

### 1.8 Polygonisation, seams, LOD, texturing

- **Fact. Algorithm (McKendrick 39:44–40:47).** "We use dual contouring. We started out with marching cubes … marching cubes will only create polygons that lie on the edges … really bad for creating corners." Dual contouring needed extra work "to avoid corners that lie way outside of our cube", via mass-point clamping.
- **Fact. Later change, official.** Worlds Part I (July 2024): "Terrain generation has been rewritten to incorporate **dual marching cubes** voxel meshing, which reduces vertex count, increases terrain generation speed, improves framerate and saves significant amounts of memory."
- **Fact. Extra polygonisers (40:47–41:53):**
  - A **cube (Minecraft-like) polygoniser** for resource deposits. It is vertex-heavy, so it is used only at near LODs.
  - A **flat-plane polygoniser** for water. Because of the elevation transform, water planes can sit far above the voxel band. "In future … we'll probably do it entirely implicitly in a shader." Worlds Part I later introduced mesh-based water with real waves.
- **Fact. Seams:**
  - Same-LOD seams are covered by polygonising a 36³ region for a 32³ region (22:21).
  - Between LODs: "we tend to match up at the edges just by polygonizing a little bit over and we tend not to get holes between LODs" (24:35). Distance hides the remaining mismatch.
  - **(2nd-hand, not in the transcript):** Zylann's summary adds "using a lower isolevel" for the overlap ([godot_voxel #24](https://github.com/Zylann/godot_voxel/issues/24)). He reports that porting the trick to Transvoxel caused z-fighting.
- **Fact. Normals and materials (42:27–43:34):**
  - Two normals are kept per vertex: smooth for texturing, **face normal for lighting**. That gives "a slightly low poly look".
  - Normals are octahedron-encoded.
  - Per vertex there are two materials plus a blend value. A vertex is built from 8 voxels, and storing more materials "just wouldn't be performant".
- **Fact. Texturing (43:34–45:15):**
  - Triplanar mapping uses the **planet's** axes, not local ones. The blend zones "distribute … across the whole planet" acceptably.
  - An artist-made atlas is blended via height textures and recoloured in game.
  - Two texture scales are continuously swapped as you approach.
- **Fact. Fades (50:18–51:56).**
  - Newly ready terrain and objects fade in with a *time-based* dither (a 0–1 shader value).
  - Grass uses a *distance-based* fade.
  - He would prefer distance-based fades everywhere, but that "needs you to have generated enough terrain far enough away".

### 1.9 Population and simulation

- **Fact. Foliage (46:26–47:34):**
  - Objects are placed at noise maxima above a cutoff, plus "an additional layer of noise that just cuts down on the density".
  - It ran on PS4 compute.
  - Artists want recursive clustering: "a tree with some bushes with some small plants with some pebbles at the bottom" (citing Kate Compton).
- **Fact. Gameplay objects (47:34–48:40):**
  - An **offset grid** is used ("split our terrain into grid cells and choose how many of those should be active") wherever spacing must be controlled.
  - Large objects are placed on **coarse LOD** terrain. When finer terrain arrives they are repositioned, with an impostor-to-model fade.
- **Fact. Buildings (48:40–49:12).** "The one thing that we need to see from space." An offset grid lets you "take any point on the sphere and determine the nearest building". Murray adds that validity checks (under water, too steep) make "find nearest building" expensive and multithreaded (10:41–11:45).
- **Fact. Creatures (49:46–50:18).** "We generate these paths for them to follow but we don't actually add the creatures till you get in really close." Positions are therefore stable when you leave and return.
- **Fact (press, via Wikipedia):**
  - Artists "hand-create core structures … a basic skeleton and skin for a creature … and then allow the algorithm to make randomized changes" (New Yorker 2015).
  - Parts are mixed and the skeleton is adjusted so "a creature with a tiny body could not support a giant head" (The Atlantic 2016).
  - Behaviour comes from **tags and affinity levels** (The Atlantic 2016).
  - Flora uses L-systems (the article asserts this, with weak sourcing).

### 1.10 Evaluation: browsing seeds was core tooling

- **Fact.** "We need to be able to really quickly go through loads of planets … all my planets [are] red … there's clearly a bug … there's this whole space that we haven't explored." The "smoke test tool" captures screenshots and performance numbers on the *same planets* every build (McKendrick [52:03–53:36]).
- **Fact.** "Testing the untestable … every player is going to boot up into different star system and have different memory requirements … flying little drones out … a smoke test … after every check-in" (Murray [44:18–45:24]).
- **Fact.** McKendrick's own takeaways (2nd-hand blog summary of the same talk): augment artists, and build evaluation tools that track generator output across builds ([procedural-generation tumblr](https://procedural-generation.tumblr.com/post/158637281963/continuous-world-generation-in-no-mans-sky-gdc)).

---

## 2. Light No Fire: what is official (as of 2026-10-02)

Labels:

- **[OFF]** official (Steam page, lightnofire.com, trailer, NMS patch notes, Sean Murray's Steam posts).
- **[INT]** Murray quoted in a press interview.
- **[PRESS]** a journalist's reading.

The Steam store page was re-checked by me. The Steam news posts are JS-rendered and were checked by the sub-research pass only. Their IDs are given so they can be re-verified.

- **[OFF] Steam app 2719590** ([store](https://store.steampowered.com/app/2719590/Light_No_Fire/)):
  - "Light No Fire is a game about adventure, building, survival and exploration together. Set on a fantasy planet the size of Earth, it brings the depth of a role playing game to the freedom of a survival sandbox."
  - Feature blocks: **A Multiplayer Earth** ("Construct persistent buildings and communities"), **A Procedural Earth** ("A truly open world, with no boundaries at a scale never attempted before"), **A Fantasy Earth** ("an ancient earth to uncover. One where you're not the hero"), and **An Unexplored Earth** ("Every mountain can be climbed … oceans and continents … Set sail across vast oceans and rivers, ride wild beasts … fly dragons").
  - Release date: **To be announced**. OS: **To be confirmed**.
  - lightnofire.com and its press fact sheet say "Release Date: TBC / Platforms: TBC".
- **[OFF] Trailer** ([jKQem4Z6ioQ](https://www.youtube.com/watch?v=jKQem4Z6ioQ), 2023-12-07). There are no tech claims in the description.
- **[OFF] "The Next Ten Years"** (Murray, 2023-12-14, Steam news gid 7585814657460962767):
  - "For our new game we have created an earth. A planet as varied as a universe, bigger than earth itself. With real mountains, multiple miles tall … rivers, canyons, oceans, continents, islands as big as countries."
  - It names fantasy-map inspirations (Earthsea, Narnia, Middle-earth, Westeros) and says "a single planet we are going to let everyone play on together".
  - He gives about five years of development, which press turns into "since 2018".
  - Note that "bigger than earth" here conflicts with "the size of Earth" in the store copy.
- **[OFF] Engine:**
  - "Our upcoming game, Light No Fire, is powered by the same engine that drives No Man's Sky" (Titan post, 2025-02-12, gid 1791482680862497). This is the only explicit official engine statement found.
  - "Much of the technology we're introducing with Voyagers is shared with our next game, Light No Fire, which is a truly open world, a shared Earth-sized planet, with real oceans to traverse, needing large boats and crews" ([Voyagers](https://www.nomanssky.com/2025/08/no-mans-sky-voyagers/), 2025-08-27).
- **[OFF] Tech flowing back into NMS:**
  - Worlds Part I (2024): dual-marching-cubes meshing, mesh water with waves, rewritten clouds and GPU-based object rendering. Murray: "Over the last five years making this game [LNF] … we're feeding that back into No Man's Sky."
  - Worlds Part II (2025-01-29) patch notes: the terrain algorithm was "evolved and refined" for "mountains, deep valleys, and sprawling plains"; there are fewer repeating patterns; "significantly deeper oceans … stretching down kilometres"; gas giants; and "colossal worlds on a scale never before seen".
  - Murray's post (gid 1790214123053554): "I've been working on a new terrain system … huge mountains and these massive features", "Gas giants … ten times bigger than our biggest planet", "oceans that can be several kilometers deep".
  - **Not stated anywhere:** that this terrain system *is* LNF's. It is implied only by "same engine".
- **[OFF]/[PRESS] COSMOS 7.0 (2026-09-09).** The deep-dive video (as transcribed by GamesRadar) calls stations, large alliances and "new volumetric lighting tech" "tech we get to test now … on our other game, Light No Fire". The patch notes list "significantly improved terrain tessellation quality".
- **[INT] Status and team:**
  - Eurogamer, 2026-08-10: "I've learned my very important lesson of not talking about things beforehand … well past the point any other studio would be talking about their game." No date was given.
  - GamesRadar, 2026-08: a "tiny team", "anywhere between 12 and 20 people".
- **[PRESS] Speculation, not fact:**
  - flying mounts as a planned feature (from trailer visuals);
  - wood and stone building, settlements and ruins (trailer visuals; not in the official text);
  - release in "late 2026 or 2027".

**Opinion.** LNF validates the *design* target: one shared, seed-generated Earth-scale planet with oceans, mountains and mounts. Its *tech* is opaque. What is public points to the NMS stack scaled up: DMC voxels, deeper oceans, bigger planets and relative-space multiplayer. Plan from NMS's GDC material, not from LNF.

---

## 3. Translating it to the browser (Three.js, Web Workers)

### 3.1 Determinism in JS: what is safe

- **Fact.** JS numbers are IEEE-754 float64. `+ − × ÷` and `Math.sqrt` are correctly rounded, and the language defines each operation's rounding, so engines cannot silently fuse `a*b+c`.
- **Fact (MDN).** "Many Math functions have a precision that's implementation-dependent. This means that different browsers can give a different result. Even the same JavaScript engine on a different OS or architecture can give different results!" ([MDN Math](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math))
- **Fact. Requirements for procedural RNG (Eiserloh, [GDC 2017 "Noise-Based RNG"](https://www.youtube.com/watch?v=LWFzPP8ZbdU)):**
  - The same result across Android, iOS, Mac and PC (9:55).
  - **Order independence and random access**, since "chunks … generate in random order" and "the mountain better still be there" (5:01, 21:50–24:00).
  - Thread safety and cheap instantiation.
  - Noise functions (position → mangled bits) give all of these: "zero state … totally thread safe … true random access … each seed can give us a totally [different table]" (27:21–28:30).
  - Generate "villages, NPCs … in any order" (30:08).
  - Build the hash by "multiply by big primes … xor yourself with your own bits shifted" (39:01–40:42).
- **Fact.** `simplex-noise` (jwagner) v4: `createNoise2D/3D/4D(random)`. It defaults to `Math.random`, and the docs recommend a seeded PRNG such as `alea`. MIT licence. About 73M 2D and 48M 3D samples per second on a Ryzen 5950X. "Input coordinates bigger than 2^31 may not result in a noisy output." ([repo](https://github.com/jwagner/simplex-noise.js))

**Opinion: rules for our generator.**

1. **Gameplay-relevant generation stays in JS or WASM, never on the GPU.** This covers heights, collision, placement, biome IDs, anything saved, and anything compared across clients. GPU shaders (mediump on mobile, vendor-specific rounding) are for visuals only. In WASM, avoid relaxed-SIMD instructions; to my knowledge they permit implementation-defined fusing (unverified).
2. **Only `+ − × ÷ sqrt floor`, plus integer ops via `Math.imul`, `|0` and `>>>`.** No `Math.sin/cos/exp/pow/atan` in generation. If trig is needed, use our own polynomial. The common shader hash `fract(sin(x)*43758.5453)` is banned in the generator.
3. **All randomness is a hash of (seed, tag, integer coordinates).** No sequential PRNG crosses a chunk or entity boundary. A sequential PRNG is fine *inside* one deterministic unit, for example a village layout seeded from the village's hash.
4. **Golden tests.** Hash the outputs of a fixed probe set (e.g. 10k heights, 50 chunk meshes, the POI list) for 3 seeds. Run them in CI under Chromium, Firefox and WebKit (Playwright) and in Node, and fail on any diff. This is NMS's smoke test, specialised to determinism.

```js
// seed.js — stateless, order-independent hashing (Squirrel3 structure per Eiserloh's GDC17 talk;
// constants as commonly published from that talk — re-check against his source before shipping).
const BN1 = 0xB5297A4D, BN2 = 0x68E31DA4, BN3 = 0x1B56C4E9;
export function squirrel3(n, seed) {
  let m = Math.imul(n | 0, BN1);
  m = (m + (seed | 0)) | 0;
  m ^= m >>> 8;
  m = (m + BN2) | 0;
  m ^= m << 8;
  m = Math.imul(m, BN3);
  m ^= m >>> 8;
  return m >>> 0;
}
export const hash2 = (x, y, s) => squirrel3((x + Math.imul(198491317, y)) | 0, s);
export const hash3 = (x, y, z, s) => squirrel3((x + Math.imul(198491317, y) + Math.imul(6542989, z)) | 0, s);
export const unit = (h) => h / 4294967296;                    // [0,1), exact in float64
export function fnv1a(str) {                                   // stable tag → uint32
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(str)) { h ^= b; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// Hierarchical seeds by position, never by call order:
export const child = (seed, tag, a = 0, b = 0, c = 0) => hash3(a, b, c, squirrel3(fnv1a(tag), seed));
// planet = PLANET_SEED; continents = child(planet,'continents'); village = child(planet,'village',face,ci,cj)
```

Seed size: the owner's notes say 64-bit like NMS. **Opinion:** store the world seed as two uint32 words, or as a hex string. Hot paths should use 32-bit derived seeds, which avoids BigInt.

### 3.2 Planet scale, curvature and precision

These figures are my own calculations: smooth-sphere geometric horizon `d = √(2Rh + h²)`; horizon dip at 1 km = `acos(R/(R+1000))`; float32 ulp at the surface radius.

| Radius | Circumference | Horizon on foot (2 m) | From 100 m | From 1 km | Dip @1 km | Horse 12 m/s, once around | Flyer 40 m/s, once around | f32 ulp at surface |
|---|---|---|---|---|---|---|---|---|
| 5 km | 31 km | 141 m | 1.0 km | 3.3 km | 33.6° | 0.7 h | 0.2 h | 0.5 mm |
| **30 km** | **188 km** | **346 m** | **2.5 km** | **7.8 km** | **14.6°** | **4.4 h** | **1.3 h** | **2 mm** |
| 100 km | 628 km | 632 m | 4.5 km | 14.2 km | 8.1° | 14.5 h | 4.4 h | 8 mm |
| 600 km | 3,770 km | 1.5 km | 11 km | 35 km | 3.3° | 87 h | 26 h | 63 mm |
| 6,371 km (Earth) | 40,030 km | 5.0 km | 36 km | 113 km | 1.0° | 927 h | 278 h | 0.5 m |

**Opinion.**

- **Radius.** "Curvature visible from altitude" plus walkable distances that feel large argues for **R ≈ 20–60 km**, with relief in the NMS proportion (±1–2 km). At Earth scale curvature is barely visible below orbit, and an AI-built game cannot fill that much interesting content anyway. The radius is a single parameter, so the seed browser can show the metrics as R varies.
- **Precision.** Store meshes in **chunk-local coordinates**, with `mesh.position` set to the chunk origin. Three.js composes `modelViewMatrix` in float64 on the CPU and uploads float32, so the GPU only sees camera-relative values. This is "floating origin" with no extra work. Simulation and physics run in JS float64.
- **Depth range.** Spanning a 1 m near plane to a far horizon (8–35 km), or the whole planet from orbit, needs one of:
  - a logarithmic depth buffer (`logarithmicDepthBuffer: true`); Outerra's formula is `z = log(C·w+1)/log(C·Far+1)·w`, at the cost of per-fragment depth writes, which lose early-Z ([Outerra](https://outerra.blogspot.com/2009/08/logarithmic-z-buffer.html));
  - or two passes: far terrain plus atmosphere, then clear depth, then the near scene.

### 3.3 Cube-sphere mapping and quadtree LOD

Cube-to-sphere mappings, measured by my calculation over one face:

| Mapping | Formula | Max/min cell area | Max/min grid edge | Inverse | Determinism |
|---|---|---|---|---|---|
| Naive normalize (NMS) | `p/‖p‖` | **5.1** | 2.1 | trivial (divide by max \|c\|) | sqrt only, safe |
| Nowell ([mathproofs 2005](https://mathproofs.blogspot.com/2005/07/mapping-cube-to-sphere.html)) | `x' = x·√(1 − y²/2 − z²/2 + y²z²/3)`, cyclic | **1.32** | 1.71 | messy (closed form exists) | sqrt only, safe |
| Tangent-adjusted (as in S2-style mappings) | `normalize(tan(u·π/4), tan(v·π/4), 1)` | 1.41 | **1.41** | `atan` | needs own tan/atan |

**Opinion.**

- **Mapping choice.** Use **Nowell or tangent for vertex placement** (more uniform triangles). Use **naive face/UV for keys**: chunk IDs, save keys, placement cells. Every noise and gameplay query takes the 3D direction as input, so the mapping choice cannot create seams (NMS's point, McKendrick 37:29).
- **Quadtree per face:**
  - Split when `distance(camera, node bounds) < k × nodeSize` (k ≈ 1.5–2.5), or use screen-space error.
  - Enforce **2:1 balance** between neighbours, including across face edges, so stitching only handles a single level step.
  - Each node gets a fixed grid, e.g. 33×33 vertices.
- **Reference implementation to study:** SimonDev's `ProceduralTerrain_Part10` (MIT, Three.js) does exactly this:
  - `CubeQuadTree` with six face transforms and root neighbours found via edge midpoints;
  - a 7-worker pool;
  - **skirts** and `FixEdgesToMatchNeighbours_`, which snaps edge vertices to the coarser neighbour's stride;
  - edge-normal rebuild;
  - `PLANET_RADIUS 400 km`.
  
  It posts results by structured clone, not transfer, which is an easy improvement ([repo](https://github.com/simondevyoutube/ProceduralTerrain_Part10), read statically).
- **LOD-consistent evaluation.** A node with vertex spacing `s` evaluates only octaves whose wavelength `λ ≥ 2s`, and fades the boundary octave with `smoothstep(2s, 4s, λ)`. Shared edge vertices then get identical heights at both levels. Never drop whole layers by LOD; NoMansTerrain's `MaximumLOD` warning (§1.7) shows why.
- **Horizon culling (visual only, so Math.acos is fine).** A point at radius `r_q` is hidden behind the minimum-radius sphere `R0` when `angle(ĉ, q̂) > acos(R0/r_c) + acos(R0/r_q)`. Test each node's bounding sphere conservatively.

### 3.4 Terrain representation: heightfield shell plus local voxel band

**Opinion.** Mirror NMS's split (§1.2, §1.5):

```
surfaceR(n̂) = R + continent(n̂) + elevation(n̂) + Σ uberLayers(n̂)          // 2D on the sphere: noise at n̂·R (3D input)
density(p)  = surfaceR(n̂) − |p|                                              // > 0 solid
            + shell3D(p) · clamp(1 − |(|p| − surfaceR(n̂))| / H3D, 0, 1)    // overhangs only near the surface
            − caves(p) · caveMask(n̂)                                         // worms/cheese, subtractive
```

- **Far and mid range:** the quadtree heightfield of `surfaceR` (§3.3). It is cheap, covers the whole planet, and drives the horizon, flight and maps.
- **Near the player** (e.g. ≤ 150–250 m): 3D voxel chunks of `density` add overhangs, arches and cave mouths, and are where edits happen. The fade term follows McKendrick's "reduce the density by height" (37:29) and Kniberg's "squashing factor" (28:34–29:40). It is the main tuning knob for "madness vs normal terrain".
- **Joining the two:** the voxel band replaces the heightfield nodes it covers. Use a skirt or overlap at the boundary, and keep voxel-only features (arches, overhangs) inside the band radius. NMS accepted small distant mismatches; so can we.
- **Placement uses `surfaceR` analytically, never the mesh.** It is identical at every LOD, so NMS's "reposition when finer LOD arrives" step disappears. Sink objects by the amplitude of the octaves dropped at the current LOD so nothing visibly floats.

### 3.5 Meshing and seams; blocky versus smooth

| Option | Seam handling | Look | Cost and complexity |
|---|---|---|---|
| Heightfield node grid | skirts (simplest), edge snapping (SimonDev), or CDLOD vertex morph (no stitching; "LOD function is the same across the whole mesh", [CDLOD](https://github.com/fstrugar/CDLOD), MIT) | smooth or flat-shaded | lowest |
| Surface Nets / dual-style voxels | overlap border (NMS), or a seam octree from neighbour leaf nodes ([Gildea](http://ngildea.blogspot.com/2014/09/dual-contouring-chunked-terrain.html)) | chunky low-poly with face normals (NMS look) | low–medium |
| Marching cubes + **Transvoxel** | transition cells, "512 cases … 73 equivalence classes", patent-free ([transvoxel.org](https://transvoxel.org/)) | smooth | medium |
| Dual contouring | sharp features, needs QEF and mass-point clamping (McKendrick 40:16) | sharp | high |
| Dual marching cubes (NMS 2024) | fewer vertices than DC | sharp/smooth | high |
| True cubes (Minecraft) on a cube-sphere grid | none needed within a face; misaligned at 12 cube edges and 8 corners; blocks shrink toward the core and vary about 1.4–2.1× in size across a face | iconic "voxel" | low per chunk; awkward globally |

**Opinion.**

- **v1:** heightfield quadtree with skirts plus CDLOD-style morph for the planet. For the local voxel band, use **Surface Nets with flat (face-normal) shading**. That is NMS's "slightly low poly look" (42:27) and reads as "voxel" without the cube-on-sphere problems.
- **Buildings, villages and fortresses** can still be literal blocks or parts, snapped to a **local tangent grid** anchored at each site, as LNF's wood and stone building appears to be ([PRESS]).
- **Avoid true cube terrain** unless the planet is tiny (R ≤ 5 km), where the face-edge artefacts become a stylistic feature.

### 3.6 Workers and chunk streaming

**Fact.** SharedArrayBuffer needs a secure context *and* cross-origin isolation (COOP and COEP headers; check `crossOriginIsolated`) ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)). Transferable ArrayBuffers move ownership between threads without copying ([MDN Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)).

**Opinion: design.**

- **Pool size:** `navigator.hardwareConcurrency − 1` workers, capped at about 4 on mobile for thermals.
- **Workers are pure.** A worker takes `{seed, genVersion, nodeKey, lod}` and returns typed arrays (positions as f32, normals oct-encoded as i8/i16, material and blend as u8, indices as u16), listed in the `transfer` argument.
- **No SharedArrayBuffer** is needed unless we later share voxel edit buffers. That avoids the COOP/COEP hosting constraint, which matters for itch.io-style embeds.
- **Priority queue (NMS 30:12–30:46):**
  1. coarse coverage of the whole visible planet;
  2. nodes in the view frustum, nearest first;
  3. behind the camera.
  
  Requests whose node has been merged or split away get **cancelled** using a generation counter.
- **Main thread:** cap `BufferGeometry` uploads per frame (e.g. ≤ 2 ms or ≤ N nodes), and fade new nodes in with dither, as NMS did (51:24).
- **Same code in Node:** every generator module is a pure ES module with no DOM, so the CLI (§4.3) runs it unchanged.

### 3.7 Memory and time budgets: desktop versus mobile webviews

All figures in this section are **estimates (Opinion)**. Measure them on real devices.

- **Noise throughput.** The `simplex-noise` figures are about 48M 3D samples/s on a top desktop CPU. Assume 3–6× slower on mid-range phones (unverified). Uber noise with derivatives and warp costs about 2–4× plain noise per octave.
  - **Heightfield node, 33² vertices**, three layers × six octaves: about 60k noise-equivalents, roughly 1–2 ms desktop and 4–10 ms mobile per worker.
  - **Voxel chunk, 32³**, two 3D layers × four octaves plus caves: about 300k noise-equivalents, roughly 6–10 ms desktop and 25–60 ms mobile. Generate a 2D `surfaceR` grid once per chunk column and reuse it, as NMS stored elevation in a 2D array.
- **Streaming requirement.** New high-detail area per second is about `2 · r_hi · v`.
  - Flyer at 40 m/s with `r_hi` = 200 m: 16,000 m²/s, about 16 columns of 32×32 m, so about 32 voxel chunks/s. That is about one mobile worker fully busy. In practice, drop the voxel band while flying fast.
  - Horse at 12 m/s: about 5 columns/s, which is comfortable.
- **GPU memory.** One heightfield node is 1,089 vertices × about 20 B ≈ 22 KB, with one shared index buffer for all nodes. 300–600 live nodes come to about 7–13 MB. Foliage is instanced, at 16–64 B per instance.
- **CPU memory.** NMS keeps about 6 B per voxel uncompressed. For a 34³ chunk at 2 B per voxel (density i8 plus material u8), that is 79 KB. A 250 m radius × 64 m tall band is about 200 chunks, about 16 MB. Keep voxels only for the band plus edited chunks.
- **Targets:**
  - Desktop: under about 1 GB total, 60 fps, a first playable view in under 3 s.
  - Mobile webviews: under about 300 MB JS heap plus about 200 MB GPU, 30–60 fps, a first view in under 6 s.
  - Handle `webglcontextlost`.
  - **(unverified)** iOS WebKit kills tabs under memory pressure at device-dependent thresholds, often quoted around 1–1.5 GB on recent devices and lower on older ones. Treat this as a hard ceiling and test on the oldest supported iPhone.

### 3.8 A curved horizon without seams

**Opinion.**

- **The quadtree always covers the whole sphere.** Coarse nodes reach to the horizon, so there are no holes and no separate "planet proxy" in the play view. NMS used its low-res 2-voxel sphere for other planets and for space views (26:46).
- **Horizon culling** (§3.3) removes the back hemisphere.
- **Atmosphere:** an analytic single-scattering sky plus aerial perspective on terrain. It is the best seam-hider, and it sells the curvature. SimonDev Part10 includes a scattering shader to study.
- **Ocean:** a separate sphere at sea level, with its own quadtree or a camera-centred projected grid. Shore foam comes from `depth = seaR − surfaceR(n̂)`, computed analytically. NMS used a separate water polygoniser and then mesh water.
- **Shared morph:** LOD transitions fade by distance (CDLOD morph), and the atmosphere and fog share the same distance function, so popping lands inside haze.
- **Validation:** a seed-browser camera script flies an ascent from 2 m to 20 km and captures frames. Diffing consecutive frames flags LOD pops and cracks automatically.

### 3.9 Population: biomes, villages, fortresses, creatures

**Biomes.**

- **Fact.** Minecraft's climate parameters are continentalness, erosion, peaks-and-valleys/weirdness, temperature and humidity:
  - **Splines** shape height from the first three ([Kniberg 19:16–24:42](https://www.youtube.com/watch?v=ob3VwY4JyzE)).
  - **Lookup tables** over value ranges choose discrete biomes. "Neighbors matter a lot. We don't want a desert to neighbor … snowy peaks" (34:36–38:27).
  - Surface biomes are 2D. 3D biomes are used only for caves (41:47).
  - The noise router exposes `temperature, vegetation, continents, erosion, depth, ridges` "only for biome placement", and `final_density > 0` means solid ([wiki](https://minecraft.wiki/w/Noise_router)).
- **Fact.** Red Blob's elevation × moisture table (after Whittaker), the redistribution `e = pow(e, k)`, terraces `round(e·n)/n`, and blue-noise tree placement at local maxima ([article](https://www.redblobgames.com/maps/terrain-from-noise/)). Vintage Story uses polar–equator climate bands ("polarEquatorDistance", default 50,000 blocks) ([config](https://wiki.vintagestory.at/World_Configuration)).
- **Opinion.** On a real sphere:
  - temperature = f(latitude, altitude lapse, noise);
  - moisture = f(noise, coarse distance-to-ocean field);
  - plus continentalness, erosion and weirdness;
  - then a hand-authored lookup table (Claude can author and tune it as data) with a **forbidden-adjacency list** enforced by the seed metrics (§4.1).
  
  Biome archetypes carry **Min/Max parameter ranges**, as in NMS (§1.7). The region seed picks values, so two forests differ.

**Sites: deterministic placement anywhere.**

- **Fact.** Minecraft `random_spread`: one attempt per `spacing×spacing` chunk region, offset by `[0, spacing − separation)`, using `linear` or `triangular` spread, a `salt` mixed with the world seed and region coordinates, plus `frequency` and exclusion zones ([wiki](https://minecraft.wiki/w/Structure_set)). NMS's "offset grid" (48:40) is the same idea.
- **Fact.** Valheim location rules, as exposed by the Jotunn modding API ([LocationConfig](https://valheim-modding.github.io/Jotunn/api/Jotunn.Configs.LocationConfig.html)):
  - `Quantity`;
  - `Min/MaxDistance` from map centre;
  - `Biome`;
  - `Min/MaxAltitude`;
  - **`Min/MaxTerrainDelta`**, the height range inside `ExteriorRadius`, which is a flatness test;
  - `MinDistanceFromSimilar` / `Group`;
  - `InForest` with forest-fractal thresholds;
  - `SlopeRotation`, `SnapToWater`, `ClearArea`, `Prioritized`.

**Opinion: a village recipe.**

1. Use an offset grid on the cube-sphere, e.g. 1.5–3 km cells, with one jittered candidate per cell from `child(seed,'village',face,i,j)`.
2. **Validate** with Valheim-style rules: biome allowed; altitude above sea level plus a margin; terrain delta ≤ X within r = 60–120 m; water within d; on the main walkable component (§4.1).
3. **Thin out** by minimum distance from similar sites, keeping the best score per macro-region.
4. **Lay out** in the local tangent frame:
   - a main street along a contour line, lanes branching off;
   - plots along the roads;
   - building archetypes (house, inn, smithy, shrine, well, palisade) with hash-picked parameters;
   - flatten the terrain under footprints as a *generator-time* density edit. This is part of f(seed), not a save delta, like NMS's `BuildingSmoothingRadius`.
5. **Fortress:** take the local maximum of *prominence* on ridges inside a larger cell. Walls follow a height isoline offset below the summit, towers go at convex corners, and the gate faces the road.
6. **Roads:** A* on the coarse traversability grid with a slope cost. The roads double as proof of reachability.

**Opinion: creatures and NPCs from archetypes.**

- An archetype is a skeleton topology, part slots, palette rules and a behaviour profile (tags and affinities, per the NMS press facts).
- The seed picks proportions within constrained ranges, for example head/body ratio (Murray's "tiny body … giant head" rule).
- Herds are bound to offset-grid cells with **closed-form paths** `pos = path(cellSeed, t)`, so they exist deterministically without simulation and spawn on approach (NMS 49:46).
- Reuse the part-library builder contract from `research/ref-voxel-musou.md`.

### 3.10 Saves: store only deltas

- **Fact.** Minecraft Java saves the whole generated chunk on first visit. Kniberg notes the alternative: "a pretty common thing is that you just store the delta … regenerates that chunk and applies that change" (43:25–44:46). NMS keeps everything generated except player deltas. Its generator changes were handled by a universe reset (2016) or by limiting new terrain to new systems (2025), see §1.1.
- **Opinion: format.**

```js
save = {
  format: 1,
  planetSeed: "9f3c…",            // the static seed
  genVersion: "wz-planet@0.7.0",  // generator code version; old versions stay loadable
  probeHash: "…",                 // golden hash of the probe set at save time → detect drift on load
  chunks: {                       // key = naive cube-face coords at LOD0 (§3.3)
    "f2:i1834:j912:k3": { baseHash: "…", edits: "<RLE of (index, density, material)>" }
  },
  entities: { "village:f2:41:17/house3": { burned: true }, "chest:f4:902:77:0": { looted: true } },
  player: { /* position as face+local, inventory… */ }
}
```

- **Stable IDs.** Derive IDs from placement cells (`kind:face:i:j:n`), never from spawn order. Store **absolute** voxel values, not relative ones, so minor generator tweaks do not corrupt edits.
- **Change detection.** On load, compare `baseHash` with a fresh generation. On mismatch, either run the pinned old `genVersion`, which means shipping old generator modules (the NMS purple-system approach), or re-anchor the edits and warn.
- **Storage.** Use IndexedDB, with export and import as JSON for sharing. Typical saves are KB to low MB.

---

## 4. Traversability tuning and seed-browser tooling

### 4.1 Metrics for "interesting AND traversable"

All of these run headless on a coarse **cube-sphere grid**, e.g. 6 × 256² cells at about 140 m per cell for R = 30 km. Cells have explicit neighbours across face edges. Inputs are `surfaceR`, biome and sea level only. **Opinion: metric set, all cheap enough to run on hundreds of seeds.**

| Group | Metric | How |
|---|---|---|
| Shape | land fraction; hypsometric curve (elevation CDF); relief per 1 km window | histograms |
| Slope | slope histogram; % of land with slope below walk (≈40°), horse (≈30°), build (≈10°); % cliffs (≥60°) | `atan(|∇_tangent h|)` from the analytic gradient or finite differences |
| Connectivity | **largest walkable component share**; number of components above A km²; share reachable from spawn on foot, by horse and by boat | union-find over cells; an edge is passable if the slope between centres ≤ limit and both cells are above sea level (boats: both below) |
| Mazy-ness | **detour factor** = walkable path length / great-circle distance (p50, p95) over random pairs | Dijkstra on the grid |
| Biomes | count; **Shannon entropy** `H = −Σ pᵢ ln pᵢ` (normalised by ln K); patch count and mean patch area per biome; largest-biome share (flag above ~40%); forbidden-adjacency boundary length | flood fill per biome; boundary scan |
| Content | candidate site count per biome (Valheim-style flatness rule); POI spacing: distance from random walkable points to the nearest POI (p50 / p95) | site pass §3.9 |
| Boredom | p95 distance to the nearest "change" (biome boundary, POI, or a landmark above X m visible within its horizon distance) | Murray: "walking in the real world is super boring" (24:22) |
| Spawn | distance from spawn to 3 distinct biomes, to water and to a village; spawn on the main component | rule checks |
| Mesh sanity | min feature thickness ≥ 2 voxels; no layer drops out across LOD; probe-chunk triangle counts | NoMansTerrain lessons; NMS per-planet perf smoke test |
| Determinism | probe-set hash | §3.1 |

Use **generate-and-test** in two tiers: hard constraints reject a seed (spawn connectivity, land-fraction bounds, biome count ≥ k, no forbidden adjacencies), and soft metrics rank the rest. Compton's warning applies. "I can easily generate 10,000 bowls of plain oatmeal … mathematically speaking they will all be completely unique. But the user will likely just see a lot of oatmeal" ([Compton](https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator)). Metrics catch broken seeds; humans and Claude, looking at contact sheets, judge the oatmeal.

**Expressive range** (after Smith & Whitehead, "Analyzing the expressive range of a level generator", PCG workshop 2010; doi 10.1145/1814256.1814260, unverified): scatter all scanned seeds on two metrics (e.g. biome entropy against detour factor) as a heatmap. It shows what the generator *can* make and where parameter changes move it. This is McKendrick's "whole space that we haven't explored".

### 4.2 Tuning loop

**Opinion.**

1. Change parameters, which are data: biome table, layer ranges, spline points.
2. `seed-scan` 200–1000 seeds headless. This takes minutes because it runs on the coarse grid only.
3. Diff the metric distributions against the last run, plus the expressive-range plot.
4. Look at the contact sheet of outliers and of a random sample.
5. Fly 3 bookmarked seeds in the real renderer: an ascent capture and a ground walk from spawn.

Splines in the style of Kniberg's "move the dots around" are worth adopting: they are "mod friendly" and let a non-programmer (or Claude) shape terrain by editing data (24:09).

### 4.3 Seed browser: spec for the studio

**Opinion.**

- **One package, three front ends.**
  - `@wz/planetgen`: pure ES modules, deterministic, no DOM.
  - The game imports it in workers.
  - `tools/seed-scan.mjs` (Node) imports it for headless metrics.
  - `tools/seed-browser/` (a Vite page) imports it in workers with OffscreenCanvas.
- **Node CLI** (the interface for Claude Code):
  - `node tools/seed-scan.mjs --from 0 --count 500 --radius 30000 --out out/scan-<date>/` writes `metrics.jsonl` (one line per seed), `summary.json` (distributions and expressive range) and PNG thumbnails.
  - The PNGs are equirectangular or orthographic globe renders, CPU-rasterised, with hillshade and biome colours.
  - `--seed 0x9f3c… --probe` prints the determinism hash. `--check genVersion` runs the golden tests.
  - Claude Code can read the JSON and view the PNGs directly. No browser is needed for triage.
- **Browser page:**
  - **Contact sheet:** a grid of N globes (two hemispheres per seed) with metric badges. Sort and filter by any metric; flag failed hard constraints in red.
  - **Seed detail:**
    - a rotating globe;
    - map layers (height, slope classes, biomes, walkable components, sites, roads);
    - metric panels and histograms;
    - the chosen archetype parameters (NMS Min/Max picks);
    - the intermediate generator data as JSON (NMS's XML dumps, §1.1);
    - "fly here", which opens the game at a lat/long with an ascent capture.
  - **Region browser** inside one seed: since the game ships *one* static seed, the same views apply to spawn candidates and village sites on the chosen planet.
  - **URL state:** `?seed=…&gen=…&layer=biomes&lat=…&lon=…`, so links are shareable and reproducible.
- **Bookmarks as data in the repo:** `seeds/bookmarks.json` holds `{seed, genVersion, tags, note, author: "owner"|"claude", metricsSnapshot, thumbnail}`. The browser writes it through a dev-server endpoint, and Claude edits it as a file. When `genVersion` changes, the browser re-scans bookmarks and shows metric deltas. NMS used the same planets in every smoke test.
- **CI:** golden hashes in three browsers plus Node; metric drift alerts when a commit moves a bookmarked seed's metrics beyond a tolerance; the ascent capture for one bookmark per run.

---

## 5. Other references, briefly

- **Minecraft 1.18+ (Kniberg, [Jfokus 2022](https://www.youtube.com/watch?v=ob3VwY4JyzE); [short version](https://www.youtube.com/watch?v=CSa5O6knuwI)).**
  - Chunk steps (6:04–8:13): shaping, water fill, surface rules, features and structures.
  - Splines over continentalness, erosion and peaks-and-valleys (19:16–24:42).
  - 3D density with **squashing factor and height offset** (26:21–29:40).
  - Caves: cheese (thresholded noise), spaghetti (`|n| < c`, "noise ridging") and noodle (30:13–32:56).
  - Biome tables over 5 parameters; neighbours matter (34:36–38:27).
  - **Contributes:** the cleanest public "noise router" pattern, data-driven splines, and cave recipes.
- **Vintage Story ([WorldGen concept](https://wiki.vintagestory.at/Modding:WorldGen_Concept), [World Configuration](https://wiki.vintagestory.at/World_Configuration)).**
  - Hierarchical generation at three scales: map regions (16×16 chunk columns), map chunks (column data) and 32³ chunks.
  - Ordered passes: terrain, features, vegetation, light, creatures.
  - JSON content for deposits, structures, geologic provinces and landforms.
  - World-config knobs (landcover 97.5%, `landformScale`, `upheavelCommonness`, polar–equator distance).
  - **Contributes:** pass ordering, multi-scale maps, and content-as-JSON. Its strata detail was not fetched.
- **Valheim ([Jotunn LocationConfig](https://valheim-modding.github.io/Jotunn/api/Jotunn.Configs.LocationConfig.html)).** The location-placement rule schema (§3.9). Other worldgen facts (≈10 km radius world, biomes by distance rings plus noise) are well known but **unverified here**, because the wikis were blocked. **Contributes:** site-validity rules, including terrain delta in radius.
- **Proland ([INRIA](https://proland.inrialpes.fr/)).** A C++/OpenGL library for "very large and detailed 3D natural scenes", "from local regions to whole planets", with GPU procedural terrain, atmosphere "from ground level to outer space" with Rayleigh and Mie multiple scattering, oceans and forests. BSD-3. **Contributes:** atmosphere and ocean models, and GPU tile-producer architecture ideas. Its spherical-deformation details are from memory and unverified.
- **Sebastian Lague ([Procedural Moons and Planets](https://www.youtube.com/watch?v=lctXaT9pxA0), [Procedural Planets E01](https://www.youtube.com/watch?v=QN39W020LqU)).**
  - Compares UV, Fibonacci, cube and ico spheres. The cube sphere "can be divided into smaller subfaces … render nearby regions … in high detail", but "the gaps and lighting issues that occur at the seams" are "quite a headache" (0:25–2:48).
  - Craters (3:09), triplanar with normal maps (10:40), and steepness-based colouring via `dot(normal, up)` (17:30).
  - **Contributes:** approachable implementations of craters and triplanar mapping.
- **SimonDev ([ProceduralTerrain_Part10](https://github.com/simondevyoutube/ProceduralTerrain_Part10), MIT; [heightmap episode](https://www.youtube.com/watch?v=hHGshzIXFWY)).** A Three.js cube-quadtree planet with workers, skirts, edge snapping and a scattering shader (§3.3). **Contributes:** the closest working browser reference.
- **CDLOD ([Strugar](https://github.com/fstrugar/CDLOD)).** Quadtree of regular grids with distance-based vertex morphing and "no need for stitching meshes". **Contributes:** pop-free heightfield LOD.
- **Transvoxel ([Lengyel](https://transvoxel.org/)).** MC LOD transition cells; patent-free. **Contributes:** the option for smooth voxel LOD.
- **Nick Gildea, [DC seams](http://ngildea.blogspot.com/2014/09/dual-contouring-chunked-terrain.html).** Gathers seam nodes from 7 neighbours into a seam octree; DC handles mixed leaf sizes natively. **Contributes:** the option if we go dual contouring.
- **Outerra ([log depth](https://outerra.blogspot.com/2009/08/logarithmic-z-buffer.html)).** Planet-scale depth precision (§3.2).
- **Red Blob Games ([terrain from noise](https://www.redblobgames.com/maps/terrain-from-noise/)).** Elevation × moisture biomes, redistribution, terraces, blue-noise trees. **Contributes:** biome table basics.
- **noa-engine ([repo](https://github.com/fenomas/noa), MIT).** A browser voxel engine (Babylon.js) used by bloxd.io, with chunk sort and load-distance controls. **Contributes:** browser chunk-management patterns for a blocky look. Not planetary.
- **Quilez ([derivatives](https://iquilezles.org/articles/morenoise/)) and de Carpentier ([Scape](https://www.decarpentier.nl/scape-procedural-extensions)).** The uber-noise ingredients (§1.6). IQ's domain-warping article (`fbm(p + fbm(p + fbm(p)))`) returned 404 at `/articles/warp/` on 2026-10-02.
- **Eiserloh ([Noise-Based RNG](https://www.youtube.com/watch?v=LWFzPP8ZbdU)).** Position-keyed hashing (§3.1).
- **Kate Compton ([So you want to build a generator](https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator)).** Perceptual versus mathematical uniqueness, and generate-and-test.

---

## What to take and where

### Voxel planet game

| Take | From | Where in our code (Opinion) |
|---|---|---|
| Position-keyed seed hierarchy plus golden hashes | NMS §1.1, Eiserloh | `planetgen/seed.js`, `test/golden/*.json` |
| Sphere for simulation, cube for keys, noise in 3D | McKendrick 14:37–19:35 | `planetgen/sphere.js` (face, UV, Nowell mapping, tangent frames) |
| 2D `surfaceR` (continent, elevation, uber layers) plus a thin 3D band | McKendrick 20:08, 35:14–39:44 | `planetgen/surface.js`, `planetgen/density.js` |
| Uber noise reconstruction with derivative output and noise-driven parameters | Murray 36:22–39:46, de Carpentier, IQ | `planetgen/noise/uber.js` |
| Layer roster and Min/Max archetype ranges | NoMansTerrain | `planetgen/data/layers.json`, `biomes.json` |
| Quadtree heightfield with skirts and morph, 2:1 balance, horizon culling | SimonDev, CDLOD | `world/quadtree.js`, `world/heightNode.js` |
| Surface Nets voxel band, flat-shaded, overlap borders | NMS look and seams | `world/voxelBand.js`, `workers/mesh.worker.js` |
| Worker pool with transfer and priority (coarse-first, view-first), cancellation | NMS 29:06–30:46 | `world/streamer.js` |
| Analytic placement (no reprojection), offset-grid sites, Valheim rules | NMS 46:26–49:12, Minecraft, Valheim | `planetgen/sites.js`, `planetgen/foliage.js` |
| Closed-form herd paths, spawn on approach | NMS 49:46 | `sim/herds.js` |
| Delta saves with `genVersion`, `baseHash` and stable IDs | NMS 2016/2025 lessons, Kniberg | `save/deltas.js` |
| Atmosphere and fog matched to the LOD morph distance | NMS fades, Proland | `render/atmosphere.js` |

### Studio seed browser

| Take | From | Where (Opinion) |
|---|---|---|
| Isomorphic generator, headless scan CLI, PNG contact sheets | NMS smoke tests | `tools/seed-scan.mjs` |
| Metric suite: slope, components, detour, entropy, adjacency, POI, boredom, mesh sanity | §4.1 | `planetgen/metrics/*.js` (shared by CLI and page) |
| Contact sheet, seed detail, region browser, fly-here | McKendrick 52:03 | `tools/seed-browser/` |
| Bookmarks as a repo JSON, re-scanned per `genVersion` | NMS "same planets each build" | `seeds/bookmarks.json` |
| Expressive-range plot and metric-drift CI | Smith & Whitehead; NMS | `tools/seed-scan.mjs --summary`, CI job |
| Intermediate generator dumps (JSON) | NMS XML dumps | seed detail "Data" tab |

---

## Open questions

1. **Planet radius and relief.** I recommend 20–60 km with ±1–2 km of relief. The owner's "big planet" ambition may want 100+ km. This is decidable with the metrics and an ascent test.
2. **Look:** smooth flat-shaded voxels (recommended) or literal cubes? This affects meshing, editing and building.
3. **Caves:** do we need true 3D caves in v1, or only overhangs and cave mouths that lead to authored or archetype interiors (Valheim-style dungeons)? The voxel band cost depends on the answer.
4. **Terrain editing:** is it a core verb (dig, terraform), or only building on top? Without terrain edits, saves become entity deltas only and the voxel band can be optional.
5. **Mobile:** a first-class target, or desktop-first? This sets worker counts, band radius and the 1 GB versus 300 MB budgets.
6. **WebGPU versus WebGL2:** compute shaders would help visual-only work (foliage, water) but must not touch gameplay data (§3.1).
7. **Generator versioning policy** after release: pin old versions, the NMS purple-system approach, or allow world resets?
8. **Multiplayer**, if it ever comes as LNF's shared planet does: it makes cross-platform determinism mandatory, which §3.1 already plans for.
9. **Uber noise attribution and exact NMS formulas:** unpublished. Do we accept our reconstruction as "inspired by", or contact de Carpentier, whose public code is the closest match?
10. **Unverified items to re-check if they matter:** the Squirrel3 constants (re-read from Eiserloh's source); the Smith & Whitehead DOI; iOS memory ceilings; Valheim's world radius and biome rings; whether three.js's current WebGL path supports reversed-Z.

---

## Sources

Talks (captions pulled via YouTube auto-captions on 2026-10-02; timestamps are caption times):
- Innes McKendrick, "Continuous World Generation in No Man's Sky", GDC 2017. https://www.youtube.com/watch?v=sCRzxEEcO2Y (chapters: Sphere To Cube 19:12, Voxel Regions 21:51, Pipeline 27:19, Threading 28:57, 3D Terrain 37:22, Dual Contouring 39:57, Triplanar 43:44, Foliage 46:21, Building Placement 48:55, Creatures 49:35, Evaluation 52:03). Vault: https://www.gdcvault.com/play/1024265/Continuous_World_Generation_in__No_Man_s_Sky_
- Sean Murray, "Building Worlds in No Man's Sky Using Math(s)", GDC 2017. https://www.youtube.com/watch?v=C9RyEiEzMiU (chapters: Early noise tests 17:37, Uber noise 25:53, Testing and scaling 44:21)
- Henrik Kniberg, "Reinventing Minecraft world generation", Jfokus 2022. https://www.youtube.com/watch?v=ob3VwY4JyzE. Short version: https://www.youtube.com/watch?v=CSa5O6knuwI
- Squirrel Eiserloh, "Math for Game Programmers: Noise-Based RNG", GDC 2017. https://www.youtube.com/watch?v=LWFzPP8ZbdU
- Sebastian Lague, "Coding Adventure: Procedural Moons and Planets" (2020). https://www.youtube.com/watch?v=lctXaT9pxA0. "Procedural Planets (E01 the sphere)" (2018): https://www.youtube.com/watch?v=QN39W020LqU
- SimonDev, "3D World Generation: Heightmap Tutorial". https://www.youtube.com/watch?v=hHGshzIXFWY

NMS write-ups, data and patch notes:
- Isaac Karth, summary of McKendrick's nucl.ai 2015 talk "Building a Galaxy". https://procedural-generation.isaackarth.com/2016/06/22/building-a-galaxy-procedural-generation-in-no.html
- procedural-generation tumblr on the GDC 2017 talk. https://procedural-generation.tumblr.com/post/158637281963/continuous-world-generation-in-no-mans-sky-gdc
- Wikipedia, "Development of No Man's Sky" (citing The New Yorker 2015, Polygon 2014/2017, The Atlantic 2016). https://en.wikipedia.org/wiki/Development_of_No_Man%27s_Sky
- gistya/NoMansTerrain, commit b7042f1 (2026-08-23), read statically. https://github.com/gistya/NoMansTerrain
- Step Mods, NMS Terrain Generation tutorial. https://stepmodifications.org/wiki/NoMansSky:Tutorials/Terrain_Generation
- Zylann, godot_voxel issue #24 (2nd-hand notes on NMS seams). https://github.com/Zylann/godot_voxel/issues/24
- NMS Worlds Part I patch notes (2024). https://www.nomanssky.com/worlds-part-i-update/
- NMS Worlds Part II patch notes (2025). https://www.nomanssky.com/worlds-part-ii-update/

Light No Fire:
- Steam store, app 2719590 (checked 2026-10-02). https://store.steampowered.com/app/2719590/Light_No_Fire/
- Official site and press kit. https://lightnofire.com and https://lightnofire.com/press
- Announcement trailer (2023-12-07). https://www.youtube.com/watch?v=jKQem4Z6ioQ
- Hello Games Steam news posts, URL pattern `https://store.steampowered.com/news/app/275850/view/<gid>`. Checked by sub-research only, not re-verified by me:
  - "The Next Ten Years", 7585814657460962767 (2023-12-14)
  - Worlds Part I, 5969041959961170666 (2024-07-17)
  - Worlds Part II, 1790214123053554 (2025-01-29)
  - Titan, 1791482680862497 (2025-02-12)
  - Voyagers, 1809235871553552 (2025-08-27)
  - 2025 recap, 1816849002020965 (2025-11-24)
  - 10th anniversary, 1840310314351537 (2026-08-10)
  - COSMOS, 1843481262688949 (2026-09-09)
- NMS Voyagers page. https://www.nomanssky.com/2025/08/no-mans-sky-voyagers/
- Eurogamer interview (2026-08-10). https://www.eurogamer.net/no-mans-sky-boss-sean-murray-updates-on-light-no-fire
- The Verge (2023-12-08). https://www.theverge.com/23990841/hello-games-light-no-fire-trailer

Noise, mapping, LOD, meshing:
- Giliam de Carpentier, "Scape: procedural extensions". https://www.decarpentier.nl/scape-procedural-extensions
- Iñigo Quilez, "Value noise derivatives". https://iquilezles.org/articles/morenoise/
- Philip Nowell, "Mapping a Cube to a Sphere" (2005). https://mathproofs.blogspot.com/2005/07/mapping-cube-to-sphere.html (the page body is JS-rendered; formula as widely cited)
- Filip Strugar, CDLOD. https://github.com/fstrugar/CDLOD
- Eric Lengyel, Transvoxel. https://transvoxel.org/
- Nick Gildea, "Dual Contouring: Seams & LOD for Chunked Terrain". http://ngildea.blogspot.com/2014/09/dual-contouring-chunked-terrain.html
- Outerra, "Logarithmic Z-buffer". https://outerra.blogspot.com/2009/08/logarithmic-z-buffer.html
- Proland (INRIA). https://proland.inrialpes.fr/
- SimonDev, ProceduralTerrain_Part10 (MIT, read statically). https://github.com/simondevyoutube/ProceduralTerrain_Part10

Browser and JS:
- MDN, Math (precision is implementation-dependent). https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math
- MDN, SharedArrayBuffer security requirements. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
- MDN, Transferable objects. https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
- jwagner, simplex-noise.js. https://github.com/jwagner/simplex-noise.js
- fenomas, noa-engine. https://github.com/fenomas/noa

Other games and design:
- minecraft.wiki, Noise router. https://minecraft.wiki/w/Noise_router
- minecraft.wiki, Structure set. https://minecraft.wiki/w/Structure_set
- Vintage Story wiki, WorldGen Concept. https://wiki.vintagestory.at/Modding:WorldGen_Concept
- Vintage Story wiki, World Configuration. https://wiki.vintagestory.at/World_Configuration
- Jotunn (Valheim modding), LocationConfig. https://valheim-modding.github.io/Jotunn/api/Jotunn.Configs.LocationConfig.html
- Red Blob Games, "Making maps with noise functions". https://www.redblobgames.com/maps/terrain-from-noise/
- Kate Compton, "So you want to build a generator". https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator
- G. Smith and J. Whitehead, "Analyzing the expressive range of a level generator" (PCG workshop, 2010). doi:10.1145/1814256.1814260 (DOI not re-verified)

My own calculations (not sourced): the cube-to-sphere mapping distortion figures in §3.3, and the horizon, travel-time and float32 precision table in §3.2.
