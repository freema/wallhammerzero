// The owner's verdicts in the pages: the badge, the quick buttons of a gallery card, and the
// panel of the asset page (the form, the keys A / R / C, the history). Every verdict is a POST
// to the asset page's action (routes/asset.tsx), sent with a fetcher so the page stays where
// it is; the record that comes back through live reload shows the new state.

import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { AssetRecord, Verdict, VerdictStatus } from "../server/services/index.ts";
import { assetHref } from "./lib/assets.ts";
import { reviewBadge, STATUS_WORD, TAG_TEXT, VERDICT_TAGS, verdictKey } from "./lib/reviews.ts";
import { VerdictTask } from "./tasks.tsx";

/** What the action of the asset page answers. */
export interface VerdictResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly verdict: Verdict | null;
}

/** The review state of an asset as a badge, or nothing without a verdict. */
export function ReviewBadge({ review }: { review: AssetRecord["review"] }) {
  const badge = reviewBadge(review);
  if (badge.kind === "none") return null;
  const title = badge.kind === "changed" ? `The output changed after the last verdict (${review.last?.at ?? ""}): look again.` : `Last verdict ${review.last?.at ?? ""}`;
  return (
    <span className={`badge badge-review badge-review-${badge.kind}`} data-review={badge.kind} title={title}>
      {badge.text}
    </span>
  );
}

/** True if a key press belongs to a form control and not to the page. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

/** The time of a verdict, short: `2026-10-07 01:30`. */
const when = (at: string): string => at.replace("T", " ").slice(0, 16);

/** Approve and reject in one click, on a gallery card. */
export function VerdictQuick({ asset }: { asset: AssetRecord }) {
  const fetcher = useFetcher<VerdictResult>();
  const busy = fetcher.state !== "idle";
  const seed = asset.variants[0]?.seed;
  return (
    <fetcher.Form method="post" action={assetHref(asset.id)} className="card-actions" data-verdict-quick>
      <input type="hidden" name="intent" value="verdict" />
      <input type="hidden" name="output-hash" value={asset.outputHash ?? ""} />
      {seed === undefined ? null : <input type="hidden" name="seed" value={seed} />}
      <button type="submit" name="status" value="approved" className="verdict-approve" disabled={busy} title="Approve this output as it is">
        Approve
      </button>
      <button type="submit" name="status" value="rejected" className="verdict-reject" disabled={busy} title="Reject this output (say why on the asset page)">
        Reject
      </button>
      {fetcher.data?.ok === false ? <span className="error-text">{fetcher.data.error}</span> : null}
    </fetcher.Form>
  );
}

export interface VerdictPanelProps {
  readonly asset: AssetRecord;
  /** What the owner is looking at: the variant in the player and the frame it is on; null without a player. */
  readonly looking: { readonly seed: number; readonly preset: string | null; readonly frame: number } | null;
}

