// The work queue is consistent: every note in tasks/ has exactly one row in the Queue table
// of tasks/README.md, every row has a note, the `queue:end` marker closes the table, and every
// note follows the note format. The format is not repeated here: the header labels and the
// sections are read from the template under "## Note format" in tasks/README.md.

import { posix } from "node:path";
import { isSeparatorRow, tableCells } from "../markdown.mjs";
import { normalize } from "../repo.mjs";

const README = "tasks/README.md";
const NOTE_NAME = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const TITLE = /^# \S.* \(\d{4}-\d{2}-\d{2}\)$/;
// The marker is a line of its own; a sentence that only mentions it is not the marker.
const MARKER = /^\s*<!--\s*queue:end\b/;
/** The owner-calls note lists calls, not a task: it needs the header line and the first section only. */
export const OWNER_CALLS = /-owner-calls\.md$/;

/**
 * @param {import("../index.mjs").Context} ctx
 * @returns {string[]} the task notes: the Markdown files directly in tasks/, without the README
 */
export function taskNotes(ctx) {
  return ctx.repo
    .tracked("tasks")
    .filter((name) => name.endsWith(".md") && name !== "README.md" && ctx.repo.kind(`tasks/${name}`) === "file")
    .map((name) => `tasks/${name}`);
}

/**
 * @param {import("../markdown.mjs").MarkdownDoc} doc tasks/README.md
 * @returns {{labels: string[], sections: string[]} | null} the note format, from its template
 */
function noteFormat(doc) {
  const heading = doc.headings.find((entry) => entry.level === 2 && entry.text === "Note format");
  if (heading === undefined) return null;
  const next = doc.headings.find((entry) => entry.line > heading.line && entry.level <= 2);
  const template = [];
  for (let index = heading.line; index < (next?.line ?? doc.lines.length + 1) - 1; index += 1) {
    if (doc.fenced[index]) template.push(doc.lines[index]);
    else if (template.length > 0) break;
  }
  const header = template.find((line) => line.startsWith("**")) ?? "";
  const labels = [...header.matchAll(/\*\*([^*:]+):\*\*/g)].map((match) => match[1]);
  const sections = template.filter((line) => line.startsWith("## ")).map((line) => line.slice(3).trim());
  return labels.length === 0 || sections.length === 0 ? null : { labels, sections };
}

/**
 * @param {import("../index.mjs").Context} ctx
 * @returns {import("../index.mjs").Problem[]}
 */
