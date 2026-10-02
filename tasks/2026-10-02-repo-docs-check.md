# REPO DOCS CHECK: LINKS, QUEUE AND INDEXES STAY TRUE (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** docker-dev-environment

## Origin
`research/README.md`, conclusion 4: agent knowledge bases drift from the repo within days
(sakura-crossing, Threejs-Punk). It already happened here: on the day the docs were written, the
report count was stale in three files. A check must compare the docs with the repo
automatically.

## Read first
- `research/ref-threejs-punk.md` §5.3 (the AGENTS.md + docs/techniques pattern, the seven drift
  cases, machine-checkable frontmatter, a `docs:check` script).
- `research/ref-sakura-crossing.md` §1.7 (what keeps 56k agent-written lines alive).

## Scope
1. `tools/docs-check` (Node, no dependencies), part of `npm run check`:
   - every relative Markdown link in `CLAUDE.md`, `README.md`, `docs/**`, `tasks/**` and
     `research/README.md` resolves, including `#anchors`;
   - every backticked repo path in `CLAUDE.md`, `README.md` and `docs/**` exists (task notes
     are exempt, because they name files that do not exist yet);
   - **queue consistency:** every note in `tasks/` has exactly one row in the Queue table of
     `tasks/README.md` and every row has a note; each note has the header line (GATE, Priority,
     Size, Depends on) and the sections of the note format; the `queue:end` marker exists;
   - **research index:** every report in `research/*.md` and every folder in `research/scans/`
     has a row in `research/README.md`;
   - **ids:** decision ids in `docs/DECISIONS.md` are unique and ascending; every `D<n>` and
     `OC-…` mentioned in `tasks/` and `docs/` exists in `docs/DECISIONS.md` or in the
     owner-calls note;
   - every `./dev npm run <script>` named in `CLAUDE.md` and `docs/**` is a real npm script.
2. One rule added to CLAUDE.md: if the docs and the code disagree, the code wins, and the doc is
   fixed in the same commit.

## Out of scope
- Technique docs with frontmatter (`files`, `entry`, `constants`): added when the first
  `docs/techniques/` page exists.
- Checking prose claims or the long research reports.

## Acceptance
- `./dev npm run check` runs the docs check and passes on the repo as it is.
- Fixture tests: a broken link, a note without a queue row, a queue row without a note and an
  unknown decision id each fail with the file and line.
