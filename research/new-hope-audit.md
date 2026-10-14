# New Hope codebase audit: `packages/new-hope-play` as a Three.js game

*Research date: 2026-10-14. Status: proposal only.*

Scope: every file of `packages/new-hope-play` at commit `cd3edde` (branch `implementation`):
`src/*.ts` (14 files, 2,903 lines [refuted 2026-10-14: `wc -l src/*.ts` gives 2,904; off by one, immaterial]), `index.html`, `vite.config.ts`, `package.json`, `tsconfig.json`.
Three.js is pinned to **0.180.0** (`package-lock.json`, `"three": "^0.180.0"` = `>=0.180 <0.181`).

Legend: **[S]** sourced (link inline, list at the end), **[O]** my opinion or my own arithmetic from
the code, **[U]** unverified. A `file:line` reference with no tag means I read it in the code
([S] on the repo). Severity: **H** high (perf cliff, bug, or blocks growth), **M** medium,
**L** low.

What I did not do: no source edits and no Docker. The game was already being served on
`127.0.0.1:4200`, but the Chrome DevTools MCP browser was held by another session [unconfirmed], so **the
draw-call and memory numbers below are estimated from the code, not measured.** §11 gives the
one-line change that makes them measurable.

Builds on earlier research instead of repeating it:
[ref-threejs-punk.md](ref-threejs-punk.md) (perf levers, adaptive DPR, shader warmup, WebGPU status),
[game-creator.md](game-creator.md) §4 (test protocol), [multiplatform.md](multiplatform.md) §2
(WebView rendering, audio and memory limits), [audio-from-code.md](audio-from-code.md).

---

## 0. Summary

The game is small, readable and already playable. Some of its choices are good and should stay:
- collision is point-sampled against the citygen cell grid;
- the district is one procedural atlas and 9 chunk meshes;
- signs, gear, traffic and the skyline are instanced;
- `__nh.advance()` steps time synchronously, so it works in a hidden tab;
- keys are read by `e.code`, so WASD works on the owner's QWERTZ layout. [O]

Five findings dominate:

1. **People and cars are built from separate meshes** (≈ 11–13 per person, ≈ 21 per car). Each has
   its own geometry and materials, and each casts a shadow. 70 crowd people plus the cars come to
   roughly **800–1,000 meshes, drawn twice** (main pass and shadow pass). That is about 95 % of
   all draw calls. [O]
2. **`__nh.info()` reports only the last full-screen pass**, so nobody can see (1). With
   `info.autoReset = true`, three.js resets the counters on every `renderer.render()`. The
   composer calls it about 15 times per frame, and the shadow pass is excluded as well. [S]
3. **`main.ts` is a god file.** It holds the renderer, scene assembly, game rules (psi, arrest
   fine, car reach), the camera, the HUD, the loop and the debug API, all sharing 8 module-level
   `let`s. Simulation and presentation run in one `frame()`, so `advance()` also writes the DOM
   and the audio graph on every step.
4. **Nothing is data.** Tunables, colours, job texts and HUD strings are literals in code.
   `games/new-hope/` has `systems: []` and an empty `locales/en.json`, and its `game.json`
   still says `resolution 480×270`, left over from the 2D template before D30.
5. **Mobile is not started.** There is no touch input, and pointer lock does not exist on iOS
   Safari or Chrome Android [S]. There are no quality tiers. Shadows, MSAA, bloom and the
   half-float composer targets all run at DPR 2. [O]

---

## 1. Per-frame allocations and GC

`frame()` runs 60 times a second, and in `advance()` up to 60 × N times in one go. Every
allocation in it is garbage. V8 can scalar-replace some short-lived objects, but that is not
guaranteed across closures and polymorphic calls. [O]

| # | Where | What allocates | Sev | Fix |
|---|---|---|---|---|
| A1 | `main.ts:172` | `new THREE.Vector3(60, 140, 40)` every frame | L | Module constant `KEY_OFFSET`; `keyLight.position.copy(target).add(KEY_OFFSET)`. |
| A2 | `police.ts:95` | `target.clone().add(new Vector3(...))`: **2 vectors per unit per frame** | M | Keep `aim`, `to` and `ahead` as private scratch vectors on `Police`; `aim.set(target.x + …, …)`. |
| A3 | `police.ts:100` | `u.pos.clone()` per unit per frame | M | Same scratch vector. |
| A4 | `police.ts:110`, `actors.ts:266`, `actors.ts:268` | `getObjectByName()` walks the subtree (≈ 22 nodes) per car per frame, parked cars included | M | Return `lightbar?` and `pool` from `buildCar` in the `Car` interface (`models.ts:115`), which already returns `lights`. |
| A5 | `main.ts:277-279` | `jobs.state()` twice per frame: an object plus `toArray()` each time | L | Add `jobs.doneCount` as a number getter, or have `Jobs` emit a `jobDone` event. |
| A6 | `main.ts:315-320` | `cars.filter().map()`, `police.positions()` (`map`), `crowd.positions()` (`map`): 4 arrays per frame | L | Radar reads from preallocated arrays, or the radar gets the systems and iterates; throttle the radar to 20 Hz. |
| A7 | `radar.ts:40-43` | `map()` returns a fresh `[x, y]` tuple per blip (≈ 80 per frame) | L | Write into two scratch numbers. |
| A8 | `main.ts:300-312` | 4 template strings plus 4 `innerHTML` writes and 2 `style.opacity` writes **per frame**: string garbage, HTML parsing and style recalculation | M | Cache the last string per element and write only on change. Use `textContent` and fixed child spans; set the psi bar with `style.width`. |
| A9 | `jobs.ts:127` | `this.job.where.clone().sub(kylo)` per frame (`hud()`) | L | Compute `dx/dy/dz` as numbers. |
| A10 | `actors.ts:61-62`, `actors.ts:194-195` | Array literals `[0.45, 1.0, 1.7]` and 4 or 6 tuple arrays, rebuilt in every `blocked()`/`hits()` call. `hits()` runs 3–4× per car per frame [refuted 2026-10-14: 2–3× — the x and z moves always, the y probe only while `vel.y > 0` (`actors.ts:241, 247, 253`)], **parked cars included** | L | Hoist to module `const` typed arrays. |
| A11 | `actors.ts:50`, `actors.ts:67` | `cell()` returns a new object, called 2–3× per walker step | L | Return into a scratch struct. |
| A12 | `sky.ts:175`, `sky.ts:181` | **A template-string key `${ix},${iz}` per `world.outside()`/`outsideFloor()` call.** These run inside `blocksPoint`/`floorAt` for every point outside the district, including the camera ray (up to ≈ 120 calls per frame, see §7) | M | Numeric key `ix * 4096 + iz`, or a dense `Int32Array` grid of first-box indices (the grid is 155 × 155). |
| A13 | `traffic.ts:87`, `traffic.ts:153` | `forEach` closures per frame; `Math.atan2(tr.dx, tr.dz)` per flyer per frame, although it is constant per track | L | `for` loops; store `yaw` on `Track` at construction. |
| A14 | `main.ts:219-225`, `fx.ts:90-91`, `police.ts:81-83` | Clones and new vectors on events (body pass, spawn) | — | Fine: these are events, not frames. |

Worst offenders: A2 to A4 (they scale with the police count), A8 (DOM work every frame) and
A12 (strings in the collision hot path). [O]

