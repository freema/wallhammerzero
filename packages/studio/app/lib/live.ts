// The page's side of live reload, without React and without the network: a store that the
// event stream writes to and components read from. (app/live.tsx connects it to both.)
//
// - **Per asset:** the newest record an event brought, with the revision of the index it came
//   from. A card subscribes to its own id only, so an event about one asset re-renders one
//   card. Which record a card shows is decided by `pickRecord`: the loader's or the event's,
//   whichever is from the higher revision.
// - **Status:** whether the stream is connected, whether files are being written, the bake in
//   flight.
// - **Changes:** every `changed` and `bake` event, for the few places that must ask the loaders
//   again (an asset appeared or went away, the dashboard's counts).
//
// Only types come from the server code, so nothing of Node reaches the browser bundle.

import type { AssetRecord, AssetsEvent, BakeProgress, LiveState, TasksEvent } from "../../server/services/index.ts";
import { kindOf } from "./assets.ts";
import type { GalleryQuery } from "./assets.ts";

/** What the page knows about the stream and the server's work. */
export interface LiveStatus {
  /** True between `hello` and the stream breaking. */
  readonly connected: boolean;
  /** True while files under assets/ are changing and their batch is not handled yet. */
  readonly writing: boolean;
  /** The bake run in flight, or null. */
  readonly running: BakeProgress | null;
  /** False if the server does not watch the assets folder. */
  readonly watching: boolean;
}

/** The newest state of one asset that an event brought. `record` is null if the asset is gone. */
export interface AssetPatch {
  readonly record: AssetRecord | null;
  /** The revision of the index the record is from. */
  readonly revision: number;
}

export const OFFLINE: LiveStatus = { connected: false, writing: false, running: null, watching: true };

export interface LiveStore {
  status(): LiveStatus;
  subscribeStatus(listener: () => void): () => void;
  /** The patch of one asset, or undefined if no event named it. The same object until it changes. */
  patch(id: string): AssetPatch | undefined;
  subscribeAsset(id: string, listener: () => void): () => void;
  /** Every event of the assets topic, after the store took it in. */
  subscribeEvents(listener: (event: AssetsEvent) => void): () => void;
  /** Every event of the tasks topic (a note under tasks/ changed). */
  subscribeTasks(listener: (event: TasksEvent) => void): () => void;
  /** An event of the tasks topic. */
  applyTasks(event: TasksEvent): void;

  /**
   * The stream opened: `boot` names the server process, `state` is its state now. True if this
   * is another process than the one the page talked to before: its revisions start again, so
   * the patches are forgotten and the page must load its data again.
   */
  hello(boot: string, state: LiveState): boolean;
  /** An event of the assets topic. */
  apply(event: AssetsEvent): void;
  /** The stream broke. The patches stay: they are still the newest the page has. */
  disconnected(): void;
  /** The server could not say what was missed: forget the patches (the page loads its data again). */
  reset(): void;
}

export function createLiveStore(): LiveStore {
  let status: LiveStatus = OFFLINE;
  let server: string | null = null;
  const patches = new Map<string, AssetPatch>();
  const statusListeners = new Set<() => void>();
  const assetListeners = new Map<string, Set<() => void>>();
  const eventListeners = new Set<(event: AssetsEvent) => void>();
  const taskListeners = new Set<(event: TasksEvent) => void>();

  const setStatus = (next: LiveStatus): void => {
    if (next.connected === status.connected && next.writing === status.writing && next.watching === status.watching && sameProgress(next.running, status.running)) return;
    status = next;
    for (const listener of [...statusListeners]) listener();
  };
  const setPatch = (id: string, patch: AssetPatch): void => {
    const known = patches.get(id);
    if (known !== undefined && known.revision > patch.revision) return; // an older event arriving late
    patches.set(id, patch);
    for (const listener of [...(assetListeners.get(id) ?? [])]) listener();
  };

  const forget = (): void => {
    const ids = [...patches.keys()];
    patches.clear();
    for (const id of ids) for (const listener of [...(assetListeners.get(id) ?? [])]) listener();
  };

  return {
    status: () => status,
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => void statusListeners.delete(listener);
    },
    patch: (id) => patches.get(id),
    subscribeAsset(id, listener) {
      const listeners = assetListeners.get(id) ?? new Set();
      assetListeners.set(id, listeners);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) assetListeners.delete(id);
      };
    },
    subscribeEvents(listener) {
      eventListeners.add(listener);
      return () => void eventListeners.delete(listener);
    },
    subscribeTasks(listener) {
      taskListeners.add(listener);
      return () => void taskListeners.delete(listener);
    },
    applyTasks(event) {
      for (const listener of [...taskListeners]) listener(event);
    },
    hello(boot, state) {
      const restarted = server !== null && server !== boot;
      server = boot;
      if (restarted) forget();
      setStatus({ connected: true, writing: state.writing, running: state.running, watching: state.watching });
      return restarted;
    },
    apply(event) {
      if (event.type === "activity") setStatus({ ...status, writing: event.writing });
      else if (event.type === "bake") setStatus({ ...status, running: event.running });
      else {
        for (const record of event.changed) setPatch(record.id, { record, revision: event.revision });
        for (const id of event.removed) setPatch(id, { record: null, revision: event.revision });
      }
      for (const listener of [...eventListeners]) listener(event);
    },
    disconnected() {
      setStatus({ ...status, connected: false, writing: false });
    },
    reset: forget,
  };
}

function sameProgress(a: BakeProgress | null, b: BakeProgress | null): boolean {
  if (a === null || b === null) return a === b;
  return a.reason === b.reason && a.total === b.total && a.done === b.done && a.current === b.current;
}

/**
 * The record to show: the one the loader gave (from the index at `loadedRevision`), or the
 * one an event brought if that is from a later revision. An asset that an event removed keeps
 * showing the loader's record until the loaders are asked again.
 */
export function pickRecord(loaded: AssetRecord, loadedRevision: number, patch: AssetPatch | undefined): AssetRecord {
  return patch !== undefined && patch.record !== null && patch.revision > loadedRevision ? patch.record : loaded;
}

/** The bake in flight to show: the stream's once it is connected, the loader's before. */
export function pickRunning(loaded: BakeProgress | null, status: LiveStatus): BakeProgress | null {
  return status.connected ? status.running : loaded;
}

/**
 * True if the gallery must ask its loader again after this event: the list itself may have
 * changed. An asset appeared or went away; a filter other than the pack is on and a record
 * changed (it may match now, or no longer); or a record has a kind the Kind filter does not
 * offer yet (`kinds` are its choices). Otherwise a changed record only patches its own card.
 */
export function galleryNeedsLoader(event: AssetsEvent, query: Pick<GalleryQuery, "pack" | "kind" | "status" | "review" | "q">, kinds: readonly string[]): boolean {
  if (event.type !== "changed") return false;
  if (event.added.length > 0 || event.removed.length > 0) return true;
  const filtered = query.kind !== "" || query.status !== "" || query.review !== "" || query.q !== "";
  if (filtered && event.changed.length > 0) return true;
  return event.changed.some((record) => !kinds.includes(kindOf(record)));
}

/** True if the page of asset `id` must ask its loader again: the asset is gone (the loader answers 404). */
export function assetNeedsLoader(event: AssetsEvent, id: string): boolean {
  return event.type === "changed" && event.removed.includes(id);
}

/** True if the dashboard must ask its loader again: its counts, its error list or the last run changed. */
export function dashboardNeedsLoader(event: AssetsEvent): boolean {
  return event.type === "changed" || (event.type === "bake" && event.running === null);
}
