# MOBILE WRAPPER (2026-10-02)

**GATE:** none (the iOS build waits for OC-B4) · **Priority:** P3 · **Size:** M · **Depends on:** studio-play-and-builds, runtime-audio, player-saves

## Origin
D10: games are wrapped for desktop and mobile. D16: nothing is installed on the host, and an
iOS build needs Xcode on the host, which is an owner call (OC-B4). D27: the mobile wrapper is
Capacitor (a delegated default the owner can overturn).

## Read first
- `research/multiplatform.md` §2 (Capacitor vs Tauri mobile: rendering in WKWebView and
  Android WebView, audio, safe areas, store acceptance, offline assets and saves), §5.1 and
  §5.3 (signing keys and secrets).
- `research/audio-from-code.md` §5.5 (mobile audio unlock and lifecycle).

## Scope
1. `packages/shell-mobile`: a Capacitor project that bundles the web target for offline use.
2. Safe-area insets passed to the UI layout; orientation lock; pause and audio suspend when
   the app goes to the background, resume when it returns.
3. The **storage adapter** for mobile (Capacitor Preferences / Filesystem).
4. The build target **`mobile`**: an Android debug APK built in Docker (JDK and Android SDK
   inside an image). The iOS project is generated, but it is built only under OC-B4.
5. A **real-device checklist** for the owner in `docs/shipping.md`: mute switch, backgrounding,
   an incoming call, rotation, notch and home-indicator areas, a cold start offline.

## Out of scope
- Store listings, signing keys, in-app purchases, Game Center / Play Games.
- Performance tuning for low-end devices.

## Acceptance
- "Build mobile" in the studio produces an Android APK in Docker; nothing is installed on the
  host.
- The owner runs the APK on a real phone and ticks the checklist (manual, recorded in the
  commit message).
- No key, keystore or secret is written into the repo or the studio cache.

## Follow-up from runtime-sprite-core (2026-10-02)
The WebGL2 backend of `packages/runtime` was checked for pixel parity with the CPU backend in
desktop Chrome only (ANGLE on Metal). WKWebView and Android WebView use other GPU stacks. When
the wrapper runs on a device, run the same comparison inside the WebView: the check scenes of
`packages/runtime/dev/scenes.ts` drawn by both backends and compared with the golden hashes, as
`parity()` of the runtime's dev page does (`packages/runtime/README.md`). Record the result in
`docs/shipping.md` next to the real-device checklist. A mismatch is a bug of the WebGL backend,
not of the wrapper: it becomes its own note.
