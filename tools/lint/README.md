# @whz/lint: the determinism lint

Code that must give the same result on every JavaScript engine and in a later port may not use
clocks, unseeded randomness, I/O or floating-point `Math`. A written rule is not enough, so the
rule is a lint: [`determinism.js`](determinism.js), built from ESLint core rules only (no plugin,
no type information). The list of what it bans and what to use instead is the comment at the
top of that file; the replacements are in [`@whz/det`](../../packages/det/README.md).

## Where it applies

`DETERMINISTIC` in [`eslint.config.js`](../../eslint.config.js) is the one list of files under
the lint, and `DETERMINISTIC_EXCEPT` the Node-side entry points (`src/node/`) and the audio
analysis that are not. A package joins by adding its source glob there. Tests, scripts and
build tools are never under it.

## No back doors

- **Inline configuration is off** in the files under the lint (`noInlineConfig`):
  `// eslint-disable-next-line`, `/* eslint-disable */` and `/* eslint <rule>: off */` have no
  effect there, and ESLint says so. A rule that is wrong for a file is changed in
  `eslint.config.js` or in `determinism.js`, where a review sees it.
- **No code made or loaded at run time:** `eval`, `Function`, `import()` and `require` are
  banned, because the lint can only read the code that is written down.
- **No way to the machine:** Node built-ins (`fs` and `node:fs` alike), the Node-side entry
  points of our own packages (`@whz/asset-kit/node`, `.../src/node/...`), `process`,
  `import.meta`, `globalThis` and its aliases.

## What the lint cannot catch, and what guards it instead

The lint reads syntax. It has no types, so it cannot tell an integer from a float:

| Not caught | Why | What guards it instead |
|---|---|---|
| **Float literals** (`0.5`, `1e-3`) | A literal is legal syntax, and the synth (`packages/audio`) computes in floats on purpose | The integer checks and the golden hashes below |
| **Plain `/` division** (`7 / 2` is `3.5`) | The lint cannot know that the operands are integers that do not divide evenly; `(a / b) \| 0` is fine and looks the same | The same. Use `idiv`, `divRound` or `mulDivRound` from `@whz/det` |
| Other float sources: `%` and `*` on floats, `Number("1.5")`, `+text`, `JSON.parse` of a fraction, `toFixed` | Legal on integers | The same |
| A banned name reached by a computed key or through a value: `[]["constructor"]["constructor"]("...")`, `Reflect.get(x, "random")`, a function passed in from outside | No type information, no data flow | Review. The typecheck helps: deterministic sources are compiled without DOM and Node types (`tsconfig.json` of each package) |
| A random stream a sim system makes beside the one it is given (`createRng` with a constant seed) | It is seeded, so the general lint allows it, and it is in no digest and no snapshot, so no replay would see it | In `packages/sim/src/systems/` the import of `createRng` and `Rng` is banned (`simSystems` in `determinism.js`). At run time `ctx.rng` is a frozen handle without `fork` ([docs/sim.md](../../docs/sim.md)) |
| Order that depends on the engine: walking an object with integer-like keys, a comparator with ties | Legal syntax | `sortedKeys` and `sortTotal` in `@whz/sim` (a tie throws); canonical JSON sorts keys |

What turns such a mistake into a red gate:

- **The integer state check of the sim.** After `init` and after every tick the kernel checks
  every field of every state table against its declaration: a float, a value outside its bounds
  or a dangling id stops the sim with the table and the field in the message
  ([docs/sim.md](../../docs/sim.md)). Sim data, commands and events are checked the same way
  when they enter.
- **Integer-only APIs.** `IndexedBuffer` refuses a coordinate or a colour that is not an integer;
  the `@whz/det` helpers refuse non-integers; canonical JSON (`packages/game-data`) refuses any
  number that is not a safe integer, and the game schemas refuse a number written with a
  fraction or an exponent.
- **Golden hashes.** The output hash of the example assets, the voxel bakes in all four facings,
  the CPU renderer's frames, the sim's golden replay (run twice in the gate, the second time
  saving and loading on every tick), the test vectors of `@whz/det` and the PCM hashes of the
  example songs and SFX. A float that slips in changes a hash on some engine or after some
  change, and the gate goes red. A golden changes only in a deliberate commit that says why.

So the lint keeps the known non-portable functions out, and the hashes and the integer checks
catch what the lint cannot see. Neither is enough alone.

## Checks

`./dev npm run check -- @whz/lint` runs [`test/determinism.test.mjs`](test/determinism.test.mjs):
the fixtures under `test/fixtures/` fail (an asset with `Math.random()`, one with `Math.sin()`,
one with `// eslint-disable-next-line` above `Math.random()`, one with `eval` and
`new Function`, one with a dynamic `import()`, one with `fs` and `node:os` imports, and a sim
system with `Math.random()` or its own `createRng`), every banned construct is caught in every
place the lint applies and nowhere else, and the real assets and packages are clean. The
fixture folder is ignored by the normal lint run; the test lints each file as if it were under
`assets/` or `packages/sim/src/systems/`.
