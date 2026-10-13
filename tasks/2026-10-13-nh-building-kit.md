# NEW HOPE: VOXEL BUILDING KIT (2026-10-13)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** none

## Origin
D28 (New Hope: a city that covers the planet, many levels up and down) and D29 (fixed 2:1 iso,
voxel models baked to pixel art). The city generator (`nh-city-generator`) lays out cells; this
kit is what a cell looks like. Spike-c showed that voxel props cost minutes each and gain
facings and states for free, so the whole city is built from voxel modules.

## Read first
- `games/new-hope/README.md` (the concept, the level bands) and `games/new-hope/STORY.md`.
- `assets/new-hope-lib/style.ts` (the palette, `CELL` = 4 × 12 × 4 voxels, the flat light
  slots, the outline slots) and `assets/palettes/new-hope.json`.
- `packages/voxel-kit/README.md` (the builder, the bake, the limits: lines falling toward the
  near edge must be two voxels thick) and `packages/asset-kit/README.md` (the asset contract).
- `assets/spike-c/README.md` and `assets/spike-lib/voxel-props.ts`, `voxel-tiles.ts`,
  `voxel-scene.ts`: how the spike built props, tiles and a composed scene.
- `docs/looking-at-images.md`: lint first, then the review sheets at 4× or more.
- The cell kinds below are shared with `nh-city-generator` and `nh-city-mockup`; keep the names.

## Scope
1. **Modules as builder functions** in `assets/new-hope-lib/kit.ts`: a module sculpts one cell
   into a `VoxelBuilder` at a given voxel origin, from the cell kind, a style, a seed and which
   of its four sides are exposed (so a module can be baked alone *and* composed into one big
   grid by the mockup, with no seams between cells). Export the module list and the function
   signature; document both at the top of the file.
2. **The cell kinds** the kit draws: `solid` (a building's volume: facade on exposed sides,
   nothing inside), `deck` (a walkable floor slab), `street` (walkable ground: asphalt,
   kerb, markings), `walkway` (a bridge between towers: slab, railings, open sides), `stairs`
   (climbs one storey toward one side), `lift` (a shaft cell with doors on one side), `pad` (a
   landing pad on a roof, with lights), `ruin` (the undercity: Ancestor stone, Psion crystal,
   rubble). `empty` and `lane` (sky-lane air) draw nothing.
3. **Facade styles** of `solid`, chosen per building: `union` (clean concrete and glass, cold
   window light, Union blue trim), `habitat` (dense flats, warm windows, AC units, laundry),
   `market` (shopfronts at deck level, neon signs), `derelict` (dark, broken windows, rust),
   `ancient` (the Ancestors' smooth stone with Psion crystal veins). Windows lit or dark by
   the seed; neon signs from the flat slots.
4. **One asset per module** in `assets/new-hope/` (e.g. `kit-solid-union`, `kit-walkway`):
   baked alone in the four `ISO_FACINGS` with all sides exposed, three `variantSeeds`, and
   params for what the module varies (style, exposed sides, lit). States as clips where a
   module has them (neon flicker 2–4 frames, a lift door open/closed).
5. **A kit sheet asset** `assets/new-hope/kit-sheet/`: a small tower composed from the
   modules (street at the bottom, a few storeys of two styles, a walkway out, stairs, a lift,
   a pad on the roof) baked as one grid, to judge that modules stack without seams.
6. Every asset passes its lint; a `NOTES.md` per asset (reads at 4×, passes, time); a section
   "Building kit" in `assets/new-hope/README.md` (what each module is, what reads and what
   does not, what the generator must know).

## Out of scope
- The city layout (`nh-city-generator`), characters and vehicles (`nh-characters-vehicles`),
  a composed district (`nh-city-mockup`), runtime drawing (`runtime-iso-levels`).
- Interiors: a `solid` cell is a closed volume for now.

## Acceptance
- `./dev npm run asset -- lint <id>` passes for every asset of the kit, and `bake --all`
  twice gives the same hashes.
- The review sheets of every module were read at 4× or more; the kit sheet shows two styles
  stacked with no seam or outline between cells of one building.
- `kit.ts` builds each module into a larger grid at an offset (a test or the kit sheet shows
  it), and lists the cell kinds above with the same names.
- The gate is green.
