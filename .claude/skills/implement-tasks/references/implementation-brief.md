# Implementation brief: what a delegated implementer gets

The implementer starts with nothing but the repo and its tools. The brief is what lets it
finish the whole note without asking. Two rules shape it:

- **Pointers, not copies.** Point at the note, the files and the earlier commits. Paste only
  what the agent cannot fetch and what exists nowhere else yet: the design decisions of skill §4
  and the boundaries. A brief that retells the note drifts from it; a pointer does not.
- **The verifier's brief is the opposite.** It gets only the acceptance criteria and a URL,
  never the diff, the note or this brief. See [verification.md](verification.md).

## Template

```markdown
# <note file name>: <title>

## Read first (pointers)
- `tasks/<note>.md`, whole. **Its Scope is the task and its Acceptance items are binding, all
  of them.** A `## REMAINING` block at its top says what already shipped and what was
  deliberately not done: do not redo a recorded deviation.
- `CLAUDE.md`: the hard rules. `tasks/README.md`: one note = one commit, done whole.
  `docs/progress.md`: the attempt ledger (approaches that failed; do not retry them).
- The sections the note lists under "Read first" (the cited sections, not whole reports).
- The shape you extend: `<path>`, `<path>`. Earlier work in this area: commits <sha>, <sha>.
- Checked against the tree on <date>: <the note's claims you re-read, and what has moved since
  the note was written>.

## Design decisions (made; do not reopen)
- <decision and why; what it rules out>
- <interface / data format / file layout / edge case>
- Owner calls this note touches: <call>. Not decided. Skip the part that depends on it.

## Working rules
- Everything runs in Docker: `./dev <cmd>`. Nothing on the host's Node, nothing installed on
  the host.
- Gate: `./dev npm run check`. Run it bare; its exit code is the verdict. Never pipe it.
  `./dev npm run check -- <package>` while iterating.
- Code, tests and docs ship together. No "tests later".
- Test-first for pure logic. Prefer invariants over transcribed outputs.
- Test integrity is absolute: never delete, skip, weaken or retarget a test or a lint to get
  green. A red test is a finding; report it.
- A new package has a `check` script in its own `package.json` and is in `package-lock.json`
  (`./dev npm install`).
- A new dependency: verify it exists and is the intended package, check its licence, install
  through `./dev npm install <pkg> -w <workspace>`.
- Never copy code from the sources flagged in `research/README.md` ("Licence flags").
- Where the note leaves a choice open, take the note's default or the simplest reversible
  option, and list it in your report as a session default.
- Scope is the note. Anything else you notice goes into your report as "out of scope: …",
  never into the change.

## Boundaries (hard)
- **Do not commit, push or create branches.** Leave the work in the tree; the orchestrator
  verifies and commits.
- **Do not delete the note and do not edit `tasks/README.md`, the owner-calls note or
  `docs/progress.md`.** The orchestrator records the outcome.
- Do not install or copy third-party skills, plugins or MCP servers.
- No secrets and no API keys in any file or command.
- Files in `git status` that are not yours belong to another session. Never revert or tidy them.
- Nothing outside this repo is edited.

## Report back (your final message)
- What was done, per Scope item and per Acceptance item, with the evidence for each.
- The gate's final exit code and the number of tests added.
- Session defaults you took. Deviations from the note and why.
- What you could not do and why. What you found that is out of scope.
- What the orchestrator must know before verification (a fixture, a server to start, a port).
```

## Fixes go back to the same agent

A finding from the review, a failed browser criterion or a missing test goes back to the
**same agent**, not into inline edits by the orchestrator and not to a fresh agent. It has the
context; a new one would rebuild it. The message is short: what failed, the evidence, what
"fixed" looks like.

Before the second attempt at the same failure, write the failed approach into the attempt
ledger in `docs/progress.md`. Two failed attempts at the same fix is a stop condition (skill
§10): no third try without a diagnosis.

If the agent died mid-task, its work is in the tree. Start a new one whose pointers include
`git diff` of the tree as it stands.
