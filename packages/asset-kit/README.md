# @whz/asset-kit

The library asset programs are written with (D12, D18). An asset is a TypeScript program,
`assets/<pack>/<name>/gen.ts`, whose default export is `defineAsset({ ... })`. It draws
palette indices into an `IndexedBuffer`; PNG files, sheets and atlases are build outputs.
**Every frame is a pure function of `(params, seed, clip, frame, facing)`**: no clock, no
`Math.random`, no state between calls, integers only.

```ts
import { compose, defineAsset, IndexedBuffer, parsePalette, parseStamp } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import paletteJson from "../../palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);
const SIZE = 12;
const RAMPS = ["red", "gold", "teal"] as const;
const SPARKLE = parseStamp([".w.", "www", ".w."], palette.legend({ w: "white" }));
const CORNERS = [[0, 0], [9, 0], [0, 9], [9, 9]] as const;

export default defineAsset({
  id: "examples/blinking-dot", // = its folder under assets/
  kind: "sprite",
  size: [SIZE, SIZE],
  pivot: [6, 6],
  palette,
  clips: { blink: { frames: 2, durations: [600, 200] } }, // ms per frame: lit, then dim
  params: {
    diameter: { type: "int", min: 3, max: 8, default: 6, description: "Width of the dot in pixels." },
  },
  presets: { small: { diameter: 4 }, big: { diameter: 8 } },
  variantSeeds: [1, 2, 5], // curated: red, teal, gold

  render({ params, seed, frame }) {
    // One random stream per concern: a new stream never changes what another one gives.
    const [dark, mid, light] = palette.ramp(createRng(seed, "hue").pick(RAMPS));
    const lit = frame === 0;
    const d = params.diameter;
    // The part: a body, and a glint toward the light (top left) one ramp step lighter.
    const glint = Math.max(1, d >> 1);
    const dot = new IndexedBuffer(d, d)
      .fillEllipse(0, 0, d, d, lit ? mid : dark)
      .fillEllipse(1, 1, glint, glint, lit ? light : mid);
    // Parts are stacked back to front and outlined once; the rim under and right is darker.
    const at = (SIZE - d) >> 1;
    const out = compose(SIZE, SIZE, [{ part: dot, x: at, y: at }], {
      ink: palette.ink,
      shadowInk: palette.slot("ink-deep"),
    });
    // Thin details go on after the outline, so they stay thin.
    if (lit) {
      const [x, y] = createRng(seed, "sparkle").pick(CORNERS);
      out.blit(SPARKLE, x, y);
    }
    return out;
  },
});
```

| Field | Contract |
|---|---|
| `id`, `kind` | `<pack>/<name>`, the folder under `assets/`. Kind: `sprite`, `tiles` or `scene`. |
| `size`, `pivot` | Frame `[w, h]`; every frame has this size. Pivot `[x, y]`: required for a sprite. |
| `palette` | From `parsePalette(json)` of `assets/palettes/<id>.json`: named slots, ramps dark → light, slot 0 transparent, `ink` and `shadow` reserved. Programs name slots, never RGB. |
| `clips`, `facings` | Clip → `frames`, `durations` (ms: one number or one per frame), `loop` (default true). Facings default to `["default"]`; a side facing is drawn once and mirrored by the player. |
| `params`, `presets` | Knobs: `int` (min, max), `enum` (values) or `bool`, each with a default and a one-line description. Presets are named values over the defaults. |
| `variantSeeds`, `reviewSeeds` | Curated seeds worth showing, and fixed uncurated seeds (default 1–8) that review sheets always render. Never edit review seeds to hide a bad result. |
| `stampFiles` | `["face"]` = `stamps/face.txt` next to `gen.ts`; its text arrives as `stamps.face` in `render`. |
| `render(ctx)` | Returns one frame. The kit checks its size and that every index is in the palette. |

**Drawing.** `IndexedBuffer` (0 = transparent): `pset`, `hline`, `vline`, `rect`, `fill`, `line`,
`ellipse`, `fillEllipse`, `floodFill`, `blit` (mirror), `dither` (Bayer), `outline`; `crop`,
`flipX`, `remap`, `silhouette` return a new buffer; `orphanCount`, `bounds`, `toText` inspect it.
A float coordinate or colour throws. **Stamps** are strict text grids, one letter per pixel
(`.` transparent; lowercase = light, uppercase = its shade): `parseStamp` throws on a ragged row
or an unknown letter, with the position; `padRows`, `patchRows`, `shiftRows` make cheap frames.
**`compose`** stacks parts and outlines once. Randomness and maths come from `@whz/det`
(`createRng(seed, stream)`, `hash32`, `isin`, `tween`, `idiv`).

**Running one.** `asset.render({ seed, clip, frame, facing?, preset?, params? })` → one frame;
`renderAll(asset, { seed })` → all frames; `outputHash(output)` → the identity of what was
drawn: a hash over the indices, size, pivot, clip table, facings and palette id (layout in
`src/output.ts`), never over PNG bytes. Node hosts load a file with `loadAsset(path)` from
`@whz/asset-kit/node`; the main entry has no I/O and runs unchanged in the browser.

**Checks.** `./dev npm run check` typechecks, lints and tests the kit and every asset. The
determinism lint (`tools/lint/determinism.js`) rejects clocks, `Math.random` and float `Math`
in `assets/**`.
