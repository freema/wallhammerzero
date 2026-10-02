# The studio

The studio is the local web app where the owner sees every generated asset (D4, D6). It is the
package `packages/studio`: React Router 8 in framework mode with server rendering, on the
official custom Node server template (Express), React 19 and Vite (D9). It runs in Docker like
everything else (D16).

This is the skeleton: the app shell, the asset index, the gallery, the asset page and the bake
button. Live reload, the animation player, verdicts and the other pages are later notes in
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
gallery has thumbnails on a fresh checkout. After that nothing is baked by itself until the
live-reload note lands: press **Bake all** on the dashboard, or run
`./dev npm run asset -- bake --all`. A page load always shows what is on disk now.

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
| `WHZ_STUDIO_ALLOWED_HOSTS` | none | Extra host names for the Host check, comma separated. |
| `NODE_ENV` | `development` | `production` serves the built app (`npm run build`, then `npm start`, in the package). |

They are read in `packages/studio/server/services/config.ts`. The Compose service passes none
of them: it uses the defaults.

## What it reads and writes

| Path | Access | What |
|---|---|---|
| `assets/` (every folder with a `gen.ts`) | read | Which assets exist, and the hash of their source files. The server never runs an asset program itself. |
| `build/assets/<id>/` | read; written by a bake | `atlas.json`, the sheets and frames, or `error.json` of a failed bake ([asset-pipeline.md](asset-pipeline.md#bake)). Served read-only under `/api/files/`. |
| `.studio-cache/index.json` | written | A copy of the asset index (below). Derived and gitignored: delete it and it comes back. |
| `packages/studio/build/`, `packages/studio/.react-router/` | written by the package's build and typecheck | The built app and React Router's generated route types. Gitignored. |

Nothing else is written. The studio does not touch `assets/` (verdict files come with the
verdicts note).

## Pages

| URL | What |
|---|---|
| `/` | Dashboard: asset counts by bake status and by kind, the **Bake all** button with the result of the last run, and the bake errors that are on disk now. |
| `/gallery` | Every asset as a card with the first frame of its first variant. Filters by pack, kind, bake status and text (every word must be in the id, the kind or a clip name), and the zoom: 1×, 2×, 3× or 4×. The filters and the zoom are in the URL (`/gallery?pack=examples&kind=sprite&q=dot&zoom=2`), so a view can be reloaded and scripted. An asset whose bake failed is an error card with the message; one without output says so. |
| `/asset/<pack>/<name>` | One asset: meta (kind, size, pivot, hashes, params, presets), the palette, the clip table, and the baked sheet of every variant at an integer zoom (1× to 8×, `?zoom=`). The animation player replaces the still sheet later. |
| `/api/files/<path>` | A build output by its path relative to the checkout, read-only, e.g. `/api/files/build/assets/examples/blinking-dot/atlas.json`. With `?h=<output hash>` the answer is cached for good; without it the browser revalidates. |

Pixel art is always shown at a whole multiple of its size with `image-rendering: pixelated`
(the `PixelImage` component); nothing scales it by a fraction.

**Bake status** of an asset: `baked` (the output was made from the current source files),
`stale` (the source files changed since), `error` (the last bake failed) and `unbaked` (no
output). The source hash covers the asset's own folder only
([asset-pipeline.md](asset-pipeline.md#atlasjson-format-wzatlas1)), so after a change to shared
code or a palette press **Bake all**. The kind, size and clips of an asset come from its atlas:
an asset without one has the kind `unknown`.

## The server

`packages/studio/server.ts` is the process: Express, the guards, the files endpoint, then Vite
(dev) or the built app (production). It creates the **services** once and hands them to every
loader and action through the router context:

```ts
import { studioContext } from "../context.ts";

export function loader({ context }: Route.LoaderArgs) {
  const { index, bake } = context.get(studioContext);
  return { assets: index.refresh(), running: bake.state().running };
}
```

| Service | File in `packages/studio/server/services/` | What |
|---|---|---|
| `index` | `asset-index.ts` | The asset index: one record per asset (id, pack, bake status and error, source hash, output hash, kind, size, clips, variants with their sheet and first frame, palette). `refresh()` rescans the disk when the last scan is older than a second; `get(id)`, `all()`. Persisted to `.studio-cache/index.json` (`format: "wz.studio-index/1"`). |
| `bake` | `bake.ts`, `bake-worker.ts` | Bakes in a `worker_threads` worker with the bake library of `@whz/asset-kit/node`, so the files are those of `asset bake`. `bakeAll(reason)`, `bake(ids, reason)`, `state()`. Runs are queued. An asset that does not finish in the timeout gets its worker terminated and an `error.json`; the run goes on with the next asset in a new worker. |
| `files` | `safe-path.ts`, `http.ts` | The one path resolver: a path relative to the checkout becomes a real file under the output folder, or is refused (`..`, absolute paths, backslashes, anything outside the folder, symlinks that leave it). |
| `config`, `project` | `config.ts` | The settings above, and the asset-kit project (root, assets folder, output folder). |

Code under `packages/studio/app/` imports **only types** from the services: it is reloaded by
Vite and bundled for the browser, while the services live as long as the process. A later note
that needs a long-lived thing (a watcher, an event hub) adds a service in `createServices`
(`packages/studio/server/services/index.ts`).

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
`packages/studio` and `node_modules` (`server.fs.allow` in `packages/studio/vite.config.ts`),
not the rest of the checkout. A note that imports another workspace package into browser code
adds that package's folder there.

## Checks

`./dev npm run check` runs the package's `check` script: React Router's type generation, the
typecheck of the app and of the server, ESLint, a production build, and the tests in
`packages/studio/test/`:

- the index over fixture assets (statuses, the cache file), the bake worker (the same bytes as
  the bake library, the timeout, the queue), the path resolver and the guards, alone and over
  HTTP;
- `server.test.ts`: the real `server.ts` as a process in production mode over the fixture
  assets, read through its HTML: the gallery lists every asset, the broken fixture is an error
  card, the filters and zooms, the asset page, the dashboard and **Bake all**.

What only a browser shows (HMR, the console, that images are sharp) is checked in the host's
Chrome through the Chrome DevTools MCP tools against a studio on a `127.0.0.1` port
([dev-environment.md](dev-environment.md#no-gpu-in-containers)).
