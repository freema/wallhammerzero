# Verification: push coverage down, keep the verifier blind

Coverage belongs at the cheapest level that can carry it. A unit test runs in milliseconds in
every gate run, forever. A command you run yourself takes two minutes, once. A browser run
costs ten minutes, happens once, and is the one level that cannot be repeated cheaply. Every
rule below follows from that and from one more: **the verifier never sees the diff.**

## The ladder

| Level | Who | Carries | Cost |
|---|---|---|---|
| Tests and lints in the gate | the implementer, in the diff | rules: parsers, state transitions, determinism (hashes, goldens), formats, what data may and may not contain | ms, forever |
| Commands you run yourself | the orchestrator, through `./dev` | exit codes against fixtures, a file that must exist, a number, an HTTP status from a local server | 2 min, once |
| Looking at pixels | a sub-agent, text verdict back | whether a sheet of frames looks right (only what numbers cannot say) | minutes, once |
| Browser | a cheaper model, black box | the key flow by mouse and keyboard, state after a reload, console errors, real WebGL output | 3–10 min, once |

If a later level finds what an earlier one could have caught, the finding is a missing test, and
writing it is part of the task.

## The gate

```sh
./dev npm run check                        # the gate: every check, in Docker
./dev npm run check -- <package>           # one check, while iterating; not the gate
```

- It runs in the Docker dev container. Nothing runs on the host's Node.
- **The exit code is the verdict. Never pipe the gate.** `./dev npm run check | tail` returns
  the exit code of `tail`; a failure scrolls past and the commit lands red. To keep the output
  out of your context, redirect it to a file outside the repo (`> <file> 2>&1` keeps the exit
  code) and read the summary at its end.
- Chain the commit to it with `&&`:
  `./dev npm run check && git commit -F <message file>`. A red gate then cannot be committed.
- A new package joins the gate through a `check` script in its own `package.json`. A workspace
  without one fails the gate.
- Details: `docs/dev-environment.md`.

## Checks you run yourself

Before spawning anything. The cheapest evidence is a command's own exit code against a fixture:

```sh
# a check must FAIL on a known-bad fixture and PASS on a known-good one
./dev node packages/x/cli.mjs lint fixtures/bad;  echo "expect 1 -> $?"
./dev node packages/x/cli.mjs lint fixtures/good; echo "expect 0 -> $?"
```

For a page or an API served from a container (`./dev -p 4101 <server>`, or the studio on 4100):

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4101/api/thing
```

**Confirm that the check fails without the change.** Build the negative case as a fixture, or
revert your own edit for one run when no other session is live. A check that passes for a
reason you have not established is not evidence.

> **Reverting, stashing and restoring are changes to the working tree.** If another session is
> live in this checkout, do not do them to prove a check. A restore that races a peer's write
> breaks their work even when your bytes were right. Build a fixture instead.

**Assert on what a user would perceive:** rendered text, a pixel hash, a status code, an exit
code. Not on a serialisation that happens to contain the value.

## Graphics and animation

Containers have no GPU, so there is no headless WebGL in Docker. Two routes:

- **CPU renderers in Node, in the container:** asset generators and the CPU reference renderer
  produce pixels without a GPU. Checks compare numbers and hashes. Same parameters, seed and
  frame must give the same bytes.
- **The host browser through Chrome DevTools MCP**, for what only a GPU shows.

When an image must be looked at, the rules in `CLAUDE.md` ("Looking at images") apply: upscale
pixel art by an integer factor, tile frames into a contact sheet, never judge a GIF (only its
first frame is seen), check timing by numbers. Do it in a sub-agent and take a text verdict
back, so the screenshots do not fill the orchestrator's context.

**The owner's eye is not replaced.** Whether an asset is good is the owner's verdict in the
studio. The loop checks that it is correct (size, palette, frame count, determinism), reports
its own reading as a reading, and lists "owner approves" items as not checked.

## The blind browser pass

**When:** the note's Acceptance has something only a browser shows, and there is a surface to
open:

- the local studio at `http://127.0.0.1:4100`, once `compose.yaml` has a `studio` service
  (`./dev compose up -d studio`; stop it afterwards if you started it);
- or a page the note serves for its own check, published with `./dev -p 4101 <server>`.

**No browser surface, no browser pass.** Until the studio exists, most notes have none. Write
"Browser pass: none (no browser surface)" in the commit message, so the absence is a recorded
decision. Docs-only, tooling-only and test-only changes never need one.

**Spawn:** one sub-agent on a cheaper model, with the Chrome DevTools MCP tools.

**It gets only:**

- the acceptance criteria, reworded as observable outcomes (at most 5; aim for 2–3; the main
  scenario only);
- the URL;
- the report format below.

**It never gets:** the diff, the branch, the note, the plan, the implementer's report or this
skill. A verifier that knows how the code works stops testing the requirement and starts
confirming the code.

**Do not touch the working tree while it runs:** no edit, no `checkout`, `reset` or stash. Dev
servers reload on change; a moved tree sends a black-box tester after elements that no longer
exist. If the tree moved anyway, throw the run away and repeat it.

**A criterion for a bug fix asserts the invariant, not the symptom.** Ask what the fix
establishes, and test that.

**Report format** (the agent's final message; quote it in the commit message):

```
BROWSER <URL>
1. <criterion>: PASS|FAIL. Evidence: <what was read: text, a number, status codes>, console errors: <n>
2. …
Notes: <anything odd that is not a criterion>
```

A fixed text block, no images back. Conclusions without evidence do not count. The agent never
fixes code and never edits notes. A failed criterion goes back to the implementer; then the
**whole** pass is repeated.

## Chrome DevTools MCP: practical notes

- Load every tool you expect in **one** `ToolSearch` call.
- The agent opens its own page and closes it when done. It does not touch the owner's tabs.
- Never trigger `alert`, `confirm` or `prompt`: a modal dialog blocks the run. Warn the agent
  when the flow has a confirm.
- Prefer page snapshots and evaluated values over screenshots. Screenshots are evidence for
  appearance questions only, upscaled by an integer factor for pixel art.
- If two or three tool calls fail in a row, the agent stops and reports. "Blocked after 3
  attempts on the gallery page" is a useful result; twenty minutes of silence is not.
- Stop every server you started, and free the port.
