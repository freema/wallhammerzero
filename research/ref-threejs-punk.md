# Reference analysis: Threejs-Punk (ektogamat/threejs-conference)

| | |
|---|---|
| Repo | https://github.com/ektogamat/threejs-conference ("Threejs-Punk") |
| Commit analysed | `8cc2059` (2026-09-23, "More sharing updates"), 105 commits total |
| Demo | https://threejspunk.vercel.app/ |
| Authors | Anderson Mancini (103 commits) and Sunag, the TSL author (2 README commits). Built for the TSL Workshop 2026 (threejs.paris) |
| Stack | `three ^0.185.1` (WebGPU + TSL), Vite 6, `three-mesh-bvh ^0.9.13`, GSAP 3 (`package.json`) |
| License | Code is MIT (`LICENSE`). `public/` assets are **not** covered (README.md:349-353). **Parts of the TSL code are derived from CC BY-NC-SA work** (see 3.4 and 3.2) |
| Method | Static reading of all docs and the rendering-relevant source. I did not run `npm install` and did not execute the repo. GLB JSON headers were parsed to count meshes and triangles. Upstream three.js source and browser-status pages were checked online (see Sources) |
| Analysed | 2026-10-02 |

Convention: **Fact** means verified in code or a cited source, with `path:line` ranges relative to the repo root at `8cc2059`. **Opinion** means my assessment. Cost figures labelled "est." are estimates, not measurements. The repo commits no GPU timings.

---

## Executive summary

