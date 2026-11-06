# Voxel Musou — code analysis for Wallhammer Zero

- **Source:** https://github.com/mike007jd/voxel-musou (MIT license), commit `aba5fb8` (2026-10-04)
- **Local clone (read-only, nothing was run):** a temporary local clone
- **File references:** `file:line` paths are relative to `src/` unless stated otherwise.

---

## 1. Overview

Voxel Musou is a Dynasty Warriors style hack-and-slash in the browser. It uses Three.js r186, which is vendored. From the addons it takes only `UnrealBloomPass`, `Pass`/`FullScreenQuad`, `CopyShader` and `LuminosityHighPass`.

**Game content:**
- Seven playable officers: Liu Bei, Guan Yu, Zhang Fei, Zhao Yun, Zhuge Liang, Huang Zhong and Lü Bu.
- Four maps: Hulao, Changban, Chibi and Dingjun.
- Modes: story (scroll map), trials and free battle.
- The game has 300 soldiers. With `?enemies=N` it can go up to 2000. On top of that there are six officer slots and 40 allies.

**Checking the author's claims.** The author's notes in the README and in reports are out of date. The table shows how it really is.

| Claim | Reality |
|---|---|
| "~9 300 lines in 32 files" | **105 files in `src/`, 25 972 lines of JS.** Plus `index.html` (954 lines) and `checks/` (5 Node scripts, 736 lines). Lines by directory: chars 6819, world 4267, hero 2637, story 2147, vfx 2068, ui 1702, crowd 1625, musou 1087, audio 932, combat 768, actors 656, core 464, camera 321, post 334. |
| `core/voxel.js` 146 lines | 124 lines |
| `hero/model.js` 342 lines | 358 lines |
| "Zero textures" | **Half true.** There are no image files in the game. But textures are generated at runtime: a 1024 px canvas of soil with a 24 m tile (`world/terrain.js`), a 256 px grass `DataTexture`, a 16 px grass tuft sprite, flags with calligraphy drawn by a system font onto a canvas (`crowd/view.js:220-237`) and banners in `world/dressing.js`. A font is bundled: `ui/brush.woff2`. |
| "Retro pixel look" | **It is not a resolution reduction.** The scene is rendered at full resolution. In the final pass a 4×4 Bayer dither on a 2 px grid and a quantisation to 72 levels are added (`post/post.js:195-198`). |
| Skinned characters | **They are not skinned.** Every joint of the rig has its own rigid voxel mesh, so these are rigid segments. |
| Deterministic simulation | True only within a single JS engine. The simulation uses `Float64Array` and `Math.sin/cos/atan2/hypot`, whose results are not guaranteed across platforms. Audio uses `Math.random`. |
| Cascaded shadows | **There are none.** There is one 2048² shadow map in a ±34 m box that moves with the focus. |

**What it is.** A single author (very likely with help from an LLM, see comments such as "combo-system r4" and "locomotion-dodge r3") brought a web-tech game to a remarkable level of *game feel*. The comments in the code are unusually good and explain *why*. Most of the value for us lies in animation, combat feel, the crowd and the post-process. The voxel mesher itself is not worth much.

---

## 2. Architecture

### 2.1 Layers

- **`core/`** — RNG, voxel builder and event bus.
  - **`rng.js`**: mulberry32 with two streams. `rng` serves the simulation, `vrng` the visuals. Plus a stateless `hash01(a,b,c)`.
  - **`events.js`**: a synchronous bus `on/emit/collect`. The header of the file is a complete catalogue of events.
- **`world/map.js`** — the map, available to both the simulation and the render. It contains no THREE, is safe for the simulation and can be run in Node.
- **Simulation (no THREE):** `hero/hero.js` (the `h.step` part), `combat/`, `crowd/crowd.js`, `actors/`, `musou/musou.js`, `story/`.
- **Views (THREE):** `hero/model.js`, `rig.js`, `secondary.js`, `crowd/view.js`, `vfx/`, `world/*` except `map.js`, `post/`, `camera/`, `musou/view.js`.
- **Audio:** `audio/` (the bank is baked offline, a bus graph runs at runtime).

### 2.2 Contracts worth taking over

1. **The simulation emits, the render listens and must not change simulation state.** The whole visual layer (VFX, sound, camera shake) hangs on events (`hits`, `ko`, `enemy:land` …).
2. **`y` in the simulation is the height above the terrain.** The value `ground(x,z)` is added only in the render, so the simulation does not need a heightfield in full quality.
3. **Hitboxes are data, not bones.** The moves table (`hero/moves.js`) defines the frame range, shape (`arc`/`circle`/`line`), reach, angle, damage, knockback and hitstop. The animation is just "fitted" to these frames.
4. **The pose is a pure function of the simulation state** (`heroPose` in `hero/hero.js`). The render only evaluates it.
5. **Two RNG streams.** The visuals (`vrng`) must not advance the simulation `rng`. Both are reset at the start of a battle (`main.js:143`: `vrng.seed(7936); rng.seed(1)`).

### 2.3 Loop (`main.js:273-285`)

```js
const d = Math.min(0.1, Math.max(0, (now - last) / 1000));
acc += d * (game.timeScale ?? 1); last = now;                // story: victory slow-mo
...
while (acc >= 1 / 60 && n < 4 && state === 'battle') { step(); acc -= 1 / 60; n++; }
if (n === 4) acc = 0;
render();
```

- The simulation has a fixed step of 60 Hz, at most 4 steps per frame. When the cap is exhausted, the accumulator is dropped and the game slows down instead of a death spiral.
- `timeScale` provides the victory slow-down.
- **Render interpolation is missing** (alpha). `render()` computes `dt` as `(frame − lastRenderFrame)/60`, i.e. in *simulation* time.
- Camera shake, particles and camera smoothing age in simulation frames. This makes recordings deterministic, but on a 144 Hz monitor the motion is 60 Hz stair-stepped.
- The order of steps in `step()` (`main.js:97-108`): camera → hero → combat → crowd → actors → pickups → musou → story → `frame++` → `vfx.afterStep`.

