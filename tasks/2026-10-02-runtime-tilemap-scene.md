# RUNTIME TILEMAP AND SCENE: TILES, CAMERA, DEPTH, PICKING (2026-10-02)

**GATE:** OC-A2-pick (the projection) · **Priority:** P1 · **Size:** M · **Depends on:** player-loop-test-protocol, runtime-input

## Origin
D1 (Kairosoft-style sims are played on a tile grid), D10 and D23. The projection (3/4 top-down
or 2:1 isometric) is the owner's pick after the art spikes (D19), so this note waits for
OC-A2-pick and implements the projection that wins.

## Read first
- `research/code-graphics.md` §2.6 (tile counts, `tile(mask, seed)`, seam checks).
- `research/voxels.md` §3.2 (the pixel-exact 2:1 projection) if the pick is isometric.
- `research/ref-sakura-crossing.md` §5 (iii) (reachability flood fill, paste-ready
  coordinates).
- The owner's `code-pixel-game` skill, `references/world.md` (tiles, weighted variants, levels
  as text with tests).

## Scope
1. A scene schema in `game-data` (`games/<id>/scenes/*.json`): tile layers (floor, walls,
   objects), tile size, a `projection` field, spawn points, and a room written as **text rows**
   with a legend, validated strictly.
2. Tile rendering through the draw list: **autotiling by bitmask** (`tile(mask, seed)`),
   `hash32(x, y)` variants with weights, culling to the camera, both backends.
3. **Depth sorting** of sprites, tall tiles and FX with one depth key (row order for 3/4
   top-down; `x + z` for isometric), with a stable tie-break.
4. **Camera:** integer scroll, clamping, follow and drag; no sub-pixel positions.
5. **Grid ↔ screen mapping** in both directions, including **picking** (pointer → cell) and a
   debug key that copies the cell under the pointer in an agent-ready form.
6. `describe()` gains the scene (visible cells and entities with cell coordinates).
7. `counter-shop` gets a one-room scene with its shop counter and walking customers.

## Out of scope
- Pathfinding and placement rules (sim systems of the first game, OC-A6).
- The projection that was not picked (unless the owner picks a mix).
- Lighting, weather, day and night.

## Acceptance
- Mapping tests: cell → screen → cell is the identity for every cell of a 64×64 map; picking
  hits the visually topmost cell.
- A 64×64 map scrolls across its full range with no seams (numeric edge comparison of
  neighbouring tiles) and with pixel parity between the backends at five camera positions.
- Depth: a fixture with sprites in front of and behind a tall tile draws in the right order.
- The draw-call count per frame is logged by `shot()` and stays constant while scrolling.
