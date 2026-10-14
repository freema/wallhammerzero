# tasks/: the one work queue

Same doctrine as the owner's alpha-frontier project (D8).

- **`ls tasks/` is the queue.** Every piece of pending work is one dated note
  (`YYYY-MM-DD-topic.md`). Pending work lives nowhere else.
- **One note = one task = one commit, done whole.** Code, tests and the docs it changes ship
  together. There are no "rounds" and no "tests later" notes.
- **A note you cannot finish whole is the wrong note.** Split it before starting. If you run out
  of session, add a `## REMAINING <date>` block naming exactly what is left.
- **Lifecycle:** written → executed whole → **deleted in the same commit.** The outcome lives in
  the commit message and the docs the task changed. History:
  `git log --diff-filter=D --name-only -- 'tasks/*.md'`.
- **Follow-ups:** work a task *surfaces* but doesn't cover becomes a new dated note plus a queue
  row, in the same commit. If a note on that topic exists, append to it instead.
- **Owner calls are never decided by a session.** They live in the owner-calls note: do
  everything the call doesn't gate, then ask with options + recommendation. Answered calls move to
  [docs/DECISIONS.md](../docs/DECISIONS.md).
- **New notes only for agreed work.** Implementation notes are prepared together with the owner;
  a session does not invent a backlog (see CLAUDE.md).
- **Half-finished work gets finished.** If `git status` shows someone's unfinished note, read the
  diff, adopt it and deliver the rest.