### 2.4 Tests (`checks/*.mjs`)

These are Node scripts with `node:assert` that import the simulation modules via `registerHooks`, so that they redirect `three` to the vendor copy:

- **`trials-bot.mjs`** runs the real 60 Hz simulation (hero, combat, crowd, actors, director) with only bot inputs. For every run it prints one JSON record with a seed, an event timeline and statistics. It serves as a balance probe.
- **`shared-originality.mjs`** checks the finiteness of the geometry and the timing of the scripted Musou.

Golden hashes of images or of state are **not** there. But for us the pattern "headless bot over a pure simulation → JSON" is exactly what we want in `tools`.

---

## 3. Rendering pipeline

**Order within one frame** (`post/post.js:297-332`, render targets at `:210-215`):

1. **Scene** → `sceneRT` at full resolution, HalfFloat, MSAA 4×, with a `DepthTexture`.
   - Before it, the Three shadow pass runs: one 2048² map (`world/world.js:55-61`) with a bias of −0.0006 and a normalBias of 0.03.
2. **Atmos** (`post.js:52-80`) → `atmosRT` at full resolution, nearest filter.
   - From the depth it reconstructs the view-space position and adds haze and inscatter that react to the sun.
   - It clamps the colour in HDR. Into alpha it stores the distance, which DoF then reads.
3. **DoF** (`post.js:85-105`) → `dofRT` at half resolution.
   - A single-pass gather after Gustafsson along the golden angle with a square bokeh.
   - CoC according to `post.js:45-50`.
4. **Bloom** — `UnrealBloomPass` at half resolution.
   - A custom high-pass with a cooler bias and tones by mip.
5. **God rays** (`post.js:110-126`) → `raysRT` at half resolution.
   - A radial blur with 36 samples and jitter. When the sun is off screen, the pass is skipped.
6. **Final** (`post.js:128-200`), in order:
   - a mix of the sharp and blurred image, unsharp mask
   - chromatic aberration, horizontal streaks, adding god rays, line noise
   - split-tone grade and saturation
   - **Lottes tone curve** with a soft shoulder per channel
   - "hot desaturation" by luminance, lift
   - sRGB OETF, vignette, a darker bottom strip, flash, grain
   - **Bayer + quantisation** (retro)

**Adaptive MSAA** (`post.js:274-282`). When the EMA of the frame time exceeds 20 ms for 120 frames, MSAA drops 4 → 2 → 0.

**Per-map look.** `setLook` (`post.js:250-258`) and `world.load()` change **only uniforms**, so nothing is recompiled when the map is switched. Before a battle the shaders are warmed up via `compileAsync`, hidden behind a loading card (`post.compile`).

### Lights (`world/world.js:22, 53-75`)

- **Hemisphere light.**
- **Sun:** a directional light with a shadow.
  - The shadow box moves with the focus and is snapped to texels (`:131-135`).
  - At the edges of the box the shadow fades out softly (a shader chunk patch, `:28-34`). The border of the shadow map is therefore not visible, even though cascades are missing.
- **Rim directional light.**
- **Three point "fire" lights.** They rotate between the nearest spots with a light on the map and cross-fade (`:151-163`). The number of lights is fixed, so the shaders have a constant number of lights and do not recompile.
- **Stage key and fill** for the selection screens.
- **The hero has its own fill and a Fresnel rim** (`hero/model.js:276-290`, `heroLook`).
  - It is injected into `MeshStandardMaterial` via `onBeforeCompile`.
  - The rim is damped where the surface is already light.
  - Result: the hero is legible against the crowd in every scene.

### Fog (`world/sky.js:110-139`)

The fog replaces the Three fog chunks. Steps:

1. Fog factor `1 − exp(−((d − near)/far)^1.6)`. The exponent 1.6 gives a softer onset close up and a faster thickening further away.
2. Thinning with height: `1 − 0.4·smoothstep(6, 45, y)`.
3. **Aerial perspective as a chroma shift.** The luminance of the pixel is preserved and only the hue changes, toward cool or toward warm according to the direction to the sun. Range 25–160 m, strength 0.42.
4. **Ground dust.** Peach in backlight and lilac elsewhere, with an exponential falloff with height.
5. The result is mixed with the haze colour (`dwHaze`) and multiplied by `FOG_K = 0.62`.

`hazeColor` is the CPU twin of the GLSL function, so the CPU and GPU colours match. It is used for clouds, mountain silhouettes and the UI.

### Sky (`world/sky.js`, `createSky`)

A dome of radius 900 m:
- a gradient and a horizontal band
- **blocky clouds** via `floor(uv·9)/9` in the fbm, to match the voxel style
- the sun disk

---

## 4. Key techniques in depth

### 4.1 Voxel builder (`core/voxel.js`, 124 lines)

**Three inputs:**
- **`boxesGeometry(boxes)`**
  - Takes boxes `{s, p, c, r?, skip?}` with an Euler rotation.
  - **No culling between boxes.** Hidden faces are omitted only by a manual `skip`.
  - It is a "quad soup" from `makeBuilder()`. Each corner has a brightness `k` (AO), the diagonal of the quad can be flipped (`flip`).
- **`voxelGeometry(grid)`**
  - Emits only exposed faces.
  - **No greedy meshing**, so each voxel gives up to 6 quads.
- **`sculpt(boxes, v = 0.034, jitter = 0.09)`**
  - Rasterises AABB boxes into an `Int32Array` grid.
  - A box can have one of these colours:
    - a constant,
    - **a function `(x,y,z) → colour`**,
    - `−1` carves out the volume (carve),
    - `paint` only recolours already filled voxels.
  - Then it adds a per-voxel brightness jitter via `hash01` and meshes it.
  - It is used by the crowd, the VFX and the world.

**Cost:** O(grid volume) on the CPU at startup. Nothing at runtime, the geometry is static.

