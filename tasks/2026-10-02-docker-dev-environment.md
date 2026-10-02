# DOCKER DEV ENVIRONMENT (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** none

## Origin
D16: everything runs locally in Docker and nothing is installed on the host. The host has Docker
Desktop 29.4 + Compose v5 (12 CPU, ~8 GB VM), Node 22.21.1 (too old for React Router 8, which
needs ≥ 22.22, see `research/studio-stack.md`) and system Python 3.9. Claude Code runs on the host
and must be able to run every command through Docker. Every later note needs this.

## Read first
- `research/studio-stack.md` §1.3 (the Node version on this machine), §2.1 (choosing a file
  watcher; bind mounts), §7.5 (facts on headless WebGL: Chrome 139 removed the software
  fallback).
- `research/skill-validation.md` §1.4 (why the validator also needs Docker).

## Scope
1. `compose.yaml` at the repo root with a `dev` service:
   - Node **24 LTS** image pinned by version and digest;
   - the repo bind-mounted at `/work`;
   - `node_modules` and the npm cache in named volumes (not on the host bind mount);
   - runs as the host user's UID/GID, so files written in the container are not root-owned.
2. A minimal root `package.json` (npm workspaces placeholder, `"private": true`) with a `check`
   script that is the **gate command**. For now it only runs a smoke test; later notes extend it
   with typecheck, lint and tests.
3. A thin wrapper so Claude and the owner type one short command, e.g. `./dev <cmd>` →
   `docker compose run --rm dev <cmd>`. Document the exit-code behaviour (the gate must return the
   real exit code; never pipe it through `grep`/`tail`).
4. **File-watch probe:** a small script run inside the container that watches the bind mount while
   the host writes files, measuring latency and missed events for single writes and bursts. Record
   the result. If events are unreliable, document the polling fallback (interval) that the studio
   will use.
5. **Port publishing** convention for later services (the studio): bind to `127.0.0.1` only.
6. **GPU note:** document that containers on macOS have no GPU, so headless WebGL in a container
   won't work (Chrome 139 removed the software WebGL fallback). Visual checks use CPU renderers in
   Node, or the host browser through Chrome DevTools MCP.
7. `docs/dev-environment.md` explains all of the above. Fill in the **Verification** section of
   `CLAUDE.md` with the real gate command.

## Out of scope
- The studio app itself (`studio-skeleton-gallery` and the notes after it).
- skillspector (task #3).
- iOS/macOS builds (need Xcode on the host; an owner call when we get there).

## Acceptance
- On a clean clone: `./dev npm run check` exits 0, and a deliberately failing check exits non-zero
  through the wrapper.
- `node --version` inside the container prints 24.x; nothing was installed on the host
  (`which`/versions on the host unchanged).
- Files created by the container on the bind mount are owned by the host user.
- The file-watch probe result (latency, missed events for a 100-file burst) is recorded in
  `docs/dev-environment.md`.
