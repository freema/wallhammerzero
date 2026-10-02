import { describe, expect, it } from "vitest";
import { MAX_PALETTE_SLOTS, PALETTE_FORMAT, parsePalette } from "../src/index.ts";

/** A small valid palette file; each test changes one thing. */
function file(): {
  format: string;
  id: string;
  about?: string;
  slots: { name: string; rgb: string }[];
  ramps?: Record<string, string[]>;
} {
  return {
    format: PALETTE_FORMAT,
    id: "test",
    slots: [
      { name: "transparent", rgb: "#000000" },
      { name: "ink", rgb: "#221c2c" },
      { name: "shadow", rgb: "#15101c" },
      { name: "skin.0", rgb: "#a05a3c" },
      { name: "skin.1", rgb: "#d98f5f" },
      { name: "skin.2", rgb: "#f6c89a" },
    ],
    ramps: { skin: ["skin.0", "skin.1", "skin.2"] },
  };
}

describe("parsePalette", () => {
  it("reads slots, reserved slots and ramps", () => {
    const palette = parsePalette(file());
    expect(palette.id).toBe("test");
    expect(palette.size).toBe(6);
    expect(palette.slots[4]).toEqual({ index: 4, name: "skin.1", rgb: [0xd9, 0x8f, 0x5f] });
    expect(palette.slot("transparent")).toBe(0);
    expect(palette.ink).toBe(1);
    expect(palette.shadow).toBe(2);
    expect(palette.slot("skin.2")).toBe(5);
    expect(palette.has("skin.2")).toBe(true);
    expect(palette.has("skin.3")).toBe(false);
    expect(palette.ramp("skin")).toEqual([3, 4, 5]);
    expect(palette.rampNames).toEqual(["skin"]);
  });

  it("is pure JSON: a file that went through JSON.stringify parses the same", () => {
    const palette = parsePalette(JSON.parse(JSON.stringify(file())));
    expect(palette.ramp("skin")).toEqual([3, 4, 5]);
  });

  it("gives RGBA bytes with only slot 0 transparent", () => {
    const rgba = parsePalette(file()).rgba();
    expect(rgba.length).toBe(24);
    expect([...rgba.subarray(0, 8)]).toEqual([0, 0, 0, 0, 0x22, 0x1c, 0x2c, 255]);
    expect([...rgba.subarray(20)]).toEqual([0xf6, 0xc8, 0x9a, 255]);
  });

  it("throws on an unknown slot or ramp, naming the palette", () => {
    const palette = parsePalette(file());
    expect(() => palette.slot("hair.1")).toThrow('palette "test": no slot named "hair.1"');
    expect(() => palette.ramp("hair")).toThrow('palette "test": no ramp named "hair" (ramps: skin)');
  });

  it("accepts a palette without ramps and an `about` text", () => {
    const json = file();
    delete json.ramps;
    json.about = "notes";
    expect(parsePalette(json).rampNames).toEqual([]);
  });

  const broken: [string, (json: ReturnType<typeof file>) => unknown, RegExp][] = [
    ["not an object", () => [], /must hold a JSON object/],
    ["wrong format", (json) => ({ ...json, format: "wz.palette/9" }), /"format" must be "wz.palette\/1"/],
    ["bad id", (json) => ({ ...json, id: "Test Palette" }), /"id" must be lowercase/],
    ["unknown field", (json) => ({ ...json, colours: [] }), /unknown field "colours"/],
    ["slots not a list", (json) => ({ ...json, slots: {} }), /"slots" must be a list/],
    ["too many slots", (json) => ({ ...json, slots: [...json.slots, ...Array.from({ length: MAX_PALETTE_SLOTS }, (_, i) => ({ name: `x${i}`, rgb: "#ffffff" }))] }), /at most 256/],
    ["slot 0 is not transparent", (json) => ({ ...json, slots: json.slots.slice(1) }), /slots\[0\] must be \{ "name": "transparent"/],
    ["transparent with a colour", (json) => ({ ...json, slots: [{ name: "transparent", rgb: "#ff00ff" }, ...json.slots.slice(1)] }), /transparent\) must have rgb "#000000"/],
    ["no ink", (json) => ({ ...json, slots: json.slots.filter((slot) => slot.name !== "ink") }), /reserved slot "ink" is missing/],
    ["no shadow", (json) => ({ ...json, slots: json.slots.filter((slot) => slot.name !== "shadow") }), /reserved slot "shadow" is missing/],
    ["duplicate name", (json) => ({ ...json, slots: [...json.slots, { name: "ink", rgb: "#000001" }] }), /slots\[6\]: the name "ink" is used twice/],
    ["bad name", (json) => ({ ...json, slots: [...json.slots, { name: "Skin 3", rgb: "#000001" }] }), /slots\[6\].name must look like/],
    ["rgb as numbers", (json) => ({ ...json, slots: [...json.slots, { name: "x", rgb: [1, 2, 3] }] }), /slots\[6\].rgb must be "#rrggbb"/],
    ["rgb short hex", (json) => ({ ...json, slots: [...json.slots, { name: "x", rgb: "#fff" }] }), /slots\[6\].rgb must be "#rrggbb"/],
    ["rgb uppercase hex", (json) => ({ ...json, slots: [...json.slots, { name: "x", rgb: "#FFFFFF" }] }), /lowercase hex/],
    ["slot with an extra field", (json) => ({ ...json, slots: [...json.slots, { name: "x", rgb: "#ffffff", alpha: 128 }] }), /slots\[6\]: unknown field "alpha"/],
    ["ramp with an unknown slot", (json) => ({ ...json, ramps: { skin: ["skin.0", "skin.9"] } }), /ramps.skin: no slot named "skin.9"/],
    ["ramp with one slot", (json) => ({ ...json, ramps: { skin: ["skin.0"] } }), /ramps.skin must list at least two/],
    ["ramp light to dark", (json) => ({ ...json, ramps: { skin: ["skin.2", "skin.1", "skin.0"] } }), /must go from dark to light, but skin.1 is not lighter than skin.2/],
    ["ramp with transparent", (json) => ({ ...json, ramps: { skin: ["transparent", "skin.0"] } }), /"transparent" cannot be part of a ramp/],
    ["ramps not an object", (json) => ({ ...json, ramps: ["skin.0"] }), /"ramps" must be an object/],
  ];
  it.each(broken)("rejects a palette with %s", (_name, change, message) => {
    expect(() => parsePalette(change(file()))).toThrow(message);
  });
});