- **The studio may create notes** (D8): a rejected asset becomes a note (**Create task…** on
  the asset page, [docs/studio.md](../docs/studio.md#task-notes)). It follows this format and
  takes a queue row; `/tasks` in the studio lists the queue. A session edits and deletes such
  a note like any other.

## Running the queue

The `implement-tasks` skill ([.claude/skills/implement-tasks/](../.claude/skills/implement-tasks/SKILL.md))
is the loop that works through this queue. In a Claude Code session in this repo:

| Command | What it does |
|---|---|
| `/implement-tasks` | Takes the next note (the first row whose gate is open and whose dependencies are done), delivers it whole, runs the gate in Docker and commits with the note deleted. Then it reports and stops. |
| `/implement-tasks <note>` | The same for one note: `#12`, a file name or a topic (`sim-core`). A gated note is not started. |
| `/loop <interval> /implement-tasks` | Unattended, e.g. `/loop 45m /implement-tasks`: one note per tick. It ends when the queue is empty or every remaining note waits for the owner, and reports which owner call blocks what. |

- Which note is next, without starting anything: `./dev node tools/task-queue/cli.mjs`.
- The loop commits locally and never pushes. It never decides an owner call.
- [docs/progress.md](../docs/progress.md) is the only state it carries from one iteration to the
  next: what is in flight, what failed and must not be retried, what waits for the owner.

## Note format

```markdown
# <TITLE IN CAPS> (YYYY-MM-DD)

**GATE:** <owner call or none> · **Priority:** P1–P3 · **Size:** S/M/L · **Depends on:** <notes or none>

## Origin
<why this exists: the decision, conversation or finding it comes from>

## Read first
<the research sections and references behind the note: how others do it, and why we chose this>

## Scope
<numbered list of everything the task delivers>

## Out of scope
<what it deliberately does not do>

## Acceptance
<checks a session can run or observe>
```

## Queue

The order is the priority: a session takes the first note whose gate is open and whose
dependencies are done. The studio MVP and the art spikes (#1–#14, D22) go first; the rest of the
studio and the engine follow (D23). The gate checks this table against the notes in `tasks/`,
and every note against the format above ([docs/docs-check.md](../docs/docs-check.md)).

**A row number is never given twice.** A finished note takes its row with it, so the line
under the table (`queue:last-number`) keeps the highest number ever given. A new row takes the
tool's `NEW ROW NUMBER` and writes that number into the line, in the same commit. The gate fails
when a row is above the line or the line is missing.

| # | Note | Gate | Depends on |
|---|---|---|---|
| 0 | [Owner calls](2026-10-02-owner-calls.md) | owner answers | none |
| 18 | [Player: game loop, host API, test protocol](2026-10-02-player-loop-test-protocol.md) | none | #17, #6 |
| 19 | [Runtime text and UI](2026-10-02-runtime-text-ui.md) | none | #18, #5 |
| 20 | [Runtime input](2026-10-02-runtime-input.md) | none | #19 |
| 21 | [FX emitters](2026-10-02-fx-emitters.md) | none | #19, #5 |
| 22 | [Runtime tilemap and scene](2026-10-02-runtime-tilemap-scene.md) | OC-A2-pick | #18, #20 |
| 23 | [Player saves](2026-10-02-player-saves.md) | none | #18 |
| 25 | [Runtime audio](2026-10-02-runtime-audio.md) | none | #24, #18 |
| 26 | [Studio: concept pages](2026-10-02-studio-concept-pages.md) | none | #10, #9 |
| 27 | [Studio compare: before/after, library regression, lineup](2026-10-02-studio-compare.md) | none | #10, #9 |
| 28 | [Studio: live generators with sliders](2026-10-02-studio-params-sliders.md) | none | #9, #10 |
| 29 | [Studio audio: music review + SFX board](2026-10-02-studio-audio.md) | none | #24, #10 |
| 30 | [Studio: play a game and trigger builds](2026-10-02-studio-play-and-builds.md) | none | #18, #8 |
| 31 | [Studio: voxel model inspector](2026-10-02-studio-voxel-inspector.md) | none | #12, #9 |
| 32 | [Sim conformance on QuickJS](2026-10-02-sim-conformance-quickjs.md) | none | #17 |
| 33 | [Desktop wrapper](2026-10-02-desktop-wrapper.md) | none | #30, #23 |
| 34 | [Mobile wrapper](2026-10-02-mobile-wrapper.md) | none (iOS build: OC-B4) | #30, #25, #23 |
<!-- queue:end (the studio inserts new rows above this line) -->
<!-- queue:last-number #41 (the highest row number ever given: a new row takes the next one and writes it here) -->

### The queue by track

| Track | Notes |
|---|---|
| Infrastructure | all done: #1 Docker ([docs/dev-environment.md](../docs/dev-environment.md)), #2 the implement-tasks skill ([Running the queue](#running-the-queue)), #3 skill intake ([security/skill-intake/README.md](../security/skill-intake/README.md)), #15 docs check ([docs/docs-check.md](../docs/docs-check.md)) |
| Graphics from code | #21 FX emitters (#13 + #14 art spikes are done, OC-A2-pick is ready: [assets/spike-a/README.md](../assets/spike-a/README.md), [assets/spike-b/README.md](../assets/spike-b/README.md), [assets/spike-c/README.md](../assets/spike-c/README.md), [assets/STYLE.md](../assets/STYLE.md); #4 asset kit is done: [packages/asset-kit/README.md](../packages/asset-kit/README.md), [packages/det/README.md](../packages/det/README.md); #5 render CLI is done: [docs/asset-pipeline.md](../docs/asset-pipeline.md), [docs/looking-at-images.md](../docs/looking-at-images.md); #12 voxel baker is done: [packages/voxel-kit/README.md](../packages/voxel-kit/README.md)) |
| Engine | #18 player + test protocol, #19 text and UI, #20 input, #22 tilemap, #23 saves, #32 conformance (#6 sprite core is done: [packages/runtime/README.md](../packages/runtime/README.md); #17 game package is done: [docs/game-data.md](../docs/game-data.md), [packages/game-data/README.md](../packages/game-data/README.md); #16 sim core is done: [docs/sim.md](../docs/sim.md), [packages/sim/README.md](../packages/sim/README.md)) |
| Audio | #25 runtime audio, #29 studio audio (#24 synth core is done: [docs/audio.md](../docs/audio.md), [packages/audio/README.md](../packages/audio/README.md)) |
| Studio | #26 concept pages, #27 compare, #28 sliders, #29 audio, #30 play and builds, #31 voxel inspector (#7 skeleton, #8 live reload, #9 player, #10 verdicts and #11 task from rejection are done: [docs/studio.md](../docs/studio.md)) |
| Shipping | #30 web build, #33 desktop, #34 mobile |
| New Hope (D28, D30) | played and built with the owner in `packages/new-hope-play` (D30 replaced the iso notes #39–#41); done: #36 building kit, #37 characters and cars (iso assets, kept as references), #38 city generator ([games/new-hope/README.md](../games/new-hope/README.md), [packages/citygen/README.md](../packages/citygen/README.md)) |

Packages the queue creates: `det`, `asset-kit`, `voxel-kit`, `runtime`, `sim`, `game-data`,
`player`, `audio`, `studio`, `citygen` and `new-hope-play` (New Hope), `shell-desktop`, `shell-mobile` (all under `packages/`). The example
game `games/examples/counter-shop/` grows with each engine note and is the test bed for all of
them.

### Not in the queue (and why)

- **The rest of New Hope** (D28, D30): worked on directly with the owner in
  `packages/new-hope-play`, one increment per `/continue-game new-hope` run; its next steps
  are in [games/new-hope/STATE.md](../games/new-hope/STATE.md), not here.
- **The first Kairosoft sim** (OC-A6, parked): not queued until the owner agrees on it.
- **Steam, signing, stores, iOS builds:** wait for OC-B2 and OC-B4. **CI** is not set up; the
  repo is private on GitHub (D25).
- **A free-camera voxel game, live 3D voxels:** later (D15), and OC-D2 for such a game.
- **A Godot player and consoles:** later (D10).
- **Claude Code run from the studio:** later maybe (D5, D27).
