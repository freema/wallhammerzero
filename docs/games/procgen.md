# Building games on procedural generation

How a Claude Code session builds a game whose content comes from a seed: the rules, the
patterns, the budgets and the checklists. The depth is in
[research/procgen-for-games.md](../../research/procgen-for-games.md) (verified 2026-10-14) and
[research/ref-nms-procgen.md](../../research/ref-nms-procgen.md); this page only says what we do.

The rules in "Seeds and determinism" and "The generator chain" are what the code already does
(`@whz/det`, `@whz/citygen`, `tools/lint/determinism.js`). Everything under "Toolkit" is a
**proposal**: nothing there is decided until the owner agrees in chat
([docs/DECISIONS.md](../DECISIONS.md) is never edited by a session).

## The one sentence

**Generate the arrangement, author the pieces, check the result by code.** Every shipped
procedural game in the research does this (Spelunky's path of authored rooms, Diablo's set
pieces, Bad North's 300 modules under WFC, Minecraft's jigsaw villages). Pure noise and pure WFC
are never the whole game.

## Two tiers

| Tier | What lives there | Rules |
|---|---|---|
| **Deterministic** | Layouts, placement, missions, schedules, loot, names: anything saved, digested, replayed or compared across machines | Integers only, under the determinism lint, randomness from `@whz/det`. Golden hashes. |
| **Look** | Shader noise, skyline detail, particles, rain, procedural textures | Floats and any library are fine. Never read back into gameplay. |

A value that crosses from the look tier into gameplay is a bug (New Hope's skyline collision
once used `Math.pow` noise: [research/threejs-lessons-from-refs.md](../../research/threejs-lessons-from-refs.md)).
A generator package joins the deterministic tier by adding its source glob to `DETERMINISTIC`
in the root `eslint.config.js`; citygen is the model.

## Seeds and determinism

What the lint enforces ([tools/lint/determinism.js](../../tools/lint/determinism.js)): no
`Math.random`, no clock, no I/O, no float `Math` (only `abs ceil clz32 floor imul max min sign
trunc`; `**` is banned too). `@whz/det` gives the replacements
([packages/det/README.md](../../packages/det/README.md)): `createRng(seed, stream)` (sfc32, one
stream per concern, `fork(name)`), `hash32(x, y, seed)`, `fnv1a32` / `fnv1a64Hex`, integer
trig and easing, and the division helpers.

Rules for every generator:

1. **Randomness that crosses a unit boundary is a hash of position, never the next number of a
   shared stream.** A unit is a chunk, district, block, lot, building, floor, room, NPC. Its seed
   is `hash32(x, y, parentSeed)` (citygen: block seed from the block's corner, lot seed from the
   lot's corner). A sequential stream is fine *inside* one unit. The payoff: a unit regenerates
   alone, in any order, and switching a later feature off leaves every earlier one as it was
   (citygen tests this).
2. **One stream per concern inside a unit**: `rng.fork("facade")`, `rng.fork("props")`. Adding
   a draw to one stream never moves another.
3. **Deeper keys chain the hash.** `hash32` takes two coordinates; for `(district, building,
   floor, room)` chain it, `hash32(room, floor, hash32(building, district, seed))`, in one
   named helper per generator. A vector-tested `seedOf(seed, tag, ...coords)` is part of the
   toolkit proposal below.
4. **Retries are seeded too.** Attempt `k` of a generate-and-test loop uses
   `hash32(k, TAG_ATTEMPT, seed)`, never a fresh draw from the stream that produced the failed
   attempt. Report the attempt count in the metrics.
5. **Every generator has an id and a version, and the version is in its hash format string**
   (citygen: `whz-citygen-grid/1`). Bump it whenever any output for any seed changes; the
   golden test makes the bump forced, not remembered.
6. **Saves pin `{ id, version, seed, params }` plus deltas**, never the generated world (format
   in [research/threejs-gameplay.md](../../research/threejs-gameplay.md) §6.3). When a shipped
   generator changes, freeze the old one (keep it callable under its old version) rather than
   migrating saves: old saves keep their world, new saves get the new one.
7. **Golden hashes over a fixed probe set of seeds**, run in Node by the gate. Cross-browser
   runs are unnecessary for integer code; that is the point of the tier.

```ts
// A unit's seed comes from where it is, not from when it was generated.
const blockSeed = hash32(x0, y0, districtSeed);
const rng = createRng(blockSeed, "block");       // sequential draws inside the block
const facades = rng.fork("facade");              // one stream per concern
const variant = hash32(tx, ty, blockSeed) % 4;   // per-cell: a hash, no stream at all
```

Real-time 3D motion (New Hope) is not under the lint and need not be; what it needs is
"same build + same browser + same seed + same input log ⇒ same run"
([research/new-hope-audit.md](../../research/new-hope-audit.md) §8): a fixed step and no
`Math.random` in the sim.

## The generator chain

A generator is a chain of **stages**, each a pure function `(input, seed, params) → artefact`
that reads only earlier artefacts. citygen's nine stages (streets → lots → buildings → lifts →
stairs → pads → lanes → walkways → undercity) are the model; NMS and Minecraft have the same
shape. A plain array of stages is enough; no DAG framework until two games share more than
three stages.

