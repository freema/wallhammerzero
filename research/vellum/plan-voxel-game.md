# Plan: a voxel game on one big planet (Three.js)

*Copied from the owner's Vellum note `projects/grafika-reference/plan-voxel-hra.md`
(2026-09-24, status backlog), translated on 2026-10-14. Index: [README.md](README.md).*

The target output of the graphics-references project. It is to be written after the analyses
of the reference repos.

## The brief (2026-09-24)

- A voxel game in Three.js.
- **Main model: Light No Fire** (Hello Games); the game will be very similar. One big procedural
  fantasy planet, not travel between planets as in NMS. See
  [04-no-mans-sky-procgen.md](04-no-mans-sky-procgen.md).
- On it: **different biomes**, **villages**, **fortresses**, mounts: **horses**, **flying
  mounts** and so on.
- **You can fly high enough to see the planet's curvature**, so the world is a real sphere, not
  a flat map.
- **Everything generated from a static seed as far as possible** (the NMS technique): the world,
  biomes, buildings, creatures, textures.
- **No external assets: no graphics from Blender, no models, no images. Everything is code,
  graphics included.** The model (the AI) writes the whole game including its visuals. Models
  to follow: Sakura Crossing and Voxel Musou (checked in their code: zero models and textures,
  geometry from generators, voxel characters from the builder `src/core/voxel.js`).
- **A very free story.**
- The plan is to be **very loose**: it gives the model almost complete freedom to make the game.
  No detailed game design up front, only these boundaries.

## Inputs

- [01-sakura-crossing.md](01-sakura-crossing.md): the main model for "graphics are code".
- [02-threejs-punk.md](02-threejs-punk.md): careful, the models, textures and videos in its
  `public/` are assets; take only the shader/TSL techniques.
- [03-voxel-musou.md](03-voxel-musou.md).
- [04-no-mans-sky-procgen.md](04-no-mans-sky-procgen.md): generation from a seed, the
  cube-sphere, Light No Fire.

## The plan

A TODO in Vellum, to be assembled from the analyses. What happened since: the analyses were
done as deep reports in this repo ([README.md](README.md) lists them), and the first real game
became New Hope (D28, D30), a city-planet in Three.js rather than this fantasy planet; the voxel
planet stays a later game.
