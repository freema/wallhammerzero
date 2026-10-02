// Every backticked repo path exists. Task notes are not checked here, because they name
// files that do not exist yet.
//
// What counts as a repo path is a rule of thumb, kept strict so that it never guesses: a
// word inside a code span that contains a slash and whose first segment is a top-level
// folder of the repo. Everything else (a bare file name, a path in another repo, a command
// name) is left alone. docs/docs-check.md has the full rule.

import { normalize } from "../repo.mjs";

// A word with one of these is a pattern or a placeholder for the reader, not a path.
const NOT_A_PATH = /[<>{}$|…]|\.\.\.|:\/\//;
// Where the checkout is mounted in the dev container (compose.yaml).
const CONTAINER_ROOT = "/work/";

/**
 * @param {string} word one whitespace-separated word of a code span
 * @returns {string | null} the path it names, cleaned, or null when it is not path-like
 */
export function pathCandidate(word) {
  let text = word.replace(/^["'([]+/, "").replace(/["')\],;.:]+$/, "");
  text = text.slice(text.lastIndexOf("=") + 1); // --flag=path, VAR=path
  text = text.replace(/#.*$/, "").replace(/:\d+(?:-\d+)?$/, ""); // file.md#anchor, file.mjs:12-20
  if (text.startsWith(CONTAINER_ROOT)) text = text.slice(CONTAINER_ROOT.length);
  text = text.replace(/^(?:\.\/)+/, "");
  if (text === "" || NOT_A_PATH.test(word) || /^[/~@-]/.test(text) || !text.includes("/")) return null;
  return text;
}

/**
 * @param {import("../index.mjs").Context} ctx
 * @returns {import("../index.mjs").Problem[]}
 */
export function checkPaths(ctx) {
  const problems = [];
  const topFolders = new Set(ctx.repo.tracked("").filter((name) => ctx.repo.kind(name) === "dir"));
  for (const file of ctx.codeDocs) {
    const doc = ctx.markdown(file);
    if (doc === null) continue;
    for (const span of doc.spans) {
      for (const word of span.text.split(/\s+/)) {
        const path = pathCandidate(word);
        if (path === null || !topFolders.has(path.split("/")[0])) continue;
        const clean = normalize(path);
        if (clean === null || ctx.repo.isIgnored(clean)) continue; // a build output
        ctx.stats.paths += 1;
        const isGlob = /[*?]/.test(clean);
        const wantsFolder = path.endsWith("/");
        const kind = isGlob ? null : ctx.repo.kind(clean);
        if (isGlob ? ctx.repo.globMatches(clean) : kind !== null && (!wantsFolder || kind === "dir")) continue;
        let message = `\`${path}\` does not exist`;
        if (isGlob) message = `\`${path}\` matches nothing in the repo`;
        else if (kind === "file") message = `\`${path}\` is a file, not a folder`;
        else {
          const other = ctx.repo.differsByCase(clean);
          if (other !== null) message += ` (the case differs: ${other} exists)`;
        }
        problems.push({ file, line: span.line, rule: "paths", message });
      }
    }
  }
  return problems;
}
