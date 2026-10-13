// The flying taxi Kylo takes across the sky lanes (games/new-hope/README.md, the first
// mission): a hover car in the `paint` ramp, a lit sign on the roof and a neon underglow.

import { defineCar } from "../../new-hope-lib/vehicles.ts";

export default defineCar({
  id: "new-hope/taxi",
  params: {
    glow: { type: "enum", values: ["neon-pink", "neon-cyan"], default: "neon-pink", description: "The underglow and its pool of light on the ground." },
    sign: { type: "bool", default: true, description: "The lit taxi sign on the roof." },
  },
  presets: { "cyan-glow": { glow: "neon-cyan" }, "off-duty": { sign: false } },
  variantSeeds: [1],
  slots: ["paint", "steel", "glass", "light-cold", "neon-pink", "neon-pink-dim", "neon-cyan", "neon-cyan-dim", "neon-yellow"],
  look: (params) => ({
    body: ["paint", 1],
    stripe: null,
    trim: ["steel", 0],
    glass: ["glass", 1],
    glow: params.glow === "neon-cyan" ? "neon-cyan" : "neon-pink",
    roof: params.sign ? "taxi-sign" : "none",
  }),
});
