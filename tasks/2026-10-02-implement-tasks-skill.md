# IMPLEMENT-TASKS SKILL FOR THIS REPO (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** M · **Depends on:** docker-dev-environment (gate command)

## Origin
D8: we adopt the owner's implementation-loop skill and run it in `/loop`. The tasks/-driven
variant is `implement-tasks` in `~/projects/nodejs/pixelforge-mcp/.claude/skills/implement-tasks/`
(SKILL.md + `references/`: implementation-brief, project-config, task-queue, verification). Its
Linear-driven sibling is `implement-spec` in `~/projects/nodejs/lustitel/.claude/skills/`. Both are
the owner's own skills, so the third-party intake rule (D13) does not apply. They use **rounds**,
which the owner abolished in alpha-frontier (one note = one task = one commit, done whole; see
`~/projects/game/godot/alpha-frontier/tasks/README.md` and `.claude/commands/do-task.md`).

## Read first
- The owner's skill and doctrine named in Origin (read them whole before adapting).
- `tasks/README.md` (the rules the skill must follow).
- `research/game-creator.md` §7.1 items 6–7 (QA loop with an attempt ledger; state documents
  that carry a session over).

## Scope
1. `.claude/skills/implement-tasks/` in this repo, adapted from the pixelforge version:
   - **no rounds:** the unit of work is one whole note; the note is deleted in its commit;
   - queue selection from the table in `tasks/README.md` (order, Gate, Depends on); skip gated
     notes;
   - the **gate command runs in Docker** (from the docker-dev-environment note), chained with `&&`
     to the commit and never piped;
   - owner calls: never decided; do everything ungated, then record the question in the
     owner-calls note;
   - follow-ups become new dated notes (or appended to an existing one), per `tasks/README.md`;
   - a blind verifier (sub-agent, criteria only, never the diff) through Chrome DevTools MCP against
     the local studio once it exists; until then "no browser surface, no browser pass";
   - the progress file `docs/progress.md` is the only state carried between iterations;
   - respects CLAUDE.md (Docker only, third-party skill rule, discuss-before-writing for new work).
2. Keep the references the skill needs and drop the Linear-, PR- and release-specific parts that
   don't apply. The repo has a private GitHub remote (D25) but no PR or CI flow: the skill
   commits locally and pushes only when the owner says so.
3. A short section in `tasks/README.md` on how to run it: `/implement-tasks`,
   `/implement-tasks <note>` and `/loop <interval> /implement-tasks`.

## Out of scope
- Writing implementation notes for the studio or the game (prepared with the owner).
- CI, PRs, releases (no remote yet).

## Acceptance
- With the docker-dev-environment note done and one tiny real note in the queue, `/implement-tasks`
  selects it, runs the Docker gate, commits with the note deleted, and leaves `docs/progress.md`
  current.
- With only gated notes left, the skill stops and reports what is blocked and on which owner call.
- The owner reviews the adapted SKILL.md (it is a workflow change, so the owner sees it before the
  first `/loop`).
