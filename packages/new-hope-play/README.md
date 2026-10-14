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
| `src/people.ts` | Low-poly people (Kylo, the crowd, Union guards) from one list of body parts: Kylo is a mesh tree, the crowd one instanced mesh per part (about 17 draws for everyone). Geometry and materials are shared. |
| `src/models.ts` | Hover cars (taxi, Union cruiser, civilian): the parts of each kind merged per material and shared, so a car is 6 or 7 draws. |
| `src/actors.ts` | Kylo on foot (walk, run, jump, stairs, lifts, railings) and the hover car flight model (thrust, grip, bank, bounce, landing). |
| `src/traffic.ts` | Instanced flying traffic along the lane grid and over the endless city; the crowd walking the flat cells. |
| `src/jobs.ts` | Fares and descents, the beacon, credits. |
| `src/police.ts` | Heat (stars), Union cruisers that chase (a seeded orbit, pooled cars), the arrest. |
| `src/audio.ts` | All sound as WebAudio code: the city drone and a synth pad, wind, rain, the engine, the siren, cues for jobs, crashes, arrests and body-passing. |
| `src/radar.ts` | The radar, drawn on a canvas. |
| `src/fx.ts` | Rain around the camera (a storm every three minutes or so) and the beam of body-passing. |
| `src/main.ts` | Renderer, bloom (antialiased in the composer's 4× multisampled target), camera (third person, pulled in front of walls), HUD, and the loop: `step` (the simulation at a fixed 120 Hz) and `present` (camera, sound, HUD, the render, once per frame). |
| `src/debug.ts` | The test hook `window.__game` (below). |
| `play/*.json` | Smoke scripts for `__game.runScript(<name>)`: `foot` (roof, lift, street) and `car` (board, fly, land a fare, an arrest). |

The city is deterministic from the seed (citygen). Play is reproducible within one browser:
the same seed and the same inputs per simulation step give the same run and the same
`digest()` (gameplay randomness is seeded: the crowd's walks and the police from `@whz/det`).
Motion is float maths, so it is not part of any cross-engine digest.

## Testing: `window.__game`

The page exposes `window.__game` (and the old name `window.__nh`) for the browser's console
and the DevTools MCP. Nothing waits for the browser's clock, so it works in a hidden tab.

| Call | What it does |
|---|---|
| `describe()` | The state in brief (under 1 KB): mode, position, level and band, car, job, heat, psi, people near. |
| `state()`, `digest()` | The full state (positions to the millimetre) and its FNV-1a 64 hash. |
| `advance(seconds)` | Runs fixed steps, draws once, returns `describe()`. |
| `key(code, down)`, `press(code)`, `hold(code, seconds)`, `pointer(dx, dy)`, `look(yaw, pitch, dist)` | Input. |
| `scenario(name)` | `lift` (the bottom of the nearest shaft), `street`, `car` (get into the nearest car), `target` (on the job's spot). |
| `place(x, y, z)`, `enterCar()`, `leaveCar()`, `wanted(stars)`, `pass()`, `rain(on \| null)` | Set up a situation. |
| `runScript(name \| script)` | Runs `play/<name>.json` (or a script object) in the page, stops at the first failed expectation or console error, returns the checks, the digest, `describe()`, errors and shots. |
| `shot(name, pixelRatio = 1)` | Renders and writes `build/shots/new-hope/<name>.png` through the dev server (`POST /__shot`). |
| `perf()` | The last frame's draw calls and triangles (shadow and post passes included), geometries, textures, programs, the CPU time of the render call. |
| `errors()` | Errors, rejections and `console.error` lines since load. |

A script is `{ "name", "seed", "steps": [...] }`. A step does one thing (`"do": "advance" |
"press" | "hold" | "scenario" | "save" | …`), may check a path of the state
(`"expect": "jobs.done", "gte": 2`; `"from": "<saved>"` compares the change since a `save`) and
may take a `"shot"`. From the DevTools MCP: `await __game.runScript("car")` on a freshly loaded
`?seed=2`.

Measured on seed 2 at the start (2026-10-14, a 1512 × 776 window at DPR 2): 775 draw calls and 681 geometries
before the instanced crowd and the merged cars, 120 and 48 after.

The container has no GPU: the game is checked in the host browser. `./dev npm run check -- @whz/new-hope-play`
type-checks, lints and builds it.
