// Lint fixture: an asset program that runs text as code, with eval and with new Function.
// The determinism lint must reject it (tools/lint/test/determinism.test.mjs).
// This folder is ignored by the normal lint run; the test lints it as if it were under assets/.

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);

export default defineAsset({
  id: "lint-fixtures/bad-eval",
  kind: "sprite",
  size: [8, 8],
  pivot: [4, 7],
  palette,
  clips: { idle: { frames: 1, durations: 100 } },
  params: {},
  variantSeeds: [1],
  render() {
    // The lint cannot read code that is made at run time: it could be Math.random() or anything else.
    const roll = eval("Math.random()") as number;
    const scale = new Function("return 8")() as number;
    const x = Math.floor(roll * scale);
    return new IndexedBuffer(8, 8).pset(x, 4, palette.ink);
  },
});
