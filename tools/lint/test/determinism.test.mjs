// Proves that the determinism lint fires: fixture asset programs that call Math.random() or
// Math.sin() and a fixture sim system that calls Math.random() fail ESLint, the real assets
// and packages pass, and each banned construct is caught in every place the root
// eslint.config.js puts under the lint, and nowhere else. It also proves that the lint has no
// back door: an inline eslint-disable comment has no effect, and eval, new Function, import()
// and imports of Node built-ins are refused.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { ALLOWED_MATH } from "../determinism.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const eslint = new ESLint({ cwd: root });

const DETERMINISM_RULES = ["no-restricted-globals", "no-restricted-properties", "no-restricted-syntax", "no-restricted-imports"];

/** Lints `code` as if it were the file `path` of the repo. Returns the determinism messages. */
async function lintAs(path, code) {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  assert.ok(result, `${path} was not linted`);
  assert.equal(result.fatalErrorCount, 0, `${path} does not parse: ${JSON.stringify(result.messages)}`);
  return result.messages.filter((message) => DETERMINISM_RULES.includes(message.ruleId));
}

const fixture = (name) => readFileSync(join(here, "fixtures", "assets", name, "gen.ts"), "utf8");
const simFixture = (name) => readFileSync(join(here, "fixtures", "sim", name, "system.ts"), "utf8");

/** Where the determinism lint applies. */
const UNDER_LINT = [
  "assets/some-pack/some-asset/gen.ts",
  "assets/some-pack/some-asset/parts/legs.ts",
  "packages/det/src/extra.ts",
  "packages/asset-kit/src/extra.ts",
  "packages/sim/src/extra.ts",
  "packages/sim/src/systems/extra.ts",
  "packages/runtime/src/extra.ts",
  "packages/runtime/src/webgl/extra.ts",
  "packages/voxel-kit/src/extra.ts",
  "packages/audio/src/extra.ts",
  "packages/game-data/src/extra.ts",
];
/** Where it does not: tests, scripts and the Node-side loader. */
const NOT_UNDER_LINT = [
  "packages/det/test/extra.test.ts",
  "packages/det/scripts/extra.ts",
  "packages/asset-kit/test/extra.test.ts",
  "packages/asset-kit/src/node/extra.ts",
  "packages/sim/test/extra.test.ts",
  "packages/sim/src/node/extra.ts",
  "packages/runtime/test/extra.test.ts",
  "packages/runtime/dev/extra.ts",
  "packages/runtime/src/node/extra.ts",
  "packages/voxel-kit/test/extra.test.ts",
  "packages/audio/test/extra.test.ts",
  "packages/audio/src/node/extra.ts",
  "packages/audio/src/analysis/extra.ts",
  "packages/game-data/test/extra.test.ts",
  "packages/game-data/src/node/extra.ts",
  "packages/studio/server/extra.ts",
  "tools/check/extra.ts",
];

test("a fixture asset that calls Math.random() fails ESLint", async () => {
  const messages = await lintAs("assets/lint-fixtures/bad-random/gen.ts", fixture("bad-random"));
  assert.equal(messages.length, 1, JSON.stringify(messages));
  assert.equal(messages[0].severity, 2);
  assert.equal(messages[0].ruleId, "no-restricted-properties");
  assert.match(messages[0].message, /Math\.random is not seeded\. Use createRng\(seed, stream\)/);
});

test("a fixture asset that calls Math.sin() fails ESLint", async () => {
  const messages = await lintAs("assets/lint-fixtures/bad-sin/gen.ts", fixture("bad-sin"));
  assert.equal(messages.length, 1, JSON.stringify(messages));
  assert.equal(messages[0].severity, 2);
  assert.equal(messages[0].ruleId, "no-restricted-properties");
  assert.match(messages[0].message, /Math\.sin is implementation-approximated.*isin/);
});

