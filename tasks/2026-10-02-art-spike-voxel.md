# ART SPIKE VOXEL: THE SAME SCENE, VOXEL-BAKED 2:1 ISO (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** voxel-sprite-baker, art-spike-2d

## Origin
D19 + D20: variant **C** of the art spike, voxel models baked to 2:1 isometric pixel art, judged
next to the 2D variants A and B. This is the "voxel props for the sim" experiment proposed in
`research/voxels.md`.

## Read first
- `research/voxels.md` "Proposed first experiment" (content and pass criteria a–f), §2.3 (what
  reads as cozy and Kairosoft-like), §3.2–3.5, §5 (characters and FX).
- `research/ref-voxel-musou.md` §5 (ii) (sprite baker verdict) and §3.3 (rig and animation).
- `research/ref-procedural-pixel-creatures.md` §8.4 (smooth primitives only if the voxel chibi
  looks like stacked beads) and §6.3 (how a 3D-baked style degrades below ~30 px).
- `assets/STYLE.md` and `assets/palettes/spike32.json` from art-spike-2d (same palette, same
  outline weight).

## Scope
1. Pack `spike-c/`, all written as voxel programs on `spike32`:
   - the **same 6 props** as the 2D spike (desk, PC, plant, shelf, vending machine, sofa),
     4 facings each; **one prop in 3 states** (e.g. vending machine: idle, in use, broken);
   - **1 chibi archetype × 3 seeds** (4×4×8 → 16×24 px), 4 facings, idle (2 f) + walk (2–4 f)
     by part offsets;
   - an **iso floor + wall tile family**;
   - a **scene mockup** room in iso with the props and chibis, at 1×.
2. `NOTES.md` per asset (reads, passes, time), as in the 2D spike.
3. `assets/spike-c/README.md` answers the pass criteria from `voxels.md`: (a) style match with
   A/B (for the owner's verdict), (b) determinism, (c) readability at 1× (does the chibi read
   at 16×24, or do voxels not help at that size?), (d) animation quality, (e) authoring loop
   (passes and time per prop), (f) the cost of extra states and facings.
4. Mark the owner call **OC-A2-pick** in the owner-calls note as ready to answer, with links to
   the three scene mockups in the studio, and say in the README whether the chibi needs smooth
   primitives (a follow-up note if it reads as stacked beads).

## Out of scope
- The stretch goal "live WebGL ortho pass, pixel-identical to the bake" (a follow-up note if
  the owner wants voxels live).
- The planet / voxel game.

## Acceptance
- Every asset in `spike-c/` bakes, passes `lint`, and shows in the studio with variants and
  facings; the scene mockup renders at 1×.
- Golden hashes: byte-identical across two runs.
- `spike-c/README.md` answers (a)–(f) with numbers where they exist.
- The studio gallery filtered to `kind: scene` shows the A, B and C mockups next to each other
  at the same integer zoom.
