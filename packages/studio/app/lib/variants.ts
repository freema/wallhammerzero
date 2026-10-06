// What of an asset can be previewed, and under which URLs its files are: every baked variant
// seed and every preset preview. Pure: only types come from the server code.

import { fileUrl } from "./assets.ts";
import type { AssetRecord } from "../../server/services/index.ts";

/** Which files a preview loads: the atlas and one sheet PNG, as URLs. `seed` is a variant seed of the atlas. */
export interface SheetSource {
  readonly atlasUrl: string;
  readonly sheetUrl: string;
  readonly seed: number;
}

/** What identifies a bake of an asset in a URL: its source, its pixels and its palette's colours. */
function bakeKey(asset: AssetRecord): string {
  return `${asset.bakedSourceHash ?? ""}.${asset.outputHash ?? ""}.${asset.palette?.hash ?? ""}`;
}

/** One thing of an asset that can be previewed: a baked variant seed, or a preset preview. */
export interface PreviewVariant {
  /** `seed-<n>` or `preset-<name>`: unique in the asset. */
  readonly id: string;
  readonly label: string;
  readonly kind: "seed" | "preset";
  readonly outputHash: string;
  /** The sheet PNG, relative to the checkout. */
  readonly file: string;
  readonly source: SheetSource;
}

/** Every variant seed of an asset, then every preset preview. Empty for an asset without output. */
export function previewVariants(asset: AssetRecord): PreviewVariant[] {
  const first = asset.variants[0];
  if (first === undefined || asset.palette === null) return [];
  const atlasUrl = fileUrl(`${asset.bakeDir}/atlas.json`, bakeKey(asset));
  const paletteHash = asset.palette.hash;
  const sheetUrl = (file: string, outputHash: string): string => fileUrl(file, `${outputHash}.${paletteHash}`);
  return [
    ...asset.variants.map(
      (variant): PreviewVariant => ({
        id: `seed-${variant.seed}`,
        label: `seed ${variant.seed}`,
        kind: "seed",
        outputHash: variant.outputHash,
        file: variant.sheet,
        source: { atlasUrl, sheetUrl: sheetUrl(variant.sheet, variant.outputHash), seed: variant.seed },
      }),
    ),
    ...asset.presetVariants.map(
      (preset): PreviewVariant => ({
        id: `preset-${preset.name}`,
        label: `preset ${preset.name}`,
        kind: "preset",
        outputHash: preset.outputHash,
        file: preset.sheet,
        // A preset sheet has the atlas's layout; it was rendered with the first variant seed.
        source: { atlasUrl, sheetUrl: sheetUrl(preset.sheet, preset.outputHash), seed: first.seed },
      }),
    ),
  ];
}
