// Lint fixture: an asset program that breaks the determinism rule with Math.random().
// The determinism lint must reject it (tools/lint/test/determinism.test.mjs).
// This folder is ignored by the normal lint run; the test lints it as if it were under assets/.

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);

export default defineAsset({
  id: "lint-fixtures/bad-random",
  kind: "sprite",
  size: [8, 8],
  pivot: [4, 7],
  palette,
  clips: { idle: { frames: 1, durations: 100 } },
  params: {},
  variantSeeds: [1],
  render() {
    // Not seeded: two renders of the same frame differ.
    const x = Math.floor(Math.random() * 8);
    return new IndexedBuffer(8, 8).pset(x, 4, palette.ink);
  },
});
