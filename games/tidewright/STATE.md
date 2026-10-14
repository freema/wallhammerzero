# Tidewright: state

Where the game stands between `/continue-game tidewright` runs. Each run updates this file in its
own commit. It is not a queue: Next holds at most three items.

**Status:** waiting: owner. Updated 2026-10-14, the first playable build (`/make-game`).

## How to run

- `./dev compose up tidewright` (or `./dev -p 4300 npm run dev -w @whz/tidewright-play`), then
  http://127.0.0.1:4300. The scripts use `?seed=1`.
- Scripts in `packages/tidewright-play/play/`: `smoke`, `core`, `tack`, `cargo`. From the
  browser: `await __game.runScript("core")`.

## Plays now

- A 9 m sloop on a six-wave Gerstner sea, in a generated archipelago of eight granite islands
  with woods, boulders and four harbours (pier, terraced village, lighthouse, spar buoy).
- Controls: A/D helm, W/S sheet (keep the mark in the green band), drag and wheel for the
  camera, M sound. The HUD gives the load, the distance and bearing to the harbour, the storm
  clock, speed, wind, heel, the trim gauge and a compass with the course and the wind.
- The verb: sail and trim against a veering, gusting wind. A beam reach trimmed makes 6.5 kn,
  sheeted hard in it stalls (2.9 kn), head to wind it luffs and stops; upwind you tack.
- The loop: a load to one of the two nearest harbours, a clock that brings the storm (wind,
  dark sky, bigger seas), tie up under 4 knots, pay with an early bonus or half pay late;
  groundings spoil a quarter of the load each.
- Sound from WebAudio code: wind, water, the luffing sail, a bell on delivery, a thud on
  grounding.

## Last owner feedback

- None yet on this game. On New Hope (parked, D31): "simple graphics, weird characters,
  unrealistic dimensions and object sizes, overall a bit dumb and simple". Tidewright is built
  to real scale against that.

## Next

1. Owner verdict on feel and look (sailing feel, sound, the archipelago in motion).
2. Draw-call and triangle budget: LOD or impostors for the woods and coarser far terrain.
3. More to do at sea: a run of loads with rising pay, a map key (Tab), wind shadows near land.

## Rejected

Ideas and looks the owner turned down. Never re-propose them.
- None yet.

## Budgets

Measured on seed 1 in Chrome on the owner's Mac (`__game.perf()`).

| Count | Now | Budget |
|---|---|---|
| Draw calls per frame, at the home harbour | 43 | 60 |
| Draw calls per frame, open sea | 14 | 60 |
| Triangles per frame, at the home harbour | 2.05 M | 2.2 M |
| Render CPU time, p50 | under 2 ms | 4 ms |

Scripts that pass: `smoke` (4 harbours, the first load 289 m), `core` (beam reach 6.46 kn
trimmed, 2.86 kn stalled, 0.56 kn in irons, close-hauled 5.42 kn at 18° heel, running 4.3 kn),
`tack` (through the wind and back to 6.6 kn), `cargo` (a delivery, a grounding spoils 25 %, a
storm at 25 kn). A keys-only autopilot beat 289 m upwind to the first harbour in 236 s of the
351 s allowed, with four tacks.
