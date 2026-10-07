// The studio's server services. server.ts creates them once per process and hands them to
// every loader and action through the router context (app/context.ts); they outlive Vite's
// reloads of the app code. Route modules import only types from here.

import { dirname, join } from "node:path";
import { openProject } from "@whz/asset-kit/node";
import type { AssetProject } from "@whz/asset-kit/node";
import { createAssetIndex, needsBake } from "./asset-index.ts";
import type { AssetIndex } from "./asset-index.ts";
import { createBakeService } from "./bake.ts";
import type { BakeService } from "./bake.ts";
import type { StudioConfig } from "./config.ts";
import { createEventHub } from "./events.ts";
import type { EventHub } from "./events.ts";
import { createLiveService } from "./live.ts";
import type { LiveService } from "./live.ts";
import { createReviewService } from "./reviews.ts";
import type { ReviewService } from "./reviews.ts";
import { safeResolve } from "./safe-path.ts";
import type { SafePath } from "./safe-path.ts";
import { createTaskService, TASKS_DIR } from "./tasks.ts";
import type { TaskService } from "./tasks.ts";
import { createWatcher } from "./watcher.ts";

export type { AssetIndex, AssetRecord, AssetStatus, IndexChange, IndexedClip, IndexedPreset, IndexedVariant, IndexFile } from "./asset-index.ts";
export { MAX_COMMENT_LENGTH, VERDICT_STATUSES, VERDICT_TAGS } from "./reviews.ts";
export type { ReviewFile, ReviewService, ReviewState, Verdict, VerdictInput, VerdictStatus, VerdictTag } from "./reviews.ts";
export { MAX_TITLE_LENGTH, NOTE_SECTIONS, PRIORITIES, SIZES } from "./tasks.ts";
export type { CreatedTask, Priority, Size, TaskInput, TaskNote, TaskService } from "./tasks.ts";

/** The payload of the `tasks` topic: files under tasks/ changed (paths relative to the folder). */
export interface TasksEvent {
  readonly type: "changed";
  readonly paths: readonly string[];
}
export type { BakeItem, BakeProgress, BakeReason, BakeRun, BakeService, BakeState } from "./bake.ts";
export type { StudioConfig } from "./config.ts";
export type { EventHub, HubEvent, Topic } from "./events.ts";
export type { AssetsEvent, LiveService, LiveState } from "./live.ts";
export type { SafePath } from "./safe-path.ts";
export type { Watcher } from "./watcher.ts";

/** Read-only access to the files the studio serves: today the build outputs. */
export interface FilesService {
  /** Resolves a path relative to the checkout to a real file under a served folder, or refuses. */
  resolve(requestPath: string): SafePath;
}

/** What loaders and actions get from `context.get(studioContext)`. */
export interface StudioServices {
  readonly config: StudioConfig;
  readonly project: AssetProject;
  readonly index: AssetIndex;
  readonly bake: BakeService;
  readonly files: FilesService;
  /** What the server pushes to open pages (`GET /api/events`). */
  readonly events: EventHub;
  /** Live reload: the watcher on the assets folder, and what it and the bakes publish. */
  readonly live: LiveService;
  /** The owner's verdicts: review.json per asset and the generated inbox. */
  readonly reviews: ReviewService;
  /** The task notes: the queue as the /tasks page lists it, and a note from a rejected verdict. */
  readonly tasks: TaskService;
  /** The first scan, a bake of the assets without current output (unless switched off), and the watcher. */
  start(): void;
  /** Stops the watcher and a bake in flight. */
  close(): Promise<void>;
}

/** Overrides for tests: the watcher's timing. */
export interface ServiceOptions {
  readonly debounceMs?: number;
  readonly maxWaitMs?: number;
}

export function createServices(config: StudioConfig, options: ServiceOptions = {}): StudioServices {
  const project = openProject({ root: config.root, assets: config.assetsDir, out: config.outDir });
  const index = createAssetIndex(project, config.cacheDir);
  const events = createEventHub();
  // The bake service and the live service need each other: the progress goes through this.
  let live: LiveService | null = null;
  const bake = createBakeService({
    project,
    timeoutMs: config.bakeTimeoutMs,
    onRun: () => void index.scan(),
    onProgress: (running) => live?.bakeProgress(running),
  });
  live = createLiveService({ project, index, bake, hub: events, watch: config.watch, pollMs: config.watchPollMs, debounceMs: options.debounceMs, maxWaitMs: options.maxWaitMs });
  const started = live;
  const reviews = createReviewService({
    project,
    target: (id) => {
      const record = index.get(id);
      return record === undefined ? undefined : { entry: { id, folder: dirname(join(project.root, record.genFile)) }, outputHash: record.outputHash, sourceHash: record.sourceHash };
    },
    entries: () => index.all().map((record) => ({ id: record.id, genFile: record.genFile, outputHash: record.outputHash, review: record.review })),
    wrote: (paths) => started.watcher?.wrote(paths),
    rescan: () => void index.scan(),
  });
  // A re-bake can make an asset "changed since verdict": the inbox follows every change of the index.
  index.onChange(() => void reviews.refreshInbox());
  const tasks = createTaskService({
    root: config.root,
    verdict: (id, verdictId) => index.get(id)?.review.verdicts.find((verdict) => verdict.id === verdictId),
    link: (id, verdictId, task) => reviews.setTask(id, verdictId, task),
  });
  // The /tasks page follows the queue folder: a note written by a session or by this studio
  // (the studio's own write is reported too, on purpose: the page shows the row it just made).
  const taskWatcher = config.watch
    ? createWatcher({ dir: join(config.root, TASKS_DIR), onBatch: (paths) => void events.publish("tasks", { type: "changed", paths } satisfies TasksEvent), pollMs: config.watchPollMs, debounceMs: options.debounceMs, maxWaitMs: options.maxWaitMs })
    : null;
  return {
    config,
    project,
    index,
    bake,
    events,
    live: started,
    reviews,
    tasks,
    files: { resolve: (requestPath) => safeResolve(config.root, [config.outDir], requestPath) },
    start() {
      const missing = index.scan().filter(needsBake);
      reviews.refreshInbox(); // the inbox follows the files, whoever changed them while the studio was off
      started.start();
      taskWatcher?.start();
      if (config.bakeOnStart && missing.length > 0) {
        bake.bake(missing.map((record) => record.id), "start").catch((error: unknown) => console.error("[studio] the start bake failed:", error));
      }
    },
    async close() {
      taskWatcher?.close();
      started.close();
      await bake.close();
    },
  };
}
