// Decision ids (D<n>) in docs/DECISIONS.md are unique and ascending, and every D<n> and
// OC-... mentioned in the docs exists: a decision is a row of the DECISIONS table, an owner
// call is named in docs/DECISIONS.md (answered calls) or in the owner-calls note (open ones).
// Ids inside code (fences and code spans) are not read, so `D50` in backticks is not an id.

import { tableCells } from "../markdown.mjs";
import { OWNER_CALLS, taskNotes } from "./queue.mjs";

const DECISIONS = "docs/DECISIONS.md";
// "OC-D2" is an owner call, not decision D2: a D id never follows a letter, digit, `-`, `_` or `#`.
const DECISION = /(?<![\p{L}\p{N}_#-])D(\d+)(?![\p{L}\p{N}_])/gu;
const OWNER_CALL = /(?<![\p{L}\p{N}_-])OC-[A-Z]+\d+(?:-[a-z][a-z0-9]*)*(?![\p{L}\p{N}_])/gu;

/**
 * @param {import("../index.mjs").Context} ctx
 * @returns {import("../index.mjs").Problem[]}
 */
export function checkIds(ctx) {
  /** @type {import("../index.mjs").Problem[]} */
  const problems = [];
  const decisions = ctx.markdown(DECISIONS);
  if (decisions === null) return problems; // reported as a missing file

  // Definitions: the first cell of a table row in docs/DECISIONS.md.
  /** @type {Map<number, number>} id number -> line */
  const defined = new Map();
  let highest = null;
  decisions.lines.forEach((line, index) => {
    if (decisions.fenced[index]) return;
    const id = /^D(\d+)$/.exec(tableCells(line)?.[0] ?? "");
    if (id === null) return;
    const number = Number(id[1]);
    if (defined.has(number)) {
      problems.push({ file: DECISIONS, line: index + 1, rule: "ids", message: `D${number} is defined twice (first on line ${defined.get(number)})` });
      return;
    }
    if (highest !== null && number < highest) {
      problems.push({ file: DECISIONS, line: index + 1, rule: "ids", message: `D${number} comes after D${highest}: decision ids must ascend` });
    }
    defined.set(number, index + 1);
    highest = Math.max(highest ?? number, number);
  });
  ctx.stats.decisions = defined.size;

  /** @type {Set<string>} */
  const ownerCalls = new Set();
  for (const file of [DECISIONS, ...taskNotes(ctx).filter((note) => OWNER_CALLS.test(note))]) {
    for (const line of ctx.markdown(file)?.prose ?? []) {
      for (const match of line.matchAll(OWNER_CALL)) ownerCalls.add(match[0]);
    }
  }

  for (const file of ctx.docSet) {
    const doc = ctx.markdown(file);
    if (doc === null) continue;
    doc.prose.forEach((line, index) => {
      for (const match of line.matchAll(DECISION)) {
        ctx.stats.idMentions += 1;
        if (!defined.has(Number(match[1]))) {
          problems.push({ file, line: index + 1, rule: "ids", message: `unknown decision id ${match[0]}: it is not a row of ${DECISIONS}` });
        }
      }
      for (const match of line.matchAll(OWNER_CALL)) {
        ctx.stats.idMentions += 1;
        if (!ownerCalls.has(match[0])) {
          problems.push({ file, line: index + 1, rule: "ids", message: `unknown owner call ${match[0]}: it is neither in ${DECISIONS} nor in the owner-calls note` });
        }
      }
    });
  }
  return problems;
}
