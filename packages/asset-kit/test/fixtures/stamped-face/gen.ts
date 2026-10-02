// A test fixture: an asset that uses stamp files, two clips, two facings and all three param
// types. Not a real asset (it is not under assets/).

import { compose, defineAsset, padRows, parsePalette, parseStamp, patchRows, shiftRows, stampRows } from "@whz/asset-kit";
import type { Layer } from "@whz/asset-kit";
import paletteJson from "../../../../../assets/palettes/example.json" with { type: "json" };

const palette = parsePalette(paletteJson);
const legend = palette.legend({ o: "ink", s: "gold.2", S: "gold.1", w: "white", h: "red.1", H: "red.0" });

export default defineAsset({
  id: "fixtures/stamped-face",
  kind: "sprite",
  size: [10, 12],
  pivot: [5, 11],
  palette,
  clips: {
    idle: { frames: 2, durations: 400 },
    blink: { frames: 1, durations: [120], loop: false },
  },
  facings: ["down", "side"],
  params: {
    mood: { type: "enum", values: ["happy", "sad"], default: "happy", description: "The shape of the mouth." },
    hat: { type: "bool", default: false, description: "Whether the face wears a hat." },
    lift: { type: "int", min: 0, max: 1, default: 0, description: "How many pixels the face is raised." },
  },
  presets: {
    "sad-hat": { mood: "sad", hat: true },
  },
  variantSeeds: [7],
  reviewSeeds: [100, 200],
  stampFiles: ["face", "hat"],

  render({ params, clip, frame, facing, stamps }) {
    let face = stampRows(stamps["face"] as string);
    if (clip === "blink") face = patchRows(face, { 2: "ssssssss", 3: "soossoos" });
    if (params.mood === "sad") face = patchRows(face, { 5: "sSsoosSs", 6: ".SossoS." });
    if (clip === "idle" && frame === 1) face = shiftRows(face, 1);

    const layers: Layer[] = [{ part: parseStamp(face, legend, "face"), x: 1, y: 3 - params.lift, mirror: facing === "side" }];
    if (params.hat) {
      const hat = padRows(stampRows(stamps["hat"] as string));
      layers.push({ part: parseStamp(hat, legend, "hat"), x: 1, y: 1 - params.lift });
    }
    return compose(10, 12, layers, { ink: palette.ink });
  },
});
