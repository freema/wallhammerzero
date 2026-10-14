# Analysis: No Man's Sky / Light No Fire, generation from a seed

*Copied from the owner's Vellum note `projects/grafika-reference/analyzy/04-no-mans-sky-procgen.md`
(2026-09-24, status backlog), translated on 2026-10-14. Index: [README.md](README.md). The deep
reports are [ref-nms-procgen.md](../ref-nms-procgen.md) and
[procgen-for-games.md](../procgen-for-games.md).*

Not a repo but a technique and a model for the whole game. Goal:
[plan-voxel-game.md](plan-voxel-game.md).

## How NMS does it (research of 2026-09-24)

**One seed → a cascade of seeds**
- The whole universe comes from a single number (64-bit; the founding seed was one developer's
  phone number). The engine is deterministic: the same seed always gives exactly the same
  result, thanks to a repeatable PRNG.
- The cascade: the galaxy seed → star positions → **a star's position is the seed** of its
  planetary system → **a planet's position is the seed** of its properties → and so on. Each
  level derives its children's seeds from its own identity or position.
- Nothing is stored: things come into being on the first visit and turn out the same for every
  player. Only changes are saved (what players built or destroyed).
- Almost everything is generated: systems, planets, weather, flora, fauna and its behaviour,
  buildings, ships. Only small things are hand-made (a few names, rewards).

**Terrain**
- A voxel density field → polygonisation (a mesh from voxels) → texturing → population (flora,
  fauna, structures) → simulation. That is the pipeline from the GDC 2017 talk.
- A planet's voxel regions are stored as an **octree on a cube projected onto a sphere**
  (cube-sphere); the voxels themselves as a flat array.
- The terrain's shape = layers of "uber noise" (an extension of noise with erosion effects, maths
  after Giliam de Carpentier) summed into the density field; voxels have material types (rock,
  sand, cave …) and the layers are relative to sea level.
- The terrain generator was only about 1,400 lines. Most of the work was tuning so that planets
  were interesting *and* traversable: early builds made stunning but impassable planets, and the
  fixes made them flat and boring.

**Creatures**
- Procedural deformation of **archetypes** (not generation from scratch); each gets a
  behavioural profile. For us: a voxel horse or dragon = an archetype + parameters from the seed.

## Light No Fire: the closest model for our brief

Hello Games' next game (in development since 2018, announced at TGA 2023, not yet released):
**one procedural fantasy planet the size of Earth**, flying mounts (dragons, giant birds), ground
mounts, wooden and stone buildings, settlements, ruins, oceans, biomes. Technologically it builds
on NMS. Exactly what we want, only ours in voxels and in the browser.

## Sources (to study)

- GDC 2017, Innes McKendrick: *Continuous World Generation in No Man's Sky*:
  https://www.youtube.com/watch?v=sCRzxEEcO2Y (the whole pipeline: voxels → polygonisation →
  texturing → population)
- GDC 2017, Sean Murray: *Building Worlds in No Man's Sky Using Math(s)*:
  https://www.youtube.com/watch?v=C9RyEiEzMiU (terrain from maths, uber noise)
- nucl.ai 2015, McKendrick: *Building a Galaxy*; a summary:
  https://procedural-generation.isaackarth.com/2016/06/22/building-a-galaxy-procedural-generation-in-no.html
  (an octree on a cube-sphere, modular generators)
- github.com/gistya/NoMansTerrain: NMS's terrain files taken apart (noise layers, voxel types,
  parameters)
- Wikipedia: https://en.wikipedia.org/wiki/Development_of_No_Man's_Sky

## Consequences for our game

1. **A static planet seed + hierarchical derivation:** `seed(planet) → seed(region) →
   seed(biome/village/fortress/creature)` from position. A position hash instead of a sequential
   PRNG, so things can be generated in any order.
2. **Store only deltas:** the world = f(seed, position) + the player's changes.
3. **A cube-sphere with an octree or chunks:** confirms the direction of
   [plan-voxel-game.md](plan-voxel-game.md) (the planet's curvature visible from altitude).
4. **Archetypes + parameters** for creatures, buildings and villages, not generation from
   scratch.
5. **Tuning traversability is the main work**, not the generator itself: plan tools for browsing
   seeds quickly (like Sakura's `__shot`).
