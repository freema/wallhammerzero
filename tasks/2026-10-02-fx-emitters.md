# FX EMITTERS: EFFECTS AS DATA, BAKED AND LIVE (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** runtime-text-ui, asset-render-cli

## Origin
D6: the owner cares most about animations and FX. D10: games are pure data, so an effect is a
record the runtime replays, not baked frames only. D23.

## Read first
- `research/code-graphics.md` §2.5 (FX catalogue, emitters as data, Kairosoft staples,
  readability over busy tiles) and §7.1 item 4.
- `research/ref-voxel-musou.md` §3.5–3.6 (debris, hit-stop and game-feel tricks).
- `research/ref-threejs-punk.md` §3.10 and §5.2 (stateless deterministic particles).
- `research/game-creator.md` §3.7 (parametric FX frames, `frame = f(distance, t)`).

## Scope
1. Asset kind **`fx`** in `asset-kit`: an emitter record as data (spawn shape, count or rate,
   lifetime, velocity and gravity in fixed point, palette ramp over life, frame stamps, seed),
   and a **stateless** integer evaluator: the particle set at frame `n` is a pure function of
   the record, the seed and `n`. So an FX can be scrubbed, baked and replayed identically.
2. The CPU evaluator renders into an `IndexedBuffer`, so bake, review sheets, lints, the studio
   player and verdicts work unchanged.
3. **Runtime playback from data:** FX instances in the draw list, using the same evaluator, so
   the live effect equals the bake.
4. **Screen FX as data:** integer shake (1–2 px), a flash wash (palette row swap), hit-stop.
5. The pack `assets/fx-core/` with the Kairosoft staples: floating numbers and labels (bitmap
   font, rise plus palette-step fade), sparkle, level-up burst, hearts, dust puff, money pop,
   emotes (`!`, `?`, zzz, sweat). Each stays readable over busy tiles (outline or a 1-px dark
   shadow).
6. `games/<id>/fx.json` (schema in `game-data`): a cue table from sim events to FX, placed at
   an entity or a cell. `counter-shop` shows a money pop on every sale.

## Out of scope
- Sliders on emitter parameters in the studio (`studio-params-sliders`).
- Weather, lighting layers and day/night palettes (first game's notes).

## Acceptance
- For every FX in `fx-core`, each frame drawn by the runtime (CPU backend) equals the baked
  frame; golden hashes are stored.
- Evaluating frame `n` directly equals stepping from 0 to `n`.
- The FX pass `lint` and appear in the studio player, where scrubbing works.
- In a headless `counter-shop` run, the shot after a sale shows the money pop (golden shot).
