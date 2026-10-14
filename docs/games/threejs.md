# Building a Three.js game

How a Claude Code session builds and grows a real-time 3D game in Three.js: the architecture,
the per-frame rules, the budgets, the rendering and gameplay patterns, and the checklists. The
depth is in six verified reports (all 2026-10-14):
[research/new-hope-audit.md](../../research/new-hope-audit.md) (the code read file by file),
[research/threejs-architecture-perf.md](../../research/threejs-architecture-perf.md) (budgets,
instancing, post, shadows, WebGPU status),
[research/threejs-lessons-from-refs.md](../../research/threejs-lessons-from-refs.md) (45
techniques from the reference repos),
[research/threejs-gameplay.md](../../research/threejs-gameplay.md) (loop, camera, input, feel,
AI, saves), [research/threejs-procgen-look.md](../../research/threejs-procgen-look.md) (sky,
fog, neon, look presets) and [research/game-testing-ai.md](../../research/game-testing-ai.md)
(the test side, which has its own page: [testing.md](testing.md)). This page only says what we do.

The subject is New Hope (`packages/new-hope-play`, D28, D30), the first and so far only Three.js
game. Where this page says "today" it describes that package at commit `cd3edde`; where it says
"rule" it is what every Three.js game in this repo follows from now on; where it says
**proposal** it is a change nobody has decided ([docs/DECISIONS.md](../DECISIONS.md) is never
edited by a session). Every number below comes from reading code and sources, not from a
browser run: nothing in the six reports was measured on the owner's hardware, and the container
has no GPU. The first job of any perf work is therefore to make the numbers real (see
"Measure before you optimise").

## The one sentence

**The simulation is a pure function of (seed, inputs, fixed steps); the renderer reads it and
never writes it; every expensive thing is instanced, cached, disposed and counted.** A game
built this way can be scripted, replayed and measured by a session without a human at the
screen, which is what "make this game" and "continue developing this game" need.

## Versions and the renderer

- **three.js:** New Hope pins `^0.180.0` (r180, 2025-09-03; a 0.x caret stays on 0.180.x). The
  current release is r186 (0.186.1, 2026-09-24). Upgrading is a **proposal** with a checklist
  below; until then, code written from 2026 docs will not compile unchanged (r183 renamed
  `PostProcessing` to `RenderPipeline`, r183 deprecated `Clock`, r185 made `updateWorldMatrix`
  honour `matrixWorldNeedsUpdate`).
- **`WebGLRenderer`, not `WebGPURenderer`.** The manual still calls WebGPURenderer experimental,
  two independent 2025–2026 measurements put its CPU cost at about 2× per draw call on scenes
  with many meshes, and it does not run `ShaderMaterial`, `onBeforeCompile` or `EffectComposer`.
  Android WebView (Capacitor) has no WebGPU. Re-measure only when a feature needs compute (GPU
  crowds, particle collision) or the draw count is already under 300.
- **Write shaders so they port.** Each shader feature (fog, windows, rim, neon bake, rain) is
  one small GLSL function in one file; no new scattered `onBeforeCompile` string patches. A
  later TSL port is then mechanical, about 150 lines for New Hope today.
- **Shader patches assert they applied.** New Hope's sky patches `#include <common>`,
  `<begin_vertex>` and `<emissivemap_fragment>` with `.replace` and never checks the result; a
  three.js bump would silently drop the windows. Rule: after every `replace`, `if
  (!out.includes("vTower")) throw new Error("sky patch did not apply")` in dev.

**Upgrade checklist r180 → r186 (proposal, one tick):** r181 makes rough PBR brighter (the city
material has roughness 0.82: re-check the look); r182 deprecates and **r186 removes
`PCFSoftShadowMap` on WebGL too** (it falls back to `PCFShadowMap`, soft since r182, with a
console warning), so switch before upgrading and go straight to r183 or later (r182 had a
fallback bug); r185 `matrixWorldNeedsUpdate` for anything with `matrixAutoUpdate = false`; r186
`Object3D.dispose()`; then verify that the three sky-patch anchors still exist. `postprocessing`
7 beta pins `three < 0.184`, so only its 6.x line could join an r186 build.

## Module layout

Today `main.ts` is the composition root, the game rules, the camera, the HUD, the loop and the
test API in one 380-line file, sharing eight module-level `let`s, with simulation and
presentation interleaved in one `frame()`. The target layout (**proposal** from the audit §14,
the same shape the reference games converged on) is:

