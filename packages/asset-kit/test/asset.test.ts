import { describe, expect, it } from "vitest";
import paletteJson from "../../../assets/palettes/example.json" with { type: "json" };
import { ASSET_FORMAT, defineAsset, IndexedBuffer, isAsset, parsePalette, REVIEW_SEEDS } from "../src/index.ts";
import type { AnyAsset, AssetSpec, ParamsSchema, ParamValues } from "../src/index.ts";

const palette = parsePalette(paletteJson);

const params = {
  size: { type: "int", min: 1, max: 4, default: 2, description: "Side of the square in pixels." },
  hue: { type: "enum", values: ["red", "gold"], default: "red", description: "Which ramp fills the square." },
  framed: { type: "bool", default: false, description: "Whether the square has an ink frame." },
} as const satisfies ParamsSchema;

/** A valid definition; each test changes one thing. */
function spec(): AssetSpec<typeof params> {
  return {
    id: "tests/square",
    kind: "sprite",
    size: [6, 6],
    pivot: [3, 5],
    palette,
    clips: { idle: { frames: 2, durations: 250 }, pop: { frames: 3, durations: [80, 80, 240], loop: false } },
    facings: ["down", "up"],
    params,
    presets: { big: { size: 4 }, "gold-frame": { hue: "gold", framed: true } },
    variantSeeds: [10, 20, 30],
    render({ params: p, frame, facing }) {
      const colour = palette.ramp(p.hue)[facing === "up" ? 0 : 1] as number;
      const buffer = new IndexedBuffer(6, 6).fill(1, 1 + frame, p.size, p.size, colour);
      return p.framed ? buffer.outline(palette.ink) : buffer;
    },
  };
}

