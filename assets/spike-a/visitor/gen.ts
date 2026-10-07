// Variant A visitor: a 16 x 16 chibi in a cap and plain clothes, idle / walk in three facings
// (the side facing is mirrored by the player). The same rig as the staff (assets/spike-lib);
// the cap and the lack of an apron tell the two apart at 1x.

import { defineAsset } from "@whz/asset-kit";
import { CHIBI_SLOTS, drawChibi, FACINGS, IDLE_DURATIONS, lookFromSeed, pose, SKIN, WALK_DURATIONS } from "../../spike-lib/chibi.ts";
import type { Facing } from "../../spike-lib/chibi.ts";
import { CLOTH, HAIR, palette, SCALE_A } from "../../spike-lib/style.ts";

const scale = SCALE_A;

export default defineAsset({
  id: "spike-a/visitor",
  kind: "sprite",
  size: scale.frame,
  pivot: scale.pivot,
  palette,
  clips: {
    idle: { frames: 2, durations: IDLE_DURATIONS },
    walk: { frames: 4, durations: WALK_DURATIONS },
  },
  facings: FACINGS,
  params: {
    outfit: { type: "enum", values: ["random", ...CLOTH], default: "random", description: "The shirt's cloth ramp; random picks one from the seed." },
    hair: { type: "enum", values: ["random", ...HAIR], default: "random", description: "The hair colour; random picks one from the seed." },
    skin: { type: "enum", values: ["random", ...SKIN], default: "random", description: "The skin tone; random picks one from the seed." },
  },
  presets: { red: { outfit: "red" }, blue: { outfit: "blue" }, green: { outfit: "green" } },
  variantSeeds: [1, 2, 3],
  lint: { allowedSlots: CHIBI_SLOTS, maxGroups: 2 },

  render({ params, seed, clip, frame, facing }) {
    const look = lookFromSeed(seed, "visitor", params.outfit, params.hair, params.skin);
    return drawChibi(scale, look, facing as Facing, clip, pose(clip, frame, facing as Facing));
  },
});
