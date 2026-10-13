# Progress

Working state of the implementation loop (`/implement-tasks`). Read at the start of every
iteration, made current in every commit. Not a changelog: git history is the changelog. What is
next and what is blocked comes from `./dev node tools/task-queue/cli.mjs`; if this file and the
tool disagree, the tool wins. Format:
[.claude/skills/implement-tasks/references/progress-file.md](../.claude/skills/implement-tasks/references/progress-file.md).

## Now

- **In flight:** New Hope in 3D (D30): `packages/new-hope-play` is playable; the owner plays it
  and says what comes next. No queue notes for it: the owner asked to work on the game directly.
- **Last finished:** New Hope 3D first playable (2026-10-13).
- **Next:** what the owner asks for in New Hope; otherwise #18 `player-loop-test-protocol`.

## Blocked on the owner

- #22 `runtime-tilemap-scene`: OC-A2-pick (which art-spike variant wins). **Ready to answer**
  since 2026-10-07: both spikes are done, the links are in `tasks/2026-10-02-owner-calls.md`.

## Attempt ledger (failed approaches: do not retry)

- none

## Open questions for the owner

- `.claude/skills/implement-tasks/SKILL.md` has `disable-model-invocation: true`, so a session
  cannot start the skill through the Skill tool. The `/loop` the owner started on 2026-10-06 ran
  by reading `SKILL.md` and following it. Keep the flag (the session reads the file) or drop it?
