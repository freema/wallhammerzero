import { describe, expect, it } from "vitest";
import paletteJson from "../../../assets/palettes/example.json" with { type: "json" };
import { defineAsset, frameRefs, IndexedBuffer, OUTPUT_HASH_TAG, outputHash, parsePalette, renderAll, renderHash } from "../src/index.ts";
import type { AssetSpec, ParamsSchema } from "../src/index.ts";

const palette = parsePalette(paletteJson);

const params = {
  shift: { type: "int", min: 0, max: 2, default: 0, description: "How far the pixel is moved right." },
} as const satisfies ParamsSchema;

function spec(): AssetSpec<typeof params> {
  return {
    id: "tests/pixel",
    kind: "sprite",
    size: [3, 2],
    pivot: [1, 1],
    palette,
    clips: { idle: { frames: 2, durations: [100, 300] }, hit: { frames: 1, durations: 50, loop: false } },
    facings: ["down", "side"],
    params,
    variantSeeds: [1],
    render({ params: p, seed, clip, frame, facing }) {
      const buffer = new IndexedBuffer(3, 2).pset(p.shift, frame, clip === "idle" ? 5 : 6);
      if (facing === "side") buffer.pset(2, 1, 7);
      if (seed === 99) buffer.pset(2, 0, 8);
      return buffer;
    },
  };
}

/** FNV-1a 64 the textbook way, over a byte list built by hand from the documented layout. */
function referenceHash(bytes: number[]): string {
  let h = 0xcbf29ce484222325n;
  for (const byte of bytes) h = ((h ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, "0");
}
const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));
const u16 = (value: number): number[] => [value & 0xff, value >>> 8];
const u32 = (value: number): number[] => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24];
const str = (text: string): number[] => [...u16(text.length), ...ascii(text)];

describe("renderAll", () => {
  it("renders every frame in canonical order: clips, then facings, then frames", () => {
    const asset = defineAsset(spec());
    const output = renderAll(asset, { seed: 1 });
    const order = output.frames.map((frame) => `${frame.clip}/${frame.facing}/${frame.frame}`);
    expect(order).toEqual(["idle/down/0", "idle/down/1", "idle/side/0", "idle/side/1", "hit/down/0", "hit/side/0"]);
    expect(frameRefs(asset.meta)).toEqual(output.frames.map(({ clip, facing, frame }) => ({ clip, facing, frame })));
    expect(output.meta).toBe(asset.meta);
    expect(output.seed).toBe(1);
    expect(output.params).toEqual({ shift: 0 });
    expect(output.frames[3]?.buffer.toText()).toBe("...\n5.7");
  });

  it("takes a preset or params", () => {
    const asset = defineAsset({ ...spec(), presets: { right: { shift: 2 } } });
    expect(renderAll(asset, { seed: 1, preset: "right" }).params).toEqual({ shift: 2 });
    expect(renderAll(asset, { seed: 1, params: { shift: 1 } }).frames[0]?.buffer.toText()).toBe(".5.\n...");
  });
});

describe("outputHash", () => {
  it("is FNV-1a 64 over the documented layout: tag, palette id, size, pivot, clip table, facings, frames", () => {
    const output = renderAll(defineAsset(spec()), { seed: 1 });
    const bytes = [
      ...ascii("wz.asset-output/1"),
      ...str("example"),
      ...u16(3), ...u16(2), ...u32(1), ...u32(1),
      ...u16(2),
      ...str("idle"), 1, ...u16(2), ...u32(100), ...u32(300),
      ...str("hit"), 0, ...u16(1), ...u32(50),
      ...u16(2), ...str("down"), ...str("side"),
      // idle/down/0, idle/down/1, idle/side/0, idle/side/1, hit/down/0, hit/side/0
      5, 0, 0, 0, 0, 0,
      0, 0, 0, 5, 0, 0,
      5, 0, 0, 0, 0, 7,
      0, 0, 0, 5, 0, 7,
      6, 0, 0, 0, 0, 0,
      6, 0, 0, 0, 0, 7,
    ];
    expect(OUTPUT_HASH_TAG).toBe("wz.asset-output/1");
    expect(outputHash(output)).toBe(referenceHash(bytes));
    expect(outputHash(output)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is the same for two renders, and renderHash is its shortcut", () => {
    const asset = defineAsset(spec());
    expect(outputHash(renderAll(asset, { seed: 1 }))).toBe(outputHash(renderAll(asset, { seed: 1 })));
    expect(renderHash(asset, { seed: 1 })).toBe(outputHash(renderAll(asset, { seed: 1 })));
  });

  it("changes with any pixel, the size, the pivot, the clip table, the facings and the palette id", () => {
    const base = renderHash(defineAsset(spec()), { seed: 1 });
    const hashes = {
      "a pixel (param)": renderHash(defineAsset(spec()), { seed: 1, params: { shift: 1 } }),
      "a pixel (seed)": renderHash(defineAsset(spec()), { seed: 99 }),
      "the pivot": renderHash(defineAsset({ ...spec(), pivot: [0, 1] }), { seed: 1 }),
      "a duration": renderHash(defineAsset({ ...spec(), clips: { ...spec().clips, idle: { frames: 2, durations: [100, 301] } } }), { seed: 1 }),
      "the loop flag": renderHash(defineAsset({ ...spec(), clips: { ...spec().clips, hit: { frames: 1, durations: 50 } } }), { seed: 1 }),
      "a clip name": renderHash(defineAsset({ ...spec(), clips: { idle: spec().clips["idle"]!, bump: spec().clips["hit"]! } }), { seed: 1 }),
      "a facing name": renderHash(defineAsset({ ...spec(), facings: ["down", "up"] }), { seed: 1 }),
      "the palette id": renderHash(defineAsset({ ...spec(), palette: parsePalette({ ...paletteJson, id: "other" }) }), { seed: 1 }),
      "the size": renderHash(
        defineAsset({ ...spec(), size: [2, 3], render: () => new IndexedBuffer(2, 3).pset(0, 0, 5) }),
        { seed: 1 },
      ),
    };
    for (const [what, hash] of Object.entries(hashes)) expect(hash, what).not.toBe(base);
    expect(new Set(Object.values(hashes)).size).toBe(Object.keys(hashes).length);
  });

  it("does not change with the id, the kind, or a seed and params that draw the same pixels", () => {
    const base = renderHash(defineAsset(spec()), { seed: 1 });
    expect(renderHash(defineAsset({ ...spec(), id: "tests/renamed" }), { seed: 1 })).toBe(base);
    expect(renderHash(defineAsset({ ...spec(), kind: "tiles" }), { seed: 1 })).toBe(base);
    expect(renderHash(defineAsset(spec()), { seed: 2 })).toBe(base);
  });

  it("does not depend on the colours of the palette, only on its id", () => {
    const recoloured = parsePalette({
      ...paletteJson,
      slots: paletteJson.slots.map((slot, i) => (i === 5 ? { ...slot, rgb: "#123456" } : slot)),
      ramps: {},
    });
    expect(renderHash(defineAsset({ ...spec(), palette: recoloured }), { seed: 1 })).toBe(renderHash(defineAsset(spec()), { seed: 1 }));
  });

  it("refuses frames that are missing or out of order", () => {
    const output = renderAll(defineAsset(spec()), { seed: 1 });
    expect(() => outputHash({ meta: output.meta, frames: output.frames.slice(1) })).toThrow(/has 6 frames, got 5/);
    expect(() => outputHash({ meta: output.meta, frames: [...output.frames].reverse() })).toThrow(/frame 0 .* is out of order/);
  });
});