export function checkQueue(ctx) {
  /** @type {import("../index.mjs").Problem[]} */
  const problems = [];
  const readme = ctx.markdown(README);
  if (readme === null) return problems; // reported as a missing file
  const fail = (/** @type {string} */ file, /** @type {number} */ line, /** @type {string} */ message) =>
    problems.push({ file, line, rule: "queue", message });

  // The Queue table and its end marker.
  const heading = readme.headings.find((entry) => entry.level === 2 && entry.text === "Queue");
  const markers = readme.lines.flatMap((line, index) => (!readme.fenced[index] && MARKER.test(line) ? [index + 1] : []));
  if (heading === undefined) fail(README, 1, 'there is no "## Queue" section');
  if (markers.length === 0) {
    fail(README, heading?.line ?? 1, "the `<!-- queue:end ... -->` marker is missing (the studio inserts new rows above it)");
  }
  for (const line of markers.slice(1)) fail(README, line, `a second queue:end marker (the first is on line ${markers[0]})`);
  const start = heading?.line ?? 0;
  const marker = markers.find((line) => line > start);
  if (marker === undefined && markers.length > 0) fail(README, markers[0], 'the queue:end marker is above the "## Queue" section');

  /** @type {{line: number, cells: string[]}[]} */
  const table = [];
  if (heading !== undefined) {
    for (let line = start + 1; line < (marker ?? readme.lines.length + 1); line += 1) {
      const cells = tableCells(readme.lines[line - 1]);
      if (cells !== null) table.push({ line, cells });
      else if (table.length > 0 && marker === undefined) break; // no marker: the first table is the queue
    }
  }
  const header = table[0];
  const rows = table.slice(1).filter((row) => !isSeparatorRow(row.cells));
  const numberColumn = header?.cells.indexOf("#") ?? -1;
  const noteColumn = header?.cells.findIndex((cell) => cell.toLowerCase() === "note") ?? -1;
  if (heading !== undefined && (numberColumn === -1 || noteColumn === -1)) {
    fail(README, header?.line ?? heading.line, 'the Queue table needs the columns "#" and "Note"');
  }
  if (marker !== undefined && table.length > 0 && table[table.length - 1].line !== marker - 1) {
    fail(README, marker, "the queue:end marker must be on the line right after the last row of the Queue table");
  }

  // Rows: each links to one note in tasks/, and no number or note appears twice.
  const notes = taskNotes(ctx);
  /** @type {Map<string, number>} */
  const rowOfNote = new Map();
  /** @type {Map<string, number>} */
  const rowOfNumber = new Map();
  if (numberColumn !== -1 && noteColumn !== -1) {
    for (const row of rows) {
      ctx.stats.queueRows += 1;
      const number = row.cells[numberColumn] ?? "";
      if (!/^\d+$/.test(number)) fail(README, row.line, `the "#" of a queue row must be a number, not "${number}"`);
      else if (rowOfNumber.has(number)) {
        fail(README, row.line, `queue row #${number} appears twice (first on line ${rowOfNumber.get(number)})`);
      } else rowOfNumber.set(number, row.line);

      const target = /\[[^\]]*\]\(([^)\s]+)\)/.exec(row.cells[noteColumn] ?? "")?.[1];
      const note = target === undefined ? null : normalize(posix.join("tasks", target.replace(/[#?].*$/, "")));
      if (note === null || posix.dirname(note) !== "tasks" || !note.endsWith(".md") || note === README) {
        fail(README, row.line, "the Note cell of a queue row must link to a note in tasks/");
      } else if (!notes.includes(note)) {
        fail(README, row.line, `queue row without a note: ${note} does not exist (a finished note takes its row with it)`);
      } else if (rowOfNote.has(note)) {
        fail(README, row.line, `${note} has a second queue row (the first is on line ${rowOfNote.get(note)})`);
      } else rowOfNote.set(note, row.line);
    }
  }

  // Notes: each has a row and follows the note format.
  const format = noteFormat(readme);
  if (format === null) {
    fail(README, 1, 'the "## Note format" section has no fenced template with the header line and the sections');
  }
  const missingRowLine = marker ?? table[table.length - 1]?.line ?? heading?.line ?? 1;
  for (const note of notes) {
    ctx.stats.notes += 1;
    if (heading !== undefined && noteColumn !== -1 && !rowOfNote.has(note)) {
      fail(README, missingRowLine, `note without a queue row: ${note} is not in the Queue table`);
    }
    if (!NOTE_NAME.test(posix.basename(note))) fail(note, 1, "a note is named YYYY-MM-DD-topic.md (lower case, hyphens)");
    const doc = ctx.markdown(note);
    if (doc === null || format === null) continue;
    if (!TITLE.test(doc.lines[0])) fail(note, 1, "the first line of a note is `# <TITLE> (YYYY-MM-DD)`");

    const sections = doc.headings.filter((entry) => entry.level === 2);
    const firstSection = sections[0]?.line ?? doc.lines.length + 1;
    const first = `**${format.labels[0]}:**`;
    const headerIndex = doc.lines.findIndex((line, index) => index < firstSection - 1 && !doc.fenced[index] && line.startsWith(first));
    const shape = format.labels.map((label) => `**${label}:** …`).join(" · ");
    if (headerIndex === -1) fail(note, 1, `the header line is missing: ${shape}`);
    else {
      const line = doc.lines[headerIndex];
      let from = 0;
      for (const [index, label] of format.labels.entries()) {
        const mark = `**${label}:**`;
        const at = line.indexOf(mark, from);
        if (at === -1) {
          fail(note, headerIndex + 1, `the header line has no ${mark} (expected ${shape})`);
          continue;
        }
        from = at + mark.length;
        const next = index + 1 < format.labels.length ? line.indexOf(`**${format.labels[index + 1]}:**`, from) : -1;
        const value = line.slice(from, next === -1 ? line.length : next).replace(/[\s·]+/g, "");
        if (value === "") fail(note, headerIndex + 1, `${mark} in the header line has no value`);
      }
    }

    const required = OWNER_CALLS.test(note) ? format.sections.slice(0, 1) : format.sections;
    let previous = null;
    for (const name of required) {
      const found = sections.filter((entry) => entry.text === name);
      if (found.length === 0) {
        fail(note, 1, `the section "## ${name}" is missing`);
        continue;
      }
      if (found.length > 1) fail(note, found[1].line, `the section "## ${name}" appears twice`);
      if (previous !== null && found[0].line < previous.line) {
        fail(note, found[0].line, `the section "## ${name}" must come after "## ${previous.text}"`);
      }
      previous = found[0];
    }
  }
  return problems;
}
