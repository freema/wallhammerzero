// The verdicts as the pages see them (server/services/reviews.ts writes them): the words of
// each status, the gallery's review filter, and what a verdict form sends. Pure.

import type { AssetRecord, VerdictStatus, VerdictTag } from "../../server/services/index.ts";

/** The choices of the gallery's review filter, in the order of the select. */
export const REVIEW_FILTERS = ["", "unreviewed", "approved", "rejected", "comment", "changed"] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export const REVIEW_FILTER_TEXT: Readonly<Record<ReviewFilter, string>> = {
  "": "all",
  unreviewed: "no verdict yet",
  approved: "approved",
  rejected: "rejected",
  comment: "commented",
  changed: "changed since verdict",
};

export const STATUS_WORD: Readonly<Record<VerdictStatus, string>> = { approved: "approved", rejected: "rejected", comment: "commented" };

/** The fixed list of reasons, as the server has it (a test keeps the two the same: the app imports no server code). */
export const VERDICT_TAGS: readonly VerdictTag[] = ["readability", "silhouette", "palette", "proportions", "animation-timing", "style-mismatch", "other"];

export const TAG_TEXT: Readonly<Record<VerdictTag, string>> = {
  readability: "readability",
  silhouette: "silhouette",
  palette: "palette",
  proportions: "proportions",
  "animation-timing": "animation timing",
  "style-mismatch": "style mismatch",
  other: "other",
};

/** The review filter an URL value means; anything else is "all". */
export function pickReviewFilter(value: string | null): ReviewFilter {
  const text = value ?? "";
  return (REVIEW_FILTERS as readonly string[]).includes(text) ? (text as ReviewFilter) : "";
}

/** True if the asset's review state is what the filter asks for. */
export function matchesReview(review: AssetRecord["review"], filter: ReviewFilter): boolean {
  switch (filter) {
    case "":
      return true;
    case "unreviewed":
      return review.status === null;
    case "changed":
      return review.changed;
    default:
      return review.status === filter;
  }
}

/** The gallery badge of an asset's review state: the status word, and "changed" over it. */
export function reviewBadge(review: AssetRecord["review"]): { kind: "none" | "changed" | VerdictStatus; text: string } {
  if (review.status === null) return { kind: "none", text: "" };
  if (review.changed) return { kind: "changed", text: `changed since ${STATUS_WORD[review.status]}` };
  return { kind: review.status, text: STATUS_WORD[review.status] };
}

/** What the verdict form of a page sends. */
export interface VerdictForm {
  readonly status: VerdictStatus;
  readonly tags: readonly string[];
  readonly comment: string;
  /** The frame the verdict is about, or null. */
  readonly frame: number | null;
  readonly seed: number | null;
  readonly preset: string | null;
  /** The output hash the page showed when the verdict was given; null when it showed none. */
  readonly outputHash: string | null;
}

/** Reads a verdict from form data. Values that are not there are null or empty. */
export function readVerdictForm(data: FormData): VerdictForm {
  const text = (name: string): string => String(data.get(name) ?? "");
  const number = (name: string): number | null => {
    const value = text(name).trim();
    return value === "" ? null : Number(value);
  };
  return {
    status: text("status") as VerdictStatus,
    tags: data.getAll("tags").map(String),
    comment: text("comment"),
    frame: text("about-frame") === "on" ? number("frame") : null,
    seed: number("seed"),
    preset: text("preset") === "" ? null : text("preset"),
    outputHash: text("output-hash") === "" ? null : text("output-hash"),
  };
}

/** The key of the page for a verdict: A approves, R rejects, C comments; null for any other key. */
export function verdictKey(key: string): VerdictStatus | null {
  switch (key.toLowerCase()) {
    case "a":
      return "approved";
    case "r":
      return "rejected";
    case "c":
      return "comment";
    default:
      return null;
  }
}
