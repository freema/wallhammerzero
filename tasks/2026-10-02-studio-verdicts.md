# STUDIO VERDICTS: APPROVE / REJECT / COMMENT INTO THE REPO (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** studio-live-reload

## Origin
D7 (verdicts are written back into the repo for Claude to read) and D21 (per-asset
`review.json`, written only by the studio, tied to the output hash, plus a generated
`reviews/INBOX.md`). D22 puts verdicts in the MVP.

## Read first
- `research/studio-stack.md` §5 (facts, format options, proposed shapes, concurrency rules,
  git-friendliness) and §8.5 (file ownership).
- `research/code-graphics.md` §7.3 steps 6–7 (verdict pins seed, params and hashes; the next
  session reads verdicts first).

## Scope
1. `assets/<pack>/<id>/review.json`, **written only by the studio**, atomic (temp file + rename),
   append-only entries: time, status (`approved` | `rejected` | `comment`), output hash, source
   hash, variant (seed, preset), reason tags, comment text, optional frame number.
2. Derived state shown everywhere: current status, and **"changed since verdict"** when the
   asset's current output hash differs from the last verdict's hash.
3. UI on `/asset/:id` and on gallery cards: approve / reject / comment, keyboard A / R / C, a
   fixed tag list (readability, silhouette, palette, proportions, animation timing, style
   mismatch, other), a comment box, the verdict history. Picking a variant records its seed.
   Gallery filter by status, including "changed since verdict".
4. `reviews/INBOX.md`, regenerated on every verdict: rejected (with comments and tags), comments,
   changed since verdict, counts of approved. A header says it is generated and must not be
   edited.
5. CLAUDE.md gains a short "Verdicts" section: read `reviews/INBOX.md` first; never write
   `review.json` or `INBOX.md`; never change an approved asset without the owner's consent;
   a library change that alters approved outputs must be reported.
6. The studio's own writes are echo-suppressed in the watcher.

## Out of scope
- Creating a task note from a rejection (`studio-task-from-rejection`).
- Before/after images and the "changed by a library change" re-bake (`studio-compare`).
- Audio verdicts (`studio-audio` reuses this service with musical anchors).
- A SessionStart hook that injects the INBOX into Claude (needs an owner OK for project hooks).

## Acceptance
- Approving, rejecting and commenting via the UI writes the expected `review.json` entries and
  regenerates `INBOX.md` (server tests + one scripted UI run via Chrome DevTools MCP).
- Changing an approved asset's generator so pixels change marks it "changed since verdict";
  a change that leaves pixels identical does not.
- Two quick verdicts in a row lose nothing (concurrency test).
- A request without a same-origin `Origin` header is refused.
