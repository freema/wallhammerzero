// The seeded random number generator: sfc32 (Chris Doty-Humphrey's "small fast chaotic"
// generator, 32-bit variant). It uses only 32-bit add, xor, shift and rotate, so it ports
// exactly to any language. There is no float output: callers ask for integers.
//
// Streams. A generator is made from a seed and a stream name. Each (seed, name) pair is its
// own independent sequence, so a new stream, or more draws from one stream, never changes what
// another stream gives. Use one stream per concern ("hair", "sparkle", "customers").
//
// Seeding, for ports:
//   k = fnv1a32(ASCII bytes of the stream name)
//   a = hash32(k, 1, seed), b = hash32(k, 2, seed), c = hash32(k, 3, seed), counter = 1
//   then 12 outputs are discarded.

import { fnv1a32, hash32 } from "./hash.ts";

const TWO_32 = 0x100000000;
const WARM_UP_ROUNDS = 12;

/** The four 32-bit words of an sfc32 generator: a, b, c and the counter. */
export type RngState = readonly [a: number, b: number, c: number, counter: number];

function requireCount(fn: string, name: string, value: number, max: number): void {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${fn}: ${name} must be an integer in [1, ${max}], got ${String(value)}`);
  }
}

export class Rng {
  /** The seed this stream was made from (unsigned 32-bit). */
  readonly seed: number;
  /** The stream name. */
  readonly stream: string;

  private a: number;
  private b: number;
  private c: number;
  private counter: number;

  constructor(seed: number, stream: string) {
    if (!Number.isInteger(seed) || seed < -0x80000000 || seed > 0xffffffff) {
      throw new RangeError(`createRng: seed must be a 32-bit integer, got ${String(seed)}`);
    }
    if (stream === "") throw new RangeError("createRng: the stream name must not be empty");
    this.seed = seed >>> 0;
    this.stream = stream;
    const key = fnv1a32(stream);
    this.a = hash32(key, 1, this.seed) | 0;
    this.b = hash32(key, 2, this.seed) | 0;
    this.c = hash32(key, 3, this.seed) | 0;
    this.counter = 1;
    for (let i = 0; i < WARM_UP_ROUNDS; i += 1) this.next();
  }

  /** The next unsigned 32-bit integer. */
  next(): number {
    const result = (((this.a + this.b) | 0) + this.counter) | 0;
    this.counter = (this.counter + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (((this.c << 21) | (this.c >>> 11)) + result) | 0;
    return result >>> 0;
  }

  /** A uniform integer in `[0, n)`, without modulo bias. `n` is in `[1, 2^32]`. */
  int(n: number): number {
    requireCount("Rng.int", "n", n, TWO_32);
    // Reject the top partial block of the 32-bit range; this loops rarely (never for powers of 2).
    const limit = TWO_32 - (TWO_32 % n);
    let value = this.next();
    while (value >= limit) value = this.next();
    return value % n;
  }

  /** A uniform integer in `[lo, hi]`, both ends included. */
  range(lo: number, hi: number): number {
    if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || hi < lo) {
      throw new RangeError(`Rng.range: need integers lo <= hi, got ${String(lo)} and ${String(hi)}`);
    }
    requireCount("Rng.range", "hi - lo + 1", hi - lo + 1, TWO_32);
    return lo + this.int(hi - lo + 1);
  }

  /** True with probability `num / den`. */
  chance(num: number, den: number): boolean {
    requireCount("Rng.chance", "den", den, TWO_32);
    if (!Number.isInteger(num) || num < 0 || num > den) {
      throw new RangeError(`Rng.chance: num must be an integer in [0, ${den}], got ${String(num)}`);
    }
    return this.int(den) < num;
  }

  /** One element of a non-empty list, each equally likely. */
  pick<T>(items: ArrayLike<T>): T {
    requireCount("Rng.pick", "items.length", items.length, TWO_32);
    return items[this.int(items.length)] as T;
  }

  /**
   * An index into `weights`, chosen with probability `weights[i] / sum`. Weights are
   * non-negative integers with a positive sum. `[6, 1]` picks index 0 six times in seven.
   */
  weighted(weights: ArrayLike<number>): number {
    let sum = 0;
    for (let i = 0; i < weights.length; i += 1) {
      const weight = weights[i] as number;
      if (!Number.isInteger(weight) || weight < 0) {
        throw new RangeError(`Rng.weighted: weight ${i} must be a non-negative integer, got ${String(weight)}`);
      }
      sum += weight;
    }
    requireCount("Rng.weighted", "the sum of the weights", sum, TWO_32);
    let roll = this.int(sum);
    for (let i = 0; i < weights.length; i += 1) {
      const weight = weights[i] as number;
      if (roll < weight) return i;
      roll -= weight;
    }
    throw new Error("Rng.weighted: unreachable");
  }

  /** Shuffles `items` in place (Fisher-Yates, from the last element down) and returns it. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      const held = items[i] as T;
      items[i] = items[j] as T;
      items[j] = held;
    }
    return items;
  }

  /**
   * A child stream named `<this stream>/<name>` of the same seed. It does not depend on how
   * many numbers this stream has given, and it does not advance this stream.
   */
  fork(name: string): Rng {
    if (name === "") throw new RangeError("Rng.fork: the stream name must not be empty");
    return new Rng(this.seed, `${this.stream}/${name}`);
  }

  /** The current state, for snapshots. Four unsigned 32-bit integers. */
  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.counter >>> 0];
  }

  /** Puts back a state taken with `state()`. */
  restore(state: RngState): this {
    if (state.length !== 4) throw new RangeError("Rng.restore: a state has four words");
    for (const word of state) {
      if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) {
        throw new RangeError(`Rng.restore: ${String(word)} is not an unsigned 32-bit integer`);
      }
    }
    this.a = state[0] | 0;
    this.b = state[1] | 0;
    this.c = state[2] | 0;
    this.counter = state[3] | 0;
    return this;
  }
}

/**
 * The generator for one named stream of a seed. The seed is a 32-bit integer (a negative one
 * is read as its unsigned value); the stream name is ASCII.
 */
export function createRng(seed: number, stream: string): Rng {
  return new Rng(seed, stream);
}
