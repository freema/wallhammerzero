// The bake worker: runs asset programs off the server's thread. The server (bake.ts) starts
// one per bake run, hands it the ids to bake, and stops it when an asset takes too long.
//
// A fresh worker per run is also what makes a re-bake see an edited gen.ts: Node caches
// modules per thread, so the server's own thread must never import an asset program.
//
// It calls the same `bakeToDisk` as the `asset bake` command, so the files are byte for byte
// the files of the command line.

import { parentPort, workerData } from "node:worker_threads";
import { bakeToDisk, findAssets, openProject } from "@whz/asset-kit/node";

/** What the server gives a worker. */
export interface BakeJob {
  /** Absolute folders of the project. */
  readonly root: string;
  readonly assetsDir: string;
  readonly outDir: string;
  /** The assets to bake, in this order. */
  readonly ids: readonly string[];
}

/** What a worker tells the server, in order: per asset `start` then `done`, and `end` after the last. */
export type BakeMessage =
  | { readonly type: "start"; readonly id: string }
  | { readonly type: "done"; readonly id: string; readonly ok: boolean; readonly error: string | null; readonly ms: number }
  | { readonly type: "end" };

if (parentPort === null) throw new Error("bake-worker.ts is a worker: start it from bake.ts");
const port = parentPort;
const send = (message: BakeMessage): void => port.postMessage(message);

const job = workerData as BakeJob;
const project = openProject({ root: job.root, assets: job.assetsDir, out: job.outDir });
const entries = findAssets(project);

for (const id of job.ids) {
  send({ type: "start", id });
  const started = performance.now();
  const entry = entries.find((candidate) => candidate.id === id);
  // bakeToDisk never throws for a broken asset: it leaves error.json and says why.
  const result = entry === undefined ? { ok: false as const, error: `no asset ${JSON.stringify(id)} under ${project.assetsDir}` } : await bakeToDisk(project, entry);
  send({ type: "done", id, ok: result.ok, error: result.ok ? null : result.error, ms: Math.round(performance.now() - started) });
}
send({ type: "end" });
