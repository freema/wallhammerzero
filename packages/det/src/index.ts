// @whz/det: the determinism kit shared by asset programs, the sim and the audio synth.
// Integer arithmetic only; see README.md.

export { clamp, divCeil, divRound, divTrunc, idiv, imod, isqrt, lerpInt, mulDiv, mulDivRound } from "./int.ts";
export { asciiBytes, Fnv1a64, fnv1a32, fnv1a64Hex, hash32, mix32 } from "./hash.ts";
export { createRng, Rng } from "./rng.ts";
export type { RngState } from "./rng.ts";
export { FP_ONE, FP_SHIFT, icos, isin, TURN } from "./trig.ts";
export { ease, EASE_STEPS, easeTable, EASINGS, tween } from "./ease.ts";
export type { Easing } from "./ease.ts";
