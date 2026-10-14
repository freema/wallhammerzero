# Shipping web games to desktop, mobile and stores: the 2026 pipeline

*Research date: 2026-10-14. Status: proposal only.*

This report builds on [multiplatform.md](multiplatform.md) (2026-10-02). That report covers the
broad comparison (Electron vs Tauri vs NW.js, Capacitor vs Tauri mobile, consoles, determinism,
the Godot/QuickJS idea), and this one does not repeat it. This report goes deeper on what changed
or was missing. That means Neutralinojs, TWA/PWA/Cordova, Steamworks bindings in 2026, the stores
other than Steam, and **what can be built inside Docker**. It also adds shipped examples with
their lessons and a concrete pipeline for Wallhammer games (New Hope first) and PixelDen's Phaser
games.

Legend: **[S]** sourced (link inline; every URL is also in [Sources](#sources)), **[O]** my
opinion, **[U]** unverified or weakly sourced. It records no decisions and no tasks.

---

## 0. Corrections and updates to multiplatform.md

| # | multiplatform.md said | Update (2026-10-14) |
|---|---|---|
| 1 | steamworks.js is the default binding; last commit 2025-09-07 | Its **last npm release is 0.4.0 from 2024-08-06** [S]([npm](https://registry.npmjs.org/steamworks.js)). Its overlay helper also needs `contextIsolation: false` [S]([summerengine guide](https://www.summerengine.com/make-great-games/threejs-game-on-steam)). **steamworks-ffi-node 0.11.3 (2026-09-24, MIT, SDK 1.64)** runs in the Electron *main* process [S]([README](https://raw.githubusercontent.com/ArtyProf/steamworks-ffi-node/main/README.md)), so the page can keep context isolation on. That makes it the better default [O]. |
| 2 | "macOS code signing works only on macOS" (electron-builder) | That is true of electron-builder [S]([electron.build](https://www.electron.build/docs/features/multi-platform-build)). But **rcodesign** (apple-codesign 0.29) signs, notarizes and staples `.app`, `.dmg` and `.pkg` from Linux [S]([docs](https://gregoryszorc.com/docs/apple-codesign/main/)). So a signed, notarized macOS Electron build **may be possible in Docker** [U: untested by us]. Only iOS strictly needs a Mac. |
| 3 | Windows signing: Azure Artifact Signing excludes EU individuals; skip for Steam | A further route: since 2025-09-10, **Microsoft Store registration is free for individuals**, and MSIX packages get free Store signing and updates [S]([Windows dev blog](https://blogs.windows.com/windowsdeveloper/?p=57557); [Betanews](https://betanews.com/2025/09/12/microsoft-helps-out-app-developers-by-wiping-out-store-fees/)). That fixes SmartScreen for Store installs without a certificate. |
| 4 | Electron targets all architectures | **Electron 44 removed Windows ia32 and Linux armv7l**; electron-builder fails fast on 44+ for them [S]([electron.build](https://www.electron.build/docs/features/multi-platform-build)). Electron is at 44.7.2 (2026-10-14) [S]([npm](https://registry.npmjs.org/electron)). |
| 5 | Desktop-wrapper note: the Docker smoke test "draws through the CPU fallback" | **Chromium removed the automatic WebGL→SwiftShader fallback (deprecated from M130, removed in M139)**. A GPU-less container now gets *no* WebGL unless it passes `--use-angle=swiftshader-webgl --enable-unsafe-swiftshader` [S]([blink-dev intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ); [Samsung policy](https://developer.samsung.com/browser/policy/enable-unsafe-swift-shader.html)). The same applies to players whose GPU is blocklisted: the game must handle a failed WebGL context. |
| 6 | Steam Auto-Cloud: "the right default if saves are plain files" | Correct, but **Auto-Cloud has no `LinuxXdgConfigHome` root**, only `LinuxHome` and `LinuxXdgDataHome` [S]([Steam Cloud](https://partner.steamgames.com/doc/features/cloud)). Electron's default `userData` on Linux is `~/.config/<app>` [U]. So saves must go to `$XDG_DATA_HOME/<app>/saves` on Linux, or the cloud silently misses them [O]. |
| 7 | Vampire Survivors moved to Unity "(Mar 2022) before the console releases" | The **PC 1.0 release (Oct 2022) still ran on Phaser**. The PC game moved to Unity in **v1.6 (Aug 2023)** [S]([summerengine](https://www.summerengine.com/make-great-games/threejs-game-on-steam); [Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)). The console ports were Unity [U]. |
| 8 | Steam Deck: 1280×800, Deck Verified rules | New target: **Steam Machine Verified** (GDC 2026) requires **30 fps at 1080p** and full controller support. Deck Verified games get it automatically, not the other way round [S]([PCGamesN](https://www.pcgamesn.com/steam-machine/verified); [heise](https://heise.de/-11208466)). [refuted 2026-10-14: the PCGamesN piece is from 2026-01-14 and gives no fps/resolution figures; the 1080p/30 fps and controller rules come from heise (2026-03-12) and other GDC 2026 coverage] |
| 9 | Apple 4.7 is about HTML5 games "not embedded in the binary" | 4.7 now explicitly covers "HTML5 and JavaScript mini apps and mini games" with rules 4.7.1–4.7.5 (index with universal links, age gating, reporting) [S]([guidelines](https://developer.apple.com/app-store/review/guidelines/)). Apple launched a **Mini Apps Partner Program** (Nov 2025; 15 % commission on qualifying IAP) [S]([Apple](https://www.developer.apple.com/programs/mini-apps-partner/); [TechCrunch](https://techcrunch.com/2025/11/13/apple-halves-commissions-for-mini-app-makers/)). This matters for a PixelDen hub app (§4.4). |
| 10 | — | **Android developer verification**: from 2026-09-30, certified phones in Brazil, Indonesia, Singapore and Thailand block normal installs of apps from unregistered developers. The rest of the world follows in 2027 [S]([The Hacker News, 2026-06](https://thehackernews.com/2026/06/google-sets-sept-30-deadline-for.html)). A sideloaded APK on itch.io needs a verified developer identity too [O]. |
| 11 | General Arcade as a console route for JS games | Its runtimes list **only RPG Maker MV/MZ, Ren'Py and Pygame**. Phaser, Construct and three.js are not mentioned [S]([General Arcade](https://generalarcade.com/runtimes/)). There is **no turnkey porter for Phaser or three.js** [S/O]. |
| 12 | Capacitor docs point at Ionic Appflow for cloud iOS builds | **Appflow accepts no new customers and sunsets on 2027-12-31** [S/U]([Capgo migration guide](https://capgo.app/docs/upgrade/from-appflow-to-capgo/)). Don't build on it [O]. |
| 13 | WKWebView 60 Hz cap (WebKit 294338) | **Still NEW**, last touched 2026-09-17. Scirra (Construct) commented on 2026-08-12. No public API for embedders [S]([WebKit 294338](https://bugs.webkit.org/show_bug.cgi?id=294338)). |

---

## 1. Summary

1. **Desktop: Electron stays the answer for both stacks** [O]. Neutralinojs, like Tauri, uses the
   OS webview (WebKitGTK on Linux) [S]([Neutralinojs](https://github.com/neutralinojs/neutralinojs)).
   It inherits every WebKit problem from multiplatform.md §1.2–1.3 and has no Steam binding.
   NW.js (0.118.0, 2026-10-11 [S]([npm](https://registry.npmjs.org/nw))) is alive but adds
   nothing for us.
2. **Steam: use steamworks-ffi-node in the main process, Auto-Cloud on a save folder we choose, and
   the overlay as a bonus.** Map game events to achievements and leaderboards over IPC. Ship
   Windows and Linux depots first, and macOS when signing works. Budget for **1280×800 (Deck)
   and 1080p at 30 fps (Steam Machine)** [S/O].
3. **Mobile, two different routes** [O]:
   - **Capacitor 8** for self-contained games (New Hope later, single PixelDen games).
   - **A TWA (Bubblewrap) for the PixelDen portal on Google Play.** A TWA runs in the user's
     Chrome, not in WebView [S]([Chrome docs](https://developer.chrome.com/docs/android/trusted-web-activity)).
     Cordova adds nothing over Capacitor, and Capacitor 9 makes the Cordova layer optional
     [S]([Ionic, 2026-08-28](https://ionic.io/blog/?p=6904)).
   - On iOS, a PWA has no store, but **iOS 26 opens every home-screen site as a web app by
     default** [S]([heise](https://heise.de/-10749652)).
4. **Most of the pipeline fits in Docker:**
   - web;
   - Linux and Windows Electron (`electronuserland/builder:24-wine`);
   - Android (SDK in an image);
   - TWA (Bubblewrap);
   - itch.io (`butler`);
   - Steam upload (`steamcmd`);
   - probably macOS sign + notarize (`rcodesign`).
   **iOS is the one hard exception**: Xcode 26 on macOS is required [S]([Capacitor setup](https://capacitorjs.com/docs/getting-started/environment-setup)).
   xtool builds iOS apps on Linux, but it needs `Xcode.xip` for the SDK [unconfirmed: the README fetched does not say this; the Swift forums thread was not re-checked] and supports only SwiftPM
   projects [S]([xtool](https://cdn.jsdelivr.net/gh/xtool-org/xtool@main/README.md); [Swift forums](https://forums.swift.org/t/xtool-cross-platform-xcode-replacement-build-ios-apps-on-linux-and-more/79803)).
   So iOS needs one of two owner calls: a Mac host build (OC-B4) or cloud Mac CI.
5. **Updates come from the stores.** Steam, itch (butler patches), Google Play and the Microsoft
   Store all deliver updates. Use electron-updater only for direct downloads, which need signing.
   Avoid over-the-air JS updates on iOS, because guideline 2.5.2 bans downloaded code that
   changes features [S]([guidelines](https://developer.apple.com/app-store/review/guidelines/)).
6. **Consoles: nothing new for web stacks.** nx.js shows that a JS/WebGL2 runtime on Switch is
   technically feasible, but it uses V8 and is homebrew only [S]([nx.js](https://github.com/TooTallNate/nx.js)).
   For three.js (New Hope) and Phaser (PixelDen), a console release means a rewrite or port
   (Unity, Godot), as Vampire Survivors did [S/O].
7. **Shipped games show three lessons** [S/O]:
   - The wrapper is never the hard part.
   - The pain is the Steam SDK glue, Google Play's 12-tester rule (it delayed Fuel Field by
     months [S]([Phaser.io, 2026-07-22](https://phaser.io/news/2026/07/fuel-field-phaser-roguelite-interview))),
     and iOS silently killing the WebGL GPU process [S]([RAXXO, 2026-09-01](https://raxxo.shop/blogs/lab/shipping-a-three-js-game-to-the-ios-app-store)).

---

## 2. Desktop wrappers for WebGL/WebGPU games, 2026 state

### 2.1 The four candidates

| | Electron 44 | NW.js 0.118 | Tauri 2.12 | Neutralinojs (neu 11.8) |
|---|---|---|---|---|
| Engine on Win / mac / Linux | Bundled Chromium everywhere | Bundled Chromium everywhere | WebView2 / WKWebView / WebKitGTK; CEF runtime only in v3 alphas [unconfirmed: the releases page lists only 2.12.x and the 3.0.0-alpha.4 release notes mention no CEF] | OS webview; "gtk-webkit2 on Linux" [S]([repo](https://github.com/neutralinojs/neutralinojs)) |
| WebGPU | Win/mac default; Linux only Intel Gen12+ (M144) and NVIDIA on Wayland (M147); **AMD/Deck behind flags** [S]([gpuweb wiki, 2026-10-02](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)) | Same as Electron | Win yes; macOS 26 yes; Linux **no** (WebKitGTK) [S] [unconfirmed: the gpuweb wiki covers only Apple platforms for WebKit; it says nothing about WebKitGTK] | Same as Tauri [O] |
| rAF on 120 Hz Mac | Uncapped | Uncapped | **60 Hz** (WebKit 294338) [S] | **60 Hz** [O, same WKWebView] |
| Steam binding | steamworks-ffi-node (main process), steamworks.js, greenworks | greenworks, steamworks.js | steamworks-rs (Rust) | None; would need a native "extension" process over its IPC [S/O] |
| Overlay | Best-effort (`--in-process-gpu` + continuous redraw) [S]([Drawize](https://www.drawize.com/blog/tech-how-to-release-html5-game-on-steam)) | Same | Decoy-window tricks only [S/U] | No known route [U] |
| Licence | MIT | MIT | Apache-2.0/MIT | MIT |
| Docker build | Linux and Windows yes (wine image); macOS package yes, signing via rcodesign [U] | Similar [O] | Linux yes; Windows only via cargo-xwin "last resort" [S] | Linux yes; others: zips of prebuilt binaries [U] |

[O] Neutralino and Tauri make sense for tools, not games. For three.js on the Steam Deck, the
WebKitGTK path is the worst one (no WebGPU, undetectable slow WebGL, see multiplatform.md §1.2).

### 2.2 Electron settings that matter for games [O unless marked]

- **Protocol.** Serve `dist/` through a privileged custom protocol (`app://`). It gives
  `fetch()` of local files, correct MIME types, and COOP/COEP if WASM threads are ever needed
  (multiplatform.md §6.1).
- **Security.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. A preload
  exposes one small `window.host` object (`save`, `load`, `unlock`, `submitScore`, `platform`).
  This works only if Steam runs in the main process (steamworks-ffi-node). steamworks.js's
  overlay recipe asks for the opposite [S]([summerengine](https://www.summerengine.com/make-great-games/threejs-game-on-steam)).
- **Background throttling.** `backgroundThrottling` defaults to true, so pause the game on blur
  yourself [S]([summerengine](https://www.summerengine.com/make-great-games/threejs-game-on-steam)).
- **GPU failure.** Listen for a failed `getContext('webgl2')` and for `webglcontextlost`, and show
  an in-game message. Do **not** silently enable SwiftShader for players: it is software
  rendering, and Chromium marks it unsafe for untrusted content [S]([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ)).
  Since we ship only our own content, an opt-in "software rendering" launch option on Steam is
  acceptable [O].
- **Saves.** Write JSON files through IPC, not `localStorage`. Electron keeps `localStorage` in a
  LevelDB inside `userData`, which is binary, locked while running and unfit for Auto-Cloud
  [U]. Use these roots:
  - Windows: `%APPDATA%/<game>/saves`, Auto-Cloud root `WinAppDataRoaming`;
  - macOS: `~/Library/Application Support/<game>/saves`, root `MacAppSupport`;
  - Linux: `$XDG_DATA_HOME/<game>/saves`, root `LinuxXdgDataHome`

  [S]([Steam Cloud roots](https://partner.steamgames.com/doc/features/cloud)).
- **Fullscreen and input.** Start in borderless fullscreen and toggle on F11/Alt+Enter. Use the
  Gamepad API and let Steam Input map pads to XInput (multiplatform.md §1.3).
- **Architectures.** Ship x64 for Windows and Linux. For macOS, ship arm64 plus x64, or universal.
  Electron 44 has no ia32 [S].

### 2.3 Steamworks: a concrete integration pattern

[S] steamworks-ffi-node covers:
- achievements (20 functions), stats (14), leaderboards (7), cloud (14–17), workshop, input,
  overlay (7), rich presence;
- "use it in your main process";
- ASAR breaks it, so `asarUnpack` `node_modules/steamworks-ffi-node/**`, `koffi/**`,
  `@koromix/**` and `steamworks_sdk/redistributable_bin/**`;
- the SDK redistributables are **not included**: download them from the partner site under
  Valve's SDK agreement

([README](https://raw.githubusercontent.com/ArtyProf/steamworks-ffi-node/main/README.md)).

[O] The shape for our games:

```ts
// main.ts (Electron main): Steam is optional and never blocks start-up
const steam = process.env.SteamAppId || existsSync('steam_appid.txt') ? await initSteam() : null;
ipcMain.handle('host:unlock', (_e, id: string) => steam?.achievements.unlock(id) ?? false);
ipcMain.handle('host:score', (_e, board: string, v: number) => steam?.leaderboards.upload(board, v));
app.on('before-quit', () => steam?.shutdown());

// game side: one table in game data maps game events to platform ids
// games/<id>/platform.json  { "achievements": { "first-job": "ACH_FIRST_JOB" }, "leaderboards": {...} }
```

- The game emits neutral events (`achievement:first-job`). The host maps them to Steam, Game
  Center, Play Games or nothing. This is the "platform services are optional capabilities" rule
  from multiplatform.md, applied in code.
- **Auto-Cloud** needs no code. You configure the roots above, plus a byte quota and a file
  count per user [S]([Steam Cloud](https://partner.steamgames.com/doc/features/cloud)).
- **Overlay.** Add `app.commandLine.appendSwitch('in-process-gpu')` and keep rendering every frame
  (a game does anyway). Treat it as best effort: community reports say it works on some GPUs
  and not on some NVIDIA setups [S]([Drawize](https://www.drawize.com/blog/tech-how-to-release-html5-game-on-steam);
  [Construct forum](https://www.construct.net/en/forum/construct-2/how-do-i-18/implement-steam-overlay-108281)).
- **Store rules** [S]:
  - Steam Direct costs $100 per app, refunded after $1,000 revenue;
  - **30 days** between paying and release;
  - a public "coming soon" page for at least 2 weeks ([Steam Direct](https://partner.steamgames.com/steamdirect)).
  - Build review takes about 3–5 business days; plan for 7 [U]([summary](https://tessl.io/registry/testland/platform-cert-overview-reference/files/references/steam-direct.md)).
  - macOS builds must be notarized; Steam doesn't support the app-sandbox entitlement
    [S]([platforms](https://partner.steamgames.com/doc/store/application/platforms)).

---

## 3. Mobile: Capacitor vs Cordova vs TWA vs PWA

### 3.1 Comparison

| | Capacitor 8.5 | Cordova | TWA (Bubblewrap 1.27) | PWA (no store) |
|---|---|---|---|---|
| Engine | WKWebView / Android System WebView | Same | **The user's Chrome** (fallback: a Custom Tab) [S]([Chrome](https://developer.chrome.com/docs/android/trusted-web-activity)) | Safari / Chrome |
| Offline bundle | Yes, files in the app | Yes | Only via service worker; content comes from **our domain** | Service worker |
| Stores | App Store + Play | Same | **Play only** (and other Android stores) | None on iOS; Microsoft Store via PWABuilder MSIX [S]([MS Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path)) |
| Android WebGPU, SAB, 120 Hz | WebView limits (no SAB, multiplatform.md §2) | Same | Chrome features [O] | Chrome features |
| Native plugins | Many, maintained (IAP via RevenueCat, SystemBars, Preferences) | Legacy; Capacitor 9 makes the Cordova layer optional [S]([Ionic](https://ionic.io/blog/?p=6904)) | None; web APIs only [S/U]([thinktecture](https://www.thinktecture.com/en/pwa/twa-bubblewrap)) | None |
| Build in Docker | Android yes; iOS **no** | Same | **Yes** (JDK + SDK, CLI on npm, Apache-2.0) [S]([npm](https://registry.npmjs.org/@bubblewrap/cli)) | Yes (it is the web build) |
| Requirements | Node 22+, Android Studio 2025.2.1 toolchain (SDK 36), Xcode 26 [S]([setup](https://capacitorjs.com/docs/getting-started/environment-setup)) | — | Digital Asset Links on our domain; the APK signing key must match `assetlinks.json` [S]([thinktecture](https://www.thinktecture.com/en/pwa/twa-bubblewrap)) | Manifest + SW |

**Capacitor 9** is forecast for end of Nov 2026 [S]([Ionic, 2026-08-28](https://ionic.io/blog/?p=6904)):
- Cordova becomes optional.
- The iOS Objective-C code is rewritten in Swift.
- It adds a large-screen and foldable baseline.
- **CocoaPods trunk goes read-only on 2026-12-02**, so plugins must use SwiftPM.

[O] Start any new mobile shell on SPM-only plugins.

### 3.2 WebGL on phones: what actually breaks

- **Silent GPU-process death on iOS.** One three.js game shipped via Capacitor (NIGHTMILE [unconfirmed: the article never names its game; "NIGHTMILE" is the title of another entry on the same blog], 17 days
  from first commit to approval) saw "world gone, HUD alive, no event dispatched at all"
  [S]([RAXXO, 2026-09-01](https://raxxo.shop/blogs/lab/shipping-a-three-js-game-to-the-ios-app-store)).
  It uses three detectors that feed one recovery path:
  1. `webglcontextlost` with `preventDefault()`;
  2. polling `gl.isContextLost()` about every 2 s;
  3. a **draw-call floor**: fewer than 10 draws for 120 frames in a row means a dead render.

  Recovery banks progress, writes a marker and reloads. A **loop breaker** stops after 3
  recoveries in 10 minutes. [O] Put this into the New Hope host code: it costs ~60 lines.
- **Frame rate.** iOS WKWebView is 60 Hz max (WebKit 294338, still open). Android WebView is
  uncapped.
- **Thermal.** The web has no thermal API on phones. A native bridge to `ProcessInfo.thermalState`
  (iOS) and ADPF `getThermalHeadroom` (Android) can feed a resolution and draw-distance governor
  (multiplatform.md §6.1).
  - [O] For a 3D city like New Hope, start at a render scale of 0.6–0.75 and 30 fps on phones.
  - Drop the fog distance before resolution.
- **Phaser on Android WebView.** Community reports of lag, white screens and missing textures in
  Capacitor APKs trace to asset paths that start with `/` (resolved against the device root) and
  to old WebViews [S/U]([Phaser forum](https://phaser.discourse.group/t/phaser-3-capacitor-android-apk-white-screens-texture-rendering-failures-and-orientation-issues/15571)).
  [O] Use relative asset paths (`base: './'` in Vite) in every wrapped build.
- **Audio unlock, safe areas, orientation, saves.** Unchanged from multiplatform.md §2.3–2.6:
  - resume the `AudioContext` on first `pointerdown` and on app resume;
  - SystemBars CSS variables;
  - native orientation lock;
  - `android:appCategory="game"`;
  - saves in Preferences or Filesystem, never only in `localStorage`.

### 3.3 Store rules for web-tech games

**Apple** [S]([guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **4.2:** "elevate it beyond a repackaged website … lasting entertainment value".
- **4.2.2:** no "web clippings, content aggregators, or a collection of links".
- **2.5.2:** no downloaded code "which introduces or changes features".
- **4.7** allows HTML5/JS mini games *not embedded in the binary* if the host app follows
  4.7.1–4.7.5:
  - privacy;
  - filtering and reporting;
  - no native API exposure without permission;
  - an index with universal links;
  - age gating.

[O] So a bundled, offline game is fine. A portal app that loads our website is the classic 4.2
rejection. A portal app that *hosts* games under 4.7 is possible, but it brings 4.7's
moderation, index and age-gating duties.

**Google Play**
- Thin webview apps are "webview spam" and break the minimum-functionality policy
  [S]([Android Developers Blog, 2020](https://android-developers.googleblog.com/2020/10/developer-tips-and-guides-common-policy.html)).
- A TWA is the sanctioned web route, because the domain is verified [S].
- New personal accounts need **12 testers for 14 days** in a closed test before production.
  Fuel Field (Phaser 3 + Capacitor) lost "several months" to it
  [S]([Phaser.io](https://phaser.io/news/2026/07/fuel-field-phaser-roguelite-interview)).
  - [O] Start the closed test the day a game is first playable on a phone.
  - PixelDen's own audience can supply the 12 testers.

**Android outside Play**
- Developer verification is enforced in BR/ID/SG/TH from 2026-09-30 and globally in 2027.
- A free "limited distribution" account covers up to 20 devices
  [S]([The Hacker News](https://thehackernews.com/2026/06/google-sets-sept-30-deadline-for.html)).

---

## 4. Other stores and channels

| Channel | Cost | What we upload | Built in Docker? | Notes |
|---|---|---|---|---|
| **itch.io** | Free; revenue share is chosen by the dev | Folders or zips per channel via `butler push dir user/game:channel` | **Yes**: butler from `broth.itch.zone/butler/linux-amd64/LATEST`, auth via `BUTLER_API_KEY` [S]([install](https://itch.io/docs/butler/installing.html); [login](https://itch.io/docs/butler/login.html)) | Channel name sets the platform (`win`, `linux`, `mac`, `android`). HTML5 is ticked by hand after the first push. Patches are rsync-style, so a typical push uploads 5–20 % [S]([pushing](https://itch.io/docs/butler/pushing.html)). Best first public channel [O] |
| **Steam** | $100/app | Unpacked depots per OS | **Yes**: steamcmd. `game-ci/steam-deploy` (MIT) shows the pattern: builder account + TOTP or base64 `config.vdf` secret [S]([steam-deploy](https://github.com/game-ci/steam-deploy)) | `default` branch can't be set live by script [S] |
| **Microsoft Store** | **Free for individuals** since 2025-09 [S] | MSIX (Electron via electron-builder `appx`, or a PWA via PWABuilder) | PWA→MSIX: PWABuilder is a web service [U]; electron-builder AppX needs Windows [U] | Store signs the package and serves updates. Custom commerce is "not available for games" [S/U]([Winaero](https://winaero.com/microsoft-store-is-now-free-for-individual-developers)) |
| **Epic Games Store** | $100 recoupable, 88 % share | Desktop builds | Upload tool [U] | Must enable Epic achievements if the game has achievements elsewhere. Multiplayer must crossplay across PC stores. IARC rating [S]([Epic](https://store.epicgames.com/en-US/publish)) [unconfirmed: the page returned 403 on re-check; the whole row is unverified] |
| **Google Play** | $25 once | AAB (Capacitor) or TWA | **Yes** | 12×14 rule; target SDK 36 |
| **App Store** | $99/yr | IPA | **No** (Xcode) | 4.2 / 4.7 / 2.5.2 |
| **Web portals** (PixelDen itself, Poki, CrazyGames) | — | Web build | Yes | Not researched here [O] |

---

## 5. Building, signing and updating, by target

### 5.1 What runs in Docker (D16) and what doesn't

| Step | Tool | Docker? | Secret | Evidence |
|---|---|---|---|---|
| Web build | Vite | Yes (already) | — | repo |
| Electron Linux dir / AppImage | electron-builder in `electronuserland/builder:24` | **Yes** | — | [S]([electron.build](https://www.electron.build/docs/features/multi-platform-build)) |
| Electron Windows dir / NSIS | `electronuserland/builder:24-wine` (pin a date tag or digest) | **Yes**; not with native modules that lack prebuilds | — | [S] same |
| Windows Authenticode | `jsign` or `osslsigncode` + cloud HSM | **Yes** | HSM credentials | [S] multiplatform.md §1.5 |
| Electron macOS `.app` | `@electron/packager --platform=darwin` | Packaging **likely yes** [U]; "can only be signed when building on a host macOS" by Packager itself [S]([Packager](https://electron.github.io/packager/main/)) | — | — |
| macOS sign + notarize + staple | **rcodesign** (`sign`, `notary-submit --staple`) with a Developer ID `.p12` + App Store Connect API key | **Yes, on paper** [S]; known gaps: can't sign files inside DMGs or recursively sign `.pkg`; "long tail of discrepancies" with Apple's tools [S]([docs](https://gregoryszorc.com/docs/apple-codesign/main/)) | `.p12`, `.p8` | Spike needed [O] |
| Universal mac binary | `@electron/universal` (uses `lipo`) | [U] (llvm-lipo might work) | — | Ship two arch builds instead [O] |
| Electron boot smoke test | xvfb + `--use-angle=swiftshader-webgl --enable-unsafe-swiftshader`; `electronuserland/builder:wine-chrome` has xvfb [S] | **Yes** | — | [S]([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ)) |
| Android AAB / APK (Capacitor) | Gradle + SDK 36 + JDK 21 [U on JDK] in an image (e.g. `ghcr.io/cirruslabs/android-sdk` [S]([Cirrus](https://cirrus-ci.org/examples))) | **Yes** | upload keystore | — |
| TWA | `@bubblewrap/cli` | **Yes** | upload keystore | [S] |
| iOS IPA | Xcode 26 | **No.** Owner call: Mac host (OC-B4), GitHub macOS runners ($0.062/min, multiplatform.md §5.2) or Codemagic (500 free M2 min/month for individuals, $0.095/min after) [S]([Codemagic](https://docs.codemagic.io/billing/pricing.md)) | Distribution cert, profiles, ASC key | [S] |
| itch upload | butler | **Yes** | `BUTLER_API_KEY` | [S] |
| Steam upload | steamcmd (Linux) | **Yes** | builder account, TOTP secret or `config.vdf` | [S] |

[O] Two implications:
- If the rcodesign spike passes, **OC-B4 shrinks to "iOS only"**, and Mac players on Steam no
  longer depend on the owner's Keychain.
- Cloud Mac CI also respects "install nothing on the host", but it is not *local*. It is an owner
  call, like OC-B4.

### 5.2 Auto-update

| Channel | Update path |
|---|---|
| Steam, itch app, Play, Microsoft Store, App Store | The store does it. Nothing to build [S/O] |
| Direct download (desktop) | electron-updater 6.8 [S]([npm](https://registry.npmjs.org/electron-updater)). Needs code signing on macOS, and on Windows in practice [O]. Skip until there is a direct-download channel |
| Capacitor OTA (Capgo, Capawesome; Appflow is sunsetting) | Technically possible. On iOS, ship **assets and data only**, never new features (2.5.2) [S/O] |

### 5.3 GitHub Actions or not

[O] Our rule is "local, in Docker". The only jobs that need a different machine are:
- a **real Windows** smoke run (a Windows runner at $0.010/min);
- **iOS** builds.

Everything else runs in our Docker images. That keeps the studio's "Build" button and any later
CI job identical: CI would run the same `./dev` commands inside `container:` jobs.

---

## 6. Real shipped web-tech games and what they learned

| Game | Stack | Shipped | Lesson |
|---|---|---|---|
| **Vampire Survivors** | Phaser (HTML5) → Unity at v1.6 (Aug 2023) | itch 2021-03, Steam EA 2021-12, **1.0 on Phaser 2022-10** [S]([Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors); [summerengine](https://www.summerengine.com/make-great-games/threejs-game-on-steam)) | A Phaser game can carry a hit to 1.0 on Steam. The rewrite came from entity-count performance and console ambitions [S/U] |
| **CrossCode** | JS, NW.js | Steam 2018 | Updated NW.js twice (to 0.35.5 in Dec 2019) to fix Windows memory leaks and Linux/mac crashes [S]([summerengine](https://www.summerengine.com/make-great-games/threejs-game-on-steam)). Consoles needed JS→C++ (multiplatform.md). **Pin and update the wrapper on purpose** |
| **Cookie Clicker** | Electron wrapper of the HTML game | Steam 2021-09 | "Easy to tweak"; adds achievements, cloud saves and Workshop [S]([PCGamesN](https://www.pcgamesn.com/cookie-clicker/steam)). Linux players run it on native Electron via a community tool [S]([NativeCookie](https://github.com/Kesefon/NativeCookie)), which suggests a Windows-only depot under Proton |
| **Desktop Heroes** (Telazer, 3 people) | Phaser + Electron | Steam 2025-10, $3.99 | "There's no official JavaScript SDK for Steam"; third-party libraries are outdated and they read source code. Electron gave them a transparent, always-on-top [unconfirmed: the article says the game "sits just above the taskbar", not "always-on-top"], click-through window and capture hiding. Saves are encoded JSON at milestones only [S]([Phaser.io, 2026-05-08](https://phaser.io/news/2026/04/desktop-heroes-phaser-electron-steam)) |
| **Carnage Cliff** | Phaser 3.60, WebGL + WebAudio, Electron, greenworks | Steam 2025 | A minimal stack works [S]([forum, 2025-06-09](https://phaser.discourse.group/t/carnage-cliff-demo/15373)) |
| **Fuel Field** | Phaser 3 + Capacitor | Google Play + iOS, itch web | Packaging was "surprisingly smooth". **The Play 12-tester rule cost months.** Steam was dropped as the wrong audience [S]([Phaser.io, 2026-07-22](https://phaser.io/news/2026/07/fuel-field-phaser-roguelite-interview)) |
| **Gate Militia** | Phaser 3 + Capacitor (Android), no bundler | Google Play 2026-04 | Small games can ship with no build tooling at all [S]([Phaser.io, 2026-06](https://phaser.io/news/2026/06/gate-militia-math-gate-army-shooter-built-with-phaser-now-on-google-play)) |
| **NIGHTMILE** (RAXXO) [unconfirmed: game name, see §3.2] | three.js + Capacitor, StoreKit 2 | App Store 2026 | GPU-process death and the triple detector (§3.2). Show IAP only when StoreKit returns real products. A world-folding modulo bug showed up only after 40 minutes, so long soak tests are needed [S]([RAXXO](https://raxxo.shop/blogs/lab/shipping-a-three-js-game-to-the-ios-app-store)) |
| **Krunker** | three.js, browser-first | Web; community Electron clients | The Steam listing's state is unclear [U]([Steam discussions](https://steamcommunity.com/app/1408720/discussions/0/4041482690812466335)). Big three.js games stay web-first [O] |
| **Bitburner, Game Dev Tycoon** | Electron + steamworks.js fork / NW.js + greenworks | Steam | Covered in multiplatform.md §1.6 |

[O] Common thread: nobody regrets the wrapper. They regret the Steam glue, the store
bureaucracy, and the lack of a recovery path when the GPU goes away.

---

## 7. What this means for us

### 7.1 New Hope (three.js 0.180, Vite)

- **Desktop first, Steam Windows + Linux.** It is a GTA-like game with mouse look and WASD. That
  is a desktop and controller game, and phones are a poor fit for the controls and the heat [O].
- **Budgets to test against now** [O]:
  - **Deck: 1280×800 at ≥ 30 fps** on the WebGL2 path (no WebGPU on AMD Linux).
  - **Steam Machine: 1080p at 30 fps** [S].
  - A `?perf=` profile and a frame-time readout in `__nh` make this measurable. Chrome on the
    owner's Mac with `--force-device-scale-factor` and the GPU throttled is a rough proxy, but
    only a real Deck run is the verdict.
- **Host adapter:** `window.host` with `save/load/unlock/score/platform`. New Hope has no
  achievements yet; give the game neutral events now, so Steam is a mapping table later.
- **Robustness:** the WebGL context-loss recovery from §3.2, plus a no-WebGL message. The task
  note's Docker smoke test must add the SwiftShader flags (§0 row 5).
- **Three.js versions:** npm `three` is at 0.186.1 (2026-09-24) [S]([npm](https://registry.npmjs.org/three)).
  WebGPURenderer is not needed for shipping. WebGL2 is the floor on the Deck and in WebViews [O].

### 7.2 Wallhammer 2D sims (our own runtime)

- Nothing changes from multiplatform.md: Electron, Capacitor and WebGL2.
- The CPU reference backend makes the Docker smoke test cheap. Its digests don't need a GPU at all.

### 7.3 PixelDen (Phaser 4.2, ~56 games inside a React Router app)

[refuted 2026-10-14: PixelDen pins **Phaser 4.0.0** (`package.json` `"phaser": "^4.0.0"`, `pnpm-lock.yaml` resolves `phaser@4.0.0`; the host's stale `node_modules` even holds 3.90.0). 4.2.1 is only the newest version on npm (2026-07-09). The game count is **54 folders / 55 registry entries** in `app/games/`, not ~56. React Router 7.12 is correct.]

**Facts from the repo** [S]:
- Games live in `app/games/<slug>/` and expose `getConfig()`.
- The host React component `app/components/game-canvas.tsx` listens on `game.events` for
  `game-start`, `game-over`, `score-update` and `level-complete`.
- Scores go to `/api/scores`, progress to `localStorage` with cloud merge
  (`app/games/shared/cloud-progress.ts`).
- Game assets total ~31 MB under `public/assets/games`.

**So** [O]:
1. **One standalone shell for any game:** `tools/standalone/` with a Vite entry and a host of
   ~150 lines. It mounts `getConfig()` for one slug and maps the same four events to a `host`
   adapter:
   - local best scores;
   - Steam leaderboards and achievements;
   - Game Center later.

   One script, `build:standalone <slug>`, produces `dist/<slug>/`. It is the input for itch
   (HTML5), Electron and Capacitor. The shell must use relative asset paths, and it must not
   reuse the portal's SPA navigation (Phaser leaks window-level listeners).
2. **The portal as an app:**
   - **Android: TWA via Bubblewrap.** It runs in real Chrome, keeps login, scores and
     leaderboards, and builds in Docker. It needs a PWA manifest, a service worker and
     `/.well-known/assetlinks.json` on the VPS.
   - **Windows: the Microsoft Store via PWABuilder** (free).
   - **iOS: no store app for the portal.** As a plain web wrapper it is a 4.2 risk; as a 4.7
     host it brings moderation and age-gating duties. iOS 26 home-screen web apps are the
     answer there.
3. **Flagship single games:**
   - Pick the 2–5 games with the best retention, and ship them to **itch** (html5 + win/linux)
     and **Steam** with the Electron shell.
   - Mobile: Capacitor Android in Docker; iOS once a Mac route exists.
   - Small casual games (snake, sudoku, solitaire) don't belong on Steam: low prices and 4.2-style
     "not unique" risk on mobile.
4. **The `/new-game` and `/game-upgrade` commands** get an optional "ship" stage:
   1. standalone build;
   2. Docker Electron smoke test (boot, 300 frames, no errors);
   3. `butler push` to a *restricted* itch page.

   Steam and store submissions stay owner actions.

### 7.4 Consoles

Nothing changes from multiplatform.md §3 [O]:
- **PixelDen and New Hope have no console route without a rewrite.** No porter lists Phaser or
  three.js [S].
- If a PixelDen game becomes a hit, the Vampire Survivors path applies: a port to Godot or Unity
  by a porting house.
- The Wallhammer sim runtime keeps the QuickJS idea open, because its host API is small and ours.

---

## 8. Recommended pipeline

### 8.1 Wallhammer games (New Hope first)

1. **`packages/shell-desktop`** (task #33 already queued) with:
   - Electron 44 pinned;
   - the `app://` protocol, context isolation and preload `window.host`;
   - **steamworks-ffi-node loaded lazily in main** when Steam is present;
   - JSON file saves in the per-OS roots of §2.2;
   - GPU-loss handling.
2. **Docker build** (`./dev npm run ship -- desktop <game>`):
   - `vite build` with `base: './'`;
   - electron-builder `--linux dir --win dir` in `electronuserland/builder:24-wine@<digest>`;
   - a manifest of hashes into `build/ship/<game>/<version>/`.
3. **Docker smoke test:** xvfb + the SwiftShader flags, boot, run an action script through the
   test hook, compare digests with the web target, and save a screenshot for the studio.
4. **macOS spike** [O]: `@electron/packager --platform=darwin --arch=arm64,x64` plus rcodesign
   sign + notarize in Docker. If it fails, macOS waits for OC-B4.
5. **Publish:**
   - **itch first**: `butler push` channels `<game>:linux`, `:win`, `:html5`;
   - **Steam** when there is a store page: steamcmd in Docker, a builder account, a beta
     branch; the owner flips `default` by hand.
6. **Mobile** (later, if ever for New Hope): Capacitor Android AAB in Docker with context-loss
   recovery and a thermal governor; iOS via the owner call.
7. **Studio:** the build registry (task #30) shows each target's last run, hashes, screenshot and
   upload state. It never stores secrets; they come from env at run time (multiplatform.md §5.3).

### 8.2 PixelDen games (Phaser 4.0, see §7.3)

1. `tools/standalone` + `build:standalone <slug>` + the host adapter (§7.3).
2. **itch HTML5 + desktop** for every game worth it: `butler push` from Docker.
3. **Portal as a PWA**, then a **TWA on Google Play** (Bubblewrap in Docker) and the **Microsoft
   Store** (PWABuilder). Start the 12-tester closed test at once.
4. **Steam for 2–5 flagship games** with the same Electron shell as Wallhammer:
   - Share it as a small package, or copy it with attribution between the owner's repos.
   - Use steamworks-ffi-node leaderboards to mirror PixelDen's.
5. **Capacitor Android** builds of the flagship games in Docker. iOS waits for the Mac decision.

---

## 9. Open questions for the owner

1. **iOS route:** allow Xcode on the Mac host (OC-B4), pay for cloud Mac CI (Codemagic free tier
   or GitHub macOS runners), or skip iOS for now?
2. **macOS signing:** may a session run an rcodesign spike with a Developer ID certificate in
   Docker? This needs the $99/yr Apple programme and a `.p12` export from the owner.
3. **PixelDen on stores:** is a Play Store TWA of the portal wanted? It needs a PWA (service
   worker) on the production site and a Play developer account with 12 testers.
4. **Which PixelDen games are "flagship"** candidates for Steam and itch? Is a $2–5 price
   acceptable, or free with a supporter pack?
5. **Company or individual** (OC-B2): this decides between Microsoft Store signing and Azure
   Artifact Signing, and Android developer verification as a person or an organization.
6. **Shared shell:** one Electron shell package used by both repos, or a copy in each?

---

## Sources

All accessed 2026-10-14. Dates of the sources are in brackets where known.

**Desktop, Steam**
- https://www.electron.build/docs/features/multi-platform-build (v27 docs, 2026)
- https://electron.github.io/packager/main/ (2026)
- https://github.com/electron/notarize (2026)
- https://registry.npmjs.org/electron , https://registry.npmjs.org/steamworks.js , https://registry.npmjs.org/steamworks-ffi-node , https://registry.npmjs.org/nw , https://registry.npmjs.org/@neutralinojs/neu , https://registry.npmjs.org/electron-updater , https://registry.npmjs.org/three , https://registry.npmjs.org/phaser , https://registry.npmjs.org/@capacitor/core , https://registry.npmjs.org/@bubblewrap/cli , https://registry.npmjs.org/@tauri-apps/cli (registry data, 2026-10-14)
- https://raw.githubusercontent.com/ArtyProf/steamworks-ffi-node/main/README.md (v0.11.3, 2026-09)
- https://github.com/neutralinojs/neutralinojs (2026)
- https://v2.tauri.app/release/tauri/ (2026)
- https://github.com/gpuweb/gpuweb/wiki/Implementation-Status (edited 2026-10-02)
- https://bugs.webkit.org/show_bug.cgi?id=294338 (2025-06 to 2026-09-17)
- https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ (SwiftShader intent, 2024)
- https://developer.samsung.com/browser/policy/enable-unsafe-swift-shader.html (2025)
- https://www.summerengine.com/make-great-games/threejs-game-on-steam (≥ 2026-08; vendor bias noted)
- https://www.drawize.com/blog/tech-how-to-release-html5-game-on-steam (older, undated)
- https://www.construct.net/en/forum/construct-2/how-do-i-18/implement-steam-overlay-108281 (older)
- https://partner.steamgames.com/doc/features/cloud
- https://partner.steamgames.com/doc/store/application/platforms
- https://partner.steamgames.com/steamdirect
- https://tessl.io/registry/testland/platform-cert-overview-reference/files/references/steam-direct.md (secondary, 2026)
- https://github.com/game-ci/steam-deploy (MIT, 2026)
- https://www.pcgamesn.com/steam-machine/verified (2026-03) [refuted 2026-10-14: dated 2026-01-14, pre-GDC, no fps/resolution figures]
- https://heise.de/-11208466 (2026-03)
- https://store.epicgames.com/en-US/publish (current)
- https://gregoryszorc.com/docs/apple-codesign/main/ (apple-codesign 0.29 docs)

**Mobile, stores**
- https://developer.apple.com/app-store/review/guidelines/ (current text, fetched 2026-10-14)
- https://www.developer.apple.com/programs/mini-apps-partner/ (2025-11)
- https://techcrunch.com/2025/11/13/apple-halves-commissions-for-mini-app-makers/ (2025-11-13)
- https://capacitorjs.com/docs/getting-started/environment-setup (Capacitor 8)
- https://ionic.io/blog/?p=6904 (2026-08-28)
- https://capgo.app/docs/upgrade/from-appflow-to-capgo/ (2026, vendor)
- https://developer.chrome.com/docs/android/trusted-web-activity (2020-02-04)
- https://www.thinktecture.com/en/pwa/twa-bubblewrap (undated)
- https://heise.de/-10749652 (2025-10)
- https://android-developers.googleblog.com/2020/10/developer-tips-and-guides-common-policy.html (2020-10)
- https://thehackernews.com/2026/06/google-sets-sept-30-deadline-for.html (2026-06)
- https://blogs.windows.com/windowsdeveloper/?p=57557 (2025-09-10)
- https://betanews.com/2025/09/12/microsoft-helps-out-app-developers-by-wiping-out-store-fees/ (2025-09-12)
- https://winaero.com/microsoft-store-is-now-free-for-individual-developers (2025-09)
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/choose-distribution-path (current)
- https://phaser.discourse.group/t/phaser-3-capacitor-android-apk-white-screens-texture-rendering-failures-and-orientation-issues/15571 (2025)
- https://phaser.io/tutorials/bring-your-phaser-game-to-ios-and-android-with-capacitor (2024-09)
- https://raxxo.shop/blogs/lab/shipping-a-three-js-game-to-the-ios-app-store (2026-09-01)
- https://cdn.jsdelivr.net/gh/xtool-org/xtool@main/README.md (2025–26)
- https://forums.swift.org/t/xtool-cross-platform-xcode-replacement-build-ios-apps-on-linux-and-more/79803 (2025-05)
- https://docs.codemagic.io/billing/pricing.md (current)
- https://cirrus-ci.org/examples (current)

**itch.io**
- https://itch.io/docs/butler/pushing.html
- https://itch.io/docs/butler/installing.html
- https://itch.io/docs/butler/login.html

**Shipped games**
- https://en.wikipedia.org/wiki/Vampire_Survivors
- https://phaser.io/news/2026/04/desktop-heroes-phaser-electron-steam (2026-05-08)
- https://phaser.discourse.group/t/carnage-cliff-demo/15373 (2025-06-09)
- https://phaser.io/news/2026/07/fuel-field-phaser-roguelite-interview (2026-07-22)
- https://phaser.io/news/2026/06/gate-militia-math-gate-army-shooter-built-with-phaser-now-on-google-play (2026-06)
- https://www.pcgamesn.com/cookie-clicker/steam (2021)
- https://github.com/Kesefon/NativeCookie
- https://steamcommunity.com/app/1408720/discussions/0/4041482690812466335 (2023–24)

**Consoles**
- https://generalarcade.com/runtimes/ (current)
- https://github.com/TooTallNate/nx.js (MIT, 2026)

**Licences of things recommended for reuse:** Electron, electron-builder, @electron/packager,
steamworks-ffi-node, Capacitor, Neutralinojs and nx.js are MIT; Bubblewrap is Apache-2.0; game-ci/
steam-deploy is MIT (pattern only); rcodesign (apple-codesign) is a tool we would run, not copy
(licence not confirmed on the page fetched; [U] MPL-2.0). The Steamworks SDK redistributables are
under Valve's SDK agreement and must not be committed to a public repo. Nothing here touches the
[licence flags](README.md#licence-flags) list.

---

## Verification (2026-10-14)

Adversarial fact-check of the claims that drive decisions. Sources were re-fetched; repo claims were checked against the files in `wallhammerzero` and `~/projects/nodejs/pixelden`. 27 claims checked.

**Confirmed**
- steamworks.js: npm `latest` 0.4.0, published 2024-08-06, MIT (registry).
- steamworks-ffi-node: 0.11.3 published 2026-09-24, MIT, targets Steamworks SDK 1.64, "use it in your main process", `asarUnpack` list and "SDK redistributables not included" as quoted (README). The README's cloud function count is inconsistent (17 vs 14), as the report notes.
- Electron: `latest` 44.7.2 published 2026-10-14; electron-builder docs: Electron 44 removed Windows ia32 and Linux armv7l, electron-builder "fails fast" on 44+; "macOS Code Signing works only on macOS". Docker Hub has a `24-wine` tag (updated 2026-05-21) even though the docs page lists only `:wine`.
- SwiftShader: deprecation warning from Chrome 130 (blink-dev intent; the intent itself estimated removal in M137); context creation fails from **M139** (Samsung `EnableUnsafeSwiftShader` policy page). Chromium's swiftshader.md gives the opt-in as `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader`.
- Steam Auto-Cloud roots: `WinAppDataRoaming`, `MacAppSupport`, `LinuxHome`, `LinuxXdgDataHome` exist; there is no `LinuxXdgConfigHome`; byte quota and file count are per user per game. Electron's `userData` on Linux is `$XDG_CONFIG_HOME/<app>` or `~/.config/<app>` (Electron `app` docs), so row 6's [U] can be read as confirmed.
- Vampire Survivors: 1.0 on 2022-10-20 (Wikipedia); v1.6 moved to Unity on 2023-08-17 (GamingOnLinux, TechRadar, summerengine). multiplatform.md's "Mar 2022, before the console releases" was indeed wrong (Xbox 2022-11, Switch 2023-08-17, PS 2024-08).
- Steam Machine Verified: 1080p at a stable 30 fps, full controller play, Deck Verified carries over automatically (heise 2026-03-12 and GDC 2026 coverage). See the refutation of the PCGamesN citation below.
- Apple guideline 4.7 covers "HTML5 and JavaScript mini apps and mini games" with 4.7.1–4.7.5 as summarised; 2.5.2 and 4.2.2 quoted correctly. Mini Apps Partner Program: 85 % to the developer (Apple page), announced 2025-11-13 (TechCrunch).
- Android developer verification: 2026-09-30 for Brazil, Indonesia, Singapore, Thailand; global in 2027; a free limited-distribution account for up to 20 devices (developer.android.com and press; The Hacker News itself returned 403).
- Microsoft Store: free registration for individuals since 2025-09-10, MSIX signed by Microsoft, updates delivered by Windows; custom commerce only for non-game apps (Windows developer blog).
- General Arcade runtimes list only RPG Maker MV/MZ, Ren'Py and Pygame; no Phaser, Construct or three.js.
- Appflow: no new customers, projects run until 2027-12-31 (Capgo page, vendor source).
- WebKit 294338: status NEW, modified 2026-09-17, Scirra comment 2026-08-12.
- Versions on npm (2026-10-14): nw 0.118.0 (2026-10-11), three 0.186.1 (2026-09-24), three 0.180.0 (2025-09-03), electron-updater 6.8.9 (2026-06-05; a 7.0.0-alpha exists), phaser 4.2.1 (2026-07-09), @tauri-apps/cli 2.12.2 (2026-10-10; crate 2.12.3), @neutralinojs/neu 11.8.0 (2026-10-06), @capacitor/core 8.5.3 (2026-10-07; `next` 9.0.0-alpha.8), @bubblewrap/cli 1.27.0 (2026-10-09, Apache-2.0).
- Capacitor 9: forecast for the end of November 2026, Cordova layer optional, Swift rewrite, CocoaPods trunk read-only on 2026-12-02 (Ionic, 2026-08-28).
- gpuweb wiki (edited 2026-10-02): Chrome on Linux ships WebGPU by default for Intel Gen12+ (M144) and NVIDIA on Wayland (M147, driver ≥ 535.183.01); everything else behind `--enable-unsafe-webgpu`; Safari on macOS 26 yes.
- Steam Direct: $100 per product, recoupable after $1,000 adjusted gross revenue, 30-day wait, "coming soon" page public for at least two weeks. macOS builds must be notarized; the app-sandbox entitlement is incompatible with Steam.
- apple-codesign 0.29.0: signs, notarizes and staples `.app`, `.pkg` and `.dmg` from Linux; cannot sign file contents of DMGs or recursively sign flat packages; "long tail" of discrepancies. Licence not on the page (still [U]).
- @electron/packager: "the `.app` bundle can only be signed when building on a host macOS platform".
- nx.js: V8, WebGL2 over OpenGL ES 3, MIT, homebrew runtime.
- Fuel Field (phaser.io, 2026-07-22): 12 testers for 14 days, "several months" lost, Steam dropped as the wrong audience. Gate Militia (2026-07-03 article): Phaser 3.90.0 vendored with no bundler, Capacitor 8, Play release April 2026. Desktop Heroes (2026-05-08): 3 people, Steam October 2025, $3.99, "no official JavaScript SDK", encoded JSON saves at milestones.
- RAXXO (2026-09-01): 17 days / 247 commits, `webglcontextlost` + `preventDefault()`, `isContextLost()` polled about every 2 s, draw-call floor < 10 draws for 120 frames, loop breaker 3 recoveries in 10 minutes, StoreKit 2 bridge only after `Product.products(for:)` returns a product. The "40 minutes" is the author's example, not a measured time.
- Codemagic: 500 free macOS M2 minutes per month for individuals, $0.095/min after.
- iOS 26: home-screen sites open as web apps by default, no manifest or service worker required (heise, 2025-10-10).
- Drawize: `--in-process-gpu` increases how many players see the overlay; continuous repaint needed; `--ignore-gpu-blacklist` made it render but crashed, so dropped.
- Wallhammer repo: New Hope has `three ^0.180.0` and `vite ^8.3.2`; task #33 is the desktop wrapper (`packages/shell-desktop`), #30 the studio play-and-builds task, #34 mobile; OC-B2 and OC-B4 exist in `tasks/2026-10-02-owner-calls.md`; the desktop-wrapper task does say the smoke test draws through "the CPU fallback".
- PixelDen repo: games under `app/games/<slug>/` re-export `getConfig`; `app/components/game-canvas.tsx` listens for `game-start`, `game-over`, `score-update`, `level-complete` and posts to `/api/scores`; `app/games/shared/cloud-progress.ts` exists; `public/assets/games` is 32 MB; React Router 7.12.

**Refuted (marked inline)**
- §7.3 "Phaser 4.2, ~56 games": the repo pins Phaser **4.0.0** (`pnpm-lock.yaml`), and there are 54 game folders / 55 registry entries.
- §0 row 8 and Sources: the PCGamesN article is from 2026-01-14 and contains no fps/resolution figures; only heise (2026-03-12) supports the 1080p/30 fps rule.

**Unconfirmed (marked inline)**
- Tauri "CEF runtime only in v3 alphas": the releases page shows no 3.x, and the 3.0.0-alpha.4 notes mention no CEF.
- Tauri/WebKitGTK "no WebGPU on Linux": the cited wiki does not cover WebKitGTK.
- Epic Games Store row ($100 recoupable, 88 %, achievements, crossplay, IARC): the page returned 403.
- xtool "needs `Xcode.xip`": not in the README fetched; the forums thread was not re-checked.
- The game in the RAXXO article being NIGHTMILE: the article never names it.
- Desktop Heroes "always-on-top": the article does not say so.
- Not re-checked: thinktecture TWA page, Construct forum, tessl Steam-review summary, Cookie Clicker/NativeCookie, Krunker thread, Cirrus image, Winaero, Betanews, Chrome TWA fallback when Chrome is absent (the page covers only an outdated Chrome), the Swift forums xtool thread.

**Gaps**
- The report never states which Phaser major the standalone shell must support; PixelDen is on 4.0.0, and Phaser 4.x minor upgrades are a separate decision.
- No source for "Android WebView is uncapped" at 120 Hz, or for Neutralinojs having no Steam route beyond absence of evidence.
- The Steam Machine Verified numbers rest on press coverage of a GDC talk; Valve's own slides/PDF were not fetched.
- rcodesign's licence (MPL-2.0 per the report's [U]) is still unverified, and no spike has run; the "signed macOS build in Docker" remains untested.
- The claim that the Vampire Survivors console ports were Unity contradicts the dates (Xbox 2022-11 predates v1.6 in 2023-08); it stays [U] and probably needs splitting by platform.
