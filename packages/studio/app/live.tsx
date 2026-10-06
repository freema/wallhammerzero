// Live reload in the page: one connection to the server's event stream per tab, the store it
// feeds (lib/live.ts), and the hooks and the indicator that read the store.
//
// A card calls `useAsset(record, revision)` and re-renders only when an event names its
// asset. Its image URL carries the hash of what was drawn, so a changed card fetches one new
// image and every other card fetches nothing. The loaders are asked again only where a list
// or a count may have changed (`useLoaderOn`).

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useRevalidator } from "react-router";
import { createLiveStore, OFFLINE, pickRecord, pickRunning } from "./lib/live.ts";
import type { LiveStatus } from "./lib/live.ts";
import type { AssetRecord, AssetsEvent, BakeProgress, LiveState } from "../server/services/index.ts";

/** The one store of this tab. On the server nothing writes to it. */
export const liveStore = createLiveStore();

/** The index revision of the loader data the page shows now (set by `useLoaderRevision`). */
let loadedRevision = Number.POSITIVE_INFINITY;

const EVENTS_URL = "/api/events?topics=assets";
/** If the browser gives the stream up (it does after an HTTP error), try again after this. */
const RECONNECT_MS = 2000;

/** Opens the event stream and feeds the store. Rendered once, in the app shell. */
export function LiveEvents() {
  const { revalidate } = useRevalidator();
  const again = useRef(revalidate);
  useEffect(() => {
    again.current = revalidate;
  }, [revalidate]);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = (): void => {
      const stream = new EventSource(EVENTS_URL);
      source = stream;
      stream.addEventListener("hello", (event) => {
        const { boot, state } = JSON.parse((event as MessageEvent<string>).data) as { boot: string; state: LiveState };
        const restarted = liveStore.hello(boot, state);
        // Another server process, or the index moved on between the loader's answer and this
        // connection: catch up.
        if (restarted || state.revision > loadedRevision) void again.current();
      });
      stream.addEventListener("assets", (event) => liveStore.apply(JSON.parse((event as MessageEvent<string>).data) as AssetsEvent));
      stream.addEventListener("reset", () => {
        liveStore.reset();
        void again.current();
      });
      stream.onerror = () => {
        liveStore.disconnected();
        // While the browser reconnects by itself the state is CONNECTING; CLOSED means it gave up.
        if (stream.readyState === EventSource.CLOSED && !closed) retry = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      source?.close();
      liveStore.disconnected();
    };
  }, []);
  return null;
}

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(liveStore.subscribeStatus, liveStore.status, () => OFFLINE);
}

/** The bake in flight: from the stream once it is connected, from the loader before. */
export function useRunning(loaded: BakeProgress | null): BakeProgress | null {
  return pickRunning(loaded, useLiveStatus());
}

/**
 * The record of one asset to show: the loader's (`revision` is the index revision it came
 * with), or a newer one from an event. Re-renders only for events about this asset.
 */
export function useAsset(loaded: AssetRecord, revision: number): AssetRecord {
  const { id } = loaded;
  const subscribe = useCallback((listener: () => void) => liveStore.subscribeAsset(id, listener), [id]);
  const patch = useSyncExternalStore(
    subscribe,
    () => liveStore.patch(id),
    () => undefined,
  );
  return pickRecord(loaded, revision, patch);
}

/** Tells the connection which index revision the page's loader data is from. Every page with asset data calls it. */
export function useLoaderRevision(revision: number): void {
  useEffect(() => {
    loadedRevision = revision;
  }, [revision]);
}

/** Asks the loaders again after every event for which `needs` says so. */
export function useLoaderOn(needs: (event: AssetsEvent) => boolean): void {
  const { revalidate } = useRevalidator();
  const latest = useRef({ needs, revalidate });
  useEffect(() => {
    latest.current = { needs, revalidate };
  });
  useEffect(
    () =>
      liveStore.subscribeEvents((event) => {
        if (latest.current.needs(event)) void latest.current.revalidate();
      }),
    [],
  );
}

const INDICATOR: Readonly<Record<string, { label: string; hint: string }>> = {
  writing: { label: "Claude is writing…", hint: "Files under the assets folder are changing. The changed assets are re-baked and appear here by themselves." },
  live: { label: "live", hint: "Connected: a change under the assets folder shows here without a reload." },
  off: { label: "live reload off", hint: "This studio does not watch the assets folder (WHZ_STUDIO_WATCH=0). Reload the page to see changes." },
  offline: { label: "connecting…", hint: "No connection to the studio server now. The page shows what it loaded last." },
};

/** The small state light in the top bar: connected, files being written, or no connection. */
export function LiveIndicator() {
  const status = useLiveStatus();
  const state = !status.connected ? "offline" : status.writing ? "writing" : status.watching ? "live" : "off";
  const text = INDICATOR[state];
  return (
    <span className="live" data-live={state} role="status" title={text?.hint}>
      <i aria-hidden="true" />
      {text?.label}
    </span>
  );
}
