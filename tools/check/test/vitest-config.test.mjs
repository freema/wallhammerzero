// Every package that runs Vitest in its check takes the shared options of vitest.shared.ts
// (the generous timeouts), so a gate that runs on a busy machine does not go red on Vitest's
// 5 s default. A new package that forgets its vitest.config.ts fails here.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { expandWorkspaces } from "../discover.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SHARED = "vitest.shared.ts";
/** Below this a loaded machine can still time a test out: the slow tests take seconds when it is quiet. */
const MIN_TIMEOUT_MS = 60_000;

const rootPackage = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8"));
const workspaces = expandWorkspaces(REPO, rootPackage.workspaces);
const withVitest = workspaces.filter((dir) => {
  const scripts = JSON.parse(readFileSync(join(REPO, dir, "package.json"), "utf8")).scripts ?? {};
  return Object.values(scripts).some((script) => /\bvitest\b/.test(script));
});

test("the shared options hold a test timeout and a hook timeout of a minute or more", () => {
  const source = readFileSync(join(REPO, SHARED), "utf8");
  for (const name of ["TEST_TIMEOUT_MS", "HOOK_TIMEOUT_MS"]) {
    const value = new RegExp(`^export const ${name} = ([0-9_]+);$`, "m").exec(source)?.[1];
    assert.notEqual(value, undefined, `${SHARED} exports ${name} as a number`);
    assert.ok(Number(value.replaceAll("_", "")) >= MIN_TIMEOUT_MS, `${name} is ${value} ms: under ${MIN_TIMEOUT_MS} ms a busy machine turns the gate red`);
  }
  assert.match(source, /testTimeout: TEST_TIMEOUT_MS,/);
  assert.match(source, /hookTimeout: HOOK_TIMEOUT_MS,/);
});

test("there are packages that run Vitest (the test below is not empty by accident)", () => {
  assert.ok(withVitest.includes("packages/asset-kit"), withVitest.join(", "));
  assert.ok(withVitest.length >= 8, withVitest.join(", "));
});

for (const dir of withVitest) {
  test(`${dir} runs Vitest with the shared options`, () => {
    const file = join(REPO, dir, "vitest.config.ts");
    assert.ok(existsSync(file), `${dir}/vitest.config.ts is missing: copy the one of packages/det (it takes the timeouts from ${SHARED})`);
    const source = readFileSync(file, "utf8");
    const specifier = relative(join(REPO, dir), join(REPO, SHARED)).replaceAll("\\", "/");
    assert.ok(source.includes(`import { sharedTest } from "${specifier}";`), `${dir}/vitest.config.ts must import sharedTest from "${specifier}"`);
    assert.match(source, /test: \{ \.\.\.sharedTest\b/, `${dir}/vitest.config.ts must start its test options with ...sharedTest`);
    assert.doesNotMatch(source, /\b(testTimeout|hookTimeout)\b/, `${dir}/vitest.config.ts sets a timeout of its own: change ${SHARED} instead`);
  });
}
