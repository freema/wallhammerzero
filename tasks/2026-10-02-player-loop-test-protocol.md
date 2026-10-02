# PLAYER: GAME LOOP, HOST API AND THE TEST PROTOCOL (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** L · **Depends on:** game-package-format, runtime-sprite-core

## Origin
D10 (our own runtime plays games that are pure data; the player is swappable) and D23.
`research/README.md`, conclusion 5: every player implements one test protocol (state as text,
step time, seed, action scripts, a render endpoint). Because games are data, this is built once
for every game.

## Read first
- `research/game-creator.md` §4.1–4.3 and §7.1 item 1 (the test API in every game, the action
  script format, stop on the first error).
- `research/ref-sakura-crossing.md` §3.13 and §5 (iii) (`__shot` as PNG, steppable update,
  executable invariants).
- `research/multiplatform.md` "Architectural rules from day one" 1–3, 11 and 13 (host adapters,
  commands in and events out, optional capabilities, a small written host API).
- `research/studio-stack.md` §7.5 (a render endpoint shared by the studio and Claude Code).

## Scope
1. `packages/player`: loads a compiled game package, creates the sim and runs it.
   - **Loop:** a fixed-timestep accumulator around integer sim ticks; the browser frame callback
     lives here and nowhere else. Speeds: pause, 1×, 2×, 4× (Kairosoft-style fast forward).
   - **View:** sim state and events → the runtime draw list through **view bindings in data**
     (entity kind → asset, clip by state, facing, palette row). The view never changes the sim.
   - **Renderer adapter:** WebGL2, with the CPU backend drawn to a 2D canvas as the fallback
     when WebGL2 is missing.
2. **Host API**, written down in `docs/host-api.md`: renderer, audio, input, storage, clock and
   platform adapters. Everything except the renderer is optional; the game runs without it.
3. **The test protocol**, one implementation for every game, exposed as `window.__wz` in the
   browser and as a module in Node:
   - `describe()`: the state as text, with a coordinate-system note;
   - `step(ticks)`, `setSeed(seed)`, `command(cmd)`;
   - `runScript(script)`: a JSON action script (commands, steps, expectations, shots) that
     stops on the first error and returns the state text, digests and errors;
   - `shot()`: the native frame as a PNG, never a JPEG and never a browser screenshot.
4. **Headless runs in Docker:** `./dev npm run game -- run <id> --script <file>` plays the
   script in Node with the CPU backend and writes the state text, digests and integer-upscaled
   shots to `build/runs/<name>/`.
5. **Web target:** `./dev npm run game -- web <id>` writes `build/games/<id>/web/` (static
   `index.html`, one bundle, the package), served by any static server.
6. The example game `counter-shop` gets view bindings and one script that plays 500 ticks.

## Out of scope
- Tilemaps and cameras (`runtime-tilemap-scene`), text and UI (`runtime-text-ui`), input
  (`runtime-input`), FX (`fx-emitters`), audio (`runtime-audio`), saves (`player-saves`).
- The studio page that embeds the game (`studio-play-and-builds`).

## Acceptance
- The example script gives the same digests in the Node run as the sim-core replay, and its
  shots match stored golden hashes; `npm run check` runs it.
- In the host browser (Chrome DevTools MCP), `__wz.runScript` gives the same digests, and
  `__wz.shot()` equals the Node shot pixel for pixel.
- With WebGL2 disabled, the web target still draws through the CPU fallback.
- A script with a failing expectation exits non-zero and names the tick and the expectation.
