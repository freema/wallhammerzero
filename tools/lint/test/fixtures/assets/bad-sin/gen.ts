// Lint fixture: an asset program that breaks the determinism rule with Math.sin().
// The determinism lint must reject it (tools/lint/test/determinism.test.mjs).
// This folder is ignored by the normal lint run; the test lints it as if it were under assets/.

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);

export default defineAsset({
  id: "lint-fixtures/bad-sin",
  kind: "sprite",
  size: [8, 8],
  pivot: [4, 7],
  palette,
  clips: { bob: { frames: 4, durations: 100 } },
  params: {},
  variantSeeds: [1],
  render({ frame }) {
    // Engines may round Math.sin differently, so the bob can land on another pixel.
    const y = 4 + Math.floor(Math.sin(frame * 1.5708) * 2);
    return new IndexedBuffer(8, 8).pset(4, y, palette.ink);
  },
});
