# Shipping Wallhammer Zero games everywhere — multiplatform research

*Research date: 2026-10-02. Status: proposal only. It records no decisions and no tasks.*

**How to read this document**

| Label | Meaning |
|---|---|
| **[S]** | Sourced fact. The link is inline, and every URL is also in *Sources*. |
| **[O]** | Opinion or recommendation (mine). |
| **[U]** | Unverified or uncertain. The source was weak, secondary, blocked, or only known from a search snippet. |
| **[NDA]** | The information exists but is under console-maker NDA and is not public. |

**Scope.** Two game types are covered:
- **(a)** 2D pixel-art management sims in the Kairosoft style.
- **(b)** 3D voxel games. The first planned one is a single big procedural planet in the spirit of *Light No Fire*: seed-generated, curvature visible from altitude, ground and flying mounts, all graphics as code.

**Players.** "Player A" is TypeScript on a web-tech runtime. "Player B" is a possible later Godot player.

---

## Executive summary

1. **Desktop/Steam: Electron, not Tauri or NW.js.**
   - **Electron** [O]:
     - It ships the same Chromium on Windows, macOS and Linux.
     - It is not stuck at 60 fps on 120 Hz Mac screens.
     - It has WebGPU on Windows/macOS.
     - It has the most-used Steam bindings, and it needs no Rust.
   - **Tauri v2** relies on the OS webviews, which hurt games today [S]:
     - WKWebView caps `requestAnimationFrame` at 60 Hz.
     - WebKitGTK can silently fall back to slow WebGL and has no WebGPU.
     - Its Chromium (CEF) backend is still alpha, in Tauri v3.
   - **NW.js** is current but has no advantage over Electron. Construct 3 dropped it in 2025 [S/U].
2. **Steam features work but need care.**
   - Achievements, Steam Cloud and Steam Input are fine via steamworks.js or the newer steamworks-ffi-node.
   - The **Steam overlay is best-effort** in any Chromium wrapper. It needs `--in-process-gpu` and continuous redraw, and some open bugs remain [S].
   - Valve tests a game's **native Linux build first** for Steam Deck review, then the Windows build under Proton, and submits whichever result is better [S].
3. **Signing.**
   - **Mac:** notarization is mandatory for Mac builds on Steam [S].
   - **Windows:** code signing is **not required by Steam** (no requirement found [U]).
   - **Azure Artifact Signing** costs from $9.99/month. In the EU it is available **only to organizations**; individuals must be in the US or Canada [S].
4. **Mobile: Capacitor 8, not Tauri 2 mobile.**
   - Both use the same system webviews, so rendering, audio and the **60 Hz cap on iOS** are identical [S].
   - Capacitor wins on the native side [S]:
     - maintained IAP plugin (RevenueCat);
     - built-in Android 16 edge-to-edge handling;
     - no Rust.
   - Game Center will be a small custom plugin either way.
   - Engineer for these from the start:
     - WebView process death (autosave to native storage);
     - iOS silent-switch and resume audio bugs;
     - `android:appCategory="game"`.
   - **Android WebView has no `SharedArrayBuffer`**, so no WASM threads [S]. Voxel workers must use transferable buffers.
5. **Consoles: no "ship the web build" route in 2026.**
   - Xbox stopped accepting UWP/WebView2 games; Microsoft's FAQ was updated in Jan 2026 [S].
   - Nintendo has had no public HTML5 runtime since Wii U [S].
   - Sony has no public route for web games [NDA/U].
6. **How JS games actually reach consoles: a porting house replaces the browser host.**
   - **Interpreted JS on QuickJS + a native renderer:** General Arcade does this for RPG Maker MV/MZ, including Switch 2 and PS5 [S].
   - **Ahead-of-time JS→C++:** CrossCode [S]; Chowdren for Construct/Fusion [S].
   - **A rewrite in Unity:** Vampire Survivors [S].
   - Prices are never public [NDA].
   - **Our small, self-owned runtime makes this a narrow job** [O].
7. **Godot console route is public and cheap for indies.**
   - W4 Consoles Starter costs **$800 per platform per year, or $2,000/year for all** [S]. It covers Switch, Switch 2 (beta), PS5 and Xbox Series.
   - You still need console-maker approval and devkits.
   - **ID@Xbox gives two free devkits** [S].
   - Nintendo's portal accepts **individuals** [S].
8. **Determinism is an architecture decision, not a later fix.**
   - The ECMAScript spec makes `Math.sin` & co. **"implementation-approximated"** [S].
   - Godot calls the platform's libm [S].
   - JS and GDScript differ in rounding, integer width, JSON number types, sort stability and dictionary key order [S].
   - **The sim must use integers or fixed point only, our own PRNG, and explicit ordering** [O].
9. **The best "B" is to run the *same* simulation code, not a GDScript rewrite** [O]:
   - Option 1: the compiled JS sim on QuickJS inside Godot (GodotJS, or a tiny engine module).
   - Option 2: a portable core compiled to WASM for the web and to native/wasm2c for Godot.
   - Either way, add a **conformance corpus** (seed + game-data hash + command log → expected digests) from day one. That corpus is the contract any player must pass.
10. **3D voxel planet: platform support is fine; the risk is performance and porting.**
    - WebGL2 is the floor and WebGPU an enhancement. WebGPU is off by default on AMD Linux, which includes the Steam Deck, and absent in WebKitGTK [S].
    - Planet LOD, cube-sphere chunking and floating origin are custom work in any stack [O].
    - **Hot code (noise, meshing) should live in a portable compiled core, not in JS.** Consoles allow no JIT, and CrossCode found plain JS interpretation too slow for 60 fps [S].
11. **"Games are pure data" still holds for procedural games if we redefine "data"** [O]:
    - Seed + archetype parameters + a *declarative generator spec*, plus a **versioned generator implementation treated as part of the player ABI** and verified by golden chunk hashes.
    - Minecraft's two codebases reached seed parity only for terrain and biomes in 1.18, not for structures and decorations [S]. That shows the cost of two independent generators.
12. **A local "Build" button on the Mac covers almost everything** [S/O]:
    - Web, signed and notarized macOS, unpacked Windows/Linux Electron folders for Steam, iOS and Android, and the Steam upload via `steamcmd`.
    - **GitHub Actions** is for clean, reproducible Windows/Linux builds, Windows-only installers, and cross-engine conformance runs.
    - Public repositories get standard runners free; private ones pay per minute (Linux $0.006/min, macOS $0.062/min) [S].

---

## 1. Desktop: Electron vs Tauri v2 vs NW.js

### 1.1 Runtime facts

