# Procedural generation as the foundation of our games

*Research date: 2026-10-14. Status: proposal only.*

Nothing here is a decision. It goes into `docs/DECISIONS.md` or `tasks/` only after the owner
agrees in chat. Legend: **[S]** sourced (link inline, or a repo path), **[O]** my opinion,
**[U]** unverified. All URLs, with dates where known, are in [Sources](#sources).

**What this report builds on, and does not repeat:**
- [ref-nms-procgen.md](ref-nms-procgen.md): NMS and Minecraft terrain chains, uber noise,
  cube-sphere planets, determinism rules for JS (§3.1), traversability metrics (§4.1), and the
  seed-browser spec (§4.3).
- [voxels.md](voxels.md) and [ref-procedural-pixel-creatures.md](ref-procedural-pixel-creatures.md):
  voxel baking and creature bodies.
- Reports written in parallel today:
  - [threejs-procgen-look.md](threejs-procgen-look.md) §6–8: CGA facades for the skyline, WFC in
    three.js, terrain meshing, procedural textures.
  - [new-hope-audit.md](new-hope-audit.md) §8: determinism of New Hope's motion.
  - [threejs-gameplay.md](threejs-gameplay.md) §6 and §8: missions as data, versioned saves,
    traffic and crowd LOD.
  - [phaser-pixelden.md](phaser-pixelden.md) and [pixelden-flow.md](pixelden-flow.md): the
    PixelDen side.

This report is about **generation as a reusable foundation**: the techniques, what shipped
games teach, a catalogue of game concepts, and a shared toolkit package.

---

## 0. Summary

1. **We already have the hard part of the foundation.** [S]
   - `@whz/det` gives sfc32 streams forked by name, a positional `hash32`, integer maths and
     test vectors.
   - `@whz/citygen` is a positional-seed generator chain with invariants that hold for every
     seed, ASCII slices, a grid hash and a `sweep` CLI.
   - What is missing is the **middle layer**:
     - integer noise;
     - grid algorithms: flood fill, Dijkstra maps, chokepoints;
     - layout algorithms: BSP, cellular-automaton caves, room templates, WFC;
     - grammars, for missions and for text;
     - a generic generate-and-test runner, metrics, and a seed browser.
   - Every game would otherwise re-write this layer. PixelDen already has: 57 files use a
     seeded RNG; `dungeon-cast` and `glyph-depths` each carry their own `bsp.ts`,
     `corridors.ts` and `rng.ts` (mulberry32) [S: `~/projects/nodejs/pixelden/app/games/`].
2. **The pattern that ships, in almost every postmortem, is "authored pieces, generated
   arrangement, checked by code".** [S]
   - Spelunky's 4×4 rooms on a guaranteed path, with 10×8 templates and probabilistic tiles.
   - Diablo 1's set pieces and lockout check.
   - Brogue's accretion with connectivity-preserving lakes.
   - Noita's Wang tiles plus pixel scenes.
   - Bad North and Townscaper: WFC over 300–500 authored modules.
   - Minecraft's jigsaw villages.
   - Caves of Qud's five generated sultans around a fixed sixth.

   Pure noise or pure WFC is never the whole game. [O]
3. **Structure first, then space.**
   - Dormans (2010) and Unexplored (24 cycle types, about 5,000 rewrite rules) generate the
     *mission graph* first, then the *space* that fits it [S].
   - This is the right shape for New Hope's jobs and its undercity descents [O].
4. **Validation strategy matters more than the algorithm.** There are three ways [S/O]:
   - **construct-correct**: Spelunky's path, citygen's undo;
   - **generate-and-test** with bounded, seeded retries: Diablo, Bad North, Cogmind;
   - **repair**: Wolverson's "cull the unreachable" Dijkstra pass, Brogue's bridges.

   Our rule should be: construct-correct for invariants, test for quality, and never an
   unbounded retry [O].
5. **The browser is not the bottleneck at our scales.**
   - Generation runs in a worker. The results are typed arrays transferred zero-copy [S: MDN].
   - Meshes are built from those arrays on the main thread, or in the worker.
   - Float noise libraries (simplex-noise, fastnoise-lite) are fine for **looks only**.
     Anything saved or digested uses our integer noise [O, after ref-nms-procgen §3.1].
6. **Proposal: `@whz/procgen`**, a dependency-free package on top of `@whz/det`, under the
   determinism lint.
   - Modules: `seed`, `grid`, `noise`, `sample`, `layout`, `wfc`, `grammar`, `text`, `check`.
   - Plus a Node CLI (`sweep`, `metrics`, `sheet`) and a generic studio seed-browser page that
     any generator joins by exporting `{ id, version, params, generate, metrics, draw }` [O].
   - §7 has the API sketch and build order.
7. **citygen's next steps:**
   - a **district lattice**, with boundary contracts so that neighbouring districts never read
     each other;
   - **lazy interiors** per building, in the style of Shadows of Doubt: scored room placement
     inside an address, and a hallway rule;
   - **missions** as a graph grammar bound to citygen places;
   - **NPC day plans** precomputed per citizen, with positions evaluated in closed form.

   Each is a separate, tick-sized task (§7.6) [O].
8. **A catalogue of 14 game concepts** (§6) reuses the same stack. Five of them need almost
   nothing beyond what §7 proposes. [O]

---

## 1. Foundations

### 1.1 Seeds, positional hashing and PRNGs

**What we have** [S: `packages/det/README.md`, `packages/det/src/hash.ts`]:
- `createRng(seed, stream)`: sfc32, one stream per named concern, with `fork(name)`.
- `hash32(x, y, seed)`: three rounds of a murmur3-style `mix32`.
- `fnv1a32` / `fnv1a64` for content hashes.

**How the PRNG options compare** (bryc's JS PRNG survey, public domain [S]):

| PRNG | State | Speed (bryc's units) | Quality note |
|---|---|---|---|
| sfc32 | 128 bit | 7.45 M | The only one on the page reported to pass PractRand; also passes BigCrush. |
| mulberry32 | 32 bit | 10.4 M | Fast; passes gjrand; but **skips about a third of 32-bit values**. |
| splitmix32 | 32 bit | 10.5 M | From murmur3 fmix32. |
| xoshiro128** | 128 bit | 6.9 M | Weak low bits; fails linear-complexity and binary-rank tests. |
| jsf32 | 128 bit | 6.2 M | Good, but only a 32-bit seed. |

[O] Keep sfc32. PCG32 needs a 64-bit multiply, which means BigInt or a 4×16-bit emulation in JS.
It buys nothing over sfc32 here.

bryc's seeding advice is to fill the whole state from a hash, not from small consecutive seeds
[S]. `@whz/det` already does this per `(seed, stream)` [S: `src/rng.ts` header].

**The rule that matters more than the PRNG** [S: ref-nms-procgen §3.1, Eiserloh]:
- Randomness that crosses a unit boundary (chunk, district, building, room, NPC) is a **hash of
  (seed, tag, integer coordinates)**, never the next number from a shared stream.
- A sequential stream is fine *inside* one unit.
- citygen follows this [S: `generate.ts` derives block, lot and hall seeds with
  `hash32(x0, y0, blockSeed)` etc.].

**The one gap** [O]: `hash32` takes two coordinates.
- Planet-scale and 3D work needs `hashN(seed, tag, ...ints)`, so that `(face, i, j, k)` or
  `(district, building, floor, room)` keys hash directly.
- Chaining `hash32(hash32(a, b, s), c)` works, but should be one named, vector-tested function.

**Elite's lesson** [S: bbcelite.com]:
- The whole game universe is three 16-bit seeds.
- One Tribonacci "twist" (`s0'=s1, s1'=s2, s2'=s0+s1+s2`), applied four times, gives the next of
  256 systems.
- Rotating each seed byte left by one bit gives the next of 8 galaxies, so 2,048 systems in all.
- This is the purest form of "world = f(seed)". It also shows the fragility: one constant
  changed, and every system moves.
- Some systems were generated more than 7 light years from any neighbour, so a player there was
  stuck [S: search summary of the bbcelite and Game Developer pages] [unconfirmed on
  bbcelite's twist page, which says nothing about it; Game Developer's "History of Elite"
  confirms "the occasional generation of difficult-to-reach star systems"; whether the 1984
  original could strand a player (Oresrati) is disputed on fan forums]. A generator without a
  traversability check produces dead ends even in a classic.

### 1.2 Determinism across machines and versions

Already established [S: ref-nms-procgen §3.1, `tools/lint/determinism.js`]:
- integers only;
- only `abs ceil clz32 floor imul max min sign trunc` from `Math`;
- no clock, no I/O;
- golden hashes.

**What this report adds, about versions** [O]:
1. **Every generator exports `GEN = { id, version }`.** The version is part of its hash format
   string. citygen already embeds `whz-citygen-grid/1` [S: `src/text.ts`].
2. **Bump the version when any output for any seed changes.** A golden test catches this: it
   hashes a fixed probe set of seeds. The bump is then forced, not remembered.
3. **Saves pin `{ id, version, seed, params }` plus deltas.** The save format is in
   threejs-gameplay §6.3; it is not repeated here.
4. **Old versions: freeze, don't migrate.**
   - When a shipped game's generator changes, copy the old one to `v1/` and keep it callable.
   - Old saves keep their world. New saves get the new one.
   - NMS's Worlds Part II did the same at planet scale: only new star systems got the new
     terrain [S: ref-nms-procgen §1].
   - The cost is code size. That is acceptable for small generators.
5. **Retries are deterministic.** Attempt `k` uses `hashN(seed, "attempt", k)`. The number of
   attempts used is reported in the metrics, so a generator that needs 40 retries on average
   is visible.

### 1.3 Generator chains and graphs

The same shape recurs everywhere:
- **NMS** [S: ref-nms-procgen §1.1]: system seed → system data → planet descriptors → terrain.
  Every intermediate can be dumped.
- **Minecraft** [S: ibid. §5]: shaping → water → surface → features → structures.
- **citygen** [S: README]: streets → lots → buildings → lifts → stairs → pads → lanes →
  walkways → undercity.
- **Wolverson's Rust roguelike tutorial** (MIT code [S]): a **builder chain**, made of one
  *initial builder* plus a list of *meta-builders* that post-process the map.
  - Examples of meta-builders: cull unreachable areas, place the start, put the exit at the most
    distant tile, place doors (chapter 4.18), add prefab vaults.
  - Each step is swappable and snapshotted for debugging [S: chapters 27 and 40].

[O] For us, a stage is a pure function `(input, seed, params) → artefact`:
- Each artefact has a `toAscii()` or `toJson()` dump and a `hash()`.
- The chain is a plain array of stages. A stage reads only earlier artefacts.
- That is enough. A graph/DAG framework adds nothing until two games share more than three
  stages.

### 1.4 Constraints and validation

| Strategy | When | Examples [S] |
|---|---|---|
| **Construct-correct**: the algorithm cannot produce an invalid result | Hard invariants (reachability, a solvable path) | Spelunky: the path rooms have left and right exits, and drop rooms also open downward, so the level is always traversable (GMTK transcript, secondary). citygen undoes one change when opening a floor disconnects cells. Brogue builds bridges only after connectivity holds, so burning a bridge never strands the player. |
| **Generate and test**: reject and retry | Soft or global properties that are hard to construct | Diablo 1 restarts on a lockout (not all walkable), on failed stairs, or when catacombs have fewer than 700 floor tiles or caves fewer than 600. Bad North restarts when its navigability check fails. Cogmind tests maps right after layout, and "some fail many times before one is accepted". Compton: filtering Spore planets by keeping the good seeds was faster than writing a perfect algorithm. |
| **Repair**: fix what is broken | Cheap local fixes | Wolverson: a Dijkstra map from the start; every floor tile at infinite distance becomes wall; the farthest reachable tile gets the exit. Brogue fixes diagonal-only checkerboard gaps by opening one wall. |

[O] Rules for our generators:
- **Invariants are construct-correct, and a failing invariant is a bug.** citygen already says
  this: "a district that fails is a bug in the generator, not a reason to try another seed"
  [S: README].
- **Quality is generate-and-test, with a cap.** Use at most N attempts, then a known-good
  fallback. Boris the Brave's "modifying in blocks" does exactly this for WFC: restart only the
  failed block, and fall back to known-good border tiles [S].
- **The Dijkstra map is the most useful single tool.** It gives reachability, the farthest
  point (exit placement), distance-banded difficulty, and loop and chokepoint detection (Brogue
  maps all loops and chokepoints before placing treasure [S]). It belongs in the toolkit's
  `grid` module.

### 1.5 Tuning and curation

**Compton's essay** [S: 2016] gives the vocabulary:
- **Perceptual uniqueness**: "10,000 bowls of oatmeal" are mathematically unique and look the
  same. This is the hard, important bar.
- **Perceptual differentiation**: each piece differs from the last. This is often enough
  (trees).
- Only a few artefacts need to be **characterful**. Her test, in her GDC 2017 talk: would
  players write fanfic about it? [S]
- She lists **properties and constraints before code**: what makes an artefact good, and what
  must never happen.

**Expressive range** (Smith & Whitehead 2010) and the seed browser are in ref-nms-procgen §4.
Two additions [O]:
1. **Curated seed lists are content.**
   - PixelDen's daily challenge already derives a seed from the UTC date with FNV-1a
     [S: `app/games/shared/daily.ts`].
   - A Wallhammer game should ship a `seeds.json` with tags: *tutorial*, *showcase*, *hard*,
     *bug-repro*. The studio marks seeds the owner liked.
   - Bad generators are often fine games with curated seeds. The game can draw from the good
     90 % only.
2. **Metrics name the oatmeal.** Use them for perceptual distance: compare two seeds by
   histograms of building archetypes, room shapes and path lengths. Pairs that are "too close"
   are a sign of oatmeal. Look at the contact sheet of the 9 closest pairs, not only of random
   seeds.

---

## 2. Techniques: when to use what

The table is the index. The notes after it add only what is not already in
ref-nms-procgen.md (noise and terrain) or threejs-procgen-look.md (CGA facades, WFC in three.js).

| Technique | Good for | Key parameters / numbers | Pitfalls | Browser lib (licence) |
|---|---|---|---|---|
| **Value / Perlin / simplex / OpenSimplex2 noise + fBm** | Height, moisture, density, variation fields | Octaves at frequencies 1, 2, 4… with amplitudes 1, ½, ¼; normalise by the sum; redistribute with `pow(e·1.2, k)`; separate seeds per field [S: Red Blob] | Grid-aligned artefacts (Perlin); "noise soup" with no structure | simplex-noise 4.0.3 (MIT), fastnoise-lite 1.1.1 (MIT), open-simplex-noise 3.0.0 (Unlicense); OpenSimplex2 reference (CC0) [S] |
| **Ridged / billow / domain warp** | Mountains, rivers, marble and organic shapes | ridge = `2·(0.5−|0.5−n|)`, octaves weighted by the previous one [S: Red Blob]; warp `f(p + k·fbm(p))` [U: IQ's page returned 404] | Warp cost multiplies the noise calls | fastnoise-lite has OpenSimplex2 and grid domain warp [S] |
| **Cellular automata** | Caves, lakes, erosion-like smoothing | Fill 45 % wall [refuted 2026-10-14: `glyph-depths/dungeon/cave.ts:11` seeds 45 % **floor** (`rng.chance(0.45) ? FLOOR : WALL`), i.e. 55 % wall], rule "≥5 walls of 8 → wall", 5 iterations (PixelDen glyph-depths [S]); Brogue lakes: 55 % alive, B5678/S45678, 5 iterations, largest blob [S] | Disconnected pockets: always flood-fill and keep or connect | trivial; rot.js `Map.Cellular` (BSD-3) |
| **BSP / rooms and corridors** | Buildings, dungeons, interiors | Diablo catacombs: rooms 4–9 tiles, halls 1–3 wide, 40×40 [S] | Boxy and samey; add loops and irregular rooms | rot.js `Map.Digger/Uniform` (BSD-3) |
| **Accretion (attach rooms to walls)** | Organic dungeons with authored room shapes | Brogue: up to 600 attempts, 99 rooms, 80 % corridor plus room, doors 60 % [S] | Tree-like: add loops (Brogue: hollow a wall between rooms more than 2 apart by path) | own |
| **Drunkard walk / DLA** | Caverns, rivers, cracks | Stop at X % floor coverage | Blobby; needs a stopping rule | own |
| **Poisson disc / jittered grid** | Placing trees, props, POIs, building sites | Bridson: k = 30 candidates, O(N) [S] | Float sampling: use an integer grid with jitter for determinism [O] | poisson-disk-sampling 2.3.1 (MIT) |
| **Voronoi / Delaunay** | Regions, districts, irregular grids, mapgen | mapgen4: Poisson points → Delaunay/Voronoi dual mesh; painted elevation; wind, rain, rivers [S] | Float robustness: use for looks, or a hashed "offset grid" (nearest jittered point) for gameplay [O, after NMS §1] | delaunator 5.1.0 (ISC), d3-delaunay 6.0.4 (ISC) |
| **L-systems** | Plants, river and road growth | Parish & Müller 2001: L-system roads with global goals and local constraints that snap to make loops [S] | Plain L-systems make trees, not loops | ez-tree 1.1.0 (MIT, three.js trees) |
| **Shape / split grammars (CGA)** | Building masses, facades, interiors | Mass model → facade split → windows and doors; context rules stop windows from cutting walls [S: Müller 2006] | Rules sprawl; keep them as data | own (see threejs-procgen-look §6) |
| **WFC / model synthesis** | Tile-locality: towns, ruins, decoration, texture-like layouts | Min entropy; weights; fixed tiles for entrances; path constraint; *modify in blocks* for large outputs [S] | No global structure; long thin structures fail [S: Townscaper] | wavefunctioncollapse 2.1.0 (MIT), ndwfc (MIT, 2020) |
| **MarkovJunior rewrite rules** | Mazes, dungeons, rivers and buildings from a few lines of rules, 2D/3D | Ordered rules; `{forall}`/`(exists)`; inference toward an observed goal [S] | C#; we would port ideas, not code | MarkovJunior (MIT) |
| **Graph grammars (missions)** | Lock-and-key dungeons, quests, mission structure | Dormans: mission graph with tight and loose edges, then a shape grammar builds space per symbol [S] | Keys behind their locks: keep a key→lock edge [S: Unexplored] | own |
| **Agents / simulation** | History, ecology, erosion, citizens | DF: elevation, rain, drainage, temperature → erosion → rivers → history years [S]; Shadows of Doubt: 4–10 trips per citizen per day, precomputed [S] | Slow; unbounded; hard to direct. Simulate a little, then rationalise | own |
| **Answer-set / constraint solving** | Puzzles with crisp yes/no constraints | Smith & Mateas 2011: declare the design space, the solver finds members [S] | Solver in the loop is a dependency | clingo-wasm (Apache-2.0) [S]; or our own small CSP |
| **Text grammars** | Names, barks, item and quest text | Tracery: `#symbol#`, `.capitalize/.a/.s`, `[hero:#name#]` actions [S] | Repetition: depth and "don't repeat recently" | tracery (Apache-2.0); tracery-grammar 2.8.4 (ISC) |
| **Wang / herringbone tiles** | Any-order tiled 2D worlds with authored chunks | Herringbone hides the grid; 227 connectivity patterns catalogued [S] | Needs an authored tile set per biome | stb_herringbone_wang_tile (public domain) [U → confirmed 2026-10-14: the header dual-licenses it to the public domain and a permissive licence] |

### 2.1 Notes per family [O unless marked]

- **Noise**:
  - Use one integer gradient-noise implementation in `@whz/procgen` for everything that is
    saved or digested.
  - Use fastnoise-lite (MIT; every noise type plus warp in one file [S]) for visual-only fields
    in New Hope shaders and textures.
  - Do not use the GLSL `fract(sin())` hash for gameplay (ref-nms-procgen §3.1).
- **WFC**: use it only for *local texture* on top of a structure decided elsewhere.
  - Boris the Brave: WFC "rarely generates large scale structures" [refuted 2026-10-14: not a
    quote; the page says "WFC doesn't have any global structure to it, all it does it make the
    output generation look like the input locally" and that large maps "start to look very
    samey"]. Pick a biome per level and
    disable the tiles that don't fit (Bad North), or split the map into regions with different
    tile sets (Caves of Qud) [S].
  - Townscaper separates module choice from decoration. Its modules are corner pieces placed by
    a marching-cubes-like rule on a relaxed hex→quad grid [S].
  - For citygen, WFC fits **inside** a block: rooftop clutter, ruin decay in the undercity,
    market stalls. It does not fit the street network (threejs-procgen-look §6 reaches the same
    conclusion).
- **Graph grammars**: the most valuable technique we don't yet use.
  - Dormans' example grammar `Dungeon → Obstacle + Obstacle + Obstacle + Obstacle + treasure`
    enforces a minimum length.
  - `Dungeon → ThresholdGuardian + Obstacle + MiniBoss + reward + Obstacle + LevelBoss +
    treasure` enforces a three-act structure [S].
  - Unexplored:
    - starts from a ~5×5 node grid;
    - draws one big loop between start and goal with about 40 rules;
    - picks one of 24 cycle types (two alternative routes; lock and key; one-way valves; hub;
      lake shore);
    - embellishes with minor cycles;
    - expands the grid ×2, then ×5, into tiles [S].
  - A small engine (subgraph match with fixed-size patterns plus rewrite) is ~300 lines [O].
- **Simulation for history**: Caves of Qud's Grinblat generated *events first and rationalised
  them afterwards*, instead of simulating history [S: GDC 2018 summary].
  - The wiki shows the structure: 5 generated sultan periods plus one fixed sultan (Resheph);
    each period adds 2–3 regions and a shrinking number of locations [S].
  - This is the model for the Ancestor and Psion lore under New Hope (§5).
- **Creatures and characters**: NMS uses hand-made skeletons with generated variation and
  proportion constraints [S: ref-nms-procgen §1.9]. Spore is Compton's "artist in a box": watch
  how an artist works, then encode that [S].
  - Our version is the part-library voxel character (ref-voxel-musou.md) with Min/Max ranges.
    No new research needed.
- **Loot and items**: Compton's "distribution" method, with weighted tables and deck shuffles
  (no repeats until the deck empties) [S].
  - Item = base × affix table × rarity tier, with names from a text grammar.
  - Deck shuffling, not independent rolls, is what makes reward pacing feel fair [O].
- **Music and SFX**: covered by [audio-from-code.md](audio-from-code.md) and `@whz/audio`. Per
  district or biome, choose song parameters from the region's hash.

---

## 3. What shipped games teach

| Game | What is generated | The trick worth taking | Source |
|---|---|---|---|
| **Spelunky** | A level from 16 rooms | 4×4 grid; random path top→bottom; room *type* by position on the path; 10×8 ASCII templates (about 30 in the source); probabilistic tiles ("2": 1-in-10 pushblock; "7": spike 1-in-3); "5" stamps one of 16 5×3 obstacle blocks | [S] tinysubversions 2010; GMTK transcript (secondary) |
| **Diablo 1** | 40×40 levels in 4 styles | Two passes: "predungeon" walkability, then tiles by marching squares or 3×3 patterns; one set piece per level; retries on lockout or too few floor tiles; lava rivers need a bridge | [S] Boris the Brave 2019 (upd. 2025) |
| **Brogue** | Dungeon floors | Accretion + local loops + CA lakes placed only if passability holds + "machines" (vaults, key holders) at depths 3, 7, 11…; chokepoint map before treasure | [S] brogue.wiki (page flagged "needs checking") |
| **Unexplored** | Zelda-like dungeons | Cycles, not trees; 24 cycle types; key→lock edges kept through rewrites; ~5,000 rules in ~50 modules | [S] Boris the Brave 2021 (upd. 2025) |
| **Bad North / Townscaper** | Islands; player-shaped towns | WFC over 300+ (Bad North) and ~500 (Townscaper re-skin estimate) authored modules; hard and soft rules; navigability check plus restart; irregular quad grid; decoration separate from structure; "large scale predictable, small scale varied"; focus on transitions | [S] Game Developer 2022 |
| **Caves of Qud** | World, history, villages | Events first, rationalised after; fixed main-quest sites with generated interiors; WFC for some dungeons (Bucklew talk) | [S] wiki; GDC Vault listing |
| **Dwarf Fortress** | World plus centuries of history | Field maps (elevation, rain, drainage, temperature) → biomes → erosion → rivers → history simulation | [S] Wikipedia and DF wiki (via search) |
| **Noita** | Biomes | Herringbone [unconfirmed: the wiki says "Wang tiles" and links herringbone only as background reading] Wang tiles whose colours map to materials, plus authored "pixel scenes"; guaranteed chests (one image caption only) | [S] noita.wiki.gg |
| **Cogmind** | 200×200 maps, ~two dozen map types [unconfirmed: not in the Game Developer article; ModDB source unreachable] | One tunnelling generator with dozens of parameters; test right after layout, reject ("some fail many times") [unconfirmed: same, only from the 403 ModDB page]; prefabs; entrance and exit placement is the main balance lever; a fully hand-made map (the Exiles) with 4 weighted world states (51/12/12/25 %) [confirmed] | [S] Game Developer; ModDB (search summary, page 403) |
| **Rain World** | Behaviour, not levels | Rooms are not generated (the article doesn't say they are) [U]. Creatures are physics points plus a "paper doll" [unconfirmed: the article says the slugcat is two spherical chunks at a fixed distance with cosmetic, procedurally animated limbs; "paper doll" does not appear]; behaviour from relation tables plus modules (PreyTracker, ThreatTracker, DenFinder…); a tool marks rooms as attractive to some creatures | [S] Unity blog 2025 |
| **Shadows of Doubt** | A whole city, interiors, citizens, murders | City > district > block > building > floor > address > room > tile; 15×15-tile floors (1.8 m tiles); address shapes **hand-drawn**, rooms placed by scoring every free spot (size, shape, windows); a hallway rule; routines precomputed per day | [S] ColePowered DevBlogs #8, #13 |
| **Minecraft** | Terrain (see ref-nms §5); villages | Jigsaw: authored pieces with named connectors draw the next piece from a pool, up to 20 levels deep (raised from 7 in 23w45a) | [S] minecraft.wiki |
| **Elite** | 8 × 256 star systems | 3 × 16-bit seeds, Tribonacci twist; isolated systems were a shipped flaw | [S] bbcelite.com |
| **Hades** | Room order and rewards | Hand-made arenas, generated sequence; door shows the reward *before* you choose; some rooms guaranteed (shop, fountain) | [U] fan wikis only |
| **Valheim / Teardown** | — | Valheim is in ref-nms §5 [U]. Teardown's levels are, to my knowledge, hand-built voxel maps; its lesson is *simulation* (destruction) as the variety engine, not generation [U] | — |
| **No Man's Sky / Light No Fire** | Universe | See ref-nms-procgen.md | — |

**Patterns across the table** [O]:
1. **Two-level structure.** A coarse generated plan (Spelunky's path, Dormans' mission,
   Unexplored's cycle, Diablo's predungeon, citygen's streets) is filled with authored pieces.
2. **Every shipped generator has a validator**, and most retry.
3. **Authored content is placed by the generator, not instead of it**: set pieces, vaults,
   pixel scenes, jigsaw pieces, fixed quest sites.
4. **The best "procedural" games generate the parts players perceive as different**: layout
   and reward order. They hand-make the parts players perceive as quality: rooms, modules,
   creatures' paper dolls.

---

## 4. Procgen in the browser

### 4.1 Libraries (versions and licences from the npm registry and GitHub, 2026-10-14) [S]

| Need | Library | Version | Licence | Tier |
|---|---|---|---|---|
| Noise | simplex-noise | 4.0.3 | MIT | Look only (float) |
| Noise plus warp plus cellular | fastnoise-lite | 1.1.1 | MIT | Look only |
| Roguelike toolkit (maps, FOV, paths) | rot-js | 2.2.1 | BSD-3-Clause | Reference; float RNG |
| Delaunay | delaunator | 5.1.0 | ISC | Look, or offline tools |
| Voronoi | d3-delaunay | 6.0.4 | ISC | Look, or offline tools |
| Poisson disc | poisson-disk-sampling | 2.3.1 | MIT | Look |
| WFC | wavefunctioncollapse (kchapelier) | 2.1.0 | MIT | Reference |
| WFC n-dimensional | ndwfc (LingDong-) | git, 2020 | MIT | Reference |
| Text grammar | tracery (galaxykate) | git | Apache-2.0 | Reference; port |
| ASP solver | clingo-wasm | git, 2026 | Apache-2.0 | Offline puzzle tools only |
| Spatial index | rbush 4.0.1 (MIT), flatbush 4.6.2 (ISC) | | | Either |
| Hex grids | honeycomb-grid | 4.1.5 | MIT | Either |
| Maps (reference) | mapgen4 / mapgen2 | git, 2026 | Apache-2.0 | Ideas plus attribution |
| Trees (3D) | @dgreenheck/ez-tree | 1.1.0 | MIT | Look |

[O] For **deterministic tiers**, take algorithms, not packages.
- Every library above uses floats and `Math.*`, which the lint bans.
- Porting a 200-line algorithm to integers is cheaper than auditing a dependency.
- Licence rule: re-implementing an algorithm from a paper or blog is fine. Copying code means
  checking the licence first (all above are permissive). Keep the attribution in a header
  comment.
- Nothing here hits the [licence flags](README.md#licence-flags).

### 4.2 Workers, chunks, budgets [O unless marked]

- **Generation runs in a worker. Results return as typed arrays in the transfer list.**
  - `ArrayBuffer` transfer is zero-copy, and the sender's buffer is detached (`byteLength` 0).
  - Transfer `.buffer`, not the typed array [S: MDN].
  - A citygen district is 48×48×20 = 46,080 cells × 4 `Uint8`/`Uint16` arrays, a few hundred
    KB. That is trivial to transfer. [refuted 2026-10-14: 48×48×20 is New Hope's size
    (`packages/new-hope-play/src/world.ts:31`); citygen's own default is 32×32×16 = 16,384
    cells (`packages/citygen/src/params.ts:84-86`). The conclusion stands either way.]
- **Mesh building**: either in the worker (positions, normals, uv and index as typed arrays →
  `BufferGeometry` with `BufferAttribute`s on the main thread), or on the main thread in
  per-chunk slices.
  - New Hope already meshes in 16-tile chunks [S: `packages/new-hope-play/README.md`].
  - Meshing budget and draw-call advice: new-hope-audit §2 and §4 and threejs-procgen-look §7.
- **Chunked and infinite worlds**:
  - A chunk's content is `f(worldSeed, chunkKey)`. Neighbours never read each other.
    Cross-border features use **boundary contracts**: an edge decides fixed things (street
    positions, a river crossing point) from a hash of the *edge key*, which both sides compute.
  - Load in a ring around the player, coarse-first.
  - Drop chunks beyond the ring, and keep only player deltas (ref-nms-procgen §3.10).
- **Budgets** (opinion, to be measured):
  - The main thread gets ≤ 2 ms per frame for streaming work.
  - A worker can take 20–100 ms per chunk.
  - Hard caps on retries.
  - Mobile: 2 workers. Desktop: `hardwareConcurrency − 2`, at most 4.
- **2D (Phaser 4)**:
  - Phaser 4.0.0 was published to npm on 2026-04-10; 4.2.1 is current [S: npm].
  - v4 splits `RenderTexture` (a game object) from `DynamicTexture` (a shared texture with
    `stamp`, `fill`, `render()`), and its own skill doc lists "procedural generation" as a use
    [S: phaser@4.2.1 skill file].
  - Tiles generated as data → a `Tilemap` layer. Textures from our asset-kit buffers →
    `textures.addCanvas` or a DynamicTexture.
  - phaser-pixelden.md covers the rest.

---

## 5. Design: interesting, not random

### 5.1 Principles [S where marked, else O]

1. **Generate structure, author texture, or the reverse, but never both random.**
   - Spelunky generates the path and authors the rooms.
   - Townscaper lets the *player* author the structure and generates the texture [S].
2. **Large scale predictable, small scale varied** (Stålberg [S]).
   - The player must be able to read the world: "the Union is up, the past is down"
     (New Hope's bands) is exactly this.
   - Variation goes into details and transitions. Stålberg: focus on *transitions*, because
     uniform repetition is dull [S].
3. **Pacing comes from the mission, not the map.**
   - Use Dormans' kihon → kihon-kata → kata → kumite (learn, repeat, combine, test) and the
     three-act rule [S].
   - Unexplored's cycle types are pacing templates [S].
   - Brogue's treasure machines at fixed depths are guaranteed beats [S].
4. **Landmarks.** Every generated space needs 1–3 things visible from afar that are *not*
   oatmeal: a megablock, a crystal shaft, a crashed ship.
   - Place them first, on a coarse grid; everything else avoids or orients to them.
   - "Barnacling" (Compton): put medium things next to big things, so big things read as
     intentional [S].
5. **Guaranteed beats plus random fill.**
   - Make the generator's input a list of *must-haves*: a pad near spawn, a hall entrance within
     N tiles, a shop per district.
   - Construct these, then fill. Hades shows the reward on the door, so the randomness becomes
     a *choice* [U].
6. **Show the seed, let players share it.** Daily seeds (PixelDen) and seed-in-URL (New Hope's
   `?seed=`) turn generation into a social feature [S: repo].

### 5.2 Generation plus the owner's authored story (New Hope)

STORY.md separates **canon** (fixed) from **proposal** [S]. The generator must never contradict
canon, and must give canon places to happen [O]:

- **Fixed spine, generated flesh** (the Qud pattern: 5 generated sultans plus 1 fixed [S]).
  - Story beats are authored **mission templates** with non-terminals: *a Union facility high in
    the city*, *an Ancestor hall that answers Kylo*, *a guard whose body opens a checkpoint*.
  - The generator *binds* each non-terminal to a citygen place by query (band, archetype,
    facade style, distance from the last beat).
  - The beat's text is authored. The connective tissue (fares, side jobs, the route) is
    generated.
- **Lore by rationalisation.**
  - The undercity's ruins get "history" generated as events: *a Psion sealed this hall*, *the
    Ancestors left in a hurry*, as Grinblat did.
  - Events are drawn from a grammar that can never answer canon's open questions (who built the
    cities, why the planet emptied). Those answers are only the owner's.
  - Generated lore is flavour with an explicit "unreliable" register: graffiti, scavenger talk.
- **Kylo's body-passing as a generative verb.** Each NPC body has generated attributes
  (faction, access, schedule). A mission node "get past checkpoint X" is satisfiable through
  any body that has the access. The generator just guarantees that at least one such body's
  schedule passes near X, which is Dormans' lock and key, where the key is a *person*.

---

## 6. Catalogue: 14 game concepts that procgen makes cheap for us

"Reuses" names our packages. `procgen` is the proposed toolkit (§7). 3D means Three.js;
2D means Phaser 4 (PixelDen) or our pixel runtime. [O] throughout.

| # | Concept | Dim | Generator stack | Reuses | Cost beyond toolkit |
|---|---|---|---|---|---|
| 1 | **Undercity Delve**: a New Hope spin-off roguelite; descend through Ancestor halls, one run = one generated dungeon under a generated district | 3D | Mission graph grammar → Unexplored-style cycle → citygen-like cell grid → WFC ruin decay → loot decks | citygen (undercity band), new-hope-play actors, voxel-kit, audio | Low: New Hope's movement exists |
| 2 | **Skyline Heist**: break into one generated tower; floors, guards on schedules, body-passing | 3D | Lazy interiors (§7.6) + guard day plans + Dijkstra/vision cones + chokepoint analysis | citygen, new-hope-play | Medium |
| 3 | **Lane Runner**: endless flying-car racer through an infinite district lattice | 3D | Chunked district lattice + lane graph + difficulty by distance | citygen, new-hope-play hovercar, audio | Low |
| 4 | **Case Files**: a Shadows-of-Doubt-lite detective on New Hope; a generated crime, citizens, clues | 3D or 2D | Citizen generator (names, jobs, homes) + day plans + a crime grammar (motive, means, opportunity) + clue placement that guarantees solvability (generate-and-test with a solver) | citygen, procgen text, sim | High, but very differentiated |
| 5 | **Pocket Planets**: walk and fly small planets, NMS-lite | 3D | Cube-sphere integer noise + biome table + sites (ref-nms) | voxel-kit, det, audio | Medium; spec exists |
| 6 | **Island Toy**: Townscaper-like builder on an irregular grid | 3D | Relaxed hex→quad grid + corner-module selection (marching squares in 3D) + decoration pass | voxel-kit (modules), procgen grid | Medium (module art) |
| 7 | **Arcology Tycoon**: Kairosoft-style sim of one tower | 2D pixel | Building grammar for floors + tenant generator + event deck + names | sim, runtime, asset-kit, game-data | Medium; the Kairosoft-style sim track (CLAUDE.md) |
| 8 | **Glyph Crawl**: a classic roguelike; extract PixelDen's two dungeon generators into the toolkit and build one better game on it | 2D | BSP/accretion + CA caves + Dijkstra cull and exit + vaults + loot decks | procgen layout, PixelDen | Low |
| 9 | **Drop Shaft**: a Spelunky-like platformer | 2D | 4×4 path + ASCII room templates with probabilistic tiles + obstacle stamps | asset-kit, code-pixel-game's "levels as ASCII" | Low |
| 10 | **Daily Puzzle Forge**: sokoban, ice-slide or pipe puzzles per day | 2D | Generate by reverse play from a solved state + BFS solver to verify uniqueness and minimum moves + difficulty from solver stats; ASP is an option offline | procgen check, PixelDen daily seeds | Low |
| 11 | **Chronicle**: a fantasy map plus centuries of generated history to read and play in | 2D | Poisson points → Voronoi regions → elevation and rivers (mapgen4 ideas) → factions as agents for N turns → events rationalised into text | procgen sample/grammar/text, audio | Medium |
| 12 | **Star Trader**: an Elite-like 2D trader | 2D | Galaxy by positional hash + names grammar + economy by system type + route graph with a reachability check (no Elite dead ends) | procgen, sim | Low |
| 13 | **Critter Breeder**: collect and breed generated creatures | 2D | Part-library genomes with Min/Max ranges + crossover/mutation + pixel bake | voxel-kit bake, ref-procedural-pixel-creatures rules | Medium (art rules) |
| 14 | **Track Day**: a generated kart/racing circuit per seed | 2D or 3D | Points → convex hull → perturb and relax → spline → validate curvature and width → props by Poisson disc | PixelDen pixel-kart, audio | Low |

[O] **Five cheapest first-wave picks**, because they reuse the most and validate the toolkit:
- **#8 and #9**: they force `layout`, `grid` and `check`.
- **#3**: it forces the district lattice that New Hope needs anyway.
- **#10**: it forces `check` with a solver, and gives a daily-content engine for PixelDen.
- **#1**: it forces `grammar`, and directly grows New Hope.

---

## 7. Proposal: `@whz/procgen` and citygen's evolution

### 7.1 Scope and rules [O]

- **One package, `packages/procgen`.** It depends only on `@whz/det`, sits under the
  determinism lint, and has no DOM and no I/O. A `node` entry holds the CLI.
- **Everything is integer.** Noise uses 16.16 fixed point, with the fade curve from an integer
  polynomial (`6t⁵−15t⁴+10t³` evaluated in fixed point) or a 256-entry table like `ease`.
  Gradients come from `hashN` and a table of 8 or 12 integer directions.
- **Every function that draws randomness takes `seed` (u32) and a `tag`**, or an `Rng`. None
  takes a global.
- **Every generator** exports:
  - `GEN = { id, version }`;
  - `generate(seed, params) → artefact`;
  - `check(artefact) → { ok, problems }`;
  - `metrics(artefact) → Record<string, number>`;
  - `ascii(artefact)` and/or `draw(artefact, buffer)`, a palette-indexed raster for contact
    sheets, using asset-kit conventions.
- **Tests per generator**, following citygen's model:
  - invariants over ≥ 200 seeds;
  - golden hashes for 5 seeds (a version bump if they change);
  - metric snapshots with tolerances (median and p5/p95 of each metric over 200 seeds);
  - a perf report (time per generate) printed, not gated, because timing isn't deterministic.
- **Ports**: the det test-vector approach extends to procgen (`data/vectors.json`: noise
  samples, a WFC run, a BSP split) so a Godot or other port can prove equality.

### 7.2 Modules and API sketch [O]

```ts
// seed: child seeds by tag and integer coordinates (vector-tested)
export function seedOf(seed: number, tag: string, ...coords: number[]): number; // u32
export function attemptSeed(seed: number, attempt: number): number;

// grid: typed 2D/3D grids and the algorithms every generator needs
export class Grid2<T extends Uint8Array | Uint16Array | Int32Array> { w: number; h: number; data: T; /* get/set/inBounds */ }
export function floodFill(g: Grid2<Uint8Array>, start: number, passable: (v: number) => boolean): Uint8Array;
export function components(g, passable): { label: Int32Array; sizes: number[] };      // union-find
export function dijkstraMap(g, sources: number[], cost: (from: number, to: number) => number): Int32Array; // -1 = unreachable
export function farthest(dist: Int32Array): number;
export function chokepoints(g, passable): Uint8Array;                                  // articulation cells
export function cullUnreachable(g, from: number, passable, wall: number): number;      // returns cells removed

// noise: integer, fixed point 16.16 (FP_ONE from @whz/det)
export function valueNoise2(seed: number, x: number, y: number): number;               // x,y in 16.16 → -FP_ONE..FP_ONE
export function gradNoise2(seed: number, x: number, y: number): number;
export function gradNoise3(seed: number, x: number, y: number, z: number): number;
export function fbm2(noise: Noise2, seed: number, x: number, y: number, o: { octaves: number; gainNum: number; gainDen: number; lacunarity: number }): number;
export function ridged2(...): number;
export function warp2(noise: Noise2, seed: number, x: number, y: number, amp: number): [number, number];
export function worley2(seed: number, x: number, y: number, cell: number): { d1: number; d2: number; id: number }; // jittered offset grid

// sample: placement
export function jitteredGrid(seed: number, w: number, h: number, cell: number, jitter: number): Int32Array; // x,y pairs
export function poissonDisc(seed: number, w: number, h: number, r: number, k?: number): Int32Array;         // Bridson, integer grid
export function deck<T>(rng: Rng, items: readonly T[], weights?: readonly number[]): () => T;              // no repeats until empty

// layout: 2D maps; every builder returns a Grid2 plus metadata
export function bsp(rng: Rng, rect: Rect, o: { min: number; max: number; splitBias: number }): Rect[];
export function caCave(rng: Rng, w: number, h: number, o: { fillPct: number; birth: number[]; survive: number[]; iterations: number }): Grid2<Uint8Array>;
export function accrete(rng: Rng, g: Grid2<Uint8Array>, rooms: RoomShape[], o: { attempts: number; maxRooms: number; corridorPct: number }): Room[];
export function addLoops(g, rooms, o: { minPathRooms: number; maxLoops: number }): number;
export function templatePath(rng: Rng, cols: number, rows: number): PathCell[];   // Spelunky path with room types
export function stampTemplate(rng: Rng, g: Grid2<Uint8Array>, at: Point, template: string[], legend: TemplateLegend): void; // probabilistic chars
export function herringbone(rng: Rng, w: number, h: number, tiles: WangTileSet): Grid2<Uint8Array>;

// wfc: tiled model, fixed cells, path constraint, blocks
export function wfc(seed: number, model: TileModel, size: Size3, o?: { fixed?: Map<number, number>; pathTiles?: number[]; blocks?: { size: Size3; overlap: number; restarts: number }; fallback?: number }): WfcResult; // { tiles, attempts, failedBlocks }

// grammar: graph rewriting (missions) and text
export function rewriteGraph(rng: Rng, start: Graph, rules: GraphRule[], o: { maxSteps: number; until?: (g: Graph) => boolean }): Graph;
export function expandText(rng: Rng, grammar: TextGrammar, symbol?: string): string; // Tracery subset: #sym#, .cap/.a/.s, [var:#sym#]; ASCII only
export function syllableNames(rng: Rng, table: SyllableTable, o: { min: number; max: number }): string;

// check: generate-and-test with bounded seeded retries and metrics
export function generateValid<A>(gen: (seed: number) => A, seed: number, test: (a: A) => boolean, maxAttempts: number, fallback?: (seed: number) => A): { artefact: A; attempts: number };
export function sweep<A>(g: Generator<A>, first: number, count: number): SweepReport;   // per-seed metrics + summary percentiles
```

**Node CLI** (`./dev npm run procgen -- …`, mirroring `city`):
- `sweep <gen> <first> <count>` → exit 1 on an invariant failure;
- `metrics <gen> <seed>`;
- `sheet <gen> <first> <count> --scale 4` → an upscaled PNG contact sheet in
  `build/procgen/<gen>/`, following the CLAUDE.md image rules;
- `range <gen> <metricX> <metricY>` → an expressive-range heatmap PNG plus JSON.

### 7.3 Studio seed browser (generic) [O]

The NMS spec (ref-nms-procgen §4.3) is planet-specific. A generic version makes **every**
generator browsable without new UI code:
- A page lists the registered generators: citygen, each layout builder, game generators.
- **Grid view**: N seeds as `draw()` thumbnails (integer-upscaled) with metric badges; sort and
  filter by metric; failed checks in red.
- **Detail view**: the ASCII dump, the intermediate artefacts of the chain, the metrics, the
  params form (from a param schema), and "open in game" (`?seed=`).
- **Bookmarks** in `seeds/<gen>.json`: `{ seed, version, tags, note, author }`. The studio
  writes them through its dev server; Claude reads them as files. On a version bump, the page
  shows the metric deltas for the bookmarks.
  - This is the curated-seed list of §1.5, and it is owner-facing like verdicts.
  - [O] It is not a verdict. It must not reuse `review.json`.

### 7.4 What goes in first (tick-sized order) [O]

1. `seed` + `grid`: `seedOf`, flood fill, components, Dijkstra map, chokepoints. Extract from
   citygen's `check.ts` where it already has searches. Vectors and tests.
2. `layout` basics: BSP, CA cave, accretion plus loops, Spelunky path plus templates. Port the
   ideas of PixelDen's two dungeon generators.
3. `check` + CLI `sweep`/`sheet`. Point citygen's CLI at the shared runner.
4. `noise` (integer value plus gradient, fBm, ridged, warp, worley), with golden vectors.
5. `grammar` (graph rewrite plus text subset), then `wfc` with blocks.
6. The studio seed-browser page.

### 7.5 PixelDen

- PixelDen is a separate repo with its own pipeline (pixelden-flow.md).
- [O] `@whz/procgen` stays dependency-free ESM, so PixelDen could consume it as a git
  dependency or a vendored copy.
- Replacing mulberry32 in existing games is **not** proposed: it would change every shipped
  seed and daily.
- New PixelDen games would start on the toolkit. That is an owner call (open question 3).

### 7.6 How citygen should evolve [O]

**(a) Districts across the planet: a lattice with boundary contracts.**
- A district is keyed by integer `(dx, dy)` on a plane that wraps as a torus for "planet"
  purposes. A cube-sphere (ref-nms-procgen §3.3) is possible later, but a city-planet seen from
  street level does not need curvature in v1.
- `districtSeed = seedOf(planetSeed, "district", dx, dy)`.
- **Boundary contract**:
  - Every district's perimeter street lines and lane-grid rows are fixed by a hash of the
    *edge* key: `seedOf(planetSeed, "edge-x", dx, dy)` for the east edge, which is also the
    west edge of `(dx+1, dy)`.
  - The two neighbours then agree on where streets cross, without reading each other.
  - Interior streets stay as now.
- **Zoning by low-frequency noise** over `(dx, dy)` picks a district archetype: union core,
  habitat, market, derelict, ancient-heavy.
  - Each archetype is a Min/Max range over citygen's existing params: `megablockChance`,
    `padChance`, `hallChance` and the facade weights. This is the NMS Min/Max pattern
    [S: ref-nms-procgen §1.7].
  - The endless skyline in `sky.ts` then becomes the coarse LOD of real neighbouring districts,
    not a separate fake. Its look is upgraded per threejs-procgen-look §6.
- New check: for each pair of adjacent seeds, the street level and lane networks connect across
  the shared edge. Sweep it over 100 district pairs.

**(b) Interiors: lazy, per building, per floor.**
- `interior(building.seed, floor)` is generated on entry and cached.
- Shadows of Doubt's method [S]:
  - **Address footprints** per floor come from a small *authored* set of floor-plan templates
    per archetype, which is cheap to author as ASCII. SoD draws them by hand.
  - Rooms are placed in priority order (living room, then bathroom…). Each room is tried in
    every free spot and scored on area, corner count (shape) and window access; the best wins.
  - A **hallway rule**: if the entrance is far from a corner, draw a hall toward it, so that no
    room is reachable only through another.
  - Connection rules: anything to a hall; kitchen to living room; one door for bathrooms; no
    entrance into bedrooms.
- Cells use the same grid as the district: SoD's floors are 15×15 tiles of 1.8 m. Ours would be
  a sub-grid of the 4 m tile, e.g. 2×2 per tile.
- Invariant: every room reaches the building's lift or stairs.

**(c) Missions: a graph grammar bound to places.**
- threejs-gameplay §6.2 proposes missions as data with a small step interpreter. This report
  adds where the data comes from:
  - A **mission grammar** (Dormans) produces a graph, e.g.
    `Job → Pickup + Obstacle + Deliver`, `Obstacle → Checkpoint(lock) + Body(key) | Chase |
    Descent(cycle)`.
  - A **binder** maps each terminal to a citygen place by query: band, kind, distance, a
    facade style; for a Body key, a citizen whose day plan passes the lock.
  - The interpreter's step list comes out of that.
- The current `FARES` and `SIGNALS` arrays [S: `src/jobs.ts`] become a text grammar with the
  same voice.
- Story beats from STORY.md are authored mission templates with fixed text (§5.2).
- Check: every generated mission is completable. Simulate the step list on the cell graph
  (reachability plus that each key appears before its lock).

**(d) NPC schedules: precomputed day plans, positions in closed form.**
- Shadows of Doubt precomputes each citizen's day (4–10 trips) before the day starts, and
  re-plans live only for the few citizens who deviate [S].
- Our version:
  - A citizen is `seedOf(districtSeed, "citizen", i)` → home address, work address, two
    favourite places, shift.
  - The plan is a list of `(t0, from, to, mode)` legs on the walk/lift graph, with paths cached
    per address pair.
  - The position at time `t` is a pure function, as for NMS's creatures on paths [S: ref-nms
    §1.9]. Only citizens near Kylo become full actors; this is the simulation LOD of
    threejs-gameplay §8.3.
  - Deviations (Kylo passes into a body; a chase) override the plan for that one citizen.
- Check: every leg is a valid path; no citizen spends the night in a wall.

**(e) Versioning.** Bump `whz-citygen-grid/1` → `/2` with (a), since perimeter streets change
every district. Keep `/1` callable for any build that shipped it (§1.2).

---

## What this means for us

1. **Build `@whz/procgen` in small steps (§7.4), each a task with its own tests.** The first
   two steps (seed/grid, layout) unlock four catalogue games and the citygen work. [O]
2. **New Hope's next generator work, in order:**
   1. the district lattice with boundary contracts (a);
   2. the mission grammar with a binder (c), because it turns today's six fares into endless
      jobs and gives the story beats a home;
   3. citizen day plans (d), which body-passing needs to be interesting;
   4. lazy interiors (b), which Skyline Heist and Case Files need.

   [O]
3. **Keep the two tiers explicit.**
   - The *deterministic tier* (integers, linted, saved, digested): layouts, placement, missions,
     schedules.
   - The *look tier* (floats allowed): noise in shaders, skyline detail, particles.
   - A value crossing from look to gameplay (the `Math.pow` skyline collision noted in
     threejs-lessons-from-refs P2) is a bug. [O]
4. **Authored pieces are content work Claude can do well, as ASCII**: room templates, floor-plan
   templates, mission templates, text grammars, WFC module sets as voxel modules. The studio
   should show them like assets. [O]
5. **Curated seeds are a deliverable.** Every game ships a seeds file. The owner's liked seeds
   are recorded through the studio, never by a session on its own. [O]

## Open questions for the owner

1. Do we build `@whz/procgen` as proposed (a new package under the lint), or grow these modules
   inside citygen first and extract later?
2. Which two or three catalogue concepts (§6) interest you? The first-wave suggestion is #8, #9,
   #3, #10 and #1.
3. PixelDen: should new PixelDen games use the Wallhammer toolkit (a git dependency or a vendored
   copy), or stay independent?
4. New Hope's planet: a wrapping lattice of districts (simpler; recommended for now), or a real
   cube-sphere city-planet seen from orbit?
5. Story binding: may the generator write *flavour* lore (graffiti, rumours) about the Ancestors
   and Psions, as long as it never answers canon's open questions? Or must all lore text be
   yours?
6. Seed bookmarks in the studio: a new owner-facing record next to verdicts (`seeds/<gen>.json`),
   written only by the studio. OK?

## Sources

Accessed 2026-10-14 unless noted. Dates are publication or last-modified where known.

**Repo** (read directly):
- `packages/det/README.md`, `packages/det/src/hash.ts`, `packages/citygen/README.md`,
  `packages/citygen/src/generate.ts`, `packages/citygen/src/text.ts`, `tools/lint/determinism.js`,
  `packages/new-hope-play/README.md`, `packages/new-hope-play/src/jobs.ts`,
  `games/new-hope/README.md`, `games/new-hope/STORY.md`.
- PixelDen: `~/projects/nodejs/pixelden/app/games/shared/rng.ts`, `shared/daily.ts`,
  `dungeon-cast/generator/`, `glyph-depths/dungeon/cave.ts`.

**PRNGs and determinism:**
- bryc, "PRNGs" (public domain): https://github.com/bryc/code/blob/master/jshash/PRNGs.md
- Elite seed twisting (bbcelite.com): https://elite.bbcelite.com/deep_dives/twisting_the_system_seeds.html ;
  https://elite.bbcelite.com/deep_dives/galaxy_and_system_seeds.html (via search)
- MDN, Transferable objects: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects

**Theory and talks:**
- Kate Compton, "So you want to build a generator" (2016): https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator
- K. Cross on Compton's GDC 2017 talk (2017-02-27): https://www.gamedeveloper.com/design/practical-procedural-generation-for-everyone-
- Joris Dormans, "Adventures in Level Design" (PCG 2010): https://www.pcgworkshop.com/archive/dormans2010adventures.pdf
- Smith & Mateas, "ASP for PCG" (IEEE TCIAIG 2011), via search: https://course.ccs.neu.edu/cs5150f14/readings/smith_asp4pcg.pdf
- Parish & Müller 2001 (via search): https://history.siggraph.org/?p=116923 ; Müller et al. 2006 CGA shape: https://history.siggraph.org/?p=113547
- Bridson 2007 Poisson disc (via search): https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf
- Short & Adams (eds.), *Procedural Generation in Game Design* (CRC 2017), via search: https://www.taylorfrancis.com/books/9781138743311
- Compton, Kybartas, Mateas, "Tracery" (ICIDS 2015), via search: https://graphics.tudelft.nl/Publications-new/2015/CKM15

**Boris the Brave:**
- "WFC explained" (2020): https://www.boristhebrave.com/2020/04/13/wave-function-collapse-explained/
- "WFC tips and tricks" (2020, upd. 2025): https://www.boristhebrave.com/2020/02/08/wave-function-collapse-tips-and-tricks/
- "Model synthesis and modifying in blocks" (2021): https://www.boristhebrave.com/2021/10/26/model-synthesis-and-modifying-in-blocks/
- "Dungeon generation in Unexplored" (2021, upd. 2025): https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/
- "Dungeon generation in Diablo 1" (2019, upd. 2025): https://www.boristhebrave.com/2019/07/14/dungeon-generation-in-diablo-1/

**Games:**
- Spelunky modding tutorial (2010): https://www.tinysubversions.com/2010/01/tutorial-modding-spelunkys-level-generator/index.html ;
  gamedev.net talk summary (via search): https://gamedev.net/blogs/entry/2249558-the-full-spelunky-on-spelunky-xbla
- Townscaper (T. Thompson, 2022-04-06): https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making
- Caves of Qud world generation (wiki): https://wiki.cavesofqud.com/wiki/World_generation ; GDC 2018 (via search): https://gdcvault.com/play/1024990/Procedurally-Generating-History-in-Caves
- Brogue level generation (wiki): https://brogue.wiki/wiki/Level_generation
- Cogmind: https://www.gamedeveloper.com/design/complete-level-design-processes-shaping-a-cogmind-experience ;
  ModDB addendum (403, via search): https://www.moddb.com/games/cogmind/news/roguelike-level-design-addendum-procedural-layouts
- Noita (wiki): https://noita.wiki.gg/wiki/World_generation ; Sean Barrett, herringbone Wang tiles: https://nothings.org/gamedev/herringbone/
- Rain World (Unity blog, 2025-09-25): https://unity.com/en/blog/exploring-procedural-design-rain-world
- Shadows of Doubt DevBlog #13 (2019-02-28): https://colepowered.com/shadows-of-doubt-devblog-13-creating-procedural-interiors/ ;
  DevBlog #8: https://colepowered.com/?p=34142
- Minecraft jigsaw block (wiki): https://minecraft.wiki/w/Jigsaw_Block
- Dwarf Fortress (via search): https://en.wikipedia.org/wiki/Dwarf_Fortress
- Hades chambers (fan wiki, 402; via search only): https://hades.fandom.com/wiki/Chambers_and_Encounters
- H. Wolverson, Rust roguelike tutorial (MIT code): https://bfnightly.bracketproductions.com/chapter_27.html ; https://bfnightly.bracketproductions.com/chapter_40.html

**Tools and libraries:**
- Red Blob Games, "Making maps with noise" (2015, modified 2026-09-29): https://www.redblobgames.com/maps/terrain-from-noise/
- mapgen4 (Apache-2.0, pushed 2026-03-29): https://www.redblobgames.com/maps/mapgen4/ , https://github.com/redblobgames/mapgen4
- WaveFunctionCollapse (M. Gumin): https://github.com/mxgmn/WaveFunctionCollapse ; MarkovJunior (MIT): https://github.com/mxgmn/MarkovJunior
- FastNoiseLite (MIT): https://github.com/Auburn/FastNoiseLite ; OpenSimplex2 (CC0): https://github.com/KdotJPG/OpenSimplex2
- Tracery (Apache-2.0): https://github.com/galaxykate/tracery ; clingo-wasm (Apache-2.0): https://github.com/domoritz/clingo-wasm
- ndwfc (MIT): https://github.com/LingDong-/ndwfc ; DeBroglie (MIT): https://github.com/BorisTheBrave/DeBroglie
- Phaser 4 render-textures skill doc: https://unpkg.com/phaser@4.2.1/skills/render-textures/SKILL.md
- npm registry (versions, licences, Phaser 4.0.0 date 2026-04-10): https://registry.npmjs.org/ for simplex-noise, fastnoise-lite, rot-js, delaunator, d3-delaunay, poisson-disk-sampling, wavefunctioncollapse, tracery-grammar, open-simplex-noise, rbush, flatbush, honeycomb-grid, @dgreenheck/ez-tree, phaser, three

## Verification (2026-10-14)

Adversarial fact-check by a second agent, same day. 31 claims picked for decision weight;
sources fetched (WebFetch, npm registry, GitHub API, local PDF text extraction) and repo code
read. Inline marks: `[refuted …]`, `[unconfirmed]`, one `[U → confirmed]`.

### Repo claims (read the code)

Confirmed:
- `@whz/det`: sfc32 with `(seed, stream)` seeding and `Rng.fork(name)` (`src/rng.ts:136`);
  `hash32(x, y, seed)` is three rounds of the murmur3 finalizer `mix32`; `fnv1a32` and
  `Fnv1a64` exist (`src/hash.ts`). The header documents filling the whole state from `hash32`.
- Determinism lint allowlist is exactly `abs ceil clz32 floor imul max min sign trunc`
  (`tools/lint/determinism.js:34`); `**` is banned too.
- citygen: block, lot and hall seeds come from `hash32(x0, y0, blockSeed)` etc.
  (`generate.ts:573,668-680`); `GRID_HASH_FORMAT = "whz-citygen-grid/1"` (`text.ts:16`); the
  README quote "a district that fails is a bug in the generator, not a reason to try another
  seed" is verbatim (`README.md:75`); the nine-stage chain order matches the README; `check.ts`
  holds typed-array BFS searches; params `megablockChance` (20), `padChance` (45), `hallChance`
  (45) and per-archetype facade weights exist; `sweep` CLI exists.
- New Hope: `city.ts` meshes in 16-tile chunks (README); `jobs.ts` has 6 `FARES` and 3
  `SIGNALS`; `?seed=` is set in `main.ts:283`; `sky.ts` exists; STORY.md has the Canon /
  Proposal split; threejs-lessons-from-refs P2 names the `Math.pow`/`Math.hypot` skyline leak.
- ref-nms-procgen sections cited (§1.1, §1.7 Min/Max, §1.9, §3.1, §3.3, §3.10, §4.1, §4.3,
  §5, Worlds Part II "only new systems") exist and say what is claimed. Sibling reports'
  section numbers (threejs-gameplay §6.2/6.3/8.3, threejs-procgen-look §6–8, new-hope-audit
  §2/§4/§8) resolve.
- PixelDen: `dungeon-cast/generator/` and `glyph-depths/dungeon/` each have `bsp.ts`,
  `corridors.ts`, `rng.ts`; both `rng.ts` are mulberry32 (`SeededRng`, the second "copied from
  dungeon-cast"); `shared/daily.ts` is FNV-1a over the UTC `YYYY-MM-DD`; glyph-depths CA runs
  5 iterations with "≥5 walls → wall". The "57 files" count: a grep for
  `mulberry32|SeededRng|shared/rng` imports gives 58 today; close enough.

Refuted / corrected:
- glyph-depths seeds **45 % floor**, not 45 % wall (marked in the §2 table).
- "A citygen district is 48×48×20" is New Hope's call in `world.ts:31`; citygen's default is
  32×32×16 (marked in §4.2).

### Web claims

Confirmed against the primary source:
- bryc PRNGs page: speeds (sfc32 7.45 M, mulberry32 10.44 M, splitmix32 10.48 M,
  xoshiro128** 6.93 M, jsf32 6.18 M), sfc32 passes PractRand and BigCrush, mulberry32 "appears
  to skip a third of all 32-bit values" (author's later note), xoshiro128** weak low bits and
  LC/binary-rank failures, jsf32 32-bit seed, splitmix32 from fmix32, seed-the-whole-state
  advice, public domain.
- Elite (bbcelite): three 16-bit seeds, Tribonacci twist, four twists per system, one-bit
  byte roll per galaxy, 8×256 = 2,048 systems.
- Diablo 1 (Boris, 2019, shown 2025-02-28): 40×40, catacomb rooms 4–9, halls 1–3, lockout and
  stairs restarts, 700 / 600 floor minimums, one set piece, predungeon, marching squares vs 3×3
  patterns, lava rivers need a bridge.
- Unexplored (Boris, 2021, upd. 2025-02-28): 24 cycle types, ~5,000 rules, ~50 modules, 5×5
  grid, ~40 loop rules, ×2 then ×5, key→lock edges.
- Brogue wiki: 600 attempts, 99 rooms, 80 % corridor+room, 60 % doors, lakes 55 % /
  B5678/S45678 / 5 iterations / largest blob, passability before placing lakes, loops only
  between rooms >2 apart, treasure machines at depths 3, 7, 11…, bridges after connectivity,
  checkerboard fix, chokepoint map before machines; page carries a "[verify]" flag.
- Spelunky (tinysubversions 2010): 4×4, 10×8, "about 30" templates, "2" 1-in-10 pushblock,
  "7" spike 1-in-3 in the original, "5" one of 16 5×3 obstacles. The path/exit rule is not on
  that page (the report correctly cites GMTK as secondary).
- Minecraft jigsaw: levels max 20, raised from 7 in 23w45a (Java 1.20.3).
- Townscaper/Bad North (Thompson, Game Developer, 2022-04-06): "over 300 tiles" for Bad North,
  ~500 is an explicit estimate, hard/soft constraints, navigability check and restart,
  relaxed hex→quad grid, decoration after structure, the "larger shapes predictable" quote,
  transitions, corner modules via marching cubes, long thin structures fail.
- Boris "WFC tips" (2020, upd. 2025): biome per level (Bad North), regional tile sets (Caves
  of Qud), fixed entrance/exit tiles, path constraint, weights. "Modifying in blocks" (2021):
  restart only the failed block, fall back to known-good tiles.
- Shadows of Doubt DevBlog #13 (2019-02-28): 15×15 floors, 1.8 m tiles, hierarchy, scored
  room placement (area, corners, windows), hallway rule, connection rules, priority order.
  DevBlog #8 (2018-09-15): 4–10 journeys per citizen, precomputed before the day (10–15 s),
  only a handful re-planned live. Note: #13 says address footprints are laid out in an editor
  tool, which the report calls "hand-drawn"; same meaning, looser wording.
- Caves of Qud wiki: five generated sultans plus Resheph fixed, 2–3 regions per period,
  shrinking location counts; Grit Gate pre-built, Golgotha/Tomb interiors generated. GDC Vault
  2018 (Grinblat): "generating historical events and rationalizing them after the fact" is in
  the official description. Bucklew's WFC talk exists (GDC 2019, "Tile-Based Map Generation
  using Wave Function Collapse in Caves of Qud").
- Dormans 2010 (PDF text extracted locally): both grammar examples (spelled "Threshold
  Guardian", "Mini-Boss", "Level-Boss"), tight vs loose coupling edges, the kihon →
  kihon-kata → kata → kumite structure, shape grammar per symbol.
- Compton 2016 essay: oatmeal, perceptual uniqueness vs differentiation, artist-in-a-box
  (Spore), distribution / deck shuffle, list properties and constraints. Cross's GDC 2017
  write-up (2017-02-27): fanfic test, Spore planet seed whitelisting "faster than writing a
  proper algorithm", "barnacling" (medium things next to big things). The "so big things read
  as intentional" gloss is the report's, not the article's.
- Wolverson ch. 27: Dijkstra-map cull (unreachable floor → wall), exit at the farthest tile,
  snapshots; doors are 4.18 = chapter_40; MIT.
- Red Blob (modified 2026-09-29): octaves 1/2/4 with 1/½/¼, normalise by the sum,
  `pow(e * fudge, exponent)` with fudge 1.2 in the demo, separate seeds, ridged formula and
  previous-octave weighting.
- Bridson 2007 (PDF text extracted): "typically k = 30"; linear time.
- MDN transferables: zero-copy, detached buffer with `byteLength` 0, transfer `.buffer`.
- Herringbone (nothings.org): 227 patterns; the page says results "less obviously lie on a
  grid", which the report compresses to "hides the grid".
- Dwarf Fortress (Wikipedia): elevation, rainfall, drainage, temperature (plus minerals) →
  biomes → erosion → rivers → history years.
- Rain World (Unity blog, 2025-09-25): relation tables, PreyTracker / ThreatTracker /
  DenFinder, room-attractiveness tool.
- npm registry, 2026-10-14: simplex-noise 4.0.3 MIT, fastnoise-lite 1.1.1 MIT, rot-js 2.2.1
  BSD-3-Clause, delaunator 5.1.0 ISC, d3-delaunay 6.0.4 ISC, poisson-disk-sampling 2.3.1 MIT,
  wavefunctioncollapse 2.1.0 MIT, tracery-grammar 2.8.4 ISC, open-simplex-noise 3.0.0
  Unlicense, rbush 4.0.1 MIT, flatbush 4.6.2 ISC, honeycomb-grid 4.1.5 MIT,
  @dgreenheck/ez-tree 1.1.0 MIT, phaser 4.2.1 latest, phaser 4.0.0 published 2026-04-10. All
  as stated. GitHub API: mapgen4 Apache-2.0 (pushed 2026-03-29), MarkovJunior MIT, DeBroglie
  MIT, ndwfc MIT (last push 2020-05-21), FastNoiseLite MIT, OpenSimplex2 CC0-1.0, clingo-wasm
  Apache-2.0 (also on npm as 0.6.0), tracery (galaxykate) Apache-2.0. Phaser 4.2.1
  `skills/render-textures/SKILL.md` exists and has a "Procedural Generation" section.

Refuted / corrected (marked inline):
- The Boris "rarely generates large scale structures" is a paraphrase presented as a quote.

Unconfirmed (marked inline):
- Noita "herringbone": the wiki says Wang tiles only.
- Cogmind 200×200, ~two dozen map types, tunnelling parameters, "some fail many times": only
  the ModDB page (403) would carry these; the Game Developer article is about the hand-made
  Exiles map and confirms only the 51/12/12/25 % world states.
- Rain World "paper doll".
- Elite's stranded-player claim: supported by Game Developer's Elite history, not by the
  cited bbcelite page.

Not checked (secondary or well-known): GMTK Spelunky transcript, Hades fan wiki (already [U]),
Smith & Whitehead 2010, Smith & Mateas 2011, Parish & Müller 2001, Müller 2006, Short & Adams
2017, the Tracery ICIDS paper, NMS/Valheim/Teardown (deferred to ref-nms-procgen), the GitHub
licence of mxgmn/WaveFunctionCollapse (API reports NOASSERTION; irrelevant, nothing is
copied from it).

### Gaps that matter for decisions

- None of the refuted items changes a recommendation. The CA defaults (§2) should be read as
  "45 % floor / 55 % wall" when `caCave` is specified.
- The npm `tracery` package (1.0.3, MIT, 2015) is not galaxykate's repo; the report's
  "port, don't depend" stance already sidesteps this.
- The Dormans grammar examples in §2.1 are accurate but the original spells the symbols
  "Threshold Guardian", "Mini-Boss", "Level-Boss".
