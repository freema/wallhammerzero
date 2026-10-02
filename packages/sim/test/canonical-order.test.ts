import { describe, expect, it } from "vitest";
import { canonicalJson, compareBy, compareId, compareInt, SimError, sortedKeys, sortTotal } from "../src/index.ts";

describe("canonicalJson", () => {
  it("writes keys in ascending order, without whitespace, whatever order they were set in", () => {
    const a = { tick: 3, type: "shop.set-price", payload: { price: 4, item: "apple" } };
    const b = { payload: { item: "apple", price: 4 }, type: "shop.set-price", tick: 3 };
    expect(canonicalJson(a)).toBe('{"payload":{"item":"apple","price":4},"tick":3,"type":"shop.set-price"}');
    expect(canonicalJson(b)).toBe(canonicalJson(a));
  });

  it("orders integer-like keys as text, not as numbers (JS objects put them first)", () => {
    expect(canonicalJson({ b: 1, "10": 2, "2": 3, a: 4 })).toBe('{"10":2,"2":3,"a":4,"b":1}');
  });

  it("is the same text as RFC 8785 for what it accepts", () => {
    const value = { n: [0, -1, 9007199254740991, -9007199254740991], t: true, f: false, z: null, s: 'a "quoted" \\ string', e: {}, l: [] };
    const text = canonicalJson(value);
    expect(JSON.parse(text)).toEqual(value);
    // For ASCII keys and integers, JCS is JSON.stringify with sorted keys.
    expect(text).toBe('{"e":{},"f":false,"l":[],"n":[0,-1,9007199254740991,-9007199254740991],"s":"a \\"quoted\\" \\\\ string","t":true,"z":null}');
  });

  it("writes a negative zero as 0", () => {
    expect(canonicalJson([-0, 0])).toBe("[0,0]");
  });

  it("refuses what two players could write differently", () => {
    const refused: [unknown, RegExp][] = [
      [0.1, /\$ is 0.1, not a safe integer/],
      [{ a: [1, 2.5] }, /\$\.a\[1\] is 2.5, not a safe integer/],
      [Number.NaN, /not a safe integer/],
      [2 ** 53, /not a safe integer/],
      [{ name: "žluťoučký" }, /\$\.name is not printable ASCII/],
      [{ "klíč": 1 }, /a key of \$ is not printable ASCII/],
      ["line\nbreak", /not printable ASCII/],
      [{ a: undefined }, /\$\.a is a undefined/],
      [() => 1, /is a function/],
      [new Map(), /is not a plain object/],
      [new Date(0), /is not a plain object/],
    ];
    for (const [value, message] of refused) {
      expect(() => canonicalJson(value)).toThrow(message);
      expect(() => canonicalJson(value)).toThrow(SimError);
    }
  });
});

describe("ordering", () => {
  it("compareId is byte order, not locale order", () => {
    const ids = ["b", "a-2", "a-10", "a", "a.b", "a_b", "a1"];
    expect([...ids].sort(compareId)).toEqual(["a", "a-10", "a-2", "a.b", "a1", "a_b", "b"]);
    expect(compareId("a", "a")).toBe(0);
  });

  it("compareInt orders numbers as numbers", () => {
    expect([10, 9, -1, 100, 0].sort(compareInt)).toEqual([-1, 0, 9, 10, 100]);
  });

  it("sortedKeys walks a map by ascending key", () => {
    expect(sortedKeys({ pear: 1, "10": 2, apple: 3, "9": 4 })).toEqual(["10", "9", "apple", "pear"]);
  });

  it("sortTotal sorts a copy with a total order", () => {
    const rows = [{ id: 3, score: 5 }, { id: 1, score: 9 }, { id: 2, score: 5 }];
    const byScoreThenId = compareBy<(typeof rows)[number]>((a, b) => compareInt(b.score, a.score), (a, b) => compareInt(a.id, b.id));
    expect(sortTotal(rows, byScoreThenId).map((row) => row.id)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.id)).toEqual([3, 1, 2]);
  });

  it("sortTotal refuses a comparator that leaves a tie: the order would depend on the sort", () => {
    const rows = [{ id: 3, score: 5 }, { id: 1, score: 9 }, { id: 2, score: 5 }];
    expect(() => sortTotal(rows, (a, b) => compareInt(a.score, b.score), "ranking")).toThrow(/ranking: the comparator is not a total order/);
    expect(sortTotal([], compareInt)).toEqual([]);
    expect(() => sortTotal([1, 1], compareInt)).toThrow(SimError);
  });
});
