# Studio stack research (Wallhammer Zero)

*Research date: 2026-10-02. Status: research only. Nothing here is a decision. The architecture in section 8 is a proposal.*

**Scope.** The studio is a local web app (Node + React Router framework mode). It shows generated assets, above all animations and FX, so the owner can check them. It writes verdicts and comments back to the repo for the next Claude Code session, creates `tasks/` notes, shows concept pages and triggers builds. It may later host Claude Code.

**Phase order (owner, 2026-10-02).**
1. 2D pixel-art sprite, animation and FX previews (Kairosoft-style sims).
2. Voxel games, also rendered as pixel art: 3D/voxel previews and the seed browser. These come later.

**Legend.**
- **[F]**: a fact, with a source linked inline or in *Sources*.
- **[O]**: my opinion or recommendation.
- **[?]**: uncertain or not verified this session. Check it before relying on it.

All package versions were checked on 2026-10-02 against the npm registry and the official docs.

---

## Executive summary

1. **[F] React Router v8 is the current major.** 8.0.0 shipped on 2026-06-17 and 8.4.0 on 2026-09-15. v8 is v7 framework mode with the `future.v8_*` flags turned on by default, plus ESM-only output and always-on middleware. v7 (7.18.4) still gets security fixes, with no end date announced. **[O]** "RR7 framework mode" in 2026 means starting on v8.
2. **[F] Blocker: RR8 needs Node ≥ 22.22.0, and this Mac runs Node v22.21.1.** That version also misses the Jan and Mar 2026 Node security releases. **[O]** Upgrade Node to 22.23.x or 24 LTS, then use RR 8.4. If Node cannot change, RR 7.18.x runs on Node ≥ 20.
3. **[F] Remix 3.0.0 is a separate project.** It was published on npm on 2026-10-01 (the release had been announced for today at Remix Jam). It is React-free and needs Node ≥ 24.3. **[O]** It does not fit this studio now.
4. **[O] Run SSR mode (the default) on 127.0.0.1 with the official custom Node server template.** Server loaders and actions do the file I/O. Resource routes serve files and the SSE stream. **[F]** SPA mode removes server loaders and actions at runtime, so it would need a second API server.
5. **[O] Live reload pipeline.** One watcher in the server process (chokidar 5 or @parcel/watcher), then per-path debounce, batching and content hashing, then an in-memory index, then one SSE stream. The client patches only the cards that changed. **[F]** Claude Code `http` hooks and the `Monitor` tool can add exact "Claude changed X / turn finished" signals in both directions.
6. **[F] Browsers cap active WebGL contexts.** Chrome desktop and Safari allow about 16 and silently drop the oldest. **[O]** Use one shared context per page and draw each preview into its own scissor/viewport rectangle. Three.js's official example draws 40 scenes with one renderer this way. The runtime must therefore support rendering into a given rectangle or target and sampling at an explicit time, with no rAF of its own.
7. **[O] Pixel-perfect pipeline.** Render every preview at its native pixel size into a small framebuffer, then upscale by whole-number factors with nearest-neighbour sampling. This makes the following cheap: scrubbing, slow motion, onion skins, palette swaps (a palette lookup table), side-by-side variants and thumbnails (`readPixels`). The same pipeline later serves voxel scenes rendered as pixel art.
8. **[O] How AI-written asset programs run.**
   - Each program is a pure, seeded module: `(params, seed) → frames/data`.
   - The server compiles it with esbuild and serves it under a content-hash URL.
   - In the browser it runs in a worker pool inside a sandboxed iframe with an opaque origin. In Node it runs in `worker_threads` with `resourceLimits`.
   - A watchdog terminates runaway jobs. **[F]** Browsers offer no practical memory cap.
9. **[O] Verdicts.** The studio is the only writer of per-asset `review.json` sidecar files. Each verdict is bound to the asset's content hash. The studio also generates `reviews/INBOX.md` as Claude's entry point. All studio writes use temp file + rename. **[F]** On newer models, Claude Code's Write tool can overwrite a file it never read, so file-ownership rules matter.
10. **[O] Claude Code under the studio**, in realistic order:
    - (a) Keep the terminal next to the studio and integrate through files, hooks and a studio CLI.
    - (b) Dispatch background sessions with the real CLI (`claude --bg`, `claude agents --json`).
    - (c) Embed the real `claude` CLI with xterm.js 6 + node-pty 1.1. **[F]** Signing in with your own subscription is explicitly allowed for the unmodified binary.
    - (d) Agent SDK 0.3.x for scripted jobs. **[F]** The docs tell developers to use API keys for it.
11. **[O] Later phase.** Voxel previews and the seed browser plug into the same preview host as an extra backend. A render service lets both the studio and Claude Code request frames: `POST /api/render`, plus a `/__shot` alias like sakura-crossing's, driven by a Playwright Chromium page. **[F]** Chrome 139 removed the automatic SwiftShader fallback, so WebGL needs real GPU access. Confirm that headless WebGL works on the M4 with a small spike first.
12. **[F] JS `Math` precision varies by engine and OS.** **[O]** Programs get a seeded RNG and are forbidden `Math.random`/`Date.now`. Seeds are stored together with a generator version or hash. Generation runs on the CPU and the GPU only displays.

---

## 1. React Router framework mode, October 2026

### 1.1 Versions (npm registry, 2026-10-02)

| Package | Latest | Published | Engines / peers |
|---|---|---|---|
| `react-router` (tag `latest`, v8) | 8.4.0 | 2026-09-15 | node ≥ 22.22.0; react/react-dom ≥ 19.2.7 |
| `react-router` (tag `version-7`) | 7.18.4 | 2026-09-15 | node ≥ 20.0.0; react ≥ 18 |
| `@react-router/dev` 8.4.0 | 8.4.0 | 2026-09-15 | peer vite ^7 \|\| ^8; typescript ^5 \|\| ^6 \|\| ^7 |
| `@react-router/dev` 7.18.4 | 7.18.4 | 2026-09-15 | peer vite ^5.1 \|\| ^6 \|\| ^7 \|\| ^8 |
| `vite` | 8.3.2 | – | node ^20.19 \|\| ≥ 22.12 |
| `react`, `react-dom` | 19.3.0 | 2026-09-09 | – |
| `remix` | 3.0.0 | 2026-10-01 22:58 UTC | node ≥ 24.3.0; no React dependency |

