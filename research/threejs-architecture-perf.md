# Three.js game architecture and performance, 2025-2026 (r180-r186), mapped onto New Hope

*Research date: 2026-10-14. Status: proposal only.*

Legend: **[S]** sourced (link inline, full list at the end), **[O]** my opinion, **[U]** unverified.
"Source-read" means I read the three.js source or a repository file myself, at the tag named.

Builds on [voxels.md §7](voxels.md) (Three.js vs our own renderer, r186 status, bundle sizes, log-depth
cost) and [ref-threejs-punk.md](ref-threejs-punk.md) (WebGPU browser support, the perf-profile and
dev-API pattern, on-demand shadows, half-res post). Neither is repeated here; corrections are marked
**Correction**.

---

## 0. Summary

1. **Version state [S].** New Hope pins `three ^0.180.0` (r180, released 2025-09-03). The current
   release is **r186 (2026-09-24)**. Six releases of migration notes apply (§9). A few of them change
   New Hope's look: r181 makes rough PBR materials brighter, and r182 deprecates `PCFSoftShadowMap`
   on `WebGLRenderer`, which New Hope uses.
2. **WebGPURenderer is not the better choice for New Hope today [S+O].** The manual still calls it
   "experimental". Two independent measurements show that it costs about **2x the CPU per draw call**
   of `WebGLRenderer` on scenes with many meshes, with either backend. New Hope's frame is made of many
   small meshes, and it also uses `onBeforeCompile`, `ShaderMaterial` and `EffectComposer`, which
   WebGPURenderer does not support. **Stay on WebGLRenderer. Cut draw calls first. Revisit WebGPU when
   we need compute** (GPU rain, crowds, particles).
3. **New Hope's biggest cost is draw calls from the crowd and the cars [O, from reading the code].**
   Each person is built from about 11-13 separate meshes [refuted 2026-10-14: counted in
   `models.ts` `buildPerson`: 11 to 14 meshes (4 leg parts, torso, optional collar and accent torus,
   head, 1-2 hair/visor parts, 4 arm parts)], each with its own new material, and each
   casts a shadow. 70 people give about 800+ draws in the main pass alone, plus their shadow draws.
   Moving the crowd to one `InstancedMesh` per body part brings that to about 12 draws.
4. **The current `__nh.info()` cannot measure any of this [S, source-read].** With `EffectComposer`,
   `renderer.info` resets on every `render()` call, so it reports only the last pass (OutputPass, one
   draw). In r180 it also resets *after* the shadow pass, so shadow draws are never counted (fixed
   for `WebGLRenderer` in r185 by #33688; see §8). Fix the measurement before optimising.
5. **The MSAA New Hope asks for is wasted [S, source-read].** `antialias: true` applies to the canvas,
   but `EffectComposer` renders the scene into its own render target, which has no samples. The scene
   is therefore aliased, and the multisampled canvas costs memory for nothing.
6. **Budgets proposed for New Hope [O, anchored on S]:** desktop with an integrated GPU: ≤ 300 draw
   calls per frame including shadows, ≤ 1.5 M triangles, CPU ≤ 6 ms. Mid-range phone: ≤ 120 draws,
   ≤ 400 k triangles, no real-time shadow or one 1024² map, bloom at quarter resolution with 3 mips,
   DPR ≤ 1.5.

---

## 1. Draw-call and triangle budgets

**What sources say**
- **Mobile [S].** Utsubo's 2026 guide (updated 2026-09-11, targets r186) cites a maintainer budget
  of "<100 draw calls and <100,000 vertices" on mobile. It also says desktop "handles several hundred
  to low thousands" ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)). I could
  not find the original forum post by Don McCurdy, so the quote is **[U]**.
- **Native mobile [S].** Arm's Peter Harris: "For most mobile devices aim for ~500 draw calls a
  frame" ([Arm forum](https://community.arm.com/support-forums/f/graphics-gaming-and-vr-forum/48848/overhead-of-the-driver),
  posted around 2021). That figure is for native code. WebGL adds validation and ANGLE translation on
  top, so **[O]** divide it by 3-5 for a browser.