describe("palette.legend", () => {
  const palette = parsePalette(file());

  it("maps letters to palette indices", () => {
    expect(palette.legend({ o: "ink", s: "skin.2", S: "skin.1", 1: "shadow" })).toEqual({ o: 1, s: 5, S: 4, 1: 2 });
  });

  it("rejects keys that are not one letter or digit, and unknown slots", () => {
    expect(() => palette.legend({ ".": "ink" })).toThrow(/legend key "\." must be one letter or digit/);
    expect(() => palette.legend({ ab: "ink" })).toThrow(/legend key "ab"/);
    expect(() => palette.legend({ " ": "ink" })).toThrow(/legend key " "/);
    expect(() => palette.legend({ o: "outline" })).toThrow(/no slot named "outline"/);
    expect(() => palette.legend({ t: "transparent" })).toThrow(/write "\." for transparent/);
  });

  it("enforces the convention: uppercase is the shade of the lowercase material", () => {
    expect(() => palette.legend({ s: "skin.1", S: "skin.2" })).toThrow(/"S" \(skin.2\) must be darker than "s" \(skin.1\)/);
    expect(() => palette.legend({ s: "skin.1", S: "skin.1" })).toThrow(/must be darker/);
    // An uppercase letter alone is fine.
    expect(palette.legend({ S: "skin.2" })).toEqual({ S: 5 });
  });
});
