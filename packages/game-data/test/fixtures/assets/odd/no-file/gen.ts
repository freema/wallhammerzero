// Pack fixture: an asset drawn with a palette that has no file under palettes/: pack must refuse it.
// (test/pack.test.ts; the palettes of this folder are in ../../palettes/).

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";

const palette = parsePalette({
  format: "wz.palette/1",
  id: "ghost",
  slots: [
    { name: "transparent", rgb: "#000000" },
    { name: "ink", rgb: "#101010" },
    { name: "shadow", rgb: "#202020" },
  ],
  ramps: {},
});

export default defineAsset({
  id: "odd/no-file",
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
