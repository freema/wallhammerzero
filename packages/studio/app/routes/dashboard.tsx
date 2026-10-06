// /: the dashboard. Asset counts by kind and bake status, the bake errors that are on disk
// now, and the Bake all button. The numbers follow the index: they are loaded again after
// every change of it and after every bake run.

import { Link, useFetcher } from "react-router";
import { BakeBanner } from "../components.tsx";
import { studioContext } from "../context.ts";
import { assetHref, formatMs, gallerySearch, STATUSES, summarize } from "../lib/assets.ts";
import { dashboardNeedsLoader } from "../lib/live.ts";
import { useLoaderOn, useLoaderRevision, useRunning } from "../live.tsx";
import type { BakeRun } from "../../server/services/index.ts";
import type { Route } from "./+types/dashboard";

export function meta() {
  return [{ title: "Dashboard · Wallhammer Zero studio" }];
}

export function loader({ context }: Route.LoaderArgs) {
  const { index, bake } = context.get(studioContext);
  const assets = index.refresh();
  return {
    summary: summarize(assets),
    errors: assets.filter((asset) => asset.status === "error").map((asset) => ({ id: asset.id, error: asset.error ?? "" })),
    bake: bake.state(),
    revision: index.revision,
  };
}

/**
 * POST /: `intent=bake-all` bakes every asset in the bake worker and answers when the run is
 * over. A failed asset is not a failed request: the run lists it, and the loaders show it.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const { bake } = context.get(studioContext);
  const form = await request.formData();
  if (form.get("intent") !== "bake-all") throw new Response("unknown intent", { status: 400 });
  return { run: await bake.bakeAll("manual") };
}

/** How a bake run began, in words. */
const RUN_REASON: Readonly<Record<BakeRun["reason"], string>> = { start: "on start", manual: "by the button", watch: "after a file change" };

function LastRun({ run }: { run: BakeRun }) {
  const failed = run.items.filter((item) => !item.ok);
  return (
    <div className="last-run" data-run={run.number} data-failed={failed.length}>
      <p>
        Last bake (#{run.number}, {RUN_REASON[run.reason]}, <time dateTime={run.startedAt}>{run.startedAt.slice(11, 19)} UTC</time>): {run.items.length}{" "}
        {run.items.length === 1 ? "asset" : "assets"} in {formatMs(run.ms)}, {failed.length} failed
        {run.pruned.length === 0 ? "" : `, ${run.pruned.length} removed (${run.pruned.join(", ")})`}.
      </p>
      {failed.length === 0 ? null : (
        <ul className="errors">
          {failed.map((item) => (
            <li key={item.id}>
              <Link to={assetHref(item.id)}>{item.id}</Link>
              {item.timedOut ? <span className="badge badge-error">timeout</span> : null}
              <pre className="error-text">{item.error}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { summary, errors, bake, revision } = loaderData;
  const running = useRunning(bake.running);
  const fetcher = useFetcher<typeof action>();
  const submitting = fetcher.state !== "idle";
  const busy = submitting || running !== null;
  useLoaderRevision(revision);
  useLoaderOn(dashboardNeedsLoader);

  return (
    <main className="page">
      <h1>Dashboard</h1>

      <section>
        <h2>Assets</h2>
        <div className="tiles">
          <Link to="/gallery" className="tile" data-count="total">
            <strong>{summary.total}</strong>
            <span>assets</span>
          </Link>
          {STATUSES.map((status) => (
            <Link key={status} to={{ pathname: "/gallery", search: gallerySearch({ status }) }} className={`tile tile-${status}`} data-count={status}>
              <strong>{summary.byStatus[status]}</strong>
              <span>{status}</span>
            </Link>
          ))}
        </div>
        {summary.byKind.length === 0 ? (
          <p className="empty">No asset programs found under the assets folder.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Kind</th>
                <th className="num">Assets</th>
                {STATUSES.map((status) => (
                  <th key={status} className="num">
                    {status}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.byKind.map((row) => (
                <tr key={row.kind} data-kind={row.kind}>
                  <td>
                    <Link to={{ pathname: "/gallery", search: gallerySearch({ kind: row.kind }) }}>{row.kind}</Link>
                  </td>
                  <td className="num">{row.total}</td>
                  {STATUSES.map((status) => (
                    <td key={status} className="num">
                      {row.byStatus[status]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="sub">The kind of an asset is read from its baked atlas, so an asset without one counts as unknown.</p>
      </section>

      <section>
        <h2>Bake</h2>
        <fetcher.Form method="post" className="toolbar">
          <button type="submit" name="intent" value="bake-all" disabled={busy}>
            {busy ? "Baking…" : "Bake all"}
          </button>
          <span className="sub">Runs every asset program in a worker and writes the sheets and atlases. One asset that fails or hangs does not stop the others.</span>
        </fetcher.Form>
        <BakeBanner running={running} />
        {bake.last === null ? <p className="sub">No bake has run since the studio started.</p> : <LastRun run={bake.last} />}
      </section>

      <section>
        <h2>Bake errors</h2>
        {errors.length === 0 ? (
          <p className="sub" data-errors="0">
            No asset has a bake error.
          </p>
        ) : (
          <ul className="errors" data-errors={errors.length}>
            {errors.map((item) => (
              <li key={item.id} data-asset-id={item.id}>
                <Link to={assetHref(item.id)}>{item.id}</Link>
                <pre className="error-text">{item.error}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
