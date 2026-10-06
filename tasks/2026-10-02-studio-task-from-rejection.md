# STUDIO: TASK NOTE FROM A REJECTION (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** studio-verdicts

## Origin
D8 (the studio may create task notes; tasks belong to the studio) and D22 (task from a rejection
is in the MVP).

## Read first
- `tasks/README.md` (note format, queue table, follow-up rule).
- `research/studio-stack.md` §5.6 (creating `tasks/` notes from the UI) and §5.4 (concurrency).

## Scope
1. On a rejected verdict: **"Create task"** opens a form prefilled from the verdict: title,
   Origin (asset id, output hash, verdict time, tags, comment, links to the contact sheet and
   strip in `build/review/`), Scope with the owner's comment as item 1, Acceptance "owner
   approves the asset in the studio".
2. The studio writes `tasks/<date>-<slug>.md` in the note format with an **exclusive create**
   (never overwrites) and adds a row to the Queue table in `tasks/README.md` (a stable marker
   comment at the end of the table marks the insert point).
3. The verdict entry links to the created note; the asset page shows it.
4. `/tasks`: a read-only list of task notes (title, gate, priority, depends on) rendered from
   the files, updated by live reload.

## Out of scope
- Editing or deleting notes in the studio. Notes are deleted by the commit that does the work.
- Starting a Claude Code session on a note (later maybe, D5).

## Acceptance
- Creating a task from a rejection produces a note that follows the format in `tasks/README.md`
  and a queue row; creating it twice with the same slug creates a second, suffixed note and
  never overwrites (test).
- `/implement-tasks` (once that skill exists) can pick the created note up as written.

## From verdicts (2026-10-07)
What `studio-verdicts` left for this note (see `docs/studio.md`, "Verdicts"):
- A verdict is an entry of `assets/<pack>/<name>/review.json` (`format: "wz.review/1"`):
  `id`, `at`, `status`, `outputHash`, `sourceHash`, `variant`, `tags`, `comment`, `frame`. The
  service is `services.reviews` (`packages/studio/server/services/reviews.ts`): `add(id, input)`
  appends one. There is no field for a task yet: linking a verdict to the created note means
  a new optional field (`task: string | null`) on `Verdict`, written by this note's service
  through the same serialized, atomic path (`appendVerdict` rewrites the whole file; a
  "patch one verdict" step is new).
- The pages read `record.review` (`status`, `changed`, `count`, `last`, `verdicts`); the panel
  is `packages/studio/app/verdicts.tsx` (the history list is where "→ tasks/…" goes).
- The inbox (`reviews/INBOX.md`) is rendered by `renderInbox` in the same service; a line per
  rejected asset is where the note's path goes too.
- A studio write outside `assets/` (a task note, `tasks/README.md`) is not watched: no echo
  suppression is needed for it.
