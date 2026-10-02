// Integer helpers with explicit rounding.
//
// JavaScript's `/` gives a float and `%` truncates toward zero; GDScript's `/` on two ints
// truncates and its `round()` rounds halves away from zero while `Math.round` rounds them up.
// Every helper here names its rounding, takes and returns integers, and throws instead of
// returning a float, NaN or Infinity. All inputs and results must be safe integers
// (|v| <= 2^53 - 1), so a port with 64-bit integers gives the same numbers.

function requireInt(fn: string, name: string, value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${fn}: ${name} must be a safe integer, got ${String(value)}`);
  }
}

function requireDivision(fn: string, a: number, b: number): void {
  requireInt(fn, "a", a);
  requireInt(fn, "b", b);
  if (b === 0) throw new RangeError(`${fn}: division by zero`);
}

/** The quotient truncated toward zero, without a negative zero. */
function truncQuotient(a: number, b: number): number {
  const q = Math.trunc(a / b);
  return q === 0 ? 0 : q;
}

/** Floor division: rounds toward negative infinity. `idiv(-7, 2) === -4`. */
export function idiv(a: number, b: number): number {
  requireDivision("idiv", a, b);
  const q = truncQuotient(a, b);
  const r = a - q * b;
  return r !== 0 && (r < 0) !== (b < 0) ? q - 1 : q;
}

/**
 * Floored modulo, the remainder of `idiv`: the result has the sign of `b`, so for `b > 0` it
 * is always in `[0, b)`. `imod(-7, 4) === 1` (JavaScript's `-7 % 4` is `-3`).
 */
export function imod(a: number, b: number): number {
  requireDivision("imod", a, b);
  const r = a % b;
  if (r === 0) return 0;
  return (r < 0) !== (b < 0) ? r + b : r;
}

/** Division truncated toward zero (what GDScript's `/` does on two ints). `divTrunc(-7, 2) === -3`. */
export function divTrunc(a: number, b: number): number {
  requireDivision("divTrunc", a, b);
  return truncQuotient(a, b);
}

/** Division rounded toward positive infinity. `divCeil(7, 2) === 4`, `divCeil(-7, 2) === -3`. */
export function divCeil(a: number, b: number): number {
  requireDivision("divCeil", a, b);
  const q = truncQuotient(a, b);
  const r = a - q * b;
  return r !== 0 && (r < 0) === (b < 0) ? q + 1 : q;
}

/**
 * Division rounded to the nearest integer, halves away from zero.
 * `divRound(5, 2) === 3`, `divRound(-5, 2) === -3` (`Math.round(-2.5)` is `-2`).
 */
export function divRound(a: number, b: number): number {
  requireDivision("divRound", a, b);
  const q = truncQuotient(a, b);
  const r = a - q * b;
  if (Math.abs(r) * 2 < Math.abs(b)) return q;
  return (a < 0) !== (b < 0) ? q - 1 : q + 1;
}

function product(fn: string, a: number, b: number): number {
  requireInt(fn, "a", a);
  requireInt(fn, "b", b);
  const p = a * b;
  if (!Number.isSafeInteger(p)) {
    throw new RangeError(`${fn}: ${a} * ${b} does not fit in 53 bits`);
  }
  return p === 0 ? 0 : p;
}

/** `floor(a * b / c)` with an exact intermediate product. Throws if `a * b` leaves 53 bits. */
export function mulDiv(a: number, b: number, c: number): number {
  return idiv(product("mulDiv", a, b), c);
}

/** `a * b / c` rounded to the nearest integer, halves away from zero. */
export function mulDivRound(a: number, b: number, c: number): number {
  return divRound(product("mulDivRound", a, b), c);
}

/** The integer square root: the largest `r` with `r * r <= n`. */
export function isqrt(n: number): number {
  requireInt("isqrt", "n", n);
  if (n < 0) throw new RangeError(`isqrt: n must not be negative, got ${n}`);
  if (n < 2) return n;
  // Newton's iteration on integers, from above; it stops at floor(sqrt(n)).
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** `value` limited to `[lo, hi]`. */
export function clamp(value: number, lo: number, hi: number): number {
  requireInt("clamp", "value", value);
  requireInt("clamp", "lo", lo);
  requireInt("clamp", "hi", hi);
  if (lo > hi) throw new RangeError(`clamp: lo ${lo} is above hi ${hi}`);
  return value < lo ? lo : value > hi ? hi : value;
}

/**
 * The point `num / den` of the way from `from` to `to`, rounded to the nearest integer
 * (halves away from zero). `lerpInt(0, 10, 1, 4) === 3`.
 */
export function lerpInt(from: number, to: number, num: number, den: number): number {
  requireInt("lerpInt", "from", from);
  requireInt("lerpInt", "to", to);
  return from + mulDivRound(to - from, num, den);
}
