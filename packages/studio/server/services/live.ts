// Live reload: what happens between "a file under assets/ changed" and "the open pages show
// it".
//
//   watcher batch (changed paths)
//     └─► index.scan()                       the source hashes of the changed assets differ now
//           └─► bake the assets that need it, in the bake worker (reason "watch")
//                 └─► index.scan()            (the bake service's onRun does this)
//
// Every scan that changes a record is published on the `assets` topic, whoever asked for the
// scan (the watcher, a bake run, a page load). So is the bake's progress, and whether a batch
// is in flight. The pages patch what they show from these events (app/lib/live.ts).
//
// Which assets a batch re-bakes:
// - every asset whose output is not from its current source files (`needsBake`): the changed
//   ones, and any that were left stale or unbaked before;
// - for a changed palette `assets/palettes/<id>.json`: every asset drawn with that palette,
//   and every asset whose last bake failed (the palette may have been why). The source hash
//   covers an asset's own folder (its stamps too), not the palette, so this is by name.
// Shared code outside an asset's folder is not followed: after changing it, press Bake all.

import { GEN_FILE, pruneBakes } from "@whz/asset-kit/node";
import type { AssetProject } from "@whz/asset-kit/node";
import { needsBake } from "./asset-index.ts";
import type { AssetIndex, AssetRecord } from "./asset-index.ts";
import type { BakeProgress, BakeService } from "./bake.ts";
import type { EventHub } from "./events.ts";
import { createWatcher } from "./watcher.ts";
import type { Watcher } from "./watcher.ts";

/** The payloads of the `assets` topic. */
export type AssetsEvent =
  /** A scan found these records changed. New assets are in `changed` and in `added`. */
  | { readonly type: "changed"; readonly revision: number; readonly changed: readonly AssetRecord[]; readonly added: readonly string[]; readonly removed: readonly string[] }
  /** The bake run in flight moved, or ended (`running: null`). */
  | { readonly type: "bake"; readonly running: BakeProgress | null }
  /** Files are changing and their batch is not handled yet (`writing: true`), or all of it is. */
  | { readonly type: "activity"; readonly writing: boolean };

/** What a page is told when it connects: the state the events then change. */
export interface LiveState {
  /** True while a change waits or its batch is being handled. */
  readonly writing: boolean;
  readonly running: BakeProgress | null;
  /** The revision of the index now. */
  readonly revision: number;
  /** False: this studio does not watch the assets folder (it was switched off). */
  readonly watching: boolean;
}

export interface LiveOptions {
  readonly project: AssetProject;
  readonly index: AssetIndex;
  readonly bake: BakeService;
  readonly hub: EventHub;
  /** False: no watcher. Scans and bakes are still published. */
  readonly watch: boolean;
  readonly debounceMs?: number | undefined;
  readonly maxWaitMs?: number | undefined;
  readonly pollMs?: number | undefined;
}

export interface LiveService {
  /** Starts the watcher. Call it after the first scan. */
  start(): void;
  state(): LiveState;
  /** The bake service calls this with its progress (createServices wires it). */
  bakeProgress(running: BakeProgress | null): void;
  /** The watcher, for echo suppression (`watcher.wrote(paths)`); null when watching is off. */
  readonly watcher: Watcher | null;
  /** Resolves when no change waits and no batch is being handled. */
  idle(): Promise<void>;
  close(): void;
}

/** The end of the path of an asset's program, relative to the assets folder. */
const GEN_SUFFIX = `/${GEN_FILE}`;

/** The palette id of `palettes/<id>.json` (a path relative to the assets folder), else null. */
export function paletteOf(path: string): string | null {
  return /^palettes\/([^/]+)\.json$/.exec(path)?.[1] ?? null;
}

/** The ids a batch of changed paths re-bakes, given the records of a scan made after the changes. */
export function toBake(records: readonly AssetRecord[], paths: readonly string[]): string[] {
  const palettes = new Set(paths.map(paletteOf).filter((id) => id !== null));
  return records
    .filter((record) => needsBake(record) || (palettes.size > 0 && (record.status === "error" || (record.palette !== null && palettes.has(record.palette.id)))))
    .map((record) => record.id);
}

export function createLiveService(options: LiveOptions): LiveService {
  const { project, index, bake, hub } = options;
  const publish = (event: AssetsEvent): void => void hub.publish("assets", event);
  let running: BakeProgress | null = null;

  const stopIndex = index.onChange((change) => publish({ type: "changed", ...change }));

  const onBatch = async (paths: readonly string[]): Promise<void> => {
    const records = index.scan();
    // An asset whose folder is gone leaves its output behind: remove it, as `bake --all` would.
    // The paths say so, not the index before the scan: a page load may have scanned first.
    if (paths.some((path) => path.endsWith(GEN_SUFFIX) && index.get(path.slice(0, -GEN_SUFFIX.length)) === undefined)) pruneBakes(project);
    const ids = toBake(records, paths);
    if (ids.length > 0) await bake.bake(ids, "watch");
  };

  const watcher = options.watch
    ? createWatcher({
        dir: project.assetsDir,
        onBatch,
        onActivity: (writing) => publish({ type: "activity", writing }),
        debounceMs: options.debounceMs,
        maxWaitMs: options.maxWaitMs,
        pollMs: options.pollMs,
      })
    : null;

  return {
    watcher,
    start: () => watcher?.start(),
    state: () => ({ writing: watcher?.writing() ?? false, running, revision: index.revision, watching: watcher !== null }),
    bakeProgress(now) {
      running = now;
      publish({ type: "bake", running: now });
    },
    idle: () => watcher?.idle() ?? Promise.resolve(),
    close() {
      watcher?.close();
      stopIndex();
    },
  };
}
