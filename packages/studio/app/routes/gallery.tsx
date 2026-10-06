// /gallery: every asset as a card with the first frame of its first variant, at the integer
// zoom the owner picks. The filters and the zoom live in the URL, so a view can be reloaded,
// bookmarked and checked by a script.

import { useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { Form, Link, useNavigate } from "react-router";
import { BakeBanner, PixelImage, StatusBadge } from "../components.tsx";
import { studioContext } from "../context.ts";
import { assetHref, fileUrl, filterAssets, filterChoices, GALLERY_ZOOMS, gallerySearch, imageKey, kindOf, parseGalleryQuery, STATUSES } from "../lib/assets.ts";
import { pickReviewFilter, REVIEW_FILTER_TEXT, REVIEW_FILTERS } from "../lib/reviews.ts";
import { previewVariants } from "../lib/variants.ts";
import { ReviewBadge, VerdictQuick } from "../verdicts.tsx";
import { playingChoice, SourcePreview } from "../preview/preview.tsx";
import type { GalleryQuery } from "../lib/assets.ts";
import { galleryNeedsLoader } from "../lib/live.ts";
import { useAsset, useLoaderOn, useLoaderRevision, useRunning } from "../live.tsx";
import type { AssetRecord } from "../../server/services/index.ts";
import type { Route } from "./+types/gallery";

export function meta() {
  return [{ title: "Gallery · Wallhammer Zero studio" }];
}

export function loader({ request, context }: Route.LoaderArgs) {
  const { index, bake } = context.get(studioContext);
  const all = index.refresh();
  const query = parseGalleryQuery(new URL(request.url).searchParams);
  return { assets: filterAssets(all, query), total: all.length, choices: filterChoices(all), query, running: bake.state().running, revision: index.revision };
}

/**
 * One card. `loaded` is the loader's record from the index at `revision`; an event about this
 * asset replaces it, and then only this card renders again and only its image is fetched.
 * The card plays the asset's first clip (first seed) once its sheet is loaded; the first
 * frame is its still image until then.
 */
function Card({ loaded, revision, zoom }: { loaded: AssetRecord; revision: number; zoom: number }) {
  const asset = useAsset(loaded, revision);
  const variant = asset.variants[0];
  const source = previewVariants(asset)[0]?.source ?? null;
  return (
    <li className={`card card-${asset.status}`} data-asset-id={asset.id} data-status={asset.status} data-kind={kindOf(asset)}>
      <Link to={assetHref(asset.id)} className="card-link">
        <div className="thumb checker">
          {variant !== undefined && asset.size !== null ? (
            <SourcePreview source={source} width={asset.size[0]} height={asset.size[1]} zoom={zoom} choice={playingChoice} id={asset.id}>
              <PixelImage src={fileUrl(variant.firstFrame, imageKey(asset, variant))} w={asset.size[0]} h={asset.size[1]} zoom={zoom} alt={`${asset.id}, first frame`} />
            </SourcePreview>
          ) : (
            <span className="thumb-none">{asset.status === "error" ? "bake failed" : "not baked yet"}</span>
          )}
        </div>
        <div className="card-body">
          <div className="card-id">
            <span className="pack">{asset.pack}/</span>
            {asset.name}
          </div>
          <div className="card-meta">
            <StatusBadge status={asset.status} />
            <ReviewBadge review={asset.review} />
            {asset.size === null ? null : (
              <span>
                {kindOf(asset)} · {asset.size[0]}×{asset.size[1]} · {asset.clips.length} {asset.clips.length === 1 ? "clip" : "clips"} · {asset.frameCount}{" "}
                {asset.frameCount === 1 ? "frame" : "frames"} · {asset.variants.length} {asset.variants.length === 1 ? "variant" : "variants"}
              </span>
            )}
          </div>
          {asset.error === null ? null : <pre className="error-text card-error">{asset.error}</pre>}
        </div>
      </Link>
      <VerdictQuick asset={asset} />
    </li>
  );
}

export default function Gallery({ loaderData }: Route.ComponentProps) {
  const { assets, total, choices, query, revision } = loaderData;
  const running = useRunning(loaderData.running);
  const navigate = useNavigate();
  const form = useRef<HTMLFormElement>(null);
  useLoaderRevision(revision);
  // The list is loaded again only when it may have changed; a changed asset patches its own card.
  useLoaderOn((event) => galleryNeedsLoader(event, query, choices.kinds));

  // The form is uncontrolled. After a navigation that did not come from it (back, forward, a
  // link from the dashboard), put the URL's values into the fields. The search box is left
  // alone while the owner types in it.
  useEffect(() => {
    const fields = form.current?.elements;
    if (fields === undefined) return;
    for (const name of ["pack", "kind", "status", "review"] as const) (fields.namedItem(name) as HTMLSelectElement).value = query[name];
    const search = fields.namedItem("q") as HTMLInputElement;
    if (document.activeElement !== search) search.value = query.q;
    for (const radio of form.current?.querySelectorAll<HTMLInputElement>('input[name="zoom"]') ?? []) radio.checked = Number(radio.value) === query.zoom;
  }, [query]);

  const apply = (event: FormEvent<HTMLFormElement>): void => {
    const data = new FormData(event.currentTarget);
    const text = (name: string): string => String(data.get(name) ?? "");
    const next: GalleryQuery = { pack: text("pack"), kind: text("kind"), status: text("status"), review: pickReviewFilter(text("review")), q: text("q").trim(), zoom: Number(text("zoom")) };
    void navigate({ pathname: "/gallery", search: gallerySearch(next) }, { replace: true, preventScrollReset: true });
  };

  return (
    <main className="page">
      <h1>Gallery</h1>
      <BakeBanner running={running} />
      <Form
        method="get"
        action="/gallery"
        className="filters"
        ref={form}
        onChange={apply}
        onSubmit={(event) => {
          event.preventDefault();
          apply(event);
        }}
      >
        <label>
          Pack
          <select name="pack" defaultValue={query.pack}>
            <option value="">all</option>
            {choices.packs.map((pack) => (
              <option key={pack}>{pack}</option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select name="kind" defaultValue={query.kind}>
            <option value="">all</option>
            {choices.kinds.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={query.status}>
            <option value="">all</option>
            {STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          Verdict
          <select name="review" defaultValue={query.review}>
            {REVIEW_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {REVIEW_FILTER_TEXT[filter]}
              </option>
            ))}
          </select>
        </label>
        <label className="grow">
          Search
          <input type="search" name="q" defaultValue={query.q} placeholder="id, kind or clip name" autoComplete="off" />
        </label>
        <div className="field" role="radiogroup" aria-label="Zoom">
          Zoom
          <span className="zoom">
            {GALLERY_ZOOMS.map((zoom) => (
              <label key={zoom}>
                <input type="radio" name="zoom" value={zoom} defaultChecked={zoom === query.zoom} />
                <span>{zoom}×</span>
              </label>
            ))}
          </span>
        </div>
        <noscript>
          <button type="submit">Apply</button>
        </noscript>
        <Link to="/gallery" className="reset">
          Reset
        </Link>
      </Form>

      <p className="count" data-shown={assets.length} data-total={total}>
        {assets.length === total ? `${total} ${total === 1 ? "asset" : "assets"}` : `${assets.length} of ${total} assets`}
      </p>

      {assets.length === 0 ? (
        <p className="empty">{total === 0 ? "No asset programs found under the assets folder." : "No asset matches these filters."}</p>
      ) : (
        <ul className="grid" data-zoom={query.zoom}>
          {assets.map((asset) => (
            <Card key={asset.id} loaded={asset} revision={revision} zoom={query.zoom} />
          ))}
        </ul>
      )}
    </main>
  );
}
