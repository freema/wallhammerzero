// /asset/<pack>/<name>: one asset. Its meta, its clips, and the player: every variant seed
// and preset animated side by side (app/preview/player.tsx). The page follows its asset: after
// a re-bake it shows the new record and the new sheets by itself, and the player keeps its
// clip, time and zoom.

import { data, Link } from "react-router";
import { BakeBanner, StatusBadge } from "../components.tsx";
import { studioContext } from "../context.ts";
import { fileUrl, formatMs, gallerySearch, kindOf } from "../lib/assets.ts";
import { assetNeedsLoader } from "../lib/live.ts";
import { pickPlayerZoom } from "../lib/player.ts";
import { readVerdictForm } from "../lib/reviews.ts";
import { readTaskForm } from "../lib/tasks.ts";
import { useAsset, useLoaderOn, useLoaderRevision, useRunning } from "../live.tsx";
import { PlayerSection } from "../preview/player.tsx";
import { VerdictPanel } from "../verdicts.tsx";
import type { VerdictResult } from "../verdicts.tsx";
import type { TaskResult } from "../tasks.tsx";
import type { Route } from "./+types/asset";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `${params["*"]} · Wallhammer Zero studio` }];
}

export function loader({ params, request, context }: Route.LoaderArgs) {
  const { index, bake } = context.get(studioContext);
  index.refresh();
  const id = params["*"];
  const asset = index.get(id);
  if (asset === undefined) throw data(`There is no asset ${JSON.stringify(id)} under the assets folder.`, { status: 404 });
  // The player starts from the URL (`?zoom=`, `?clip=`, `?facing=`); after that it is its own.
  const query = new URL(request.url).searchParams;
  const start = { zoom: pickPlayerZoom(query.get("zoom")), clip: query.get("clip") ?? "", facing: query.get("facing") ?? "" };
  return { asset, start, running: bake.state().running, revision: index.revision };
}

/**
 * POST /asset/<id>: `intent=verdict` appends a verdict to the asset's review.json and rewrites
 * the inbox; `intent=task` writes a task note from one of its verdicts. A bad input is
 * answered with 400 and the reason; the page shows it.
 */
export async function action({ request, params, context }: Route.ActionArgs) {
  const { reviews, tasks } = context.get(studioContext);
  const sent = await request.formData();
  const intent = sent.get("intent");
  const id = params["*"];
  if (intent === "task") {
    const form = readTaskForm(sent);
    try {
      const task = await tasks.create(id, form.verdict, form);
      const result: TaskResult = { ok: true, error: null, task };
      return result;
    } catch (error) {
      const result: TaskResult = { ok: false, error: error instanceof Error ? error.message : String(error), task: null };
      return data(result, { status: 400 });
    }
  }
  if (intent !== "verdict") throw new Response("unknown intent", { status: 400 });
  const form = readVerdictForm(sent);
  try {
    const verdict = await reviews.add(id, {
      status: form.status,
      tags: form.tags,
      comment: form.comment,
      frame: form.frame,
      variant: form.seed === null ? null : { seed: form.seed, preset: form.preset },
      outputHash: form.outputHash,
    });
    const result: VerdictResult = { ok: true, error: null, verdict };
    return result;
  } catch (error) {
    const result: VerdictResult = { ok: false, error: error instanceof Error ? error.message : String(error), verdict: null };
    return data(result, { status: 400 });
  }
}

