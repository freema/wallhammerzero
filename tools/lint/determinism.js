// The determinism lint.
//
// Code under it must give the same result on every JavaScript engine and in a later port
// (a Godot player): asset programs, the determinism kit, the asset kit, the sim, and later
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
//   Intl, localeCompare, toLocale*       compare ASCII ids with < and > (compareId in @whz/sim)
//   fetch, storage, document, navigator  nothing: I/O is the host's job (host adapters)
//   globalThis, window, self, global     a back door to all of the above
//   eval, Function, import(), require    code made or loaded at run time: the lint cannot read it
//   process, import.meta                 the machine, the environment and the path of the checkout
//   Node built-ins (fs, node:fs, ...)    an asset program or a sim system does no I/O
//   <package>/node, .../src/node/...     the Node-side entry points of our own packages: I/O again
//
// Inline configuration comments (eslint-disable and the rest) are switched off for these files
// (`noInlineConfig`), so a rule cannot be silenced next to the line that breaks it.
//
// The root eslint.config.js lists the files it applies to. What the lint cannot catch, and
// what guards that instead, is in README.md beside this file.

import { builtinModules } from "node:module";

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

const IO = "is I/O. Deterministic code gets everything as arguments and returns its result; I/O is the host's job.";

const GLOBALS = {
  Date: "Date reads the clock. A frame is a pure function of (params, seed, clip, frame, facing).",
  performance: "performance reads the clock. A frame is a pure function of (params, seed, clip, frame, facing).",
  crypto: "crypto is not seeded. Use createRng(seed, stream) from @whz/det.",
  setTimeout: "Timers are not deterministic. A frame is a pure function of (params, seed, clip, frame, facing).",
  setInterval: "Timers are not deterministic. A frame is a pure function of (params, seed, clip, frame, facing).",
  requestAnimationFrame: "Frame callbacks are not deterministic. A frame is a pure function of (params, seed, clip, frame, facing).",
  parseFloat: "parseFloat gives a float. Deterministic code works in integers.",
  Intl: "Intl depends on the locale and the ICU version of the engine. Deterministic code uses ASCII ids and integers.",
  fetch: `fetch ${IO}`,
  XMLHttpRequest: `XMLHttpRequest ${IO}`,
  WebSocket: `WebSocket ${IO}`,
  localStorage: `localStorage ${IO}`,
  sessionStorage: `sessionStorage ${IO}`,
  indexedDB: `indexedDB ${IO}`,
  document: `document ${IO}`,
  navigator: `navigator ${IO}`,
  globalThis: "globalThis reaches Math, Date and the rest without the lint seeing it.",
  window: "window reaches Math, Date and the rest without the lint seeing it.",
  self: "self reaches Math, Date and the rest without the lint seeing it.",
  global: "global reaches Math, Date and the rest without the lint seeing it.",
  eval: "eval runs code the lint cannot read.",
  Function: "Function makes code from text, which the lint cannot read.",
  require: "require loads a module at run time: Node built-ins and files the lint cannot see. Use a static import.",
  process: "process is the machine and its environment (and process.getBuiltinModule reaches every Node built-in). Deterministic code gets everything as arguments.",
};

/** The Node built-in modules without the `node:` prefix (`fs`, `fs/promises`, `path`, ...). */
const BARE_BUILTINS = builtinModules.filter((name) => !name.startsWith("node:")).sort();

const NO_IO = "Deterministic code does no I/O and runs unchanged in Node and in the browser.";

const notAllowed = [...ALLOWED_MATH, ...Object.keys(NAMED_MATH)].join("|");

const IMPORT_PATHS = BARE_BUILTINS.map((name) => ({ name, message: `"${name}" is a Node built-in. ${NO_IO} ${HOW}` }));

const IMPORT_PATTERNS = [
  {
    group: ["node:*"],
    message: `${NO_IO} ${HOW}`,
  },
  {
    group: ["@whz/*/node", "@whz/*/node/**", "**/src/node", "**/src/node/**"],
    message: `This is a Node-side entry point of a package: it reads and writes files. ${NO_IO} ${HOW}`,
  },
];

const OWN_STREAM = "A sim system draws from ctx.rng, its own stream, which is in the digest and in every snapshot. A stream it makes itself is in neither.";

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
      selector: "MemberExpression[computed=false][property.name=/^(localeCompare|toLocale(String|DateString|TimeString|LowerCase|UpperCase))$/]",
      message: `Locale-aware methods depend on the locale and the ICU version of the engine. Compare ASCII ids with < and >, and format integers yourself. ${HOW}`,
    },
    {
      selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
      message: `** is Math.pow, which engines may round differently. Multiply, or use a table from @whz/det. ${HOW}`,
    },
    {
      selector: "ImportExpression",
      message: `import() loads a module at run time: the lint cannot see what it is, and it can be a Node built-in. Use a static import at the top of the file. ${HOW}`,
    },
    {
      selector: "MetaProperty[meta.name='import'][property.name='meta']",
      message: `import.meta is the path of the checkout and the host's module loader: the result would differ between machines. ${HOW}`,
    },
  ],
  "no-restricted-imports": ["error", { paths: IMPORT_PATHS, patterns: IMPORT_PATTERNS }],
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
    // No back door: `// eslint-disable-next-line` and every other inline configuration comment
    // is ignored in these files. A rule that is wrong for a file is changed here, in review.
    linterOptions: { noInlineConfig: true },
    rules: determinismRules,
  };
}

/**
 * A flat config object for sim systems, on top of `determinism`: a system may not import the
 * generator of @whz/det, so the only random numbers it has are the draws of `ctx.rng`. Put it
 * after `determinism(...)` in the config: it replaces the import rule with a stricter one.
 * @param {{ files: string[] }} options
 */
export function simSystems({ files }) {
  return {
    name: "whz/determinism-sim-systems",
    files,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...IMPORT_PATHS, { name: "@whz/det", importNames: ["createRng", "Rng"], message: `${OWN_STREAM} ${HOW}` }],
          patterns: [...IMPORT_PATTERNS, { group: ["**/det/src/**"], message: `Import @whz/det by its name. ${OWN_STREAM} ${HOW}` }],
        },
      ],
    },
  };
}
