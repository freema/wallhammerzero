// A scavenger of the middle levels: rust and patched cloth, a hood, amber goggles that catch
// the light (or, with `goggles` off, a steel respirator: the face row has room for one of
// them), and a big pack of salvage that rises behind the head. The seed picks which of hood
// and jacket is rust.

import { createRng } from "@whz/det";
import { definePerson } from "../../new-hope-lib/people.ts";

export default definePerson({
  id: "new-hope/scavenger",
  params: {
    goggles: { type: "bool", default: true, description: "Lit amber goggles over the face; off, a steel respirator." },
  },
  presets: { bare: { goggles: false } },
  variantSeeds: [1, 2], // the two ways round of hood and jacket
  slots: ["rust", "ancient", "cloth", "steel", "light-warm"],
  look: (params, seed) => {
    const rng = createRng(seed, "scavenger");
    // A rust hood over a dusty duster, or a dusty hood over a rust jacket: two values, so the
    // head and the body read apart.
    const hood = rng.pick(["rust", "ancient"] as const);
    const jacket = hood === "rust" ? "ancient" : "rust";
    return {
      skin: ["skin", 1], // never seen: the hood, the goggles or the respirator and the gloves cover it
      headStyle: "hood",
      headMat: [hood, 1],
      face: params.goggles ? "light-warm" : ["steel", 1],
      torso: [jacket, 1],
      belt: ["cloth", 0],
      sleeves: [jacket, 1],
      shoulders: null,
      hands: ["cloth", 0],
      legs: ["cloth", 1],
      shoes: ["rust", 0],
      coat: null,
      pack: { mat: ["steel", 1], trim: ["rust", 1], size: "big" },
    };
  },
});
