// Task notes: the studio reads the queue (`tasks/*.md` and the Queue table of
// `tasks/README.md`) for the /tasks page, and creates a note from a rejected verdict (D8,
// D22). The rules of the queue are in tasks/README.md; the parser of the table and of a
// note's header is the repo's own tool (`tools/task-queue`), so the studio and the
// implement-tasks skill read the same thing.
//
// Creating a note writes three files, in this order, each one atomically:
// 1. the note, with an **exclusive create** (`wx`): a name that exists gets a numbered suffix,
//    and nothing is ever overwritten;
// 2. the Queue table: a row above the `queue:end` marker with the next number, and that number
//    on the `queue:last-number` line;
// 3. the verdict: its `task` field is the note's path (the review service does this).
// The note is the owner's task for a session: the gate checks its format like any other note.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseGate, parseNoteHeader, parseQueue, QUEUE_END_MARKER, QUEUE_LAST_NUMBER_MARKER } from "@whz/task-queue";
import type { QueueRow } from "@whz/task-queue";

/** The queue folder and its README, relative to the checkout. */
export const TASKS_DIR = "tasks";
export const TASKS_README = "tasks/README.md";

/** The header labels and the sections of the note format (tasks/README.md, "Note format"); a test keeps them equal. */
export const NOTE_LABELS = ["GATE", "Priority", "Size", "Depends on"] as const;
export const NOTE_SECTIONS = ["Origin", "Read first", "Scope", "Out of scope", "Acceptance"] as const;

