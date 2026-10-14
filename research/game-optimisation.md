# Optimising our web games: method, budgets and a playbook for Claude Code sessions

*Research date: 2026-10-14. Status: proposal only.*

Legend: **[S]** sourced (link inline, or `file:line` in this repo), **[O]** my opinion,
**[U]** unverified (plausible, not confirmed by a source I read or by a measurement). Code facts
about New Hope refer to `packages/new-hope-play/src` at commit `cd3edde`. **Nothing in this report
was measured in a browser.** Every gain below is an estimate until the hooks in §7 exist and
someone runs them.

## 0. Scope, and what this builds on

This report covers *how* to optimise (method, tools, budgets) for Three.js 3D (New Hope) and
Phaser 4 2D (PixelDen, about 40 live games, and 59 folders under `app/games` in
`~/projects/nodejs/pixelden`), and turns that into a checklist a Claude Code session can run. It
does not repeat these reports:

- [threejs-lessons-from-refs.md](threejs-lessons-from-refs.md) (same day) already found that
  `__nh.info()` reports only the last composer pass (`renderer.info.autoReset`), that canvas MSAA
  is lost under the composer, the GPU leaks on police despawn and body passing, the swimming
  shadow box (with a texel-snapping fix), the instanced crowd (its C1) and a feature-flag object
  (its F2). I refer to those items by its ids and add what they leave out: numbers, method, the
  shadow pass, memory, a light-count recompile, DOM cost and the skyline.
- [ref-threejs-punk.md](ref-threejs-punk.md) §4 (perf profile, adaptive DPR, a `__app.perf` A/B
  API) and [ref-sakura-crossing.md](ref-sakura-crossing.md) §4 ("count draw calls, not ms";
  33–42 ms run-to-run drift in an agent environment).
- [multiplatform.md](multiplatform.md) for the CrossCode and Vampire Survivors engine stories and
  the consoles' no-JIT rule. I only add details I could source again.

Written in parallel the same day, and overlapping (read them for their parts; this report does
not repeat their detail):

- [new-hope-audit.md](new-hope-audit.md) is the line-by-line code audit with ids (A = allocations,
  D = draw calls, R = rendering, T = test hooks, X = determinism and timestep, and more). It found most of the New Hope
  items in §7.3 independently. §7.3 maps each row to its ids and adds the expected gains and the
  order of measurement.
