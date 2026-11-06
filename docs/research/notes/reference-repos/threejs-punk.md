# Threejs-Punk: rendering analysis for Wallhammer Zero

- **Source:** https://github.com/ektogamat/threejs-conference (HEAD `8cc2059`, shallow clone 2026-11-05)
- **License:** code is MIT (Anderson Mancini and Sunag). The assets in `public/` (models, textures, HDRI, videos, audio) **are not ours** and we do not use them. The raindrop graph in `src/tsl/surfaceRain.js` is an adaptation of [rocksdanister/rain](https://github.com/rocksdanister/rain) (BigWings "Heartfelt"). If we port it, we must keep the credit.
- **Method:** the repo was only read, the code was not run. I checked the claims from the README, `docs/techniques/` and the owner's notes (2026-09-24) against the code. Where they differ, the code wins (see "Corrections to the notes").
- References of the form `file:line` apply to the stated commit.

---

## Overview

| Item | Value |
|---|---|
| Stack | Three.js `^0.185.1` (WebGPURenderer + TSL), Vite 6, `three-mesh-bvh` 0.9, GSAP 3 |
| JS | 73 files, 11 744 lines (+ 2 453 lines of CSS) |
| Line breakdown | `ui/` 2 027, `debug/` 1 388, `world/` 2 991, `post/` 890, `tsl/` 750, `controls/` 799, `app/` 648, `clouds/` 577, `runtime/` 445, `platform/` 338, `audio/` 339, `bootstrap/` 178, `intro/` 80 |
| Own rendering | about 3 000 lines: `world/weather`, `world/ground`, `world/car`, `tsl/`, `post/`, `clouds/`, `platform/`, `runtime/`. The rest is UI, debug, audio and controls. |
| Assets | 5 GLB (the city is 4.7 MB with Draco and KTX2: 78 meshes, 78 materials, only 18 textures, about 588 k triangles), the car `quadra.glb`, a plane, billboards, a collider. Also 2 HDRIs (one unused), 6 MP4s, wet-puddles albedo, roughness and normal, a splash atlas, smoke and 2 noise textures for clouds. |
| Entry point | `index.html` → `src/main.js` → `init()` (`main.js:56`) |

**Startup sequence** (`main.js:56-294`): device budgets (`applyDevicePerformanceDefaults`, `:58`) → camera and scene with the sun (`:64-66`) → `createRenderer()` (`:71`) → `createWorld()` with parallel GLTF loads (`:81`) → PMREM from the HDRI (`:101`) → `createPostProcessing()` (`:113`) → look preset (`:125`) → adaptive DPR (`:130`) → camera director, app shell and audio → `finalizeStartupLighting` (critical compile, `:242`) → `compileDeferredStartup` (`:254`) → `renderLoop.startLoop()` (`:268`). Safari waits for the deferred compile before starting the loop (`:264`).

**Frame loop** (`runtime/createRenderLoop.js:18-63`) runs via `renderer.setAnimationLoop` (rAF) with a `THREE.Timer` delta:

1. `cameraDirector.update(delta)` (orbit or walk with BVH) and the HUD (`:22-23`)
2. `collisionHeight.update({camera, hideObjects})`: an ortho render of the height map (`:25-28`)
3. `rain.update()`: two compute dispatches, drops and splashes (`:29`)
4. planes, `sky.update` (the dome follows the camera), `ground.update` (ripple time), ripple amount (`:34-40`)
5. billboards: CPU play/pause of videos by distance (`:43`)
6. car surface rain: intensity by distance, and time (`:45-52`)
7. `ground.updateReflection()`: planar mirror render (`:54-56`)
8. `pipeline.syncCameras`, DoF focus point, rain-glass intro (`:58-60`)
9. `post.render()`: the whole TSL `RenderPipeline` (`:61`)
10. `sampleFps()` → adaptive DPR (`:62`)

---

## Architecture

### Composition from factories
- No engine and no ECS. Every subsystem is a function `createX({deps}) → { update, dispose, set*, uniforms, params }`. `main.js` wires everything together by hand with explicit parameters.
- The control flow is a **hand-ordered list of calls** in `renderFrame`. Dependencies between passes (height → compute → beauty) are guarded only by the order of lines and a comment in the documentation.
- The post pipeline is **one TSL graph**. Switching an effect (bloom, AO, DoF, SMAA, intro) calls `rebuildSteadyOutput()` (`post/postprocessing.js:241-267`), builds a new `outputNode` and sets `post.needsUpdate = true`, i.e. a recompile. It works as a mini render graph with declarative node composition. Three derives the intermediate RTs from the graph itself (`convertToTexture`).

### Feature flags
- `world/features.js:17-31`: `FEATURES = {city, car, rain, smoke, planes, sky, ground, intro, chromeUi, walkUi, audio, inspector}`. A disabled feature returns `null` and both the loop and the post use optional chaining (`world.rain?.update`).
- `STRIP.md` describes the order of stripping the layers. The minimal core consists of `bootstrap + scene + city + ground + post + walk/orbit + render loop`.
- Performance levers are separated from feature flags in a **global mutable singleton** `performanceProfile` (`platform/performanceProfile.js:11-54`). At runtime it is changed by the dev API `window.__app.perf.set(key, value)` (`debug/createPerformanceDevTools.js:44-61`) and the change propagates into the pipeline.

### Layers as pass filters
- `RAIN_LAYER = 2` (`createCollisionRain.js:25`) and `SMOKE_LAYER = 3` (`createSmoke.js:17`). The post clones the camera separately for the AO pre-pass (without rain and smoke) and for the beauty pass (with rain and smoke) (`postprocessing.js:36-54`). The mirror camera turns `RAIN_LAYER` off (`createGround.js:226`).
- The height map, by contrast, filters by **toggling `visible`** on objects from a hide list (`collisionHideObjects.js`, `createCollisionHeight.js:109-131`). So it mutates the scene in the middle of a frame.

### What is good for us
- The explicit lifecycle `create/update/dispose` and the returned objects with parameters map to C modules (`eng_x_create/update/destroy`).
- A feature flag returning `NULL` and a caller that tolerates it is a cheap way to have a "strip" mode for debugging and profiling. For us this means a config struct plus `if (sys)`.
- A central budget table (`performanceProfile`) with keys like `*ResolutionScale`, `*FrameSkip` and `*Count` is exactly what we want as a `quality profile` struct that the render graph reads from.
- Filtering passes by a layer bitmask (rain/smoke outside AO and mirror) maps to a `pass_mask` on draw items.

### What is bad for us
- The pass order is guarded only by the order of lines in `renderFrame` and by documentation. For us the order must follow from declared reads/writes in the render graph.
- A hide list via `visible = false/true` around the render is fragile: every new transparent system has to be added by hand. For us this is handled by a pass mask at draw item level, not by mutating the scene.
- The global mutable `performanceProfile` is also read by modules at creation time (e.g. `DEFAULT_COUNT`, `createCollisionRain.js:29`). A later change therefore does not take effect everywhere.
- The scene is drawn **4× per frame**: height, mirror, AO pre-pass and beauty, plus shadow on demand. A shared depth/normal prepass is missing, because the TSL `pass()` is per camera.

---

## Rendering pipeline

### Pass order in one frame (steady state, desktop, default profile)

| # | Pass | Where | Type | Output |
|---|---|---|---|---|
| 0 | Sun shadow map (only on `needsUpdate`: init, resize, light change) | `scene.js:24-39`, `createRenderer.js:44-46,69-81` | raster, depth | 4096² depth, PCFSoft, ortho box ±200 m |
| 1 | Collision height (ortho from above, override material `vec4(positionWorld,1)`) | `createCollisionHeight.js:85-133` | raster | RT 512², **RGBA16F**, nearest, no mips, with depth |
| 2 | Rain update | `createCollisionRain.js:139-184` | **compute** (5000 threads) | storage `position`, `velocity` (vec3) |
| 3 | Splash update | `createCollisionRain.js:186-235` | **compute** (5000 threads) | storage `splashPos` (vec3), `splashCycle` (uint) |
| 4 | Planar reflection (mirror camera, oblique clip, without the ground mesh and without the rain layer) | `createGround.js:190-276` | raster, full scene | RT `drawingBuffer × 0.5`, **RGBA16F**, linear, with depth |
| 5 | AO pre-pass (scene without rain and smoke) | `postprocessing.js:99-111` | raster, full scene | `output` = `packNormalToRGB(normalView)` **RGBA8**, plus depth |
| 6 | Beauty scene pass with MRT (opaque, then transparent: ground with fog alpha, rain, splashes, smoke) | `postprocessing.js:113-126` | raster, full scene | `output` **RGBA8 (linear!)**, `emissive` **RGBA8**, depth |
| 7 | GTAO | `postprocessing.js:128-137` | fullscreen frag | half resolution, 6 samples, no temporal filter |
| 8 | Bloom (only from the emissive MRT) | `postprocessing.js:147-148` | fullscreen, mip chain | half resolution (Three `BloomNode`, 5 mips) |
| 9 | Lens flare (the input is the bloom) and gaussian blur | `postprocessing.js:150-163` | fullscreen | blur at 0.5 |
| 10 | DoF: separable box blur and a mix by depth (**off by default**, `performanceProfile.js:26`) | `postprocessing.js:244-251`, `tsl/boxBlur.js:17-55` | 2× fullscreen | full resolution |
| 11 | Composite: beauty × AO, fog, + bloom·(1−fog·0.75), grade | `cyberpunkLook.js:362-393` | fullscreen | intermediate RT (forced by `convertToTexture` in CA) |
| 12 | Edge chromatic aberration, vignette | `cyberpunkLook.js:395-415`, `tsl/edgeChromaticAberration.js:49-93` | fullscreen | intermediate RT (input of SMAA) |
| 13 | SMAA 1x (3 passes: edges, weights, blend) | `postprocessing.js:255` | fullscreen | full resolution |
| 14 | Film grain → output transform (ACES and sRGB) → canvas | `postprocessing.js:256-257`, `createRenderer.js:47` | fullscreen | swapchain |

Notes on the order:
- Three executes passes 5 to 14 in `post.render()` according to node dependencies. Passes 1 to 4 render outside the TSL graph through a manual `renderer.render` into their own RT. For the mirror this is deliberate (`createGround.js:33-38`): a `reflector()` inside a `PassNode` would bind the same texture on WebGPU as both sampled and attachment.
- The rain pass (`rainPass`) exists in the post but is not used, because `useDedicatedPass: false` (`createCollisionRain.js:470`). The rain is drawn inside the beauty pass.
- **Tone mapping:** `renderer.toneMapping = ACESFilmic` (`createRenderer.js:47`). `RenderPipeline` applies it only at the very end (output color transform). In between everything runs linear, but both the beauty and emissive RTs are **8-bit** (`postprocessing.js:125-126`). HDR emissivity from the GLB (`KHR_materials_emissive_strength` up to 429×) is therefore clipped to 1.0. The bloom then sees more of a mask of the neons than HDR brightness. Banding in dark tones is masked by dither ±0.004 in CA (`edgeChromaticAberration.js:38-47`) and by film grain.
- The renderer requests `maxColorAttachmentBytesPerSample = 64` (`createRenderer.js:8-30`), so the MRT fits.

### MRT layout of the beauty pass
```js
// postprocessing.js:115-126
const mrtNode = mrt({ output, emissive: vec4(emissive, output.a) });
mrtNode.setBlendMode("emissive", new BlendMode(NormalBlending));
scenePass.setMRT(mrtNode);
scenePass.getTexture("emissive").type = UnsignedByteType;
scenePass.getTexture("output").type = UnsignedByteType;
```
- `output` is the lit colour of the material including emissivity. `emissive` is only the emissive component of the material (`emissiveNode`). Writing into emissive: the neons in the GLB, the video billboards (`billboardFace.js`, `emissiveNode = video × 0.2`) and the **planar reflection of the ground** (`createGround.js:131-139`). The reflection of neons in a puddle thus also blooms.
- Emissive has its own blend mode (normal), so transparent objects (rain, smoke) composite alpha correctly over a neon.

### What runs in compute
Only the simulation of rain and splashes (`renderer.compute(computeParticles)` and `computeSplash`, `createCollisionRain.js:374-375`) plus a one-time init (`:254-255`). GTAO, bloom, blur and SMAA are fragment fullscreen passes from Three addons.

### Render targets: summary
| RT | Resolution | Format | Filter | Persistence |
|---|---|---|---|---|
| Shadow | 4096² | depth | PCF soft | cached, update on demand |
| Collision height | 512² (`collisionRainResolution`) | RGBA16F (R16F is enough) | nearest | every frame (`frameSkip` default 1) |
| Ground reflection | 0.5 × drawing buffer | RGBA16F and depth | linear | every frame (`groundReflectionFrameSkip` default 1) |
| AO pre-pass | 1.0 | RGBA8 normal and depth | – | per frame |
| Beauty MRT | 1.0 | 2× RGBA8 and depth | – | per frame |
| GTAO | 0.5 | 1 channel | – | per frame |
| Bloom | 0.5 and mip chain | half-float (Three BloomNode) | linear | per frame |
| Flare blur | 0.5 | – | – | per frame |
| Composite, CA, SMAA (edges, weights) | 1.0 | – | – | per frame |

"Drawing buffer" = window × DPR, where DPR = min(device, 1.5) and 0.85 after an adaptive drop.

---

## Key techniques in depth

### 1. Collision rain: a height "hit" texture and GPU compute

**Files:** `world/weather/createCollisionHeight.js`, `createCollisionRain.js`, `collisionHideObjects.js`, `docs/techniques/collision-rain.md`.

**Height map** (`createCollisionHeight.js:15-31, 85-133`):
- `OrthographicCamera(±50, ±50, near 0.1, far 80)`, position `(cam.x, 50, cam.z)` looking straight down. Every frame it is re-centred on the player.
- RT 512² HalfFloat, **nearest**, no mips. A linear filter would average the heights at roof edges and the drops would fall "into the air".
- `scene.overrideMaterial` with `outputNode = vec4(positionWorld, 1)`. The depth test keeps the highest surface in a column and the simulation reads only `.y`.
- The mapping (`:51-65`), which must be the same in the pass and in the compute:
  `u = (x − cx + W/2) / W`, `v = (z − cz + H/2) / H`.
- The texel resolution is 100 m / 512 ≈ **0.195 m**.

**Simulation** (`createCollisionRain.js:139-182`):
```js
position.addAssign(velocity);                        // no delta!
const wrappedDx = fract(dx.add(uRainHalfW).div(uRainAreaWidth))
  .mul(uRainAreaWidth).sub(uRainHalfW);              // toroidal wrap around the camera
const coords = collisionHeight.getUV(position);
const floorHeight = texture(collisionHeight.renderTarget.texture, coords).y;
If(position.y.lessThan(floorHeight.add(0.05)), () => {
  const seed = float(instanceIndex).add(time.mul(1000));
  position.y = hash(seed.add(77.7)).mul(15).add(20);  // respawn 20–35 m
  position.x = hash(seed.add(11.1)).mul(uRainAreaWidth).sub(uRainHalfW).add(centerPos.x);
  ...
});
```
- The rain volume is 60×60 m, shifted 15 m in front of the camera in the horizontal view direction (`centerPos = camPos + dirXZ·15`). The height map is larger (100×100), so the edges are covered.
- 5000 instances, clamped to 500 to 5000 (`:66`), fall speed 0.7 ± 0.035 units **per frame**.
- **Splashes** (`:186-233`) **are not tied to drop impacts**. Each instance has its own phase `floor(time·6 + hash·2π)`. On a new cycle it gets a random XZ in the volume and Y from the height map plus 0.06. On a wrap, Y is recomputed. It is a statistical illusion: 5000 × 6 = 30 000 splashes per second over 3600 m².
- **Drawing:** one instanced `PlaneGeometry` 0.04 × 1.1 m for the streaks with a cylindrical billboard (`horizontal: true`, `:271-275`). The streak is purely procedural: `centerLine = (1 − |2u−1|)²`, `verticalFade = smoothstep(0,0.08,v)·smoothstep(0,0.15,1−v)` (`:260-265`). The colour is constant `#dcf4ff`, opacity 0.15 × 0.45 (very faint). The splash is a spherical 0.13 m billboard with a 5-frame atlas, crossfade between frames, mask `.r` (the asset has no alpha), scale 0.1 → 1.4.
- `frustumCulled = false` and a bounding sphere of 1e5: the instances live in world space.

**Costs:** the documentation gives no ms. My estimates: the height pass is one ortho render of the whole scene (CPU draw calls as another view), the compute is trivial (5000 threads, one texture fetch), the overdraw of thin streaks is small.

**Limitations and bugs I found in the code:**
- **The integration depends on framerate** (`position += velocity` without `dt`). At 120 Hz the rain falls 2× faster.
- The respawn seed `float(instanceIndex) + time·1000` loses float precision after hours. A uint hash (PCG) with a frame counter is better.
- An ortho camera at y = 50 with far 80 covers only y ∈ ⟨−30; 49.9⟩. Anything above 50 m is missing, which makes rain pass through roofs on skyscrapers. The clear value is `scene.background` (≈0.03), so an uncovered texel means a floor at y ≈ 0.
- The streaks do not have a length based on speed relative to the camera and do not take the colour of surrounding lights.
- The map holds only the highest surface. So it does not rain under a bridge or an awning and there are no splashes there, which is physically correct.

**Mapping to SDL_GPU:** no problems.
- Height pass: a render pass into `R16_FLOAT` (or `R32_FLOAT`) with depth. An even cheaper variant is a **depth-only** ortho render into `D32_FLOAT` with `SAMPLER` usage, where height = `camY − depth·range`. No colour attachment is needed at all.
- Compute: 2 to 4 RW storage buffers (limit 8) and 1 sampled texture (`Load()` or `SampleLevel`, compute has no derivatives).
- Draw: the vertex shader reads the storage buffer via `SV_InstanceID` and generates the quad from `SV_VertexID`. No vertex buffer is needed. Neither bindless nor indirect is required.

**Extensions for us (the demo does not have them):**
1. Use the same height map as **rain occlusion for wetness**. If `surfaceY < heightMap(xz) − ε`, the surface is under a roof and stays dry. We get dry strips under awnings and bridges for free.
2. Raise the drop count to 30 to 100 k (the M4 Pro can handle it) and stretch the streaks by speed relative to the camera.
3. Place the camera above the max building height in the chunk and set `far` according to the height range.

### 2. Procedural drops on a surface (car and glass)

**Files:** `tsl/surfaceRain.js`, `world/car/applyCarSurfaceRain.js`, `docs/techniques/car-surface-rain.md`.

**How it works:**
- `MovingDropLayer` (`surfaceRain.js:40-92`, BigWings/rocksdanister) splits the UV into an `8×4` grid (`a = (4,2)`, `grid = a·2`). Columns get a random y-offset `N(id.x)` and cells a hash `N13`. A drop moves along a sawtooth curve `Saw(0.85, fract(t+n.z))` with an x wobble `sin(10y + sin(10y))`. A trail and "satellite" droplets `fract(UV.y·10)` form behind it. The output is `vec2(mask, edge)`.
- `CarDrops` (`:117-122`) sums two layers (`uv` and `uv·1.85`) without static drops. Static drops on the car's UV1 "flickered" (`:132-139`).
- The normal is computed by **finite differences** (`computeCarDropNormalOffset`, `:169-189`): the mask is evaluated 3× (c, c+εx, c+εy, ε = 0.005) and `normalOffset = (cx−c, cy−c)`. That gives **6 evaluations of `MovingDropLayer`** per pixel.
- Wiring into the material (`applyCarSurfaceRain.js:146-215`):
  ```js
  const rain = evaluateCarSurfaceRain(uv(1), uniforms);     // UV1 = "rain UV"
  const rainAmount = rain.mask.mul(uniforms.uIntensity);
  material.roughnessNode = mix(baseRoughness, wetRoughness, rainAmount); // 0.1 paint, 0.05 glass
  material.normalNode = normalMap(vec4(normalSample.xy.add(rain.normalOffset.mul(normalStrength)), normalSample.zw));
  // glass: colorNode = mix(base, (0.55,0.6,0.65), rainAmount * 1.2)
  ```
- The PBR maps stay on UV0 and the rain is on UV1 (a second UV hand-edited in Blender so the islands do not overlap).
- **Distance fade** on the CPU (`:289-318`): `uIntensity = 1 − smoothstep((d−20)/(32−20))`. The shader keeps running though, the result is just blended in with zero weight.
- One uniform block is shared by all car materials (`createSurfaceRainUniforms`, `surfaceRain.js:191-205`): scale 20.5, dropSize 0.45, normalStrength 0.25 for paint and 0.7 for glass, dropletMix 0.15.
- The glass is an opaque `MeshPhysicalNodeMaterial` with clearcoat 1 (`GLASS_LOOK`, `applyCarSurfaceRain.js:28-54`). So wetness reads only through reflections.

**Costs:** not stated. Six layers with hashes, `sin` and `pow` per paint pixel are noticeable, which is why the fade from 20 to 32 m exists.

**Limitations:** it requires a clean second UV. Drops "flow" along the v axis of the UV, not along world gravity. A uniform with zero intensity does not save ALU.

**SDL_GPU:** pure ALU in the pixel shader with no binding demands. For us:
- Instead of `uIntensity = 0`, use a **pipeline variant without rain** for LOD and distant objects. Alternatively compute the normal from `ddx/ddy` of the mask instead of 2 extra evaluations (cheaper, but less stable).
- Procedurally generated vehicles and windows can get the "rain UV" from the generator, e.g. a planar projection in object space onto the side surfaces with the v axis = −Y of the object. The drops then flow down.
- The same graph applied to the screen UV gives the effect of **rain on the screen glass** (`tsl/rainGlass.js:147-207`): a blurred scene (gaussian at 0.6 res), a refraction offset according to the drop normal and highlighted edges. Suitable for the view from inside a car.

### 3. Ripples on the ground

**File:** `tsl/rainRipples.js:20-75`. Called from `createGround.js:94,101`.

**Correction:** the code walks a **3×3** neighbourhood of cells (`MAX_RADIUS = 1`, `CELL_COUNT = 9`), not 5×5. The documentation (`wet-ground.md`: "Fixed 5×5 neighborhood (MAX_RADIUS = 1, CELL_COUNT = 9)… 25 cells") contradicts itself. The Shadertoy original (Huw Bowles "Rain ripples") uses `MAX_RADIUS = 2`, i.e. 5×5. The authors reduced it for performance.

```js
const p = pi.add(hash22(pi));                          // random centre in the cell
const t = fract(float(0.3).mul(time).add(hash12(pi))); // phase 0..1
const d = length(v).sub(float(MAX_RADIUS + 1).mul(t)); // distance from the wave front
const p1 = sin(31*d1) * smoothstep(-0.6,-0.3,d1) * smoothstep(0,-0.3,d1);  // d1 = d - h
const derivative = (p2 - p1) / (2h) * (1-t)^2;         // central difference, h = 0.001
circles += normalize(v) * derivative * 0.5;
// after the loop: circles /= 9; n = vec3(circles, sqrt(1 - dot(circles,circles)))
```
- It samples in **world XZ** (`positionWorld.xz · 4.83`), not in UV. The circles thus have no seams at texture repeats.
- The output `xy` is used twice: it is added to the normal map (×0.015) and to the reflection UV (×0.08), so puddles deform the mirror.
- The cost is fixed: 9 cells × 2 `sin` × 2 hashes per ground pixel, independent of the number of drops.

**SDL_GPU:** a trivial port to HLSL. A better architecture for us: **once per frame, bake the ripple normal into a tiled texture with a compute shader** (e.g. 256² or 512² `R8G8_SNORM`, tileable with a periodic cell hash). All wet surfaces (streets, roofs, car bonnets) then only sample it. One pass replaces N per-pixel loops and saves ALU in a dense city. There is also room left for 5×5 quality.

### 4. Planar reflection (a wet street without SSR)

**Files:** `world/ground/createGround.js`, `docs/techniques/wet-ground.md`.

- The ground is one 400×400 m plane at y = −5.4 with tiling PBR (albedo, roughness, normal, repeat 14.9). `transparent = true`, because alpha = `1 − rangeFogFactor(0, 51)` and the plane thus fades into the fog (`:121-130`).
- **Mirror camera** (`:203-227`): the position and target are mirrored across the plane, `up` is reflected and the projection is copied. `RAIN_LAYER` is off.
- **Oblique near plane** (Lengyel) (`:229-258`). The branch for WebGPU (depth 0..1) is exactly what we need for SDL_GPU:
  ```js
  _q.x = (sign(clip.x) + P[8]) / P[0];
  _q.y = (sign(clip.y) + P[9]) / P[5];
  _q.z = -1;  _q.w = (1 + P[10]) / P[14];
  clip *= 1 / dot(clip, _q);
  P[2] = clip.x; P[6] = clip.y;
  P[10] = (WebGPU) ? clip.z : clip.z + 1;   // 0..1 vs -1..1 depth
  P[14] = clip.w;
  ```
- Render: hide the ground, `renderer.render(scene, mirror)` into an RT 0.5× RGBA16F (`:260-275`).
- **Composition via emissive** (`:113-119, 131-139`):
  ```js
  const reflectionUV = screenUV.flipX().add(normalOffset /*0.035*/).add(rippleReflectionOffset);
  emissiveNode = reflectionTex.rgb * (1 - roughness) * 0.08 * enabled * fogOpacity;
  ```
  This is not an `envMap`. The reflection is added as emission, so it bypasses lighting, has no Fresnel and goes into the bloom MRT. A strength of 0.08 gives "a hint of neon, not a chrome floor". Roughness = texture × 0.55.
- SSR was tried and removed (commit `ea84fd7`) as expensive and unstable. `AGENTS.md` forbids bringing it back.

**Costs:** a second render of the whole scene with full materials at half resolution. A frame skip exists (`groundReflectionFrameSkip`), but the default is 1, i.e. no skipping. Mobile and Safari do not turn it off, it is turned off only manually.

**Limitations:**
- Only **one infinite plane**. Pavements, ramps, roofs and puddles at another height are not reflected correctly.
- No Fresnel and no roughness blur (there are no mips, the blur is replaced by a normal warp).
- The mirror draws the full scene without LOD, so in a dense city the draw calls double.

**SDL_GPU:** the oblique projection is just a matrix and works everywhere. The alternative `SV_ClipDistance` via shadercross and Metal is uncertain (an open question). For us:
- A mirror pass with a **reduced draw list** (LOD+1, shorter draw distance, no transparent objects, no AO, simpler lighting) and with a frame skip.
- Choose the plane dynamically as the dominant street height under the camera (it can be read from the collision height map).
- Add Schlick Fresnel `F0 = 0.02` and a strength by the wetness mask (puddle mask × rain occlusion).
- Long term a hybrid: SSR for non-planar surfaces and a fallback to the planar reflection or a sky probe.

### 5. GTAO

**File:** `post/postprocessing.js:99-137`. The implementation is Three's `GTAONode` (an addon, not in the repo).
- A separate **AO pre-pass**: the whole scene again with a camera without the rain and smoke layers, MRT `output = packNormalToRGB(normalView)` in RGBA8 plus depth.
- `ao(depth, normal, aoCamera)`: `resolutionScale 0.5`, `samples 6`, radius 0.4, scale 1.7, thickness 1, distanceExponent 1, falloff 1, **`useTemporalFiltering = false`**, because they do not use TRAA. The noise is hidden only by the bilinear upsample.
- Application (`:228-232`): `beauty = beauty * vec4(ao)`, i.e. a **post-multiply on the final colour**, including direct light and emission. Physically this is wrong, but in a dark night scene it reads as contact shadows.
- On mobile AO is off (`performanceProfile.js:73`).

**SDL_GPU:**
- The pass should be compute (half-res, 1 storage texture output and 2 sampled inputs). Bindless is not needed.
- A better order for us: **depth+normal prepass → AO (compute, half) → bilateral upsample → the forward pass samples AO and multiplies only ambient/indirect**. One prepass thus replaces their two renders (AO pre-pass and beauty) and gives early-Z.
- Without TAA a 4×4 spatial denoise (a blur weighted by depth) is suitable.

### 6. Bloom via the emissive MRT

**Files:** `post/postprocessing.js:113-126, 147-148, 209-223`, `cyberpunkLook.js:316-324, 379-384`.
- `bloom(scenePassEmissive, 2.5, 0.45)` at 0.5 res. The threshold is 0, so it blooms **only what the material declares as emission**: neons, video billboards and the reflection in water. There is no luminance threshold over the whole scene, so a bright sky or specular does not bloom.
- Three's `BloomNode` is a port of UnrealBloom: 5 mips, a separable gauss with kernels 3/5/7/9/11 and mip weights interpolated via `radius`.
- The preset drives `strength = bloom.strength + bloomWide.strength·0.35` and `radius = max(bloom.radius, bloomWide.radius·0.55)`. So the "wide" bloom is not a separate pass, it is just folded into the parameters.
- In the composite the bloom is **damped by fog**: `hazed += bloom · (1 − fogBlend·0.75)`, so distant neons in the fog do not bloom.

**SDL_GPU:**
- MRT works (2 colour targets). For us `RGBA16F` (HDR colour) and `R11G11B10_UFLOAT` (emission) instead of their 8-bit, so the HDR emission is not clipped. Support for the format as a render target has to be checked via `SDL_GPUTextureSupportsFormat`.
- Bloom as a downsample and upsample chain (Jimenez COD:AW 13-tap down and tent up) in compute or fragment, with 5 to 6 mips from half-res. Each step needs 1 sampler and 1 storage texture, so the limits fit.

### 7. Lens flare

**File:** `post/postprocessing.js:150-163`. The implementation is Three's `LensflareNode`, a pseudo lens flare after Chapman.
- The input is the **bloom output**, not the scene. It generates ghosts (spacing 0.22 to 0.27, attenuation 22 to 50) and a halo above a threshold (0.09 default, 0.9 in neonNoir), then `gaussianBlur(flare, 4, 4, res 0.5)` and it is added as `bloom + flare·strength` (0.35 in neonNoir).
- Mobile turns it off and the adaptive DPR turns it off when FPS drops (`main.js:136-142`).

**SDL_GPU:** one fullscreen pass and a blur, no problems. **Low priority.** For the GTA III aesthetic **coronas** are more typical (glow billboards at lights with occlusion). Without occlusion queries in SDL_GPU the occlusion is solved in the corona's vertex shader by sampling the depth buffer at several points around the projected centre of the light.

### 8. DoF

**Files:** `post/postprocessing.js:167-179, 244-251`, `tsl/boxBlur.js:17-55`.
- **Off by default everywhere** (`performanceProfile.dof = false`) and on Safari it is never built. It is turned on only in the inspector.
- A separable box blur (size 3, separation 2 → 7 taps of 2 px per axis) with premultiplied alpha: `mix(beauty, blurred, smoothstep(36, 75, |viewZ − focusZ|))`. The focus point is tweened via GSAP (click-to-focus).
- In practice it is "distance blur", not a real bokeh DoF.

**SDL_GPU:** two fullscreen passes. Low priority (cutscenes, photo mode).

### 9. Grade, fog and look presets (not a LUT)

**File:** `post/look/cyberpunkLook.js`.
- The grade is **parametric**, no LUT is used. `buildComposite` (`:362-418`):
  ```js
  distanceFog = smoothstep(fogNear, fogFar, viewDistance);         // viewZ from the scene pass
  skyFog      = smoothstep(0.68, 1.0, linearDepth);                // sky (background has no viewZ)
  fogFactor   = max(distanceFog, skyFog) * fogEnabled * fogAmount;
  hazed = mix(beauty.rgb, fogColor, fogFactor) + bloom * (1 - fogBlend*0.75);
  tinted = hazed * gradeTint + gradeOffset;
  g = vec3(r, mix(g, luma, greenSuppress), b);                     // green suppression
  g = saturation(g, sat);  g = mix(vec3(luma), g, contrast).max(0);
  graded = mix(hazed, g, gradeMix);
  // + edge CA (r/b UV scaled by ±strength·0.015 · edgeMask), vignette smoothstep(sm,1,|uv-0.5|·1.6)
  ```
- Edge CA (`edgeChromaticAberration.js:49-93`): `edgeMask = 1 − 1/(1 + (dist·falloff)²)`, 4 taps and dither.
- Film grain (Three's `FilmNode`) is applied **after SMAA** (`postprocessing.js:255-257`), so the AA does not blur the grain.
- **6 presets** (`:104-265`): `neutral`, `neonNoir` (default), `magentaRain`, `tealDusk`, `silentHill` (fog −20..30 m, saturation 0.42, contrast 1.91), `sinCity` (saturation 0, contrast 2, purple fog). Each preset is a struct of about 16 floats (fog ×5, tint, offset, sat, contrast, greenSuppress, gradeMix, CA ×2, vignette ×2, grain) plus bloom and flare parameters. Stored in localStorage, switching only overwrites uniforms, without recompiling.
- The fog is purely a **post-process by depth** with a constant colour. Transparent objects without depth write (rain, smoke) therefore get fog according to what is behind them.

**SDL_GPU and for us:**
- A look preset as a data struct, with a **linear blend** between presets (weather, time of day, zone). This is exactly how WoW works with per-zone "light params" (fog colour, sky, ambient), between which it interpolates.
- At runtime either parametric (it is cheap ALU), or **bake the parametric grade into a 3D LUT** (32³ `RGBA8`, `eng_gen_tex` or tools) and use just 1 sample at runtime. A LUT also allows palette quantisation for stylisation, which is in our plan.
- Better to compute fog **in the forward shader** (height, distance and colour by direction to the sun). A post-fog from depth does not work for transparent objects.

### 10. SMAA

**File:** `post/postprocessing.js:255, 352-356`. Three's `SMAANode`: SMAA 1x, 3 passes, the area and search textures embedded in the addon. Optional by profile.
- It is applied **before tone mapping**, on a linear 8-bit input clipped to [0,1]. The edges of neons work only because they are clipped.
- **SDL_GPU:** standard 3 fragment passes (1 to 2 samplers per pass). The area and search tables are in the reference SMAA repo as C headers (`AreaTex.h`, `SearchTex.h`, MIT). They are data, not art, and they fit the "everything from code" rule. Or generate them with their generator in `tools/`.
- For us SMAA at the internal resolution (1080p or 1512×982) only after tone mapping (on LDR, as SMAA assumes). Only then our own upscale and grain.

### 11. Performance levers

| Lever | Code | Default value | Note |
|---|---|---|---|
| Half-res passes | `performanceProfile.js:20-41` | AO 0.5, bloom 0.5, flare 0.5, mirror 0.5 | the only really active "big" saver |
| Render layers | `postprocessing.js:36-54` | rain and smoke outside the AO pre-pass, rain outside the mirror | |
| Frame skip | `createCollisionHeight.js:90-97`, `createGround.js:195-199` | **1, i.e. off** | the persistent RT is reused when skipped |
| Distance fade | `applyCarSurfaceRain.js:289-318` | 20 to 32 m | the shader keeps running |
| Static shadows | `createRenderer.js:46`, `scene.js:39` | `autoUpdate = false` | the 4096² is rendered only on demand (init, resize, light change). A big saving for a static city. |
| Split compile | `runtime/warmup.js:75-144` | – | critical path: rain, smoke and planes hidden, then `compileAsync(scene, beautyCam)` and 1 post frame. Deferred: the rest during the intro. Safari waits, because a concurrent compile and resize freezes it. |
| Adaptive DPR | `platform/adaptiveDpr.js:11-88` | target 50 FPS, 2 windows of 1 s | **one-way**: DPR drops to 0.85 and never comes back. At the same time it turns off DoF, lens flare and video billboards (`main.js:136-142`). Sampling is blocked during the intro (`main.js:148`, `createPerformanceDevTools.js:27`). |
| Device policy | `performanceProfile.js:63-80` | mobile: no flare, billboards or AO. Safari: no adaptive DPR, max DPR 1.25. | A comment says "disable SMAA", the code sets `smaa = true` (mismatch). |
| Video decode | `billboardFace.js` | play < 20 m, pause > 50 m (horizontal distance) | |

**Mapping to our engine:**
- *Half-res* corresponds to a transient texture descriptor with a `scale` relative to the internal resolution. The render graph allocates from a pool.
- *Frame skip* means `update_every_n` on a pass. The output must however be **persistent** (a history resource outside the transient pool), otherwise a skipped frame reads from recycled memory.
- *Split compile*: we compile HLSL offline, but `SDL_CreateGPUGraphicsPipeline` still costs time (on Metal the PSO finishing, possibly MSL compilation from source). So **pre-warm all pipelines on the loading screen** and for streamed biomes a deferred warm-up in the background.
- *Adaptive DPR* corresponds to dynamic internal resolution with our upscale shader. Without timestamp queries we measure the CPU frame time and the presentation interval. Unlike the demo it should be **two-way with hysteresis**.

### 12. Other things worth mentioning
- **Procedural sky** (`clouds/cloudsMaterial.js:48-173`): a sphere of radius 135 follows the camera (`BackSide`), the vertex `position.z = position.w` puts it on the far plane. It is 2D noise on the sphere UV (3 wind layers: distortion, sparse, fluff) from **2 noise textures**, a gradient `skyBottom → skyTop` and a night preset (`createCloudSky.js:37-51`, `createWorld.js:141-145`).
- **IBL:** the HDRI `sunflowers_puresky_1k` → PMREM with an intensity of only **0.08** (`main.js:89,101`). It plays almost no role in the scene and serves only for reflections on paint and glass. The second HDRI (`white_home_studio`) and `rainDrop.png` are not used.
- **Lighting:** one shadow-casting directional sun `#cfefff`, intensity 10, plus one non-shadow-casting fill `#ffd6c8` 1.5 (`scene.js:24-48`). **No point or spot lights.** The "light" of the neons is only emission, bloom and the reflection in the ground.
- **Smoke:** a `SpriteNodeMaterial` of instances (50 exhaust and 40 ambient), time and range nodes without simulation, the texture `smoke.png`, `alphaTest 0.05`, layer 3.
- **Rain-on-glass intro:** see item 2. After the intro it is removed from the graph (`disposeIntroRainGlass`, `postprocessing.js:281-292`).

---

## Which inputs are assets and how to replace them with code

| Asset | Use | Code replacement | Module |
|---|---|---|---|
| `custom_noise.webp`, `custom_perlin.webp` | 2D cloud noise (`noiseTextures.js`) | tileable value, Perlin and Worley fBm (periodic gradient noise), 512² RGBA8, channels = different octaves | `eng_gen_tex` |
| `textures/water-splash.webp` (5 frames, grayscale without alpha) | splash atlas | either generate the atlas (an expanding ring and a "crown" of N droplets with ballistic scatter, 5 to 8 frames), or **analytically in the pixel shader** (a `smoothstep` ring around `r(t)` and 4 to 6 droplets by hash) with no texture at all | `eng_gen_tex` / weather shader |
| `textures/rainDrop.png` | **unused** (a leftover of the old system) | the drop streak is already procedural (`createCollisionRain.js:260-265`) | – |
| `textures/smoke.png` | smoke sprite | radial falloff × fBm (2 to 3 octaves) with a soft edge, possibly 4 variants in an atlas for rotation | `eng_gen_tex` |
| `wet-puddles-albedo/roughness/normal.jpg` (~1 MB each) | tiling ground | asphalt: albedo from noise and pebbles (Voronoi). **The puddle mask as a separate low-frequency world-space fBm with a threshold**, so it does not repeat with the tiling of 14.9. Roughness = mix(0.6 asphalt, 0.03 puddle, mask·wetness). Normal from a Sobel of the height. Or a one-off AI generator for the albedo and the rest from code. | `eng_gen_tex` + material |
| HDRI `sunflowers_puresky_1k.hdr` | IBL (0.08) | render our procedural sky shader into a small cubemap (64 to 128²) and a GGX prefilter of the mip chain with a compute shader, or for stylisation just **SH9 / a hemispheric ambient gradient** from the sky colours | weather/sky + `eng_render` |
| HDRI `white_home_studio_1k.hdr` | **unused** | – | – |
| `cyberpunk_compressed.glb` (city) | the whole environment | a procedural generator of buildings and streets. Note: 68 of 78 materials are **only colour factors without textures**, 24 materials are emissive neons. Excellent news for our approach, the look does not stand on textures. | world gen |
| `quadra.glb`, `plane.glb`, `billboards.glb`, `colider.glb` | car, planes, billboard surfaces, boundary | procedural vehicles with a generated "rain UV", colliders from the generator | world gen |
| 6× MP4 (billboards) | animated emission | procedural animated signs: SDF text and glyphs, scroll, flicker, simple patterns or pixel-art animation in an atlas from code | `eng_gen_tex` + sign shader |
| SMAA area and search textures (in the Three addon) | AA lookup | C headers from the reference SMAA (MIT) or their generator | `tools/` |
| GTAO noise (Three generates the "magic square" noise itself) | AO jitter | blue noise or interleaved gradient noise from code | `eng_gen_tex` |

---

## What to take and where

| Technique | Our module | Adaptation to HLSL + SDL_GPU | Priority |
|---|---|---|---|
| Collision height RT (ortho from above, highest surface, nearest) | weather + render graph pass `rain_occlusion` | depth-only ortho into `D32_FLOAT` (sampler usage) or `R16_FLOAT`. The camera above the max height of the chunk. The XZ↔UV mapping shared in an HLSL header. A persistent resource with `update_every_n`. A pass mask instead of a hide list. | **P1** |
| GPU rain compute + instanced streaks | weather (`weather_rain.hlsl` compute and draw) | RW `StructuredBuffer` pos/vel (≤ 8 storage), `Load()` from the height. **dt integration**, PCG uint hash. The VS reads the storage buffer via `SV_InstanceID` and the quad from `SV_VertexID`. 30 to 100 k drops, the streak stretched by speed. | **P1** |
| Statistical splashes snapped to the height | weather | the same compute, the splash analytic in the PS without an atlas, oriented by the surface normal (a horizontal disk instead of a spherical billboard) | **P1** |
| Rain occlusion → wetness mask (the demo does not have it) | `eng_render` material + weather | in the forward PS: `dry = surfY < height(xz) − ε`. Wetness = global_rain × (1 − dry) × puddle_mask. It drives roughness, albedo darkening and reflection. | **P1** |
| Ripple normals (world XZ, cell hash) | weather compute + `eng_gen_tex` | **bake once per frame** into a tileable `R8G8_SNORM` 512² (compute, 5×5 quality) and sample it on all wet surfaces. As a per-pixel loop only as a fallback. | **P1** |
| Emissive MRT → selective bloom | render graph `forward_opaque` and `bloom` | MRT `RGBA16F` and `R11G11B10_UFLOAT` (not 8-bit). A bloom chain of 5 to 6 mips from half-res (compute or frag). Bloom damped by fog in the composite. | **P1** |
| Parametric grade + look presets + blend | post `grade` + preset data | a struct of ~16 floats per preset, lerp between presets (weather, zone, time). Bake into a 3D LUT 32³ (tools or runtime compute on change), 1 sample in the composite and palette quantisation. | **P1** |
| Static cached shadows (update on demand) | `eng_render` shadows | cache the static cascades (or the distant cascades) and re-render only when the sun moves or the chunk changes, draw dynamic objects separately | **P1** |
| Quality profile (`*ResolutionScale`, `*FrameSkip`, `*Count`) | core config + render graph | one struct read by the render graph, presets by device, a dev console for A/B | **P1** |
| Pass mask (layers) | render graph / draw list | a bitmask on the draw item (`MAIN`, `MIRROR`, `SHADOW`, `HEIGHT`, `PREPASS`) instead of camera clones and toggling `visible` | **P1** |
| Planar reflection with an oblique projection | render graph pass `mirror` | the 0..1 depth branch from `createGround.js:241-258`. A reduced draw list (LOD+1, no transparent), 0.5 res, frame skip. **Add Fresnel** and strength × wetness. Plane = street height under the camera. | **P2** |
| Reflection as additive emission (into the bloom MRT) | material | take the idea (the neon reflection blooms), but with Fresnel and only on wet texels | **P2** |
| GTAO half-res | render graph `ao` (compute) | from a shared depth/normal prepass, bilateral upsample, applied **only to ambient** in the forward pass | **P2** |
| SMAA 1x | post `aa` | 3 passes, the LUT as C headers. After tone mapping at the internal resolution, then upscale. | **P2** |
| Dynamic resolution (adaptive DPR) | core + upscale shader | CPU frame time and hysteresis, two-way, steps of 5 to 10 %. On a sustained drop also degrade expensive passes (mirror, AO). | **P2** |
| Pipeline pre-warm (split compile) | `eng_render` / loading | create all `SDL_GPUGraphicsPipeline` on the loading screen, deferred groups (weather, effects) in the background | **P2** |
| Drops on bodywork and glass (`MovingDropLayer`) | material library (vehicles, windows) | port to HLSL with credit to rocksdanister/BigWings. Rain UV from the vehicle generator. A pipeline variant without rain for LOD. Normal from `ddx/ddy` or 3 samples. | **P2** |
| Procedural sky with clouds (2D noise on a dome) | weather/sky | the z = w trick, noise from `eng_gen_tex`, day/evening/night presets with lerp. Output also into a small cubemap for ambient and reflections. | **P2** |
| Rain-on-glass screen effect | post (optional) | only in the car view. Half-res blur and a drop graph on the screen UV. | **P3** |
| Lens flare (Chapman) | post | low priority. For the GTA III style rather **coronas** with depth-sampled occlusion. | **P3** |
| Edge CA, vignette, film grain | post `grade` | optional, per preset. Dither/grain only against banding. | **P3** |
| DoF (separable box blur by depth) | post | cutscenes and photo mode | **P3** |

### What not to take
- **8-bit linear beauty and emissive RTs** with clipping of HDR emission. We use `RGBA16F` / `R11G11B10F`.
- **AO multiplied onto the final colour** including emission and direct light.
- **Rain integration without `dt`** and a float hash with `time·1000`.
- **A hide list via `visible`** and 4× render of the whole scene without a shared prepass.
- **Fog as a post-process from depth** (broken for transparent objects and tied to the hack `linearDepth > 0.68` for the sky).
- One-way adaptive DPR. Video billboards (video decoding). The HDRI and PMREM pipeline. GLB, Draco and KTX2 loaders. `three-mesh-bvh` (we have our own collisions). GSAP. The inspector and UI layer.
- **SSR as the first solution for wet streets.** We agree with the authors: start with a planar reflection and a probe. SSR only as a supplement.
- The preset values 1:1 (cyberpunk neon noir is not our target look). Take the mechanism, not the numbers.

---

## How it achieves quality

1. **Contrast of dark and neon.** Background `#080610`, IBL 0.08, a cold sun as a "moon". 24 emissive materials with `emissive_strength` 2 to 429 in saturated pink, azure and green. Most of the geometry is **flat colours without textures** (68 of 78 materials). So the look stands not on textures but on values, colour and emission.
2. **Selective bloom only from emission.** The neons and their reflections bloom, nothing else. No "foggy" whole-image bloom. In fog the bloom is damped, so depth stays legible.
3. **A wet street.** A planar reflection of neons in emission × (1 − roughness), rippled by the normal map and world-space ripples. A roughness texture with puddles decides where it reflects. This is the main "money shot" of the whole demo.
4. **Atmosphere in layers.** Fog with a blue-violet colour (0.34; 0.37; 0.47) from 0 to 50 m, sky fog, faint rain streaks, splashes, smoke at the exhaust, clouds on the dome and planes in the background. Each layer is weak, together they form the "air".
5. **Grade.** Green suppression (the typical cyberpunk magenta and teal palette), a light tint and offset, contrast 1.1, vignette 0.8, edge CA and grain. Grain and dither also mask the banding of the 8-bit linear buffers and the noise of the half-res GTAO.
6. **Grounding of objects.** A static 4096² shadow map and GTAO contact darkening.
7. **Motion everywhere.** Ripples, drops running down the car, clouds, smoke, planes and video signs. The scene never stands still.
8. **A small, tuned space.** One alley, hand-set cameras (FOV 65, eye height 1.55 m) and a fog far of 50 m hides the edge of the world.

**Relevance for our goal (GTA III / stylised WoW):**
- Points 1, 2, 4 and 5 are **directly transferable** and cheap. A stylised world with flat or simply textured materials, saturated emission, coloured fog and a grade is exactly the area where GTA III (a night city, coronas, wet roads in VC/SA) and WoW (per-zone fog and sky colours with interpolation) look their best.
- A wet street (point 3) is essential for the "rainy dense city" scenario. For an open world, though, it needs a wetness mask (rain occlusion from the height map) and Fresnel, not just one plane.
- The demo **has no local lights**. In an open city (street lamps, car lights, windows) we will need hundreds of dynamic or fake lights, e.g. clustered forward, or cheaper "light cards" with emission plus coronas. This demo does not cover that in any way.
- Edge CA, lens flare and DoF are cinematic elements outside the GTA III and WoW aesthetic. Keep them only as optional parts of a preset.

---

## Open questions

1. **Reflections in a dense city:** is one dynamically chosen planar plane (the street under the camera) enough, or should we plan a hybrid of planar + SSR + sky probe right away? How will it look on multi-level streets, bridges and roofs?
2. **Rain height map:** a per-frame render around the camera (like the demo), or baked offline/at stream time per chunk (static geometry) with only dynamic objects (cars) rendered or splatted on top? What resolution per metre for wetness occlusion under awnings (0.2 m is not enough for narrow canopies)?
3. **SDL_GPU details:**
   - Is an `R11G11B10_UFLOAT` colour target with blending supported on all three backends?
   - Does `SV_ClipDistance` work via SDL_shadercross on Metal (an alternative to the oblique projection)?
   - Can `SDL_CreateGPUGraphicsPipeline` be called from a side thread for the deferred pre-warm?
   - Can `D32_FLOAT` be sampled as the height in compute?
4. **Local lights:** clustered forward vs. a limited number of per-object lights vs. baked vertex light (GTA III style)? The demo gives no answer.
5. **Rain UV for procedural vehicles and windows:** an object-space projection, or a generated second UV? And how to handle flowing "down" on curved surfaces?
6. **Grade:** runtime parametric, or bake into a 3D LUT? And where exactly in the pipeline will the palette quantisation be (before SMAA, or after it)?
7. **AA and upscale:** SMAA at the internal resolution and our own upscale, or a light TAA (which would also smooth AO and ripples)? Without timestamp queries we need to A/B measure by CPU frame time.
8. **Rain scale:** how many drops and how large a volume for fast driving (100+ km/h), when the volume around the camera wraps? Do we need compensation for camera speed (streaks in the direction of relative velocity)?

---

## Corrections to the notes (2026-09-24)

- **Ripples are not 5×5 but 3×3** (`rainRipples.js:20-23`, `MAX_RADIUS = 1`). The documentation in the repo contradicts itself.
- **DoF is off by default** on all devices (`performanceProfile.js:26`) and is built only through the inspector.
- **Frame skip** for the height map and the reflection exists, but the default value is 1, so nothing is skipped.
- **The grade does not use a LUT**, it is a parametric sequence (tint, offset, green suppress, saturation, contrast, mix).
- **Splashes do not originate from drop impacts**. They are statistically distributed and only snapped to the height map.
- The beauty and emissive RTs are **8-bit** (HDR emission from the GLB is clipped). Tone mapping (ACES) is only at the end.
- The scene is drawn **4× per frame** (height, mirror, AO pre-pass, beauty). AO is in a separate pre-pass, not in the MRT beauty pass.
- Unused assets: `rainDrop.png`, `white_home_studio_1k.hdr`. Unused code: the dedicated `rainPass`.
- There are no point or spot lights in the scene, only 2 directional lights and IBL 0.08.
