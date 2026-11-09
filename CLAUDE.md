# Rules for sessions in this repo

Wallhammer Zero is a custom 3D open-world engine in C17 in which code generates all graphics. Start by reading:
1. [docs/VISION.md](docs/VISION.md): what we are building.
2. [docs/STATUS.md](docs/STATUS.md): where we are and what is open.
3. [docs/DECISIONS.md](docs/DECISIONS.md): what is decided and why.
4. [docs/ROADMAP.md](docs/ROADMAP.md): the single valid plan, milestones M0–M10.
5. [docs/CONVENTIONS.md](docs/CONVENTIONS.md): axes, units, IDs, names.
6. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, modules and their rules.
7. [docs/SETUP.md](docs/SETUP.md): machine setup (Mac, Windows).
8. [docs/EXAMPLES.md](docs/EXAMPLES.md): illustrative sketches of the main concepts. Not binding, not engine code.

## Write everything down, continuously
The owner wants everything written down: what we want to do, what we decided and what is already resolved.
- **Every owner decision** goes straight into `docs/DECISIONS.md` as a new `Dn` with a date. This also applies to a change of mind: the old decision is not deleted, only marked as superseded and linked to the new one.
- **`docs/STATUS.md`** is updated after every step: done, in progress, open questions, risks and the next step.
- **`docs/VISION.md`** changes only when the goal changes.
- **Research:** reports belong in `docs/research/`, notes for them in `docs/research/notes/<name>/`.

## Phase
The analysis is closed (D36). Next is **implementation according to [docs/ROADMAP.md](docs/ROADMAP.md)**. The first code is written on the owner's go, as task M0a. Work is tracked in Linear (project Wallhammer Zero, team Nsoft). Throwaway prototypes are not made.

## Results for the owner (D86)
The owner wants results as Claude Artifacts (private pages), written in Czech: session summaries, proposals, and later measurements and renders for approval. The repo stays the source of truth; an artifact is the way it is shown. Reference shots from other games never go into an artifact (D85).

## Code review (D83)
A phase is done only after an OpenAI model (Codex CLI) reviewed it. Run it from `scripts/review`: a clean checkout, a fixed brief, no summary or commit messages from you, raw output saved. Findings go to `review/code/<phase>.md`. You do not close a finding alone: an unfixed one goes back to the reviewer once, then to the owner (D88).

## Guards (D87, D88)
You write the code and the guards that check it. Never make a check pass by weakening it. CI computes `passes`; you do not edit it. Loosening anything in the guard paths (thresholds, fixtures, milestone commands, CI workflows, `scripts/check`, the review brief, this file) needs the owner's approval. If something cannot pass, mark the milestone item `blocked` with the reason and tell the owner.

## Language
Everything in the repository is in English: documentation, research, file and folder names, code, comments and commit messages (D78). Conversation with the owner may be in Czech.

## Tools
Nothing is installed into the system (D6). **Xcode is not used and not proposed (D35).** Tools are downloaded into `.tools/`. The only exception is Visual Studio Build Tools on the Windows PC (D75).

## Two development machines (D75)
Work happens on a MacBook M4 Pro and on a Windows PC with an NVIDIA graphics card. Work is shared only through GitHub (`freema/wallhammerzero`) and Linear. The rules are in [docs/CONVENTIONS.md](docs/CONVENTIONS.md), chapter 12.
- At the start of a session, `git pull`. At the end, commit and push.
- Switch a Linear task to In Progress before you start on it. Do not work on a task that is In Progress.
- Claude Code memory exists on one machine only. Whatever must apply everywhere, write here or into `docs/`.
- Rejected things are not proposed again: Xcode (D35), an engine for one game only (D19), Three.js or JS in the engine (D21).
- The owner gets annoyed when a thing he already rejected is proposed repeatedly. Before proposing, check `docs/DECISIONS.md`.