export const PRIORITIES = ["P1", "P2", "P3"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const SIZES = ["S", "M", "L"] as const;
export type Size = (typeof SIZES)[number];

export const MAX_TITLE_LENGTH = 120;
export const MAX_BODY_LENGTH = 20000;

const NOTE_NAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One note of the queue, as the /tasks page lists it. */
export interface TaskNote {
  /** `tasks/<date>-<slug>.md` */
  readonly file: string;
  readonly title: string;
  /** The date in the file name. */
  readonly date: string;
  readonly gate: string;
  readonly priority: string;
  readonly size: string;
  readonly dependsOn: string;
  /** The row number in the Queue table, or null for a note without a row (the gate fails on it). */
  readonly number: number | null;
  /** True when the note has a `## REMAINING` block (a session ran out before finishing it). */
  readonly remaining: boolean;
  /** True when the gate is open (`none`). */
  readonly open: boolean;
}

/** What the owner's form sends to create a note. */
export interface TaskInput {
  readonly title: string;
  /** The slug of the file name; empty: made from the title. */
  readonly slug?: string | undefined;
  readonly priority: string;
  readonly size: string;
  /** The note after the header line: the sections, `## Origin` first. */
  readonly body: string;
}

/** What a created note is. */
export interface CreatedTask {
  readonly file: string;
  readonly number: number;
  readonly title: string;
}

/** A file name's slug from free text: lower case, words joined with dashes. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** The header value of a note's `**Label:** value` line, or "". */
function headerField(head: string, label: string): string {
  const match = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.*?)\\s*(?:·\\s*\\*\\*|$)`, "i").exec(head);
  return match === null ? "" : match[1] ?? "";
}

/** Reads one note's title and header. Null for a file that is not a note. */
export function parseNote(file: string, text: string): Omit<TaskNote, "number"> | null {
  const name = NOTE_NAME.exec(file.replace(/^tasks\//, ""));
  if (name === null) return null;
  const lines = text.split(/\r?\n/);
  const title = (lines.find((line) => line.startsWith("# ")) ?? "").slice(2).trim();
  const head = lines.find((line) => /^\*\*GATE:\*\*/i.test(line.trim()))?.trim() ?? "";
  const { gate, dependsOn, remaining } = parseNoteHeader(text);
  return {
    file,
    title: title === "" ? file : title,
    date: name[1] ?? "",
    gate: gate ?? "",
    priority: headerField(head, "Priority"),
    size: headerField(head, "Size"),
    dependsOn: dependsOn ?? "",
    remaining,
    open: gate === null ? false : parseGate(gate).open,
  };
}

/** The notes of a checkout in queue order (the rows first, then the notes without a row by name). */
export function listTasks(root: string): TaskNote[] {
  const dir = join(root, TASKS_DIR);
  if (!existsSync(dir)) return [];
  const readmePath = join(root, ...TASKS_README.split("/"));
  const rows: readonly QueueRow[] = existsSync(readmePath) ? parseQueue(readFileSync(readmePath, "utf8")).rows : [];
  const numbers = new Map(rows.map((row) => [row.file, row.number]));
  const notes: TaskNote[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === "README.md" || !name.endsWith(".md")) continue;
    let text: string;
    try {
      text = readFileSync(join(dir, name), "utf8");
    } catch {
      continue;
    }
    const note = parseNote(name, text);
    if (note !== null) notes.push({ ...note, file: `${TASKS_DIR}/${name}`, number: numbers.get(name) ?? null });
  }
  const order = (note: TaskNote): number => note.number ?? Number.POSITIVE_INFINITY;
  return notes.sort((a, b) => order(a) - order(b) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

/** Turns what the form sent into a note's parts, or throws with the reason. */
export function parseTaskInput(input: TaskInput): { title: string; slug: string; priority: Priority; size: Size; body: string } {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (title === "") throw new Error("the task needs a title");
  if (title.length > MAX_TITLE_LENGTH) throw new Error(`the title is longer than ${MAX_TITLE_LENGTH} characters`);
  if (/[[\]()]/.test(title)) throw new Error("the title cannot have brackets or parentheses (it becomes a link in the Queue table)");
  const slug = (input.slug ?? "").trim() === "" ? slugify(title) : (input.slug ?? "").trim();
  if (!SLUG.test(slug)) throw new Error(`the file name must be lower-case words joined with dashes, got ${JSON.stringify(slug)}`);
  if (!(PRIORITIES as readonly string[]).includes(input.priority)) throw new Error(`the priority is one of ${PRIORITIES.join(", ")}, got ${JSON.stringify(input.priority)}`);
  if (!(SIZES as readonly string[]).includes(input.size)) throw new Error(`the size is one of ${SIZES.join(", ")}, got ${JSON.stringify(input.size)}`);
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (body.length > MAX_BODY_LENGTH) throw new Error(`the note is longer than ${MAX_BODY_LENGTH} characters`);
  const headings = body.split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3).trim());
  const required = NOTE_SECTIONS.map((section) => headings.indexOf(section));
  if (required.some((index) => index < 0)) throw new Error(`the note needs the sections ${NOTE_SECTIONS.map((section) => `"## ${section}"`).join(", ")}, in that order`);
  if (required.some((index, i) => i > 0 && index < (required[i - 1] ?? 0))) throw new Error(`the sections go in the order ${NOTE_SECTIONS.join(", ")}`);
  if (NOTE_SECTIONS.some((section) => headings.filter((heading) => heading === section).length > 1)) throw new Error("a section is there twice");
  return { title, slug, priority: input.priority as Priority, size: input.size as Size, body };
}

/** The text of a note: the title line, the header line, the body. */
export function renderNote(fields: { title: string; priority: string; size: string; body: string }, date: string): string {
  return `# ${fields.title.toUpperCase()} (${date})\n\n**GATE:** none · **Priority:** ${fields.priority} · **Size:** ${fields.size} · **Depends on:** none\n\n${fields.body}\n`;
}

