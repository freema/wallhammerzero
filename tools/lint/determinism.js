// The determinism lint.
//
// Code under it must give the same result on every JavaScript engine and in a later port
// (a Godot player): asset programs, the determinism kit, the asset kit, and later the sim and
// the synth. A written rule is not enough (research/ref-procedural-pixel-creatures.md §5: a
// codebase with the rule and its own maths library still broke it 19 times), so the rule is a
// lint. It uses only ESLint core rules: no plugin, no type information.
//
// What it bans, and what to use instead (all from @whz/det):
//
//   Math.random, crypto                  createRng(seed, stream), hash32(x, y, seed)
//   Date, performance, timers            nothing: a frame is f(params, seed, frame)
//   Math.sin/cos/tan/exp/log/pow, **     isin, icos, ease, tween (integer tables)
//   Math.round                           divRound, mulDivRound, lerpInt (halves away from zero)
//   Math.sqrt and every other Math.*     isqrt; only the exact integer helpers of Math stay
//   parseFloat                           integers
//   globalThis, window, self, global     a back door to all of the above
//   node:* imports                       an asset program does no I/O
//
// The root eslint.config.js lists the files it applies to.

/** The members of `Math` that are exact on integers and the same in every engine. */
export const ALLOWED_MATH = ["abs", "ceil", "clz32", "floor", "imul", "max", "min", "sign", "trunc"];

const HOW = "See tools/lint/determinism.js.";

const TRIG = "is implementation-approximated: engines differ in the last bit. Use the integer tables of @whz/det (isin, icos, ease, tween).";

/** `Math` members with their own message; every other member that is not allowed gets the general one. */
const NAMED_MATH = {
  random: "Math.random is not seeded. Use createRng(seed, stream) or hash32(x, y, seed) from @whz/det.",
  sin: `Math.sin ${TRIG}`,
  cos: `Math.cos ${TRIG}`,
  tan: `Math.tan ${TRIG}`,
  exp: `Math.exp ${TRIG}`,
  log: `Math.log ${TRIG}`,
  pow: `Math.pow ${TRIG}`,
  round: "Math.round rounds halves up, other players round them away from zero. Use divRound, mulDivRound or lerpInt from @whz/det.",
  sqrt: "Math.sqrt gives a float. Use isqrt from @whz/det.",
};

const GLOBALS = {
  Date: "Date reads the clock. A frame is a pure function of (params, seed, clip, frame, facing).",
  performance: "performance reads the clock. A frame is a pure function of (params, seed, clip, frame, facing).",
  crypto: "crypto is not seeded. Use createRng(seed, stream) from @whz/det.",
  setTimeout: "Timers are not deterministic. A frame is a pure function of (params, seed, clip, frame, facing).",
  setInterval: "Timers are not deterministic. A frame is a pure function of (params, seed, clip, frame, facing).",
  requestAnimationFrame: "Frame callbacks are not deterministic. A frame is a pure function of (params, seed, clip, frame, facing).",
  parseFloat: "parseFloat gives a float. Deterministic code works in integers.",
  globalThis: "globalThis reaches Math, Date and the rest without the lint seeing it.",
  window: "window reaches Math, Date and the rest without the lint seeing it.",
  self: "self reaches Math, Date and the rest without the lint seeing it.",
  global: "global reaches Math, Date and the rest without the lint seeing it.",
};

const notAllowed = [...ALLOWED_MATH, ...Object.keys(NAMED_MATH)].join("|");

/** The rules, for use in any flat config object. */
export const determinismRules = {
  "no-restricted-globals": [
    "error",
    ...Object.entries(GLOBALS).map(([name, message]) => ({ name, message: `${message} ${HOW}` })),
  ],
  "no-restricted-properties": [
    "error",
    ...Object.entries(NAMED_MATH).map(([property, message]) => ({
      object: "Math",
      property,
      message: `${message} ${HOW}`,
    })),
    { object: "Number", property: "parseFloat", message: `Number.parseFloat gives a float. Deterministic code works in integers. ${HOW}` },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: `MemberExpression[computed=false][object.name='Math'][property.name!=/^(${notAllowed})$/]`,
      message: `Only the exact integer helpers of Math are allowed here (${ALLOWED_MATH.join(", ")}): the others give floats or differ between engines. Use @whz/det. ${HOW}`,
    },
    {
      selector: "MemberExpression[computed=true][object.name='Math']",
      message: `Math[...] hides which function is called. Write Math.<name> with an allowed name (${ALLOWED_MATH.join(", ")}). ${HOW}`,
    },
    {
      selector: ":not(MemberExpression) > Identifier[name='Math']",
      message: `Math may only be used as Math.<name>: an alias or a destructuring hides which function is called. ${HOW}`,
    },
    {
      selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
      message: `** is Math.pow, which engines may round differently. Multiply, or use a table from @whz/det. ${HOW}`,
    },
  ],
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          group: ["node:*"],
          message: `Deterministic code does no I/O and runs unchanged in Node and in the browser. ${HOW}`,
        },
      ],
    },
  ],
};

/**
 * A flat config object that puts `files` under the determinism lint.
 * @param {{ files: string[], ignores?: string[] }} options
 */
export function determinism({ files, ignores = [] }) {
  return {
    name: "whz/determinism",
    files,
    ignores,
    rules: determinismRules,
  };
}
