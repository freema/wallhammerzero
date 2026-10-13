# new-hope: the assets of New Hope

The voxel assets of New Hope (D28, D29; the concept is in
[games/new-hope/README.md](../../games/new-hope/README.md)): the building kit the city is made
of, the characters and the vehicles. Everything here is a voxel program baked to 2:1 iso
pixel art by `packages/voxel-kit`, on the palette `assets/palettes/new-hope.json`, and imports
its scale from `assets/new-hope-lib/style.ts`: a cell is one tile of 4 x 4 voxels (a 16 x 8
diamond) by one storey of 12 voxels (24 px). Each asset's `NOTES.md` has what reads, the
passes and the time. In the studio: `/gallery?pack=new-hope`.

## Building kit

`assets/new-hope-lib/kit.ts` is the kit: one module per cell kind, each a function that sculpts
one cell into a `VoxelBuilder` at a voxel origin,

```ts
buildCell(b: VoxelBuilder, origin: Vec3, spec: CellSpec): void
```

where `spec` is `{ kind, seed, style?, exposed?, roof?, storey?, dir?, lit?, frame?, open? }`
(documented at the top of the file). `composeCells(b, layout)` builds a whole layout of cells
and derives `exposed`, `roof` and `storey` from the neighbours; `kitModel(grid)` turns the grid
into one model of one part. `assets/new-hope-lib/kit-asset.ts` defines the module assets.

| Cell kind | Asset | What it is |
|---|---|---|
| `solid` | `kit-solid-union`, `-habitat`, `-market`, `-derelict`, `-ancient` | A building's volume: a facade on every exposed side, a closed core, a parapet and roof furniture when `roof`. Union: concrete and tall glass, cold light, blue floor lines. Habitat: grey flats, warm windows, AC units, laundry, plants. Market: shopfront, awning and neon sign at `storey` 0, flats with vertical neon above; neon flickers (`flicker` clip). Derelict: dark, recessed windows, rust, planks. Ancient: smooth stone, Psion slits and veins. |
| `deck` | `kit-deck` | A walkable steel plate; a dark trim with a yellow mark per cell along drops. |
| `street` | `kit-street` | Wet asphalt, a raised kerb on sides that are not street, a lane dash, puddles with neon reflections. |
| `walkway` | `kit-walkway` | A bridge slab with a dashed cyan edge light, mid posts and a knee-high rail along drops. |
| `stairs` | `kit-stairs` | A landing and three steps of 3 voxels climbing toward `dir`. |
| `lift` | `kit-lift` | A glass shaft cell with steel posts and doors on `dir`; clips `closed` and `open` (lit cabin). |
| `pad` | `kit-pad` | A dark plate with yellow dashes and corner lights (green, cyan or pink by seed); clip `blink`. |
| `ruin` | `kit-ruin` | Ancestor stone floor with a broken column, a wall with a doorway, or rubble, and Psion crystal. |
| `empty`, `lane` | none | Draw nothing. |

`kit-sheet` composes all of them into a small tower (undercity, street, a market + Union
building, lift, stairs, deck, walkway, roof pad) baked as one grid. Every module asset bakes
alone in the four `ISO_FACINGS` with all sides exposed by default (param `exposed` and the
presets show the others), three variant seeds, and a 2 px margin with no ground shadow.

**What reads (at 4x and in the kit sheet):** the five facade styles are told apart at a
glance, at 1x too (pale glass, warm flats, neon band, dark, sand and violet). Storeys of two
styles stack with no seam and no outline between cells: one grid, one part, so the baker
draws contours only where depth jumps. Market, Union, ancient and the pad carry the most at
game size. The lift shaft, the stairs (from the front) and the ruins read.

**What does not:** details of 1 to 2 voxels (AC units, laundry, the lane dash, puddles,
broken against dark glass in derelict) read as texture, not as things. The walkway alone is a
cluttered 16 px piece and reads as a bridge only composed. A street cell alone with all sides
exposed is a kerb ring, not a road. Windows are flush with the wall: a one-voxel recess loses
half the window behind the corner pier (2 px slits), so only derelict and ancient keep
recesses. A one-cell staircase is steep (3 up per 1 forward).

**What the generator (and the mockup) must know:**

