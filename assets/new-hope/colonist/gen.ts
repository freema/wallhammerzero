// A colonist of the resettled city: the crowd Kylo walks through. The seed picks the skin, the
// hair (colour and cut), the clothes and whether they carry a bag. Never `red` (Kylo's colour),
// never `union` (the guards') and never `rust` (the scavengers'), so the three read apart.

import { createRng } from "@whz/det";
import { definePerson } from "../../new-hope-lib/people.ts";
import type { Mat, PersonLook } from "../../new-hope-lib/people.ts";

const SKINS: readonly Mat[] = [["skin", 2], ["skin", 1], ["ancient", 1], ["ancient", 2]];
const HAIRS = ["hair", "ancient", "paint", "psion", "concrete"] as const;
// Never bald: a bald head over a high collar is Kylo's silhouette.
const CUTS = ["hair", "hair", "fringe"] as const;
const TOPS = ["cloth", "plant", "glass", "paint", "psion", "concrete"] as const;
const LEGS = ["cloth", "concrete", "steel", "glass"] as const;
/** The night ramps are dark: clothes in them start a step higher, so a colonist never sinks into the street. */
const DARK: readonly string[] = ["cloth", "glass", "hair"];
const base = (ramp: string, step: number): Mat => [ramp, DARK.includes(ramp) ? step + 1 : step];
const BAGS = ["cloth", "plant", "paint", "ancient"] as const;

function colonistLook(bag: string, seed: number): PersonLook {
  const rng = createRng(seed, "colonist");
  const skin = rng.pick(SKINS);
  const hair = rng.pick(HAIRS);
  const top = rng.pick(TOPS);
  // Trousers never in the shirt's ramp, so the body reads as two blocks.
  const legs = rng.pick(LEGS.filter((ramp) => ramp !== top));
  const bagRamp = rng.pick(BAGS.filter((ramp) => ramp !== top));
  const carries = bag === "yes" || (bag === "seed" && rng.chance(1, 2));
  return {
    skin,
    headStyle: rng.pick(CUTS),
    headMat: [hair, 1],
    face: skin,
    torso: base(top, 1),
    belt: null,
    sleeves: base(top, 1),
    shoulders: null,
    hands: skin,
    legs: base(legs, 1),
    shoes: ["asphalt", 0],
    coat: null,
    pack: carries ? { mat: [bagRamp, 1], trim: [bagRamp, 0], size: "small" } : null,
  };
}

export default definePerson({
  id: "new-hope/colonist",
  params: {
    bag: { type: "enum", values: ["seed", "yes", "no"], default: "seed", description: "A bag on the back: from the seed, always or never." },
  },
  presets: { "no-bag": { bag: "no" } },
  variantSeeds: [1, 2, 3, 4, 5, 6],
  slots: ["skin", "ancient", "hair", "paint", "psion", "concrete", "cloth", "plant", "glass", "asphalt", "steel"],
  look: (params, seed) => colonistLook(params.bag, seed),
});
