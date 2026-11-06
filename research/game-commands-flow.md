# Game commands: `/make-game`, `/continue-game`, the progress feed and the game page

*Research date: 2026-10-14. Status: proposal only.*

This is a design proposal, not a decision. Nothing here goes into `docs/DECISIONS.md` or `tasks/`
until the owner agrees in chat. Legend: **[S]** sourced (link inline or a repo path), **[O]** my
opinion, **[U]** unverified. The URLs and their dates are in [Sources](#sources).

## Summary

1. **Two commands, both run in the main session.** `/make-game <idea>` goes from an idea to a
   first playable build in the browser and then stops for the owner. `/continue-game <id> [focus]`
   makes one increment: one feature or one round of feedback, one commit, then a report, and then
   it stops. Neither command starts a Workflow on its own. Sub-agents are used only for looking
   at screenshots and for one blind verification pass. **[O]**
2. **State lives in the repo:** `games/<id>/STATE.md` (committed) plus an append-only feed file
   `build/feed/<id>.jsonl` (gitignored). The studio watches the feed the same way it already
   watches `tasks/`. **[O]**
3. **A game page in the studio, `/game/<id>`,** shows the stage and the budget, the live feed,
   the game embedded in an iframe with a postMessage bridge to its test hook, the latest
   screenshots, and every asset the game uses. It reuses the studio's existing services: the
   event hub, the watcher, `/api/files`, the review service and the task service. **[O]**
4. **Contract for a game package:**
   - a `play` block in `games/<id>/game.json`;
   - one test hook, `window.__game`, with the same verbs as the `__wz` protocol of note #18;
   - JSON action scripts;
   - a PNG `/__shot` endpoint;
   - an asset registry (`src/assets.ts`) whose entries can be rendered on their own.

   New Hope already has about half of this (`__nh`). **[S]** [packages/new-hope-play/README.md](../packages/new-hope-play/README.md)
5. **Build order:** hook first, then `/continue-game` and STATE, then the studio page, then the
   assets panel, then `/make-game`, and last the budget guard and the PixelDen port. Each step is
   small enough to judge before the next one costs anything. **[O]**

## 1. What exists today, and what this report corrects

### 1.1 The repo

- **Two kinds of game.** D10 says games are pure data played by our runtime. D30 makes New Hope
  a code game: a Vite and Three.js package, `packages/new-hope-play`, about 2.9k lines in 14
  files. The commands must handle both, and PixelDen's Phaser games are a third host.
  **[S]** [docs/DECISIONS.md](../docs/DECISIONS.md); `wc -l packages/new-hope-play/src/*.ts` = 2904.
- **New Hope's assets are invisible to the studio.**
  - The studio indexes only folders under `assets/` that contain a `gen.ts`.
  - New Hope builds its textures (`createAtlas(seed)` in `src/textures.ts`), its people and cars
    (`buildPerson`, `buildCar` in `src/models.ts`), its sky shader (`src/sky.ts`), its rain
    (`src/fx.ts`) and all of its sound (`src/audio.ts`) inside game code.
  - "Show every asset the game uses" therefore needs a registry. The current index cannot
    provide it.

  **[S]** [docs/studio.md](../docs/studio.md#what-it-reads-and-writes); `grep '^export function' packages/new-hope-play/src/*.ts`.
- **`games/<id>/` rejects files it does not know.** Any file other than `game.json`, `data/`,
  `locales/`, `scenes/`, `ui/`, `fx.json`, `audio.json` or `*.md` fails validation. A state file
  in the game folder must therefore be Markdown, and a manifest needs a schema change in
  `packages/game-data`. **[S]** [docs/game-data.md](../docs/game-data.md#the-source-layout)
- **`games/new-hope/game.json` is stale.** It still says `resolution 480×270` and
  `palette: "new-hope"` from the iso plan of D29, which D30 replaced. A manifest proposal has to
  fix it. **[S]** `games/new-hope/game.json`.
- **`__nh` is a good start, but it is ad hoc.** It has `advance(seconds)` (60 fixed steps per
  second, rendering only the last frame), `key`, `teleport`, `place`, `look`, `info()`
  (`renderer.info.render`) and game-specific getters. Missing:
  - a single state dump;
  - a screenshot to a file;
  - captured console errors;
  - a seeded reset;
  - a script runner.

  **[S]** `packages/new-hope-play/src/main.ts` L335–375.
- **Scripted play does not repeat exactly.** Gameplay calls `Math.random()` in
  `actors.ts:173`, `police.ts:83`, `fx.ts:24` and `audio.ts`. Only the city is seeded. **[S]**
  grep (verified 2026-10-14; also `fx.ts:26`, `audio.ts:51,63,70,223`, and `main.ts:283`, which
  only picks a new seed on the N key). **[O]** This is fine for audio and rain, but police spawns should take a seeded RNG,
  or an `expect` in an action script can be flaky.
- **The queue rule.** `tasks/` is the only work queue, and New Hope is deliberately *not*
  queued: the owner works on it directly. A per-game backlog would be a second queue, so the
  proposal below keeps `STATE.md` to "where we are and what is next (≤3 items)" and leaves the
  rule itself to the owner (§6, Q1). **[S]** [tasks/README.md](../tasks/README.md); [docs/progress.md](../docs/progress.md).
- **`/loop` and skills with `disable-model-invocation: true`.** A scheduled fire of such a skill
  reaches Claude "as plain text instead of executing" **[S]** (scheduled-tasks docs). This
  explains the open question in `docs/progress.md` about `implement-tasks`. If
  `/loop /continue-game new-hope` is to run, `/continue-game` must leave the flag off. **[O]**

### 1.2 Corrections to earlier research

- **`research/game-creator.md` §5.2** proposes game-creator's `/make-game` v2 shape (STATE,
  backlog, milestones, ADRs) as a good fit. Two changes **[O]**:
  - Its backlog collides with our one-queue rule.
  - ADRs duplicate `docs/DECISIONS.md`.

  Take STATE, the one-feature-per-session rule, the live-iterate verdicts
  (Verified / Off-target / Broken) and playtest-repro. Leave out the backlog and the ADRs.
  game-creator has no clear licence, so it is ideas only. **[S]** [research/README.md](README.md#licence-flags)
- **`research/studio-stack.md` §2.6** lists the hook events `PostToolUse`, `PostToolBatch`,
  `Stop`, `SessionStart` and `FileChanged`. The hooks page now lists 32 events in all [refuted 2026-10-14: the page lists 33 events (SessionStart … SessionEnd, including PostCompact, PreModelSwitch/PostModelSwitch, Elicitation/ElicitationResult)], including
  `SubagentStart` / `SubagentStop`, `TaskCreated` / `TaskCompleted`, `PreCompact` and
  `StopFailure`. It also lists five handler types (`command`, `http`, `mcp_tool`, `prompt`,
  `agent`). An http hook POSTs the event JSON; a non-2xx answer or a connection failure is a
  non-blocking error, and `onFailure: "block"` needs v2.1.295. **[S]** (hooks docs). The
  `/api/hooks/claude` idea still holds.
- **`research/studio-stack.md` §8.2 and note #30** (`studio-play-and-builds`) assume the game
  is played by `packages/player` (#18, not built yet). For a code game like New Hope, the embed
  is the game's own dev server in an iframe, not the player. The game page must handle both
  (§4.3). **[O]**
- **The cost model needs numbers.** Since 2026-10-02 [unconfirmed: the costs page gives no date for Attribution; it only says the MCP share was over-attributed before v2.1.222, so the feature predates that version], `/usage` on a subscription shows an
  **Attribution** breakdown with the share of usage per skill, per sub-agent and per MCP server,
  and **Loops** rows with per-run tokens for `/loop` tasks (v2.1.242+). A status line receives
  `rate_limits.seven_day.used_percentage` and `rate_limits.five_hour.used_percentage`.
  **[S]** (costs, statusline docs). So the cost of a command can be measured, not guessed (§2.6).
- **Workflows cannot ask the owner anything mid-run.** "No mid-run user input … For sign-off
  between stages, run each stage as its own workflow." A run that schedules more than 25 agents
  or more than 1.5 M projected tokens shows a `Large workflow` warning. **[S]** (workflows docs).
  The owner's `dev-stage-orchestration` skill works around this with stop → edit spec → resume.
  For game commands with owner gates, the main session is the better orchestrator. **[O]**

### 1.3 PixelDen prior art (the owner's working commands)

| | `/new-game` | `/game-upgrade` |
|---|---|---|
| Unit | one new game, 2.5k–5k LOC, one "hook" technique | one existing game, one commit |
| State | `tasks/new-game-ledger.md` (all 3 concepts, with rejections), `tasks/<NN>-<slug>.md` spec | `tasks/game-upgrade-ledger.md` (39 DONE, 3 TODO today; also 7 SKIP and 1 NO-ACTION rows) with a per-game run sheet |
| Owner gate | `AskUserQuestion`: pick 1 of 3 concepts | none before the build; `NO-ACTION` is allowed |
| Who codes | "Write the code yourself — subagents only for research/verification" | "no subagents for implementation" |
| Verify | typecheck/lint/test/build, then browser: zero console errors, zero 404s, a full run by synthetic input, mobile emulation, screenshots | the same, plus "Two consecutive verification failures on the same item → stop" |
| Ship | branch, `--no-ff` merge, push; release only on the owner's go | the same |

**[S]** `~/projects/nodejs/pixelden/.claude/commands/new-game.md`, `game-upgrade.md`, the ledgers.

What works, and what to keep **[O]**:
- the ledger of rejected concepts;
- one game or one change per run;
- the main session writes the code;
- a hard stop after two failures;
- an honest `NO-ACTION`.

What hurts:
- **No explicit hook.** Every run re-discovers the Phaser game by walking the React fiber from
  the canvas's parent. A generic `window.__game` removes that step from every run.
- **Owner feedback is free text inside the spec** ("Playtest round 1…1d" in
  `tasks/78-redline-pursuit.md`). It works, but nothing ties a remark to a build or a
  screenshot.

## 2. The commands

### 2.1 Where they live and how they are invoked

| Choice | Options | Recommendation |
|---|---|---|
| Format | (a) `.claude/commands/*.md`; (b) `.claude/skills/<name>/SKILL.md` | **(b)**. Commands are merged into skills, and a skill can keep supporting files: templates, the hook contract, the script schema. `$0`/`$1` give the id and the focus. **[S]** (skills docs) |
| Model invocation | `disable-model-invocation: true` or false | **false for `/continue-game`**, so `/loop` can run it ([§1.1](#11-the-repo)). **true for `/make-game`**: only the owner starts a new game. **[O]** |
| Where | project `.claude/skills/` or user `~/.claude/skills/` | **Project** for the Wallhammer versions (they know `./dev`, the gate and the studio). A user-level `game-loop` skill holds the host-agnostic parts, so PixelDen can reuse them (§5). **[O]** |
| Context injection | none, or `` !`cmd` `` blocks | Inject `cat games/$0/STATE.md`, `git status --short` and the tail of the feed. Injection runs before Claude reads the skill, and a failing command aborts the invocation, so a missing game fails fast. **[S]** (skills docs) |

### 2.2 `/make-game <idea>`: stages

One run takes an idea to a **first playable build** and stops. The owner's feedback on
2026-10-13 ("this is insufficient … I need us to work on a real game") sets the target:
something playable within the hour, with as little paperwork as possible. **[S]** memory
`build-the-game-not-papers`.

| Stage | What happens | Output | Gate |
|---|---|---|---|
| **M0 Intake** | Read the idea, `docs/DECISIONS.md` and the list of games. Write 2–3 one-line pitches, each with a hook (PixelDen's rule: one technique we do not have yet), a camera/view and a scope ceiling. Mark one as recommended. | Chat only | **Owner gate A**: pick a pitch, or "go" for the recommended one. This is the only question before code ([memory: discuss, then act](#sources)). |
| **M1 Skeleton** | `games/<id>/` (README, STATE.md, `game.json` with a `play` block), the package from the template (§4.1), the `__game` hook, `/__shot`, an empty registry, the Compose service with its port, one smoke script. | Runs at `127.0.0.1:<port>`; the gate is green | Automatic: gate + smoke script |
| **M2 Core verb** | The one thing the player does, as grey boxes, with a numeric check in a script (e.g. "after 5 s of W, the player moved > 8 m"). | First playable | Automatic: scripts + one visual sub-agent pass |
| **M3 First look** | Enough generated art and sound that the game reads: sky, one material set, one sound bed. Every asset goes into the registry. | Registry ≥ N entries, shots | Automatic: registry check + visual pass |
| **M4 Hand-off** | Commit, then update STATE.md: what plays, the controls, what to try, three candidate next steps. Report in Czech with the link and the screenshots. | Commit | **Owner gate B**: the owner plays. The run ends here. |

Budget: M1–M3 in the main session, at most one visual sub-agent per stage, at most 2 fix
attempts per failing check, then stop and report (§2.6). **[O]**

### 2.3 `/continue-game <id> [focus]`: one iteration

The shape is `implement-tasks` (orient → select → implement → verify → commit → report), with
`STATE.md` in place of the queue. **[O]**

1. **Orient.**
   - `git status`;
   - `games/<id>/STATE.md`;
   - `reviews/INBOX.md` (game assets will appear there, §4.4);
   - the tail of the feed;
   - the gate for the package (`./dev npm run check -- <pkg>`).

   A red package gate is the first job.
2. **Select one increment**, in this order:
   - the `focus` argument;
   - unanswered owner feedback (a playtest remark, a rejected asset);
   - the first item under "Next" in STATE.

   Scope triage as in game-creator's `scope-triage`: if the request is bigger than one commit,
   take the first slice and write the rest into "Next". **[S]** [research/game-creator.md](game-creator.md) §5.2.
3. **Turn the request into checks.** Vague feedback ("the car is floaty") becomes a number with a
   direction, such as yaw rate at full lock or time from 0 to 100 km/h. Write it into the action
   script first: this is playtest-repro, and PixelDen's Redline rounds 1b–1d did exactly this.
   **[S]** `tasks/78-redline-pursuit.md`.
4. **Implement in the main session.**
5. **Verify** (§2.5). If the same check fails twice, stop. Write the state into STATE.md
   ("Blocked") and into the feed, then report.
6. **Commit and update STATE.md.** The gate is chained to the commit
   (`./dev npm run check && git commit`), and STATE.md goes into the same commit.
7. **Report in Czech:**
   - what changed;
   - the evidence;
   - what only the owner can judge;
   - the next step.

   Then **stop**.

Under `/loop`, the iteration ends the loop when STATE.md says `waiting: owner` or when the budget
guard trips (§2.6). This mirrors `implement-tasks` §10. **[O]**

### 2.4 When to ask the owner

**Ask only:**
- (A) which pitch to build;
- (B) after the first playable build;
- when the request touches a recorded decision (camera, genre, art direction: D-numbers);
- when a change would alter an asset the owner approved (CLAUDE.md "Verdicts");
- when something needs a host install, a new third-party skill, or a spend above the budget;
- when the same defect fails twice.

**Never ask about:** tuning constants, file layout, which feature slice comes first, or what to
name things. Say the choice in one line. This follows the owner's memory: concept work is a
discussion, execution is action with defaults. **[S]** memory `discuss-before-writing-tasks`.

### 2.5 How a game is verified

The order matters. Numbers first, pictures last. **[S]** CLAUDE.md "Looking at images";
`godot-game-testing` §4 "Verify from state, not pixels".

1. **The package gate** (`tsc`, eslint, `vite build`), then the full `./dev npm run check`
   before the commit.
2. **Scripted play in the host browser**, one MCP call per script.
   - Chrome DevTools MCP calls `evaluate_script("__game.runScript(<json>)")`.
   - The runner lives in the page. It steps the game with `advance`, holds keys, checks
     expectations, and returns compact JSON: pass/fail per step, the state digest, console
     errors, and the paths of any shots.
   - Running the script inside the page keeps the token cost to one call instead of dozens, and
     it works in a hidden tab because `advance` does not wait for `requestAnimationFrame`.

   **[S]** New Hope README ("works in a hidden tab"); MDN rAF via
   [research/studio-stack.md](studio-stack.md) §7.5. **[O]** for the in-page runner.
3. **Performance as counts, not milliseconds.**
   - `__game.perf()` returns `renderer.info.render.calls`, `.triangles` and
     `renderer.info.memory.geometries` / `.textures`.
   - The script compares them with the budgets in the manifest.
   - Note `info.autoReset`: with bloom post-processing there are several render calls per frame,
     so the hook must reset per frame (`autoReset = false` + `reset()`) or the counts mean
     "the last pass only".

   **[S]** three.js `WebGLRenderer` docs; sakura-crossing's "count draw calls, not ms"
   ([ref-sakura-crossing.md](ref-sakura-crossing.md)).
4. **Shots.**
   - `__game.shot({name, pose, size})` renders into a `WebGLRenderTarget` and reads it back with
     `readRenderTargetPixelsAsync`, or reads the canvas with `preserveDrawingBuffer` on in the
     `?test` mode only.
   - The PNG is POSTed to a dev-only Vite plugin (`POST /__shot`) that writes
     `build/shots/<id>/<run>/<name>.png`.
   - **PNG, never JPEG** (sakura-crossing's JPEG broke pixel-exact diffs) [unconfirmed: `ref-sakura-crossing.md` L668 records the *reviewer's opinion* that JPEG artefacts make pixel-exact diffs impossible; it does not report a breakage in sakura-crossing, which writes `.jpg` at quality 0.86 and apparently lives with it].

   **[S]** three.js docs; [ref-sakura-crossing.md](ref-sakura-crossing.md) L532–539, L668.
   The pattern is MIT-licensed code, but we take the idea and write our own plugin.
5. **A visual sub-agent**, on a cheaper model, reads the shots and returns a text verdict
   against named criteria, including named *rejected* looks ("the grey-fog look the owner
   rejected must be gone"). Screenshots stay out of the main context, where each frame costs
   about 1.2k tokens for the rest of the session (the skill's figure is ~1,200 tokens for a
   1280×720 shot; other sizes differ). **[S]** `godot-game-testing` §5;
   `dev-stage-orchestration` "Spec writing rules".
6. **One blind browser pass per iteration that changes behaviour**, as `implement-tasks` §6.4
   already does: the verifier gets only the acceptance criteria and the URL, never the diff.
   **[S]** [.claude/skills/implement-tasks/SKILL.md](../.claude/skills/implement-tasks/SKILL.md).
7. **What only the owner can judge** ("is it fun", the music) is reported as **not checked**.

### 2.6 Keeping the cost bounded

Facts:
- The 2026-10-02 run used 27 agents, about 5 M sub-agent tokens and 20 % of the weekly usage,
  and the owner judged the result low-quality. **[S]** memory `no-big-workflows-without-cost`.
- Sub-agents and workflow agents each send their own requests. A large session also costs on
  every turn, through cache reads of the whole history. **[S]** (costs docs).

Rules **[O]**:

| Lever | Rule |
|---|---|
| Who works | The main session implements. At most **2 sub-agents per iteration**: one visual observer and one blind verifier, both on `model: sonnet`, set explicitly ([sub-agents docs](#sources): `model` takes `sonnet`, `opus`, `haiku`, `fable`, a full id or `inherit`). |
| Retries | At most 2 fix attempts per failing check. Then stop, record it in STATE and the feed, and hand back (PixelDen and `implement-tasks` both use this rule). |
| Scope | One increment = one commit. `/continue-game` never chains into the next iteration by itself; `/loop` does, and only when the owner started it. |
| Workflows | Never from these commands. If the owner asks for parallel work (for example "5 asset variants"), state agents × tokens first and wait for a go. |
| Context | `/clear` between iterations under `/loop` is not possible from inside the loop. Keep each iteration's reading list short: STATE, the feed tail, and only the files the increment touches (the README of `new-hope-play` maps files to systems). |
| Measure | After the first 3 runs, read `/usage` → Attribution for the skill's share and set the per-run budget from data. |
| Guard (optional) | The status line receives `rate_limits.seven_day.used_percentage` **[S]**. A status-line script writes it to `.studio-cache/usage.json`, and the command reads it at the start and before the verification step. It stops when the weekly use exceeds a ceiling the owner sets, or when the run itself has used more than its budget. This is a change to the owner's settings, so it is an owner call. |

**Estimate [U]:** if 5 M sub-agent tokens ≈ 20 % of a week, then 1 % ≈ 250 k tokens. One New
Hope-sized iteration (≈900 changed lines, as in `cd3edde`) in the main session plus 2 small
sub-agents is plausibly 1–3 % of a week. With the owner's "20–30 % this week" that is about 8–15
iterations. Treat this as a guess until `/usage` attribution confirms it.

## 3. The progress feed

### 3.1 Format and location

| Option | How | For | Against |
|---|---|---|---|
| (a) File feed | The command appends JSONL lines to `build/feed/<id>.jsonl`, and the studio watches the file | Works without the studio; replayable; no new config | Claude must remember to write each line |
| (b) HTTP hooks | `PostToolBatch` / `Stop` / `SubagentStart` / `SubagentStop` http hooks POST to `127.0.0.1:4100/api/hooks/claude` | Automatic and exact timing | Settings change (owner call); lost when the studio is down (non-blocking error **[S]**); no *meaning* (it does not know "stage M2 started") |
| (c) Derived only | The studio derives progress from `git log` and file changes | Zero effort | Too coarse: one commit per iteration |

**Recommendation: (a) as the source of truth, optionally plus (b) for "Claude is working"
activity.** **[O]**

Location:
- `build/` is gitignored and is already the root `/api/files` resolves under. **[S]**
  `.gitignore`; [docs/studio.md](../docs/studio.md#the-server).
- `games/<id>/` cannot hold a `.jsonl` file (validation, §1.1).
- `.studio-cache/` is the studio's own derived data and should keep one writer.
- The committed history stays in `STATE.md` and the commit messages.

How a line is written:
- with a host `printf … >> build/feed/<id>.jsonl`. Plain shell, nothing installed, so D16 is
  kept (**[O]**: worth confirming with the owner);
- or with `./dev npm run game -- feed <id> …`. Cleaner, but a Docker start per event costs
  seconds.

### 3.2 Event schema (`wz.feed/1`)

```json
{"v":1,"at":"2026-10-14T10:02:11Z","run":"cg-20261014-1002","game":"new-hope","cmd":"continue-game",
 "type":"check","stage":"verify","status":"fail","title":"police: arrest after 3 s",
 "detail":"arrest()=0.41 after 3.0 s, expected ≥ 1","refs":{"script":"play/police.json","shots":["build/shots/new-hope/cg-20261014-1002/arrest.png"]}}
```

`type` takes one of these values:
- `run-start` (with the focus and the budget);
- `stage`;
- `step` (a free-text progress line, at most about 1 per minute);
- `check` (gate, script, perf or visual: `status` pass/fail and numbers);
- `shot`;
- `asset` (a registry entry added or changed, with its hash);
- `commit` (hash and title);
- `ask-owner` (the question with options and a recommendation; STATE.md goes to
  `waiting: owner`);
- `blocked`;
- `budget` (usage read);
- `run-end`.

Rules:
- one line per event, append-only, at most 2 KB per line;
- `run` ids are sortable, so the page can group lines by run;
- the studio ignores a malformed line and shows it as `unreadable`;
- the file is truncated to the last 2,000 lines on `run-start`.

**[O]**

### 3.3 `games/<id>/STATE.md` (committed)

A fixed skeleton:
- **Status** (`building` / `waiting: owner` / `blocked`);
- **Plays now** (5–10 lines);
- **Controls and how to test**;
- **Last owner feedback** (quoted, dated, with the commit it was given on);
- **Next** (≤3 items, explicitly not a queue);
- **Rejected** (looks and ideas the owner rejected, so later runs do not re-propose them; the
  role of PixelDen's ledger);
- **Budgets** (perf counts, the bundle size).

The docs check could verify the skeleton, as it does for task notes. **[O]**

## 4. The studio game page

### 4.1 What the game package must provide (the contract)

| Piece | Options | Recommendation |
|---|---|---|
| **Manifest** | (a) a `play` block in `games/<id>/game.json`; (b) a separate `packages/<pkg>/wz-game.json`; (c) the package's `package.json` | **(a)**: one home per game. The studio's `/games` (note #30) already lists `games/` [refuted 2026-10-14: no `/games` route exists; `packages/studio/app/routes.ts` has only `/`, `/gallery`, `/tasks` and `/asset/*`. Note #30 *proposes* `/games` and `/play/:game`; it is not built], and the gate validates the block. It needs a schema change in `@whz/game-data`, which also fixes the stale iso fields. **[O]** |
| **Test hook** | (a) per-game names (`__nh`); (b) one `window.__game` with the verbs of #18's `__wz` | **(b)**, and keep `__nh` as an alias. Code games and data games then share one protocol and one script runner. #18 already specifies `describe`, `step`, `setSeed`, `command`, `runScript`, `shot`. **[S]** `tasks/2026-10-02-player-loop-test-protocol.md` |
| **Asset registry** | (a) `src/assets.ts` listing pure builders; (b) a scan of the source code for `CanvasTexture` and friends; (c) a runtime dump only | **(a) + a runtime check.** Each entry names a pure builder `(params, seed) → texture / mesh / AudioBuffer`. `__game.assets()` reports which registry ids the running game used, and the smoke script fails if the game uses an asset that is not registered. **[O]** |
| **Action scripts** | JSON in the package, or TS | **JSON** in `packages/<pkg>/play/*.json`, the #18 format (steps, keys, `advance`, `expect`, `shot`). Every feature commit adds or extends one. **[O]** |
| **Dev-only plugin** | — | `POST /__shot` and `POST /__export` in `vite.config.ts` with `apply: 'serve'`. Names are sanitised and files are written only under `build/shots/<id>/` and `build/games/<id>/assets/`. **[O]**; the pattern comes from sakura-crossing **[S]** |

The `play` block:

```json
"play": {
  "kind": "code",                       // "code" (own package) or "data" (our player, #18)
  "package": "packages/new-hope-play",
  "service": "newhope", "port": 4200,   // ./dev compose up <service>
  "url": "http://127.0.0.1:4200/?test=1",
  "hook": "__game",
  "scripts": "play/",
  "registry": "src/assets.ts",
  "budgets": { "drawCalls": 900, "triangles": 1500000, "bundleKb": 1200, "textures": 64 }
}
```

The numbers are placeholders: measure New Hope first. **[U]**

`window.__game` v1 (a superset of today's `__nh`):

| Method | Returns / does |
|---|---|
| `describe()` | Compact JSON: a coordinate-system note (`"y up, metres"`), seed, mode, player pose, vehicle, job, heat, psi, counts of nearby entities. ≤1 KB, as in godot-game-testing's `_mcp_state` cap **[S]**. |
| `reset(seed?)` | Fresh state for a seed. Also seeds the gameplay RNG (the `Math.random` calls of §1.1). |
| `advance(seconds)`, `key(code, down)`, `pointer(dx, dy)` | Exist today (except `pointer`). |
| `scenario(name)` | Puts the game in a named state ("in a cruiser at 3 stars"), the godot-game-testing "set the scene before you test it" idea **[S]**. |
| `runScript(json)` | Runs a whole action script in the page; stops at the first failed expectation or console error. |
| `shot(opts)` | PNG through `/__shot`; returns the path. |
| `perf()` | Per-frame `renderer.info` counts plus the bundle's chunk sizes, if known. |
| `errors()` | Console errors and unhandled rejections captured since load (the PixelDen `errs.js` idea, built in). |
| `assets()` | Registry ids used now, with counts. |
| `exportAssets(ids?)` | Renders registry entries one by one (texture → PNG; model → an 8-angle turntable strip PNG; sound → WAV through `OfflineAudioContext`) and POSTs them to `/__export`, which writes `build/games/<id>/assets/<asset>/` with a `meta.json` holding the hash. |

### 4.2 The page: `/game/<id>` (and `/games`)

Layout, top to bottom on one screen **[O]**:

1. **Header:** title, status from STATE.md (`building`, `waiting: owner`, `blocked`), the current
   run and stage, the budget read (`budget` events), and the last commit.
2. **Play pane:** an iframe of `play.url`, with buttons that go through a postMessage bridge to
   the hook:
   - Reset (seed);
   - Run script ▾ (the list from `play/`);
   - Shot;
   - Pause/advance;
   - Perf.

   The `describe()` text is shown next to the iframe and refreshes every second while it is
   visible.
3. **Feed:** the timeline of the current run, folded per run, with check rows coloured
   pass/fail and shots inline as thumbnails (integer-scaled from `/api/files/build/shots/…`).
   An `ask-owner` event is pinned at the top until STATE.md leaves `waiting: owner`.
4. **Assets:** one card per registry entry, grouped by kind (textures, models, sounds and music,
   FX/shaders, sky):
   - a texture shows its PNG;
   - a model shows its turntable strip, with a scrub bar over the strip;
   - a sound has a play button for its WAV;
   - each card shows "used in the last run: yes/no" from `assets()`.

   Verdict buttons (approve / reject / comment) as on asset cards today.
5. **Owner feedback box:** a free-text remark tied to the current commit and an optional shot.
   It is written by the studio into `reviews/games/<id>/feedback.json` and appears in
   `reviews/INBOX.md`, where `/continue-game` picks it up at step 2. This replaces "paste
   feedback into chat" for remarks the owner makes while playing. **[O]**

### 4.3 Which existing studio services are reused

| Need | Reuse | New work |
|---|---|---|
| Live updates | `events` hub; add the topic `games` to `TOPICS` in `server/services/events.ts` **[S]** | Payloads: `feed` (new lines), `state` (STATE.md changed), `assets` (an export landed) |
| Watching files | `watcher.ts` (a stat-snapshot poll, robust on the Docker bind mount), like the second watcher on `tasks/` **[S]** | A third instance on `build/feed/`, `build/shots/`, `build/games/*/assets/` and `games/*/STATE.md` |
| Serving shots and exports | `files` / `safe-path.ts`: everything is under `build/`, which is already the output folder **[S]** | Nothing |
| Verdicts on game assets | `reviews.ts`: atomic, append-only, hash-bound, INBOX generator **[S]** | Generalise the asset id to `game:<id>/<asset>`. The file goes to `reviews/games/<id>/<asset>.json`, because `games/<id>/` rejects unknown files and `assets/` is for `gen.ts` programs. The INBOX gets a "Games" section. |
| Task from a rejection | `tasks.ts` (exclusive create, queue row) **[S]** | Only if the owner wants game work in `tasks/` (Q1). Otherwise "Reject" writes to `feedback.json`, which `/continue-game` reads. |
| Animation player | 2D only (`@whz/runtime`, one WebGL context per page) **[S]** | Not reused for 3D. Turntable strips are PNGs, so no extra WebGL context is needed. The only live 3D is the game iframe, which has its own context. |
| Builds | not built yet (`services/jobs` proposed in #30) | `/game/<id>` shows a "Build web" button only once #30 exists. Out of scope here. |

**The iframe is cross-origin.** `127.0.0.1:4100` and `127.0.0.1:4200` differ in port, so they
are different origins and the studio cannot call `iframe.contentWindow.__game` directly. A
bridge is needed:
- the game, in `?test=1`/`?embed=studio` mode, listens for `message` events and checks
  `event.origin === "http://127.0.0.1:4100"`;
- the studio posts with an exact `targetOrigin`.

MDN: "Always specify an exact target origin, not `*`", and "always verify the sender's
identity". **[S]** (MDN postMessage, 2026-09-04). The Host check and write guard of the studio
are unaffected, since the iframe only GETs from another port. **[O]** Embedding the game in the
studio adds one WebGL context to the studio page; the studio's own previews use one more. The
practical cap is about 16 per page. **[S]** [docs/studio.md](../docs/studio.md#the-player).
**[U]** whether a cross-origin iframe is counted against the same cap in Chrome.

### 4.4 Data games

When `play.kind` is `"data"`, the play pane embeds the studio's own `/play/<id>` from note #30.
`__game` is then the player's `__wz` (same verbs), and the asset panel lists the `assets/`
entries the game's data references, through the existing index. The page is the same, with a
different source. **[O]**

## 5. PixelDen

The same skeleton fits PixelDen's two commands **[O]**:

- **Add a `window.__game` to PixelDen's shared Phaser layer** (`app/games/shared/`), exposing
  `describe`, `advance` (through Phaser's loop step, or `scene.sys.sceneUpdate` as in Gloop's
  harness notes), `key`, `errors` and `shot` (`game.renderer.snapshot` → PNG). Every
  `/game-upgrade` run would stop re-discovering the game through the React fiber.
  **[S]** `~/.claude/skills/code-pixel-game/references/harness.md`; `game-upgrade.md` §6.
- **Keep PixelDen's ledgers** (they are its STATE), and add the feed file and a run id.
- **Keep the repo-specific parts in each repo's command:** PixelLab, i18n, SEO, merge/push in
  PixelDen; Docker, the gate, the studio and verdicts in Wallhammer. Put the shared protocol (the
  hook verbs, the script format, the feed schema, the two-failures rule, the sub-agent policy)
  into one user-level skill that both commands read. **[O]**
- **Wrapping for desktop and mobile** is another agent's topic (`research/multiplatform.md`
  plus this run). The manifest's `play` block is where a later `targets` field (`web`,
  `desktop`, `mobile`) would go.

## 6. What this means for us

- **New Hope:**
  - Rename and extend `__nh` into `__game` (`describe`, `reset`, `runScript`, `shot`, `perf`,
    `errors`, `assets`).
  - Seed the gameplay RNG.
  - Add `/__shot`.
  - Write two smoke scripts: on foot (roof → lift → street) and in a car (board → fly → land on
    the job pad).
  - Fix `game.json`.

  That is one evening's increment, and every later `/continue-game` run gets cheaper because of
  it.
- **Wallhammer:**
  - `/continue-game` replaces the ad-hoc "owner says, session builds" loop New Hope uses now.
    Its state is `games/<id>/STATE.md` plus the feed, and its verification is scripts and
    numbers first, shots through a sub-agent.
  - The studio gets one page per game. Owner feedback comes back through the studio
    (`feedback.json` → INBOX), like asset verdicts do now.
- **PixelDen:** the same hook and feed would remove the fiber walk and make the "Playtest round
  N" sections traceable to builds.

## 7. Incremental build order

Each step ends in one commit with the gate green. The owner looks before the next step.
Sizes are **[O]** guesses.

| # | Step | Size | Proves |
|---|---|---|---|
| 1 | **Hook v1 in New Hope**: `__game` (+ the `__nh` alias), seeded gameplay RNG, `/__shot` PNG plugin, `runScript`, 2 smoke scripts; fix `game.json` | S–M | Scripted play costs one MCP call; shots land as files |
| 2 | **`/continue-game` v1** (project skill) + `STATE.md` + the feed file (host `printf`) + the stop rules. Run it 2–3 times on New Hope with the owner; read `/usage` attribution | S | The loop and its real cost per iteration |
| 3 | **Studio `/game/<id>` v1**: header, feed (topic `games`), iframe + postMessage bridge, shots strip; `play` block in the `game-data` schema | M | The owner watches a run live |
| 4 | **Asset registry + `exportAssets` + the assets panel**, verdicts as `game:<id>/<asset>` with an INBOX section, and the feedback box | M | Every texture, model and sound is visible and can be judged |
| 5 | **`/make-game`**: M0–M4 with a package template extracted from New Hope (hook, plugin, registry, scripts, Compose service), tried on one tiny game | M | An idea → a playable build in one run |
| 6 | **Budget guard** (status line → `usage.json`) and optional http hooks for activity; both are owner settings calls | S | Hard ceilings instead of rules in prose |
| 7 | **PixelDen port**: `window.__game` in `app/games/shared/`, the feed, the shared user-level skill | M | One protocol across both repos |

## 8. Open questions for the owner

1. **Queue rule:** may a game keep its own "Next" list in `games/<id>/STATE.md` (≤3 items,
   not a queue)? Or must agreed game work become `tasks/` notes? *Recommendation:* STATE.md, and
   amend `tasks/README.md` to say so, because New Hope is already worked outside the queue.
2. **`/loop` over `/continue-game`:** may it run unattended (one increment per tick, stopping at
   `waiting: owner` or at the budget)? Or only on an explicit `/continue-game` each time?
   *Recommendation:* explicit runs first; `/loop` after the cost per run is measured.
3. **Budget:** what weekly-usage ceiling should stop a run (for example 60 % used), and how much
   may one run use (for example 3 %)? Should the status-line guard be installed (it is a settings
   change)?
4. **Where owner feedback lives:** in a `feedback.json` written by the studio (traceable to a
   commit and a shot), or in chat as today? *Recommendation:* both, with the studio box for
   remarks made while playing.
5. **Asset verdicts for code games:** use `reviews/games/<id>/…` as the new studio-owned
   location? Should approved New Hope assets get the "never change without consent" rule from
   CLAUDE.md?
6. **Writing feed lines with a host `printf >>`:** is that acceptable under "nothing runs on the
   host", or should it go through `./dev` (slower)?
7. **PixelDen:** should its `/new-game` and `/game-upgrade` adopt the shared hook and feed now,
   or after the Wallhammer version proves itself?

## Sources

Web (accessed 2026-10-14; the code.claude.com pages carry no date but reference Claude Code up
to v2.1.295):
- Claude Code skills (commands merged into skills, frontmatter, `$ARGUMENTS`, `` !`cmd` ``): https://code.claude.com/docs/en/skills
- Claude Code hooks (32 events, http handler fields, failure semantics): https://code.claude.com/docs/en/hooks
- Claude Code sub-agents (frontmatter, `model` values, spawn depth): https://code.claude.com/docs/en/sub-agents
- Claude Code costs (`/usage` attribution and Loops rows, sub-agent and workflow usage): https://code.claude.com/docs/en/costs
- Claude Code status line (`rate_limits.*.used_percentage`, `cost.total_cost_usd`): https://code.claude.com/docs/en/statusline
- Claude Code dynamic workflows (no mid-run input, `Large workflow` at >25 agents or 1.5 M tokens, size guidelines): https://code.claude.com/docs/en/workflows
- Claude Code scheduled tasks (`/loop`, and skills with `disable-model-invocation` reaching Claude as text): https://code.claude.com/docs/en/scheduled-tasks
- Claude Code `/goal` (evaluator model, turn/time clauses): https://code.claude.com/docs/en/goal
- Claude Code tools reference (Monitor tool): https://code.claude.com/docs/en/tools-reference
- three.js `WebGLRenderer` (`info`, `autoReset`, `preserveDrawingBuffer`, `readRenderTargetPixelsAsync`; r163+ docs): https://threejs.org/docs/pages/WebGLRenderer.html
- MDN `Window.postMessage` (last modified 2026-09-04): https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage

Repo and local (read 2026-10-14):
- `CLAUDE.md`, `docs/DECISIONS.md`, `tasks/README.md`, `docs/progress.md`, `docs/studio.md`, `docs/game-data.md`
- `.claude/skills/implement-tasks/SKILL.md`
- `packages/studio/server/services/events.ts`, `packages/studio/app/routes.ts`, `compose.yaml`
- `packages/new-hope-play/README.md`, `packages/new-hope-play/src/main.ts`, `games/new-hope/`
- `tasks/2026-10-02-player-loop-test-protocol.md`, `tasks/2026-10-02-studio-play-and-builds.md`, `tasks/2026-10-02-studio-concept-pages.md`
- `research/game-creator.md` (2026-10-02; game-creator licence unclear: ideas only), `research/studio-stack.md` (2026-10-02), `research/ref-sakura-crossing.md` (sakura-crossing code is MIT; we take the `__shot` idea only), `research/ref-threejs-punk.md`
- The owner's skills: `~/.claude/skills/dev-stage-orchestration/` (SKILL.md, template), `~/.claude/skills/code-pixel-game/` (SKILL.md, `references/harness.md`), `~/.claude/skills/godot-game-testing/SKILL.md`
- PixelDen: `~/projects/nodejs/pixelden/.claude/commands/new-game.md`, `game-upgrade.md`, `tasks/new-game-ledger.md`, `tasks/game-upgrade-ledger.md`, `tasks/78-redline-pursuit.md`
- The owner's memory notes for this project: `no-big-workflows-without-cost`, `build-the-game-not-papers`, `discuss-before-writing-tasks`, `implementation-halted-state`

Licences of code recommended for borrowing: none is copied. three.js is MIT (already a
dependency). All hook, plugin and runner code proposed here is to be written from scratch.

## Verification (2026-10-14)

Adversarial fact-check by a second agent: 24 claims picked for their weight in the decisions
above, each checked against the live docs page or the actual files. Inline marks:
`[refuted 2026-10-14: …]` and `[unconfirmed]`.

**Confirmed (against files in this repo, `~/projects/nodejs/pixelden` and `~/.claude/skills`):**
- `packages/new-hope-play/src/*.ts` = 14 files, 2,904 lines (`wc -l`).
- `createAtlas(seed)` in `textures.ts:261`, `buildPerson` (`models.ts:40`), `buildCar`
  (`models.ts:123`), `createSky` in `sky.ts`; rain in `fx.ts`; sound in `audio.ts`.
- `window.__nh` at `main.ts:336–375` with `advance` (60 steps/s, `frame(1/60, i === n-1)` renders
  only the last step), `key`, `teleport`, `place`, `look`, `info` = `renderer.info.render`.
  README L52–53: "works in a hidden tab".
- `Math.random` sites (see the inline note in §1.1).
- `games/new-hope/game.json` has `resolution 480×270` and `palette: "new-hope"`;
  `docs/game-data.md` L28–38: only `game.json`, `data/`, `locales/`, `scenes/`, `ui/`, `fx.json`,
  `audio.json`, `*.md`; "Any other file is a validation error".
- `docs/studio.md` L82: assets are "every folder with a `gen.ts`, and `assets/palettes/`";
  L117: "about sixteen [WebGL contexts] per page"; `/api/files` is bound to `config.outDir`
  (`services/index.ts:121`, `safeResolve`). `build/` and `.studio-cache/` are in `.gitignore`.
- `events.ts:14`: `TOPICS = ["assets", "tasks"]`. `watcher.ts` is a stat snapshot poll; the
  second watcher on `tasks/` is `services/index.ts:110`. `reviews.ts`: atomic write, append-only,
  hash-bound, INBOX generator. `tasks.ts`: exclusive create (`wx`).
- `compose.yaml:44–49`: service `newhope`, `127.0.0.1:${WHZ_NEWHOPE_PORT:-4200}:4200`.
- Note #18 (`tasks/2026-10-02-player-loop-test-protocol.md` L30–36): `__wz` with `describe`,
  `step`, `setSeed`, `command`, `runScript`, `shot` (PNG, never JPEG).
- `implement-tasks` SKILL.md: §6 item 4 (blind browser pass, "never gets the diff"); §10 ends the
  loop; §12 `/loop` mode. `docs/progress.md` L27–28: the open question about
  `disable-model-invocation: true`.
- `tasks/README.md` L111, L120: New Hope is "worked on directly with the owner", outside the queue.
- `research/README.md` L58: game-creator has no LICENSE file (README says MIT, package.json ISC);
  skill intake: DO_NOT_INSTALL. `research/game-creator.md` §5.2 has STATE, backlog, milestones,
  ADRs, scope-triage, live-iterate (Verified / Off-target / Broken), playtest-repro.
- `research/studio-stack.md` §2.6 lists exactly the five hook events named; §8.2 proposes
  `services/render` and `/__shot`.
- Memory `no-big-workflows-without-cost`: 27 agents, ~5 M sub-agent tokens, 4.5 h, "20 %
  of the weekly usage", "low-quality work". Memory `build-the-game-not-papers`: the 2026-10-13 quotes.
- PixelDen: `.claude/commands/new-game.md` (2.5k–5k LOC, one hook technique, 3 concepts via
  `AskUserQuestion`, "Write the code yourself — subagents only for research/verification", two
  consecutive failures → stop) and `game-upgrade.md` (§6 React-fiber walk from the canvas's
  parent, `NO-ACTION`, "Two consecutive verification failures on the same item → stop").
  `tasks/game-upgrade-ledger.md` table rows: 39 DONE, 3 TODO, 7 SKIP, 1 NO-ACTION.
  `tasks/78-redline-pursuit.md`: "Playtest round 1 (2026-10-13)" with rounds 1b, 1c, 1d, each
  stated as numbers (bounce 0.3 → 0.15, `CORNER_GRIP` 1.3 → 1.7, 81 → 66 km/h).
  `app/games/shared/` exists (14 files).
- Owner skills: `code-pixel-game/references/harness.md` L48 (fiber walk), L76 (swap
  `scene.sys.sceneUpdate`), L19 (`game.renderer.snapshot()`); `godot-game-testing` §2 "Set the
  scene before you test it", §4 "Verify from state, not pixels", `_mcp_state()` "~1 KB cap", §5
  screenshots out of the main context (~1,200 tokens per 1280×720 frame);
  `dev-stage-orchestration` "Spec writing rules" and stop → edit spec → resume.

**Confirmed (web, fetched 2026-10-14):**
- Hooks docs: five handler types (`command`, `http`, `mcp_tool`, `prompt`, `agent`); http non-2xx
  and connection failure are non-blocking; `onFailure: "block"` "Requires Claude Code v2.1.295
  or later"; `SubagentStart/Stop`, `TaskCreated/Completed`, `PreCompact`, `StopFailure` listed.
- Costs docs: Attribution (skills, subagents, plugins, MCP servers), Loops rows with per-run
  tokens, "Requires Claude Code v2.1.242 or later"; "every subagent, and every agent a dynamic
  workflow spawns, sends its own requests"; long context re-read at the cached rate each turn.
- Statusline docs: `rate_limits.five_hour.used_percentage`, `rate_limits.seven_day.used_percentage`,
  `resets_at`, `cost.total_cost_usd`.
- Workflows docs: "No mid-run user input … For sign-off between stages, run each stage as its own
  workflow"; `Large workflow` warning at more than 25 agents or a projected 1.5 million tokens.
- Scheduled-tasks docs: a `/loop` fire of a skill with `disable-model-invocation: true` (and of
  built-in commands such as `/clear`) reaches Claude "as plain text instead of executing".
- Sub-agents docs: `model` takes `sonnet`, `opus`, `haiku`, `fable`, a full model id, or
  `inherit`; spawn depth default three layers.
- Skills docs: commands merged into skills; `$0`/`$1`/`$ARGUMENTS`; `` !`cmd` `` runs before the
  skill content is sent and "A failed command aborts the entire skill invocation".
- three.js `WebGLRenderer` docs: `info.autoReset` + `info.reset()` for multi-pass frames;
  `readRenderTargetPixelsAsync(renderTarget, x, y, w, h, buffer, …) : Promise<TypedArray>`;
  `preserveDrawingBuffer` option; the page says WebGL 1 is unsupported since r163 and names no
  revision.
- MDN `postMessage`: "last modified on Sep 4, 2026"; "Always specify an exact target origin, not
  `*`"; "always verify the sender's identity using the `origin` and possibly `source`".

**Refuted (corrected inline):**
- §1.2: the hooks page lists 33 events, not 32.
- §4.1: the studio has no `/games` page; note #30 proposes it. `routes.ts` has `/`, `/gallery`,
  `/tasks`, `/asset/*` only.

**Unconfirmed (marked inline):**
- §1.2: "Since 2026-10-02" for `/usage` Attribution: the docs give no date.
- §2.5: "sakura-crossing's JPEG broke pixel-exact diffs" is the reviewer's opinion in
  `ref-sakura-crossing.md`, not a recorded breakage.
- §2.6 estimate (1 % ≈ 250 k tokens; 1–3 % per iteration) and §4.1 budgets: author's own [U].
- §4.3: whether a cross-origin iframe's WebGL context counts against the parent page's cap.

**Gaps that matter for the decision:**
- The report never states which Phaser major PixelDen runs. `~/projects/nodejs/pixelden/package.json`
  says `"phaser": "^4.0.0"`, but the installed `node_modules/phaser` is 3.90.0 (stale install or
  lock). Whether `game.renderer.snapshot`, `scene.sys.sceneUpdate` and the harness notes hold on
  Phaser 4 was not checked. Resolve before step 7 (PixelDen port).
- three.js in `new-hope-play` is `^0.180.0`; the report cites the generic docs page, not
  r180-specific behaviour of `readRenderTargetPixelsAsync` with `WebGLRenderTarget` in a
  post-processed scene. Measure before relying on it for `shot()`.
- `advance(seconds)` steps gameplay without rAF, but the `__nh` object exposes no console-error
  capture or screenshot: the report is right that these are missing, so "one MCP call per script"
  is a plan, not an observed cost.
- No source for the "practical cap of 16 WebGL contexts" beyond `docs/studio.md`'s own statement;
  Chrome's real limit varies by version and GPU.
- The report's queue-rule reading (STATE.md "Next" is not a second queue) is an interpretation
  of `tasks/README.md`; the README's text does not address per-game lists at all. Owner call (Q1).
