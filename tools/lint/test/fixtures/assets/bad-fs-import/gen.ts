// Lint fixture: an asset program that imports Node built-ins, with and without the node: prefix.
// The determinism lint must reject it (tools/lint/test/determinism.test.mjs).
// This folder is ignored by the normal lint run; the test lints it as if it were under assets/.

import { readdirSync } from "fs";
import { hostname } from "node:os";
import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);

export default defineAsset({
  id: "lint-fixtures/bad-fs-import",
  kind: "sprite",
  size: [8, 8],
  pivot: [4, 7],
  palette,
  clips: { idle: { frames: 1, durations: 100 } },
  params: {},
  variantSeeds: [1],
  render() {
    // I/O: the frame depends on the machine and on the files around the program.
    const x = (readdirSync(".").length + hostname().length) % 8;
    return new IndexedBuffer(8, 8).pset(x, 4, palette.ink);
  },
});
