# The studio

The studio is the local web app where the owner sees every generated asset (D4, D6). It is the
package `packages/studio`: React Router 8 in framework mode with server rendering, on the
official custom Node server template (Express), React 19 and Vite (D9). It runs in Docker like
everything else (D16).

So far it has the app shell, the asset index, the gallery, the asset page, the bake button and
[live reload](#live-reload): a file written under `assets/` is re-baked and shows in the open
pages by itself. The animation player, verdicts and the other pages are later notes in
[tasks/README.md](../tasks/README.md); each adds its own route and navigation entry.

## Starting it

```sh
./dev compose up studio            # then open http://127.0.0.1:4100
./dev compose up -d studio         # ... or in the background
./dev compose logs -f studio
./dev compose stop studio
```

The service runs the dev server: Vite in middleware mode, so an edit under `packages/studio/app/`
shows in the browser without a reload (HMR, over the same port). A change to
`packages/studio/server.ts` or `packages/studio/server/services/` needs a restart
(`./dev compose restart studio`).

On start the studio bakes every asset that has no output for its current source files, so the
gallery has thumbnails on a fresh checkout. After that it watches `assets/` and re-bakes what
changes ([live reload](#live-reload)). **Bake all** on the dashboard (or
`./dev npm run asset -- bake --all`) bakes everything, which is what a change to shared code
needs. A page load always shows what is on disk now.

### Ports

| What | Value |
|---|---|
| Default | `http://127.0.0.1:4100` |
| Another port | `WHZ_STUDIO_PORT=4110 ./dev compose up studio` (a second checkout, a verifier) |
| Binding | `127.0.0.1` only: the port is not reachable from the LAN. `tools/dev-env/compose-lint.mjs` enforces the form in the gate. |

Inside the container the server listens on `0.0.0.0:4100`; Docker publishes it on the host's
loopback address. `WHZ_STUDIO_PORT` in front of `./dev compose` changes the published port, not
the port in the container.

### Without Compose

The server is one file that Node runs as it is. For a short-lived instance (a check, another
set of assets), start it through `./dev -p`:

```sh
# the fixture assets of the studio's tests (one of them fails to bake), on port 4107
./dev -p 4107 env WHZ_STUDIO_PORT=4107 \
  WHZ_STUDIO_ASSETS=packages/studio/test/fixtures/assets \
  WHZ_STUDIO_OUT=.studio-cache/fixtures/build WHZ_STUDIO_CACHE=.studio-cache/fixtures \
  npm run dev -w @whz/studio
```

| Variable | Default | Meaning |
|---|---|---|
| `WHZ_STUDIO_PORT` | 4100 | The port the server listens on (0: any free port). |
| `WHZ_STUDIO_HOST` | `127.0.0.1`; `0.0.0.0` in the dev container | The address the server listens on. |
| `WHZ_STUDIO_ROOT` | this repo | The checkout the studio shows. |
| `WHZ_STUDIO_ASSETS` | `assets` | The asset programs, relative to the root. |
| `WHZ_STUDIO_OUT` | `build` | The build outputs, relative to the root. Must be inside the root. |
| `WHZ_STUDIO_CACHE` | `.studio-cache` | The studio's own derived data. Must be inside the root. |
| `WHZ_STUDIO_BAKE_TIMEOUT_MS` | 30000 | How long one asset may bake. |
| `WHZ_STUDIO_BAKE_ON_START` | 1 | 0: do not bake missing outputs on start. |
| `WHZ_STUDIO_WATCH` | 1 | 0: do not watch the assets folder. Nothing is re-baked by itself; the pages still get the progress of a bake. |
| `WHZ_STUDIO_WATCH_POLL_MS` | 500 | The time between two sweeps of the assets folder when no file event came (20 to 60000). |
| `WHZ_STUDIO_ALLOWED_HOSTS` | none | Extra host names for the Host check, comma separated. |
| `NODE_ENV` | `development` | `production` serves the built app (`npm run build`, then `npm start`, in the package). |

They are read in `packages/studio/server/services/config.ts`. The Compose service passes none
of them: it uses the defaults.

## What it reads and writes

| Path | Access | What |
|---|---|---|
| `assets/` (every folder with a `gen.ts`, and `assets/palettes/`) | read, watched | Which assets exist, the hash of their source files, and which files changed. The server never runs an asset program itself: the bake worker does. |
| `build/assets/<id>/` | read; written by a bake | `atlas.json`, the sheets and frames, or `error.json` of a failed bake ([asset-pipeline.md](asset-pipeline.md#bake)). Served read-only under `/api/files/`. Removed when the asset's folder is removed. |
| `.studio-cache/index.json` | written | A copy of the asset index (below). Derived and gitignored: delete it and it comes back. |
| `packages/studio/build/`, `packages/studio/.react-router/` | written by the package's build and typecheck | The built app and React Router's generated route types. Gitignored. |

Nothing else is written. The studio does not touch `assets/` (verdict files come with the
verdicts note).

## Pages

| URL | What |
|---|---|
| `/` | Dashboard: asset counts by bake status and by kind, the **Bake all** button with the result of the last run, and the bake errors that are on disk now. |
| `/gallery` | Every asset as a card with the first frame of its first variant. A card follows its asset ([live reload](#live-reload)). Filters by pack, kind, bake status and text (every word must be in the id, the kind or a clip name), and the zoom: 1×, 2×, 3× or 4×. The filters and the zoom are in the URL (`/gallery?pack=examples&kind=sprite&q=dot&zoom=2`), so a view can be reloaded and scripted. An asset whose bake failed is an error card with the message; one without output says so. |
| `/asset/<pack>/<name>` | One asset: meta (kind, size, pivot, hashes, params, presets), the palette, the clip table, and the baked sheet of every variant at an integer zoom (1× to 8×, `?zoom=`). The page follows its asset: after a re-bake it shows the new record and sheets in place. The animation player replaces the still sheet later. |
| `/api/files/<path>` | A build output by its path relative to the checkout, read-only, e.g. `/api/files/build/assets/examples/blinking-dot/atlas.json`. With `?h=<key>` the answer is cached for good; without it the browser revalidates. The pages use `<output hash>.<palette hash>` as the key (`imageKey` in `packages/studio/app/lib/assets.ts`): the output hash alone does not change when only a palette's colours do. |
| `/api/events` | The event stream of [live reload](#live-reload) (Server-Sent Events). |

Pixel art is always shown at a whole multiple of its size with `image-rendering: pixelated`
(the `PixelImage` component); nothing scales it by a fraction.

**Bake status** of an asset: `baked` (the output was made from the current source files),
`stale` (the source files changed since), `error` (the last bake failed) and `unbaked` (no
output). The source hash covers the asset's own folder only
([asset-pipeline.md](asset-pipeline.md#atlasjson-format-wzatlas1)), so a change to shared code
or to a palette leaves every asset `baked`. A palette edited while the studio runs is followed
all the same ([live reload](#live-reload)); after a change to shared code, or to a palette
while the studio was stopped, press **Bake all**. The kind, size and clips of an asset come
from its atlas: an asset without one has the kind `unknown`.

## The server

`packages/studio/server.ts` is the process: Express, the guards, the files endpoint, the event
stream, then Vite
(dev) or the built app (production). It creates the **services** once and hands them to every
loader and action through the router context:

```ts
import { studioContext } from "../context.ts";

export function loader({ context }: Route.LoaderArgs) {
  const { index, bake } = context.get(studioContext);
  return { assets: index.refresh(), running: bake.state().running, revision: index.revision };
}
```

| Service | File in `packages/studio/server/services/` | What |
|---|---|---|
| `index` | `asset-index.ts` | The asset index: one record per asset (id, pack, bake status and error, source hash, output hash, kind, size, clips, variants with their sheet and first frame, palette). `refresh()` rescans the disk when the last scan is older than a second; `scan()` always does; `get(id)`, `all()`. Every scan that finds a record changed, added or gone raises `revision` by one and calls the `onChange` listeners with the changed records. Persisted to `.studio-cache/index.json` (`format: "wz.studio-index/1"`). |
| `bake` | `bake.ts`, `bake-worker.ts` | Bakes in a `worker_threads` worker with the bake library of `@whz/asset-kit/node`, so the files are those of `asset bake`. `bakeAll(reason)`, `bake(ids, reason)`, `state()`; the reason is `start`, `manual` or `watch`. Runs are queued, and the index is scanned after each. An asset that does not finish in the timeout gets its worker terminated and an `error.json`; the run goes on with the next asset in a new worker. |
| `events` | `events.ts`, `http.ts` | The event hub behind `/api/events`: `publish(topic, data)`, `subscribe(listener, { lastEventId, topics })`, the ring buffer for reconnecting pages. |
| `live` | `live.ts`, `watcher.ts` | Live reload: the watcher on the assets folder, the re-bake of what changed, and what is published on the `assets` topic. `state()`, `idle()`, and `watcher.wrote(paths)` for the studio's own writes. |
| `files` | `safe-path.ts`, `http.ts` | The one path resolver: a path relative to the checkout becomes a real file under the output folder, or is refused (`..`, absolute paths, backslashes, anything outside the folder, symlinks that leave it). |
| `config`, `project` | `config.ts` | The settings above, and the asset-kit project (root, assets folder, output folder). |

Code under `packages/studio/app/` imports **only types** from the services: it is reloaded by
Vite and bundled for the browser, while the services live as long as the process. A later note
that needs a long-lived thing adds a service in `createServices`
(`packages/studio/server/services/index.ts`).

## Live reload

The owner watches results appear while Claude writes them (D22):

```text
a file under assets/ changes
  └─► the watcher: one batch of changed paths       (watcher.ts)
        └─► index.scan(): the changed assets are stale now
              └─► the bake worker re-bakes them      (reason "watch", the usual timeout)
                    └─► index.scan(): baked, or error
each changed record, the bake's progress ──► the event hub ──► GET /api/events ──► the pages
```

**The watcher** (`packages/studio/server/services/watcher.ts`) compares a snapshot of the
assets folder (every file's modification time and size) with the last one, every 500 ms
(`WHZ_STUDIO_WATCH_POLL_MS`). Native file events only make the next snapshot come at once.
This is what the [file-watch probe](dev-environment.md#file-watch-probe) asks
for: on the Docker bind mount a replaced file can lose its event, and a `stat` sees every
write. Changes are held back until no file changed for 200 ms, at most 1 s, so a burst of
writes or a file written in pieces is **one batch** and one bake run. Changes that come while
a batch is baking are the next batch. Dot files, `node_modules`, and names ending in `~`,
`.tmp` or `.swp` are not watched.

**What a batch re-bakes** (`toBake` in `packages/studio/server/services/live.ts`):

- every asset whose output is not from its current source files: the edited ones (their stamp
  files are in their folder, so in their source hash), new ones, and any left stale before;
- for a changed `assets/palettes/<id>.json`: every asset drawn with that palette, and every
  asset whose last bake failed (the palette may have been why);
- a removed asset folder: its output under `build/assets/` is removed.

Shared code outside an asset's folder (`packages/asset-kit`, a helper file two assets import)
is not followed: press **Bake all** after changing it. Which palette an asset uses is read from
its atlas, so an asset that never baked is not found by its palette. A generator that never
returns is stopped by the bake timeout and becomes an error card; the next batch bakes as
usual.

**The stream.** `GET /api/events` is one Server-Sent Events stream for every topic
(`?topics=assets` picks some; `assets` is the only topic so far, and a later note adds its
own to `TOPICS` in `packages/studio/server/services/events.ts`). It starts with `hello`
(`{ boot, state }`: the name of this server process, and whether files are being written, the
bake in flight, the index revision, whether the folder is watched). Every later event is named
after its topic and has the id `<boot>-<n>`. A browser that reconnects sends the last id it
saw (`Last-Event-ID`, or `?lastEventId=`) and gets what it missed from a ring buffer of the
last 256 events. If that cannot be done (the server was restarted, or more was missed) it gets
one `reset` event and loads its data again. A comment line every 20 s keeps the connection
open. Every open tab holds one connection, and a browser opens about six per host over
HTTP/1.1: with more studio tabs than that open at once, the next one waits.

The payloads of the `assets` topic (`AssetsEvent`):

| `type` | Fields | When |
|---|---|---|
| `changed` | `revision`, `changed` (whole index records), `added` and `removed` (ids) | A scan found records changed, whoever asked for it: the watcher, a bake run, a page load. |
| `bake` | `running`: the progress of the bake run in flight (`reason`, `total`, `done`, `current`), or `null` when it ended | A bake run started, moved or ended. |
| `activity` | `writing` | Files are changing and their batch is not handled yet (`true`), or all of it is (`false`). |

**The pages.** `LiveEvents` in the app shell opens the stream once per tab and feeds a store
(`packages/studio/app/lib/live.ts`, `packages/studio/app/live.tsx`). A gallery card and the
asset page read their asset through `useAsset(record, revision)`: the loader's record, or the
one from an event if that is from a later index revision. So an event about one asset renders
one card again, and the only request is the card's new image (its URL carries the new hash);
the other cards fetch nothing. Loaders are asked again only where a list or a count may have
changed: the gallery when an asset appeared or went away, or a filter is on; the asset page
when its asset is gone; the dashboard after every change and every bake run. A loader returns
`revision: index.revision` with its records and the page passes it to `useLoaderRevision`.

The light at the right of the top bar says `live`, **`Claude is writing…`** while a batch is
in flight (from the first changed file until its re-bake is done), `connecting…` without a
connection, or `live reload off`.

**Echo suppression.** A service that writes a file under `assets/` itself (the verdicts note
is the first) calls `services.live.watcher?.wrote([path])` right after the write, before
anything is awaited. The file's new state becomes the watcher's baseline, so the write is not
reported back as a change. A later change of the same file by someone else is reported.

### Guards

Both sit in front of the whole app, so a route added later is covered without doing anything.

- **Host check**, every request: the `Host` header must name `127.0.0.1`, `localhost` or `[::1]`
  (or a name from `WHZ_STUDIO_ALLOWED_HOSTS`). This stops DNS rebinding: another site cannot
  read the studio through a name it controls.
- **Write guard**, every request that is not GET, HEAD or OPTIONS: the `Origin` header must be
  present and must be the origin the request was sent to. A form or `fetch` from another site
  is refused with 403, and so is a write without an `Origin` (curl needs
  `-H "Origin: http://127.0.0.1:4100"`).

In dev mode Vite also serves source files to the browser (its `/@fs/` URLs). It may serve only
`packages/studio`, `node_modules` and the four workspace packages the browser side is built
from (`packages/runtime`, `packages/asset-kit`, `packages/voxel-kit`, `packages/det`); the list
is `server.fs.allow` in `packages/studio/vite.config.ts`. A workspace package is a symlink in
`node_modules` that Vite serves from its real folder, so each one is named there. The rest of
the checkout (the task notes, `CLAUDE.md`, the other packages, the tools) is refused with 403.
A note that imports another workspace package into browser code adds that package's folder to
the list and to `packages/studio/test/dev-server.test.ts`.

## Checks

`./dev npm run check` runs the package's `check` script: React Router's type generation, the
typecheck of the app and of the server, ESLint, a production build, and the tests in
`packages/studio/test/`:

- the index over fixture assets (statuses, the cache file), the bake worker (the same bytes as
  the bake library, the timeout, the queue), the path resolver and the guards, alone and over
  HTTP;
- live reload: the watcher's snapshots, debounce and batching, with the time passed in, and
  over a real folder (`watcher.test.ts`); the event hub's ids and ring buffer, and
  `/api/events` over HTTP with `Last-Event-ID` (`events.test.ts`); the whole path over a temp
  checkout with the real watcher and bake worker (`live.test.ts`): an edited generator is
  re-baked alone, a burst of 50 new assets is one batch whose output equals a fresh bake of
  everything, a generator that never returns becomes an error and the studio goes on, a
  changed palette or stamp re-bakes its users only; and the page's store
  (`app-live.test.ts`);
- `server.test.ts`: the real `server.ts` as a process in production mode over the fixture
  assets, read through its HTML: the gallery lists every asset, the broken fixture is an error
  card, the filters and zooms, the asset page, the dashboard and **Bake all**, the greeting of
  `/api/events` and a bake run pushed to an open stream;
- `dev-server.test.ts`: the real `server.ts` as a process in dev mode: which source files Vite
  hands to a browser (the four workspace packages and the studio's own code) and which it
  refuses (everything else of the checkout).

What only a browser shows (HMR, the console, that images are sharp, that a card updates
without a reload and the other cards fetch nothing) is checked in the host's
Chrome through the Chrome DevTools MCP tools against a studio on a `127.0.0.1` port
([dev-environment.md](dev-environment.md#no-gpu-in-containers)).
