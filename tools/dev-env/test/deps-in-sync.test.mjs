import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkRepo, depsInSync } from "../deps-in-sync.mjs";

const registry = (name, version, extra = {}) => ({
  version,
  resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
  integrity: `sha512-${name}-${version}`,
  ...extra,
});

// The shape npm 11 writes for a root with two workspaces, one dependency and one
// platform-specific optional dependency.
const lock = () => ({
  lockfileVersion: 3,
  packages: {
    "": { name: "root", workspaces: ["packages/*"] },
    "node_modules/@whz/a": { resolved: "packages/a", link: true },
    "node_modules/left": registry("left", "1.0.0"),
    "node_modules/native-linux": registry("native-linux", "2.0.0", { optional: true }),
    "node_modules/native-darwin": registry("native-darwin", "2.0.0", { optional: true }),
    "packages/a": { name: "@whz/a", version: "0.0.0", dependencies: { left: "1.0.0" } },
  },
});
const hidden = () => {
  const { packages } = lock();
  delete packages[""];
  delete packages["node_modules/native-darwin"]; // not installed on Linux
  return { lockfileVersion: 3, packages };
};

test("in sync: what npm writes after an install", () => {
  assert.deepEqual(depsInSync(lock(), hidden()), { ok: true });
});

test("a lockfile with no installable packages needs no node_modules", () => {
  assert.deepEqual(depsInSync({ packages: { "": { name: "root" } } }, null), { ok: true });
});

test("nothing installed yet", () => {
  const result = depsInSync(lock(), null);
  assert.equal(result.ok, false);
  assert.match(result.reason, /node_modules\/@whz\/a is not installed/);
});

test("a package added to the lockfile", () => {
  const wanted = lock();
  wanted.packages["node_modules/right"] = registry("right", "3.0.0");
  assert.deepEqual(depsInSync(wanted, hidden()), { ok: false, reason: "node_modules/right is not installed" });
});

test("a nested package added to the lockfile", () => {
  const wanted = lock();
  wanted.packages["packages/a/node_modules/left"] = registry("left", "0.9.0");
  assert.deepEqual(depsInSync(wanted, hidden()), {
    ok: false,
    reason: "packages/a/node_modules/left is not installed",
  });
});

test("a version bump in the lockfile", () => {
  const wanted = lock();
  wanted.packages["node_modules/left"] = registry("left", "1.0.1");
  assert.deepEqual(depsInSync(wanted, hidden()), { ok: false, reason: "node_modules/left differs in version" });
});

test("same version, different tarball", () => {
  const wanted = lock();
  wanted.packages["node_modules/left"].integrity = "sha512-other";
  assert.deepEqual(depsInSync(wanted, hidden()), { ok: false, reason: "node_modules/left differs in integrity" });
});

test("a package removed from the lockfile", () => {
  const wanted = lock();
  delete wanted.packages["node_modules/left"];
  assert.deepEqual(depsInSync(wanted, hidden()), {
    ok: false,
    reason: "node_modules/left is installed but not in package-lock.json",
  });
});

test("a workspace that became a registry package", () => {
  const wanted = lock();
  wanted.packages["node_modules/@whz/a"] = registry("@whz/a", "1.0.0");
  const result = depsInSync(wanted, hidden());
  assert.equal(result.ok, false);
  assert.match(result.reason, /node_modules\/@whz\/a differs in/);
});

test("an optional package of this platform that is installed at another version", () => {
  const wanted = lock();
  wanted.packages["node_modules/native-linux"] = registry("native-linux", "2.1.0", { optional: true });
  assert.deepEqual(depsInSync(wanted, hidden()), {
    ok: false,
    reason: "node_modules/native-linux differs in version",
  });
});

test("an old lockfile format is reported, not treated as in sync", () => {
  const result = depsInSync({ lockfileVersion: 1, dependencies: {} }, null);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no packages map/);
});

test("checkRepo reads both files from a repo folder", () => {
  const root = mkdtempSync(join(tmpdir(), "whz-deps-"));
  try {
    assert.deepEqual(checkRepo(root), { ok: true }, "no package-lock.json: nothing to install");
    writeFileSync(join(root, "package-lock.json"), JSON.stringify(lock()));
    assert.equal(checkRepo(root).ok, false, "no node_modules yet");
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "node_modules", ".package-lock.json"), "{ half written");
    assert.match(checkRepo(root).reason, /not valid JSON/);
    writeFileSync(join(root, "node_modules", ".package-lock.json"), JSON.stringify(hidden()));
    assert.deepEqual(checkRepo(root), { ok: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
