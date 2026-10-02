---
name: implement-tasks
description: "The implementation loop of this repo. Take the next note from the tasks/ queue and deliver it whole: orient, re-verify the note against the tree, design, implement, verify with the Docker gate (plus one blind browser pass when there is a browser surface), read the diff, commit with the note deleted, update docs/progress.md, report in Czech. One note = one task = one commit; no rounds. Run once (/implement-tasks), on one note (/implement-tasks sim-core) or unattended (/loop 45m /implement-tasks)."
disable-model-invocation: true
---

# implement-tasks: the tasks/ implementation loop

You are the **orchestrator** of the implementation loop of Wallhammer Zero. The queue is the
repo's own `tasks/` folder. **One iteration = one note delivered whole**: code, tests and the
docs it changes, verified, committed with the note deleted. Then the loop turns and takes the
next note. It ends when no note can be taken. Never leave the repo red.

**There are no rounds.** The owner abolished them: phases made every task look alive and none of
them finished. A note's `## Scope` is everything the task delivers, in one commit. There is no
docs-only pass, no tests-later pass and no polish pass.

Six principles carry the loop. Everything below follows from them.

1. **Context does not survive iterations; the repo does.** Every iteration starts from
   `git status`, `CLAUDE.md`, `docs/progress.md`, `tasks/README.md` and the gate, never from
   memory of the previous run.
2. **Serial, not parallel.** One note is committed before the next is taken. Parallelism lives
   inside a note (sub-agents for reading, one blind verifier), never across notes.
3. **Only a red gate blocks.** Review findings become follow-up notes. A failing gate is the only
   thing that stops a commit.
4. **The verifier never sees the diff.** A tester that knows how the code works stops testing the
   requirement and starts confirming the code.
5. **Every failure that reached verification is a missing check.** Add the test or lint that
   would have caught it, in the same commit. Prose rules erode as context fills; a check does not.
6. **A claim you did not re-read is a guess.** Notes age, and files move under them. Re-verify
   before you build on a note's claims.

## 0. What the loop reads

| What | Where |
|---|---|
| Hard rules of the repo | `CLAUDE.md` (Docker only, discuss before writing, third-party skills, licences) |
| The queue and its rules | `tasks/README.md` (the Queue table, the note format) |
| Which note is next | `./dev node tools/task-queue/cli.mjs` (reads the table and the notes; changes nothing) |
| The gate | `./dev npm run check` (runs in Docker; the exit code is the verdict) |
| State between iterations | `docs/progress.md`: **the only state that carries over** |
| Owner calls | the owner-calls note in `tasks/` (the tool prints its path) and `docs/DECISIONS.md` |
| Browser tooling | Chrome DevTools MCP on the host browser (containers have no GPU) |

Details: [references/task-queue.md](references/task-queue.md),
[references/progress-file.md](references/progress-file.md),
[references/verification.md](references/verification.md),
[references/implementation-brief.md](references/implementation-brief.md).

## 1. Orientation: before touching anything

1. **`git status --short` and `git log --oneline -5`.** Modified files you did not write belong
   to another session or to an interrupted one.
   - **A live session** (a `claude` process working in this checkout, files changed in the last
     minutes): the note those files belong to is taken. Pick another. Never commit, revert, stash
     or tidy its files, and never edit a file to test something while it works.
   - **Not live:** it is interrupted work, and **half-finished work gets finished**. Read the
     diff, the `In flight` line in `docs/progress.md` and any `## REMAINING` block, adopt the
     note and deliver the rest. Do not ask for permission to finish it.
