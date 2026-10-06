// Pack fixture: an asset drawn with the palette file of its folder.
// (test/pack.test.ts; the palettes of this folder are in ../../palettes/).

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);

export default defineAsset({
  id: "odd/fine",
  kind: "sprite",
  size: [4, 4],
  pivot: [2, 3],
  palette,
  clips: { idle: { frames: 1, durations: 100 } },
  params: {},
  variantSeeds: [1],
  render() {
    return new IndexedBuffer(4, 4).fill(1, 1, 2, 2, palette.ink);
  },
});
