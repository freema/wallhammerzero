# The tasks/ queue: how the loop reads and writes it

The rules of the queue are in [`tasks/README.md`](../../../../tasks/README.md). This page is how
the loop applies them. If the two disagree, `tasks/README.md` wins; fix this page in the same
commit.

## The three objects

| Object | What it is | Where |
|---|---|---|
| **Queue table** | the board: what exists, in what order, what is gated | `tasks/README.md`, under `## Queue` |
| **Note** | one task, delivered whole in one commit | `tasks/<YYYY-MM-DD>-<topic>.md` |
| **Owner-calls note** | the questions only the owner can answer | `tasks/<date>-owner-calls.md` (row 0) |

There is no status column and no status block. A note exists, or it is done and deleted. The
record of a finished note is its commit message and the docs it changed:

```sh
git log --diff-filter=D --name-only -- 'tasks/*.md'     # the history of finished notes
```

## The queue table

```markdown
| # | Note | Gate | Depends on |
|---|---|---|---|
| 0 | [Owner calls](2026-10-02-owner-calls.md) | owner answers | none |
| 5 | [Asset render CLI](2026-10-02-asset-render-cli.md) | none | #4 |
| 22 | [Runtime tilemap and scene](2026-10-02-runtime-tilemap-scene.md) | OC-A2-pick | #18, #20 |
| 34 | [Mobile wrapper](2026-10-02-mobile-wrapper.md) | none (iOS build: OC-B4) | #30, #25, #23 |
<!-- queue:end (the studio inserts new rows above this line) -->
```

- **Order** is the priority: the first row that can be taken is taken.
- **Gate:** `none` is open. Anything else names the owner call the note waits for.
  `none (…)` is open, and the text in the parentheses names the one part that is gated.
- **Depends on:** row numbers (`#4`) or note topics (`asset-kit-core`). Text in parentheses is a
  comment. **A dependency is done when its note is gone** (no row, no file).
- **`#`** is the row's name, used by "Depends on" and by the "queue by track" table. A new row
  takes the tool's `NEW ROW NUMBER` (one more than every number the README still mentions), so a
  number that something still points at is never given to another note.
- The `<!-- queue:end … -->` line stays directly under the last row. New rows go above it.

## The queue tool

```sh
./dev node tools/task-queue/cli.mjs            # the next note, and what the others wait for
./dev node tools/task-queue/cli.mjs <note>     # one note: #12, a file name or a topic
./dev node tools/task-queue/cli.mjs --json     # the same data as JSON
./dev node tools/task-queue/cli.mjs --help     # the usage
```

It reads the table and the header line of every note and changes nothing. It also reads the
note's own `**GATE:**` and `**Depends on:**`: a note is gated if the table **or** the note says
so, and it waits for the dependencies of both. The lines it prints:

| Line | Meaning | What you do |
|---|---|---|
| `NEXT: #n tasks/….md (Title)` | the note to take | take it |
| `NEXT: none (…)` | nothing can be taken | stop (skill §10) |
| `NOT READY: …` | the note you asked for is gated or waits for other notes | report, do not start |
| `partly gated: …` | one part waits for the owner | do the rest; see "A partly gated note" |
| `has a ## REMAINING block` | an earlier session left it unfinished | read the block first |
| `OPEN AFTER IT` | other notes that could be taken now | name the first as the next step |
| `WAITING FOR OTHER NOTES` | their dependencies are not done | nothing |
| `BLOCKED ON THE OWNER` | gated, or behind a gated note; names the call | report them when you stop |
| `STUCK, FIX THE QUEUE` | a row without a note, a dependency cycle, an unreadable dependency | fix `tasks/README.md` |
| `OWNER CALLS NOTE: …` | where owner calls go | |
| `NEW ROW NUMBER: n` | the number for the next new row | use it for a follow-up |
| `WARNING:` / `ERROR:` | the table and the notes disagree / the table cannot be read | fix it first |

Exit code 0 means the queue was read (also when nothing can be taken). Exit code 2 means the
table cannot be read or the note you named has no row.

## When the table and the notes disagree

Repair `tasks/` before taking a note, in a commit of its own that touches only `tasks/`.

- **A note without a row** is not in the queue. Add its row above the `queue:end` marker with
  the tool's `NEW ROW NUMBER`, taking Gate and Depends on from the note's header line.
- **A row without a note:** if `git log --diff-filter=D -- tasks/<file>` shows the note was
  finished, remove the row. If the note never existed, report it; do not write the note yourself.
