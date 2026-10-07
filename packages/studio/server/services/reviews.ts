// Verdicts: what the owner says about an asset, written back into the repo for Claude (D7,
// D21). The source of truth is `assets/<pack>/<name>/review.json`, one per asset, written only
// by the studio: an append-only list of verdicts, each tied to the output hash it was given
// on. `reviews/INBOX.md` is generated from every review.json: Claude's entry point, never
// edited by hand.
//
// A verdict is for a hash. When the asset is re-baked and its pixels differ, the asset is
// "changed since verdict" until the owner looks again; a re-bake with the same pixels changes
// nothing. The studio writes the file atomically (temp file + rename) and one verdict after
// the other, so two quick verdicts lose nothing.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatJson } from "@whz/asset-kit";
import type { AssetEntry, AssetProject } from "@whz/asset-kit/node";

export const REVIEW_FORMAT = "wz.review/1";
export const REVIEW_FILE = "review.json";
/** The generated inbox, relative to the checkout. */
export const INBOX_FILE = "reviews/INBOX.md";

export const VERDICT_STATUSES = ["approved", "rejected", "comment"] as const;
export type VerdictStatus = (typeof VERDICT_STATUSES)[number];

/** The fixed list of reasons a verdict can carry (D22). */
export const VERDICT_TAGS = ["readability", "silhouette", "palette", "proportions", "animation-timing", "style-mismatch", "other"] as const;
export type VerdictTag = (typeof VERDICT_TAGS)[number];

/** The longest comment the studio takes. */
export const MAX_COMMENT_LENGTH = 4000;

/** One verdict, as it is in review.json. */
export interface Verdict {
  /** `v-<time>-<n>`: sortable, unique in the file. */
  readonly id: string;
  /** ISO-8601, UTC. */
  readonly at: string;
  readonly status: VerdictStatus;
  /** The output hash the verdict was given on; null for an asset that had no output then. */
  readonly outputHash: string | null;
  readonly sourceHash: string;
  /** Which variant the owner was looking at: a seed, or a preset (drawn with a seed). */
  readonly variant: { readonly seed: number; readonly preset: string | null } | null;
  readonly tags: readonly VerdictTag[];
  readonly comment: string;
  /** The frame the comment is about, or null. */
  readonly frame: number | null;
  /** The task note the studio created from this verdict (`tasks/<file>`), or null. */
  readonly task: string | null;
}

/** The content of review.json. */
export interface ReviewFile {
  readonly format: typeof REVIEW_FORMAT;
  readonly asset: string;
  readonly verdicts: readonly Verdict[];
}

/** What the pages show for an asset: its last verdict, and whether the output moved on since. */
export interface ReviewState {
  /** The status of the last verdict, or null without one. */
  readonly status: VerdictStatus | null;
  /** True when the asset's output hash now is not the one of the last verdict. */
  readonly changed: boolean;
  readonly count: number;
  readonly last: Verdict | null;
  /** Every verdict, oldest first (the history the asset page shows). */
  readonly verdicts: readonly Verdict[];
}

/** What a verdict is made of when it comes in. */
export interface VerdictInput {
  readonly status: VerdictStatus;
  /**
   * The output hash the owner was looking at (the page sends it). Without it, the asset's
   * hash at the time of writing. A verdict on an output that is gone by then still says what
   * the owner saw, and the asset is "changed since verdict" at once.
   */
  readonly outputHash?: string | null | undefined;
  readonly variant?: { readonly seed: number; readonly preset: string | null } | null | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly comment?: string | undefined;
  readonly frame?: number | null | undefined;
}

export function reviewFile(entry: Pick<AssetEntry, "folder">): string {
  return join(entry.folder, REVIEW_FILE);
}

