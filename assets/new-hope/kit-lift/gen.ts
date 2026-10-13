// New Hope building kit: a `lift` cell (a shaft with doors on one side), drawn by
// assets/new-hope-lib/kit.ts. The doors' two states are the clips.

import { SIDES } from "../../new-hope-lib/kit.ts";
import type { Side } from "../../new-hope-lib/kit.ts";
import { defineKitAsset } from "../../new-hope-lib/kit-asset.ts";

export default defineKitAsset({
  name: "lift",
  params: { dir: { type: "enum", values: SIDES, default: "+z", description: "The side the doors are on." } },
  presets: { "doors-x": { dir: "+x" } },
  clips: { closed: { frames: 1, durations: 1000 }, open: { frames: 1, durations: 1000 } },
  spec: (params, seed, clip) => ({ kind: "lift", seed, dir: params.dir as Side, open: clip === "open" }),
});