- **Integrated laptop GPU [S].** ICS Media (three.js r176, May 2025 [unconfirmed: the page shows
  "Mar 19" with no year; r176 was released 2025-04-23, so the date is the URL id's guess]) counted how many boxes stay at
  60 fps on an Intel Iris Xe (i5-1135G7):

  | Renderer | Separate meshes | Instanced meshes |
  |---|---|---|
  | WebGLRenderer | 2,562 | 62,751 |
  | WebGPURenderer | 682 | 31,248 |

  ([ICS Media](https://ics.media/en/entry/250501/)). That puts a **ceiling of about 2,500 draws on a
  2021 laptop iGPU** with nothing else running. A game also needs CPU time for its own logic, so plan
  for about 10-20 % of that.
- **Draw count alone misleads.** A forum example runs about 100 draws and 240 k triangles at 60 fps on
  old hardware. The same thread points out that fill rate, not draw count, is often the limit
  ([forum](https://discourse.threejs.org/t/slow-fps-on-camera-rotation/42268/8)) **[S]**.

**Proposed New Hope budgets [O]**

| | Desktop iGPU (M1, Iris Xe) | Desktop dGPU | Mid phone (Adreno 6xx-7xx, Mali-G7x) |
|---|---|---|---|
| Draw calls (main + shadow + post) | ≤ 300 | ≤ 800 | ≤ 120 |
| Triangles drawn | ≤ 1.5 M | ≤ 5 M | ≤ 400 k |
| Shader programs | ≤ 25 | ≤ 40 | ≤ 15 |
| CPU frame (JS + three) | ≤ 6 ms | ≤ 4 ms | ≤ 8 ms |
| Render scale (DPR) | ≤ 1.5 | ≤ 2 | 1-1.5 |

These numbers are a starting point. They become real once §8's measurement exists and they have been
checked on the owner's devices.

---

## 2. InstancedMesh vs BatchedMesh vs merged geometry

**Rules [S]**
- **One geometry, many copies:** use `InstancedMesh`.
- **2-4 geometries:** use one `InstancedMesh` per geometry.
- **Many different geometries with one material:** use `BatchedMesh`.

agargaro, who maintains InstancedMesh2, adds that multi-draw falls behind instancing past roughly
100 k instances ([forum, Apr-Sep 2025](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221)).

**Facts from the r180 source [S, source-read]**
- `BatchedMesh` has `perObjectFrustumCulled = true` and `sortObjects = true` by default
  ([BatchedMesh.js r180](https://github.com/mrdoob/three.js/blob/r180/src/objects/BatchedMesh.js)).
  So per-instance culling comes free, which `InstancedMesh` does not have.
- **Without the `WEBGL_multi_draw` extension, `BatchedMesh` falls back to a loop that issues one draw
  per object** ([WebGLBufferRenderer.js r180](https://github.com/mrdoob/three.js/blob/r180/src/renderers/webgl/WebGLBufferRenderer.js)).
  Caniuse lists the extension as supported in Chrome/Edge 86+ and Safari/iOS 15+, but **not in
  Firefox** (desktop or Android) ([caniuse](https://caniuse.com/wf-webgl-multi-draw)). On Firefox a
  `BatchedMesh` therefore saves nothing.
- Per-instance opacity on `BatchedMesh` arrived in r183 ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)) **[S, secondary]**.

**Merged geometry**
- Merged geometry suits static content with one material. It is still the cheapest option, with no
  per-instance matrix fetch ([three.js manual: optimize lots of objects](https://threejs.org/manual/#en/optimize-lots-of-objects)) **[S]**.
- New Hope's city chunks already work this way: one mesh per 16×16 chunk against one atlas. **That is
  the right design [O].**

**Libraries (ideas or use, both MIT) [S]**
- `@three.ez/instanced-mesh` 0.3.16 (InstancedMesh2): per-instance frustum culling with a BVH, LOD,
  sorting.
- `@three.ez/batched-mesh-extensions` 0.0.12: LOD and BVH for `BatchedMesh`. three.js ships an
  official example with it: 10 geometries, 500 k instances, 5 LODs each
  ([webgl_batch_lod_bvh](https://github.com/mrdoob/three.js/blob/r186/examples/webgl_batch_lod_bvh.html)).

**Shipped examples [S]**
- **Bruno Simon's 2025 portfolio game** (MIT; three r183, WebGPURenderer). Every prop group (trees,
  benches, lanterns, bricks) becomes an `InstancedMesh` per sub-mesh through a small `InstancedGroup`
  helper. Matrices are rewritten only for references flagged `needsUpdate`
  ([folio-2025 `InstancedGroup.js`](https://github.com/brunosimon/folio-2025/blob/main/sources/Game/InstancedGroup.js)).
  About 78,400 grass blades are a single merged geometry
  ([Awwwards case study, 2026-03-11](https://www.awwwards.com/brunos-portfolio-case-study.html)).
- **Cinevva's open-world browser log (2026-05-08)** measured characters. With 50 avatars, each its
  own SkinnedMesh with its own draw call, they cost about **13 ms of JS per frame** on a Mac. The fix
  was one `InstancedMesh` per body piece, with skinning in the vertex shader reading a shared bone
  buffer. That gives one draw per piece for the whole crowd
  ([Cinevva part 23](https://app.cinevva.com/blog/2026-05-08-open-world-browser-part-23-avatars-and-voice)).
  The series reads partly AI-written, so treat its numbers as indicative.

**Mapping onto New Hope [O]**

| Content | Today | Proposal |
|---|---|---|
| Crowd (70) | ~12 meshes each (11-14, see §0), ~840 draws, new materials per person (`std()` in `models.ts` calls `new MeshStandardMaterial` each time) | One `InstancedMesh` per body part (legs, boots, torso, collar, head, hair, visor, arms, hands): about 10-12 draws for everyone. Per-instance colour with `setColorAt`. Each frame, compose the limb matrices on the CPU (70 × 12 = 840 `Matrix4.compose` calls, about 0.1 ms). Kylo stays a normal `Group`. |
| Cars (parked, police) | ~20-25 meshes each | Merge each car's static parts into one geometry with vertex colours (`mergeGeometries` plus a `color` attribute): 1 opaque draw, 1 emissive draw and 1 additive pool per car. Or one `InstancedMesh` set per car kind, the same way traffic already works. |
| Materials | Many unique instances that compile to the same program | Share one material per role (opaque, glow, additive). Vertex or instance colours carry the variety. |
| Signs, gear, crystals, beacons | InstancedMesh | Already right. |

---

## 3. LOD and impostors

**Sources [S]**
- **Impostor showcase.** An August 2025 forest demo has 200 k trees on 3,072². Distances:
  - 0-15 units: the full mesh.
  - 15-100 units: a mesh simplified with meshoptimizer.
  - Beyond 100 units: an octahedral impostor (a 2,048² atlas, 16×16 views).

  Culling is per instance through InstancedMesh2's BVH
  ([forum, 2025-08-01](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)).
- **Impostor pitfalls.** The impostor's geometry template is a unit quad, so its bounding sphere must
  be fixed, or three culls the whole forest when the camera looks away from the origin. The octahedral
  encoding also needed debugging
  ([Cinevva part 19, 2026-05-04](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters)).
- `THREE.LOD` and the `webgl_lod` example are still the built-in way. meshoptimizer is MIT, 1.3.0
  (2026-09-25). `SimplifyModifier` was reimplemented on meshoptimizer in r186 and is now async
  ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)).

**For New Hope [O]**
- **Impostors are not worth it.** The city's buildings are boxes and slabs, which are already the
  cheapest LOD. The endless skyline is instanced boxes whose windows are drawn in the shader. An
  impostor would cost more fill rate than the boxes do.
- **The useful LOD is per chunk.** Chunks more than about 120 m away skip railings, rooftop gear and
  glass. That is cheap to build because `GeometryBuilder` already writes per chunk: emit two index
  ranges, near and far. Fog (`FogExp2` 0.0031) hides the switch.
- **Actor LOD:** skip people beyond about 150 m (they are under a pixel tall), and stop animating
  limbs beyond about 40 m.

---

## 4. Frustum and occlusion culling

**Frustum culling [S]**
- three culls each `Object3D` by its bounding sphere.
- An `InstancedMesh` is culled as a whole, so New Hope's traffic and towers set
  `frustumCulled = false` and are always drawn.
- `BatchedMesh` culls each instance. InstancedMesh2 adds that to instanced meshes.

**Occlusion culling [S]**
- Hardware occlusion queries exist **only in WebGPURenderer**. Set `object.occlusionTest = true` and
  read `renderer.isOccluded(object)`, which returns the *previous* frame's result. Nothing is culled
  automatically; the app must act on the result
  ([webgpu_occlusion example, r186](https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_occlusion.html)).
- A user on r181 found it returning `null` when called outside a node update
  ([forum](https://discourse.threejs.org/t/renderer-isoccluded-returns-null-is-my-setup-correct/88356)).
- `WebGLRenderer` has no occlusion API.

**For New Hope [O]**
- The district is a cell grid. That gives a cheap CPU occlusion test that needs no GPU queries.
- For each 16×16 chunk and storey band, precompute whether it is fully enclosed, e.g. the undercity
  under solid slabs.
- When the camera is above the street level, hide the undercity chunks, and the reverse. This is a
  per-band visibility set, a coarse version of Quake's PVS.
- A finer test: a hierarchical-Z pass on the CPU over the coarse grid (64 × 64 × 20 cells is tiny).
  It only pays off if the measurement in §8 shows the city chunks to be expensive. They are 9-18 draws
  today, so probably not.

---

## 5. Chunk streaming and workers

**Facts [S]**
- **Streaming must not hitch.** A 40 ms hitch at a chunk boundary is noticeable. Requests go in a
  priority queue and are cancelled when the player moves away. Prefetch distance is speed × load time
  ([Cinevva part 4, 2026-02-25](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-04-streaming-before-fancy)).
- **OffscreenCanvas.** The three.js manual's
  [OffscreenCanvas page](https://threejs.org/manual/#en/offscreencanvas) shows a worker cannot read
  the DOM. Every input and resize event has to be proxied by `postMessage`. The renderer also needs
  stubbed `clientWidth/Height`.
- **No SharedArrayBuffer in Capacitor**, so results must be transferred, not shared
  ([voxels.md §6.4](voxels.md)) [unconfirmed: inherited; voxels.md's own evidence is only that
  Capacitor has no documented way to set the COOP/COEP headers].
- `three-mesh-bvh` has `GenerateMeshBVHWorker`. `ParallelMeshBVHWorker` needs SharedArrayBuffer and
  falls back to the single worker without it
  ([three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)).

**For New Hope [O]**
- **Don't move rendering into a worker.** The HUD and the radar are DOM and canvas work on the main
  thread, input would need proxying, and the JS per frame is small. OffscreenCanvas buys nothing here.
- **Do move generation and meshing into a worker** once districts stream (`N` currently reloads the
  page). `@whz/citygen` is pure, deterministic TypeScript. A worker can run `generate(seed)` and the
  `GeometryBuilder` pass, then transfer `Float32Array`/`Uint32Array` buffers zero-copy. The main
  thread only wraps them in `BufferAttribute`s.
- **Upload budget:** at most one chunk geometry per frame.
- `GeometryBuilder` collects into `number[]` and converts at `build()`. In a worker, preallocate
  typed arrays from a face count instead.
- Measure `buildCity` time first. If it is under 50 ms for one district, there is no work to do
  before streaming exists.

---

## 6. Collision and raycasts: three-mesh-bvh

**Facts [S]**
- `three-mesh-bvh` 0.9.16 (2026-10-08), MIT, peer `three >= 0.159`.
- API: `computeBoundsTree`, `acceleratedRaycast`, `firstHitOnly`, `shapecast`,
  serialise/deserialise, BatchedMesh support, and a "player movement" example (capsule against a
  static BVH).
- The README claims 500 rays against an 80 k-polygon model at 60 fps
  ([GitHub](https://github.com/gkjohnson/three-mesh-bvh)).
- Threejs-Punk uses it for first-person walking ([ref-threejs-punk.md](ref-threejs-punk.md)).

**For New Hope [O]**
- **Don't add it for the world.** The cell grid is already an exact, O(1) spatial index:
  `blocksPoint(world, x, y, z)` in `world.ts`.
- The camera pull-in in `main.ts` marches about 120 grid samples per frame, which is negligible.
- A BVH would only be worth it for triangle-accurate tests against the instanced skyline or props.
  Box tests against `sky.ts`'s collision boxes already cover the skyline.
- **Use a BVH when:**
  - a mesh shape is not on the grid (curved ramps, vehicles as obstacles);
  - mouse picking of crowd instances is needed (three.js's `InstancedMesh.raycast` is linear, so
    use a BVH or InstancedMesh2).

---

## 7. GC-free loops, object pools and DOM writes

**Facts [S]**
- Reuse vectors with `.set()`, create nothing per frame, share geometries and materials, and set
  `matrixAutoUpdate = false` on static objects ([Discover three.js tips](https://discoverthreejs.com/tips-and-tricks/)).
- Rhythmic hitches in web games usually come from per-frame allocations; profile first to confirm
  ([bugnet](https://bugnet.io/blog/how-to-fix-web-game-stutters-from-garbage-collection)).
- r185: `updateWorldMatrix()` now honours `matrixWorldNeedsUpdate`. Code that sets
  `matrixAutoUpdate = false` must set that flag when it writes `.matrix` itself
  ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)).

**New Hope's per-frame allocations and DOM work (code read) [S: file refs]**

| Where | What | Fix |
|---|---|---|
| `main.ts` `placeCamera` | `new THREE.Vector3(60, 140, 40)` every frame | a module constant |
| `police.ts` `update` | `target.clone().add(new Vector3(...))`, `u.pos.clone()`, per unit per frame; `getObjectByName("lightbar")` traverses the tree per unit per frame | scratch vectors; keep the bar reference on the unit |
| `main.ts` radar call | `cars.filter().map()`, `police.positions()` (`map`), `crowd.positions()` (`map`) every frame | fill preallocated arrays, or pass the sources |
| `main.ts` HUD | 4 × `innerHTML` + `style` writes every frame | write only when the string changes. Each write invalidates layout, which costs more than the GC. |
| `fx.ts` rain | 4,000 drops updated on the CPU, then 96 KB re-uploaded every frame while raining | a stateless vertex shader: position = f(seed, time) wrapped around the camera. No CPU work, no upload. Write our own; **do not copy** Threejs-Punk's rain (licence flag). |

These are small one by one **[O]**. The HUD DOM writes and the rain upload are the two worth doing
first.

---

## 8. Profiling: what to use and what is broken in New Hope

**Tools [S]**
- **stats-gl** 4.2.3 (MIT).
  - Options: `trackGPU`, `trackHz`, `trackCPT`.
  - Setup: `stats.init(renderer)`; three renderers are timed automatically.
  - GPU timing needs `EXT_disjoint_timer_query_webgl2` or WebGPU timestamp queries. In Safari, Timer
    Queries must be enabled in the WebKit feature flags
    ([stats-gl](https://github.com/RenaudRohlinger/stats-gl)).
  - Bruno Simon runs it in debug builds with all three tracks on
    ([folio-2025 `Monitoring.js`](https://github.com/brunosimon/folio-2025/blob/main/sources/Game/Monitoring.js)).
- **The three.js Inspector** (since r181, WebGPURenderer) has a timeline export (r185) [unconfirmed:
  the r185 notes say "Improved Viewer, Timeline" (#33750), not "export"]. Bruno
  enables it with `#inspector` ([release notes r181-r185](https://github.com/mrdoob/three.js/releases)).
- **Spector.js** 0.9.33 (2026-09-14, MIT) captures a WebGL frame: every draw call with its state.
  For WebGPU there is brendan-duncan/webgpu_inspector (MIT).
- **GPU- or CPU-bound?** Set `scene.overrideMaterial = new MeshBasicMaterial()`. If fps rises, the
  frame is GPU-bound. To measure above 60 fps, start Chrome with `--disable-gpu-vsync`
  ([Discover three.js](https://discoverthreejs.com/tips-and-tricks/)).
- **Chrome DevTools Performance** through the DevTools MCP (`performance_start_trace` /
  `performance_analyze_insight`) gives main-thread, GC and long-task data on the host. This is the
  route for us, because the container has no GPU.

**Two measurement bugs in New Hope (r180 source-read) [S]**
1. **The stats are reset before they can be read.**
   - `WebGLRenderer.render()` calls `shadowMap.render(...)` and then, if `info.autoReset`,
     `info.reset()` (lines ~1606 and 1612 of
     [WebGLRenderer.js r180](https://github.com/mrdoob/three.js/blob/r180/src/renderers/WebGLRenderer.js)).
   - So shadow draws are never counted, and with `EffectComposer` every pass resets the counters.
   - `__nh.info()` therefore returns the OutputPass's single draw.
   - **Fix:** `renderer.info.autoReset = false`, then `renderer.info.reset()` once at the top of
     `frame()`.
   - r185 changed WebGPURenderer to reset before the shadow render (#33688). I did not check whether
     WebGLRenderer changed too **[U]**. [refuted 2026-10-14: #33688 is "WebGLRenderer: reset
     statistics (info.reset) before shadowMap.render", merged 2026-05-30, milestone r185. In the r186
     source `info.reset()` (line 1731) runs before `shadowMap.render()` (line 1737), so after the
     upgrade shadow draws are counted. The per-pass reset under `EffectComposer` remains, so the
     `autoReset = false` fix is still needed.]
2. **The canvas MSAA never reaches the scene.**
   - `EffectComposer` creates its render targets as `{ type: HalfFloatType }` with no `samples`
     ([EffectComposer.js r180](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/postprocessing/EffectComposer.js)).
   - `antialias: true` therefore only antialiases the final full-screen copy.
   - **Fix:** `new EffectComposer(renderer, new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 }))`
     and `antialias: false` on the renderer. On phones, drop to `samples: 0` and DPR 1.5.

**Proposal: `__nh.perf()` [O]**
- Return per frame: `{calls, triangles, programs, geometries, textures, cpuMs, gpuMs?, dpr}`.
- Add `__nh.perf.set(flag, value)` for A/B toggles: shadows, bloom, crowd, rain, DPR. This is the
  Threejs-Punk pattern ([ref-threejs-punk.md](ref-threejs-punk.md)).
- A host-run check could then drive `advance()` through fixed camera paths and compare the numbers
  with a `perf.json` budget per game. The studio would show the results as a table per build.

---

## 9. WebGPURenderer and TSL: status at r186, and what would break for New Hope

**Status [S]**
- **The manual (dev branch, 2026) says:**
  - WebGPURenderer "is still in an experimental state although its maturity level has been greatly
    improved".
  - Some scenes run faster on WebGLRenderer.
  - WebGLRenderer is "still maintained and the recommended choice for pure WebGL 2 applications",
    with "no plans to add larger new features".
  - Limited node-material support for WebGLRenderer is being investigated.

  ([manual source](https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html)).
- **Correction:** Utsubo writes "production-ready since r171". That conflicts with the manual; treat
  it as marketing.
- **Fallback:** automatic to WebGL2, forced with `forceWebGL: true`. Initialisation is async: call
  `setAnimationLoop` or `await renderer.init()`. `renderAsync()` and the other async methods are
  deprecated since r181 ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)).
- **What does not work [S, manual]:**
  - `ShaderMaterial`, `RawShaderMaterial` and `onBeforeCompile` must be ported to node materials and
    TSL.
  - `EffectComposer` and its passes are replaced by `RenderPipeline` (named `PostProcessing` before
    r183) with TSL effect nodes. It has built-in MRT, and effects are merged where possible
    ([post-processing manual](https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpu-postprocessing.html)).
- **CPU cost.**
  - **2026-05-29, r183, Chrome 148, RTX 4090 laptop:** 4,000 separate meshes.

    | | CPU per frame | Cold first frame |
    |---|---|---|
    | WebGLRenderer | 4.5 ms | 32 ms |
    | WebGPURenderer (WebGPU) | 9.7 ms | 167 ms |
    | WebGPURenderer (`forceWebGL`) | 10.3 ms | 344 ms |

    The cost is the same on both backends, so it sits in the renderer class: per-object bind groups,
    tracked in issue #30560. No maintainer answered
    ([forum](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)).
  - ICS Media's iGPU table in §1 agrees: separate meshes are 4x worse, instanced 2x worse.
- **Browser support [S].** Caniuse shows about 86-88 % global support for WebGPU: full in Chrome
  desktop/Android, iOS Safari 26+ and Samsung Internet; partial in macOS Safari 26; off by default in
  Firefox ([caniuse](https://caniuse.com/webgpu)). ref-threejs-punk.md reported Firefox shipping on
  Windows; caniuse now lists it as disabled, so **[U]**. WebGL2 remains the floor whichever renderer
  we choose (Capacitor's Android WebView).
- **Recent WebGPU-only features (r181-r186) [S]:** the Inspector, CSMShadowNode with reversed depth,
  clustered lighting (TiledLighting removed in r185), SSGI/SSR/GTAO nodes, an FSR 1 port, compute,
  and `isOccluded` ([releases](https://github.com/mrdoob/three.js/releases)).

**What a migration would touch in New Hope [O, from the code]**

| File | Today | WebGPU/TSL equivalent |
|---|---|---|
| `sky.ts` sky dome | `ShaderMaterial` (gradient, stars, nebula, gas giant, moon) | `MeshBasicNodeMaterial` with `colorNode = Fn(...)` over `positionWorld`; `time` from TSL |
| `sky.ts` skyline towers | `MeshStandardMaterial.onBeforeCompile`: windows and neon bands from world position, normal and instance origin | `MeshStandardNodeMaterial.emissiveNode = Fn(...)` using `positionWorld`, `normalWorld` and a per-instance origin (an `InstancedBufferAttribute` read with `attribute()`, or derived from the instance matrix) and TSL `hash()` **[U: exact node names to verify]** |
| `main.ts` post | `EffectComposer` + `UnrealBloomPass` + `OutputPass` | `RenderPipeline`, `pass(scene, camera)`, `bloom()` from `three/addons/tsl/display/BloomNode.js`; an MRT emissive output for selective bloom |
| Shadows | `PCFSoftShadowMap` | `PCFShadowMap` (already soft). `PCFSoftShadowMap` was **removed for WebGPURenderer in r186** and deprecated for WebGL in r182. **Correction:** Utsubo says "removed in r186" without the WebGPU qualifier. [refuted 2026-10-14: Utsubo is right and this "Correction" is wrong. The migration guide lists only the WebGPU removal, but the r186 source removes it for WebGL too: `constants.js` marks `PCFSoftShadowMap` "@deprecated since r186" and `WebGLShadowMap.js` r186 warns "PCFSoftShadowMap has been removed. Using PCFShadowMap instead." So on r186 New Hope's `renderer.shadowMap.type` silently becomes `PCFShadowMap` with a console warning.] |

That is about 150 lines of shader code. It is cheap to port later, as long as we **do not add more
GLSL string patches** in the meantime **[O]**.

**Recommendation [O]**
- **Keep WebGLRenderer and upgrade to r186.** Check these on the way:
  - r181 PBR energy: rough materials get brighter, and the city material has roughness 0.82.
  - r182 PCFShadowMap.
  - r185 `matrixWorldNeedsUpdate`.
  - r186 `Object3D.dispose()`.
  - r187 (dev) cube-based PMREM.
- **Re-measure WebGPURenderer when one of these happens:**
  - a feature needs compute (GPU rain with collision, 10 k+ crowd particles);
  - #30560 lands;
  - draw counts are under 300, so the per-draw overhead stops mattering.

Bruno Simon's game shows that WebGPU plus TSL ships in a real 2025-2026 web game, but it is built
around instancing, two quality levels and a bloom cut to 2 mips on mobile
([folio-2025 `Rendering.js`](https://github.com/brunosimon/folio-2025/blob/main/sources/Game/Rendering.js)) **[S]**.

---

## 10. Shadows

**Facts [S]**
- **Budgets (Utsubo):**
  - shadow maps of 512-1024 on mobile and 1024-2048 on desktop;
  - CSM with 4 cascades on desktop and 2 on mobile, at 2048;
  - for static scenes, `shadow.autoUpdate = false` with `needsUpdate = true` when something
    changes.
- **Point lights** add objects × 6 shadow draws each.
- **CSM** ships as `examples/jsm/csm/CSM.js` (WebGL) and `CSMShadowNode.js` (WebGPU). Examples:
  `webgl_shadowmap_csm` and `webgpu_shadowmap_csm` (r186 tree).
- **CSM cost:** each cascade re-renders its casters. A forum post warns that 5 × 2048² maps cost
  roughly 10x the screen's pixels ([forum](https://discourse.threejs.org/t/cascaded-shadow-maps/7242)).
  [refuted 2026-10-14: that thread (2019) contains no "5 × 2048" or "10x" figure. What it says is
  that CSM "requires several passes over the geometry" and "4 culling loops over your scene objects
  (for 3 cascades + the main render pass)" (Usnul). The arithmetic 5 × 2048² ≈ 21 M texels ≈ 10x a
  1080p screen is this report's own, unsourced.]
- **Bruno Simon's game:** a 2048 map on desktop and 512 on mobile, fitted to an "optimal area" around
  the view ([folio-2025 `Ligthing.js`](https://github.com/brunosimon/folio-2025/blob/main/sources/Game/Ligthing.js)).
- **Threejs-Punk:** a 4096² map that re-renders on demand only ([ref-threejs-punk.md](ref-threejs-punk.md)).

**New Hope today (code read)**
- One `DirectionalLight` with a 2048² map over 180 × 180 m (about 8.8 cm per texel), using
  `PCFSoftShadowMap`.
- The light is moved to the action every frame, so the map re-renders every frame.
- Casters: every city chunk, rooftop gear, and every body part of every person and car.

**Proposal [O]**
1. **Snap the light to shadow texels.** Round the light target to `180 / 2048` m in light space, so
   the shadow does not shimmer as the camera moves.
2. **Split static and dynamic.**
   - City chunks and gear: casters in a map that updates only when the snapped centre moves more
     than about 8 m (`autoUpdate = false`, `needsUpdate = true`).
   - Actors (people, cars): a blob shadow, i.e. an instanced dark disc decal on the floor below,
     instead of shadow-casting parts. The cars' additive underglow pool already plays this role.
   - Result: a few dozen shadow draws on frames that update, and zero on the others.
3. **Bake ambient occlusion into vertex colours** at mesh build time. It is exact on a cell grid:
   corner AO from 3 neighbours, the classic voxel method in [voxels.md](voxels.md). In a night city
   lit by emissives, AO gives more depth than a sun shadow does.
4. **Skip CSM for now.** Flying at 70-250 m altitude makes a single 180 m box too small, but at night,
   under `FogExp2`, distant sun shadows add little. Revisit if the owner wants daytime districts.
5. **Mobile:** turn shadows off, keep the baked AO and the blobs.

---

## 11. Post-processing and the cost of bloom

**UnrealBloomPass r180, source-read [S]**
([UnrealBloomPass.js](https://github.com/mrdoob/three.js/blob/r180/examples/jsm/postprocessing/UnrealBloomPass.js))
- Steps:
  - a luminosity high-pass at half resolution;
  - 5 mip levels, each with a horizontal and a vertical separable blur (kernels 3, 5, 7, 9, 11);
  - a composite;
  - a blend back over the scene.
- That is **about 13 full-screen draws**, all in `HalfFloat` targets, starting at half the drawing
  buffer.
- `EffectComposer` adds two more `HalfFloat` targets at full size × DPR.
- At DPR 2 on a 1512×982 laptop window, each full-size `RGBA16F` target is about 47 MB.

**pmndrs/postprocessing [S]**
- 6.39.5, Zlib licence, peer `three >= 0.168 < 0.187`; v7 is in beta (7.0.0-beta.16).
- `EffectPass` merges several effects into one shader, and full-screen passes use a single triangle.
- Default buffers are 8-bit sRGB, with `HalfFloatType` recommended for HDR.
- Recommended renderer options: `antialias: false, stencil: false, depth: false`
  ([pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)).
- Its bloom has a `mipmapBlur` mode **[U: implementation not read]**.
- **Do not mix** its `EffectComposer` with three's.

**WebGPU:** `bloom()` from `BloomNode`. Bruno sets `_nMips = 5` on desktop and 2 on mobile, with
threshold 1 and strength 0.25 ([`Rendering.js`](https://github.com/brunosimon/folio-2025/blob/main/sources/Game/Rendering.js)) **[S]**.
Half-resolution post can roughly double the frame rate in fill-bound scenes ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)) **[S, secondary]**.

**For New Hope [O]**
- The neon look *is* the bloom, so keep it but make it cheaper:
  - **Bloom resolution:** construct the pass with `resolution / 2`; it halves again internally.
  - **Mips:** 3 on mobile.
  - **DPR:** cap the composer's render scale at 1.5 on desktop and 1 on phones. The HUD is DOM, so it
    stays sharp.
  - **MSAA:** fix it as in §8.
- **Switching to pmndrs** pays off only once we chain 3 or more effects (bloom plus a palette LUT
  plus vignette or grain). With bloom alone the gain is small, and it adds a dependency that pins the
  three version. Use it if the owner wants a grade/LUT preset system, as Threejs-Punk has.

---

## 12. Textures: KTX2/Basis when textures are generated in code

**Facts [S]**
- KTX2/Basis keeps textures block-compressed in VRAM, typically 4-8x less than decoded PNG. A 2048²
  RGBA texture with mips takes about 21 MiB uncompressed ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)).
- `KTX2Loader.detectSupportAsync()` is deprecated (r181); call `detectSupport()` after
  `renderer.init()`.
- **spark.js** (Ludicon, 2025-09-08) encodes textures **on the GPU at runtime** to block formats and
  hands three a `GPUTexture` through `THREE.ExternalTexture` (added in r180 by Don McCurdy, #31653).
  - It needs the WebGPU backend.
  - On an M4: VRAM drops from 85 MB to 19 MB, and load time slightly improves.
  - It is a commercial product ([Ludicon](https://www.ludicon.com/castano/blog/2025/09/three-js-spark-js/)).

**For New Hope [O]**
- The atlas in `textures.ts` is 8 × 64 px tiles, i.e. **512² × 2 maps (colour plus emissive), about
  2.7 MB with mips**. Compression is irrelevant at this size.
- Generated-in-code textures should stay `CanvasTexture`/`DataTexture`, built at load from the seed.
  That is also the "graphics are code" rule.
- **When to revisit:** only if the atlas grows past 2048² or many districts are resident. Then encode
  at **build time** in Docker. KTX-Software's `ktx create` / basisu (Apache-2.0) via
  `@gltf-transform` (MIT) **[U: CLI dependency]**.
- **For nearest-filtered pixel textures use UASTC, not ETC1S**: ETC1S smears edges **[O]**.
- Runtime GPU encoding (spark.js) is WebGPU-only and paid, so it does not fit.
- **A bug to check [U]:** `magFilter = Nearest` with `minFilter = LinearMipmapLinear` and no gutter
  between atlas tiles makes neighbouring tiles bleed at distance. Add a 2-4 px gutter, or cap the
  mip level. This needs a look in the browser.

---

## 13. Frame pacing and fixed timestep

**Facts [S]**
- **Fix Your Timestep** (Fiedler, 2004):
  - an accumulator, a fixed `dt`, and `alpha = acc / dt` to interpolate between the previous and
    current states;
  - clamp the frame time (e.g. 0.25 s) to avoid the spiral of death
  ([Gaffer on Games](https://gafferongames.com/post/fix_your_timestep/)).
- **rAF runs at the display rate** (120-166 Hz on many monitors), so motion integrated with a
  variable `dt` behaves differently per display. rAF also pauses in hidden tabs
  ([forum](https://discourse.threejs.org/t/animated-website-model-is-moving-too-fast-on-120hz-166hz-monitors/62795)).
- **Timer and Clock:** `THREE.Timer` exists since r179 [refuted 2026-10-14: `Timer` existed earlier as
  an addon (`examples/jsm/misc/Timer.js`); r179 moved it into the core, per the migration guide],
  and `Clock` is deprecated in r183
  ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)).
- **Bruno Simon's game** clamps `delta` at 1/30 s, scales it, and steps Rapier with that **variable**
  `timestep`. So a shipped, well-liked web game gets by without a fixed step
  ([folio-2025 `Ticker.js`, `Physics/Physics.js`](https://github.com/brunosimon/folio-2025)).

**New Hope today (code read)**
- `loop()` clamps `dt` at 0.05 and calls `frame(dt)`.
- `__nh.advance(seconds)` runs `frame(1/60)` n times.
- So scripted checks see a 60 Hz world, while a 120 Hz player sees a 120 Hz one. Flight, police and
  arrest timers integrate differently.
- `police.ts`, `actors.ts` and `fx.ts` use `Math.random`.

**Proposal [O]**
- Use a **fixed 60 Hz simulation step with an accumulator**, render once per rAF, and interpolate
  only the transforms of the camera, Kylo, cars and police (keep previous/current pairs).
- `advance()` then becomes literally the same code path. Combined with a seeded RNG instead of
  `Math.random` in gameplay (audio may keep it), a `(seed, input script)` replay gives the same end
  state.
- That is the test-protocol idea from [game-creator.md](game-creator.md) and [docs/sim.md](../docs/sim.md).
  It does not need integer maths, because New Hope's motion is outside any digest by design (its
  README).
- Pause the loop on `visibilitychange`.
- Use `THREE.Timer` or `performance.now()`, not `Clock`.

---

## 14. Shader warm-up (first-frame stutter)

**[S]**
- **WebGL compiles on first use.** WebGLRenderer compiles a program the first time a mesh renders,
  which blocks that frame. `renderer.compile(scene, camera)` or `compileAsync()` warms the programs
  up front, but one user saw no gain with `compileAsync` on InstancedMesh, and Firefox is reported to
  be not truly async [unconfirmed: the linked thread (2025-08-13) does not mention Firefox; the
  InstancedMesh part is confirmed] ([forum](https://discourse.threejs.org/t/reduce-first-render-lag-renderer-compileasync-is-not-doing-anything/86191)).
- **WebGPURenderer's cold first frame is 5-11x slower** than WebGLRenderer's (§9).
- **Bruno's warm-up:** he makes everything visible, renders once into a 32² cube camera, then hides
  the objects again ([`PreRenderer.js`](https://github.com/brunosimon/folio-2025/blob/main/sources/Game/PreRenderer.js)).

**For New Hope [O]**
- Behind the "click to start" screen, call `renderer.compile(scene, camera)` with the police
  cruisers, the beam and the rain made visible. A cruiser's first appearance and the first storm
  would otherwise hitch.
- Sharing materials (§2) also cuts the number of distinct programs.

---

## 15. What this means for us

**New Hope: an ordered plan [O]**
1. **Measure first.**
   - `info.autoReset = false` plus a manual reset per frame.
   - `__nh.perf()` and stats-gl in dev (MIT).
   - Record calls, triangles and ms for 3 fixed camera paths: roof start, a flight over the
     district, the undercity.
2. **Draw calls.** Crowd instancing, shared materials, merged or instanced cars. Expected: about
   1,000+ → under 150 main-pass draws.
3. **Post.** MSAA through a sampled composer target, DPR ≤ 1.5, bloom at half the constructed
   resolution.
4. **Shadows.** Snapped, static-only, updated on move; blob shadows for actors; baked vertex AO;
   `PCFShadowMap`.
5. **Loop.** A fixed 60 Hz step with interpolation; a seeded RNG for gameplay.
6. **Housekeeping.** Remove per-frame allocations; HUD writes only on change; rain in a shader;
   warm-up compile.
7. **Upgrade** r180 → r186 with the migration checklist (§9).
8. **Later, when needed:**
   - worker meshing plus a chunk upload budget once districts stream;
   - WebGPURenderer plus TSL once compute is wanted and the per-draw cost is fixed;
   - CSM only for daytime districts.

**Wallhammer studio [O]**
- A game's build could carry a `perf.json`: the budgets above plus the measured numbers from the
  host-browser run through DevTools MCP.
- The studio shows it next to the build, with a red cell where a budget is broken.
- The container cannot measure GPU work, so these numbers come only from host runs. Mark them as such.
- A "make this game" flow could include a perf step: run the fixed camera paths, compare with the
  budget, and report. That is a cheap guard against the regressions an agent writes without noticing.

**PixelDen (Phaser 4, 2D) [O]**
- Most of this report is 3D-specific. What carries over:
  - the fixed-timestep loop with interpolation (Phaser has its own; check that games use it);
  - DPR capping;
  - GC-free update loops;
  - HUD DOM writes only on change;
  - stats-gl / Spector for WebGL profiling (Phaser 4 is WebGL);
  - a `__game.perf()` test hook alongside the test protocol.
- The desktop and mobile wrapping question belongs to [multiplatform.md](multiplatform.md).

---

## Open questions (owner calls)

1. **Target devices:** which phone and laptop count as "mid" for New Hope? The budgets in §1 depend
   on them.
2. **Day districts:** is daytime planned? If not, sun shadows can go almost entirely (baked AO plus
   blobs). If yes, plan CSM.
3. **WebGPU:** is staying on WebGLRenderer for New Hope until compute is needed acceptable?
4. **Determinism of New Hope's motion:** should it move to a fixed step and seeded gameplay RNG, so
   scripted replays are exact? It is outside the digests today, by design.
5. **Studio perf column:** should the studio show perf numbers per build? That needs a host-run step,
   because Docker has no GPU.

---

## Sources

Dates are publication or last-update dates as shown by the source; "source-read" means I read the code.

**three.js (official)**
- three.js releases r177-r186, GitHub API, read 2026-10-14: https://github.com/mrdoob/three.js/releases (r186: 2026-09-24; r180: 2025-09-03)
- Migration Guide wiki, sections r180-r187, read 2026-10-14: https://github.com/mrdoob/three.js/wiki/Migration-Guide
- Manual, WebGPURenderer (dev branch, 2026): https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html
- Manual, Post-Processing with WebGPURenderer (dev branch, 2026): https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpu-postprocessing.html
- Manual, OffscreenCanvas: https://threejs.org/manual/#en/offscreencanvas (source: https://github.com/mrdoob/three.js/blob/dev/manual/pages/offscreencanvas.html)
- Manual, Optimize lots of objects: https://threejs.org/manual/#en/optimize-lots-of-objects
- TSL wiki: https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
- Source-read r180: https://github.com/mrdoob/three.js/blob/r180/src/renderers/WebGLRenderer.js
- Source-read r180: https://github.com/mrdoob/three.js/blob/r180/examples/jsm/postprocessing/UnrealBloomPass.js
- Source-read r180: https://github.com/mrdoob/three.js/blob/r180/examples/jsm/postprocessing/EffectComposer.js
- Source-read r180: https://github.com/mrdoob/three.js/blob/r180/src/objects/BatchedMesh.js
- Source-read r180: https://github.com/mrdoob/three.js/blob/r180/src/renderers/webgl/WebGLBufferRenderer.js
- Example r186: https://github.com/mrdoob/three.js/blob/r186/examples/webgpu_occlusion.html
- Example r186: https://github.com/mrdoob/three.js/blob/r186/examples/webgl_batch_lod_bvh.html
- CSM addon (r186 tree): https://github.com/mrdoob/three.js/tree/dev/examples/jsm/csm

**three.js forum**
- How to choose between InstancedMesh and BatchedMesh (2025-04-15 to 2025-09-19): https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221
- WebGPURenderer 2x slower CPU, 5-10x slower first frame, r183 (2026-05-29): https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904
- A forest of octahedral impostors (2025-08-01): https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735
- Renderer.isOccluded() returns null (r181, 2025-2026): https://discourse.threejs.org/t/renderer-isoccluded-returns-null-is-my-setup-correct/88356
- Reduce first-render lag, compileAsync (2025): https://discourse.threejs.org/t/reduce-first-render-lag-renderer-compileasync-is-not-doing-anything/86191
- Cascaded Shadow Maps (older thread): https://discourse.threejs.org/t/cascaded-shadow-maps/7242
- Slow FPS on camera rotation (draws vs fill rate): https://discourse.threejs.org/t/slow-fps-on-camera-rotation/42268/8
- Model moving too fast on 120/166 Hz monitors: https://discourse.threejs.org/t/animated-website-model-is-moving-too-fast-on-120hz-166hz-monitors/62795

**Articles, talks, shipped games**
- Utsubo, "100 Three.js Tips That Actually Improve Performance (2026)", updated 2026-09-11: https://www.utsubo.com/blog/threejs-best-practices-100-tips
- ICS Media, "Getting started with Three.js on WebGPU" (benchmarks r176, May 2025 [unconfirmed date, see §1]): https://ics.media/en/entry/250501/
- Ludicon, "three.js + spark.js" (2025-09-08): https://www.ludicon.com/castano/blog/2025/09/three-js-spark-js/
- Awwwards, Bruno Simon portfolio case study (2026-03-11): https://www.awwwards.com/brunos-portfolio-case-study.html
- Bruno Simon, folio-2025 source (MIT; three r183; last push 2026-04-07): https://github.com/brunosimon/folio-2025
- Cinevva, open world in the browser, part 4 (2026-02-25): https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-04-streaming-before-fancy
- Cinevva, part 19, impostors (2026-05-04): https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters
- Cinevva, part 23, avatars (2026-05-08): https://app.cinevva.com/blog/2026-05-08-open-world-browser-part-23-avatars-and-voice
- Discover three.js, Tips and tricks (undated): https://discoverthreejs.com/tips-and-tricks/
- Codrops, "Building Efficient Three.js Scenes" (2025-02; 403 on fetch, seen in search only): https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/
- Glenn Fiedler, "Fix Your Timestep!" (2004-06-10): https://gafferongames.com/post/fix_your_timestep/
- Arm forum, Peter Harris on draw calls (around 2021): https://community.arm.com/support-forums/f/graphics-gaming-and-vr-forum/48848/overhead-of-the-driver
- bugnet, web game GC stutter (undated): https://bugnet.io/blog/how-to-fix-web-game-stutters-from-garbage-collection

**Libraries (versions from the npm registry, 2026-10-14)**
- stats-gl 4.2.3 (2026-07-10, MIT): https://github.com/RenaudRohlinger/stats-gl
- three-mesh-bvh 0.9.16 (2026-10-08, MIT): https://github.com/gkjohnson/three-mesh-bvh
- postprocessing 6.39.5 (2026-09-09, Zlib, peer three >=0.168 <0.187; v7.0.0-beta.16): https://github.com/pmndrs/postprocessing
- @three.ez/instanced-mesh 0.3.16 (2026-07-26, MIT) and @three.ez/batched-mesh-extensions 0.0.12 (2026-06-23, MIT): https://github.com/agargaro/instanced-mesh , https://github.com/agargaro/batched-mesh-extensions
- spectorjs 0.9.33 (2026-09-14, MIT): https://github.com/BabylonJS/Spector.js
- webgpu_inspector (MIT, pushed 2026-10-10): https://github.com/brendan-duncan/webgpu_inspector
- meshoptimizer 1.3.0 (2026-09-25, MIT): https://github.com/zeux/meshoptimizer

**Compatibility**
- caniuse, WebGPU (read 2026-10-14): https://caniuse.com/webgpu
- caniuse, WEBGL_multi_draw (read 2026-10-14): https://caniuse.com/wf-webgl-multi-draw

**Licence notes for borrowing:** three.js, stats-gl, three-mesh-bvh, the @three.ez packages,
meshoptimizer, Spector and folio-2025 code are MIT (folio-2025: `license.md` is MIT per GitHub and
the Awwwards case study, but its `package.json` says `"license": "ISC"`; the music under
`static/sounds/musics/` has its own licence file). pmndrs/postprocessing is Zlib. All of these are
fine to reference or use with attribution. spark.js is commercial, so don't use it. Threejs-Punk rain
stays off-limits ([licence flags](README.md#licence-flags)).

---

## Verification (2026-10-14)

Adversarial fact-check by a second agent. Sources were re-fetched (GitHub API, raw source at the
named tags, the npm registry, caniuse, the forum threads) and repo claims were checked against
`packages/new-hope-play/src/*`. Inline marks: `[refuted 2026-10-14: …]` and `[unconfirmed]`.

**Confirmed (31)**
- `three ^0.180.0` and `@types/three ^0.180.0` in `packages/new-hope-play/package.json`; npm latest is 0.186.1.
- Release dates: r180 2025-09-03, r181 2025-11-19, r182 2025-12-10, r183 2026-02-20, r184 2026-04-16, r185 2026-07-01, r186 2026-09-24 (GitHub releases).
- Migration guide: r181 energy conservation (rough > 0.5 brighter), `renderAsync` and `KTX2Loader.detectSupportAsync` deprecated; r182 `PCFSoftShadowMap` deprecated on WebGL; r183 `PostProcessing` → `RenderPipeline`, `Clock` deprecated; r185 `updateWorldMatrix` honours `matrixWorldNeedsUpdate`, `TiledLighting` removed; r186 `Object3D.dispose()`, `SimplifyModifier` on meshoptimizer and async, `PCFSoftShadowMap` removed for WebGPU; r187 cube-based PMREM.
- r180 `WebGLRenderer.js`: `shadowMap.render` at line 1606, `info.reset()` at 1612 (after shadows).
- r180 `EffectComposer.js`: targets created as `{ type: HalfFloatType }`, no `samples` → the canvas MSAA does not reach the scene.
- r180 `BatchedMesh.js`: `perObjectFrustumCulled = true`, `sortObjects = true`; r180 `WebGLBufferRenderer.js`: per-object loop when `WEBGL_multi_draw` is null.
- r180 `UnrealBloomPass.js`: `nMips = 5`, starts at `resolution / 2`, all `HalfFloatType`.
- caniuse: `WEBGL_multi_draw` Chrome 86+, Safari/iOS 15+, no Firefox (desktop or Android). WebGPU 87.8 % global (85.8 full + 2.0 partial), Firefox "disabled by default", Safari macOS 26 partial, iOS 26 full.
- npm (2026-10-14): three-mesh-bvh 0.9.16 (2026-10-08, MIT, peer three >= 0.159.0); stats-gl 4.2.3 (2026-07-10, MIT); postprocessing 6.39.5 (2026-09-09, Zlib, peer >= 0.168 < 0.187), beta 7.0.0-beta.16 (2026-02-19, peer >= 0.179 < 0.184); @three.ez/instanced-mesh 0.3.16 (2026-07-26); @three.ez/batched-mesh-extensions 0.0.12 (2026-06-23); spectorjs 0.9.33 (2026-09-14); meshoptimizer 1.3.0 (2026-09-25). All MIT except postprocessing.
- ICS Media table (2,562 / 682 / 62,751 / 31,248; r176; i5-1135G7 Iris Xe) — numbers match; only the date is unconfirmed.
- Forum 91904: 4.5 / 9.7 / 10.3 ms CPU, 32 / 167 / 344 ms first frame, 4,000 meshes, r183, Chrome 148, RTX 4090 laptop, 2026-05-29; no maintainer reply; #30560 linked by the poster. #30560 is open.
- Forum 81221: rules and agargaro's "MultiDraw performs worse if you render a lot instances (more than 100k)"; 2025-04-15 to 2025-09-19.
- Forum 85735 (2025-08-01): 200 k trees, 3072², simplified 15-100 units, impostor beyond 100, 2048 atlas 16×16, InstancedMesh2 BVH.
- Forum 88356: r181, `isOccluded()` returns null outside a render context (Mugen87); hidden objects give no query.
- Cinevva part 4 (2026-02-25): 40 ms hitch, priority queue with cancellation, d = v · t_load. Part 19 (2026-05-04): forest culled when looking away from origin, octahedral encoding debugged (the real bug was an even grid size). Part 23 (2026-05-08): 50 avatars ≈ 13 ms JS on a Mac, fix = one InstancedMesh per piece with vertex-shader skinning.
- folio-2025: GitHub licence MIT (`license.md`), `three ^0.183.2`, last push 2026-04-07; `InstancedGroup.js`, `Monitoring.js` (trackGPU/trackHz/trackCPT), `Ligthing.js` (2048 / 512), `Rendering.js` (`_nMips` 5 / 2, threshold 1, strength 0.25), `PreRenderer.js` (CubeRenderTarget(32)), `Ticker.js` (`maxDelta = 1/30`), `Physics/Physics.js` (`world.timestep = ticker.deltaScaled`). Awwwards (2026-03-11): ~78,400 blades in a single geometry.
- #31653 "WebGPURenderer: Support ExternalTexture with GPUTexture" by donmccurdy, milestone r180. Ludicon post 2025-09-08: 85.33 → 18.66 MB on an M4, WebGPU backend, sold commercially (licence not stated).
- r186 tree: `examples/jsm/csm/{CSM,CSMFrustum,CSMHelper,CSMShader,CSMShadowNode}.js`, `webgl_shadowmap_csm.html`, `webgpu_shadowmap_csm.html`, `webgl_lod.html`, `webgl_batch_lod_bvh.html` (10 geometries, 500 k instances, 5 LODs), `webgpu_occlusion.html` (`occlusionTest`, `isOccluded`).
- Release notes: Inspector introduced r181; r183 BatchedMesh per-instance opacity (#32725); r184 FSR1Node; GTAO/SSGI nodes r181, SSRNode and ClusteredLightsNode r186.
- Manual (dev): "still in an experimental state although its maturity level has been greatly improved", WebGLRenderer "recommended choice for pure WebGL 2 applications", "no plans to add larger new features", limited node-material support "currently investigating". Post-processing manual: `RenderPipeline` replaces `EffectComposer`, built-in MRT.
- Utsubo (updated 2026-09-11, r186): "<100 draw calls and <100,000 vertices" attributed to Don McCurdy; "production-ready since r171"; shadow 512-1024 mobile / 1024-2048 desktop; cascades 4 / 2; 2048² PNG ≈ 21 MiB with mips; per-instance opacity r183.
- three-mesh-bvh README: "500 rays against an 80,000 polygon model at 60fps", BatchedMesh support, `GenerateMeshBVHWorker`. stats-gl README: `init(renderer)`, Safari Timer Queries flag. pmndrs README: `antialias/stencil/depth: false`, 8-bit sRGB default with `HalfFloatType` option, `EffectPass` merging, single triangle. Discover three.js: `overrideMaterial`, `--disable-gpu-vsync`, `matrixAutoUpdate = false`.
- Arm forum (Peter Harris): "For most mobile devices aim for ~500 draw calls a frame" ("over 5 years ago").
- New Hope code: `antialias: true`, `PCFSoftShadowMap`, DPR capped at 2, `EffectComposer` + `UnrealBloomPass` + `OutputPass`, `__nh.info()` returns `renderer.info.render`, `loop()` clamps `dt` at 0.05, `advance()` runs `frame(1/60)`, `N` sets `location.search`; `placeCamera` allocates `new THREE.Vector3(60, 140, 40)` per frame; `police.ts` `update` uses `clone()`, `new Vector3` and `getObjectByName("lightbar")` per unit; four HUD `innerHTML` writes per frame (plus `message()`); `fx.ts` 4,000 drops with `needsUpdate` per frame; `Math.random` in `police.ts` (spawn only), `actors.ts`, `fx.ts`, `main.ts` and `audio.ts`; shadow map 2048² over ±90 m (180 × 180 m); `FogExp2` 0.0031; city roughness 0.82; `GeometryBuilder` uses `number[]`; `CHUNK = 16`; district 48 × 48 × 20 → 9 chunks, each one city mesh plus an optional glass mesh (9-18 draws); traffic and towers set `frustumCulled = false`; crowd default 70; `std()` creates a new `MeshStandardMaterial` per call; `sky.ts` uses `ShaderMaterial` and `onBeforeCompile`; `textures.ts` atlas 8 × 8 tiles of 64 px; `blocksPoint` in `world.ts`.

**Refuted (5)** — marked inline
1. §8: #33688 is a `WebGLRenderer` change (not WebGPURenderer); from r185 WebGL counts shadow draws.
2. §9 table: the "Correction" against Utsubo on `PCFSoftShadowMap` is wrong; r186 removes it for WebGL too (warning + fallback to `PCFShadowMap`).
3. §10: the "5 × 2048² ≈ 10x the screen's pixels" figure is not in the cited thread.
4. §13: `Timer` was moved into the core in r179; it existed before as an addon.
5. §0/§2: a person is 11-14 meshes, not 11-13.

**Unconfirmed (5)** — marked inline
- ICS Media's "May 2025" date; the Inspector "timeline export" in r185; "Firefox is not truly async" for `compileAsync`; "No SharedArrayBuffer in Capacitor" (inherited from voxels.md); Firefox WebGPU status (already [U]). The original Don McCurdy "<100 draw calls" post remains unfound (already [U]).

**Not checked**
- Forum 62795 (rAF at 120-166 Hz), 42268 (fill rate), the OffscreenCanvas manual page, the TSL node names in the §9 table (already [U]), the pmndrs `mipmapBlur` implementation (already [U]), the atlas mip-bleed bug (already [U], needs a browser), the Codrops article (403).

**Gaps that matter for decisions**
- The report's draw-call and millisecond figures for New Hope (≈ 840 crowd draws, 0.1 ms for 840 `compose` calls, "13 full-screen draws" for bloom, 47 MB per target at DPR 2) are derived, not measured. §8's `autoReset = false` fix is the prerequisite for any real number; nothing in this report was run on the owner's hardware.
- On r186 `PCFSoftShadowMap` is gone from both renderers, so the r180 → r186 upgrade changes the shadow look (and bias tuning) whether or not WebGPU is adopted; §15 step 7 should say so.
- `postprocessing` 7 beta pins `three < 0.184`, so it cannot be used with r186; only the 6.x line (< 0.187) can, and it will need a bump at r187.
- The Utsubo "<100 draws / <100 k vertices" mobile budget is third-hand; the §1 phone budget (≤ 120 draws, ≤ 400 k triangles) exceeds it on triangles by 4x without a source.
