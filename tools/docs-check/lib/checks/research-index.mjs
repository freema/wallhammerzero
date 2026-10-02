// Every report in research/*.md and every folder in research/scans/ has a row in
// research/README.md: a table row with a link to the report, or to the folder or a file in it.
// (A row whose report is gone is a broken link, which the link check reports.)

import { posix } from "node:path";
import { tableCells } from "../markdown.mjs";
import { normalize } from "../repo.mjs";

const README = "research/README.md";

/**
 * @param {import("../index.mjs").Context} ctx
 * @returns {import("../index.mjs").Problem[]}
 */
export function checkResearchIndex(ctx) {
  const problems = [];
  const doc = ctx.markdown(README);
  if (doc === null) return problems; // reported as a missing file

  /** @type {Set<string>} */
  const indexed = new Set();
  let lastRow = 1;
  for (const link of doc.links) {
    if (tableCells(doc.lines[link.line - 1]) === null) continue;
    const target = normalize(posix.join("research", link.target.replace(/[#?].*$/, "")));
    if (target === null) continue;
    indexed.add(target);
    lastRow = Math.max(lastRow, link.line);
  }
  ctx.stats.indexRows = new Set(doc.links.filter((link) => tableCells(doc.lines[link.line - 1]) !== null).map((link) => link.line)).size;

  const reports = ctx.repo
    .tracked("research")
    .filter((name) => name.endsWith(".md") && name !== "README.md" && ctx.repo.kind(`research/${name}`) === "file")
    .map((name) => `research/${name}`);
  const scans = ctx.repo
    .tracked("research/scans")
    .filter((name) => ctx.repo.kind(`research/scans/${name}`) === "dir")
    .map((name) => `research/scans/${name}`);

  for (const report of reports) {
    ctx.stats.reports += 1;
    if (!indexed.has(report)) {
      problems.push({ file: README, line: lastRow, rule: "research-index", message: `${report} has no row in the index` });
    }
  }
  for (const scan of scans) {
    ctx.stats.reports += 1;
    if (![...indexed].some((target) => target === scan || target.startsWith(`${scan}/`))) {
      problems.push({ file: README, line: lastRow, rule: "research-index", message: `${scan}/ has no row in the index` });
    }
  }
  return problems;
}
