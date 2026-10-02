// Where the studio reads and writes, and where it listens. Everything comes from environment
// variables with fixed defaults, so `docker compose up studio` needs none of them and a test or
// a second checkout can point the same server somewhere else. See docs/studio.md.

import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** The port the studio listens on when nothing else is said (docs/dev-environment.md, "Ports"). */
export const DEFAULT_PORT = 4100;
/** How long one asset may bake before its worker is stopped. */
export const DEFAULT_BAKE_TIMEOUT_MS = 30_000;

/** The settings of one studio process. All paths are absolute. */
export interface StudioConfig {
  /** The checkout the studio shows. */
  readonly root: string;
  /** The folder of asset programs (`assets/`). */
  readonly assetsDir: string;
  /** The folder of build outputs (`build/`). It is inside `root`: the files API serves it. */
  readonly outDir: string;
  /** The folder of the studio's own derived data (`.studio-cache/`, gitignored). */
  readonly cacheDir: string;
  /** The address to listen on. */
  readonly host: string;
  /** The port to listen on. 0: any free port (the server prints the one it got). */
  readonly port: number;
  /** Extra host names the Host check accepts besides the loopback names. */
  readonly allowedHosts: readonly string[];
  /** How long one asset may bake, in milliseconds. */
  readonly bakeTimeoutMs: number;
  /** True: Vite dev middleware with HMR. False: the built app. */
  readonly dev: boolean;
  /** True: on start, bake the assets that have no current output. */
  readonly bakeOnStart: boolean;
}

/** The repo root when the studio runs from its place in the repo: two folders above the package. */
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

function integer(name: string, text: string | undefined, fallback: number, min: number, max: number): number {
  if (text === undefined || text === "") return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}, got ${JSON.stringify(text)}`);
  }
  return value;
}

/** True if `path` is `folder` or lies inside it. Both are absolute. */
export function isInside(folder: string, path: string): boolean {
  const rest = relative(folder, path);
  return rest === "" || (!rest.startsWith(`..${sep}`) && rest !== ".." && !isAbsolute(rest));
}

/**
 * Reads the configuration from the environment:
 *
 *   WHZ_STUDIO_ROOT             the checkout (default: the repo this package is in)
 *   WHZ_STUDIO_ASSETS           the asset programs, relative to the root (default `assets`)
 *   WHZ_STUDIO_OUT              the build outputs, relative to the root (default `build`)
 *   WHZ_STUDIO_CACHE            the studio's cache, relative to the root (default `.studio-cache`)
 *   WHZ_STUDIO_PORT             the port to listen on (default 4100; 0 = any free port)
 *   WHZ_STUDIO_HOST             the address to listen on (default 127.0.0.1; 0.0.0.0 in the
 *                               dev container, where the loopback binding is on the host side)
 *   WHZ_STUDIO_ALLOWED_HOSTS    extra host names for the Host check, comma separated
 *   WHZ_STUDIO_BAKE_TIMEOUT_MS  the time one asset may bake (default 30000)
 *   WHZ_STUDIO_BAKE_ON_START    0: do not bake missing outputs on start (default 1)
 *   NODE_ENV                    `production` serves the built app; anything else is dev mode
 */
export function readConfig(env: Readonly<Record<string, string | undefined>> = process.env): StudioConfig {
  const root = resolve(env["WHZ_STUDIO_ROOT"] || REPO_ROOT);
  const outDir = resolve(root, env["WHZ_STUDIO_OUT"] || "build");
  const cacheDir = resolve(root, env["WHZ_STUDIO_CACHE"] || ".studio-cache");
  for (const [name, dir] of [["WHZ_STUDIO_OUT", outDir], ["WHZ_STUDIO_CACHE", cacheDir]] as const) {
    if (!isInside(root, dir) || dir === root) throw new Error(`${name} must be a folder inside the checkout ${root}, got ${dir}`);
  }
  return {
    root,
    assetsDir: resolve(root, env["WHZ_STUDIO_ASSETS"] || "assets"),
    outDir,
    cacheDir,
    host: env["WHZ_STUDIO_HOST"] || (env["WHZ_IN_CONTAINER"] === "1" ? "0.0.0.0" : "127.0.0.1"),
    port: integer("WHZ_STUDIO_PORT", env["WHZ_STUDIO_PORT"], DEFAULT_PORT, 0, 65535),
    allowedHosts: (env["WHZ_STUDIO_ALLOWED_HOSTS"] ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== ""),
    bakeTimeoutMs: integer("WHZ_STUDIO_BAKE_TIMEOUT_MS", env["WHZ_STUDIO_BAKE_TIMEOUT_MS"], DEFAULT_BAKE_TIMEOUT_MS, 100, 3_600_000),
    dev: env["NODE_ENV"] !== "production",
    bakeOnStart: env["WHZ_STUDIO_BAKE_ON_START"] !== "0",
  };
}
