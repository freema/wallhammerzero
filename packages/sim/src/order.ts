// Explicit ordering. A second player (Godot) iterates dictionaries in insertion order and its
// sort is not stable, so the sim never relies on either: maps are walked by sorted key, and
// every comparator is a total order (two different items never compare equal).

import { SimError } from "./errors.ts";

/** A comparator: negative, zero or positive, as for `Array.prototype.sort`. */
export type Compare<T> = (a: T, b: T) => number;

/** Integers in ascending order. */
export function compareInt(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * ASCII ids in ascending byte order. The sim's strings are ASCII, so code units, code points
 * and bytes agree, and a port compares the same way. Never `localeCompare`.
 */
export function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The comparators in turn: the first that is not zero decides. End with a unique key. */
export function compareBy<T>(...comparators: Compare<T>[]): Compare<T> {
  return (a, b) => {
    for (const compare of comparators) {
      const order = compare(a, b);
      if (order !== 0) return order;
    }
    return 0;
  };
}

/** The own keys of a record in ascending ASCII order: the only way the sim walks a map. */
export function sortedKeys(record: object): string[] {
  return Object.keys(record).sort(compareId);
}

/**
 * A sorted copy of `items`. Throws if two items compare equal, because then the result would
 * depend on the sort algorithm: give the comparator a tie-break on a stable id.
 */
export function sortTotal<T>(items: readonly T[], compare: Compare<T>, what = "sortTotal"): T[] {
  const sorted = [...items].sort(compare);
  for (let i = 1; i < sorted.length; i += 1) {
    if (compare(sorted[i - 1] as T, sorted[i] as T) === 0) {
      throw new SimError(`${what}: the comparator is not a total order (items ${i - 1} and ${i} of the sorted list compare equal); add a tie-break on a stable id`);
    }
  }
  return sorted;
}
