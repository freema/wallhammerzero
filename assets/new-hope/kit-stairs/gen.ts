// New Hope building kit: a `stairs` cell (climbs one storey toward `dir`), drawn by assets/new-hope-lib/kit.ts.

import { SIDES } from "../../new-hope-lib/kit.ts";
import type { Side } from "../../new-hope-lib/kit.ts";
import { defineKitAsset } from "../../new-hope-lib/kit-asset.ts";

export default defineKitAsset({
  name: "stairs",
  params: { dir: { type: "enum", values: SIDES, default: "-z", description: "The side the stairs climb toward." } },
  presets: { "up-x": { dir: "+x" } },
  spec: (params, seed) => ({ kind: "stairs", seed, dir: params.dir as Side }),
});
