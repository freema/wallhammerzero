// The page's side of live reload (app/lib/live.ts): the store the event stream writes to, which
// record a card shows, and when a page must ask its loader again.

import { describe, expect, it } from "vitest";
import { parseGalleryQuery } from "../app/lib/assets.ts";
import { assetNeedsLoader, createLiveStore, dashboardNeedsLoader, galleryNeedsLoader, OFFLINE, pickRecord, pickRunning } from "../app/lib/live.ts";
import type { AssetRecord, AssetsEvent, BakeProgress } from "../server/services/index.ts";

/** A record as far as the store cares: it only reads the id (and `kind` for the gallery). */
const record = (id: string, extra: Partial<AssetRecord> = {}): AssetRecord => ({ id, kind: "sprite", status: "baked", ...extra }) as AssetRecord;

const changed = (revision: number, records: AssetRecord[], more: { added?: string[]; removed?: string[] } = {}): AssetsEvent => ({
  type: "changed",
  revision,
  changed: records,
  added: more.added ?? [],
  removed: more.removed ?? [],
});

const progress = (done: number, current: string | null = null): BakeProgress => ({ reason: "watch", total: 3, done, current }) as BakeProgress;

describe("the live store", () => {
  it("starts offline, and takes the state of the server from hello", () => {
    const store = createLiveStore();
    expect(store.status()).toBe(OFFLINE);
    let calls = 0;
    store.subscribeStatus(() => (calls += 1));

    expect(store.hello("boot1", { writing: true, running: null, revision: 4, watching: true })).toBe(false);
    expect(store.status()).toEqual({ connected: true, writing: true, running: null, watching: true });
    expect(calls).toBe(1);

    // The same state again is not a change: the object stays, nobody is called.
    const before = store.status();
    expect(store.hello("boot1", { writing: true, running: null, revision: 5, watching: true })).toBe(false);
    expect(store.status()).toBe(before);
    expect(calls).toBe(1);
  });

  it("a hello from another server process forgets the patches: its revisions start again", () => {
    const store = createLiveStore();
    const state = { writing: false, running: null, revision: 57, watching: true };
    store.hello("boot1", state);
    store.apply(changed(57, [record("props/lamp")]));
    let calls = 0;
    store.subscribeAsset("props/lamp", () => (calls += 1));

    store.disconnected();
    expect(store.hello("boot1", state)).toBe(false); // the same process again: nothing is lost
    expect(store.patch("props/lamp")?.revision).toBe(57);

    store.disconnected();
    expect(store.hello("boot2", { ...state, revision: 1 })).toBe(true);
    expect(store.patch("props/lamp")).toBeUndefined();
    expect(calls).toBe(1);
    // Without that, the restarted server's first events would lose against the old revision.
    store.apply(changed(2, [record("props/lamp")]));
    expect(store.patch("props/lamp")?.revision).toBe(2);
  });

  it("follows activity and bake events, and forgets `writing` when the stream breaks", () => {
    const store = createLiveStore();
    store.hello("boot1", { writing: false, running: null, revision: 1, watching: true });
    store.apply({ type: "activity", writing: true });
    expect(store.status().writing).toBe(true);
    store.apply({ type: "bake", running: progress(1, "a/b") });
    expect(store.status().running).toEqual(progress(1, "a/b"));

    // The same progress again keeps the same status object.
    const before = store.status();
    store.apply({ type: "bake", running: progress(1, "a/b") });
    expect(store.status()).toBe(before);

    store.disconnected();
    expect(store.status()).toMatchObject({ connected: false, writing: false });
    store.apply({ type: "bake", running: null });
    expect(store.status().running).toBeNull();
  });

  it("calls only the listeners of the asset an event names", () => {
    const store = createLiveStore();
    const calls: string[] = [];
    store.subscribeAsset("props/crate", () => calls.push("crate"));
    const stop = store.subscribeAsset("props/lamp", () => calls.push("lamp"));
    store.subscribeAsset("props/gone", () => calls.push("gone"));

    const lamp = record("props/lamp");
    store.apply(changed(2, [lamp]));
    expect(calls).toEqual(["lamp"]);
    expect(store.patch("props/lamp")).toEqual({ record: lamp, revision: 2 });
    expect(store.patch("props/lamp")).toBe(store.patch("props/lamp")); // a stable snapshot
    expect(store.patch("props/crate")).toBeUndefined();

    store.apply(changed(3, [], { removed: ["props/gone"] }));
    expect(calls).toEqual(["lamp", "gone"]);
    expect(store.patch("props/gone")).toEqual({ record: null, revision: 3 });

    stop();
    store.apply(changed(4, [record("props/lamp")]));
    expect(calls).toEqual(["lamp", "gone"]);
  });

  it("keeps the newer record when an older event arrives late", () => {
    const store = createLiveStore();
    const newer = record("props/lamp", { status: "baked" });
    store.apply(changed(7, [newer]));
    store.apply(changed(5, [record("props/lamp", { status: "stale" })]));
    expect(store.patch("props/lamp")).toEqual({ record: newer, revision: 7 });
  });

  it("hands every event to the event listeners after taking it in, and reset forgets the patches", () => {
    const store = createLiveStore();
    const seen: [string, boolean][] = [];
    const stop = store.subscribeEvents((event) => seen.push([event.type, store.patch("props/lamp") !== undefined]));
    store.apply({ type: "activity", writing: true });
    store.apply(changed(2, [record("props/lamp")]));
    expect(seen).toEqual([
      ["activity", false],
      ["changed", true], // the patch is there when the listener runs
    ]);

    let calls = 0;
    store.subscribeAsset("props/lamp", () => (calls += 1));
    store.reset();
    expect(store.patch("props/lamp")).toBeUndefined();
    expect(calls).toBe(1);

    stop();
    store.apply({ type: "activity", writing: false });
    expect(seen).toHaveLength(2);
  });
});