- [threejs-architecture-perf.md](threejs-architecture-perf.md): budgets with more sources (Arm's
  ~500 native mobile draws, ICS Media's Iris Xe box counts), instancing vs batching, LOD, culling,
  three-mesh-bvh, WebGPU status at r186, shadows, bloom and warm-up.
- [game-testing-ai.md](game-testing-ai.md) §7 (two-tier perf regression: counts in CI, timing on
  the host) and §12.1 (a shared `__test` contract with `metrics()`). §7.2 below fits into it.
- [phaser-pixelden.md](phaser-pixelden.md) §1.3: measured Phaser bundle sizes, open v4 rendering
  bugs, and the fact that no PixelDen game uses Matter.
- [procgen-for-games.md](procgen-for-games.md) §4.2 (workers, chunks, generation budgets) and
  [threejs-procgen-look.md](threejs-procgen-look.md) (the look side of the same scene).

This report's own part is the **method** (§1), the cross-stack rules (§2–5), the **budgets and
the session playbook** (§7) and the case studies (§6) [O].

---

## 1. Method: measure first

### 1.1 Budgets are frame times, and stutter is a percentile

- At 60 Hz a frame has 16.7 ms, at 120 Hz 8.3 ms. That is the whole budget for JS, style and
  layout, GPU submission *and* the GPU's own work, which runs in parallel and in a pipeline [O,
  standard]. Chrome's Frames track now marks frames as green, "partially presented" (yellow) or
  dropped (red) ([Chrome DevTools Performance reference](https://developer.chrome.com/docs/devtools/performance/reference), updated 2025-04) [S].
- **Average FPS hides stutter.** One 120 ms hitch every two seconds still averages about 55 fps
  [O, arithmetic]. Log **p50, p95, p99 and max frame interval**, the count of frames above
  1.5× the median ("janks"), and the count above 50 ms. Skia's CanvasKit perf harness records
  exactly this set (the first 5 frames, the average, and p90/p95/p99, plus median and standard
  deviation) and uploads it from CI
  ([Skia perf-canvaskit-puppeteer](https://skia.googlesource.com/skia/+show/chrome/m119/tools/perf-canvaskit-puppeteer/README.md)) [S].
- The **Long Animation Frames API** (`PerformanceObserver` type `long-animation-frame`, Chrome
  123+, not in Firefox or Safari) reports frames whose rendering was delayed past 50 ms, with
  per-script attribution for scripts over 5 ms
  ([Chrome LoAF docs](https://developer.chrome.com/docs/web-platform/long-animation-frames), 2024-10) [S].
  It is a cheap way to count hitches in the field, and it names the script that caused them [O].
- **The first frames are a separate metric.** Shader compiles, texture uploads and first-use
  allocations land there. Log time-to-first-frame and the first 5 frame times apart from the
  steady state (Skia does the same) [S/O].
- The Three.js Journey performance lesson asks for 60 fps minimum, and suggests uncapping the
  frame rate (Chrome without vsync) so a good machine shows 150–200 fps of headroom
  ([threejs-journey](https://threejs-journey.com/lessons/performance-tips)) [S]. Headroom is what
  is left for weaker machines, so measure it, not just "it hits 60" [O].

### 1.2 Find out what you are bound by before changing anything

| Test | If the frame gets faster… | Source |
|---|---|---|
| Halve the pixel ratio (`renderer.setPixelRatio(0.5)`) | fill or fragment bound: post passes, overdraw, shader cost | [O] standard; half-res post "can roughly double frame rate in fill-rate-bound scenes" ([Utsubo, 2026-09](https://www.utsubo.com/blog/threejs-best-practices-100-tips)) [S] |
| `scene.overrideMaterial = new MeshBasicMaterial()` | GPU bound on shading. "If performance rises, the app is GPU bound. If not, it's CPU bound." [refuted 2026-10-14: not a verbatim quote; the page says "If performance increases, then your app is GPU bound. If performance doesn't increase, your app is CPU bound." Same meaning.] | [discoverthreejs tips](https://discoverthreejs.com/tips-and-tricks/) [S] |
| Hide one subsystem at a time (crowd, cars, skyline, shadows, bloom) | that subsystem's draw calls or fill | Punk's STRIP order ([ref-threejs-punk.md](ref-threejs-punk.md)) [S] |
| CPU time of `frame()` ≪ frame interval | GPU bound (or vsync capped) | [O] |
| CPU time of `frame()` ≈ frame interval | CPU bound: draw-call submission, scene graph, game logic, GC | [O] |

In WebGL most CPU cost of a "heavy" scene is **draw-call submission**: per draw, three.js
updates uniforms, binds state, and the browser validates and forwards the command to the GPU
process [O]. A May 2026 three.js forum benchmark shows the scale: 4,000 meshes (~8M triangles)
on an RTX 4090 laptop took **4.5 ms of CPU per frame in WebGLRenderer** and 9.7 ms in
WebGPURenderer ([forum, 2026-05-29](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)) [S].
That is about 1.1 µs per mesh on a top desktop CPU. A mid phone is several times slower [U].

### 1.3 Tools

| Tool | What it gives | Notes |
|---|---|---|
| Chrome Performance panel | Frames track, main-thread flame chart, GPU track, CPU throttling (2×–20× [unconfirmed: the cited page names only the 2× option plus calibrated low/mid-tier presets; the 4×/6×/20× options are from memory of the UI], calibratable to low/mid phones), Memory checkbox for a JS heap line | [S] [reference](https://developer.chrome.com/docs/devtools/performance/reference). DevTools "can't fully simulate mobile CPU architectures" [S]. This session's Chrome DevTools MCP has `performance_start_trace`, `performance_stop_trace` and `performance_analyze_insight`, so an agent can record a trace without the UI [O]. |
| `about:tracing` / Perfetto | GPU process and compositor timelines | Perfetto's own docs say GPU traces for games are outside its focus and point to Android GPU Inspector ([Perfetto README](https://flutter.googlesource.com/third_party/perfetto/+show/HEAD/docs/README.md)) [S]. |
| Spector.js | A full command list of one frame, per-draw state (shaders, textures, blend), draw-call counts; driven from code with `captureNextFrame`; max 10,000 GL calls per capture | ([Spector.js extension docs](https://github.com/BabylonJS/Spector.js/blob/release/documentation/extension.md)) [S]. New Hope probably exceeds 10,000 GL calls per frame today [U]. |
| stats-gl (MIT) | FPS, CPU and **GPU** ms panels; `init(renderer)` hooks three.js automatically; `trackGPU` needs the timer-query extension; works for WebGL2, WebGPU and in workers | ([stats-gl](https://github.com/RenaudRohlinger/stats-gl)) [S]. Safari needs the "WebGL Timer Queries" feature flag [S]. |
| `renderer.info` | `render.calls/triangles/points/lines`, `memory.geometries/textures`, `programs` | Set `info.autoReset = false` and reset once per frame, or it reports only the last composer pass (threejs-lessons F1) [S: three r180 `WebGLRenderer.js:1612`]. |
| `EXT_disjoint_timer_query_webgl2` | GPU time of a range of GL commands, read some frames later | ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query)) [S]. Coverage about 72 % on Chromium [refuted 2026-10-14: the page showed 81.73 % on Chrome/Chromium, 66.14 % overall, 0.01 % Firefox, 0.14 % Safari; the numbers move with the survey, the conclusion stands] and near 0 % on Firefox and Safari by user reports ([web3dsurvey](https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2)) [S]. So GPU ms is a desktop-Chrome metric only [O]. |
| Safari Web Inspector (via a Mac, cable to the iPhone) | Timelines, JS allocations, canvas recordings | The only way to see iOS Safari [O]. |
| Android: `chrome://inspect` with USB debugging | The full DevTools on the phone's Chrome | ([archived Chrome guide](https://webarchive.library.unt.edu/web/20160706140551mp_/https://developer.chrome.com/devtools/docs/remote-debugging)) [S, old but the flow is unchanged] [U]. |
| Heap snapshots | Leaks: compare two snapshots after N heat cycles or body passes | The DevTools MCP has `take_heapsnapshot` [O]. |

### 1.4 Device tiers and adaptive quality

- **detect-gpu (MIT)** maps the GPU's renderer string to gfxbench scores: tier 0 means no WebGL,
  a blocklisted GPU or under 15 fps; tiers 1/2/3 mean at least 15/30/60 fps on its benchmark.
  Its benchmark source **stopped updating in December 2025**, so new GPUs fall back
  ([detect-gpu README v6.0.15](https://cdn.jsdelivr.net/npm/@pmndrs/detect-gpu@6.0.15/README.md)) [S].
  Use it only as the *starting* tier, then adapt from measured frame times [O].
- **Adapt from measurement.** drei's `PerformanceMonitor` averages FPS over 250 ms windows, keeps
  10, and fires incline/decline when 75 % of them are above or below bounds (default `[50, 60]`,
  or `[50, 90]` on >90 Hz screens); a 0–1 `factor` moves in steps of 0.1; `flipflops` limits how
  often it may change its mind ([drei docs](https://drei.docs.pmnd.rs/performances/performance-monitor)) [S].
  The logic is 50 lines and has no React dependency in spirit; we should write our own on frame
  *time* percentiles rather than FPS [O].
- Threejs-Punk's adaptive DPR is one-way (drop to 0.85 after two slow seconds) and turns off on
  Safari, desktop and mobile ([ref-threejs-punk.md](ref-threejs-punk.md) §4.3) [S]. One-way plus a
  hysteresis band avoids oscillation, which is the main failure of adaptive schemes [O].
- **Dynamic resolution is the strongest single lever in a fill-bound scene**: DPR 2 → 1.5 is 44 %
  fewer pixels, 2 → 1 is 75 % fewer [O, arithmetic]. Cap DPR at 2 everywhere; some phones report
  3–5 ([discoverthreejs](https://discoverthreejs.com/tips-and-tricks/); [Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)) [S]. [verified 2026-10-14 with one precision: discoverthreejs says "limit the max pixel ratio to 2 or 3"; the hard cap of 2 is Utsubo's.]

---

## 2. CPU

### 2.1 Allocation, GC and the JIT

- V8's young generation is a semi-space scavenger. Parallel scavenging cut main-thread
  young-generation GC time by 20–50 %. Concurrent marking cut pauses in "heavy WebGL games" by up
  to 50 %. V8 also schedules GC as idle tasks when a 16.6 ms frame finishes early
  ([V8 blog "Trash talk", 2019](https://v8.dev/blog/trash-talk)) [S]. So a game that leaves
  headroom gets its GC "for free" between frames. A game that uses the whole frame pays it inside
  one [O].
- The rule for hot paths (per-frame, per-entity): **no `new`, no `clone()`, no array literals, no
  `map`/`filter`, no template strings, no closures created per call**. Use module-level scratch
  vectors and reuse arrays (`length = 0`) [O, standard].
- **Hidden classes.** Create objects with all fields in the constructor and in the same order,
  never `delete` a field, and keep one shape per hot call site. A call site that sees 5+ shapes
  goes megamorphic, and its function cannot be inlined
  ([v8pedia: inline caches](https://v8pedia.void.app/ic/inline-caches)) [S, secondary]. Prefer
  classes with prototype methods over closure factories in hot loops (one source claims ~5×; I
  did not reproduce it) [U].
- **Typed arrays and SoA** for thousands of entities: `Float32Array` x/y/z/vx/vy/vz instead of an
  array of objects. They need no GC, upload straight to an `InstancedBufferAttribute`, and copy
  to a worker without serialising [O]. New Hope's `Rain` already does this
  (`packages/new-hope-play/src/fx.ts`) [S].

### 2.2 Spatial queries

- A **uniform grid** is the right default for city games: the world *is* a grid. Insertion is
  O(1), and a query reads 9 cells [O]. Use a BVH only for static triangle soups
  (three-mesh-bvh) [O].
- **Hash keys must be numbers, not strings.** `key = ix * 65536 + iz` (or a flat array over a
  bounded range). A template-string key allocates a string on every query [O]. New Hope does
  this in the skyline's collision lookup: `solids.get(\`${ix},${iz}\`)` inside `world.outside` and
  `world.outsideFloor` (`packages/new-hope-play/src/sky.ts`), which runs from `blocksPoint` on
  every camera-clearance step, walker probe and police look-ahead outside the district [S]. That
  is up to ~120 string allocations a frame from the camera alone (`placeCamera` steps 0.25 m
  over a distance of up to 30 m) [S from code, frame cost U].
- Phaser's Arcade physics keeps dynamic bodies in an RTree (`useTree: true`). The docs suggest
  `useTree: false` above about **5,000 dynamic bodies**, because rebuilding the tree every step
  costs more than it saves ([Phaser `useTree` docs](https://newdocs.phaser.io/docs/3.80.0/focus/Phaser.Physics.Arcade.World-useTree) [unconfirmed: `newdocs.phaser.io` did not resolve on 2026-10-14; the 5,000 figure is confirmed by the 4.2.1 skill file: "Disable for 5000+ bodies"];
  [Phaser 4.2.1 physics-arcade skill](https://unpkg.com/phaser@4.2.1/skills/physics-arcade/SKILL.md)) [S].
  One 2020 [refuted 2026-10-14: the thread is dated September 18, 2018] forum test found 1,000 bodies stepping in ~0.8–1.0 ms with the tree and ~0.4–0.5 ms
  without ([html5gamedevs](https://www.html5gamedevs.com/topic/40078-is-rtree-improving-performance/)) [S, informal].

### 2.3 Fixed timestep with interpolation

Gaffer's algorithm: accumulate real frame time, clamp it at **0.25 s** (against the "spiral of
death"), step the simulation in fixed `dt` while the accumulator holds a step, then render
`lerp(previous, current, alpha = accumulator / dt)`
([Gaffer on Games, "Fix your timestep"](https://gafferongames.com/post/fix_your_timestep/)) [S].
For us it buys three things [O]:

1. The same behaviour at 30, 60 and 120 Hz. New Hope's flight model, gravity and arrest timer
   now integrate with a variable `dt` clamped at 0.05 s (`packages/new-hope-play/src/main.ts`,
   `loop`) [S]. A 120 Hz MacBook and a 30 fps phone fly differently [U, not measured].
2. Replays and digests: our sim contract already is fixed ticks ([docs/sim.md](../docs/sim.md)) [S].
3. A cheap quality lever: the sim can stay at 60 Hz while rendering drops to 30.

### 2.4 Workers, SharedArrayBuffer and WASM

- **Generation belongs in a worker.** citygen is pure and deterministic. A worker can generate
  the district *and* build the chunk vertex arrays, then transfer the `Float32Array`s (zero-copy
  transfer, no SharedArrayBuffer needed) [O]. That removes the boot freeze and lets "jump to a
  new district" (N) stream in without a page reload [O].
- **SharedArrayBuffer needs cross-origin isolation:** `Cross-Origin-Opener-Policy: same-origin`
  and `Cross-Origin-Embedder-Policy: require-corp` on the document. Cross-origin resources without
  CORS or CORP are then blocked. `credentialless` COEP relaxes that but was Chrome/Edge-only when
  documented ([web.dev COOP/COEP](https://web.dev/articles/coop-coep), updated 2022) [S]. For
  PixelDen (ads, analytics, embeds) this is a real cost. Use transferables first and SAB only if a
  sim truly shares state every frame [O].
- **OffscreenCanvas** lets three.js render in a worker, so main-thread jank (DOM, React) no longer
  stalls the frame. The catch: no DOM in the worker, so size, input and some loaders need shims
  ([web.dev OffscreenCanvas](https://web.dev/articles/offscreen-canvas);
  [Evil Martians](https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers)) [S].
  Worth it for PixelDen-in-React pages before it is worth it for New Hope [O].
- **WASM pays** for big numeric kernels with predictable memory: physics (Rapier), navmesh
  building, large noise fields, meshing a voxel planet. It does not pay for glue code, or for
  game logic that calls into three.js every few lines [O]. The console angle is in
  [multiplatform.md](multiplatform.md): consoles forbid JIT, and CrossCode's interpreter route was a
  "performance bottleneck" ([RPG Site, 2019-12](https://www.rpgsite.net/news/9249-deck13-and-radical-fish-games-provide-an-update-on-the-console-versions-of-crosscode)) [S].
  Keeping hot generator code in plain integer TypeScript (`@whz/det`) keeps a later WASM or
  native port of it cheap [O].

---

## 3. GPU (Three.js r180)

### 3.1 Draw calls and state changes

- **Budgets.** Don McCurdy's rule of thumb is "<100 draw calls and <100,000 vertices if you can"
  for mobile; desktop handles several hundred to low thousands
  ([Utsubo, updated 2026-09-11](https://www.utsubo.com/blog/threejs-best-practices-100-tips)) [S].
  Phaser's own docs say "a few hundred at most"
  ([Phaser 4 rendering concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts)) [S].
- **InstancedMesh** for one geometry × many; **BatchedMesh** (r156+) [refuted 2026-10-14: `examples/jsm/objects/BatchedMesh.js` first exists in three 0.158.0 (404 on unpkg for 0.155–0.157) and it moved to core `src/objects/BatchedMesh.js` in 0.159.0; so r158+ as an addon, r159+ in core] for many different geometries
  on one material, with per-object culling, sorting and `setVisibleAt`. Maintainers' advice: one
  geometry → InstancedMesh; 2–4 geometries → one InstancedMesh each; many geometries →
  BatchedMesh. Multi-draw gets slower beyond ~100k instances. Without `WEBGL_multi_draw`,
  BatchedMesh falls back to a slower path
  ([forum, 2025-04/09](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221);
  [BatchedMesh docs](https://threejs.org/docs/pages/BatchedMesh.html)) [S]. [verified 2026-10-14 with a corrected attribution: neither the forum thread nor the docs page mentions the fallback; it is in the r180 source, `WebGLRenderer.js:1224–1234` (one `renderer.render` per range when the extension is missing). The 1 → InstancedMesh / 2–4 / many → BatchedMesh advice and the ">100k instances" remark are in the thread.]
- **Merging** (one BufferGeometry per chunk) is cheapest to draw but loses per-object culling.
  Chunk it so frustum culling still works, as New Hope's 16-tile city chunks do [S/O].
- **Materials.** Every distinct material object means a uniform upload per draw, even when it
  shares a program. Cache materials by parameters [O]. Use `MeshLambertMaterial` instead of PBR
  for small flat-shaded things like people and car parts
  ([discoverthreejs](https://discoverthreejs.com/tips-and-tricks/)) [S].
- A crowd case study (three.js forum, 2026-02-19) draws up to **100,000 people in one draw call**:
  one merged body in one InstancedMesh, a per-vertex part id so the shader moves head, body and
  legs, packed per-instance attributes, distance and facing-based LOD in the vertex shader, and
  updates spread across frames. It reports <2 ms GPU and ~0.1 ms CPU
  ([forum](https://discourse.threejs.org/t/one-draw-call-massive-crowd-performance-engineering-in-three-js/89928)) [S].
  This is the target shape for New Hope's crowd, one step beyond threejs-lessons C1 (an
  InstancedMesh per body part): the limb swing moves into the vertex shader, so the CPU writes
  only position, yaw and phase per person [O].

### 3.2 Overdraw, transparency, shaders

- Transparent objects are slow (blending, no early-z, sorting). Prefer `alphaTest` cutouts
  ([discoverthreejs](https://discoverthreejs.com/tips-and-tricks/)) [S].
- Draw opaque instances **near to far** so early-z rejects hidden fragments. BatchedMesh sorts
  opaque objects front-to-back for this ([forum](https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221)) [S].
  An InstancedMesh draws in instance order, so sort its instances yourself, once, for static
  sets [O].
- Move work from fragment to vertex shaders where it looks the same. Use `mediump` where
  precision allows: Qualcomm says mediump fragment shaders can be up to 2× faster on Adreno
  ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips);
  [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)) [S].

### 3.3 Shadows

- A shadow-casting directional light renders every caster in its frustum again, every frame.
  Point-light shadows render 6 times ([discoverthreejs](https://discoverthreejs.com/tips-and-tricks/)) [S].
  Map sizes: 512–1024 on mobile, 1024–2048 on desktop ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)) [S].
- `renderer.shadowMap.autoUpdate = false` plus `needsUpdate = true` when something changes; the
  same flags exist per light (`shadow.autoUpdate`)
  ([three LightShadow docs](https://threejs.org/docs/pages/LightShadow.html);
  [forum](https://discourse.threejs.org/t/how-to-render-shadow-map-one-time/7176)) [S].
  One phone test found freezing alone "can't significantly improve" shadow cost, because the
  lookups remain ([same thread](https://discourse.threejs.org/t/how-to-render-shadow-map-one-time/7176)) [S].
  So the gain is the caster pass, not the receiver lookups [O].
- Practical pattern for a city [O]: the static city casts into the shadow map, which is
  re-rendered only when the texel-snapped light box moves (threejs-lessons R8 snapping). People
  and cars do **not** cast into the map. They get a blob (a dark additive-inverse disc, like the
  cars' existing underglow pool).

### 3.4 Post-processing and pixel ratio

- Every pass is at least one full-screen draw. pmndrs `postprocessing` merges effects into one
  `EffectPass` and uses one big triangle per pass
  ([pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)) [S]. three's own
  `EffectComposer` runs one pass per effect [S, from source].
- three r180 `UnrealBloomPass`: one bright pass at **half resolution**, 5 mips × 2 separable blurs
  (kernels 3–11), a composite and an additive copy, all into **HalfFloat** targets
  (`examples/jsm/postprocessing/UnrealBloomPass.js`, lines 101–166 in r180) [S]. That is 13
  full-screen draws, but most of them at ≤ half resolution [S/O]. `EffectComposer` keeps two
  HalfFloat (8 bytes/pixel) targets at drawing-buffer size (`EffectComposer.js:69`) [S].
- **MSAA is lost under `EffectComposer`**: `antialias: true` only applies to the canvas
  ([forum](https://discourse.threejs.org/t/how-to-set-antialiasing-while-using-effectcomposer-in-three-js-r130/28218)) [S].
  Use a multisampled composer target (`samples: 4`, WebGL2) or SMAA/FXAA as the last pass [S/O].
  discoverthreejs found built-in MSAA cheap and FXAA/SMAA passes costly
  ([discoverthreejs](https://discoverthreejs.com/tips-and-tricks/)) [S].

### 3.5 Shader compilation hitches

- Changing the number of lights changes every lit material's program. In three r180 a light
  inside an invisible parent is not collected (`projectObject` returns on `visible === false`,
  `WebGLRenderer.js:1711`). The light hash then changes (`WebGLLights.js:425–468`), and every
  material with `needsLights` gets `needsProgramChange` (`WebGLRenderer.js:2238`) [S, from r180
  source]. The forum confirms it as a 1.5 s freeze on adding a PointLight, and the fix: keep the
  light in the scene and animate `intensity` from 0
  ([forum](https://discourse.threejs.org/t/scene-freezes-when-adding-dynamically-pointlight/28281);
  [forum](https://discourse.threejs.org/t/dynamically-disable-enable-lights-at-runtime/6545)) [S].
- `renderer.compileAsync(scene, camera)` compiles every material in a scene and resolves when
  their programs are ready. It polls `KHR_parallel_shader_compile` every 10 ms where available
  (r180 `WebGLRenderer.js:1394–1466`) [S]. The scene's lights must be in their final
  configuration first ([three Renderer docs](https://threejs.org/docs/pages/Renderer.html)) [S].
  MDN: compile all shaders, link all programs, then check status, so the browser can use
  background threads ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)) [S].
- **Warm-up recipe** [O]: build everything that can ever appear (one car of each kind, one police
  car, the beam, rain visible, the job beacon), with lights in their maximum configuration, call
  `await renderer.compileAsync(scene, camera)`, render one frame off-screen, then hide what is not
  needed. That catches `onBeforeCompile` variants (the skyline) too.

### 3.6 Culling, LOD, impostors

- `frustumCulled = false` is right for things that surround the camera (rain, sky), and wrong for
  a large instanced set that is mostly behind or beside it [O]. Split such sets into angular
  sectors or tiles, each its own InstancedMesh with a correct bounding sphere (r180
  `InstancedMesh.computeBoundingSphere()` covers all instances) [S, via threejs-lessons C5].
- Beyond the fog-out distance, geometry draws as flat fog-coloured silhouettes. Give it an unlit
  material, or bake it into the sky [O].
- `LOD` objects, or updating distant objects only every 2nd or 3rd frame
  ([discoverthreejs](https://discoverthreejs.com/tips-and-tricks/)) [S].

### 3.7 WebGPU

The WebGPU renderer is not a free speed-up for draw-call-heavy scenes. In r181–r183, forum
benchmarks show WebGPURenderer at ~2× the CPU cost per frame of WebGLRenderer with 4,000 meshes,
and 5–11× slower first frames. A maintainer acknowledged "a distinct performance issue in
WebGPURenderer that affects applications with many draw calls" [unconfirmed: that sentence is in neither linked thread. In the 2025-02 thread Mugen87 wrote "The performance problem in `WebGPURenderer` seems to be related to the way uniforms are managed" and donmccurdy said a million meshes needs batching in either renderer; the 2026-05 thread has no maintainer reply on the page read]; the workaround is instancing and
batching ([forum r183, 2026-05](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904);
[search summary of forum threads](https://discourse.threejs.org/t/why-webgpurenderer-performance-significantly-lower-than-webglrenderer/77629)) [S].
WebGPU earns its place with compute (GPU particles, 200k in the official example) and TSL
([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)) [S]. **Recommendation:
stay on WebGLRenderer for New Hope** until a feature needs compute; fix the draw-call count
first, because it helps on both [O].

---

## 4. Phaser 4 specifics (PixelDen)

Phaser 4 shipped in April 2026 with a rewritten WebGL renderer ("Beam" [verified 2026-10-14 with a corrected attribution: the cited news post does not use the name; "Beam" comes from Phaser's shader guide and the 2024 "Phaser Beam technical preview" posts])
([Phaser news, 2026-04-23](https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games)) [S].
PixelDen depends on `phaser ^4.0.0`, and its game configs set `pixelArt: true` and
`fps: { limit: 60, smoothStep: true }` (e.g. `app/games/velvet-spin/config.ts` in
`~/projects/nodejs/pixelden`) [S].

| Topic | Rule | Source |
|---|---|---|
| Batching | Quads (Image, Sprite, Text, Particles…) batch together up to 16,384 quads per batch. A batch **breaks** on a different filter, blend mode, lighting toggle, or a `roundPixels` object with default rotation/scale (a separate shader). | [rendering concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts) [S] |
| Vertex upload | Indexed quads: 4 vertices instead of 6, about a third less upload | [Phaser news](https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games) [S] |
| Texture units | 8 or 16 per batch; use atlases, with ≥1 px padding around frames; multi-texturing can be disabled for bad mobile GPUs | [rendering concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts) [S] |
| Text | `Text` uploads a new texture on every change; `BitmapText` does not | same [S] |
| Static masses | `SpriteGPULayer`: no per-frame upload, "up to 100x faster than individual sprites", 168 bytes per member [verified 2026-10-14 with a corrected attribution: the skill file does not give a byte size; the 168 B/member figure is in Phaser's news post "Phaser 4 SpriteGPULayer performance" (2026-05) and the API docs], one texture; changing members is expensive | [v4-new-features skill](https://unpkg.com/phaser@4.2.1/skills/v4-new-features/SKILL.md) [S] |
| Tilemaps | `TilemapGPULayer`: a whole layer as one quad, cost per pixel not per tile, up to 4096² tiles, one tileset, orthographic only | same [S] |
| Filters | Each filter adds draw calls and a framebuffer; external (screen-space) filters run at full resolution; filters bottlenecked mobile until rc4 (up to 16× faster there [refuted 2026-10-14: the rc4 notes say "A game that was bottlenecked by filters on mobile devices may experience speedups of 16x or more", so 16× is a floor for that case, not a cap]) | [rendering concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts); [rc4 notes](https://newreleases.io/project/npm/phaser/release/4.0.0-rc.4) [S] |
| Render to texture | `DynamicTexture`: draw complex static content once, then 1 quad per reuse | [rendering concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts) [S] |
| Pixel art | `pixelArt` = nearest sampling, good only unscaled and unrotated [unconfirmed: the cited post does not mention `pixelArt`; "only for axis-aligned, unscaled objects" is what it says about `roundPixels`]; `smoothPixelArt` keeps texels sharp when scaled up; `roundPixels` now defaults to false | [Phaser news](https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games) [S] |
| Memory | ~4 MB per megapixel of texture, +33 % with mipmaps | [rendering concepts](https://phaser.io/tutorials/phaser-4-rendering-concepts) [S] |
| Pooling | `Group` with `maxSize`, `get()` / `killAndHide`; in Arcade groups also toggle `body.enable` (`disableBody`/`enableBody`) instead of destroy/create | [Phaser group docs](https://docs.phaser.io/phaser/concepts/gameobjects/group); [physics-arcade skill](https://unpkg.com/phaser@4.2.1/skills/physics-arcade/SKILL.md) [S] |
| Physics | Arcade: fixed step at `fps: 60` by default; `useTree: false` past ~5,000 dynamic bodies; debug drawing is expensive. Matter is a full rigid-body engine with far higher per-body cost; I found no published body-count benchmark, and no PixelDen game uses it ([phaser-pixelden.md](phaser-pixelden.md) §1.3) | [physics-arcade skill](https://unpkg.com/phaser@4.2.1/skills/physics-arcade/SKILL.md) [S]; Matter cost [U] |

PixelDen-specific [O]:

- The `fps.limit: 60` is right: on 120 Hz phones it halves GPU work and battery use for games that
  do not need 120 Hz.
- PixelDen has ~178 call sites that generate textures from canvases or graphics
  (`generateTexture`, `getContext`, `addCanvas` under `app/games`) [S, grep count]. [verified 2026-10-14 as an order of magnitude only: the same grep gives 188 lines in `.ts` files and 201 across all files under `app/games`; `getContext` also matches audio and 2D-canvas calls, so the number is an upper bound on texture generation.] Those are
  boot cost. Generate them once per game boot, never per scene start, and pack them into one
  `DynamicTexture` atlas where possible, so they batch and share a texture unit [O].
- PixelDen already lazy-loads each game from its route (`app/routes/($lang).games.$slug.tsx`,
  `app/components/game-canvas.tsx` contain dynamic imports) [S]. The Phaser bundle itself is the
  fixed cost; keep it out of the portal pages [O].
- Tweens and timers: thousands of short-lived tweens allocate, so pool or chain them, or drive
  mass motion from one `update` over typed arrays [U].

---

## 5. Loading, size, memory, heat

- **Bundle.** New Hope's `vite.config.ts` raises `chunkSizeWarningLimit` to 2000 kB, which hides
  a >500 kB chunk (three plus the game) [S]. For a game this is acceptable: one chunk, brotli on
  the server, long cache headers, and a split only for things not needed at the first frame
  (audio setup, debug tools) [O]. I found no reliable current gzip size for three r180; measure
  it with `rollup-plugin-visualizer` rather than trust a number [U].
- **Procedural assets at load vs at build.** Generation is deterministic from (generator
  version, seed), so the result can be **cached**: in IndexedDB on the client, keyed by
  `generatorVersion:seed`, or as build-time files for fixed content [O]. The key must contain the
  generator version for the same reason saves must pin it
  ([ref-nms-procgen.md](ref-nms-procgen.md)) [S]. For New Hope today (48 × 48 × 20 cells,
  9 chunks), measure boot first: generation plus meshing may be well under a second, and then no
  cache is needed [U].
- **Geometry building.** `GeometryBuilder` pushes into JS `number[]` and converts to
  `Float32BufferAttribute` at the end (`packages/new-hope-play/src/city.ts`) [S]. That doubles
  peak memory and adds GC. Count faces first and write into preallocated typed arrays, which is
  also what a worker would transfer [O].
- **Audio.** Decoded audio is PCM: 10 minutes of stereo 44.1 kHz float32 is about 212 MB, and
  Safari has kept decoded buffers alive too long
  ([audio-file-decoder](https://npmjs.com/package/audio-file-decoder); [WebKit 189337](https://bugs.webkit.org/show_bug.cgi?id=189337)) [S].
  Our audio is synthesised in code (`packages/new-hope-play/src/audio.ts`), so the costs
  are audio-thread CPU instead: a `ConvolverNode` reverb and live oscillators [S/O]. A synthesised
  song can be rendered once into an `AudioBuffer` with `OfflineAudioContext` when CPU matters
  more than memory [O].
- **iOS memory.** iOS kills a tab under memory pressure and Safari reloads it, sometimes in a
  loop, with **no JS-visible signal and no `webglcontextlost` first**
  ([WebKit bug 300782](https://bugs.webkit.org/show_bug.cgi?id=300782), filed 2025-10, still
  open 2026-03) [S]. Developers report trouble once WebGL pages pass 300–500 MB
  ([Unity forum](https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771)) [S, anecdotal].
  Budget **≤ 250 MB total (JS heap + GPU) on iPhone** [O]. MDN's rule: pick a VRAM cap and scale
  render targets by the pixel count, recomputing on resize; count depth/stencil as 4 bytes/pixel
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)) [S].
- **Frame-rate caps and heat.** iOS throttles `requestAnimationFrame` in Low Power Mode
  ([motion.dev, 2025](https://motion.dev/magazine/when-browsers-throttle-requestanimationframe)) [S],
  and rAF was still locked to 60 Hz in WKWebView on 120 Hz iPads in 2025
  ([Apple forum](https://developer.apple.com/forums/thread/773222)) [S]. Phones throttle under
  sustained load, so judge a phone build by **p95 after 10 minutes of play**, not the first
  minute [O]. A 30 fps "battery" preset with the sim still at 60 Hz (§2.3) is cheap to offer [O].
- **Hidden tabs.** Pause the loop on `visibilitychange`; browsers throttle rAF there anyway [O].

---

## 6. Case studies

| Case | What happened | Lesson for us |
|---|---|---|
| **Vampire Survivors** (Phaser, then a new engine) | The JS build "wasn't running very well on platforms different to PC"; the team ran a "dual engine setup" and kept level parity by hand ([Xbox Wire, 2023-04](https://news.xbox.com/en-us/2023/04/13/vampire-survivors-dlc-2-launch/)) [S]. The first new-engine build was "10 times more performing", but its physics felt "very realistic" instead of arcade-y, so they chose fidelity over speed ([80.lv](https://80.lv/articles/vampire-survivors-will-get-new-engine-dlcs-updates-in-2023), [GamingOnLinux, 2023-01-06](http://www.gamingonlinux.com/2023/01/vampire-survivors-dev-poncle-outlines-2023-plans)) [S]. [verified 2026-10-14 with a corrected attribution: both quotes are on 80.lv; the GamingOnLinux article says only that physics "behaved very differently" and names no engine.] Wikipedia lists Unity from v1.6 ([Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)) [S]. **A "C++ port" is not supported by these sources** [U]. | The perf wall came from thousands of entities as JS objects, and from non-PC platforms. A sim in typed arrays with a fixed step, kept apart from rendering, ports 1:1; "feel" lives in the sim, so it must be bit-for-bit portable (our D18 integer sim [refuted 2026-10-14: D18 is "Assets are TS generator programs"; the integer-tick sim contract is [docs/sim.md](../docs/sim.md), which has no decision id of its own]) [O]. |
| **CrossCode** (impact.js, NW.js) | Console JIT was "causing security issues", an interpreter became "a performance bottleneck", and Xbox One reached 60 fps "most times" ([RPG Site, 2019-12](https://www.rpgsite.net/news/9249-deck13-and-radical-fish-games-provide-an-update-on-the-console-versions-of-crosscode)) [S]. More in [multiplatform.md](multiplatform.md). | Leave headroom on desktop: a 2–5× slower interpreter has to fit [O]. |
| **Massive crowd, one draw call** (three.js forum, 2026-02) | 100k characters, one InstancedMesh, LOD and animation in the vertex shader, updates spread over frames, <2 ms GPU ([forum](https://discourse.threejs.org/t/one-draw-call-massive-crowd-performance-engineering-in-three-js/89928)) [S]. | The template for New Hope's crowd and traffic (§7.3 item 2). |
| **WebGPURenderer vs WebGL, many meshes** (forum, 2026-05) | 4,000 meshes: 4.5 ms vs 9.7 ms CPU per frame; first frame 32 ms vs 167 ms ([forum](https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904)) [S]. | Don't switch renderers to fix draw calls; cut the draw calls [O]. |
| **Threejs-Punk, sakura-crossing** (our deep reads) | A perf profile as code, an `__app.perf` A/B API, a STRIP order; sakura's ~3k calls at ~20 ms and "count draw calls, not ms" ([ref-threejs-punk.md](ref-threejs-punk.md), [ref-sakura-crossing.md](ref-sakura-crossing.md)) [S]. | Counters are stable in agent environments, and milliseconds are not. Gate on counters; track ms on one known machine (§7) [O]. |
| **Phaser 4 SpriteGPULayer** | Millions of quads, one draw call, no per-frame upload ([v4 skill](https://unpkg.com/phaser@4.2.1/skills/v4-new-features/SKILL.md)) [S]. | Kairosoft-style tile floors and crowds of decorations in PixelDen and our 2D sims [O]. |
| Bruno Simon's portfolio, Codrops, Cookie Clicker, Kittens Game | I found no technical performance write-up for Bruno Simon's 2025 folio. The Codrops instancing article returned 403. I found no optimisation write-up for Cookie Clicker or Kittens Game. | Not used. Idle games are a different problem (background-tab timer throttling, big-number maths) [U]. |

---

## 7. The playbook for a Claude Code session

### 7.1 Budgets (proposal)

| | Desktop (iGPU laptop, the floor) | Mid phone (e.g. a 2022–23 mid-range Android, iPhone 12–13) |
|---|---|---|
| Target | 60 fps; p95 ≤ 16.7 ms; p99 ≤ 25 ms; 0 frames > 50 ms after warm-up | 60 fps where possible, a 30 fps floor; p95 ≤ 33 ms after 10 min |
| CPU per frame (sim + submit) | ≤ 6 ms | ≤ 10 ms |
| Draw calls (all passes) | ≤ 400 (main ≤ 250, shadow ≤ 150) | ≤ 120, no dynamic shadow casters |
| Triangles drawn | ≤ 1.5 M | ≤ 300 k |
| Programs | ≤ 30, none compiled after the first frame | same |
| Drawing buffer | DPR ≤ 1.5 default, dynamic 0.6–1.0× | DPR ≤ 1.5, dynamic 0.5–1.0× |
| Shadow map | 2048, re-rendered only when the snapped box moves | none, or 1024 static; blob shadows |
| Memory (JS heap + GPU) | ≤ 600 MB | ≤ 250 MB (iOS kill zone, §5) |
| Time to first frame | ≤ 2 s from navigation | ≤ 4 s |
| Steady-state allocation | ≈ 0 bytes per frame in the hot path | same |

All [O]: they combine §1–5's sources with New Hope's scale. The owner should set them, and the
first measured run will tell whether they are reachable.

### 7.2 Hooks every game must expose

On `window.__nh` (New Hope), `window.__pd` (PixelDen, dev only) and the planned `__wz` protocol
(threejs-lessons §3) [O]:

```ts
perf(): PerfReport            // rolling window of the last N frames (default 600)
bench(opts: { seed: number; route: string; seconds: number; warmup?: number }): Promise<PerfReport>
quality(level?: "low" | "mid" | "high"): string   // get/set; changes DPR, shadows, bloom, crowd size
flags: Record<string, boolean>                    // bloom, shadows, crowd, cars, skyline, rain, hud, radar
```

```ts
interface PerfReport {
  frames: number;
  interval: { p50: number; p95: number; p99: number; max: number }; // rAF-to-rAF, ms
  cpu: { p50: number; p95: number; max: number; bySystem: Record<string, number> }; // ms, p50 per system
  gpu?: { p50: number; p95: number };          // EXT_disjoint_timer_query_webgl2 where available
  janks: number;                                // intervals > 1.5 × median
  long: number;                                 // intervals > 50 ms
  boot: { firstFrameMs: number; steps: Record<string, number> }; // performance.mark per boot step
  calls: number; triangles: number; programs: number; geometries: number; textures: number;
  heapMB?: number;                              // performance.memory, Chrome only
  dpr: number; size: [number, number]; quality: string; flags: Record<string, boolean>;
  build: string; seed: number; ua: string;
}
```

This is the rich, game-specific report. The cross-game `__test.metrics()` of
[game-testing-ai.md](game-testing-ai.md) §12.1 should return its counter subset (`calls`,
`triangles`, `geometries`, `textures`, `heapMB`), so one runner reads every game [O].

Implementation notes [O]:

- `renderer.info.autoReset = false`; reset at the top of `frame()`; read after `composer.render`.
  Keep main-pass calls apart from shadow-pass calls: reset → `shadowMap.render` happens inside
  `render()`, so measure "calls with shadows off" once via flags.
- `bySystem`: `performance.now()` around sim, traffic, crowd, police, HUD, radar and render
  submit. Store in a preallocated `Float64Array` ring, never in arrays of objects.
- `bench` routes are **scripted and deterministic**: a fixed seed, a fixed list of `key`/`look`
  events by time (the existing `__nh.key` and `__nh.look`), driven by rAF so the GPU work is
  real. `advance()` cannot measure frames: it runs synchronously and renders only the last frame
  (`packages/new-hope-play/src/main.ts`) [S].
- Discard the first `warmup` seconds (default 3) from steady-state stats, and report them as
  `boot`.

### 7.3 New Hope on paper: the top 10

Draw-call estimates below are counted from the code [S], and their frame costs are [U] until
§7.2 exists. The crowd is 70 people × 11–12 meshes (`models.ts` `buildPerson`) [verified 2026-10-14 with one precision: 11 base parts (torso, head, hair, 4 limbs × 2), 12 with a visor, and a long coat adds a collar and, with an accent, a ring, so 11–14; the ~800 estimate holds]; a car is about 22
meshes (`buildCar`); every person and car part has `castShadow = true` (`models.ts` `part`); the
city is 9 chunks plus 9 glass meshes. Before culling, people and cars alone are therefore **~800
(crowd) + ~22 per car** draws in the main pass, and again in the shadow pass for those inside
the 180 × 180 m shadow box. The "(audit …)" ids in the Where column point to
[new-hope-audit.md](new-hope-audit.md), which found the same defects independently.

| # | Change | Where | Expected gain | Size |
|---|---|---|---|---|
| 1 | **Instrument first**: `perf()`/`bench()`/`flags` as in §7.2, the `info.autoReset` fix (threejs-lessons F1), boot marks | `main.ts` (audit T1) | None by itself. It makes every row below checkable, and it is the gate for claiming any gain. | S |
| 2 | **Crowd into instancing** (threejs-lessons C1), then limb swing in the vertex shader (per-instance `phase` and `amount` attributes, a per-vertex part id, as in the 2026 crowd case) with shared Lambert materials | `traffic.ts`, `models.ts` (audit D1) | ~800 main + up to ~800 shadow draws → ~6–10; the scene graph shrinks by ~1,500 `Object3D`s (no `updateMatrixWorld` walk over them). Probably the largest CPU win: several ms per frame on a laptop [U]. It also allows 500+ people. | M |
| 3 | **Cars as 2 draws each** (one merged hull with vertex colours + one emissive mesh), parked and police cars as instances of a few kinds; dispose on despawn (threejs-lessons C7) | `models.ts`, `police.ts`, `main.ts` (audit D2, D3, M1) | ~22 → 2 draws per car, ×2 with shadows; stops the GPU leak per heat cycle. | M |
| 4 | **Shadows: casters and frequency.** Only the city chunks and rooftop gear cast; people and cars get blob shadows; `shadowMap.autoUpdate = false`, with `needsUpdate` when the texel-snapped box moves (threejs-lessons R8) or a static caster changes; 1024 or none on low tier | `sky.ts`, `models.ts`, `main.ts` (audit D4, R4) | The shadow pass goes from "all casters every frame" to "≤ 18 draws when the box moves". On foot the box moves rarely; in a car most frames. | S |
| 5 | **Kill the wasted canvas MSAA** (`antialias: false`), and anti-alias inside the composer (`samples: 4` target, or SMAA last) | `main.ts` (audit R1) | At DPR 2 on a 1512 × 982 pt MacBook screen (3024 × 1964 = 5.9 MP), a 4× MSAA default framebuffer with depth/stencil is ~32 B/px ≈ **190 MB of VRAM** and its resolve bandwidth, spent on a buffer the OutputPass overwrites [O, arithmetic; sample count U]. Add the composer's two HalfFloat targets (8 B/px ≈ 47 MB each). On iPhone this item alone decides between living and being killed (§5). | S |
| 6 | **Resolution policy**: DPR cap 1.5 by default; dynamic scale 0.6–1.0 from p90 frame time with hysteresis (one step per 2 s, at most 3 flips); `quality()` presets (low: no shadows, bloom off or at quarter res, crowd 30; high: today) | `main.ts` (audit I8) | Fill-bound cost scales with pixels: DPR 2 → 1.5 is −44 % fragments in the scene pass and in every post pass [O]. | S |
| 7 | **No light-count changes at runtime**: the `PsiBeam`'s `PointLight` sits in a group that is hidden between passes (`fx.ts`), so each body pass changes the light hash and recompiles or re-selects every lit program (§3.5). Keep the light always visible at intensity 0, or drop it for emissive + bloom. Then `await renderer.compileAsync(scene, camera)` at boot with every model kind, the beam, rain and the job beacon present | `fx.ts`, `main.ts` (audit R6) | Removes a first-use hitch on the first body pass (forum precedent: up to 1.5 s for one light) and a program re-selection on every later toggle. Removes first-sight hitches for police cars and the rain [U]. | S |
| 8 | **HUD and radar off the hot path**: write `innerHTML` only when the string changed (four writes per frame now, including a `bl` help line that is constant per mode); draw the radar at 15–20 Hz; reuse arrays instead of `cars.filter().map()`, `crowd.positions()` and `police.positions()` per frame | `main.ts`, `radar.ts`, `traffic.ts`, `police.ts` (audit A8, A1–A4) | Fewer style and layout passes and fewer allocations per frame; likely 0.2–1 ms of main thread on a laptop, more on phones [U]. | S |
| 9 | **Skyline: cull, order, impostor.** ~16,000 tower instances (16,020: a 155 × 155 grid at 22 m minus avenues and the district, plus crowns on some) draw with `frustumCulled = false` and the full Standard + window shader. With `FogExp2(0.0031)`, fog reaches 99 % at ~690 m, so ~87 % of the towers (14,013 of 16,020 lie beyond 700 m; my count, re-running the loop of `createSkyline`) render as flat fog colour [O, arithmetic]. Split into 8 angular sectors (culling drops ~3/4 at a 62° FOV), sort instances near-to-far from the district centre once (early-z), and give the far ring an unlit material | `sky.ts` (audit D5) | Vertex work −60–75 %, less overdraw with an expensive fragment shader; a visual check is needed, because silhouettes against the sky gradient are part of the look [O]. | S |
| 10 | **Fixed 60 Hz sim step with interpolation** (§2.3), and a zero-allocation hot path: police (`target.clone().add(new Vector3(...))`, `u.pos.clone()`, `getObjectByName("lightbar")` per unit per frame), `keyLight.position...add(new Vector3(60, 140, 40))` per frame, the skyline's string keys (§2.2); **rain in the vertex shader** (4,000 drops wrapped on the CPU and 96 KB uploaded per frame, `fx.ts`, → a static buffer plus `time` and camera uniforms) | `main.ts`, `police.ts`, `sky.ts`, `fx.ts` (audit X3, T4, A12, C5) | The same flight feel at 30/60/120 Hz; fewer minor GCs; the rain loop's CPU (~4,000 iterations/frame) to zero. | M |

Also worth doing, below the cut [O]: build city chunk geometry in a worker into typed arrays
(boot time, §5); set `matrixAutoUpdate = false` on the static city meshes; give the job beacon's
400 m additive double-sided cylinder single-sided rendering; check that per-frame
`setTargetAtTime` calls on 8 audio params do not grow the automation timelines in Safari or
Firefox [U].

The expected order of discovery once the hooks exist [O]: rows 2–4 dominate CPU (draw calls), rows
5–6 dominate GPU memory and fill on retina laptops and phones, row 7 dominates hitches, and rows
8–10 are small but constant.

### 7.4 The checklist

**Before a change**

1. Read the budgets (§7.1) and the game's flags. Note the git commit, the browser and its
   version, the window size, the DPR and the power state (on mains, with other tabs closed).
2. Run the baseline: `await __nh.bench({ seed: 2, route: "roof-loop", seconds: 20 })` and two
   more routes (in a car over the lanes; the undercity with rain on), **three runs each**, through
   the DevTools MCP (`evaluate_script`). Save the JSON next to the work
   (`build/perf/<game>/<commit>-<route>.json`; `build/` is gitignored) [O].
3. Classify the bottleneck with §1.2: DPR 0.5, `overrideMaterial`, then flags off in STRIP order
   (bloom → shadows → crowd → cars → skyline → rain). Write down which one moved p95 the most.
4. Pick **one** change that targets that bottleneck. State the expected effect *as a counter*
   ("main-pass calls 1,150 → 380") before writing code.

**After the change**

5. The counters must move as predicted: calls, triangles, programs, geometries, textures. These
   are deterministic for a fixed seed, route and window size, so any surprise is a bug [O].
6. Timings: the median of three runs per route, compared with the baseline's median. Report a
   change only if it beats the run-to-run spread; sakura saw 33–42 ms drift between runs in an
   agent environment ([ref-sakura-crossing.md](ref-sakura-crossing.md)) [S]. Never report average FPS.
7. Hitches: `long` and `janks` must not rise. `programs` must not rise after warm-up.
8. Memory: `geometries` and `textures` are equal after 5 heat cycles and 5 body passes (the leak
   test); `heapMB` is flat across a 2-minute bench.
9. Look: the same named shots before and after (threejs-lessons T2). A perf change that changes
   the picture is a look change, and the owner judges it.
10. The gate: `./dev npm run check`.

**What to log** (in the commit message or the task note, as a small table): route, before → after
for p50/p95/p99 interval, CPU p50, main and shadow calls, triangles, programs, heap, plus the
machine. That is the history the next session needs [O].

### 7.5 What can be automated in our gate

The Docker gate has no GPU (CLAUDE.md) [S], so timing cannot be gated there [O]. Counters can.
This is the same two-tier split as [game-testing-ai.md](game-testing-ai.md) §7 (counts with a
±5 % band in CI, timing on the owner's machine); it adds one cheap tier in front:

- **A scene-budget check in Node** [O]: three.js scene graphs build without a WebGL context, so a
  test can call `buildCity`, `createSkyline`, `Traffic`, `Crowd` and the model builders for 3
  seeds (with a stub atlas instead of canvases) and assert meshes, unique materials, triangles,
  instance counts and `castShadow` counts against the §7.1 budgets. It is deterministic and runs in
  the current gate.
- **Headless Chrome with SwiftShader** in Docker can render WebGL in software: `renderer.info` at
  fixed poses then gives real draw-call counts, including culling. game-creator already uses
  headless SwiftShader ([game-creator.md](game-creator.md)) [S]; whether three r180 plus our
  post chain runs acceptably on SwiftShader is [U].
- **Timing baselines** stay on the owner's machine: a `bench` run per route through the host
  Chrome, stored per machine, compared at p50/p95/p99 with ±15 % tolerance, Skia-style [O].

---

## 8. What this means for us

1. **Measurement is the missing piece, not ideas.** New Hope has a console handle but no frame
   timing, and its only counter is wrong (threejs-lessons F1). Row 1 of §7.3 comes before
   everything else, and no session should claim a perf gain without a `bench` JSON before and
   after [O].
2. **New Hope is almost certainly CPU bound on draw calls, then memory bound on retina and
   mobile** [U until measured]. The crowd and cars (rows 2–3) and shadows (row 4) are the CPU
   side; the wasted MSAA buffer and DPR (rows 5–6) are the memory and fill side. Each is a small,
   mechanical change.
3. **Stay on WebGLRenderer.** WebGPU does not fix draw-call-heavy scenes today (§3.7) [S/O].
4. **Every future Three.js game starts with** the §7.2 hooks, a material cache, instancing for
   anything with more than ~20 copies, a fixed-step sim, `compileAsync` warm-up, no runtime
   light-count changes, and the §7.1 budget table in its README. These are ~200 lines in the
   game skeleton that threejs-lessons §3 proposes [O].
5. **PixelDen**: count draws and texture units per scene, use atlases and BitmapText, use
   SpriteGPULayer/TilemapGPULayer for static masses, keep `fps.limit: 60`, and add the dev-only
   `__pd.perf()` with the same report shape so one runner serves both stacks [O].
6. **Procgen-heavy games** (the owner's direction): generation in a worker with typed-array
   output, cached by `generatorVersion:seed`, and streamed by chunk with per-chunk culling. That
   architecture is also what keeps a later native or console port of the generator possible
   (CrossCode, §6) [O].

## 9. Open questions for the owner

1. Do you agree with the §7.1 budgets, and which real devices are the targets (which laptop,
   which phones)? The playbook needs one named "floor" machine for timing baselines.
2. Should a scene-budget check in Node (§7.5) join the gate for New Hope now?
3. Is the far skyline's flat fog-coloured silhouette part of the intended look (row 9), or may it
   become an unlit impostor?
4. Is a denser crowd (hundreds, after row 2) wanted, or should the saved budget go to other
   things (more cars, effects)?
5. Should New Hope get a 30 fps "battery" preset for phones, with the sim at 60 Hz?

## Sources

All accessed 2026-10-14. Dates are publication or last-update dates where the page showed one.

- https://discoverthreejs.com/tips-and-tricks/
- https://www.utsubo.com/blog/threejs-best-practices-100-tips (updated 2026-09-11)
- https://threejs-journey.com/lessons/performance-tips
- https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices
- https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query
- https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2
- https://developer.chrome.com/docs/devtools/performance/reference (2025-04-03)
- https://developer.chrome.com/docs/web-platform/long-animation-frames (2024-10-14)
- https://skia.googlesource.com/skia/+show/chrome/m119/tools/perf-canvaskit-puppeteer/README.md
- https://github.com/BabylonJS/Spector.js/blob/release/documentation/extension.md
- https://github.com/RenaudRohlinger/stats-gl (MIT)
- https://cdn.jsdelivr.net/npm/@pmndrs/detect-gpu@6.0.15/README.md (MIT)
- https://drei.docs.pmnd.rs/performances/performance-monitor
- https://flutter.googlesource.com/third_party/perfetto/+show/HEAD/docs/README.md
- https://webarchive.library.unt.edu/web/20160706140551mp_/https://developer.chrome.com/devtools/docs/remote-debugging
- https://v8.dev/blog/trash-talk (2019-01-03)
- https://v8pedia.void.app/ic/inline-caches
- https://gafferongames.com/post/fix_your_timestep/
- https://web.dev/articles/coop-coep (updated 2022-06-21)
- https://web.dev/articles/offscreen-canvas
- https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers
- https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904 (2026-05-29)
- https://discourse.threejs.org/t/why-webgpurenderer-performance-significantly-lower-than-webglrenderer/77629
- https://discourse.threejs.org/t/one-draw-call-massive-crowd-performance-engineering-in-three-js/89928 (2026-02-19)
- https://discourse.threejs.org/t/how-to-choose-between-instancedmesh-and-batchedmesh/81221 (2025-04, 2025-09)
- https://threejs.org/docs/pages/BatchedMesh.html
- https://threejs.org/docs/pages/Renderer.html
- https://threejs.org/docs/pages/LightShadow.html
- https://github.com/mrdoob/three.js/pull/19752 (compileAsync)
- https://unpkg.com/three@0.180.0/src/renderers/WebGLRenderer.js (read for §3.5)
- https://unpkg.com/three@0.180.0/src/renderers/webgl/WebGLLights.js
- https://unpkg.com/three@0.180.0/src/renderers/webgl/WebGLInfo.js
- https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js
- https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/UnrealBloomPass.js
- https://discourse.threejs.org/t/scene-freezes-when-adding-dynamically-pointlight/28281
- https://discourse.threejs.org/t/dynamically-disable-enable-lights-at-runtime/6545
- https://discourse.threejs.org/t/how-to-render-shadow-map-one-time/7176
- https://discourse.threejs.org/t/how-to-set-antialiasing-while-using-effectcomposer-in-three-js-r130/28218
- https://github.com/pmndrs/postprocessing
- https://phaser.io/news/2026/04/phaser-4-renderer-faster-cleaner-and-built-for-modern-games (2026-04-23)
- https://phaser.io/tutorials/phaser-4-rendering-concepts
- https://newreleases.io/project/npm/phaser/release/4.0.0-rc.4
- https://unpkg.com/phaser@4.2.1/skills/physics-arcade/SKILL.md
- https://unpkg.com/phaser@4.2.1/skills/v4-new-features/SKILL.md
- https://newdocs.phaser.io/docs/3.80.0/focus/Phaser.Physics.Arcade.World-useTree
- https://www.html5gamedevs.com/topic/40078-is-rtree-improving-performance/
- https://docs.phaser.io/phaser/concepts/gameobjects/group
- https://bugs.webkit.org/show_bug.cgi?id=300782 (2025-10-15, open)
- https://discussions.unity.com/t/webgl-memory-increment-issue-and-crash-on-ios/894771
- https://bugs.webkit.org/show_bug.cgi?id=189337
- https://npmjs.com/package/audio-file-decoder
- https://motion.dev/magazine/when-browsers-throttle-requestanimationframe
- https://developer.apple.com/forums/thread/773222
- https://news.xbox.com/en-us/2023/04/13/vampire-survivors-dlc-2-launch/ (2023-04-13)
- https://80.lv/articles/vampire-survivors-will-get-new-engine-dlcs-updates-in-2023
- http://www.gamingonlinux.com/2023/01/vampire-survivors-dev-poncle-outlines-2023-plans (2023-01-06)
- https://en.wikipedia.org/wiki/Vampire_Survivors
- https://www.rpgsite.net/news/9249-deck13-and-radical-fish-games-provide-an-update-on-the-console-versions-of-crosscode (2019-12-04)

Licences of code recommended for borrowing: stats-gl MIT, detect-gpu MIT [S]; pmndrs
postprocessing and drei are MIT [U, not checked on the pages read] [refuted 2026-10-14: `postprocessing` 6.39.5 declares `"license": "Zlib"` in its package.json (permissive, but not MIT: it forbids misrepresenting the origin and requires marking altered sources); `@react-three/drei` is MIT]; three.js is MIT [S, known].
Nothing here comes from the licence-flag list in [research/README.md](README.md#licence-flags).

## Verification (2026-10-14)

Adversarial fact-check by a separate session, the same day. 42 claims checked: the New Hope code
at `cd3edde`, the three r180 sources on unpkg, the PixelDen repo, and 30 web sources fetched
live. Inline markers above: `[refuted …]` for wrong statements, `[unconfirmed …]` for what no
source read today supports, `[verified … with …]` where the fact holds but the attribution or a
detail needed fixing.

**Confirmed from our code** (`packages/new-hope-play/src`, commit `cd3edde`): three `^0.180.0`;
`chunkSizeWarningLimit: 2000`; `Rain` in `Float32Array`, 4,000 drops × 6 floats × 4 B = 96 KB
per upload; the `${ix},${iz}` keys in `world.outside`/`outsideFloor` (`sky.ts:175, 181`);
`placeCamera` steps 0.25 m over `camDist ≤ 16` (× 1.9 when driving ≈ 30 m, so ≤ 122 steps);
`dt = Math.min(0.05, …)` in the loop; `new THREE.Vector3(60, 140, 40)` per frame (`main.ts:172`);
four `innerHTML` writes per frame (`tl`, `tr`, `bl`, `prompt`); the police `clone()`s and
`getObjectByName("lightbar")`; `GeometryBuilder` as `number[]` → `Float32BufferAttribute`;
`CHUNK = 16`, a 48 × 48 × 20 district (`world.ts:31`) so 3 × 3 = 9 chunks; `advance()` renders
only on the last step; the 180 × 180 m, 2048² shadow box; `FogExp2(…, 0.0031)` (99 % at 692 m,
arithmetic); the skyline loop re-run with `TILE = 4`: a 155 × 155 grid, **16,020** tower
instances before crowns, **14,013** beyond 700 m; the `PsiBeam` `PointLight` in a group hidden
between passes; the 400 m additive `DoubleSide` job cylinder; a `ConvolverNode` and 8
`setTargetAtTime` calls per `update`; car ≈ 19 parts + pool (20), taxi 21, cruiser 22; 70 people.

**Confirmed in three r180 source**: `info.autoReset` reset at `WebGLRenderer.js:1612`;
`projectObject` early return at `:1711`; `needsProgramChange` on `lightsStateVersion` at `:2238`;
`compileAsync` at `:1394–1466` polling every 10 ms; the light hash fields at
`WebGLLights.js:425–468`; `UnrealBloomPass` lines 101–166 (5 mips, kernels 3/5/7/9/11, HalfFloat,
half resolution); `EffectComposer.js:69` HalfFloat target at drawing-buffer size; the
`BatchedMesh` non-multi-draw fallback at `WebGLRenderer.js:1224–1234`.

**Confirmed from web sources**: V8 "Trash talk" (20–50 %, up to 50 %, 16.6 ms, 2019-01-03); LoAF
(Chrome 123, 50 ms, 5 ms attribution, 2024-10-14, no Firefox/Safari); detect-gpu 6.0.15 tiers,
MIT, gfxbench stopped 2025-12; drei `PerformanceMonitor` defaults (250 ms, 10, 0.75, [50, 60] /
[50, 90], 0.1; `flipflops` defaults to Infinity); the WebGPU thread (r183, 4,000 meshes ≈ 8 M
tris, 4.5 vs 9.7 ms CPU, 32 vs 167 ms first frame, RTX 4090 laptop, 2026-05-29); the crowd
thread (100k, one draw call, < 2 ms GPU, ~0.1 CPU, 2026-02-19); Gaffer's 0.25 s clamp and
`alpha = accumulator / dt`; Phaser 4 "out now" on 2026-04-23, indexed quads 4 vs 6, `roundPixels`
default false; 16,384 quads per batch, "a few hundred" draw calls, 4 MB/MP + 33 % mipmaps,
`Text` vs `BitmapText`, `DynamicTexture`; SpriteGPULayer "up to 100x" and TilemapGPULayer
limits; the physics-arcade skill (5,000+ bodies, `fps` 60, debug expensive); WebKit 300782
(2025-10-15, NEW, no `webglcontextlost`); Xbox Wire quotes; 80.lv "10 times more performing"
and the "very realistic" physics; Wikipedia: Unity from v1.6; RPG Site quotes (2019-12-04);
Spector.js 10,000-call cap and `captureNextFrame`; Skia harness metrics (first 5 frames in the
Skottie harness, p90/p95/p99 in both); Perfetto's "not well suited" GPU-trace note; MDN's VRAM
budget and 4-byte depth/stencil rule; Utsubo's figures (updated 2026-09-11); the DevTools
reference (2025-04-03, "can't truly simulate the CPUs of mobile devices"); PixelDen `phaser
^4.0.0`, 59 folders, `pixelArt: true`, `fps: { limit: 60, smoothStep: true }`, dynamic imports in
the route and `game-canvas.tsx`, no `Phaser.Physics.Matter` use.

**Refuted (7)**: web3dsurvey's Chromium share (81.73 %, not 72 %); BatchedMesh "r156+" (r158
addon, r159 core); the html5gamedevs test is from 2018, not 2020; "up to 16× faster" in rc4
(the notes say "16x or more"); "our D18 integer sim" (D18 is about asset generators; the sim is
`docs/sim.md`); pmndrs `postprocessing` is **Zlib**, not MIT; the discoverthreejs GPU-bound test
is paraphrased, not quoted.

**Unconfirmed (4)**: the maintainer quote "a distinct performance issue in WebGPURenderer…" is
in neither linked thread; the DevTools "2×–20×" throttle range; `pixelArt` = nearest sampling
"good only unscaled and unrotated" (the post says that of `roundPixels`); the `newdocs.phaser.io`
`useTree` page (DNS failure today; the figure is confirmed elsewhere).

**Attribution corrections (5)**: "Beam" is not in the cited news post; the 168 B/member figure
is in Phaser's May 2026 SpriteGPULayer post, not the skill; the multi-draw fallback is in the
r180 source, not the forum or docs; the Vampire Survivors quotes are on 80.lv only; the PixelDen
grep gives 188–201 today, not 178, and over-counts (`getContext` matches audio too).

**Not checked (gaps)**: the Apple forum thread on WKWebView 60 Hz; motion.dev on Low Power Mode
rAF; the Unity forum 300–500 MB anecdote; the audio-file-decoder and WebKit 189337 pages; the
v8pedia inline-cache page and the "~5×" closure claim; web.dev COOP/COEP and OffscreenCanvas; the
Evil Martians article; the archived Chrome remote-debugging page; the threejs-journey lesson;
stats-gl's Safari flag note; the three `LightShadow` and `Renderer` doc pages; the
`EXT_disjoint_timer_query` MDN page; the Phaser group docs; the two shadow-map and antialiasing
forum threads and the two light-recompile threads (the mechanism is confirmed from source, the
"1.5 s" figure is not); the 9-glass-mesh count (one `GeometryBuilder` per chunk, so 9 by
construction, not counted at runtime); and every frame-time estimate, which the report itself
marks [U]. Nothing was measured in a browser.
