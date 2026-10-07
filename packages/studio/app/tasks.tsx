// A task note from a rejected verdict, in the asset page's verdict history: the "Create task…"
// button, the form it opens (prefilled from the verdict, lib/tasks.ts), and the link to the
// note once it exists. The POST goes to the asset page's action with `intent=task`; the
// verdict that comes back through live reload carries the note's path.

import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import type { AssetRecord, CreatedTask, Verdict } from "../server/services/index.ts";
import { assetHref } from "./lib/assets.ts";
import { draftTask } from "./lib/tasks.ts";

/** What the action of the asset page answers to `intent=task`. */
export interface TaskResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly task: CreatedTask | null;
}

/** The link to a verdict's note, or the way to make one (a rejected verdict only). */
export function VerdictTask({ asset, verdict }: { asset: AssetRecord; verdict: Verdict }) {
  if (verdict.task !== null) {
    return (
      <span className="verdict-task" data-task={verdict.task}>
        {" · "}
        <Link to="/tasks" title="The task note made from this verdict (the /tasks page lists the queue)">
          → <code>{verdict.task}</code>
        </Link>
      </span>
    );
  }
  if (verdict.status !== "rejected") return null;
  return <TaskCreate asset={asset} verdict={verdict} />;
}

function TaskCreate({ asset, verdict }: { asset: AssetRecord; verdict: Verdict }) {
  const fetcher = useFetcher<TaskResult>();
  const busy = fetcher.state !== "idle";
  const [open, setOpen] = useState(false);
  const title = useRef<HTMLInputElement>(null);
  const draft = draftTask(asset, verdict);
  const created = fetcher.state === "idle" && fetcher.data?.ok === true ? fetcher.data.task : null;

  useEffect(() => {
    if (open) title.current?.focus();
  }, [open]);

  if (created !== null) {
    return (
      <span className="verdict-task" data-task={created.file}>
        {" · "}created <code>{created.file}</code> as row #{created.number}
      </span>
    );
  }
  if (!open) {
    return (
      <>
        {" · "}
        <button type="button" className="link-button" onClick={() => setOpen(true)} title="Write a task note from this verdict into tasks/ (a session picks it up)">
          Create task…
        </button>
      </>
    );
  }
  return (
    <fetcher.Form method="post" action={assetHref(asset.id)} className="task-form" data-task-form={verdict.id}>
      <input type="hidden" name="intent" value="task" />
      <input type="hidden" name="verdict" value={verdict.id} />
      <div className="control-row">
        <label>
          Title <input type="text" name="title" defaultValue={draft.title} ref={title} required maxLength={120} size={48} />
        </label>
        <label>
          File <code>tasks/&lt;date&gt;-</code>
          <input type="text" name="slug" defaultValue={draft.slug} placeholder="from the title" pattern="[a-z0-9]+(-[a-z0-9]+)*" size={24} />
          <code>.md</code>
        </label>
        <label>
          Priority{" "}
          <select name="priority" defaultValue={draft.priority}>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
        </label>
        <label>
          Size{" "}
          <select name="size" defaultValue={draft.size}>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </select>
        </label>
      </div>
      <textarea name="body" defaultValue={draft.body} rows={18} spellCheck={false} aria-label="The note: Origin, Read first, Scope, Out of scope, Acceptance" />
      <div className="control-row">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Writing…" : "Create task"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <span className="sub">
          The note goes to <code>tasks/</code> with a row in the Queue table; the gate is <code>none</code>, no dependencies. Edit it in the repo afterwards.
        </span>
      </div>
      {fetcher.data?.ok === false ? (
        <p className="error-text" role="alert">
          {fetcher.data.error}
        </p>
      ) : null}
    </fetcher.Form>
  );
}
