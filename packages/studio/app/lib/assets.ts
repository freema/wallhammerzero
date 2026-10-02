// Pure helpers over index records, shared by loaders (server) and components (browser):
// the gallery's query and filters, the dashboard's counts, and the URLs of assets and files.
// Only types come from the server code, so nothing of Node reaches the browser bundle.

import type { AssetRecord, AssetStatus } from "../../server/services/index.ts";

/** The bake statuses, in the order the UI lists them. */
export const STATUSES: readonly AssetStatus[] = ["baked", "stale", "error", "unbaked"];

/** The integer zooms of the gallery (D22: integer zoom only). */
export const GALLERY_ZOOMS: readonly number[] = [1, 2, 3, 4];
export const DEFAULT_GALLERY_ZOOM = 4;
/** The integer zooms of the sheet on the asset page. */
export const SHEET_ZOOMS: readonly number[] = [1, 2, 3, 4, 6, 8];
export const DEFAULT_SHEET_ZOOM = 4;

/** What stands for the kind of an asset that has no atlas yet (the kind is in the atlas). */
export const UNKNOWN_KIND = "unknown";

export const kindOf = (asset: Pick<AssetRecord, "kind">): string => asset.kind ?? UNKNOWN_KIND;

// ---------------------------------------------------------------------------------------
// URLs

const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

/** The page of an asset. */
export const assetHref = (id: string): string => `/asset/${encodePath(id)}`;

/**
 * The URL of a build output (a path relative to the checkout, from the index). With `hash`
 * (the output hash of what the file shows) the browser may keep it for good: a changed
 * output has another URL.
 */
export function fileUrl(path: string, hash?: string | null): string {
  const url = `/api/files/${encodePath(path)}`;
  return hash === undefined || hash === null || hash === "" ? url : `${url}?h=${encodeURIComponent(hash)}`;
}

/** `value` if it is one of `allowed`, else `fallback`. For zooms that come from a URL. */
export function pickZoom(value: string | null, allowed: readonly number[], fallback: number): number {
  const zoom = Number(value);
  return value !== null && allowed.includes(zoom) ? zoom : fallback;
}

// ---------------------------------------------------------------------------------------
// The gallery query

/** The gallery's filters and zoom. An empty string means "all". */
export interface GalleryQuery {
  readonly pack: string;
  readonly kind: string;
  readonly status: string;
  /** Free text: every word must be in the id, the kind or a clip name. */
  readonly q: string;
  readonly zoom: number;
}

/** Reads the query from the URL. Unknown values are kept as text and simply match nothing. */
export function parseGalleryQuery(params: URLSearchParams): GalleryQuery {
  return {
    pack: params.get("pack") ?? "",
    kind: params.get("kind") ?? "",
    status: params.get("status") ?? "",
    q: (params.get("q") ?? "").trim(),
    zoom: pickZoom(params.get("zoom"), GALLERY_ZOOMS, DEFAULT_GALLERY_ZOOM),
  };
}

/** The query as a URL search string (`?pack=...`), without the values that are the default. */
export function gallerySearch(query: Partial<GalleryQuery>): string {
  const params = new URLSearchParams();
  if (query.pack) params.set("pack", query.pack);
  if (query.kind) params.set("kind", query.kind);
  if (query.status) params.set("status", query.status);
  if (query.q) params.set("q", query.q);
  if (query.zoom !== undefined && query.zoom !== DEFAULT_GALLERY_ZOOM) params.set("zoom", String(query.zoom));
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

/** The assets a query shows, in the order given. */
export function filterAssets<T extends Pick<AssetRecord, "id" | "pack" | "kind" | "status" | "clips">>(assets: readonly T[], query: Pick<GalleryQuery, "pack" | "kind" | "status" | "q">): T[] {
  const words = query.q.toLowerCase().split(/\s+/).filter((word) => word !== "");
  return assets.filter((asset) => {
    if (query.pack !== "" && asset.pack !== query.pack) return false;
    if (query.kind !== "" && kindOf(asset) !== query.kind) return false;
    if (query.status !== "" && asset.status !== query.status) return false;
    if (words.length === 0) return true;
    const text = [asset.id, kindOf(asset), ...asset.clips.map((clip) => clip.name)].join("\n").toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** The packs and kinds that exist, sorted: the choices of the filter. */
export function filterChoices(assets: readonly Pick<AssetRecord, "pack" | "kind">[]): { packs: string[]; kinds: string[] } {
  return {
    packs: [...new Set(assets.map((asset) => asset.pack))].sort(),
    kinds: [...new Set(assets.map(kindOf))].sort(),
  };
}

// ---------------------------------------------------------------------------------------
// The dashboard's counts

export type StatusCounts = Readonly<Record<AssetStatus, number>>;

export interface Summary {
  readonly total: number;
  readonly byStatus: StatusCounts;
  /** One row per kind, sorted by kind. */
  readonly byKind: readonly { readonly kind: string; readonly total: number; readonly byStatus: StatusCounts }[];
}

const noCounts = (): Record<AssetStatus, number> => ({ baked: 0, stale: 0, error: 0, unbaked: 0 });

/** Asset counts by status, and by kind and status. */
export function summarize(assets: readonly Pick<AssetRecord, "kind" | "status">[]): Summary {
  const byStatus = noCounts();
  const kinds = new Map<string, { total: number; byStatus: Record<AssetStatus, number> }>();
  for (const asset of assets) {
    byStatus[asset.status] += 1;
    const kind = kindOf(asset);
    const row = kinds.get(kind) ?? { total: 0, byStatus: noCounts() };
    row.total += 1;
    row.byStatus[asset.status] += 1;
    kinds.set(kind, row);
  }
  return {
    total: assets.length,
    byStatus,
    byKind: [...kinds.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([kind, row]) => ({ kind, ...row })),
  };
}

/** Milliseconds as text: `850 ms`, `2.4 s`. */
export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