**Limitations:**
- Without greedy meshing the triangle count is large: a soldier is ~4.9k tris in the near LOD.
- For static models this is fine, for terrain at scale it would not work.

### 4.2 Hero model → grid → mesh with AO (`hero/model.js:32-75`)

The hero is described as a list of boxes in integer voxel coordinates. The voxel size is `V = 0.025` m, for heads and fine parts `HV = 0.0175`.

The mesher `vox()`:
- Leaves a one-voxel empty margin around the model.
- Rasterises the boxes. Function colours allow patterns: lamellae, seams, hems.
- For every exposed face it computes **classic AO from three neighbours** at each corner.
- Based on the AO it chooses the **diagonal of the quad**.

The core (shortened):

```js
const AO = [1 - ao, 1 - ao * 0.6, 1 - ao * 0.25, 1];   // ao = 0.42
...
const a = full(...s1), b = full(...s2);
lv[q] = a && b ? 0 : 3 - a - b - full(...cc);         // 0 = fully occluded corner
kq[q] = AO[lv[q]];
...
vb.quad(corners, f.n, r, g, b, kq, lv[0] + lv[2] < lv[1] + lv[3]);  // flip the diagonal
```

**Other parts:**
- **Voxel colour:** `shade(c, 1 − jitter/2 + hash01(i,j,k)·jitter)`. A deterministic brightness noise of ±2.5 % breaks up the surfaces without looking like a texture.
- **`lamellar()`** generates rows of lamellar plates with seams, hems and tucked edges. This produces those "woven" armours on the selection screen.
- **`B`, `P` (paint), `mirX`** — helpers for building, recolouring and mirroring along the X axis.
- **`chars/parts.js`** uses a fine voxel `FV = 0.0125`. Hands, gloves, bare arms, forearm guards and boots are parametric functions `(x,y,z)`.
- **`bodyParts(pal)`** uses the same body with different palettes. Officers thus differ by palette and kit, not by new geometry.
- **Material:** `MeshStandardMaterial` with `vertexColors`, `flatShading` and an albedo ×0.8.
- **Every joint is a separate `Mesh`** with `castShadow`. The shoulder guards hang on auxiliary joints.

**Cost:** a few ms per character at startup. At runtime a draw call per hero part (~15–25), which does not matter for a single character.

**Limitations:**
- Rigid parts mean that the silhouette and the AO "break" at the joints. The voxel style masks this, but in a GTA III/WoW style it would be visible.
- Real skinning is missing.

### 4.3 Rig and procedural animation (`hero/rig.js`, `hero/anims/*`)

**Pose representation:**
- The pose is a flat `Float32Array` with 45 channels (`POSE_SIZE`).
- It contains the position and angles of the pelvis, torso, head, foot targets (position + pitch/yaw) and a **separate weapon joint** under the root (position + yaw/elev/roll).
- `blendPose` interpolates linearly and wraps the angles by the shortest path.

**Weapon-first approach:**
- The animator (in code) keys the *spear*, not the hands.
- The hands are placed on the shaft with **analytic two-bone IK** (`solve2`, `rig.js:218-234`) and can slide along the shaft (`reachOnShaft`).
- A free hand can switch to FK (`lfree`/`rfree`).
- `spearElev` rotates the weapon around the grip so the tip never goes below the ground.

**Two-bone IK** (law of cosines with a pole):

```js
d = clamp(|target − S|, |lenA − lenB| + 1e-3, (lenA + lenB)·0.9995)
cosA = (lenA² + d² − lenB²) / (2·lenA·d)
E = S + D·lenA·cosA + pole⊥·lenA·sinA      // elbow/knee
aim(upper → E), aim(lower → target)
```

**Legs:**
- Solved via foot targets and IK, the knee pole is taken from the yaw of the foot.
- When the feet cannot be reached, `createRig().apply` **lowers the hips** by up to 12 cm. The character thus rather crouches than has its feet "up in the air".

**Clip authoring** (`rig.js` `clip/sampleClip`, `anims/author.js`):
- **Channel interpolation:** per-channel Hermite with Catmull-Rom or monotone tangents (Fritsch–Carlson, no overshoot on strikes).
- **Easing per segment:** `lin/in/out/io/snap`.
- **Synchronisation with hitboxes:** the clips are keyed directly to the hitbox frames from the moves table, so the animation and the hitbox cannot drift apart.
- **Foot baking** — `makeAuthor().clipF` **pre-bakes per-frame foot tables**:
  - `plantFoot` (`author.js:29+`) holds the foot in place until the target moves by more than `HOLD = 3.5 cm` and at the same time the foot is below `CONTACT = 0.12` m.
  - Otherwise it generates a step 3–10 frames long with a lift of 0.07–0.24 m.
  - On touchdown it adds a **pelvis dip** of `−0.04·v` for 4 frames.
  - The end feet of one move are chained into the input of the next.
- **`blendStep` / `turnPose`:** during transition blends the feet *walk*. If they have to cover more than 4 cm, they lift. During a transition nothing slides.

**Running is purely procedural** (`anims/locomotion.js:85-130`):

```js
const v = k * LOCO.runSpeed, T = 2 / cadence(v);
const s = 0.5 - 0.2 * k;            // stance fraction; a flight phase appears with speed
const Ls = v * s * T;               // step length = speed · stance time → zero slip
if (p < s) { u = p/s;  z = zc + Ls*(0.5 - u); y = 0.08; pitch = -0.15 + 0.75*u*u; }
else       { e = smoothstep(u); z = zc + Ls*(e - 0.5) - 0.2*k*sin(πu)*(1-u);
             y = 0.08 + (0.08 + 0.34*k)*sin(π·u^0.75); }
bob = -cos(2π(q - s));               // low in mid-stance, high in the flight phase
```

In the stance phase the foot moves backward **exactly at ground speed**. It is slip-free by construction, no foot-locking IK is needed. The motion further contains:
- the pelvis bobbing up and down,
- the pelvis shifting over the stance leg,
- counter-rotation of the shoulders,
- a lean in turns (`lean`).

