# Performance: the optimisation playbook

How a Claude Code session keeps a game fast: measure first, know the budget, change one thing,
prove it with numbers. This page is the short form; the depth and the sources are in
[research/game-optimisation.md](../../research/game-optimisation.md) (verified 2026-10-14) and the
reports it links. Nothing in this page was measured in a browser yet: the budgets are
**proposals** until the owner sets them and the first bench run exists.

The one rule: **no perf claim without a before/after bench.** New Hope today has a console handle
(`window.__nh`) but no frame timing, and its draw-call counter reports only the last composer
pass. Instrumenting comes before optimising
([research/game-optimisation.md §7.3](../../research/game-optimisation.md#73-new-hope-on-paper-the-top-10), row 1).

## 1. Measure first

### What a frame is

- 60 Hz gives 16.7 ms per frame, 120 Hz gives 8.3 ms, for JS, layout, GPU submission *and* the
  GPU's own work. V8 runs its garbage collection in idle time when a frame finishes early, so a
  game that leaves headroom pays for GC between frames; one that fills the frame pays inside it.
- **Average FPS hides stutter.** One 120 ms hitch every two seconds still averages ~55 fps. Log
  frame-interval **p50, p95, p99 and max**, the count of intervals above 1.5× the median
  ("janks") and the count above 50 ms ("long"). Never report average FPS.
- **The first frames are a separate metric.** Shader compiles, texture uploads and first-use
  allocations land there. Log time-to-first-frame and the warm-up apart from the steady state.
- **Counters are stable, milliseconds are not.** In an agent environment wall-clock drifts
  30–40 ms run to run. Gate on draw calls, triangles, programs, geometries and textures; track
  milliseconds on one named machine and compare only like with like.

### Find out what you are bound by before changing anything

| Test | If the frame gets faster… |
|---|---|
| Halve the pixel ratio (`renderer.setPixelRatio(0.5)`) | fill or fragment bound: post passes, overdraw, shader cost |
| `scene.overrideMaterial = new MeshBasicMaterial()` | GPU bound on shading; no change means CPU bound |
| Flags off one at a time, in STRIP order: bloom → shadows → crowd → cars → skyline → rain | that subsystem's draw calls or fill |
| CPU time of `frame()` ≪ frame interval | GPU bound, or vsync capped |
| CPU time of `frame()` ≈ frame interval | CPU bound: draw-call submission, scene graph, game logic, GC |

In WebGL most CPU cost of a heavy scene is draw-call submission: a forum benchmark measured
4,000 meshes at 4.5 ms of CPU per frame in `WebGLRenderer` on a top laptop (about 1 µs per
mesh); a mid phone is several times slower. More on the "why" in
[research/game-optimisation.md §1.2](../../research/game-optimisation.md#12-find-out-what-you-are-bound-by-before-changing-anything).

### Tools

| Tool | Use it for |
|---|---|
| Chrome DevTools Performance, through the DevTools MCP (`performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`) | main thread, GC, long tasks, the Frames track; CPU throttling as a low-end proxy (it cannot truly simulate a phone CPU). The container has no GPU, so this runs on the host. |
| `renderer.info` | `render.calls/triangles`, `memory.geometries/textures`, `programs`. Set `info.autoReset = false` and reset once at the top of the frame, or it reports only the last composer pass. |
| stats-gl (MIT) | FPS, CPU and GPU ms panels; `init(renderer)` hooks three.js. GPU ms needs `EXT_disjoint_timer_query_webgl2`: about 80 % of Chromium, near 0 % on Firefox and Safari, so GPU ms is a desktop-Chrome metric. |
| Spector.js (MIT) | one frame's full GL command list with per-draw state; capped at 10,000 GL calls per capture. |
| Long Animation Frames API (Chrome 123+) | hitches above 50 ms in the field, with the script that caused them. |
| Heap snapshots (DevTools MCP `take_heapsnapshot`) | leaks: compare two snapshots after N spawn/despawn cycles. |
| Safari Web Inspector over a cable; Android `chrome://inspect` | the only way to see a real phone. |

## 2. Budgets per device tier (proposal)

From [research/game-optimisation.md §7.1](../../research/game-optimisation.md#71-budgets-proposal);
[research/threejs-architecture-perf.md §1](../../research/threejs-architecture-perf.md#1-draw-call-and-triangle-budgets)
proposes a slightly tighter desktop row (≤ 300 draws incl. shadows, ≤ 25 programs). The owner
sets the final numbers and names one "floor" machine for timing baselines.

| | Desktop floor (iGPU laptop) | Mid phone (2022–23 Android, iPhone 12–13) |
|---|---|---|
| Target | 60 fps; p95 ≤ 16.7 ms; p99 ≤ 25 ms; 0 frames > 50 ms after warm-up | 60 where possible, 30 fps floor; p95 ≤ 33 ms after 10 minutes of play |
| CPU per frame (sim + submit) | ≤ 6 ms | ≤ 10 ms |
| Draw calls, all passes | ≤ 400 (main ≤ 250, shadow ≤ 150) | ≤ 120, no dynamic shadow casters |
| Triangles drawn | ≤ 1.5 M | ≤ 300 k |
| Shader programs | ≤ 30, none compiled after the first frame | same |
| Drawing buffer | DPR ≤ 1.5 default, dynamic 0.6–1.0× | DPR ≤ 1.5, dynamic 0.5–1.0× |
| Shadow map | 2048, re-rendered only when the snapped light box moves | none, or 1024 static; blob shadows |
| Memory (JS heap + GPU) | ≤ 600 MB | ≤ 250 MB (iOS kills tabs with no JS-visible signal) |
| Time to first frame | ≤ 2 s from navigation | ≤ 4 s |
| Steady-state allocation | ≈ 0 bytes per frame in the hot path | same |

Rules of thumb behind the table: mobile wants "< 100 draw calls and < 100,000 vertices if you
can"; Phaser's docs say "a few hundred at most"; cap DPR at 2 everywhere (phones report up to
3–5), and DPR 2 → 1.5 is 44 % fewer pixels in every pass. Judge a phone build by **p95 after
10 minutes**, because phones throttle under sustained load.

Device tiers: detect-gpu (MIT) gives a *starting* tier from the GPU string (its benchmark data
stopped updating in December 2025), then adapt from measured frame-time percentiles: one step
per 2 s, a hysteresis band, a cap on how many times it may flip. One-way drops (never back up
in the same session) are the simplest scheme that does not oscillate.

## 3. The hooks a game exposes (proposal)

Every game exposes these on its dev handle (`window.__nh` for New Hope, `window.__pd` for a
PixelDen game, the planned `__wz` for the Wallhammer player). They are the only way an agent
can check a perf change; details and the rationale are in
[research/game-optimisation.md §7.2](../../research/game-optimisation.md#72-hooks-every-game-must-expose).

```ts
perf(): PerfReport            // rolling window of the last N frames (default 600)
bench(opts: { seed: number; route: string; seconds: number; warmup?: number }): Promise<PerfReport>
quality(level?: "low" | "mid" | "high"): string   // get/set: DPR, shadows, bloom, crowd size
flags: Record<string, boolean>                    // bloom, shadows, crowd, cars, skyline, rain, hud, radar

interface PerfReport {
  frames: number;
  interval: { p50: number; p95: number; p99: number; max: number }; // rAF to rAF, ms
  cpu: { p50: number; p95: number; max: number; bySystem: Record<string, number> };
  gpu?: { p50: number; p95: number };          // timer query, desktop Chrome only
  janks: number; long: number;                 // > 1.5 × median; > 50 ms
  boot: { firstFrameMs: number; steps: Record<string, number> }; // performance.mark per step
  calls: number; triangles: number; programs: number; geometries: number; textures: number;
  heapMB?: number; dpr: number; size: [number, number]; quality: string;
  flags: Record<string, boolean>; build: string; seed: number; ua: string;
}
```

Implementation rules:

- `renderer.info.autoReset = false`; reset at the top of `frame()`; read after the composer
  renders. In r180 the shadow pass is counted only this way (r185 fixed the reset order, the
  per-pass reset under `EffectComposer` remains).
- `bySystem`: `performance.now()` around sim, traffic, crowd, police, HUD and render submit,
  stored in a preallocated `Float64Array` ring. The profiler must not allocate.
- `bench` routes are **scripted and deterministic**: a fixed seed and a fixed list of key/look
  events by time, driven by the real rAF loop so the GPU work is real. A synchronous
  `advance()` cannot measure frames: it renders only its last step.
- Discard the first `warmup` seconds (default 3) from the steady state and report them as `boot`.
- The cross-game `__test.metrics()` of
  [research/game-testing-ai.md §12.1](../../research/game-testing-ai.md#121-one-contract-for-both-stacks-window__test)
  returns the counter subset (`calls`, `triangles`, `geometries`, `textures`, `heapMB`), so one
  runner reads every game.
- Strip the hooks from production builds (`import.meta.env.DEV` or a `?test=1` query).

## 4. CPU checklist

- **Zero allocation in hot paths** (per frame, per entity): no `new`, no `clone()`, no array
  literals, no `map`/`filter`, no template strings, no closures created per call. Module-level
  scratch vectors; reuse arrays with `length = 0`. New Hope's offenders are listed in
  [research/new-hope-audit.md](../../research/new-hope-audit.md) (its A ids).
- **One shape per hot call site.** Construct objects with all fields in the same order, never
  `delete` a field. A call site that sees 5+ shapes goes megamorphic and stops inlining.
- **Typed arrays, SoA** for thousands of entities (`Float32Array` x/y/z/vx/vy/vz). No GC, they
  upload straight into an `InstancedBufferAttribute`, and they transfer to a worker without a
  copy. New Hope's rain already does this (`packages/new-hope-play/src/fx.ts`).
- **Spatial queries on a uniform grid** with numeric keys (`ix * 65536 + iz`, or a flat array).
  A `${ix},${iz}` string key allocates on every lookup; New Hope's skyline collision does this
  on every camera-clearance step (`packages/new-hope-play/src/sky.ts`). BVH only for static
  triangle soups (three-mesh-bvh).
- **Fixed timestep with interpolation.** Accumulate real time, clamp at 0.25 s, step the sim at
  a fixed `dt`, render `lerp(previous, current, alpha)`. Same behaviour at 30, 60 and 120 Hz,
  replays and digests for free, and the sim can stay at 60 Hz while rendering drops to 30.
  Our data games already have this in [docs/sim.md](../sim.md); New Hope integrates with a
  variable `dt` and should not
  ([research/threejs-architecture-perf.md §13](../../research/threejs-architecture-perf.md#13-frame-pacing-and-fixed-timestep)).
- **DOM off the hot path.** Write `innerHTML` only when the string changed; draw an overlay
  canvas (radar, minimap) at 15–20 Hz, not every frame.
- **Pause on `visibilitychange`.** Browsers throttle rAF in hidden tabs anyway; the game must
  not try to catch up.
- **Workers for generation** (section 7). Prefer transferable `ArrayBuffer`s over
  `SharedArrayBuffer`, which needs cross-origin isolation (COOP/COEP) and breaks embeds and ads.
- **WASM** pays for big numeric kernels with predictable memory (physics, navmesh, large noise
  fields, voxel meshing), not for glue or for logic that calls three.js every few lines. Hot
  generator code in plain integer TypeScript (`@whz/det`) keeps a later port cheap.

## 5. GPU checklist (Three.js)

- **Draw calls first.** One geometry × many copies → `InstancedMesh`; 2–4 geometries → one
  `InstancedMesh` each; many geometries, one material → `BatchedMesh` (core since r159; it
  needs `WEBGL_multi_draw`, else it falls back to one draw per range). Anything with more than
  ~20 copies is instanced from the first commit. A merged `BufferGeometry` per chunk is cheapest
  to draw but loses per-object culling, so keep chunks small enough that frustum culling works.
- **Cache materials by parameters.** Every distinct material object means a uniform upload per
  draw even when it shares a program. Lambert, not PBR, for small flat-shaded things.
- **Crowds and traffic**: one merged body in one `InstancedMesh`, per-instance phase and
  amount attributes, a per-vertex part id, limb motion in the vertex shader. The 2026 forum
  case draws 100,000 people in one call at < 2 ms GPU.
- **Shadows**: only the static world casts into the map; people and cars get blob shadows.
  `renderer.shadowMap.autoUpdate = false` and `needsUpdate = true` when the texel-snapped light
  box moves or a static caster changes. 512–1024 maps on mobile, 1024–2048 on desktop. A
  point-light shadow renders the scene six times.
- **Transparency**: `alphaTest` cutouts over blending. Draw opaque instances near to far so
  early-z rejects hidden fragments (sort a static `InstancedMesh` once; `BatchedMesh` sorts for
  you).
- **Pixel ratio**: cap at 1.5 by default, 2 at most, dynamic scale from p90 frame time. In a
  fill-bound scene this is the strongest single lever.
- **Post-processing**: every pass is a full-screen draw. three's `UnrealBloomPass` is 13 draws,
  most at ≤ half resolution, into HalfFloat targets. `antialias: true` on the canvas is **wasted
  under `EffectComposer`**: the scene renders into the composer's own target. Set
  `antialias: false` and give the composer target `samples: 4` on desktop, `0` on phones, or
  SMAA as the last pass. At DPR 2 on a retina laptop the unused MSAA canvas alone is on the
  order of 190 MB of VRAM.
- **No light-count changes at runtime.** Adding, removing or hiding a light changes the light
  hash and re-selects or recompiles every lit material's program. Keep a light in the scene at
  `intensity = 0`, or use emissive + bloom. The r180 mechanism is confirmed from source
  ([research/game-optimisation.md §3.5](../../research/game-optimisation.md#35-shader-compilation-hitches)).
- **Warm-up**: build everything that can ever appear (every car kind, the police cruiser, the
  beam, rain, the job beacon) with lights in their final configuration, `await
  renderer.compileAsync(scene, camera)` behind the start screen, render one frame, then hide
  what is not needed. `programs` must not rise after the first frame.
- **Culling**: `frustumCulled = false` only for things that surround the camera (rain, sky).
  Split large instanced sets into angular sectors or tiles, each with a correct bounding sphere.
  Beyond the fog-out distance, geometry is a flat silhouette: give it an unlit material or bake
  it into the sky. `LOD`, or update distant objects every 2nd or 3rd frame.
- **Stay on `WebGLRenderer`.** At r181–r183 `WebGPURenderer` costs about 2× the CPU per draw
  call on many-mesh scenes and 5–11× slower first frames. Cut the draw calls first; that helps on
  both. WebGPU earns its place with compute (GPU particles) and TSL. Status and what would break
  for New Hope: [research/threejs-architecture-perf.md](../../research/threejs-architecture-perf.md).

Patterns with code (shadow texel snapping, the `__shot` plugin, vertex AO) are in
[research/threejs-lessons-from-refs.md](../../research/threejs-lessons-from-refs.md).

## 6. GPU checklist (Phaser 4)

From [research/game-optimisation.md §4](../../research/game-optimisation.md#4-phaser-4-specifics-pixelden)
and [research/phaser-pixelden.md §1.3](../../research/phaser-pixelden.md#13-performance-mobile-and-known-v4-bugs).
PixelDen lives in `~/projects/nodejs/pixelden`, on `phaser ^4.0.0` with `pixelArt: true` and
`fps: { limit: 60, smoothStep: true }`.

- **Batching**: quads batch together up to 16,384 per batch. A batch breaks on a different
  filter, blend mode, lighting toggle or a `roundPixels` object with default rotation and scale.
  Count draws per scene; "a few hundred at most".
- **Atlases**, with ≥ 1 px padding around frames; 8 or 16 texture units per batch. Textures
  cost ~4 MB per megapixel, +33 % with mipmaps.
- **`BitmapText`, not `Text`**: `Text` uploads a new texture on every change. Code-drawn bitmap
  fonts also dodge the open v4 `Text` bugs on rotated and iPadOS targets.
- **Static masses**: `SpriteGPULayer` (no per-frame upload, one texture, changing members is
  expensive) for tile floors and decoration crowds; `TilemapGPULayer` for a whole layer as one
  quad (orthographic, one tileset, up to 4096² tiles). The vendor's "100×" figures have no
  methodology: treat them as desktop best cases.
- **Filters**: each adds draw calls and a framebuffer; screen-space filters run at full
  resolution. Filters bottlenecked mobile until rc4.
- **`DynamicTexture`**: draw complex static content once, then one quad per reuse. Procedural
  textures are boot cost: generate once per game boot, never per scene start, and pack them into
  one atlas so they batch.
- **Pooling**: `Group` with `maxSize`, `get()` / `killAndHide`; in Arcade groups toggle
  `body.enable` instead of destroy/create.
- **Physics**: Arcade steps at a fixed 60 Hz by default; `useTree: false` past ~5,000 dynamic
  bodies; debug drawing is expensive. Matter is a full rigid-body engine with far higher
  per-body cost; no PixelDen game uses it.
- **`roundPixels`** is right only for axis-aligned, unscaled objects (default false in v4);
  `smoothPixelArt` keeps texels sharp when scaled.
- **`fps.limit: 60`** stays: on 120 Hz phones it halves GPU work and battery use.
- **Bundle**: Phaser does not tree-shake (4.2.1 is 352 kB gzip); keep it out of the portal
  pages and lazy-load each game from its route, as PixelDen already does.

## 7. Loading and generation checklist

- **Generation runs in a worker** and returns typed arrays in the transfer list (transfer the
  `.buffer`; zero-copy, the sender's buffer is detached). The worker can also build the chunk
  vertex arrays. That removes the boot freeze and lets "jump to a new district" stream in without
  a reload. Budgets (to be measured): ≤ 2 ms per frame of streaming work on the main thread,
  20–100 ms per chunk in a worker, 2 workers on mobile and `hardwareConcurrency − 2` (at most 4)
  on desktop. Details: [docs/games/procgen.md](procgen.md) and
  [research/procgen-for-games.md §4.2](../../research/procgen-for-games.md#42-workers-chunks-budgets-o-unless-marked).
- **Cache by `generatorVersion:seed`** (IndexedDB on the client, or build-time files for fixed
  content). The key must contain the generator version for the same reason saves pin it: a new
  generator changes every world. Measure boot before adding a cache; New Hope's district may
  generate and mesh well under a second.
- **Build geometry into preallocated typed arrays.** Count faces first, then write. Pushing into
  `number[]` and converting at the end doubles peak memory and adds GC (what New Hope's
  `GeometryBuilder` does today in `packages/new-hope-play/src/city.ts`).
- **Chunk and cull.** A chunk's content is `f(worldSeed, chunkKey)`; neighbours never read each
  other. Load in a ring around the player, coarse first; drop chunks beyond the ring.
- **Bundle**: one chunk for the game, brotli on the server, long cache headers; split only what
  the first frame does not need (audio setup, debug tools). Do not raise
  `chunkSizeWarningLimit` to hide a big chunk; measure it with `rollup-plugin-visualizer`.
- **Memory on phones**: iOS kills a tab under memory pressure with **no JS-visible signal and no
  `webglcontextlost`**, and may reload it in a loop. Pick a VRAM cap, scale render targets by
  pixel count, recompute on resize, count depth/stencil as 4 bytes per pixel. Budget ≤ 250 MB
  total on iPhone.
- **Audio**: decoded audio is PCM (10 minutes of stereo 44.1 kHz float32 ≈ 212 MB). Our audio
  is synthesised, so the cost is audio-thread CPU instead (convolvers, live oscillators); a song
  can be rendered once with `OfflineAudioContext` when CPU matters more than memory. Suspend the
  context when hidden or muted.
- **Dispose on despawn.** `geometries` and `textures` in `renderer.info.memory` must be equal
  before and after N spawn/despawn cycles. New Hope leaks on police despawn and body passing.

## 8. Before and after a perf change

**Before**

1. Read the budgets (section 2) and the game's flags. Note the git commit, the browser and its
   version, the window size, the DPR and the power state (on mains, other tabs closed).
2. Run the baseline: `await __nh.bench({ seed: 2, route: "roof-loop", seconds: 20 })` and two
   more routes (in a car over the lanes; the undercity with rain on), **three runs each**,
   through the DevTools MCP (`evaluate_script`). Save the JSON under
   `build/perf/<game>/<commit>-<route>.json` (`build/` is gitignored).
3. Classify the bottleneck (section 1): DPR 0.5, `overrideMaterial`, then flags off in STRIP
   order. Write down which one moved p95 the most.
4. Pick **one** change that targets that bottleneck. State the expected effect **as a counter**
   ("main-pass calls 1,150 → 380") before writing code.

**After**

5. The counters must move as predicted: calls, triangles, programs, geometries, textures. They
   are deterministic for a fixed seed, route and window size, so any surprise is a bug.
6. Timings: the median of three runs per route against the baseline's median. Report a change
   only if it beats the run-to-run spread. Never report average FPS.
7. Hitches: `long` and `janks` must not rise. `programs` must not rise after warm-up.
8. Memory: `geometries` and `textures` equal after 5 spawn/despawn cycles (for New Hope: 5 heat
   cycles and 5 body passes); `heapMB` flat across a 2-minute bench.
9. Look: the same named shots before and after. A perf change that changes the picture is a
   look change, and the owner judges it.
10. The gate: `./dev npm run check`.

**What to log**, in the commit message or the task note, as one small table: route, before →
after for interval p50/p95/p99, CPU p50, main and shadow calls, triangles, programs, heap, plus
the machine (hardware, browser version, DPR, window). That is the history the next session needs.

| route | p50 / p95 / p99 ms | cpu p50 | calls main / shadow | tris | programs | heap MB |
|---|---|---|---|---|---|---|
| roof-loop | 14.1 / 19.8 / 31 → 9.2 / 12.0 / 17 | 7.1 → 3.4 | 1,150 / 820 → 380 / 18 | 1.9 M → 1.1 M | 34 → 22 | 410 → 330 |

(The row is the format, not a measurement.)

## 9. What the gate can check

The Docker gate has no GPU, so timing cannot be gated there; counters can
([research/game-optimisation.md §7.5](../../research/game-optimisation.md#75-what-can-be-automated-in-our-gate),
[research/game-testing-ai.md §7](../../research/game-testing-ai.md#7-performance-regression-tests)):

- **Scene-budget test in Node** (proposal): three.js scene graphs build without a WebGL
  context, so a test can build the city, skyline, traffic, crowd and models for 3 seeds with a
  stub atlas and assert meshes, unique materials, triangles, instance counts and `castShadow`
  counts against the budgets. Deterministic, and it fits the current gate.
- **Counts in CI** against a committed per-game budget file with a ±5 % band; **timing on the
  owner's machine** per route, stored with the renderer string and the browser version, compared
  at p50/p95/p99 with ±15 % tolerance.
- Headless Chrome with SwiftShader could give real `renderer.info` counts at fixed poses
  (including culling), if the owner allows it in the dev image; whether r180 plus our post chain
  runs acceptably there is unverified.

## 10. New Hope: the order of work

From [research/game-optimisation.md §7.3](../../research/game-optimisation.md#73-new-hope-on-paper-the-top-10)
and [research/new-hope-audit.md §13](../../research/new-hope-audit.md#13-prioritised-upgrade-list);
every gain is an estimate until row 1 exists. The crowd is 70 people × 11–14 meshes, a car about
20 meshes, every part a shadow caster, before culling ~800 crowd draws in the main pass and again
in the shadow pass.

1. Instrument: `perf()`, `bench()`, `flags`, the `info.autoReset` fix, boot marks.
2. Crowd into instancing, then limb swing in the vertex shader, shared Lambert materials
   (~800 + ~800 shadow draws → ~6–10).
3. Cars as 2 draws each (merged hull + emissive), kinds as instances, dispose on despawn.
4. Shadows: only the city casts; blob shadows for people and cars; `autoUpdate = false` with
   `needsUpdate` when the snapped box moves.
5. `antialias: false`; anti-alias inside the composer.
6. Resolution policy: DPR cap 1.5, dynamic scale, `quality()` presets.
7. No light-count changes at runtime (the beam's point light stays at intensity 0);
   `compileAsync` warm-up with every model kind present.
8. HUD and radar off the hot path; reuse arrays.
9. Skyline: 8 angular sectors, near-to-far instance order, an unlit far ring (a look change: the
   owner judges the silhouettes).
10. Fixed 60 Hz sim step with interpolation; a zero-allocation hot path; rain in the vertex
    shader.

Expected order of discovery once the hooks exist: rows 2–4 dominate CPU, rows 5–6 dominate GPU
memory and fill on retina laptops and phones, row 7 dominates hitches, rows 8–10 are small but
constant.

## Further reading

- [docs/games/README.md](README.md): the handbook index and the three kinds of game.
- [research/game-optimisation.md](../../research/game-optimisation.md): method, tools, cross-stack
  rules, case studies (Vampire Survivors, CrossCode, the one-draw-call crowd), the full playbook.
- [research/threejs-architecture-perf.md](../../research/threejs-architecture-perf.md): instancing
  vs batching, LOD, culling, three-mesh-bvh, shadows, bloom cost, WebGPU status at r186.
- [research/new-hope-audit.md](../../research/new-hope-audit.md): the line-by-line audit with ids.
- [research/threejs-lessons-from-refs.md](../../research/threejs-lessons-from-refs.md): what the
  reference projects did, with code patterns.
- [research/game-testing-ai.md](../../research/game-testing-ai.md): the `__test` contract, test
  tiers, perf regression tests.
- [research/phaser-pixelden.md](../../research/phaser-pixelden.md): Phaser 4 state, bundle sizes,
  open rendering bugs, PixelDen.
- [research/procgen-for-games.md](../../research/procgen-for-games.md) and
  [docs/games/procgen.md](procgen.md): generation in workers, chunks, caching by seed.
- [docs/sim.md](../sim.md): the fixed-tick sim contract.
