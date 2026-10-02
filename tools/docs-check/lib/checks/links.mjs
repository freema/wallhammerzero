// Every relative Markdown link resolves: the file or folder exists (with the exact case),
// and a `#anchor` into a Markdown file names one of its headings.

import { posix } from "node:path";
import { normalize } from "../repo.mjs";

const EXTERNAL = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;

/**
 * @param {import("../index.mjs").Context} ctx
 * @returns {import("../index.mjs").Problem[]}
 */
export function checkLinks(ctx) {
  const problems = [];
  for (const file of ctx.docSet) {
    const doc = ctx.markdown(file);
    if (doc === null) continue;
    for (const link of doc.links) {
      if (EXTERNAL.test(link.target)) continue;
      ctx.stats.links += 1;
      const message = brokenLink(ctx, file, link.target);
      if (message !== null) problems.push({ file, line: link.line, rule: "links", message });
    }
  }
  return problems;
}

/**
 * @param {import("../index.mjs").Context} ctx
 * @param {string} file the file the link is in
 * @param {string} target the link target as written
 * @returns {string | null} what is wrong with the link, or null
 */
function brokenLink(ctx, file, target) {
  const hash = target.indexOf("#");
  let path = (hash === -1 ? target : target.slice(0, hash)).replace(/\?.*$/, "");
  let fragment = hash === -1 ? "" : target.slice(hash + 1);
  try {
    path = decodeURIComponent(path);
    fragment = decodeURIComponent(fragment);
  } catch {
    return `broken link: "${target}" is not a valid URL`;
  }

  let resolved = file;
  if (path !== "") {
    const joined = path.startsWith("/") ? normalize(path.slice(1)) : normalize(posix.join(posix.dirname(file), path));
    if (joined === null) return `broken link: "${target}" points outside the repo`;
    resolved = joined;
  }
  const kind = ctx.repo.kind(resolved);
  if (kind === null) {
    const other = ctx.repo.differsByCase(resolved);
    const hint = other === null ? "" : ` (the case differs: ${other} exists)`;
    return `broken link: "${target}" names ${resolved || "."}, which does not exist${hint}`;
  }
  if (ctx.repo.isIgnored(resolved)) {
    return `broken link: "${target}" names ${resolved}, which is gitignored and so not in the repo`;
  }
  if (fragment === "" || kind !== "file" || !resolved.toLowerCase().endsWith(".md")) return null;
  const anchors = ctx.markdown(resolved)?.anchors ?? new Set();
  if (anchors.has(fragment)) return null;
  return `broken anchor: "#${fragment}" is not a heading of ${resolved}`;
}
