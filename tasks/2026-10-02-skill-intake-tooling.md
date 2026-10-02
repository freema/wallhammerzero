# SKILL INTAKE TOOLING: SKILLSPECTOR IN DOCKER (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** docker-dev-environment

## Origin
D13: third-party skills must pass a validator before adoption. D16: Docker only. On 2026-10-02
the main session ran NVIDIA SkillSpector v2.12.0 by hand in Docker against game-creator. The
result and triage are in `research/scans/2026-10-02-game-creator/TRIAGE.md`; the procedure
proposal is in `research/skill-validation.md`. This note makes that repeatable.

## Read first
- `research/skill-validation.md` §1 (how SkillSpector works, the LLM stage and data egress,
  limitations and false positives) and §4.2 (the proposed intake procedure).
- `research/scans/2026-10-02-game-creator/TRIAGE.md` and
  `research/scans/2026-10-02-procedural-pixel-creatures/TRIAGE.md` (two real triages: what the
  false positives look like).

## Scope
1. A Compose service (or `tools/skill-intake/` script) that builds SkillSpector from tag `v2.12.0`
   (commit `c7958a3268d9498644b22edb75d0f051bbc8cbfc`, digest-pinned Dockerfile) and runs
   `scan … --no-llm --fail-on-incomplete` with `--network none` by default. One command scans a
   given local path and writes JSON + Markdown reports.
2. An intake folder (e.g. `security/skill-intake/`) holding:
   - a short procedure: quarantine clone pinned to a SHA → licence check → scan → TP/FP triage of
     every HIGH/CRITICAL with a written reason → owner approval → registry entry;
   - `registry` (name, source URL, commit SHA, tree hash, scanner version, verdict, approval date);
   - our own baseline of accepted findings with reasons (never the skill author's baseline).
3. Move the two scans of 2026-10-02 into that structure as the first registry entries:
   game-creator (verdict: **not installed; ideas only**) and procedural-pixel-creatures (not a
   skill; a reference repo, **ideas only**; never run its Windows launcher).
4. Re-scan triggers documented: upstream change, scanner upgrade, before any copy.

## Out of scope
- The LLM stage (`claude_cli`) and any network egress: scans are offline and static-only (D27).
- CI (no remote yet).

## Acceptance
- `./dev`-style single command scans a path in Docker, with no host installs and no network,
  and its exit code reflects the findings.
- Re-running on the pinned game-creator clone reproduces the 2026-10-02 counts (skills: 121
  findings, 31 HIGH, 0 CRITICAL).
- The registry has the game-creator entry, and the procedure is linked from CLAUDE.md.
