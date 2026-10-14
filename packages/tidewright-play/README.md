# @whz/tidewright-play

Tidewright, playable (`three`). Concept and state: [games/tidewright](../../games/tidewright/README.md).

```sh
./dev compose up tidewright        # http://127.0.0.1:4300
# or: ./dev -p 4300 npm run dev -w @whz/tidewright-play
```

`?seed=<n>` picks the archipelago; the scripts use `?seed=1`.

## Controls

| Key | Does |
|---|---|
| A / D, arrows left / right | helm: turn to port / starboard |
| W / S, arrows up / down | sheet in / ease out: keep the white mark in the green band |
| drag, wheel | orbit the camera, zoom |
| M | sound on / off |

Tie up at the target's pier end (the light column, the yellow line on the compass) under 4
knots. Upwind, tack: the boat stops within about 40° of the wind.

## How it is built

| File | What it does |
|---|---|
| `src/main.ts` | The entry: the fixed-step `update` at 120 Hz (every rule), `present` (the picture, the camera), the hook's scenarios and actions. |
| `src/boat.ts` | The sloop: the lofted hull, deck, rig and a cambered sail; the sail-and-keel force model (apparent wind, lift and drag, leeway, heel, rudder), groundings, floating on the waves. |
| `src/wind.ts` | The wind: a base direction per seed, veers and gusts, stronger in the storm. |
| `src/ocean.ts` | Six Gerstner waves on the GPU and the same sum on the CPU (`waterAt`), calmer in the shallows; the polar water grid that follows the camera; shore and crest foam. |
| `src/world.ts` | The archipelago from the seed: one height function (islands, rock lip, terraces for buildings), the heightmap the water reads, terrain with shader detail, harbours (pier, houses, lighthouse, spar buoy, light column), woods, boulders. |
| `src/sky.ts` | The Preetham sky, sun and shadows that follow the boat, fog and exposure that darken with the storm. |
| `src/jobs.ts` | Cargo runs: the target, the clock that brings the storm, pay, groundings that spoil the load. |
| `src/wake.ts` | Foam patches behind the boat. |
| `src/audio.ts` | WebAudio sound from one noise loop: wind, water, the luffing sail, the bell, the grounding thud. |
| `src/hud.ts` | The load and the clock, speed and wind, the trim gauge, the compass, messages. |
| `src/noise.ts` | Seeded value noise and fbm. |
| `play/*.json` | Scripts for `__game.runScript(<name>)`: `smoke`, `core` (speeds on each point of sail), `tack`, `cargo` (a grounding and a delivery in the storm). |

## Testing: `window.__game`

The hook of `@whz/play-kit` ([packages/play-kit/README.md](../play-kit/README.md)):
`describe()`, `state()`, `digest()`, `advance(s)`, `key`, `press`, `hold`,
`scenario(name)`, `act(name, ...args)`, `runScript(name)`, `shot(name)`, `perf()`,
`errors()`. From the DevTools MCP: `await __game.runScript("smoke")` on a fresh `?seed=1`.

- Scenarios: `start` (a new game at the home pier), `open` (open water, far from land), `dock`
  (just off the target's pier, slow), `shoal` (heading for a shore at speed).
- Actions: `point(deg)` (the true wind that many degrees off the bow), `sheet(rad)`,
  `speed(mps)`, `steady(1|0)` (freeze the wind's veer and gusts), `camera(yawDeg, pitchDeg,
  dist)`, `storm(level)` (`-1` gives the storm back to the cargo clock).
