// Studio fixture: a small sprite with two clips and two variants. It bakes fine.

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);
const RAMPS = ["red", "teal"] as const;

export default defineAsset({
  id: "shapes/square",
  kind: "sprite",
  size: [10, 10],
  pivot: [5, 9],
  palette,
  clips: { idle: { frames: 1, durations: 500 }, pulse: { frames: 2, durations: [120, 240], loop: false } },
  params: { inset: { type: "int", min: 0, max: 2, default: 1, description: "Pixels between the square and the frame edge." } },
  presets: { tight: { inset: 2 } },
  variantSeeds: [1, 2],

  render({ params, seed, clip, frame }) {
    const [dark, mid, light] = palette.ramp(RAMPS[seed % 2] ?? "red");
    const inset = params.inset + (clip === "pulse" && frame === 1 ? 1 : 0);
    const side = 10 - 2 * inset;
    return new IndexedBuffer(10, 10)
      .fill(inset, inset, side, side, palette.ink)
      .fill(inset + 1, inset + 1, side - 2, side - 2, clip === "pulse" ? light : mid)
      .fill(inset + 1, 9 - inset - 1, side - 2, 1, dark);
  },
});
