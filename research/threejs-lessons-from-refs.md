# Three.js lessons from the reference research, checked against New Hope

*Research date: 2026-10-14. Status: proposal only.*

Legend: **[S]** sourced (link or `path:line` inline), **[O]** my opinion, **[U]** unverified.
"New Hope" means `packages/new-hope-play/src` at commit `cd3edde`. All URLs are repeated in
Sources at the end.

## 0. What this builds on, and what it corrects

This report distils, and does not repeat, the deep reports
[ref-sakura-crossing.md](ref-sakura-crossing.md), [ref-threejs-punk.md](ref-threejs-punk.md),
[ref-voxel-musou.md](ref-voxel-musou.md), [ref-nms-procgen.md](ref-nms-procgen.md),
[voxels.md](voxels.md), [game-creator.md](game-creator.md) and
[code-graphics.md](code-graphics.md) (all 2026-10-02). It also reads the owner's Vellum notes
`projects/grafika-reference/` (index, `plan-voxel-hra`, `analyzy/01`–`04`, all 2026-09-24).
Those reports were written for a pixel-art voxel planet. D30 (2026-10-13) changed the target:
New Hope is real-time, full-resolution 3D in Three.js with a No Man's Sky look and bloom
([docs/DECISIONS.md](../docs/DECISIONS.md)). Several "drop at pixel resolution" verdicts in the
earlier reports (FXAA/SMAA, inverted hulls, bloom, supersampling) **are live options again for
New Hope** [O]. The pixel-art matrices in those reports still hold for the Kairosoft sims.

Corrections and updates found while checking:

- **The Vellum analysis notes are stale** [S]: all four are still `status: backlog` with `_TODO_`
  sections. Their README-level figures were superseded by the repo reports: voxel-musou is
  102 files / 25,818 lines, not "32 files, ~9,300" (`ref-voxel-musou.md` §1); Threejs-Punk's
  ripples are 3×3 cells, not "5×5" (`ref-threejs-punk.md` §3.2); sakura's terrain lattice is
  1.5 m, not 3 m (`ref-sakura-crossing.md` §1.1). The Vellum index's "Průřezové srovnání"
  (cross-cutting comparison) is still TODO; §1 below is that comparison. I did not write to
  Vellum.
- **three.js dates** [S]: 0.186.0 was published 2026-09-08 and 0.186.1 on 2026-09-24 (npm
  registry). `ref-threejs-punk.md` §6.1 gives "r186 (2026-09-24)", which is the patch release.
  New Hope pins `three ^0.180.0`, which a 0.x caret limits to 0.180.x (0.180.0: 2025-09-03).
