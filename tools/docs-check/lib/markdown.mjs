// A small Markdown reader: just enough to find links, headings, code spans and table rows
// with their line numbers. It is not a full parser. What it leaves out is listed in
// docs/docs-check.md (setext headings, indented code blocks).

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const SINGLE_LINE_BLOCK = /^\s*(?:\||#{1,6}[ \t])/;
const LINK =
  /!?\[((?:[^[\]]|\[[^[\]]*\])*)\]\(\s*(<[^>\n]*>|(?:[^\s()]|\([^\s()]*\))*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const REFERENCE = /^ {0,3}\[([^\]^][^\]]*)\]:\s*<?([^\s>]+)>?/;
const HTML_ANCHOR = /<[a-zA-Z][^>]*?\s(?:id|name)\s*=\s*["']([^"']+)["']/g;

/**
 * The anchor GitHub gives a heading: lower case, everything but letters, digits, `_`, `-`
 * and spaces removed, then every space becomes a hyphen.
 * @param {string} text the heading as rendered (no Markdown markup)
 */
export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

/**
 * @param {string} source the heading as written
 * @returns {string} the text a reader sees
 */
export function headingText(source) {
  return source
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`+/g, "")
    .replace(/\*+|~~/g, "")
    .replace(/(?<![\p{L}\p{N}])_+([^_]+)_+(?![\p{L}\p{N}])/gu, "$1")
    .replace(/\\(.)/g, "$1")
    .trim();
}

/** @param {string} text */
function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

/**
 * @typedef {{line: number, level: number, text: string, slug: string}} Heading
 * @typedef {{line: number, target: string}} Link
 * @typedef {{line: number, text: string}} CodeSpan
 * @typedef {{
 *   lines: string[],
 *   prose: string[],
 *   fenced: boolean[],
 *   headings: Heading[],
 *   anchors: Set<string>,
 *   links: Link[],
 *   spans: CodeSpan[],
 * }} MarkdownDoc
 */

/**
 * Line numbers are 1-based. `lines` and `fenced` are indexed from 0 (line - 1).
 * `prose` is `lines` with fenced code, code spans and HTML comments blanked out.
 * @param {string} text
 * @returns {MarkdownDoc}
 */
export function parseMarkdown(text) {
  const lines = text.split(/\r?\n/);

  // 1. Fenced code blocks.
  const fenced = [];
  let fence = null;
  for (const line of lines) {
    const mark = FENCE.exec(line)?.[1] ?? null;
    if (fence === null) {
      fenced.push(mark !== null);
      fence = mark;
    } else {
      fenced.push(true);
      if (mark !== null && mark[0] === fence[0] && mark.length >= fence.length && line.trim() === mark) fence = null;
    }
  }

  // 2. Code spans. A span may wrap over a line break inside a paragraph, but never leaves a
  //    table row or a heading.
  const prose = lines.map((line, index) => (fenced[index] ? "" : line));
  /** @type {CodeSpan[]} */
  const spans = [];
  for (let start = 0; start < lines.length; ) {
    if (fenced[start] || lines[start].trim() === "") {
      start += 1;
      continue;
    }
    let end = start + 1;
    if (!SINGLE_LINE_BLOCK.test(lines[start])) {
      while (end < lines.length && !fenced[end] && lines[end].trim() !== "" && !SINGLE_LINE_BLOCK.test(lines[end])) {
        end += 1;
      }
    }
    let block = lines.slice(start, end).join("\n");
    for (let at = block.indexOf("`"); at !== -1; ) {
      let ticks = 1;
      while (block[at + ticks] === "`") ticks += 1;
      const closing = new RegExp(`(?<!\`)\`{${ticks}}(?!\`)`, "g");
      closing.lastIndex = at + ticks;
      const close = closing.exec(block);
      if (close === null) {
        at = block.indexOf("`", at + ticks);
        continue;
      }
      const stop = close.index + ticks;
      spans.push({
        line: start + 1 + (block.slice(0, at).match(/\n/g)?.length ?? 0),
        text: block.slice(at + ticks, close.index).replace(/\s+/g, " ").trim(),
      });
      block = block.slice(0, at) + blank(block.slice(at, stop)) + block.slice(stop);
      at = block.indexOf("`", stop);
    }
    block.split("\n").forEach((line, offset) => {
      prose[start + offset] = line;
    });
    start = end;
  }

  // 3. HTML comments.
  let inComment = false;
  for (let index = 0; index < prose.length; index += 1) {
    if (fenced[index]) continue;
    let rest = prose[index];
    let out = "";
    while (rest !== "") {
      const at = rest.indexOf(inComment ? "-->" : "<!--");
      if (at === -1) {
        out += inComment ? blank(rest) : rest;
        break;
      }
      const cut = inComment ? at + 3 : at;
      out += inComment ? blank(rest.slice(0, cut)) : rest.slice(0, cut);
      rest = rest.slice(cut);
      inComment = !inComment;
    }
    prose[index] = out;
  }

  // 4. Headings and the anchors they create.
  /** @type {Heading[]} */
  const headings = [];
  /** @type {Set<string>} */
  const anchors = new Set();
  /** @type {Map<string, number>} */
  const seen = new Map();
  lines.forEach((line, index) => {
    if (fenced[index]) return;
    const match = HEADING.exec(line);
    if (match !== null) {
      const shown = headingText(match[2]);
      const base = slugify(shown);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const slug = count === 0 ? base : `${base}-${count}`;
      headings.push({ line: index + 1, level: match[1].length, text: shown, slug });
      anchors.add(slug);
    }
    for (const anchor of prose[index].matchAll(HTML_ANCHOR)) anchors.add(anchor[1]);
  });

  // 5. Links: inline links and images, and reference definitions.
  /** @type {Link[]} */
  const links = [];
  const whole = prose.join("\n");
  let line = 1;
  let counted = 0;
  for (const match of whole.matchAll(LINK)) {
    const at = match.index + match[0].lastIndexOf("](") + 2;
    line += whole.slice(counted, at).match(/\n/g)?.length ?? 0;
    counted = at;
    links.push({ line, target: match[2].replace(/^<|>$/g, "") });
  }
  prose.forEach((text, index) => {
    const match = REFERENCE.exec(text);
    if (match !== null) links.push({ line: index + 1, target: match[2] });
  });
  links.sort((a, b) => a.line - b.line);

  return { lines, prose, fenced, headings, anchors, links, spans };
}

/**
 * @param {string} line
 * @returns {string[] | null} the trimmed cells of a table row, or null for any other line
 */
export function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/** @param {string[]} cells */
export function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}