```text
packages/<game>/src/
  main.ts            ≈ 60 lines: seed from the URL, pick a tier, boot(), start the loop
  app/               boot, loop (fixed-step accumulator, pause on hidden), quality tiers, typed events
  data/              @whz/game-data tables + locales → typed tunables; t(id, params) for every string
  world/             pure: cells, collision (blocksPoint, floorAt, sweep, DDA), skyline layout; unit-tested
  sim/               pure gameplay: state, named seeded streams, one file per system, step(state, actions, dt)
  render/            reads GameState, never writes it: renderer, atlas, meshes, instanced crowds and cars, fx, camera rig, sync
  audio/             the live graph (drone, engine, siren) and one-shot cues
  input/             actions + bindings; keyboard-mouse, gamepad, touch adapters
  ui/                hud (diffed DOM writes), radar, start screen, touch overlay
  debug/             window.__game: state(), step(), replay(), perf(), shot(), errors()
```

Rules behind the layout, to be enforced by an import lint rather than by hope:

1. `world/` and `sim/` import no DOM, no `WebGLRenderer`, no `Scene`. Collision must be
   testable in Node without building a mesh (today `createSkyline` in `sky.ts` overwrites
   `world.outside`, so the order of calls in `main.ts` is load-bearing: that is the bug to undo).
2. `render/`, `ui/` and `audio/` consume `GameState` and the event queue; they never mutate
   state. No system returns HTML (`police.report()` and `jobs.hud()` do today).
3. Tunables and texts live in `games/<id>/data` and `locales`, not as literals (psi regen,
   arrest fine, car reach, every HUD string are literals in New Hope today, and its `game.json`
   still says `resolution 480×270` from the 2D template). The game-data rule is integers only, so
   store mm, mm/s and basis points and divide once at load
   ([docs/game-data.md](../game-data.md)). Whether New Hope's rules become declared `@whz/sim`
   systems or plain tables is an **owner call** (audit question 1).
4. One file per system, each with a 2–3 line header naming what it owns and which table it
   reads. The package README keeps a file table (New Hope has one) and a short trap table.

The minimum first step is to pull `Game` (state plus `step(dt, actions)`), `CameraRig`, `Hud`
and `debugApi(game)` out of `main.ts`; the rest follows one module per tick.

## The per-frame rules

The loop, the allocations and the DOM. All of these are rules; New Hope breaks most of them
today (the audit lists each with `file:line`).

