// Studio fixture: a generator that never returns. Only the bake timeout ends it. It is in its
// own assets folder, so nothing bakes it by accident.

import { defineAsset, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../../../assets/palettes/example.json" with { type: "json" };

export default defineAsset({
  id: "loops/forever",
  kind: "sprite",
  size: [8, 8],
  pivot: [4, 7],
  palette: parsePalette(paletteJson),
  clips: { idle: { frames: 1, durations: 500 } },
  params: {},
  variantSeeds: [1],

  render() {
    for (;;) {
      // Spins until the worker is terminated.
    }
  },
});