2. Read, in this order: `CLAUDE.md` (hold its rules fresh) · `docs/progress.md` ·
   `tasks/README.md` · `reviews/INBOX.md` if it exists (the owner's verdicts from the studio).
3. **Run the gate, bare:** `./dev npm run check`. **Red before you start is your first task:**
   the previous iteration left breakage, and it comes before any note. Fix it as its own commit.

## 2. Selection

Run the queue tool and take what it says:

```sh
./dev node tools/task-queue/cli.mjs            # the next note, and what the others wait for
./dev node tools/task-queue/cli.mjs <note>     # one note: #12, a file name or a topic
```

- `NEXT:` is the first row of the Queue table whose gate is open and whose dependencies are
  done (a dependency is done when its note is gone). Take it. Say which one and why in one line.
  Do not ask.
- **`/implement-tasks <note>`** overrides the order, not the rules. `NOT READY:` with a gate
  means an owner call: do not start, report the call. `NOT READY:` with `needs #n` means code
  that does not exist yet: report it and stop.
- **`partly gated:`** means one part of the note waits for the owner. Do everything else (§8
  says how the gated part is recorded).
- **`has a ## REMAINING block`:** read it first. It says what already shipped and what was
  deliberately not done. Do not redo a recorded deviation.
- **`NEXT: none`:** nothing can be taken. Go to §10.
- `ERROR:`, `STUCK` or `WARNING:`: the queue itself needs repair (a row without a note, a note
  without a row, a table and a note that disagree about a gate). Repair `tasks/` first and commit
  that alone; [references/task-queue.md](references/task-queue.md) says which side wins.
- **Claim the note:** write the `In flight` line in `docs/progress.md` before the first edit.
- **Read the whole note, then check its size.** A note you cannot finish whole is the wrong
  note. If it is really two tasks, split it into two notes before starting (a commit of its own
  that touches only `tasks/`), say so in the report, and take the first.

Never two notes in one commit.

## 3. Blast radius

- You may edit everything the note's Scope needs: code, tests, docs, build files. **Work outside
  the Scope becomes a follow-up note (§8), not an extra change.**
- **Everything runs in Docker.** Every command goes through `./dev <cmd>`. Nothing is installed
  on the host: no npm, brew or pip, no Node or Python upgrade. A tool the slim image lacks gets
  its own pinned image, not a host install. A real exception is an owner call.
- **Third-party skills, plugins and MCP servers** are never installed or copied by the loop. If
  a note seems to need one, that part is an owner call (skillspector scan, triage, approval).
- **Licences before borrowing.** Check `research/README.md` ("Licence flags") and the licence of
  anything new before copying even a snippet. A new dependency: verify that it exists and is the
  package you mean, check its licence, install it through `./dev npm install <pkg> -w <workspace>`
  and commit the lockfile.
- No secrets, no API keys, no credentials, in any file or command.
- **No push, no branches, no PRs, no releases.** Commit on the branch the session is on. Push
  only when the owner says so.
- Never edit anything outside this repo.

## 4. Design: inline, scaled to risk

1. **Re-verify the note's claims (principle 6).** Open the files, packages and sections the note
   names, and the sections under its `## Read first`. Notes of finished tasks are gone; their
   results are in the code and the docs.
2. **Find the owner calls** in the note and in the owner-calls note. You never decide them. The
   part of the Scope that depends on one is skipped, not guessed.
3. **Everything else you decide.** Details inside notes are session defaults, not owner
   decisions. Where the note leaves a choice open, take the note's default, or the simplest and
   most reversible option that satisfies it, and list it in the commit message under "Session
   defaults taken". Do not stop to ask.
4. Shape the work in a few deliberate paragraphs: boundaries, what it must not break, what to
   watch. For a shape that is expensive to change later (a data format, a public API of a
   package, a file layout that later notes build on), write the design down in the doc the note
   names before implementing.
5. Match the package and folder names the notes use. Later notes build on them.

## 5. Implementation

- Production code is written by the **strongest available model**, never a smaller one. For a
  small note (Size S), implement inline. For a larger one, delegate to one sub-agent on the
  session's own model and keep your context for orchestration:
  [references/implementation-brief.md](references/implementation-brief.md). Fixes go back to
  the same agent.
- **The note's Acceptance items are binding, all of them.** Code, tests and docs ship together.
- **Test-first for pure logic.** Prefer invariants over transcribed outputs.
- **Test integrity is absolute.** Never delete, skip, weaken or retarget a test or a lint to get
  green. A red test is a finding. If a test is wrong, fix it and say so in the commit message.
- **A new package joins the gate** by having a `check` script in its own `package.json`. The
  root script is never edited for that.
- Run `./dev npm run check -- <package>` while iterating. Only the full run is the gate.
- **Keep the attempt ledger.** Before a second try at anything that failed, write the failed
  approach and why into `docs/progress.md`. A later session must not repeat it.
- A sub-agent that dies mid-task leaves its work in the tree. Keep it, read the diff and
  continue from there.

## 6. Verification

Detail, and the reason behind each rule: [references/verification.md](references/verification.md).

1. **The gate, bare, in Docker:** `./dev npm run check`. Read its exit code. **Never pipe it**
   (`| tail`, `| grep`): a pipe returns the exit code of its last command, and a failure scrolls
   past into a red commit.
2. **Check every Acceptance item yourself** and keep the evidence: an exit code against a
   fixture, a hash, a number, a file that exists. **Confirm that each check fails without the
   change.** A check that passes for a reason you have not established is not evidence.
3. **Graphics and animation:** numbers and hashes from the CPU renderers first. To look at an
   image, follow "Looking at images" in `CLAUDE.md` (integer upscale, contact sheets, never a
   GIF), in a sub-agent that returns a text verdict.
4. **One blind browser pass, when there is a browser surface.** A sub-agent on a cheaper model
   gets **only** the acceptance criteria reworded as observable outcomes (at most 5, aim for
   2–3) and the URL. It never gets the diff, the note, the plan or this skill. It drives the
   host browser through Chrome DevTools MCP and returns PASS or FAIL per criterion with
   evidence, as text.
   - The surface is the local studio (`http://127.0.0.1:4100`) once `compose.yaml` has a
     `studio` service, or a page the note serves for its check (`./dev -p 4101 <server>`).
   - **No browser surface, no browser pass.** Say so in the commit message, so the absence is a
     decision and not an omission.
   - Do not touch the working tree while the pass runs.
5. Fix what failed and repeat the whole step that failed, not only the failed case.
6. An Acceptance item that only the owner can confirm (a visual verdict, a review) is reported
   as **not checked**, never as passed.

## 7. Review: quick, not blocking

After verification is green, **read the diff yourself**: correctness, security, the rules in
`CLAUDE.md`, obvious simplifications. No review panels, no spawned review agents.

- A finding that would break the build, lose data, leak a secret or break a hard rule is fixed
  before the commit. That is the only thing that blocks.
- Everything else becomes a follow-up note (§8), and the commit proceeds.

## 8. Record the outcome: in the same commit

Formats and examples: [references/task-queue.md](references/task-queue.md).

1. **Delete the note** (`git rm`) and **remove its row** from the Queue table in
   `tasks/README.md`. Update the "queue by track" table and any doc that names the note as
   pending. The outcome lives in the commit message and in the docs the task changed.
2. **If the Scope did not close** (an incident, not a plan): keep the note, add
   `## REMAINING <date>` at its top naming exactly what is left and why, and commit what works.
   If what is left waits for an owner call, write the call into the row's Gate cell, so the
   next iteration skips the note.
3. **Owner calls** the note leaves open or the work surfaced go into the owner-calls note:
   question · options · recommendation · what it gates. You never decide one, and a note never
   stays alive only to hold a question.
4. **Follow-ups:** work the task surfaced but its Scope does not cover (a bug you saw and did
   not fix, a deviation that needs its own pass) becomes a **new dated note** plus a queue row
   above the `queue:end` marker, in this commit. If a note on that topic exists, append to it.
   - A follow-up is never a way to ship half a task. The note's own docs and tests are not
     follow-ups.
   - **A new idea is not a follow-up.** New features and plans go to the owner as a proposal in
     the report (options + recommendation), never straight into `tasks/` or `docs/DECISIONS.md`.
5. **Docs** the task changes, including the status lines in `CLAUDE.md` and `README.md` when
   they stop being true.
6. **`docs/progress.md`**, made current: nothing in flight, what was finished, the next note
   (run the queue tool again after removing the row), what waits for the owner, the ledger
   pruned. [references/progress-file.md](references/progress-file.md).
7. **Commit as one change.** Stage only the files you touched (never `git add -A`, never a
   foreign file), then chain the gate to the commit:

   ```sh
   git rm -q tasks/<note>.md
   git add <the files you touched>
   ./dev npm run check && git commit -F <message file outside the repo>
   git status --short        # nothing of yours may be left
   ```

   The message: one line saying what was delivered; then what shipped (files, commands, tests),
   the Acceptance items with their evidence, deviations from the note and why, session defaults
   taken, the browser pass or why there was none, follow-ups created, and
   `Closes tasks/<note>.md.` **Commit right after green. Do not wait for approval.** The
   verification is the guarantee.

## 9. Ratchet

Every failure that reached verification is a missing rule, not bad luck. In the same commit add
the check that would have caught it (a test, a lint, a line in `CLAUDE.md`) and say so in the
commit message.

## 10. When to stop

**Waiting is a state, not a follow-up note.** Stop and hand back when:

- **`NEXT: none`.** Do not start anything. Report every blocked note and the owner call it waits
  for (the `BLOCKED ON THE OWNER` list), each call as question · options · recommendation · what
  it unblocks. If `docs/progress.md` does not show the same list yet, write it and commit that
  file alone. Under `/loop`, end the loop: a tick that only repeats the same block is noise.
- The note needs something only the owner has: an owner call, a credential, a host install, a
  third-party skill approval. Do everything the call does not gate first.
- **The same fix failed twice.** Stop guessing. Diagnose inline, or give one focused diagnosis to
  a strong sub-agent. If that does not resolve it, write the state into the note
  (`## REMAINING`) and into the ledger in `docs/progress.md`, and hand it back. No third try.
- A live session is working in the files the note needs (§1).

**Never stop while a note can be taken** and the session has room.

## 11. Report to the owner: a record, not a request

In **Czech**; identifiers stay English. Keep it short.

1. **Co se dodalo:** the note, files, commands and tests by name, the commit.
2. **Odchylky od noty a proč;** session defaults taken.
3. **Ověření:** the gate result, each Acceptance item with its evidence, the browser pass per
   criterion or why there was none. Readings and inferences stay visibly different things.
   What only the owner can confirm is listed as not checked.
4. **Owner cally:** each as question · options · recommendation · what it unblocks. Never more
   than the notes list. Never decided by you.
5. **Další krok:** the next note the queue tool names, or what is blocked.
6. **Follow-upy:** each new note (file name + one line), or "žádné". Proposals for new work go
   here too, marked as proposals.

## 12. Launch modes

| Invocation | Behaviour |
|---|---|
| `/implement-tasks` | One note: the next one in the queue, delivered whole and committed. Then the report with the next item, and stop. |
| `/implement-tasks <note>` | The same, on that note (`#12`, a file name or a topic). |
| `/loop <interval> /implement-tasks` | Unattended: each tick takes one note, or resumes the one in flight. The loop ends when the queue is empty or everything left waits for the owner. |

## Anti-patterns (each one cost real work somewhere)

- Rounds by another name: shipping the code now and "the docs and tests in a follow-up".
- `./dev npm run check | tail`: the exit code you read is `tail`'s.
- Running `npm`, `node` or `npx` on the host.
- Building on a note's file names and claims without opening the files.
- Giving the browser agent the diff or the plan. It confirms the code instead of testing the
  requirement.
- Five browser criteria "to be thorough". Two criteria plus a script give better evidence in a
  fraction of the time.
- Deciding an owner call because the recommended option looked obvious.
- Writing a new idea into `tasks/` as a note. Ideas go to the owner as proposals.
- Committing another session's dirty files because they were in the way.
- Editing a source file to test a hypothesis while another session is live in the checkout.
- Two notes in one commit. The queue stops telling the truth about what moved.
- Reporting an item only the owner can confirm as passed.
- Leaving `docs/progress.md` saying "in flight" after the commit.
