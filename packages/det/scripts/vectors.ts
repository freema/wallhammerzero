// Builds the test vectors of data/vectors.json: known outputs for given seeds and inputs.
// A second implementation of the kit (a Godot player, for one) reads the JSON file and checks
// its port against it. Every number in the file is an integer below 2^53.

import {
  createRng,
  divCeil,
  divRound,
  divTrunc,
  EASE_STEPS,
  easeTable,
  EASINGS,
  fnv1a32,
  fnv1a64Hex,
  FP_ONE,
  hash32,
  icos,
  idiv,
  imod,
  isin,
  isqrt,
  lerpInt,
  mix32,
  mulDiv,
  mulDivRound,
  TURN,
  tween,
} from "../src/index.ts";

const SEEDS = [0, 1, 2, 42, 2026, 0x7fffffff, 0x80000000, 0xffffffff];
const STREAMS = ["a", "b", "hair", "sparkle", "sim/customers"];
const TEXTS = ["", "a", "foobar", "sparkle", "sim/customers", "The quick brown fox jumps over the lazy dog"];
const INTS = [0, 1, -1, 2, -2, 3, 7, -7, 8, -8, 255, -255, 256, 65536, -65536, 1000003, -1000003, 0x7fffffff];
const DIVISORS = [1, -1, 2, -2, 3, -3, 4, 7, -7, 256, 65536];
const SAMPLES = 16;

function take(count: number, next: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) out.push(next());
  return out;
}

function pairs<T>(fn: (a: number, b: number) => T): { a: number; b: number; out: T }[] {
  const out = [];
  for (const a of INTS) for (const b of DIVISORS) out.push({ a, b, out: fn(a, b) });
  return out;
}

