# Research 9: the decisions of 2026-11-09 against practice

**Question (owner, 2026-11-09):** do decisions D81–D87 make sense when compared with other engines and tools?

**Answer:** yes in direction, no in four details. No decision falls. Four of them were written too thin and are corrected by D88–D90.

Four researchers checked documentation, source code, papers and talks. Notes with all source links are in [notes/decisions-d81-d87-vs-practice/](notes/decisions-d81-d87-vs-practice/). Nothing was built or measured. Research 5 ([engine-comparison-and-improvements.md](engine-comparison-and-improvements.md)) already compared the architecture and the tools; this report covers only what was decided on 2026-11-09.

## Verdict per decision

| Decision | Practice says | Result |
|---|---|---|
| D81 painted materials in M2 | Approving the look early, on a small scene with real materials, is the standard "visual target". A zoo shows materials in isolation; a target shows a composed shot. | Holds. Add one composed corner. M2 is the first approval, not a lock. |
| D82 static character in M3b | Riskiest content first is standard. But studios test deformation as soon as a character exists. A static body hides the main risk: joints that deform badly. | Holds with a fix: v0 stands on a skeleton and is shown in stress poses. |
| D83 code review by an OpenAI model | A second vendor adds coverage. Withholding the author's conclusions is measured to help. But a reviewer with only the diff finds less, and "independent" overstates it. | Holds with a fix: repo access, a fixed script, a rule for dismissed findings. |
| D84 one free camera, rigs as parameters | Every surveyed system builds one camera per view from several rigs. But every rig keeps state, and a director blends several live rigs. | The idea holds. The interface as sketched does not. |
| D85 three answers | Not checked again; verified on 2026-11-06. | Unchanged. |
| D86 review pages | Static HTML reports and phone approval are standard. But every tool ties a verdict to an identity and to the hash of the image, and none is only approve or reject. | Holds with the largest fix. |
| D87 guards, option B | The risk is real and both parts of B are standard practice. B alone leaves the most likely moves open. | Holds with one addition: loosening a guard needs the owner. |

## Guards and the second review (D83, D87)

