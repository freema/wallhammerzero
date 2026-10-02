// The studio's server services. server.ts creates them once per process and hands them to
// every loader and action through the router context (app/context.ts); they outlive Vite's
// reloads of the app code. Route modules import only types from here.

import { openProject } from "@whz/asset-kit/node";
import type { AssetProject } from "@whz/asset-kit/node";
import { createAssetIndex, needsBake } from "./asset-index.ts";
import type { AssetIndex } from "./asset-index.ts";
import { createBakeService } from "./bake.ts";
import type { BakeService } from "./bake.ts";
import type { StudioConfig } from "./config.ts";
import { safeResolve } from "./safe-path.ts";
import type { SafePath } from "./safe-path.ts";

export type { AssetIndex, AssetRecord, AssetStatus, IndexedClip, IndexedVariant, IndexFile } from "./asset-index.ts";
export type { BakeItem, BakeProgress, BakeReason, BakeRun, BakeService, BakeState } from "./bake.ts";
export type { StudioConfig } from "./config.ts";
export type { SafePath } from "./safe-path.ts";

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
  /** The first scan, and a bake of the assets without current output (unless switched off). */
  start(): void;
  /** Stops a bake in flight. */
  close(): Promise<void>;
}

export function createServices(config: StudioConfig): StudioServices {
  const project = openProject({ root: config.root, assets: config.assetsDir, out: config.outDir });
  const index = createAssetIndex(project, config.cacheDir);
  const bake = createBakeService({ project, timeoutMs: config.bakeTimeoutMs, onRun: () => void index.scan() });
  return {
    config,
    project,
    index,
    bake,
    files: { resolve: (requestPath) => safeResolve(config.root, [config.outDir], requestPath) },
    start() {
      const missing = index.scan().filter(needsBake);
      if (config.bakeOnStart && missing.length > 0) {
        bake.bake(missing.map((record) => record.id), "start").catch((error: unknown) => console.error("[studio] the start bake failed:", error));
      }
    },
    close: () => bake.close(),
  };
}
