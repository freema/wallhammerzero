import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { discoverChecks, expandWorkspaces } from "../discover.mjs";

const runner = join(dirname(fileURLToPath(import.meta.url)), "..", "run.mjs");
const temporary = [];
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

/** Builds a throwaway repo. `files` maps a relative path to a JSON value or a string. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "whz-check-"));
  temporary.push(root);
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

function gate(root, ...args) {
  const run = spawnSync(process.execPath, [runner, "--root", root, ...args], { encoding: "utf8" });
  return { status: run.status, out: run.stdout + run.stderr };
}

const pass = { check: "node -e \"console.log('ran ' + process.env.npm_package_name)\"" };
const fail = { check: "node -e \"console.log('ran ' + process.env.npm_package_name); process.exit(3)\"" };

test("runs root check:* scripts and every workspace check, and passes when all pass", () => {
  const root = fixture({
    "package.json": {
      name: "fixture",
      private: true,
      workspaces: ["tools/*", "packages/*"],
      scripts: { check: "not used by the test", "check:rootwide": "node -e \"console.log('ran rootwide')\"" },
    },
    "tools/t/package.json": { name: "@fx/t", scripts: pass },
    "packages/b/package.json": { name: "@fx/b", scripts: pass },
    "packages/a/package.json": { name: "@fx/a", scripts: pass },
    "packages/not-a-package/readme.txt": "no package.json here",
  });
  const { status, out } = gate(root);
  assert.equal(status, 0, out);
  for (const name of ["rootwide", "@fx/t", "@fx/a", "@fx/b"]) assert.match(out, new RegExp(`ran ${name}`));
  assert.match(out, /all 4 checks passed/);
  // root checks first, then workspaces in pattern order, each pattern sorted by folder name
  const order = ["root:rootwide", "@fx/t", "@fx/a", "@fx/b"].map((id) => out.indexOf(`=== check ${id} `));
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  assert.ok(order.every((index) => index >= 0));
});

test("one failing check fails the gate, and the other checks still run", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true, workspaces: ["packages/*"] },
    "packages/a/package.json": { name: "@fx/a", scripts: fail },
    "packages/b/package.json": { name: "@fx/b", scripts: pass },
  });
  const { status, out } = gate(root);
  assert.equal(status, 1, out);
  assert.match(out, /ran @fx\/b/);
  assert.match(out, /FAIL {2}@fx\/a .*exit 3/);
  assert.match(out, /ok {4}@fx\/b/);
  assert.match(out, /check: FAILED \(1 of 2 run checks failed/);
});

test("--bail stops at the first failure", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true, workspaces: ["packages/*"] },
    "packages/a/package.json": { name: "@fx/a", scripts: fail },
    "packages/b/package.json": { name: "@fx/b", scripts: pass },
  });
  const { status, out } = gate(root, "--bail");
  assert.equal(status, 1, out);
  assert.doesNotMatch(out, /ran @fx\/b/);
  assert.match(out, /not run after the first failure \(--bail\): 1/);
});

test("a workspace without a check script fails the gate", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true, workspaces: ["packages/*"] },
    "packages/a/package.json": { name: "@fx/a", scripts: pass },
    "packages/unchecked/package.json": { name: "@fx/unchecked" },
  });
  const { status, out } = gate(root);
  assert.equal(status, 1, out);
  assert.match(out, /ran @fx\/a/);
  assert.match(out, /packages\/unchecked \(@fx\/unchecked\) has no "check" script/);
});

test("a repo with no checks at all fails the gate", () => {
  const root = fixture({ "package.json": { name: "fixture", private: true, workspaces: ["packages/*"] } });
  const { status, out } = gate(root);
  assert.equal(status, 1, out);
  assert.match(out, /no checks found/);
});

test("a filter runs only the named checks, by package name or by folder", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true, workspaces: ["packages/*"] },
    "packages/a/package.json": { name: "@fx/a", scripts: fail },
    "packages/b/package.json": { name: "@fx/b", scripts: pass },
    "packages/c/package.json": { name: "@fx/c", scripts: pass },
  });
  const byName = gate(root, "@fx/b");
  assert.equal(byName.status, 0, byName.out);
  assert.match(byName.out, /ran @fx\/b/);
  assert.doesNotMatch(byName.out, /ran @fx\/(a|c)/);

  const byFolder = gate(root, "packages/c/", "@fx/b");
  assert.equal(byFolder.status, 0, byFolder.out);
  assert.match(byFolder.out, /all 2 checks passed/);

  const unknown = gate(root, "@fx/nope");
  assert.equal(unknown.status, 2, unknown.out);
  assert.match(unknown.out, /no such check: @fx\/nope/);
});

test("--list prints the checks and runs nothing", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true, workspaces: ["packages/*"], scripts: { "check:x": "exit 1" } },
    "packages/a/package.json": { name: "@fx/a", scripts: fail },
  });
  const { status, out } = gate(root, "--list");
  assert.equal(status, 0, out);
  assert.match(out, /root:x\t\.\tnpm run check:x/);
  assert.match(out, /@fx\/a\tpackages\/a\tnpm run check/);
  assert.doesNotMatch(out, /ran /);
});

test("an unknown option is an error, not a silent pass", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true, workspaces: ["packages/*"] },
    "packages/a/package.json": { name: "@fx/a", scripts: pass },
  });
  const { status, out } = gate(root, "--lst");
  assert.equal(status, 2, out);
  assert.match(out, /unknown option --lst/);
});

test("expandWorkspaces: folders, <folder>/*, and nothing fancier", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true },
    "tools/one/package.json": { name: "one" },
    "packages/z/package.json": { name: "z" },
    "packages/a/package.json": { name: "a" },
    "packages/.hidden/package.json": { name: "hidden" },
    "packages/node_modules/x/package.json": { name: "x" },
  });
  assert.deepEqual(expandWorkspaces(root, ["tools/one", "packages/*", "missing/*", "./tools/one/"]), [
    "tools/one",
    "packages/a",
    "packages/z",
  ]);
  assert.throws(() => expandWorkspaces(root, ["packages/**"]), /unsupported workspaces pattern/);
  assert.throws(() => expandWorkspaces(root, ["packages/a*"]), /unsupported workspaces pattern/);
  assert.throws(() => expandWorkspaces(root, ["!packages/a"]), /unsupported workspaces pattern/);
});

test("discoverChecks reports duplicate and missing package names", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true, workspaces: ["packages/*"] },
    "packages/a/package.json": { name: "same", scripts: pass },
    "packages/b/package.json": { name: "same", scripts: pass },
    "packages/c/package.json": { scripts: pass },
  });
  const { checks, problems } = discoverChecks(root);
  assert.deepEqual(checks.map((check) => check.dir), ["packages/a"]);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /packages\/b and packages\/a share the package name "same"/);
  assert.match(problems[1], /packages\/c\/package.json has no "name"/);
});

test("a workspace that is missing from package-lock.json fails the gate", () => {
  const root = fixture({
    "package.json": { name: "fixture", private: true, workspaces: ["packages/*"] },
    "package-lock.json": {
      lockfileVersion: 3,
      packages: { "": { name: "fixture" }, "packages/a": { name: "@fx/a" } },
    },
    "packages/a/package.json": { name: "@fx/a", scripts: pass },
    "packages/new/package.json": { name: "@fx/new", scripts: pass },
  });
  const { status, out } = gate(root);
  assert.equal(status, 1, out);
  assert.match(out, /ran @fx\/a/);
  assert.match(out, /FAIL {2}packages\/new is not in package-lock.json: run `.\/dev npm install`/);
  assert.doesNotMatch(out, /packages\/a is not in package-lock.json/);
});
