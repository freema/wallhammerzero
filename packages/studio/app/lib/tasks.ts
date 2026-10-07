// Task notes as the pages see them (server/services/tasks.ts writes them): the draft of a note
// from a rejected verdict, and what the create form sends. Pure.

import type { AssetRecord, TaskInput, Verdict } from "../../server/services/index.ts";
import { TAG_TEXT } from "./reviews.ts";

/** The name of an asset without its pack: `props/crate` → `crate`. */
const nameOf = (id: string): string => id.slice(id.lastIndexOf("/") + 1);

/** The lines of a Markdown quote. */
const quote = (text: string): string => text.split("\n").map((line) => `> ${line}`).join("\n");

/**
 * The note a rejected verdict asks for, prefilled: the owner edits it in the form. The title
 * names the asset and the reasons; Origin says what was rejected and where to look; Scope
 * starts with the owner's comment; Acceptance is the owner's approval in the studio.
 */
export function draftTask(asset: Pick<AssetRecord, "id" | "genFile">, verdict: Verdict): TaskInput {
  const reasons = verdict.tags.map((tag) => TAG_TEXT[tag]);
  const title = `${nameOf(asset.id)}: ${reasons.length > 0 ? reasons.join(", ") : "rejected in the studio"}`;
  const folder = asset.genFile.replace(/\/gen\.ts$/, "");
  const variant = verdict.variant === null ? "" : verdict.variant.preset === null ? `, seed ${verdict.variant.seed}` : `, preset ${verdict.variant.preset} (seed ${verdict.variant.seed})`;
  const frame = verdict.frame === null ? "" : `, frame ${verdict.frame}`;
  const origin = [
    `The owner rejected \`${asset.id}\` in the studio: verdict ${verdict.id} (${verdict.at}) on output ${verdict.outputHash ?? "none"}${variant}${frame}.`,
    reasons.length > 0 ? `Reasons: ${reasons.join(", ")}.` : "",
    verdict.comment === "" ? "" : `The owner's comment:\n${quote(verdict.comment)}`,
    `Look at the review sheets, never the raw sprite: \`./dev npm run asset -- review ${asset.id}\` writes the contact sheet (\`contact.png\`), one strip per clip (\`strip-<clip>.png\`) and the silhouettes into the folder \`build/review/${asset.id}/\` (see \`docs/looking-at-images.md\`).`,
  ]
    .filter((line) => line !== "")
    .join("\n");
  const body = [
    "## Origin",
    origin,
    "",
    "## Read first",
    `- \`CLAUDE.md\` ("Verdicts" and "Looking at images"), \`docs/looking-at-images.md\`.`,
    `- The asset's program \`${asset.genFile}\` and its verdicts \`${folder}/review.json\`.`,
    "",
    "## Scope",
    `1. ${verdict.comment === "" ? "Fix what the verdict rejects." : verdict.comment.split("\n")[0]}`,
    `2. Re-bake the asset and check the review sheets before handing it back.`,
    "",
    "## Out of scope",
    "- Other assets. Shared code (the kit, palettes, stamps) beyond what this fix needs.",
    "",
    "## Acceptance",
    `- The owner approves \`${asset.id}\` in the studio (a verdict "approved" on the new output).`,
    `- \`./dev npm run asset -- lint ${asset.id}\` passes and the gate is green.`,
  ].join("\n");
  return { title, slug: "", priority: "P2", size: "S", body };
}

/** What the create form of a page sends (fields `title`, `slug`, `priority`, `size`, `body`, `verdict`). */
export function readTaskForm(data: FormData): TaskInput & { readonly verdict: string } {
  const text = (name: string): string => String(data.get(name) ?? "");
  return { verdict: text("verdict"), title: text("title"), slug: text("slug"), priority: text("priority"), size: text("size"), body: text("body") };
}
