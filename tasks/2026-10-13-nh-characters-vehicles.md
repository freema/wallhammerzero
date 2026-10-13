# NEW HOPE: CHARACTERS AND FLYING CARS (2026-10-13)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** none

## Origin
D28: the player moves across the buildings and in flying cars; the story is Kylo's
(`games/new-hope/STORY.md`). D29: everything is a voxel model baked to 2:1 iso. Spike-c showed
that a 16 × 24 voxel chibi reads as a person by its colour blocks but loses its face, so at this
scale characters are read by silhouette and colour, and faces go to portraits later.

## Read first
- `games/new-hope/README.md`, `games/new-hope/STORY.md`.
- `assets/new-hope-lib/style.ts` (palette, `CELL`: a storey is 12 voxels, a tile 4 × 4) and
  `assets/palettes/new-hope.json` (the `union`, `cloth`, `red`, `paint` ramps; flat neon).
- `packages/voxel-kit/README.md` (parts, pivots, poses; offsets over rotations; the walk's
  `baselineDrift` lint) and `assets/examples/voxel-chibi/gen.ts`,
  `assets/spike-lib/voxel-chibi.ts` (the rig that exists, and why its face fails).
- `docs/looking-at-images.md`.

## Scope
1. **A character rig** in `assets/new-hope-lib/people.ts`: 4 × 8 × 4 voxels (fits under a
   storey with headroom), parts with pivots, clips `idle` (2 frames), `walk` (4 frames), `run`
   (4 frames, a longer stride), in the four `ISO_FACINGS`. The look from params and the seed.
2. **Characters** in `assets/new-hope/`: `kylo` (the player: reads at a glance against the
   crowd, a Tox-like silhouette with one signature colour), `union-guard` (Union blue armour,
   helmet), `colonist` (varied by seed: cloth, hair, skin, a bag), `scavenger` (rust and
   cloth, a mask).
3. **A flying car rig** in `assets/new-hope-lib/vehicles.ts` and `assets/new-hope/taxi`: a
   hover car about 1 × 2 tiles of footprint and under one storey tall, `paint` ramp body with
   neon underglow from the flat slots, clips `idle` (a hover bob of one voxel, 4 frames) and
   `fly` (lights blinking), four facings. A second body `assets/new-hope/union-cruiser` (Union
   blue, light bar) from the same rig.
4. Every asset passes its lint; a `NOTES.md` per asset (reads at 4×, passes, time). Do not
   write `assets/new-hope/README.md` (the kit note owns it); report what the pack README
   should say in the notes.

## Out of scope
- Portraits and dialogue faces, body-passing FX (the STORY proposal), weapons, ground cars.
- Movement and physics (the sim notes), the composed scene (`nh-city-mockup`).

## Acceptance
- `./dev npm run asset -- lint <id>` passes for every asset; `bake --all` twice gives the same
  hashes.
- The review sheets were read at 4× or more: Kylo is told apart from the colonists by
  silhouette and colour at 1×; the car's facing reads in all four facings; the walk's
  baseline drift is within the lint.
- The gate is green.
