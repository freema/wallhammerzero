# RUNTIME SPRITE CORE: OUR OWN RENDERER, MINIMAL (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** asset-render-cli (atlas format)

## Origin
D2 (from scratch) and D10 (games use our own runtime on WebGL; games are pure data). The studio
player (D22) must preview assets with the same code the games use, so the first piece of the
runtime is built now, shaped by the studio's needs. D16: containers have no GPU, so the runtime
also needs a CPU path that Claude can run in Docker.

## Read first
- `research/studio-stack.md` §3 (WebGL context limits, rendering options, §3.3 what the runtime
  must provide), executive summary points 6–7.
- `research/multiplatform.md` "Architectural rules from day one" 1, 9, 13 (host adapters, a
  small written host API) and "Concrete choices" (WebGL2 as the floor).
- `research/ref-sakura-crossing.md` §5 (iii): a render endpoint the agent can call beats
  screenshots of a browser pane.
- `research/voxels.md` §3.6 (the same pipeline later shows live pixel-art voxels).

## Scope
1. `packages/runtime` (TypeScript, no dependencies besides `det`):
   - a **backend-neutral draw list**: sprites (atlas frame, integer position, mirror, palette
     row, depth key) sorted by depth key, drawn into a native-resolution target;
   - a **WebGL2 backend**: atlas (`atlas.json` + indexed PNG) and palette drawn through a
     **palette lookup texture** (palette swaps need no rebake); the native-resolution
     framebuffer is upscaled by an **integer factor** with nearest sampling into a given
     rectangle (viewport + scissor) of the canvas; `readPixels` of the native target;
   - a **CPU reference backend**: the same draw list blitted into an RGBA buffer in plain
     TypeScript. It runs in Node (Docker), so scene shots and tests need no GPU;
   - **explicit time:** the caller passes time or frame; the runtime has no
     `requestAnimationFrame` of its own and no global state, so many previews share one context.
2. A clip player helper: given a clip (frames + per-frame durations) and a time, return the frame.
   Pure function, unit-tested.
3. A bare dev page (a small Vite page in Docker until the studio exists) that draws one baked
   asset and exposes `window.__runtime.readNative()`.
4. `packages/runtime/README.md`: the contract (time in, rectangle in, no rAF, two backends) in
   ≤ 1 page.

## Out of scope
- Game loop and test protocol (`player-loop-test-protocol`), tilemaps and cameras
  (`runtime-tilemap-scene`), text and UI (`runtime-text-ui`), input (`runtime-input`), FX
  (`fx-emitters`), audio (`runtime-audio`).
- WebGPU, Three.js.

## Acceptance
- `npm run check` covers the pure parts (clip timing, draw-list sorting, atlas parsing) and a
  **CPU golden test**: the CPU backend's output for the example asset equals the baked indexed
  frame mapped through the palette, for every frame.
- **Pixel parity:** in the host browser (Chrome DevTools MCP; containers have no GPU), the WebGL
  native framebuffer read back equals the CPU backend's buffer, pixel for pixel, for every frame
  of the example asset and for a 20-sprite test draw list with mirrors and two palette rows. The
  check is a script the verifier runs, not a screenshot judgement.
- Drawing 16 previews into 16 rectangles of one canvas works with a single WebGL context.
