# STUDIO: LIVE GENERATORS WITH PARAMETER SLIDERS (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** L · **Depends on:** studio-animation-player, studio-verdicts

## Origin
D18 (every asset declares a params schema, presets and seeds) and D23 (the full studio, beyond
the MVP of D22). The owner tunes an asset by moving sliders and stepping through seeds, and the
result goes back to Claude as exact numbers.

## Read first
- `research/studio-stack.md` §4 (threat model, where programs execute, timeouts, hot reload,
  sliders, determinism).
- `research/code-graphics.md` §2.8 and §4 (`algorithmic-art`: seed navigator, same seed always
  the same output, gallery of seeds).

## Scope
1. **Compile service:** the server bundles each `gen.ts` with esbuild (in Docker), caches it by
   content hash and serves it at `/api/programs/<hash>.js`. Asset programs stay out of Vite's
   module graph. Compile errors show on the card.
2. **Sandbox:** generators run in workers inside an opaque-origin iframe
   (`sandbox="allow-scripts"`, CSP `connect-src 'none'`), with a watchdog (≈2 s per thumbnail,
   ≈10 s per full clip; terminate and restart on timeout) and output validation (size, frame
   count, palette size). Inside the sandbox `Math.random`, `Date.now` and `performance.now`
   throw.
3. **Controls** generated from the params schema (int, enum, bool, seed): lock seed, randomise,
   reset, copy as JSON; changes are debounced, stale jobs are cancelled, the first frame comes
   first. FX emitter records get the same controls.
4. **Seed navigator:** previous, next, random, jump, and a grid of N seeds side by side.
5. **Back to the repo:** "Save as preset" writes a preset into the asset's `review.json`
   (studio-owned); "Send to Claude" attaches the current params and seed to a verdict comment.
6. Write endpoints additionally require a per-launch token kept in main-thread memory, so
   sandboxed code cannot write even if it reaches the API.

## Out of scope
- Editing generator code in the studio.
- Running third-party code; this sandbox is for accidents in our own programs.

## Acceptance
- For the example asset, the live output for a preset and seed has the same output hash as
  the bake (scripted via Chrome DevTools MCP).
- A generator with an infinite loop times out, shows the error on its card, and the next edit
  recovers without a page reload.
- A fetch from inside the sandbox to the studio API fails (test).
- A saved preset appears in `review.json` and in the variants grid after a reload.
