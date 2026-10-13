# @whz/citygen

New Hope's city generator (D28, D29): one district of the city-planet from a seed, as a grid of
cells. A cell is one tile by one storey (`CELL` in `assets/new-hope-lib/style.ts`), so the grid
maps one to one onto the building kit's voxel modules. Pure and deterministic: integers only,
no I/O, no clock, under the determinism lint; it depends only on `@whz/det` and runs in Node
and the browser. The output becomes sim data later, so it follows the rules of
[docs/sim.md](../../docs/sim.md).

```ts
import { checkDistrict, generateDistrict, gridHash, sliceAscii } from "@whz/citygen";

const district = generateDistrict(2);              // 32 x 32 tiles x 16 levels
checkDistrict(district).ok;                          // true, always (a false is a bug here)
gridHash(district);                                  // "01b9d7da0ee07d96"
sliceAscii(district, district.params.bands.streets[0]); // the street level as text
```

## API

| API | What it does |
|---|---|
| `generateDistrict(seed, params?)` → `District` | The district of an unsigned 32-bit seed. `params` are merged over `DEFAULT_PARAMS`. |
| `District` | A `CellGrid` (`width`, `depth`, `levels` and four flat arrays `kind`, `dir`, `building`, `facade`, indexed `(z * depth + y) * width + x`) plus `seed`, the resolved `params`, `streets` (`columns` and `rows`: the first tile of each street line), `buildings` and the number of `walkways`. |
| `Building` | `id` (the value in `building`), `archetype`, `style` (its facade style), `lot`, `tiers` (`{ rect, base, top }` from the bottom up, each inside the one below), `roof` (the level of the roof deck), `seed`. |
| `cellAt(grid, x, y, z)` → `{ kind, dir, building, facade }` | One cell by name; outside the grid it is `empty`. `cellIndex`, `cellPos`, `inGrid` work on indices. |
| `checkDistrict(grid)` → `DistrictCheck` | The invariants below: `ok`, the walkable cells and their groups, the lanes and their networks, the pads without a lane, and at most 20 `problems` naming cells as `kind@x,y,z`. |
| `forEachWalkNeighbour`, `reachFrom`, `walkConnected`, `connectedAll` | The movement rules on foot and searches over them, for a player or a path finder. |
| `gridHash(grid)` | FNV-1a 64 of the grid (format `whz-citygen-grid/1`, the size, then kind, direction, building and facade of every cell). |
| `sliceAscii(grid, level, { facade? })`, `legend()`, `districtStats`, `formatStats` | Text for agents and tests. |
| `resolveParams`, `DEFAULT_PARAMS`, `bandsFor(levels)`, `bandOf` | The parameters; `ParamsError` on a bad value. |
| `@whz/citygen/node`: `runCityCli` | The command line. |

## Cells

A walkable cell is a place a person stands on; its floor is the bottom of the cell.

| Kind | Char | What it is | `dir` |
|---|---|---|---|
| `empty` | `.` | Air. | |
| `solid` | `#` | A building's closed volume; it has a `building` and a `facade` style. | |
| `deck` | `=` | A walkable slab: roofs, terraces on setbacks, podium decks, undercity halls. | |
| `street` | `:` | The old ground at the street level: streets, alleys, plazas. | |
| `walkway` | `-` | A bridge across the air between two buildings. | |
| `stairs` | `^ > v <` | Climbs one storey toward `dir`. | the side it climbs to |
| `lift` | `H` | One storey of a lift shaft. | the side its door opens to |
| `pad` | `P` | A landing pad on a roof. | |
| `ruin` | `%` | The undercity's stone: Ancestor and Psion ruins, rubble. | |
| `lane` | `~` | Sky-lane air, for flying cars. | |

Facade styles of `solid`: `union`, `habitat`, `market`, `derelict`, `ancient` (`--facade`
shows them as `u h m d a`). A building has one style; its street-level storey may be `market`
(shopfronts) and, for `habitat`, its storeys from the upper band up may be `union` (up is the
Union). A megablock's podium is `market`.

