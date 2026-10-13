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
| F get into a car nearby | |

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
| `src/main.ts` | Renderer, bloom, camera (third person, pulled in front of walls), HUD, the loop. |

The city is deterministic from the seed (citygen); the look and the motion are not part of any
digest. For scripted checks the page exposes `window.__nh`: `advance(seconds)` runs the game
without the browser's frame clock (it works in a hidden tab), `key(code, down)` holds a key,
`teleport`, `look`, `jobs()`, `info()`.

The container has no GPU: the game is checked in the host browser. `./dev npm run check -- @whz/new-hope-play`
type-checks, lints and builds it.
