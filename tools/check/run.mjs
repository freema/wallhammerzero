// The gate: `./dev npm run check` runs every check in the repo and exits non-zero if any fails.
//
//   npm run check                        all checks
//   npm run check -- <id or folder>...   only these (e.g. @whz/det or packages/det)
//   npm run check -- --list              print the checks, run nothing
//   npm run check -- --bail              stop at the first failure
//
// What counts as a check is decided in discover.mjs.

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { discoverChecks } from "./discover.mjs";

function parseArgs(argv) {
  const options = { root: process.cwd(), list: false, bail: false, filters: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") options.list = true;
    else if (arg === "--bail") options.bail = true;
    else if (arg === "--root") {
      i += 1;
      if (argv[i] === undefined) throw new Error("--root needs a folder");
      options.root = resolve(argv[i]);
    } else if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
    else options.filters.push(arg.replace(/^\.\//, "").replace(/\/$/, ""));
  }
  return options;
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function main() {
  let options;
  let discovery;
  try {
    options = parseArgs(process.argv.slice(2));
    discovery = discoverChecks(options.root);
  } catch (error) {
    console.error(`check: ${error.message}`);
    return 2;
  }
  const { problems } = discovery;
  let { checks } = discovery;

  if (options.filters.length > 0) {
    const unknown = options.filters.filter(
      (filter) => !checks.some((check) => check.id === filter || check.dir === filter),
    );
    if (unknown.length > 0) {
      console.error(`check: no such check: ${unknown.join(", ")}`);
      console.error(`check: known checks: ${checks.map((check) => check.id).join(", ") || "(none)"}`);
      return 2;
    }
    checks = checks.filter((check) => options.filters.includes(check.id) || options.filters.includes(check.dir));
  }

  if (options.list) {
    for (const check of checks) console.log(`${check.id}\t${check.dir}\tnpm run ${check.script}`);
    for (const problem of problems) console.error(`check: ${problem}`);
    return problems.length > 0 ? 1 : 0;
  }

  if (checks.length === 0 && problems.length === 0) {
    console.error("check: no checks found, and a gate that checks nothing must not pass");
    return 1;
  }

  const results = [];
  for (const check of checks) {
    console.log(`\n=== check ${check.id} (${check.dir}: npm run ${check.script}) ===`);
    const started = performance.now();
    const run = spawnSync("npm", ["run", check.script], {
      cwd: join(options.root, check.dir),
      stdio: "inherit",
    });
    const ms = performance.now() - started;
    let failure = null;
    if (run.error) failure = run.error.message;
    else if (run.signal) failure = `killed by ${run.signal}`;
    else if (run.status !== 0) failure = `exit ${run.status}`;
    results.push({ check, ms, failure });
    if (failure !== null && options.bail) break;
  }

  const failed = results.filter((result) => result.failure !== null);
  const skipped = checks.length - results.length;
  console.log("\n=== check summary ===");
  for (const { check, ms, failure } of results) {
    console.log(`${failure === null ? "ok  " : "FAIL"}  ${check.id}  ${seconds(ms)}${failure === null ? "" : `  (${failure})`}`);
  }
  if (skipped > 0) console.log(`not run after the first failure (--bail): ${skipped}`);
  for (const problem of problems) console.log(`FAIL  ${problem}`);

  if (failed.length > 0 || problems.length > 0) {
    console.log(`\ncheck: FAILED (${failed.length} of ${results.length} run checks failed, ${problems.length} setup problems)`);
    return 1;
  }
  console.log(`\ncheck: all ${results.length} checks passed`);
  return 0;
}

process.exitCode = main();
