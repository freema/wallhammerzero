# STUDIO: VOXEL MODEL INSPECTOR (2026-10-02)

**GATE:** none · **Priority:** P3 · **Size:** S · **Depends on:** voxel-sprite-baker, studio-animation-player

## Origin
D15 and D20 (voxel models are assets and are shown as pixel art) and D23 (the "3D" item of D22
moves into the queue). Baked voxel sprites already play in the animation player; this note
adds the views that explain a voxel model when a bake looks wrong.

## Read first
- `research/voxels.md` §8 (previewing voxel assets and sprites in the studio) and §4.5
  (validation).
- `research/ref-voxel-musou.md` §5 (iii) (voxel model viewer and rig preview).

## Scope
1. `voxel-kit` exposes debug views of a model: horizontal **slices** (one grid per layer), a
   **part view** (flat colour per part, pivots marked), the depth buffer as greys, and the
   validation results (voxel count against the budget, mirror diff).
2. On `/asset/:id` of a voxel-built asset: a tab with the slices at an integer zoom, the part
   view, the **four facings in a row** on a synced clock with an auto-rotate toggle, and a pose
   scrubber.
3. Everything is drawn by the CPU baker in a worker. There is no 3D view and no Three.js
   (OC-D2 stays open).

## Out of scope
- A free 3D camera, editing voxels, `.vox` export.
- The seed browser for the voxel game (comes with that game).

## Acceptance
- For the example chibi, the slice count equals the model height and the part view shows
  every named part in its own colour (scripted check of the colours used).
- The four facings stay in sync while scrubbing.
- A model over its voxel budget shows the validation error on the tab.
