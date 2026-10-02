// The smallest complete asset program: a dot that blinks. It is the example in
// packages/asset-kit/README.md (a test keeps the two the same) and the fixture of the kit's
// golden tests.

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
  lint: { maxGroups: 2, margin: 0, unoutlined: ["white"] }, // the sparkle: a second shape, in a corner, no outline

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