Directions: `x` grows to the east, `y` to the south, `z` (the level) upward; `dir` is `n e s w`
(0..3).

## Moving on foot

The same rules a player and a path finder follow (`forEachWalkNeighbour`):

- `street`, `deck`, `walkway` and `pad` connect to each other side by side on one level.
- Stairs at level `z` climbing toward `d` connect to the flat cell behind them on level `z`
  (the low landing) and to the flat cell in front of them on level `z + 1` (the high landing).
  The cell above stairs is open (headroom).
- A lift connects to the lift cells straight above and below it, and through its door to the
  flat cell on the door side.

Lanes are air: they connect to the lanes beside, above and below them.

## Invariants

`checkDistrict` holds for every seed; the tests run 200 seeds at the default size and more at
other sizes and full densities. A district that fails is a bug in the generator, not a reason
to try another seed.

- Every walkable cell reaches every other one on foot.
- Every stairs has both landings and its headroom.
- Every pad touches a lane; the lanes are one network.
- A `solid` cell has a building and a facade; no other cell has a facade or (except stairs and
  lifts) a direction.

## Params

| Param | Default | |
|---|---|---|
| `width`, `depth`, `levels` | 32, 32, 16 | Tiles east, tiles south, storeys (12..256, 12..256, 10..64). |
| `bands` | see below | Inclusive level ranges from the bottom up, covering every level in order. `bandsFor(levels)` scales the default. |
| `streetWidth` | 2 | Tiles across a street (2..4). |
| `blockMin`, `blockMax` | 7, 11 | The side of a block between two streets. |
| `megablockChance` | 20 | Percent of blocks of 7 x 7 or more that are one megablock. |
| `walkwayChance` | 4 | Percent of walkway candidates built (there are many candidates). |
| `walkwayMaxSpan` | 6 | The longest walkway, in tiles of air. |
| `padChance` | 45 | Percent of roofs with a pad. |
| `canyonLaneChance` | 30 | Percent of street lines with a sky lane down in their canyon. |
| `hallChance`, `deepHallChance` | 45, 40 | Percent of street segments with an undercity hall under them, and of halls with a deeper one. |

The bands of [games/new-hope/README.md](../../games/new-hope/README.md) at 16 levels:

| Band | Levels | What the generator puts there |
|---|---|---|
| `undercity` | 0-2 | Ruin, with halls under some street segments (level 2) and deeper halls (level 1). |
| `streets` | 3-4 | The street level (3): streets, alleys, plazas, ground storeys, stairs onto podiums and down into the halls. Podium decks (4). |
| `middle` | 5-8 | Towers, terraces, low roofs, walkways. |
| `upper` | 9-11 | Towers, walkways, roofs, sky lanes down in some street canyons. |
| `roofs` | 12-13 | The highest roofs and their pads; no roof deck is above level 13. |
| `lanes` | 14-15 | The lane grid: lanes over the street rows on level 14, over the street columns on level 15. |

## How a district is made

Seeds below the district seed come from position, not from one long stream (the No Man's Sky
method in [docs/references.md](../../docs/references.md)): a street line's block size is a hash
of its index, a block's seed a hash of its corner, a lot's seed a hash of its corner, so a block
regenerates alone and switching a later feature off leaves every building as it was (tested).

1. **Streets**: street lines at hashed spacings along both axes; the blocks between them.
2. **Lots**: a block is a megablock, or is cut into lots by one-tile alleys (guillotine cuts,
   so every alley reaches a street and every lot touches one).
3. **Buildings** by archetype: `slab` (low to middle), `tower` (tall), `stepped` (two or three
   tiers, each one tile in on every side, terraces on the setbacks), `megablock` (a one-storey
   podium over the whole block with a deck on it, and a tower in the middle). A roof deck on
   top of each.
4. **Lifts**: one per tier, from the street (or the terrace the tier stands on) up to the next
   deck.
5. **Podium stairs**: stairs cut into a megablock's edge, from the street up onto its deck.
6. **Pads** on some roofs, each with a lane straight up to the lane level.
7. **Lanes**: the grid over the streets above every roof, and some lanes down in street canyons
   in the upper band with a shaft up to the grid.
