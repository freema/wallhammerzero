# STUDIO ANIMATION PLAYER (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** L · **Depends on:** studio-live-reload, runtime-sprite-core

## Origin
D6: "ve studiu chci hlavně vidět generované assety všechny, hlavně mi jde o animace, fx efekty".
D22: scrub, slow-mo, integer zoom, variants side by side, pixel inspector. Previews use our own
runtime (D10), so what the owner approves is what the game draws.

## Read first
- `research/studio-stack.md` §3 (one shared WebGL context, scissor rectangles, React
  integration, §3.5 review tools) and §8.3 (client modules: PreviewHost, time, inspector).
- `research/code-graphics.md` §2.4 (animation craft at low fps: holds, timing tables) and §2.8
  (variants plus a human pick).

## Scope
1. **PreviewHost:** one WebGL2 context per page, one rAF loop, previews registered as rectangles
   (viewport + scissor), only visible ones drawn (IntersectionObserver). Gallery cards animate
   their default clip while visible.
2. **Player on `/asset/:id`:**
   - play / pause, step ±1 frame, a timeline scrubber with frame ticks and per-frame durations;
   - speed 0.1×, 0.25×, 0.5×, 1×, 2×; loop the selected clip; clip and facing selectors;
   - integer zoom 1×–16×, pixel grid overlay, background choice (checker, dark, light, game floor
     tile);
   - **onion skin** (previous/next frame, dimmed);
   - **pixel inspector:** hover shows x, y, palette slot index, slot name and RGB;
   - **variants side by side:** every variant seed and preset in a grid, all on one synced clock,
     with a "1× in context" row (actual game size, no zoom).
3. Keyboard: space, ←/→, +/−, 1–9 for speed presets.
4. The page keeps time, zoom and selection when live reload swaps the asset.

## Out of scope
- Parameter sliders with live generator execution (`studio-params-sliders`).
- FX emitters as data (`fx-emitters`; until then FX are baked frames and play here like any
  clip), audio (`studio-audio`), before/after compare (`studio-compare`), the voxel inspector
  (`studio-voxel-inspector`).

## Acceptance
- Blind verifier (Chrome DevTools MCP): for the example asset, stepping through frames gives
  `readNative()` output equal to the baked frames (pixel parity, scripted); slow-mo at 0.25×
  shows each frame for 4× its duration (timed by script, not by eye).
- 30 animated cards in the gallery run on one WebGL context (checked via script) with no console
  errors.
- Changing the generator while the player is open updates the frames and keeps the current zoom
  and clip.

## From live reload (2026-10-06)
What `studio-live-reload` left for this note (see `docs/studio.md`, "Live reload"):
- The asset page and the gallery cards get the record of their asset through
  `useAsset(record, revision)` (`packages/studio/app/live.tsx`): after a re-bake the same
  component renders again with the new record, without a navigation, so component state (zoom,
  clip, time) survives if the player keeps it in the component.
- The URL key of a baked file is `imageKey(asset, variant)`
  (`packages/studio/app/lib/assets.ts`): the output hash and the palette hash. The output hash
  alone does not change when only a palette's colours do.
