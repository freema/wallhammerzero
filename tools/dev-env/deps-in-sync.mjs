// Is node_modules in step with package-lock.json?
//
// Compares the lockfile with npm's own record of what is installed
// (node_modules/.package-lock.json, the "hidden lockfile" npm writes after every install).
// The entrypoint runs `npm ci` when this says no, so a fresh checkout or a pulled lockfile
// change needs no manual install.
//
// CLI: node deps-in-sync.mjs [repo root]   exit 0 = in sync, 1 = not (reason on stdout)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const COMPARED = ["version", "resolved", "integrity", "link"];

const isInstalledPath = (key) => key.startsWith("node_modules/") || key.includes("/node_modules/");

/**
 * @param {{packages?: Record<string, any>} | null} lock    package-lock.json (lockfileVersion 2 or 3)
 * @param {{packages?: Record<string, any>} | null} hidden  node_modules/.package-lock.json, or null
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function depsInSync(lock, hidden) {
  if (!lock || typeof lock.packages !== "object" || lock.packages === null) {
    return { ok: false, reason: "package-lock.json has no packages map (lockfileVersion 2+ needed)" };
  }
  const wanted = lock.packages;
  const installed = hidden?.packages ?? {};

  for (const [key, want] of Object.entries(wanted)) {
    if (!isInstalledPath(key)) continue; // the root and the workspace folders themselves
    const have = installed[key];
    if (have === undefined) {
      // npm skips optional packages built for another platform.
      if (want.optional === true) continue;
      return { ok: false, reason: `${key} is not installed` };
    }
    for (const field of COMPARED) {
      if (want[field] !== have[field]) {
        return { ok: false, reason: `${key} differs in ${field}` };
      }
    }
  }
  for (const key of Object.keys(installed)) {
    if (isInstalledPath(key) && wanted[key] === undefined) {
      return { ok: false, reason: `${key} is installed but not in package-lock.json` };
    }
  }
  return { ok: true };
}

function readJson(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(text);
}

/** @param {string} root repo root */
export function checkRepo(root) {
  const lock = readJson(join(root, "package-lock.json"));
  if (lock === null) return { ok: true }; // nothing to be in step with
  let hidden;
  try {
    hidden = readJson(join(root, "node_modules", ".package-lock.json"));
  } catch {
    return { ok: false, reason: "node_modules/.package-lock.json is not valid JSON" };
  }
  return depsInSync(lock, hidden);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkRepo(process.argv[2] ?? process.cwd());
  if (!result.ok) {
    console.log(result.reason);
    process.exit(1);
  }
}
