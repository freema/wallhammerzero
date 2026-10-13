# New Hope

The first real game (D28): a cyberpunk, GTA-like voxel game on a generated city-planet, seen
through a fixed 2:1 isometric camera over voxel models baked to pixel art (D29). The story and
what the game takes from the owner's canon: [STORY.md](STORY.md). This README is the working
concept: what is agreed is marked with its decision, the rest is the session's proposal and
the owner corrects it in chat or by verdicts in the studio.

## What it is

- **A city that covers the planet** (D28): towers everywhere, generated from a seed. Nothing
  is laid out by hand; a district is the generator's output plus what the player changed.
- **Moving across the buildings and in flying cars, many levels up and down** (D28). On foot
  the player walks streets and walkways, takes ramps, stairs and lifts between levels and
  crosses between towers on bridges. In a flying car the player flies the sky lanes and lands
  on roofs and pads.
- **Fixed iso, levels as layers** (D29). Every level of the city is a layer of tile-sized
  voxel modules; the layers above the player are cut away so the player always shows.

## The levels (proposal)

From the bottom up; a level is one storey layer of the cell grid.

| Band | What is there |
|---|---|
| Undercity | Ancestor and Psion ruins (the `ancient` and `psion` ramps of the palette), relics, no light but their own. |
| Streets | The old ground: dark, wet asphalt, abandoned shopfronts, the first Union outposts. |
| Middle levels | Walkways between towers, half-settled floors, scavenger crews, markets. |
| Upper levels | The colonised city: neon, Union offices, the med bay where Kylo wakes. |
| Roofs and pads | Landing pads, gardens, antennas. |
| Sky lanes | Flying traffic between towers, above the roofs and through the gaps. |

## Scale and look (session defaults)

- Native resolution **480 × 270** (16:9, ×4 to 1920 × 1080), palette
  `assets/palettes/new-hope.json`: night city, cold concrete and glass, flat neon and window
  light that the baker draws unshaded.
- The voxel grid of `packages/voxel-kit`: one voxel is 4 px across, a tile is 4 × 4 voxels
  (a 16 × 8 diamond). A storey is a fixed number of voxels tall, the same for every module, so
  modules stack. The exact height is set by the building-kit note.
- Characters are small at this scale (the voxel chibi of spike-c reads as a person by its
  colours, not by its face): portraits and dialogue carry the faces.

## The first slice

The aim is to see, in the studio, a generated block of the city and to play one short mission
in it. In order:

1. The building kit, the characters and the flying car as voxel assets in the studio.
2. The city generator: a district from a seed, every walkable cell reachable.
3. A city mockup asset that composes the generator's output from the kit's modules, with the
   cut-away levels, to judge the look before the engine can play it.
4. The engine notes the game needs (player loop, input, text and UI) and an iso multi-level
   scene in the runtime.
5. The mission: Kylo wakes in the med bay, goes down by lift and walkway, takes a flying taxi
   across the sky lanes to another tower.

The queue rows are in [tasks/README.md](../../tasks/README.md).
