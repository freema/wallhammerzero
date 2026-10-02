# VOXEL SPRITE BAKER: CPU ISO RENDERER INTO PIXEL ART (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** asset-render-cli

## Origin
D15 (voxels are also rendered as pixel art), D20 (voxel-baked sprites are in the first art
experiment), D16 (no GPU in Docker, so the baker is software). Voxel models are programs, like
every other asset (D18).

## Read first
- `research/voxels.md` §3.2 (pixel-exact 2:1 projection, sprite sizes, facings), §3.3 (the
  software baker), §3.4 (ramps, AO, outlines, palette), §3.5 (animation for baked sprites),
  §4.2–4.5 (program as source of truth, builder vocabulary, validation).
- `research/ref-voxel-musou.md` §3.1 (voxel builder, `sculpt` box lists), §3.3 (rig), §5 (ii)
  (recommended sprite baker), Appendix A (model + rig format sketch). Code is MIT: ideas and
  structure are fine; still re-check the licence before copying any snippet.
- Precedents: Tiberian Sun / Red Alert 2 voxel units, Dead Cells (3D → pixel frames, "pixel
  flicker"): links in `voxels.md` §3.1.
- `research/ref-procedural-pixel-creatures.md` §3.5 and §8.4: a working 3D → pixel-art baker with
  the rules we want: interior contours only between parts and only on a big enough depth gap,
  the lit side's outline uses the darkest ramp step, far-side parts one ramp darker, a contact
  shadow as one ramp step, and speck/isolated-shade cleanup after projection. Ideas only (§9).

## Scope
1. `packages/voxel-kit` (TypeScript, no dependencies, runs in Node and the browser):
   - a palette-indexed voxel grid and a **builder**: `sculpt` box lists (fill, carve, per-voxel
     function), `mirrorX`, simple SDF primitives (round box, capsule, ellipsoid), ramp-aware
     `paint(region, ramp, step)`, hash jitter within a ramp, named parts with pivots;
   - **integer 2:1 dimetric projection** (`screen.x = 2·(x − z)`, `screen.y = (x + z) − 2·y`):
     stamp each visible face's fixed footprint (4×2 top diamond, 2×2 sides) into a buffer with
     depth + palette index + part id;
   - **shading by ramps:** top = base + 1, left = base, right = base − 1; **AO** as one ramp
     step down (0fps per-corner rule), never a gradient; parts on the far side one ramp step
     darker;
   - **1-px selective outline** from the depth/ID buffer: the silhouette uses ink, except on
     the lit side, where it uses the darkest step of the adjacent ramp; **interior contours**
     only between different parts and only where the depth gap is big enough;
   - a **contact shadow** under the model in the palette's `shadow` slot, and a **cleanup
     pass** after projection that removes specks and isolated shade pixels;
   - **4 facings** by lossless 90° grid rotation; **poses** by part offsets, and small rotations
     by nearest-neighbour re-voxelising of a part;
   - output is an asset-kit `IndexedBuffer`, so a voxel model is an ordinary asset: its `gen.ts`
     builds a model and calls `bakeIso(model, { facing, pose })`. The CLI, lints, studio and
     verdicts work unchanged.
2. Structural validation: bounds and voxel budget, ramp indices exist, pivots inside parts,
   the footprint fits the tile, symmetric archetypes pass a mirror diff.
3. Example assets under `assets/examples/`: a 4×4×8 test chibi (16×24 px) and an 8×8×8 crate.

## Out of scope
- `.vox` export/import, live WebGL voxel rendering (the "pixel-identical live pass" is a later
  stretch goal), Three.js, the planet game.
- Smooth analytic primitives rasterised straight to pixels (the procedural-pixel-creatures
  way). Only if the voxel spike's chibi reads as stacked beads; that becomes a follow-up note.
- The studio's voxel inspector (`studio-voxel-inspector`).

## Acceptance
- Golden hashes for each example in each facing; baking twice is byte-identical.
- A projection test: a single voxel gives the standard 4×2 + 2×2 + 2×2 footprint; an
  nx × nz × h model gives a sprite of `2·(nx+nz)` × `(nx+nz) + 2·h`.
- Rotating a model 4 × 90° returns the identical grid.
- Outline tests on a two-part fixture: an interior contour appears only where the depth gap
  passes the threshold, and the lit-side rim uses the ramp's darkest step, not ink.
- The examples show in the studio gallery and player like any other asset; their contact
  sheets (`review`) are readable at 8×.
