# Analysis: Sakura Crossing (a 3D → 2D anime look)

*Copied from the owner's Vellum note `projects/grafika-reference/analyzy/01-sakura-crossing.md`
(2026-09-24, status backlog), translated on 2026-10-14. Index: [README.md](README.md). The deep
analysis is [ref-sakura-crossing.md](../ref-sakura-crossing.md).*

- **Repo:** https://github.com/Kenton-GMI/sakura-crossing (MIT)
- **Stack:** Three.js + Vite (the only 2 dependencies), Node 18+
- **Area:** stylised rendering (toon/cel, ink lines), a procedural world

## What the README says (the starting point)

A walkable Japanese suburban neighbourhood in cherry-blossom season. A real 3D scene rendered to
look like the hand-painted background of a 2D animation. 100 % procedural: `src/` has not a
single image asset; signs and textures are drawn at runtime with Canvas2D.

**Techniques for the 3D → 2D look:**
- **Quantised light with a tinted shadow** (`src/core/toon.js`): `MeshToonMaterial` with a
  hand-made gradient ramp (2–4 bands); a patch of `lights_toon_pars_fragment` shifts the dark
  bands toward a cold violet. The hue shift in shadow is the difference between "anime cel" and
  "low-poly 3D". Blossoms have a high-key ramp and receive no shadow.
- **Screen-space ink** (`src/core/post.js`): lines from the *second difference* of linear depth.
  Zero on planes even at grazing angles; fires only on silhouettes and edges. Positive curvature
  strong, negative weak, a fade with distance.
- **Inverted-hull outlines** (`src/core/outline.js`): only on hero props, a constant pixel width
  in clip space.
- **An anime lighting setup** (`src/main.js`): a warm key, a strong cold bounce, a hemisphere
  light with a violet ground, hence coloured shadows. Grade: split-tone, lifted blacks. No bloom,
  DoF or motion blur. Rendered at 1.5–2× plus FXAA.

**Other:**
- The world is a sphere with R = 160 m; it is built on the flat XZ plane, and one projection
  layer (`src/world/planet.js`) bends it into a planet once.
- Generators instead of models: `makeShop` (`src/world/shops.js`), `makeVehicle`
  (`src/world/vehicles.js`, a car type is a table row).
- Terrain as a lattice of 3 m triangles (`src/world/hills.js`), the lake as a contour plus a
  flood-fill leak check (`lakeLeakCheck`).
- Performance: draw-call bound, so merge per material (`bake()` in `src/core/util.js`),
  instancing, frustum culling after the bake. About 1.74 M triangles / 19k meshes.
- Dev: `POST /__shot` renders frames from the console.

## Checked in the code (2026-09-24)

- 64 JS files in `src/`, about 56,000 lines. **No 3D model, texture or image.** The only binary
  files: 1 MP3 of music in `public/audio/` and 4 screenshots in `docs/` for the README.
- Confirmed: the graphics are pure code (geometry from generators, textures from Canvas2D).
