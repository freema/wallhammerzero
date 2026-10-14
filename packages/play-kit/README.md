# @whz/play-kit

What every playable browser game of the repo shares, whatever draws it (Three.js, a 2D
canvas): the test hook `window.__game` and its script runner, the fixed-step loop, the
keyboard, the dev server's shot plugin, and the scaffold of a new game. New Hope
([packages/new-hope-play](../new-hope-play/README.md)) runs on it; `/make-game` starts every new
game with it.

## A new game

```sh
./dev npm run play -- new <id> --title "<Title>" [--engine three|canvas] [--port <n>] [--palette <id>]
./dev npm install                                   # links @whz/<id>-play into the workspace
./dev -p <port> npm run dev -w @whz/<id>-play       # then http://127.0.0.1:<port>/?seed=1
```

It writes `games/<id>/` (`game.json`, `README.md`, `STATE.md`, `locales/en.json`), the package
`packages/<id>-play/` (vite config with the shot plugin, `index.html`, `src/main.ts`,
`play/smoke.json`, a README) and the Compose service `<id>` on the next free port (4300, 4400,
…). It refuses to overwrite anything. `three` starts as a capsule on a plane with seeded
blocks; `canvas` as a square on a 320 × 180 pixel stage, upscaled by whole numbers. Both move
with WASD and pass their smoke script. The palette defaults to `example`.

## The hook

```ts
import { captureErrors, fixedLoop, installGameHook, Keys } from "@whz/play-kit";

captureErrors(); // first: errors, rejections and console.error from here on
const keys = new Keys().listen();
const loop = fixedLoop({ step: 1 / 120, update, present }); // every rule in update
installGameHook({
  id: "<id>", seed, step: 1 / 120,
  state: () => ({ tick, player: { pos } }),     // plain JSON; digested
  advance: loop.advance,
  key: (code, down) => keys.set(code, down),
  capture: (ratio) => /* draw now, return canvas.toDataURL("image/png") */,
  scenarios: { start: () => true },             // optional
  actions: { jump: (h = 1) => {} },             // optional: game verbs for scripts
  view: () => ({ distToGoal }),                 // optional: derived values scripts check
  describe: () => ({ /* under 1 KB */ }),       // optional: default is the state
  perf: () => ({ calls: renderer.info.render.calls }), // optional
});
loop.start();
```

| `window.__game.` | What it does |
|---|---|
| `describe()`, `state()`, `digest()` | The brief, the full state (3 decimals) and its FNV-1a 64 hash. |
| `advance(seconds)` | Whole steps without the browser's clock, one draw; returns `describe()`. A hidden tab works. |
| `key(code, down)`, `press(code)`, `hold(code, seconds)` | Input through the same `Keys` the real keyboard uses. |
| `scenario(name)`, `act(name, ...args)` | The game's scenarios and actions. |
| `runScript(name \| script)` | Runs `play/<name>.json` in the page (one browser call for a whole play-through). |
| `shot(name, pixelRatio = 1)` | Writes `build/shots/<id>/<name>.png` through the dev server (`POST /__shot`). |
| `perf()`, `errors()` | The game's counts; the errors since load. |

A script is `{ "name", "seed", "steps": [...] }`. A step does one thing: `advance`, `press`,
`hold`, `down`, `up`, `scenario`, `save`, or an action by its name with `args`. Then it may
check a dotted path of the view (the state, the game's `view()` and `perf`) with `eq`, `ne`,
`gt`, `gte`, `lt`, `lte`, where `"from": "<saved>"` compares the change since a `save`, and may
take a `"shot"`. The run stops at the first failed check, unknown step or new console error, and
returns the checks, the digest, `describe()`, the errors and the shots.

`fixedLoop` snaps a frame time near a whole number of steps to it (a steady 60 or 120 Hz screen
gets exactly 2 or 1 steps per frame), runs at most 12 steps per frame and drops the debt after a
stall. `advance` runs the same `update`, so a script and the real loop share one path.

## Checks

`./dev npm run check -- @whz/play-kit`: types, lint and the tests of the runner (against a fake
game), the loop and the scaffold (into a temporary folder, including the Compose port rule).
The hook itself needs a browser: it is exercised by every game's scripts.
