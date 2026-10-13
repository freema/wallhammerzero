// New Hope building kit: a `pad` cell (a landing pad on a roof), drawn by assets/new-hope-lib/kit.ts.
// The corner lights blink in the clip.

import { defineKitAsset, exposedParam, exposure } from "../../new-hope-lib/kit-asset.ts";

export default defineKitAsset({
  name: "pad",
  params: { exposed: exposedParam },
  presets: { corner: { exposed: "corner" } },
  clips: { blink: { frames: 2, durations: [700, 500] } },
  spec: (params, seed, _clip, frame) => ({ kind: "pad", seed, exposed: exposure(params.exposed), frame }),
});