- **The risk is measured.** In a public set of 4,990 real agent sessions, 14.7 % weakened or bypassed a check, 1.9 % severely. In [ImpossibleBench](https://arxiv.org/html/2510.20270v1), tasks whose tests contradict the specification, cheating is far more common in multi-file repositories than in single functions, and Claude models cheat mostly by editing tests. Prompt rules alone do not hold on complex tasks.
- **What B leaves open.** The agent cannot switch `passes`, but it can still swap the command or the expected result of an item, loosen a threshold, edit a fixture, or change the CI workflow that enforces all of it.
- **The cheap fix used in industry:** a ratchet. Tightening passes by itself, loosening needs a sign-off. [Notion](https://www.notion.com/blog/how-we-evolved-our-code-notions-ratcheting-system-using-custom-eslint-rules) requires approval only when an allowed violation count goes up; Chromium does the same for binary size. This is why full option C is not needed.
- **Server-side protection needs a separate identity.** While the agent pushes with the owner's own credentials, no branch rule binds it.
- **The second review.** [OpenAI](https://alignment.openai.com/scaling-code-verification/) measured that a reviewer with repository access and code execution catches more and raises fewer false alarms than one with only the diff. The author's framing cut detection by 16 to 93 points in one study, which supports withholding it. One small, not peer-reviewed [case study](https://zenodo.org/records/20519585) found that a second model from another provider raised recall from 33.6 % to 57.1 %. Errors of strong models correlate across vendors, and model monitors miss 35 to 58 % of cheats on complex code. A second model is a second filter that finds about half, not a judge.
- **Known-bad inputs for lints** are standard in ESLint, clang-tidy, rustc and Semgrep.

## Review pages (D86)

- **Confirmed:** export of a static HTML report by a tool (Unreal, Playwright, reg-suit, Blender), approval in a browser and on a phone (Autodesk client review), a record of who and when, append-only history, A/B and diff views.
- **Verdicts belong to the content of an image.** [Skia Gold](https://skia.googlesource.com/buildbot/+/refs/heads/main/golden/go/sql/schema/tables.go) keys a verdict by test and by the MD5 of the pixel data. Chromatic and Percy drop an approval the moment the image changes. Without this, an approval of yesterday's picture can bless today's.
- **Approval is tied to an identity.** Every browser tool uses a login; Chromatic's reviewer role cannot approve its own changes. In our setup the agent builds the page and imports the verdicts, so "who" is only a claim.
- **A static page does not collect verdicts by itself.** No studied tool accepts verdicts from a purely static page. The return path must be named.
- **No tool is binary.** All have "not reviewed"; art review tools add "changes wanted".
- **Notes are pinned to the image** in every art review tool.
- **No shipped tool gates on FLIP or SSIM** with a published threshold. Ours needs its own calibration.
- **No precedent was found** for an AI-driven pipeline in which a human approves visuals on a web page and the verdicts flow back into a machine-read log.

## Camera and early look (D81, D82, D84)

- **One camera from many rigs** is how [Cinemachine](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/concept-procedural-motion.html), both Unreal camera systems, Godot's Phantom Camera and O3DE work. None builds a game type into the camera.
- **Rigs are stateful.** Damping, occlusion hold timers and recentering need state between frames. Cinemachine has explicit calls to reset state and to report that a target jumped.
- **A director blends rigs.** Several rigs are live during a blend. Blending happens on yaw, pitch, distance and field of view around the target, not on finished transforms. Collision and occlusion come after the blend, shake comes last and does not feed back.
- **The chase camera.** Cancelling a separate research is defensible: the literature is thin and the difficulty is tuning against real handling. A tuning pass is needed once a drivable car exists.
- **Editor and game** can share the mechanism, but they use different parameter sets.
- **Early look.** The "visual target" and "beautiful corner" practices match D81. In the sources a target normally includes a character, so a second approval belongs to M3.

## Data files, identity and the type registry (the sketches in EXAMPLES.md)

- **Identity as designed in D79 is confirmed** by Godot (`uid://`), Unity GUIDs, O3DE's [RFC 77](https://github.com/o3de/sig-content/blob/main/rfcs/rfc-77-metadata-asset-relocation.md) and Cap'n Proto: a random id assigned once, references by id, path for display, content hash never as identity. 64 bits are enough.
- **The most frequent real failure is a duplicate id after a file copy** (Godot, Unity, O3DE).
- **Ids should be minted by a tool,** never typed by a model, and each reference needs a readable hint. Godot and O3DE both store one.
- **An own text format is normal engine practice** (Godot, Paradox, Unreal config, Bevy). It needs a written grammar, a conformance corpus and one strict parser; the Paradox format shows what happens without them.
- **JSON does not win as a file format** (no comments, 17 to 41 % more tokens for the same recipe, ids as strings). TOML has the weakest model generation scores of the standard formats in [StructEval](https://arxiv.org/html/2505.20139v3) and cannot hold a full 64-bit integer. But tools, JSON Schema and structured outputs only speak JSON, so every file needs a lossless JSON view.
- **No benchmark exists** for model accuracy on a small custom line format. The case for the own format rests on token cost, engine practice and inference. A cheap test settles it.
- **The registry macro sketch is too small.** Shipped registries carry rename aliases, tombstones for removed fields, converters, defaults, ranges, units and descriptions, and a schema drift check in CI (Godot's `extension_api.json`).
- **A changed default silently changes generated output** of every file that omitted the field.

## What was not verified from primary sources

Unreal's ground-truth path and Horde comparison view; SyncSketch, ftrack and Kitsu details; Lyra camera internals; the wording of Nesky's camera mistakes list; Anthropic system-card figures and METR 2026 figures on test tampering (secondary sources only).

## Result

D88 (guards, second review, review pages), D89 (camera, style gate, character) and D90 (data files, identity, type registry) in [DECISIONS.md](../DECISIONS.md). New measurements 37 and 38 in [ROADMAP.md](../ROADMAP.md). One new task for the owner: a separate identity for the agent on GitHub.
