// The bake service: bakes assets in a `worker_threads` worker, one run at a time, and stops
// an asset that takes too long.
//
// - The worker (bake-worker.ts) calls the bake library of @whz/asset-kit, the same functions
//   as the `asset bake` command.
// - Every asset has `timeoutMs` to finish. One that does not (a generator that loops forever)
//   gets its worker terminated and an error.json that says so; the rest of the run goes on in
//   a new worker. The server's thread never runs an asset program, so it cannot hang.
// - A worker that dies (out of memory, an exit) fails only the asset it was on.
// - Runs are queued: a second request waits for the first.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { formatJson } from "@whz/asset-kit";
import { BAKE_ERROR_FORMAT, bakeDir, findAssets, pruneBakes, sourceHash } from "@whz/asset-kit/node";
import type { AssetProject } from "@whz/asset-kit/node";
import type { BakeJob, BakeMessage } from "./bake-worker.ts";

/** Why a run started: the server came up, or the owner pressed the button. */
export type BakeReason = "start" | "manual";

/** The outcome of one asset in a run. */
export interface BakeItem {
  readonly id: string;
  readonly ok: boolean;
  /** Why it failed, else null. */
  readonly error: string | null;
  /** How long the asset took, in milliseconds. */
  readonly ms: number;
  /** True if it was stopped by the timeout. */
  readonly timedOut: boolean;
}

/** A finished run. */
export interface BakeRun {
  /** 1 for the first run of this server process, then 2, ... */
  readonly number: number;
  readonly reason: BakeReason;
  /** True if the run baked every asset (and removed the output of assets that are gone). */
  readonly all: boolean;
  /** ISO time the run started. */
  readonly startedAt: string;
  readonly ms: number;
  readonly items: readonly BakeItem[];
  /** Ids whose output was removed because the asset no longer exists. */
  readonly pruned: readonly string[];
}

/** A run in flight. */
export interface BakeProgress {
  readonly reason: BakeReason;
  readonly total: number;
  readonly done: number;
  /** The asset the worker is on, or null between assets. */
  readonly current: string | null;
}

export interface BakeState {
  readonly running: BakeProgress | null;
  /** How many runs wait behind the running one. */
  readonly queued: number;
  readonly last: BakeRun | null;
}

export interface BakeService {
  /** Bakes every asset under the assets folder and removes the output of assets that are gone. */
  bakeAll(reason: BakeReason): Promise<BakeRun>;
  /** Bakes the named assets. */
  bake(ids: readonly string[], reason: BakeReason): Promise<BakeRun>;
  state(): BakeState;
  /** Stops the worker of a run in flight. For shutdown and tests. */
  close(): Promise<void>;
}

export interface BakeServiceOptions {
  readonly project: AssetProject;
  /** How long one asset may take, in milliseconds. */
  readonly timeoutMs: number;
  /** Called after every run, before its promise resolves (the server rescans the index here). */
  readonly onRun?: (run: BakeRun) => void;
}

/** The heap a worker may use. An asset program that needs more is a bug. */
const WORKER_HEAP_MB = 512;
const WORKER_URL = new URL("./bake-worker.ts", import.meta.url);

/** Leaves only error.json in the asset's output folder, in the bake library's own format. */
function writeFailure(project: AssetProject, id: string, message: string): void {
  const entry = findAssets(project).find((candidate) => candidate.id === id);
  if (entry === undefined) return;
  let source = "";
  try {
    source = sourceHash(entry);
  } catch {
    // The folder went away meanwhile: the error file still says what happened.
  }
  const dir = bakeDir(project, id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "error.json"), formatJson({ format: BAKE_ERROR_FORMAT, id, sourceHash: source, message }));
}

