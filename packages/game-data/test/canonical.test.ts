// Canonical JSON (RFC 8785 for integers) and the UTF-8 it is stored as.

import { canonicalJson as simCanonicalJson } from "@whz/sim";
import { describe, expect, it } from "vitest";
import { CanonicalError, canonicalBytes, contentHash, parseJson, toCanonicalJson, utf8Bytes, utf8Text } from "../src/index.ts";
import type { ObjectNode } from "../src/index.ts";

describe("toCanonicalJson", () => {
  it("sorts keys, at every level, and writes no whitespace", () => {
    expect(toCanonicalJson({ b: [{ z: 1, a: 2 }], a: { d: true, c: null } })).toBe('{"a":{"c":null,"d":true},"b":[{"a":2,"z":1}]}');
  });

  it("sorts keys by UTF-16 code units (the example of RFC 8785, section 3.2.3)", () => {
    const value = {
      "€": "Euro Sign",
      "\r": "Carriage Return",
      "דּ": "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      "\u{1f600}": "Emoji: Grinning Face",
      "\u0080": "Control",
      "ö": "Latin Small Letter O With Diaeresis",
    };
    const written = parseJson(toCanonicalJson(value)) as ObjectNode;
    expect(written.members.map((member) => member.key)).toEqual(["\r", "1", "\u0080", "ö", "€", "\u{1f600}", "דּ"]);
  });

  it("escapes strings as RFC 8785 says (section 3.2.2.2)", () => {
    // The RFC's example: "€$\u000F\u000aA'B"\\\\"\/" becomes "€$\u000f\nA'B\"\\\\\"/".
    const value = JSON.parse('"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/"') as string;
    expect(toCanonicalJson(value)).toBe('"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"');
    expect(toCanonicalJson("\b\t\n\f\r\u0000\u001f\u007f ")).toBe('"\\b\\t\\n\\f\\r\\u0000\\u001f\u007f "');
    expect(toCanonicalJson("Štamgast, Chléb")).toBe('"Štamgast, Chléb"');
  });

  it("writes integers plainly, and zero as 0", () => {
    expect(toCanonicalJson([0, -0, 7, -12, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])).toBe("[0,0,7,-12,9007199254740991,-9007199254740991]");
  });

  it.each([
    [1.5, /\$ is 1\.5, not a safe integer/],
    [{ a: [0, Number.NaN] }, /\$\["a"\]\[1\] is NaN, not a safe integer/],
    [2 ** 53, /not a safe integer/],
    [{ a: undefined }, /\$\["a"\] is undefined/],
    [{ a: () => 1 }, /is a function/],
    [new Date(0), /\$ is not a plain object/],
    ["\ud83d", /half of a surrogate pair/],
    [{ "\ude00": 1 }, /a key of \$ holds half of a surrogate pair/],
  ])("refuses %j", (value, message) => {
    expect(() => toCanonicalJson(value)).toThrow(CanonicalError);
    expect(() => toCanonicalJson(value)).toThrow(message);
  });

  it("does not depend on the order the keys were written in", () => {
    const a = { id: "apple", price: 3, tags: ["x", "y"] };
    const b = { tags: ["x", "y"], price: 3, id: "apple" };
    expect(toCanonicalJson(a)).toBe(toCanonicalJson(b));
    expect(toCanonicalJson({ tags: ["y", "x"] })).not.toBe(toCanonicalJson({ tags: ["x", "y"] }));
  });

  it("gives the text of the sim's canonicalJson for sim data (ASCII and integers)", () => {
    const data = { systems: ["shop.arrivals"], tables: { arrivals: { perMille: 220, queueLimit: 6 }, kinds: [{ id: "a-b_c.d", open: true, "quote\"d\\": -5 }] } };
    expect(toCanonicalJson(data)).toBe(simCanonicalJson(data));
  });
});

describe("UTF-8", () => {
  const SAMPLES = ["", "plain ASCII ~", "Štamgast, Chléb, žluťoučký kůň", "\u0000\u007f\u0080߿ࠀ￿", "\u{10000}\u{1f600}\u{10ffff}", "日本語"];

  it("encodes like TextEncoder and decodes like TextDecoder", () => {
    for (const text of SAMPLES) {
      const bytes = utf8Bytes(text);
      expect([...bytes]).toEqual([...new TextEncoder().encode(text)]);
      expect(utf8Text(bytes)).toBe(text);
    }
    const long = "kůň ".repeat(5000);
    expect(utf8Text(utf8Bytes(long))).toBe(long);
  });

  it("refuses half of a surrogate pair", () => {
    expect(() => utf8Bytes("a\ud83d")).toThrow(CanonicalError);
    expect(() => utf8Bytes("\ude00a")).toThrow(CanonicalError);
  });

  it.each([
    [[0x80], "a continuation byte alone"],
    [[0xc3], "a cut-off sequence"],
    [[0xc3, 0x28], "a bad continuation byte"],
    [[0xc0, 0xaf], "an overlong two-byte form"],
    [[0xe0, 0x80, 0xaf], "an overlong three-byte form"],
    [[0xed, 0xa0, 0x80], "a surrogate"],
    [[0xf4, 0x90, 0x80, 0x80], "above U+10FFFF"],
    [[0xf8, 0x88, 0x80, 0x80, 0x80], "a five-byte form"],
    [[0xff], "0xff"],
  ])("refuses %j (%s), as TextDecoder does", (bytes) => {
    expect(() => utf8Text(new Uint8Array(bytes))).toThrow(/byte 0 is not valid UTF-8/);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes))).toThrow();
  });
});

describe("canonicalBytes and contentHash", () => {
  it("are the UTF-8 of the canonical text, and FNV-1a 64 over it", () => {
    const bytes = canonicalBytes({ b: "ž", a: 1 });
    expect(utf8Text(bytes)).toBe('{"a":1,"b":"ž"}');
    expect(contentHash(bytes)).toMatch(/^[0-9a-f]{16}$/);
    expect(contentHash(new Uint8Array(0))).toBe("cbf29ce484222325"); // the FNV-1a 64 offset basis
    expect(contentHash(utf8Bytes("a"))).toBe("af63dc4c8601ec8c"); // the published test vector
    expect(contentHash(canonicalBytes({ a: 1, b: "z" }))).not.toBe(contentHash(bytes));
  });
});
