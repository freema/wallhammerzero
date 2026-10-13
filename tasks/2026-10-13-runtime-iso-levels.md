# RUNTIME: ISO CITY WITH LEVELS (2026-10-13)

**GATE:** none · **Priority:** P1 · **Size:** L · **Depends on:** player-loop-test-protocol, nh-city-mockup

## Origin
D29: New Hope is drawn by our runtime from voxel models baked to 2:1 iso, the levels are
layers, and the layers above the player are cut away. This is the runtime part; the Kairosoft
tilemap (`runtime-tilemap-scene`, gated by OC-A2-pick) is a separate note, and the two share
what they can.

## Read first
- `packages/runtime/README.md` (the host passes time and the rectangle; CPU reference first,
  WebGL2 matches it; the parity check).
- The notes of `nh-city-mockup` (what the mockup found about depth and cost) and the citygen
  package README.
- `packages/voxel-kit/README.md`: `bakeIsoLayers` gives colour **and depth** per pixel.

## Scope
1. **Baked chunks**: a district is baked into chunks per level (colour + depth), at load or at
   build time; the scene format for New Hope goes into the `scenes/<id>.json` slot of
   `docs/game-data.md` with its schema.
2. **Sprites against the city by depth**: characters and cars are drawn with a depth test
   against the baked chunks' depth, so they pass behind and in front of buildings correctly,
   in the CPU reference and in WebGL2 (parity).
3. **Cut-away**: levels above the focus level are not drawn (a short fade is optional), and the
   focus follows the player between levels.
4. **Camera**: follows a target in whole pixels at native resolution; integer zoom only.
5. Tests: golden frames of the CPU backend for a fixed scene; the parity check covers it.

## Out of scope
- Movement, physics and missions (`nh-first-mission`), lighting effects beyond the baked
  colours, rotation of the camera.

## Acceptance
- A golden-frame test shows a character behind a tower, in front of it, and on a walkway with
  the levels above cut away; the WebGL2 parity check matches the CPU frame.
- The gate is green.
