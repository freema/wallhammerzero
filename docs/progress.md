# Progress

Working state of the implementation loop (`/implement-tasks`). Read at the start of every
iteration, made current in every commit. Not a changelog: git history is the changelog. What is
next and what is blocked comes from `./dev node tools/task-queue/cli.mjs`; if this file and the
tool disagree, the tool wins. Format:
[.claude/skills/implement-tasks/references/progress-file.md](../.claude/skills/implement-tasks/references/progress-file.md).

## Now

- **In flight:** nothing.
- **Last finished:** `implement-tasks-skill`, `skill-intake-tooling`, `asset-kit-core` and
  `repo-docs-check` (2026-10-02), built in parallel and integrated on the `implementation` branch.
- **Next:** #5 `asset-render-cli` (#16 `sim-core` is open too).

## Blocked on the owner

- #22 `runtime-tilemap-scene`: OC-A2-pick (which art-spike variant wins; asked after both art
  spikes are done).

## Attempt ledger (failed approaches: do not retry)

- none

## Open questions for the owner

- Review `.claude/skills/implement-tasks/SKILL.md` before the first `/loop`. It was adapted from
  the pixelforge `implement-tasks` skill and changes how work is done here (no rounds, the
  Docker gate, the queue tool). A single `/implement-tasks` run is a good first look.
