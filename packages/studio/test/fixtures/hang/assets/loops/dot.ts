// Shared by the fine assets of the hang fixture: a one-frame dot with the given id.

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import type { AnyAsset } from "@whz/asset-kit";
import paletteJson from "../../../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);

export function makeDot(id: string): AnyAsset {
  return defineAsset({
    id,
    kind: "sprite",
    size: [8, 8],
    pivot: [4, 7],
    palette,
    clips: { idle: { frames: 1, durations: 500 } },
    params: {},
    variantSeeds: [1],

    render() {
      return new IndexedBuffer(8, 8).fillEllipse(1, 1, 6, 6, palette.ink).fillEllipse(2, 2, 4, 4, palette.slot("gold.1"));
    },
  });
}
