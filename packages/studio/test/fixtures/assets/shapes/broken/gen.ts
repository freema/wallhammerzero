// Studio fixture: an asset whose render throws. Its bake fails, and the gallery shows it as an
// error card next to the assets that are fine.

import { defineAsset, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../../assets/palettes/example.json" with { type: "json" };

export default defineAsset({
  id: "shapes/broken",
  kind: "sprite",
  size: [10, 10],
  pivot: [5, 9],
  palette: parsePalette(paletteJson),
  clips: { idle: { frames: 1, durations: 500 } },
  params: {},
  variantSeeds: [1],

  render() {
    throw new Error("the broken fixture always fails: no corners today");
  },
});
