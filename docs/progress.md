# Progress

Working state of the implementation loop (`/implement-tasks`). Read at the start of every
iteration, made current in every commit. Not a changelog: git history is the changelog. What is
next and what is blocked comes from `./dev node tools/task-queue/cli.mjs`; if this file and the
tool disagree, the tool wins. Format:
[.claude/skills/implement-tasks/references/progress-file.md](../.claude/skills/implement-tasks/references/progress-file.md).

## Now

- **In flight:** New Hope wave 1 (D28, D29), started 2026-10-13 as a small workflow of three
  agents with the owner's go: #36 `nh-building-kit`, #37 `nh-characters-vehicles`, #38
  `nh-city-generator`. The agents write files only; the main session checks each result, runs
  the gate and commits one note per commit.
- **Last finished:** `art-spike-voxel` (2026-10-07, committed 2026-10-13).
- **Next:** #39 `nh-city-mockup` after wave 1, then #18 `player-loop-test-protocol` (#26–#29,
  #31 and #32 are open too).

## Blocked on the owner

- #22 `runtime-tilemap-scene`: OC-A2-pick (which art-spike variant wins). **Ready to answer**
  since 2026-10-07: both spikes are done, the links are in `tasks/2026-10-02-owner-calls.md`.

## Attempt ledger (failed approaches: do not retry)

- none

## Open questions for the owner

- `.claude/skills/implement-tasks/SKILL.md` has `disable-model-invocation: true`, so a session
  cannot start the skill through the Skill tool. The `/loop` the owner started on 2026-10-06 ran
  by reading `SKILL.md` and following it. Keep the flag (the session reads the file) or drop it?