1. **Fixed 60 Hz simulation step with an accumulator**, at most 4–5 steps per frame, frame time
   clamped (Fiedler's pattern). Render once per frame and interpolate only the transforms that
   matter (camera, player, driven car, cruisers); instanced traffic may stay on variable `dt`.
   The scripted `advance(seconds)` and the live loop then run **the same `step()`**. Today the
   live loop integrates variable `dt` clamped to 0.05 s while `advance` steps at 1/60, so a
   120 Hz player and a script see different physics, and the 62 m/s car stays under the 4 m
   cell only because of the clamp.
2. **Gameplay never calls `Math.random`, `performance.now()` or `setTimeout`.** One seeded
   stream per concern (`createRng(seed, "police")` from `@whz/det`); audio noise may keep
   `Math.random`. Same build + same browser + same seed + same input log ⇒ same run. That is the
   whole basis of scripted checks. Latch input edges until the first sim step consumes them.
3. **Allocate nothing per frame.** Scratch `Vector3`s on the system, `.set()` not `new`,
   `for` loops not closures, no `clone()`, no string keys in a hot path (New Hope builds a
   `${ix},${iz}` key per skyline collision probe, up to ≈120 times per frame from the camera
   ray). Keep references instead of `getObjectByName()` per frame.
4. **Write the DOM only on change.** Cache the last string per HUD element; `textContent`, not
   `innerHTML`; a bar is `style.width`. Four `innerHTML` writes per frame cost more than the GC.
5. **Presentation runs once per presented frame, never per sim step.** `advance(600)` must not
   write the HUD, update the audio graph or move 4,000 rain drops 600 times.
6. **Sleep what does not move.** Parked cars run the full flight model today (24 collision
   probes each per frame at zero velocity): sleep below `vel.lengthSq() < 1e-4`, wake on hit.
7. **Pause on `visibilitychange`** (the loop and the `AudioContext`), handle
   `webglcontextlost`, and follow a `devicePixelRatio` change when the window moves monitors.
8. **Dispose what you remove.** `grep dispose src/` finds nothing in New Hope: every police
   despawn leaks ≈21 geometries and ≈12–14 materials per cruiser, every body pass ≈2 × (11
   geometries + 6–8 materials). Pool units and toggle `visible`; share geometries and materials
   from caches; `renderer.info.memory.geometries` must be equal before and after ten district
   switches.
9. **Substep when `speed × dt > cell / 2`**, or sweep with a voxel DDA. Encode the tunnelling
   invariant in a test.

```ts
// app/loop.ts: the only place the browser clock is read
const STEP = 1 / 60, MAX_STEPS = 5;
let acc = 0, last = performance.now();
function onFrame(now: number) {
  acc += Math.min(0.25, (now - last) / 1000); last = now;
  let n = 0;
  while (acc >= STEP && n++ < MAX_STEPS) { game.step(STEP, input.take()); acc -= STEP; }
  present(acc / STEP);                       // interpolation alpha; HUD, audio, render once
}
// debug: advance(seconds) = Math.round(seconds / STEP) calls of game.step, then present(1)
```

## Measure before you optimise

Three facts from the r180 source make every perf number quoted so far about New Hope wrong or
unmeasured:

- `renderer.info` resets on **every** `render()` call while `info.autoReset` is true, and in
  r180 it resets after the shadow pass. Under `EffectComposer` (RenderPass + UnrealBloomPass's
  13 full-screen draws + OutputPass) New Hope's first `__nh.info()` therefore reported the
  OutputPass's one triangle (fixed 2026-10-14: `__game.perf()` counts the whole frame). **Rule:** `renderer.info.autoReset = false` and one `renderer.info.reset()` at the
  top of each presented frame; expose `perf()` returning a copy of `render` and `memory` plus
  `programs.length`, the tier and the DPR. r185 moved the WebGL reset before the shadow pass
  (#33688), so after an upgrade shadow draws are counted too; the per-pass reset remains.
- **Count draw calls and triangles, not milliseconds**, in any environment that is not the
  owner's pinned browser. Wall-clock drifts 33–42 ms run to run in sakura-crossing's logs;
  counts are stable on any renderer.
- **Feature flags with a strip order** (`__game.flags = { bloom, shadows, crowd, skyline, rain,
  traffic }`, strip "bloom → shadows → crowd → skyline") let a session bisect cost through one
  DevTools MCP call. GPU-bound or CPU-bound: set `scene.overrideMaterial = new
  MeshBasicMaterial()`; if the frame rate rises, it is the GPU.

Tools (all MIT): stats-gl 4.2.3 in dev builds (`init(renderer)`, `trackGPU` needs
`EXT_disjoint_timer_query_webgl2`); Spector.js 0.9.33 to capture one WebGL frame draw by draw;
Chrome DevTools MCP `performance_start_trace` / `performance_analyze_insight` on the host for
main-thread, GC and long tasks.

## Performance budgets

Starting points, **proposal** until measured on the owner's devices (which phone and laptop
count as "mid" is an owner call). Anchors: a 2021 Iris Xe laptop holds ≈2,500 separate-mesh
draws at 60 fps with nothing else running (ICS Media, r176) and a game gets 10–20 % of that; a
maintainer budget for phones of under 100 draws and 100 k vertices is widely quoted but
third-hand.

| Per frame, main + shadow + post | Desktop iGPU (M1, Iris Xe) | Desktop dGPU | Mid phone |
|---|---|---|---|
| Draw calls | ≤ 300 | ≤ 800 | ≤ 120 |
| Triangles | ≤ 1.5 M | ≤ 5 M | ≤ 400 k |
| Shader programs | ≤ 25 | ≤ 40 | ≤ 15 |
| CPU (JS + three) | ≤ 6 ms | ≤ 4 ms | ≤ 8 ms |
| Render scale (DPR cap) | ≤ 1.5 | ≤ 2 | 1–1.5 |

New Hope against them, from code: "the world" (9 opaque + ≤9 glass chunk meshes, 4 instanced
detail meshes, the sky, 1 instanced tower mesh of ≈18,000 instances, 3 instanced traffic
meshes, rain, beam, beacon) is about 30 draws. **People and cars are ≈95 % of the rest:** every
person is 11–14 separate meshes with 6–8 fresh materials, every car 20–22 meshes with 12–14
materials, all casting shadows, so 70 people plus the cars are roughly 800–1,000 meshes drawn
twice (main and shadow pass). That is survivable on a desktop and the first wall on a phone.

**Quality tiers (proposal):**

| Lever | low (phones) | mid | high |
|---|---|---|---|
| max DPR | 1.0 | 1.5 | 2.0 |
| MSAA (composer target) | off | off, FXAA | 4× |
| shadows | off, or 1024² every 4th frame | 1024², snapped | 2048², snapped |
| bloom | quarter-res input, 3 mips | half-res | as now |
| crowd / traffic | 30 / 120 | 50 / 220 | 70 / 320 |
| skyline | sectors within 900 m + impostor ring | sectors | sectors |
| rain drops (GPU) | 1,000 | 2,500 | 4,000 |

Pick the start tier from a coarse-pointer and screen heuristic, then adapt **both ways with
hysteresis** (down after 2 s above 20 ms per frame, up after 10 s below 12 ms; Threejs-Punk's
one-way drop never recovers, so do not copy that). Store the tier per device in `localStorage`
behind try/catch.

## Draw calls: instancing, batching, merging

- **One geometry, many copies → `InstancedMesh`.** 2–4 geometries → one `InstancedMesh` each.
  Many different geometries on one material → `BatchedMesh` (per-object frustum culling for
  free, but without `WEBGL_multi_draw` it loops one draw per object, and Firefox has no
  `WEBGL_multi_draw`). Static content on one material → merged geometry, the cheapest of all;
  New Hope's chunks already do this and that design stays.
- **The crowd becomes one `InstancedMesh` per body part** (legs, torso, head, hair, visor,
  arms, hands: about 8–12 draws for everyone), colour per instance with `setColorAt`, limb
  matrices composed on the CPU from root, phase and amount (70 × 12 `Matrix4.compose` is about
  0.1 ms). A body swap then rewrites two instances' colour rows instead of calling
  `buildPerson()`. The next step, when wanted, is one merged person with a `limb` attribute
  swung in the vertex shader: one draw, zero CPU. Kylo stays a normal `Group`. ≈800 draws →
  ≈16 including shadows.
- **Cars merge per kind:** static parts into one geometry with vertex colours
  (`mergeGeometries` + a `color` attribute) under one opaque material, emissive parts under one
  `MeshBasicMaterial` with vertex colours, the lightbar and the underglow pool as children.
  3–4 draws per car instead of ≈21. For many identical cars, `InstancedMesh` per kind, as traffic
  already is.
- **A material cache:** `Map<string, Material>` keyed on parameters, so equal materials are the
  same object and the same program (sakura's `cel()` cache). Variety goes into vertex or
  instance colours. This also cuts the program count and the warm-up time.
- **Generators as table rows:** a car kind or a person look is one row of numbers, and a session
  adds a van by adding data, not an `if (kind === …)` branch.
- **`castShadow` only where it shows:** not on glow parts, lights, thruster discs, pools or
  hands; not on people beyond ≈40 m.
- **Skyline:** split the one tower mesh into ≈8 × 8 sector meshes with bounding spheres and
  `frustumCulled = true` (a 62° camera then draws about a quarter). Do **not** just shorten the
  range: the fog-coloured silhouette band of the far towers against the pink horizon is the
  look. Beyond ≈800 m a one-cylinder impostor ring with a baked silhouette is cheaper.
- **LOD for a box city is per chunk** (near and far index ranges: railings, gear and glass only
  within ≈120 m) and per actor (no limb animation beyond ≈40 m, no people beyond ≈150 m).
  Octahedral impostors are not worth it for boxes.
- **Collision stays on the cell grid.** `blocksPoint`/`floorAt` are an exact O(1) spatial index.
  three-mesh-bvh (MIT) only when a shape is off the grid or instances need mouse picking.
- **Chunk streaming later:** generation and meshing move to a worker (`@whz/citygen` is pure)
  that transfers typed arrays; upload at most one chunk geometry per frame; measure `buildCity`
  first (under 50 ms for one district means there is nothing to do yet).

## Rendering and the look

### Renderer setup

- **Anti-aliasing has to live in the composer.** `antialias: true` on the renderer only
  multisamples the canvas, but `EffectComposer` renders the scene into its own
  `{ type: HalfFloatType }` target without `samples`, so the scene is aliased and the canvas
  MSAA (≈190 MB at DPR 2 on a 1512×982 window) is wasted. Rule: `antialias: false` on the
  renderer and `new EffectComposer(renderer, new WebGLRenderTarget(w, h, { type:
  HalfFloatType, samples: 4 }))` on the high tier only; FXAA/SMAA or nothing below.
- **Bloom is the neon look; make it cheap.** `UnrealBloomPass` runs 5 mips with kernels 3–11:
  13 full-screen-ish passes and 11 half-float targets, ≈140 MB of targets at DPR 2. Construct it
  with `resolution / 2` (it halves again inside), 3 mips on phones, tint toward the palette,
  keep the threshold high (0.86 today) so only intentional emitters bloom, cap the composer's
  DPR at 1.5 on desktop and 1 on phones. Emitters push over the threshold with emissive ×2.4–3
  and `toneMapped: false`, which works because the composer targets are half-float. Selective
  MRT bloom is a WebGPU/TSL thing: later. pmndrs/postprocessing (Zlib, 6.x) pays off only once
  three or more effects chain (bloom + LUT + grain) and it pins the three version.
- **Shadows:** one `DirectionalLight` with a 2048² map over 180 m (8.8 cm per texel) is fine,
  but (a) **snap the light target to the shadow texel grid in light space** or the shadows swim
  as the camera moves; (b) **split static and dynamic**: city chunks and gear in a map with
  `autoUpdate = false` refreshed when the snapped centre moves more than ≈8 m, actors with a
  blob (an instanced dark disc under each, which the cars' underglow pool already is); (c)
  `PCFShadowMap`, not `PCFSoftShadowMap`; (d) on phones, shadows off, baked AO and blobs on.
  Skip CSM until there is a daytime district (owner question).
- **Bake vertex AO at chunk-build time.** Exact on a cell grid (the 0fps rule: `side1 && side2
  ? 0 : 3 − (side1 + side2 + corner)` per quad corner, flip the diagonal when `ao0 + ao2 < ao1
  + ao3`). `GeometryBuilder.face` already knows the neighbours. The biggest look gain per line
  for a blocky night city, at zero runtime cost.
- **Depth:** `near 0.1`, `far 6000` is a 60,000:1 range on coplanar slabs; use `near 0.25`.
  `reversedDepthBuffer` already exists in r180 and can be evaluated now.
- **One `SUN_DIR` constant**, not a light direction set in `addLights` and then overwritten by a
  literal every frame.
- **Lights count on every lit fragment on WebGL:** keep ≤ 4 real lights. A light inside a
  `visible = false` group is not counted by the renderer, so the first time it appears every lit
  material recompiles mid-game (New Hope's body-pass `PointLight`): keep lights in the scene at
  intensity 0, or use an additive sprite.
- **Warm up shaders behind the start screen:** make the cruisers, the beam and the rain visible
  once, `await renderer.compileAsync(scene, camera)`, hide them again. (`compileAsync` did
  nothing for one user's `InstancedMesh`; verify in the browser.)
- **Textures generated in code stay `CanvasTexture`/`DataTexture`** built at load from the
  seed (graphics are code). The 512² atlas pair is ≈2.8 MB with mips; KTX2 only matters past
  2048². Give atlas tiles a 4–8 px extruded gutter, or use a `DataArrayTexture` with one layer
  per tile: a 0.5-texel inset at mip 0 bleeds neighbouring tiles on distant walls under
  `LinearMipmapLinearFilter`.
- Prefer `renderer.setAnimationLoop` and `THREE.Timer` (in core since r179) over a hand-rolled
  rAF plus `performance.now()`; equivalent today, required for WebXR and WebGPU later.

### The look

The No Man's Sky look is a rule system plus a review loop, not a shader: no black, 1970s sci-fi
covers as the reference, complementary accent pairs, coloured fog tying the far geometry to
the sky, faceted shading, big sky objects, and drones that record GIFs of generated planets for
review so that a bad result changes a *rule*. That is our verdict loop already. The cheap wins,
none of which needs WebGPU (**proposal**, prioritised in
[research/threejs-procgen-look.md](../../research/threejs-procgen-look.md) "What this means for us"):

1. **A seeded look preset is an asset.** IQ's cosine palette `a + b·cos(2π(c·t + d))` with
   the seed picking `d` and `c`; fixed `t` slots for zenith, horizon, fog, key, fill, neon A and
   neon B = A's complement (150–180° apart); fog density and height; three light colours and
   intensities; bloom tint; a 32³ grade LUT written in code (`LUTPass` exists in 0.180). Lints
   on the preset data, run in the gate without a GPU: fog luminance ≥ 0.04 linear and
   saturation ≥ 0.3, a tinted shadow floor, the dome's horizon colour equal to the fog colour
   (today `#d8437e` vs `#3a1c5c`, so far towers end in a violet wall under a pink band). The
   studio shows swatches, the LUT strip and six fixed shots per seed; the owner gives verdicts.
   Whether one look per district seed or one hand-picked New Hope look is an owner question.
2. **Height fog, tinted toward the gas giant**, one GLSL function (IQ's analytic height fog and
   sun-tinted fog) shared by the dome and every material through a `ShaderChunk` override
   (`fog_pars_fragment`, `fog_fragment`, plus a world-position varying threaded through
   `fog_vertex`; untested on 0.180). The undercity drowns in coloured haze, the Union levels sit
   in clear air.
3. **Rebalance the rig to IQ's outdoors rule:** key ≈ 1.0–1.5 with a penumbra tint, sky fill
   ≈ 0.2, bounce ≈ 0.3 from the anti-sun direction, albedo ≈ 0.2. Today hemisphere 0.9 + ambient
   0.6 against key 1.6 flattens the image toward grey. Try `AgXToneMapping` or
   `NeutralToneMapping` (both in 0.180) against ACES on the neon, which ACES pushes to white.
4. **Neon baked into chunk vertex colours** (Σ sign colour × intensity / (1 + d²/r²) × max(0,
   n·toSign) over signs within ≈12 m, at build time, integer-friendly, deterministic) plus
   instanced additive ground pools under signs. Light probes do not emit light and WebGL has no
   tiled lighting; this is the classic static bake.
5. **Mirrored emitters on wet ground** instead of SSR: one extra instanced draw of every sign
   mirrored about its floor, stretched ×2–3, alpha by wetness, UV-wobbled by a clean-room
   ripple noise, masked by world-space puddle noise. (`SSRPass` does exist for WebGL in 0.180,
   but Threejs-Punk removed SSR for cost, and the fake is cheaper still.)
6. **GPU rain:** a static buffer of per-drop seeds, position computed in the vertex shader
   (`y = top − mod(seed·H + t·speed, H)`, x/z wrapped around the camera's cell, hashed in world
   space so camera motion does not change a drop's phase), streaks stretched by velocity. Zero
   CPU and no 96 KB upload per frame; 20–50 k drops become affordable. Rain stops under roofs
   with a per-column `top[x + z·w]` height built once from the grid. **Write it ourselves:**
   Threejs-Punk's rain is CC BY-NC-SA ([research/README.md](../../research/README.md#licence-flags)).
7. **Skyline grammar:** podium → 1–3 setback tiers (70–90 % each) → crown type, still a handful
   of instanced unit parts; recursive-OBB lots instead of a fixed 22 m grid; interior-mapped
   windows (≈15 lines of GLSL, ray-box in tangent space; three-fenestra is MIT reference only)
   on the near ring.
8. **Sky shader:** an integer hash for stars instead of `fract(sin(dot())·43758.5453)`, a
   domain-warped fBm nebula in palette colours instead of a product of three sines.
9. **Rim light** (`pow(1 − n·v, 3) · rimColour` into emissive) in the fog's complement keeps
   people and cars readable against bright fog; hue-shift the shadow band toward the palette.
   NMS has no outlines; keep lit flat shading (`flatShading: true`, already on the models).

Rule across all of it: **the look tier never feeds gameplay.** Shader hashes, skyline heights
from `Math.pow`/`Math.hypot` and rain phases are float noise and stay out of anything a digest
or a collision test reads ([procgen.md](procgen.md) "Two tiers"; New Hope's skyline collision
currently reads those float heights, harmless until the motion is digested).

## Gameplay systems

- **No physics engine yet.** The voxel grid beats a general broadphase for walking, flying and
  the camera. Add Rapier (Apache-2.0, 1.17 MB gz wasm, 0.21.0) only for *cosmetic* debris,
  ragdolls or car-vs-car impulses, fed a coarse static collider set; Jolt (MIT, 0.74 MB gz) is
  smaller but its manual `Jolt.destroy` rules leak in agent-written code; cannon-es has been
  dead since 2022. Whether a wasm dependency is allowed is an owner question.
- **The walker stays a probe walker** (12 points, radius 0.32, ramps from `floorAt`). Add coyote
  time (≈0.1 s), jump buffering (≈0.1 s) and snap-down on ramp crests: 20 lines, not a library.
- **The hover car stays arcade** (GTA cars are arcade too). Replace the hard floor clamp with a
  PD hover spring on nose and tail probes toward a ride height of 0.6–1.0 m, so pitch follows
  ramps and landings compress; derive bank and pitch from lateral and longitudinal
  acceleration, not from `yawRate` and `vel.y`. Car-vs-car with sphere pairs and a spatial hash.
- **Third-person camera:** probe five rays (centre + four near-plane corners, as camera-controls
  does) against the grid with a 3D DDA cell walk (≈8 cells instead of ≈122 point samples);
  **asymmetric smoothing** (snap inward at once, ease out over 0.3–0.5 s, never show the inside
  of a wall); in the car, look-ahead by `vel · 0.25 s` and an FOV kick 62° → ≈72° with speed,
  `updateProjectionMatrix` only when the change exceeds 0.1°. Keep the auto-recentre after
  1.2 s idle.
- **An action map, not key codes.** `actions.value("move.forward")` /
  `actions.pressed("vehicle.enter")` filled by keyboard-mouse, gamepad (standard mapping: axes
  0/1 and 2/3, triggers 6/7 as `.value`, radial deadzone ≈0.15, polled each frame, no retained
  references) and touch (`touch-action: none`, a left stick, right-half drag look, 3–4 context
  buttons, pinch zoom) adapters; bindings in data; the HUD help rendered from the bindings.
  Pointer lock does not exist on iOS Safari or Chrome Android, so without touch the camera
  cannot be steered there at all. `requestPointerLock({ unadjustedMovement: true })` gives raw
  mouse input; listen for `pointerlockerror`; scale the wheel by `deltaY` and `deltaMode`
  (a `Math.sign` zoom is far too fast on a trackpad). Zero of PixelDen's 54 games read a gamepad;
  it matters for desktop and TV wrappers.
- **One `Juice` module driven by events**, never inline in physics: trauma shake (`shake =
  trauma²`, decay 0.5/s, rotation-first in 3D at ≈2–3° yaw/pitch and 4° roll), hit stop of
  50–100 ms as skipped sim steps, FOV burst on boost, time dilation on body-passing, rumble
  (`vibrationActuator.playEffect("dual-rumble", …)`, throws when hidden), a flash. A settings
  toggle and a 0–100 % slider for shake.
- **State machines:** a pushdown game-mode stack (`play → pause`, `play → cutscene(busted) →
  play`, `play → map`), each mode owning input routing and the time scale; small enums for Kylo
  (`onFoot | inLift | driving | passing`) and a police unit (`patrol → respond → pursue →
  search → return`); missions as **data** (`goto`, `pickup`, `deliver`, `evade(stars)`,
  `timer`) with a tiny interpreter. XState is overkill for linear jobs. No ECS below ≈10 entity
  kinds; if ever, koota (ISC), not bitECS for copied code (MPL-2.0 file-level copyleft).
- **Police and crowd AI:** Reynolds steering (pursuit with prediction, separation within ≈12 m,
  offset slots so 4–6 cruisers box the player in instead of stacking, three feelers steering
  sideways before climbing); **perception = distance within R(stars) and a DDA line of sight and
  a 120° cone** instead of "within 90 m"; a last-known position and a search circle, with the
  cool-down running only while unseen and outside the circle; an escalation table as data.
  Navigation on the grid: A* on walkable cells for agents, a flow field for crowds; recast is
  good (MIT, 131 KB gz) but rebuilds what citygen already knows. Simulation LOD: promote the
  nearest 8–16 flyers and a few dozen pedestrians to full agents, keep the rest instanced
  tracks.
- **Saves are versioned JSON** pinned to `{ generator id, version, seed }` plus deltas
  ([procgen.md](procgen.md) rule 6), a few KB in `localStorage` behind one wrapper
  (5 MiB per origin, `QuotaExceededError`), IndexedDB via idb-keyval (Apache-2.0) only when they
  grow, native storage in wrappers. Settings under a separate key: volume buses, shake %, FOV,
  invert-Y, sensitivity, bindings, quality tier.

## Procedural content

The rules for seeds, units, streams, versions and golden hashes are on [procgen.md](procgen.md)
and are not repeated. For a Three.js game they mean: the district comes from `@whz/citygen`
(integer, under the determinism lint, invariants checked over 200 seeds) and that stays the
core; WFC would fight those invariants and is at most a facade-module picker; the skyline is the
weakest generator today (hashed-height boxes) and gets the grammar above; a play-level check
that the 3D walker can actually walk what citygen calls walkable is missing (see
[testing.md](testing.md)). The `N` key picks `Math.random()` seeds, so a good district is lost
unless the URL is copied: `hash32(seed, 1)` makes "next" reproducible, and a seed browser in the
studio (orbit shots plus `formatStats` per seed) is the NMS drone loop for districts.

## Audio

New Hope synthesises everything in WebAudio (`audio.ts`: a drone of 10 detuned saws, a pad,
wind, rain, an engine, a siren, a 3 s stereo convolver, cues). Rules and proposals:

- **Buses:** master → {music, sfx, ambience, ui} gains plus a compressor on master; settings
  sliders map to bus gains; duck music when the wanted level rises; sidechain the siren under a
  crash.
- **Suspend, don't just mute.** `ctx.suspend()` on mute and on `document.hidden`, `resume()`
  on the next gesture; handle Safari's `interrupted` state. Today mute only ramps the master
  gain and the convolver keeps processing in a hidden tab.
- **Update parameters from the presentation side at 20–30 Hz**, never per sim step (eight
  `setTargetAtTime` per frame today, multiplied by `advance()`).
- **Allocate buffers once** (one noise buffer at start; `crash()` fills a new 0.4 s buffer per
  crash today).
- **Voice budget ≈24–32**, stolen by priority × loudness. Six sirens: play the two nearest
  positionally and fold the rest into one non-positional bed whose gain follows the stars.
  `PositionalAudio` defaults to HRTF, which is expensive: HRTF for 1–3 hero sources,
  `equalpower` for the rest; `inverse` distance with `refDistance ≈ 10 m` for cars. Place the
  listener between camera and player so a zoomed-out camera does not quieten Kylo's own car.
  Doppler was removed from Web Audio: fake it with detune from closing speed.
- **One-shot cues as `@whz/audio` SFX files (proposal, owner question):** chime, fail, whoosh
  are exactly "SFX as named parameters"; rendered by the deterministic synth, they become assets
  the studio shows and the owner reviews ([docs/audio.md](../audio.md)). The live drone, engine
  and siren stay parameter-driven WebAudio code. Howler adds nothing to a synth-everything game.
- Seed the reverb IR and noise with `@whz/det` so audio matches the repo's philosophy (optional;
  audio never enters a digest).

## Mobile and wrappers

Not started for New Hope: no touch input, no quality tiers, no `viewport-fit=cover`, fixed-px
HUD without safe-area insets, no `webglcontextlost` handler. The action layer makes touch an
adapter rather than a rewrite; the tier table above sets the low-end budget. Whether the first
mobile target is Capacitor or the mobile browser is an owner question; the wrapper pipelines
are in [research/shipping-wrappers-2026.md](../../research/shipping-wrappers-2026.md).

## Checklist for a session

Before touching a Three.js game:

- [ ] Read the package README's file table and its `__nh`/`__game` list; read the trap table.
- [ ] Decide which module the change belongs to (`world`, `sim`, `render`, `ui`, …) and keep
      the import rules (no three scene classes in `world/` or `sim/`).
- [ ] If it adds a tunable or a string, it goes to `games/<id>/data` or `locales`, not a literal.

While building:

- [ ] Nothing new is allocated per frame; no `Math.random`, `performance.now()` or timers in
      gameplay; the DOM is written only on change.
- [ ] Every new mesh class answers: instanced or merged? one material from the cache? casts a
      shadow for a reason? disposed on removal?
- [ ] A new shader feature is one GLSL function in one file; a string patch asserts it applied.
- [ ] A new system has a seeded stream, an enum state machine if it has modes, and emits
      events for juice and audio instead of calling them.
- [ ] New constants that should be data are data.

Before saying done:

- [ ] `perf()` with `autoReset = false` at the fixed poses is within the budget table, or the
      report says by how much it is over and why.
- [ ] `memory.geometries` and `memory.textures` are unchanged after ten spawn/despawn cycles of
      whatever the change spawns.
- [ ] The scripted checks in [testing.md](testing.md) pass; the renderer string is logged.
- [ ] If shared code changed an approved asset's output, the report lists the assets.
- [ ] `./dev npm run check` passes.

## Further reading

- [research/new-hope-audit.md](../../research/new-hope-audit.md): every finding with
  `file:line`, severity and fix; the prioritised upgrade list; the proposed layout.
- [research/threejs-architecture-perf.md](../../research/threejs-architecture-perf.md):
  budgets, instancing vs batching, LOD, culling, streaming, BVH, GC, profiling, WebGPU and
  TSL status, shadows, bloom, KTX2, frame pacing, warm-up.
- [research/threejs-lessons-from-refs.md](../../research/threejs-lessons-from-refs.md): the
  45-technique catalogue with licences and priorities; code patterns for `__shot`, texel
  snapping and vertex AO.
- [research/threejs-gameplay.md](../../research/threejs-gameplay.md): physics options with
  measured sizes, controllers, camera, input APIs, juice numbers, ECS and state machines,
  audio, steering and navigation, the GTA-like web examples.
- [research/threejs-procgen-look.md](../../research/threejs-procgen-look.md): the NMS rules,
  sky and atmosphere options, fog formulas, neon on WebGL, reflections, city grammars, voxel
  meshing, procedural textures, stylised shading, weather.
- [research/ref-threejs-punk.md](../../research/ref-threejs-punk.md),
  [research/ref-sakura-crossing.md](../../research/ref-sakura-crossing.md),
  [research/ref-voxel-musou.md](../../research/ref-voxel-musou.md): the reference repos.
- [testing.md](testing.md): the test protocol. [procgen.md](procgen.md): seeds and generators.
  [docs/sim.md](../sim.md): the deterministic sim contract the data games use.
