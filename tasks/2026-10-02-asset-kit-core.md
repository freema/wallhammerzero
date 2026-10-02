# ASSET KIT CORE: THE LIBRARY ASSET PROGRAMS ARE WRITTEN WITH (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** docker-dev-environment

## Origin
D12 (graphics are code) and D18 (assets are TS generator programs drawing into palette-indexed
buffers; ASCII stamps allowed; every frame = f(params, seed, frame)). Everything visual in the
studio and the games starts here. The determinism kit made here is shared by the sim and the
audio synth (`research/README.md`, conclusion 1).

## Read first
- `research/code-graphics.md` §2 (best practices), §3 (representations), §7.1–7.2 (proposal),
  §5.1 (Node tooling, zero deps).
- `research/studio-stack.md` §4.2 (program contract), §4.7 (determinism).
- `research/multiplatform.md` §4.2 (determinism pitfalls: why sfc32, one stream per subsystem,
  explicit rounding).
- `research/ref-procedural-pixel-creatures.md` §5 (their "no transcendentals" rule was broken 19
  times, so the lint is necessary) and §8.1 (a reserved shadow index, variant seeds around
  presets, param descriptions, a fixed list of uncurated review seeds).
- The owner's `code-pixel-game` skill, `references/art-kit.md`: Gloop's art kit is the prototype
  for this package (strict grids, `compose` part layers with one outline pass, thin details
  after the outline, parametric bodies from keyframe tables). Its §8 maps each piece to this kit.

## Scope
1. `packages/det` (npm workspace, TypeScript strict, no dependencies): the **determinism kit**
   shared by assets, the sim and audio.
   - a seeded 32-bit RNG (sfc32: integer only, easy to port exactly) with **named sub-streams**
     derived by hashing the seed with the stream name;
   - `hash32(x, y, seed)` for positional variation;
   - integer/fixed-point `isin`/`icos` tables and easing tables;
   - integer helpers with explicit rounding: `idiv`, `imod`, `mulDiv`;
   - **test vectors** as JSON (known outputs for given seeds and inputs), so a later second
     player can check its port against them.
2. `packages/asset-kit` (no runtime dependencies besides `det`; runs unchanged in Node and in
   the browser):
   - **`defineAsset()` contract:** meta (`id`, `kind`, size, palette id, clips with frame counts
     and per-frame durations, facings, pivot), a **params schema** (name, type: int/enum/bool,
     range, default, one-line description), named **presets**, **variant seeds**, a fixed list
     of uncurated **review seeds**, and a pure
     `render({ params, seed, clip, frame, facing }) → IndexedBuffer`.
     `kind` starts as `sprite` | `tiles` | `scene`; later notes add `font`, `ui`, `fx`.
   - **`IndexedBuffer`:** w × h of palette indices (0 = transparent), integer-only drawing:
     pset, hline/vline, rect/fill, integer Bresenham line, ellipse, flood fill, blit with mirror,
     crop, palette remap, silhouette, ordered Bayer dither, orphan count.
   - **Part layers:** `compose(layers)` stacks parts back to front and outlines once (ink on
     the rim, darker ink bottom/right). Thin details (strings, sparkles, face stamps) are drawn
     after the outline. `patchRows` / `shiftRows` make cheap frames from stamp rows.
   - **Palettes as data:** `assets/palettes/<name>.json` (slots with names and RGB, named ramps
     ordered dark → light, reserved slots: 0 transparent, `ink`, `shadow`). A loader validates
     them. Pure JSON, so a later Godot player can read it. Ramps are hand-built (the owner's
     Gloop lesson: generated ramps were unusable); there is no ramp generator.
   - **ASCII stamps:** a strict parser for small text grids where each letter is a palette slot
     (with a legend; lowercase = light, uppercase = shade of the same material). A ragged row or
     an unknown letter throws with its position. Stamps are inline strings or `stamps/*.txt`
     next to the generator.
   - **Output hash:** a stable hash over the indexed frame data + dimensions + clip table +
     palette id. **Not** over PNG bytes (zlib output can differ between Node versions).
3. **Determinism lint:** an ESLint config (run in Docker) that bans `Math.random`, `Date`,
   `performance.now`, `Math.sin/cos/tan/exp/log/pow`, `Math.round` and float-producing helpers.
   It applies to `assets/**`, `packages/det` and the kit's drawing code now; later notes add
   the sim and the synth to the same config.
4. Wire `npm run check` (the Docker gate): `tsc --noEmit`, ESLint and Vitest for both packages.
5. One tiny example asset `assets/examples/blinking-dot/gen.ts` (2-frame clip, one param, three
   variant seeds), used by the tests.

## Out of scope
- PNG encoding, sheets, review images and the CLI (`asset-render-cli`).
- Voxels (`voxel-sprite-baker`), FX emitters (`fx-emitters`), bitmap fonts and UI
  (`runtime-text-ui`).
- Live execution in the browser with sliders (`studio-params-sliders`).
- Partial alpha. Indexed art has none; how the `shadow` slot is shown is settled in the art
  spike.

## Acceptance
- `./dev npm run check` passes and includes typecheck, lint and tests for both packages.
- Golden test: rendering the example asset for each variant seed gives a stored output hash;
  rendering twice gives identical bytes.
- The `det` test vectors pass, and the RNG sub-streams are independent (adding a stream does not
  change another stream's output).
- A test proves the lint fires: a fixture asset that calls `Math.random()` or `Math.sin()`
  fails ESLint.
- Stamp parser tests: unknown letter, wrong row length and a valid stamp.
- `packages/asset-kit/README.md` documents the contract in ≤ 1 page, with the example.
