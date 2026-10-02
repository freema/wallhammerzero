// The docs check: compares the docs with the repo. What each rule covers, and the limits of
// the Markdown reader, are in docs/docs-check.md.

import { checkIds } from "./checks/ids.mjs";
import { checkLinks } from "./checks/links.mjs";
import { checkPaths } from "./checks/paths.mjs";
import { checkQueue } from "./checks/queue.mjs";
import { checkResearchIndex } from "./checks/research-index.mjs";
import { checkScripts } from "./checks/scripts.mjs";
import { parseMarkdown } from "./markdown.mjs";
import { openRepo } from "./repo.mjs";

/** Files the checks read by name. A missing one is a problem, not a skipped check. */
const REQUIRED = ["CLAUDE.md", "README.md", "docs/DECISIONS.md", "tasks/README.md", "research/README.md", "package.json"];

/**
 * @typedef {{file: string, line: number, rule: string, message: string}} Problem
 * @typedef {{
 *   files: number, links: number, paths: number, notes: number, queueRows: number,
 *   reports: number, indexRows: number, decisions: number, idMentions: number, scripts: number,
 * }} Stats
 * @typedef {{
 *   repo: import("./repo.mjs").Repo,
 *   markdown: (path: string) => import("./markdown.mjs").MarkdownDoc | null,
 *   docSet: string[],
 *   codeDocs: string[],
 *   stats: Stats,
 * }} Context
 */

/**
 * @param {string} root absolute path of the checkout
 * @returns {{problems: Problem[], stats: Stats}}
 */
export function checkDocs(root) {
  const repo = openRepo(root);
  /** @type {Map<string, import("./markdown.mjs").MarkdownDoc | null>} */
  const parsed = new Map();
  const markdown = (/** @type {string} */ path) => {
    if (!parsed.has(path)) {
      const text = repo.read(path);
      parsed.set(path, text === null ? null : parseMarkdown(text));
    }
    return parsed.get(path) ?? null;
  };
  const present = (/** @type {string[]} */ files) => files.filter((file) => repo.kind(file) === "file");

  // CLAUDE.md, README.md and docs/** describe the repo as it is. The link and id checks also
  // read tasks/** and research/README.md; the long research reports are not checked.
  const codeDocs = [...present(["CLAUDE.md", "README.md"]), ...repo.markdownFiles("docs")];
  const docSet = [...codeDocs, ...repo.markdownFiles("tasks"), ...present(["research/README.md"])];

  /** @type {Context} */
  const ctx = {
    repo,
    markdown,
    docSet,
    codeDocs,
    stats: {
      files: docSet.length,
      links: 0,
      paths: 0,
      notes: 0,
      queueRows: 0,
      reports: 0,
      indexRows: 0,
      decisions: 0,
      idMentions: 0,
      scripts: 0,
    },
  };

  /** @type {Problem[]} */
  const problems = REQUIRED.filter((file) => repo.kind(file) !== "file").map((file) => ({
    file,
    line: 1,
    rule: "files",
    message: "this file is missing, and the docs check needs it",
  }));
  problems.push(
    ...checkLinks(ctx),
    ...checkPaths(ctx),
    ...checkQueue(ctx),
    ...checkResearchIndex(ctx),
    ...checkIds(ctx),
    ...checkScripts(ctx),
  );
  problems.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0)));
  return { problems, stats: ctx.stats };
}

/** @param {Problem} problem */
export function formatProblem(problem) {
  return `${problem.file}:${problem.line}: ${problem.message} [${problem.rule}]`;
}
