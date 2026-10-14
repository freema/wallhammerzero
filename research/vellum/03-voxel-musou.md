# Analysis: Voxel Musou (voxel crowds and combat feel)

*Copied from the owner's Vellum note `projects/grafika-reference/analyzy/03-voxel-musou.md`
(2026-09-24, status backlog), translated on 2026-10-14. Index: [README.md](README.md). The deep
analysis is [ref-voxel-musou.md](../ref-voxel-musou.md).*

- **Repo:** https://github.com/mike007jd/voxel-musou (code MIT)
- **Demo:** https://voxel-musou.vercel.app
- **Stack:** Three.js r186 vendored in `vendor/three/`, plain ES modules without a build step,
  WebGL2
- **Area:** voxel graphics, instanced crowds, VFX and game feel, stylised post

## What the README says (the starting point)

A Dynasty Warriors-style fan game: Zhao Yun against hundreds of Wei soldiers. A deterministic
simulation with a fixed 60 Hz tick. The README does not describe the techniques; the
implementation has to be read in the code.

- **Crowds through `InstancedMesh`:** about 300 soldiers (`?enemies=N`, 0–2000); when hit, they
  burst into voxel debris.
- **Game feel:** hit stop, impact VFX, combos N1–N6 / C1–C6, a Musou attack with a dragon, a
  cut-in and a colour grade of the screen.
- **Custom post-processing:** atmospheric haze, DoF, bloom, a retro pixel look. A golden-hour
  castle scene with fires and banners.
- **Procedural sound through WebAudio**, a calligraphic HUD.
- The structure of `src/`: core, hero, combat, crowd, musou, camera, vfx, post, world, audio, ui.

## Checked in the code (2026-09-24)

- 32 JS files in `src/`, about 9,300 lines. **No model or texture.** The only binary files: the
  font `src/ui/brush.woff2` and screenshots in `media/`.
- **How models are made:** `src/core/voxel.js` (146 lines) is a shared builder: vertex-coloured
  geometry with flat normals that merges a list of coloured boxes
  `{s:[w,h,d], p:[x,y,z], c:0xRRGGBB, r?, skip?}` into one geometry. The hero, the crowd, the
  world and the VFX all use it.
- `src/hero/model.js` (342 lines): Zhao Yun is described entirely in voxel units, rasterised into
  a grid and meshed. The rig and the animations are code too (`src/hero/rig.js`, `anims/`,
  `secondary.js`).
- The world (`src/world/terrain.js`, `castle.js`, `dressing.js`, `sky.js`) and the post
  (`src/post/post.js`) are code.
- **A pattern our game can use directly:** a voxel character, horse or dragon = code → grid →
  mesh; animation = a procedural rig.
