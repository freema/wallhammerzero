# Shipping: desktop, Steam, mobile, the stores

What a session builds, where it builds it, and what it must leave to the owner. The depth is in
[research/shipping-wrappers-2026.md](../../research/shipping-wrappers-2026.md) (verified
2026-10-14; it opens with 13 corrections to the older report) and
[research/multiplatform.md](../../research/multiplatform.md) (2026-10-02). This page is the
pipeline; the two wrapper notes in the queue (#33 desktop, #34 mobile, both after #30 web
builds) are the work.

Decided: the desktop wrapper is Electron (D24), the mobile wrapper is Capacitor (D27, a
delegated default), everything builds locally in Docker and nothing is installed on the host
(D16), the studio makes the builds (D11). Open owner calls: OC-B2 (company or individual) and
OC-B4 (Xcode and the Keychain on the host). Everything marked **proposal** below waits for the
owner; nothing here starts a store submission.

## What builds where

| Target | Tool | In Docker? | Secret | Note |
|---|---|---|---|---|
| Web | Vite, `base: './'` | yes (exists) | — | The input of every other target |
| Electron Linux (dir, AppImage) | electron-builder in `electronuserland/builder:24` | **yes** | — | |
| Electron Windows (dir, NSIS) | `electronuserland/builder:24-wine` (pin a digest) | **yes** | — | Not with native modules lacking prebuilds |
| Windows Authenticode | jsign or osslsigncode + a cloud HSM | yes | HSM credentials | Depends on OC-B2; the Microsoft Store signs MSIX for free instead |
| Electron macOS `.app` | `@electron/packager --platform=darwin` | packaging probably; **signing untested** | `.p12`, App Store Connect key | electron-builder signs only on macOS; rcodesign signs, notarizes and staples from Linux on paper. A spike is needed; until it passes, macOS waits for OC-B4 |
| Android AAB/APK (Capacitor 8) | Gradle, SDK 36, JDK in an image | **yes** | upload keystore | |
| TWA of the PixelDen portal | `@bubblewrap/cli` (Apache-2.0) | **yes** | upload keystore | Needs a PWA manifest, a service worker and `assetlinks.json` on the portal's domain |
| iOS IPA | Xcode 26 on macOS | **no** | certificate, profiles, ASC key | **Owner call OC-B4**, or cloud Mac CI (also an owner call) |
| itch.io upload | butler | yes | `BUTLER_API_KEY` | |
| Steam upload | steamcmd | yes | builder account + TOTP or `config.vdf` | The `default` branch is flipped by hand |
| Electron boot smoke test | xvfb + Chrome flags | yes | — | See the smoke test below |

Secrets come from the environment at run time and never enter the repo or the studio cache.

**Containers have no GPU, and Chrome no longer falls back to software WebGL by itself**
(deprecated from Chrome 130, removed in 139). A smoke test in Docker must launch Chromium or
Electron with `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader` and
assert the `RENDERER` string it got. The desktop note's wording "draws through the CPU
fallback" predates this and means these flags. Players never get SwiftShader silently: a failed
`getContext('webgl2')` or `webglcontextlost` shows an in-game message; an opt-in "software
rendering" launch option is acceptable because we ship only our own content.

## Desktop: Electron

Pin Electron 44 (44.7.2 on 2026-10-14; it dropped Windows ia32 and Linux armv7l, so ship x64
for Windows and Linux, arm64 and x64 for macOS). Tauri and Neutralinojs use the OS webview
(WebKitGTK on Linux: no WebGPU, a 60 Hz cap on WKWebView, no Steam binding) and are for tools,
not games.

