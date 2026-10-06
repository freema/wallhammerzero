// The pure helpers behind the pages (app/lib/assets.ts): the gallery's query and filters, the
// dashboard's counts and the URLs. The loaders run exactly these functions.

import { describe, expect, it } from "vitest";
import { assetHref, DEFAULT_GALLERY_ZOOM, fileUrl, filterAssets, imageKey, filterChoices, formatMs, gallerySearch, parseGalleryQuery, pickZoom, summarize } from "../app/lib/assets.ts";
import type { AssetRecord, AssetStatus } from "../server/services/index.ts";

type Row = Pick<AssetRecord, "id" | "pack" | "kind" | "status" | "clips">;

function row(id: string, kind: string | null, status: AssetStatus, clips: string[] = []): Row {
  return { id, pack: id.slice(0, id.indexOf("/")), kind, status, clips: clips.map((name) => ({ name, frames: 1, durations: [100], loop: true })) };
}

const ASSETS: Row[] = [
  row("props/crate", "sprite", "baked", ["idle"]),
  row("props/lamp", "sprite", "stale", ["idle", "flicker"]),
  row("props/new", null, "unbaked"),
  row("ground/floor", "tiles", "baked", ["still"]),
  row("ground/broken", null, "error"),
  row("rooms/shop", "scene", "baked", ["still"]),
];

const ids = (rows: readonly Row[]): string[] => rows.map((asset) => asset.id);
const query = (text: string) => parseGalleryQuery(new URLSearchParams(text));

describe("parseGalleryQuery and gallerySearch", () => {
  it("reads the filters and the zoom from the URL, with defaults", () => {
    expect(query("")).toEqual({ pack: "", kind: "", status: "", q: "", zoom: DEFAULT_GALLERY_ZOOM });
    expect(query("pack=props&kind=sprite&status=stale&q=%20lamp%20&zoom=2")).toEqual({ pack: "props", kind: "sprite", status: "stale", q: "lamp", zoom: 2 });
  });

  it.each([["0"], ["5"], ["2.5"], ["-1"], ["big"], [""]])("falls back to the default zoom for zoom=%s (integer zooms 1 to 4 only)", (zoom) => {
    expect(query(`zoom=${zoom}`).zoom).toBe(DEFAULT_GALLERY_ZOOM);
  });

  it("writes a query back without the values that are the default", () => {
    expect(gallerySearch(query(""))).toBe("");
    expect(gallerySearch({ status: "error" })).toBe("?status=error");
    expect(gallerySearch(query("pack=props&q=a+b&zoom=1"))).toBe("?pack=props&q=a+b&zoom=1");
    expect(query(gallerySearch({ pack: "props", kind: "sprite", status: "baked", q: "x y", zoom: 3 }).slice(1))).toEqual({ pack: "props", kind: "sprite", status: "baked", q: "x y", zoom: 3 });
  });
});

describe("filterAssets", () => {
  it("shows everything without filters", () => {
    expect(ids(filterAssets(ASSETS, query("")))).toEqual(ids(ASSETS));
  });

  it("filters by pack, by kind and by status, and combines them", () => {
    expect(ids(filterAssets(ASSETS, query("pack=ground")))).toEqual(["ground/floor", "ground/broken"]);
    expect(ids(filterAssets(ASSETS, query("kind=sprite")))).toEqual(["props/crate", "props/lamp"]);
    expect(ids(filterAssets(ASSETS, query("kind=unknown")))).toEqual(["props/new", "ground/broken"]);
    expect(ids(filterAssets(ASSETS, query("status=baked")))).toEqual(["props/crate", "ground/floor", "rooms/shop"]);
    expect(ids(filterAssets(ASSETS, query("pack=props&status=baked")))).toEqual(["props/crate"]);
    expect(ids(filterAssets(ASSETS, query("pack=nope")))).toEqual([]);
  });

  it("matches text against the id, the kind and the clip names; every word must match", () => {
    expect(ids(filterAssets(ASSETS, query("q=LAMP")))).toEqual(["props/lamp"]);
    expect(ids(filterAssets(ASSETS, query("q=flicker")))).toEqual(["props/lamp"]);
    expect(ids(filterAssets(ASSETS, query("q=tiles")))).toEqual(["ground/floor"]);
    expect(ids(filterAssets(ASSETS, query("q=props+idle")))).toEqual(["props/crate", "props/lamp"]);
    expect(ids(filterAssets(ASSETS, query("q=props+still")))).toEqual([]);
    expect(ids(filterAssets(ASSETS, query("pack=ground&q=o")))).toEqual(["ground/floor", "ground/broken"]);
  });

  it("lists the packs and kinds that exist as filter choices", () => {
    expect(filterChoices(ASSETS)).toEqual({ packs: ["ground", "props", "rooms"], kinds: ["scene", "sprite", "tiles", "unknown"] });
    expect(filterChoices([])).toEqual({ packs: [], kinds: [] });
  });
});

describe("summarize", () => {
  it("counts assets by status, and by kind and status", () => {
    expect(summarize(ASSETS)).toEqual({
      total: 6,
      byStatus: { baked: 3, stale: 1, error: 1, unbaked: 1 },
      byKind: [
        { kind: "scene", total: 1, byStatus: { baked: 1, stale: 0, error: 0, unbaked: 0 } },
        { kind: "sprite", total: 2, byStatus: { baked: 1, stale: 1, error: 0, unbaked: 0 } },
        { kind: "tiles", total: 1, byStatus: { baked: 1, stale: 0, error: 0, unbaked: 0 } },
        { kind: "unknown", total: 2, byStatus: { baked: 0, stale: 0, error: 1, unbaked: 1 } },
      ],
    });
    expect(summarize([])).toEqual({ total: 0, byStatus: { baked: 0, stale: 0, error: 0, unbaked: 0 }, byKind: [] });
  });
});

describe("URLs", () => {
  it("builds the page and file URLs, encoding each path segment", () => {
    expect(assetHref("examples/blinking-dot")).toBe("/asset/examples/blinking-dot");
    expect(assetHref("my pack/a#b")).toBe("/asset/my%20pack/a%23b");
    expect(fileUrl("build/assets/examples/blinking-dot/seed-1.png")).toBe("/api/files/build/assets/examples/blinking-dot/seed-1.png");
    expect(fileUrl("build/assets/a b/seed-1.png", "ff98ad430bb70a8f")).toBe("/api/files/build/assets/a%20b/seed-1.png?h=ff98ad430bb70a8f");
    expect(fileUrl("build/x.png", null)).toBe("/api/files/build/x.png");
  });

  it("keys a baked image by its output hash and the hash of the palette's colours", () => {
    const variant = { outputHash: "ff98ad430bb70a8f" };
    const palette = (hash: string) => ({ palette: { id: "warm", hash, colors: [], names: null } });
    expect(imageKey(palette("1111"), variant)).toBe("ff98ad430bb70a8f.1111");
    // The output hash does not cover the colours: an edited palette must give another URL.
    expect(imageKey(palette("2222"), variant)).not.toBe(imageKey(palette("1111"), variant));
    expect(imageKey({ palette: null }, variant)).toBe("ff98ad430bb70a8f");
  });

  it("picks only a listed integer zoom", () => {
    expect(pickZoom("6", [1, 2, 6], 2)).toBe(6);
    expect(pickZoom("5", [1, 2, 6], 2)).toBe(2);
    expect(pickZoom(null, [1, 2, 6], 2)).toBe(2);
  });

  it("formats durations", () => {
    expect(formatMs(850)).toBe("850 ms");
    expect(formatMs(2440)).toBe("2.4 s");
  });
});