**Every artefact can be dumped and hashed.** `ascii()` for grids and plans (agents read text
better than pictures), `toJson()` for lists, `hash()` over the canonical bytes. Snapshot every
intermediate when debugging a seed; that is the whole debugging tool.

**Every generator exports the same surface** (citygen has all of it; the names are the
toolkit's proposal):

| Export | Purpose |
|---|---|
| `GEN = { id, version }` | Identity for saves, hashes and the seed browser. |
| `generate(seed, params) → artefact` | The pure function. `params` merged over defaults, validated, with a `ParamsError`. |
| `check(artefact) → { ok, problems }` | The invariants. `ok` is `true` for every seed, or the generator has a bug. |
| `metrics(artefact) → Record<string, number>` | Counts, shares, path lengths, attempts used. Integers. |
| `ascii(artefact)` and/or `draw(artefact, buffer)` | Text for agents; a palette-indexed raster for contact sheets. |

**Tests per generator** (citygen's set):

- invariants over ≥ 200 seeds at the default size, plus other sizes and the densest params;
- golden hashes for 4–5 seeds, and identical output on two runs;
- the checker catching artefacts broken on purpose;
- metric snapshots with tolerances (median and p5/p95 over 200 seeds), so a change that moves
  the distribution is seen;
- a perf line (time per `generate`) printed, not gated: timing is not deterministic.

**The CLI is the agent's interface.** citygen's `./dev npm run city -- slice | stats | sweep`
is the pattern: dump one seed as text, print its metrics and hash, sweep a run of seeds and
exit 1 on the first invariant failure. A generator without a CLI cannot be checked by a session
without a browser.

## Which technique for which content

The long table with parameters, pitfalls and licences is
[research/procgen-for-games.md](../../research/procgen-for-games.md) §2; this is the chooser.

| Content | Use | Not |
|---|---|---|
| Height, moisture, density fields | Gradient noise + fBm (octaves 1, 2, 4 with amplitudes 1, ½, ¼, normalised; separate seed per field), ridged for mountains, domain warp for organic shapes | Noise as the whole level ("noise soup") |
| Caves, lakes, erosion-like smoothing | Cellular automaton: 45 % floor, "≥ 5 walls of 8 → wall", 5 iterations; then flood-fill and keep or connect the pockets | CA without a connectivity pass |
| Buildings, dungeons, interiors | BSP or guillotine cuts (citygen's lots), rooms 4–9 tiles, halls 1–3 wide; accretion for organic dungeons (attach authored room shapes to walls, then add loops) | Boxy BSP without loops |
| Side-scrolling levels | Spelunky: a 4×4 path with room types by position, 10×8 ASCII templates with probabilistic tiles, obstacle stamps | Free noise terrain for a platformer |
| Placing trees, props, POIs, sites | Jittered grid, or Poisson disc on an integer grid (Bridson, k = 30) | Independent uniform rolls (clumps and gaps) |
| Regions, districts, irregular grids | Hashed offset grid (nearest jittered point) for gameplay; Voronoi/Delaunay for looks or offline tools | Float Voronoi in the deterministic tier |
| Roads, rivers, plants | L-system with global goals and local snapping (Parish & Müller); citygen's hashed street lines for grids | Plain L-systems for road networks (trees, no loops) |
| Building masses and facades | Split grammar (CGA): mass → floors → bays → windows, rules as data | Hand-placed meshes per building |
| Local texture: rooftop clutter, ruin decay, market stalls, decoration | WFC inside a block or region, with fixed entrance tiles, a biome's tile subset, and "modify in blocks" for large outputs | WFC for the street network or any global structure |
| Missions, lock-and-key, quests | Graph grammar (Dormans): mission graph first, then space; keep key→lock edges through rewrites; Unexplored's cycle types as pacing templates | Random room order with keys sprinkled in |
| History, lore | Generate events first, rationalise after (Caves of Qud); a fixed spine with generated periods around it | Simulating centuries and hoping for a story |
| Citizens and schedules | Precomputed day plans (4–10 legs), position at time `t` in closed form; full actors only near the player | Live pathfinding for every citizen |
| Names, barks, item and quest text | A Tracery-style text grammar (`#symbol#`, modifiers, saved variables), ASCII only; syllable tables for names | String concatenation of adjectives |
| Loot and rewards | Weighted tables drawn as a shuffled deck (no repeats until empty); item = base × affix × rarity, named by grammar | Independent rolls (streaks feel unfair) |
| Puzzles with crisp rules | Reverse play from a solved state, then a BFS solver for uniqueness and minimum moves; difficulty from solver statistics | Random boards filtered by "looks hard" |
| Characters, creatures | Part library with Min/Max proportion ranges (the NMS pattern; voxel-kit) | Free-form body generation |

Noise and terrain in depth: [research/ref-nms-procgen.md](../../research/ref-nms-procgen.md).
Facade grammars, WFC in three.js and terrain meshing:
[research/threejs-procgen-look.md](../../research/threejs-procgen-look.md) §6–8. Voxel
characters: [research/ref-voxel-musou.md](../../research/ref-voxel-musou.md).

**Libraries.** In the look tier use them freely (simplex-noise, fastnoise-lite, delaunator,
poisson-disk-sampling, ez-tree: all MIT or ISC as of 2026-10-14). In the deterministic tier
**port the algorithm, do not depend on the package**: every one of them uses floats and
`Math.*`, and a 200-line integer port is cheaper than auditing a dependency. Re-implementing
from a paper or blog is free; copying code means checking its licence first
([research/README.md](../../research/README.md#licence-flags)) and keeping the attribution in a
header comment.

## Validation

Three strategies; pick per property, not per generator:

| Strategy | For | Rule |
|---|---|---|
| **Construct-correct** (the algorithm cannot produce an invalid result) | Hard invariants: reachability, a solvable path, every pad on a lane | **A failing invariant is a bug**, never a reason to try another seed (citygen's README says so). Build the guarantee into the step: Spelunky's path rooms always open sideways; citygen undoes the one change that disconnected the cells. |
| **Generate and test** (reject and retry) | Soft or global quality: enough floor, a room count, no 40-attempt layouts | **Bounded and seeded**: at most N attempts (seeded per attempt), then a known-good fallback. Never an unbounded loop. Attempts used is a metric. For WFC, restart only the failed block and fall back to known-good border tiles. |
| **Repair** (fix what is broken) | Cheap local fixes | A Dijkstra map from the start: unreachable floor becomes wall; the farthest tile gets the exit; a one-cell checkerboard gap gets one wall opened. |

**The Dijkstra map is the single most useful tool.** From one search it gives reachability, the
farthest point (exit placement), distance bands (difficulty by depth), and with a second pass
the chokepoints and loops (Brogue maps them before placing treasure). Every grid generator
should have it; citygen's `packages/citygen/src/check.ts` already holds typed-array BFS searches
to extract from.

**Metrics name the oatmeal.** Compton's warning: 10,000 mathematically unique bowls of oatmeal
still look like oatmeal. Hard constraints reject a seed; soft metrics rank the rest; only a
person or a sub-agent looking at a **contact sheet** judges the oatmeal. Metrics to keep per
generator: counts per kind, shares, largest-component share, detour factor (path length over
straight distance, p50/p95), distance to the nearest "change" (p95), attempts used. Compare
pairs of seeds by their metric histograms, and look at the sheet of the closest pairs, not only
random ones: pairs that are "too close" are the oatmeal.

**Expressive range.** Scatter 200–1000 seeds on two metrics as a heatmap. It shows what the
generator *can* make and where a parameter change moved it. Diff it against the last run when
tuning.

**Images follow the repo's image rules**: integer-upscaled contact sheets, never a raw 1x
render ([docs/looking-at-images.md](../looking-at-images.md)). Prefer numbers and ASCII over
screenshots; put screenshot-heavy checks in a sub-agent that returns a text verdict.

## Curation: seeds are content

- **Every game ships a curated seed list** (a `seeds` file per generator or game) with tags:
  *tutorial*, *showcase*, *hard*, *bug-repro*. A generator whose output is good 90 % of the
  time is a fine game when the game draws from the good 90 %.
- **Daily and shared seeds** are a social feature for free: PixelDen derives the daily seed
  from the UTC date with FNV-1a; New Hope takes `?seed=` in the URL. Show the seed; let players
  share it.
- **The owner's liked seeds are recorded through the studio**, never by a session on its own.
  A seed bookmark is owner-facing like a verdict, but it is not a verdict: it must not reuse
  `review.json` ([docs/studio.md](../studio.md)). The studio page for this is part of the
  toolkit proposal.
- **Bookmarks survive version bumps as data**: `{ seed, version, tags, note, author }`; when
  the version changes, the metric deltas of the bookmarked seeds are the first thing to look at.

## Generated plus authored

Patterns from the shipped games, in the order to apply them:

1. **Two-level structure.** A coarse generated plan (a path, a mission graph, a street grid, a
   cycle) is filled with authored pieces (rooms, modules, set pieces, floor plans). Players
   perceive the *arrangement* as variety and the *pieces* as quality; generate the first,
   author the second.
2. **Authored pieces are ASCII**, which a session writes well and the studio can show like an
   asset: room templates with probabilistic characters, floor-plan templates per archetype,
   mission templates, text grammars, WFC module sets as voxel modules. Keep a legend next to
   each template and a test that stamps every template at least once.
3. **Large scale predictable, small scale varied** (Townscaper). The player must read the
   world ("the Union is up, the past is down"); variation goes into details and, above all,
   *transitions* between regions.
4. **Landmarks first.** Place 1–3 things visible from afar on a coarse grid before anything
   else; everything else avoids or orients to them. Put medium things next to big things so
   the big ones read as intentional.
5. **Guaranteed beats, random fill.** The generator's input is a list of must-haves (a pad
   near spawn, a shop per district, a boss at depth 7); construct these, then fill. Show the
   reward before the choice where it fits, so randomness becomes a decision.
6. **Pacing comes from the mission, not the map.** Generate the mission graph first (learn →
   repeat → combine → test; a three-act grammar), then the space that fits it. Keep the
   key→lock edge through every rewrite.
7. **Structure first, then space.** Unexplored's recipe: a 5×5 node grid, one big loop between
   start and goal, one of 24 cycle types, minor cycles, then expand ×2 and ×5 into tiles.

**New Hope and the owner's story.** `games/new-hope/STORY.md` separates canon from proposal;
the generator never contradicts canon and gives it places to happen:

- story beats are authored mission templates with non-terminals (*a Union facility high in the
  city*, *an Ancestor hall that answers Kylo*), and a **binder** resolves each non-terminal to a
  citygen place by query (band, archetype, facade style, distance from the last beat); the
  beat's text is authored, the connective tissue (fares, side jobs, routes) is generated;
- generated lore is **rationalised events** in an explicitly unreliable register (graffiti,
  scavenger talk), drawn from a grammar that can never answer canon's open questions (who built
  the cities, why the planet emptied): those answers are the owner's alone. Whether the
  generator may write flavour lore at all is an open owner call;
- body-passing is a generative verb: a checkpoint is a lock, a body with access is the key, and
  the generator guarantees at least one such body's day plan passes the lock.

## Budgets and the browser

Opinion, to be measured; the numbers are the starting point, not a decision.

- **Generation runs in a worker.** Results come back as typed arrays in the transfer list
  (transfer `.buffer`, zero-copy; the sender's buffer is detached). A citygen district at New
  Hope's 48×48×20 is 46,080 cells × 4 small arrays, a few hundred KB: trivial.
- **Meshes** are built from those arrays in the worker (positions, normals, uv, index →
  `BufferGeometry` on the main thread) or on the main thread in per-chunk slices; New Hope
  meshes in 16-tile chunks. Draw-call and meshing advice:
  [research/game-optimisation.md](../../research/game-optimisation.md).
- **Main thread: ≤ 2 ms per frame for streaming work. Worker: 20–100 ms per chunk.** Mobile: 2
  workers. Desktop: `hardwareConcurrency − 2`, at most 4.
- **Chunked and infinite worlds**: a chunk is `f(worldSeed, chunkKey)` and neighbours never
  read each other. Cross-border features use **boundary contracts**: the shared *edge* key
  decides fixed things (where streets cross, where a river meets the edge), and both sides
  compute it. Load a ring around the player coarse-first; drop chunks beyond it and keep only
  the player's deltas.
- **Retry caps are hard caps.** A generator that needs 40 attempts on average is a tuning bug
  the metrics must show.
- **2D (Phaser 4)**: tiles generated as data → a `Tilemap` layer; textures from asset-kit
  buffers → `textures.addCanvas` or a `DynamicTexture`. PixelDen's own generators keep their
  mulberry32 streams: replacing them would change every shipped seed and daily.

## Toolkit: `@whz/procgen` (proposal)

The middle layer every game would otherwise rewrite (PixelDen already carries two copies of
`bsp.ts`, `corridors.ts` and `rng.ts`). One dependency-free package on top of `@whz/det`,
under the determinism lint, no DOM, no I/O, with a Node entry for the CLI. Everything integer:
noise in 16.16 fixed point with gradients from the hash and an integer fade polynomial.

| Module | Contents |
|---|---|
| `seed` | `seedOf(seed, tag, ...coords)`, `attemptSeed(seed, k)`; vector-tested like `@whz/det` |
| `grid` | typed `Grid2`/`Grid3`, flood fill, components (union-find), Dijkstra map, farthest cell, chokepoints, cull-unreachable |
| `noise` | integer value and gradient noise 2D/3D, fBm, ridged, warp, worley on a jittered offset grid; golden vectors |
| `sample` | jittered grid, integer Poisson disc, weighted deck |
| `layout` | BSP, CA cave, accretion plus loops, Spelunky path and template stamps, herringbone Wang tiles |
| `wfc` | tiled model with fixed cells, a path constraint, modify-in-blocks and a fallback |
| `grammar` | graph rewriting for missions; a Tracery subset and syllable names (ASCII only) |
| `check` | `generateValid` (bounded, seeded retries with a fallback) and `sweep` (per-seed metrics plus percentiles) |

A `procgen` npm script would mirror `city`: `sweep`, `metrics`, `sheet` (an upscaled PNG
contact sheet under the build folder) and `range` (an expressive-range heatmap). A generic
studio seed-browser page lists every generator that exports the surface above: a grid of
`draw()` thumbnails with metric badges, a detail view with the ASCII dump, the chain's
intermediates and "open in game", and bookmarks written only by the studio.

**Build order, each a tick-sized task**: `seed` + `grid` (extract from citygen's checks) →
`layout` basics (port the ideas of PixelDen's two dungeon generators) → `check` + CLI (point
citygen at the shared runner) → `noise` → `grammar`, then `wfc` → the studio page. The first
two steps unlock four of the fourteen game concepts catalogued in the research (§6) and
citygen's next steps: a district lattice with boundary contracts, a mission grammar with a
binder, citizen day plans, lazy per-floor interiors. The open questions (package or grow inside
citygen first; which concepts; PixelDen adoption; lattice or cube-sphere; flavour lore; seed
bookmarks) are listed in the research report and wait for the owner.

## Checklist for a session

Before writing a generator:

- [ ] List the **properties** (what makes an artefact good) and the **constraints** (what must
      never happen) in the package README before code, as citygen's "Invariants" section does.
- [ ] Decide the unit boundaries and name the hash keys; decide which tier each output is in.
- [ ] Write the ASCII dump first; the generator second; the checker third.

While building:

- [ ] Every stage is pure: `(input, seed, params) → artefact`; no stage reads a later one.
- [ ] Invariants are construct-correct; `check()` returns `ok` for 200 seeds in the tests.
- [ ] Retries are seeded, capped, counted, and have a fallback.
- [ ] Authored pieces are ASCII with a legend, and every piece is stamped by a test.
- [ ] Guaranteed beats are inputs, placed before the fill.

Before the commit:

- [ ] Golden hashes for 4–5 seeds; the version string bumped if they changed, and the commit
      says why.
- [ ] Metric snapshots with tolerances; the expressive-range heatmap diffed against the last
      run when tuning.
- [ ] A contact sheet of 9–16 seeds and of the closest metric pairs, integer-upscaled, read by
      a sub-agent for oatmeal.
- [ ] The CLI can `slice`/`stats`/`sweep` the generator without a browser.
- [ ] The curated seed list is updated by tag; no `review.json`, no bookmark written by the
      session.
- [ ] `./dev npm run check` passes.

## Further reading

- [research/procgen-for-games.md](../../research/procgen-for-games.md): techniques with
  parameters and licences, what thirteen shipped games teach, the fourteen-concept catalogue,
  the toolkit API sketch and citygen's evolution.
- [research/ref-nms-procgen.md](../../research/ref-nms-procgen.md): noise and terrain chains,
  determinism in JS, traversability metrics, the planet seed browser.
- [research/threejs-procgen-look.md](../../research/threejs-procgen-look.md): facade grammars,
  WFC in three.js, terrain meshing, procedural textures.
- [research/threejs-gameplay.md](../../research/threejs-gameplay.md): missions as data,
  versioned saves, traffic and crowd LOD.
- [research/game-testing-ai.md](../../research/game-testing-ai.md): the test protocol that
  makes a seeded run reproducible.
- [research/phaser-pixelden.md](../../research/phaser-pixelden.md) and
  [research/pixelden-flow.md](../../research/pixelden-flow.md): the PixelDen side.
- [docs/sim.md](../sim.md): the sim contract the generated data feeds into.
