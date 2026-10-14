# Analysis: Threejs-Punk (WebGPU/TSL rain and post)

*Copied from the owner's Vellum note `projects/grafika-reference/analyzy/02-threejs-punk.md`
(2026-09-24, status backlog), translated on 2026-10-14. Index: [README.md](README.md). The deep
analysis is [ref-threejs-punk.md](../ref-threejs-punk.md). Licence flag: its rain shaders are
CC BY-NC-SA, do not copy ([research/README.md](../README.md#licence-flags)).*

- **Repo:** https://github.com/ektogamat/threejs-conference (code MIT, the assets in `public/`
  are not)
- **Demo:** https://threejspunk.vercel.app/
- **Authors:** Anderson Mancini + Sunag (the author of TSL), the TSL 2026 workshop (threejs.paris)
- **Stack:** Three.js ^0.185 WebGPU + TSL, Vite 6, `three-mesh-bvh`, GSAP
- **Area:** WebGPU/TSL shaders, GPU compute particles, post-processing, performance budgets

## What the README says (the starting point)

A cyberpunk alley in the rain. The README is written as a knowledge base; the repo has
`AGENTS.md` plus `docs/techniques/` (collision rain, wet ground, car droplets) with recipes for
coding agents.

**Key techniques:**
- **Collision rain:** an orthographic camera from above renders world position into a 512²
  half-float render target (nearest, no mipmaps); a GPU compute pass simulates the drops and
  samples the height as the floor. A hide list for particles and the sky.
  (`src/world/weather/createCollisionHeight.js`, `createCollisionRain.js`,
  `collisionHideObjects.js`)
- **Wet surfaces:** the car gets procedural drops in TSL on UV1 (`src/tsl/surfaceRain.js`,
  adapted from rocksdanister/rain); the ground gets 5×5 looping ripples (`src/tsl/rainRipples.js`)
  plus a hand-made planar reflection in a half-res render target
  (`src/world/ground/createGround.js`). SSR was dropped for stability.
- **The post pipeline** (`src/post/postprocessing.js`): GTAO, MRT with emissive for bloom, a lens
  flare, DoF with a separable blur, a cyberpunk grade, SMAA. 6 look presets in
  `src/post/look/cyberpunkLook.js`.
- **Performance levers** (`src/platform/performanceProfile.js`): half-res passes, render layers,
  frame skipping for render targets, split shader compilation (`src/runtime/warmup.js`), adaptive
  DPR, a device policy.
- **TSL patterns:** `Fn()` subgraphs, material node slots, `.compute()` plus `If` on the GPU,
  `RenderPipeline` as one graph.
- Architecture: no engine or ECS, factory composition in `src/main.js`, feature flags
  (`src/world/features.js`), `STRIP.md`.

## Checked in the code (2026-09-24)

- 73 JS files in `src/`, about 11,700 lines. **Unlike the other two repos it is NOT pure code:**
  42 binary assets in `public/`:
  - 5 GLB models (`cyberpunk_compressed.glb` = the whole city, `quadra.glb` the car,
    `billboards.glb`, `plane.glb`, `colider.glb`), loaded with GLTFLoader
    (`src/world/city/loadCity.js`, `src/world/car/loadCar.js` …)
  - 2 HDRIs (`public/hdri/`), textures (`rainDrop.png`, `smoke.png`, `water-splash.webp`,
    `wet-puddles-normal.jpg`, noise textures), 6 MP4 videos for the billboards, MP3 sounds, fonts.
- **For our game:** take only the shader/TSL/post techniques (collision rain, ripples, the post
  pipeline, the performance levers). The noise textures, the splash atlas and so on can be
  generated in code.
