# Progress

Working state of the implementation loop (`/implement-tasks`). Read at the start of every
iteration, made current in every commit. Not a changelog: git history is the changelog. What is
next and what is blocked comes from `./dev node tools/task-queue/cli.mjs`; if this file and the
tool disagree, the tool wins. Format:
[.claude/skills/implement-tasks/references/progress-file.md](../.claude/skills/implement-tasks/references/progress-file.md).

## Now

- **In flight:** nothing.
- **Last finished:** `implement-tasks-skill` (2026-10-02): the loop itself, the queue tool and
  this file.
- **Next:** #3 `skill-intake-tooling` (then #4 `asset-kit-core` and #15 `repo-docs-check`, which
  are open too).

## Blocked on the owner

- #22 `runtime-tilemap-scene`: OC-A2-pick (which art-spike variant wins; asked after both art
  spikes are done).

## Attempt ledger (failed approaches: do not retry)

- none

## Open questions for the owner

- Review `.claude/skills/implement-tasks/SKILL.md` before the first `/loop`. It was adapted from
  the pixelforge `implement-tasks` skill and changes how work is done here (no rounds, the
  Docker gate, the queue tool). A single `/implement-tasks` run is a good first look.
