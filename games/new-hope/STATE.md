# New Hope: state

Where the game stands between `/continue-game new-hope` runs
([.claude/skills/continue-game/SKILL.md](../../.claude/skills/continue-game/SKILL.md)). Each run
updates this file in its own commit. It is not a queue: Next holds at most three items.

**Status:** parked (D31): a reference, not developed unless the owner asks. Updated 2026-10-14.

## How to run

- `./dev compose up newhope` (or `./dev -p 4200 npm run dev -w @whz/new-hope-play`), then
  http://127.0.0.1:4200. `?seed=<n>` picks the district; the scripts use `?seed=2`.
- Package: [packages/new-hope-play](../../packages/new-hope-play/README.md) (controls, the file
  map, the `window.__game` hook and the script format).
- Scripts in `packages/new-hope-play/play/`: `foot` (roof, lift, street) and `car` (board, fly,
  land a fare, an arrest). From the browser: `await __game.runScript("car")`.

## Plays now

- Kylo on foot over roofs, decks, stairs and lifts; hover cars with a flight model; taxi fares
  from pad to pad; every fourth job a descent into an Ancestor hall.
- Traffic along the sky lanes, a walking crowd, Union security with wanted stars, the chase and
  the arrest; body-passing (T) to shake the heat.
- Rain storms, the radar, all sound generated in code.
- A fixed 120 Hz simulation step; gameplay randomness seeded, so a seed and the same inputs give
  the same run in one browser.

## Last owner feedback

- 2026-10-13, on the direction (D30): “I want it to be a 3D three js playable game, no version two,
  no mans skyes look, that it is a procedurally generated world”.
- 2026-10-14: “please continue developing the game”.
- 2026-10-14, on the game as a whole (D31): “I do not see any reason right now to continue with that game unless
  you implement those skills on it … overall I do not like the game either”.

## Next

1. **Smooth motion at any refresh rate:** draw the camera and the bodies interpolated between
   the 120 Hz steps. Check: on a 144 Hz display the camera's frame-to-frame motion has no
   repeated frames.
2. **Camera and police feel:** a camera that slides along walls instead of snapping in front of
   them, and Union cruisers that collide and need a line of sight
   ([research/new-hope-audit.md](../../research/new-hope-audit.md) §13, K1 and K3).
3. **The first story beat** ([STORY.md](STORY.md)): Kylo's first body-pass used to get through
   a Union checkpoint, as a job type next to the fares and the descents.

## Rejected

Ideas and looks the owner turned down. Never re-propose them.
- A fixed isometric view over baked voxel sprites, and any 2D version (D29, replaced by D30).
- Paperwork before play: task notes, asset sheets and plans instead of a playable build
  (2026-10-13: “this is insufficient!”).

Tried by a session and set aside (not owner verdicts):
- AgX tone mapping (2026-10-14): it greys the neon against D30's vivid look; ACES stays.

## Budgets

Measured on seed 2 at the start view, a 1512 × 776 window at DPR 2, with `__game.perf()`:

| Count | Now | Budget |
|---|---|---|
| Draw calls per frame (shadow and post passes included) | 120 | 160 |
| Triangles per frame | ≈ 383 k | 500 k |
| Geometries in memory | 48 | 80 |

The scripts `foot` and `car` pass. The cost of one run is not measured yet: the owner reads
`/usage` after the first runs.