1. **What it is (Fact).** A small, well-documented WebGPU + TSL demo: 73 JS files with 11,744 lines, plus 13 CSS files. Plain factory composition, no engine and no ECS. The look depends heavily on assets: a 588k-triangle city GLB, PBR puddle textures, an HDRI and video billboards. Only shader, TSL, post and performance **techniques** carry over to us.
2. **The single most valuable thing is the agent knowledge-base pattern.** It consists of `AGENTS.md` (read order, hard constraints with reasons, file routing, recipes, verification checklist), `docs/techniques/*.md` deep dives with a fixed skeleton, Cursor rules scoped by path glob, `STRIP.md`, feature flags, and a perf profile that doubles as a budget document. We should copy it. **But it already drifted (Fact):** I found at least 5 doc-vs-code mismatches in docs written 0–1 days after the code was finished. Copy the pattern **and** add automated drift checks (5.3).
3. **Collision rain (Fact)** is an adaptation of the official MIT three.js example `webgpu_compute_particles_rain`. It works like this: a top-down orthographic pass writes `positionWorld` into a 512² half-float RT with nearest filtering. GPU compute moves 5,000 streaks and 5,000 splashes in a toroidal volume around the camera and respawns drops on the GPU with `If()`. It is cheap and robust. Its defects: velocity is per frame (no delta time), the seeds come from `Math.random` and `time` (not deterministic), and it assumes a flat Y-up world.
4. **Wet ground (Fact).** It combines procedural ripple normals (the structure matches Zavie's Shadertoy "Rainier mood", uncredited) with a manual planar mirror rendered at half resolution. The reflection is injected through `emissive × (1 − roughness)`, with no Fresnel. SSR was tried and removed.
5. **Licensing red flag (Fact).** The car and screen drop graph (`src/tsl/surfaceRain.js`, `src/tsl/rainGlass.js`) is ported from rocksdanister/rain, whose `License.txt` is **CC BY-NC-SA 3.0**. That in turn derives from BigWings' "Heartfelt" (also CC BY-NC-SA 3.0). It is not MIT-clean, so **we must not copy it**. Only a clean-room reimplementation is acceptable.
6. **Post (Fact).** One TSL `RenderPipeline` graph does the following: an MRT emissive buffer drives bloom; GTAO runs at half resolution using a separate normal pre-pass that skips rain and smoke layers; lens flare is derived from bloom; then fog, grade, chromatic aberration, vignette, grain and SMAA. The 6 look presets are pure uniform sets, so switching presets needs no recompile. Structural toggles rebuild the graph.
7. **Performance (Fact + Opinion).** Each frame can traverse the scene up to **4 times**: collision height, mirror, AO pre-pass and beauty. Shadows render on demand only. The levers are half-res passes, frame skip, layer masks, a split shader compile, a per-device policy, and a one-way adaptive DPR. The scene and emissive targets are forced to 8-bit.
8. **Pixel-art priority (Opinion, new).** In a low-res, nearest-upscaled pipeline, **SMAA, DoF, chromatic aberration, film grain, lens flare, GTAO and adaptive DPR are pointless or harmful**. Worth keeping: an emissive mask with a small quantized glow, banded fog, palette/LUT grading presets, pixel-snapped weather particles, cheap low-res planar water reflections, the perf profile, the device policy, split compile and on-demand shadows. three.js ships `PixelationPassNode` and `RetroPassNode` as starting points (Fact).
9. **For the 2D Kairosoft sims now:** take the KB pattern, feature flags with a strip order, the perf profile plus a `window.__app.perf`-style dev API (so an agent can run A/B tests), look presets as palettes, and stateless particle weather that uses tilemap data as its "collision texture".
10. **For the voxel planet later:** build the occlusion heightfield from voxel column data instead of a render pass, use a local tangent frame to handle curvature, use seeded deterministic hashes, and lerp biome look presets the same way the repo lerps its cloud presets.
11. **WebGPU in 2026 (Fact).** Supported in Chrome/Edge on desktop and on Android 12+, in Safari 26 on all Apple OSes, and in Firefox on Windows and on macOS 26 Apple Silicon. Linux support is partial. Android WebView is **not** supported per caniuse. WKWebView is unverified. Electron 44 runs Chromium 152. `WebGPURenderer` falls back to WebGL2 automatically (compute is emulated with transform feedback), so plan for WebGL2 from day one.
12. **Top 3 to take:** (1) the AGENTS.md + docs/techniques pattern **with drift checks and provenance/pixel-art fields**; (2) the perf profile, device policy, split compile, feature flags/STRIP and dev API as one budget-and-observability kit; (3) heightfield-occluded GPU weather, rebuilt to be deterministic and pixel-snapped.

---

## 1. Architecture

### 1.1 Shape of the codebase (Fact)

| Folder | JS lines | Role |
|---|---:|---|
| `src/main.js` | 294 | Root `init()`; wires everything |
| `src/bootstrap/` | 178 | `createRenderer` (WebGPU, limits), `createCamera` |
| `src/world/` | 2,991 | City/car/billboards loaders, ground, weather (rain), effects (smoke, planes), BVH, feature flags |
| `src/post/` | 890 | `postprocessing.js` (RenderPipeline), `look/cyberpunkLook.js` (grade + presets) |
| `src/tsl/` | 750 | Reusable TSL nodes: `surfaceRain`, `rainGlass`, `rainRipples`, `boxBlur`, `edgeChromaticAberration` |
| `src/clouds/` | 577 | Sky dome material (texture noise) |
| `src/runtime/` | 445 | Render loop, camera director, shader warmup |
| `src/platform/` | 338 | `performanceProfile`, `adaptiveDpr`, `deviceLayout`, `userPreferences` |
| `src/controls/` | 799 | First-person walk on BVH raycasts |
| `src/debug/` | 1,388 | three.js Inspector integration, `window.__app` dev API, perf tools |
| `src/ui/`, `src/app/`, `src/audio/`, `src/intro/` | 3,094 | DOM chrome, loader, intro, audio (irrelevant to us) |

There is no TypeScript, no test suite and no custom GLSL/WGSL strings (Fact: grep for `glsl(`/`wgsl(` under `src/` returns nothing). `public/` holds 54 files: 5 GLB, 2 HDR, 6 textures, 2 noise webp, 6 mp4, 13 mp3, fonts, 2 SVG, a preview JPG, and Draco/Basis decoders.

### 1.2 Composition model (Fact)

- `main.js:56-294` is one async `init()` with an explicit order: device budgets (`applyDevicePerformanceDefaults()` **before** the renderer, `main.js:57-59`), then camera, scene, renderer, `createWorld` (parallel GLTF loads), env map, post pipeline, look preset, adaptive DPR, camera director, inspector, app shell, audio, intro flow, render loop, critical-path compile, deferred compile, and finally `startLoop`.
- Every subsystem is a **factory that returns a plain object** (`{ update, setX, dispose, … }`). There are no classes except small helpers (`CollisionHeight`, `EdgeChromaticAberrationNode`).
- **Optional features return `null`**, and every consumer uses optional chaining (e.g. `world.collisionHeight?.update(...)` in `createRenderLoop.js:25-29`). AGENTS.md:85-87 calls this the "composition pattern (do not break)".
- `performanceProfile` is a **mutable module singleton** (`performanceProfile.js:11-54`). Factories read it at construction time, and setters push changes into the pipeline (`applyPerformanceProfileToPipeline`, `performanceProfile.js:90-114`).
- Cross-module coupling is sometimes done by **monkeypatching**. Example: post wraps `rain.setEnabled` so it can rebuild the graph (`postprocessing.js:304-310`).
- Feature flags (`src/world/features.js:17-31`) plus `STRIP.md` form a **subtractive map**: they list the order in which to peel off layers and which folder each flag owns.
- Dev observability: `window.__app` (DEV only, `debug/createDevAppApi.js:1-56`) exposes the scene, world parts and `perf.set(flag, value)` for runtime A/B tests (`debug/createPerformanceDevTools.js:44-111`). The three.js Inspector panel has an **output-view switch**: Combined, Beauty, Emissive, Bloom, Composed, Lensflare and AO (`debug/setupInspector.js:76-84, 941-953`).

### 1.3 History signals (Fact, from `git log`)

- `ea84fd7` (2026-07-21) "Version without SSR" removed SSR, an FSR benchmark (`fsrBenchmark.js`) and many experiments. The planar-mirror ground replaced SSR.
- `52b6b96` (07-22) restructured the code into the current folders.
- `89e766f` (09-01) "rain update" added `createCollisionHeight` and `createCollisionRain` (+654 lines) and removed `createRainStreaks.js`.
- `4c8d438` → `1cae3c4` (09-01): adaptive DPR was disabled ("permanently locks a session into lower resolution … visuals inconsistent between loads") and then re-enabled 3 minutes later. `4c8d438` is the only commit co-authored by the Cursor agent.
- `ce0d93a`, `8cc2059` (09-23): **all agent docs** (AGENTS.md, docs/techniques, .cursor/rules, the README knowledge base) were added in the last two commits, after development ended.

**Opinion.** The architecture suits a single-scene demo and is easy for an agent to navigate: routing tables, small files and explicit order. It does not scale to a game. There is no update scheduling beyond one loop, no entity model, no save state and no determinism. Global mutable perf state plus monkeypatching are acceptable at this size but would hurt in a generator that emits many games. The knowledge base was retrofitted rather than maintained alongside the code, and that is the root cause of the drift in 5.3.

---

## 2. Rendering pipeline

### 2.1 Renderer setup (Fact, `bootstrap/createRenderer.js`)

- `new THREE.WebGPURenderer({ antialias:false, alpha:false, stencil:false, powerPreference:"high-performance", requiredLimits })` (`:35-41`). AA comes from SMAA in post.
- Before creating the renderer, it requests a **probe adapter** with `featureLevel:"compatibility"` and raises `maxColorAttachmentBytesPerSample` to 64 when the device allows it (`:8-30`). The default limit of 32 bytes caps how many MRT targets can be bound.
- ACES tone mapping. `PCFSoftShadowMap` with **`shadowMap.autoUpdate = false`**; shadows re-render only on `requestShadowMapUpdate()` (`:44-47, 69-81`). The sun has a 4096² shadow map over 400×400 m (`world/scene.js:21-41`).
- Static models get `matrixAutoUpdate = false` (`world/scene.js:3-15`).
- Camera: perspective, near 0.1, far 300. FOV is 65° on desktop and 100° on mobile (`bootstrap/createCamera.js:4-5, 30-36`).
- The WebGL2 fallback is only **logged** in DEV (`:59-64`). Nothing else in the repo handles or tests it.

### 2.2 Per-frame order (Fact, `runtime/createRenderLoop.js:18-63`)

1. `cameraDirector.update(delta)` (orbit or walk), then the HUD.
2. **Collision height pass**: `renderer.render(scene, orthoCam)` into the height RT using `scene.overrideMaterial`, with rain, sky, smoke and planes hidden (`createCollisionHeight.js:85-133`).
3. **Rain compute**: `renderer.compute(computeParticles)` and `renderer.compute(computeSplash)` (`createCollisionRain.js:364-376`).
4. CPU updates: planes on Catmull-Rom paths, sky dome follows the camera, ground `uTime`, ripple on/off, billboard video play/pause by distance, car-rain proximity fade.
5. **Ground mirror pass**: `renderer.render(scene, mirrorCamera)` into a half-res RT (`createGround.js:190-276`), gated by `performanceProfile.groundReflection`.
6. `pipeline.syncCameras(camera)` copies the camera into `aoCamera` and `sceneCamera` with their layer masks (`postprocessing.js:66-95`). Then the DoF focus point is updated.
7. `post.render()` evaluates the RenderPipeline graph (2.4).
8. `performanceTools.sampleFps()`, which feeds adaptive DPR once per second.

### 2.3 Render targets (Fact)

| Target | Size / format | Filter | Cadence | Where |
|---|---|---|---|---|
| Collision height | 512² (`collisionRainResolution`), **HalfFloat** RGBA = `positionWorld` | Nearest, no mips | every `collisionRainFrameSkip` frames (default 1) | `createCollisionHeight.js:24-31` |
| Ground mirror | drawing buffer × `groundResolutionScale` (0.5), HalfFloat, with depth | Linear, no mips | every `groundReflectionFrameSkip` (1) | `createGround.js:69-76, 170-183` |
| AO pre-pass | full res; MRT `output = packNormalToRGB(normalView)`, **UnsignedByte**, plus depth | – | per frame if AO on | `postprocessing.js:99-111` |
| Scene pass | full res; MRT `output` + `emissive`, **both UnsignedByte** (three's PassNode default is HalfFloat) | – | per frame | `postprocessing.js:113-126` |
| GTAO | × `aoResolutionScale` 0.5, 6 samples, no temporal filtering | – | per frame if AO on | `postprocessing.js:128-137` |
| Bloom chain | × `bloomResolutionScale` 0.5 | – | per frame | `postprocessing.js:147-148` |
| Lens flare + Gaussian blur | × 0.5 | – | per frame (desktop) | `postprocessing.js:150-163` |
| DoF (separable box) | 2 implicit RTTs via `convertToTexture` | – | off by default | `tsl/boxBlur.js:17-55` |
| Chromatic aberration input | implicit full-res RTT (`convertToTexture(graded)`) | – | per frame | `tsl/edgeChromaticAberration.js:128-135` |
| SMAA | 3 internal HalfFloat RTs (edges, weights, blend) in three.js | – | per frame if on | three `SMAANode.js:59-77` |
| Shadow map | 4096², PCF soft | – | **on demand only** | `world/scene.js:24-39` |

Fact: three's `RenderPipeline` sets `renderer.toneMapping = NoToneMapping` while it renders passes, then applies `renderOutput(…, toneMapping, outputColorSpace)` at the end (three `RenderPipeline.js:75, 138-155, 192-194`). The scene pass therefore stores **linear, pre-tonemap values in 8 bits**, which clamps anything above 1.0. Opinion: the bandwidth saving is real, but bloom can only see emissive values up to 1.0. That is why the bloom strengths are high (2.5–5).

### 2.4 Post graph (Fact, `postprocessing.js:225-277`, `cyberpunkLook.js:362-422`)

```
aoPrePass(scene, aoCamera −rain −smoke) ─► GTAO(depth, normals) ─┐
scenePass(scene, sceneCamera +rain +smoke)  MRT{output, emissive}│
   output × AO ─► [DoF: mix(beauty, boxBlurSeparable(beauty), smoothstep(36,75,|viewZ−focusZ|))]
   emissive ─► bloom(0.5x) ─► lensflare(bloom) ─► gaussianBlur(0.5x) ┐
   look.buildComposite: fog = max(smoothstep(near,far,viewDist), smoothstep(.68,1,linearDepth))
        + bloom×(1−fog×0.75) ─► tint+offset ─► greenSuppress ─► saturation ─► contrast ─► mix(gradeMix)
        ─► edgeChromaticAberration (RTT) ─► vignette
   ─► SMAA (optional) ─► film grain ─► [intro: rainGlass mix] ─► renderOutput(ACES, sRGB)
```

- **Structural** toggles (bloom, DoF, lens flare, AO, SMAA, rain pass, intro glass) call `rebuildSteadyOutput()`, which sets `post.outputNode` and `post.needsUpdate = true`. That recompiles the shader graph (`postprocessing.js:241-267, 322-361`).
- **Parametric** changes, such as the look presets, write only to uniforms (`cyberpunkLook.js:297-360`) and never recompile.
- Opinion: this separation between structural and parametric settings is the most reusable idea in the post code.

### 2.5 Materials and layers (Fact)

- Every material is a node material that overrides slots; nothing uses ShaderMaterial. `MeshStandardNodeMaterial` (ground, car paint, billboards) uses `colorNode`, `roughnessNode`, `normalNode`, `emissiveNode`, `metalnessNode`. `MeshPhysicalNodeMaterial` is used for car glass with clearcoat (`applyCarSurfaceRain.js:120-144`). `NodeMaterial` with `vertexNode` billboarding is used for rain streaks; `MeshBasicNodeMaterial` for splashes and the height override (`outputNode`); `SpriteNodeMaterial` for smoke.
- Layers: rain is on **layer 2** (`createCollisionRain.js:25, 47-50`) and smoke on **layer 3** (`createSmoke.js:17-22`). The AO camera disables both, and the beauty camera enables both. The mirror camera disables rain. The height pass hides objects through **visibility** (`collisionHideObjects.js:1-25`), not through layers.

---

## 3. Key techniques in depth

Each technique below lists: Files · How it works · Cost · Limits · **Pure code?** · License.

### 3.1 Collision heightfield + GPU rain/splashes ★

**Files.** `src/world/weather/createCollisionHeight.js` (147 lines), `createCollisionRain.js` (487), `collisionHideObjects.js` (25). Docs: `docs/techniques/collision-rain.md`.

**How it works (Fact).**
- An orthographic camera 100×100 m wide, sitting 50 m up with depth 80, follows the player's XZ and looks straight down (`createCollisionHeight.js:15-22, 99-107`). A single override material writes world position:
  ```js
  this.material = new THREE.MeshBasicNodeMaterial();
  this.material.outputNode = vec4(positionWorld, 1);          // :30-31
  ```
- `getUV(worldPos)` maps XZ into `[0,1]²` around the volume centre (`:51-65`). Compute uses the same function, so the mapping stays consistent between write and read.
- Buffers come from `instancedArray(5000, "vec3")` for position and velocity, plus a splash position buffer and a `uint` cycle buffer (`createCollisionRain.js:107-110`).
- Update kernel (`:139-182`):
  ```js
  position.addAssign(velocity);                              // per frame, no dt
  // toroidal wrap of XZ around centre = camPos + camDirXZ * 15
  const floorHeight = texture(heightRT, collisionHeight.getUV(position)).y;
  If(position.y.lessThan(floorHeight.add(0.05)), () => { /* respawn y∈[20,35], new xz, new vy */ });
  ```
- Splashes run on their own cycle `floor(time·speed + hash)`. Each new cycle picks a random XZ in the rain area and snaps Y to the height map (`:186-233`). **Splashes are not tied to real drop impacts** (Fact).
- Drawing uses one instanced `PlaneGeometry` for streaks (0.04×1.1 m) and one for splashes. `billboarding({ position: buffer.toAttribute() })` runs in `vertexNode`. The streak shape is a procedural mask; splashes use a 5-frame atlas `water-splash.webp`, read through `.r` because the file has no alpha (`:260-356`). Both are `frustumCulled = false` with a 1e5 bounding sphere.
- This is an adaptation of three.js's official `webgpu_compute_particles_rain` example, which uses the same 1024² HalfFloat nearest RT, `positionWorld` colour node, `If(position.y < floor)` respawn and per-frame `position.addAssign(velocity)` (see Sources).

**Cost.**
- Fact: one extra scene traversal per frame (ortho, 512², basic material), two compute dispatches of 5,000 threads each, and two instanced draws of 5,000 alpha-blended quads each.
- Opinion/est.: compute cost is negligible. The height pass costs whatever the scene's draw and vertex load is, which is small here (~100 draws). Overdraw from 10k thin quads is modest.

**Limits.**
- Fact: velocity is per frame, so at 120 Hz rain falls twice as fast (`:143`; `update(_delta)` ignores delta, `:364`).
- Fact: seeds are `Math.random()` baked as shader constants (`:112`) and `time·1000` (`:166`), so runs are not reproducible.
- Fact: respawn heights are absolute world Y values (20–35 m), and the up axis is assumed to be +Y.
- Fact: the height map stores only the topmost surface per texel. That is correct for rain, but it cannot support "under the roof" effects.
- Fact: the ortho camera is not snapped to texels, so the height field shimmers by sub-texel amounts as the player moves (harmless for rain).
- Fact: `collectCollisionHideObjects` allocates arrays every frame (`createRenderLoop.js:25-28`).
- Fact: texels left empty after the clear read as y = 0. Here a 400 m ground plane always fills them.
- Fact: the count is clamped to the range 500–5,000 (`:66`).

**Pure code?** Yes for streaks, whose mask is already procedural. The splash atlas can be replaced by an analytic expanding ring or crown in TSL (`1 − smoothstep` on `|length(uv−0.5) − r(t)|`), or, for pixel art, by a 3–4-frame sprite drawn in code. The height map comes from live geometry, so it needs no asset.

**License.** MIT, from three.js examples and this repo.

### 3.2 Procedural rain ripples on the ground

**Files.** `src/tsl/rainRipples.js` (78 lines), wired in `src/world/ground/createGround.js:94-111`.

**How it works (Fact).**
- A cell grid over world XZ, scaled by `uRippleScale` 4.83. Each neighbouring cell has a hashed centre and phase `t = fract(0.3·time + hash)`. A ring profile `sin(31·d)·band(d)` with `d = |v| − 2t` is differentiated by central difference (`h = 0.001`), faded by `(1−t)²`, and accumulated as `normalize(v)·derivative`. The XY result is rebuilt into a normal (`rainRipples.js:37-75`).
- The ripple XY is used in two places: added to the tiled normal map (strength 0.015) and added to the reflection UV (strength 0.08) (`createGround.js:101-118`).
- **The neighbourhood is 3×3 (9 cells)**: `MAX_RADIUS = 1`, `CELL_COUNT = (2·1+1)² = 9` (`rainRipples.js:20-23`). The README and wet-ground.md claim "5×5 / 25 cells" (README.md:223, wet-ground.md:47, 124). **Doc drift.**

**Cost (est.).** 9 cells × (2 hashes + 2 sin + 4 smoothstep + normalize) ≈ 300–400 ALU ops per ground fragment, with no texture fetches. The cost does not depend on drop count.

**Limits.**
- Fact: ripples are not coupled to the actual splash positions.
- Fact: the effect is a normal perturbation only, with no puddle mask, so ripples appear wherever the material is.
- Opinion: at low internal resolution, normal-only ripples become sub-pixel noise.

**Pure code?** Yes, already.

**License (Fact + Opinion).** The constants and structure (`HASHSCALE1 = .1031`, `hash12`/`hash22`, `MAX_RADIUS`, `sin(31·d)`, `smoothstep(-.6,-.3,d)`, `h = .001`, `(1−t)²`) match Zavie's Shadertoy "Rainier mood" (ldfyzl). Third-party copies credit it as "Zavie: Rainier mood". The file carries **no credit**. Shadertoy content defaults to CC BY-NC-SA 3.0 unless the author states otherwise. I could not re-fetch Shadertoy's terms in this session (HTTP 403). → **Treat as non-commercial and write a clean-room version.** The underlying idea (hashed cells with expanding rings) is generic.

### 3.3 Planar reflection (manual mirror, oblique clip)

**Files.** `src/world/ground/createGround.js` (315 lines). Docs: `docs/techniques/wet-ground.md`.

**How it works (Fact).**
- Each frame, the camera position and look target are reflected across the ground plane, and FOV, aspect, near, far and `coordinateSystem` are copied. The rain layer is disabled. A **Lengyel oblique near-plane** clips geometry below the plane, with a WebGPU-specific write to `projectionMatrix.elements[10]` (`:203-258`):
  ```js
  projectionMatrix.elements[10] =
    renderer.coordinateSystem === THREE.WebGPUCoordinateSystem ? _clipPlane.z : _clipPlane.z + 1;
  ```
- The ground mesh is hidden, MRT is set to null, and `renderer.render(scene, mirrorCamera)` draws into the half-res RT, after which state is restored (`:260-275`). This mirror render happens **outside** the post `PassNode`. The header comment explains that TSL `reflector()` inside a PassNode can end up bound both as a texture and as a render attachment (`:33-38`).
- The material samples the RT at `screenUV.flipX() + normalWarp + rippleOffset` and writes **emissive** = `reflection × (1 − roughness) × 0.08 × fogFade` (`:113-139`). The ground is `transparent`, with alpha set by `rangeFogFactor`.

**Cost.**
- Fact: a full, fully shaded scene traversal at 0.5× resolution every frame.
- Opinion: probably the most expensive secondary pass here, since it shades everything with PBR.

**Limits.**
- Fact: one infinite flat plane at a fixed Y, and the reflection term has no Fresnel.
- Opinion: adding the reflection as emissive means it ignores lighting and also feeds the bloom MRT, so bright neon reflections bloom. That is a nice side effect for this look but physically wrong.

**Pure code?** The mirror itself is pure code. The **wet-puddle albedo/roughness/normal JPGs** (3.4 MB) must be replaced. A procedural puddle mask (fbm, with a threshold controlled by wetness) can drive roughness and darken albedo, and an fbm-derivative normal or no normal at all can replace the normal map.

**License.** MIT. The pattern follows three.js `webgpu_reflection` and `webgpu_reflection_roughness` (stated in the header comment).

### 3.4 Procedural surface drops (car paint/glass) and rain-on-glass intro

**Files.** `src/tsl/surfaceRain.js` (236), `src/world/car/applyCarSurfaceRain.js` (334), `src/tsl/rainGlass.js` (207), `src/intro/createRainGlassIntro.js` (80).

**How it works (Fact).**
- `MovingDropLayer` (a grid-cell drop with a `Saw` envelope, a trail and satellite droplets) is evaluated twice per sample (`uv` and `uv·1.85`). The normal comes from **finite differences**: the mask is evaluated at c, c+εx and c+εy, giving 6 layer evaluations per fragment (`surfaceRain.js:40-92, 169-189`).
- On the car, rain is mapped through **UV1** (`uv(1)`, with UVs fixed by hand in Blender, commit `1338ccd`), while PBR maps stay on UV0. Static drops are disabled because they "blinked". Roughness and normal mix toward wet values by `mask × intensity` (`applyCarSurfaceRain.js:146-215`).
- Distance fade: intensity smoothsteps from 1 at 20 m to 0 at 32 m (`:289-318`). **The shader still evaluates the full graph at intensity 0**, so the fade is visual only. car-surface-rain.md:94 admits this, yet README.md:126 lists it as a performance lever.
- `rainGlass.js` applies a **duplicate** of the same graph in screen space: a Gaussian blur at 0.6×, refraction by the drop normal, and highlights. It is mixed in by an `amount` uniform during the intro and then disposed (`rainGlass.js:147-206`, `postprocessing.js:260-292`). This duplication contradicts `.cursor/rules/tsl-webgpu-shaders.mdc:12` ("do not duplicate drop/ripple logic").

**Cost (est.).** Roughly 600–900 ALU ops per car fragment at every distance. The glass pass costs one blur plus 9 layer evaluations per screen pixel, during the intro only.

**Limits.** It needs a clean second UV channel and has no world-space mapping. Drops slide along +V, not along gravity.

**Pure code?** Yes, entirely math.

**License (Fact): BLOCKER.** The file credits rocksdanister/rain (`surfaceRain.js:19-20`, `rainGlass.js:28-29`). rocksdanister/rain's `License.txt` states "**Creative Commons Attribution-NonCommercial-ShareAlike 3.0**" and credits "Heartfelt – by Martijn Steinrucken aka BigWings – 2017, License CC BY-NC-SA 3.0". The repo's own docs say MIT covers "the integration, not that original shader" (car-surface-rain.md:9). → **Do not copy.** For us: a wetness = darken + lower-roughness uniform per biome is enough for voxels and pixel art. If screen drops are ever needed (e.g. flying through cloud), write them clean-room.

### 3.5 MRT emissive → bloom → lens flare

**Files.** `src/post/postprocessing.js:113-163, 209-223`.

**How it works (Fact).**
```js
const mrtNode = mrt({ output, emissive: vec4(emissive, output.a) });
mrtNode.setBlendMode("emissive", new BlendMode(NormalBlending));
scenePass.setMRT(mrtNode);
const bloomPass = bloom(scenePassEmissive, 2.5, 0.45);   // .setResolutionScale(0.5)
const flarePass = lensflare(bloomPass, { threshold, ghostAttenuationFactor, ghostSpacing });
```
Bloom reads **only** the emissive attachment, which gives selective bloom with no layer tricks. Any material that sets `emissiveNode` (billboards, ground reflection, car lights) glows. Fog attenuates bloom (`cyberpunkLook.js:379-384`).

**Cost (Fact + est.).** One extra 8-bit colour attachment on the beauty pass and a half-res bloom mip chain. The flare adds a ghost pass and a Gaussian blur at half res. All are full-screen passes, but cheap at 0.5×.

**Limits.** Fact: the 8-bit emissive target clamps at 1.0. Fact: the presets rescale bloom with `strength + bloomWide.strength·0.35` (`cyberpunkLook.js:316-324`), a leftover from an earlier dual-bloom design.

**Pure code?** Yes.

### 3.6 GTAO with a layer-filtered normal pre-pass

**Files.** `postprocessing.js:36-41, 99-137, 228-232`.

**How it works (Fact).** A **second scene pass** with `aoCamera` (rain and smoke layers disabled) writes `packNormalToRGB(normalView)` (8-bit) plus depth. `ao(depth, normals, aoCamera)` runs at 0.5× with 6 samples and `useTemporalFiltering = false` (it would need TRAA). AO multiplies the beauty output.

**Cost.** Fact: one additional full-resolution geometry pass, plus GTAO at half resolution. Opinion: paying a full extra traversal only to keep particles out of the normals is expensive. An alternative is to write normals into the beauty MRT and render the particles in their own pass.

**Limits.** Fact: disabled on all mobile devices (`performanceProfile.js:73`).

**Pure code?** Yes.

### 3.7 Look composite + presets (fog, grade, CA, vignette, grain)

**Files.** `src/post/look/cyberpunkLook.js` (446), `src/tsl/edgeChromaticAberration.js` (136).

**How it works (Fact).**
- Fog is post-process fog: `max(smoothstep(near, far, viewDistance), smoothstep(.68, 1, linearDepth))`. The comment explains that `scene.background` gives no reliable viewZ, so a "sky fog" term is derived from linear depth (`:362-372`).
- The grade is tint/offset → green suppression → saturation → contrast, blended by `gradeMix` (`:386-393`). Edge CA uses radial R/B UV scaling with dither (`edgeChromaticAberration.js:49-93`). The vignette is radial (`:407-415`). Film grain uses three's `film()` (`:420-422`).
- `LOOK_PRESETS` defines 6 presets (neutral, neonNoir, magentaRain, tealDusk, silentHill, sinCity) as plain JSON. Each preset covers bloom, lens flare and 16 uniforms (`:104-265`). `applyPreset` only writes uniforms (`:348-360`), and the choice persists in localStorage.

**Cost.** Fact: CA calls `convertToTexture(graded)`, which adds a full-res RTT pass. Everything else is ALU in the final pass.

**Pure code?** Yes.

**Opinion.** The "presets as data, applied as uniforms" model maps directly onto time-of-day, biome or season grading for us.

### 3.8 DoF (separable box blur)

**Files.** `src/tsl/boxBlur.js:17-55`, `postprocessing.js:167-179, 244-251`.

**How it works (Fact).** The beauty image is blurred horizontally and then vertically: each `boxBlurAxis` calls `convertToTexture`, so the blur costs 2 RTTs. The blurred image is mixed in by `smoothstep(36, 75, |viewZ − focusZ|)`. The focus point is tweened with GSAP. DoF is **off by default everywhere** (`performanceProfile.js:25-26`) and skipped on Safari (`postprocessing.js:244`).

**Pure code?** Yes.

### 3.9 Sky dome

**Files.** `src/clouds/cloudsMaterial.js` (205), `createCloudSky.js` (343), `noiseTextures.js` (29).

**How it works (Fact).**
- An inward-facing sphere of radius 135 follows the camera. `vertexNode` sets `position.z = position.w`, which pins it to the far plane (`cloudsMaterial.js:48-53`).
- 2D cloud bands come from roughly 10 taps into two noise WebP files (`custom_noise.webp`, `custom_perlin.webp`), which are loaded as **sRGB** (`noiseTextures.js:9`).
- Day, evening and night presets are lerped with `lerpPreset` (`createCloudSky.js:64-88, 173-180`).

**Pure code?** Replaceable. Either bake seeded noise into a `DataTexture` at boot, or call TSL's built-in MaterialX noise (`mx_noise_float`, `mx_fractal_noise_float`) directly. That costs more ALU than the texture taps but needs no assets.

**Limits (Opinion).** This is a 2D UV-band sky with no atmosphere. It is useless for showing planet curvature from altitude.

### 3.10 Stateless GPU sprite particles (smoke)

**Files.** `src/world/effects/createSmoke.js:43-90`.

**How it works (Fact).** Instanced `SpriteNodeMaterial` with `sprite.count = N`. Per-instance randomness comes from `range(min, max)`. Life is `(time·speed·rangeLife) mod 1`, and position, scale, rotation, colour and opacity are all functions of life. There is **zero CPU work and no compute pass** (`:56-82`). Counts are 50 per exhaust emitter and 40 per ambient emitter.

**Pure code?** The only asset is `smoke.png`. A procedural soft puff (radial falloff × fbm) replaces it, or for pixel art a dithered 8×8 blob.

**Opinion.** This is the cheapest particle pattern there is, ideal for chimneys, campfires and dust.

### 3.11 Split shader compile (warmup)

**Files.** `src/runtime/warmup.js` (144), `main.js:242-286`.

**How it works (Fact).**
- **Critical path** (`warmup.js:75-118`): rain, smoke and planes are hidden, then `renderer.compileAsync(scene, beautyCamera)` runs, then one post frame compiles the RenderPipeline graph. The loader shows 100% with status "ASSEMBLING SECTOR" so the compile does not look stuck.
- **Deferred** (`:120-144`): rain, smoke and planes compile while the intro plays.
- On Safari, the loop waits for the deferred compile to finish before starting (`shouldCompileBeforeRenderLoop()`, `performanceProfile.js:82-84`). Otherwise the loop starts first and the deferred compile is awaited after the intro.

**Pure code?** N/A (pattern).

**Opinion.** Copy as-is: "compile what the first frame needs, defer the rest behind an intro or loading beat".

### 3.12 Shadows on demand and frozen transforms

Fact: `shadowMap.autoUpdate = false`, plus `sunLight.shadow.autoUpdate = false` and `requestShadowMapUpdate(reason)` on lighting change or resize (`createRenderer.js:44-46, 69-81`; `scene.js:39`). Fact: static GLB roots are frozen (`scene.js:3-15`).

Limit (Fact): the planes cast shadows (`createFlyingPlanes.js:83-84`), but the shadow map never refreshes for them.

Opinion: excellent for slow-sun games. Combine with a sun-angle threshold.

### 3.13 TSL idioms worth copying (Fact, with where)

- `Fn(...).setLayout({ name, type, inputs })` emits a real WGSL/GLSL function instead of inlining (`edgeChromaticAberration.js:38-47, 84-93`).
- `uniform(x).setGroup(renderGroup)` updates a uniform once per render instead of per object (`rainGlass.js:133-142`).
- `/*#__PURE__*/` on `Fn` constants allows tree-shaking (`surfaceRain.js`, `boxBlur.js`).
- `convertToTexture(node)` inserts an implicit RTT pass whenever a node needs neighbour taps (blur, CA). **Every call is a full-screen pass**, so count them.
- In compute: `instancedArray(n, type)`, `.element(instanceIndex)`, `If(cond, () => …)`, `.compute(n)` with `renderer.compute()`, and `texture(rt, uv)` sampled inside compute (`createCollisionRain.js`).
- `billboarding({ position: storageBuffer.toAttribute(), horizontal, vertical })` gives instanced camera-facing quads fed directly from compute buffers.
- `range()` gives per-instance random attributes without buffers (`createSmoke.js:56-59`).
- `mrt({...})` with `setBlendMode` per attachment, and `pass.getTextureNode(name)`, `getViewZNode()`, `getLinearDepthNode()` (`postprocessing.js`, `cyberpunkLook.js:272-273`).
- API churn warning (Fact): the class this repo uses as `RenderPipeline` was called `PostProcessing` until r183. three.js now keeps a deprecated wrapper (three `src/renderers/common/PostProcessing.js`). → Pin versions and record version-specific API notes in our technique docs.

---

## 4. Performance

### 4.1 Workload inventory (Fact, parsed from GLB JSON headers)

| Asset | Meshes / primitives | Materials | Triangles (approx.) |
|---|---|---|---:|
| `cyberpunk_compressed.glb` (city) | 78 / 78 | 78 | ~588k |
| `quadra.glb` (car) | 15 / 15 | 10 | ~60k |
| `plane.glb` (×2 instances) | 1 / 4 | 4 | ~6.4k |
| `billboards.glb`, `colider.glb` | 5 + 1 | 3 | <200 |

So roughly 100 draws and about 650k triangles per full traversal.

### 4.2 Bottlenecks (Opinion, grounded in the facts above)

1. **Repeated scene traversals.** Height pass, mirror, AO pre-pass and beauty add up to **4× the geometry per frame** on desktop. That is about 2.6M triangles and about 400 draws. It is fine for ~100 draws but scales badly to a voxel world with hundreds of chunk draws.
2. **Full-screen pass count at full resolution.** The scene MRT, CA RTT and 3 SMAA RTs all run at full res, plus the bloom chain, flare and GTAO at half res. Fill rate is the main cost on phones, which is why mobile drops AO, flare and billboards.
3. **Per-pixel ALU hot spots.** Car drops cost about 6 layer evaluations per fragment even when faded out. Ground ripples cost 9 cells per fragment on a 400 m plane. Sky clouds cost about 10 texture taps on the whole background.
4. **Shader compile hitches.** Handled by the split compile, but every structural post toggle (`post.needsUpdate`) recompiles at runtime.
5. **Smaller items.** 8-bit targets were chosen for bandwidth (a deliberate trade, Fact). Forcing KTX2 textures to RGBA32 caused a "walk-mode FPS collapse" (comment, `createGltfLoaders.js:82-84`). Video decode is handled by distance-based play/pause with hysteresis (20/50 m, `billboardFace.js:15-16, 131-146`). Arrays are allocated per frame for the hide list.

### 4.3 Levers (Fact, `src/platform/performanceProfile.js:11-54` unless noted)

| Lever | Default | Mobile / Safari override | Mechanism |
|---|---|---|---|
| `maxPixelRatio` | 1.5 | 1.25 on Apple mobile / Safari (`:75-77`) | `min(devicePixelRatio, max)` |
| `adaptiveDpr` | true | off on Safari, desktop and mobile (`:65-67, 77`) | one-way drop to DPR 0.85 after 2 slow 1 s windows under 50 fps, then **also** DoF, flare and billboards off (`adaptiveDpr.js:11-73`, `main.js:130-143`). Gated until after the intro (`main.js:146-148`) |
| `ao`, `aoResolutionScale`, `aoSamples` | on, 0.5, 6 | off on mobile (`:73`) | GTAO half-res |
| `bloom`, `bloomResolutionScale` | on, 0.5 | – | half-res bloom |
| `lensflare`, `lensflareResolutionScale`, `lensflareBlurRadius` | on, 0.5, 4 | off on mobile (`:71`) | |
| `dof` | **off** | DoF never on Safari (`postprocessing.js:244`) | separable blur |
| `smaa` | on | stays on (`:78`), although the comment at `:59-61` says "disable … SMAA" (**drift**) | |
| `groundReflection`, `groundResolutionScale`, `groundReflectionFrameSkip` | on, 0.5, 1 | – | mirror RT |
| `collisionRainResolution`, `collisionRainFrameSkip`, `collisionRainCount` | 512, 1, 5000 | – | height RT and particles |
| `carSurfaceRainFadeStart/End` | 20/32 m | – | visual-only fade (3.4) |
| `exhaustCount`, `ambientCount` | 50, 40 | – | sprite counts |
| `billboardsEnabled` | on | off on mobile (`:72`) | video decode |
| Render layers | rain=2, smoke=3 | – | excluded from AO pre-pass and mirror |
| Split compile | – | Safari compiles before the loop (`:82-84`) | `warmup.js` |
| Timestamp queries | off | Safari throws on `GPUQuerySet` (`debug/inspectorControls.js:14-33`) | |

Notes (Fact):
- `isMobileDevice()` is true for any window ≤ 768 px wide, coarse pointers and Apple mobile (`deviceLayout.js:58-60`). It is evaluated **once at boot** (`main.js:57-58`), so a narrow desktop window gets mobile budgets.
- `printHelp` suggests stronger values (0.25 mirror scale, frame skip 2) than the defaults (`createPerformanceDevTools.js:94-109`).

### 4.4 What is missing (Opinion)

- No committed per-pass GPU timings and no reference-device budget table. Timestamps are off by default.
- No LOD, no distance culling of the mirror's scene, and no "update the mirror only when the camera moves".
- The adaptive DPR is one-way with no recovery. The team itself flip-flopped on it (1.3).
- No frame-time-based quality tiers, only an FPS threshold.

---

## 5. What to take and where

**Ranking under the new priority (2D pixel-art sims first, voxels rendered as pixel art later):**
1. **(iii) the AGENTS.md + docs/techniques knowledge-base pattern** has the highest value, and it is engine-agnostic.
2. **(ii) the 2D sims** benefit from the perf/dev kit, look presets and weather logic.
3. **(i) the voxel planet** benefits from the weather, water and post techniques, filtered through the pixel-art matrix below.

### 5.0 Pixel-art relevance matrix (applies to (i) and (ii))

Assumed pipeline: render at a fixed low internal resolution (e.g. 320×180 or 480×270), upscale with nearest-neighbour by an integer factor, and draw the UI at native resolution.

Relevant three.js building blocks (Fact):
- `PixelationPassNode` renders the scene at `1/pixelSize` with `NearestFilter` and adds depth and normal edge highlights (three `examples/jsm/tsl/display/PixelationPassNode.js:14-57`).
- `RetroPassNode` adds PS1-style vertex snapping and affine UVs at 0.25 resolution.
- `Lut3DNode` provides LUT grading.

| Technique (this repo) | Verdict for low-res pixel art | Why (Opinion) |
|---|---|---|
| SMAA (3.x post) | **Drop** | Anti-aliasing blurs deliberate pixel edges. After an integer upscale there are no sub-pixel edges left to fix. |
| DoF / separable blur (3.8) | **Drop** | Destroys pixel clusters. Use fog bands or palette desaturation for depth instead. |
| Edge chromatic aberration (3.7) | **Drop** | Sub-pixel channel offsets quantize to whole-pixel colour fringes, which read as noise. |
| Film grain (3.7) | **Drop**; replace with ordered (Bayer) dithering tied to screen or world position | Per-frame random noise at low resolution looks like flicker. |
| Lens flare (3.5) | **Drop** (optionally hand-drawn sprite flares) | Blurred ghosts are anti-pixel. |
| GTAO + normal pre-pass (3.6) | **Drop** for voxels; bake per-vertex voxel AO at meshing time | Noisy at low resolution, costs an extra traversal, and voxel AO is free. |
| Bloom via **emissive MRT** (3.5) | **Adapt**: keep the emissive mask; do a 1–2 px low-res glow quantized to the palette, or emissive pixels that ignore night darkening | Torches, windows, lava and crystals read well at night. Avoid soft wide halos. |
| Post fog (distance + sky) (3.7) | **Keep**, quantized into N bands with dithered edges | A classic pixel-art depth cue and nearly free. |
| Grade + uniform presets (3.7) | **Keep as palette/LUT presets** (time of day, season, biome), lerped like `lerpPreset` | Switching costs only uniforms, with no recompile. |
| Vignette | Optional, dithered | Cheap. Easy to overdo. |
| Half-res `resolutionScale` knobs | **Mostly moot** | The whole frame is already low resolution, so fill rate stops being the bottleneck and draw/CPU cost dominates. |
| Adaptive DPR (4.3) | **Drop**; use a fixed internal resolution and integer scale, with at most coarse tiers | Changing resolution changes the art. The repo's own history shows DPR drops making visuals inconsistent (`4c8d438`). |
| Frame-skip for secondary RTs | **Keep** | Independent of resolution. |
| Split compile / warmup (3.11) | **Keep** | Hitches do not depend on resolution. |
| Device policy (4.3) | **Keep** (pattern) | Safari/iOS quirks still apply. |
| Shadows on demand (3.12) | **Keep**; match shadow texel size to the art pixel and use hard (non-PCF) filtering | Crisp shadows that match the pixel grid. |
| Collision rain heightfield + compute (3.1) | **Keep the logic, restyle**: 1-pixel-wide streaks snapped to the low-res grid, 2–4-frame procedural splash sprites | The occlusion logic is resolution-independent. |
| Ground ripple normals (3.2) | **Adapt**: draw expanding rings as palette-step pixels, not as normal perturbation | Normal-only ripples vanish or shimmer at low resolution. |
| Planar water reflection (3.3) | **Keep**; it is cheap at internal resolution. Stylize with a per-row horizontal wobble | SNES-style water is a strong pixel-art look. |
| Rain-on-glass (3.4) | **Drop** (license plus style) | Refraction and blur contradict the pixel look. |
| Stateless sprite particles (3.10) | **Keep**, with procedural pixel puffs | Zero CPU. |
| Sky dome (3.9) | **Adapt**: procedural noise, quantized and dithered, with an atmosphere gradient for altitude | – |

### 5.1 (i) Voxel planet game (later, rendered as pixel art)

**Weather.**
- **Take (Fact-backed):**
  - the camera-centred toroidal precipitation volume (`createCollisionRain.js:139-158`);
  - GPU respawn with `If` (`:165-181`);
  - budget knobs for count, resolution and frame skip;
  - the hide-list discipline (`collisionHideObjects.js`);
  - the update order "heightfield → compute → render" (collision-rain.md:226).
- **Adapt (Opinion):**
  - **Build the occlusion heightfield from voxel data** (the topmost solid voxel per column in a local grid around the player) and upload it as an `R16F` `DataTexture`, patched incrementally on chunk edits. This needs no extra scene render. Keep the ortho render variant only if non-voxel props must occlude rain.
  - **Curvature:** use a local frame with up = `normalize(p − planetCenter)`, an ortho camera and rain grid aligned to the tangent plane, and heights stored as radial altitude. Rule of thumb: at planet radius R, the surface drops by x²/2R over a horizontal distance x. That is about 0.6 m over 50 m at R = 2 km (relevant) and about 0.2 mm at R = 6,000 km (irrelevant).
  - **Determinism:** multiply velocity by a `deltaTime` uniform, seed hashes from `(seed, instanceIndex, frameIndex)` instead of `Math.random`/`time`, and make respawn heights relative to the floor or camera.
  - Snow uses the same buffers with lower fall speed plus lateral noise. Intensity comes from a seeded weather field sampled at the player's latitude/longitude and time. GPU hashes such as `fract(sin())` can differ across vendors, so **only cosmetic effects may be generated on the GPU**. Gameplay-relevant generation must use CPU integer hashing.
- Do not take the splash atlas, the drop graph (license) or the absolute Y respawn.

**Water.**
- Use a planar mirror for the sea or lake nearest the player. The plane is the tangent plane at the water surface, and the oblique clip is copied from `createGround.js:229-258`. Render at internal resolution with frame skip, and only when water is on screen and the player is below an altitude threshold. From a flying mount, switch to sky-colour plus specular only. Replace the plain emissive add with a Schlick Fresnel term (Opinion).
- Rain on water: clean-room pixel rings (5.0). Puddles: a seeded noise mask that lowers roughness and darkens albedo, in place of the JPG textures.

**Post (pixel art).**
- Emissive MRT for glowing blocks (5.0).
- Banded fog, plus altitude-aware aerial perspective so curvature reads from altitude. This is not in the repo; it needs its own research.
- **Biome look presets** as uniform or LUT sets blended by biome weights, using the same pattern as `LOOK_PRESETS` and `lerpPreset` (`cyberpunkLook.js:104-265`, `createCloudSky.js:64-88`).
- Drop SMAA, DoF, CA, grain and flare. Keep GTAO off.
- Keep **one** beauty traversal. Do not add a separate AO normal pre-pass (4.2 #1).
- Deep depth range: three's renderer has `reversedDepthBuffer` and `logarithmicDepthBuffer` options (three `src/renderers/common/Renderer.js:61-62, 96-97`). Whether they work with `getViewZNode()`/`getLinearDepthNode()` post fog is untested (Open question 7).

**Perf profiles.**
- Copy the `performanceProfile` object, `applyDevicePerformanceDefaults()` (run before the renderer), the `__app.perf.set()` A/B API and the inspector output views.
- Add our own keys: `viewDistanceChunks`, `meshWorkers`, `internalResTier`, `precipCount`, `heightfieldFrameSkip`, `mirrorFrameSkip`, `shadowUpdateAngleDeg`.
- Shadows on demand, re-rendered when the sun angle changes by more than a threshold or a nearby chunk is remeshed.
- Split compile: critical = terrain, water, sky; deferred = particles, mounts, effects.

### 5.2 (ii) 2D pixel-art Kairosoft sims (now)

- **Knowledge-base pattern**: see 5.3. This is the main take.
- **Perf and dev kit (Fact-backed pattern):** a central budget object, a device policy applied at boot, feature flags with a documented strip order, and a DEV-only `window.__app` with `perf.set(flag, value)`, FPS stats and debug output views. For an agent-run generator, this is how an agent can bisect performance and verify features through the Chrome DevTools MCP without reading the source.
- **Look presets as data:** day, dusk, night, season and weather palettes applied as uniform/LUT swaps with lerping (if the 2D renderer is three.js/WebGPU), or as palette swaps (if Canvas2D/Pixi).
- **Weather (adapted 3.1/3.10):** stateless, deterministic particles with a pixel-snapped 1-px streak. Use **tilemap data as the "collision texture"**: in top-down or isometric views, sample a roof/occluder mask per tile so splashes land only on open ground and roofs get their own splash height. This is the 2D analogue of the height RT and is simply a lookup.
- **Night lighting:** an emissive "lights" layer (the MRT emissive idea) to keep windows and lamps lit while darkening the base layer, plus an optional 1-px glow.
- **Wet look:** a palette shift plus a few animated ring sprites on ground tiles during rain (adapted 3.2).
- **Not relevant to 2D:** the planar mirror (except as fake water-tile reflections), GTAO, DoF, SMAA, CA, the cloud dome, BVH walking, video billboards and KTX2 handling.

### 5.3 (iii) Generator workflow: the AGENTS.md + docs/techniques pattern ★★

**Anatomy (Fact).**

| Artifact | Lines | Role | Loaded |
|---|---:|---|---|
| `README.md` | 355 | Human narrative and **source map** (Effect → file → entry function, `:310-339`), "why it stays fast" table, TSL patterns table, history | Index |
| `AGENTS.md` | 108 | **Read order "minimal context budget"** (`:9-15`); **hard constraints table with reasons** (`:17-28`); **file routing** task → file (`:30-43`); **technique recipes A–D**, numbered and linked to deep dives (`:45-83`); composition rule "do not break" (`:85-87`); **verification checklist** (`:89-97`); "what not to do" (`:99-104`); "**if docs and code disagree, the code wins**" (`:3`) | Agents first |
| `docs/techniques/*.md` | 11 + 241 + 145 + 115 | Deep dives with a **fixed skeleton**: Audience, Source of truth → Problem & approach (naive vs cost table) → mermaid system diagram → Parts (File / Class / Factory, behaviour, excerpts) → **Performance knobs table** (key/default/effect) → **Replication checklist** (written as an agent task list) → History (commit hashes) → Related docs | Agents on demand |
| `.cursor/rules/project-context.mdc` | 13 | `alwaysApply: true`: "read AGENTS.md before editing" | Every session |
| `.cursor/rules/tsl-webgpu-shaders.mdc` | 16 | `globs: src/tsl/**, src/post/**, …`: shader conventions **auto-attached by path** | When touching those paths |
| `STRIP.md` + `features.js` | 42 + 43 | Subtractive map: flag → folder, plus a strip order | Forks, bisecting |
| `performanceProfile.js` | 114 | A budget written as code. AGENTS.md tells agents to read it "before adding passes or instances" | Before costly changes |

**What makes it work (Opinion):**
- It routes rather than explains. Agents get to the right file in 1–2 hops.
- Constraints carry their *reason* ("do not reintroduce SSR … because"), which stops agents from "improving" things back.
- Recipes are numbered and checkable, and the deep dives end in task lists.
- Path-scoped rules load shader conventions only when they are needed.
- "Code wins" defuses stale docs.

**What went wrong (Fact) → our fixes (Opinion).** Drift observed within days:
1. Ripples are documented as 5×5/25 cells but the code uses 3×3/9 (README.md:223, wet-ground.md:47, 124 vs `rainRipples.js:20-23`).
2. `features.js:13-15` documents flags `advancedPost`, `groundReflection` and `core`, which do not exist in `FEATURES` (`:17-31`).
3. The `performanceProfile.js:59-61` comment says Safari disables SMAA, but the code enables it (`:78`).
4. The README lists distance fade as a performance lever, but it is visual only (README.md:126 vs `applyCarSurfaceRain.js:146-166`).
5. The Cursor rule says "do not duplicate drop/ripple logic", but `rainGlass.js` duplicates `surfaceRain.js`.
6. No provenance or license field: the Rainier-mood ripple is uncredited, and the CC BY-NC-SA ancestry of the drop graph appears only in prose.
7. No measured budgets.

**Proposal for Wallhammer Zero (Opinion).**
- **Root `AGENTS.md`** with the same sections (read order, hard constraints *with reasons*, file routing, recipes, composition rules, verification, don'ts, "code wins"). Add a `CLAUDE.md` that points to or imports it. To verify: the current Claude Code import syntax and how nested `CLAUDE.md` files are loaded, which could replace Cursor's path globs.
- **Per-subsystem scoped rules** (e.g. `src/weather/CLAUDE.md`, `src/post/CLAUDE.md`) mirroring `tsl-webgpu-shaders.mdc`.
- **`docs/techniques/<id>.md` keeps their skeleton plus 5 extra fields:**
  1. **Provenance & license** (origin URL, license, clean-room yes/no);
  2. **Determinism** (seed inputs, GPU vs CPU);
  3. **Pixel-art compatibility** (keep, adapt or drop, from 5.0);
  4. **Measured budget** (ms per reference device and internal resolution);
  5. **Verification recipe** (which debug output view or `__app` state digest proves it works, so agents verify without eyeballing screenshots).
- **Machine-checkable frontmatter**, e.g. `files: [...]`, `entry: createX`, `constants: { MAX_RADIUS: 1 }`, `flags: [...]`. A `docs:check` script (grep/AST) fails CI when a path, entry function, constant or flag no longer matches the code. That fixes drift items 1–3.
- **Write docs with the code, not at the end.** Make "update the technique doc and the source map" part of the generator's definition of done for every new technique. Retrofitting (1.3) is the root cause of the drift.
- **Generated games ship their own AGENTS.md, STRIP order, feature flags, perf profile and `__app` API.** Later agent sessions on a game then have routing and observability from the start.
- **A STRIP order plus `__app.perf` enables an automated perf-bisect loop.** An agent turns layers off in order and records FPS or GPU time until the budget is met.

---

## 6. Open questions

1. **WebGL2 fallback for this exact code.** Do collision compute (texture sampling inside compute), MRT blend modes and GTAO work on three's WebGL2 backend? Not tested here because nothing was executed. Fact: the WebGL backend implements `compute()` with transform feedback over `POINTS`, and rejects array or indirect counts with a warning (three `src/renderers/webgl-fallback/WebGLBackend.js:929-983`). Each thread writing its own `element(instanceIndex)` fits that model. Storage textures, atomics and shared memory do not.
2. **Real per-pass GPU costs.** The repo commits none. We need timestamp captures on reference devices: a desktop iGPU, an M-series Mac, a mid-range Android and an iPhone. Note that Safari throws on timestamp queries.
3. **Android WebView and iOS WKWebView WebGPU.** caniuse lists the Android Browser/WebView as **not supported** (as of 154). chromestatus shows WebView milestones for WGSL sub-features, which suggests WebView exposure exists or is planned. WebKit's Safari 26 post does not mention WKWebView. → Test on devices before choosing a mobile wrapper (Capacitor and similar).
4. **Electron on Linux.** Electron 44 ships Chromium 152, so it presumably inherits Chrome's Linux limits (Intel Gen12+ from 144, NVIDIA on Wayland from 147, others behind a flag). This is inferred, not verified.
5. **License of `rainRipples.js`.** It needs the original Rainier mood page's license statement (the Shadertoy default is CC BY-NC-SA 3.0). Decision for now: clean-room.
6. **The pixel-art pipeline in TSL.** Should we lower the renderer's pixel ratio and use CSS `image-rendering: pixelated`, or use `PassNode.setResolutionScale()` / `PixelationPassNode`? In the latter case, downstream `convertToTexture` RTTs may still run at full drawing-buffer size. Needs a prototype.
7. **Planet-scale depth.** Do `reversedDepthBuffer` or `logarithmicDepthBuffer` interact correctly with `getViewZNode()`/`getLinearDepthNode()`-based post fog and the oblique-clip mirror? Floating origin or camera-relative rendering for a planet: which three.js idioms hold up?
8. **What the 2D sims run on.** If they use three.js `WebGPURenderer` with an orthographic camera, the TSL patterns transfer directly. If they use Canvas2D or Pixi, only the concepts transfer.
9. **Is GPU weather worth it in 2D?** At Kairosoft scale, a few hundred CPU particles may be simpler and fully deterministic.

### 6.1 WebGPU/TSL readiness, October 2026 (Fact unless marked)

| Target | Status | Source |
|---|---|---|
| Chrome/Edge desktop (Windows, macOS, ChromeOS) | Shipped since 113 | gpuweb wiki; Chrome WebGPU overview; caniuse |
| Chrome Linux | Intel Gen12+ since 144; NVIDIA (driver ≥ 535.183.01) on Wayland since 147; others behind a flag | gpuweb wiki; caniuse note "depends on hardware and drivers" |
| Chromium on Windows ARM64 | Behind `--enable-unsafe-webgpu` | gpuweb wiki |
| Chrome Android | 121+ on Android 12+ with Qualcomm/ARM GPUs; Imagination on Android 16+ since 139; Samsung Xclipse "probably" around 154 | gpuweb wiki; Chrome overview |
| Firefox | Windows since 141 (July 2025); macOS Apple Silicon 145 (macOS 26+) and 147 (all macOS); Intel Mac, Linux and Android in Nightly, with Linux planned for 2026. caniuse marks Firefox "partial" up to v160 | gpuweb wiki; caniuse |
| Safari 26 (macOS, iOS, iPadOS, visionOS) | On by default. caniuse marks desktop Safari partial (macOS 26 Tahoe+ only) and iOS Safari 26+ as supported | WebKit WWDC25 post; gpuweb wiki; caniuse |
| Electron | Current stable 44.5.1 = Chromium 152 (2026-09-30). It *presumably* follows Chrome's platform matrix (inference) | releases.electronjs.org |
| Android WebView | caniuse "Android Browser" 154: **not supported**. Unclear, see Open question 3 | caniuse; chromestatus |
| iOS WKWebView | **Unverified** | WebKit post is silent |
| three.js | Latest release r186 (2026-09-24); the repo pins `^0.185.1`. The manual still calls `WebGPURenderer` "experimental", and says it **falls back to WebGL 2 automatically**, with TSL transpiled to WGSL or GLSL and `forceWebGL: true` available for testing | three.js manual `webgpurenderer`; GitHub releases |

**Fallback story (Opinion).**
- **2D sims:** target WebGL2 (or Canvas2D) as the baseline. WebGPU adds nothing essential at this scale.
- **Voxel pixel-art:** write everything in TSL on `WebGPURenderer`, and test `forceWebGL: true` in CI from the first day. Keep compute optional, with a CPU particle path at low counts, and keep post single-pass-friendly with few RTTs.
- **Platforms:** run a device policy à la `applyDevicePerformanceDefaults()` with Safari quirks (compile before the loop, no timestamp queries, DPR cap). Treat Android WebView and Linux as WebGL2 until device tests prove otherwise.

---

## Sources

Repo (all `path:line` citations refer to this commit):
- https://github.com/ektogamat/threejs-conference/tree/8cc20593b2270e2ce832e7b7b44356705daddec4 (README.md, AGENTS.md, STRIP.md, docs/techniques/*, .cursor/rules/*, src/**). The commit history was read via `git log`.
- Live demo: https://threejspunk.vercel.app/ (not visited; cited from README)

Upstream code and provenance:
- three.js example `webgpu_compute_particles_rain.html`: https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_particles_rain.html
- three.js source: `src/renderers/common/RenderPipeline.js`, `src/renderers/common/PostProcessing.js` (deprecated r183), `src/renderers/common/Renderer.js`, `src/nodes/display/PassNode.js`, `src/renderers/webgl-fallback/WebGLBackend.js`, `examples/jsm/tsl/display/{GTAONode,SMAANode,PixelationPassNode,RetroPassNode}.js`. All at https://github.com/mrdoob/three.js (dev branch, read 2026-10-02)
- three.js manual, WebGPURenderer: https://github.com/mrdoob/three.js/blob/dev/manual/pages/webgpurenderer.html
- three.js releases (r186, 2026-09-24): https://github.com/mrdoob/three.js/releases
- rocksdanister/rain `License.txt` (CC BY-NC-SA 3.0; credits BigWings' Heartfelt, CC BY-NC-SA 3.0): https://github.com/rocksdanister/rain
- Heartfelt (BigWings): https://www.shadertoy.com/view/ltffzl (cited in that License.txt)
- "Rainier mood" (Zavie): https://www.shadertoy.com/view/ldfyzl (page returned 403; attribution taken from a third-party port https://github.com/gjshiwoa/spring-shaders/blob/main/shaders/lib/surface/ripple.glsl). Shadertoy's default license (CC BY-NC-SA 3.0) is stated from prior knowledge and was **not re-fetched** (403).

Platform status:
- gpuweb Implementation Status wiki: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- caniuse WebGPU data (fetched 2026-10-02): https://github.com/Fyrd/caniuse/blob/main/features-json/webgpu.json and https://caniuse.com/webgpu
- Chrome for Developers, WebGPU overview: https://developer.chrome.com/docs/web-platform/webgpu/overview
- WebKit, "News from WWDC25 … Safari 26 beta": https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- Electron releases: https://releases.electronjs.org/
- chromestatus API (WebGPU entries): https://chromestatus.com/api/v0/features/6213121689518080 and https://chromestatus.com/api/v0/features?q=WebGPU%20WebView
