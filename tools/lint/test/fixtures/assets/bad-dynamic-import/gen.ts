// Lint fixture: an asset program that loads a module at run time with import().
// The determinism lint must reject it (tools/lint/test/determinism.test.mjs).
// This folder is ignored by the normal lint run; the test lints it as if it were under assets/.

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);

// A dynamic import can name a Node built-in without an import line the lint could check.
const os = (await import("os")) as { uptime(): number };

export default defineAsset({
  id: "lint-fixtures/bad-dynamic-import",
  kind: "sprite",
  size: [8, 8],
  pivot: [4, 7],
  palette,
  clips: { idle: { frames: 1, durations: 100 } },
  params: {},
  variantSeeds: [1],
  render() {
    const x = Math.floor(os.uptime()) % 8;
    return new IndexedBuffer(8, 8).pset(x, 4, palette.ink);
  },
});
