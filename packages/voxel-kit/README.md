# @whz/voxel-kit

Voxel models as programs, and the software baker that turns them into 2:1 isometric pixel art
(D15, D18, D20). A model is built by a short program, never stored as an array of voxels; the
baker runs on the CPU with integers only, so it works in Docker without a GPU (D16) and gives
the same bytes everywhere. **The output is an asset-kit `IndexedBuffer`: a voxel model is an
ordinary asset.** Its `gen.ts` builds a model and returns `bakeIso(model, { facing, pose })`
from `render`; the CLI, the lints, the review sheets and the verdicts work unchanged.

```ts
import { defineAsset, parsePalette } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import { bakeIso, box, CARVE, defineModel, ISO_FACINGS, isoFrame, outlineSlots, VoxelBuilder } from "@whz/voxel-kit";
import type { Material, VoxelModel } from "@whz/voxel-kit";
import paletteJson from "../../palettes/voxel-example.json" with { type: "json" };

const palette = parsePalette(paletteJson);
const N = 8;
// Around the projection: the contact shadow reaches 4 px past the left and right corners of
// the crate, and 1 px stays empty.
const MARGIN = 5;
const FRAME = isoFrame([N, N, N], MARGIN);

function buildCrate(seed: number, braces: boolean): VoxelModel {
  const b = new VoxelBuilder(palette, [N, N, N]);
  b.sculpt([
    // A block of frame wood, then a panel carved one voxel deep into five of its faces. The
    // block inside shows through the panels, so it is painted as lighter planks below.
    { a: [0, 0, 0], b: [N, N, N], c: ["wood", 2] },
    { a: [1, 1, 0], b: [N - 1, N - 1, 1], c: CARVE },
    { a: [1, 1, N - 1], b: [N - 1, N - 1, N], c: CARVE },
    { a: [0, 1, 1], b: [1, N - 1, N - 1], c: CARVE },
    { a: [N - 1, 1, 1], b: [N, N - 1, N - 1], c: CARVE },
    { a: [1, N - 1, 1], b: [N - 1, N, N - 1], c: CARVE },
  ]);
  b.paint(box([1, 1, 1], [N - 1, N - 1, N - 1]), "wood", 3);
  // The planks get their grain from the seed: single voxels one ramp step up or down.
  b.jitter(box([1, 1, 1], [N - 1, N - 1, N - 1]), { seed, chance: [1, 8] });
  if (braces) {
    // A diagonal brace across each side panel, painted on the planks two ramp steps darker.
    // The seed decides which way the braces lean.
    const lean = createRng(seed, "brace").chance(1, 2);
    // Two voxels thick: on the 2:1 grid a one-voxel diagonal that falls toward the near edge
    // breaks into dots (a step is 2 px across and 3 px down), and every brace is seen that way
    // from one of the two facings that show it.
    const brace = (across: number, y: number): Material | null => {
      const off = (lean ? y : N - 1 - y) - across;
      return off === 0 || off === 1 ? ["wood", 1] : null;
    };
    b.sculpt([
      { a: [1, 1, N - 2], b: [N - 1, N - 1, N - 1], c: (x, y) => brace(x, y), paint: true },
      { a: [1, 1, 1], b: [N - 1, N - 1, 2], c: (x, y) => brace(x, y), paint: true },
      { a: [N - 2, 1, 1], b: [N - 1, N - 1, N - 1], c: (_x, y, z) => brace(z, y), paint: true },
      { a: [1, 1, 1], b: [2, N - 1, N - 1], c: (_x, y, z) => brace(z, y), paint: true },
    ]);
  }
  // Steel caps on the two top corners of the front (+z) side tell the facings apart.
  b.sculpt([
    { a: [0, N - 1, N - 1], b: [1, N, N], c: ["steel", 2], paint: true },
    { a: [N - 1, N - 1, N - 1], b: [N, N, N], c: ["steel", 2], paint: true },
  ]);
  return defineModel({
    size: [N, N, N],
    palette,
    parts: [{ name: "crate", grid: b.grid, pivot: [N / 2, 0, N / 2] }],
    budget: N * N * N,
    tile: [N, N],
  });
}

export default defineAsset({
  id: "examples/voxel-crate", // = its folder under assets/
  kind: "sprite",
  size: FRAME.size, // 2 * (8 + 8) by (8 + 8) + 2 * 8 pixels, plus the margin
  pivot: FRAME.pivot, // the centre of the ground diamond
  palette,
  clips: { idle: { frames: 1, durations: 1000 } },
  facings: ISO_FACINGS,
  params: {
    braces: { type: "bool", default: true, description: "A diagonal brace across each side panel." },
  },
  presets: { plain: { braces: false } },
  variantSeeds: [1, 2, 3],
  // The lit rim of a baked model is the darkest step of the ramp it touches, not ink.
  lint: { outlineSlots: outlineSlots(palette, ["wood", "steel"]) },

  render({ params, seed, facing }) {
    return bakeIso(buildCrate(seed, params.braces), { facing, margin: MARGIN });
  },
});
```