/** The review file of an asset, or an empty one; a file that cannot be read counts as empty. */
export function readReview(entry: Pick<AssetEntry, "id" | "folder">): ReviewFile {
  const empty: ReviewFile = { format: REVIEW_FORMAT, asset: entry.id, verdicts: [] };
  const file = reviewFile(entry);
  if (!existsSync(file)) return empty;
  try {
    const json = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!isRecord(json) || json["format"] !== REVIEW_FORMAT || !Array.isArray(json["verdicts"])) return empty;
    // `task` came with the task notes: a file from before has no field, which means none.
    return { format: REVIEW_FORMAT, asset: entry.id, verdicts: json["verdicts"].filter(isVerdict).map((verdict) => ({ ...verdict, task: typeof verdict.task === "string" ? verdict.task : null })) };
  } catch {
    return empty;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVerdict(value: unknown): value is Verdict {
  if (!isRecord(value)) return false;
  const status = value["status"];
  return (
    typeof value["id"] === "string" &&
    typeof value["at"] === "string" &&
    typeof status === "string" &&
    (VERDICT_STATUSES as readonly string[]).includes(status) &&
    (typeof value["outputHash"] === "string" || value["outputHash"] === null) &&
    typeof value["sourceHash"] === "string" &&
    Array.isArray(value["tags"]) &&
    typeof value["comment"] === "string"
  );
}

/** The state the pages show, from the file and the asset's output hash now. */
export function reviewState(review: Pick<ReviewFile, "verdicts">, outputHash: string | null): ReviewState {
  const last = review.verdicts[review.verdicts.length - 1] ?? null;
  return {
    status: last?.status ?? null,
    changed: last !== null && outputHash !== null && last.outputHash !== outputHash,
    count: review.verdicts.length,
    last,
    verdicts: review.verdicts,
  };
}

/** Turns what a form sent into a verdict's fields, or throws with the reason. */
export function parseVerdictInput(input: VerdictInput): Required<Omit<VerdictInput, "outputHash">> {
  if (!(VERDICT_STATUSES as readonly string[]).includes(input.status)) throw new Error(`a verdict is one of ${VERDICT_STATUSES.join(", ")}, got ${JSON.stringify(input.status)}`);
  const tags = [...new Set(input.tags ?? [])];
  const unknown = tags.filter((tag) => !(VERDICT_TAGS as readonly string[]).includes(tag));
  if (unknown.length > 0) throw new Error(`unknown tags: ${unknown.join(", ")}`);
  const comment = (input.comment ?? "").replace(/\r\n/g, "\n").trim();
  if (comment.length > MAX_COMMENT_LENGTH) throw new Error(`the comment is longer than ${MAX_COMMENT_LENGTH} characters`);
  const frame = input.frame ?? null;
  if (frame !== null && !(Number.isInteger(frame) && frame >= 0)) throw new Error(`the frame must be a whole number from 0, got ${String(frame)}`);
  const variant = input.variant ?? null;
  if (variant !== null && !(Number.isInteger(variant.seed) && (variant.preset === null || typeof variant.preset === "string"))) throw new Error("the variant must be a seed and maybe a preset");
  if (input.outputHash !== undefined && input.outputHash !== null && !/^[0-9a-f]{16}$/.test(input.outputHash)) throw new Error(`the output hash must be 16 hex digits, got ${JSON.stringify(input.outputHash)}`);
  return { status: input.status, variant, tags: tags.sort(), comment, frame };
}

/** Writes a file atomically: a temp file in the same folder, then a rename. */
function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

/** What a verdict is written against: the asset as the index knows it now. */
export interface VerdictTarget {
  readonly entry: Pick<AssetEntry, "id" | "folder">;
  readonly outputHash: string | null;
  readonly sourceHash: string;
}

/**
 * Appends a verdict to the asset's review file and returns the file. Not safe to call twice
 * at once on its own: `createReviewService` serializes the calls.
 */
export function appendVerdict(target: VerdictTarget, input: VerdictInput, now: Date = new Date()): { file: ReviewFile; path: string; verdict: Verdict } {
  const fields = parseVerdictInput(input);
  const before = readReview(target.entry);
  const at = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const stamp = at.replace(/[-:]/g, "").replace("T", "T").slice(0, 15); // 20261007T013012
  const taken = new Set(before.verdicts.map((verdict) => verdict.id));
  let id = `v-${stamp}-${before.verdicts.length + 1}`;
  for (let n = before.verdicts.length + 2; taken.has(id); n += 1) id = `v-${stamp}-${n}`;
  const outputHash = input.outputHash === undefined ? target.outputHash : input.outputHash;
  const verdict: Verdict = { id, at, status: fields.status, outputHash, sourceHash: target.sourceHash, variant: fields.variant, tags: fields.tags as VerdictTag[], comment: fields.comment, frame: fields.frame, task: null };
  const file: ReviewFile = { format: REVIEW_FORMAT, asset: target.entry.id, verdicts: [...before.verdicts, verdict] };
  const path = reviewFile(target.entry);
  writeAtomic(path, formatJson(file));
  return { file, path, verdict };
}

/**
 * Writes the task note's path into one verdict (the studio created the note from it). The one
 * change ever made to a verdict after it was written; the rest of the file stays as it is.
 */
export function setVerdictTask(entry: Pick<AssetEntry, "id" | "folder">, verdictId: string, task: string): { file: ReviewFile; path: string; verdict: Verdict } {
  const before = readReview(entry);
  const index = before.verdicts.findIndex((verdict) => verdict.id === verdictId);
  if (index < 0) throw new Error(`no verdict ${JSON.stringify(verdictId)} on ${entry.id}`);
  const was = before.verdicts[index] as Verdict;
  if (was.task !== null) throw new Error(`verdict ${verdictId} already has a task: ${was.task}`);
  const verdict: Verdict = { ...was, task };
  const file: ReviewFile = { ...before, verdicts: before.verdicts.with(index, verdict) };
  const path = reviewFile(entry);
  writeAtomic(path, formatJson(file));
  return { file, path, verdict };
}

// ---------------------------------------------------------------------------------------
// The inbox

/** One asset's line in the inbox: what the generator needs, from the index and its review file. */
export interface InboxEntry {
  readonly id: string;
  readonly genFile: string;
  readonly outputHash: string | null;
  readonly review: ReviewState;
}

const short = (hash: string | null): string => (hash === null ? "no output" : hash);

function describe(verdict: Verdict): string {
  const parts: string[] = [];
  if (verdict.variant !== null) parts.push(verdict.variant.preset === null ? `seed ${verdict.variant.seed}` : `preset ${verdict.variant.preset} (seed ${verdict.variant.seed})`);
  if (verdict.frame !== null) parts.push(`frame ${verdict.frame}`);
  if (verdict.tags.length > 0) parts.push(verdict.tags.join(", "));
  if (verdict.task !== null) parts.push(`→ \`${verdict.task}\``);
  return parts.join(" · ");
}

function line(entry: InboxEntry, verdict: Verdict): string {
  const head = `- **${entry.id}** (${verdict.at}, on ${short(verdict.outputHash)}${entry.review.changed ? `, now ${short(entry.outputHash)}` : ""})`;
  const meta = describe(verdict);
  const comment = verdict.comment === "" ? "" : `\n  > ${verdict.comment.split("\n").join("\n  > ")}`;
  return `${head}${meta === "" ? "" : ` · ${meta}`}\n  source: \`${entry.genFile}\` · verdicts: \`${dirname(entry.genFile)}/${REVIEW_FILE}\`${comment}`;
}

/**
 * The inbox as text, from every asset's state. Deterministic: the same files give the same
 * text, so a check can compare the committed inbox with the files. "Updated" is the time of
 * the latest verdict, not the clock.
 */
export function renderInbox(entries: readonly InboxEntry[]): string {
  const reviewed = entries.filter((entry): entry is InboxEntry & { review: ReviewState & { last: Verdict } } => entry.review.last !== null).sort((a, b) => a.id.localeCompare(b.id));
  const latest = reviewed.map((entry) => entry.review.last.at).sort().at(-1) ?? null;
  const changed = reviewed.filter((entry) => entry.review.changed);
  const rejected = reviewed.filter((entry) => entry.review.status === "rejected" && !entry.review.changed);
  const comments = reviewed.filter((entry) => entry.review.status === "comment" && !entry.review.changed);
  const approved = reviewed.filter((entry) => entry.review.status === "approved" && !entry.review.changed);
  const total = entries.length;
  const section = (title: string, rows: readonly string[], empty: string): string => `## ${title}\n\n${rows.length === 0 ? empty : rows.join("\n")}\n`;
  return [
    "# Review inbox",
    "",
    "Generated by the studio from every `assets/**/review.json`. **Do not edit**: the next verdict",
    "rewrites it. Read it first in a session; the rules are in `CLAUDE.md` (\"Verdicts\").",
    "",
    `Updated: ${latest ?? "never"} · assets: ${total} · reviewed: ${reviewed.length} · rejected: ${rejected.length} · comments: ${comments.length} · changed since verdict: ${changed.length} · approved: ${approved.length}`,
    "",
    section("Rejected", rejected.map((entry) => line(entry, entry.review.last)), "Nothing is rejected."),
    section("Comments", comments.map((entry) => line(entry, entry.review.last)), "No open comments."),
    section(
      "Changed since verdict",
      changed.map((entry) => `${line(entry, entry.review.last)}\n  The output changed after this ${entry.review.last.status === "comment" ? "comment" : `verdict (${entry.review.last.status})`}: the owner has not seen the new one.`),
      "Every verdict is on the current output.",
    ),
    section(
      "Approved",
      approved.map((entry) => `- **${entry.id}** (${entry.review.last.at}, on ${short(entry.review.last.outputHash)}) — do not change without the owner's consent`),
      "Nothing is approved yet.",
    ),
  ].join("\n");
}

/** The inbox file's path in a project. */
export function inboxFile(project: Pick<AssetProject, "root">): string {
  return join(project.root, ...INBOX_FILE.split("/"));
}

/** Writes the inbox if its text differs from what is there. True if it was written. */
export function writeInbox(project: Pick<AssetProject, "root">, entries: readonly InboxEntry[]): boolean {
  const file = inboxFile(project);
  const text = renderInbox(entries);
  if (existsSync(file) && readFileSync(file, "utf8") === text) return false;
  writeAtomic(file, text);
  return true;
}

// ---------------------------------------------------------------------------------------
// The service

export interface ReviewServiceOptions {
  readonly project: AssetProject;
  /** The asset as the index knows it, or undefined. */
  readonly target: (id: string) => VerdictTarget | undefined;
  /** Every asset's inbox entry, after the index was scanned again. */
  readonly entries: () => readonly InboxEntry[];
  /** Called with the review file just written, right after the write (echo suppression; the inbox is outside the assets folder). */
  readonly wrote?: ((paths: readonly string[]) => void) | undefined;
  /** Makes the index read the files again; called after a write, before the inbox. */
  readonly rescan: () => void;
  readonly now?: (() => Date) | undefined;
}

export interface ReviewService {
  /** Appends a verdict, rescans and rewrites the inbox. Rejects with the reason for a bad input or an unknown asset. */
  add(id: string, input: VerdictInput): Promise<Verdict>;
  /** Writes the task note's path into a verdict (once), rescans and rewrites the inbox. */
  setTask(id: string, verdictId: string, task: string): Promise<Verdict>;
  /** Rewrites the inbox from the files as they are (on start). */
  refreshInbox(): boolean;
}

export function createReviewService(options: ReviewServiceOptions): ReviewService {
  const { project } = options;
  let chain: Promise<unknown> = Promise.resolve();
  const inbox = (): boolean => writeInbox(project, options.entries());
  // One write after the other, whatever the order the requests came in.
  const serialized = (write: (target: VerdictTarget) => { path: string; verdict: Verdict }, id: string): Promise<Verdict> => {
    const run = chain.then(() => {
      const target = options.target(id);
      if (target === undefined) throw new Error(`no asset ${JSON.stringify(id)}`);
      const { path, verdict } = write(target);
      options.wrote?.([path]);
      options.rescan();
      inbox();
      return verdict;
    });
    chain = run.catch(() => undefined);
    return run;
  };
  return {
    add: (id, input) => serialized((target) => appendVerdict(target, input, options.now?.()), id),
    setTask: (id, verdictId, task) => serialized((target) => setVerdictTask(target.entry, verdictId, task), id),
    refreshInbox: inbox,
  };
}
