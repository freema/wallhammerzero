# Phaser games for PixelDen

How a session builds a 2D game on Phaser 4 for PixelDen, and how Wallhammer supplies its art
and audio. The depth is in [research/phaser-pixelden.md](../../research/phaser-pixelden.md)
(Phaser 4 and PixelDen's architecture) and [research/pixelden-flow.md](../../research/pixelden-flow.md)
(PixelDen's `/new-game` and `/game-upgrade` flow); both verified 2026-10-14. This page only says
what to do.

PixelDen is the owner's other repo (`~/projects/nodejs/pixelden`, MIT, ©2026 the owner): a
React Router app hosting 54 game folders, each a lazy Phaser chunk, with its own commands,
ledgers and rules. Changes to PixelDen itself are the owner's call there; what this page
decides is how a game is written and how Wallhammer feeds it. Everything under "Wallhammer as
the art and audio factory" is a **proposal**.

## Facts to know first

- **Phaser 4 is stable.** 4.0.0 shipped 2026-04-10; the latest is 4.2.1 (2026-07-09), which
  fixes "ScaleManager not resizing to parent container", the exact path PixelDen's game host
  uses. PixelDen's lockfile pins **4.0.0**. Upgrading is a PixelDen call.
- **The host checkout's `node_modules/phaser` in PixelDen is a stale 3.90.0.** The container has
  the right one. Run every check, type check and test in the container; never trust types or
  behaviour read on the host.
- **Phaser 4 has no 3D.** `Mesh` and `Plane` are gone; `Mesh2D` is batched 2D triangles. A 3D
  game goes to Three.js ([threejs.md](threejs.md)). Pseudo-3D (raycaster, voxel space, software
  polygons) rasterises on the CPU into a `CanvasTexture` and uses Phaser as the blitter and HUD.
- **Removed in v4, still found in old code:** `setTintFill()` (now `setTint().setTintMode(FILL)`),
  `BitmapMask` (now the `Mask` filter), `preFX`/`postFX` (now filters), `setPipeline`,
  `Geom.Point` (now `Vector2`), `Math.TAU` is 2π. A write-time guard for these patterns is
  proposed in [research/game-skills-survey.md](../../research/game-skills-survey.md) §4.5;
  PixelDen's `ember-rise` still calls `setTintFill` through a cast.
- **The engine is about 352 kB gzip** (4.2.1 minified; 12 % more than v3). It does not
  tree-shake. A whole code-drawn game chunk is tiny next to it: Gloop is 56 kB gzip with all its
  art and music. Portal yardstick (CrazyGames): ≤ 20 MB initial download for the mobile
  homepage, ≤ 1,500 files, must run on a 4 GB Chromebook.

## The skeleton of a game

The house layout that emerged in PixelDen's best games (Tumblekin is the cleanest), now the
rule for a new one:

```text
app/games/<slug>/
  index.ts            getConfig(viewport) → Phaser.Types.Core.GameConfig; the only export the host reads
  engine/             pure, fixed-step (Tumblekin: 20 Hz), seeded, no Phaser import; replay(level, orders)
  levels.ts           tables; solutions.ts: a recorded solution per level, replayed by a test
  scoring.ts          maxScore, validateMeta, recomputeScore: the same module runs on client, server and in tests
  run.ts              folds level stats into the run metadata the host receives
  art/                pure pixel programs (string grids + legends, a palette); bake.ts is the only art file that touches Phaser
  audio/              pure sequencer + songs + sfx; one adapter to WebAudio
  scenes/             Boot → Menu → Game (→ UI overlay) → Results; scenes read the sim and draw it, they own no rules
  validation.test.ts  every way a run can end validates and recomputes to the same score
  strings.test.ts     every locale string renders in the pixel font and fits its slot
  levels.test.ts      every level is solvable by replaying its stored solution
```

Rules:

1. **Scenes own no rules.** Game rules run in the engine's own fixed step. Phaser's `TimeStep`
   smooths and caps `delta` (`panicMax` 120), so anything that reads Phaser's delta is not
   replayable. Use `delta` only for presentation (tweens, particles).
2. **The host contract is small and must be complete.** Talk to the host only through
   `game.events`: `game-start` on **every** run start (retries included, or plays are not
   counted), `score-update` progressively, `game-over` with `{score, cause, wave, durationSec,
   metadata}`, `level-complete`; read `i18n` and `locale` from `game.registry`. Teardown removes
   only the listeners the game added.
3. **Scoring is recomputed on the server.** `scoring.ts` is registered in PixelDen's
   `GAME_RULES`; `validateMeta` rejects impossible metadata and `recomputeScore` must reach the
   client's score from it. A deterministic sim can go further and replay the command log.
4. **The viewport is a layout, not a stretch.** `getConfig(viewport)` picks landscape (e.g.
   384×216) or portrait (216×384) from PixelDen's `viewport.ts`; `responsive-scale.ts` expands
   along one axis; `VIEWPORT_CHANGED_EVENT` restarts the scene, and **a restart must keep the
   run** (resize, rotation and the fullscreen toggle wiped runs in a dozen upgrade rows).
5. **Mobile is first-class.** `shared/touch-controls.ts` (joystick, steer, ≤ 2 action buttons;
   returns `null` on non-touch; needs `input.activePointers: 3`); tap targets ≥ 44 px; every
   button inside the visible canvas for every viewport variant; nothing under the page's
   fullscreen button (the single most repeated upgrade fix).
6. **Gamepad: none of the 54 games reads one.** For desktop and TV wrappers, an action map
   (actions, not key codes) over keyboard, pad and touch is the biggest portability win
   ([research/threejs-gameplay.md](../../research/threejs-gameplay.md) §4).
7. **Size budget: 2.5–5k lines**, one commit per milestone. Recent games landed at 9.5–14k lines
   in one commit; that is the anti-pattern.

## Rendering rules

- `pixelArt: true` in the config (it sets NEAREST, no antialias and `roundPixels: true`; the
  bare `roundPixels` default is now `false`). `smoothPixelArt` is not pixel art.
- **Scale.** `Scale.FIT` gives non-integer factors (384 → 2.6× at 1,000 px: some source pixels
  2 px wide, some 3). Proposal: integer scale when `floor(min(W/w, H/h)) ≥ 3`, letterboxed; FIT
  below that, because on phones filling the screen beats perfect pixels. 384×216 hits 3× at
  PixelDen's 1152×648 and 5× at 1080p exactly.
- **One atlas per game, frames padded ≥ 1 px.** Multi-texturing performs poorly on some mobile
  GPUs; loose PNGs per frame multiply binds and break batches. Code-baked textures at boot
  (`createCanvas` → `putImageData` → `CanvasTexture.refresh()`, sheets wrapping at 1024 px) ship
  zero files and cannot 404.
- **Batching:** the default batch is 16,384 quads; it breaks on any change of filter, blend
  mode, lighting or round-pixel mode. Keep draw calls to "a few hundred".
- **Filters are framebuffer passes.** One camera filter for vignette, CRT or scanlines; never a
  filter or mask per object (16 masked containers dropped the frame rate on an M4).
- **Prefer code-drawn bitmap fonts to `Text`.** Open v4 issues: transparent `Text` renders as
  black boxes on iPadOS ≤ 16.4 (#7392) and rotated quads in a multi-texture batch show wedges
  (#7372: fanned cards, so `mau-mau`, `solitaire`, `dead-mans-hand`). Y-up texture coordinates:
  PNGs are handled; custom UVs need `v0 = 1 - y/h` (Tumblekin's boot scene shows it).
- `SpriteGPULayer` and `TilemapGPULayer` are for a million sprites or 4096² tiles; a PixelDen
  game at 384×216 with a few hundred sprites does not need them.

## Audio rules

- **One `AudioContext`.** Phaser makes its own `WebAudioSoundManager` unless the config sets
  `audio: { noAudio: true }` or passes `audio: { context }`. PixelDen's games set neither and
  about 30 create a private context on top; pass the shared one so Phaser's unlock, visibility
  and `interrupted` handling cover the synth too.
- **iOS:** set `navigator.audioSession.type = "playback"` (feature-detected) on the first
  gesture, or the hardware mute switch silences Web Audio. Resume on `statechange`.
- **No audio files.** PixelDen's `load.audio` count is zero; all sound is procedural. The
  sequencer copied into eight games is what `@whz/audio` replaces (below).

## Saves

PixelDen's `shared/cloud-progress.ts` is the pattern: localStorage keys per game, a pure
`parse`/`merge`/`summary` per key that only ever moves progress forward, a `maxBytes` per key,
the same code on client and server; the payload already carries `version: 1`. Mute and settings
stay in localStorage in a try/catch (private mode). When a save shape changes, add a migration
step rather than treating the old shape as invalid.

## Testing: three tiers

Details and the shared hook contract are in [testing.md](testing.md).

| Tier | What | How |
|---|---|---|
| T1 pure sim | engine, scoring, levels, strings | Vitest, `node` environment; bots over many seeds; replay the stored solutions |
| T2 headless Phaser | scene wiring: every texture key a scene uses is registered at boot, `game-over` carries a valid payload, touch buttons are inside the viewport, `scene.restart()` leaks no listeners | Phaser's own `tests/helper.js` pattern (MIT, in the npm package): `type: Phaser.HEADLESS`, jsdom, `noAudio`; then `game.loop.sleep()` and `game.step(t += 16.667, 16.667)` for N frames |
| T3 browser | zero console errors, zero 404s, a full run by synthetic input, the score POST, one mobile emulation, screenshots | Chrome DevTools MCP; `MouseEvent` with `view: window` after `game.scale.updateBounds()`; `game.renderer.snapshot()` (WebGL clears its buffer, so `toDataURL` is blank); a dev-only `window.__pd` hook instead of walking the React fiber (proposal) |

Headless WebGL in a container needs `--use-gl=angle --use-angle=swiftshader-webgl
--enable-unsafe-swiftshader` since Chrome 139; `--disable-gpu` alone breaks WebGL.

## Wallhammer as the art and audio factory (proposal)

The cheapest useful link between the repos: a PixelDen game stays a normal Phaser module
written by a session, but its sprites and music come from Wallhammer sources, reviewed in the
studio with verdicts bound to output hashes. PixelDen's in-game kit (RGBA string grids,
legends, a bake into canvas textures; NES-style step strings) is an earlier version of
`@whz/asset-kit` and `@whz/audio`, so the mapping is direct.

**Art.** Asset programs live in `assets/pixelden-<slug>/…` with a palette in
`assets/palettes/`, and go through lint → review sheets → the gallery like any pack
([docs/asset-pipeline.md](../asset-pipeline.md)). Two ways into Phaser:

- **Bake at build time** (recommended for tiles, backdrops, big sets):
  `./dev npm run asset -- bake <id>` writes a sheet PNG and `atlas.json` (`wz.atlas/1`:
  frames with `x,y,w,h`, `duration` per frame, clips with `loop` and `start` per facing, `pivot`,
  the palette). A converter writes Phaser **JSON Hash** with `anchor` per frame (Phaser's
  `JSONHash.js` reads `anchor` or `pivot`); the Phaser Compact Texture format has no pivots, so
  it is the wrong target. Files are named by the output hash, which also defeats the portal's
  immutable cache.
- **Render at boot** for small parametric things (variants, palette swaps): the kit's main entry
  has no I/O and runs unchanged in the browser; a ~60-line adapter turns `IndexedBuffer` +
  palette → RGBA → `CanvasTexture`, clips → `anims.create`, pivot → `setOrigin(px/w, py/h)`.

```ts
// Clips map 1:1. In Phaser 4.0.0 and 3.90.0 a frame's non-zero `duration` *replaces*
// msPerFrame (Animation.getNextTick), so wz.atlas durations go straight in: no 1000 fps
// base, no subtraction. Keep one test on a clip with unequal durations.
this.anims.create({
  key: `${id}:${clip.name}`,
  frames: clip.frames.map((f) => ({ key: sheetKey, frame: f.index, duration: f.duration })),
  repeat: clip.loop ? -1 : 0,
});
sprite.setOrigin(pivot[0] / size[0], pivot[1] / size[1]);
```

**Audio.** `renderSong` and `renderSfx` of `@whz/audio` render `wz.song/0.1` and `wz.sfx/0.1`
deterministically in plain TS; the gate checks the PCM hash ([docs/audio.md](../audio.md)).
In the game: render once at boot into an `AudioBuffer` and `this.cache.audio.add(key, buffer)`;
Phaser's `WebAudioSound` plays an `AudioBuffer` from the cache, so unlock and interruption
handling come free. Pre-rendered WAV files are the wrong default (about 11.5 MB per minute of
stereo 48 kHz loop). Adaptive music streams through the `SongPlayer` in an `AudioWorklet`
(128-frame blocks; read the array length, do not assume it), which is queue #25's job: do that
note first and reuse it, so there is no third sequencer copy. Note that `@whz/audio` depends on
`@whz/asset-kit` as well as `@whz/det`; a worklet bundle must tree-shake or cut that.

**Fonts.** PixelDen's `strings.test.ts` needs glyph coverage and pixel widths per string. An
asset-kit font export plus a metrics JSON keeps that test as it is; the export shape is open.

**Delivery, an owner call.** The dev container mounts only this repo. Either an export that
writes into a mounted PixelDen path (`public/assets/games/<slug>/` plus a manifest), or a
PixelDen-side import that reads Wallhammer's build folder. Both touch the "Docker only" and
repo-boundary rules, so neither is done until the owner picks.

**What stays in PixelDen:** the registry entry, scoring and `GAME_RULES`, i18n and FAQ,
achievements and cloud keys, thumbnails and share cards, the browser proof. PixelDen's art
step then reads "Art and audio: Wallhammer pack `pixelden-<slug>`, approved in the studio"
instead of "Art (PixelLab)". Whether image generation stays allowed in Wallhammer-made PixelDen
games is an open owner question (D12 applies here; PixelDen's own rules apply there).

**Order of work:** runtime audio (#25) designed to run in a plain worklet → the atlas adapter
plus one pilot asset (a Tumblekin kin redone in asset-kit) → the delivery step → one game end
to end. The other options (a full export of a Wallhammer data game onto a PixelDen `mount()`
entry; a Phaser player for our game data) are in the research and should wait.

## PixelDen drift a session will meet

Known and verified; all are PixelDen's own calls, listed so a session is not misled:

- PixelDen's game-development doc (`~/projects/nodejs/pixelden/docs/GAME-DEVELOPMENT.md`)
  describes a Phaser 3 game (PNG per frame, Gemini sprites, `preserveDrawingBuffer`); the
  newest games draw in code and no config sets `preserveDrawingBuffer`. Its bundle doc quotes
  v3 sizes and a removed `manualChunks` block.
- `art/raster.ts` is byte-identical in 9 games (12 carry it), the audio `music.ts` in 8, `font.ts`
  in 8 versions: a fix in one reaches none of the others. The proposed fix is a shared
  `shared/pixel/` folder, or this repo's kits.
- The `phaser-gamedev` skill still says "Phaser 3" in its description and five references; the
  28 official Phaser skills are byte-identical to upstream except one later `REFERENCE.md`
  change. They are third-party under our rules (read for ideas; intake before copying).
- CI runs lint, typecheck and format, **not Vitest** (153 test files). Whether tests ran
  depends on the session, so run them.
- The upgrade ledger has never used `NO-ACTION` or `BLOCKED` in a row, although both commands
  define them. Use them.

## Checklist for a session

Before code:

- [ ] Read PixelDen's `CLAUDE.md`, the two commands and the ledgers; the hook technique is
      one the portal does not have, and the concept is in the ledger with the owner's pick.
- [ ] The spec names the loop, the scoring formula, difficulty at minutes 1/3/5, scenes,
      controls for keyboard and touch, the viewport variants, the asset list, and milestones
      with a check each.

While building:

- [ ] The engine is pure, fixed-step, seeded; bots play it before any art exists.
- [ ] `scoring.ts` is registered; `validation.test.ts` covers every end cause.
- [ ] Every level has a stored solution replayed by a test.
- [ ] Art is code (a Wallhammer pack once the delivery step exists); one atlas; `pixelArt: true`.
- [ ] One `AudioContext` shared with Phaser; `audioSession.type = "playback"` on iOS.
- [ ] `game-start` on every run start; a resize or rotation keeps the run; nothing under the
      fullscreen button; tap targets ≥ 44 px; the strings test passes in every locale.

Before the commit:

- [ ] In the container: typecheck, lint, test, format, build. Then T2 if it exists, then the
      browser proof with zero console errors and zero 404s, desktop and one mobile emulation.
- [ ] Temporary cheat hooks are gone (grep proves it); the `Verified:` line names the evidence.
- [ ] Same defect failed twice → `BLOCKED` in the ledger and a report; no third attempt.
- [ ] The commit is one milestone, not the whole game.
