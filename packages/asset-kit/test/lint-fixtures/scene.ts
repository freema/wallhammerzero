// The scene specimen of the lint fixtures: a small landscape, in daylight (passes) and at
// night with almost no light (fails the luminance floor of a scene).

import { defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import type { AnyAsset } from "@whz/asset-kit";
import paletteJson from "../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);
const W = 48;
const H = 32;

const DAY = { sky: "teal.2", sun: "gold.2", ground: "gold.1", wall: "grey.2", roof: "red.1", door: "red.0" } as const;
const NIGHT = { sky: "ink-deep", sun: "grey.0", ground: "shadow", wall: "ink", roof: "ink-deep", door: "shadow" } as const;

/** A house under a sun (or a dim moon), as a one-frame scene with the given id. */
export function makeScene(id: string, dark: boolean): AnyAsset {
  const names = dark ? NIGHT : DAY;
  const slot = (name: keyof typeof DAY): number => palette.slot(names[name]);
  return defineAsset({
    id,
    kind: "scene",
    size: [W, H],
    palette,
    clips: { still: { frames: 1, durations: 1000 } },
    params: {},
    variantSeeds: [1],
    reviewSeeds: [1],

    render() {
      return new IndexedBuffer(W, H)
        .fill(0, 0, W, 22, slot("sky"))
        .fillEllipse(34, 3, 8, 8, slot("sun"))
        .fill(0, 22, W, 10, slot("ground"))
        .fill(10, 14, 14, 10, slot("wall"))
        .fill(8, 11, 18, 3, slot("roof"))
        .fill(15, 19, 4, 5, slot("door"));
    },
  });
}