- **Reference repos since the analyses** [S] (GitHub API, 2026-10-14): sakura-crossing is still
  the single commit `de01898`; threejs-conference is still at `8cc2059`; voxel-musou has one later
  commit `aba5fb8` (2026-10-03) that touches only `README.md` and `media/`. The code findings
  stand. Licences are unchanged: MIT for all three repos' code. Threejs-Punk's rain shaders are
  still CC BY-NC-SA ([research/README.md](README.md#licence-flags)).

## 1. Catalogue of techniques

Priority for New Hope: **A** = do now (cheap, high value), **B** = when the feature grows,
**C** = later or for future games. "Borrow" means re-implement. Copying code is fine only where
the licence column says MIT. Even then a rewrite in TypeScript is usually simpler.

### 1.1 Rendering and look

| # | Technique | From (licence) | Applies to New Hope | Prio |
|---|---|---|---|---|
| R1 | **Bake geometry per material, one atlas, one material.** Collect parts per material slot, merge once, emit one mesh per slot. | sakura `src/core/util.js:46-74` `bake()`, `shops.js:369-379` (MIT) [S] | Already done for the city: 9 chunk meshes on one atlas material (`city.ts:120-273`) [S]. **Not done** for people and cars (§2.2). | A |
| R2 | **Cached material factory**: equal params return the same material object, so programs and state are shared. | sakura `toon.js:108-132` `cel()` cache (MIT) [S] | `models.ts:6-9` `std()`/`glow()` create new materials on every call, so each person gets 3–4 fresh materials and each car 6–8 [S] [refuted 2026-10-14: undercounted. `buildPerson` makes 6–8 (coat, skin, trousers, one shoe material per `mkLeg` call, hair or visor shell plus visor glow, optional accent glow); `buildCar` makes 12–14 (shell, dark, glass, four pod glows in the loop, head, tail, two strips, taxi/cruiser extras, the pool). The point stands: nothing is shared.]. A `Map<string, Material>` keyed on params fixes it [O]. | A |
| R3 | **Vertex AO baked at meshing time**: 3 neighbour samples per quad corner, plus a quad flip when the AO is anisotropic. | voxel-musou `src/core/voxel.js:64-124` (MIT) [S] [refuted 2026-10-14: at `26ea581`, `voxel.js:64-124` is the plain exposed-face mesher `voxelGeometry()`/`sculpt()` with no AO; the builder at `voxel.js:17-24` only accepts a baked per-corner `k` and a `flip`. The AO sampling, the 4-level `AO[]` table and the flip rule `lv[0]+lv[2] < lv[1]+lv[3]` are in `src/hero/model.js` `vox()` (≈`:32-72`), as `ref-voxel-musou.md` §1 also cites. Whether it samples 3 or 4 neighbours per corner is [unconfirmed]: our ref report says "4 AO neighbour tests per corner".]; algorithm from Lysenko's 0fps post (2013) [S] | The city grid is exactly a voxel grid, and `GeometryBuilder.face` already knows the neighbours (`city.ts:137-139`) [S]. AO in a `color` attribute would ground buildings, decks and street corners at no runtime cost [O]. | A |
| R4 | **Shader patches must assert they applied.** Sakura's toon patch is an exact string replace that silently turns off when three.js moves the line. | `ref-sakura-crossing.md` §3.2 "Fragility" [S] | `sky.ts:185-221` patches `#include <common>`, `<begin_vertex>` and `<emissivemap_fragment>` with `.replace` and never checks the result [S]. A three.js bump would silently drop the windows and neon bands [O]. Fix: `if (!out.includes("vTower")) throw` in dev. | A |
| R5 | **Emissive-only (selective) bloom.** Bloom reads only an emissive MRT attachment. | Threejs-Punk `postprocessing.js:113-163` (MIT, WebGPU/TSL) [S] | New Hope uses `UnrealBloomPass` with threshold 0.86 on the whole frame, and pushes neon above 1.0 with `toneMapped:false` plus `multiplyScalar` (`main.ts:99`, `city.ts:291`) [S]. That works because `EffectComposer` targets are HalfFloat in r180 [S]. MRT bloom needs WebGPU/TSL or a layer-based two-pass setup in WebGL [O]; not worth it yet. | C |
| R6 | **Look presets as uniforms, lerped** (time of day, weather, district). No recompile. | Threejs-Punk `cyberpunkLook.js:104-265`, `lerpPreset` (MIT) [S]; voxel-musou `setLook()` `post.js:250-258` (MIT) [S] | New Hope has one `PALETTE` (`sky.ts:9-14`) and a hard-coded light rig [S]. A `Look` object (sky colours, fog colour and density, light colours, bloom strength) lerped by storm amount and by band (undercity vs sky) is cheap atmosphere [O]. | B |
| R7 | **Anti-aliasing has to live in the composer.** | three r180 `EffectComposer.js:69` creates `new WebGLRenderTarget(w, h, { type: HalfFloatType })` with no `samples` [S] | `main.ts:26` asks for `antialias: true`, but every frame goes through the composer's non-MSAA target, so **the 3D scene is not anti-aliased** and the canvas MSAA buffer is wasted [S]. Fix: pass `new THREE.WebGLRenderTarget(w*pr, h*pr, { type: THREE.HalfFloatType, samples: 4 })` to `EffectComposer`, or add an SMAA/FXAA pass after the `OutputPass` [O]. | A |
| R8 | **Shadow camera snapped to its texel grid** (otherwise shadows swim as the box follows the player). | Open question in `ref-sakura-crossing.md` §6 q4 (the comment says "snapped", the code does not) [S]; standard practice [U] | `main.ts:171-172` moves the 180 m × 2048 px shadow box with the target every frame without snapping [S]. Texel = 180/2048 ≈ 8.8 cm [S, arithmetic]. Snap the target in light space to that step [O]. | A |
| R9 | **Static vs dynamic shadow budget**: `shadowMap.autoUpdate = false` plus `needsUpdate` on demand. | Threejs-Punk `createRenderer.js:44-47` (MIT) [S]; three r180 `WebGLShadowMap.js:66-75` [S] | Not directly usable: Kylo, cars and the crowd move. A useful variant is "no `castShadow` on glow parts, lights and far crowd" [O]. Every primitive in `models.ts:14` casts a shadow, including the emissive light bars [S]. | B |
| R10 | **Sky dome pinned to the far plane** (`gl_Position = p.xyww`) and following the camera. | Threejs-Punk `cloudsMaterial.js:48-53` (MIT) [S] | Already done (`sky.ts:35`, `main.ts:173`) [S]. | done |
| R11 | **Canvas2D texture factories** (`make` + `cached`), no image files. | sakura `textures.js:16-75` (MIT) [S] | Already done: one 8×8 atlas of 64 px tiles plus an emissive twin, from a seeded RNG (`textures.ts`) [S]. | done |

### 1.2 Procedural generation from seeds

| # | Technique | From (licence) | Applies to New Hope | Prio |
|---|---|---|---|---|
| P1 | **World = f(seed, position), via stateless integer hashes, never call-order PRNGs across units.** | NMS GDC 2017 (McKendrick 31:52); Eiserloh GDC 2017; `ref-nms-procgen.md` §3.1 [S] | Followed: `@whz/citygen` is integer-only under the determinism lint with `gridHash` [S] (`packages/citygen/README.md`), and `hash3` uses `Math.imul` (`world.ts:118-123`) [S]. | done |
| P2 | **Gameplay generation on the CPU only; GPU hashes (`fract(sin())`) for looks only.** | `ref-nms-procgen.md` §3.1 rule 1; `ref-threejs-punk.md` §5.1 [S] | Followed: windows and stars use the GPU hash (`sky.ts:41, 200`), skyline collision uses CPU `hash3` [S]. Small leak: skyline heights use `Math.pow` and `Math.hypot` (`sky.ts:151-152`), which MDN calls implementation-dependent, and they feed `world.outside` collision [S]. That is harmless while motion is not digested (README "How it is built") [S], but it breaks once New Hope gets a sim digest [O]. | C |
| P3 | **Generators as table rows**: a kind is one row of numbers; everything else is derived. | sakura `vehicles.js:136-223` `SPEC` (MIT) [S]; voxel-musou `castle.js` builders `(rng, params) → boxes[]` (MIT) [S] | Cars are three `if (kind === …)` branches in `buildCar` (`models.ts:123-174`) [S]. A `CAR_SPEC` row per kind (length, width, cabin, pods, colours, extras) would let a session add a van, a bus or a gang car by adding data [O]. The same goes for `PersonLook` (already half data) [O]. | B |
| P4 | **Executable invariants per generator** (`check*()` that returns numbers; a failure is a bug, not a reason to reroll). | sakura `hillSafety`, `lakeLeakCheck` (MIT) [S]; NMS smoke flights [S] | Followed at grid level: `checkDistrict` proves on-foot connectivity, stair landings and that pads reach lanes, over 200 seeds [S]. **Missing at play level**: nothing checks that the 3D walker (`actors.ts:58-75` railings, radius 0.32, three probe heights) can actually walk what citygen calls walkable [S/O]. Sakura's lesson "walkable equals visible, to the bit" (`hills.js:1781-1817`) [S] [refuted 2026-10-14: the sentence is in the module header, `hills.js:77-78` ("the walkable surface and the drawn surface are the same surface, to the…"); `:1781-1870` are the field queries that implement it]. | A |
| P5 | **Version the generator; pin saves to it.** | NMS Foundation 2016 / Worlds II 2025 (`ref-nms-procgen.md` §1.1) [S] | No saves yet. When jobs and credits persist, store `{ citygenVersion, seed }` with them [O]. | C |
| P6 | **A seed browser** (contact sheet of seeds, metrics, bookmarks). | `ref-nms-procgen.md` §4.3 [S] | `?seed=` and the N key exist (`main.ts:24, 283`) [S]. N uses `Math.random`, so a found "good district" is lost unless the URL is copied [S/O]. With `__shot` (§1.6), a studio page could show seeds 1..N as orbit shots plus `formatStats` [O]. | B |

### 1.3 Crowds, instancing, draw calls

| # | Technique | From (licence) | Applies to New Hope | Prio |
|---|---|---|---|---|
| C1 | **One `InstancedMesh` per body part**, hierarchical matrices on the CPU, colour per instance. 300–2000 soldiers at a constant draw count. | voxel-musou `crowd/view.js:410-432, 632-717` (MIT) [S] | The crowd is 70 separate `Person` groups of 11–13 meshes each (`traffic.ts:129-147`, `models.ts:40-88`), so about 780 draw calls for the crowd alone, plus shadow-pass draws [S for the counts from code, U for the frame cost: not measured]. Per-part instancing (legs, torso, head, arms, visor, hair) brings this to about 10 draws and allows a crowd of 500+ [O]. A body swap then just rewrites `instanceColor` rows, without rebuilding meshes (`traffic.ts:180-205`) [O]. | A |
| C2 | **Instanced vehicles with emissive parts as separate instanced meshes.** | voxel-musou pools; threejs-perf "8,000 entities → 1 draw" (`game-creator.md` §6.2, numbers unreproducible) [S] | Followed for sky traffic: 320 flyers in 3 instanced meshes (`traffic.ts:75-82`) [S]. Not for parked and police cars (≈20 meshes each, `models.ts:123-174`) [S]. | B |
| C3 | **LOD by re-voxelising the same parts coarser; impostor boxes far away.** | voxel-musou `view.js:181-217` (MIT) [S] | Crowd members beyond about 40 m could drop to a 1-box body, and sky traffic beyond 300 m to a light streak [O]. | C |
| C4 | **Idle replay and staggered updates**: recompute far or idle agents every Nth frame. | voxel-musou `view.js:632-652` (MIT) [S] | `Crowd.update` animates all 70 every frame (`traffic.ts:209-237`) [S]. Cheap now; it matters at 500+ [O]. | C |
| C5 | **Exact culling of moving instances.** | three r180 `InstancedMesh.computeBoundingSphere()` covers all instances [S] | New Hope sets `frustumCulled = false` on traffic, skyline and rain (`traffic.ts:81`, `sky.ts:224`, `fx.ts:32`) [S]. Correct for the skyline and rain, which surround the camera [O]. | — |
| C6 | **`BatchedMesh`** for many different static props on one material, with per-object culling. | three r180 `BatchedMesh.js:211` `perObjectFrustumCulled = true`, `addInstance` [S] | A candidate for parked cars and rooftop gear of mixed shapes once they become varied [O]. | C |
| C7 | **Dispose what you remove.** | `game-creator.md` §6.2 hygiene rules [S] [refuted 2026-10-14: the hygiene rules are item 6 of §6.5, not §6.2] | `grep dispose src/` returns nothing [S]. `Police.update` drops cruisers with `group.remove` (`police.ts:65, 135-137`), and `Crowd.swap` / `Walker.setLook` rebuild people (`traffic.ts:180-205`, `actors.ts:38-48`) [S]. Each heat cycle or body pass leaks geometries and materials [S from code; growth not measured]. `renderer.info.memory.geometries` would show it. | A |

### 1.4 VFX and weather

| # | Technique | From (licence) | Applies to New Hope | Prio |
|---|---|---|---|---|
| V1 | **Toroidal precipitation volume around the camera.** | Threejs-Punk `createCollisionRain.js:139-158`, adapted from the MIT three.js example `webgpu_compute_particles_rain` [S] | Followed on the CPU: 4,000 line segments in a 70 m box wrapped around the camera, speed × dt (`fx.ts:7-80`) [S]. It is better than Punk's per-frame velocity. | done |
| V2 | **Occlusion heightfield so rain stops under roofs and splashes on top.** Punk renders it from a top-down ortho pass; for voxel worlds, build it from column data. | Punk `createCollisionHeight.js` (MIT); `ref-threejs-punk.md` §5.1 "build the occlusion heightfield from voxel data" [S] | Today rain falls through decks, walkways and into the undercity halls (`fx.ts` never asks the world) [S]. From the citygen grid: `top[x + y*w]` = the highest opaque or floor level per column, a `Float32Array(48*48)` built once; a drop below `top` in its column respawns, and that column gets a splash [O]. | B |
| V3 | **Stateless sprite particles** (life = f(time, instance)) for smoke, steam vents, sparks. Zero CPU. | Punk `createSmoke.js:43-90` (MIT, TSL) [S] | In WebGL, one `InstancedMesh` of quads with a vertex shader driven by `time` plus a per-instance seed attribute [O]. Steam from undercity grates, sparks on crashes [O]. | B |
| V4 | **Generic debris clump coloured from the victim's palette.** | voxel-musou `vfx.js:44-71` (MIT) [S] | Car crashes produce sound and heat only (`main.ts:255-258`) [S]. A pooled clump burst in the car's paint colour on impacts above 24 m/s [O]. | B |
| V5 | **Pools compacted so `count = live`.** | voxel-musou `vfx.js:508-599` (MIT) [S] | Needed as soon as V3/V4 exist [O]. | B |
| V6 | **Rain shaders on glass and car paint, ripple normals.** | Punk `surfaceRain.js`, `rainGlass.js`, `rainRipples.js` | **Do not copy: CC BY-NC-SA** (via rocksdanister/rain, BigWings; ripples match Zavie's Shadertoy) [S] [unconfirmed: the CC BY-NC-SA flag comes from `research/README.md`, which lists `surfaceRain.js` and `rainGlass.js` only; `surfaceRain.js:19-20` credits rocksdanister/rain and BigWings but carries no licence text, `rainRipples.js` has no attribution at all, and GitHub reports rocksdanister/rain's licence as "Other". The "do not copy" advice is the safe reading; the exact licence of each of the three files was not verified from a licence file]. A wet look by lowering roughness and darkening albedo by `rain.amount` needs none of it [O]. | — |

### 1.5 Game feel

| # | Technique | From (licence) | Applies to New Hope | Prio |
|---|---|---|---|---|
| G1 | **Camera micro-kicks fired by events and aged in sim frames.** | voxel-musou `camera/camera.js:138-154` (MIT) [S] | Crashes (`actors.ts:238-248` computes `impact`) have no camera response [S]. A kick of `impact / 40` × 0.3 m decaying over 0.25 s [O]. | A |
| G2 | **Data-driven hitstop** (1–4 frames scaled by weight). | voxel-musou `combat.js:85-95` (MIT) [S] | New Hope has no combat yet. A 2–3 frame stop on hard crashes and on the arrest would sell weight [O]. | B |
| G3 | **Audio cues that lead the event; sidechain ducking.** | voxel-musou `audio.js:140-187` (MIT) [S] | The siren and the crash share one mix without ducking (`audio.ts`) [S/O]. | C |
| G4 | **Speed reads**: FOV widening, streaks and engine pitch with speed. | [O] (not from the references) | Boost (R, ×1.8 thrust, `actors.ts:210`) changes only the thrust; FOV 62° is fixed (`main.ts:36`) [S]. +8° FOV at boost is one line [O]. | A |
| G5 | **Camera clearance against the world SDF/grid.** | voxel-musou `camera/occlusion.js` (MIT) [S] | Followed: a 0.25 m ray march against `blocksPoint` pulls the camera in (`main.ts:158-168`) [S]. It snaps instead of easing back out [S]; a 0.2 s ease out would remove pops [O]. | B |
| G6 | **Fixed 60 Hz accumulator; render reads sim state; at most 4 steps per frame.** | voxel-musou `main.js:274-285` (MIT) [S] | Half followed: `advance()` steps at exactly 1/60 (`main.ts:373-377`), the live loop uses variable dt clamped to 0.05 s (`main.ts:326-333`) [S]. Unifying both on an accumulator makes scripted runs and live play the same code path [O]. | B |

### 1.6 Self-checks and the test protocol

| # | Technique | From (licence) | Applies to New Hope | Prio |
|---|---|---|---|---|
| T1 | **`POST /__shot` Vite dev plugin plus `window.__shot(name, w, h, pose)`**: render one exact frame and write it to disk for the agent to Read. | sakura `vite.config.js:9-47`, `main.js:260-329` (MIT) [S]; re-read 2026-10-14 via GitHub [S] | **Missing** [S]. `__nh` can teleport, look and advance, but the only way to see a frame is a browser screenshot. Write PNG, never JPEG (sakura forces `.jpg`) [S]. Our Vite runs in Docker with the repo mounted, so the plugin writes to `build/shots/new-hope/` (gitignored) and Claude Code reads it from the host [O]. | A |
| T2 | **A named shot list** (district seed + pose), shot before and after a change that could touch it. | sakura `CLAUDE.md:191-344` [S] | For New Hope: start roof, a street canyon, the undercity, a lift interior, a high flight over the skyline, a rain shot; for seeds 2, 7 and 42 [O]. | A |
| T3 | **State as text** (`render_game_to_text`): mode, player pose, entities near, with a coordinate-system note. | game-creator `templates/*/src/main.js` (licence unclear: ideas only) [S] | `__nh` has many getters but no single `describe()` [S]. The planned `__wz` protocol already specifies `describe()`, `step`, `runScript`, `shot()` ([tasks/2026-10-02-player-loop-test-protocol.md](../tasks/2026-10-02-player-loop-test-protocol.md)) [S]. New Hope should expose the same shape so one studio runner drives both [O]. | A |
| T4 | **Steppable world without rAF.** | sakura `CLAUDE.md:141-157` [S] | Done: `__nh.advance(seconds)` works in a hidden tab (`main.ts:372-377`) [S]. | done |
| T5 | **Raycasts and flood fills instead of eyes** ("can this be seen?", "is this reachable?"). | sakura `CLAUDE.md:159-166`, `NEXT.md:2136-2219` [S] | See P4. A Node check that drives the `Walker` physics (no renderer) between `reachFrom` pairs would prove the 3D movement matches the grid [O]. It needs `actors.ts` to not import from `main.ts`, which already holds [S]. | A |
| T6 | **QA loop with an attempt log**, so a fix agent does not repeat a failed approach. | game-creator `output/autofix-history.json` [S] | Belongs to the "continue developing this game" flow, not to the game code [O]. | B |
| T7 | **Paste-ready coordinates for human bug reports** (a key copies `{pos, yaw, pitch}`). | sakura `hud.js:33, 199` [S] | The owner plays New Hope himself (`docs/progress.md`) [S]. A key that copies `__nh.teleport(x,y,z); __nh.look(yaw,pitch,dist)` turns his reports into reproducible shots [O]. | A |

### 1.7 Performance APIs and budgets

| # | Technique | From (licence) | Applies to New Hope | Prio |
|---|---|---|---|---|
| F1 | **Count draw calls, not milliseconds**, in noisy agent environments. | sakura `CLAUDE.md:487-490` ("wall-clock drifts 33–42 ms run to run… compare draw calls") [S]; game-creator threejs-perf methodology [S] | `__nh.info()` returns `renderer.info.render` (`main.ts:349`) [S], but **the numbers are wrong**: `info.autoReset` defaults to true and `render()` calls `info.reset()` on every call [S: three r180 `WebGLInfo.js`, `WebGLRenderer.js`]. `EffectComposer` calls `render()` once per pass [refuted 2026-10-14: at least once per pass; `UnrealBloomPass` calls `renderer.render` several times for its blur chain. The conclusion is unchanged: the last call is the `OutputPass` full-screen quad], so `info()` reports the last pass (the `OutputPass` full-screen triangle) [S from code, U: not run]. It also returns the live object, not a copy [S]. Fix: `renderer.info.autoReset = false`, `renderer.info.reset()` at the top of `frame()`, return `{ ...renderer.info.render, ...renderer.info.memory, programs: renderer.info.programs?.length }` [O]. | A |
| F2 | **A perf profile object plus a dev API to flip features** (`__app.perf.set(flag, v)`), and a documented strip order to bisect cost. | Punk `performanceProfile.js:11-54`, `STRIP.md`, `createPerformanceDevTools.js:44-111` (MIT) [S] | New Hope has no flags [S]. `__nh.flags = { bloom, shadows, rain, crowd, skyline, traffic }` with strip order "bloom → shadows → crowd → skyline" lets an agent A/B the draw-call cost through the DevTools MCP [O]. | A |
| F3 | **Split shader compile under a loading beat**; show objects only once their programs are ready. | Punk `warmup.js:75-144` (MIT) [S]; voxel-musou `post.compile()` [S]; three r180 `renderer.compileAsync` [S] | No warmup [S]. The psi beam, police cruisers and rain start invisible and compile on first use, which likely hitches at the worst moment [U: not measured]. Make them visible once, run `await renderer.compileAsync(scene, camera)` behind the "click to play" screen (`index.html` `#start`), then hide them again [O]. | A |
| F4 | **Device policy at boot** (DPR cap, mobile tiers). | Punk `applyDevicePerformanceDefaults()` [S] | DPR is capped at 2 (`main.ts:27`) [S], so a retina laptop renders the full HalfFloat composer chain at 4× pixels [S/O]. A 1.5 cap, or a `?q=low` tier, is worth having before mobile wrappers [O]. | B |
| F5 | **`renderer.setAnimationLoop` + `THREE.Timer`.** | game-creator `skills/threejs-game` rules [S]; `Timer` is in core in r180 (`src/core/Timer.js`) [S] | New Hope uses `requestAnimationFrame` and `performance.now()` by hand (`main.ts:326-333`) [S]. Equivalent today; `setAnimationLoop` is required for WebXR and the WebGPU renderer [O]. | C |
| F6 | **Measured budgets in the docs, generated, not typed.** | `ref-sakura-crossing.md` §6 q11; `ref-threejs-punk.md` §5.3 drift item 7 [S] | After F1: a `__nh.perf()` result per shot (T2) written next to the PNG as JSON. That is the number the studio shows and docs cite [O]. | B |

### 1.8 Docs for agents

| # | Technique | From (licence) | Applies to New Hope | Prio |
|---|---|---|---|---|
| D1 | **File routing**: task → file → entry function. | Punk `AGENTS.md:30-43` (MIT) [S] | Done: the package README has a file table and documents `__nh` [S]. | done |
| D2 | **Hard constraints with their reasons** ("do not reintroduce SSR … because"). | Punk `AGENTS.md:17-28` [S] | Missing. Candidates: "the sky patch strings must match three 0.180", "rain must use dt", "gameplay never reads the GPU hash" [O]. | B |
| D3 | **A trap table** ("Thing / Why / Symptom"), capped in size. | sakura `CLAUDE.md:721-870` (≈146 rows [S], over 30k tokens [unconfirmed: the table is ≈80 KB, which is roughly 20–27k tokens at 3–4 chars per token; "too big" holds either way]) | Start one in the package README with the traps found here (R7, F1, C7) [O]. | B |
| D4 | **Drift checks over the docs.** | `ref-threejs-punk.md` §5.3 (5 drifts within a day) [S]; ours: [docs/docs-check.md](../docs/docs-check.md) [S] | Our `paths` rule reads `CLAUDE.md`, the root `README.md` and `docs/`, **not package READMEs** [S], so `packages/new-hope-play/README.md`'s file table and `__nh` list are unchecked [S]. Extending `paths` to `packages/*/README.md`, plus one check that every `__nh` key in the README exists in `main.ts`, closes the gap [O]. | B |
| D5 | **Module headers as local specs** (what the module owns, the arithmetic behind constants). | sakura `rokuchome.js:60-140` [S] | Partly followed: every New Hope file opens with a 2–3 line purpose comment (`world.ts:1-6` also gives the axis mapping) [S]. | done |

## 2. New Hope against the catalogue

### 2.1 What it already follows

- One seeded, integer generator with invariants and a grid hash, kept outside the game package
  (P1, P4 at grid level) [S].
- Graphics as code: canvas atlas, primitive models, shader sky, no image files (R11) [S].
- Chunked city meshes on one material with per-chunk culling (R1 for the city) [S].
- Instanced sky traffic, skyline, signs, gear, crystals and beacons (C2 partly) [S].
- CPU gameplay hashes vs GPU look hashes (P2) [S].
- Rain volume around the camera with dt (V1) [S].
- A steppable world and a console handle (T4), and a file-routing README (D1) [S].
- Camera clearance against the grid (G5) [S].

### 2.2 What it misses, by cost and value

Concrete defects first (each is [S] from code; none was measured in a browser):

1. **`__nh.info()` reports the last composer pass, not the frame** (F1). Every perf
   claim made from it so far is wrong.
2. **The scene is not anti-aliased** (R7): `antialias: true` is spent on a canvas the composer
   overwrites.
3. **GPU leaks on police despawn and on body passing** (C7).
4. **The sky shader patch is unasserted** (R4).
5. **The shadow box swims** (R8).

Missing lessons, ranked [O]:

| Rank | Lesson | Size | Why now |
|---|---|---|---|
| 1 | T1 + T2 `__shot` (PNG) + a shot list | S (≈60 lines plugin + 40 lines page) | It turns every later change into "shoot, Read, compare". It also gives the studio something to show for a 3D game, which the owner's "make / continue this game" flow needs. |
| 2 | F1 fix + F2 flags + F6 numbers per shot | S | Makes the next items measurable. |
| 3 | C1 instanced crowd + R2 material cache | M | Probably the largest draw-call item in the scene [U]. It also enables a denser city (more people) and cheap body swaps. |
| 4 | R3 vertex AO in `GeometryBuilder` | S | The biggest look gain per line for a blocky city [O]. |
| 5 | T5/P4 walker-vs-grid check in Node | M | Catches "you cannot actually walk up those stairs" bugs that no screenshot shows. |
| 6 | F3 warmup | S | Removes first-use hitches. |
| 7 | G1 + G4 kicks and FOV | S | Game feel for crashes and boost. |
| 8 | V2 rain occlusion from the grid | S | Rain indoors is a visible bug in the undercity. |

### 2.3 Code patterns for the top items

`__shot`, in the spirit of sakura's plugin (MIT), PNG and our paths [O]:

```ts
// vite.config.ts (dev only)
plugins: [{ name: "nh-shot", apply: "serve", configureServer(s) {
  s.middlewares.use("/__shot", (req, res) => { /* collect body; name -> [\w.-]+; write
     build/shots/new-hope/<name>.png and <name>.json; reply {file} */ });
} }]
// main.ts, inside __nh
shot: async (name: string, pose?: Pose) => {
  if (pose) applyPose(pose);                    // teleport + look, then advance(0.1)
  renderer.info.reset(); composer.render(0);
  const png = renderer.domElement.toDataURL("image/png"); // same task as render: no
  const stats = { ...renderer.info.render, ...renderer.info.memory }; // preserveDrawingBuffer
  await fetch("/__shot", { method: "POST", body: JSON.stringify({ name, png, stats, seed }) });
},
```

Shadow texel snapping [O]:

```ts
const texel = (cam.right - cam.left) / key.shadow.mapSize.x;      // 0.088 m
lightView.lookAt(origin, lightDir, up); inv.copy(lightView).invert();
p.copy(target).applyMatrix4(inv);                                   // into light space
p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
p.applyMatrix4(lightView);                                          // back to world
key.target.position.copy(p); key.position.copy(p).addScaledVector(lightDir, 200);
```

Vertex AO for one quad corner (the 0fps rule, also voxel-musou's) [S for the rule]:

```ts
const ao = (side1: boolean, side2: boolean, corner: boolean) =>
  side1 && side2 ? 0 : 3 - (+side1 + +side2 + +corner);   // 0..3 → colour 0.55..1.0
// flip the quad's diagonal when ao0 + ao2 < ao1 + ao3, or the gradient creases
```

## 3. What this means for us

### New Hope (now)

- Do the five defects in §2.2 and ranks 1–2 first: small, mechanical, and they make every later
  claim checkable [O]. Ranks 3–4 are the first real look and scale gains [O].
- The owner's goal ("make this game" / "continue developing this game", with the studio
  showing assets and build progress) needs an **artefact a 3D game can hand to the studio**.
  For New Hope that is the shot list: PNG plus JSON stats per named pose and seed, under
  `build/shots/new-hope/`. A studio page can list it like an asset gallery, and verdicts can
  bind to the PNG hash as D7/D21 already do for assets [O]. The PNG hash is **not** a gate:
  it differs across GPUs and drivers, and the container has no GPU (CLAUDE.md) [S/O]. Gates are
  the numbers (calls, triangles, geometries after N heat cycles, walker reachability).
- Converge `__nh` on the `__wz` shape of the planned protocol (`describe`, `step`, `command`,
  `runScript`, `shot`) so one runner and one studio page serve New Hope and the data games [O].

### Future Three.js games in Wallhammer

A Three.js game skeleton should ship, from the first commit [O]: the `__shot` plugin and page
hook; `describe()`/`advance()`; `info` with `autoReset = false`; a feature-flag object with a
strip order; a material cache; a warmup step; `dispose()` on every despawn; a README with file
routing, hard constraints with reasons and a short trap table, covered by docs-check. These are
roughly 300 lines, and every reference that worked at scale had them (sakura's tools, Punk's
profile and `__app`, voxel-musou's headless checks) [S for the references, O for the claim].

### PixelDen (Phaser 4)

Most of the catalogue is Three.js-specific, but the self-check layer transfers [O]:

- PixelDen's `/new-game` verifies in the browser by walking the React fiber on the canvas's
  parent to find the Phaser game, then asserting scene state
  (`~/projects/nodejs/pixelden/.claude/commands/new-game.md` §5) [S]. That is fragile. A
  dev-only `window.__pd = { describe, advance, shot }` behind `import.meta.env.DEV` gives the
  same access without the fiber walk, and the build strips it, which `/new-game` already
  demands of `?cheat` hooks [O].
- `game.renderer.snapshot()` is already used for screenshots [S: `new-game.md:83` names it] [unconfirmed: whether this API exists unchanged in Phaser 4 (PixelDen pins `phaser ^4.0.0`) was not checked against the Phaser 4 docs]. Posting it to a dev endpoint as
  PNG (T1) lets the agent Read frames instead of driving a screenshot tool [O].
- Count draws and textures (F1, F2) instead of FPS when a portal game is slow [O].

## 4. Open questions for the owner

1. Should New Hope adopt the planned `__wz` test protocol now, ahead of
   `player-loop-test-protocol` (#18), or keep `__nh` until that note is done?
2. Should the studio show a 3D game's shot list (PNG + numbers per pose) as its "assets", with
   verdicts bound to the PNG hash like asset verdicts?
3. Is a denser crowd (hundreds of people via instancing) wanted for New Hope's look, or is 70
   enough? This decides whether C1 is rank 3 or later.
4. Should docs-check cover package READMEs (D4)? It would fail today on nothing known, but it
   adds a rule.
5. Is the Vellum `grafika-reference` project to be closed or updated? Its analyses are
   superseded by `research/ref-*.md`, and its voxel-planet plan was replaced by New Hope (D28,
   D30).

## Sources

All accessed 2026-10-14 unless noted.

Repository and owner material:
- This repo at `cd3edde`: `packages/new-hope-play/src/*.ts`, `packages/new-hope-play/README.md`,
  `packages/citygen/README.md`, `docs/DECISIONS.md` (D28, D30), `docs/docs-check.md`,
  `docs/progress.md`, `tasks/2026-10-02-player-loop-test-protocol.md`.
- Research reports (2026-10-02): `research/ref-sakura-crossing.md`, `ref-threejs-punk.md`,
  `ref-voxel-musou.md`, `ref-nms-procgen.md`, `voxels.md`, `game-creator.md`, `code-graphics.md`.
- Vellum (read-only, 2026-09-24): `projects/grafika-reference/index.md`, `plan-voxel-hra.md`,
  `analyzy/01-sakura-crossing.md`, `02-threejs-punk.md`, `03-voxel-musou.md`,
  `04-no-mans-sky-procgen.md`.
- PixelDen: `~/projects/nodejs/pixelden/.claude/commands/new-game.md` (local, read-only).

Reference repos (state checked via the GitHub API):
- sakura-crossing (MIT), `de01898`, 2026-07-29: https://github.com/Kenton-GMI/sakura-crossing ;
  `vite.config.js` re-read: https://github.com/Kenton-GMI/sakura-crossing/blob/de01898/vite.config.js
- threejs-conference / Threejs-Punk (code MIT; rain shaders CC BY-NC-SA, do not copy), `8cc2059`,
  2026-09-23: https://github.com/ektogamat/threejs-conference
- voxel-musou (MIT), `26ea581` (code, 2026-10-01) and `aba5fb8` (README/media, 2026-10-03):
  https://github.com/mike007jd/voxel-musou

three.js 0.180.0 source (MIT, published 2025-09-03):
- https://unpkg.com/three@0.180.0/src/renderers/webgl/WebGLInfo.js (render counters, `autoReset`)
- https://unpkg.com/three@0.180.0/src/renderers/WebGLRenderer.js (`info.reset()` in `render()`,
  `compileAsync`)
- https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js (default target
  without `samples`)
- https://unpkg.com/three@0.180.0/src/renderers/webgl/WebGLShadowMap.js (`autoUpdate`,
  `needsUpdate`)
- https://unpkg.com/three@0.180.0/src/objects/InstancedMesh.js (`computeBoundingSphere`)
- https://unpkg.com/three@0.180.0/src/objects/BatchedMesh.js (`perObjectFrustumCulled`)
- https://unpkg.com/three@0.180.0/src/core/Timer.js
- npm registry release dates: https://registry.npmjs.org/three

Other:
- Mikola Lysenko, "Ambient occlusion for Minecraft-like worlds", 0fps.net, 2013:
  https://0fps.net/2013/07/03/ambient-occlusion-for-minecraft-like-worlds/
- MDN, `Math` (implementation-dependent precision):
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math
- GDC 2017, McKendrick, "Continuous World Generation in No Man's Sky":
  https://www.youtube.com/watch?v=sCRzxEEcO2Y ; Eiserloh, "Noise-Based RNG":
  https://www.youtube.com/watch?v=LWFzPP8ZbdU (both via `ref-nms-procgen.md`)

## Verification (2026-10-14)

An adversarial fact-check by a separate agent, the same day. Method: every New Hope `path:line`
was read at `cd3edde`; the three.js 0.180.0 files were fetched from unpkg (there is no host
`node_modules`); the reference repos were read at the pinned commits through the GitHub API and
raw files; the npm registry was queried; the six Vellum notes were read (not written); the
PixelDen command file was read on disk. Nothing was run in a browser.

Checked and confirmed (24):

1. npm: three 0.180.0 published 2025-09-03, 0.186.0 2026-09-08, 0.186.1 2026-09-24 (latest).
   New Hope pins `three ^0.180.0` and `@types/three ^0.180.0`; a 0.x caret stays on 0.180.x.
2. GitHub: sakura-crossing has the single commit `de01898` (2026-07-29); threejs-conference's
   head is `8cc2059` (2026-09-23); voxel-musou's `26ea581` (2026-10-01) is followed only by
   `aba5fb8` (2026-10-03), which touches `README.md` and 15 files under `media/`. All three
   report the MIT licence.
3. three r180 `EffectComposer.js:69`: `new WebGLRenderTarget(w*pr, h*pr, { type: HalfFloatType })`,
   no `samples` (R5, R7).
4. three r180 `WebGLInfo.js:63` `autoReset: true`; `WebGLRenderer.js:1612`
   `if (this.info.autoReset === true) this.info.reset()` inside `render()`; `compileAsync` at
   `:1408` (F1, F3).
5. three r180 `WebGLShadowMap.js:66-73` `autoUpdate`/`needsUpdate` and the early return (R9);
   `BatchedMesh.js:211` `perObjectFrustumCulled = true` (C6); `InstancedMesh.js:151`
   `computeBoundingSphere()` (C5); `src/core/Timer.js` exists and is exported from
   `Three.Core.js` (F5).
6. `main.ts`: `antialias: true` (`:26`), DPR cap 2 (`:27`), FOV 62 (`:36`), bloom threshold 0.86
   (`:99`), camera ray march in 0.25 m steps (`:158-168`), shadow target follows the player
   without snapping (`:171-172`), sky follows the camera (`:173`), N key uses `Math.random`
   (`:283`), dt clamp 0.05 (`:326-333`), `info: () => renderer.info.render` (`:349`),
   `advance()` at 1/60 (`:372-377`).
7. `sky.ts`: `PALETTE` (`:9-14`), `gl_Position = p.xyww` (`:35`), GPU hash (`:41`), `Math.pow`
   and `Math.hypot` in skyline heights feeding `world.outside` (`:151-152`), three `.replace`
   patches with no check (`:185-221`), `frustumCulled = false` (`:224`). The shadow camera is
   ±90 m (180 m) at 2048 px: texel 8.8 cm (R8).
8. `models.ts`: `std()`/`glow()` factories (`:6-9`), `castShadow = true` on every part (`:14`),
   `buildCar` as `if (kind === …)` branches (`:123-174`, ≈20–22 meshes per car).
9. `traffic.ts`: 320 flyers in 3 instanced meshes with `frustumCulled = false` (`:75-82`), 70
   people (`:129-147`), `swap` rebuilds the person (`:180-205`), `update` animates all (`:209-237`).
   A person is 11–14 meshes by look, so "about 780 draws" for the crowd is a fair order.
10. `police.ts:65, 135-137` `group.remove` only; `actors.ts:38-48` `setLook` rebuilds;
    `grep dispose src/` is empty (C7). `RADIUS = 0.32`, three probe heights and the railing rule
    (`actors.ts:13, 58-75`); boost ×1.8 (`:210`); `impact` (`:238-248`); `actors.ts` does not
    import `main.ts`.
11. `fx.ts`: 4,000 drops, 70 m box, `frustumCulled = false` (`:7-32`); `world.ts:118-123`
    `hash3` with `Math.imul`.
12. `docs/docs-check.md:38`: the `paths` rule covers `CLAUDE.md`, `README.md`, `docs/` only (D4).
    `tasks/2026-10-02-player-loop-test-protocol.md:32-36` lists `describe`, `step`, `command`,
    `runScript`, `shot` (T3). `docs/DECISIONS.md` D28–D30 dated 2026-10-13. `docs/progress.md:11`
    says the owner plays New Hope. `packages/citygen/README.md`: `gridHash`, `checkDistrict`,
    200 seeds. `packages/new-hope-play/README.md`: file table, `__nh` list, "the look and the
    motion are not part of any digest".
13. Vellum: all four `analyzy/*` notes and `plan-voxel-hra.md` are `status: backlog` with `_TODO_`
    sections, last modified 2026-09-24; the index's "Průřezové srovnání" is `_TODO_`. The stale
    figures are as quoted: 03 says "32 JS files, ~9,300 lines", 02 says "ripples 5×5", 01
    says "lattice 3 m". Our reports say 102 files / 25,818 lines, 3×3 (`ref-threejs-punk.md:193`)
    and `CELL = 1.5` (`ref-sakura-crossing.md:65`).
14. `ref-threejs-punk.md` §6.1 (`:572`) gives "r186 (2026-09-24)", which is indeed the patch
    date; `ref-sakura-crossing.md` §3.2 "Fragility" (`:310`) and §6 q4 "snapped grid" (`:687`).
15. sakura `vite.config.js:9-47`: the `/__shot` plugin, which forces `.jpg`; `src/main.js:260-329`
    `window.__shot` behind `import.meta.env.DEV`, `toDataURL('image/jpeg')` (T1).
    `src/core/util.js:46-74` `bake()`; `src/world/shops.js:369-379` one mesh per material slot
    (R1); `src/core/toon.js:108-132` the material cache (R2); `src/core/textures.js` `make`
    (`:18`) and `cached` (`:34`) (R11); `src/world/vehicles.js:136` `SPEC` (P3).
16. sakura `CLAUDE.md`: 1,599 lines; `:487-490` "drifts 33-42 ms … Compare draw calls" (F1);
    `:721-870` the trap table, 148 table lines (≈146 rows) (D3); `:141` "Because rAF does not
    fire" (T4); `:159` "Can this be seen? is a raycast" (T5); `:191` "Camera positions worth
    keeping" (T2). `src/core/hud.js:33` and `:199` are the paste-ready `__shot` argument (T7);
    `NEXT.md:2136-2219` is the flood-fill tool (T5).
17. Threejs-Punk at `8cc2059` (paths under `src/`): `bootstrap/createRenderer.js:46`
    `shadowMap.autoUpdate = false` (R9); `clouds/cloudsMaterial.js:50-52`
    `position.z.assign(position.w)`, the TSL form of `xyww` (R10); `AGENTS.md:17-27` hard
    constraints with reasons and `:29-43` file routing (D1, D2); `post/look/cyberpunkLook.js:104`
    `LOOK_PRESETS` (R6); `platform/performanceProfile.js:11` `performanceProfile`, `maxPixelRatio:
    1.5` (F2, F4); `debug/createPerformanceDevTools.js:97` `__app.perf.set(...)` (F2);
    `runtime/warmup.js:103, 139, 142` `renderer.compileAsync` (F3);
    `world/weather/createCollisionRain.js:139-158` the `fract` wrap (V1).
18. voxel-musou at `26ea581`: `camera/camera.js:138-154` micro-kicks aged in sim frames (G1);
    `combat/combat.js:85-95` `heroStop` hitstop (G2); `audio/audio.js:140-187` sidechain
    `duck()` and `LEAD` (G3); `main.js:274-285` accumulator, at most 4 steps (G6);
    `post/post.js:250-258` `setLook()` writes uniforms (R6); `crowd/view.js:410-432` one
    `InstancedMesh` per part with `instanceColor` (C1), `:181-217` mid and far LOD (C3),
    `:632-652` per-soldier replay (C4); `vfx/vfx.js:44-71` `clumpGeometry` (V4), `:508` `makePool`
    (V5).
19. 0fps (Lysenko, 2013): the `vertexAO(side1, side2, corner)` rule and the diagonal-flip
    comparison are as quoted in §2.3.
20. PixelDen: `.claude/commands/new-game.md` §5 "Verify" (`:72-86`) has the React-fiber walk
    (`:80`), `game.renderer.snapshot()` (`:83`) and the `?cheat` removal (`:86`);
    `package.json` pins `phaser ^4.0.0`.
21. `research/README.md:55` flags `surfaceRain.js` / `rainGlass.js` as CC BY-NC-SA 3.0 via
    rocksdanister/rain.
22. `game-creator.md:420` "8,000 entities … 1 draw" is in §6.2; `:303` `autofix-history.json`
    (T6); `:271` `render_game_to_text` (T3); `:412` `setAnimationLoop` (F5).
23. `ref-nms-procgen.md` §1.1 (`:98`) Foundation 2016; §3.1 determinism rules; §4.3 the seed
    browser spec.
24. The texel arithmetic and the "4× pixels at DPR 2" arithmetic.

Corrected inline (marked `[refuted 2026-10-14: …]`):

- R3: the AO mesher is `src/hero/model.js` `vox()`, not `src/core/voxel.js:64-124`.
- R2: material counts per person and per car were undercounted (6–8 and 12–14, not 3–4 and
  6–8).
- P4: the "walkable equals visible" sentence is at `hills.js:77-78`, not `:1781-1817`.
- C7: the game-creator hygiene rules are in §6.5, not §6.2.
- F1: `EffectComposer` passes call `render()` at least once each, not exactly once.

Marked `[unconfirmed]`:

- D3: "over 30k tokens" for the trap table (it is ≈80 KB; 20–27k is the better estimate).
- V6: the exact licence of each rain shader file; the CC BY-NC-SA flag is inherited from
  `research/README.md`, and `rainRipples.js` carries no attribution at all.
- R3: 3 vs 4 neighbour samples per corner in voxel-musou (our ref report says 4).
- §3 PixelDen: whether `game.renderer.snapshot()` is unchanged in Phaser 4.
- Already marked by the author and still unmeasured: the crowd's frame cost (C1), the leak
  growth (C7), the first-use hitches (F3), "standard practice" for texel snapping (R8), and
  the `info()` behaviour, which follows from the three.js source but was not run.

Gaps the report leaves:

- No claim was tested in a browser: draw-call counts, the missing anti-aliasing, the leak
  and the `info()` defect are all read from code. The report says so; a 10-minute DevTools MCP
  session would turn the five "defects" in §2.2 from [S from code] into measurements.
- R4 warns that a three.js bump could break the sky patch but does not check whether the
  three anchors (`#include <common>`, `<begin_vertex>`, `<emissivemap_fragment>`) still exist
  in 0.186; neither did this check.
- The report says nothing about Phaser 4 APIs beyond one method name, and nothing about
  wrapping games for desktop and mobile, which the owner's request also named; those belong
  to other reports (`research/multiplatform.md`, `research/pixelden-flow.md`).
- `UnrealBloomPass` renders its blur chain at reduced resolution and several passes; the cost
  side of R5/R7 (a `samples: 4` HalfFloat target doubles the composer's memory) is not
  weighed.
