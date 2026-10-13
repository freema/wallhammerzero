// A Union guard: Union blue armour from helmet to boots, a lit visor across the eyes, lighter
// pauldrons on the shoulders and steel gloves. Nothing of the person shows and the seed changes
// nothing: guards are a uniform.

import { definePerson } from "../../new-hope-lib/people.ts";

export default definePerson({
  id: "new-hope/union-guard",
  params: {
    visor: { type: "bool", default: true, description: "The visor is lit (cyan); off, it is dark glass." },
  },
  presets: { "visor-off": { visor: false } },
  variantSeeds: [1],
  slots: ["union", "steel", "glass", "neon-cyan"],
  look: (params) => ({
    skin: ["skin", 1], // never seen: the helmet, the visor and the gloves cover it
    headStyle: "helmet",
    headMat: ["union", 1],
    face: params.visor ? "neon-cyan" : ["glass", 1],
    torso: ["union", 1],
    belt: ["steel", 0],
    sleeves: ["union", 0],
    shoulders: ["union", 2],
    hands: ["steel", 1],
    legs: ["union", 1],
    shoes: ["steel", 0],
    coat: null,
    pack: null,
  }),
});
