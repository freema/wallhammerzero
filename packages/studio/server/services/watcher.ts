// The file watcher: tells the studio which files under a folder changed, in batches.
//
// The source of truth is a **snapshot** of the folder (every file with its modification time
// and size), taken again and again and compared with the last one. Native file events
// (`fs.watch`) only make the next snapshot come sooner. That is what the file-watch probe asks
// for (docs/dev-environment.md): on the Docker bind mount a replaced file can lose its event,
// sometimes with no event at all, while a `stat` from the container saw every host write.
//
//   native event ──► sweep within ~10 ms ─┐
//   timer ─────────► sweep every pollMs ──┴─► changed paths ──► batcher ──► onBatch(paths)
//
// The batcher holds changes back until no path changed for `debounceMs` (a burst of writes, or
// a file written in pieces, is one batch), but never longer than `maxWaitMs`. While a batch is
// being handled (a re-bake), later changes wait and become the next batch.
//
// Echo suppression: when the studio writes a file under the watched folder itself, it calls
// `wrote(path)` right after the write. The file's new state becomes the baseline, so the
// studio's own write is not reported back to it.

import { readdirSync, statSync, watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

/** A folder as the watcher sees it: `relative path with / separators -> signature`. */
export type Snapshot = ReadonlyMap<string, string>;

/** Files and folders the watcher never looks at: dot files (editor and temp files), node_modules. */
export function isIgnored(name: string): boolean {
  return name.startsWith(".") || name === "node_modules" || name.endsWith("~") || name.endsWith(".tmp") || name.endsWith(".swp");
}

/** Reads the snapshot of a folder. A folder that does not exist is an empty snapshot. */
export function takeSnapshot(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (prefix: string): void => {
    let entries;
    try {
      entries = readdirSync(prefix === "" ? dir : join(dir, prefix), { withFileTypes: true });
    } catch {
      return; // the folder went away while we were walking
    }
    for (const entry of entries) {
      if (isIgnored(entry.name)) continue;
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        const signature = signatureOf(join(dir, path));
        if (signature !== null) files.set(path, signature);
      }
    }
  };
  walk("");
  return files;
}

/** What tells one state of a file from another: modification time and size. Null: no such file. */
export function signatureOf(file: string): string | null {
  try {
    const stat = statSync(file);
    return stat.isFile() ? `${stat.mtimeMs}:${stat.size}` : null;
  } catch {
    return null;
  }
}

/** The paths that were added, removed or changed between two snapshots, sorted. */
export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const changed: string[] = [];
  for (const [path, signature] of after) if (before.get(path) !== signature) changed.push(path);
  for (const path of before.keys()) if (!after.has(path)) changed.push(path);
  return changed.sort();
}

export interface BatcherOptions {
  /** A batch is released when no path changed for this long. */
  readonly debounceMs: number;
  /** ... or when its first change is this old, whatever still changes. */
  readonly maxWaitMs: number;
}

/** Collects changed paths and says when they are one batch. Pure: the caller passes the time. */
export interface ChangeBatcher {
  /** Records that these paths changed at `now`. */
  note(paths: readonly string[], now: number): void;
  /** Forgets a path (the studio wrote it itself). */
  drop(path: string): void;
  /** The waiting paths as one sorted batch if it is due at `now`, else null. Taking empties the batcher. */
  take(now: number): string[] | null;
  /** How many paths wait. */
  readonly size: number;
}

export function createBatcher(options: BatcherOptions): ChangeBatcher {
  const pending = new Set<string>();
  let firstAt = 0;
  let lastAt = 0;
  return {
    note(paths, now) {
      if (paths.length === 0) return;
      if (pending.size === 0) firstAt = now;
      lastAt = now;
      for (const path of paths) pending.add(path);
    },
    drop(path) {
      pending.delete(path);
    },
    take(now) {
      if (pending.size === 0) return null;
      if (now - lastAt < options.debounceMs && now - firstAt < options.maxWaitMs) return null;
      const batch = [...pending].sort();
      pending.clear();
      return batch;
    },
    get size() {
      return pending.size;
    },
  };
}

export const DEFAULT_DEBOUNCE_MS = 200;
export const DEFAULT_MAX_WAIT_MS = 1000;
export const DEFAULT_POLL_MS = 500;

