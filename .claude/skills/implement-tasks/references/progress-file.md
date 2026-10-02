# The progress file: the only state between iterations

Context does not survive an iteration, a compaction or a `/loop` tick.
[`docs/progress.md`](../../../../docs/progress.md) does. It is read at the start of every
iteration (skill §1) and made current in every commit (skill §8).

Everything else the loop needs is already in the repo and is read from there, never copied into
this file:

| Question | Source of truth |
|---|---|
| What is next, what is blocked | the queue tool (`./dev node tools/task-queue/cli.mjs`) |
| What was done | `git log`, and the docs each task changed |
| The rules | `CLAUDE.md`, `tasks/README.md` |
| What the owner decided | `docs/DECISIONS.md` |
| What the owner must still decide | the owner-calls note in `tasks/` |

If the progress file and one of these disagree, the source of truth wins and the progress file
is corrected.

## Shape

```markdown
# Progress

Working state of the implementation loop (`/implement-tasks`). Read at the start of every
iteration, made current in every commit. Not a changelog: git history is the changelog.

## Now

- **In flight:** `tasks/2026-10-02-asset-kit-core.md`, since 2026-10-03 09:10. Done so far:
  `packages/det` with tests. Left: the palette buffer, the docs page.
- **Last finished:** `runtime-sprite-core` (2026-10-03).
- **Next:** #7 `studio-skeleton-gallery`.

## Blocked on the owner

- #22 `runtime-tilemap-scene`: OC-A2-pick (which art-spike variant wins).

## Attempt ledger (failed approaches: do not retry)

- `asset-kit-core`: quantising before the alpha cut let halo pixels dominate the palette.
  Cut alpha < 128 first, then quantise.

## Open questions for the owner

- none
```

## Rules

- **In flight** is the claim. Write it before the first edit of a note (note path, start time).
  Update it when the session may end before the commit: what is done, what is left. Set it to
  `nothing` in the commit that closes the note. A session that finds an `In flight` line and a
  dirty tree with no live session adopts that note (skill §1).
- **Last finished** and **Next** are one line each. Next comes from the queue tool, run after
  the row was removed.
- **Blocked on the owner** repeats the tool's `BLOCKED ON THE OWNER` list with the call in a
  few words, so the owner sees it without running anything.
- **The attempt ledger** is what keeps a later session from repeating a failure. One entry per
  failed approach: the note, what was tried, why it failed, what to do instead. Write the entry
  **before** the second try. Two failed tries at the same fix is a stop condition (skill §10).
  Remove an entry when the note it belongs to is closed, unless it warns about something later
  notes will meet; durable lessons belong in the docs page of the area, not here.
- **Open questions for the owner** holds what is not an owner call in the owner-calls note: a
  review the owner still owes, a proposal waiting for an answer.
- **Keep it short.** A progress file that grows into a history is one the next iteration will
  not read to the end. Prune in every commit.
- It is committed with the work. It gets a commit of its own only when the loop stops with
  nothing to commit (everything blocked, or a hand-back).
