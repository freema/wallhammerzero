# @whz/new-hope-play

New Hope, the playable 3D game (D28, D30), in Three.js. Concept and story:
[games/new-hope/](../../games/new-hope/README.md).

```sh
./dev compose up newhope        # http://127.0.0.1:4200 (WHZ_NEWHOPE_PORT=<port> for another)
# or: ./dev -p 4200 npm run dev -w @whz/new-hope-play
```

`?seed=<n>` picks the district; **N** in the game jumps to a random one.

## Controls

| On foot | In a hover car |
|---|---|
| WASD move, Shift run, Space jump, mouse look, wheel zoom | W/S thrust, A/D turn, Space up, Shift down, R boost |
| E / Q ride a lift up / down | F get out |
| F get into a car nearby (a Union cruiser is a theft) | |
| T pass into the nearest body (costs psi) | |

M mutes the sound. The radar (bottom right) turns with the camera: yellow is the job, white the
parked cars, red and blue the Union.

## Heat

Crashes at speed and stolen cruisers bring Union security: stars, then cruisers that hunt Kylo.
A cruiser that stays on top of a slow or walking Kylo for three seconds arrests him: 30 % of the
credits are gone and he is back on the first roof. Out of sight, the heat cools a star every
10 s. Passing into another body drops two stars, unless a Union guard (the visored ones) sees
it: then it adds one.

## How it is built

| File | What it does |
|---|---|
| `src/world.ts` | The district from `@whz/citygen` (48 × 48 tiles × 20 storeys) in metres: a tile is 4 m, a storey 4 m. What blocks a body, where the floor is (slabs, roofs, stair ramps). |
| `src/textures.ts` | One procedural atlas (canvas): five facade styles (union, habitat, market, derelict, ancient), roofs, decks, pads, asphalt, walkways, stairs, metal, ruin stone; a colour map and an emissive map. |
| `src/city.ts` | The district's meshes in 16-tile chunks: every visible cell face, slabs, ramps, lift shafts with glass, walkway railings; instanced blade signs, rooftop gear, antenna beacons, Psion crystals. |
| `src/sky.ts` | The sky shader (gradient, stars, nebula, a ringed gas giant, a moon), fog and lights, and the endless city: instanced towers whose windows and neon bands are drawn in the shader, with collision boxes. |
| `src/models.ts` | Low-poly people (Kylo, the crowd, Union guards) and hover cars (taxi, Union cruiser, civilian), built from primitives. |
| `src/actors.ts` | Kylo on foot (walk, run, jump, stairs, lifts, railings) and the hover car flight model (thrust, grip, bank, bounce, landing). |
| `src/traffic.ts` | Instanced flying traffic along the lane grid and over the endless city; the crowd walking the flat cells. |
| `src/jobs.ts` | Fares and descents, the beacon, credits. |
| `src/police.ts` | Heat (stars), Union cruisers that chase, the arrest. |
| `src/audio.ts` | All sound as WebAudio code: the city drone and a synth pad, wind, rain, the engine, the siren, cues for jobs, crashes, arrests and body-passing. |
| `src/radar.ts` | The radar, drawn on a canvas. |
| `src/fx.ts` | Rain around the camera (a storm every three minutes or so) and the beam of body-passing. |
| `src/main.ts` | Renderer, bloom, camera (third person, pulled in front of walls), HUD, the loop. |

The city is deterministic from the seed (citygen); the look and the motion are not part of any
digest. For scripted checks the page exposes `window.__nh`: `advance(seconds)` runs the game
without the browser's frame clock (it works in a hidden tab), `key(code, down)` holds a key,
`teleport`, `look`, `jobs()`, `info()`, `place(x, y, z)` (the car Kylo drives, or Kylo),
`target()`, `police()`, `wanted(stars)`, `pass()`, `psi()`, `crowd()`, `rain(on | null)`.

The container has no GPU: the game is checked in the host browser. `./dev npm run check -- @whz/new-hope-play`
type-checks, lints and builds it.