- **Names.** The cell kinds and styles are `CELL_KINDS` and `FACADE_STYLES` in `kit.ts`, the
  same strings as the generator's. Sides are `"+x"`, `"+z"`, `"-x"`, `"-z"` (the axis a side
  faces); in the facing `sw` the camera sees +z on the left and +x on the right.
- **Coordinates.** Cell (cx, level, cz) sits at voxel `(cx·4, level·12, cz·4)`. Every walkable
  surface is the top of a one-voxel slab: a character stands at `level·12 + 1`.
- **What a layout cell carries** (`LayoutCell`): `kind`; for `solid` a `building` id (cells of
  one id join with no facade between them, also across styles) and a `style`; `dir` for
  `stairs` (the side it climbs toward), `lift` (the door side) and `street` (its axis);
  optionally a `seed` (else derived from position) and `open` for a lift.
- **Exposure is derived, not given:** a solid's side is exposed when the neighbour is not the
  same building; a street's when the neighbour is another kind (beyond the layout's edge a
  street goes on); a pad's when the neighbour is not pad; a deck's and a walkway's when the
  neighbour is a drop (`empty`, `lane` or beyond the edge). `roof` is set when the cell above
  is not the same building; `storey` counts the building's cells below (market shops are at
  0, so a market building should start at a walkable level).
- **Stairs** at (cx, level, cz) with `dir` arrive on the cell one step toward `dir` at
  `level + 1`, which must be walkable; the cell above the stairs should stay empty.
- **Lifts** stack: put a lift cell on every level of the shaft, doors toward the walkable side.
- **Pads** sit on the level above a roof; the building below still draws its parapet.
- **Grid limit:** a `VoxelGrid` is at most 128 voxels per axis, so one bake holds at most
  32 x 10 x 32 cells. A district of 16 levels (192 voxels) must be baked in slices of levels
  (which the cut-away needs anyway) or the limit raised in `packages/voxel-kit`.
- **Determinism:** a module depends only on its spec (`checkOffsetInvariance` proves it at
  load for every module), so a cell looks the same alone and anywhere in a district.

## Characters and vehicles

Shared rigs in `assets/new-hope-lib/`: `people.ts` (characters) and `vehicles.ts` (hover cars). Each asset's `gen.ts` is only a look built from params and the seed.

**People** (`kylo`, `union-guard`, `colonist`, `scavenger`): a 4 x 8 x 4 voxel rig, which fits under a storey with headroom.
- Proportions: legs 3, torso 3, head 2 x 2 x 2, an arm of 1 x 3 x 2 on each side.
- The head is kept small so a person does not read as spike-c's mushroom.
- Clips: `idle` (2 frames), `walk` (4 x 140 ms) and `run` (4 x 100 ms), in the four `ISO_FACINGS`. Every pose is a voxel offset, no rotation.
- At this scale people are read by silhouette and colour; faces belong to portraits.
- The facing reads from the face row: skin, a visor or goggles on the front.
- Colour ownership keeps the groups apart: `red` is Kylo's alone, `union` the guards', `rust` the scavengers'. Colonists never wear these three.
- Kylo's silhouette is his own: a long coat flared to the width of the shoulders and a collar as tall as his head. Everyone else narrows to two legs.

**Hover cars** (`taxi`, `union-cruiser`): a 4 x 7 x 8 car (a 1 x 2 tile footprint) in a 4 x 9 x 8 box. It hovers one voxel up and bobs one more.
- Front: cold white headlights, a long bonnet and a leaning windscreen. Back: pink tail lights and a short boot.
- The underglow is a flat neon strip along the skirt. Its light on the ground is the contact shadow recoloured to the neon's dim slot, so it stays put while the car bobs.
- Clips: `idle` (4 frames: the bob with the glow pulsing) and `fly` (4 frames, held up, lights blinking).
- The taxi is `paint` yellow with a lit roof sign. The cruiser is Union blue with a pink/cyan light bar that swaps sides in `fly`.

What the generator and the mockup must know:
- A person stands on one tile, with the pivot at the centre of the ground diamond.
- A car covers 1 x 2 tiles along its length, which runs along +z in facing `sw`.
- Neither casts light on the scene beyond its own frame.
