// A Union cruiser: the security car of the colonised levels, from the same rig as the taxi.
// Union blue with a light stripe along its flanks, a two-colour light bar on the roof that
// swaps its halves while it flies, and a cyan underglow.

import { defineCar } from "../../new-hope-lib/vehicles.ts";

export default defineCar({
  id: "new-hope/union-cruiser",
  params: {
    stripe: { type: "bool", default: true, description: "A light stripe along the lower body." },
  },
  presets: { plain: { stripe: false } },
  variantSeeds: [1],
  slots: ["union", "steel", "glass", "light-cold", "neon-pink", "neon-pink-dim", "neon-cyan", "neon-cyan-dim"],
  look: (params) => ({
    body: ["union", 1],
    stripe: params.stripe ? ["steel", 2] : null,
    trim: ["steel", 0],
    glass: ["glass", 1],
    glow: "neon-cyan",
    roof: "light-bar",
  }),
});