/** Writes a file atomically: a temp file in the same folder, then a rename. */
function writeAtomic(file: string, text: string): void {
  const temp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

/**
 * Creates the note file, never over another: `<date>-<slug>.md`, else `<date>-<slug>-2.md`, and
 * so on. Returns the file name. The create is exclusive (`wx`), so two studios racing for the
 * same name both get a file of their own.
 */
export function createNoteFile(dir: string, date: string, slug: string, text: string): string {
  mkdirSync(dir, { recursive: true });
  for (let n = 1; n < 1000; n += 1) {
    const name = `${date}-${slug}${n === 1 ? "" : `-${n}`}.md`;
    try {
      writeFileSync(join(dir, name), text, { flag: "wx" });
      return name;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error(`a thousand notes are named ${date}-${slug}: pick another name`);
}

/** The parsed Queue table, or a throw when a row cannot be added to it. */
function checkQueue(readme: string): ReturnType<typeof parseQueue> {
  const queue = parseQueue(readme);
  if (queue.errors.length > 0) throw new Error(`the Queue table of ${TASKS_README} cannot be changed: ${queue.errors[0]}`);
  if (queue.endMarkerLine === null) throw new Error(`${TASKS_README} has no "${QUEUE_END_MARKER} ... -->" marker after the Queue table`);
  if (!readme.split("\n").some((line) => line.trimStart().startsWith(QUEUE_LAST_NUMBER_MARKER))) throw new Error(`${TASKS_README} has no "${QUEUE_LAST_NUMBER_MARKER} #<n> ... -->" line under the Queue table`);
  return queue;
}

/**
 * The README with a new row above the `queue:end` marker, numbered `nextNumber`, and that
 * number on the `queue:last-number` line. Throws when the table cannot be trusted.
 */
export function addQueueRow(readme: string, note: { file: string; title: string }): { text: string; number: number } {
  const queue = checkQueue(readme);
  const lines = readme.split("\n");
  const number = queue.nextNumber;
  const row = `| ${number} | [${note.title}](${note.file}) | none | none |`;
  lines.splice((queue.endMarkerLine ?? 1) - 1, 0, row);
  const last = lines.findIndex((line) => line.trimStart().startsWith(QUEUE_LAST_NUMBER_MARKER));
  const marked = (lines[last] ?? "").replace(/^(\s*<!--\s*queue:last-number)(?:\s+#\d+)?/, `$1 #${number}`);
  lines[last] = marked;
  return { text: lines.join("\n"), number };
}

export interface TaskServiceOptions {
  /** The checkout. */
  readonly root: string;
  /** The verdict a note is made from, as the index knows it; undefined when there is no such asset or verdict. */
  readonly verdict: (assetId: string, verdictId: string) => { readonly status: string; readonly task: string | null } | undefined;
  /** Writes the note's path into the verdict it came from (the review service). */
  readonly link: (assetId: string, verdictId: string, task: string) => Promise<unknown>;
  readonly now?: (() => Date) | undefined;
}

export interface TaskService {
  /** The notes of the queue, in its order. */
  list(): TaskNote[];
  /** Creates a note from a verdict: the file, the queue row, the link in the verdict. Rejects with the reason. */
  create(assetId: string, verdictId: string, input: TaskInput): Promise<CreatedTask>;
}

export function createTaskService(options: TaskServiceOptions): TaskService {
  const { root } = options;
  let chain: Promise<unknown> = Promise.resolve();
  return {
    list: () => listTasks(root),
    create(assetId, verdictId, input) {
      // One note after the other: the README is read, changed and written in one go.
      const run = chain.then(async () => {
        const fields = parseTaskInput(input);
        const verdict = options.verdict(assetId, verdictId);
        if (verdict === undefined) throw new Error(`no verdict ${JSON.stringify(verdictId)} on asset ${JSON.stringify(assetId)}`);
        if (verdict.status !== "rejected") throw new Error(`a task is made from a rejected verdict; ${verdictId} is ${verdict.status}`);
        if (verdict.task !== null) throw new Error(`verdict ${verdictId} already has a task: ${verdict.task}`);
        const readmePath = join(root, ...TASKS_README.split("/"));
        if (!existsSync(readmePath)) throw new Error(`no ${TASKS_README} in this checkout`);
        checkQueue(readFileSync(readmePath, "utf8")); // before the note exists: a note without a row fails the gate
        const date = (options.now?.() ?? new Date()).toISOString().slice(0, 10);
        const name = createNoteFile(join(root, TASKS_DIR), date, fields.slug, renderNote(fields, date));
        const file = `${TASKS_DIR}/${name}`;
        const { text, number } = addQueueRow(readFileSync(readmePath, "utf8"), { file: name, title: fields.title });
        writeAtomic(readmePath, text);
        await options.link(assetId, verdictId, file);
        return { file, number, title: fields.title };
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
}