export function buildVectors() {
  const hashInputs: [number, number, number][] = [];
  for (const seed of [0, 1, 42, 0xffffffff]) {
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, -1], [15, 7], [1000, -1000], [0x7fffffff, -0x80000000]] as const) {
      hashInputs.push([x, y, seed]);
    }
  }

  const rngStreams = [];
  for (const seed of SEEDS) {
    for (const stream of STREAMS) {
      const rng = createRng(seed, stream);
      rngStreams.push({ seed, stream, state: [...rng.state()], next: take(SAMPLES, () => rng.next()) });
    }
  }

  const triples: [number, number, number][] = [
    [0, 5, 3], [7, 3, 2], [-7, 3, 2], [7, -3, 2], [7, 3, -2], [1, 1, 2], [-1, 1, 2], [3, 1, 2], [-3, 1, 2],
    [65536, 46341, 65536], [-65536, 46341, 65536], [123456789, 65536, 1000], [0x7fffffff, 0x1fffff, 4096],
    [-0x7fffffff, 0x1fffff, 4096], [250, 65536, 256], [5, 32768, 65536], [-5, 32768, 65536],
  ];

  const angles = [
    0, 1, 2, 3, 100, 511, 512, 513, 1023, 1024, 1025, 1536, 2047, 2048, 2049, 3071, 3072, 3073, 4095, 4096,
    4097, 5120, -1, -2, -512, -1024, -1025, -2048, -4096, -4097, 1000000, -1000000, 4294967296, -4294967297,
  ];

  const tweens = [];
  for (const kind of EASINGS) {
    for (const [from, to, steps] of [[0, 8, 4], [10, -10, 7], [-3, 100, 12], [0, 1, 3]] as const) {
      for (let step = 0; step <= steps; step += 1) {
        tweens.push({ easing: kind, from, to, step, steps, out: tween(kind, from, to, step, steps) });
      }
    }
  }

  return {
    format: "wz.det-vectors/1",
    about:
      "Test vectors of @whz/det (packages/det). Each entry lists the inputs and the expected `out`. " +
      "Built by packages/det/scripts/make-data.ts; a port must reproduce every entry.",
    constants: { TURN, FP_ONE, EASE_STEPS },
    mix32: [0, 1, 2, 0x9e3779b9, 0x7fffffff, 0x80000000, 0xffffffff].map((value) => ({ value, out: mix32(value) })),
    hash32: hashInputs.map(([x, y, seed]) => ({ x, y, seed, out: hash32(x, y, seed) })),
    fnv1a32: TEXTS.map((text) => ({ text, out: fnv1a32(text) })),
    fnv1a64: TEXTS.map((text) => ({ text, out: fnv1a64Hex(text) })),
    rng: {
      about:
        "`state` is [a, b, c, counter] right after seeding (the warm-up included); `next` holds the outputs that follow. " +
        "The other lists are consecutive draws from a fresh generator of the given seed and stream.",
      streams: rngStreams,
      int: [1, 2, 3, 6, 10, 100, 1000, 0x80000001, 0x100000000].map((n) => {
        const rng = createRng(2026, "int");
        return { seed: 2026, stream: "int", n, out: take(SAMPLES, () => rng.int(n)) };
      }),
      range: ([[0, 0], [-3, 3], [1, 6], [-100, -90], [0, 0xffffffff]] as const).map(([lo, hi]) => {
        const rng = createRng(7, "range");
        return { seed: 7, stream: "range", lo, hi, out: take(SAMPLES, () => rng.range(lo, hi)) };
      }),
      chance: ([[0, 1], [1, 1], [1, 2], [1, 6], [99, 100]] as const).map(([num, den]) => {
        const rng = createRng(11, "chance");
        return { seed: 11, stream: "chance", num, den, out: take(SAMPLES, () => (rng.chance(num, den) ? 1 : 0)) };
      }),
      weighted: [[1], [6, 1], [0, 1, 0], [1, 2, 3, 4], [5, 0, 5]].map((weights) => {
        const rng = createRng(13, "weighted");
        return { seed: 13, stream: "weighted", weights, out: take(SAMPLES, () => rng.weighted(weights)) };
      }),
      shuffle: [1, 2, 5, 10].map((length) => {
        const items = Array.from({ length }, (_, i) => i);
        return { seed: 17, stream: "shuffle", length, out: createRng(17, "shuffle").shuffle(items) };
      }),
      fork: SEEDS.slice(0, 4).map((seed) => {
        const child = createRng(seed, "sim").fork("customers");
        return { seed, stream: "sim", name: "customers", childStream: child.stream, next: take(4, () => child.next()) };
      }),
    },
    idiv: pairs(idiv),
    imod: pairs(imod),
    divTrunc: pairs(divTrunc),
    divCeil: pairs(divCeil),
    divRound: pairs(divRound),
    mulDiv: triples.map(([a, b, c]) => ({ a, b, c, out: mulDiv(a, b, c) })),
    mulDivRound: triples.map(([a, b, c]) => ({ a, b, c, out: mulDivRound(a, b, c) })),
    lerpInt: ([[0, 10, 1, 4], [10, 0, 1, 4], [-5, 5, 1, 2], [0, 7, 2, 3], [3, 3, 1, 2], [0, -9, 5, 6]] as const).map(
      ([from, to, num, den]) => ({ from, to, num, den, out: lerpInt(from, to, num, den) }),
    ),
    isqrt: [0, 1, 2, 3, 4, 8, 9, 15, 16, 17, 99, 100, 65535, 65536, 0x7fffffff, 0xffffffff, 4503599627370496].map(
      (n) => ({ n, out: isqrt(n) }),
    ),
    isin: angles.map((angle) => ({ angle, out: isin(angle) })),
    icos: angles.map((angle) => ({ angle, out: icos(angle) })),
    ease: {
      about: "One table per easing: the fixed-point weight for t = 0 .. EASE_STEPS.",
      tables: Object.fromEntries(EASINGS.map((kind) => [kind, [...easeTable(kind)]])),
    },
    tween: tweens,
  };
}

export type DetVectors = ReturnType<typeof buildVectors>;
