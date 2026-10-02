# ASSET RENDER CLI: BAKE, REVIEW SHEETS AND LINTS (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** asset-kit-core

## Origin
D18: PNG, sheets and atlases are build outputs of the asset programs. CLAUDE.md "Looking at
images": Claude must look at upscaled contact sheets, never at tiny PNGs or GIFs. This CLI is
both the bake step for the studio and the generator session's eyes.

## Read first
- `research/code-graphics.md` §2.1 (the render → inspect → revise loop), §5.3 (how Claude looks
  at renders, zoom limits), §7.3 (inspection loop), §7.5 (vision calibration experiment).
- `research/ref-sakura-crossing.md` §1.7 (numeric self-checks and the `__shot` endpoint keep a
  big agent-written codebase alive).
- `research/game-creator.md` (test protocol: state as text, seeded scripts, QA loop).
- `research/ref-procedural-pixel-creatures.md` §8.2 (animation lints that caught real defects
  there).
- The owner's `code-pixel-game` skill, `references/review-loop.md` (what Claude can and cannot
  see, the views, numbers before eyes) and `references/failures.md`.

## Scope
1. A CLI in `packages/asset-kit` (run in Docker: `./dev npm run asset -- <cmd>`):
   - `list`: all assets under `assets/` with id, kind, size, clips, variants.
   - `bake <id|--all>`: writes `build/assets/<id>/` with an **indexed PNG** sheet per variant
     (own chunk writer on Node's `zlib`), `atlas.json` (frames, pivots, clips with durations,
     facings, variant seeds, source hash, output hash, palette id) and per-frame PNGs.
   - `review <id>`: model-facing images in `build/review/<id>/`: a contact sheet of all frames at
     an integer zoom (default 8×, with frame numbers and a 1-px grid gutter), one strip per clip,
     a silhouette sheet on a light background, a 1× + 3× "in context" tile on a neutral floor,
     and `lint.json`. `review --pack <pack>` makes **one group sheet per pack** (one row per
     asset, review seeds as columns), which is the cheap way to judge consistency. Every image
     stays ≤ 2576 px on the long edge (larger ones are downscaled when read) and is written
     straight to a file, never through stdout.
   - `lint <id|--all>`: numeric checks with thresholds: only palette indices, no orphan pixels
     (configurable), detached pixel groups, outline gaps, colour count per frame, baseline
     drift measured from the pivot (not the lowest pixel), bbox and area change between frames,
     **loop seam** (last → first frame diff vs the in-clip diffs), frame size matches meta, every
     pose fits the frame (no clipped props), clip timing sanity, and for `scene` assets the
     **mean luminance** against a floor (the owner found Gloop's level 1 too dark while the
     screenshots looked fine). `lint.json` carries a per-frame stats table. Exit code ≠ 0 on
     errors.
2. The bake is a **library function** as well, so the studio can call it in a worker
   (`studio-live-reload`) with the same code.
3. **Vision calibration sheet** (one-off, recorded in `docs/looking-at-images.md`): render known
   defects (1 orphan pixel, 1-px pivot jump, a wrong palette slot, a twinned limb) at 1×, 4×, 8×
   and 12×, look at each with Read, and record which zoom reliably catches which defect. CLAUDE.md
   "Looking at images" links the result.
4. Golden tests: bake of the example asset has stable output hashes; lints catch fixture defects.

## Out of scope
- GIF/APNG previews for humans (the studio plays animations).
- The voxel baker (separate note).

## Acceptance
- `./dev npm run asset -- bake --all && ./dev npm run asset -- review examples/blinking-dot`
  produces the files above. Opening the contact sheet with Read shows every frame, numbered.
- `lint` exits non-zero on each defect fixture and zero on the example asset.
- Baking twice gives identical output hashes; `npm run check` covers it.
- `docs/looking-at-images.md` holds the calibration table and CLAUDE.md links it.
