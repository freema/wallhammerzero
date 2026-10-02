// Studio fixture: one floor tile. Another pack and another kind, for the gallery's filters.

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import paletteJson from "../../../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);

export default defineAsset({
  id: "ground/floor",
  kind: "tiles",
  size: [16, 16],
  palette,
  clips: { still: { frames: 1, durations: 1000 } },
  params: {},
  variantSeeds: [1],

  render() {
    const light = palette.slot("grey.2");
    const dark = palette.slot("grey.1");
    const tile = new IndexedBuffer(16, 16).fill(0, 0, 16, 16, light);
    for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x += 8) if ((x + y) % 16 === 0) tile.fill(x, y, 8, 8, dark);
    return tile;
  },
});