Rules for the shell (the `shell-desktop` package of note #33):

- **Serve `dist/` through a privileged custom protocol** (`app://`): local `fetch()`, correct
  MIME types, COOP/COEP if WASM threads are ever needed. No remote content.
- **Security on:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. A preload
  exposes one small `window.host` with `save`, `load`, `unlock`, `score`, `platform`. This only
  works if Steam runs in the main process (below).
- **Pause on blur yourself:** `backgroundThrottling` is on by default and will starve the loop.
- **Saves are JSON files written over IPC, never `localStorage`** (a locked LevelDB inside
  `userData`, unfit for cloud sync). Roots that Steam Auto-Cloud can see:
  Windows `%APPDATA%/<game>/saves` (`WinAppDataRoaming`), macOS
  `~/Library/Application Support/<game>/saves` (`MacAppSupport`), Linux
  `$XDG_DATA_HOME/<game>/saves` (`LinuxXdgDataHome`). Electron's Linux default `userData` is
  `~/.config/<app>`, and Auto-Cloud has no config-home root, so the Linux path must be set.
- **Window:** start borderless fullscreen, toggle on F11 / Alt+Enter, integer scaling with
  letterboxing for the 2D runtime, Gamepad API with Steam Input mapping pads to XInput.
- **Updates come from the store** (Steam, itch, Play, Microsoft Store). electron-updater only
  for a direct-download channel, which needs signing; skip until there is one.

## Steam

- **Binding: steamworks-ffi-node** (0.11.3 on 2026-09-24, MIT, SDK 1.64), loaded lazily in the
  **main** process when Steam is present; achievements, stats, leaderboards, cloud, input,
  overlay, rich presence. steamworks.js's last npm release is from 2024-08 and its overlay
  recipe needs `contextIsolation: false`, so it is out. `asarUnpack` the binding, `koffi`,
  `@koromix` and the SDK's `redistributable_bin`. **The SDK redistributables are under Valve's
  agreement and are never committed.**
- **Steam is optional and never blocks start-up.** The game emits neutral events; one table in
  the game's data maps them to platform ids, so Game Center or Play Games is the same mapping
  later:

```ts
// Electron main: Steam present → init; absent → every host call is a no-op.
const steam = process.env.SteamAppId || existsSync("steam_appid.txt") ? await initSteam() : null;
ipcMain.handle("host:unlock", (_e, id: string) => steam?.achievements.unlock(id) ?? false);
ipcMain.handle("host:score", (_e, board: string, v: number) => steam?.leaderboards.upload(board, v));
app.on("before-quit", () => steam?.shutdown());
// games/<id>/platform.json (proposal): { "achievements": { "first-job": "ACH_FIRST_JOB" }, "leaderboards": { … } }
```

- **Auto-Cloud needs no code:** configure the roots above, a byte quota and a file count.
- **Overlay is best effort:** `app.commandLine.appendSwitch('in-process-gpu')` and keep
  rendering every frame; it still fails on some NVIDIA setups.
- **Budgets to test against now:** Steam Deck 1280×800 at ≥ 30 fps on WebGL2 (no WebGPU on AMD
  Linux); Steam Machine Verified wants 1080p at a stable 30 fps and full controller play (Deck
  Verified carries over automatically). Only a real Deck run is the verdict; Chrome with a
  forced scale factor and a throttled GPU is a proxy.
- **Store facts:** Steam Direct is $100 per app, recouped after $1,000; 30 days between paying
  and release; a public "coming soon" page for at least two weeks; plan about a week for build
  review. macOS builds must be notarized and must not use the app-sandbox entitlement.
- Ship Windows and Linux depots first; macOS when signing works. Steam submissions are owner
  actions; a session prepares depots and the beta branch.

## Mobile

**Two routes, not one.**

- **Capacitor 8** (8.5.3 on 2026-10-07) for self-contained games: single PixelDen games, New
  Hope later if ever. Capacitor 9 is due end of November 2026: the Cordova layer becomes
  optional, iOS moves to Swift, and **CocoaPods trunk goes read-only on 2026-12-02**, so a new
  shell starts on SwiftPM-only plugins. Ionic Appflow accepts no new customers (sunset
  2027-12-31): never build on it.
- **A TWA (Bubblewrap)** to put the PixelDen *portal* itself on Google Play. It runs in the
  user's Chrome (real WebGL and WebGPU, login and leaderboards kept), builds in Docker, and
  needs a PWA manifest, a service worker and `/.well-known/assetlinks.json` on the VPS whose key
  matches the APK's.

Rules for the mobile shell (note #34):

- **Relative asset paths** (`base: './'`); paths starting with `/` resolve against the device
  root in WebView and produce white screens and missing textures.
- **GPU-process death on iOS is silent:** "world gone, HUD alive, no event". Use three
  detectors feeding one recovery: `webglcontextlost` with `preventDefault()`, `gl.isContextLost()`
  polled about every 2 s, and a draw-call floor (fewer than 10 draws for 120 frames = dead).
  Recovery banks progress, writes a marker and reloads; a loop breaker stops after 3 recoveries
  in 10 minutes. About 60 lines; it belongs in the host code of every 3D game.
- **WKWebView is capped at 60 Hz** (WebKit 294338, still open, no embedder API). Android WebView
  is not capped. Design the loop for a fixed step, not for the display rate.
- **Thermal:** no web API; a native bridge to `ProcessInfo.thermalState` and ADPF
  `getThermalHeadroom` can drive a quality governor. For a 3D city, start at render scale
  0.6–0.75 and 30 fps on phones; drop fog distance before resolution.
- **Audio, safe areas, orientation, saves:** resume the `AudioContext` on first `pointerdown`
  and on app resume; SystemBars CSS variables for insets; a native orientation lock;
  `android:appCategory="game"`; saves in Preferences or Filesystem, never only `localStorage`.
- **The real-device checklist** (the owner, on a phone; recorded in the commit): mute switch,
  backgrounding, an incoming call, rotation, notch and home-indicator areas, a cold start
  offline, and the WebGL-vs-CPU parity scenes of `packages/runtime` inside the WebView.

**Store rules that reject web-tech games:**

- Apple 4.2 ("elevate it beyond a repackaged website"), 4.2.2 (no collections of links), 2.5.2
  (no downloaded code that changes features: OTA updates ship assets and data only). 4.7 allows
  HTML5 mini games not embedded in the binary, with duties: an index with universal links, age
  gating, filtering and reporting. So a bundled offline game is fine; a portal app that loads the
  website is the classic rejection; a 4.7 host app is possible but carries moderation duties.
  iOS 26 opens every home-screen site as a web app by default, which is the portal's iOS answer.
- Google Play rejects thin webview apps; the TWA is the sanctioned route. **A new personal
  account needs 12 testers for 14 days** before production: Fuel Field (Phaser + Capacitor)
  lost months to it. Start the closed test the day a game first runs on a phone; PixelDen's
  audience can supply the testers.
- Android developer verification: enforced in Brazil, Indonesia, Singapore and Thailand since
  2026-09-30, worldwide in 2027. A sideloaded APK on itch needs a verified identity too.
- The Microsoft Store is free for individuals since 2025-09 and signs MSIX packages itself
  (Electron via electron-builder `appx`, or a PWA via PWABuilder): the cheap fix for SmartScreen.

## Other channels

| Channel | What we upload | First? |
|---|---|---|
| **itch.io** | folders or zips per channel: `butler push dir user/game:channel` (`linux`, `win`, `mac`, `html5`; patches are rsync-style) | **Yes**: the first public channel for anything, from Docker, to a restricted page |
| Steam | depots per OS via steamcmd | After a store page exists |
| Google Play | AAB (Capacitor) or TWA | After the 12-tester test |
| Microsoft Store | MSIX | Cheap; after Windows works |
| App Store | IPA | OC-B4 |
| Epic | desktop builds; $100 recoupable | Unverified row in the research; not planned |
| Consoles | — | **No route for Phaser or Three.js without a rewrite**; no porter lists them. If a game is a hit, the Vampire Survivors path (a port by a porting house) applies. Our data games keep the QuickJS idea open (queue #32). |

## Pipeline

### Wallhammer games (New Hope first)

New Hope is a desktop and controller game (mouse look, WASD, a city that heats a phone):
**desktop first, Steam Windows and Linux**, phones later if ever.

1. The `shell-desktop` package (#33): Electron 44 pinned, `app://`, context isolation,
   `window.host`, steamworks-ffi-node lazily in main, JSON saves in the roots above, GPU-loss
   handling.
2. A Docker build: `vite build` with `base: './'`, electron-builder `--linux dir --win dir` in
   the wine image at a pinned digest, a manifest of hashes under the build folder.
3. The Docker smoke test: xvfb, the SwiftShader flags, boot, one action script through the
   test hook ([testing.md](testing.md)), digests compared with the web target, one screenshot
   for the studio.
4. The macOS spike (proposal): packager for arm64 and x64 plus rcodesign sign and notarize in
   Docker, with a Developer ID `.p12` from the owner. If it fails, macOS waits for OC-B4.
5. Publish: itch first (`<game>:linux`, `:win`, `:html5`), then Steam when a store page exists
   (a beta branch; the owner flips `default`).
6. Mobile (later): Capacitor Android in Docker with the context-loss recovery and a thermal
   governor; iOS by owner call.
7. The studio's build registry (#30) shows each target's last run, hashes, screenshot and
   upload state; it stores no secrets.

The 2D data games follow the same pipeline; their CPU backend makes the Docker smoke test
cheap, because digests need no GPU.

### PixelDen games (Phaser 4)

The blocker is the portal coupling, not Phaser: a game module expects the React host (auth,
`/api/scores`, cloud sync, i18n per route). Everything here is a **proposal** for the owner's
other repo:

1. **One standalone shell** in PixelDen (about 150 lines): mounts `getConfig(viewport)` for one
   slug, maps `game-start`, `score-update`, `game-over` and `level-complete` to a `host`
   adapter (local best scores; Steam leaderboards and achievements; Game Center later), bundles
   the strings, uses relative paths, and never reuses the portal's SPA navigation (Phaser leaks
   window-level listeners). It doubles as the browser-test page. One script builds
   `dist/<slug>/`, the input for itch, Electron and Capacitor.
2. **itch HTML5 and desktop** for every game worth it, pushed from Docker.
3. **The portal as a PWA**, then **a TWA on Google Play** and **the Microsoft Store**; start the
   closed test at once. No iOS portal app.
4. **Steam for 2–5 flagship games** with the same Electron shell as Wallhammer (shared as a
   small package or copied with attribution; both repos are the owner's). Small casual games
   (snake, sudoku, solitaire) do not belong on Steam or in the App Store (low prices, 4.2 risk).
5. **Capacitor Android** builds of the flagship games in Docker; iOS waits for the Mac decision.
6. PixelDen's commands get an optional ship stage: standalone build → Docker Electron smoke
   test (boot, 300 frames, no errors) → `butler push` to a restricted itch page. Store
   submissions stay owner actions.

Lessons from shipped web-tech games: nobody regrets the wrapper; they regret the Steam glue
(no official JS SDK: Desktop Heroes read the C++ source), the store bureaucracy (the 12
testers), and the lack of a recovery path when the GPU goes away. CrossCode updated NW.js twice
after release to fix leaks and crashes: **pin the wrapper and update it on purpose.**

## What is an owner call

- **iOS at all**, and by which route: Xcode on the Mac host (OC-B4), GitHub macOS runners
  (about $0.062/min) or Codemagic (500 free M2 minutes a month for individuals, $0.095/min
  after). Cloud Mac CI keeps the host clean but is not local.
- **macOS signing in Docker**: the rcodesign spike needs the $99/year Apple programme and a
  `.p12` export.
- **Company or individual** (OC-B2): Microsoft Store signing versus Azure Artifact Signing,
  and Android developer verification as a person or an organisation.
- **A Play Store TWA of the PixelDen portal**: a service worker on the production site and a
  Play account with 12 testers.
- **Which PixelDen games are flagship**, and the price (free with a supporter pack, or $2–5).
- **One shared Electron shell across both repos, or a copy in each.**
- **Any store submission, store page, purchase or account.** A session prepares the build and
  the manifest; the owner clicks.

## Checklist before a build

- [ ] The web build uses `base: './'` and no path starts with `/`.
- [ ] The game's test hook runs an action script headlessly; its digests match the web target.
- [ ] The host adapter is optional: the game starts with Steam, Game Center and the network
      absent.
- [ ] Saves are files in the per-OS roots; nothing important lives only in `localStorage`.
- [ ] GPU loss shows a message (desktop) or triggers the recovery path (mobile); the smoke test
      asserts the renderer string.
- [ ] Pause on blur and on app background; audio resumes on gesture and on app resume.
- [ ] Gamepad works through the standard mapping; a Deck-sized run (1280×800) holds 30 fps.
- [ ] The build manifest lists hashes; no key, keystore or token is in the repo or the studio
      cache.
- [ ] The commit message records what the owner checked on a real machine or phone.
- [ ] `./dev npm run check` passes.