test("a fixture sim system that calls Math.random() fails ESLint", async () => {
  const messages = await lintAs("packages/sim/src/systems/bad-random.ts", simFixture("bad-random"));
  assert.equal(messages.length, 1, JSON.stringify(messages));
  assert.equal(messages[0].severity, 2);
  assert.equal(messages[0].ruleId, "no-restricted-properties");
  assert.match(messages[0].message, /Math\.random is not seeded\. Use createRng\(seed, stream\)/);
});

/** The fixtures that try a back door, and the rule and message that must stop each. */
const BACK_DOORS = {
  "bad-disable": [["no-restricted-properties", /Math\.random is not seeded/]],
  "bad-eval": [
    ["no-restricted-globals", /eval runs code the lint cannot read/],
    ["no-restricted-globals", /Function makes code from text/],
  ],
  "bad-dynamic-import": [["no-restricted-syntax", /import\(\) loads a module at run time/]],
  "bad-fs-import": [
    ["no-restricted-imports", /"fs" is a Node built-in/],
    ["no-restricted-imports", /'node:os' import is restricted.*does no I\/O/],
  ],
};

for (const [name, expected] of Object.entries(BACK_DOORS)) {
  test(`the fixture asset ${name} fails ESLint`, async () => {
    const messages = await lintAs(`assets/lint-fixtures/${name}/gen.ts`, fixture(name));
    assert.equal(messages.length, expected.length, JSON.stringify(messages));
    expected.forEach(([ruleId, pattern], i) => {
      assert.equal(messages[i].severity, 2);
      assert.equal(messages[i].ruleId, ruleId);
      assert.match(messages[i].message, pattern);
      assert.match(messages[i].message, /tools\/lint\/determinism\.js/);
    });
  });
}