**Dodge:**
- It is a procedural roll (`rollPose`, `applyRoll`) with squash & stretch.
- Plus "ghosts" (`createDodgeGhosts`): a depth pre-pass and a shell with a rim from back faces, so the afterimages do not overlap themselves.

**Blend lengths** (`hero/hero.js`): 5, 3, 6 and 8 frames depending on the transition type. The animation bookkeeping (`animDesc`/`updateAnim`) lives in the simulation, so the pose is deterministic.

**Secondary motion** (`hero/secondary.js:19-170`):
- **Verlet chains** with gravity, wind gusts (a sum of two sines with a phase per chain), drag and a stiff pull toward the rest direction.
- **Cone limit**, 2 constraint iterations, **sphere colliders** on the head, chest, hips, thighs and knees.
- Sub-stepping at 120 Hz, at most 6 steps per frame. The anchor is interpolated within a frame, so fast swings pull the chain smoothly.
- **Render only**, the simulation does not know about the chains.
- The segments are voxel plates oriented per frame (`matrixAutoUpdate = false`).
- Zhao Yun carries: a cloak 6×0.17 m, an apron (3), a braid (8), 2 ribbons (5) and 5 strands of a tassel (3). `chainSet` additionally makes the shoulder guards swing halfway.

**Cost:** `solve2` is a few tens of flops. Foot baking happens at startup. Verlet costs on the order of hundreds of points × 6 substeps, which is negligible.

**Limitations:**
- Rigid segments.
- The IK does not solve collisions with terrain beyond the height `ground()`.
- The chains do not collide with the environment, only with the body.

### 4.4 Crowd instanced layer (`crowd/crowd.js`, `crowd/view.js`)

**Simulation** (`crowd.js`):
- SoA in `Float64Array`/`Int32Array`, a state machine `ST`, `KIND`.
- **Squads and slots on rings** around the hero.
- **Attack token system:** only 3 may attack at once. Plus feints.
- `engaged` 84, waves, duels.
- A spatial grid `CELL = 1.2 m`, `GRID = 400`, at most 64 squads.
- Every soldier has its own hitstop `c.hs[i]` (max 3).

**View** (`view.js`):
- **One `InstancedMesh` per *body part* × LOD × army.** The parts are hips, torso, head, arm, thigh, shin and weapons.
- **The matrices are composed on the CPU** per soldier hierarchically (`write()`, `view.js:655+`): pelvis → torso → head/arms → weapon and pelvis → thigh → shin. The pelvis height is computed from the leg angles.
- **A soldier's pose has 26 channels** (`NCH`, `:241`). It is blended exponentially.
- Three `RECOIL` variants (reaction to a hit) are picked via `hash01` and mirrored.

**Three LODs** (`:459-461`, `MID_LOD = 8`, `FAR_LOD = 28`), all with the same pose and matrices:
1. **Near:** sculpt with `V = 0.042`, ~4.9k tris.
2. **Mid** (8–28 m): re-voxelised at 2V, ~1.2k tris.
3. **Far** (> 28 m): full boxes (`:196-202`), ~450 tris.

**Shadow proxies** (`:189-194`, `:427-428`):
- Unvoxelised boxes that are drawn only in the shadow pass.
- A hack: in `onBeforeRender`, `drawRange.count = 0` is set, so nothing is drawn in the main pass.
- The detailed mesh has `castShadow` turned off.

**Cull and replay:**
- A sphere frustum test (r = 2.5 m) for every soldier (`:734`).
- **Idle replay** (`:738`, `:634-650`). Idle soldiers are recomputed only every 4th frame (`(frameNo + i) & 3`). In between, the stored matrices are replayed. The cache has `REC = 16` instances per soldier.
- **Empty meshes are not drawn** (`:744`: `m.visible = m.count > 0`). Instances are packed from zero every frame.

**Hit flash** (`patchHitMaterial`, `:337-371`):
- An instance attribute `aHit` (vec3).
- A value > 1 means a white "pop" for one rendered frame.
- Then comes a golden, amber or red tint according to the strength of the hit, plus an emissive rim `(1 − |N·V|)⁴`.

**`nearFade`** (`:297-324`):
- A dithered dissolve of soldiers near the camera.
- A **sight cone** from the camera to the hero (and to the dragon). Soldiers who would block the hero dissolve through a Bayer threshold.
- It is cheap, nothing is sorted and no alpha blending is needed.

**Other details:**
- A hue-masked emissive glow by army (`uGlow`).
- Flags wave in the vertex shader with a phase from `instanceMatrix`.
- Strike telegraphs: a "glint/flare" as a pixel star above the crowd.

**Cost:** The main cost is composing matrices on the CPU, on the order of 10–14 matrices × 300–2000 soldiers per frame. That is why idle replay and LOD came about. The number of draw calls is roughly parts × LOD × armies, i.e. tens, and does not depend on the number of soldiers.

**Limitations:**
- No GPU skinning and no VAT.
- At 2000 soldiers the CPU is the bottleneck. JS manages only thanks to replay and culling.

### 4.5 Debris and VFX (`vfx/vfx.js`, 1413 lines)

**Particles** (`makePool`, `:508-598`):
- Instanced cubes with kinds: 0 needle, 1 debris, 2 dust, 3 ember, 4 shard, 5 flame.
- **Debris:** gravity 22 m/s². On landing at a speed below −1.5 m/s it bounces with a coefficient of −0.32 and damps the horizontal speed ×0.55. Then it settles and stays lying.
- Rotation is proportional to `0.16/size`: large stones spin slower, as if they had mass.
- **Age is counted precisely per frame**, sub-stepping 1/30. Live particles are packed from slot 0.
- The debris pool has 2000 instances, casts shadows and uses `lensClear` (2.8 m).

**`clumpGeometry()`:**
- A 2×2×2 cluster without one cube.
- The inner faces are omitted (84 → 48 tris).
- The shape of a "pebble" is thus more organic than a pure cube.

