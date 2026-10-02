// Smoke test of the dev environment itself. It runs inside the container, as part of the gate,
// and fails with a pointer to ./dev when the gate is started any other way.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkRepo } from "../deps-in-sync.mjs";
import { lintCompose } from "../compose-lint.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const inContainer = process.env.WHZ_IN_CONTAINER === "1";
const how = "run the gate as `./dev npm run check` (docs/dev-environment.md)";

test("the gate runs inside the dev container", () => {
  assert.ok(inContainer, `not in the dev container: ${how}`);
  assert.equal(root, "/work", "the repo is bind-mounted at /work");
});

test("Node is the version pinned in compose.yaml, and it is 24 LTS", { skip: !inContainer }, () => {
  const { images } = lintCompose(readFileSync(join(root, "compose.yaml"), "utf8"));
  const pinned = images.map((image) => /^node:(\d+\.\d+\.\d+)-/.exec(image)?.[1]).filter(Boolean);
  assert.ok(pinned.length >= 1, "compose.yaml pins a node image");
  for (const version of pinned) assert.equal(process.version, `v${version}`);
  assert.equal(process.versions.node.split(".")[0], "24");
  const engines = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).engines.node;
  assert.equal(engines, ">=24");
});

test("the command runs as the host user, not as root", { skip: !inContainer }, () => {
  assert.equal(String(process.getuid()), process.env.WHZ_UID);
  assert.equal(String(process.getgid()), process.env.WHZ_GID);
  if (process.env.WHZ_UID !== "0") {
    assert.notEqual(process.getuid(), 0);
    assert.deepEqual(process.getgroups(), [process.getgid()], "no leftover root groups");
  }
});

test("files written to the bind mount belong to the host user", { skip: !inContainer }, () => {
  const dir = join(root, ".tools", "smoke");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `owner-${process.pid}.txt`);
  try {
    writeFileSync(file, "written by the dev container\n");
    const stat = statSync(file);
    assert.equal(stat.uid, process.getuid());
    assert.equal(stat.gid, process.getgid());
  } finally {
    rmSync(file, { force: true });
  }
});

test("node_modules and the npm cache are volumes, not folders on the bind mount", { skip: !inContainer }, () => {
  const bind = statSync(root).dev;
  const modules = statSync(join(root, "node_modules"));
  assert.notEqual(modules.dev, bind, "node_modules is its own mount");
  assert.equal(modules.uid, process.getuid(), "node_modules is writable by the host user");

  // --no-workspaces: `npm config` refuses to run in a workspace folder otherwise.
  const cache = execFileSync("npm", ["config", "get", "cache", "--no-workspaces"], { encoding: "utf8" }).trim();
  assert.equal(cache, "/home/dev/.npm");
  const cacheStat = statSync(cache);
  assert.notEqual(cacheStat.dev, bind, "the npm cache is not on the bind mount");
  assert.equal(cacheStat.uid, process.getuid(), "the npm cache is writable by the host user");
});

test("node_modules is in step with package-lock.json", { skip: !inContainer }, () => {
  assert.deepEqual(checkRepo(root), { ok: true });
});
