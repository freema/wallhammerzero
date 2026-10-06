# @whz/studio

The studio: the local web app where the owner sees every generated asset. React Router 8 in
framework mode (server rendering) on a custom Node server, React 19, Vite. How to start it, its
port, pages, services and guards: [docs/studio.md](../../docs/studio.md).

```sh
./dev compose up studio               # http://127.0.0.1:4100, dev mode with HMR
./dev npm run check -- @whz/studio    # typegen, typecheck, lint, build, tests
```

| Path | What |
|---|---|
| `server.ts` | The process: Express, the guards, `/api/files`, `/api/events`, then Vite (dev) or the built app. Creates the services once. Node runs it as it is. |
| `server/services/` | The long-lived services: `config.ts`, `asset-index.ts`, `bake.ts` + `bake-worker.ts` (+ `presets.ts`: the preset previews the studio's bake renders), `reviews.ts` (the owner's verdicts: review.json and the inbox), `safe-path.ts`, `guard.ts`, `http.ts`, and live reload: `watcher.ts`, `events.ts`, `live.ts`; `index.ts` puts them together (`createServices`). |
| `server/app.ts` | The React Router request handler. Hands the services to loaders and actions as `context.get(studioContext)`. |
| `app/` | The app: `root.tsx` (shell, navigation, the preview layer), `routes.ts`, `routes/` (dashboard, gallery, asset), `components.tsx`, `lib/assets.ts` (filters, counts, URLs), `lib/live.ts` and `live.tsx` (the page's side of live reload: the store, the hooks, the light in the top bar), `app.css`. Imports only types from the services. |
| `app/verdicts.tsx`, `app/lib/reviews.ts` | The verdict badge, the quick buttons of a card and the panel of the asset page (the form, keys A / R / C, the history); the filter and the form's fields, pure. |
| `app/lib/player.ts`, `app/lib/scene.ts`, `app/lib/variants.ts` | The player without the browser: the model (time, frames, speeds, keys), what a preview draws (the draw list, the onion skin, the pixel inspector, device-pixel placing) and what of an asset is previewed. Pure; tested in Node with the runtime's CPU backend. |
| `app/preview/` | The browser side: `host.ts` (one WebGL2 context and one canvas per page, every preview a rectangle of it), `sheets.ts` (loading atlases and sheets, shared and cached), `preview.tsx` (the preview element), `player.tsx` (the player section of the asset page), `api.ts` (`window.__studio` for scripts). |
| `test/` | Server and library tests and fixture assets (`fixtures/assets`: two that bake and one that throws; `fixtures/hang`: one that never returns). |

Adding a page: a route module in `app/routes/`, its line in `app/routes.ts`, its entry in `NAV`
in `app/root.tsx`. Adding a long-lived thing: a service in
`server/services/index.ts`. Pushing something to open pages: a topic in `server/services/events.ts`. A write endpoint needs no check of its own: the write guard is in
front of the whole app.
