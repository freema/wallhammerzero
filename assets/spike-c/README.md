# spike-c: variant C of the art spike (voxel models baked to 2:1 iso)

The same room as `spike-a/` and `spike-b/`, with every prop, the chibi and the tiles written
as voxel programs (`assets/spike-lib/voxel-props.ts`, `voxel-chibi.ts`, `voxel-tiles.ts`,
`voxel-scene.ts`) on the shared palette `assets/palettes/spike32.json`, baked by
`packages/voxel-kit` on the CPU. One voxel is 4 × 4 px; a tile is 4 × 4 voxels (a 16 × 8
diamond); props and tiles live in a 4 × 6 × 4 box (a 26 × 30 frame with the shadow's margin),
the chibi in 4 × 8 × 4 (16 × 24 px, variant B's size). Each asset's `NOTES.md` has its
reads, passes and time. The owner compares the three variants in the studio:
`/gallery?kind=scene&zoom=2` shows the A, B and C mockups side by side at one zoom;
`/gallery?pack=spike-c` the pack with its facings and seeds.

## The pass criteria of `research/voxels.md`

- **(a) Style match.** Same palette, same one-pixel outline (ink below and right, the ramp's
  darkest step on the lit side), the same 1 px density: on the pack sheets the voxel props sit
  next to the 2D ones without a seam. The difference is the view (2:1 iso against 3/4
  top-down), not the style. The owner's verdict decides; the session's read is "match".
- **(b) Determinism.** `bake --all` twice gives the same output hash for every variant of the
  nine assets (checked in this session's log; the kit's golden tests cover the baker itself).
  No GPU anywhere.
- **(c) Readability at 1×.** Props: yes. A desk, a PC, a plant, a shelf, a vending machine and
  a sofa read at tile scale, and the plant gains from the voxel grain. The chibi: **no**. At
  16 × 24 the head is 4 × 3 × 4 voxels, two thirds of it hair, the face a sliver at 45°, the
  eyes stamped specks; it reads as a person by its colour blocks, never as a face. Voxels do
  not help at this size, and smooth primitives would not either: the limit is the 4 px voxel
  against a 16 px head, not the blockiness. No follow-up note for smooth primitives.
- **(d) Animation.** Part offsets (a leg one voxel forward, the head one voxel down) read as
  a step and a breath at 2–4 frames; the re-voxelised 30° arm swing reads as a swing in the
  front facings and as noise in the back ones. Acceptable for props and for a chibi seen from
  afar; not a face-level animation.
- **(e) Authoring loop.** Every prop was right after its first lint (1 pass, 5–10 min each;
  the only fix was the shadow's margin, from the example crate). The chibi took 2 passes
  (~20 min) on the example rig; the tiles 1 pass (~10 min); the scene 3 visual passes
  (~30 min: items in one screen column hide each other, walls must be drawn before props on
  the same tile). Whole pack: ~1 h 40 min against ~3.5 h for the 2D pack A.
- **(f) Multi-state and facings.** The vending machine's `use` and `broken` states cost ~5 min
  together (a can in the hatch and a lit button; a carved crack and a knocked-off panel). The
  four facings cost nothing: a quarter turn of the grid each. In 2D, each state and each
  facing is a drawing. This is where voxels win.

## What this says for OC-A2-pick (a read, not the call)

Voxel-baked props and rooms are the cheapest to write and the easiest to extend (states,
facings); the voxel chibi loses the face that the Kairosoft look depends on. The mix the owner
listed as an option (2D characters + voxel-baked props) is what the numbers point at, if the
3/4 top-down of A/B and the 2:1 iso of C can share a room (a question for the runtime, not
answered here).