---

## 2. Draw calls, instancing and materials

### 2.1 Inventory (from the code) [O]

| Source | Meshes / draws | Casts shadow | Notes |
|---|---:|---|---|
| City chunks (`city.ts:82, 264-272`) | ≤ 9 opaque + ≤ 9 glass | opaque yes | 48/16 = 3 × 3 chunks, each 16 × 16 tiles × all 20 storeys. |
| City details (`city.ts:276-304`) | 4 instanced | gear only | Good. |
| Skyline (`sky.ts:222-252`) | 1 instanced tower mesh (**≈ 18,000 instances**) + 1 beacon + 4 ground planes | no | `frustumCulled = false` (`sky.ts:224, 235`): all instances every frame. |
| Sky dome (`sky.ts:93`) | 1 | no | 48 × 24 sphere, a full-screen fragment shader. |
| Traffic (`traffic.ts:72-83`) | 3 instanced, 320 each | no | Good. |
| Rain, beam, job beacon | 1 + 1 + 2 | no | |
| **Kylo** (`models.ts:40-88`) | ≈ 13 meshes | all | |
| **Crowd, 70 people** (`traffic.ts:129, 143`) | **≈ 11–12 meshes each ≈ 800** | all (`models.ts:14`) | Each person creates **new geometries** (`models.ts:51-52, 60-81`) and ≈ 6–7 **new materials**. The shoe material is created **once per leg** (`models.ts:52`). |
| Parked cars (`main.ts:89-92`) + police (≤ 6, `police.ts:88`) | **≈ 21–23 meshes each** | all, **glow parts too** | ≈ 15 materials per car (`glow()` is called inside the thruster loop, `models.ts:142`). |

Skyline count: the grid runs from −1700 to +1700 m at 22 m spacing, which gives 155 × 155 cells.
Avenues (`ix % 5`, `iz % 6`) leave 124 × 130. Removing the district hole leaves ≈ 16,000 towers,
and ≈ 12 % of them get a crown. That is ≈ 18,000 instances, ≈ 216 k triangles and ≈ 430 k
vertices per frame. [O]

**Estimate:** about 30 draws are "the world". After frustum culling, the main pass draws roughly
300–900 meshes, and the shadow pass a similar number again (the shadow box is 180 × 180 m around
Kylo, `sky.ts:107-111`). People and cars are ~95 % of that. On desktop Chrome this is survivable.
On a phone, or with 200 crowd people, it is the first wall. [O]

### 2.2 Fixes

- **D1 (H) Crowd, instanced.** Make one `InstancedMesh` per body part: legs, torso, head, hair,
  visor, arms, hands, about 8 meshes. Use per-instance colour (`setColorAt`) and compute each
  limb's matrix on the CPU from the person's root, phase and amount, as `animatePerson` does
  now. That turns ~800 draws into ~8 (plus ~8 shadow draws).

  The next step is one merged person geometry with a `limb` vertex attribute and per-instance
  `phase`/`amount`, swinging the limbs in the vertex shader. That is one draw for the whole crowd
  and zero CPU matrix work.

  Body-passing (`traffic.ts:180-202`) then becomes "swap two instances' colour rows" instead of
  `buildPerson()`. Kylo can stay a normal mesh. [O]
- **D2 (H) Cars, merged per kind.** Merge the static parts of each car kind into one
  `BufferGeometry` with vertex colours (`BufferGeometryUtils.mergeGeometries`), one opaque
  material, plus the emissive parts merged under one `MeshBasicMaterial` with vertex colours.
  Keep the lightbar and the pool as separate children. That is 3–4 draws per car instead of ~21.

  For many identical cars (police, parked), use `InstancedMesh` per kind, or `BatchedMesh`,
  which draws many different geometries with one material in a single call [S three.js docs].
  [O]
- **D3 (M) Share geometry and materials.** `buildPerson`/`buildCar` should take geometries from
  module-level caches. Only materials whose colour differs per look should be new, or the colour
  should become vertex or instance colour so that one material serves all. This also fixes the
  leaks in §5. [O]
- **D4 (M) Shadows only from what needs them.** Set `castShadow = false` on glow parts, lights,
  thruster discs, the underglow pool and hands. Crowd people further than ~40 m away could stop
  casting. [O]
- **D5 (M) Skyline culling.** Split the tower `InstancedMesh` into ~8 × 8 sector meshes with
  `computeBoundingSphere()` and `frustumCulled = true`. A 62° camera then draws ~¼ of them, and
  three's front-to-back sort of opaque objects gives better early-z.

  Do **not** simply shorten the range: `FogExp2(0.0031)` (`sky.ts:100`) leaves only
  e^−(0.0031·700)² ≈ 1 % of a tower's colour at 700 m, but the sky has `fog: false`
  (`sky.ts:22`). So the far towers draw the fog-violet silhouette band against the pink horizon,
  and that band *is* the look. A cheaper equivalent beyond ~800 m is an impostor ring (one
  cylinder with a baked silhouette texture). [O]

---

## 3. Shadows, bloom and render targets