**KO** (`:989-1006`):
- 9 pieces of debris. For an officer 14, during Musou only 4, because there are a thousand victims in the scene.
- The amount scales with the camera distance.
- Plus body blocks (helmet, torso, shield) that bounce, settle and stay lying.
- Further needles, for an officer a flash of light, a ring, embers and dust.

**Other effects:**
- **Slash ribbon:** sampled from the *pure pose function* (`weaponWorld`/`spearWorld` in `rig.js`). So between simulation frames the trail can be resampled densely without history.
- Thrust streaks, contact stars and needles, finisher volumes.
- Crack decals in the ground (visible in the screenshots as dark "veins").
- `makeQuadPool` makes rays and stars on quads with a shader.

**Ageing during hitstop:** during hitstop the VFX age at half speed, so sparks "hang" with the blow.

### 4.6 Combat feel (`combat/combat.js`, `camera/camera.js`, `hero/moves.js`)

**Hitstop is local to the hero.**
- `game.hitstop` makes `hero.step` end right at the start (`hero.js:61`). The buffered input stays.
- **The crowd keeps simulating.** The victims get their own `c.hs[i]` and shake with a sine in the render.
- The combo thus does not get stuck, but the blow has weight.

**Hitstop scaling** (`combat.js:86-95`):

```js
if (hit.sweep) { if (key === sweepKey) return 0; sweepKey = key; }   // one stop per sweep
if (hit.heavy && key !== heavyKey) { heavyKey = key; return clamp(base, 6, 8); } // once per window
return Math.min(COMBAT.stopMax, 1 + Math.floor((count - 1) / COMBAT.stopPer)); // 1 frame + 1 per every 5 victims, max 4
```

A hit on 40 soldiers thus does not freeze the game for 40 frames. The feeling of "weight" grows logarithmically with the number of victims, not linearly.

**Other hit rules:**
- **Hit shapes** (`inShapeAt`, `:48-59`): arc (reach, angle, direction), circle and line. It is pure 2D geometry in the XZ plane.
- **Strike** (`:101-120`) is a **linear pass over the whole crowd**. For 300 soldiers it is enough, for 2000 it is borderline.
- **`every: ONCE`** and windows `f: [7, 10]`: each hit is evaluated once within the window (`lastHit[i] = key`).
- **Knockback types:** `flinch / push / launch / blow / spin / armor`.
- **Launching into the air** is physical, with an "apex float" (it slows down near the peak).
- **Landing flat:** for a rotating body the rotation is planned so it **lands flat**. The rotation is computed from the flight time.

**Camera** (`camera/camera.js`):
- Parameters: distance 5.8, height 1.35, pitch 17°, FOV 48.
- Critically damped following, dead-zone 0.35, look-ahead.
- A three-stage pull-back by crowd density.
- The boom is shortened by marching along the SDF walk-field (`occlusion.js`, no raycasts).
- **Micro-kicks** driven by events, aged in simulation frames:

```js
const a = k.px * Math.exp(-age * 3 / k.len) * Math.cos(age * Math.PI / 3);
// px limited to kickMaxPx = 6 px at 720p, converted to rotation via fov·DEG/720
```

  They are defined in *screen pixels*, so they look the same at any FOV and resolution. They are triggered by:
  - hits (heavy: `min(4.5·w, 2.2 + 0.15·count)`),
  - damage,
  - a hard landing,
  - the Musou burst (6 px).
- **`lensClear`**: fragments closer than `near` are discarded, so debris and soldiers do not slap the lens.

**Musou** (`musou/musou.js`, `view.js`):
- A timeline in frames: closeup 30, pullback 88, chase 100, contact 132, finisher 176, end 200.
- The dragon's path is a **shared curve** (`dragonAt`) for the hits in the simulation and for the visuals.
- The dragon is composed of instanced shaded boxes along 46 segments.
- Colour grading via a DOM/CSS overlay. The calligraphic cut-in is in `overlay.js`.
- An additive fullscreen triangle with radial rays is placed at a depth such that bodies in front clip it.

### 4.7 Post effects and the "retro pixel look" (`post/post.js`)

**Tone curve (Lottes 2016)**

$$
y = \frac{x^a}{(x^{a d})\, b + c}
$$

- The constants `b` and `c` are computed in `setLook` from `midIn`, `midOut` and `hdrMax`, so the map sets "where the middle is", not raw numbers.
- The soft shoulder is separate for each channel.
- **Hot desaturation** is driven by *luminance*, not by channel overflow. A saturated orange flame stays orange and only the white core bleaches (`post.js:186-189`).

**DoF:**
- A single pass, a gather along the golden angle (Gustafsson 2018).
- It reads the distance from the alpha of `atmosRT`.
- Half resolution, square bokeh.

**God rays:** 36 samples with jitter, only when the sun is on screen.

**The retro step** (`post.js:195-198`):

```glsl
c += (hash(gl_FragCoord.xy + fract(uTime * 7.31) * 97.0) - 0.5) * uGrain;   // fine grain
c += bayer4(floor(gl_FragCoord.xy * 0.5)) * uDither / uLevels;            // dither on a 2px grid
c = floor(c * uLevels + 0.5) / uLevels;                                   // 72 levels per channel
```

The geometry stays at full resolution. The retro impression is made only by the 2 px dither and posterisation (72 levels = ~6.2 bits), plus line noise. In the screenshots you can hardly tell, except in sky gradients.

### 4.8 Procedural audio (`audio/bank.js`, `audio/audio.js`)

**Offline bank:** everything is baked at startup via `OfflineAudioContext`.

- **Voices (`voice()`) — formant synthesis:**
  - a saw with an f0 envelope, jitter noise, vibrato
  - "growl" AM
  - **4 band-pass filters for formants**
  - aspiration, breath, hoarseness, fricative
  - This produces the "kiai" shouts (`LINES`), `grunt` and `cry`, and `bakeVoice` for each hero.
