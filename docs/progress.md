# Progress

Working state of the implementation loop (`/implement-tasks`). Read at the start of every
iteration, made current in every commit. Not a changelog: git history is the changelog. What is
next and what is blocked comes from `./dev node tools/task-queue/cli.mjs`; if this file and the
tool disagree, the tool wins. Format:
[.claude/skills/implement-tasks/references/progress-file.md](../.claude/skills/implement-tasks/references/progress-file.md).

## Now

- **In flight:** nothing.
- **Last finished:** `studio-animation-player` (2026-10-07).
- **Next:** #10 `studio-verdicts` (#18, #31 and #32 are open too).

## Blocked on the owner

- #22 `runtime-tilemap-scene`: OC-A2-pick (which art-spike variant wins; asked after both art
  spikes are done).

## Attempt ledger (failed approaches: do not retry)

- none

## Open questions for the owner

- `.claude/skills/implement-tasks/SKILL.md` has `disable-model-invocation: true`, so a session
  cannot start the skill through the Skill tool. The `/loop` the owner started on 2026-10-06 ran
  by reading `SKILL.md` and following it. Keep the flag (the session reads the file) or drop it?
