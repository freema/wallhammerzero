# STUDIO SKELETON + GALLERY (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** docker-dev-environment, asset-render-cli

## Origin
D4, D6, D9, D22: the studio is the main product. It is a local web app (Node + React Router
framework mode) where the owner sees every generated asset. This note builds the app shell and a
static gallery; live reload, the player and verdicts are separate notes.

## Read first
- `research/studio-stack.md` §1 (React Router 8.4 framework mode, why v8, Node ≥ 22.22 → Docker),
  §1.4–1.6 (custom Node server, SSR, loaders/actions with local files), §2.5 (big galleries),
  §8 (architecture sketch: routes, modules, data ownership).

## Scope
1. `packages/studio`: React Router **8.4** framework mode, SSR, the official custom Node server
   template, React 19, Vite. Runs as a Compose service `studio` in Docker on a fixed port,
   published on **127.0.0.1 only** (docker-dev-environment convention). Dev mode with HMR.
2. Server services (loaded once, passed through the router context):
   - **asset index:** scans `assets/**/gen.ts` + `build/assets/**/atlas.json`, keeps id, kind,
     size, clips, variants, source hash, output hash, bake status/errors. Persisted to
     `.studio-cache/index.json` (gitignored);
   - **file serving:** read-only `/api/files/*` for `build/` outputs with a safe path resolver
     (no `..`, no symlinks out of the repo).
   - **write guard** for later notes: write endpoints accept only same-origin requests (Origin +
     Host check).
3. Routes: `/` (dashboard: asset counts by kind and status, last bake errors), `/gallery`
   (grid of all assets with first-frame thumbnails at an integer zoom the owner picks, 1×–4×;
   filter by pack, kind and text), `/asset/:id` (a page with meta, clips, variants and the
   static sheet; the player replaces it later).
4. A **Bake all** button on the dashboard that calls the bake library from asset-render-cli in a
   `worker_threads` worker with a timeout, and shows errors.
5. Pixel art is shown with `image-rendering: pixelated` at integer scales only.
6. `npm run check` covers studio typecheck and server tests (index, path resolver, guard).
   `docs/studio.md`: how to start it, ports, folders it reads and writes.

## Out of scope
- Live reload (`studio-live-reload`), animation player (`studio-animation-player`), verdicts
  (`studio-verdicts`), task creation (`studio-task-from-rejection`), concept pages
  (`studio-concept-pages`), audio (`studio-audio`), play and builds (`studio-play-and-builds`).
  Each later note adds its own route and nav entry.
- Running Claude Code inside the studio (D5: later maybe; the studio runs in Docker and Claude
  Code on the host, so it needs its own design).

## Acceptance
- `docker compose up studio` → `http://127.0.0.1:<port>/gallery` lists every asset under `assets/`
  with a thumbnail; the port is not reachable on the LAN address.
- Path traversal requests to `/api/files/` are refused (test).
- A broken asset (throws in `render`) shows as an error card with the message, and the rest of the
  gallery still renders.
- Blind verifier (Chrome DevTools MCP on the host): gallery loads with no console errors; the
  filters work.
