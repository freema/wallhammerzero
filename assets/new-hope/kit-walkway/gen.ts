// New Hope building kit: a `walkway` cell (a bridge between towers), drawn by assets/new-hope-lib/kit.ts.

import { defineKitAsset, exposedParam, exposure } from "../../new-hope-lib/kit-asset.ts";

export default defineKitAsset({
  name: "walkway",
  params: { exposed: exposedParam },
  presets: { bridge: { exposed: "sides" }, corner: { exposed: "corner" } },
  spec: (params, seed) => ({ kind: "walkway", seed, exposed: exposure(params.exposed) }),
});
