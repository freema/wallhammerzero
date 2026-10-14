---
name: continue-game
description: "One increment of a game under games/<id>: orient from games/<id>/STATE.md, pick one change (the focus argument, the owner's feedback, or the first Next item), turn it into checks, build it in the main session, verify with the gate and scripted play through window.__game, commit with STATE.md updated, report in Czech, stop. Run as /continue-game <id> [focus]."
argument-hint: "<game-id> [focus]"
disable-model-invocation: true
---

# continue-game: one increment of a game

Arguments: `$ARGUMENTS`. The first word is the game id (a folder `games/<id>/` with a
`STATE.md`); the rest, if any, is the **focus**. Without an id, take the only game that has a
`STATE.md`; if there are several, list them and stop.

**One run = one increment = one commit**, then a report, then stop. Never chain into the next
increment. The owner plays between runs, and the owner's playtest is the verdict: checks that
pass are not quality.

## Limits (cost is the owner's)

- The main session builds. **At most 2 sub-agents** per run, both `model: sonnet`: one that
  reads the shots, and one blind verifier when the change is behaviour the owner will feel.
- **No Workflow.** If the increment seems to need parallel work, stop and propose it with the
  cost (agents × tokens).
- **The same check fails twice: stop.** Set STATE's status to `blocked`, say what failed and
  what was tried, report.
- Read only what the increment touches: STATE.md, the package README (it maps files to
  systems), then those files.

## 1. Orient

1. `git status --short` and `git log --oneline -5`. Changes you did not make belong to someone
   else: do not touch, stash or commit them.
2. `games/<id>/STATE.md`: status, how to run, the last owner feedback, Next, Rejected, Budgets.
3. `reviews/INBOX.md` if the increment touches assets (CLAUDE.md "Verdicts").
4. The package gate: `./dev npm run check -- <package>`. **Red is the first job**, before any
   new work.

## 2. Select one increment

In this order:
1. the **focus** argument;
2. the owner's feedback not yet answered (STATE's "Last owner feedback", the chat);
3. the first item under **Next**.

If it is bigger than one commit, take the first slice that plays, and write the rest into Next.
Never re-propose what STATE lists under **Rejected**. Say the choice in one line, do not ask.

**Ask the owner instead of building** only when the increment changes a recorded decision
(camera, genre, look: a D-number), changes an approved asset, needs a host install, a new
third-party skill or a settings change, or when the focus is ambiguous between two very
different games. Then set status `waiting: owner`, give the options with a recommendation,
and stop.

## 3. Checks first

Turn the request into numbers with a direction before writing code: vague feedback ("the car
is floaty") becomes a measurable state (yaw rate at full lock, seconds from 0 to top speed).
Write it into an action script in the package's `play/` folder, or add steps to an existing
one, and note the expected value. The script language is in the package README
(`runScript`). A visual-only change gets named criteria for the shot reader instead
("the fog band between levels 3 and 6 is visible; the sky stays saturated").

## 4. Build

In the main session, in the style of the files around it. Graphics stay code. Determinism
holds where the package already has it (seeded gameplay randomness, the fixed step). Keep the
package README and `docs/games/` true: if the code changes something they say, fix them in
the same commit.

## 5. Verify, numbers before pictures

1. The package gate again.
2. **Scripted play in the host browser.** Make sure the dev server answers (STATE's "How to
   run"; check with `curl -s -o /dev/null -w '%{http_code}' <url>`, start it in the background
   only if it does not). Open the game on the script's seed in a fresh tab (the DevTools MCP or
   Claude in Chrome), then one call per script:
   `async () => await __game.runScript("<name>")`. Run every script in `play/`, not only the
   new one. A failing script is a failing check.
3. **Counts:** `__game.perf()` on the Budgets view, compared with STATE's Budgets. A budget
   that is exceeded is a failing check unless the increment is worth it; then say so and
   update the budget in STATE.
4. **Shots** only when the look changed: `__game.shot(name)` writes
   `build/shots/<id>/<name>.png`. One sonnet sub-agent reads them against the named criteria
   and STATE's Rejected, and returns a text verdict. Shots do not go into the main context.
5. **Blind verifier** (optional, behaviour changes only): a sonnet sub-agent gets the URL, the
   controls and the acceptance criteria, never the diff, and reports what it saw.
6. What only the owner can judge (feel, fun, sound, the look in motion) is reported as
   **not checked**, never as passed.

## 6. Commit

Update `games/<id>/STATE.md` first, in the same commit:
- **Status** (`building`, `waiting: owner` or `blocked`) and the date;
- **Plays now**: what the increment added, in a line;
- **Next**: at most three items, the done one removed; this is not a queue;
- **Budgets**: new measured numbers;
- **Last owner feedback** is only ever the owner's own words, quoted and dated.

Then the full gate chained to the commit:

```sh
./dev npm run check && git add <files> && git commit -m "<Game>: <what changed>"
```

Never pipe the gate through `tail` or `grep`. Commit only your own files. Do not push.

## 7. Report in Czech, then stop

Short:
- **Co je nového**: what plays differently, and the commit;
- **Důkazy**: scripts passed, the numbers before and after, the shot verdict;
- **Neověřeno**: what only the owner can judge, and how to try it (the URL, the keys);
- **Další krok**: the first Next item, or the question for the owner.

Until STATE's Budgets records a measured cost per run, end by asking the owner to read
`/usage` and say what the run cost.