- **Impacts (`impact()`)** — layers:
  - click, crack, a falling "shk"
  - an armour crunch
  - a sine "thump" through a waveshaper, thwack, punch, grains
  - for heavy blows a sub-drop
- **Music:** taiko, chords, a power-chord riff and `bakeLoop` with an equal-power crossfade.
- **Reverb:** an IR from 1.5 s of decaying and darkening noise (`makeIR`), convolution.

**Runtime** (`audio.js`):
- A bus graph: sfx/vox/bed → 5-band EQ → compressor (attack 25 ms) → a soft-clip WaveShaper with a tanh knee.
- **Sidechain ducking on every hit tick.**
- **Swing sounds lead the hitbox by 7–12 frames** (`LEAD` by swing type), so the sound arrives with the visual, not after it.
- A cap of 56 simultaneously sounding voices.

### 4.9 Terrain, castle, dressing and sky

**`world/map.js`** (simulation-safe):
- The walkable area is a **union of authored pieces**: rectangles, ellipses and paths with variable width.
- It is rasterised into a **signed distance field** on a 2 m grid with bilinear sampling. The height is taken from the piece the point belongs to.
- `clampWalk` pushes a point back inside along the SDF gradient.
- A water strip with fords, `noise2` (value noise over `hash01`).

**`world/terrain.js`:**
- **Ground:**
  - One `PlaneGeometry` on a 2 m grid with heights from `ground()`.
  - **Vertex colours** carry dust, burnt ground, wet banks, worn tracks, contact AO at the foot of cliffs and rock.
  - Attributes `aGrass` and `aPave`.
- **`splatMaterial`** (`:149-205`):
  - Macro tone noise.
  - A transition into grass with a frayed edge.
  - **Paving procedurally in the shader:**
    - rows of stones, joints, worn ruts
    - a bevel lit toward the key light
    - AA via `fwidth`
    - a replacement in the distance
- **Cliffs:** voxel rock columns of 2 m in courses of 1 m, only exposed faces. They receive shadows but do not cast them.
- **`tufts()`:**
  - Grass tufts as crossed quads with a 16 px pixel-art texture.
  - `alphaToCoverage` (works with MSAA, no sorting), wind waving in the vertex shader, shrinking with distance.
  - **Normals pinned upward** (the grass is lit like the ground) and translucency in backlight.
  - Up to 9000 instances in one `InstancedMesh`.
- An outer plane of 2400 m, pines, boulders and layered misty mountains.

**`world/castle.js`:**
- Built entirely from `boxesGeometry`.
- `stoneFace` lays a **running bond** of blocks with a tone and depth jitter per block.
- Crenellations, a pagoda (stepped roof slabs and raised corners), a watchtower, `paperLantern`.
- `figureGeometry` is a distant soldier made of 7 boxes.
- Static geometry is merged, the gates and the garrison are instanced.

**`world/dressing.js`** (815 lines; only the signatures were read in detail):
- `bannerTexture`, `cloth`/`animateCloth`
- `smokeMaterial`, `glowTexture`, `fireSystem`
- palisade, tents, carts, braziers, drums, supplies, shield racks, a command table, a signal tower, barricades

---

## 5. Performance

**Budget according to the code** (we could not measure anything, nothing was run):

| Area | Measure in the code | Note |
|---|---|---|
| Crowd draw calls | Instancing per part × 3 LOD × army, `visible = count > 0` | Tens of DCs independent of N |
| Crowd CPU matrices | Frustum cull per soldier, idle replay every 4th frame, LOD | The main CPU cost, grows linearly with N |
| Shadows | 1× 2048², shadow proxies from coarse boxes, cliffs do not cast | Shadow detail is sacrificed for the DC and triangle count |
| Post-process | DoF, bloom and rays at ½ resolution, rays only with the sun on screen, adaptive MSAA 4→2→0 | Reasonable scaling |
| Particles | Packed pools, sub-step 1/30, debris count scaled by distance and Musou | 2000 debris with shadows |
| Shaders | `compileAsync` behind the loading card, maps change only uniforms, fixed number of lights | No hitches at runtime |
| Simulation | SoA `Float64Array`, a 1.2 m grid for separation | `strike()` is still linear over the whole crowd |

**Where it would scale badly:**
- CPU matrices at 2000 soldiers.
- `strike()` as O(N) on every hit tick.
- No greedy meshing (triangles).
- A single shadow map for a big world.

---

## 6. What to take and where

### 6.1 Table

