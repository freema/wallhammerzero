# @whz/det

The determinism kit shared by asset programs, the sim and the audio synth. Everything here is
integer arithmetic that gives the same numbers on every JavaScript engine and can be ported
exactly (to a Godot player, for one): no `Math.random`, no `Math.sin`, no floats, no clock.
No dependencies; runs in Node and in the browser.

| Area | API | Notes |
|---|---|---|
| Random numbers | `createRng(seed, stream)` → `next`, `int(n)`, `range(lo, hi)`, `chance(num, den)`, `pick`, `weighted`, `shuffle`, `fork(name)`, `state` / `restore` | sfc32. One stream per concern: each `(seed, name)` is its own sequence, so adding a stream or drawing more from one never changes another. No float output. |
| Positional hash | `hash32(x, y, seed)`, `mix32(v)` | The same cell always gets the same value. Use it for tile variants and textures. |
| Content hashes | `fnv1a32(data)`, `Fnv1a64` (streaming, typed little-endian writers), `fnv1a64Hex(data)` | Text must be ASCII, so ports agree on the bytes. |
| Trigonometry | `isin(a)`, `icos(a)`; `TURN = 4096` angle units per turn, results in 16.16 fixed point (`FP_ONE = 65536`) | Read from `data/isin.json`, built with exact integer arithmetic. |
| Easing | `ease(name, t)` for `t` in `0..EASE_STEPS` (256), `easeTable(name)`, `tween(name, from, to, step, steps)`, `EASINGS` | 12 easings as integer tables. `tween` returns an integer. |
| Integer maths | `idiv`, `imod` (floor), `divTrunc`, `divCeil`, `divRound`, `mulDiv`, `mulDivRound`, `lerpInt`, `isqrt`, `clamp` | The rounding is in the name; "round" means halves away from zero. They throw on a float, on division by zero and on a result beyond 53 bits. |

```ts
import { createRng, hash32, isin, mulDivRound, FP_ONE, TURN } from "@whz/det";

const hair = createRng(seed, "hair").pick(["short", "long", "bun"]); // its own stream
const variant = hash32(tileX, tileY, seed) % 4; // stable per cell
const bob = mulDivRound(isin((frame * TURN) / 4), 2, FP_ONE); // -2..2 px, an integer (frame is an integer)
```

## For ports: test vectors

`data/vectors.json` (`@whz/det/vectors.json`) lists inputs and expected outputs for every
function above, as integers below 2^53: hashes, the RNG state after seeding and its outputs
per seed and stream, every draw method, the division helpers with negative operands, sine and
cosine samples and the full easing tables. A second implementation is correct when it
reproduces every entry. The seeding of a stream is described at the top of `src/rng.ts`.

Both data files are generated: `./dev npm run make-data -w @whz/det`. The tests fail if they
are out of date, and they check the kit against independent references (BigInt arithmetic,
published FNV-1a values, a sine table rebuilt from the Taylor series).

Code under the determinism lint (`tools/lint/determinism.js`) must use this kit instead of
`Math.random`, `Date`, `Math.sin` and friends.