| | Electron | Tauri v2 | NW.js |
|---|---|---|---|
| Engine | Bundled Chromium + Node. A new major every 8 weeks; the latest 3 are supported [S]([Electron timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)) | OS webview: WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux [S]([pkgpulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)). v2.12.1 on 2026-09-30 [S]([releasealert](https://releasealert.dev/github/tauri-apps/tauri)) | Bundled Chromium + Node. v0.117.0 on 2026-09-25 uses Chromium 154 [S]([nw.js](https://github.com/nwjs/nw.js)) |
| Current versions | Stable lines 44/43/42 = Chromium 152/150/148 (2026-09-30) [S]([releases](https://releases.electronjs.org/)) | v3 alpha with `tauri-runtime-cef` alpha (2026-10-01) [S]([tauri releases](https://github.com/tauri-apps/tauri/releases)) | — |
| Installer size | Often 50–150 MB [S/U]([pkgpulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)) | Often 3–15 MB. Embedding CEF added ~170 MB in one report [S/U]([atrium](https://getatrium.dev/blog/embedding-real-browser-tauri)) | Similar to Electron [O] |
| Idle memory | 100–300 MB [S/U] | 20–100 MB [S/U] | Similar to Electron [O] |
| Needs Rust | No | Yes. The owner has no Rust installed | No |

**[O] Sizes don't matter on Steam.** Steam compresses and delta-patches downloads. A 120 MB runtime next to a pixel-art game is irrelevant to buyers.

### 1.2 Graphics consistency (WebGL2 / WebGPU)

**Chromium (Electron, NW.js, WebView2)** [S]([gpuweb wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status))
- WebGPU is on by default on Windows and macOS since version 113.
- On Linux it is on by default only for Intel Gen12+ (from 144) and NVIDIA on Wayland (from 147).
- **AMD on Linux, including the Steam Deck, still needs flags.**

**WKWebView (macOS/iOS)** [S]([Apple forums](https://developer.apple.com/forums/thread/770862))
- Safari 26 turned WebGPU on by default.
- An Apple engineer said the WKWebView behaviour follows the WebKit default, not Safari's feature flags.
- So WKWebView gets WebGPU on macOS 26 and iOS 26. Older OS versions fall back to WebGL2.

**WebKitGTK (Tauri on Linux)**
- **No WebGPU work** [S]([webkit-gtk list, 2023](https://lists.webkit.org/pipermail/webkit-gtk/2023-October/003947.html); [WebKitGTK 2.50](https://webkitgtk.org/2025/11/26/webkitgtk-2.50.html)).
- Tauri's own docs (updated 2026-06-15) say [S]([Tauri Linux graphics](https://v2.tauri.app/develop/debug/linux-graphics/)):
  - "WebGL2 context creation succeeds even when the result is backed by a software rasterizer or a slow presentation path."
  - The renderer string is masked, so the game cannot detect the slow path.
  - NVIDIA needs `WEBKIT_DISABLE_DMABUF_RENDERER=1`-style workarounds.
- Reports of the same app running at 10–20 fps vs 40–60 fps, and at 40 fps vs 240 fps against Chromium [S]([WebKit bug 278695](https://bugs.webkit.org/show_bug.cgi?id=278695); [Tauri discussion #8524](https://github.com/orgs/tauri-apps/discussions/8524)).

**Construct 3 as an industry signal** [S/U]
- In r450 (2025-07-29) Construct removed its NW.js exporter.
- It now exports Windows→WebView2, macOS→WKWebView and **Linux→CEF**. That means it deliberately avoids WebKitGTK on Linux ([r450](https://www.construct.net/make-games/releases/beta/r450); [forum](https://www.construct.net/en/forum/construct-3/general-discussion-7/refocus-export-direction-183136)).
- Construct.net blocks automated fetching, so this rests on search excerpts [U].

### 1.3 Frame pacing, input, audio

**High-refresh displays**
- **WKWebView caps `requestAnimationFrame` at 60 Hz on ProMotion displays.**
  - The Safari toggle that lifts the cap "only affects Safari".
  - WebKit bug 294338 (filed 2025-06-11) is still NEW [S]([WebKit 294338](https://bugs.webkit.org/show_bug.cgi?id=294338); [Apple forums 796512](https://developer.apple.com/forums/thread/796512)).
  - This hits the owner's own 120 Hz MacBook if we use Tauri.
- Chromium wrappers are not capped [S]([#8524](https://github.com/orgs/tauri-apps/discussions/8524)).
- No VRR-specific data was found [U].

**Gamepad**
- WKWebView only delivers gamepad events when the webview is first responder [S]([WebKit 269292](https://bugs.webkit.org/show_bug.cgi?id=269292)).
- `tauri-plugin-gamepad` exists because WebKit "does not support all the joysticks and gamepads" [S]([plugin](https://github.com/DeveloperMindset-com/tauri-plugin-gamepad)).
- [O] On Steam this matters less: Steam Input can present any controller as an XInput pad. Chromium's Gamepad API is the most predictable option.

**Audio and fullscreen**
- No 2025–26 latency comparison exists. `AudioContext.outputLatency` is Baseline 2025, so measure it per wrapper [S]([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency)).
- [O] For a management sim, Web Audio latency (typically tens of ms) is irrelevant. Fullscreen in Electron is a `BrowserWindow` option and is not a risk.

### 1.4 Steam integration

**Bindings**

| Binding | Status | Notes |
|---|---|---|
| **steamworks.js** (Rust/napi) | Last commit 2025-09-07, no tagged releases [S]([commits](https://github.com/ceifa/steamworks.js/commits/main)) | Achievements, cloud, input, workshop, Deck on-screen keyboard, `isSteamRunningOnSteamDeck`; **no leaderboards** [S]([client.d.ts](https://raw.githubusercontent.com/ceifa/steamworks.js/main/client.d.ts)). Bitburner ships a fork [S]([bitburner package.json](https://raw.githubusercontent.com/bitburner-official/bitburner-src/dev/electron/package.json)) |
| **steamworks-ffi-node** (Koffi FFI, SDK 1.64) | v0.11.3, Sep 2026 [S]([releases](https://github.com/ArtyProf/steamworks-ffi-node/releases)) | Broad API including leaderboards. Native libraries must sit outside `.asar` [S]([README](https://raw.githubusercontent.com/ArtyProf/steamworks-ffi-node/main/README.md)) |
| **greenworks** | "Best-effort", SDK 1.62 [S]([greenworks](https://github.com/greenheartgames/greenworks)) | Historical, written for Game Dev Tycoon. Not recommended [O] |
| **Tauri**: steamworks-rs 0.13.1 (2026-05) | Mature crate [S]([crates.io](https://crates.io/api/v1/crates/steamworks)) | `tauri-plugin-steamworks` has only 42 downloads [S] |

**Steam Cloud**
- **Auto-Cloud** needs no code: you configure root paths per OS on the Steamworks site [S]([Steam Cloud](https://partner.steamgames.com/doc/features/cloud)).
- [O] That is the right default if saves are plain files in a known directory.

**Steam overlay**
- Why it breaks [S]([tauri-steam-overlay-surface](https://github.com/PSG-Team/tauri-steam-overlay-surface)):
  - Steam hooks the GPU *Present* call in the game process.
  - Chromium renders in a separate GPU process, and WebView2 in `msedgewebview2.exe`.
- Electron/NW.js workarounds:
  - `--in-process-gpu` plus continuously redrawing a canvas [S]([greenworks troubleshooting](https://raw.githubusercontent.com/greenheartgames/greenworks/master/docs/troubleshooting.md); [jake.software](https://jake.software/enabling-the-steam-overlay-in-an-electron-app)).
  - steamworks.js wraps this as `electronEnableSteamOverlay()`. It requires `contextIsolation:false` [S]([steamworks.js](https://github.com/ceifa/steamworks.js)).
  - The Drawize postmortem [S]([Drawize](https://www.drawize.com/blog/tech-how-to-release-html5-game-on-steam)): `--ignore-gpu-blacklist` caused crashes, so they kept `--in-process-gpu`, redrew small canvases, and **detected a broken overlay to fall back to their own UI**.
- Status 2025–26:
  - steamworks.js has open issues: macOS overlay (#50), white overlay (#116) and Linux overlay (#195, Jul 2025) [S]([issues](https://github.com/ceifa/steamworks.js/issues?q=is%3Aissue+overlay)).
  - steamworks-ffi-node has an experimental route: render offscreen, then blit into a native Metal/OpenGL window that Steam can hook. It is X11 only and adds about one frame of latency [S]([doc](https://raw.githubusercontent.com/ArtyProf/steamworks-ffi-node/main/docs/STEAM_OVERLAY_INTEGRATION.md)).
- WebView2/Tauri: `--in-process-gpu` does not help [S]([WebView2Feedback #4019](https://github.com/MicrosoftEdge/WebView2Feedback/discussions/4019)).
  - Construct and the Tauri plugins use a transparent decoy D3D11 window [S/U].
- [O] **Treat the overlay as nice-to-have.** Nothing in the game may depend on it, including purchases, invites and the keyboard. The exception is the Deck on-screen keyboard, which goes through its own API call.

**Steam Deck**
- Valve tests the **Linux build first**. If it fails, Valve tests the Windows build under Proton and submits "whichever set of test results is more favorable" [S]([Deck compat](https://partner.steamgames.com/doc/steamdeck/compat)).
- Deck Verified requires:
  - the controller working by default;
  - the on-screen keyboard via the Steamworks API;
  - 1280×800 support;
  - text at least 9 px tall [S].
- [O] For pixel art, author UI for 1280×800 from the start, which is 16:10. Kairosoft-style UIs at 2–3× integer scale fit.
- Valve's Deck docs say nothing about Electron [S]([recommendations](https://partner.steamgames.com/doc/steamdeck/recommendations)).
- [O] Ship a native Linux Electron build and also check the Windows build under Proton. Valve picks the better result.

### 1.5 Building and signing desktop builds

**Steam needs no installers.** SteamPipe uploads a folder [S]([uploading](https://partner.steamgames.com/doc/sdk/uploading)).
- [O] For Steam, "building Windows/Linux" therefore means *packaging an unpacked Electron directory*. Electron ships prebuilt binaries for every OS, so that is mostly file copying plus resource editing.

**Electron**
- electron-builder: "Don't expect that you can build an app for all platforms on one platform" [S]([electron-builder](https://www.electron.build/docs/features/multi-platform-build)):
  - Native modules without prebuilds break cross-builds.
  - Squirrel.Windows needs Mono and Wine.
  - "macOS Code Signing works only on macOS."
- Electron Forge [S]([Forge build lifecycle](https://www.electronforge.io/core-concepts/build-lifecycle); [zip maker](https://www.electronforge.io/config/makers/zip.md)):
  - Builds for the host OS by default and recommends CI for other operating systems.
  - Its zip maker "will run on any platform".
- [U] Whether setting the Windows `.exe` icon and metadata from macOS still needs Wine. Test it.
- steamworks.js and steamworks-ffi-node ship prebuilt per-OS binaries [S]. [O] They should not block packaging a Windows folder on a Mac.

**Tauri**
- Windows builds from macOS are NSIS only, via cargo-xwin, which the docs call "a last resort". MSI is Windows-only [S]([Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/)).
- Linux builds must be done on an old Linux base (Ubuntu 22.04 / Debian 12) [S]([Tauri Debian](https://v2.tauri.app/distribute/debian/)).

**Apple**
- You need the Apple Developer Program ($99/year) [S]([Apple programs](https://developer.apple.com/programs/)), then:
  - Developer ID signing;
  - **notarization** via `notarytool`. Prefer an App Store Connect API key (`.p8`) for automation [S]([Apple notarizing](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution); [Apple forums](https://developer.apple.com/forums/thread/786582)).
- **Steam has required notarized macOS apps since 2019-10-14** [S]([Steam platforms](https://partner.steamgames.com/doc/store/application/platforms)).

**Windows**
- Since June 2023, code-signing keys must live on HSMs [S]([Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)).
- Microsoft (May 2026): "EV certificates no longer bypass SmartScreen" [S]([SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)).
- **Azure Artifact Signing** (formerly Trusted Signing):
  - GA since 2026-01; $9.99/month for 5,000 signatures [S]([devclass](https://devclass.com/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/)).
  - "Individual developers must be located in the United States or Canada." Organizations in the EU/UK qualify [S]([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)).
- **Signing from a Mac** is possible:
  - `jsign` supports Artifact Signing and other cloud HSMs [S]([jsign](https://ebourg.github.io/jsign/)).
  - electron-builder can sign via PKCS#11 with its bundled osslsigncode [S]([electron-builder unix signing](https://www.electron.build/docs/tutorials/code-signing-windows-apps-on-unix)).
- **Steam:** no Windows signing requirement was found [U, absence of evidence] ([Steam platforms](https://partner.steamgames.com/doc/store/application/platforms)).
- [O] Skip Windows signing for a Steam-only release. Revisit it for itch.io or direct downloads, where SmartScreen warnings matter.

### 1.6 Shipped web-tech games on Steam (and what happened to them)

| Game | Tech | What's known |
|---|---|---|
| **Game Dev Tycoon** | NW.js (PC), Unity (mobile) | "One of the first node-webkit powered games on Steam". greenworks was born here [S]([Wikipedia](https://en.wikipedia.org/wiki/Game_Dev_Tycoon); [NW.js wiki](https://github.com/nwjs/nw.js/wiki/List-of-apps-and-companies-using-nw.js)) |
| **CrossCode** | JS/HTML5 (NW.js on PC) | Console ports required compiling the JS codebase **ahead of time into C++**; V8 was "not an option"; plain interpretation was "not fast enough" for 60 fps on Switch [S]([Siliconera 2020](https://www.siliconera.com/crosscode-interview-radical-fish-games-on-console-ports-and-whats-next/); [Wikipedia](https://en.wikipedia.org/wiki/CrossCode)) |
| **Vampire Survivors** | Phaser (JS) up to v1.6, then Unity | Port to an "industry-standard" engine "to improve its overall performance" (Mar 2022), *before* the console releases [S]([Wikipedia](https://en.wikipedia.org/wiki/Vampire_Survivors)). That the early PC build used Electron is **[U]** |
| **Bitburner** | Electron + steamworks.js fork | Achievements via an Electron-side module [S]([repo](https://github.com/bitburner-official/bitburner-src/tree/dev/electron)) |
| **OMORI** | RPG Maker MV (JS/PixiJS, NW.js on PC) | Console ports by MP2 Games (2022) [S]([Wikipedia](https://en.wikipedia.org/wiki/Omori_(video_game))); method not public |
| **Cookie Clicker** | JS | Steam release 2021-09-01; consoles 2025-05-22 [S]([Wikipedia](https://en.wikipedia.org/wiki/Cookie_Clicker)); wrapper and console tech **[U]** |

**Lessons**
- **[S]** The biggest *successful* JS games on Steam either stayed JS on PC and got a special console solution (CrossCode, OMORI), or moved engines when they grew (Vampire Survivors).
- **[O]** Performance problems were in action games with many entities. A Kairosoft-style sim is a far lighter load. The overlay and old bindings were the practical pain points.

---

## 2. Mobile: Capacitor vs Tauri 2 mobile

### 2.1 Framework status

**Capacitor 8** (released 2025-12-08) [S]
- Swift Package Manager is the default for iOS. A new **SystemBars** plugin handles Android edge-to-edge ([Ionic blog](https://ionic.io/blog/announcing-capacitor-8)).
- The current release is 8.5.2 (2026-09-11).
- Requirements: Node 22+, Xcode 26+, iOS 15+, Android min SDK 24 / target SDK 36 ([Capacitor 8 update guide](https://capacitorjs.com/docs/updating/8-0)).
- **Capacitor 9** is forecast for late Nov 2026: Cordova layer optional, CocoaPods trunk read-only from 2026-12-02 ([Ionic, Aug 2026](https://ionic.io/blog/?p=6904)).
- Capacitor needs no Rust. Its plugins are Swift/Kotlin/TS ([Capacitor iOS](https://capacitorjs.com/docs/ios)).

**Tauri 2 mobile** [S]
- Stable since 2024-10-02; the current release is 2.12.1 ([Wikipedia](https://en.wikipedia.org/wiki/Tauri_(software_framework))).
- It needs Rust, the iOS/Android Rust targets and the NDK on top of Xcode and Android Studio ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).
- There are 62 open issues with "ios" and 119 with "android" in the title (2026-10-02) ([GitHub search](https://api.github.com/search/issues?q=repo:tauri-apps/tauri+is:issue+is:open+ios+in:title)).
- A Jan 2026 write-up on shipping a PixiJS game to iOS describes Xcode-archive and PATH problems with the Rust build step ([jangwook.net](https://jangwook.net/zh/blog/zh/tauri-pixijs-ios-game-development/)).

**Plugins we would need**

| Need | Capacitor 8 | Tauri 2 |
|---|---|---|
| In-app purchases | RevenueCat `@revenuecat/purchases-capacitor` 13.7 (2026-10) [S]([npm](https://registry.npmjs.org/-/v1/search?text=capacitor+game+center+leaderboard&size=15)) | Community `tauri-plugin-iap` 0.10.0-**rc** [S]([crate](https://github.com/Choochmeque/tauri-plugin-iap)) |
| Game Center / Play Games | Stale or partial plugins. **Plan a small custom Swift/Kotlin plugin** [S/O]([openforge](https://raw.githubusercontent.com/openforge/capacitor-game-connect/main/package.json)) | None; Rust GameKit bindings exist [S]([crates](https://crates.io/api/v1/crates?q=gamecenter)) |
| Haptics, keep-awake, system bars, native audio | Official or maintained v8 plugins [S]([Capacitor APIs](https://capacitorjs.com/docs/apis); [native-audio](https://github.com/capacitor-community/native-audio)) | Haptics is official. Keep-awake last updated 2024. No native audio [S]([Tauri plugins](https://v2.tauri.app/plugin/)) |

**Tauri as a Capacitor desktop target**
- Capawesome released a "Capacitor Tauri platform" (2026-09-25) [S]([Capawesome](https://capawesome.io/docs/blog/announcing-the-capacitor-tauri-platform/)).
- [O] It is interesting, but for Steam the Electron reasoning in §1 still applies.

### 2.2 Rendering in WKWebView and Android WebView

**Both wrappers use the same system webviews**, so every limitation below applies to Capacitor and Tauri alike.

**WebGL2 and JIT** [S]
- WebGL2 is available from iOS 15 ([Khronos](https://www.khronos.org/blog/webgl-2-achieves-pervasive-support-from-all-major-web-browsers)).
- WKWebView gets the same JIT as Safari ([9to5mac](https://9to5mac.com/2014/06/03/ios-8-webkit-changes-finally-allow-all-apps-to-have-the-same-performance-as-safari/)).

**60 Hz cap on iOS ProMotion** [S]([WebKit 294338](https://bugs.webkit.org/show_bug.cgi?id=294338))
- WKWebView's `requestAnimationFrame` is capped at 60 Hz there.
- [O] That is fine for a management sim.

**Process death and memory** [S]
- iOS can kill WebGL- or texture-heavy WebContent processes under memory pressure without a `webglcontextlost` event first ([WebKit 300782](https://bugs.webkit.org/show_bug.cgi?id=300782)).
- Capacitor iOS reloads the webview when that happens ([source](https://raw.githubusercontent.com/ionic-team/capacitor/main/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift)).
- On Android, an unhandled `onRenderProcessGone` crashes the app ([Android docs](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview)).
- [O] So:
  - Autosave often to native storage.
  - Handle `webglcontextlost/restored`.
  - Keep texture atlases small. Pixel art helps here.

**WebGPU** [S]
- iOS 26 WKWebView has it ([WebKit WWDC25](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/); [Apple forums](https://developer.apple.com/forums/thread/770862)).
- Android WebView: compatibility mode was approved to ship in M146 "where hardware support is available" ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/N3RlLGCOTJ4/m/loneRTlPBwAJ)). Device coverage is [U].

**Android WebView vs Chrome** [S]
- WebView updates itself through the Play Store and lacks some Chrome-only features ([Chrome docs](https://developer.chrome.com/docs/multidevice/webview)).
- The Chromium GPU blocklist can disable WebGL2 on old Adreno 3xx devices ([blocklist](https://chromium.googlesource.com/chromium/src/+/HEAD/gpu/config/software_rendering_list.json)).

### 2.3 Audio

**iOS** [S]
- **Silent switch:** Web Audio follows the ringer switch, `<audio>` does not. WebKit considers this "by design" ([WebKit 262781](https://bugs.webkit.org/show_bug.cgi?id=262781)).
  - `navigator.audioSession` exists since Safari 16.4 and is experimental ([MDN BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AudioSession.json)).
  - Whether `type="playback"` overrides the switch in WKWebView is [U]. Test on a device.
- **Resume after interruption:** the `AudioContext` sometimes reports "running" while `currentTime` is frozen ([WebKit 263627](https://bugs.webkit.org/show_bug.cgi?id=263627)).
  - Workaround: suspend and resume it on the App plugin's resume event ([Capacitor App](https://capacitorjs.com/docs/apis/app)).
- Capacitor sets `mediaTypesRequiringUserActionForPlayback = []` on iOS ([source](https://raw.githubusercontent.com/ionic-team/capacitor/main/ios/Capacitor/Capacitor/CAPBridgeViewController.swift)).
  - [O] Still call `audioContext.resume()` on the first `pointerdown`.

**Android** [S]
- Capacitor calls `setMediaPlaybackRequiresUserGesture(false)` ([source](https://raw.githubusercontent.com/ionic-team/capacitor/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java)).

**[O] Recommendation**
- Keep audio behind the host audio adapter, so we can swap Web Audio for `@capacitor-community/native-audio` per platform if the WebKit bugs bite.

### 2.4 Safe areas, edge-to-edge, orientation

**Safe areas** [S]
- iOS: `viewport-fit=cover` plus `env(safe-area-inset-*)` ([WebKit](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)).
- Android: edge-to-edge is the default at target SDK 35. The opt-out is removed at target SDK 36 ([Android 15](https://developer.android.com/about/versions/15/behavior-changes-15); [Android 16](https://developer.android.com/about/versions/16/behavior-changes-16)).
  - **Google Play requires target SDK 36 from 2026-08-31** (extension possible to 2026-11-01) [S]([Play target API](https://support.google.com/googleplay/android-developer/answer/11926878)).
  - WebView versions before 140 return wrong `env()` values. Capacitor 8 SystemBars injects `--safe-area-inset-*` variables as a fallback [S]([SystemBars](https://capacitorjs.com/docs/apis/system-bars); [Capawesome guide](https://capawesome.io/blog/capacitor-edge-to-edge-and-safe-areas-guide/)).
  - Tauri had the same bug, and the reporter worked around it with a custom native plugin [S]([tauri #14240](https://github.com/tauri-apps/tauri/issues/14240)).

**Orientation** [S]([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock); [Capacitor screen orientation](https://capacitorjs.com/docs/apis/screen-orientation))
- `screen.orientation.lock()` is unreliable, so lock orientation natively: Info.plist on iOS, the manifest on Android.
- On Android 16, orientation locks are ignored on large screens. **Apps declaring `android:appCategory="game"` are exempt** [S]([Android 16](https://developer.android.com/about/versions/16/behavior-changes-16)).

**Immersive mode**
- SystemBars `hide()` hides the status and navigation bars separately [S].

### 2.5 Store acceptance

**Apple** [S]([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **4.2 Minimum Functionality** rejects "repackaged websites". Apps need "lasting entertainment value".
- **4.7** is about HTML5 mini-games that are *not* embedded in the binary.
- **2.5.2** bans downloaded code that changes functionality.
- **2.5.6** requires WebKit, which WKWebView satisfies.
- [O] A self-contained, offline, bundled game is low-risk. Avoid over-the-air JS updates that change gameplay.
- Reported Capacitor/Cordova rejections are almost all website wrappers [S]([Ionic forum](https://forum.ionicframework.com/search.json?q=rejected%204.2%20minimum%20functionality)).

**Google Play** [S]([Spam policy](https://support.google.com/googleplay/android-developer/answer/9899034); [testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465))
- Play bans apps that are just "a webview of a website without permission".
- New personal accounts need a closed test with **12 testers for 14 days** before production.

### 2.6 Offline assets, size, saves

**Serving and service workers** [S]
- Capacitor serves bundled files from `capacitor://localhost` on iOS and `https://localhost` on Android ([config](https://capacitorjs.com/docs/config)).
- Service workers in WKWebView effectively need App-Bound Domains and don't work on custom schemes ([WebKit 206741](https://bugs.webkit.org/show_bug.cgi?id=206741)).
- [O] We don't need them. Assets are bundled.

**Size limits** [S]
- iOS: 4 GB uncompressed app ([App Store Connect](https://developer.apple.com/help/app-store-connect/reference/maximum-build-file-sizes/)).
- Google Play: **500 MB** compressed base module. Asset packs go far beyond that ([Play size limits](https://support.google.com/googleplay/android-developer/answer/9859372)).
- [O] Irrelevant for pixel-art games. Relevant only if a voxel game ships big precomputed data, which a procedural game shouldn't.

**Saves** [S]
- Capacitor's own docs warn that the OS can evict localStorage and IndexedDB ([storage guide](https://capacitorjs.com/docs/guides/storage)).
- Use **Preferences** or **Filesystem/SQLite** for saves ([Preferences](https://capacitorjs.com/docs/apis/preferences)).

### 2.7 Bottom line on mobile [O]

**Capacitor 8.** Rendering, audio and the 60 Hz cap are identical between the two, because both use the system webview. Capacitor wins on everything native:
- maintained IAP and system-bars plugins;
- built-in Android 16 edge-to-edge handling;
- no Rust;
- a much larger user base.

Game Center and Play Games will be a small custom plugin either way.

---

## 3. Consoles for web-tech games in 2026

### 3.1 What the platforms allow (public part)

**No JIT and no browser engine for games**
- CrossCode's team said V8 optimisations on consoles were "not an option for specific (confidential) reasons" [S]([Siliconera](https://www.siliconera.com/crosscode-interview-radical-fish-games-on-console-ports-and-whats-next/)).
- General Arcade uses QuickJS on consoles because it needs no JIT [S]([General Arcade runtimes](https://generalarcade.com/runtimes/)).
- The exact rules are **[NDA]**. [O] Assume no JIT, no dynamic code loading and static linking.

**Nintendo**
- The Wii U had the WebKit-based Nintendo Web Framework, which was dropped for Switch [S]([Wikipedia NWF](https://en.wikipedia.org/wiki/Nintendo_Web_Framework)).
- Nothing public about a Switch 2 web runtime [U].

**Xbox**
- The route existed briefly:
  - WebView2 for Xbox UWP apps arrived in Nov 2023 [S]([PureXbox](https://www.purexbox.com/news/2023/11/xbox-app-dev-gets-webview2-support-includes-better-performance)).
  - Construct shipped an "Xbox UWP (WebView2)" export in r371 [S/U]([r371](https://www.construct.net/make-games/releases/beta/r371)).
- **It is closed now.** "UWP based games are no longer accepted in the Xbox Store. Please use the ID@XBOX program" (FAQ updated 2026-01-14) [S]([Microsoft Learn](https://learn.microsoft.com/en-us/windows/uwp/xbox-apps/frequently-asked-questions)).
- WebView2 exists for UWP, not for the GDK [S/U]([Scirra blog](https://www.construct.net/en/blogs/ashleys-blog-2/construct-xbox-support-update-1875)).

**PlayStation**
- Sony's WebMAF is a web framework for media apps. No public evidence that third-party games ship on it [NDA/U]. Don't plan on it [O].

### 3.2 How JS games actually get ported

| Approach | Who | How | Public cost |
|---|---|---|---|
| **Interpreted JS + native renderer** | **General Arcade** ("Console Runtimes" for RPG Maker MV/MZ, Ren'Py, Pygame) | Game JS runs unmodified on **QuickJS**. PixiJS draw calls go to their own renderer on NVN/D3D12/AGC/Vulkan/Metal. SoLoud for audio, SDL2 for input. Targets: Switch, **Switch 2**, PS5, Xbox Series, iOS, Android [S]([runtimes](https://generalarcade.com/runtimes/)) | "Fixed pricing and timeline" per proposal [NDA] |
| **AOT compile JS → C++** | Deck13 for **CrossCode** | Custom compiler; "a good amount of R&D", delayed the ports [S]([Siliconera](https://www.siliconera.com/crosscode-interview-radical-fish-games-on-console-ports-and-whats-next/)) | Not public |
| **Event/project → C++** | **Chowdren** (MP2 Games) for Construct and Clickteam Fusion; also ported OMORI | Compiles the project to C++ with a native runtime. Targets: Switch, PS4/5, Xbox One/Series [S]([mp2.dk/chowdren](https://mp2.dk/chowdren)) | "We work with small teams", contact only [NDA] |
| **Rewrite in a console engine** | Vampire Survivors (Unity), A Dark Room (Ruby/DragonRuby) | — [S]([VS](https://en.wikipedia.org/wiki/Vampire_Survivors); [A Dark Room](https://en.wikipedia.org/wiki/A_Dark_Room)) | — |

- **GDevelop:** no official console path [S]([forum 2025](https://forum.gdevelop.io/t/any-plans-of-console-support-switch-playstation-xbox-in-the-future/68637)).
- **Ratalaika:** announced an RPG Maker MV→Switch tool in 2020 [S]([GoNintendo](https://gonintendo.com/stories/360680-ratalaika-working-on-a-tool-to-bring-titles-created-in-rpg-maker)).
- **Costs and timelines:** no porting house publishes prices [NDA].
  - The Godot docs warn that platform acceptance alone "can take several months" [S]([Godot console docs](https://docs.godotengine.org/en/4.5/tutorials/platform/consoles.html)).
  - [O] Plan in months, and expect either a fixed fee or a revenue share.

**[O] Why this matters to us**
- The General Arcade model is exactly "keep the JS game, replace the host": QuickJS for logic, a native renderer behind the draw API, native audio and input.
- Our runtime is small and ours, so the "host API" a porter must reimplement is something *we define and keep small*:
  - sprite batches;
  - a handful of shaders;
  - audio cues;
  - input events;
  - file save/load.
- **That surface is the single most important thing to keep narrow.**

### 3.3 Registration, devkits, ratings

**Nintendo**
- The Developer Portal: "You can register even if you are an individual" [S]([developer.nintendo.com](https://developer.nintendo.com/)).
- Switch 2 access needs a separate request [S]([register](https://developer.nintendo.com/register)).
- Devkit prices [NDA].
- **Around Aug 2025, small studios reportedly were not getting Switch 2 devkits.** They were told to target Switch 1, which runs on Switch 2 via backward compatibility [S/U]([Wikipedia Switch 2](https://en.wikipedia.org/wiki/Nintendo_Switch_2)).

**Xbox**
- ID@Xbox requires age 18+, an NDA and a supported country [S]([ID@Xbox](https://developer.microsoft.com/en-US/games/publish)).
- **Two devkits at no cost** [S]([Wikipedia ID@Xbox](https://en.wikipedia.org/wiki/ID@Xbox)).
- New games must use the GDK.

**PlayStation**
- Only the [Partners portal](https://partners.playstation.net/) is public. Devkit terms and prices are [NDA].
- The Godot docs say console contracts generally need a registered legal entity [S]. That contradicts Nintendo's individual option, so check per platform.

**Ratings**
- IARC is free and covers Nintendo, Microsoft and Sony *digital* storefronts [S]([IARC](https://www.globalratings.com/about.aspx)).
- Physical releases need ESRB/PEGI directly [S]([Wikipedia IARC](https://en.wikipedia.org/wiki/International_Age_Rating_Coalition)).
- Certification checklists (Lotcheck etc.) are [NDA].

### 3.4 Godot on consoles

**What the Godot docs say** [S]([Godot console docs](https://docs.godotengine.org/en/4.5/tutorials/platform/consoles.html))
- Godot officially supports only Steam Deck; other consoles carry "risks of legal liability … open source licensing issues".
- Third parties fill the gap:

| Provider | Platforms |
|---|---|
| Lone Wolf Technology | Switch, PS4 |
| Pineapple Works | Switch 1/2, Xbox, PS5; GDScript and C# |
| RAWRLAB | Switch |
| mazette! | Switch, Xbox |
| Olde Sküül | Switch, Xbox One, PS4/5 |
| Tuanisapps | Switch |
| Seaven Studio | Switch, Xbox, PS4/5 |
| Sickhead Games | Switch, PS4/5, Xbox |
| **W4 Games** (middleware) | Switch, Xbox Series, PS5 |

**W4 Consoles (public price list)** [S]([w4consoles](https://www.w4games.com/w4consoles))

| Tier | Who qualifies | Per platform / year | All platforms / year |
|---|---|---|---|
| Starter | Up to 30 staff, under $300k revenue | **$800** | **$2,000** |
| Pro | Over $300k revenue | $4,000 | $10,000 |
| Enterprise | Any size | Custom quote | Custom quote |

- Platforms: Switch 1, **Switch 2 (beta since Oct 2025)**, PS5, Xbox Series. No PS4 or Xbox One [S]([W4 Switch 2 beta](https://www.w4games.com/blog/w4-games-news-2/w4-consoles-beta-support-for-the-nintendo-switch-2-46)).
- Languages: GDScript fully supported; C# is beta and only on Switch and Xbox Series.
- Includes full source access.
- [O] You still need console-maker approval and devkits. W4 is middleware, not a publisher.

**Shipped Godot console games** [S]
- Cassette Beasts (Switch/Xbox 2023; port by Pineapple Works) ([Wikipedia](https://en.wikipedia.org/wiki/Cassette_Beasts)).
- Brotato (Switch 2023, PS/Xbox 2024, **Switch 2 Nov 2025**) ([Wikipedia](https://en.wikipedia.org/wiki/Brotato)).
- Buckshot Roulette (Xbox, Jul 2026) ([Wikipedia](https://en.wikipedia.org/wiki/Buckshot_Roulette)).
- Halls of Torment ([W4 interview](https://www.w4games.com/blog/w4-games-news-2/interview-with-chasing-carrots-developer-of-halls-of-torment-47)).
- Slay the Spire 2 moved to Godot, but is PC-only in EA (2026-03) ([Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire_II)).

**C# on consoles**
- Godot C# uses NativeAOT on iOS, and reflection/trimming issues remain [S]([Godot blog 2024](https://godotengine.org/article/platform-state-in-csharp-for-godot-4-2/)).
- [O] GDScript (or a native module) is the low-risk console language today.

**Embedding JS in a Godot player**
- QuickJS is MIT, has no JIT, supports ES2025 and had its latest release on 2026-06-04 [S]([bellard.org](https://bellard.org/quickjs/)). quickjs-ng is the maintained fork [S]([quickjs-ng](https://github.com/quickjs-ng/quickjs)).
- **GodotJS** [S]([GodotJS](https://github.com/godotjs/GodotJS)):
  - MIT; adds TS/JS to Godot 4.x.
  - Backends: V8, QuickJS, quickjs-ng, JavaScriptCore and the browser's JS engine.
  - Status: "essentially usable but still under testing". No console claims.
- [U] Whether GodotJS compiles cleanly into W4's console builds. Ask W4.
- [O] With source access it is plausible. A minimal custom module that only hosts *our sim* in QuickJS is a smaller, safer alternative than full GodotJS scripting.

### 3.5 Bottom line on consoles [O]

1. **Plan for 2D sims:** keep the JS game and have a porting house replace the host (QuickJS + native renderer), or build a Godot player that hosts the same sim.
   - Either way, the sim must be headless, deterministic and free of browser APIs.
   - The renderer and audio must sit behind a small host API that we own.
2. **Switch 1 is the realistic first Nintendo target**, since Switch 2 runs it via backward compatibility.
3. **Xbox via ID@Xbox** is the friendliest on paper, with free devkits. Its GDK requirement means a native host, which W4/Godot or a porter provides.
4. **First concrete step, when the time comes:** send General Arcade, Pineapple Works and MP2 a build plus a two-page tech brief and ask for fixed quotes. Separately, price a W4 Starter licence. This is cheap and turns NDA unknowns into numbers.

---

## 4. "A now, B later": designing for a second, verifiable player

### 4.1 What a Godot player needs to read our games

A Godot player is "just another host" if the game is strictly **data + simulation + presentation rules**. [O] It needs:

1. **The game package.** Versioned, schema-validated data with stable string IDs. There are two hashes:
   - `simDataHash` covers everything that affects the simulation.
   - `assetManifest` covers sprites, audio, fonts and localization, with per-file content hashes.
   - Model: EU4's checksum covers gameplay files, but "graphics, localisation, and interface files do not affect checksums" [S]([EU4 wiki](https://eu4.paradoxwikis.com/Checksum)).
   - Factorio also keys prototypes by `type` + ASCII `name`, with display text in locale files [S]([Factorio PrototypeBase](https://lua-api.factorio.com/latest/prototypes/PrototypeBase.html)).
2. **The simulation.** Either the *same code* (preferred) or a reimplementation that passes the conformance corpus (§4.3).
3. **Presentation rules as data**, not code:
   - sprite atlases and animation tables;
   - UI layouts in a declarative form;
   - tile/voxel palettes;
   - audio cue tables;
   - camera rules.
   - [O] Anything expressed as TypeScript UI code is something Player B must rewrite by hand.
4. **A host API contract**, written down: what the sim emits (events and view-model diffs) and what it accepts (commands).
   - The renderer reads sim state and events. It never mutates the sim.
5. **Save format**: versioned, canonical and portable. [O] Prefer saving *snapshot + command log tail*, so a save is also a replay.

### 4.2 Determinism pitfalls between JS and GDScript

**Transcendental math**
- ECMAScript defines `Math.sin` as "Return an *implementation-approximated* Number value representing the sine". It only *recommends* fdlibm, and the general intent is that an implementation can use the platform's C math library [S]([ECMA-262 §21.3.2](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.sin)).
- V8 has changed implementations several times:
  - It imported fdlibm in 2016 [S]([V8 CL](https://codereview.chromium.org/2073123002)).
  - It later added a libm-based trig option [U].
- A 2026 physics engine got **different state hashes after 900 steps** between Node 20 (V8 11.3) and Chrome 149 (V8 14.9). The cause was sin/cos/atan; the fix was its own fdlibm port in JS [S]([bounce #8](https://codeberg.org/perplexdotgg/bounce/issues/8)).
- IEEE 754 guarantees only + − × ÷ and sqrt as correctly rounded [S]([Dawson](https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/)).

**Godot side**
- `Math::sin` → `std::sin`, i.e. platform libm [S]([math_funcs.h](https://raw.githubusercontent.com/godotengine/godot/master/core/math/math_funcs.h)).
- `Vector2/3` are 32-bit floats unless the engine is built with `precision=double` [S]([large worlds](https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html)).
- Clang defaults to `-ffp-contract=on`, which can fuse operations into FMA [S]([Clang manual](https://clang.llvm.org/docs/UsersManual.html)).

**Integers**

| | JavaScript | GDScript |
|---|---|---|
| Width | Bitwise ops are 32-bit; exact integers only up to 2^53 [S]([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER)) | `int` is 64-bit and wraps [S]([Godot int](https://docs.godotengine.org/en/stable/classes/class_int.html)) |
| `%` | Truncated; `-4 % 2 === -0` [S]([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder)) | Truncated |
| Rounding | `Math.round(-2.5) === -2` [S]([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round)) | `round(-2.5) === -3` (std::round) [S]([cppreference](https://en.cppreference.com/w/cpp/numeric/math/round)) |

**RNG**
- Godot's RandomNumberGenerator is PCG32, but "an implementation detail and should not be depended upon" [S]([Godot RNG](https://docs.godotengine.org/en/stable/classes/class_randomnumbergenerator.html)).
- Its `randf/randfn` paths depend on intrinsics and libm [S]([random_pcg.h](https://raw.githubusercontent.com/godotengine/godot/master/core/math/random_pcg.h)).
- [O] Ship our own **sfc32** or **xoshiro128\*\***. sfc32 needs no multiply, so it is the easiest to port exactly [S]([bryc PRNGs](https://github.com/bryc/code/blob/master/jshash/PRNGs.md); [xoshiro](https://prng.di.unimi.it/)).
- Use one stream per subsystem, seeded as `hash(masterSeed, "subsystem-id")`. Then adding content never shifts other streams.

**Iteration order**
- JS objects iterate integer-like keys first, in ascending order [S]([MDN for…in](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in)).
- Godot dictionaries keep insertion order [S]([Godot Dictionary](https://docs.godotengine.org/en/stable/classes/class_dictionary.html)).
- So `{"10":…,"2":…}` iterates differently in the two players.
- **Godot `Array.sort` is not stable** [S]([Godot Array](https://docs.godotengine.org/en/stable/classes/class_array.html)). JS sort has been stable since ES2019 [S]([v8.dev](https://v8.dev/features/stable-sort)).

**JSON**
- Godot parses *all* numbers as floats, and `stringify` loses float precision unless `full_precision=true` [S]([Godot JSON](https://docs.godotengine.org/en/stable/classes/class_json.html)).
- RFC 8259 leaves duplicate keys "unpredictable" [S]([RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)).

**Strings**
- JS `<` compares UTF-16 code units; Godot compares code points [S]([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Less_than); [Godot String](https://docs.godotengine.org/en/stable/classes/class_string.html)).
- [O] Use ASCII-only IDs and never `localeCompare` in the sim.

### 4.3 Making Player B verifiable: replays, digests, conformance

**Precedents**
- **Age of Empires** ran the same sim on all machines from identical command streams, with checksums to detect out-of-sync states [S]([1500 archers](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond)).
- **Factorio**:
  - reimplements `math.random` and makes `next()` follow insertion order for determinism [S]([Factorio libraries](https://lua-api.factorio.com/latest/auxiliary/libraries.html));
  - has a "heavy mode" that saves and loads every tick to find state that doesn't survive serialization [S]([Factorio desync](https://wiki.factorio.com/Desynchronization)).
- **pkmn/engine** is the closest precedent to "second player verified against the first": a Zig reimplementation of the TypeScript Pokémon Showdown simulator [S]([pkmn TESTING.md](https://github.com/pkmn/engine/blob/main/docs/TESTING.md)).
  - Integration tests run both implementations on the same random battles and compare output.
  - A fixed RNG gives exact control over rolls.
  - The original TS sim had to be **patched to remove nondeterministic ordering** before parity was possible. Plus scheduled fuzzing.
- **Conformance suites as models:** test262 [S]([test262](https://github.com/tc39/test262)) and the WebAssembly spec testsuite [S]([wasm testsuite](https://github.com/WebAssembly/testsuite)).

**Proposed mechanism [O]**

1. **Tick-based sim.** Integer days, hours or ticks; no `dt`; no wall-clock time. Rendering interpolates [S]([Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/)).
2. **Commands are the only input**: `{tick, playerId, type, payload}`, serialized canonically. UI never mutates state.
3. **State digest**:
   - xxHash32 or FNV-1a over a *canonical binary encoding*: fixed field order, little-endian ints, entities sorted by ID.
   - Compute it every N ticks and at the end.
   - Never hash text-formatted floats.
   - xxHash is identical across platforms and endianness [S]([xxHash](https://github.com/Cyan4973/xxHash)).
   - For JSON artifacts, use RFC 8785 canonicalization [S]([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)).
4. **Conformance corpus.** Language-neutral files: `{gameId, simDataHash, seed, commandLog, digests[], finalDigest}`, plus small unit vectors:
   - PRNG outputs for given seeds;
   - integer helper edge cases;
   - sort and tie-break cases.
   - Sources: recorded playtests, scripted scenarios and fuzzed command sequences.
5. **CI runs the corpus on every engine we might ever host the sim on:**
   - V8 (Node/Electron), JavaScriptCore (Safari/WKWebView), SpiderMonkey and **QuickJS**.
   - Later, Godot headless.
   - [O] This catches engine-dependent behaviour years before a console port.
6. **Divergence tooling.**
   - Binary-search to the first divergent tick.
   - Compare per-subsystem digests.
   - Dump both states, in the Factorio heavy-mode and AoE log style.
7. **Golden digests are versioned.** A deliberate rule change regenerates the goldens in the same commit, with a reason recorded.

### 4.4 Same code vs two implementations

| Option | Determinism | Console fit | Cost |
|---|---|---|---|
| **A. Hand-port the sim to GDScript** | Fragile; every pitfall in §4.2 applies | Native | Double maintenance forever |
| **B. Same compiled JS sim on QuickJS inside Godot** (GodotJS or a tiny module) | ES semantics come along: key order, stable sort, `%`, `Math.round`. Only libm-type functions differ, and the sim doesn't use them | QuickJS has no JIT and is plain C; General Arcade ships QuickJS on consoles [S] | Low. Needs a speed check on Switch-class ARM [O] |
| **C. Portable core** (Rust/C/Zig/AssemblyScript) → WASM for the web, native or wasm2c for Godot | WASM's only nondeterminism is NaN bit patterns, relaxed SIMD and threads [S]([WASM nondeterminism](https://github.com/WebAssembly/design/blob/main/Nondeterminism.md)) | wasm2c gives static C99, no JIT [S]([wasm2c](https://github.com/WebAssembly/wabt/blob/main/wasm2c/README.md)). godot-wasm is pre-1.0 [S]([godot-wasm](https://github.com/ashtonmeuser/godot-wasm)) | Medium. Second language in the stack, but ideal for hot code |
| **D. Haxe** (JS + C++/HashLink) | Same source, two backends | HashLink shipped Northgard on Switch/PS4/Xbox [S]([HashLink](https://hashlink.haxe.org/)) | A rewrite; not TS |

[O] **Use B for the 2D sims.** Reserve C for hot, float-heavy procedural code (§6). Keep A only as an emergency fallback gated by the corpus.

---

## 5. Building from the studio: what a Mac "Build" button can produce

### 5.1 Target matrix

| Target | Local on the Mac? | Tooling | Signing | Notes |
|---|---|---|---|---|
| **Web** (itch.io, own site, studio preview) | Yes | Bundler (esbuild/Vite) | — | Also the base for every wrapper |
| **macOS** (Electron) | Yes | electron-builder/Forge; universal or per-arch | Developer ID + **notarization** (`notarytool` with ASC API key) — must run on macOS [S] | Mandatory for Steam [S] |
| **Windows** (Electron) | **Yes for an unpacked folder or zip** (what Steam needs) [S/O]. NSIS installer probably yes [U]; MSI/Squirrel no | electron-builder/Forge + Electron's prebuilt win32 binaries | Optional for Steam [U]. If needed: `jsign` + cloud HSM from the Mac [S] | Test on real Windows, a VM or CI |
| **Linux** (Electron) | Yes for an unpacked folder, tar.gz or AppImage [S]([electron-builder](https://www.electron.build/docs/features/multi-platform-build)) | Same | — | Test on Steam Deck/Proton and a Linux VM |
| **Steam upload** | Yes | `steamcmd` from the SDK's `builder_osx` [S]([uploading](https://partner.steamgames.com/doc/sdk/uploading)) | Steam Guard token kept in `config.vdf` across runs [S] | `SetLive` works only for beta branches, not default [S] |
| **iOS** (Capacitor) | Yes (only on a Mac) | Xcode 26 + iOS 26 SDK, required for uploads since 2026-04-28 [S]([Apple](https://developer.apple.com/news/upcoming-requirements/)); `npx cap build ios` can export for App Store Connect [S]([cap build](https://capacitorjs.com/docs/cli/commands/build)) | One Apple Distribution cert per team + provisioning profiles ($99/yr program [S]([Apple](https://developer.apple.com/programs/)); [certificates](https://developer.apple.com/help/account/certificates/certificates-overview/)) | Upload via Xcode/Transporter or the App Store Connect API |
| **Android** (Capacitor) | Yes | Android SDK + Gradle (JDK); `npx cap build android` makes a signed AAB [S]([cap build](https://capacitorjs.com/docs/cli/commands/build)) | Upload key in a keystore; Play App Signing holds the release key [S]([Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)) | Play registration is a one-time **$25**. New *personal* accounts must pass a testing requirement before production [S]([Play Console](https://support.google.com/googleplay/android-developer/answer/6112435)) |
| **Godot (future Player B)** | Yes for Win/mac/Linux/web/Android/iOS | Godot export templates. Windows icon handled natively; Windows signing via `osslsigncode` on mac [S]([Godot Windows export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html)) | Same keys as above | Console exports need W4 or a porter plus devkits [NDA] |
| **Consoles** | Not from the studio. Devkit toolchains and environments are [NDA] | — | — | — |

### 5.2 What should run on CI (GitHub Actions)

**Prices** [S]([GitHub runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing); [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions))
- **Free on public repositories.**
- Private repositories: the Free plan includes 2,000 minutes/month.
- 2026 per-minute prices: Linux $0.006, Windows $0.010, macOS $0.062, Linux arm64 $0.005.
- Hosted prices fell up to 39% on 2026-01-01. A self-hosted $0.002/min platform fee was announced, then **postponed** [S]([gigazine](https://gigazine.net/gsc_news/en/20251219-github-actions-pricing-change)).

**Use CI for** [O]
1. Clean, reproducible release builds for Windows and Linux. Windows-only installer formats if ever needed.
2. The **cross-engine conformance corpus**: V8, JSC (WebKit via Playwright), SpiderMonkey, QuickJS, and later Godot headless.
3. Smoke-launching the packaged Windows and Linux builds and running a scripted replay under xvfb or on a Windows runner.
4. Optionally, release signing, if the keys live in a cloud HSM rather than on the Mac.

**Studio integration [O]**
- The Build button runs local targets directly.
- For CI-only steps it dispatches a workflow (`gh workflow run` or the REST API), polls its status, and downloads the artifacts into the studio's build view.

### 5.3 Signing keys and secrets [O]

**Apple**
- Developer ID and Distribution certificates live in the macOS **Keychain**.
- Notarization uses an **App Store Connect Team API key (`.p8`)** with the narrowest role that works [S]([Apple forums](https://developer.apple.com/forums/thread/133063)).
- The studio reads secrets from the Keychain at build time and never writes them into project files or logs.

**Android**
- Enrol in **Play App Signing**, so the key you hold is only an *upload* key and can be reset.
- Back up the keystore offline.

**Windows**
- None needed for Steam.
- If it is ever needed, use a cloud HSM (Artifact Signing needs an EU *company*; otherwise a CA's cloud signing). Never a key file.

**Steam**
- Use a dedicated **builder account** with only build-upload permissions.
- Keep its Steam Guard `config.vdf` on the build machine or in CI secrets.
- Never put the owner's main account in CI.

**General rules**
- No secret in the repo, the game data or the studio database.
- `.env`-style files are git-ignored. CI uses encrypted repository or environment secrets with required reviewers for release jobs.

---

## 6. 3D voxel games: what changes

### 6.1 Per target

**Desktop (Electron)**
- Same Chromium everywhere, so WebGL2 everywhere.
- WebGPU is on by default on Windows and macOS, but **not on AMD Linux (Steam Deck)** without flags [S]([gpuweb wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status); [Chrome WebGPU troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)).
- Electron can serve the app over a privileged custom protocol with COOP/COEP headers. That enables `SharedArrayBuffer` and WASM threads [S]([Electron protocol](https://www.electronjs.org/docs/latest/api/protocol); [SAB](https://developer.chrome.com/blog/enabling-shared-array-buffer)).
- Since Electron 38, Linux defaults to native Wayland [S]([Electron breaking changes](https://www.electronjs.org/docs/latest/breaking-changes)).

**Desktop (Tauri)**
- No WebGPU on Linux.
- Slow-path WebGL that the game cannot detect [S].
- WKWebView capped at 60 Hz [S].
- [O] Worse for 3D than for 2D.

**Steam Deck**
- AMD APU, so Chromium WebGPU is off by default. **Design the WebGL2 path as the Deck path** [S/O].
- Chromium may drop to software rendering if the GPU is blocklisted (`--ignore-gpu-blocklist`) [U]([sumguy](https://sumguy.com/browser-gpu-acceleration-linux-2026)).
- No field reports of three.js/Electron 3D games on the Deck were found [U].
- [O] Budget for 1280×800 at 30–60 fps, and benchmark both the native Linux build and the Windows build under Proton early.

**iOS (Capacitor)**
- WKWebView on iOS 26 has WebGPU [S].
- No Memory64 in Safari, so WASM memory is 32-bit (4 GB max) [S]([WASM features](https://raw.githubusercontent.com/WebAssembly/website/main/features.json)).
- COOP/COEP on `capacitor://` is unclear [U]([Capacitor #6182](https://github.com/ionic-team/capacitor/issues/6182)).
- WebContent/GPU process crashes were reported on iPhone 15 / iOS 26.4 in Apr 2026 [S]([Apple forums 822200](https://developer.apple.com/forums/thread/822200)).

**Android (Capacitor)**
- **`SharedArrayBuffer` is not supported in Android WebView** [S]([MDN BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/javascript/builtins/SharedArrayBuffer.json)).
- WebGPU in WebView was announced via the M146 compatibility-mode intent to ship [S]([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/N3RlLGCOTJ4/m/loneRTlPBwAJ)). Verify on devices [U].

**Thermal**
- The web Compute Pressure API is desktop-Chrome only [S]([MDN BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/PressureObserver.json)).
- Use native bridges instead:
  - Android `getThermalHeadroom`: Google advises reducing fidelity before about 0.85–0.95 headroom [S]([Android ADPF](https://developer.android.com/games/optimize/adpf/thermal)).
  - iOS `ProcessInfo.thermalState` [S]([Apple](https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.enum)).

**[O] Consequences for the voxel engine**
- WebGL2 is the floor and WebGPU is an enhancement.
- **No GPU-compute dependency** for generation or meshing, since WebGL2 has no compute shaders.
- Worker pool + **transferable** `ArrayBuffer`s as the baseline; `SharedArrayBuffer` only as an optional fast path.
- Explicit memory budgets per platform tier.
- Chunk streaming radius driven by a thermal/frametime governor.
- Floating origin, or camera-relative rendering, from day one.

**Three.js** [S]([three.js manual](https://threejs.org/manual/pages/webgpurenderer))
- WebGPURenderer is "still in an experimental state". It falls back to WebGL2 automatically.
- It does not support `ShaderMaterial` or `EffectComposer`; shaders must be TSL.
- [O] Whichever renderer wins (Three.js or our own), keep it behind our own scene and host interface, so the planet's *description* stays data.

### 6.2 Browser voxel prior art
- **noa-engine** (Babylon.js) is used by bloxd.io and Mojang's Minecraft Classic remake [S]([noa](https://github.com/fenomas/noa)).
- **Divine Voxel Engine**: TypeScript, Worker-based meshing and generation, renderer-independent [S]([DVE](https://github.com/Divine-Star-Software/DivineVoxelEngine)).
- **No mature browser planet-scale or spherical voxel project was found** [S/U]([GitHub topic](https://github.com/topics/voxel-planet)).
- [O] Cube-sphere chunking, LOD (clipmap/octree), seams and floating origin are original work in any stack.

### 6.3 Consoles: web-tech 3D vs Godot 3D voxel [O unless marked]

**Web-tech 3D on consoles**
- This is much harder than 2D:
  - The porter must reimplement a far larger WebGL2/WebGPU surface. With Three.js, that is effectively a GL emulation layer.
  - Hot JS (noise, meshing) would run **without JIT**. CrossCode found interpretation too slow even for a 2D action game [S].
- Realistic only if hot code is already in a portable compiled core and the renderer is our own narrow API.

**Godot + godot_voxel (Zylann)** [S]([godot_voxel](https://github.com/Zylann/godot_voxel); [docs](https://voxel-tools.readthedocs.io/en/latest/getting_the_module/); [generators](https://voxel-tools.readthedocs.io/en/latest/generators/); [changelog](https://voxel-tools.readthedocs.io/en/latest/changelog/))
- MIT; v1.7 released Aug 2026.
- Features: blocky and Transvoxel meshing, LOD, and an SDF `VoxelGeneratorGraph` with an `SdfSphere` node (planets).
- The **C++ module** edition needs a custom engine build. The GDExtension edition is "less tested".
- The author calls it "hobbyist experiments".
- **No known console title uses it** [U].
- Feasibility: W4 gives engine source, so compiling the module in is plausible. Its Vulkan-compute paths may need work on non-Vulkan consoles.
- Earth-scale coordinates need a `precision=double` build, and shaders stay 32-bit [S]([Godot large worlds](https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html)).

**[O] Verdict**
- For a voxel planet, the console path is realistically a **Godot (or native) client**.
- So the shared, portable part must be the **generator and sim core**, not the renderer.

**Context:** *Light No Fire* (Hello Games) [S]([Wikipedia](https://en.wikipedia.org/wiki/Light_No_Fire))
- Announced 2023-12-08; an Earth-sized world; proprietary tech.
- Windows/Steam only confirmed; no release date as of 2026.

### 6.4 Does "games are pure data + swappable player" still hold?

**Partly. [O]**
- For a seed-driven world, the generator code *is* the content. The idea survives only if we split "content" into two layers:

| Layer | What it is | Portability |
|---|---|---|
| **Game data** (portable, hashable, AI-generatable) | `worldSeed`; **archetype parameters** (planet radius, sea level, biome table, palettes, creature and mount archetypes with stat ranges, flight envelopes); a **declarative generator spec**: a typed graph of noise, density and SDF nodes, biome rules and placement rules, versioned and schema-validated | Like the 2D game data |
| **Generator runtime** (code) | The *interpreter* of that spec, plus meshing | Part of the **player ABI**, versioned as `generatorVersion` |

**Precedents** [S]
- Minecraft Java defines terrain as data-driven JSON *density functions* and *noise settings* [S]([minecraft.wiki](https://minecraft.wiki/w/Tutorial:Custom_world_generation)).
- godot_voxel's `VoxelGeneratorGraph` is a node graph [S].
- A spec of this shape can be interpreted by our TS/WASM generator or compiled to a Godot graph or module.

**Cautionary tale** [S]([Minecraft wiki seed](https://minecraft.fandom.com/wiki/Seed_(level_generation)))
- Mojang's Java and Bedrock codebases reached seed parity for **terrain and biomes only** (1.18).
- Trees, decorations and structures still differ.
- Two independent generator implementations are expensive to keep identical.

**Rules that make it work [O]**
1. **One generator implementation, run everywhere.**
   - A portable compiled core (WASM for web/Electron/Capacitor; wasm2c or native for Godot and consoles) interprets the generator spec.
   - WASM float semantics are deterministic apart from NaN bits [S], and the core carries its own math library, so terrain is **bit-identical** across players.
   - This is option C from §4.4, applied to the hot path.
2. **Golden chunk hashes.** The conformance corpus includes `(generatorVersion, seed, chunkCoord) → hash(voxels)` and a few mesh hashes. A player is valid only if it reproduces them.
3. **Saves store deltas against generated terrain**, keyed by chunk and tagged with `generatorVersion`. Changing the generator means migrating or freezing old worlds, the way games pin a world-gen version.
4. **"Graphics as code" stays parametric.**
   - Shading and material rules become data: palettes, material IDs, light and fog curves, LOD thresholds.
   - Avoid raw GLSL/WGSL/TSL as content, because Godot uses its own shader language.
   - [O] If shaders must be authored, generate them from one small node-graph spec per target, and accept visual (not bit-exact) parity there.
5. **Gameplay sim** (mounts, inventory, creatures) follows the same §4 rules: fixed ticks, integer or fixed-point where it matters, command logs.
   - [O] Flight physics can use floats *only* in the presentation layer, or inside the WASM core.

---

## Recommendations for Wallhammer Zero

*Proposal only. Every item is [O] and rests on the sourced facts above.*

### Concrete choices

| Area | Recommendation |
|---|---|
| Desktop wrapper | **Electron**, pinned to a supported major and upgraded at least every ~6 months. No Tauri until its CEF runtime is stable *and* the overlay story is solved. Not NW.js |
| Steam | **steamworks.js** for achievements, cloud and Deck keyboard (or **steamworks-ffi-node** if leaderboards are needed). **Auto-Cloud** for saves. **Overlay as best-effort** with a fallback UI. Ship **native Linux + Windows + notarized macOS** depots |
| Mobile wrapper | **Capacitor 8** (move to 9 when it ships), not Tauri 2 mobile. Saves via Preferences/Filesystem. Audio behind an adapter (Web Audio or native-audio). Safe areas via SystemBars variables with an `env()` fallback. Native orientation lock. `android:appCategory="game"`. Small custom Game Center / Play Games plugin. RevenueCat if there are IAPs |
| Rendering floor | **WebGL2 everywhere.** WebGPU only as an optional enhancement, never required |
| 2D sim on consoles (later) | (1) Ask porters for quotes, or (2) **Godot player + W4 Starter**, hosting the **same JS sim on QuickJS** |
| Voxel game | **Generator and meshing in a portable compiled core (WASM)** interpreting a **declarative generator spec**. The renderer behind our own interface. Godot + godot_voxel or our own Godot module as the console route, judged against golden chunk hashes |
| Build | Studio "Build" runs locally: web, macOS (sign + notarize), Windows/Linux unpacked folders, iOS, Android, `steamcmd` upload. **GitHub Actions** for clean Windows/Linux builds, smoke tests and the cross-engine conformance corpus |
| Signing | Apple Developer Program (needed for macOS/Steam and iOS). Play App Signing. **No Windows signing for Steam-only.** Dedicated Steam builder account |

### Architectural rules from day one

1. **Sim/host split.**
   - The simulation is a pure module: no DOM, WebGL, `Date`, `Math.random`, `setTimeout`, `fetch` or `localStorage`.
   - It runs headless in Node and QuickJS.
   - Renderer, audio, input, storage and platform services (Steam, Game Center…) are **host adapters** behind one small, documented host API.
2. **Commands in, events/state out.** UI and input only produce commands; renderers only read state and events. Every session can be recorded as `seed + simDataHash + command log`.
3. **Fixed integer ticks.** No `dt` in the sim. Rendering interpolates.
4. **Integer or fixed-point sim math only.**
   - No `Math.sin/cos/pow/exp/log`, `Math.round` or float-to-int conversion without our helpers.
   - Use lookup tables (in game data) for curves.
   - Values stay within ±2^31 (hard cap 2^53).
   - Define a tiny "sim integer ABI" (`idiv`, `imod`, `mulDiv` with an explicit rounding mode, basis-point percentages).
5. **Own PRNG** (sfc32 or xoshiro128\*\*), with **one named stream per subsystem**, derived by hashing the master seed with the subsystem ID.
6. **Explicit ordering everywhere.**
   - Ordered collections are arrays.
   - Maps are iterated by sorted key.
   - Every comparator is a total order, with a stable-ID tie-break.
   - IDs are ASCII strings. No `localeCompare` or Intl in the sim.
7. **Data discipline.**
   - JSON Schema with `schemaVersion`; integer fields declared as integers with bounds; duplicate keys and non-integral "integers" rejected at build time.
   - Game data is shipped as **compiled, canonical** packages with `simDataHash` and an `assetManifest`.
   - Localization lives in ID-keyed tables.
8. **Canonical state digest + conformance corpus from the first playable build.** CI runs the corpus on V8, JSC, SpiderMonkey and QuickJS. Golden digests change only in deliberate, reviewed commits.
9. **Presentation as data where possible**: sprite and animation tables, UI layout descriptions, palettes, audio cue tables. The less TypeScript-only UI code, the cheaper Player B gets.
10. **Saves = versioned snapshot + command tail**, written through a host storage adapter (Steam Auto-Cloud path on desktop, native storage on mobile).
11. **Platform services are optional capabilities.** The game must run with no Steam, no overlay, no WebGPU, no `SharedArrayBuffer` and no gamepad.
12. **Voxel-specific rules:**
    - Generator spec as data.
    - Generator and meshing in one portable compiled core; golden chunk hashes.
    - Deltas-on-generated-terrain saves tagged with `generatorVersion`.
    - Workers with transferables as the baseline.
    - Floating origin.
    - Memory and thermal budgets per platform tier.
13. **Keep the host API small and written down.** It is what a porting house or a Godot player has to reimplement. Its size is our porting cost.

---

## Open questions for the owner

1. **Company or individual?** This affects Azure Artifact Signing (EU individuals are excluded), some console contracts ("registered legal entity" per Godot docs), and possibly the Play Console account type.
2. **Which stores matter first?** Steam only, or also itch.io or direct download (then Windows signing matters), and the App Store / Google Play from the first game?
3. **Consoles: owned or outsourced?** Do you want to hold console devkits and ship yourself (Godot + W4), or eventually hand a build to a porting house or publisher?
4. **Leaderboards, multiplayer or UGC/Workshop?** This decides between steamworks.js and steamworks-ffi-node, and whether lockstep multiplayer (which needs the same determinism) is on the table.
5. **Voxel game platform scope.** Is mobile a target for the planet game at all? Phone thermal and memory limits may make it desktop/Deck-first.
6. **Hot-code language.** A portable compiled core needs a second language:
   - **Rust** is not installed.
   - **AssemblyScript** is TS-like.
   - **C/Zig** also work, but Apple's clang may lack the wasm32 target [U].
   - **Go/TinyGo** is possible but GC-heavy.
   - Which is acceptable?
7. **Three.js vs own runtime** (covered by another agent). Either way, is it acceptable to wrap the renderer behind our own scene and host interface, so the game never depends on Three.js types?
8. **Repository visibility.** Public repos get free GitHub Actions minutes; private ones pay macOS at $0.062/min. Would the engine, studio or conformance corpus ever be public?

---

## Sources

*(All URLs consulted. Dates are in the text where known.)*

**Desktop / Steam**
- https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- https://releases.electronjs.org/
- https://www.electronjs.org/blog/electron-40-0
- https://www.electronjs.org/docs/latest/breaking-changes
- https://www.electronjs.org/docs/latest/api/protocol
- https://www.electronjs.org/docs/latest/tutorial/code-signing
- https://github.com/nwjs/nw.js
- https://github.com/nwjs/nw.js/wiki/List-of-apps-and-companies-using-nw.js
- https://github.com/tauri-apps/tauri/releases
- https://releasealert.dev/github/tauri-apps/tauri
- https://github.com/orgs/tauri-apps/discussions/8524
- https://v2.tauri.app/develop/debug/linux-graphics/
- https://v2.tauri.app/distribute/windows-installer/
- https://v2.tauri.app/distribute/debian/
- https://v2.tauri.app/security/http-headers/
- https://github.com/tauri-apps/tauri/issues/6381
- https://github.com/versotile-org/verso
- https://github.com/SableClient/tauri-runtime-cef
- https://getatrium.dev/blog/embedding-real-browser-tauri
- https://www.pkgpulse.com/guides/electron-vs-tauri-2026
- https://tech-insider.org/tauri-vs-electron-2026/
- https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips
- https://web.dev/blog/webgpu-supported-major-browsers
- https://developer.apple.com/forums/thread/770862
- https://lists.webkit.org/pipermail/webkit-gtk/2023-October/003947.html
- https://webkitgtk.org/2025/11/26/webkitgtk-2.50.html
- https://bugs.webkit.org/show_bug.cgi?id=278695
- https://bugs.webkit.org/show_bug.cgi?id=294338
- https://bugs.webkit.org/show_bug.cgi?id=269292
- https://developer.apple.com/forums/thread/796512
- https://developer.apple.com/forums/thread/773222
- https://github.com/DeveloperMindset-com/tauri-plugin-gamepad
- https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency
- https://github.com/ceifa/steamworks.js
- https://github.com/ceifa/steamworks.js/commits/main
- https://github.com/ceifa/steamworks.js/issues?q=is%3Aissue+overlay
- https://github.com/ceifa/steamworks.js/issues/195
- https://raw.githubusercontent.com/ceifa/steamworks.js/main/client.d.ts
- https://github.com/greenheartgames/greenworks
- https://raw.githubusercontent.com/greenheartgames/greenworks/master/docs/troubleshooting.md
- https://raw.githubusercontent.com/ArtyProf/steamworks-ffi-node/main/README.md
- https://raw.githubusercontent.com/ArtyProf/steamworks-ffi-node/main/docs/STEAM_OVERLAY_INTEGRATION.md
- https://github.com/ArtyProf/steamworks-ffi-node/releases
- https://crates.io/api/v1/crates/steamworks
- https://github.com/PSG-Team/tauri-steam-overlay-surface
- https://github.com/qwook/tauri-plugin-steam-overlay
- https://github.com/MicrosoftEdge/WebView2Feedback/discussions/4019
- https://construct.net/en/make-games/addons/1105/steamworks
- https://jake.software/enabling-the-steam-overlay-in-an-electron-app
- https://www.drawize.com/blog/tech-how-to-release-html5-game-on-steam
- https://partner.steamgames.com/doc/features/cloud
- https://partner.steamgames.com/doc/features/steam_controller
- https://partner.steamgames.com/doc/steamdeck/compat
- https://partner.steamgames.com/doc/steamdeck/recommendations
- https://partner.steamgames.com/doc/steamdeck/proton
- https://partner.steamgames.com/doc/sdk/uploading
- https://partner.steamgames.com/doc/store/application/platforms
- https://www.electron.build/docs/features/multi-platform-build
- https://www.electron.build/v26/docs/features/multi-platform-build
- https://www.electron.build/docs/tutorials/code-signing-windows-apps-on-unix
- https://www.electronforge.io/core-concepts/build-lifecycle
- https://www.electronforge.io/config/makers/zip.md
- https://www.electronforge.io/config/makers/squirrel.windows.md
- https://electron.github.io/packager/main/
- https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- https://developer.apple.com/forums/thread/786582
- https://developer.apple.com/forums/thread/133063
- https://developer.apple.com/programs/
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- https://learn.microsoft.com/en-us/azure/artifact-signing/faq
- https://devclass.com/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/
- https://ebourg.github.io/jsign/
- https://www.construct.net/make-games/releases/beta/r450
- https://www.construct.net/en/forum/construct-3/general-discussion-7/refocus-export-direction-183136
- https://en.wikipedia.org/wiki/Game_Dev_Tycoon
- https://en.wikipedia.org/wiki/CrossCode
- https://en.wikipedia.org/wiki/Vampire_Survivors
- https://en.wikipedia.org/wiki/Cookie_Clicker
- https://en.wikipedia.org/wiki/RPG_Maker_MV
- https://github.com/bitburner-official/bitburner-src/tree/dev/electron
- https://raw.githubusercontent.com/bitburner-official/bitburner-src/dev/electron/package.json

**Mobile**
- https://ionic.io/blog/announcing-capacitor-8
- https://ionic.io/blog/?p=6904
- https://capacitorjs.com/docs/updating/8-0
- https://capacitorjs.com/docs/ios
- https://capacitorjs.com/docs/android
- https://capacitorjs.com/docs/config
- https://capacitorjs.com/docs/apis
- https://capacitorjs.com/docs/apis/app
- https://capacitorjs.com/docs/apis/system-bars
- https://capacitorjs.com/docs/apis/status-bar
- https://capacitorjs.com/docs/apis/screen-orientation
- https://capacitorjs.com/docs/apis/preferences
- https://capacitorjs.com/docs/apis/haptics
- https://capacitorjs.com/docs/guides/storage
- https://capacitorjs.com/docs/cli/commands/build
- https://capawesome.io/docs/blog/announcing-the-capacitor-tauri-platform/
- https://capawesome.io/blog/capacitor-edge-to-edge-and-safe-areas-guide/
- https://capgo.app/plugins/
- https://github.com/capacitor-community/native-audio
- https://raw.githubusercontent.com/openforge/capacitor-game-connect/main/package.json
- https://registry.npmjs.org/-/v1/search?text=capacitor+game+center+leaderboard&size=15
- https://registry.npmjs.org/-/v1/search?text=capacitor+game+services+achievements&size=15
- https://raw.githubusercontent.com/ionic-team/capacitor/main/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift
- https://raw.githubusercontent.com/ionic-team/capacitor/main/ios/Capacitor/Capacitor/CAPBridgeViewController.swift
- https://raw.githubusercontent.com/ionic-team/capacitor/main/android/capacitor/src/main/java/com/getcapacitor/BridgeWebViewClient.java
- https://raw.githubusercontent.com/ionic-team/capacitor/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java
- https://en.wikipedia.org/wiki/Tauri_(software_framework)
- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/develop/plugins/develop-mobile/
- https://v2.tauri.app/plugin/
- https://v2.tauri.app/blog/
- https://github.com/tauri-apps/tauri/issues/14240
- https://github.com/orgs/tauri-apps/discussions/10197
- https://api.github.com/search/issues?q=repo:tauri-apps/tauri+is:issue+is:open+ios+in:title
- https://github.com/Choochmeque/tauri-plugin-iap
- https://crates.io/api/v1/crates/tauri-plugin-iap
- https://crates.io/api/v1/crates?q=gamecenter
- https://jangwook.net/zh/blog/zh/tauri-pixijs-ios-game-development/
- https://abratabia.com/native-wrappers/tauri-vs-capacitor.php
- https://www.khronos.org/blog/webgl-2-achieves-pervasive-support-from-all-major-web-browsers
- https://9to5mac.com/2014/06/03/ios-8-webkit-changes-finally-allow-all-apps-to-have-the-same-performance-as-safari/
- https://developer.apple.com/news/?id=12232019b
- https://support.apple.com/en-us/105120
- https://bugs.webkit.org/show_bug.cgi?id=300782
- https://github.com/google-ai-edge/mediapipe/issues/5122
- https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- https://developer.chrome.com/blog/new-in-webgpu-121
- https://developer.chrome.com/docs/multidevice/webview
- https://chromium.googlesource.com/chromium/src/+/HEAD/gpu/config/software_rendering_list.json
- https://developer.android.com/develop/ui/views/layout/webapps/managing-webview
- https://bugs.webkit.org/show_bug.cgi?id=262781
- https://bugs.webkit.org/show_bug.cgi?id=263627
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AudioSession.json
- https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
- https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/soloambient
- https://developer.android.com/reference/android/webkit/WebSettings
- https://webkit.org/blog/7929/designing-websites-for-iphone-x/
- https://developer.android.com/about/versions/15/behavior-changes-15
- https://developer.android.com/about/versions/16/behavior-changes-16
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock
- https://developer.apple.com/app-store/review/guidelines/
- https://forum.ionicframework.com/search.json?q=rejected%204.2%20minimum%20functionality
- https://support.google.com/googleplay/android-developer/answer/9899034
- https://support.google.com/googleplay/android-developer/answer/9898783
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://developer.apple.com/help/app-store-connect/reference/maximum-build-file-sizes/
- https://support.google.com/googleplay/android-developer/answer/9859372
- https://developer.android.com/guide/playcore/asset-delivery
- https://bugs.webkit.org/show_bug.cgi?id=206741
- https://webkit.org/blog/14403/updates-to-storage-policy/
- https://developer.apple.com/news/upcoming-requirements/
- https://developer.apple.com/help/account/certificates/certificates-overview/
- https://support.google.com/googleplay/android-developer/answer/9842756

**Consoles / Godot**
- https://www.siliconera.com/crosscode-interview-radical-fish-games-on-console-ports-and-whats-next/
- https://generalarcade.com/runtimes/
- https://generalarcade.com/
- https://mp2.dk/chowdren
- https://www.construct.net/forum/construct-2/general-discussion-17/chowdren-fast-construct-runtim-134395
- https://en.wikipedia.org/wiki/Omori_(video_game)
- https://en.wikipedia.org/wiki/Nintendo_Web_Framework
- https://www.purexbox.com/news/2023/11/xbox-app-dev-gets-webview2-support-includes-better-performance
- https://www.construct.net/make-games/releases/beta/r371
- https://www.construct.net/en/blogs/ashleys-blog-2/construct-xbox-support-1873
- https://www.construct.net/en/blogs/ashleys-blog-2/construct-xbox-support-update-1875
- https://learn.microsoft.com/en-us/windows/uwp/xbox-apps/frequently-asked-questions
- https://en.generacionxbox.com/microsoft-confirms-an-important-change-in-xbox-uwp-apps-are-no-longer-accepted-in-the-store/
- https://forum.gdevelop.io/t/any-plans-of-console-support-switch-playstation-xbox-in-the-future/68637
- https://gonintendo.com/stories/360680-ratalaika-working-on-a-tool-to-bring-titles-created-in-rpg-maker
- https://steamcommunity.com/app/837510/discussions/0/1732089092452706362
- https://en.wikipedia.org/wiki/A_Dark_Room
- https://dragonruby.org/
- https://developer.nintendo.com/
- https://developer.nintendo.com/register
- https://en.wikipedia.org/wiki/Nintendo_Switch_2
- https://partners.playstation.net/
- https://developer.microsoft.com/en-US/games/publish
- https://en.wikipedia.org/wiki/ID@Xbox
- https://www.globalratings.com/about.aspx
- https://globalratings.com/storefronts/
- https://en.wikipedia.org/wiki/International_Age_Rating_Coalition
- https://docs.godotengine.org/en/4.5/tutorials/platform/consoles.html
- https://godotengine.org/consoles/
- https://www.w4games.com/w4consoles
- https://www.w4games.com/blog/w4-games-news-2/w4-consoles-beta-support-for-the-nintendo-switch-2-46
- https://www.w4games.com/blog/w4-games-news-2/interview-with-chasing-carrots-developer-of-halls-of-torment-47
- https://pineapple.works/
- https://www.lonewolftechnology.com/
- https://en.wikipedia.org/wiki/Cassette_Beasts
- https://en.wikipedia.org/wiki/Brotato
- https://en.wikipedia.org/wiki/Buckshot_Roulette
- https://en.wikipedia.org/wiki/Slay_the_Spire_II
- https://godotengine.org/article/platform-state-in-csharp-for-godot-4-2/
- https://bellard.org/quickjs/
- https://github.com/quickjs-ng/quickjs
- https://github.com/godotjs/GodotJS
- https://github.com/Geequlim/ECMAScript
- https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_windows.html

**Determinism / data**
- https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.sin
- https://esdiscuss.org/topic/es6-accuracy-of-special-functions
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math
- https://codereview.chromium.org/2073123002
- https://codereview.chromium.org/2122643002
- https://codeberg.org/perplexdotgg/bounce/issues/8
- https://www.freecodecamp.org/news/i-found-a-bug-in-v8s-exponentiation-operator-dcddfa5b8482/
- https://randomascii.wordpress.com/2013/07/16/floating-point-determinism/
- https://gafferongames.com/post/floating_point_determinism/
- https://gafferongames.com/post/deterministic_lockstep/
- https://gafferongames.com/post/fix_your_timestep/
- https://docs.godotengine.org/en/stable/classes/class_float.html
- https://docs.godotengine.org/en/stable/classes/class_int.html
- https://docs.godotengine.org/en/stable/classes/class_vector2i.html
- https://docs.godotengine.org/en/stable/classes/class_randomnumbergenerator.html
- https://docs.godotengine.org/en/stable/classes/class_dictionary.html
- https://docs.godotengine.org/en/stable/classes/class_array.html
- https://docs.godotengine.org/en/stable/classes/class_json.html
- https://docs.godotengine.org/en/stable/classes/class_string.html
- https://docs.godotengine.org/en/stable/tutorials/physics/large_world_coordinates.html
- https://raw.githubusercontent.com/godotengine/godot/master/core/math/math_funcs.h
- https://raw.githubusercontent.com/godotengine/godot/master/core/math/random_pcg.h
- https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html
- https://clang.llvm.org/docs/UsersManual.html
- https://en.cppreference.com/w/cpp/numeric/math/round
- https://en.cppreference.com/w/cpp/language/operator_arithmetic
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_AND
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...in
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Less_than
- https://v8.dev/features/stable-sort
- https://www.rfc-editor.org/rfc/rfc8259
- https://www.rfc-editor.org/rfc/rfc8785
- https://github.com/Cyan4973/xxHash
- https://www.pcg-random.org/
- https://prng.di.unimi.it/
- https://github.com/bryc/code/blob/master/jshash/PRNGs.md
- https://github.com/PetteriAimonen/libfixmath
- https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- https://wiki.factorio.com/Desynchronization
- https://lua-api.factorio.com/latest/auxiliary/libraries.html
- https://lua-api.factorio.com/latest/prototypes/PrototypeBase.html
- https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html
- https://rimworldwiki.com/wiki/Modding_Tutorials/XML_file_structure
- https://eu4.paradoxwikis.com/Checksum
- https://json-schema.org/overview/what-is-jsonschema
- https://en.wikipedia.org/wiki/Characterization_test
- https://en.wikipedia.org/wiki/Game_replay
- https://github.com/tc39/test262
- https://github.com/WebAssembly/testsuite
- https://github.com/pkmn/engine
- https://github.com/pkmn/engine/blob/main/docs/TESTING.md
- https://github.com/WebAssembly/design/blob/main/Nondeterminism.md
- https://github.com/ashtonmeuser/godot-wasm
- https://docs.wasmtime.dev/stability-platform-support.html
- https://github.com/wasm3/wasm3
- https://github.com/bytecodealliance/wasm-micro-runtime
- https://github.com/WebAssembly/wabt/blob/main/wasm2c/README.md
- https://hashlink.haxe.org/
- https://haxe.org/documentation/introduction/compiler-targets.html
- https://docs.unity3d.com/Manual/scripting-restrictions.html

**3D voxel**
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/GPU.json
- https://groups.google.com/a/chromium.org/g/blink-dev/c/N3RlLGCOTJ4/m/loneRTlPBwAJ
- https://developer.chrome.com/blog/enabling-shared-array-buffer
- https://github.com/ionic-team/capacitor/issues/6182
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/javascript/builtins/SharedArrayBuffer.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/http/headers/Cross-Origin-Embedder-Policy.json
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
- https://raw.githubusercontent.com/WebAssembly/website/main/features.json
- https://v8.dev/blog/4gb-wasm-memory
- https://developer.apple.com/forums/thread/822200
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/PressureObserver.json
- https://developer.android.com/games/optimize/adpf/thermal
- https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.enum
- https://github.com/fenomas/noa
- https://github.com/Divine-Star-Software/DivineVoxelEngine
- https://github.com/s-macke/VoxelSpace
- https://github.com/topics/webgpu?q=voxel
- https://github.com/topics/voxel-planet
- https://sumguy.com/browser-gpu-acceleration-linux-2026
- https://threejs.org/manual/pages/webgpurenderer
- https://www.utsubo.com/blog/threejs-2026-what-changed
- https://github.com/mrdoob/three.js/releases
- https://github.com/Zylann/godot_voxel
- https://voxel-tools.readthedocs.io/en/latest/getting_the_module/
- https://voxel-tools.readthedocs.io/en/latest/generators/
- https://voxel-tools.readthedocs.io/en/latest/smooth_terrain/
- https://voxel-tools.readthedocs.io/en/latest/changelog/
- https://en.wikipedia.org/wiki/Light_No_Fire
- https://minecraft.wiki/w/Tutorial:Custom_world_generation
- https://minecraft.fandom.com/wiki/Seed_(level_generation)

**Build / CI**
- https://docs.github.com/en/billing/reference/actions-runner-pricing
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://gigazine.net/gsc_news/en/20251219-github-actions-pricing-change
- https://support.google.com/googleplay/android-developer/answer/6112435
