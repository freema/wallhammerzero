// The one path resolver of the studio's file endpoints. A request names a file by its path
// relative to the checkout; the resolver answers with the real file, or says why not. Nothing
// outside the allowed folders is ever opened, whatever the request path looks like.

import { realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { isInside } from "./config.ts";

/** Why a path was refused. `invalid` and `forbidden` are the caller's fault; `missing` is a 404. */
export type PathRefusal = "invalid" | "forbidden" | "missing";

export type SafePath =
  | { readonly ok: true; /** The real (symlink-free) absolute path of an existing file. */ readonly path: string; readonly size: number; readonly mtimeMs: number }
  | { readonly ok: false; readonly reason: PathRefusal; readonly message: string };

const refuse = (reason: PathRefusal, message: string): SafePath => ({ ok: false, reason, message });

/**
 * Resolves `requestPath` (relative to `root`, `/` separators, already percent-decoded) to an
 * existing file under one of `allowed` (absolute folders inside `root`).
 *
 * Refused as `invalid`: an empty path, a NUL or a backslash, an absolute path, and any `.`,
 * `..` or empty segment. The path is never normalised: a `..` is an error, not a step up.
 * Refused as `forbidden`: a path outside the allowed folders, and a path that leaves them or
 * the checkout through a symlink (the real path decides).
 * Refused as `missing`: no such file, or it is not a regular file.
 */
export function safeResolve(root: string, allowed: readonly string[], requestPath: string): SafePath {
  if (requestPath === "" || requestPath.includes("\0") || requestPath.includes("\\")) return refuse("invalid", "not a valid path");
  if (requestPath.startsWith("/")) return refuse("invalid", "the path must be relative to the checkout");
  const segments = requestPath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return refuse("invalid", "the path may not contain empty, '.' or '..' segments");
  }
  const lexical = join(resolve(root), ...segments);
  const roots = allowed.map((folder) => resolve(folder));
  if (!roots.some((folder) => isInside(folder, lexical) && folder !== lexical)) {
    return refuse("forbidden", "the path is outside the folders the studio serves");
  }
  let real: string;
  let realRoot: string;
  try {
    realRoot = realpathSync(resolve(root));
    real = realpathSync(lexical);
  } catch {
    return refuse("missing", "no such file");
  }
  // The real path must still be in the checkout and in an allowed folder (compared by their
  // real paths too, so a checkout that is itself reached through a symlink works).
  const realAllowed = roots.flatMap((folder) => {
    try {
      return [realpathSync(folder)];
    } catch {
      return [];
    }
  });
  if (!isInside(realRoot, real) || !realAllowed.some((folder) => isInside(folder, real) && isInside(realRoot, folder))) {
    return refuse("forbidden", "the path leaves the checkout through a symlink");
  }
  const stat = statSync(real, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) return refuse("missing", "no such file");
  return { ok: true, path: real, size: stat.size, mtimeMs: stat.mtimeMs };
}
