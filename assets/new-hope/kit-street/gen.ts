// New Hope building kit: a `street` cell (walkable ground), drawn by assets/new-hope-lib/kit.ts.

import { defineKitAsset, exposedParam, exposure } from "../../new-hope-lib/kit-asset.ts";

export default defineKitAsset({
  name: "street",
  params: {
    exposed: exposedParam,
    axis: { type: "enum", values: ["x", "z"], default: "x", description: "The axis traffic runs along; the lane dash lies on the cell's low edge across it." },
  },
  presets: {
    "road-x": { exposed: "sides", axis: "x" },
    "lane-x": { exposed: "none", axis: "x" },
    "lane-z": { exposed: "none", axis: "z" },
  },
  spec: (params, seed) => ({ kind: "street", seed, exposed: exposure(params.exposed), dir: params.axis === "z" ? "-z" : "+x" }),
});