- **Gate mismatch** (one side says `none`, the other names a call): the note stays gated. Look the
  call up in `docs/DECISIONS.md`. If the owner answered it there, set both sides to `none`. If
  not, set both sides to the call.
- **An unreadable dependency** (prose in "Depends on"): rewrite it as row numbers or note topics.
- **A dependency cycle:** report it. Which note goes first is not yours to guess when the notes
  do not say.

## Closing a note: all of this in the one commit

1. `git rm tasks/<note>.md`.
2. Remove the note's row from the Queue table. Leave the other rows' "Depends on" cells as
   they are: a number without a row means "done".
3. In the "queue by track" table, drop the note, or mark it done with a link to the doc that
   now describes the result.
4. Update the docs the task changed, and the status paragraphs in `CLAUDE.md` and `README.md`
   when they stop being true.
5. Run the queue tool again and write the result into `docs/progress.md`.

## A note that did not close

An incident, not a plan to imitate. Keep the note and put this at its top, under the header
line:

```markdown
## REMAINING 2026-10-14
- Shipped: `packages/det` (PCG32, hash helpers), 41 tests, the docs page.
- Left: the fixed-point sine table (Scope item 4). The first approach lost precision past
  2^20; see the ledger in docs/progress.md.
- Why it is left: the same fix failed twice.
```

The row stays in the table. If what is left waits for the owner, write the call into the row's
Gate cell (and into the note's `**GATE:**`), so the tool reports the note as blocked instead of
selecting it again.

## A partly gated note

`none (iOS build: OC-B4)`: deliver everything the call does not gate, with the full
verification. Then:

- if the note says its Scope is complete without the gated part, close the note as usual;
- otherwise keep the note with a `## REMAINING` block that names the gated part, and set the
  row's Gate cell to the call (`OC-B4`). The call must be in the owner-calls note.

## Follow-up notes

Work the task **surfaced** but its Scope does not cover: a bug seen and not fixed, a deviation
that needs its own pass, a placeholder that must become real.

- Written **in the same commit** as the task that surfaced it, with its queue row. Otherwise
  the next iteration never hears of it.
- File: `tasks/<today>-<topic>.md`, in the note format of `tasks/README.md`. `## Origin` names
  the note and the place that surfaced it (`file:line`).
- Row: above the `queue:end` marker, numbered with the tool's `NEW ROW NUMBER`, Gate and
  Depends on filled in.
- **Never executed in the same commit.** Name it in the report; the queue decides when it runs.
- Same topic already has a note ⇒ append to that note instead. No duplicates.
- **Not a way to ship half a task.** The docs, the tests and "the rest of the same feature"
  belong to the note itself.
- **Not a way to add ideas.** `CLAUDE.md`: notes are written only for work the owner agreed to.
  A follow-up is the unfinished edge of agreed work. A new feature, a new plan or a change of
  direction goes to the owner as a proposal in the report (options + recommendation).
- A **decision** for the owner is not a follow-up. It is an owner call.

## Owner calls

A question only the owner can answer: taste, money, legal, a host install, approval of a
third-party skill, anything a note or the owner-calls note marks as open.

- The loop **never decides one**, however obvious the recommended option looks.
- Do everything the call does not gate. Then record the question in the owner-calls note, in
  the format the note already uses:

  ```markdown
  **OC-<id>: <the question>.** <context>. Options: (a) … (b) … Recommendation: (a), because ….
  Gates `<note topic>`.
  ```

- Ask it in the report, once: question · options · recommendation · what it unblocks.
- A parked call (the note says "do not ask again") is not asked again.
- When the owner answers in chat, the answer becomes a row in `docs/DECISIONS.md` with the
  owner's words, the call leaves the owner-calls note, and the Gate cells it closed go back to
  `none`. Only the owner's own words are an answer.

**Not every open detail is an owner call.** Details inside notes are session defaults (D23), and
the owner delegated the smaller calls (D27). Take the note's default or the simplest reversible
option, and list it in the commit message under "Session defaults taken", where the owner can
overturn it.

## Splitting a note

A note that holds two tasks (two systems, two decisions, two owner calls) is split **before**
starting: two notes in the note format, two rows in the place of the old one (the first keeps
the number, the second gets `NEW ROW NUMBER`), dependencies of other rows updated. Commit the
split alone (it touches only `tasks/`), say so in the report, then take the first part.

A note that is merely large is not split. It is delivered whole.

## Notes the studio creates

The studio may write notes (a rejected asset becomes a note) and inserts their rows above the
`queue:end` marker. They use the same format, and the loop treats them like any other note. A
studio note without a row shows up as a `WARNING:`; add the row.