export interface WatcherOptions {
  /** The folder to watch, absolute. It need not exist yet. */
  readonly dir: string;
  /** Called with the changed paths (relative to `dir`, `/` separators, sorted). The next batch waits until it settles. */
  readonly onBatch: (paths: readonly string[]) => void | Promise<void>;
  /** Called with true when the first change of a batch is seen, and with false when everything seen was handled. */
  readonly onActivity?: (writing: boolean) => void;
  readonly debounceMs?: number | undefined;
  readonly maxWaitMs?: number | undefined;
  /** The time between two sweeps when nothing is happening. */
  readonly pollMs?: number | undefined;
  /** False: no native events, the timer alone. */
  readonly native?: boolean;
  /** Called when a batch handler throws. */
  readonly onError?: (error: unknown) => void;
}

export interface Watcher {
  /** Takes the first snapshot (what is there now is not a change) and starts sweeping. */
  start(): void;
  /**
   * Echo suppression: the studio just wrote (or removed) these files itself. Call it right
   * after the write, before anything is awaited. Paths are absolute, or relative to `dir`.
   */
  wrote(paths: readonly string[]): void;
  /** True while a change waits or a batch is being handled. */
  writing(): boolean;
  /** Resolves when nothing waits and no batch is being handled. For tests and shutdown. */
  idle(): Promise<void>;
  /** Stops sweeping. A batch in flight still finishes. */
  close(): void;
}

export function createWatcher(options: WatcherOptions): Watcher {
  const { dir } = options;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const batcher = createBatcher({ debounceMs, maxWaitMs: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS });
  /** While changes wait, look again this often: it bounds how late a batch is released. */
  const fastMs = Math.max(5, Math.min(50, Math.floor(debounceMs / 4)));

  let baseline = new Map<string, string>();
  let timer: NodeJS.Timeout | undefined;
  let poked = false;
  let native: FSWatcher | null = null;
  let handling = false;
  let active = false;
  let closed = true;
  const waiters: (() => void)[] = [];

  const setActive = (now: boolean): void => {
    if (now === active) return;
    active = now;
    options.onActivity?.(now);
    if (!now) {
      for (const done of waiters.splice(0)) done();
    }
  };

  const schedule = (ms: number): void => {
    clearTimeout(timer);
    if (!closed) timer = setTimeout(tick, ms);
  };

  const flush = (): void => {
    if (handling) return;
    const batch = batcher.take(performance.now());
    if (batch === null) {
      if (batcher.size === 0) setActive(false);
      return;
    }
    handling = true;
    void Promise.resolve()
      .then(() => options.onBatch(batch))
      .catch((error: unknown) => (options.onError ?? ((problem) => console.error("[studio] the watcher's batch handler failed:", problem)))(error))
      .finally(() => {
        handling = false;
        if (closed) setActive(false);
        else schedule(0); // what changed meanwhile is the next batch
      });
  };

  function tick(): void {
    timer = undefined;
    poked = false;
    const next = takeSnapshot(dir);
    const changed = diffSnapshots(baseline, next);
    baseline = next;
    if (changed.length > 0) {
      batcher.note(changed, performance.now());
      setActive(true);
    }
    flush();
    schedule(batcher.size > 0 ? fastMs : pollMs);
  }

  const toRelative = (path: string): string => (isAbsolute(path) ? relative(dir, path) : path).split(sep).join("/");

  return {
    start() {
      if (!closed) return;
      closed = false;
      baseline = takeSnapshot(dir);
      if (options.native !== false) {
        try {
          native = watch(dir, { recursive: true }, () => {
            // The event says only "look now". What changed is read from the snapshot.
            if (poked || closed) return;
            poked = true;
            schedule(10);
          });
          native.on("error", () => {
            // The folder was removed, or the platform gave up: the timer still sweeps.
            native?.close();
            native = null;
          });
        } catch {
          native = null; // no such folder yet, or no recursive watching here: the timer alone
        }
      }
      schedule(pollMs);
    },
    wrote(paths) {
      for (const path of paths) {
        const rel = toRelative(path);
        const signature = signatureOf(join(dir, rel));
        if (signature === null) baseline.delete(rel);
        else baseline.set(rel, signature);
        batcher.drop(rel);
      }
    },
    writing: () => active,
    idle: () => (active ? new Promise((done) => waiters.push(done)) : Promise.resolve()),
    close() {
      closed = true;
      clearTimeout(timer);
      timer = undefined;
      native?.close();
      native = null;
      if (!handling) setActive(false);
    },
  };
}