describe("defineAsset", () => {
  it("returns the meta as plain data", () => {
    const asset = defineAsset(spec());
    expect(asset.format).toBe(ASSET_FORMAT);
    expect(isAsset(asset)).toBe(true);
    expect(isAsset({ meta: {} })).toBe(false);
    expect(JSON.parse(JSON.stringify(asset.meta))).toEqual({
      id: "tests/square",
      kind: "sprite",
      size: [6, 6],
      paletteId: "example",
      clips: [
        { name: "idle", frames: 2, durations: [250, 250], loop: true },
        { name: "pop", frames: 3, durations: [80, 80, 240], loop: false },
      ],
      facings: ["down", "up"],
      pivot: [3, 5],
    });
    expect(asset.palette).toBe(palette);
    expect(asset.params).toBe(params);
    expect(asset.variantSeeds).toEqual([10, 20, 30]);
    expect(Object.keys(asset.presets)).toEqual(["big", "gold-frame"]);
  });

  it("fills in the defaults: one facing, the fixed review seeds, no stamp files, pivot [0, 0] for a scene", () => {
    const { facings: _facings, pivot: _pivot, ...rest } = spec();
    const asset = defineAsset({ ...rest, kind: "scene" });
    expect(asset.meta.facings).toEqual(["default"]);
    expect(asset.meta.pivot).toEqual([0, 0]);
    expect(asset.reviewSeeds).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(asset.reviewSeeds).toEqual(REVIEW_SEEDS);
    expect(asset.stampFiles).toEqual([]);
    expect(asset.stampsBound).toBe(true);
  });

  it("freezes the meta", () => {
    const asset = defineAsset(spec());
    expect(Object.isFrozen(asset.meta)).toBe(true);
    expect(Object.isFrozen(asset.meta.clips)).toBe(true);
    expect(Object.isFrozen(asset.meta.clips[0]?.durations)).toBe(true);
  });

  it("an asset of a specific schema is usable as AnyAsset", () => {
    const any: AnyAsset = defineAsset(spec());
    expect(any.render({ seed: 1, clip: "idle", frame: 0, params: { size: 3 } }).opaqueCount()).toBe(9);
  });

  const s = spec;
  const broken: [string, () => unknown, RegExp][] = [
    ["an id without a pack", () => ({ ...s(), id: "square" }), /"id" must be <pack>\/<name>/],
    ["an id with capitals", () => ({ ...s(), id: "tests/Square" }), /"id" must be <pack>\/<name>/],
    ["an unknown kind", () => ({ ...s(), kind: "font" }), /"kind" must be one of sprite, tiles, scene, got "font"/],
    ["a float size", () => ({ ...s(), size: [6.5, 6] }), /"size" must be \[w, h\]/],
    ["a zero size", () => ({ ...s(), size: [0, 6] }), /"size" must be \[w, h\]/],
    ["a palette that is raw JSON", () => ({ ...s(), palette: paletteJson }), /"palette" must be a Palette/],
    ["no clips", () => ({ ...s(), clips: {} }), /at least one clip/],
    ["a bad clip name", () => ({ ...s(), clips: { "Walk Left": { frames: 1, durations: 100 } } }), /clip name "Walk Left"/],
    ["zero frames", () => ({ ...s(), clips: { idle: { frames: 0, durations: 100 } } }), /clip "idle": "frames" must be an integer/],
    ["durations that do not match the frames", () => ({ ...s(), clips: { idle: { frames: 3, durations: [100, 100] } } }), /clip "idle": 2 durations for 3 frames/],
    ["a float duration", () => ({ ...s(), clips: { idle: { frames: 1, durations: 16.7 } } }), /the duration of frame 0 must be whole milliseconds/],
    ["a zero duration", () => ({ ...s(), clips: { idle: { frames: 2, durations: [100, 0] } } }), /the duration of frame 1/],
    ["no facings", () => ({ ...s(), facings: [] }), /at least one facing/],
    ["a facing listed twice", () => ({ ...s(), facings: ["down", "down"] }), /a facing is listed twice/],
    ["a sprite without a pivot", () => ({ ...s(), pivot: undefined }), /a sprite needs a "pivot"/],
    ["a pivot outside the frame", () => ({ ...s(), pivot: [3, 7] }), /"pivot" must be \[x, y\]/],
    ["a param default outside its range", () => ({ ...s(), params: { size: { ...params.size, default: 5 } } }), /param "size": "default" must be an integer in \[1, 4\], got 5/],
    ["a float param range", () => ({ ...s(), params: { size: { ...params.size, min: 0.5 } } }), /param "size": "min" and "max" must be integers/],
    ["an enum default that is not a value", () => ({ ...s(), params: { hue: { ...params.hue, default: "teal" } } }), /param "hue": "default" must be one of red, gold, got "teal"/],
    ["an enum without values", () => ({ ...s(), params: { hue: { ...params.hue, values: [] } } }), /"values" must list at least one name/],
    ["an unknown param type", () => ({ ...s(), params: { size: { ...params.size, type: "float" } } }), /"type" must be int, enum or bool, got "float"/],
    ["a param without a description", () => ({ ...s(), params: { size: { ...params.size, description: " " } } }), /param "size": "description" must be one line/],
    ["a bad param name", () => ({ ...s(), params: { "hair-colour": params.hue } }), /a param name is camelCase/],
    ["a preset with an unknown param", () => ({ ...s(), presets: { big: { scale: 2 } } }), /preset "big": no param named "scale" \(params: size, hue, framed\)/],
    ["a preset with a value out of range", () => ({ ...s(), presets: { big: { size: 9 } } }), /preset "big": size must be an integer in \[1, 4\], got 9/],
    ["no variant seeds", () => ({ ...s(), variantSeeds: [] }), /"variantSeeds" must list at least one seed/],
    ["a negative seed", () => ({ ...s(), variantSeeds: [-1] }), /"variantSeeds"\[0\] must be an integer in \[0, 4294967295\], got -1/],
    ["a seed listed twice", () => ({ ...s(), variantSeeds: [1, 2, 1] }), /"variantSeeds" lists a seed twice/],
    ["a float review seed", () => ({ ...s(), reviewSeeds: [1.5] }), /"reviewSeeds"\[0\]/],
    ["a stamp file name with a path", () => ({ ...s(), stampFiles: ["../face"] }), /stamp file name "..\/face"/],
    ["no render function", () => ({ ...s(), render: undefined }), /"render" must be a function/],
  ];
  it.each(broken)("rejects %s", (_name, make, message) => {
    expect(() => defineAsset(make() as AssetSpec<ParamsSchema>)).toThrow(message);
    expect(() => defineAsset(make() as AssetSpec<ParamsSchema>)).toThrow(/^asset "/);
  });
});

describe("asset.resolveParams", () => {
  const asset = defineAsset(spec());

  it("gives the defaults, then a preset, then single overrides", () => {
    expect(asset.resolveParams()).toEqual({ size: 2, hue: "red", framed: false });
    expect(asset.resolveParams({ preset: "gold-frame" })).toEqual({ size: 2, hue: "gold", framed: true });
    expect(asset.resolveParams({ preset: "gold-frame", params: { framed: false, size: 1 } })).toEqual({ size: 1, hue: "gold", framed: false });
    expect(Object.isFrozen(asset.resolveParams())).toBe(true);
  });

  it("types the values from the schema", () => {
    const values: ParamValues<typeof params> = asset.resolveParams();
    const size: number = values.size;
    const hue: "red" | "gold" = values.hue;
    const framed: boolean = values.framed;
    expect([size, hue, framed]).toEqual([2, "red", false]);
  });

  it("throws on an unknown preset, an unknown param and a bad value", () => {
    expect(() => asset.resolveParams({ preset: "huge" })).toThrow('asset "tests/square": no preset named "huge" (presets: big, gold-frame)');
    expect(() => asset.resolveParams({ preset: "toString" })).toThrow(/no preset named "toString"/);
    const loose = asset as AnyAsset;
    expect(() => loose.resolveParams({ params: { colour: "red" } })).toThrow(/params: no param named "colour"/);
    expect(() => loose.resolveParams({ params: { size: 2.5 } })).toThrow(/params: size must be an integer in \[1, 4\], got 2.5/);
    expect(() => loose.resolveParams({ params: { size: "2" } })).toThrow(/size must be an integer/);
    expect(() => loose.resolveParams({ params: { hue: "teal" } })).toThrow(/hue must be one of red, gold, got "teal"/);
    expect(() => loose.resolveParams({ params: { framed: 1 } })).toThrow(/framed must be true or false, got 1/);
  });
});

describe("asset.render", () => {
  const asset = defineAsset(spec());

  it("renders one frame from params, seed, clip, frame and facing", () => {
    const frame = asset.render({ seed: 1, clip: "idle", frame: 1, facing: "up", params: { size: 3 } });
    expect(frame.toText().split("\n")).toEqual(["......", "......", ".555..", ".555..", ".555..", "......"]);
  });

  it("uses the defaults and the first facing when they are not given, and takes a preset", () => {
    const frame = asset.render({ seed: 1, clip: "idle", frame: 0 });
    expect(frame.equals(asset.render({ seed: 1, clip: "idle", frame: 0, facing: "down", params: asset.resolveParams() }))).toBe(true);
    expect(asset.render({ seed: 1, clip: "idle", frame: 0, preset: "big" }).opaqueCount()).toBe(16);
  });

  it("throws on an unknown clip, frame, facing or seed", () => {
    const loose = asset as AnyAsset;
    expect(() => loose.render({ seed: 1, clip: "walk", frame: 0 })).toThrow('asset "tests/square": no clip named "walk" (clips: idle, pop)');
    expect(() => loose.render({ seed: 1, clip: "idle", frame: 2 })).toThrow(/clip "idle" has frames 0..1, got 2/);
    expect(() => loose.render({ seed: 1, clip: "pop", frame: -1 })).toThrow(/clip "pop" has frames 0..2, got -1/);
    expect(() => loose.render({ seed: 1, clip: "idle", frame: 0.5 })).toThrow(/has frames 0..1, got 0.5/);
    expect(() => loose.render({ seed: 1, clip: "idle", frame: 0, facing: "left" })).toThrow(/no facing named "left" \(facings: down, up\)/);
    expect(() => loose.render({ seed: -1, clip: "idle", frame: 0 })).toThrow(/the seed must be an integer in \[0, 4294967295\], got -1/);
    expect(() => loose.render({ seed: 1.5, clip: "idle", frame: 0 })).toThrow(/the seed must be an integer/);
  });

  it("checks what render returns: the size, and that every index is in the palette", () => {
    const wrongSize = defineAsset({ ...spec(), render: () => new IndexedBuffer(5, 6) });
    expect(() => wrongSize.render({ seed: 1, clip: "idle", frame: 0 })).toThrow(
      'asset "tests/square": clip "idle", facing "down", frame 0: render returned 5 x 6, but "size" is 6 x 6',
    );
    const wrongIndex = defineAsset({ ...spec(), render: () => new IndexedBuffer(6, 6).pset(2, 3, 200) });
    expect(() => wrongIndex.render({ seed: 1, clip: "pop", frame: 2, facing: "up" })).toThrow(
      `asset "tests/square": clip "pop", facing "up", frame 2: pixel (2, 3) has index 200, but palette "example" has only ${palette.size} slots`,
    );
    const nothing = defineAsset({ ...spec(), render: () => undefined as unknown as IndexedBuffer });
    expect(() => nothing.render({ seed: 1, clip: "idle", frame: 0 })).toThrow(/render must return an IndexedBuffer/);
  });

  it("passes the resolved params, the seed and the names to the program", () => {
    const seen: unknown[] = [];
    const probe = defineAsset({
      ...spec(),
      render(context) {
        seen.push(context);
        return new IndexedBuffer(6, 6);
      },
    });
    probe.render({ seed: 4294967295, clip: "pop", frame: 2, preset: "big" });
    expect(seen).toEqual([
      { params: { size: 4, hue: "red", framed: false }, seed: 4294967295, clip: "pop", frame: 2, facing: "down", stamps: {} },
    ]);
  });
});

describe("stamp files", () => {
  const withFiles = (): AssetSpec<typeof params> => ({
    ...spec(),
    stampFiles: ["face", "hat"],
    render: ({ stamps }) => new IndexedBuffer(6, 6).pset(0, 0, (stamps["face"] as string).length),
  });

  it("an asset with stamp files cannot render until it has their text", () => {
    const asset = defineAsset(withFiles());
    expect(asset.stampFiles).toEqual(["face", "hat"]);
    expect(asset.stampsBound).toBe(false);
    expect(() => asset.render({ seed: 1, clip: "idle", frame: 0 })).toThrow(
      /needs its stamp files \(stamps\/face.txt, stamps\/hat.txt\): load it with loadAsset/,
    );
  });

  it("withStamps returns a new asset that renders with the text", () => {
    const asset = defineAsset(withFiles());
    const bound = asset.withStamps({ face: "abc", hat: "." });
    expect(bound.stampsBound).toBe(true);
    expect(asset.stampsBound).toBe(false);
    expect(bound.meta).toEqual(asset.meta);
    expect(bound.render({ seed: 1, clip: "idle", frame: 0 }).get(0, 0)).toBe(3);
  });

  it("withStamps wants exactly the declared files", () => {
    const asset = defineAsset(withFiles());
    expect(() => asset.withStamps({ face: "abc" })).toThrow(/the text of stamp file "hat" \(stamps\/hat.txt\) is missing/);
    expect(() => asset.withStamps({ face: "abc", hat: ".", eyes: "." })).toThrow(/"eyes" is not in "stampFiles"/);
  });
});