export function createBakeService(options: BakeServiceOptions): BakeService {
  const { project, timeoutMs } = options;
  let tail: Promise<unknown> = Promise.resolve();
  let queued = 0;
  let running: { reason: BakeReason; total: number; done: number; current: string | null } | null = null;
  let last: BakeRun | null = null;
  let runs = 0;
  let active: Worker | null = null;
  let closed = false;

  /**
   * One worker over `ids`. Resolves with one item per asset it got through, in order. If the
   * worker was stopped or died, the last item is the asset it was on, failed; the caller
   * starts a new worker for the ids after it.
   */
  const runWorker = (ids: readonly string[]): Promise<BakeItem[]> =>
    new Promise((resolve) => {
      const job: BakeJob = { root: project.root, assetsDir: project.assetsDir, outDir: project.outDir, ids };
      const worker = new Worker(WORKER_URL, { workerData: job, resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB } });
      active = worker;
      const items: BakeItem[] = [];
      let assetStarted = performance.now();
      let timer: NodeJS.Timeout | undefined;
      let ended = false;
      let stopped: string | null = null;
      let crashed: string | null = null;

      const arm = (): void => {
        clearTimeout(timer);
        assetStarted = performance.now();
        timer = setTimeout(() => {
          stopped = `the bake did not finish in ${timeoutMs} ms and was stopped (a generator that never returns?)`;
          void worker.terminate();
        }, timeoutMs);
      };

      worker.on("message", (message: BakeMessage) => {
        if (message.type === "start") {
          if (running !== null) running.current = message.id;
        } else if (message.type === "done") {
          items.push({ id: message.id, ok: message.ok, error: message.error, ms: message.ms, timedOut: false });
          if (running !== null) {
            running.done += 1;
            running.current = null;
          }
          arm();
        } else {
          ended = true;
          clearTimeout(timer);
          // An asset program may have left a timer or a handle open: do not wait for it.
          void worker.terminate();
        }
      });
      worker.on("error", (error: Error) => {
        crashed = error.message;
      });
      worker.on("exit", (code) => {
        clearTimeout(timer);
        if (active === worker) active = null;
        const id = ids[items.length];
        // On shutdown (`closed`) the asset is not to blame: its folder stays without an atlas
        // and the next start bakes it again.
        if (!ended && id !== undefined && !closed) {
          const error = stopped ?? (crashed !== null ? `the bake worker failed: ${crashed}` : `the bake worker stopped (exit code ${code})`);
          writeFailure(project, id, error);
          items.push({ id, ok: false, error, ms: Math.round(performance.now() - assetStarted), timedOut: stopped !== null });
          if (running !== null) {
            running.done += 1;
            running.current = null;
          }
        }
        resolve(items);
      });
      arm();
    });

  const execute = async (ids: readonly string[] | null, reason: BakeReason): Promise<BakeRun> => {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const todo = ids === null ? findAssets(project).map((entry) => entry.id) : [...new Set(ids)];
    running = { reason, total: todo.length, done: 0, current: null };
    const items: BakeItem[] = [];
    let pruned: string[] = [];
    try {
      while (items.length < todo.length && !closed) {
        const before = items.length;
        items.push(...(await runWorker(todo.slice(before))));
        if (items.length === before) break; // a worker that got nowhere and blamed no asset: never loop on it
      }
      if (ids === null && !closed) pruned = pruneBakes(project);
    } finally {
      running = null;
    }
    runs += 1;
    const run: BakeRun = { number: runs, reason, all: ids === null, startedAt, ms: Math.round(performance.now() - started), items, pruned };
    last = run;
    options.onRun?.(run);
    return run;
  };

  const enqueue = (ids: readonly string[] | null, reason: BakeReason): Promise<BakeRun> => {
    queued += 1;
    const run = tail.then(() => {
      queued -= 1;
      return execute(ids, reason);
    });
    tail = run.catch(() => undefined);
    return run;
  };

  return {
    bakeAll: (reason) => enqueue(null, reason),
    bake: (ids, reason) => enqueue(ids, reason),
    state: () => ({ running: running === null ? null : { ...running }, queued, last }),
    close: async () => {
      closed = true;
      await active?.terminate();
    },
  };
}
