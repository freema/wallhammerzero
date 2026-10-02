// Finds the checks the gate runs. Nothing here is specific to one package: a later note adds
// a check by giving its workspace a "check" script (or by adding a root "check:<name>"
// script), never by editing the gate.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {{id: string, dir: string, script: string, kind: "root" | "workspace"}} Check
 * @typedef {{checks: Check[], problems: string[]}} Discovery
 */

function readPackage(dir) {
  const file = join(dir, "package.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${file}: ${error.message}`);
  }
}

/**
 * Expands the root "workspaces" patterns. Only what this repo uses is supported: a literal
 * folder ("tools/x") or all direct subfolders ("packages/*"). Anything else is an error, so
 * a pattern we cannot expand never hides a package from the gate.
 * @param {string} root
 * @param {string[]} patterns
 * @returns {string[]} workspace folders relative to root, in pattern order then by name
 */
export function expandWorkspaces(root, patterns) {
  const found = [];
  for (const pattern of patterns) {
    if (typeof pattern !== "string" || pattern === "") {
      throw new Error(`unsupported workspaces pattern: ${JSON.stringify(pattern)}`);
    }
    const clean = pattern.replace(/^\.\//, "").replace(/\/$/, "");
    const parent = clean.endsWith("/*") ? clean.slice(0, -2) : null;
    if (/[*?[\]{}!]/.test(parent ?? clean)) {
      throw new Error(
        `unsupported workspaces pattern "${pattern}": use a folder or "<folder>/*" (tools/check/discover.mjs)`,
      );
    }
    if (parent === null) {
      if (existsSync(join(root, clean, "package.json"))) found.push(clean);
      continue;
    }
    const parentDir = join(root, parent);
    if (!existsSync(parentDir)) continue;
    const names = readdirSync(parentDir)
      .filter((name) => name !== "node_modules" && !name.startsWith("."))
      .sort();
    for (const name of names) {
      const dir = join(parentDir, name);
      if (statSync(dir).isDirectory() && existsSync(join(dir, "package.json"))) {
        found.push(`${parent}/${name}`);
      }
    }
  }
  return [...new Set(found)];
}

/**
 * @param {string} root repo root (the folder of the root package.json)
 * @returns {Discovery}
 */
export function discoverChecks(root) {
  const rootPackage = readPackage(root);
  /** @type {Check[]} */
  const checks = [];
  const problems = [];

  const rootScripts = Object.keys(rootPackage.scripts ?? {})
    .filter((name) => name.startsWith("check:") && name.length > "check:".length)
    .sort();
  for (const script of rootScripts) {
    checks.push({ id: `root:${script.slice("check:".length)}`, dir: ".", script, kind: "root" });
  }

  // A workspace npm has not linked yet fails later with a confusing "module not found".
  const lockFile = join(root, "package-lock.json");
  const locked = existsSync(lockFile) ? (JSON.parse(readFileSync(lockFile, "utf8")).packages ?? {}) : null;

  const seen = new Map();
  for (const dir of expandWorkspaces(root, rootPackage.workspaces ?? [])) {
    const workspacePackage = readPackage(join(root, dir));
    if (locked !== null && locked[dir] === undefined) {
      problems.push(
        `${dir} is not in package-lock.json: run \`./dev npm install\` and commit the lockfile with the new workspace`,
      );
    }
    const id = workspacePackage.name;
    if (typeof id !== "string" || id === "") {
      problems.push(`${dir}/package.json has no "name"`);
      continue;
    }
    if (seen.has(id)) {
      problems.push(`${dir} and ${seen.get(id)} share the package name "${id}"`);
      continue;
    }
    seen.set(id, dir);
    if (typeof workspacePackage.scripts?.check !== "string") {
      problems.push(
        `${dir} (${id}) has no "check" script: every workspace is part of the gate (see docs/dev-environment.md)`,
      );
      continue;
    }
    checks.push({ id, dir, script: "check", kind: "workspace" });
  }

  return { checks, problems };
}