describe("pickRecord and pickRunning", () => {
  const loaded = record("props/lamp", { status: "stale" });
  const fresh = record("props/lamp", { status: "baked" });

  it("shows the event's record only if it is from a later revision than the loader's", () => {
    expect(pickRecord(loaded, 5, undefined)).toBe(loaded);
    expect(pickRecord(loaded, 5, { record: fresh, revision: 6 })).toBe(fresh);
    expect(pickRecord(loaded, 5, { record: fresh, revision: 5 })).toBe(loaded);
    expect(pickRecord(loaded, 5, { record: fresh, revision: 4 })).toBe(loaded);
  });

  it("keeps the loader's record of an asset that an event removed (the loader is asked again)", () => {
    expect(pickRecord(loaded, 5, { record: null, revision: 9 })).toBe(loaded);
  });

  it("takes the bake in flight from the stream once it is connected, from the loader before", () => {
    const fromLoader = progress(0);
    expect(pickRunning(fromLoader, OFFLINE)).toBe(fromLoader);
    expect(pickRunning(fromLoader, { connected: true, writing: false, running: null, watching: true })).toBeNull();
    expect(pickRunning(null, { connected: true, writing: false, running: progress(2), watching: true })).toEqual(progress(2));
  });
});

describe("when a page asks its loader again", () => {
  const query = (text: string) => parseGalleryQuery(new URLSearchParams(text));
  const KINDS = ["sprite", "tiles"];

  it("the gallery without a filter: only when an asset appeared or went away", () => {
    expect(galleryNeedsLoader(changed(2, [record("props/lamp")]), query(""), KINDS)).toBe(false);
    expect(galleryNeedsLoader(changed(2, [record("props/new")], { added: ["props/new"] }), query(""), KINDS)).toBe(true);
    expect(galleryNeedsLoader(changed(2, [], { removed: ["props/lamp"] }), query(""), KINDS)).toBe(true);
    expect(galleryNeedsLoader({ type: "activity", writing: true }, query(""), KINDS)).toBe(false);
    expect(galleryNeedsLoader({ type: "bake", running: null }, query(""), KINDS)).toBe(false);
  });

  it("the gallery with a filter a change can move an asset across: on every changed record", () => {
    const event = changed(2, [record("props/lamp")]);
    for (const filter of ["kind=sprite", "status=stale", "q=lamp"]) expect([filter, galleryNeedsLoader(event, query(filter), KINDS)]).toEqual([filter, true]);
    // The pack is part of the id, and the zoom filters nothing.
    expect(galleryNeedsLoader(event, query("pack=props&zoom=2"), KINDS)).toBe(false);
    expect(galleryNeedsLoader(changed(2, []), query("status=stale"), KINDS)).toBe(false);
  });

  it("the gallery: when a record has a kind the Kind filter does not offer yet", () => {
    expect(galleryNeedsLoader(changed(2, [record("rooms/shop", { kind: "scene" })]), query(""), KINDS)).toBe(true);
    expect(galleryNeedsLoader(changed(2, [record("props/new", { kind: null })]), query(""), KINDS)).toBe(true);
    expect(galleryNeedsLoader(changed(2, [record("props/new", { kind: null })]), query(""), [...KINDS, "unknown"])).toBe(false);
  });

  it("the asset page: only when its own asset is gone", () => {
    expect(assetNeedsLoader(changed(2, [], { removed: ["props/lamp"] }), "props/lamp")).toBe(true);
    expect(assetNeedsLoader(changed(2, [], { removed: ["props/crate"] }), "props/lamp")).toBe(false);
    expect(assetNeedsLoader(changed(2, [record("props/lamp")]), "props/lamp")).toBe(false);
    expect(assetNeedsLoader({ type: "bake", running: null }, "props/lamp")).toBe(false);
  });

  it("the dashboard: on every change of the index and at the end of a bake run", () => {
    expect(dashboardNeedsLoader(changed(2, [record("props/lamp")]))).toBe(true);
    expect(dashboardNeedsLoader({ type: "bake", running: null })).toBe(true);
    expect(dashboardNeedsLoader({ type: "bake", running: progress(1) })).toBe(false);
    expect(dashboardNeedsLoader({ type: "activity", writing: true })).toBe(false);
  });
});