| Technique (file) | WZ module | C17 / HLSL / SDL_GPU adaptation | Priority |
|---|---|---|---|
| Fixed 60 Hz step, cap of 4 steps, dropping the accumulator, `timeScale` (`main.js:273-285`) | `eng_world` | The same, **plus render interpolation** (alpha between two transform snapshots), which is missing here. Age FX and shake in sim frames, interpolate only transforms in the render. | P1 |
| Two RNG streams + stateless `hash01` (`core/rng.js`) | `core` / `tools` | A `uint32` hash (PCG/mulberry), `rng_sim` and `rng_vis` separately. Generation detail (jitter, variants) only from `hash(x,y,z,seed)`. The basis for golden hashes. | P1 |
| The sim emits, the render listens; `y` = height above ground (`core/events.js`) | `eng_world` | A ring buffer of events per tick (POD structs), the render reads after the step. Mutate nothing. | P1 |
| Hitboxes as data + clips keyed to hitbox frames (`hero/moves.js`, `anims/author.js`) | gameplay above `eng_world`, `eng_anim` | A moves table in a data file (frames, cancel, hits[f0,f1,shape,…]). The animation is retimed to it, not the other way around. | P1 |
| Local hitstop with log scaling and "once per window" (`combat.js:86-135`) | gameplay | Hitstop as a per-entity counter in a pool. The world keeps running, victims have their own `hs`. VFX age at ½ rate. | P1 |
| Weapon-first pose + analytic 2-bone IK with a pole + lowering the hips (`rig.js:218-234`, `apply`) | `eng_anim` | Exactly in the plan (two-bone IK). Add a "weapon" joint as a first-class pose channel and put the hands on it. | P1 |
| Foot baking `plantFoot` + pelvis dip + chaining end feet (`anims/author.js`) | `eng_anim` (offline/load-time) | Bake per frame when loading a clip. Output = a table of foot targets for IK. Ideal for "few poses": from 3–5 keys, slip-free motion arises. | P1 |
| `blendStep`: feet walk during a blend (`rig.js`) | `eng_anim` | Blend in the space of foot targets, not angles. Lift when moving > 4 cm. | P1 |
| Procedural slip-free run (`locomotion.js:85-130`) | `eng_anim` | Literally portable. For creatures with N legs generalise the phase `off = i/N` and the stance fraction by speed. Excellent for mounts and creatures from `eng_gen_char`. | P1 |
| Verlet chains with a cone, sphere colliders, wind and 120 Hz sub-stepping (`secondary.js`) | `eng_anim` | They complement Holden's springs. For cloaks, braids, creature tails and mount harnesses. Render only, so they need not be deterministic. | P1 |
| Crowd: instances per part, 3 LODs with the same pose, shadow proxies, cull, idle replay, no empty DCs (`crowd/view.js`) | `eng_render` + crowds | SDL_GPU: one storage buffer with instances (`float4x3` + colour + hit + LOD) and **`DrawIndexedPrimitives` per (mesh, LOD)** with `first_instance`. Shadow proxies as a separate list in the shadow pass (no `drawRange` hack). Compose the matrices in a **compute shader** from the pose (26 channels) instead of on the CPU. | P1 |
| `aHit` per-instance flash + rim⁴ (`view.js:337-371`) | `eng_render` (crowd shader) | A `hit` field in the instance struct, in HLSL `emissive += hit * pow(1 - abs(dot(N,V)), 4)`, > 1 = white pop. | P1 |
| Sight-cone dither dissolve + `lensClear` (`view.js:297-324`, `camera/occlusion.js`) | `eng_render` | `clip()` with a Bayer threshold in the PS by distance from the camera→player segment. No sorting and no transparency. Works for buildings in dense cities too. | P1 |
| Voxel/box mesher with AO and diagonal flip by AO, `sculpt` with function colours, pattern generators (`hero/model.js:32-75`, `core/voxel.js`) | `eng_gen_mesh` | As **blockout, placeholder, distant LOD and a creature construction kit**. Add greedy meshing and export to a half-edge mesh, so it can be smoothed and subdivided further. The AO flip is a universal rule, also for heightfield terrain. | P1 |
| Custom fog: `exp(−x^1.6)`, height thinning, **AP as a chroma shift preserving luminance**, ground dust, CPU twin (`world/sky.js:110-139`) | `eng_render` (post/forward) | An HLSL function shared by the forward and post passes. A CPU twin for clouds, UI and impostors. For a planet convert the height to radial. | P1 |
| Lottes tone curve with constants from midIn/midOut/hdrMax, hot-desat by luminance, split-tone (`post.js:128-200`, `:250-258`) | `eng_render` post | A simple final PS. Look per biome and map only through uniforms (cbuffer). | P1 |
| Camera micro-kicks in screen px, aged in sim frames (`camera.js`) | camera (gameplay) | Convert px → rotation via FOV. Independent of resolution and FOV. | P1 |
| Gather DoF at ½ res (Gustafsson), god rays at ½ res, adaptive MSAA | `eng_render` post | Optional. Adaptive quality as an EMA of frame time → switching MSAA and the resolution of post effects. | P2 |
| Shadow box snapped to texels + a soft fade at the edge (`world/world.js:28-34, 131-135`) | `eng_render` | In CSM: texel snapping of every cascade and a fade into the next cascade and finally into no shadow. | P2 |
| Procedural splat paving in the PS with `fwidth` AA and a distance fallback (`terrain.js:149-205`) | `eng_render` terrain | Streets and squares in cities without textures: rows, joints and ruts from `floor`/hash. Needs a LOD fallback so it does not shimmer in the distance. | P2 |
| Grass: crossed quads, alpha-to-coverage, normals up, translucency, wind in the VS (`terrain.js` `tufts`) | `eng_render` vegetation | SDL_GPU: `enable_alpha_to_coverage` in the multisample state. An instanced buffer. | P2 |
| Walkable SDF from a union of primitives + `clampWalk` + camera boom along the SDF (`world/map.js`, `occlusion.js`) | `eng_world` / navigation | For authored arenas and cities. On a planet replace with a local SDF from tiles. | P2 |
| Formant voice synthesiser, layered impacts, sidechain, swing cues with a 7–12 frame lead (`audio/*`) | audio (future) | Offline bake into PCM at startup (C, no API). Runtime mix: EQ → compressor → tanh soft-clip. | P2 |
| Weapon trail sampled from a pure pose function (`vfx.js`, `rig.js` `weaponWorld`) | `eng_anim` + VFX | A pose as a pure function `(clip, t)` allows resampling the trail at 120+ Hz without history. | P2 |
| Debris pool: bounce −0.32, rotation ∝ 1/size, settle & persist, count scaling (`vfx.js:503-598`) | VFX / ragdoll | A cheap substitute for Jolt for small pieces. Hand large pieces to Jolt. | P2 |
| `heroLook`: fill + Fresnel rim only on the hero, damped on light surfaces (`model.js:276-290`) | `eng_render` | A per-material "hero" flag. Legibility of characters in a crowd. | P2 |
| Headless bot over a pure simulation → JSON timeline (`checks/trials-bot.mjs`) | `tools` | A C binary without a window. Seed + input script → state hash after N ticks = golden hash. | P1 |

### 6.2 What NOT to take

1. **The voxel look as the final style.** It does not reach the GTA III / WoW bar. The silhouette is stair-stepped and the surfaces have no material response. In the distance and in motion it looks like a toy. But voxels **help** in these roles:
   - **distant LOD and impostors** (the mid LOD at 2V is exactly that trick),
   - **placeholder and blockout** for fast iteration of shapes,
   - **a creature construction kit** as a volume mask → SDF → marching cubes or dual contouring → half-edge → smoothing. Rasterising boxes with function colours and `carve` is a good *frontend* for a volumetric description.
   - **The AO rules and colour jitter** from `hash` can be applied to smooth meshes as vertex AO.
