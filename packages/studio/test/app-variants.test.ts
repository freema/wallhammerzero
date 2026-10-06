// What of an asset the page previews (app/lib/variants.ts): every baked seed, then every
// preset preview, each with the URLs of its atlas and sheet, keyed so a re-bake changes them.

import { describe, expect, it } from "vitest";
import { previewVariants } from "../app/lib/variants.ts";
import type { AssetRecord } from "../server/services/index.ts";

const BAKED = {
  bakeDir: "build/assets/props/crate",
  bakedSourceHash: "1111111111111111",
  outputHash: "2222222222222222",
  palette: { id: "example", hash: "3333333333333333", colors: ["#000000", "#ffffff"], names: null },
  variants: [
    { seed: 1, outputHash: "aaaaaaaaaaaaaaaa", sheet: "build/assets/props/crate/seed-1.png", firstFrame: "build/assets/props/crate/frames/seed-1/idle.default.0.png" },
    { seed: 5, outputHash: "bbbbbbbbbbbbbbbb", sheet: "build/assets/props/crate/seed-5.png", firstFrame: "build/assets/props/crate/frames/seed-5/idle.default.0.png" },
  ],
  presetVariants: [{ name: "worn", outputHash: "cccccccccccccccc", sheet: "build/studio/presets/props/crate/worn.png" }],
} as unknown as AssetRecord;

describe("previewVariants", () => {
  it("lists the seeds, then the presets drawn with the first seed, with hashed URLs", () => {
    const atlasUrl = "/api/files/build/assets/props/crate/atlas.json?h=1111111111111111.2222222222222222.3333333333333333";
    expect(previewVariants(BAKED)).toEqual([
      { id: "seed-1", label: "seed 1", kind: "seed", outputHash: "aaaaaaaaaaaaaaaa", file: "build/assets/props/crate/seed-1.png", source: { atlasUrl, sheetUrl: "/api/files/build/assets/props/crate/seed-1.png?h=aaaaaaaaaaaaaaaa.3333333333333333", seed: 1 } },
      { id: "seed-5", label: "seed 5", kind: "seed", outputHash: "bbbbbbbbbbbbbbbb", file: "build/assets/props/crate/seed-5.png", source: { atlasUrl, sheetUrl: "/api/files/build/assets/props/crate/seed-5.png?h=bbbbbbbbbbbbbbbb.3333333333333333", seed: 5 } },
      { id: "preset-worn", label: "preset worn", kind: "preset", outputHash: "cccccccccccccccc", file: "build/studio/presets/props/crate/worn.png", source: { atlasUrl, sheetUrl: "/api/files/build/studio/presets/props/crate/worn.png?h=cccccccccccccccc.3333333333333333", seed: 1 } },
    ]);
  });

  it("changes the atlas URL when the source, the pixels or the palette changed, and the sheet URL when its pixels or the palette did", () => {
    const before = previewVariants(BAKED);
    const after = (patch: Partial<AssetRecord>) => previewVariants({ ...BAKED, ...patch });
    expect(after({ bakedSourceHash: "9999999999999999" })[0]?.source.atlasUrl).not.toBe(before[0]?.source.atlasUrl);
    expect(after({ bakedSourceHash: "9999999999999999" })[0]?.source.sheetUrl).toBe(before[0]?.source.sheetUrl);
    expect(after({ palette: { ...BAKED.palette!, hash: "9999999999999999" } })[0]?.source).not.toEqual(before[0]?.source);
  });

  it("is empty for an asset without output", () => {
    expect(previewVariants({ ...BAKED, variants: [], presetVariants: [] })).toEqual([]);
    expect(previewVariants({ ...BAKED, palette: null })).toEqual([]);
  });
});
