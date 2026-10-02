# STUDIO LIVE RELOAD: WATCH, RE-BAKE, PUSH (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** studio-skeleton-gallery

## Origin
D22: the gallery updates by itself when the generator session (Claude Code) writes files. The
owner watches results appear while Claude works.

## Read first
- `research/studio-stack.md` §2 (watcher choice, debouncing bursts and partial writes, SSE vs
  WebSocket, partial client updates, Claude Code hook signals) and §8.6 (event flow).
- `docs/dev-environment.md`: the file-watch probe result (native events vs polling on the
  Docker bind mount).

## Scope
1. One watcher in the studio server on `assets/**` (and `assets/palettes/`), using native events
   or polling, whichever the docker-dev-environment probe recorded as reliable. Per-path debounce
   (~200 ms) and batching, so a burst of writes from Claude is one update.
2. On change: recompute the source hash, **re-bake the changed assets** (and assets using a
   changed palette or stamp) in a worker with a timeout, update the index.
3. One SSE stream `/api/events` with topics (`assets` now; later notes add `reviews`, `tasks`,
   `concepts`, `audio`, `builds`), event ids and a small ring buffer for `Last-Event-ID`
   reconnects.
4. Client: a per-card store; only changed cards re-fetch (cache-busting by output hash). The open
   `/asset/:id` page updates in place. A small "Claude is writing…" indicator while a batch is in
   flight.
5. Echo suppression hook for files the studio itself writes (used by `studio-verdicts`).

## Out of scope
- Claude Code hooks posting to the studio (optional later; needs an owner OK for project hooks).
- Live execution of generators in the browser (`studio-params-sliders`).

## Acceptance
- Editing a generator on the host updates its gallery card within 2 s without a page reload;
  other cards don't re-fetch (verified in the network panel via Chrome DevTools MCP).
- A 50-file burst produces one batch, and the final state matches a fresh `bake --all`.
- A generator that loops forever is killed by the timeout and shows an error card; the studio
  keeps running.
- Server tests for debounce/batching and the SSE ring buffer are in `npm run check`.