8. **Walkways** across the air between two buildings on the middle and upper bands. An end on a
   deck or on a lift whose door faces it joins as it is; an end on a facade turns the column
   below it into a lift shaft down to the street under the walkway.
9. **The undercity**: halls under some street segments, entered by stairs in a street crossing,
   and deeper halls under some of them.

A step that opens a floor (a stairwell through a podium deck, a street or a hall floor) checks
that the cells the opened one joined still reach each other, and undoes that one change
otherwise.

## Command line

```sh
./dev npm run city -- slice <seed> --level <n> [--facade]   # one level as ASCII, north at the top
./dev npm run city -- slice <seed> --all [--facade]         # every level, top down
./dev npm run city -- stats <seed>                          # counts per kind and band, checks, grid hash
./dev npm run city -- sweep <first> <count>                 # generate and check a run of seeds
```

Every command takes `--width`, `--depth` and `--levels`. Exit codes: 0 ok, 1 a district failed
its checks, 2 wrong usage.

Seed 2, the street level (3): streets `:`, holes `.` over the stairs down into the undercity,
ground storeys `#` with lifts `H`, a megablock (top left) with stairs `v >` up onto its podium.

```text
:::::::::::.::::::::::::::::::::
:::::::::::::::::::::::::.::::::
::###v#####:::::::::::::::::::::
::#########:::##H##::#H:::H####:
::>########:::#####::##:::#####:
::#########:::####H::H#:::#####:
::#########:::####H::#H:::#####:
::#########:::#####::#H:::H####:
::#####H###:::::::::::::::##H##:
:.:::::::::.::::::::::::::::::::
::::::::::::.:::::::::::.:::::::
::####H####::::::::###H#::##HH##
::#########:::##H::H####::#H####
::#########:::H##::#####::::::::
::#########:::###::#####::::::::
:::::::::::::::::::#####::#HH###
::H#####H##:::####:#####::######
::#########:::####:#####::######
::#########:::H###:H####::######
::H########::::::::####H::H#####
:::::::::::.:::::::::::::.::::::
::::::::::::::::::::::::.:::::::
::H####::::::###Hvv#####::::::::
::#####:HH#::###########::#####:
::####H:H##::###########::H####:
::H####:###::##########<::::::::
::#####:###::###########::::::::
:::::::::::::###########::H#####
:::####::::::###########::######
:::###H:H##::###########::######
:::####:###::###########::######
:::::::::::::###########::######
```

Seed 2, a middle level (6): towers, a roof deck with a pad (left), walkways `-` across the
streets and alleys, each ending at a lift door or a deck.

```text
................................
................................
................................
..............##H##..#H...H####.
.....###......#####..##...#####.
.....###......####H..H#...#####.
.....H##......####H..#H...#####.
..............#####..##...#####.
..........................##H##.
............................-...
............................-...
...................###H#..##HH##
..............##H..H####..######
..............H##..#####........
..............###..#####........
...................#####..##H###
..======H==...####.#####..######
..P========...####.#####..######
..=========...H###.H####..######
..=========........####H--H#####
.........-......................
.........-......................
..#####..-......................
..#####.HH#...............#####.
..####H-H##....####H#.....H####.
..H####.###....######...........
..#####.###....######...........
...............######.....H#####
...####........######.....######
...###H.H##...............######
...####.###...............######
..........................######
```

## Checks

`./dev npm run check -- @whz/citygen`: types, lint, and the tests: golden grid hashes of four
seeds and identical grids on two runs, the invariants over 200 seeds plus other sizes and full
densities, the checker finding districts broken on purpose, the command line, and the ASCII of
every level of a small district (`test/golden/district-7-16x16x12.txt`, rewritten by running
that test with `UPDATE_GOLDEN=1`). A golden hash changes only in a commit that changes the
generator on purpose and says why.

## Limits

- One district; its edges are the grid's edges (no streaming, no neighbours).
- Building interiors are closed: a walkway that lands on a facade gets its own lift shaft down
  to the street, so busy facades have several shafts.
- The level below the deepest halls is solid ruin.