2. **A rigid mesh per joint instead of skinning.** Our `eng_gen_char` does skinning by construction (smooth-min capsules), and that is better. Take over only the *rig and poses*, not the rendering of parts.
3. **A single shadow map.** For cities and the planet we need CSM. But take over the fade at the edge.
4. **DOM/CSS overlays for grading and cut-ins.** For us they are part of the post pass.
5. **The `onBeforeCompile` style and patching of shader chunks.** It is a tax of Three.js. We write HLSL directly with explicit variants.
6. **Magic constants in code.** Dozens of numbers (`0.42`, `0.62`, `[25,160,0.42]` …) are scattered through the code. For us they belong in data tables with hot reload.
7. **Bayer + quantisation to 72 levels as the default.** It goes against the cleanliness of native resolution. At most as an optional look (or only a dither against banding on the 8-bit output, without quantisation).
8. **A linear `strike()` over the whole crowd.** For us queries into a spatial grid or a BVH.
9. **CPU composition of crowd matrices.** For us compute or the VS from a pose buffer.

---

## 7. How it achieves quality — an honest assessment

We looked at the screenshots in `media/`: `title.jpg`, `trials.jpg`, `select.jpg`, `zhaoyun.jpg`, `lubu.jpg`, `guanyu.jpg`, `zhugeliang.jpg` and `story.jpg`.

**What works:**

- **Light and atmosphere make 70 % of the impression.**
  - Title and trials: a low golden sun, warm backlight, a dust veil and columns of smoke.
  - Thanks to AP and dust in the fog the scene has depth even with very simple geometry.
  - A consistent grade (Lottes + split-tone) gives a filmic tone that the voxels alone do not have.
- **Hero legibility.** The rim and fill on the hero and the dissolve of soldiers in the sight cone: even in `zhaoyun.jpg`, where there is chaos on screen (a dragon, dozens of soldiers, debris), the hero can be found.
- **Density of feedback.**
  - Debris lying flat, cracks in the ground, dust and sparks.
  - A combo counter, a calligraphic cut-in.
  - Every hit leaves a trace. This creates the genre feeling of "I am smashing a thousand people".
- **Detail on the hero models.** `select.jpg` and `title.jpg`: lamellar armour from `lamellar()` with plates, seams and hems, tassels and ribbons from chains. For voxels it is very rich. The AO from the mesh gives the plates plasticity.
- **UI and 2D art** (story scroll, selection, title) are above-average craftsmanship. It is not directly related to the engine UI though.

**What does not work (given our bar):**

- **Bloom and additive effects burn out.**
  - `zhugeliang.jpg` and `guanyu.jpg`: Musou waves fill a third to a half of the screen with a white-yellow or green fog and the scene disappears.
  - Hot-desat tries to prevent this, but an overall burn-out budget is missing.
  - For us the rule follows: a brightness and screen coverage budget for VFX.
- **The environment is sparse.**
  - `lubu.jpg`: cliffs are cuboid steps, trees are cube cones, the terrain is flat with vertex colours.
  - In the distance the fog holds the scene together, up close it looks bare.
  - Dense cities would not work like this.
- **Voxel soldiers in a pile blend into noise.** In the shots the crowd and the debris are on the edge of legibility.
- **Rigid parts.** Up close (`select.jpg`) gaps and steps at the joints are visible.
- **Without render interpolation** the motion will be choppy on higher-refresh monitors. This is not visible in the screenshots, it follows from the code.

**Summary:** The quality is made by the *pipeline of light, grade and feedback*, not by the geometry. For Wallhammer Zero this is good news. We can take over the fog with AP, the Lottes grade, the hero rim, debris and camera kicks almost unchanged and put them under smooth generated meshes, with which we can get higher.

---

## 8. Open questions

1. **Cross-platform determinism.**
   - The repo relies on `Math.sin/cos/atan2` in the simulation.
   - For us: ban libm in the simulation and use our own polynomials and fixed rounding? Otherwise golden hashes will not survive Metal/Vulkan/D3D12 builds on different CPUs (x64 vs ARM, FMA contraction).
   - Decide on `-ffp-contract=off` and our own trigonometry.
2. **Crowd: CPU vs GPU pose composition.**
   - With 26 channels × 2000 soldiers a compute shader is trivial.
   - For future skinned soldiers, though, we need to decide between **VAT** (vertex animation textures) and **GPU skinning with a pose buffer**. Both work in SDL_GPU via storage buffers.
3. **Rigid vs skinned crowd at medium and large distances.** Rigid parts are cheap and instance well. Would it not be good to have a rigid LOD for our skinned characters in the distance too, with the same pose as here?
4. **Scaling of `strike()` and separation.** What spatial index for thousands of actors on a planet? A hashed grid per tile or a BVH?
5. **Interpolation vs FX determinism.** For determinism the repo ages FX in sim frames and leaves out interpolation. How to reconcile the interpolation of transforms with deterministic captures for golden screenshots? Proposal: headless capture always with alpha = 0.
6. **Voxel as the frontend of `eng_gen_char`/`eng_gen_mesh`.** Does it make sense to describe creatures via boxes, function colours and carve and convert the result to SDF → a smooth mesh? Or stay purely with smooth-min capsules? A hybrid may be reasonable: capsules for the body, box sculpt for armour and accessories.
7. **How to translate the visual bar.** The transferred light pipeline is enough for GTA III. WoW additionally requires hand-painted-looking textures. We get those from a one-off AI generator. Verify that the grade (Lottes + split-tone + AP) does not break their painterly character.
8. **VFX brightness budget.** The repo does not address this and Musou burns out. We need a metric (the share of pixels above a luminance threshold) in headless contact sheets as a test.
