// New Hope building kit: a `ruin` cell (the undercity), drawn by assets/new-hope-lib/kit.ts.
// The seed picks the composition: a broken column, a wall with a doorway, or rubble and crystal.

import { defineKitAsset } from "../../new-hope-lib/kit-asset.ts";

export default defineKitAsset({
  name: "ruin",
  params: {},
  spec: (_params, seed) => ({ kind: "ruin", seed }),
});