test("the fixture with eslint-disable-next-line is told that the comment has no effect", async () => {
  const [result] = await eslint.lintText(fixture("bad-disable"), { filePath: join(root, "assets/lint-fixtures/bad-disable/gen.ts") });
  assert.equal(result.errorCount, 1, JSON.stringify(result.messages));
  const note = result.messages.find((message) => message.ruleId === null);
  assert.match(note?.message ?? "", /eslint-disable-next-line' has no effect because you have 'noInlineConfig'/);
});

test("inline configuration still works outside the lint, and for no rule at all inside it", async () => {
  const code = "export const x: any = 1; // eslint-disable-line @typescript-eslint/no-explicit-any\n";
  const lint = async (path) => (await eslint.lintText(code, { filePath: join(root, path) }))[0];
  for (const path of NOT_UNDER_LINT) {
    assert.deepEqual((await lint(path)).messages, [], path);
  }
  for (const path of UNDER_LINT) {
    const result = await lint(path);
    assert.deepEqual(result.messages.filter((message) => message.severity === 2).map((message) => message.ruleId), ["@typescript-eslint/no-explicit-any"], path);
  }
});

test("a fixture sim system that makes its own random stream fails ESLint, and only as a system", async () => {
  const messages = await lintAs("packages/sim/src/systems/own-stream.ts", simFixture("own-stream"));
  assert.equal(messages.length, 1, JSON.stringify(messages));
  assert.equal(messages[0].severity, 2);
  assert.equal(messages[0].ruleId, "no-restricted-imports");
  assert.match(messages[0].message, /A sim system draws from ctx\.rng, its own stream.*tools\/lint\/determinism\.js/);

  const others = {
    "the generator class": 'import { Rng } from "@whz/det";\nexport const x = new Rng(1, "a");',
    "the whole kit as one name": 'import * as det from "@whz/det";\nexport const x = det.createRng(1, "a");',
    "the generator's file": 'import { createRng } from "../../../det/src/rng.ts";\nexport const x = createRng(1, "a");',
  };
  for (const [name, code] of Object.entries(others)) {
    assert.ok((await lintAs("packages/sim/src/systems/extra.ts", code)).length >= 1, `${name} was not caught`);
  }
  // The rest of the kit stays open to a system, and the built-ins stay banned.
  assert.deepEqual(await lintAs("packages/sim/src/systems/extra.ts", 'import { hash32, mulDivRound } from "@whz/det";\nexport const x = mulDivRound(hash32(1, 2, 3), 1, 2);'), []);
  assert.equal((await lintAs("packages/sim/src/systems/extra.ts", 'import { readFileSync } from "fs";\nexport const x = readFileSync;')).length, 1);
  assert.equal((await lintAs("packages/sim/src/systems/extra.ts", 'import { readFileSync } from "node:fs";\nexport const x = readFileSync;')).length, 1);
  // The kernel makes the streams, and an asset program has no kernel: both may import createRng.
  for (const path of ["packages/sim/src/kernel.ts", "assets/some-pack/some-asset/gen.ts", "packages/asset-kit/src/extra.ts"]) {
    assert.deepEqual(await lintAs(path, 'import { createRng } from "@whz/det";\nexport const x = createRng(1, "a").int(6);'), [], path);
  }
});

test("the eslint command exits non-zero on the fixtures and zero on the real assets", () => {
  const bin = join(root, "node_modules", "eslint", "bin", "eslint.js");
  const run = (args, input) => spawnSync(process.execPath, [bin, ...args], { cwd: root, input, encoding: "utf8" });

  for (const name of ["bad-random", "bad-sin"]) {
    const bad = run(["--stdin", "--stdin-filename", `assets/lint-fixtures/${name}/gen.ts`], fixture(name));
    assert.equal(bad.status, 1, `${name}: ${bad.stdout}${bad.stderr}`);
    assert.match(bad.stdout, /no-restricted-properties/);
  }
  for (const [name, expected] of Object.entries(BACK_DOORS)) {
    const bad = run(["--stdin", "--stdin-filename", `assets/lint-fixtures/${name}/gen.ts`], fixture(name));
    assert.equal(bad.status, 1, `${name}: ${bad.stdout}${bad.stderr}`);
    for (const [ruleId] of expected) assert.ok(bad.stdout.includes(ruleId), `${name}: ${bad.stdout}`);
  }

  const badSystem = run(["--stdin", "--stdin-filename", "packages/sim/src/systems/bad-random.ts"], simFixture("bad-random"));
  assert.equal(badSystem.status, 1, `${badSystem.stdout}${badSystem.stderr}`);
  assert.match(badSystem.stdout, /no-restricted-properties/);
  // The same file outside the lint (a test of the sim) is fine.
  const asTest = run(["--stdin", "--stdin-filename", "packages/sim/test/bad-random.ts"], simFixture("bad-random"));
  assert.equal(asTest.status, 0, `${asTest.stdout}${asTest.stderr}`);

  const good = run(["assets", "packages/sim/src"]);
  assert.equal(good.status, 0, `${good.stdout}${good.stderr}`);
});

test("the example asset and the kits are clean under the lint", async () => {
  const results = await eslint.lintFiles([
    "assets",
    "packages/det/src",
    "packages/asset-kit/src",
    "packages/sim/src",
    "packages/runtime/src",
    "packages/voxel-kit/src",
    "packages/audio/src",
    "packages/game-data/src",
  ]);
  assert.ok(results.length >= 10, `only ${results.length} files were linted`);
  assert.ok(results.some((result) => result.filePath.endsWith("packages/game-data/src/pack.ts")));
  assert.ok(results.some((result) => result.filePath.endsWith("packages/game-data/src/canonical.ts")));
  assert.ok(results.some((result) => result.filePath.endsWith("assets/examples/blinking-dot/gen.ts")));
  assert.ok(results.some((result) => result.filePath.endsWith("packages/sim/src/kernel.ts")));
  assert.ok(results.some((result) => result.filePath.endsWith("packages/sim/src/systems/counter-shop.ts")));
  assert.ok(results.some((result) => result.filePath.endsWith("packages/runtime/src/cpu.ts")));
  assert.ok(results.some((result) => result.filePath.endsWith("packages/runtime/src/webgl/backend.ts")));
  for (const result of results) {
    assert.deepEqual(result.messages, [], result.filePath);
  }
});

const BANNED = {
  "Math.random": "export const x = Math.random();",
  "Math.sin": "export const x = Math.sin(1);",
  "Math.cos": "export const x = Math.cos(1);",
  "Math.tan": "export const x = Math.tan(1);",
  "Math.exp": "export const x = Math.exp(1);",
  "Math.log": "export const x = Math.log(2);",
  "Math.pow": "export const x = Math.pow(2, 8);",
  "Math.round": "export const x = Math.round(2.5);",
  "Math.sqrt": "export const x = Math.sqrt(2);",
  "Math.atan2": "export const x = Math.atan2(1, 2);",
  "Math.hypot": "export const x = Math.hypot(3, 4);",
  "Math.cbrt": "export const x = Math.cbrt(8);",
  "Math.log2": "export const x = Math.log2(8);",
  "Math.fround": "export const x = Math.fround(0.1);",
  "Math.PI": "export const x = Math.PI;",
  "Math by a computed name": 'export const x = Math["random"]();',
  "Math destructured": "const { sin } = Math;\nexport const x = sin(1);",
  "Math under another name": "const M = Math;\nexport const x = M.random();",
  "the ** operator": "export const x = 2 ** 0.5;",
  "the **= operator": "let x = 2;\nx **= 2;\nexport const y = x;",
  "Date.now": "export const x = Date.now();",
  "new Date": "export const x = new Date().getTime();",
  "performance.now": "export const x = performance.now();",
  "crypto": "export const x = crypto.getRandomValues(new Uint32Array(1));",
  "setTimeout": "setTimeout(() => {}, 1);\nexport {};",
  "parseFloat": 'export const x = parseFloat("1.5");',
  "Number.parseFloat": 'export const x = Number.parseFloat("1.5");',
  "Intl": "export const x = new Intl.Collator().compare;",
  "localeCompare": 'export const x = "a".localeCompare("b");',
  "toLocaleString": "export const x = (1234).toLocaleString();",
  "fetch": 'export const x = fetch("/data.json");',
  "XMLHttpRequest": "export const x = new XMLHttpRequest();",
  "WebSocket": 'export const x = new WebSocket("ws://localhost");',
  "localStorage": 'export const x = localStorage.getItem("save");',
  "sessionStorage": 'export const x = sessionStorage.getItem("save");',
  "indexedDB": 'export const x = indexedDB.open("saves");',
  "document": 'export const x = document.createElement("canvas");',
  "navigator": "export const x = navigator.userAgent;",
  "globalThis": "export const x = globalThis.Math.random();",
  "window": "export const x = window.Math.random();",
  "a node: import": 'import { readFileSync } from "node:fs";\nexport const x = readFileSync;',
  "a Node built-in without the prefix": 'import { readFileSync } from "fs";\nexport const x = readFileSync;',
  "a Node built-in subpath": 'import { readFile } from "fs/promises";\nexport const x = readFile;',
  "a Node built-in for its side effect": 'import "child_process";\nexport {};',
  "a Node built-in re-exported": 'export { readFileSync } from "fs";',
  "the Node side of a package": 'import { loadAsset } from "@whz/asset-kit/node";\nexport const x = loadAsset;',
  "the Node side of a package by path": 'import { loadAsset } from "../../asset-kit/src/node/index.ts";\nexport const x = loadAsset;',
  "eval": 'export const x = eval("1 + 1") as number;',
  "eval called indirectly": 'export const x = (0, eval)("1 + 1") as number;',
  "new Function": 'export const x = new Function("return 1")() as number;',
  "Function without new": 'export const x = Function("return 1")() as number;',
  "a dynamic import": 'export const x = await import("./other.ts");',
  "a dynamic import of a built-in": 'export async function f(): Promise<unknown> {\n  return import("node:fs");\n}',
  "import.meta": "export const x = import.meta.url;",
  "process": 'export const x = process.env["HOME"];',
  "process.getBuiltinModule": 'export const x = process.getBuiltinModule("fs");',
  "require": 'export const x = require("fs") as unknown;',
};

/** Every way to write an inline configuration comment that would silence `Math.random()`. */
const INLINE_CONFIG = {
  "eslint-disable-next-line": "// eslint-disable-next-line\nexport const x = Math.random();",
  "eslint-disable-next-line with the rule": "// eslint-disable-next-line no-restricted-properties\nexport const x = Math.random();",
  "eslint-disable-line": "export const x = Math.random(); // eslint-disable-line",
  "a block eslint-disable": "/* eslint-disable */\nexport const x = Math.random();",
  "a block eslint-disable with the rule": "/* eslint-disable no-restricted-properties */\nexport const x = Math.random();",
  "a rule set to off": '/* eslint no-restricted-properties: "off" */\nexport const x = Math.random();',
};

test("an inline configuration comment silences nothing wherever the lint applies", async () => {
  for (const path of UNDER_LINT) {
    for (const [name, code] of Object.entries(INLINE_CONFIG)) {
      const messages = await lintAs(path, code);
      assert.equal(messages.length, 1, `${name} in ${path}: ${JSON.stringify(messages)}`);
      assert.equal(messages[0].severity, 2, `${name} in ${path}`);
      assert.match(messages[0].message, /Math\.random is not seeded/);
    }
  }
});

test("every banned construct is caught wherever the lint applies", async () => {
  for (const path of UNDER_LINT) {
    for (const [name, code] of Object.entries(BANNED)) {
      const messages = await lintAs(path, code);
      assert.ok(messages.length >= 1, `${name} was not caught in ${path}`);
      for (const message of messages) {
        assert.equal(message.severity, 2, `${name} in ${path} is only a warning`);
        assert.match(message.message, /tools\/lint\/determinism\.js/, `${name}: the message does not say where the rule is explained`);
      }
    }
  }
});

test("tests, scripts and the Node-side loader are not under the lint", async () => {
  for (const path of NOT_UNDER_LINT) {
    for (const [name, code] of Object.entries(BANNED)) {
      assert.deepEqual(await lintAs(path, code), [], `${name} in ${path}`);
    }
  }
});

test("exact integer code passes: the allowed Math helpers, integer operators, @whz/det", async () => {
  const allowed = [
    ...ALLOWED_MATH.map((name) => `export const x = Math.${name}(7, 2);`),
    "export const x = (7 / 2) | 0;",
    "export const x = 7 % 2;",
    "export const x = (7 >>> 1) ^ (7 << 3);",
    "export const x = Number.parseInt(\"ff\", 16);",
    'import { createRng, isin } from "@whz/det";\nexport const x = createRng(1, "a").int(6) + isin(100);',
    'import { other } from "./other.ts";\nexport const x = other;',
    // A local name is not the global.
    "export function f(Date: number, performance: number): number {\n  return Date + performance;\n}",
    "export const x = { Date: 1, random: 2 }.random;",
  ];
  for (const path of UNDER_LINT) {
    for (const code of allowed) {
      // A sim system has ctx.rng and may not make a stream (the test above).
      if (path.startsWith("packages/sim/src/systems/") && code.includes("createRng")) continue;
      assert.deepEqual(await lintAs(path, code), [], `${JSON.stringify(code)} in ${path}`);
    }
  }
  assert.deepEqual(ALLOWED_MATH, [...ALLOWED_MATH].sort(), "keep ALLOWED_MATH sorted");
});