export default function AssetPage({ loaderData }: Route.ComponentProps) {
  const { start, revision } = loaderData;
  const asset = useAsset(loaderData.asset, revision);
  const running = useRunning(loaderData.running);
  useLoaderRevision(revision);
  useLoaderOn((event) => assetNeedsLoader(event, asset.id));

  return (
    <main className="page" data-asset-id={asset.id} data-status={asset.status}>
      <p className="crumbs">
        <Link to="/gallery">Gallery</Link> / <Link to={{ pathname: "/gallery", search: gallerySearch({ pack: asset.pack }) }}>{asset.pack}</Link>
      </p>
      <h1>
        {asset.id} <StatusBadge status={asset.status} />
      </h1>
      <BakeBanner running={running} />

      {asset.error === null ? null : (
        <section>
          <h2>Bake error</h2>
          <pre className="error-text">{asset.error}</pre>
        </section>
      )}
      {asset.status === "unbaked" ? <p className="empty">This asset has no output yet. It is baked when one of its files changes, or by Bake all on the dashboard.</p> : null}
      {asset.status === "stale" ? <p className="note">The source files changed since this output was baked. The new drawing appears here when its bake is done.</p> : null}

      <section>
        <h2>Meta</h2>
        <dl className="meta">
          <dt>Kind</dt>
          <dd>{kindOf(asset)}</dd>
          {asset.size === null ? null : (
            <>
              <dt>Frame size</dt>
              <dd>
                {asset.size[0]} × {asset.size[1]} px
              </dd>
            </>
          )}
          {asset.pivot === null ? null : (
            <>
              <dt>Pivot</dt>
              <dd>
                {asset.pivot[0]}, {asset.pivot[1]}
              </dd>
            </>
          )}
          {asset.facings.length === 0 ? null : (
            <>
              <dt>Facings</dt>
              <dd>{asset.facings.join(", ")}</dd>
            </>
          )}
          {asset.sheet === null ? null : (
            <>
              <dt>Frames</dt>
              <dd>
                {asset.frameCount} (sheet {asset.sheet.w} × {asset.sheet.h} px)
              </dd>
            </>
          )}
          <dt>Source</dt>
          <dd>
            <code>{asset.genFile}</code>{" "}
            · hash <code>{asset.sourceHash || "?"}</code>
            {asset.bakedSourceHash !== null && asset.bakedSourceHash !== asset.sourceHash ? (
              <>
                {" "}
                (output baked from <code>{asset.bakedSourceHash || "?"}</code>)
              </>
            ) : null}
          </dd>
          {asset.outputHash === null ? null : (
            <>
              <dt>Output hash</dt>
              <dd>
                <code>{asset.outputHash}</code>
              </dd>
            </>
          )}
          <dt>Output folder</dt>
          <dd>
            <code>{asset.bakeDir}</code>
            {asset.status === "baked" || asset.status === "stale" ? (
              <>
                {" "}
                · <a href={fileUrl(`${asset.bakeDir}/atlas.json`)}>atlas.json</a>
              </>
            ) : null}
          </dd>
          {Object.keys(asset.params).length === 0 ? null : (
            <>
              <dt>Params (defaults)</dt>
              <dd>
                {Object.entries(asset.params).map(([name, value]) => (
                  <code key={name} className="chip">
                    {name} = {String(value)}
                  </code>
                ))}
              </dd>
            </>
          )}
          {asset.presets.length === 0 ? null : (
            <>
              <dt>Presets</dt>
              <dd>
                {asset.presets.map((preset) => (
                  <code key={preset} className="chip">
                    {preset}
                  </code>
                ))}
              </dd>
            </>
          )}
          {asset.reviewSeeds.length === 0 ? null : (
            <>
              <dt>Review seeds</dt>
              <dd>{asset.reviewSeeds.join(", ")}</dd>
            </>
          )}
        </dl>
      </section>

      {asset.palette === null ? null : (
        <section>
          <h2>Palette</h2>
          <p className="sub">
            <code>{asset.palette.id}</code> · hash <code>{asset.palette.hash}</code> · {asset.palette.colors.length} slots (slot 0 is transparent)
          </p>
          <ol className="swatches" start={0}>
            {asset.palette.colors.map((color, slot) => (
              <li key={slot} className={slot === 0 ? "checker" : undefined} style={slot === 0 ? undefined : { background: color }} title={slot === 0 ? "slot 0: transparent" : `slot ${slot}: ${color}`} />
            ))}
          </ol>
        </section>
      )}

      {asset.clips.length === 0 ? null : (
        <section>
          <h2>Clips</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Clip</th>
                <th className="num">Frames</th>
                <th>Durations (ms)</th>
                <th className="num">Total</th>
                <th>Loop</th>
              </tr>
            </thead>
            <tbody>
              {asset.clips.map((clip) => (
                <tr key={clip.name} data-clip={clip.name}>
                  <td>{clip.name}</td>
                  <td className="num">{clip.frames}</td>
                  <td>{clip.durations.join(", ")}</td>
                  <td className="num">{formatMs(clip.durations.reduce((sum, ms) => sum + ms, 0))}</td>
                  <td>{clip.loop ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {asset.variants.length === 0 || asset.sheet === null ? <VerdictPanel asset={asset} looking={null} /> : <PlayerSection asset={asset} zoom={start.zoom} clip={start.clip} facing={start.facing} />}
    </main>
  );
}
