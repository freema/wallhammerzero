# Progress

Working state of the implementation loop (`/implement-tasks`). Read at the start of every
iteration, made current in every commit. Not a changelog: git history is the changelog. What is
next and what is blocked comes from `./dev node tools/task-queue/cli.mjs`; if this file and the
tool disagree, the tool wins. Format:
[.claude/skills/implement-tasks/references/progress-file.md](../.claude/skills/implement-tasks/references/progress-file.md).

## Now

- **In flight:** nothing. Wave 1 of New Hope (#36, #37, #38) is done and committed; the owner
  looks at it in the studio before anything else starts (no next wave without the owner).
- **Last finished:** `nh-characters-vehicles` (2026-10-13).
- **Next:** #39 `nh-city-mockup`, then #18 `player-loop-test-protocol` (#26–#29, #31 and #32
  are open too).

## Blocked on the owner

- #22 `runtime-tilemap-scene`: OC-A2-pick (which art-spike variant wins). **Ready to answer**
  since 2026-10-07: both spikes are done, the links are in `tasks/2026-10-02-owner-calls.md`.

## Attempt ledger (failed approaches: do not retry)

- none

## Open questions for the owner

- `.claude/skills/implement-tasks/SKILL.md` has `disable-model-invocation: true`, so a session
  cannot start the skill through the Skill tool. The `/loop` the owner started on 2026-10-06 ran
  by reading `SKILL.md` and following it. Keep the flag (the session reads the file) or drop it?
