// Reads the work queue: the Queue table in tasks/README.md plus the header line of every note.
// It answers one question for the implement-tasks skill: which note is next, and for every
// other note, what it waits for. It only reads; the session edits the table and the notes.
//
// Rules (tasks/README.md, "Queue"): the table order is the priority. A note is taken when its
// gate is open and its dependencies are done. A dependency is done when its note is gone: a
// finished note is deleted and its row removed in the commit that did the work.
//
// Row numbers are never given twice. A finished note takes its row with it, so the table alone
// forgets the highest number once that note is closed. The line under the table remembers it:
//   <!-- queue:last-number #35 (...) -->
// A new row takes NEW ROW NUMBER (one more than every number the README mentions, this line
// included) and writes its number into that line. The docs check (the gate) fails when a row is
// above the line or the line is gone.

export const QUEUE_END_MARKER = "<!-- queue:end";
export const QUEUE_LAST_NUMBER_MARKER = "<!-- queue:last-number";
const LAST_NUMBER_LINE = /^\s*<!--\s*queue:last-number\b(?:\s+#(\d+)\b)?/;

const HEADER_CELLS = ["#", "note", "gate", "depends on"];
const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

/**
 * @typedef {{number: number, title: string, file: string, gate: string, dependsOn: string, line: number}} QueueRow
 * @typedef {{rows: QueueRow[], errors: string[], warnings: string[], endMarkerLine: number | null, lastNumber: number | null, nextNumber: number}} ParsedQueue
 */

/** "2026-10-02-sim-core.md" or "tasks/2026-10-02-sim-core.md" → "sim-core" */
export function slugOf(file) {
  return file
    .replace(/^(\.\/)?tasks\//, "")
    .replace(/\.md$/, "")
    .replace(DATE_PREFIX, "");
}

function splitCells(line) {
  const cells = [];
  let cell = "";
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "\\" && body[i + 1] === "|") {
      cell += "|";
      i += 1;
    } else if (body[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else cell += body[i];
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * Parses the Queue table of tasks/README.md.
 * `errors` mean the table cannot be trusted and nothing must be selected from it.
 * @param {string} readme
 * @returns {ParsedQueue}
 */
export function parseQueue(readme) {
  const lines = readme.split(/\r?\n/);
  const errors = [];
  const warnings = [];
  /** @type {QueueRow[]} */
  const rows = [];
  let endMarkerLine = null;

  // The highest number ever given, from the queue:last-number line (see the top of this file).
  /** @type {number | null} */
  let lastNumber = null;
  let lastNumberLines = 0;
  for (const line of lines) {
    const match = LAST_NUMBER_LINE.exec(line);
    if (match === null) continue;
    lastNumberLines += 1;
    if (match[1] !== undefined) lastNumber = Math.max(lastNumber ?? -1, Number(match[1]));
  }

  const mentioned = [...readme.matchAll(/#(\d+)\b/g)].map((match) => Number(match[1]));
  const result = () => {
    const highestRow = Math.max(-1, ...rows.map((row) => row.number));
    const nextNumber = Math.max(-1, lastNumber ?? -1, ...mentioned, highestRow) + 1;
    if (lastNumberLines === 0) {
      warnings.push(
        `the "${QUEUE_LAST_NUMBER_MARKER} #${nextNumber - 1} ... -->" line is missing under the queue:end marker: without it the number of a closed note can be given again`,
      );
    } else if (lastNumber === null) {
      warnings.push(`the queue:last-number line has no row number: write it as "${QUEUE_LAST_NUMBER_MARKER} #${nextNumber - 1} ... -->"`);
    } else if (highestRow > lastNumber) {
      warnings.push(`row #${highestRow} is above the queue:last-number line (#${lastNumber}): set it to #${highestRow}, so the number is never given again`);
    }
    return { rows, errors, warnings, endMarkerLine, lastNumber, nextNumber };
  };

  const heading = lines.findIndex((line) => /^##\s+Queue\s*$/.test(line));
  if (heading < 0) {
    errors.push('tasks/README.md has no "## Queue" heading');
    return result();
  }
  let header = -1;
  for (let i = heading + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    if (lines[i].trimStart().startsWith("|")) {
      header = i;
      break;
    }
  }
  if (header < 0) {
    errors.push('no table under "## Queue" in tasks/README.md');
    return result();
  }
  const headerCells = splitCells(lines[header]).map((cell) => cell.toLowerCase());
  if (headerCells.length !== HEADER_CELLS.length || headerCells.some((cell, i) => cell !== HEADER_CELLS[i])) {
    errors.push(`README line ${header + 1}: the Queue table header must be "| # | Note | Gate | Depends on |"`);
    return result();
  }
  if (!/^\|[\s:|-]+\|?\s*$/.test(lines[header + 1] ?? "")) {
    errors.push(`README line ${header + 2}: expected the |---| line of the Queue table`);
    return result();
  }

  const numbers = new Map();
  const files = new Map();
  let i = header + 2;
  for (; i < lines.length && lines[i].trimStart().startsWith("|"); i += 1) {
    const at = `README line ${i + 1}`;
    const cells = splitCells(lines[i]);
    if (cells.length !== 4) {
      errors.push(`${at}: a queue row has 4 cells (# | Note | Gate | Depends on), this one has ${cells.length}`);
      continue;
    }
    const [numberCell, noteCell, gate, dependsOn] = cells;
    if (!/^\d+$/.test(numberCell)) {
      errors.push(`${at}: the # cell must be a number, got "${numberCell}"`);
      continue;
    }
    const link = /^\[(.+)\]\((?:\.\/)?([^)\s/]+\.md)\)$/.exec(noteCell);
    if (link === null) {
      errors.push(`${at}: the Note cell must be a link to a note in tasks/, like [Title](2026-10-02-topic.md)`);
      continue;
    }
    const number = Number(numberCell);
    const file = link[2];
    if (numbers.has(number)) {
      errors.push(`${at}: row number ${number} is already used on line ${numbers.get(number)}`);
      continue;
    }
    if (files.has(file)) {
      errors.push(`${at}: ${file} already has a row on line ${files.get(file)}`);
      continue;
    }
    if (gate === "") {
      errors.push(`${at}: the Gate cell is empty (write "none" or the owner call)`);
      continue;
    }
    numbers.set(number, i + 1);
    files.set(file, i + 1);
    rows.push({ number, title: link[1], file, gate, dependsOn, line: i + 1 });
  }

  for (let j = i; j < lines.length; j += 1) {
    if (lines[j].trim() === "") continue;
    if (lines[j].includes(QUEUE_END_MARKER)) endMarkerLine = j + 1;
    break;
  }
  if (endMarkerLine === null) {
    warnings.push(`the "${QUEUE_END_MARKER} ... -->" marker is missing right after the Queue table: new rows go above it`);
  }
  return result();
}

/**
 * Reads the header line of a note: `**GATE:** x · **Priority:** P1 · **Size:** M · **Depends on:** y`.
 * @param {string} text
 * @returns {{gate: string | null, dependsOn: string | null, remaining: boolean}}
 */
export function parseNoteHeader(text) {
  const head = text.split(/\r?\n/).find((line) => /^\*\*GATE:\*\*/i.test(line.trim())) ?? "";
  const field = (name) => {
    const match = new RegExp(`\\*\\*${name}:\\*\\*\\s*(.*?)\\s*(?:·\\s*\\*\\*|$)`, "i").exec(head);
    return match === null || match[1] === "" ? null : match[1];
  };
  return {
    gate: field("GATE"),
    dependsOn: field("Depends on"),
    remaining: /^##\s+REMAINING\b/m.test(text),
  };
}

/** "none", "none (iOS build: OC-B4)" are open; everything else names what the note waits for. */
export function parseGate(text) {
  const match = /^none\b\s*(.*)$/i.exec(text.trim());
  if (match === null) return { open: false, partial: null };
  const rest = match[1].replace(/^\((.*)\)$/, "$1").trim();
  return { open: true, partial: rest === "" ? null : rest };
}

/** Splits "a (x, y), #3" on the commas outside parentheses and drops the parentheses. */
function dependencyTokens(text) {
  const tokens = [];
  let depth = 0;
  let token = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      tokens.push(token);
      token = "";
    } else if (depth === 0) token += char;
  }
  tokens.push(token);
  return tokens.map((raw) => raw.trim()).filter((raw) => raw !== "" && !/^(none|n\/a|-|—)$/i.test(raw));
}

/**
 * @param {string} text a "Depends on" value from the table or from a note header
 * @returns {{refs: ({number: number} | {slug: string})[], unreadable: string[]}}
 */
export function parseDependsOn(text) {
  const refs = [];
  const unreadable = [];
  for (const token of dependencyTokens(text)) {
    const number = /^#(\d+)$/.exec(token);
    const clean = token.replace(/^`(.*)`$/, "$1");
    if (number !== null) refs.push({ number: Number(number[1]) });
    else if (/^(tasks\/)?[a-z0-9][a-z0-9-]*(\.md)?$/.test(clean)) refs.push({ slug: slugOf(clean) });
    else unreadable.push(token);
  }
  return { refs, unreadable };
}

/**
 * The state of every row.
 *   open         gate open, dependencies done: can be taken now
 *   gated        waits for the owner (the gate names the call)
 *   waiting      gate open, but a dependency is not done yet
 *   owner-calls  the owner-calls note: a list of questions, never executed
 *   missing      the row names a note that does not exist
 *
 * @param {{readme: string, notes: Record<string, string>}} input notes: file name in tasks/ → text
 */
export function analyseQueue({ readme, notes }) {
  const parsed = parseQueue(readme);
  const warnings = [...parsed.warnings];
  const byNumber = new Map(parsed.rows.map((row) => [row.number, row]));
  const bySlug = new Map(parsed.rows.map((row) => [slugOf(row.file), row]));
  const noteFiles = Object.keys(notes).filter((file) => file !== "README.md");
  const noteSlugs = new Map(noteFiles.map((file) => [slugOf(file), file]));

  const rows = parsed.rows.map((row) => {
    const text = notes[row.file];
    const header = text === undefined ? { gate: null, dependsOn: null, remaining: false } : parseNoteHeader(text);
    const tableGate = parseGate(row.gate);
    const noteGate = header.gate === null ? null : parseGate(header.gate);
    let gateReason = null;
    if (!tableGate.open) gateReason = row.gate;
    else if (noteGate !== null && !noteGate.open) gateReason = header.gate;
    if (text !== undefined && noteGate !== null && noteGate.open !== tableGate.open) {
      warnings.push(
        `#${row.number} ${row.file}: the Gate cell says "${row.gate}" and the note says "${header.gate}"; treated as gated until they agree`,
      );
    }

    /** @type {Map<string, {ref: string, number: number | null, file: string | null}>} */
    const needs = new Map();
    let unreadable = [];
    for (const source of [row.dependsOn, header.dependsOn ?? ""]) {
      const dependsOn = parseDependsOn(source);
      unreadable = unreadable.concat(dependsOn.unreadable);
      for (const ref of dependsOn.refs) {
        const target = "number" in ref ? byNumber.get(ref.number) : bySlug.get(ref.slug);
        if (target !== undefined) {
          if (target.number !== row.number) {
            needs.set(target.file, { ref: `#${target.number}`, number: target.number, file: target.file });
          }
        } else if ("slug" in ref && noteSlugs.has(ref.slug)) {
          // a note without a row still means the work is not done
          const file = noteSlugs.get(ref.slug);
          needs.set(file, { ref: ref.slug, number: null, file });
        }
      }
    }
    for (const token of unreadable) {
      warnings.push(`#${row.number} ${row.file}: cannot read the dependency "${token}" (use #<row> or a note name); the row waits until it is fixed`);
    }

    const isOwnerCalls = /-owner-calls\.md$/.test(row.file);
    let state = "open";
    if (isOwnerCalls) state = "owner-calls";
    else if (text === undefined) state = "missing";
    else if (gateReason !== null) state = "gated";
    else if (needs.size > 0 || unreadable.length > 0) state = "waiting";
    if (state === "missing") warnings.push(`#${row.number}: the row names ${row.file}, which does not exist in tasks/`);

    return {
      ...row,
      path: `tasks/${row.file}`,
      state,
      gateReason,
      partialGate: tableGate.partial ?? noteGate?.partial ?? null,
      needs: [...needs.values()],
      unreadableDependencies: unreadable,
      remaining: header.remaining,
      /** owner calls that block this row, its own gate and the gates of what it depends on */
      blockedBy: [],
      /** faults in the queue itself that keep this row from ever running */
      stuckOn: [],
    };
  });

  // What blocks a row in the end: follow the dependencies down to gated rows and to faults.
  const byFile = new Map(rows.map((row) => [row.file, row]));
  const memo = new Map();
  const visiting = new Set();
  const rootsOf = (row) => {
    if (memo.has(row.file)) return memo.get(row.file);
    const roots = { gates: new Set(), faults: new Set() };
    if (visiting.has(row.file)) {
      roots.faults.add(`a dependency cycle through #${row.number}`);
      return roots;
    }
    visiting.add(row.file);
    if (row.state === "gated") roots.gates.add(`#${row.number}: ${row.gateReason}`);
    if (row.state === "missing") roots.faults.add(`#${row.number} has no note`);
    if (row.unreadableDependencies.length > 0) roots.faults.add(`#${row.number} has an unreadable dependency`);
    for (const need of row.needs) {
      const target = byFile.get(need.file);
      if (target === undefined) roots.faults.add(`tasks/${need.file} has no queue row`);
      else {
        const inherited = rootsOf(target);
        for (const gate of inherited.gates) roots.gates.add(gate);
        for (const fault of inherited.faults) roots.faults.add(fault);
      }
    }
    visiting.delete(row.file);
    memo.set(row.file, roots);
    return roots;
  };
  for (const row of rows) {
    if (row.state === "owner-calls") continue;
    const roots = rootsOf(row);
    row.blockedBy = [...roots.gates];
    row.stuckOn = [...roots.faults];
  }
  for (const fault of new Set(rows.flatMap((row) => row.stuckOn).filter((text) => text.includes("cycle")))) {
    warnings.push(fault);
  }

  const withRow = new Set(parsed.rows.map((row) => row.file));
  const orphans = noteFiles.filter((file) => !withRow.has(file)).sort();
  for (const file of orphans) {
    warnings.push(`tasks/${file} has no row in the Queue table, so it is not in the queue`);
  }

  const trusted = parsed.errors.length === 0;
  const open = trusted ? rows.filter((row) => row.state === "open") : [];
  const tasks = rows.filter((row) => row.state !== "owner-calls" && row.state !== "open");
  return {
    errors: parsed.errors,
    warnings,
    rows,
    next: open[0] ?? null,
    open,
    /** wait for notes that can still be done */
    waiting: tasks.filter((row) => row.blockedBy.length === 0 && row.stuckOn.length === 0),
    /** wait for the owner, directly or through a dependency */
    blocked: tasks.filter((row) => row.blockedBy.length > 0),
    /** can never run until the queue itself is fixed */
    stuck: tasks.filter((row) => row.blockedBy.length === 0 && row.stuckOn.length > 0),
    ownerCallsNote: rows.find((row) => row.state === "owner-calls")?.path ?? null,
    orphans,
    endMarkerLine: parsed.endMarkerLine,
    /** the highest row number ever given (the queue:last-number line), or null without the line */
    lastNumber: parsed.lastNumber,
    nextNumber: parsed.nextNumber,
  };
}

/**
 * Finds the row for `/implement-tasks <note>`. Accepts "#12", "12", a path, a file name, or the
 * topic with or without the date ("sim-core").
 * @returns {{row: object} | {error: string}}
 */
export function resolveNote(analysis, argument) {
  const wanted = argument.trim();
  const number = /^#?(\d+)$/.exec(wanted);
  if (number !== null) {
    const row = analysis.rows.find((candidate) => candidate.number === Number(number[1]));
    return row === undefined ? { error: `no row #${number[1]} in the queue (a finished note has no row)` } : { row };
  }
  const file = wanted.replace(/^(\.\/)?tasks\//, "").replace(/\.md$/, "");
  const exact = analysis.rows.filter((row) => row.file === `${file}.md`);
  const bySlug = analysis.rows.filter((row) => slugOf(row.file) === slugOf(file));
  const partial = analysis.rows.filter((row) => slugOf(row.file).includes(slugOf(file)));
  const matches = exact.length > 0 ? exact : bySlug.length > 0 ? bySlug : partial;
  if (matches.length === 1) return { row: matches[0] };
  if (matches.length > 1) {
    return { error: `"${argument}" matches ${matches.length} notes: ${matches.map((row) => row.file).join(", ")}` };
  }
  if (analysis.orphans.some((orphan) => orphan === `${file}.md` || slugOf(orphan) === slugOf(file))) {
    return { error: `"${argument}" exists in tasks/ but has no row in the Queue table: add the row first` };
  }
  return { error: `no note matches "${argument}" (see the Queue table in tasks/README.md)` };
}

function describe(row) {
  return `#${row.number} ${row.path} (${row.title})`;
}

function reasons(row) {
  const parts = [];
  if (row.state === "gated") parts.push(`gate: ${row.gateReason}`);
  if (row.state === "owner-calls") parts.push("the owner-calls note is a list of questions, not a task");
  if (row.needs.length > 0) parts.push(`needs ${row.needs.map((need) => need.ref).join(", ")}`);
  const inherited = row.blockedBy.filter((root) => !root.startsWith(`#${row.number}:`));
  if (inherited.length > 0) parts.push(`blocked by ${inherited.join("; ")}`);
  if (row.stuckOn.length > 0) parts.push(`stuck: ${row.stuckOn.join("; ")}`);
  if (row.partialGate !== null) parts.push(`partly gated: ${row.partialGate}`);
  return parts.join(" · ");
}

/**
 * The text the skill reads. Stable line prefixes: NEXT, NOT READY, OPEN AFTER IT, WAITING FOR
 * OTHER NOTES, BLOCKED ON THE OWNER, STUCK, OWNER CALLS NOTE, NEW ROW NUMBER, WARNING, ERROR.
 * @param {ReturnType<typeof analyseQueue>} analysis
 * @param {{requested?: object}} [options] the row from resolveNote for `/implement-tasks <note>`
 */
export function formatReport(analysis, options = {}) {
  const out = [];
  for (const error of analysis.errors) out.push(`ERROR: ${error}`);
  if (analysis.errors.length > 0) {
    out.push("NEXT: none (the Queue table cannot be read; fix tasks/README.md first)");
    return `${out.join("\n")}\n`;
  }

  const chosen = options.requested ?? analysis.next;
  const flags = (row) => {
    const lines = [];
    if (row.partialGate !== null) {
      lines.push(`  partly gated: ${row.partialGate} (do everything else; that part stays for the owner)`);
    }
    if (row.remaining) lines.push("  has a ## REMAINING block: unfinished work, read it first");
    return lines;
  };
  if (options.requested !== undefined && options.requested.state !== "open") {
    out.push(`NOT READY: ${describe(chosen)}`, `  ${reasons(chosen)}`);
    if (chosen.remaining) out.push("  has a ## REMAINING block: read what is left and why");
  } else if (chosen !== null) {
    out.push(`NEXT: ${describe(chosen)}`, ...flags(chosen));
  } else if (analysis.blocked.length + analysis.stuck.length + analysis.waiting.length === 0) {
    out.push("NEXT: none (the queue is empty)");
  } else if (analysis.stuck.length + analysis.waiting.length === 0) {
    out.push("NEXT: none (every remaining note waits for the owner)");
  } else {
    out.push("NEXT: none (nothing can be taken until the queue is fixed; see STUCK)");
  }

  // `/implement-tasks <note>` asks about one note; the rest of the queue is noise there.
  if (options.requested === undefined) {
    const others = analysis.open.filter((row) => row !== chosen);
    if (others.length > 0) {
      out.push("", `OPEN AFTER IT (${others.length}):`, ...others.map((row) => `  ${describe(row)}`));
    }
    if (analysis.waiting.length > 0) {
      out.push("", `WAITING FOR OTHER NOTES (${analysis.waiting.length}):`);
      for (const row of analysis.waiting) out.push(`  #${row.number} ${slugOf(row.file)} · ${reasons(row)}`);
    }
    if (analysis.blocked.length > 0) {
      out.push("", `BLOCKED ON THE OWNER (${analysis.blocked.length}):`);
      for (const row of analysis.blocked) out.push(`  ${describe(row)} · ${reasons(row)}`);
    }
  }
  if (analysis.stuck.length > 0) {
    out.push("", `STUCK, FIX THE QUEUE (${analysis.stuck.length}):`);
    for (const row of analysis.stuck) out.push(`  ${describe(row)} · ${reasons(row)}`);
  }
  out.push("");
  if (analysis.ownerCallsNote !== null) out.push(`OWNER CALLS NOTE: ${analysis.ownerCallsNote}`);
  out.push(`NEW ROW NUMBER: ${analysis.nextNumber}`);
  for (const warning of analysis.warnings) out.push(`WARNING: ${warning}`);
  return `${out.join("\n")}\n`;
}
