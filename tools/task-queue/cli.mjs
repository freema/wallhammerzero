// Which note is next in tasks/? Read-only: it changes no file.
//
//   ./dev node tools/task-queue/cli.mjs            the next note, and what every other note waits for
//   ./dev node tools/task-queue/cli.mjs <note>     the state of one note (#12, a file name or a topic)
//   ./dev node tools/task-queue/cli.mjs --json     the same as JSON
//   ./dev node tools/task-queue/cli.mjs --help     this text
//
// Exit code: 0 when the queue was read (also when nothing can be taken), 2 when the Queue table
// cannot be read or <note> matches no row. The rules are in queue.mjs and tasks/README.md.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyseQueue, formatReport, resolveNote } from "./queue.mjs";

function parseArgs(argv) {
  const options = { root: resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."), help: false, json: false, note: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--root") {
      i += 1;
      if (argv[i] === undefined) throw new Error("--root needs a folder");
      options.root = resolve(argv[i]);
    } else if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
    else if (options.note !== null) throw new Error("one note at a time");
    else options.note = arg;
  }
  return options;
}

/** @returns {{readme: string, notes: Record<string, string>}} */
export function readQueueFiles(root) {
  const tasks = join(root, "tasks");
  const readmeFile = join(tasks, "README.md");
  if (!existsSync(readmeFile)) throw new Error(`${readmeFile} does not exist`);
  const notes = {};
  for (const name of readdirSync(tasks).sort()) {
    if (name.endsWith(".md") && name !== "README.md") notes[name] = readFileSync(join(tasks, name), "utf8");
  }
  return { readme: readFileSync(readmeFile, "utf8"), notes };
}

function main() {
  let options;
  let analysis;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      const source = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
      console.log(source.slice(0, source.indexOf("")).map((line) => line.replace(/^\/\/ ?/, "")).join("\n"));
      return 0;
    }
    analysis = analyseQueue(readQueueFiles(options.root));
  } catch (error) {
    console.error(`task-queue: ${error.message}`);
    return 2;
  }

  let requested;
  if (options.note !== null && analysis.errors.length === 0) {
    const found = resolveNote(analysis, options.note);
    if ("error" in found) {
      console.error(`task-queue: ${found.error}`);
      return 2;
    }
    requested = found.row;
  }

  if (options.json) {
    console.log(JSON.stringify(requested === undefined ? analysis : { ...analysis, requested }, null, 2));
  } else {
    process.stdout.write(formatReport(analysis, { requested }));
  }
  return analysis.errors.length > 0 ? 2 : 0;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
