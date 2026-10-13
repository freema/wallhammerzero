# NEW HOPE: CITY MOCKUP IN THE STUDIO (2026-10-13)

**GATE:** none · **Priority:** P1 · **Size:** S · **Depends on:** nh-building-kit, nh-characters-vehicles, nh-city-generator

## Origin
D28 and D29. Before the engine can play New Hope, the owner judges the look in the studio: a
block of the generated city, built from the kit, with characters and a flying car, at native
resolution, with the levels above a chosen level cut away. This is the voxel counterpart of
the spike's room mockup (`assets/spike-c/scene`).

## Read first
- `games/new-hope/README.md`; the READMEs and notes the three dependencies leave
  (`assets/new-hope/README.md`, the citygen package README).
- `assets/spike-lib/voxel-scene.ts` (draw order and the lessons of the spike scene).
- `docs/looking-at-images.md`.

## Scope
1. An asset `assets/new-hope/city-mockup` (kind `scene`, 480 × 270): a window of a generated
   district composed into one voxel grid with the kit's module functions, baked once, with
   Kylo, a few colonists and a guard on walkable cells and a taxi in a lane.
2. Params: the district seed, the window position, and **cut level**: the levels above it are
   left out, so the player's level shows (the cut-away of D29). Presets for the street band,
   a middle band and the roofs.
3. A `NOTES.md` with the reads and what the runtime must solve (depth between baked city and
   moving sprites, the cut-away, the cost of baking a district).

## Out of scope
- Anything interactive; the runtime (`runtime-iso-levels`).

## Acceptance
- The lint passes; the review sheets were read at 2× and 4×; the three presets show the
  street, middle and roof bands with the levels above cut away.
- The studio shows it at `/asset/new-hope/city-mockup` with its presets.
- The gate is green.