| # | Where | Finding | Sev | Fix |
|---|---|---|---|---|
| R1 | `main.ts:26`, `main.ts:97-101` | **`antialias: true` is wasted.** `RenderPass` draws into the composer's own target, created as `{ type: HalfFloatType }` without `samples` [S EffectComposer r180]. The scene is therefore not antialiased. The MSAA default framebuffer only receives `OutputPass`'s full-screen triangle, yet at DPR 2 on a 1512 × 982 laptop it costs about 5.9 Mpx × 4 samples × 8 B ≈ **190 MB** [O, estimate; driver-dependent, U]. | H | `antialias: false` on the renderer; `new EffectComposer(renderer, new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }))` on the high tier only; SMAA/FXAA or nothing on lower tiers. |
| R2 | `main.ts:99` | `UnrealBloomPass` runs 5 mips with kernels 3–11: **13 full-screen-ish passes and 11 half-float render targets per frame** [S UnrealBloomPass r180], starting at half the device-pixel resolution. With the composer's two full-res half-float targets, that is roughly 95 + 12 + 32 ≈ **140 MB of targets at DPR 2** [O, arithmetic]. | M | Run bloom at a lower resolution (a quarter-res input on mid/low tiers), or move to a selective-emissive bloom later (the Threejs-Punk MRT emissive approach, [ref-threejs-punk.md §3.5](ref-threejs-punk.md)). Tier it (§10). |
| R3 | `main.ts:31-32` | `PCFSoftShadowMap` is **deprecated in r182 and removed by r186** ("Warn when using removed PCFSoftShadowMap") [S releases; S A-Frame 1.8.0 notes]. [confirmed 2026-10-14 against the three.js migration guide: 181 → 182 "`PCFSoftShadowMap` with `WebGLRenderer` is now deprecated. Use `PCFShadowMap` which is now soft as well"; 185 → 186 names the `WebGPURenderer` removal, and the r186 release notes say "Remove remaining PCFSoftShadowMap code" and "Warn when using removed PCFSoftShadowMap". r182 also had a bug where the automatic fallback did not fire (fixed in r183, "Fix `PCFSoftShadowMap` check" #32593).] It blocks a clean three upgrade. | M | Switch to `PCFShadowMap` (soft since r182 [S]) when upgrading; check the look in the browser. |
| R4 | `sky.ts:103-115`, `main.ts:171-172` | A 2048² shadow map over 180 × 180 m (≈ 8.8 cm per texel), re-rendered **every frame** (default `autoUpdate`) with ~all casters. The box follows `target` continuously with **no texel snapping**, so shadow edges shimmer while moving [S Microsoft shadow techniques]. | M | Snap the light target to the shadow texel grid in light space. On the low tier, use 1024² over 120 m, or `shadowMap.autoUpdate = false` with a refresh every N frames or on a cell change ([ref-threejs-punk.md §3.12](ref-threejs-punk.md)). Set `cam.far` to ~300, not 600. |
| R5 | `sky.ts:104` vs `main.ts:172` | The key light's direction is set from `PLANET_DIR` in `addLights`, then overwritten every frame by a hard-coded `(60, 140, 40)`. Two sources of truth, and the sky's lighting story is lost. | L | One `SUN_DIR` constant in data; `placeCamera` uses `SUN_DIR × 150`. |
| R6 | `fx.ts:84-86` | **The body-pass `PointLight` sits in a group with `visible = false`.** `projectObject` returns early for invisible objects, so the light is not counted, and a change in the light state forces a program change [S WebGLRenderer r180]. The **first body pass therefore recompiles every lit material's program** mid-game: a hitch. Programs are then cached per material. | M | Keep the light always in the scene (`intensity 0`), or drop it for an additive sprite. Add `await renderer.compileAsync(scene, camera)` behind the start screen [S docs]. |
| R7 | `main.ts:36` | `near 0.1`, `far 6000`: a 60,000:1 depth range for coplanar slabs and facades. | L | `near 0.25`. r183+ has `reversedDepthBuffer` work in the release notes [S] [refuted 2026-10-14: the option is not new in r183 — `WebGLRenderer({ reversedDepthBuffer })` already exists in r180 (the migration guide renamed `reverseDepthBuffer` → `reversedDepthBuffer` in 178 → 179); r183–r186 only fixed shadow, sort, bias and render-order bugs with it. It can be evaluated on r180 today]; evaluate it at the three upgrade. |
| R8 | `main.ts:103-108` | Resize does not follow a `devicePixelRatio` change (moving the window between monitors). There is no `webglcontextlost` handler; multiplatform §2.2 explains why mobile needs one. | L | `matchMedia('(resolution: …dppx)')` listener; context-lost → pause plus a reload prompt. |

---

## 4. Chunking, culling and textures

- **C1 (L now, H later).** Chunks are 16 × 16 tiles × **all 20 storeys** (`city.ts:120-126`), so
  a chunk cannot be culled by height: the undercity is drawn when on a roof. At 9 chunks this is
  fine. For a bigger map (several districts, a GTA-sized city), use 16 × 16 × 5-storey chunks
  (one per band), plus distance LOD (drop details such as signs, railings and crystals past
  ~150 m), plus streaming. [O]
- **C2 (M).** Every cell face is its own quad, and there is no greedy merge. Merging is blocked by
  per-face random atlas variants (`city.ts:154`). With a **`DataArrayTexture` (one layer per
  tile)** plus world-space UVs, adjacent faces of the same style could merge, and the variant
  could come from a hash in the shader. WebGL2 supports texture arrays, and three exposes
  `DataArrayTexture` [S docs]. [O]
- **C3 (M) Atlas bleeding.** The atlas is 512² (8 × 8 tiles of 64 px, `textures.ts:7, 262`), with
  `LinearMipmapLinearFilter` and only a **0.5-texel inset at mip 0** (`textures.ts:317`). At mip
  3 a tile is 8 px, so mid-distance facades sample neighbouring tiles: colour seams on distant
  walls. Fix: 4–8 px edge-extruded gutters (a 1024² atlas holds 8 × 8 tiles of 64 + 2 × 32), or
  the texture array of C2. [O]
- **C4.** The texture memory is tiny: 2 × 512² RGBA with mips ≈ 2.8 MB. Anisotropy goes to the
  GPU maximum (`main.ts:40`; `textures.ts:313` sets 8 and is then overwritten). Fine; cap it at 4
  on the low tier. [O]
- **C5.** Traffic (`traffic.ts:81`) and rain (`fx.ts:32`) set `frustumCulled = false`. That is
  correct, since they span the world, but both are CPU-animated (§1 A13, §8): move both into the
  vertex shader. [O]

---

## 5. Memory and lifecycle

- **M1 (M) Leaks: geometry and materials are never disposed.** `grep dispose src/` finds
  nothing. Three.js does not free GPU resources by itself [S manual]. The leaks:
  - `Walker.setLook` (`actors.ts:38-47`) and `Crowd.swap` (`traffic.ts:195-200`) build a new
    person per body pass and drop the old one: ≈ 2 × (11 geometries + 7 materials) per pass.
  - `Police.spawn` builds a cruiser per unit (`police.ts:79`); `clear()` and the shrink loop
    remove it without disposing (`police.ts:63, 137`). Every wanted cycle leaks ≈ 21 geometries
    and ≈ 15 materials per unit.

  Fix: the shared caches (D3) plus a unit pool (`Police` keeps 6 cruisers and toggles
  `visible`). [O]
- **M2 (L).** `N` reloads the page (`main.ts:283`). That hides the missing teardown today. A studio
  that switches seeds in place, or a "next district" flow, will need a `dispose()` on every
  module. [O]
- **M3 (L).** `GeometryBuilder` holds JS `number[]` (8 B per element plus growth) before copying
  to `Float32Array` (`city.ts:16-19, 56-59`): a transient peak only at boot. If chunk streaming
  arrives, write into pre-sized typed arrays from a face count pass. [O]
- **M4.** The skyline collision `Map` holds ≈ 16 k entries with string keys (`sky.ts:137`): a few
  MB, fine, but see A12.

---

## 6. `main.ts` structure

`main.ts` (380 lines) is the composition root, *and* the game rules, *and* the camera, *and* the
HUD, *and* the loop, *and* the test API. Concretely:

- **Rules in the entry file:** psi regen 6/s (`:251`), `PASS_COST` 60 (`:137`), the car reach of
  4.2 m (`:178`), the exit offset of 2.2 m (`:200`), the arrest fine of 30 % (`:238`), the
  "chime after the second job" rule (`:279`), the band lookup (`:141-145`).
- **Shared mutable state:** `camYaw, camPitch, camDist, driving, time, flash, psi, passes`
  (`:128-136`). The debug API writes them directly (`:344-348`).
- **Sim and presentation interleaved in `frame()`** (`:244-324`). Systems update, then the
  camera, rain, sound and HUD, then the radar and the render. `advance(seconds)` (`:373-377`)
  therefore runs the audio automation, 4 `innerHTML` writes and the rain CPU loop 60× per
  simulated second.
- **Systems return UI.** `police.report()` builds HTML (`police.ts:45, 131`), and so do
  `jobs.update()` (`jobs.ts:105, 109`) and `jobs.hud()` (`jobs.ts:126-134`). `message()` is
  **exported from the entry module** (`main.ts:189`), which invites a circular import the first
  time a system imports it.
- **The collision data is owned by the renderer module.** `createSkyline` (`sky.ts:173-183`)
  overwrites `world.outside`/`outsideFloor`. Collision therefore cannot be tested without
  building Three meshes, and the order of calls in `main.ts:41-45` is load-bearing.

Fix: see §12 for the layout. The minimum first step is to pull out `Game` (state plus `step(dt,
actions)`), `CameraRig`, `Hud` and `debugApi(game)`. Then `main.ts` is ≈ 60 lines of wiring. [O]

---

## 7. Collision

The approach: point samples against the cell grid, axis-separated moves, `floorAt` scanning down
a column (`world.ts:62-104`, `actors.ts:58-74, 192-202`). It is simple, robust for an
axis-aligned voxel city, and cheap. Keep it. [O]

| # | Where | Finding | Sev | Fix |
|---|---|---|---|---|
| K1 | `main.ts:159-167` | The camera occlusion **ray-marches in 0.25 m steps**: up to `16 × 1.9 / 0.25 ≈ 122` `blocksPoint` calls per frame when driving, each allocating a string outside the district (A12). The pull-in is instant (no smoothing), so it pops. Only the centre ray is tested, so the near plane can still clip into walls at grazing angles. | M | A 3D DDA cell walk (Amanatides & Woo [S]) visits ≈ dist/4 ≈ 8 cells. Probe 4 rays at the near-plane corners. Use a spring that pulls in fast and lets out slowly (e.g. τ 0.05 s in, 0.4 s out). |
| K2 | `actors.ts:204-276` | Parked cars run the full flight model, ≈ 36 `blocksPoint` [refuted 2026-10-14: 24 for a parked car — `hits()` is 12 probes and runs twice at `vel.y = 0`; 36 is the ceiling while rising] and 1 `floorAt` per car per frame, at zero velocity. | L | Sleep when `vel.lengthSq() < 1e-4` and not occupied; wake on hit or entry. |
| K3 | `police.ts:99-105` | Police have no collision: they climb when the point ahead is blocked, and are shoved up 30 m/s when inside a solid, so they visibly clip through towers. `inSight` is distance < 90 m, not sight (`police.ts:113`). | M (feel) | Reuse `Hovercar.hits` or a sphere probe; use the DDA from K1 as a line-of-sight test for `inSight` (a real "lose them" mechanic). |
| K4 | `actors.ts:239-251`, `main.ts:328` | No swept test. Max speed 62 m/s × the dt cap of 0.05 s = 3.1 m per step, below the 4 m cell, so it holds **only because of the dt clamp**. A boost above 80 m/s, or a fixed step at 30 Hz, would tunnel. | L | Substep when `speed × dt > TILE / 2`, or a DDA sweep. Encode the invariant in a test. |
| K5 | `world.ts:62-68` | Outside the district, only the ground and skyline boxes block, and the skyline is a closure set by render code (§6). | M | Move the skyline layout to `world/skyline-layout.ts` (pure, seeded, no Three); render and collision both read it. |

---

## 8. Determinism, randomness and seeds

The README states that "the look and the motion are not part of any digest", and that is a fair
choice for a real-time 3D game. New Hope is not under `tools/lint/determinism.js` (its float
`Math.sin` would fail it). ECMAScript leaves `Math.sin` and friends "implementation-approximated"
[S ECMA-262], so cross-engine integer determinism would mean rewriting the movement code in
`@whz/det` fixed point. **Not worth it for New Hope's motion** [O]. What *is* worth having:
**same build + same browser + same seed + same input log ⇒ same run.** That makes scripted
checks reproducible and bugs replayable. Today this fails for three reasons:

| # | Where | `Math.random` / nondeterminism | Affects gameplay? | Fix |
|---|---|---|---|---|
| X1 | `police.ts:83` | Unit phase `t`, which drives the aim orbit `sin(u.t·0.7)·5` (`:95`), which decides `d < 8` → **arrest** | **yes** | A seeded stream: `createRng(seed, STREAM_POLICE)` from `@whz/det`. |
| X2 | `traffic.ts:131-135`, `:219` | The crowd LCG is seeded (good), but **consumed on arrival**, and arrival times depend on the `dt` sequence. Who is near Kylo, and so body-passing and guard sightings, varies with the frame rate | yes | Fixed-step sim (below). |
| X3 | `main.ts:326-331` | Variable `dt` from `performance.now()`, clamped to 0.05 | yes | A fixed 60 Hz sim step with an accumulator and render interpolation [S Fiedler]. `advance()` already uses 1/60, so live play and scripted play would finally run the same code path. |
| X4 | `actors.ts:173` | Car bob phase | no (cosmetic) | Hash of the car index. |
| X5 | `fx.ts:24-26` | Rain layout | no | A hash, or move to the shader (C5). |
| X6 | `audio.ts:51, 63, 70, 223` | Reverb IR and noise buffers | no | A seeded rng, so the audio matches the `@whz/audio` philosophy; optional. |
| X7 | `main.ts:283` | `N` picks a random new seed | no (UI) | Fine; maybe `hash32(seed, 1)` so "next" is reproducible. |

Also: input edges (`input.hit`) are cleared per *render* frame (`input.ts:47`). With a fixed step,
latch presses until the first sim step consumes them, so a press is never lost or doubled. [O]

A cheap guard: an ESLint `no-restricted-properties` for `Math.random`/`performance.now` in
`src/sim/**` of this package (not the full determinism lint). The registry in
`eslint.config.js:16-28` stays as is. [O]

---

## 9. Audio graph

`audio.ts` builds a graph at start: 10 detuned saws for the pad, a saw + sine engine, a square
siren with a square LFO, 2 looping noise buffers, a compressor, and a **3 s stereo convolver**
(`:46-56`). Everything runs for the whole session.

| # | Where | Finding | Sev | Fix |
|---|---|---|---|---|
| S1 | `audio.ts:157-160` | Mute only ramps the master gain to 0; the graph (the convolver included) keeps processing. No `visibilitychange` handling: a hidden tab keeps the drone. | M | `ctx.suspend()` on mute and on `document.hidden`, `resume()` after. On iOS also resume on `pointerdown` ([multiplatform.md §2.3](multiplatform.md)). |
| S2 | `audio.ts:221-223` | `crash()` allocates and fills a new 0.4 s noise `AudioBuffer` per crash. | L | One noise buffer made at start; per crash only a source, a filter and a gain. |
| S3 | `audio.ts:162-183` | 8 `setTargetAtTime` events per frame. Harmless, but `advance()` multiplies it. | L | Update audio params at 20–30 Hz from the presentation side only. |
| S4 | whole file | A parallel synth next to `@whz/audio`, the repo's deterministic synth with song/SFX formats and validators. New Hope's cues (chime, fail, whoosh) are exactly the "SFX as named parameters" case of [audio-from-code.md](audio-from-code.md). | M (process) | Keep the live WebAudio drone/engine/siren (continuous, parameter-driven). Move the one-shot cues to `audio/` SFX files rendered by `@whz/audio`, so the studio can show and review them like other assets. |
| S5 | `audio.ts:36-44` | Only `#start` starts audio; `AudioContext` states such as `interrupted` (Safari) are not handled. | L | A `state` check plus `resume()` on the next gesture. |

---

## 10. Input and mobile readiness

**Input** (`input.ts`, used directly by `actors.ts:100-102, 207-210` and `main.ts:259-283`):

- **I1 (M) No action layer.** Systems ask for `"KeyF"`, `"KeyT"` and `"ShiftLeft"` directly.
  Introduce actions (`move: vec2`, `look: vec2`, `ascend: axis`, `interact`, `pass`, `jump`,
  `boost`, `zoom`) filled by device adapters (keyboard/mouse, gamepad, touch). Bindings go in
  data. The HUD help (`main.ts:306-308`) then renders from the bindings, not from literals. [O]
- **I2 (L)** The HUD prints "WASD" while the game reads `e.code` (correct). On AZERTY the
  physical keys are ZQSD. `navigator.keyboard.getLayoutMap()` can label them (Chromium only)
  [U on the support matrix] [unconfirmed 2026-10-14: support matrix not checked].
- **I3 (L)** The wheel uses `Math.sign(deltaY)` (`input.ts:29-31`), so a Mac trackpad's stream of
  small deltas zooms far too fast. Scale by `deltaY` and `deltaMode`.
- **I4 (L)** `requestPointerLock({ unadjustedMovement: true })` gives raw mouse input without OS
  acceleration [S MDN]. The Promise form is not standard everywhere, so also listen for
  `pointerlockerror`.
- **I5 (M)** No gamepad support. Polling `navigator.getGamepads()` once per frame into the same
  actions costs ~40 lines. It matters for desktop/Steam wrappers ([multiplatform.md §1.3](multiplatform.md)).

**Mobile:** there is nothing for it yet.

- **I6 (H)** No touch input, and pointer lock is unsupported on iOS Safari and Chrome Android
  [S caniuse], so the camera cannot be steered at all. What it needs:
  - Pointer Events with `touch-action: none` on the canvas;
  - a left virtual stick (move/thrust), a right-half drag for look;
  - buttons for interact, pass, jump/ascend and descend;
  - pinch to zoom.

  The action layer (I1) makes this an adapter, not a rewrite.
- **I7 (M)** `index.html:5` has no `viewport-fit=cover`, and the HUD uses fixed px (13 px font,
  a 180 px radar, a long help line in `.bl`) with no safe-area insets ([multiplatform.md §2.4](multiplatform.md)).
- **I8 (H) Quality tiers.** Today: DPR up to 2, MSAA, PCF-soft 2048² shadows of ~800 casters,
  13-pass bloom, 18 k skyline instances, 4,000 CPU rain lines (`fx.ts:6, 50-68`, a 96 KB upload
  per frame while it rains) and 70 people. Proposed tiers [O]:

| Lever | low (phones) | mid | high |
|---|---|---|---|
| max DPR | 1.0 | 1.5 | 2.0 |
| MSAA (composer RT) | off | off (FXAA) | 4× |
| shadows | off, or 1024² every 4th frame | 1024², per frame, snapped | 2048², snapped |
| bloom | quarter-res input, 3 mips | half-res | as now |
| crowd / traffic | 30 / 120 | 50 / 220 | 70 / 320 |
| skyline | sectors within 900 m + impostor ring | sectors | sectors |
| rain drops | 1,000 (GPU) | 2,500 | 4,000 |

  Pick the start tier from a coarse-pointer/screen heuristic. Then **adapt both ways with
  hysteresis**: down after 2 s above 20 ms per frame, up after 10 s below 12 ms. The
  Threejs-Punk drop is one-way and has no recovery ([ref-threejs-punk.md §4.3-4.4](ref-threejs-punk.md)),
  so don't copy that. Store the tier per device (`localStorage`, wrapped in try/catch).

---

## 11. Testability: the `window.__nh` hooks

What is good: `advance(seconds)` runs without the browser's clock (a hidden tab works), there are
`key()`, `teleport`, `place` and `look`, and narrow getters. This already covers most of the
"test protocol" in [game-creator.md §4.1](game-creator.md) and the README's conclusion 5.

| # | Gap | Sev | Fix |
|---|---|---|---|
| T1 | **`__nh.info()` is wrong.** `renderer.info.render` is reset on every `render()` call when `autoReset` is true, *after* the shadow pass [S WebGLRenderer r180; S Info.js]. The composer's last call is `OutputPass`'s full-screen triangle, so `info()` returns about `{calls: 1, triangles: 1}`. | H | `renderer.info.autoReset = false`; `renderer.info.reset()` at the start of each presented frame. Expose `__nh.perf()` → `{calls, triangles, geometries, textures, programs, frameMs p50/p95, tier}`. Until then, Spector.js can count a frame's calls [U, tool not re-checked] [unconfirmed 2026-10-14]. |
| T2 | No single state snapshot. A check has to call 8 getters, and none is versioned. | M | `__nh.state()` → one JSON object `{v: 1, seed, tick, kylo:{pos,vel,onGround,look}, driving, psi, jobs, police:{stars,heat,units[]}, crowd:[…], rain}`, the "state as text" of game-creator. |
| T3 | No reproducibility (§8 X1–X3), so scripted checks can be flaky. | H | A fixed step, seeded streams, `__nh.replay({seed, inputs:[[tick, action, value]…]}) → digest`, where the digest hashes `state()` with `fnv1a64Hex` from `@whz/det`. |
| T4 | `advance()` runs presentation per step (§6): it is slow and has DOM side effects. [confirmed 2026-10-14 with one precision: the HUD `innerHTML` writes, `rain.update` and `sound.update` run every step, but `composer.render` and the radar already run only on the last step (`main.ts:376`, `render = i === n - 1`).] | M | `advance()` calls `game.step()` only, then presents once. |
| T5 | No render endpoint. `preserveDrawingBuffer` is false, so a screenshot must be taken right after the render in the same task. | L | `__nh.shot(w?, h?)` → render, then `canvas.toDataURL()` synchronously (sakura-crossing's `__shot`, [ref-sakura-crossing.md](ref-sakura-crossing.md)). |
| T6 | **No unit tests.** It is the only package whose `check` lacks `vitest run` (`package.json:10` vs every other package). `world.ts`, the jobs and police heat rules and the walker/car physics are pure enough to test in Node today. | M | Add `src/**/*.test.ts`: `floorAt`/`blocksPoint` on a hand-made 3×3×3 grid; a heat timeline (report → cool 10 s → star drops); the fare reward formula; the tunnelling invariant K4; a 600-tick replay digest. |
| T7 | No error capture. | L | `__nh.errors()` from `window.onerror`/`unhandledrejection`, so the QA loop can fail on the first new error (game-creator's `iterate-client` does this). |

---

## 12. State that should be data

CLAUDE.md says "games are pure data". [docs/game-data.md](../docs/game-data.md) allows `data/<table>.json`
rows (integers, booleans and ids only, **no floats, no text**) and `locales/<lang>.json` for
display text, but a table must be declared by a sim system. New Hope's `game.json` has
`"systems": []`. Today everything below is a code literal:

| What | Where | Proposed home |
|---|---|---|
| Fare and signal texts, every HUD message and control help | `jobs.ts:20-32`, `main.ts:231-241, 264-270, 301-309`, `police.ts:45, 131` | `games/new-hope/locales/en.json` + `cs.json` (both exist, both `{}`) |
| Walker: speed 4.6/9 m/s, jump 7.2, gravity 24, radius 0.32 | `actors.ts:12-13, 103, 123` | `data/tuning.json` (record), in mm and mm/s |
| Car: accel 30/−16, boost 1.8, lift 22, grip 3.2, drag 0.55/2.5, max 62, hover 0.35 | `actors.ts:209-256` | `data/carKinds.json` rows (taxi, cruiser, civilian): handling per kind, plus colours |
| Psi: max 100, regen 6/s, cost 60, range 10 m | `main.ts:135-137, 215, 251` | `tuning.json` |
| Heat: crash thresholds 24/40, cooldown 4 s, cool 10 s, arrest 3 s at < 10 m/s, sight 90 m, units = stars + 1 ≤ 6, fine 30 % | `police.ts:49-51, 88, 98, 113-129`, `main.ts:238` | `data/heat.json` |
| Jobs: every 4th is a descent, reward 60 + 1.2·dist, descent 400, fast bonus (90 s − t)·2, min distance 60 m | `jobs.ts:78-87, 102` | `data/jobKinds.json` |
| Counts: crowd 70, traffic 320, rain 4,000, district 48 × 48 × 20 | `traffic.ts:37, 129`, `fx.ts:6`, `world.ts:31` | Quality tiers (code) for the counts; the district size in `tuning.json` |
| Palettes: sky, fog, neon, car paints, crowd looks, KYLO | `sky.ts:9-14`, `city.ts:110`, `traffic.ts:71`, `models.ts:100-111` | `assets/palettes/new-hope.*` (`game.json` already names `"palette": "new-hope"`) + `data/looks.json` |
| Weather cycle 190/120/180 s | `fx.ts:42-43` | `tuning.json` |
| Music: chords and volumes | `audio.ts:13-18, 41, 102` | `audio/` song/SFX files (S4) |

Note: the game-data rule of "integers only" means storing mm, mm/s and basis points, and dividing
once at load. That is cheap and keeps the door open to `@whz/sim` later. **Owner call (below):**
whether New Hope's gameplay rules become declared `@whz/sim` systems (the full D10 path), or
whether `new-hope-play` reads its own tables through `@whz/game-data` without sim systems. [O]

Also stale: `games/new-hope/game.json` says `resolution 480×270`, the 2D template value; D30
made the game 3D at window resolution.

---

## 13. Prioritised upgrade list

**Quick wins** (each well under a day; together ≈ 1–2 sessions) [O]:
1. T1: `info.autoReset = false` plus `__nh.perf()`. Measure before optimising anything else.
2. R1: `antialias: false`; the composer target with `samples: 4` on high only.
3. R6: keep the beam light always in the scene; `compileAsync` behind the start screen.
4. A1–A4, A8, A12: scratch vectors, cached `lightbar`/`pool` refs, a diffed HUD, numeric skyline keys.
5. X1: seeded police phase. X4/X5: hashes.
6. M1 (cheap half): `dispose()` on `setLook`/`swap`/police removal, until the caches land.
7. D4: no shadows from glow parts. R4: texel snapping. R5: one `SUN_DIR`.
8. S1/S2: suspend audio when hidden or muted; one crash noise buffer.
9. K2: sleep parked cars. I3: wheel scaling.
10. R3: `PCFShadowMap`, as the prerequisite for any three upgrade beyond r181.

**Medium** (½–2 days each):
1. D1: instanced crowd (the biggest win, ~800 → ~16 draws incl. shadows). D2/D3: merged, cached cars.
2. X3/T4: fixed-step `Game.step()`, separate presentation, `advance()` = sim only. T2/T3: `state()` + `replay()` + digest.
3. K1: DDA camera with smoothing; K3: police collision and line of sight.
4. I1/I5/I6/I7: action layer, gamepad, touch controls, safe areas. I8: quality tiers with two-way adaptation.
5. D5: skyline sectors (+ impostor ring); C5: GPU traffic and rain.
6. T6: vitest suite in `check`; C3: atlas gutters.

**Structural** (multi-day; needs owner agreement where marked):
1. The module layout below, with an import-boundary lint (`sim/` must not import `render/`, `ui/`, `audio/` or `three` scene classes).
2. §12 tunables and texts to `games/new-hope/data` + locales (**owner call** on sim systems vs plain tables).
3. Lifecycle: `dispose()` everywhere; switch the district without a reload; band-height chunks, LOD and streaming for a bigger city (C1, C2).
4. Three.js upgrade r180 → r186 (R3, R7), then evaluate `WebGPURenderer` + TSL with `forceWebGL` CI ([ref-threejs-punk.md §6.1](ref-threejs-punk.md)). Not before the draw-call work: WebGPU does not fix 800 separate meshes.

---

## 14. Proposed module layout

```text
packages/new-hope-play/src/
  main.ts                  ≈ 60 lines: read the URL/seed, pick a tier, boot(), start the loop
  app/
    boot.ts                build world → sim state → views → ui → debug; returns Game
    loop.ts                fixed 60 Hz accumulator, interpolation alpha, pause on hidden
    quality.ts             tiers, adaptive DPR with hysteresis, persisted choice
    events.ts              typed event queue (jobDone, wanted, busted, passed, crash …)
  data/
    load.ts                @whz/game-data tables + locales → typed Tuning, CarKind, Look, JobKind
    strings.ts             t(id, params) over locales; the only place that formats text
  world/                   pure, no three scene objects, unit-tested
    world.ts               cells, kind/dir/facade (today's world.ts)
    skyline-layout.ts      seeded tower boxes (moved out of sky.ts)
    collide.ts             blocksPoint, floorAt, sweep, dda(ray) → hit cell / distance
  sim/                     pure gameplay; inputs = actions, outputs = state + events
    state.ts               GameState: plain data (positions as numbers or Vector3 only)
    rng.ts                 named seeded streams over @whz/det createRng
    walker.ts  hovercar.ts  crowd.ts  traffic.ts  police.ts  jobs.ts  psi.ts  weather.ts
    step.ts                step(state, actions, dt): calls the systems in a fixed order
  render/                  reads GameState; never writes it
    renderer.ts            WebGLRenderer, composer, bloom, tiers, context-lost
    atlas.ts  city-mesh.ts  skyline-mesh.ts  sky.ts
    people.ts              instanced crowd + Kylo
    cars.ts                merged/instanced cars, pooled police
    fx-rain.ts  fx-beam.ts  beacon.ts
    camera-rig.ts          third person, DDA occlusion, smoothing
    sync.ts                state → Object3D/instances each presented frame
  audio/
    sound.ts               live graph (drone, engine, siren), suspend/resume
    cues.ts                one-shots from @whz/audio SFX files
  input/
    actions.ts             action state + bindings (from data)
    keyboard-mouse.ts  gamepad.ts  touch.ts
  ui/
    hud.ts                 diffed DOM writes; subscribes to events
    radar.ts  start-screen.ts  touch-overlay.ts
  debug/
    nh-api.ts              window.__nh: state(), step(n), replay(), perf(), shot(), errors()
  test/ (or *.test.ts next to files)
    collide.test.ts  police.test.ts  jobs.test.ts  replay.test.ts
```

Rules, enforced by lint, not by hope ([research/README.md](README.md) conclusion 4) [O]:
- `world/` and `sim/` import no DOM and no `WebGLRenderer`/`Scene`.
- `render/`, `ui/` and `audio/` never mutate `GameState`; they consume it and the event queue.
- One file per system, each with a header naming its tunables table. The package README's file
  table (already the convention) is checked by the docs check for existence.

---

## What this means for us

**New Hope.** The game is at the point where each new feature (more people, more cars,
missions) costs more frame time and more `main.ts` entanglement than it should. Spend one
session on the quick wins, with T1 first so the numbers are real. Then do the instanced crowd and
the fixed-step split before adding content. Both directly support the owner's "continue
developing this game" flow: a fixed-step `Game.step()` with `state()`/`replay()` is what lets a
session verify its own change by digest instead of by screenshot. [O]

**Wallhammer / the studio.**
- `__nh.perf()` and `__nh.state()` give the studio's build-progress page numbers to show (draw
  calls, frame-time p95, tier, a replay digest per build).
- Tunables in `games/new-hope/data` make "the game's assets" include its rules, which the studio
  can list and diff like any other asset. [O]

**PixelDen (Phaser 4).** The transferable lessons are engine-agnostic:
- one action layer with keyboard, gamepad and touch adapters;
- quality tiers with two-way adaptation;
- a single `state()` snapshot plus a seeded fixed-step `advance()` per game;
- no system that returns HTML.

A shared "game test protocol" spec (the names and shapes of `state`, `step`, `replay`, `perf`,
`shot`, `errors`) could be one document both portfolios implement. [O]

---

## Open questions for the owner

1. Should New Hope's rules move into declared `@whz/sim` systems (the full "games are data" path,
   integer maths), or should `new-hope-play` read its own tables through `@whz/game-data` with
   float gameplay? (§12)
2. Which mobile target: an installable app (Capacitor, [multiplatform.md](multiplatform.md)) or
   the mobile browser? That decides touch-controls priority and the low tier's budget.
3. Is "same browser + same seed + same inputs ⇒ same run" enough, or is a cross-engine replay
   wanted for New Hope too (it would mean fixed-point physics)?
4. May the one-shot cues move to `@whz/audio` SFX files (reviewed in the studio), while the live
   drone, engine and siren stay WebAudio code?
5. Upgrade three.js to r186 now (PCF shadow change, reversed depth), or stay on r180 until the
   draw-call work is done?

---

## Sources

Repo (read 2026-10-14, commit `cd3edde`): `packages/new-hope-play/**`, `games/new-hope/**`,
`docs/game-data.md`, `docs/DECISIONS.md` (D28–D30), `tools/lint/determinism.js`,
`eslint.config.js`, `package-lock.json`, `packages/*/package.json`, `packages/audio/README.md`,
and the research reports linked in the text.

External:
- three.js r180 `WebGLRenderer.js`: `projectObject` skips invisible objects before `pushLight`; per-material program cache; `lightsStateVersion` change → program change; `info.reset()` under `autoReset` after the shadow pass. https://raw.githubusercontent.com/mrdoob/three.js/r180/src/renderers/WebGLRenderer.js (tag r180, 2025; read 2026-10-14)
- three.js r180 `EffectComposer.js`: default target `{ type: HalfFloatType }`, no `samples`; passes sized by pixel ratio. https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/jsm/postprocessing/EffectComposer.js (read 2026-10-14)
- three.js r180 `UnrealBloomPass.js`: `nMips = 5`, kernels 3–11, 11 targets, 13–14 passes. https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/jsm/postprocessing/UnrealBloomPass.js (read 2026-10-14)
- three.js `Info.js` (common renderer), the `autoReset` guidance for apps with their own loop. https://raw.githubusercontent.com/mrdoob/three.js/r180/src/renderers/common/Info.js (read 2026-10-14)
- three.js releases (r183 20 Feb, r184 16 Apr, r185 1 Jul, r186 24 Sep 2026; PCFSoftShadowMap removed warnings in r186; reversed depth buffer notes r183–r186). https://github.com/mrdoob/three.js/releases (read 2026-10-14)
- A-Frame 1.8.0 release notes (2026-06-23), citing the three.js r182 migration guide: PCFSoftShadowMap deprecated with WebGLRenderer, use PCFShadowMap. https://newreleases.io/project/github/aframevr/aframe/release/v1.8.0
- three.js forum, "Shadow pixelation issue in three.js 0.182.0" (2026) [refuted 2026-10-14: the thread started 2025-12-19; it confirms the r182 WebGL-only deprecation and the fallback bug fixed by #32593]. https://discourse.threejs.org/t/shadow-pixelation-issue-in-three-js-0-182-0/88746
- three.js manual, "How to dispose of objects". https://threejs.org/manual/#en/how-to-dispose-of-objects (not re-fetched; stable page)
- three.js docs: `BatchedMesh`, `DataArrayTexture`, `WebGLRenderer.compileAsync`. https://threejs.org/docs/ (not re-fetched)
- caniuse, Pointer Lock (iOS Safari: not supported through 27.2; Chrome Android 154: not supported). https://caniuse.com/pointerlock (read 2026-10-14)
- MDN, `Element.requestPointerLock()` (`unadjustedMovement`; the Promise form is not yet standard). https://developer.mozilla.org/en-US/docs/Web/API/Element/requestPointerLock (read 2026-10-14)
- J. Amanatides, A. Woo, "A Fast Voxel Traversal Algorithm for Ray Tracing" (Eurographics 1987). http://www.cse.yorku.ca/~amana/research/grid.pdf
- G. Fiedler, "Fix Your Timestep!" (2004). https://gafferongames.com/post/fix_your_timestep/
- ECMA-262, `Math.sin` and others are implementation-approximated. https://tc39.es/ecma262/#sec-math.sin
- Microsoft, "Common Techniques to Improve Shadow Depth Maps" (texel snapping). https://learn.microsoft.com/en-us/windows/win32/dxtecharticles/common-techniques-to-improve-shadow-depth-maps

Licences: no third-party code is recommended for copying. Everything proposed is our own code,
or uses three.js (MIT) APIs and examples already in the dependency tree.

---

## Verification (2026-10-14)

Adversarial fact-check by a second agent against the repo at `cd3edde` (branch `implementation`)
and the external sources below. Inline marks: `[refuted …]`, `[unconfirmed …]`, `[confirmed …]`.

**Repo claims, checked in the code (all held unless noted):**
- Three.js pin: `package.json` `"three": "^0.180.0"`, `package-lock.json` resolves 0.180.0. ✓
- 14 source files; line count is 2,904, not 2,903 (immaterial, marked).
- `main.ts`: `antialias: true` (:26), `setPixelRatio(min(dpr, 2))` (:27), `PCFSoftShadowMap` (:32),
  camera `0.1 / 6000` (:36), anisotropy from `getMaxAnisotropy()` (:40), `new THREE.Vector3(60, 140, 40)`
  per frame (:172), `PASS_COST` 60 (:137), car reach 4.2 (:178), exported `message()` (:189), exit
  offset 2.2 (:200), fine 0.3 (:238), psi regen `dt * 6` (:251), chime after `doneBefore > 1` (:279),
  `N` reload with `Math.random()` (:283), 4 `innerHTML` + 2 `style.opacity` writes per frame outside
  `if (render)` (:300-312), `cars.filter().map()` / `positions()` arrays for the radar (:315-320),
  dt clamp 0.05 (:328), `info: () => renderer.info.render` (:349), `advance()` 1/60 per step (:373-377).
  Camera ray: `camDist ≤ 16`, `× 1.9` driving, `0.25` m steps → 122 probes max. ✓
- `police.ts`: `Math.random()` phase (:83), `target.clone().add(new Vector3(…))` (:95),
  `u.pos.clone()` (:100), `getObjectByName("lightbar")` (:110), `d < 90` sight / `d < 8` close (:113-114),
  grip 3 s at `targetSpeed < 10`, cool 10 s, units `min(6, stars + 1)`, removal without `dispose`. ✓
- `actors.ts`: gravity 24, radius 0.32, 4.6/9 m/s, jump 7.2, array literals in `blocked()`/`hits()`,
  `cell()` object, car constants 30/−16, 1.8, 22, 3.2, 0.55/2.5, 62, hover 0.35, `getObjectByName`
  ×2 per car per frame. `hits()` runs 2–3× (not 3–4×) and a parked car makes 24 probes (not 36): marked.
- `models.ts`: `castShadow = true` on every part (:14); person = 11 (plain) / 12 (visor) / 13 (Kylo)
  meshes, shoe material per leg (:52); car = 20–22 meshes, `glow()` in the thruster loop (:142). ✓
- `sky.ts`: fog `0.0031` (:100), `fog: false` on the sky (:22), 2048² shadow map over ±90 m with
  `far 600` (:106-113), string keys in `outside`/`outsideFloor` (:175, :181), `frustumCulled = false`
  on towers and beacons (:224, :235), 4 ground planes. Skyline arithmetic (155² grid, `ix % 5`,
  `iz % 6`, ≈ 16 k towers + crowns) is consistent with the code but not recomputed exactly.
- `fx.ts`: 4,000 drops, `Math.random` layout, 190/120/180 s cycle, `needsUpdate` of a 96 KB buffer
  per frame, `PointLight` inside a `visible = false` group (:84-86). ✓
- `audio.ts`: 10 pad oscillators (5 notes × ±7 cents; the code comment says "five"), 3 s stereo
  convolver, 2 noise loops, mute = gain ramp only, 8 `setTargetAtTime` per frame, `crash()`
  allocates a buffer. ✓
- `input.ts`: `e.code`, `Math.sign(deltaY)`, edges cleared in `endFrame`. Pointer lock requested in
  `main.ts:115, 117` without options. ✓
- `textures.ts`: 8 × 8 × 64 px = 512², `LinearMipmapLinearFilter`, anisotropy 8 then overwritten,
  `inset = 0.5 / size`. ✓  `city.ts`: `CHUNK = 16`, all storeys per chunk, per-face `h(f + 10) * 8`
  variants, 4 instanced detail meshes, gear only casts. ✓  `traffic.ts`: 320 flyers, 3 instanced
  meshes, 70 people, seeded LCG consumed on arrival (:219), `swap()` rebuilds a person. ✓
  `jobs.ts`: every 4th job a descent (400), reward `60 + 1.2·dist`, fast bonus `(90 − t)·2`,
  `clone().sub()` in `hud()`. ✓  `world.ts`: `TILE = STOREY = 4`, 48 × 48 × 20. ✓
- `games/new-hope/game.json`: `resolution 480×270`, `systems: []`; `locales/en.json` and `cs.json`
  are `{}`. `docs/game-data.md`: no floats, no text, tables declared by systems. ✓
- `eslint.config.js:16-28` is the `DETERMINISTIC` list; `new-hope-play` is not in it. ✓
- `check` scripts: `new-hope-play` is the only package without `vitest run`. ✓
- Cross-references to `research/*.md` sections (§2.2–2.4, §1.3 of multiplatform; §4.1 of
  game-creator; §3.5, §3.12, §4.3–4.4, §6.1 of ref-threejs-punk; `__shot` in ref-sakura-crossing)
  exist. README conclusion 4 is about knowledge bases drifting from code; a loose fit for "rules
  enforced by lint", not wrong.

**External claims:**
- three.js r180 `EffectComposer.js:69`: default target `{ type: HalfFloatType }`, no `samples`;
  `addPass`/`setSize` scale by `_pixelRatio`. ✓ → R1 holds (the scene pass is not multisampled).
- r180 `UnrealBloomPass.js`: `nMips = 5` (:101), kernels `[3, 5, 7, 9, 11]` (:148), input at
  `resolution / 2` (:102), 1 + 10 half-float targets, 13 `fsQuad.render` calls. With `RenderPass`
  and `OutputPass` that is 15 `renderer.render()` calls per frame. ✓
- r180 `WebGLRenderer.js`: `shadowMap.render(…)` (:1606) then `if (info.autoReset) info.reset()`
  (:1612); `projectObject` returns on `visible === false` before `pushLight` (:1711, :1723);
  per-material `lightsStateVersion` program check (:2074). `compileAsync` exists (:1408). ✓ → T1, R6 hold.
- `src/renderers/common/Info.js` exists at tag r180. ✓
- Releases (GitHub API): r180 2025-09-03, r181 2025-11-19, r182 2025-12-10, r183 2026-02-20,
  r184 2026-04-16, r185 2026-07-01, r186 2026-09-24. ✓ r186 notes: "Warn when using removed
  PCFSoftShadowMap", "Remove remaining PCFSoftShadowMap code". ✓
- Migration guide 181 → 182: "`PCFSoftShadowMap` with `WebGLRenderer` is now deprecated. Use
  `PCFShadowMap` which is now soft as well." ✓ 185 → 186 names the `WebGPURenderer` removal.
  `reversedDepthBuffer` was renamed in 178 → 179, so it already exists in r180 (R7 marked).
- A-Frame 1.8.0: June 23, 2026, "PCFSoftShadowMap with WebGLRenderer is now deprecated", ships r184. ✓
- Forum thread 88746: started 2025-12-19 (not 2026); Mugen87: WebGL-only deprecation, fallback bug
  → PR #32593 (in r183). Marked.
- caniuse Pointer Lock: iOS Safari 3.2–27.2 not supported; Chrome for Android 154 not supported. ✓
- MDN `requestPointerLock()`: `unadjustedMovement` documented; the Promise form "is not yet a
  standard and is not implemented by all browsers"; listen for `pointerlockchange`/`pointerlockerror`. ✓
- Arithmetic re-done: MSAA 3024 × 1964 × 4 × 8 B ≈ 190 MB; composer 2 × 47.5 MB + bloom 12 + 32 MB
  ≈ 140 MB; fog `e^−(0.0031·700)²` ≈ 0.9 %; rain 4,000 × 6 × 4 B = 96 KB; towers 18 k × 12 tri ≈ 216 k. ✓

**Not checked / unconfirmed:** the DevTools MCP being held by another session; Spector.js;
`navigator.keyboard.getLayoutMap()` support; the three.js manual "dispose" page and the
`BatchedMesh`/`DataArrayTexture` doc pages (not re-fetched; both classes exist in r180); the exact
skyline instance count; every number in §2.1's "300–900 meshes" estimate (no measurement, as the
report says).

**Gaps worth knowing:** (1) the 140 MB target estimate omits the depth buffer of the composer's
`renderTarget1` (`depthBuffer` defaults to true) and the shadow map (2048² × 4 B ≈ 16 MB); (2) the
r182 fallback bug means an upgrade straight to r182 is worse than r183+; (3) the report's
"re-rendered every frame" shadow claim relies on the default `shadowMap.autoUpdate = true`, which
the code never changes (confirmed by grep); (4) nothing was measured in a browser, so the draw-call
and frame-time figures remain estimates until T1 lands.