The other example, `assets/examples/voxel-chibi/gen.ts`, is a character: six parts with pivots,
an idle and a walk made of poses, and a face stamped after the bake.

## Writing a model

**Grid.** `VoxelGrid`: `nx × ny × nz` palette indices, 0 = empty, `y` up, the front of a model
looks along `+z`. `get` / `set`, `count`, `bounds`, `clone`, `equals`, `rotatedY(quarterTurns)`
(a permutation: four quarter turns give the identical grid), `mirroredX`, and `slice(y)`: one
layer as text, for reading a model without an image. Everything is integers; a float throws.

**Builder.** `new VoxelBuilder(palette, size)`; every method returns the builder, `.grid` is
the result.

| Method | What it does |
|---|---|
| `sculpt(boxes)` | A list of boxes `{ a, b, c }` applied in order (`a` inclusive, `b` exclusive). `c` is a material, `CARVE`, or a function `(x, y, z) => material \| CARVE \| null`. `paint: true` recolours only voxels that exist. A box that leaves the grid throws and names its position in the list. |
| `fill(region, material)`, `carve(region)` | One-box sculpts. |
| `paint(region, ramp, step)` | Recolours existing voxels with a step of a ramp (0 = darkest). |
| `jitter(region, { seed, chance })` | Texture without new colours: some voxels move one step up or down **their own ramp**, chosen by a hash of position and seed. |
| `mirrorX()` | Copies the low-x half, mirrored, onto the other half. Write one side, mirror, then add what is one-sided. |

A **material** is a slot name (`"wood.2"`), a palette index, or `[ramp, step]`. A **region** is
a box, or a shape from `box`, `ellipsoid(a, b)`, `roundBox(a, b, radius)` and
`capsule(from, to, diameter)`: a voxel is in a shape when its centre is.

**Model.** `defineModel({ size, palette, parts, ... })`. `size` is the box every pose must stay
in; it fixes the size of the sprite. A part is `{ name, grid, at, pivot }`: `at` is the model
voxel its corner sits on, `pivot` the joint it turns around. Parts are stacked in the order
they are listed: a later part overwrites an earlier one. Options: `ramps` (the ramps to shade
along; all of the palette's by default), `flatSlots` (slots that are in no ramp and are drawn
unshaded on purpose), `budget` (voxels; 4096 by default), `symmetric`, `tile: [x, z]`, `poses`.

**Poses.** A pose maps part names to `{ offset, rotate: { axis, angle } }`. An offset is whole
voxels. A rotation is for small swings: the part is turned around its pivot and **re-voxelised**
(every voxel takes the nearest voxel of the original), so a pose is again a crisp voxel model.
Angles are in `TURN` units; write `degrees(30)`. Quarter turns are exact.

## The bake

`bakeIso(model, options)` returns one frame. `bakeIsoLayers` returns the frame with the layers
it was made from (colour, base colour, depth, part, face per pixel), for tests and tools.

