# The studio

The studio is the local web app where the owner sees every generated asset (D4, D6). It is the
package `packages/studio`: React Router 8 in framework mode with server rendering, on the
official custom Node server template (Express), React 19 and Vite (D9). It runs in Docker like
everything else (D16).

So far it has the app shell, the asset index, the gallery, the asset page with the
[animation player](#the-player) and the owner's [verdicts](#verdicts), a [task note from a
rejection](#task-notes) and the read-only queue page, the bake button and
[live reload](#live-reload): a file written under `assets/` is re-baked and shows in the open
pages by itself. The other pages are later notes in [tasks/README.md](../tasks/README.md);
each adds its own route and navigation entry.

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
| `build/studio/presets/<id>/` | written by the studio's bake | The preview sheet of every preset of the asset (`<preset>.png`, in the atlas's layout, rendered with the first variant seed) and `presets.json` (`format: "wz.studio-presets/1"`: the source and palette hashes it was made for, the seed, the sheets and their output hashes, or `error`). The command line's bake never writes it; the studio's does, after every successful bake of the asset. Removed with the asset's output. |
| `.studio-cache/index.json` | written | A copy of the asset index (below). Derived and gitignored: delete it and it comes back. |
| `assets/<pack>/<name>/review.json` | written by a verdict | The owner's verdicts on the asset ([verdicts](#verdicts)). The only file the studio writes under `assets/`; the watcher is told, so the write is not a change. Not in the asset's source hash. Committed. |
| `tasks/<date>-<slug>.md`, `tasks/README.md` | written by **Create task** on a rejected verdict | A task note in the format of `tasks/README.md` (an exclusive create: never over another file) and its row in the Queue table ([task notes](#task-notes)). Read for `/tasks`. Committed. |
| `reviews/INBOX.md` | written by a verdict, on start, and after every change of the index | The generated inbox: what is rejected, commented, changed since a verdict, approved. Claude reads it first (`CLAUDE.md`). Committed. |
| `packages/studio/build/`, `packages/studio/.react-router/` | written by the package's build and typecheck | The built app and React Router's generated route types. Gitignored. |

Nothing else is written.

## Pages

| URL | What |
|---|---|
| `/` | Dashboard: asset counts by bake status and by kind, the **Bake all** button with the result of the last run, and the bake errors that are on disk now. |
| `/gallery` | Every asset as a card: its first clip playing (first variant seed; the first frame as a still image until the sheet is loaded), its bake status and its verdict, and **Approve** / **Reject** under it. A card follows its asset ([live reload](#live-reload)). Filters by pack, kind, bake status, verdict (`review=`: `unreviewed`, `approved`, `rejected`, `comment`, `changed`) and text (every word must be in the id, the kind or a clip name), and the zoom: 1×, 2×, 3× or 4×. The filters and the zoom are in the URL (`/gallery?pack=examples&kind=sprite&review=rejected&q=dot&zoom=2`), so a view can be reloaded and scripted. An asset whose bake failed is an error card with the message; one without output says so. |
| `/asset/<pack>/<name>` | One asset: meta (kind, size, pivot, hashes, params, presets), the palette, the clip table, [the player](#the-player): the asset animated at an integer zoom, every variant seed and preset side by side, the pixel inspector, and the [verdict panel](#verdicts). `?zoom=`, `?clip=` and `?facing=` choose where the player starts. The page follows its asset: after a re-bake it shows the new record and the new frames in place, and the player keeps its clip, time and zoom. `POST` with `intent=verdict` is a verdict; with `intent=task` it writes a [task note](#task-notes) from one of the asset's rejected verdicts (**Create task…** in the history). |
| `/tasks` | The work queue, read-only: every note in `tasks/` with its row number, title, gate, priority, size and dependencies, in the queue's order ([task notes](#task-notes)). A note without a row, or with a `REMAINING` block, is marked. The list follows the files ([live reload](#live-reload), the `tasks` topic). |
| `/api/files/<path>` | A build output by its path relative to the checkout, read-only, e.g. `/api/files/build/assets/examples/blinking-dot/atlas.json`. With `?h=<key>` the answer is cached for good; without it the browser revalidates. The pages use `<output hash>.<palette hash>` as the key (`imageKey` in `packages/studio/app/lib/assets.ts`): the output hash alone does not change when only a palette's colours do. |
| `/api/events` | The event stream of [live reload](#live-reload) (Server-Sent Events). |

Pixel art is always shown at a whole multiple of its size with `image-rendering: pixelated`
(the `PixelImage` component); nothing scales it by a fraction. The previews of the player and
the cards go further: the zoom is a whole number of **device** pixels (`deviceScale` in
`packages/studio/app/lib/scene.ts`), so on a 2× display a 4× preview is 8 device pixels per
pixel, never 7.5.

## The player

The player is the studio's first use of the runtime (D10, D22): what the owner sees is drawn
by `@whz/runtime`'s WebGL2 backend from the baked atlas and sheets, exactly as a game draws
them. The still images stay in the page as the content of each preview until its sheet is
loaded (and for good without WebGL2).

**One context per page.** The WebGL context limit of a browser is about sixteen per page, and
a gallery has more cards than that. So the page has one canvas, the full size of the document,
in the `#preview-layer` element of the app shell, above the content and under the pointer
(`pointer-events: none`); it moves with the scroll. Every preview is an element in the page
(`<div class="preview" data-preview="<name>">`, the size of its picture); the **preview host**
(`packages/studio/app/preview/host.ts`) draws each registered element's frame into the
element's rectangle of the canvas (one native target per preview, presented with a scissor
rectangle) in one `requestAnimationFrame` loop. Only visible previews are drawn
(`IntersectionObserver`), and a frame that shows what the last one showed is skipped; the loop
stops when nothing is registered. A lost context is restored by the browser; the host resets
the backend and goes on. The host never asks React for a frame: a preview gives it a function
that says which frame is on now, so thirty cards animate without a render.

**What a preview draws** is pure code (`packages/studio/app/lib/scene.ts`), tested with the CPU
backend, which is the reference of the WebGL one: the draw list of one frame of a clip at the
pivot, with the onion skin under it (the frame before in red, the frame after in blue, the
colours half mixed with the tint, as palette rows 1 and 2 of the preview's palette table). The
pixel inspector reads the sheet's palette indices, not the screen.

**The model** (`packages/studio/app/lib/player.ts`) is pure too: the selected clip and facing,
the time in the clip, play or pause, the speed, loop, zoom, background, grid and onion skin,
driven by the real time the host passes in. Which frame a time is, is asked of the runtime's
`sampleClip`, as in a game. A clip that does not loop holds its last frame and stops; play
from there starts over. A re-bake (`setAsset`) keeps the clip, facing, time, zoom, speed and
the rest when the new atlas still has them.

On the page:

- play / pause, one frame back or on, the timeline (one segment per frame, as wide as the
  frame is long, with its number and its ms; drag or click to scrub; the playhead and the time
  move every frame);
- speeds 0.1×, 0.25×, 0.5×, 1×, 2× (keys **1** to **5**), loop, the clip and the facing;
- zoom 1× to 16× (**+** / **−**), the pixel grid (from 4× up), the onion skin, the background:
  checker, dark, light or floor tiles (a CSS tile pattern: there is no floor asset yet);
- the pixel inspector: point at the picture and read x, y, the palette slot, its name and its
  colour. The slot names come from the palette file in `assets/palettes/` when its hash is the
  one the asset was baked with; otherwise the page says the names are unknown;
- **Variants:** every variant seed, then every preset, at 4× on the same clock; click one to
  put it in the player. The presets are rendered by the studio's bake
  (`build/studio/presets/`, above) with the first variant seed; an asset baked only by the
  command line has none until **Bake all**, and the page says so;
- **1× in context:** the same variants at the size of the game, on the floor tiles;
- keys: **space** play or pause, **←** / **→** one frame, **+** / **−** zoom, **1** to **5**
  speed. They are the page's keys when no control has the focus.

**For scripts** (a check in the browser, a blind verifier), every page with a preview has
`window.__studio` (`packages/studio/app/preview/api.ts`):

```js
__studio.preview.stats(); // { contexts: 1, canvases: 1, previews, visible, drawn, draws, frames, pixelRatio, canvas, contextLost }
__studio.preview.list(); // [{ id, live, zoom, nativeSize }] in page order
__studio.preview.readNative("main"); // { id, width, height, pixels }: the native framebuffer of a preview, RGBA, top row first
__studio.player; // the model of the asset page: state(), time(), play(), pause(), seekFrame(n), step(±1), setClip(name), setSpeed(0.25), …
```

A preview's name is `main` for the player, the variant's id (`seed-<n>`, `preset-<name>`,
`1x-<id>`) in the grids, and the asset id on a gallery card. `readNative` of a stepped frame
is the frame's own PNG pixel for pixel; that is the check a verifier runs, never a screenshot.

## Verdicts

The owner's verdicts go back into the repo for the generator (D7, D21): approve, reject or
comment, on the asset page (under the player) and on a gallery card (**Approve** / **Reject**,
one click). Keys on the asset page: **A** approves what is shown, as it is; **R** and **C**
open the form on reject or comment, with the cursor in the comment (⌘/Ctrl + Enter saves).
The form carries the fixed reasons (readability, silhouette, palette, proportions, animation
timing, style mismatch, other), the comment, and, when ticked, the frame the player is on.
Every verdict records the variant in the player (its seed, and the preset when one is
shown) and the **output hash the page showed**: a verdict is on what the owner saw, not on
what is on disk when it is written.

**`assets/<pack>/<name>/review.json`** is the source of truth, **written only by the studio**
(`packages/studio/server/services/reviews.ts`): atomic (a temp file in the same folder,
then a rename), append-only, one verdict after the other (two quick verdicts lose nothing):

```json
{
  "format": "wz.review/1",
  "asset": "examples/blinking-dot",
  "verdicts": [
    { "id": "v-20261007T013012-1", "at": "2026-10-07T01:30:12Z", "status": "rejected",
      "outputHash": "9d7e2a6f0c1b4e58", "sourceHash": "3f2a9c1e7b6d0a44",
      "variant": { "seed": 1, "preset": null }, "tags": ["palette", "silhouette"],
      "comment": "Too dark; the sparkle merges with the dot.", "frame": 1, "task": null }
  ]
}
```

`status` is `approved`, `rejected` or `comment`; `task` is the note made from the verdict
([task notes](#task-notes)), the one field written after the verdict. The file is not in the asset's source hash
(it never makes the asset stale), and the watcher is told about the write (echo suppression),
so a verdict is not a change. The index reads it with the asset: a record carries `review`
(the status of the last verdict, `changed`, the count, the last verdict and the whole list),
and the pages show the badge (`approved`, `rejected`, `commented`, or `changed since …`),
the state and the history.

**Changed since verdict:** the asset's output hash now is not the hash of its last verdict.
A re-bake that leaves the pixels as they were (a comment in the program) changes nothing; one
that changes them marks the asset until the owner looks again. An asset without output now
is not "changed" (there is nothing to compare), but its last verdict still shows.

**`reviews/INBOX.md`** is generated from every review file: the rejected with their reasons
and comments, the comments, what changed since a verdict (the verdict's hash and the hash
now), the approved (with "do not change without the owner's consent"). It is rewritten after
every verdict, on start, and after every change of the index (a re-bake can make an asset
"changed since verdict"); it is written only when its text differs, and "Updated" is the time
of the latest verdict, not the clock, so the same files give the same text. Its header says it
is generated and must not be edited. The rules for the generator are in `CLAUDE.md`
("Verdicts"): read the inbox first, never write these files, never change an approved asset
without the owner's consent, report a library change that alters approved outputs.

## Task notes

A rejected verdict can become a task for a session (D8, D22): **Create task…** next to it in
the history of the asset page opens a form prefilled from the verdict (`draftTask` in
`packages/studio/app/lib/tasks.ts`): a title (the asset and the reasons), a file name made
from it, the priority and size, and the note's body: **Origin** (the asset, the output hash,
the verdict, the reasons, the owner's comment quoted, and where the review sheets are:
`./dev npm run asset -- review <id>` and `build/review/<id>/`), **Read first**, **Scope**
(the comment as item 1), **Out of scope** and **Acceptance** ("the owner approves the asset in
the studio"). The owner edits any of it and creates.

The studio then writes, in this order (`packages/studio/server/services/tasks.ts`):

1. **the note** `tasks/<today>-<slug>.md` in the format of
   [tasks/README.md](../tasks/README.md#note-format) (the title in caps with the date, the
   header line with `GATE: none` and `Depends on: none`, the body) with an **exclusive
   create** (`wx`): a name that exists gets `-2`, `-3`, …, and nothing is ever overwritten;
2. **the queue row** in `tasks/README.md`: above the `queue:end` marker, with the number the
   `queue:last-number` line gives next, and that number written into the line (the parser is
   the repo's own `tools/task-queue`, so the studio and `/implement-tasks` read the same table;
   a table the tool cannot parse is refused before the note is written);
3. **the link** in the verdict: its `task` field is the note's path, written through the review
   service (serialized, atomic). The history shows "→ tasks/…", and so does the inbox line of a
   rejected asset. A verdict gets one note; the body must have the five sections in order.

The note is then the owner's task like any other: a session takes it from the queue, edits it
in the repo if needed, and deletes it in the commit that does the work. The studio never edits
or deletes notes. The gate checks a note the studio wrote like every other
([docs-check.md](docs-check.md)); the test runs that check on what the studio wrote.

**`/tasks`** lists the queue from the files, in the table's order: the row number, the title,
the gate (open or what it waits for), the priority, the size and the dependencies, and marks a
note without a row (the gate fails on it) and a note with a `REMAINING` block. The server
watches `tasks/` like `assets/` (the `tasks` topic of [live reload](#live-reload)): a note
written by a session, or by the studio, shows without a reload.

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
| `live` | `live.ts`, `watcher.ts` | Live reload: the watcher on the assets folder, the re-bake of what changed, and what is published on the `assets` topic. `state()`, `idle()`, and `watcher.wrote(paths)` for the studio's own writes. A second watcher, on `tasks/`, publishes the `tasks` topic (made in `index.ts`). |
| `tasks` | `tasks.ts` | The task notes: `list()` (the queue from the files, for `/tasks`) and `create(assetId, verdictId, input)` (the note, the queue row, the link in the verdict). |
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
(`?topics=assets,tasks` picks some; `assets` is the live reload of the assets folder, `tasks`
says a file under `tasks/` changed (the pages ask the `/tasks` loader again); a later note adds
its own to `TOPICS` in `packages/studio/server/services/events.ts`). It starts with `hello`
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

**Echo suppression.** A service that writes a file under `assets/` itself (the review
service is the one) calls `services.live.watcher?.wrote([path])` right after the write,
before anything is awaited. The file's new state becomes the watcher's baseline, so the write
is not reported back as a change. A later change of the same file by someone else is reported.

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
- verdicts (`reviews.test.ts`): review.json as written (every field, append-only, no temp
  file left, a bad input refused before writing), the state and "changed since verdict", the
  inbox text (sections, deterministic), and the service in a running studio: a verdict lands in
  the file, the inbox and the index without waking the watcher; three verdicts at once lose
  nothing; a generator change that changes the pixels marks the asset changed and one that
  does not, does not; the inbox is rewritten on start; the gallery's verdict filter
  (`app-lib.test.ts`);
- task notes (`tasks.test.ts`): the note format is the one of `tasks/README.md` (labels and
  sections), the input and its refusals, the exclusive create (the same name again is
  suffixed, nothing overwritten), the queue row and the `queue:last-number` line, the list in
  queue order, the draft from a verdict, and the service in a running studio: the note, the
  row, the link in the verdict and the inbox, the same verdict refused a second note, two
  creates at once, a note written by hand seen by the watcher; every created note passes the
  repo's docs check (`@whz/docs-check` run on the scratch checkout);
- the player: its model with the time passed in (`app-player.test.ts`: frames, speeds,
  stepping, the end of a clip, the keys, what a re-bake keeps); what a preview draws, through
  the runtime's CPU backend over a baked fixture (`app-scene.test.ts`: every frame of every
  clip equals the kit's frame PNG, the onion skin, the pixel inspector, the device-pixel
  placing); the variants and their URLs (`app-variants.test.ts`); the preset previews of the
  studio's bake and the palette slot names (`presets.test.ts`);
- `server.test.ts`: the real `server.ts` as a process in production mode over the fixture
  assets, read through its HTML: the gallery lists every asset, the broken fixture is an error
  card, the filters and zooms, the asset page with the player as rendered (the start from the
  URL, the variants, one preview per thing), a verdict posted to the asset page (the file, the
  inbox, the badge on the page and the card, the verdict filter; refused without the studio's
  own `Origin`, and with the reason for a bad one), the dashboard and **Bake all**, the
  greeting of `/api/events` and a bake run pushed to an open stream (the fixture assets are
  copied into the temp checkout, so the verdicts land there);
- `dev-server.test.ts`: the real `server.ts` as a process in dev mode: which source files Vite
  hands to a browser (the four workspace packages and the studio's own code) and which it
  refuses (everything else of the checkout).

What only a browser shows (HMR, the console, that images are sharp, that a card updates
without a reload and the other cards fetch nothing, and everything WebGL: that
`readNative` of a stepped frame equals the baked frame, the timing of the speeds, thirty
cards on one context) is checked in the host's Chrome through the Chrome DevTools MCP tools
against a studio on a `127.0.0.1` port
([dev-environment.md](dev-environment.md#no-gpu-in-containers)), through `window.__studio`
([the player](#the-player)). A gallery of thirty assets for that: a scratch assets folder
under `.studio-cache/` (gitignored) with copies of `assets/examples/blinking-dot`, each with
its own id, and a second studio on another port:
`./dev -p 4107 env WHZ_STUDIO_PORT=4107 WHZ_STUDIO_ASSETS=.studio-cache/many/assets WHZ_STUDIO_OUT=.studio-cache/many/build WHZ_STUDIO_CACHE=.studio-cache/many/cache npm run dev -w @whz/studio`.
