// New Hope building kit: a `deck` cell (a walkable floor slab), drawn by assets/new-hope-lib/kit.ts.

import { defineKitAsset, exposedParam, exposure } from "../../new-hope-lib/kit-asset.ts";

export default defineKitAsset({
  name: "deck",
  params: { exposed: exposedParam },
  presets: { corner: { exposed: "corner" }, inner: { exposed: "none" } },
  spec: (params, seed) => ({ kind: "deck", seed, exposed: exposure(params.exposed) }),
});
