# Phaser for PixelDen games, and Wallhammer as a PixelDen producer

*Research date: 2026-10-14. Status: proposal only.*

Legend: **[S]** sourced (link inline, full list in [Sources](#sources)), **[O]** my opinion,
**[U]** unverified. "Measured" means I ran it read-only in this session (curl of the npm CDN,
`wc`/`gzip`/`md5` over the PixelDen checkout at `~/projects/nodejs/pixelden`, commit `781ee28`).

Builds on: [game-creator.md](game-creator.md) (test protocol, §4),
[multiplatform.md](multiplatform.md) (Electron/Capacitor, §1–2), [audio-from-code.md](audio-from-code.md),
[code-graphics.md](code-graphics.md). Nothing in `research/` covered Phaser itself or PixelDen
before this report.

---

## Summary

1. **Phaser 4 is stable and current.** v4.0.0 "Caladan" shipped 2026-04-10; the latest is
   **v4.2.1 (2026-07-09)** [S: npm registry, GitHub releases]. PixelDen's lockfile pins
   **4.0.0**, so it misses a ScaleManager parent-resize fix, a tween `startDelay` fix and ESM
   export fixes that matter to it directly [S: v4.1.0/v4.2.1 notes].
2. **The v4 engine is ~12 % bigger, not smaller:** `phaser.min.js` 3.90.0 = 315 kB gzip,
   4.2.1 = 352 kB gzip (measured). PixelDen's own build chunk is 1.36 MB / 361 kB gzip
   (measured), and its `docs/bundle-splitting.md` still quotes the Phaser 3 number
   (1,208 kB / 332 kB) and a `manualChunks` setting that no longer exists in `vite.config.ts`.
3. **The real v4 changes for a pixel-art portal:** `pixelArt: true` still forces
   `roundPixels: true` (the bare default flipped to `false`) [S: Config.js]; FX/masks became
   filters (each one a framebuffer pass) [S]; `DynamicTexture` needs `render()` [S]; GL
   Y-up texture coordinates (PixelDen's code-drawn fonts already handle it with `v0 = 1 - y/h`);
   `Mesh`/`Plane` were removed, so **Phaser 4 has no 3D at all** [S].
4. **Headless testing has three tiers:** a pure sim in Vitest (PixelDen already does this
   well); a real `Phaser.HEADLESS` game in jsdom using the pattern Phaser ships in
   `tests/helper.js` (MIT) [S]; and a real browser. Chrome removed the automatic SwiftShader
   fallback in M139, so headless WebGL now needs `--enable-unsafe-swiftshader` [S; see the
   sourcing note in §3, tier 3].
5. **PixelDen does a lot right:** one lazy chunk per game, a server-safe registry, a small event
   contract, deterministic sims with replay-proof level solutions, server-side score
   recomputation, cloud-save merges that only move forward, and two ledger-driven commands.
6. **What it should change:** its docs drifted (Phaser 3 era, Gemini pipeline, stale bundle
   numbers); the code-art and music infra is **copy-pasted verbatim** (`art/raster.ts` is
   byte-identical in 9 games and `audio/music.ts` in 8); every test walks the React fiber to
   find the game because there is no test hook; about 30 games build their own `AudioContext`
   helper while Phaser silently makes another one; and it has no integer-scale option.
7. **Wallhammer → PixelDen:** the cheapest useful path [O] is **"Wallhammer as the art + audio
   factory for a Phaser game"**. `@whz/asset-kit` and `@whz/audio` run unchanged in the browser,
   so a PixelDen game can bake its sprites and songs at boot, as Gloop and Tumblekin already do with
   their copied helpers, but from reviewed, hash-pinned sources. A full "Wallhammer game data on
   a Phaser player" export is a second player (like Godot "B") and should wait.

---

## 1. The state of Phaser 4 (2025–2026)

### 1.1 Releases

| Version | Date | Notes |
|---|---|---|
| 4.0.0-rc.1…rc.7 | 2025-04 → 2026-03-25 | Long RC phase; 3.90.0 (2025-05-23) is the last v3 [S: npm] |
| **4.0.0 "Caladan"** | 2026-04-10 | New renderer, filters, GPU layers, tint modes, "28 skill files" for AI agents [S: GitHub release] |
| 4.1.0 "Salusa" | 2026-04-30 | `Layer` becomes a real GameObject (filters on layers work); ESM default export, `Class` and `LOG_VERSION` exports fixed [S] |
| 4.2.0 "Giedi" | 2026-06-19 | `Stencil`, `CustomContext`, `Mesh2D` (textured 2D triangles), `render.stencil`, `alphaStrategy` [S] |
| **4.2.1** | 2026-07-09 | **"Fix ScaleManager not resizing to parent container" (#7213)**, tweens stuck in `startDelay`, ESM namespace fixes [S] |

Phaser Studio says all new development is v4 only and v3 is "very likely" finished [S: Phaser
World, 2025]. [refuted 2026-10-14: the cited Sept 2025 newsletter says nothing about v3's future;
it only calls rc.7 "the final RC". The only sourced statement is the 2026-05-13 post: "If you're
starting a new project, there's no reason to start on Phaser 3". The "very likely finished" quote
is [unconfirmed].] For new projects their own comparison post (2026-05-13) recommends v4 and estimates
"a few hours" of migration for standard-API games [S].

### 1.2 What changed that a pixel-art game notices

- **Renderer.** Pipelines were replaced by single-purpose `RenderNode`s, and WebGL state is
  tracked so context loss can be restored [S: 4.0.0 notes; rendering-concepts tutorial]. Don't
  make raw `gl` calls; use an `Extern` object [S: migration skill].
- **Batching rules** (rendering-concepts tutorial, undated, © 2026) [S]:
  - The default batch is 16,384 quads.
  - A batch breaks on any change of filter, blend mode, lighting or round-pixel mode.
  - "Don't use more than a few hundred" draw calls.
  - Multi-texturing "can perform poorly on some mobile devices", so one atlas per game beats
    many loose textures.
  - Pad atlas frames by ≥ 1 px.
- **Filters = framebuffer passes.** Each filter "is a shader pass rendering to its own
  framebuffer", so filters add draw calls and memory [S]. One open issue reports a big FPS drop
  from 16 containers with one `addMask()` each, on an Apple M4 (#7306, 2026-05-20) [S]. [O] For
  vignettes, CRT and scanlines, use **one camera filter**, not per-object filters.
- **Pixel settings** [S: `src/core/Config.js` 4.2.1]:
  - `pixelArt: true` sets NEAREST, `antialias`/`antialiasGL` false and `roundPixels` true.
  - The bare `roundPixels` default is now `false`.
  - The new `smoothPixelArt` keeps blocky texels but smooths their edges when scaled up. It
    looks better on rotated or scaled sprites, but it is not "pure" pixel art.
  - `GameObject#vertexRoundMode` (`off`/`safe`/`safeAuto`/`full`/`fullAuto`) sets rounding per
    object [S: migration skill].
- **Removed or renamed** [S: Phaser 3 vs 4 post, migration skill]:
  - `setTintFill()` → `setTint().setTintMode(FILL)`
  - `BitmapMask` → the `Mask` filter
  - `Geom.Point` → `Vector2`
  - `Math.TAU` now = 2π
  - `Struct.Set`/`Map` → native [unconfirmed: not in the 3-vs-4 post nor in the migration skill]
  - `Mesh`/`Plane` removed (confirmed in the 3-vs-4 post): "proper 3D support is planned for the
    future" (no date) [unconfirmed: the quote is in neither the post nor the migration skill]
- **Y-up texture coordinates.** PNGs are handled automatically; compressed textures and custom
  UVs are not [S]. PixelDen's `tumblekin/scenes/boot.ts` already writes `v0: 1 - r.y / th` when
  it registers its code-drawn BitmapFont (measured): the team has absorbed this one.
- **New objects worth knowing:**
  - `SpriteGPULayer`: up to 1M+ static-ish sprites in one draw, 168 bytes per member on both
    CPU and GPU; editing members is expensive; one texture [S, 2026-05-28].
  - `TilemapGPULayer`: a whole orthographic layer as one quad, up to 4096² tiles; per-pixel
    cost; may be slower on some mobile GPUs [S].
  - `Noise*`, `Gradient`, `CaptureFrame`, `Stamp` [S].
  - [O] These are for big maps or particle fields. PixelDen games (≤ a few hundred sprites at
    384×216) don't need them.
- **Phaser Compact Texture (PCT)** atlas format: a line-based text format, "typically 90–95 %
  smaller" than JSON atlases, loaded with `this.load.atlasPCT()` [S: spec in the npm package].
  It has trimmed frames but **no pivots**, and rotation is reserved. [O] For us the classic JSON
  Hash format is better: Phaser's `JSONHash.js` reads `anchor` or `pivot` per frame [S: source],
  and our pivots matter.

### 1.3 Performance, mobile, and known v4 bugs

- **No vendor benchmark gives devices or FPS.** The "100×" and "1M sprites" claims for
  `SpriteGPULayer` come with no methodology [S]. Treat them as desktop best cases [O].
- **Open v4 issues that hit PixelDen's kind of game** [S: GitHub issues, all on 4.1–4.2.1]:
  - **#7392 (2026-10-06):** on iPadOS ≤ 16.4, transparent `Text` textures render as black
    boxes in 4.2.1, caused by a divide-by-alpha in `ApplyTint.glsl`. A Norwegian broadcaster's
    word game hit it after upgrading.
  - **#7372 (2026-09-10):** in a multi-texture batch, rotated quads with different textures
    show transparent wedges or a neighbour's texture. `Text` objects on a slightly rotated
    parent (a fanned hand of cards) are the easiest repro. **Relevant to `mau-mau`,
    `solitaire` and `dead-mans-hand`**, which rotate cards (measured: 9, 3 and 2 rotation
    calls [unconfirmed exact count: a re-grep for `setRotation|setAngle|rotation|angle` gives
    10, 3, 2; the conclusion stands]).
  - **#7351:** camera zoom ≠ 1 with a manual HiDPI canvas goes blank.
  - [O] Code-drawn bitmap fonts (Gloop, Tumblekin, Redline…) dodge #7392 and #7372 entirely.
    That is one more reason to prefer them over `Text`.
- **Bundle (measured, minified, gzip -9):**

  | Build | raw | gzip |
  |---|---|---|
  | 3.90.0 `phaser.min.js` | 1,196 kB | 315 kB |
  | 4.0.0 `phaser.min.js` | 1,352 kB | 346 kB |
  | 4.2.1 `phaser.min.js` | 1,376 kB | 352 kB |
  | 4.2.1 `phaser-arcade-physics.min.js` (no Matter) | 1,266 kB | 320 kB |
  | PixelDen `build/client/assets/phaser.esm-*.js` | 1,364 kB | 361 kB |

  Phaser does not tree-shake (PixelDen's doc says so correctly). No PixelDen game uses Matter
  (measured: no `physics.matter`; 11 of 54 configs use Arcade, the rest no physics). The
  arcade-only build saves ~33 kB gzip, but it is a UMD file, not ESM, so it needs a Vite alias
  and a smoke test [U] for a small win. [O] Not worth it before the 4.2.1 upgrade.
- **Size budgets from portals** (a useful yardstick, CrazyGames requirements page, undated)
  [S]:
  - Initial download ≤ 50 MB, and ≤ 20 MB to be eligible for the mobile homepage.
  - At most 1,500 files.
  - Must run on a 4 GB Chromebook.
  - On iOS, audio must resume from a user gesture.

  A whole code-drawn PixelDen game is far inside this: the Gloop chunk is 184 kB raw / 56 kB
  gzip including all its art and music (measured).

---

## 2. Best practices for medium Phaser games, checked against PixelDen

"Medium" = PixelDen's own 2.5k–5k LOC target (`.claude/commands/new-game.md`). Measured range
today: 976 (vault-run) to 16,129 LOC (detention-deep) across 54 games.

### 2.1 Scene and module structure

- **Pattern that works [O, grounded in PixelDen's best games]:**
  - `engine/` (pure, fixed-step, seeded, no Phaser)
  - `levels.ts` / `data.ts` (tables)
  - `art/` (pure pixel programs) and `audio/` (pure sequencer + songs)
  - `scenes/` (Boot → Menu → Game → Results, plus a UI overlay scene where the HUD is busy)
  - `scoring.ts` (server-side `validateMeta`/`recomputeScore`)
  - Tumblekin runs a 20 Hz deterministic sim over a `Uint8Array` mask, and `solutions.ts`
    proves every level is clearable with all 3 glimmers (measured: `tasks/77-tumblekin.md`).
    That is the strongest pattern in the repo.
- **Don't** let scenes own rules. Scenes read the sim and draw it. The `/new-game` command
  already demands "the hook as a headless-testable module … before any art" (good).
- Communicate with the host only through `game.events` (`game-start`, `score-update`,
  `game-over` with `cause`/`wave`/`durationSec`) and read host data from `game.registry`
  (`i18n`, `locale`). PixelDen's `GameCanvas` does exactly this (measured,
  `app/components/game-canvas.tsx` L398–631).

### 2.2 Asset loading

- **Code-baked textures at boot** (Gloop, Tumblekin, Liftwell, Sandcrown… ship ≤ 4 files:
  thumbnail, OG card, sometimes a PixelLab backdrop) avoid 404s, loaders and atlas drift.
  PixelDen bakes `Pix` buffers into `CanvasTexture`s (`art/bake.ts`: `createCanvas` →
  `putImageData` → `refresh`; sheets wrap at 1024 px). Fine for ≤ a few MB of pixels [O].
- **File-based games** should use **one atlas per game with 1–2 px padding** [S:
  rendering-concepts], not "individual PNG files per frame", which `docs/GAME-DEVELOPMENT.md`
  still prescribes. Loose frames multiply texture binds and break batches.
- Animations: `anims.create({ frames: [{ key, frame, duration }] })` supports per-frame
  durations [S: `AnimationFrame.js` has `duration`]. That maps 1:1 to asset-kit clips
  (`durations` per frame).

### 2.3 Pixel-art settings

- **Low internal resolution, upscaled.** Tumblekin and Redline render 384×216 (desktop) or
  216×384 (mobile portrait), and `Scale.FIT` upscales nearest (measured).
- **FIT gives non-integer scales.** At a 1,000 px wide container, 384 → 2.6×, and nearest
  then draws some source pixels 2 px wide and others 3 px. MDN notes that uneven pixel sizes
  also come from fractional `devicePixelRatio` [S]. Options [S: Phaser scale skill, forum]:
  - `scale.zoom: Phaser.Scale.MAX_ZOOM` = the largest integer multiplier that fits.
  - Or compute `k = floor(min(W/w, H/h))` and letterbox the rest.
- **Recommendation [O]:** an opt-in `integerScale` in `shared/viewport.ts`. Use integer scale
  when k ≥ 3, and FIT below that: on phones, filling the screen beats perfect pixels.
  384×216 hits 3× = 1152×648 (PixelDen's registry size, measured) and 5× = 1920×1080 exactly.
- `pixelArt: true` everywhere (53/54 configs, measured). `roundPixels: true` is implied by it in
  v4 [S], so the explicit flag in 12 configs is harmless but redundant.

### 2.4 Scaling and letterboxing

PixelDen already has three opt-in layers (measured):
- `viewport.ts`: desktop/mobile/fullscreen sizes, resolved by `(max-width: 900px)` + coarse
  pointer.
- `responsive-scale.ts`: `setGameSize` that expands along one axis with `snap` and
  `maxExpand`; it is pure and unit-tested.
- A `VIEWPORT_CHANGED_EVENT` → `scene.restart()` contract.

[O] This is a good design: let the game pick a portrait or landscape *layout* rather than
stretching one. The 4.2.1 fix "ScaleManager not resizing to parent container" [S] touches exactly
the path `GameCanvas` uses, which is a concrete reason to upgrade.

### 2.5 Touch controls

`shared/touch-controls.ts` (460 lines) gives a 4/8-dir or horizontal joystick plus ≤ 2 buttons.
It returns `null` on non-touch devices, keyboard stays unconditional, and it needs
`input.activePointers: 3` (measured, CLAUDE.md). The upgrade command checks ≥ 44 px tap targets.
[O] It is missing only a "reach" check in tests. Assert in the headless tier (§3) that every
button lies inside the visible canvas for each viewport variant.

### 2.6 Audio

- **What PixelDen does:** zero audio files. `load.audio` appears 0 times (measured). All sound is
  procedural WebAudio:
  - `shared/audio.ts` (tone/noise/arp) is used by only 3 games. [refuted 2026-10-14: 29 of 54
    games import `createGameAudio` from `shared/audio` (grep of `from "../../shared/audio"`);
    many of them *also* create a second private `AudioContext` for music, so the real picture
    is "shared SFX helper + private music context + Phaser's own context" in most games.]
  - About 30 games have their own `audio.ts`/`sfx.ts`/`music.ts`, each creating its own
    `AudioContext` (measured; re-measured 2026-10-14: 30 game folders contain `new AudioContext`).
- **Problem 1, a double context [O, mechanism S]:** Phaser creates a `WebAudioSoundManager`
  with its own `AudioContext` unless the config sets `audio: { noAudio: true }` or passes
  `audio: { context }` [S: Phaser audio skill]. No PixelDen config sets either (measured
  `noAudio`: 0). The fix is one line in each config, or in `GameCanvas`: pass the game's shared
  context so Phaser's unlock and visibility handling covers the custom synth too.
- **Problem 2, iOS mute switch:** WebKit treats Web Audio as "ambient", so the hardware mute
  switch silences it [S: WebKit bug 237322]. `navigator.audioSession.type = "playback"`
  (feature-detected) changes that [S: MDN AudioSession; WebKit bug]. When another app takes
  audio, contexts go `interrupted` and resume on `statechange` [S: MDN]. Phaser's manager
  already resumes `suspended` and `interrupted` contexts on focus [S: `WebAudioSoundManager.js`
  L419/L478]. [O] Set `audioSession.type` once in `GameCanvas` on the first gesture.
- **Problem 3, copy-paste:** the chiptune sequencer `audio/music.ts` is **byte-identical in 8
  games** (furrowfield, gloop, liftwell, rooftop-rush, sandcrown, scrapwing, tumblekin,
  wobble-cup; md5 `2f6f6f…`). A bug fixed in one is fixed in none of the others.

### 2.7 Save data

PixelDen's `shared/cloud-progress.ts` is a strong pattern (measured):
- localStorage keys per game.
- A pure `parse`/`merge`/`summary` per key, where merges "only ever move progress forward".
- A `maxBytes` per key.
- The same pure code runs on the client and the server.

[O] Add one thing: a `v` field per key, so a game can change its save shape without the merge
treating the old shape as invalid. Mute and settings belong in localStorage, wrapped in
try/catch (private mode).

### 2.8 Bundle splitting

Splitting still works because `GameCanvas` does `import(\`../games/${slug}/index.ts\`)` and
`import("phaser")` (measured). Vite emits `phaser.esm-<hash>.js` plus one `index-<hash>.js` per
game.
- The documented `manualChunks` (`game-<slug>-[hash].js`) is gone from `vite.config.ts`
  (measured), so the doc is stale. The behaviour is not.
- The SSR stub plugin (a Proxy standing in for `phaser` on the server) is a neat trick.

---

## 3. Testing Phaser games headlessly

Three tiers, cheapest first. This builds on [game-creator.md §4](game-creator.md#4-how-it-verifies-output),
whose protocol (state as text, time stepping, seeded scripts, stop on the first console error)
still applies.

**Tier 1: the pure sim in Vitest (no Phaser).**
- PixelDen: `vitest.config.ts` uses the `node` environment over `app/**/*.test.ts`. There are
  138 game test files plus 4 for the shared helpers (measured). [refuted 2026-10-14, minor:
  `find app/games -name '*.test.ts'` = 142 = 137 in game folders + 1 `app/games/og-cards.test.ts`
  + 4 in `shared/`.] 8 of 54 games have none:
  bubble-shooter, columns, flappy, invaders, ore-merge, pixel-racer, relic-rush and
  terra-claim.
- Best examples:
  - Tumblekin `levels.test.ts` replays recorded orders and proves each level solvable.
  - Gloop `art/art.test.ts` checks that sprite grids parse.
  - `strings.test.ts` checks that font glyphs cover EN/ES/DE labels.

**Tier 2: a real headless Phaser game in jsdom.**
- Phaser 4 ships its own pattern in the npm package (MIT) [S: `tests/TESTING.md`, `tests/helper.js`]:
  - Vitest + jsdom.
  - `setup.js` mocks Canvas 2D/WebGL contexts and an `Image` that fires `onload`, and stubs
    `self`, `screen` and `window.focus`.
  - `helper.createGame(config)` boots `type: Phaser.HEADLESS` with audio off and resolves with
    a live Scene.
  - The guide says not to test "anything requiring actual pixel rendering".
- For deterministic stepping:
  - Phaser exposes `game.loop.sleep()` / `wake()` and `game.step(time, delta)`. `HEADLESS`
    runs `headlessStep` [S: `Game.js` L422/454/523, `TimeStep.js` L781/800].
  - So a test can sleep the loop and call `game.step(t += 16.667, 16.667)` N times.
  - Phaser's `TimeStep` smooths and caps delta (`smoothStep`, `panicMax` 120) [S], so
    **game rules must not depend on Phaser's delta**. Run them in the sim's own fixed step,
    as Tumblekin does.
- [O] Use this tier for scene wiring: Boot registers every texture key a scene uses, `game-over`
  carries a valid payload, touch buttons are inside the viewport, and `scene.restart()` on
  `viewport-changed` doesn't leak listeners.

**Tier 3: a real browser.**
- PixelDen's commands drive Chrome DevTools MCP:
  - synthetic `MouseEvent`s with `view: window` after `game.scale.updateBounds()`;
  - keyboard events on `window`;
  - then **walking the React fiber of the canvas's parent** to find the `Phaser.Game`.
- [O] That last step is the brittlest part of the flow. Expose a dev-only hook instead.
  `GameCanvas` already holds `gameRef`, so add
  `if (import.meta.env.DEV || ?test) window.__pd = { game, slug, state: () => scene.debugState?.(), step: ms => … }`.
  Have each Game scene implement `debugState()` that returns compact JSON (game-creator's
  `render_game_to_text`).
- **Screenshots:**
  - WebGL clears its buffer after each frame, so `canvas.toDataURL()` is blank unless
    `render.preserveDrawingBuffer: true`, which costs some performance [S: Phaser forum;
    rendering docs].
  - PixelDen's older template sets it; newer configs don't (measured: 0 of 54), and its
    commands correctly use `game.renderer.snapshot()` instead.
- **Headless WebGL:**
  - Chrome deprecated the automatic SwiftShader fallback from M130. From **M139**, WebGL
    context creation fails instead of falling back. Opt in with `--enable-unsafe-swiftshader`,
    meant for trusted content only [S: blink-dev intent; chromedp v0.14.1; Edge policy].
    [verified 2026-10-14 with a correction of the sourcing: the blink-dev intent itself says
    "deprecation began in Chrome 130" and estimates shipping in **137**; M139 comes from the
    Chromium policy page and chromedp's v0.14.1 note ("Chrome 139+"). The Edge policy page says
    Edge deprecates SwiftShader from **Edge 144**, not 139 (139 is only the policy's minimum
    supported version). The flag name is confirmed.]
  - [O] For a Dockerised Playwright run this flag is mandatory, and `--disable-gpu` alone now
    breaks WebGL [S: chrome-use commit, via search summary; U].
- **Fixed time in the browser:** Playwright's `page.clock` (game-creator §4.1) or the
  `loop.sleep()` + `game.step()` hook above.

---

## 4. Where Phaser is the wrong tool

| Need | Phaser 4 | Three.js | Our runtime (`packages/runtime`) |
|---|---|---|---|
| 2D sprites, tilemaps, UI, tweens, arcade physics, many small games fast | **Best fit** [O] | Overkill | Possible, but we would rebuild what Phaser has |
| Real 3D (depth buffer, perspective camera, lights, GLTF) | **No**: `Mesh`/`Plane` removed; `Mesh2D` is 2D triangles batched with sprites [S] | **Best fit** (New Hope, D30) | No |
| Retro pseudo-3D at low resolution (raycaster, voxel space, a software polygon renderer) | Works as a texture host: Redline Pursuit rasterises 384×216 on the CPU into a `Uint32Array`, then `putImageData` + `CanvasTexture.refresh()` each frame (measured `render/screen.ts`) | Better beyond ~320×240 or for many triangles [O] | Same CPU approach, deterministic |
| Bit-exact determinism, replays, a second (Godot) player | Not designed for it: float transforms, smoothed delta [S: TimeStep]. Fine if the *sim* is separate | No | **Designed for it** (D10, D18, det lint) |
| Pixel-perfect review and hashing of assets | Doesn't care | Doesn't care | Yes (CPU reference backend) |

[O] For a PixelDen-style arcade portal, Phaser is right: the cost per game is the game code, and
Phaser gives scenes, input, tweens, cameras and audio unlock for free. Phaser is wrong for New
Hope (3D) and for anything that must replay bit-exactly on a second engine. PixelDen's "3D"
games (Dungeon Cast raycast, Strafe Run voxel space, Ion Rush segment pseudo-3D, Redline
software polygons) are all **software renderers that use Phaser only as a blitter and HUD**. That
is a valid retro trick, but the renderer is the game's own code either way.

---

## 5. PixelDen: what it does well, what to change

### 5.1 Does well (measured unless marked)

1. **Isolation:** each game is a lazy chunk. The server-safe `registry.ts` has no Phaser
   import, and the SSR stub plugin keeps Phaser out of the server bundle.
2. **A small host contract:** `getConfig(viewport)`, `game.events` (`game-start`,
   `score-update`, `game-over` with a typed `RunEndCause`), and `game.registry` for i18n and
   locale. Teardown removes only its own listeners and guards the Firefox keyboard crash
   (PIXELDEN-X).
3. **Anti-cheat by recomputation:** `scoring.ts` exports `validateMeta` and `recomputeScore`,
   registered in `GAME_RULES`.
4. **Deterministic sims with proofs** (Tumblekin replay and solutions; Pixel Kart has 12 test
   files; Detention Deep 12).
5. **Graphics as code is already the house style** for the newest games. They use a
   string-grid DSL with legends, which throws on an unknown character with a position, plus a
   palette and pure `Pix` buffers. This is the same idea as our `parseStamp` and
   `IndexedBuffer`, arrived at independently.
6. **Process:** `/new-game` and `/game-upgrade` are ledger-driven, one game per run. Rejected
   concepts are recorded (`tasks/new-game-ledger.md`, 43 lines). There is a gate for "two
   failures on the same defect → stop", and verification is on state, not vibes.
7. **Mobile is a first-class citizen:** viewport variants, a responsive helper, shared touch
   controls and a mobile emulation pass in both commands.

### 5.2 Should change (ranked) [O]

1. **Fix the doc drift, and add a check like ours.** Wallhammer's docs-check (D-rule
   "code wins") exists because of exactly this ([README conclusion 4](README.md)). Each item
   below contradicts the code:
   - `docs/GAME-DEVELOPMENT.md` describes a Phaser 3-era game: individual PNG frames, a
     mandatory "starfield + nebula + CRT + grid" background set, Gemini sprites,
     `preserveDrawingBuffer: true`.
   - `/new-game` says PixelLab and 4 scenes, and the newest games draw in code.
   - `docs/bundle-splitting.md` has the stale sizes and the removed `manualChunks`.
   - CLAUDE.md says the PWA manifest is `"display": "fullscreen"`, but
     `public/manifest.json` says `"standalone"`.
   - The `phaser-gamedev` skill and 5 of its references say "Phaser 3".
   - `/game-upgrade` says the keyboard re-emit quirk lives in `.claude/skills/phaser/`, but it
     is in `phaser-gamedev/references/keyboard-input.md`.
2. **Upgrade 4.0.0 → 4.2.1.** It brings the ScaleManager parent fix, the tween `startDelay`
   fix and the ESM exports. Then run the browser pass on the card games (#7372) and on an old
   iPad if one is around (#7392). Also, the host `node_modules/phaser` is a stale **3.90.0**
   (April). The container uses its own volume, so builds are fine, but host-side editors and
   type checks see v3 types [O].
3. **Extract the copied infra into `app/games/shared/pixel/`:**
   - `raster.ts` (identical in 9 games, plus a variant in 2 more)
   - `music.ts` (identical in 8)
   - `bake.ts`
   - `font.ts` (6 variants)

   One fix then reaches every game, and the tests move with it.
4. **Add a test hook** (§3, tier 3) and **a headless tier-2 smoke test** per game: boot every
   scene, step 600 frames with a seeded script, and assert `game-over` validates. This replaces
   the fiber walk and catches missing texture keys before the browser.
5. **Audio:** `noAudio: true` (or a shared context), `navigator.audioSession.type =
   "playback"`, and move the 30 private `AudioContext` helpers onto one shared one.
6. **Integer scaling** as an opt-in viewport flag (§2.3).
7. **Image generation vs code.** The PixelLab and Gemini pipelines are outside D12 for
   Wallhammer, but they are fine in PixelDen. The point is that when Wallhammer produces
   PixelDen games, those games are code-only (§6).

---

## 6. How Wallhammer could produce PixelDen games

Constraints from our side:
- D12/D18: graphics are TS programs, and PNGs are build outputs.
- D10: games are data, and the player is swappable.
- PixelDen's code is MIT (©2026 the owner, `LICENSE`), and the owner owns both repos, so
  sharing code either way is a licence non-issue [S: the file].

### Option A: Wallhammer as the art and audio factory for a Phaser game (recommended first) [O]

A PixelDen game stays a normal Phaser module written by a session, but its art and music come
from Wallhammer sources:

- **Art:**
  - The `assets/<pack>/<name>/gen.ts` programs (reviewed in the studio, verdicts tied to the
    output hash) are rendered **in the browser at boot**. The `@whz/asset-kit` main entry
    "has no I/O and runs unchanged in the browser"
    ([packages/asset-kit/README.md](../packages/asset-kit/README.md)).
  - A ~60-line adapter (the equivalent of PixelDen's `bake.ts`) turns `IndexedBuffer` +
    palette → RGBA → `CanvasTexture`. It turns clips → `anims.create` with per-frame
    `duration`, and pivots → `setOrigin(px/w, py/h)`.
  - Or bake at build time: `./dev npm run asset -- bake` → `atlas.json` (`wz.atlas/1`) → a
    converter to Phaser **JSON Hash** with `anchor` per frame, read by `JSONHash.js` L80 [S],
    plus one PNG sheet.
  - Boot-time render costs CPU on phones. Build-time bake costs files.
  - [O] Bake at build time for the big sets (tiles, backdrops). Render at boot for small,
    parametric things (variants, palette swaps).
- **Audio:**
  - `@whz/audio` renders `wz.song/0.1` and `wz.sfx/0.1` deterministically in plain TS
    (`renderSong`, `renderSfx`), and the PCM hash is checked by the gate
    ([docs/audio.md](../docs/audio.md)).
  - In PixelDen: render once at boot into an `AudioBuffer` and register it with
    `this.cache.audio.add(key, buffer)`. Phaser's `WebAudioSound` reads `cache.audio.get(key)`
    as an `AudioBuffer` [S: `WebAudioSound.js` L54], so Phaser's own sound manager, unlock and
    `interrupted` handling then just work.
  - Or stream through the `SongPlayer` in an AudioWorklet for adaptive states, which the
    player was designed for (`player.ts` header).
  - PixelDen's copied sequencer uses 16-step bar strings and 4 channels, which is close to our
    step grid. A one-off converter could port the songs of those 8 games into `wz.song` for review.
    [U] I have not checked a lossless mapping of every token.
- **What the studio adds:** the owner reviews a PixelDen game's sprites and songs in the same
  gallery as Wallhammer's, with verdicts, hashes and "changed since verdict". PixelDen has
  nothing like it today.
- **Mechanics:** the cleanest form is a workspace package (`@whz/asset-kit`, `@whz/det`,
  `@whz/audio`) consumed by PixelDen. PixelDen uses pnpm and Wallhammer npm workspaces, so this
  means a vendored copy, a git dependency or a published private package [U on which works best
  with both Docker setups]. A first spike can simply **export baked files** into
  `public/assets/games/<slug>/` with a manifest, so PixelDen needs no new dependency.

### Option B: a PixelDen export target for a Wallhammer game (data + our runtime)

A game under `games/<id>/` is packed (`./dev npm run game -- pack`) and played by our runtime in
PixelDen. Needed:

1. **A host-contract change in PixelDen.** `GameCanvas` always does `new Phaser.Game(config)`.
   It needs a second entry kind, e.g. `export function mount(parent, { viewport, registry, events })
   → { destroy(), setViewport() }`, with the same event names. [O] This is small: about 40 lines
   in `game-canvas.tsx`, and it also gives PixelDen a way to host non-Phaser games.
   - The alternative is to keep Phaser as a shell and draw our runtime's canvas through a
     `CanvasTexture` or an `Extern` object. That works [O], but it pays 352 kB gzip for
     nothing.
2. A `pixelden` exporter in `@whz/game-data`. It writes:
   - `app/games/<slug>/index.ts` (the mount)
   - the package JSON
   - the baked atlases and audio
   - a `registry.ts` entry: slug, width/height, mobile size, genre
   - `locales/en/games/<slug>.json` (title, description, `seoTitle` ≤ 60, `faq`)
   - `locales/en/game-strings/<slug>.json`
   - a thumbnail (rendered by our CPU backend; a 4:3 composite like Tumblekin's) and the OG
     card
3. **Scoring:** our sim is deterministic (D10), so `recomputeScore` can **replay the command log**
   server-side instead of trusting metadata. That is stronger than PixelDen's current validators
   [O].
4. **Saves:** map our save slots onto `cloud-progress` keys (a `parse`/`merge`/`summary` per key).
5. Touch: our input layer needs a touch scheme, or the export reuses PixelDen's touch-controls,
   which needs Phaser. [O] So B needs our own touch layer first.

### Option C: a Phaser *player* for Wallhammer game data

A third player beside our runtime and a future Godot. [O] Not now: it doubles the conformance
burden ([multiplatform.md §4.3](multiplatform.md)) for no gain over B.

### Making "make this game" / "continue this game" run end to end [O]

PixelDen's `/new-game` and `/game-upgrade` are already the "complete flow" commands the owner
wants. For Wallhammer-made PixelDen games they need three changes:
- The art step points at `assets/<pack>/` programs and the studio review instead of PixelLab.
- The audio step points at `audio/<pack>/` plus `./dev npm run audio -- check`.
- The verification step adds the tier-2 headless smoke test.

The studio then shows the game's assets and, via the bake/build services
([docs/studio.md](../docs/studio.md)), the build's progress. Ledgers stay in each repo's `tasks/`.

---

## 7. Desktop and mobile apps for Phaser games (short; details in multiplatform.md)

- The decisions stand: **Electron for desktop (D24), Capacitor for mobile (D27)**. See
  [multiplatform.md §1–2](multiplatform.md) for frame pacing, Steam, the iOS 60 Hz cap,
  WebView process death and audio.
- **Phaser-specific templates** [S]:
  - `phaserjs/editor-starter-template-capacitorjs`: Phaser Editor, Webpack, Android by
    default; last push 2025-03-31.
  - `phaserjs/template-tauri`: Phaser 3, needs Rust.
  - I found no official Electron template.
  - A community Phaser 4 + Vite + Capacitor template exists (MIT, itch.io).
  - Capacitor's own games guide names Phaser and nothing else useful [S].
  - [O] We don't need any of these templates. A Vite build of one game module plus a
    Capacitor/Electron shell is ~50 lines of config.
- **The real blocker is PixelDen's coupling, not Phaser.** A game module expects `GameCanvas`
  (auth, `/api/scores`, cloud sync, i18n from the loader). A store build needs a
  **standalone shell**: the same `getConfig(viewport)`, events going to local storage instead of
  the API, and strings bundled. [O] Writing that shell once in `app/games/shared/standalone.ts`
  makes every PixelDen game wrappable, and it doubles as the tier-3 test page.

---

## What this means for us

- **New Hope:** nothing changes. It is 3D and stays on Three.js (D30). Phaser has no 3D since
  v4 [S].
- **Wallhammer (studio, kits):**
  - The asset kit and the synth are already browser-safe, so **PixelDen is the fastest real
    consumer** for them while the Kairosoft sims wait.
  - Proposal: a spike that takes one existing code-drawn PixelDen game (Tumblekin is the
    cleanest) and re-sources 3–5 of its sprites and one song from `assets/` and `audio/`.
    Measure the boot render time on a mid phone; review them in the studio.
- **PixelDen** (owner's call; it is another repo), in order:
  1. Docs drift fix plus a docs check.
  2. Phaser 4.2.1.
  3. Shared `pixel/` and `audio/` infra.
  4. A `window.__pd` test hook plus a tier-2 headless smoke test.
  5. Audio session and a single `AudioContext`.
  6. Integer scaling.
  7. A standalone shell, the precondition for Electron/Capacitor builds.
- **For an export target (Option B)** PixelDen needs only one change: a `mount()` entry kind in
  `GameCanvas`. Everything else is on our side (exporter, touch layer, replay-based score
  check).

## Open questions (owner)

1. Should Wallhammer make PixelDen games at all now, or only after the first New Hope playable?
   This decides whether the Option A spike goes into `tasks/`.
2. Is PixelLab/Gemini allowed in Wallhammer-made PixelDen games, or does D12 (code-only) apply
   there too?
3. How should PixelDen consume `@whz/*`: exported files only, a vendored copy, or a private
   package?
4. Is a standalone shell for PixelDen games (store builds) wanted, and for which first game and
   platform?
5. May the PixelDen changes in §5.2 be queued in PixelDen's `tasks/`? They are a separate repo
   with its own rules.

---

## Sources

Web (accessed 2026-10-14; the date of each source in brackets):
1. Phaser 4 releases list (phaser.io, 2026-07): https://phaser.io/download/phaser4
2. npm registry, `phaser` dist-tags and publish times (2026-07-09 latest): https://registry.npmjs.org/phaser
3. GitHub releases v4.0.0 / 4.1.0 / 4.2.0 / 4.2.1 (2026-04-10 … 2026-07-09): https://github.com/phaserjs/phaser/releases
4. Phaser 4 migration guide (2026-04): https://github.com/phaserjs/phaser/blob/master/changelog/v4/4.0/MIGRATION-GUIDE.md
5. Phaser official agent skills folder, MIT (2026; identical to PixelDen's `.claude/skills/phaser/`, measured by diff): https://github.com/phaserjs/phaser/tree/master/skills
6. "Phaser 3 vs Phaser 4" (phaser.io, 2026-05-13): https://phaser.io/news/2026/05/phaser-3-vs-phaser-4
7. "Phaser 4 SpriteGPULayer performance" (phaser.io, 2026-05-28): https://phaser.io/news/2026/05/phaser4-spritegpulayer-performance
8. "Phaser 4 rendering concepts" tutorial (phaser.io, undated, © 2026): https://phaser.io/tutorials/phaser-4-rendering-concepts
9. Phaser v4 test guide and helper, in the npm package 4.2.1 (MIT, 2026): https://unpkg.com/phaser@4.2.1/tests/TESTING.md, https://unpkg.com/phaser@4.2.1/tests/helper.js
10. Phaser Compact Texture Atlas Format spec (npm package 4.2.1, 2026): https://unpkg.com/phaser@4.2.1/docs/Phaser%20Compact%20Texture%20Atlas%20Format%20Specification/Phaser%20Compact%20Texture%20Atlas%20Format%20Specification.md
11. Phaser 4.2.1 source read for config, time step, atlas pivots, audio cache: https://unpkg.com/phaser@4.2.1/src/core/Config.js, …/src/core/TimeStep.js, …/src/core/Game.js, …/src/textures/parsers/JSONHash.js, …/src/sound/webaudio/WebAudioSound.js, …/src/sound/webaudio/WebAudioSoundManager.js
12. Bundle sizes measured from jsDelivr (2026-10-14): https://cdn.jsdelivr.net/npm/phaser@4.2.1/dist/phaser.min.js (and @3.90.0, @4.0.0, `phaser-arcade-physics.min.js`)
13. Phaser issue #7392, older iOS Text black boxes (2026-10-06): https://github.com/phaserjs/phaser/issues/7392
14. Phaser issue #7372, rotated multi-texture batch (2026-09-10): https://github.com/phaserjs/phaser/issues/7372
15. Phaser issue #7306, mask FPS drop (2026-05-20): https://github.com/phaserjs/phaser/issues/7306
16. Phaser issue #7351, camera zoom + HiDPI (2026-08-15): https://github.com/phaserjs/phaser/issues/7351
17. Phaser World newsletter, Sept 2025 (v3 end, Editor 5): https://phaserworld.beehiiv.com/p/phaser-world-sept-2025 [refuted 2026-10-14: the issue does not discuss the end of v3; see §1.1]
18. MDN, "Crisp pixel art look with image-rendering" (living doc, 2025): https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look
19. MDN, AudioSession `state` (living doc, 2025): https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/state
20. WebKit bug 237322, audio session type vs mute switch (2022–2024): https://bugs.webkit.org/show_bug.cgi?id=237322
21. Blink-dev "Intent to Remove: SwiftShader Fallback" (2025-02): https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ
22. Microsoft Edge policy `EnableUnsafeSwiftShader` (2025): https://learn.microsoft.com/en-my/deployEdge/microsoft-edge-policies/enableunsafeswiftshader
23. chromedp v0.14.1, sets `--enable-unsafe-swiftshader` (2025): https://chromium.googlesource.com/external/github.com/chromedp/chromedp/+/refs/tags/v0.14.1
24. Phaser forum, empty `toDataURL` in WebGL / `preserveDrawingBuffer` (2018, still valid): https://phaser.discourse.group/t/empty-image-todataurl/567
25. CrazyGames technical requirements (undated, read 2026-10-14): https://docs.crazygames.com/requirements/technical/
26. Capacitor games guide (undated): https://capacitorjs.com/docs/guides/games
27. Phaser Editor Capacitor template (last push 2025-03-31): https://github.com/phaserjs/editor-starter-template-capacitorjs
28. Phaser Tauri template (Phaser 3; undated): https://github.com/phaserjs/template-tauri
29. Phaser 4 + TS + Capacitor community template, MIT (2026): https://michaelpwest.itch.io/phaser-typescript-template
30. Phaser Box2D announcement, MIT (2024-12): https://phaser.io/news/2024/12/announcing-phaser-box2d

Local (read-only):
- PixelDen at `~/projects/nodejs/pixelden` (commit `781ee28`, MIT): `CLAUDE.md`,
  `docs/GAME-DEVELOPMENT.md`, `docs/architecture.md`, `docs/bundle-splitting.md`,
  `docs/adding-games.md`, `docs/dev-tools.md`, `.claude/commands/{new-game,game-upgrade}.md`,
  `.claude/skills/phaser-gamedev/SKILL.md`, `.claude/skills/phaser/{v3-to-v4-migration,scale-and-responsive,audio-and-sound,game-setup-and-config}`,
  `app/games/{types,registry}.ts`, `app/games/shared/*`, `app/components/game-canvas.tsx`,
  `vite.config.ts`, `vitest.config.ts`, `public/manifest.json`, `tasks/77-tumblekin.md`,
  `tasks/new-game-ledger.md`, and the `tumblekin`, `gloop` and `redline-pursuit` code.
- Wallhammer: `packages/asset-kit/README.md`, `docs/asset-pipeline.md`, `docs/game-data.md`,
  `docs/audio.md`, `packages/audio/src/{player,index}.ts`, `docs/DECISIONS.md`,
  `research/{multiplatform,game-creator}.md`.

Licences of the code recommended for borrowing:
- Phaser, including `tests/helper.js`, `tests/setup.js` and the `skills/` folder: MIT.
- PixelDen: MIT, owner's own.
- Phaser Box2D: MIT.

Under Wallhammer's rules the Phaser `skills/` folder counts as third-party, because it is not
from anthropics/skills. It is fine to read for ideas, but copying it into this repo needs the
skill intake ([security/skill-intake/README.md](../security/skill-intake/README.md)).

## Verification (2026-10-14)

Adversarial check by a second session. Sources were re-fetched (npm registry, jsDelivr, unpkg
4.2.1 sources, GitHub releases/issues via `gh`, the cited web pages) and the PixelDen checkout at
`~/projects/nodejs/pixelden` (`781ee28`, with uncommitted edits in `registry.ts` and
`cloud-progress*.ts`) was re-measured. 30 claims checked.

**Confirmed (27):**
- npm publish times: 3.90.0 2025-05-23, 4.0.0-rc.1 2025-04-01, rc.7 2026-03-25, 4.0.0
  2026-04-10, 4.1.0 2026-04-30, 4.2.0 2026-06-19, 4.2.1 2026-07-09; `latest` = 4.2.1. Code names
  Caladan / Salusa / Giedi per phaser.io/download/phaser4 (4.2.1 is also "Giedi").
- Release notes: 4.2.1 "Fix ScaleManager not resizing to parent container. Fix #7213",
  `startDelay` tween fix (#7093), ESM namespace fixes; 4.1.0 `Layer` is a true GameObject, ESM
  default/`Class`/`LOG_VERSION` exports; 4.2.0 `Stencil`, `CustomContext`, `Mesh2D`,
  `render.stencil`, `alphaStrategy`; 4.0.0 "28 comprehensive skill files", Gradient/Noise/
  CaptureFrame/Stamp.
- PixelDen pins `phaser@4.0.0` in `pnpm-lock.yaml` (`^4.0.0` in `package.json`); host
  `node_modules/phaser` is 3.90.0.
- Bundle sizes (re-measured, gzip -9): 3.90.0 1,196,122 / 314,921; 4.0.0 1,351,807 / 346,106;
  4.2.1 1,375,976 / 352,451; arcade-only 1,266,396 / 319,730 (UMD: `exports`/`define`);
  PixelDen `phaser.esm-BHapV951.js` 1,364,124 / 361,253. `docs/bundle-splitting.md` quotes
  1,208 kB / 332 kB and a `manualChunks` block; `vite.config.ts` has no `manualChunks`.
- `Config.js` 4.2.1: `roundPixels` default `false` (L382); `pixelArt` sets `roundPixels = true`
  (L403); `smoothPixelArt` exists (L409). `Mesh`/`Plane` absent from `gameobjects/index.js`,
  `Mesh2D` present. 3-vs-4 post (2026-05-13) lists Mesh/Plane removed, `setTintFill`,
  `BitmapMask`, `Geom.Point`, `Math.TAU`, "a few hours of work".
- Line references hold in 4.2.1: `Game.js` L422 (`headlessStep` loop start) / L454 (`step`) /
  L523 (`headlessStep`); `TimeStep.js` L781 `sleep` / L800 `wake`, `panicMax` default 120,
  `smoothStep`; `JSONHash.js` L80 `src.anchor || src.pivot`; `WebAudioSound.js` L54
  `cache.audio.get(key)`; `WebAudioSoundManager.js` L419 resumes `suspended`/`interrupted`,
  L478 iOS comment.
- `tests/TESTING.md`, `tests/helper.js` (`Phaser.HEADLESS`, `noAudio: true`), `tests/setup.js`
  ship in the 4.2.1 npm package; the guide excludes "anything requiring actual pixel rendering".
- PCT spec: "typically 90-95% smaller", rotation flag reserved, no pivot field.
- Rendering-concepts page: 16,384 quads, "Don't use more than a few hundred" draw calls,
  multi-texturing "poor performance" on some mobiles, ≥ 1 px padding, filters use own
  framebuffers. SpriteGPULayer post (2026-05-28): 168 bytes/member, "up to 100x" with no
  methodology, single texture, editing expensive.
- Issues #7392 (2026-10-06, ≤ iPadOS 16.4, `ApplyTint.glsl` divide by alpha, reporter NRK),
  #7372 (2026-09-10), #7351 (2026-08-15), #7306 (2026-05-20) all open; #7213 closed.
- The Phaser `skills/` folder on GitHub has the same 28 entries as PixelDen's
  `.claude/skills/phaser/`; `scenes`, `v3-to-v4-migration` and `scale-and-responsive` SKILL.md
  are byte-identical (3 sampled). `vertexRoundMode` values, `MAX_ZOOM`, `audio.noAudio` /
  `audio.context`, `Extern`, and `DynamicTexture.render()` are in those skills.
- PixelDen counts: 54 games; `raster.ts` md5 identical in 9, `music.ts` in 8 (`2f6f6f…`),
  `bake.ts` in 9; `pixelArt: true` in 53, `roundPixels: true` in 12, Arcade in 11, Matter 0,
  `noAudio` 0, `load.audio` 0, `preserveDrawingBuffer` only in `docs/` (0 configs); 30 game
  folders create their own `AudioContext`; LOC excluding tests 976 (vault-run) – 16,129
  (detention-deep); the 8 games without tests; `touch-controls.ts` 460 lines; ledger 43 lines;
  `/new-game` target "2.5k–5k LOC"; `tumblekin/scenes/boot.ts` L41 `v0: 1 - r.y / th`;
  `game-canvas.tsx` L398 dynamic imports, events at L427–612; registry 1152×648;
  `redline-pursuit/render/screen.ts` `putImageData` + `refresh()`; `manifest.json`
  `"standalone"` vs CLAUDE.md L130 `"fullscreen"`; `/game-upgrade` L81 points at
  `.claude/skills/phaser/` while `keyboard-input.md` is under `phaser-gamedev/references/`;
  "Phaser 3" appears in `phaser-gamedev/SKILL.md` + 5 references; `tasks/77-tumblekin.md`
  documents the 20 Hz `Uint8Array` sim and 3 glimmers per level.
- Wallhammer: `packages/asset-kit/README.md` L85 "the main entry has no I/O and runs unchanged
  in the browser"; `renderSong`/`renderSfx` exported from `packages/audio/src/index.ts`;
  `wz.song/0.1`, `wz.sfx/0.1`, `wz.atlas/1` exist in the docs; D24/D27 as stated.
- Web: CrazyGames 50 MB / 20 MB / 1,500 files / 4 GB Chromebook / `resume()` in a gesture;
  WebKit 237322 (2022, resolved 2024-09 with `audioSession.type = "playback"`, default
  `ambient`); Capacitor games guide names only Phaser; `editor-starter-template-capacitorjs`
  pushed 2025-03-31; `template-tauri` depends on `phaser ^3.88.2`; no `phaserjs/template-electron`
  repo; the itch.io template is Phaser 4 + Vite + Capacitor, MIT.

**Refuted or corrected inline (4):** the Sept 2025 Phaser World claim about v3's end (§1.1);
`shared/audio.ts` "used by only 3 games" (29 games; §2.6); test-file count 138 → 137 (+1 +4; §3);
the SwiftShader sourcing (blink-dev says 137 estimated; Edge says 144; M139 holds via the
Chromium policy page and chromedp; §3).

**Unconfirmed (3):** `Struct.Set`/`Map` → native and the "proper 3D support is planned" quote
(§1.2); the exact mau-mau rotation-call count (§1.3).

**Gaps:** no device FPS numbers exist for Phaser 4 anywhere, so the mobile-performance verdict is
inference; the arcade-only UMD build was not smoke-tested with Vite; the §6 Option A "~60-line
adapter" and the `wz.song` ↔ PixelDen sequencer mapping were not prototyped; only 3 of 28 skill
files were diffed against upstream; PixelDen's uncommitted working-tree changes were not
reviewed; the `/new-game` and `/game-upgrade` commands were read, not run.
