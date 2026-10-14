# The owner's Vellum analyses (graphics references)

English copies of the owner's notes in Vellum, folder `projects/grafika-reference/` (written in
Czech on 2026-09-24, copied and translated on 2026-10-14). Vellum stays the original and is
not written to from this repo; these copies only make the notes readable in the repo next to
the research they started. The notes were outlines (status "backlog"): their empty TODO
sections are left out here, and each note links the deep report that filled them in.

| # | Note | Topic | Deep report in this repo |
|---|---|---|---|
| — | [plan-voxel-game.md](plan-voxel-game.md) | The brief: a voxel game on one big planet in Three.js, in the spirit of Light No Fire | [voxels.md](../voxels.md) |
| 01 | [01-sakura-crossing.md](01-sakura-crossing.md) | Kenton-GMI/sakura-crossing: toon/cel shading, screen-space ink, a procedural world, zero assets | [ref-sakura-crossing.md](../ref-sakura-crossing.md) |
| 02 | [02-threejs-punk.md](02-threejs-punk.md) | ektogamat/threejs-conference (Threejs-Punk): WebGPU/TSL, GPU compute rain, wet surfaces, the post pipeline | [ref-threejs-punk.md](../ref-threejs-punk.md) |
| 03 | [03-voxel-musou.md](03-voxel-musou.md) | mike007jd/voxel-musou: voxels, instanced crowds, VFX, game feel, pixel post | [ref-voxel-musou.md](../ref-voxel-musou.md) |
| 04 | [04-no-mans-sky-procgen.md](04-no-mans-sky-procgen.md) | No Man's Sky / Light No Fire: generation from a seed, a cube-sphere voxel planet, creature archetypes | [ref-nms-procgen.md](../ref-nms-procgen.md), [procgen-for-games.md](../procgen-for-games.md) |

All four, distilled for Three.js games: [threejs-lessons-from-refs.md](../threejs-lessons-from-refs.md).

## The goal (from the Vellum index)

The analyses are not an end in themselves: their output is a **plan for making a game**
([plan-voxel-game.md](plan-voxel-game.md)).

- A **voxel** game in **Three.js**.
- Rather than No Man's Sky: **one big planet** with different biomes, villages, fortresses and
  mounts (horses, flying mounts); the planet's curvature is visible from altitude.
- **Everything generated from a static seed** (the NMS technique).
- **Graphics are code:** no Blender models, no images, no other assets; the model (the AI)
  writes all of it.
- **A free story.**
- The plan will be **very loose**: the model gets almost complete freedom to design and build
  the game; the plan only gives these boundaries and a stock of techniques from the references,
  not a detailed design.

The "what to take and where" part of each analysis therefore aims mainly at this game, and only
techniques that can be done purely in code are taken.

## The analysis outline (the same for every repo)

1. **Architecture:** how the code is composed, the lifecycle, the dependencies.
2. **Rendering pipeline:** the order of passes, the render targets, the materials.
3. **Key techniques in depth:** for each, the file, how it works, its cost, its limits.
4. **Performance:** where the bottleneck is, which levers it uses.
5. **What to take and where:** a concrete technique → what the voxel game gets from it.
6. **Open questions.**

A cross-repo comparison (common patterns in post pipelines, stylisation, performance budgets,
procedural vs asset content) was a TODO in Vellum; [threejs-lessons-from-refs.md](../threejs-lessons-from-refs.md)
now covers it.