/** The verdict panel of the asset page: the state, the form, the keys, the history. */
export function VerdictPanel({ asset, looking }: VerdictPanelProps) {
  const fetcher = useFetcher<VerdictResult>();
  const busy = fetcher.state !== "idle";
  const [status, setStatus] = useState<VerdictStatus>("comment");
  const [open, setOpen] = useState(false);
  const comment = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const { review } = asset;
  const badge = reviewBadge(review);

  // After a verdict went through, the form is empty and closed again.
  const done = fetcher.state === "idle" && fetcher.data?.ok === true ? fetcher.data.verdict?.id : undefined;
  useEffect(() => {
    if (done === undefined) return;
    form.current?.reset();
    setOpen(false);
  }, [done]);

  /** A: approve as it is, now. R and C: open the form on that status, the cursor in the comment. */
  const begin = useCallback((next: VerdictStatus): void => {
    if (next === "approved") {
      const data = new FormData(form.current ?? undefined);
      data.set("status", "approved");
      data.delete("comment");
      data.delete("about-frame");
      data.delete("tags");
      void fetcher.submit(data, { method: "post", action: assetHref(asset.id) });
      return;
    }
    setStatus(next);
    setOpen(true);
    requestAnimationFrame(() => comment.current?.focus());
  }, [asset.id, fetcher]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      const next = verdictKey(event.key);
      if (next === null) return;
      event.preventDefault();
      begin(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [begin]);

  return (
    <section className="verdicts" data-verdicts data-review={badge.kind} data-count={review.count}>
      <h2>Verdict</h2>
      <p className="verdict-state">
        {review.last === null ? (
          <span className="sub">No verdict yet.</span>
        ) : (
          <>
            <ReviewBadge review={review} />{" "}
            <span className="sub">
              {STATUS_WORD[review.last.status]} {when(review.last.at)} on output <code>{review.last.outputHash ?? "none"}</code>
              {review.changed ? (
                <>
                  ; the output is <code>{asset.outputHash ?? "none"}</code> now
                </>
              ) : null}
              {review.last.task === null ? null : (
                <>
                  {" "}
                  · task <code>{review.last.task}</code>
                </>
              )}
            </span>
          </>
        )}
      </p>

      <fetcher.Form method="post" action={assetHref(asset.id)} className="verdict-form" ref={form} data-open={open}>
        <input type="hidden" name="intent" value="verdict" />
        <input type="hidden" name="output-hash" value={asset.outputHash ?? ""} />
        {looking === null ? null : (
          <>
            <input type="hidden" name="seed" value={looking.seed} />
            <input type="hidden" name="preset" value={looking.preset ?? ""} />
            <input type="hidden" name="frame" value={looking.frame} />
          </>
        )}
        <div className="control-row">
          <button type="button" className="verdict-approve" onClick={() => begin("approved")} disabled={busy} title="Approve the output as it is (A)">
            Approve
          </button>
          <button type="button" className="verdict-reject" onClick={() => begin("rejected")} disabled={busy} aria-pressed={open && status === "rejected"} title="Reject it and say why (R)">
            Reject…
          </button>
          <button type="button" className="verdict-comment" onClick={() => begin("comment")} disabled={busy} aria-pressed={open && status === "comment"} title="A note without a verdict (C)">
            Comment…
          </button>
          <span className="sub keys">
            <kbd>A</kbd> <kbd>R</kbd> <kbd>C</kbd>
            {looking === null ? "" : ` · on ${looking.preset === null ? `seed ${looking.seed}` : `preset ${looking.preset}`}`}
          </span>
        </div>
        <fieldset className="verdict-details" hidden={!open} disabled={!open}>
          <legend>{status === "rejected" ? "Rejected: what is wrong" : "Comment"}</legend>
          <input type="hidden" name="status" value={status} />
          <div className="tags" role="group" aria-label="Reasons">
            {VERDICT_TAGS.map((tag) => (
              <label key={tag} className="check">
                <input type="checkbox" name="tags" value={tag} /> {TAG_TEXT[tag]}
              </label>
            ))}
          </div>
          <textarea
            name="comment"
            ref={comment}
            rows={3}
            placeholder={status === "rejected" ? "What is wrong, and what would be right." : "A note for the generator."}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) form.current?.requestSubmit();
            }}
          />
          <div className="control-row">
            {looking === null ? null : (
              <label className="check">
                <input type="checkbox" name="about-frame" /> about frame {looking.frame}
              </label>
            )}
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Saving…" : status === "rejected" ? "Reject" : "Save comment"}
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <span className="sub">⌘/Ctrl + Enter saves</span>
          </div>
        </fieldset>
        {fetcher.data?.ok === false ? (
          <p className="error-text" role="alert">
            {fetcher.data.error}
          </p>
        ) : null}
      </fetcher.Form>

      {review.count === 0 ? null : (
        <details className="verdict-history" open={review.count <= 3}>
          <summary>
            History: {review.count} {review.count === 1 ? "verdict" : "verdicts"} (<code>{asset.genFile.replace(/gen\.ts$/, "review.json")}</code>)
          </summary>
          <VerdictHistory asset={asset} />
        </details>
      )}
    </section>
  );
}

/** Every verdict of the asset, latest first. */
function VerdictHistory({ asset }: { asset: AssetRecord }) {
  return (
    <ol className="history" reversed>
      {[...asset.review.verdicts].reverse().map((verdict) => (
        <li key={verdict.id} data-verdict={verdict.id} data-status={verdict.status}>
          <span className={`badge badge-review badge-review-${verdict.status}`}>{STATUS_WORD[verdict.status]}</span> <time dateTime={verdict.at}>{when(verdict.at)}</time> · output{" "}
          <code>{verdict.outputHash ?? "none"}</code>
          {verdict.variant === null ? "" : ` · ${verdict.variant.preset === null ? `seed ${verdict.variant.seed}` : `preset ${verdict.variant.preset} (seed ${verdict.variant.seed})`}`}
          {verdict.frame === null ? "" : ` · frame ${verdict.frame}`}
          {verdict.tags.length === 0 ? "" : ` · ${verdict.tags.map((tag) => TAG_TEXT[tag]).join(", ")}`}
          <VerdictTask asset={asset} verdict={verdict} />
          {verdict.comment === "" ? null : <blockquote>{verdict.comment}</blockquote>}
        </li>
      ))}
    </ol>
  );
}
