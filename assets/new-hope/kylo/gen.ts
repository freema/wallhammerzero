// Kylo, the player (games/new-hope/STORY.md): an ascendant Ancestor who looks like a Tox but is
// not one. He must read at a glance against the crowd, so he owns one colour no one else wears
// (the `red` ramp: a long coat), a blue-grey skin no colonist has (`steel`), a bald head, and a
// silhouette no one else has: the coat hides his legs to the knees and rises behind his head as
// a high collar.

import { definePerson } from "../../new-hope-lib/people.ts";

export default definePerson({
  id: "new-hope/kylo",
  params: {
    sash: { type: "bool", default: true, description: "A dark sash at the waist that breaks the red coat in two." },
  },
  presets: { plain: { sash: false } },
  variantSeeds: [1],
  slots: ["red", "steel", "cloth"],
  look: (params) => ({
    skin: ["steel", 2],
    headStyle: "bald",
    headMat: ["steel", 2],
    face: ["steel", 1], // a shadowed brow band on the front, so the facing reads on a bald head
    torso: ["red", 1],
    belt: params.sash ? ["cloth", 0] : null,
    sleeves: ["red", 1],
    shoulders: null,
    hands: ["steel", 2],
    legs: ["cloth", 1],
    shoes: ["cloth", 0],
    coat: ["red", 1],
    pack: null,
  }),
});
