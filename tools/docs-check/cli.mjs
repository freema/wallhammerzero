// The docs check, as a command. Part of the gate through this package's "check" script.
//
//   ./dev npm run check -- @whz/docs-check        the check and its tests
//   ./dev node tools/docs-check/cli.mjs            only the check, on this repo
//   ./dev node tools/docs-check/cli.mjs --root <folder>
//
// Each problem is one line: <file>:<line>: <message> [<rule>]. Exit 0: no problems; 1: problems;
// 2: a usage error. The rules are in docs/docs-check.md.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDocs, formatProblem } from "./lib/index.mjs";

function main() {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--root" && args[i + 1] !== undefined) {
      i += 1;
      root = resolve(args[i]);
    } else {
      console.error(`docs-check: unknown argument ${args[i]} (usage: node cli.mjs [--root <folder>])`);
      return 2;
    }
  }
  if (!existsSync(join(root, "package.json"))) {
    console.error(`docs-check: ${root} is not a repo root (no package.json)`);
    return 2;
  }

  const { problems, stats } = checkDocs(root);
  for (const problem of problems) console.log(formatProblem(problem));
  const checked =
    `${stats.files} Markdown files: ${stats.links} relative links, ${stats.paths} backticked paths, ` +
    `${stats.notes} task notes and ${stats.queueRows} queue rows, ${stats.reports} research reports and scans, ` +
    `${stats.decisions} decisions and ${stats.idMentions} id mentions, ${stats.scripts} npm script mentions`;
  if (problems.length > 0) {
    console.log(`\ndocs-check: FAILED, ${problems.length} problem${problems.length === 1 ? "" : "s"} (${checked})`);
    console.log("docs-check: if a doc and the code disagree, the code wins: fix the doc (docs/docs-check.md)");
    return 1;
  }
  console.log(`docs-check: ok (${checked})`);
  return 0;
}

process.exitCode = main();
