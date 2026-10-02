// Proves that the determinism lint fires: fixture asset programs that call Math.random() or
// Math.sin() fail ESLint, the real assets pass, and each banned construct is caught in every
// place the root eslint.config.js puts under the lint, and nowhere else.

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

/** Where the determinism lint applies. */
const UNDER_LINT = [
  "assets/some-pack/some-asset/gen.ts",
  "assets/some-pack/some-asset/parts/legs.ts",
  "packages/det/src/extra.ts",
  "packages/asset-kit/src/extra.ts",
];
/** Where it does not: tests, scripts and the Node-side loader. */
const NOT_UNDER_LINT = [
  "packages/det/test/extra.test.ts",
  "packages/det/scripts/extra.ts",
  "packages/asset-kit/test/extra.test.ts",
  "packages/asset-kit/src/node/extra.ts",
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

test("the eslint command exits non-zero on the fixtures and zero on the real assets", () => {
  const bin = join(root, "node_modules", "eslint", "bin", "eslint.js");
  const run = (args, input) => spawnSync(process.execPath, [bin, ...args], { cwd: root, input, encoding: "utf8" });

  for (const name of ["bad-random", "bad-sin"]) {
    const bad = run(["--stdin", "--stdin-filename", `assets/lint-fixtures/${name}/gen.ts`], fixture(name));
    assert.equal(bad.status, 1, `${name}: ${bad.stdout}${bad.stderr}`);
    assert.match(bad.stdout, /no-restricted-properties/);
  }

  const good = run(["assets"]);
  assert.equal(good.status, 0, `${good.stdout}${good.stderr}`);
});

test("the example asset and the kits are clean under the lint", async () => {
  const results = await eslint.lintFiles(["assets", "packages/det/src", "packages/asset-kit/src"]);
  assert.ok(results.length >= 10, `only ${results.length} files were linted`);
  assert.ok(results.some((result) => result.filePath.endsWith("assets/examples/blinking-dot/gen.ts")));
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
  "globalThis": "export const x = globalThis.Math.random();",
  "window": "export const x = window.Math.random();",
  "a node: import": 'import { readFileSync } from "node:fs";\nexport const x = readFileSync;',
};

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
      assert.deepEqual(await lintAs(path, code), [], `${JSON.stringify(code)} in ${path}`);
    }
  }
  assert.deepEqual(ALLOWED_MATH, [...ALLOWED_MATH].sort(), "keep ALLOWED_MATH sorted");
});
