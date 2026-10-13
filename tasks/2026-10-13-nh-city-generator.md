# NEW HOPE: CITY GENERATOR (2026-10-13)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** none

## Origin
D28: a generated world, a city that covers the planet, many levels up and down, moving across
the buildings and in flying cars. D29: the levels are discrete layers of tile-sized cells. The
owner's Vellum analysis of No Man's Sky (`analyzy/04-no-mans-sky-procgen.md`, summarised in
`docs/references.md`) gives the method: a static seed, hierarchical seeds derived from position
(not a sequential stream), archetypes plus parameters, and tools to look at seeds fast, because
tuning traversability is the real work.

## Read first
- `games/new-hope/README.md` (the level bands), `games/new-hope/STORY.md`.
- `packages/det/README.md` (the deterministic RNG and integer maths; no floats, no clock).
- `assets/new-hope-lib/style.ts` (`CELL`: a cell is one tile by one storey).
- `docs/sim.md` and `packages/sim/README.md`: the generator's output becomes sim data later,
  so it follows the same determinism rules.
- The cell kinds below are shared with `nh-building-kit` and `nh-city-mockup`; keep the names.

## Scope
1. **A package `@whz/citygen`** (folder packages/citygen, with a `check` script so it joins
   the gate, and under the determinism lint in `tools/lint/determinism.js`). Pure, no I/O in
   `src/`, runs in Node and the browser.
2. **`generateDistrict(seed, params)`** returns a grid of `width × depth × levels` cells. A
   cell has a kind (`empty`, `solid`, `deck`, `street`, `walkway`, `stairs` + direction,
   `lift`, `pad`, `ruin`, `lane`), a building id and a facade style for `solid` (`union`,
   `habitat`, `market`, `derelict`, `ancient`). Default size about 32 × 32 tiles × 16 levels;
   the bands of the README (undercity, streets, middle, upper, roofs, sky lanes) as level
   ranges in the params.
3. **The layout**: a street grid at the street band, tower footprints between the streets
   (archetypes: slab, tower, stepped tower, megablock) with heights from the seed, walkable
   decks and terraces, walkways between towers on the middle and upper bands, stairs and lifts
   between levels, pads on some roofs, sky lanes as air corridors above the roofs and through
   gaps, ruins in the undercity under the streets. Seeds per building and per block are
   derived from position (hash), so a block regenerates alone.
4. **Traversability as an invariant**: every walkable cell is reachable on foot from every
   other one (decks, streets, walkways, stairs, lifts); every pad touches a lane; lanes form
   one connected network. A generated district that fails is a bug, not a retry.
5. **A CLI**, `./dev npm run city -- <command>` (a root script `city`, like `asset`):
   `slice <seed> --level <n>` prints one level as ASCII (one character per kind), `stats
   <seed>` prints counts per kind and band, the reachability check and the grid hash.
6. Tests: determinism (golden grid hashes for a few seeds), the invariants of 4 over many
   seeds, and the ASCII of one small district as a snapshot. A `README.md` for the package
   with the API, the cell kinds and the params.

## Out of scope
- Drawing the city (`nh-building-kit`, `nh-city-mockup`), traffic and people (sim notes),
  districts beyond one (streaming, the planet), interiors.

## Acceptance
- `./dev npm run city -- stats <seed>` passes the reachability check for 200 seeds in the
  tests; the same seed gives the same grid hash twice and on two runs.
- `slice` output of one seed was read level by level by the session, and the package README
  shows one slice of the street band and one of the middle band.
- The gate is green (the new package is in it through its own `check` script).
