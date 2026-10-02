# DESKTOP WRAPPER (2026-10-02)

**GATE:** none · **Priority:** P3 · **Size:** M · **Depends on:** studio-play-and-builds, player-saves

## Origin
D10: games are wrapped for desktop and mobile. D11: the studio makes the build. D24: the
desktop wrapper is Electron.

## Read first
- `research/multiplatform.md` §1 (Electron vs Tauri vs NW.js: graphics, frame pacing, audio,
  Steam, building and signing), §5.1 (target matrix) and "Concrete choices".
- `research/audio-from-code.md` "Recommendations" 7 (audio uniformity on desktop).

## Scope
1. `packages/shell-desktop`: a pinned Electron major that loads the game's web target from
   disk through a custom protocol; no remote content, context isolation on, no Node
   integration in the page.
2. Window rules: integer scaling with letterboxing, fullscreen toggle, pause on focus loss.
3. The **storage adapter** for desktop: saves as files in the user data folder.
4. The build target **`desktop`** registered in the studio's builds: unpacked folders for
   Linux and Windows, built in Docker from Electron's prebuilt binaries. A macOS build only if
   it can be made unsigned in Docker; otherwise it waits for OC-B4.
5. A boot smoke test in Docker: the Linux build starts under a virtual display, draws through
   the CPU fallback (containers have no GPU) and runs one action script.
6. `docs/shipping.md`: what is built where, and what is not done yet.

## Out of scope
- Steam (steamworks, depots, overlay), signing and notarisation (OC-B2, OC-B4), auto-update,
  installers.

## Acceptance
- "Build desktop" in the studio produces the Linux and Windows folders with a manifest of
  hashes; nothing is installed on the host.
- The Docker smoke test passes: the script's digests equal the web target's.
- The owner starts the macOS or Windows build on a real machine and confirms sound, saves and
  fullscreen (a manual check, recorded in the commit message).
