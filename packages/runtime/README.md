# @whz/runtime

The renderer the games and the studio share (D10, D22): what the owner approves in the studio
is drawn by the code the game runs. This is its first piece, sprites only. No dependencies
besides `@whz/det`.

## The contract

- **Time in.** The runtime has no `requestAnimationFrame`, no clock and no global state. The
  host owns the frame loop and passes a time or a frame; a draw is a function of its
  arguments. The source is under the determinism lint, which bans clocks and frame callbacks.
- **Rectangle in.** The runtime owns no canvas and no context. A picture is drawn at its
  **native resolution** into a target, then upscaled by a **whole number**, nearest pixel, into
  a rectangle of the canvas the host names (viewport + scissor). Many previews share one
  WebGL context that way.
- **Two backends, one draw list.** `DrawList` says what to draw; a backend draws it. The **CPU
  backend** is plain integer TypeScript and runs in Node (Docker has no GPU): it is the
  reference. The **WebGL2 backend** must give the same bytes.
- **Palette indices in, colours at draw time.** A sheet is palette indices (the baked indexed
  PNG, read by the runtime's own decoder). A sprite names a row of a `PaletteTable`, so a
  palette swap needs no rebake. A pixel is drawn when its colour is opaque and then replaces
  what was there; there is no blending.

```ts
import { clipFrame, createCpuBackend, DrawList, findClip, frameIndex, PaletteTable, parseAtlas, sheetFromPng } from "@whz/runtime";

const atlas = parseAtlas(atlasJson); // build/assets/<id>/atlas.json
const sheet = sheetFromPng(atlas, pngBytes); // seed-<seed>.png of the first variant
const palette = new PaletteTable([atlas.palette.colors /* , a swap, ... */]);
const clip = findClip(atlas, "blink");

const list = new DrawList().sprite({
  sheet,
  frame: frameIndex(atlas, clip.name, clipFrame(clip, timeMs)), // the host's time
  x: 6, y: 6, // where the frame's pivot pixel goes; whole pixels
  mirror: false, paletteRow: 0, depth: 0, // higher depth key = in front; ties keep the order of adding
});

const backend = createCpuBackend(); // or createWebGLBackend(gl) from "@whz/runtime/webgl"
const target = backend.createTarget(12, 12); // native resolution
backend.draw(target, list, { palette }); // clears, then draws the list
const rgba = backend.readPixels(target); // RGBA bytes, the top row first
```

| Import | What |
|---|---|
| `@whz/runtime` | `parseAtlas`, `findClip`, `frameIndex`; `createSheet` (indices in memory), `sheetFromPng`, `decodeIndexedPng`; `PaletteTable`; `DrawList`; the clip player `sampleClip`, `clipFrame`, `clipDuration`, `frameStart` (pure functions of a clip and a time in ms); `createCpuBackend`; `placeTarget`, `nativePixel` (integer zoom, pointer → native pixel); `pixelHash` |
| `@whz/runtime/webgl` | `createWebGLBackend(gl)`: the same `createTarget`, `draw`, `readPixels`, plus `present(target, rect, { scale, background })` and `reset()` for `webglcontextrestored`. GPU objects are made on first use, shared per sheet and palette, freed with `release` |
| `@whz/runtime/node` | `readAtlas(dir)`, `readSheet(dir, seed)`: a bake folder from disk |

## Checks

`./dev npm run check` runs the pure parts (clip timing, draw-list order, atlas parsing, the PNG
reader against zlib) and the **CPU golden test**: for every frame of the example asset the CPU
backend's output equals the baked frame mapped through the palette. It also pins the hash of
every check scene (`dev/scenes.ts`) in `test/golden/parity.json`
(`./dev npm run golden -w @whz/runtime` rewrites it; look at the pictures first).

**Pixel parity of the WebGL backend** needs a GPU, so it runs in the host browser (Chrome
DevTools MCP), on the dev page:

```sh
./dev -p 4101 npm run dev -w @whz/runtime     # bakes, then serves http://127.0.0.1:4101/ ; stop it afterwards
```

```js
// in the page; a verdict is `ok: true`, never a screenshot
await window.__runtime.parity(); // WebGL read-back = CPU buffer = golden hash = baked frame, per scene
window.__runtime.grid(1234); // 16 previews in 16 rectangles of one canvas, one context, compared pixel by pixel
window.__runtime.readNative(); // { width, height, timeMs, pixels }: the native framebuffer of preview 0
await window.__runtime.contextLoss(); // loses and restores the context, then parity again
```

`setTime(ms)`, `play()` and `pause()` drive the page's clock. The page is a stand-in until the
studio's player exists.