**[F] What v8 changed** ([changelog](https://reactrouter.com/changelog.md), [v8 blog post](https://remix.run/blog/react-router-v8)):
- Released 2026-06-17 as a "deliberately boring" major.
- New baselines: Node 22.22.0+, React 19.2.7+, Vite 7+. ESM-only.
- Middleware is always on.
- `future.v8_*` flags removed; their behaviour is now the default.
- `react-router-dom` removed; import from `react-router` / `react-router/dom`.
- `splitRouteModules` is now a top-level option and on by default.
- Custom servers must return a `RouterContextProvider` from `getLoadContext`. Plain objects are no longer accepted.
- The team now plans yearly majors in June, aligned with Node EOL.
- v6 and Remix v2 reached end of life with the v8 release. Quote: "React Router v7 will continue to receive security updates", with no end date given.

**[F] Point releases after 8.0:**
- 8.1 (2026-06-29): `create-react-router` can install a React Router *Agent Skill* (useful for Claude sessions that write studio code).
- 8.2: web-streams default server entry for non-Node runtimes.
- 8.4: more granular internal router contexts, so fewer re-renders; unstable route-pattern matching.
- 7.18.0 (2026-06-16): the CSRF check for actions now compares against the host in the request URL.

### 1.2 Relation to Remix v2 and "Remix 3"

- **[F]** "React Router v7 is the next major version of Remix after v2" ([upgrade guide](https://reactrouter.com/upgrading/remix)). Framework mode is Remix's loaders/actions/Vite plugin under the React Router name. "Framework Mode wraps Data Mode with a Vite plugin" ([modes](https://reactrouter.com/start/modes)).
- **[F] Remix 3 timeline** ([RC post](https://remix.run/blog/remix-3-release-candidate)):
  - Beta preview on 2026-04-30, release candidate on 2026-08-31.
  - The RC post said "we will release Remix 3" on 2026-10-02 at Remix Jam.
  - npm `remix@3.0.0` appeared on 2026-10-01 at 22:58 UTC, with `engines.node ≥ 24.3.0` and no React dependency.
  - It has its own UI/component runtime ("you can even swap our `render` middleware with a React-based one").
  - The v8 post frames the two projects as "One team. Two projects."
- **[O]** Remix 3 is a new, React-free framework that is one day old and needs Node 24. React Router is the React framework from the same team, released on a steady cadence. The studio wants the React ecosystem (virtualized grids, terminal wrappers, form libraries), so React Router is the right base.

### 1.3 The Node version on this machine

- **[F]** `node --version` on this Mac prints **v22.21.1**. RR 8.x declares `engines.node ≥ 22.22.0`.
- **[F]** Node 22.22.0 (2026-01-12) and 22.22.2 (2026-03-24) were security releases. Current 22.x is 22.23.3 (2026-09-23). Current 24 LTS ("Krypton") is 24.21.0 (2026-09-07) ([nodejs.org/dist/index.json](https://nodejs.org/dist/index.json)).
- **[F]** Other packages also assume newer Node: `write-file-atomic@8` wants `^22.22.2`, and `remix-utils@10` wants ≥ 22.22.0 plus RR8.
- **[?]** By default npm only warns on an `engines` mismatch (it does not fail the install). Running below the declared minimum is still unsupported.
- **[O]** Upgrade Node (for security anyway), then start on **RR 8.4**. Fallback: RR 7.18.4 on the current Node. It works and is patched, but you would start a new project on the previous major and face a v8 migration later. The migration is small; all v8 breaking changes can be adopted in v7.

### 1.4 Recommended setup for a local-only tool

- **[F]** The official `node-custom-server` template ([server.js](https://github.com/remix-run/react-router-templates/blob/main/node-custom-server/server.js)):
  - In dev, Express mounts Vite in `middlewareMode` and loads the app with `ssrLoadModule`.
  - In prod, it imports the built server and serves `build/client`.
- **[O]** Use the custom server from day one. The studio needs long-lived singletons: the watcher, asset index, SSE hub, render queue, build jobs and later a PTY. These must outlive Vite's SSR module reloads; created inside route modules they get duplicated on every server HMR. A WebSocket upgrade (needed later for a terminal) also needs the raw HTTP server. Hand the services to loaders and actions through `getLoadContext`, which returns a `RouterContextProvider` in v8 **[F]**.
- **[O]** Use an npm-workspaces monorepo, with the shared runtime as a package (`packages/runtime`) imported by the games and the studio. **[F]** Vite "treats the linked dep as source code" for workspace packages not resolved from `node_modules` ([Vite deps](https://vite.dev/guide/dep-pre-bundling)). Edits to the runtime therefore hot-reload in the studio, which meets "preview with the same runtime code the games use".
- **[O]** Settings: `ssr: true` (default), no prerendering, listen on `127.0.0.1` only, a fixed port, and `.studio-cache/` (gitignored) for derived data.

### 1.5 Loaders and actions with local files

- **[F]** Resource routes are route modules that export a `loader`/`action` and no default component. They can return any `Response`: files, JSON, streams and SSE. GET goes to the `loader`; POST, PUT, PATCH and DELETE go to the `action` ([resource routes](https://reactrouter.com/how-to/resource-routes)).
- **[F]** `allowedActionOrigins` "does not apply to resource routes" ([config](https://reactrouter.com/api/framework-conventions/react-router.config.ts)).
- **[F]** Vite's dev server checks the `Host` header against `server.allowedHosts` to stop DNS-rebinding attacks. It listens on `localhost` by default ([Vite server options](https://vite.dev/config/server-options)).
- **[O]** The production-mode Express server must do these checks itself:
  - Bind to 127.0.0.1.
  - Keep a Host allowlist.
  - Check `Origin` on every mutating request.
  - Require a per-launch token header on writes and on the later terminal/agent endpoints.
  - Resolve every path through one `safeResolve(repoRoot, p)` that rejects `..` and symlinks leading out of the repo.
- **[O]** Loaders read from the in-memory index, not from disk on every request. Actions go through a write service that is the single writer (see §5).

### 1.6 SPA mode vs SSR

- **[F]** SPA mode (`ssr: false`): only the root `loader` runs, at build time. At runtime there are only `clientLoader`/`clientAction` and no server loaders or actions. Routes must still be SSR-safe ([SPA mode](https://reactrouter.com/how-to/spa)).
- **[O]** For this studio SSR mode is simpler. One process handles file I/O, SSE and rendering, with no separate API server. The SSR cost on localhost is negligible. WebGL previews mount on the client inside effects; the server renders only placeholders.
- **[F]** `useRevalidator()` re-runs loaders on demand ([docs](https://reactrouter.com/api/hooks/useRevalidator)). It is good for coarse refreshes; see §2.4 for the fine-grained path.

---

## 2. Live reload of the gallery when Claude writes files

### 2.1 Choosing a watcher

| Option | Facts | Notes [O] |
|---|---|---|
| **chokidar 5.0.0** | [F] ESM-only, Node ≥ 20.19. v4 dropped glob support and the bundled `fsevents` and now uses Node `fs.watch`. Options: `awaitWriteFinish` (defaults 2000 ms / 100 ms), `atomic` (default true), `ignored` as a function ([repo](https://github.com/paulmillr/chokidar)) | Pure JS; Vite already uses chokidar (`server.watch` takes chokidar options) |
| **@parcel/watcher 2.6.0** | [F] Native module; FSEvents backend on macOS; "only one notification will be emitted per file"; `getEventsSince()` snapshots; used by VS Code, Nx, Nuxt ([repo](https://github.com/parcel-bundler/watcher)) | Snapshots let the studio diff what Claude changed while the studio was off; adds a native dependency |
| **Node `fs.watch({recursive})`** | [F] Recursive mode works on macOS; the filename is not guaranteed; events can fire more than once ([Node fs](https://nodejs.org/docs/latest-v22.x/api/fs.html)) | Too low-level on its own |

**[O]** Start with chokidar 5 behind a small interface. Persist an index (`path → mtime, size, sha256`) to `.studio-cache/index.json`; on start-up, re-stat and re-hash only what changed. Switch to @parcel/watcher if start-up diffs on large trees get slow.

### 2.2 Event pipeline: debouncing bursts and partial writes

**[O]** Pipeline:
1. Filter raw events: ignore `node_modules`, `.git`, `.studio-cache`, build output, temp and swap files.
2. Apply a trailing debounce per path (150–250 ms).
3. Flush a global batch after about 100 ms of quiet, or at most every 1 s.
4. `stat` each file. If mtime and size are unchanged, skip it; otherwise compute its sha256.
5. Classify by path rule: asset program, manifest, output, review, task, concept, game code, runtime.
6. Update the index and its dependants. Use esbuild's metafile to know which asset programs import a changed helper, and invalidate all of them.
7. Send **one** SSE message per batch, with an `id:`.
8. Suppress echoes: ignore events whose new hash equals a hash the studio just wrote itself.

**Bursts.** If Claude regenerates 30 sprites, the client receives one batch event that lists 30 IDs.

**Partial writes.**
- **[?]** Claude Code's docs do not say whether its Write tool writes atomically.
- **[O]** If a JSON or TS parse fails right after an event, retry two or three times about 300 ms apart before showing an error. Don't use chokidar's `awaitWriteFinish` with its 2 s default; it adds visible latency.

**Vite overlap.**
- **[F]** Vite watches project files by default and ignores `.git/`, `node_modules/`, `test-results/` plus its cache and output directories ([server.watch](https://vite.dev/config/server-options)).
- **[O]** Don't load asset programs through Vite's module graph (see §4.5). If the asset folders sit under Vite's root, add them to `server.watch.ignored` so Vite does not trigger reloads.

### 2.3 Transport: SSE vs WebSocket vs Vite HMR events

| Option | Facts | Fit [O] |
|---|---|---|
| **SSE from a resource route** (`text/event-stream` `ReadableStream`) | [F] Resource routes can return streams/SSE. [F] Over HTTP/1.1, browsers allow only 6 SSE connections per browser + domain, across all tabs ([MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)) | **Best fit.** The gallery only needs server → client pushes; client → server goes through actions/`fetch`. Use one connection per tab and multiplex topics. Replay missed events with SSE `id:` + `Last-Event-ID` ([HTML Standard](https://html.spec.whatwg.org/multipage/server-sent-events.html)) from a ring buffer |
| **WebSocket** (`ws` 8.22 on the custom server) | Needs the raw server | Only needed later, for a terminal (PTY) |
| **Vite custom HMR events** (`server.ws.send` / `import.meta.hot.on`) | [F] Supported in the plugin API ([Vite plugin API](https://vite.dev/guide/api-plugin)) | Dev only, and it couples the studio to Vite; avoid |

**[?]** The template's `compression` middleware may buffer `text/event-stream` responses. Exempt SSE from compression and flush after each event.

### 2.4 Partial updates on the client

**[O]**
- Don't revalidate the whole gallery on every batch.
- Keep a small client store (`useSyncExternalStore`) keyed by asset ID, holding `{hash, status, thumbKey, error}`. The loader seeds it, SSE patches it, and each card subscribes only to its own ID.
- Use `useRevalidator()` only for structural changes: assets added or removed, new games, new filters.
- **[F]** RR 8.4 cut router-context re-renders, but the per-card store is still the main lever.
- When a visible animated asset's hash changes, reload its program in its worker. Keep the current time, parameters and the last frame on screen until the new output is ready (no flicker). Show a short "updated" badge.

### 2.5 Big galleries

- **Virtualization.** **[F]** `@tanstack/react-virtual` 3.14.13. **[O]** Use it above a few hundred cards. For medium galleries, CSS `content-visibility: auto` is enough **[F]** (Chrome 85, Firefox 125, Safari 18, per [MDN BCD](https://github.com/mdn/browser-compat-data)).
- **Static thumbnails vs live previews.** **[O]** Every card has a static thumbnail. Live animation runs only for cards that are visible *and* (hovered, selected, or covered by an "animate visible" toggle), with a cap of about 64 to 128.
- **Cache keys.** **[O]** `key = H(program bundle hash, params, seed, runtime version, view preset)`. Files go to `.studio-cache/thumbs/<key>.png`, served with `Cache-Control: immutable`. A content change produces a new key, so there is never a stale cache.
- **Who renders thumbnails.** **[O]** CPU-only 2D programs (most sprites) render in Node `worker_threads` and are PNG-encoded there, with no browser involved. Shader FX: the visible client renders frame N, reads back its small native-size target, and POSTs the PNG to the cache. Later the render service does this (§7.5).
- **Display.** **[F]** `image-rendering: pixelated` is supported in Chrome 41+, Firefox 93+ and Safari 10+. **[O]** Scale thumbnails by whole-number CSS factors only.

### 2.6 Exact signals from Claude Code (optional, in both directions)

**[F] Hooks.** Claude Code hooks include `PostToolUse`, `PostToolBatch`, `Stop`, `SessionStart` and `FileChanged`. A handler can be `type: "http"`, which POSTs the event JSON to a URL. `SessionStart` and `UserPromptSubmit` can inject `additionalContext` into Claude's context ([hooks](https://code.claude.com/docs/en/hooks)).

**[F] Monitor.** Claude Code's `Monitor` tool "runs a command in the background and feeds each output line back to Claude… Can also open a WebSocket" ([tools reference](https://code.claude.com/docs/en/tools-reference)).

**[O]** Possible integrations, all of which are project config the owner must approve:
- **Studio → Claude at session start:** a `SessionStart` command hook that outputs the `reviews/INBOX.md` summary, so a fresh session sees open verdicts.
- **Claude → studio:** a `PostToolBatch` + `Stop` http hook that POSTs to `127.0.0.1:<port>/api/hooks/claude`. The studio can then show "Claude finished a turn, 12 assets changed, review now". The watcher stays the source of truth; hooks add intent and timing.
- **Studio → Claude live:** Claude can `Monitor` `curl -N …/api/events?topic=reviews` and react to new verdicts while the owner reviews.

---

## 3. Previewing 2D animations and FX with the own WebGL runtime (Phase 1)

### 3.1 The hard constraint: WebGL context limits

| Browser | Active-context limit | Behaviour on overflow |
|---|---|---|
| Chrome (desktop) | 16 (long-standing; [Chromium review](https://codereview.chromium.org/14217005/)). [F] Current Blink code keeps separate main-thread and worker limits that come from GPU preferences ([source](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc)). [?] The exact current values and the worker limit were not verified | [F] "WARNING: Too many active WebGL contexts. Oldest context will be lost." |
| Safari / WebKit | 16 ([WebKit commit](https://webkit.googlesource.com/WebKit/+/70e10861eb2fbd9d0862fd8702874c25ae5d8bfd)) | The oldest context is lost |
| Firefox | [?] 300 per principal, 1000 total ([bug 1628193](https://www.bugzilla.mozilla.org/show_bug.cgi?id=1628193)) | – |

**[O]** "One canvas + one context per card" breaks after about a dozen cards. It also re-uploads the same shaders and textures for every card.

### 3.2 Rendering options

| Option | How | Pros / cons |
|---|---|---|
| A. Many canvases, many contexts | One context per card | Simplest. Breaks above ~16 contexts and duplicates GPU resources. OK only for 1–4 big inspector views |
| **B. One overlay canvas + scissor** | One page-sized canvas behind or over the grid. Each card registers a DOM element. Per frame: `getBoundingClientRect` → skip if offscreen → set viewport + scissor → draw. [F] [WebGL Fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-multiple-views.html); [F] three.js [`webgl_multiple_elements`](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_multiple_elements.html) draws 40 scenes with one renderer, `setScissorTest(true)`, and a canvas moved by `translateY(scrollY)` | Proven, with one shared resource set. [O] Edge cases: scroll containers (intersect with the container's rect), popovers above the canvas, resize and `devicePixelRatio` |
| **C. One hidden context, copy to per-card canvases** | Render each card at native size, then `drawImage(glCanvas → card 2D canvas)` with `imageSmoothingEnabled=false`. Or use `OffscreenCanvas.transferToImageBitmap()` with an `ImageBitmapRenderingContext` per card | DOM-native layering and any scroll container work. It costs one copy per card per frame, which [O] is cheap at pixel-art sizes (32–64 px frames). [F] OffscreenCanvas/`transferToImageBitmap`/bitmaprenderer: Safari 16.4; WebGL in OffscreenCanvas: Safari 17 |
| D. Render in a worker | `transferControlToOffscreen` (Safari 16.4) | Frees the main thread, but DOM rects must be posted every frame. [?] Workers may get a lower context limit. Not worth it for tiny pixel-art frames |

**[O] Recommendation.** "Render small, display big":
1. The runtime renders each preview at its **native resolution** into a small framebuffer (for example a 48×48 sprite frame or a 320×180 scene).
2. A compositor upscales it by a whole-number factor: B (scissor blit to the overlay) or C (copy into the card's canvas).
3. Before committing, run a one-day spike of B vs C with 100 animated cards on the M4 Pro in Chrome and Safari. I lean C for simplicity if it holds 60 fps.

Inspector views (1–4 large previews) can use B on their own overlay.

### 3.3 What the shared runtime needs to provide (input for the runtime author)

**[O]** To preview "with the same runtime code the games use", the runtime should:
1. **Not own the frame loop or the canvas.** It draws when told to, into a given target, viewport and scissor rectangle.
2. **Use explicit time.** `sample(t)` for keyframed animation; `step(dt)` with a fixed timestep for simulations and FX. **[F]** Fixed dt with an accumulator and interpolation ([Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/)).
3. **Render to a target at native resolution**, with a nearest-neighbour integer upscale blit.
4. **Share and reference-count resources** (shaders, textures) across previews.
5. **Handle context loss.** `webglcontextlost`/`restored` must re-upload resources.
6. **Use palette indirection.** Indexed textures plus a palette lookup texture (LUT), and tint/alpha uniforms for onion skins.
7. **Take RNG by injection.** No `Math.random`.
8. **Have a headless entry point**: the same code callable from a `/render-host` page (§7.5).

### 3.4 React integration

**[O]**
- A `<PreviewHost>` provider at the app root owns the context, the compositor and the single rAF loop.
- `<Preview id params time variant />` registers its DOM element and a draw callback through a ref. An `IntersectionObserver` turns it on and off.
- Register/unregister must be idempotent so React StrictMode's double mount is safe.
- Never drive per-frame updates through React state. Time lives in a mutable store, and UI widgets such as the scrubber subscribe at a low rate.
- **[F]** `ResizeObserver` `devicePixelContentBoxSize` is not supported in Safari (MDN BCD). **[O]** Compute device-pixel rects as `round(cssRect × devicePixelRatio)` and snap viewports to whole pixels.

### 3.5 Review tools

All **[O]**:
- **Frame-by-frame scrubbing.**
  - Timeline with frame ticks; `,` and `.` step one frame; a loop-range selection.
  - A **filmstrip** that draws all frames side by side, i.e. the sprite-sheet view.
  - Because time is explicit, scrubbing is exact. For stateful FX, scrubbing backwards replays from 0 or from cached snapshots taken every N steps.
- **Slow motion.** Time scale from 0.05× to 4×. It is exact, with no frame blending.
- **Onion skinning.** Draw frames n−k…n+k under the current frame with fading alpha and a tint (past red, future blue).
- **Palette-swap preview.**
  - Show a row of palette variants of the same animation, playing in sync.
  - "Palette lint": colour count, off-palette pixels, single-pixel noise.
- **Side-by-side variants.** N previews share one time controller. Variants can differ in params, seed or palette, or be **versions**: the last approved hash vs the current hash. Before/after comparison is probably the most valuable review view, so keep approved bundles in the cache by hash.
- **Pixel-perfect zoom.**
  - Whole-number zoom from 1× to 16×, nearest-neighbour sampling.
  - A pixel grid from 4× up.
  - Hover inspector showing x, y, palette index and RGBA.
  - Background toggles: checker, game colours, dark/light.
  - Anchor, pivot and hitbox overlays.
- **FX checks.**
  - Loop-seam view (last frame → first frame).
  - Additive blending on dark and light backgrounds.
  - Particle and draw-call counters.
  - Bounds check: does the FX stay inside its declared box?

---

## 4. Running AI-written asset programs live with parameter sliders

### 4.1 Threat model

**[O]** Claude writes the programs in the owner's repo.
- **Likely failures:** infinite loops, runaway memory, huge outputs, accidental `fetch` or filesystem calls.
- **Less likely, but real:** prompt-injected code that calls the studio's own write endpoints. It would run on the same origin as those endpoints.

Design for the accidents, and make the malicious case hard.

### 4.2 Program contract

**[O]** Proposal:

```ts
export const meta   = { id: "worker-walk", kind: "sprite-anim", size: [32, 32], frames: 8, fps: 10 };
export const params = { hue: { type: "number", min: 0, max: 360, default: 20 }, /* … */ };
export function generate(ctx: { seed: number; params: P; rng: Rng; palette: Palette }): FrameSet;
```

- Pure: no DOM, no WebGL, no I/O.
- The output is **data**: indexed pixel buffers, palette, frame timing, anchors, or a declarative FX description.
- The runtime turns that data into textures and particles. The same module therefore runs in a browser worker, in Node (`worker_threads`) for baking and thumbnails, and in the game build.

### 4.3 Where programs execute

| Option | Facts | Assessment [O] |
|---|---|---|
| Plain Web Worker (same origin) | Can `fetch` the studio API | Not enough isolation on its own |
| **Workers inside a sandboxed iframe** (`sandbox="allow-scripts"`, no `allow-same-origin`) | [F] Without `allow-same-origin`, content is treated as "a special origin that always fails the same-origin policy". Never combine `allow-scripts` with `allow-same-origin` for same-origin content ([MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)) | **Recommended for the browser.** Add CSP `connect-src 'none'` on the iframe document and talk to the parent via `postMessage` with transferables. [?] Spike whether module workers from `blob:` URLs work inside the opaque-origin iframe in Chrome and Safari |
| QuickJS-in-Wasm (`quickjs-emscripten` 0.32) | [F] `setMemoryLimit()`, interrupt handler / `shouldInterruptAfterDeadline()` ([repo](https://github.com/justjake/quickjs-emscripten)) | Hard limits, but it is an interpreter and much slower than JIT for pixel loops. Keep it as an option for untrusted third-party code only |
| **Node `worker_threads`** | [F] `resourceLimits` (`maxOldGenerationSizeMb`, …). Hitting them terminates the worker; `ArrayBuffer`s are not counted; `worker.terminate()` ([Node docs](https://nodejs.org/docs/latest-v22.x/api/worker_threads.html)) | **Recommended for baking and thumbnails** |
| Node child process with `--permission` | [F] Stable since v22.13.0; a "seat belt" that "does not provide security guarantees in the presence of malicious code" ([Node permissions](https://nodejs.org/docs/latest-v22.x/api/permissions.html)) | Optional extra guard against accidental writes |

**[F]** Browsers give no practical memory cap. `performance.measureUserAgentSpecificMemory()` is experimental and needs cross-origin isolation ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory)).

**[O]** Defence in depth: write endpoints require the per-launch token header (kept in main-thread memory only), so sandboxed code cannot write even if it reaches the API.

### 4.4 Timeouts and memory

**[O]**
- **Budgets per job type:** thumbnail about 2 s, full animation about 10 s, configurable.
- **Watchdog:** workers send heartbeats and progress messages. On timeout, call `terminate()`, start a new worker, and show "timed out at frame k" on the card.
- **Output validation before GPU upload:** maximum dimensions, frame count, palette size and total bytes.
- **After a failure:** re-run in a fresh worker. In Node, also apply `resourceLimits`.

### 4.5 Hot reload of a program

**[O]**
1. The server compiles `gen.ts` with **esbuild** (0.28.2): `bundle: true`, `format: "esm"`, platform neutral, with a metafile for the dependency graph.
2. The output is cached by content hash and served at `/api/programs/<hash>.js` with an immutable cache header.
3. When the file changes, the hash changes. SSE notifies the client, which tells the worker to `load(url)`; the worker `import()`s it.
4. The old module stays active until the new one passes validation. Time and params are kept.
5. Compile errors (esbuild diagnostics) appear inline on the card. They are also available to Claude through the API/CLI.

Keep asset programs **out of Vite's module graph** (no `import.meta.glob` of asset code). This avoids Vite full reloads, behaves the same in a production build, and lets one compile path serve the browser, Node bake and the render service.

**Slider changes.** Debounce about 50 ms, cancel stale jobs by job ID, and render progressively: first frame, then the rest.

### 4.6 Parameter sliders

**[O]**
- Generate controls from the exported `params` schema: number/int/colour/enum/bool/seed.
- Actions: lock seed, randomize, reset, copy params as JSON.
- "Save as preset" writes to the studio-owned sidecar.
- "Send to Claude" attaches the current params JSON to a verdict comment.

### 4.7 Determinism

- **[O]** Pass a seeded PRNG (an sfc32/xoshiro-class generator) in `ctx`. In the worker, override `Math.random`, `Date.now` and `performance.now` to throw, so non-determinism shows up immediately.
- **[F]** "Many `Math` functions have a precision that's implementation-dependent… different browsers can give a different result. Even the same JavaScript engine on a different OS or architecture can give different results!" ([MDN Math](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math)).
- **[O]** For outputs that must reproduce across engines (Node bake vs Safari, seeds shared later with players), keep transcendental `Math` out of decision paths. Use integer hash noise and quantize early. Generate on the CPU and use the GPU only for display.
- **[O]** Golden hashes: record the hash of the pixel output per (asset, seed, params) and flag "output changed but the program didn't" (for example when the runtime or a helper changed).

---

## 5. Verdicts and comments back to the repo

### 5.1 Facts that shape the design

- **[F] Claude Code Edit tool:** exact string replacement. On newer models, a file that changed on disk since Claude read it can still be edited if `old_string` still matches exactly once.
- **[F] Claude Code Write tool:** overwrites the whole file. Newer models can overwrite an existing file they never read, under the same conditions ([tools reference](https://code.claude.com/docs/en/tools-reference)). A stale full rewrite by Claude can therefore erase studio data.
- **[F] POSIX `rename()`:** an existing `new` "shall remain visible… and refer either to the file referred to by *new* or *old*" ([POSIX](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html)). Writing a temp file in the same directory and renaming it gives readers all-or-nothing.
- **[F] Claude Code can see PNGs.** The Read tool returns images as visual content and downscales large ones.
- **[F] Hooks can inject context** into a session via `additionalContext`.
- **[F] git's `union` merge driver** keeps lines from both sides "in random order" and warns "Do not use this if you do not understand the implications" ([gitattributes](https://git-scm.com/docs/gitattributes)).

### 5.2 Format options

| Format | Claude reads it | Concurrency | Git | Querying |
|---|---|---|---|---|
| **Per-asset sidecar JSON** | Easy: small and next to the asset | Contention only per asset | Small diffs; conflicts only if the same asset changes on two branches | Studio aggregates into its index |
| Single ledger JSON | One file | Every verdict rewrites the same file, which collides with any Claude edit | Conflict-prone | Trivial |
| Append-only JSONL log | Claude must fold events to get current state | Appends are cheap, but Claude's Write could rewrite the whole file | `union` merge works, in random order | Needs replay |
| Markdown / frontmatter per asset | Most natural for Claude | Same as sidecar | Readable diffs | Needs a parser |
| **Generated digest `reviews/INBOX.md`** | Best entry point | Read-only for Claude | Derived; commit or ignore | – |

**[O] Recommendation.**
- Per-asset `review.json` sidecars are the source of truth, and the studio is their only writer.
- A generated `reviews/INBOX.md` is Claude's entry point.
- `tasks/` notes cover anything bigger than "fix this asset".

### 5.3 Proposed shapes (illustrative only)

`assets/<pack>/<asset-id>/review.json`:

```json
{
  "asset": "sim/staff/worker-walk",
  "verdicts": [
    {
      "id": "v-20261002T0931-7f3a",
      "at": "2026-10-02T09:31:12Z",
      "hash": "sha256:5c1e…",
      "verdict": "rejected",
      "comment": "Feet slide on frames 3–4; hair loses 1px outline on frame 6.",
      "frames": [3, 4, 6],
      "params": { "hue": 22 },
      "task": null
    }
  ],
  "presets": [{ "name": "night shift", "params": { "hue": 210 } }]
}
```

`reviews/INBOX.md` (regenerated on every change):

```md
# Review inbox (generated by the studio. Do not edit.)
Updated: 2026-10-02T09:31Z · open: 3 · changed since verdict: 1

## Rejected
- sim/staff/worker-walk: hash 5c1e… · frames 3,4,6 · "Feet slide on frames 3–4; …"
  source: assets/sim/staff/worker-walk/gen.ts · thread: …/review.json

## Changed since verdict (needs owner re-review)
- fx/coin-pop: verdict on 91aa… · now 0b42…
```

### 5.4 Concurrency rules

**[O]**
1. **One writer per file.**
   - The studio owns `review.json`, `INBOX.md` and seed bookmarks.
   - Claude owns asset sources, manifests and `notes.md`.
   - `tasks/` notes: the studio creates them; after that Claude may change `status`.
2. **Atomic writes.** Write `.<name>.<random>.tmp` in the same directory, then `rename`. A 15-line helper avoids `write-file-atomic@8`'s Node `^22.22.2` requirement.
3. **Optimistic concurrency** for any file the studio edits but does not exclusively own (task notes, concepts). The load returns a content hash and the save sends it back. On mismatch the server returns 409 plus the fresh content, and the UI shows a diff.
4. **Verdicts are bound to hashes.** A verdict on hash A never silently applies to hash B. When Claude regenerates an asset, the studio marks it "changed since verdict". Claude never needs to touch review state.
5. **Echo suppression** in the watcher (§2.2).
6. **Claude's reply channel.** A Claude-owned `notes.md` in the asset folder, shown next to the verdict thread, or a `studio reply` CLI command that POSTs to the studio (which stays the single writer).
7. **Owner-written convention** (CLAUDE.md, not written by me): "Never edit `review.json` or `reviews/INBOX.md`. Read the INBOX at session start."

### 5.5 Git-friendliness

**[O]**
- Pretty-printed JSON with stable key order and a trailing newline.
- Append-only arrays.
- ISO-8601 UTC timestamps and time-prefixed, sortable IDs.
- No volatile fields (last viewed, UI state) in committed files; those go to `.studio-cache/`.
- Avoid a single big ledger; it conflicts across branches and worktrees.
- `INBOX.md` is derived, so either gitignore it and regenerate on start, or commit it as a snapshot. This is the owner's call.

### 5.6 Creating `tasks/` notes from the UI

**[O]**
- **Name:** `tasks/2026-10-02-0931-worker-walk-feet-slide.md` (date, time, slug: one note = one task).
- **Exclusive create:** `fs.writeFile(path, data, { flag: "wx" })`, which fails if the file exists **[F]** ([Node fs flags](https://nodejs.org/docs/latest-v22.x/api/fs.html#file-system-flags)). On collision, add a suffix and never overwrite.
- **Frontmatter:** `created`, `status: open`, `source: studio`, `game`, `assets: [{id, hash}]`, `verdicts: [ids]`, `priority`.
- **Body:** what is wrong, acceptance criteria, links to renders.
- **UI:** "Create task from selected verdicts" as a bulk action. The verdict records the task ID, so the INBOX can say "→ tasks/…".

---

## 6. "Claude Code under the studio"

### 6.1 Facts

**Agent SDK** ([overview](https://code.claude.com/docs/en/agent-sdk/overview), [TS reference](https://code.claude.com/docs/en/agent-sdk/typescript), [permissions](https://code.claude.com/docs/en/agent-sdk/permissions)):
- **[F] Package:** `@anthropic-ai/claude-agent-sdk` 0.3.287, published 2026-10-01. It is pre-1.0 and installs platform binaries as optional dependencies; the docs call it "a library that runs the Claude Code binary".
- **[F] `query({prompt, options})` options:** `cwd`, `permissionMode` (`default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`, `auto`), `canUseTool`, `allowedTools`, `disallowedTools`, `settingSources` (`user`/`project`/`local`; all by default), `hooks`, `resume`/`continue`/`forkSession`, `includePartialMessages`, `abortController`, `systemPrompt` (preset `claude_code` + `append`), `additionalDirectories`, `sandbox`, `mcpServers`.
- **[F] Query methods:** `interrupt()`, `setPermissionMode()`, `streamInput()`, `close()`, ….
- **[F] Permission evaluation order:** hooks → deny rules → ask rules → permission mode → allow rules → `canUseTool`.
  - Auto-approved calls never reach `canUseTool`.
  - `allowedTools` does **not** constrain `bypassPermissions`.
  - Since TS SDK 0.3.286, omitting `permissionMode` can start in auto mode, so pass it explicitly.

**Headless CLI** ([headless](https://code.claude.com/docs/en/headless), [CLI reference](https://code.claude.com/docs/en/cli-reference)):
- **[F] Flags:** `claude -p` with `--output-format text|json|stream-json`; `--input-format text|stream-json`; `--verbose --include-partial-messages` for token streaming.
- **[F] Permissions:** `--permission-prompt-tool <mcp tool>`; `--permission-prompts none` (v2.1.259+).
- **[F] Sessions and cost:** `--resume`/`--continue`; `--max-budget-usd`; JSON output includes `total_cost_usd`.
- **[F] Bare mode:** `--bare` is recommended for scripted calls and "will become the default for `-p`". It does **not** use the subscription login, so it needs an API key.
- **[F] Without `--bare`:** `-p` runs the project's hooks and `.mcp.json` "even in a folder you've never trusted".

**Background sessions** ([CLI reference](https://code.claude.com/docs/en/cli-reference)):
- **[F]** `claude --bg "<task>"` starts a background agent. `claude agents --json` lists active sessions. `claude logs <id>`, `claude attach <id>` and `claude stop <id>` manage them.

**Terms** ([legal & compliance](https://code.claude.com/docs/en/legal-and-compliance)):
- **[F]** Developers building with the Agent SDK "should use API key authentication".
- **[F]** Anthropic does not permit third-party developers "to route requests through Free, Pro, or Max plan credentials on behalf of their users". This "does not… prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription".
- **[F]** "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent SDK."

**Terminal libraries:**
- **[F]** `node-pty` 1.1.0 ships `darwin-arm64` prebuilds and falls back to `node-gyp`. "All processes launched from node-pty will launch at the same permission level of the parent process"; it is not thread-safe ([repo](https://github.com/microsoft/node-pty)).
- **[F]** `@xterm/xterm` 6.0.0 removed the canvas renderer (use the DOM renderer or the WebGL addon) ([releases](https://github.com/xtermjs/xterm.js/releases)).

### 6.2 Options

| | A. Side by side (today) + integration | B. Background sessions via the CLI | C. Embedded terminal | D. `claude -p` stream-json | E. Agent SDK in the studio server |
|---|---|---|---|---|---|
| What it is | Claude Code in its own terminal; studio integrates through files, hooks, CLI and SSE | Studio runs `claude --bg "<task note>"`, polls `claude agents --json`, shows `claude logs` | xterm.js 6 + node-pty running the real `claude` in a browser pane | A subprocess emitting NDJSON events; custom UI | Typed messages, callbacks, sessions, interrupts |
| Permission prompts | Claude Code's own | Handled in the session; owner can `claude attach` | Claude Code's own UI inside the pane | `--allowedTools` / `--permission-mode` / `--permission-prompt-tool` / `none` | `canUseTool` → studio modal; or `dontAsk` + scoped allowlist; hooks |
| Auth | Subscription | Subscription (unmodified binary) | Subscription (unmodified binary) **[F]** allowed | Subscription without `--bare`; API key with `--bare` | **[F]** docs say API key. **[?]** Personal use with your own login is a grey zone |
| Effort | Low | Low | Medium (PTY, WS, resize, reconnect) | Medium–high | High |
| Maintenance | ~0 | Low (CLI flags are stable-ish) | Low (a terminal is generic) | Medium (event schema, flags) | Medium–high (0.x SDK churn) |
| Main risk | – | A background run doing unexpected work | **A shell-capable PTY over WebSocket is local RCE if exposed** | Same as C, plus project hooks running unattended | Same, plus misused bypass modes |

### 6.3 Safety baseline for any embedding

**[O]**
- **Network:** listen on 127.0.0.1 only. Require a random per-launch token on WS upgrade and on mutating requests. Check `Origin` and `Host` (DNS rebinding); **[F]** this is why Vite has `allowedHosts`, but your production server must enforce it itself.
- **Permissions:**
  - Never start `bypassPermissions` from the studio.
  - Use `default` + `canUseTool` → UI approval, or `dontAsk` + scoped rules such as `Edit(assets/**)`, `Bash(npm run build:*)`.
  - Deny `Bash(git push *)`.
- **Settings sources:** set `settingSources` / `--setting-sources` explicitly, so it is clear whether user-level plugins and hooks load.
- **Lifecycle:** one session per job, an abort button (`interrupt()`/SIGINT), cost caps (`--max-budget-usd`), and a log of `total_cost_usd`.

### 6.4 Assessment

**[O]**
- **Now:** A. Studio integration through files (§5), optional hooks (§2.6), a `studio` CLI (render, inbox, reply) and an SSE stream that Claude can `Monitor`. This delivers most of the value with no coupling.
- **Cheap next step:** B. A "Hand to Claude" button on a task note runs `claude --bg` with the note path. The session appears in the studio's activity panel, and the owner can `claude attach` in his terminal.
- **If "one window" matters:** C. It keeps all Claude Code UX (permissions, skills, slash commands) and is clean under the subscription terms.
- **Only for productised, repeatable jobs** ("Regenerate all rejected sprites in pack X"): E with an API key and a scoped tool surface. D sits between C and E; its permission UX needs an MCP permission tool.

---

## 7. Later phase: voxel previews (rendered as pixel art) and the seed browser

*Phase 2 per the owner. Another agent covers "own runtime vs Three.js". The studio should support either through a backend interface.*

### 7.1 Three.js status (if chosen)

- **[F]** `three` 0.186.1 (r186), published 2026-09-24.
- **[F]** `WebGLRenderer` is WebGL2-only: "WebGL 1 is not supported since r163".
- **[F]** The renderer accepts an existing `context`, and has `resetState()`, `setScissorTest/setScissor/setViewport` and `readRenderTargetPixels` ([source](https://raw.githubusercontent.com/mrdoob/three.js/dev/src/renderers/WebGLRenderer.js)).
- **[F]** Most new feature work lands in the WebGPU backend and TSL ([releases](https://github.com/mrdoob/three.js/releases)).

### 7.2 Voxel model previewer

**[O]**
- **Same display pipeline as 2D.** Render at native low resolution (for example 64–160 px tall) into a target with an orthographic or low-FOV camera, then upscale with nearest-neighbour sampling. Snap the camera to the texel grid so pixels don't shimmer while rotating.
- **Orbit and turntable.** Orbit controls (`three/addons` OrbitControls, or the runtime's own) for free inspection. A **turntable** mode renders fixed N angles (8 or 16) as a strip, matching how voxel-to-pixel sprites are consumed and reviewable like 2D animations.
- **Rig and animation playback.** Rigid-part hierarchies with keyframes, sampled at explicit times so scrubbing, slow motion and onion skins work exactly as in 2D. **[?]** In three.js that means `AnimationMixer.setTime(t)`; verify before relying on it.
- **Palette swaps.** Voxel colour = palette index (a vertex attribute or 3D texture). Swapping means swapping the lookup texture, and the 2D palette tooling is reused.
- **Meshing.** **[F]** Greedy meshing turns an 8×8×8 solid cube from 3,072 quads (naive) or 384 (culled) into 6 ([0fps](https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/)).
- **Pixel-art QA views.** Lighting presets, an outline pass, and a "speckle" metric (isolated single pixels).

### 7.3 Many 3D previews and coexistence with the 2D runtime

**[F]** One renderer + scissor scales to dozens of scenes (three.js example: 40). **[O]** Because everything renders to a native-res target and is then upscaled, the compositor from §3.2 is shared.

Two ways for three.js and the own runtime to coexist:
1. **Two preview backends, two contexts.** The own 2D runtime and three.js each have one context and one compositor. Two contexts is far under the limit. **Simplest.**
2. **One shared WebGL2 context.** Three.js accepts an existing context and has `resetState()` **[F]**. The own runtime would also have to save and restore GL state. Fragile; use it only if both must composite in one canvas.

Load three.js only on 3D routes; **[F]** framework mode does per-route code splitting.

### 7.4 Seed browser

**[O]**
- **Contact sheet.** N seeds (for example 6×4) × views:
  - (a) a 2D biome/height-map projection: cheap, CPU-only, great for skimming;
  - (b) the planet from orbit;
  - (c) 1–3 surface vistas at fixed lat/long/time.

  Render (a) first and (b)/(c) on demand.
- **Job scheduling.**
  - Generation runs in a worker pool of size cores − 1 (browser workers or Node `worker_threads`).
  - Visible cells get priority, and jobs cancel when scrolled away.
  - Cache key: `(generatorHash, seed, view, params)` → `.studio-cache/seeds/…png`.
  - A generator code change produces new keys; show old thumbnails dimmed until re-rendered.
- **Compare.**
  - Pin 2–4 seeds with a synced camera and time of day.
  - **A/B the same seed across two generator versions** (before/after a Claude change), with a diff overlay.
- **Bookmarks.**
  - The studio writes `games/<game>/seeds.json`: seed, label, tags, note, the `generatorHash`/version at bookmark time, and the preferred camera.
  - Claude reads it ("use seeds tagged `showcase` for screenshots").
- **Reproducibility.** A seed only means something together with a generator version. Store both. Keep generation on the CPU; see the precision fact in §4.7.

### 7.5 Headless render endpoint (shared by the studio and Claude Code)

*The brief says sakura-crossing has a `POST /__shot` dev endpoint. I could not inspect that repo, so this section does not depend on its details.*

**Facts:**
- **[F] Playwright 1.63.0.** Default headless mode uses the Chromium headless shell. `channel: 'chromium'` uses New Headless ("the real Chrome browser"). Browsers download to `~/Library/Caches/ms-playwright` unless `PLAYWRIGHT_BROWSERS_PATH` is set; `0` installs into `node_modules` ([Playwright browsers](https://playwright.dev/docs/browsers)).
- **[F] Chrome 139 removed the automatic SwiftShader fallback:** "WebGL context creation will fail instead of falling back" ([chromestatus 5166674414927872](https://chromestatus.com/feature/5166674414927872)). **[?]** It is not verified whether headless Chromium on macOS/M4 gets GPU WebGL; spike and check the `WEBGL_debug_renderer_info` renderer string.
- **[F] rAF is paused in hidden tabs.** "`requestAnimationFrame()` calls are paused in most browsers when running in background tabs or hidden `<iframe>`s" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)). A render host must drive frames explicitly and not depend on rAF.
- **[F] Claude Code image limits.** Claude Code downscales large images; fine pixel detail needs crops ([tools reference](https://code.claude.com/docs/en/tools-reference)).
- **[F] DevTools MCP.** `chrome-devtools-mcp` 1.10.1 exists, and this environment already exposes Chrome DevTools MCP tools to Claude, which is useful for ad-hoc checks of the studio UI itself.

**Design [O]:**
1. **A `/render-host` route.**
   - A minimal page that loads the same runtime and backends and exposes `window.__render(job)`.
   - It renders at native resolution and returns RGBA via `readPixels`, not a screenshot, so there is no scaling or colour-management drift.
   - Node encodes the PNG or strip.
2. **A render service in the studio server.**
   - Lazily starts one persistent Playwright Chromium, preferably with `channel: "chrome"` to use the installed Chrome, or with `PLAYWRIGHT_BROWSERS_PATH=0` (nothing written to `~/Library`).
   - Runs a small page pool and a priority queue, with results cached by key.
   - CPU-only 2D programs skip the browser and go through Node `worker_threads`.
3. **API.**
   - `POST /api/render {target: "asset:<id>"|"seed:<game>/<seed>", params, seed, frames, view, scale, layout: "single"|"strip"|"grid"}` → `{key, files[], cached}`.
   - `POST /__shot` as an alias with the same semantics, for parity with sakura-crossing.
4. **CLI for Claude.**
   - `npm run studio -- render asset:<id> --frames 0-7 --scale 4` prints PNG paths, and Claude Reads them.
   - Keep sheets about 2k px or smaller, with whole-number upscaling and crop helpers.
   - If the studio isn't running, the CLI starts the same render service in-process.
5. **Timing.** Phase 1 can live without it: the visible client renders thumbnails (§2.5). Add it in Phase 1b when Claude needs to *see* FX it wrote. It is required for the seed browser.

---

## 8. Proposed architecture sketch (proposal only, not decided)

### 8.1 Repo layout (illustrative)

```
wallhammerzero/
  packages/
    runtime/              # own WebGL runtime: games + studio (+ /render-host)
    asset-kit/            # helpers for asset programs: Rng, Palette, PixelBuffer, FrameSet, param schema
    studio/               # React Router framework-mode app + server.ts
  games/<game>/           # game code, data; seeds.json (studio-owned, Phase 2)
  assets/<pack>/<asset-id>/
    asset.json            # Claude-owned manifest (id, kind, entry, tags)
    gen.ts                # Claude-owned program
    out/                  # optional baked outputs
    notes.md              # Claude-owned replies (optional)
    review.json           # studio-owned verdicts + presets
  concepts/*.md           # game-concept pages (read/rendered by the studio)
  tasks/YYYY-MM-DD-HHMM-slug.md
  reviews/INBOX.md        # studio-generated digest for Claude
  .studio-cache/          # gitignored: index.json, programs/, thumbs/, renders/, seeds/
```

### 8.2 Server modules (studio)

| Module | Job |
|---|---|
| `server.ts` | Express; Vite middleware in dev; RR request handler; `getLoadContext` → `RouterContextProvider` with services; Host/Origin/token guard; 127.0.0.1 |
| `services/watcher` | chokidar 5 → filter → debounce → batch |
| `services/index` | Asset catalogue, hashes, kinds, dependency graph (esbuild metafile), persisted to `.studio-cache/index.json` |
| `services/events` | SSE hub with topics, event IDs, ring buffer for `Last-Event-ID` |
| `services/compile` | esbuild bundles of asset programs, keyed by hash; diagnostics |
| `services/bake` | Node `worker_threads` runner (resourceLimits + timeout) → PNG/strip |
| `services/reviews` | Single writer of `review.json`; atomic writes; INBOX generator; echo suppression |
| `services/tasks` | Exclusive create of task notes; optimistic-concurrency edits |
| `services/jobs` | Game builds (child process, single-flight per game, logs over SSE) |
| `services/render` | Phase 1b: Playwright page pool + queue + `/api/render` + `/__shot` |
| `services/claude` | Optional: hook receiver; later `--bg` dispatch / PTY / Agent SDK |

### 8.3 Client modules

| Module | Job |
|---|---|
| `preview/PreviewHost` | One context, compositor (scissor or copy), one rAF loop, rect registry, visibility |
| `preview/backends/pixel2d` | Adapter to `packages/runtime` (Phase 1); `voxel3d` later |
| `preview/time` | Time controller: play/pause, scale, step, loop range, onion, sync groups |
| `sandbox/` | Opaque-origin iframe + worker pool + watchdog + message protocol |
| `gallery/` | Virtualized grid, filters (kind, status, changed since), per-card store fed by SSE |
| `review/` | Verdict UI (approve/reject/comment, frame tags, keyboard A/R/C), before/after |
| `inspector/` | Big preview, filmstrip, zoom/grid/pixel inspector, palettes, params sliders |

### 8.4 Routes

| Route | Kind | Purpose |
|---|---|---|
| `/` | UI | Dashboard: inbox counts, recent changes, Claude activity, builds |
| `/gallery/:pack?` | UI | Grid with filters; static thumbnails + live previews |
| `/asset/:id` | UI | Inspector + verdict thread + presets + variants |
| `/compare` | UI | Side-by-side variants or versions with a synced timeline |
| `/concepts`, `/concepts/:slug` | UI | Concept pages (rendered markdown) |
| `/tasks`, `/tasks/new` | UI | Task notes; create from verdicts |
| `/builds` | UI | Trigger builds; logs |
| `/render-host` | UI (bare) | Page used by the render service |
| `/seeds/:game` | UI | Phase 2: contact sheet, compare, bookmarks |
| `/api/events` | resource | SSE stream (topics: assets, reviews, tasks, builds, claude) |
| `/api/programs/:hash.js` | resource | Compiled asset program (immutable) |
| `/api/files/*` | resource | Read-only repo files (safeResolve) |
| `/api/thumbs/:key.png` | resource | Cached thumbnails; POST to upload client-rendered ones |
| `/api/review/:assetId` | resource (action) | Write a verdict (token + Origin check) |
| `/api/tasks` | resource (action) | Create a task note |
| `/api/render`, `/__shot` | resource (action) | Render jobs (Phase 1b) |
| `/api/hooks/claude` | resource (action) | Optional Claude Code http-hook receiver |

### 8.5 Data files and ownership

| File | Writer | Readers | Format |
|---|---|---|---|
| `assets/**/gen.ts`, `asset.json`, `notes.md` | Claude | Studio | TS / JSON / MD |
| `assets/**/review.json` | **Studio only** | Claude, studio | JSON, append-only arrays, hash-bound |
| `reviews/INBOX.md` | **Studio only** (generated) | Claude (via SessionStart hook or a manual read) | Markdown |
| `tasks/*.md` | Studio creates; Claude updates `status` | Both | Markdown + frontmatter |
| `games/<g>/seeds.json` | **Studio only** | Claude, studio | JSON |
| `.studio-cache/**` | Studio | Studio, CLI | Derived; gitignored |

### 8.6 Event flows

```
Claude Code (Write/Edit) ──► filesystem ──► watcher (chokidar)
                                              │ filter → debounce/path (~200ms) → batch (~100ms)
                                              ▼
                                         index.update (stat → sha256 → classify → deps)
                                              │            ├─► compile cache invalidated (new program hash)
                                              │            ├─► thumb keys change → bake queue (CPU) / client render (GPU)
                                              │            └─► review status: "changed since verdict"
                                              ▼
                                   SSE  assets.changed {ids, hashes} ──► browser store patch
                                                                         ├─► visible cards: worker load(new hash),
                                                                         │   keep time/params, swap when ready
                                                                         └─► thumbnails re-fetched by new key

Owner verdict ──► POST /api/review (token+Origin) ──► reviews: atomic write review.json
                                                       ├─► regenerate reviews/INBOX.md
                                                       ├─► echo-suppress own write in watcher
                                                       └─► SSE reviews.changed (Claude may be Monitor-ing)

(optional) Claude Code hooks: PostToolBatch/Stop ──http──► /api/hooks/claude ──► SSE claude.activity
(optional) SessionStart hook ──► prints INBOX summary as additionalContext into a new Claude session

Phase 1b/2 render: `studio render …` (Claude) or UI ──► POST /api/render
      ├─ CPU-only program ──► Node worker_threads ──► PNG
      └─ GPU/FX/voxel ──► Playwright page /render-host ──► __render(job) ──► readPixels ──► PNG
      ──► .studio-cache/renders/<key>.png ──► paths returned (Claude Reads the PNG)
```

---

## Recommendations for Wallhammer Zero

Ordered by the owner's phases. All **[O]**.

**Phase 0: prerequisites**
1. **Upgrade Node** to ≥ 22.22 (22.23.x) or 24 LTS, then use **React Router 8.4 framework mode** with React 19.2.7+ and Vite 8. Use the `node-custom-server` template, SSR mode, and 127.0.0.1 with Host, Origin and token checks.
2. **Agree the runtime contract (§3.3) with whoever writes the runtime.** Explicit time, render into a target or rectangle, no global rAF, native-res target + integer upscale, palette lookup, injected RNG, headless entry. This decides whether the studio can preview "with the same code as the games".
3. **Use an npm-workspaces monorepo** with `packages/runtime` and `packages/asset-kit`. Vite treats workspace packages as source, so runtime edits hot-reload in the studio.

**Phase 1: 2D studio (sprites, animations, FX)**
4. **Live-reload pipeline:** watcher → debounce/batch → hash index → one SSE stream → per-card store. Persist the index for fast restarts.
5. **`PreviewHost` with one shared WebGL context.** Spike option B vs C first. Then the time controller, filmstrip, onion skins, palette rows, before/after compare and integer zoom with pixel inspector.
6. **Asset-program contract** (pure, seeded, data out) + esbuild compile + sandboxed worker pool with watchdog. Node `worker_threads` bake path for thumbnails.
7. **Hash-bound `review.json` sidecars (studio is the only writer) + generated `reviews/INBOX.md` + task-note creation.** The owner then adds the CLAUDE.md conventions and, optionally, a SessionStart hook.

**Phase 1b**
8. **Render service + `studio` CLI** (`/api/render` + `/__shot` alias), so Claude can see its own FX. First spike GPU-backed headless WebGL on the M4. Optionally add http hooks and a Monitor-able event topic.

**Optional, any time:** Claude in the studio
9. Start with **background-session dispatch** (`claude --bg` on a task note). Add an **embedded terminal** (xterm.js 6 + node-pty 1.1) if one window matters. Keep the Agent SDK (with an API key) for later scripted jobs.

**Phase 2: voxel (as pixel art) and seeds**
10. Add a `voxel3d` backend on the same `PreviewHost` (separate context if three.js), with turntable strips and rig playback in the 2D tools. Then the seed browser: contact sheet with cheap 2D projections first, compare, A/B by generator version, and `seeds.json` bookmarks tied to a generator hash.

**Top three:** (1) Node upgrade → RR 8.4; (2) single-context `PreviewHost` with native-res pixel pipeline and a written runtime contract; (3) hash-bound verdict sidecars + INBOX + single-writer rules.

---

## Open questions for the owner

1. **Node upgrade:** OK to move from 22.21.1 to 22.23.x or 24 LTS? And OK to use **v8** rather than literally v7? (v8 is the same framework mode; v7 still gets security fixes.)
2. **Baking:** are asset programs baked to PNG/atlas files at build time, or executed by the games at runtime? This decides how much the Node bake path and cross-engine determinism matter.
3. **FX:** are they declarative data consumed by the runtime (particles, shader params), or arbitrary code? Data is easier to preview, sandbox and diff.
4. **Asset layout:** folder per asset? Shared packs vs per-game packs?
5. **INBOX in git:** commit `reviews/INBOX.md` as a snapshot, or gitignore it as derived?
6. **Task status:** after the studio creates a task note, may Claude change its `status`? May the owner edit task notes in the studio? Optimistic concurrency covers both.
7. **Project hooks:** OK to add project-level Claude Code hooks (`.claude/settings.json`): a SessionStart INBOX injection, and PostToolBatch/Stop http notifications to the studio?
8. **Claude in the studio:** is background-session dispatch plus an optional embedded terminal enough? Or do you want scripted Agent-SDK jobs, which need an API key and API billing?
9. **Browsers:** Chrome only, or Safari too? This affects `devicePixelContentBoxSize`, OffscreenCanvas WebGL and determinism checks.
10. **Playwright browsers:** may they be installed under `~/Library/Caches`, or must they stay in `node_modules` (`PLAYWRIGHT_BROWSERS_PATH=0`) or use the installed Chrome?
11. **Other devices:** will the studio ever be opened from another device (iPad on the LAN)? That changes the security model (binding, auth).
12. **Seeds (Phase 2):** seed format for the voxel planet (32- vs 64-bit, word codes) and the generator-versioning policy: does a bookmark pin a generator version?

---

## Sources

**React Router / Remix**
- React Router releases: https://github.com/remix-run/react-router/releases
- React Router changelog (8.4.0 docs): https://reactrouter.com/changelog.md
- React Router v8 announcement: https://remix.run/blog/react-router-v8
- Remix blog index: https://remix.run/blog
- Remix 3 release candidate: https://remix.run/blog/remix-3-release-candidate
- Upgrading from Remix v2: https://reactrouter.com/upgrading/remix
- Modes: https://reactrouter.com/start/modes
- SPA mode: https://reactrouter.com/how-to/spa
- Resource routes: https://reactrouter.com/how-to/resource-routes
- `react-router.config.ts`: https://reactrouter.com/api/framework-conventions/react-router.config.ts
- `useRevalidator`: https://reactrouter.com/api/hooks/useRevalidator
- Route module: https://reactrouter.com/start/framework/route-module
- Custom server template: https://github.com/remix-run/react-router-templates/blob/main/node-custom-server/server.js
- npm registry (versions, engines, dates): https://registry.npmjs.org/react-router · https://registry.npmjs.org/@react-router/dev · https://registry.npmjs.org/remix
- Secondary (context only): https://www.buildwithmatija.com/blog/remix-vs-react-router-what-happened-to-remix-2026

**Node / Vite / tooling**
- Node release index: https://nodejs.org/dist/index.json
- Node fs (watch, file system flags): https://nodejs.org/docs/latest-v22.x/api/fs.html
- Node worker_threads: https://nodejs.org/docs/latest-v22.x/api/worker_threads.html
- Node permission model: https://nodejs.org/docs/latest-v22.x/api/permissions.html
- Vite server options: https://vite.dev/config/server-options
- Vite plugin API (client–server communication): https://vite.dev/guide/api-plugin
- Vite dependency pre-bundling (monorepos): https://vite.dev/guide/dep-pre-bundling
- Vite features (workers, glob import): https://vite.dev/guide/features
- chokidar: https://github.com/paulmillr/chokidar
- @parcel/watcher: https://github.com/parcel-bundler/watcher
- quickjs-emscripten: https://github.com/justjake/quickjs-emscripten
- POSIX rename: https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html
- gitattributes (union merge): https://git-scm.com/docs/gitattributes

**Browser platform**
- MDN EventSource: https://developer.mozilla.org/en-US/docs/Web/API/EventSource
- HTML Standard, server-sent events: https://html.spec.whatwg.org/multipage/server-sent-events.html
- MDN OffscreenCanvas: https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- MDN browser-compat-data (OffscreenCanvas, ResizeObserverEntry, image-rendering, content-visibility): https://github.com/mdn/browser-compat-data
- MDN iframe (sandbox): https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- MDN measureUserAgentSpecificMemory: https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory
- MDN Math (precision): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math
- MDN requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- Chromium WebGL context limit (review): https://codereview.chromium.org/14217005/
- Chromium WebGL source: https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc
- WebKit context recycling: https://webkit.googlesource.com/WebKit/+/70e10861eb2fbd9d0862fd8702874c25ae5d8bfd
- Firefox context limits: https://www.bugzilla.mozilla.org/show_bug.cgi?id=1628193
- Chrome SwiftShader fallback removal: https://chromestatus.com/feature/5166674414927872
- WebGL Fundamentals, multiple views: https://webglfundamentals.org/webgl/lessons/webgl-multiple-views.html
- Fix Your Timestep: https://gafferongames.com/post/fix_your_timestep/

**3D / voxels / headless**
- three.js multiple-elements example: https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_multiple_elements.html
- three.js WebGLRenderer source: https://raw.githubusercontent.com/mrdoob/three.js/dev/src/renderers/WebGLRenderer.js
- three.js releases: https://github.com/mrdoob/three.js/releases
- Greedy meshing (0fps): https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/
- Playwright browsers: https://playwright.dev/docs/browsers
- Chrome headless: https://developer.chrome.com/docs/chromium/headless

**Claude Code / Agent SDK**
- Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview
- Agent SDK TypeScript reference: https://code.claude.com/docs/en/agent-sdk/typescript
- Agent SDK permissions: https://code.claude.com/docs/en/agent-sdk/permissions
- Headless / `claude -p`: https://code.claude.com/docs/en/headless
- CLI reference: https://code.claude.com/docs/en/cli-reference
- Hooks: https://code.claude.com/docs/en/hooks
- Tools reference (Edit/Write/Read/Monitor): https://code.claude.com/docs/en/tools-reference
- Legal and compliance (auth terms): https://code.claude.com/docs/en/legal-and-compliance
- npm: https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk

**Terminal**
- node-pty: https://github.com/microsoft/node-pty
- xterm.js releases: https://github.com/xtermjs/xterm.js/releases