1. **Assemble**: the posed parts become one grid.
2. **Facing**: `ISO_FACINGS` = `sw`, `se`, `ne`, `nw`, named by where the model's front points
   on screen. Each is a quarter turn of the grid: nothing is resampled.
3. **Project**: `screen.x = 2·(x − z)`, `screen.y = (x + z) − 2·y`. Every visible face is
   stamped as a fixed block: the top 4 × 2 pixels, each side 2 × 2. One voxel is 4 × 4 pixels;
   a model of `nx × ny × nz` voxels is a sprite of `2·(nx + nz)` by `(nx + nz) + 2·ny`. The
   nearer voxel wins, and of two faces at the same depth the top one.
4. **Light by ramp steps**, never a new colour: the top is the voxel's colour + 1 step, the
   left side + 0, the right side − 1. **Ambient occlusion** takes exactly one more step off the
   pixels of an occluded corner (the per-corner rule of 0fps); a part on the **far side** of
   the model is one step darker. Steps stop at the ends of a ramp.
5. **Cleanup**: a part that shows as one or two pixels joins its neighbour; a pixel whose shade
   no neighbour shares takes the shade around it.
6. **Interior contours**: where a nearer part covers another one by `contourGap` voxels of
   depth or more (2 by default), the farther pixel takes the darkest step of its ramp. Never
   inside one part.
7. **Outline**, one pixel: ink under the shape and to its right; **on the lit side (above and
   to the left) the darkest step of the ramp it touches.**
8. **Contact shadow**: the ground cells under the lowest voxels of the rest pose, grown by one
   voxel, in the palette's `shadow` slot, behind everything else. It stays put while the model
   moves.

Options: `facing`, `pose` (a name or a pose), `margin`, and switches for each step (`ao`,
`farShade`, `cleanup`, `contourGap`, `outline`, `shadow: false | { height, grow }`).

**The frame** is the projection plus `margin` transparent pixels on every side (1 by default:
the outline). `isoFrame(size, margin)` gives the `size` and `pivot` of the asset (the pivot is
the centre of the ground diamond). The asset kit's `fits-frame` lint wants one empty pixel
around the drawing, so use a margin of 2, and more when the shadow of a wide model sticks out
(the crate: 5).

**Lints.** The lit rim is not ink, so tell the outline lint which slots are outline:
`lint: { outlineSlots: outlineSlots(palette, ramps) }`. A step forward on the 2:1 grid is one
pixel down the screen, so a walk needs `lint: { clips: { walk: { baselineDrift: 1 } } }`.

**Details smaller than a voxel** (eyes, a sign) are stamped on the frame after the bake:
`isoPoint(size, [x, y, z], { facing, margin })` gives the frame pixel of a lattice point of the
model for a facing.

## Validation

`validateModel(model)` checks what needs no image, for the rest pose and every named pose;
`bakeIso` refuses a model with a finding (`check: false` bakes it anyway, for a viewer).

| Rule | Finding |
|---|---|
| `bounds` | A voxel of a posed part lies outside the model's size. |
| `budget` | The parts have more voxels together than the budget. |
| `palette` | A voxel's index is no slot of the palette, or is in no ramp and not in `flatSlots`. |
| `pivot` | A part's pivot is not a lattice point of the part. |
| `empty` | A part has no voxels. |
| `tile` | The footprint of a pose is larger than the model's `tile`. |
| `mirror` | A `symmetric` model is not its own mirror image along x in the rest pose. |

## Limits

- Lines on a face that fall toward the near edge are steep on the 2:1 grid (2 px across, 3 px
  down per voxel): one voxel thick, they break into dots. Make them two voxels thick.
- A rotation that is not a quarter turn resamples: a part can gain or lose a voxel, and at
  this scale a swung limb is a few pixels. Prefer offsets; use rotations for small swings.
- No `.vox` files, no live WebGL rendering and no smooth analytic primitives (out of scope of
  the baker's task note).

The kit has no I/O and no third-party dependency: it runs unchanged in Node and in the browser.
`./dev npm run check` runs its tests (golden hashes of both examples in all four facings) and
holds `src/` to the determinism lint: integers only, no clock, no `Math.random`.
