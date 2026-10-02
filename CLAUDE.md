# CLAUDE.md

## Project

**Wallhammer Zero** is a studio + generator for games written entirely by an AI. A Claude Code
session in this repo is the generator: it writes code, graphics, music and game data as files.
The studio is a local web app where the owner sees and verifies the results.

There are two game types:
- **Kairosoft-style 2D pixel-art sims**: first.
- **Voxel games**: later, also rendered as pixel art.

Status: foundation only, no code yet. The queue for the whole studio and engine is in `tasks/`
(D23): the studio MVP and the art spikes first, then the engine, audio, the rest of the studio
and the wrappers. The first real game is parked by the owner (D26): don't ask about it.

Read in this order: [docs/DECISIONS.md](docs/DECISIONS.md) → [tasks/README.md](tasks/README.md) →
[research/README.md](research/README.md). Where ideas come from and how others do it:
[docs/references.md](docs/references.md).

## How we work

- **Language:** everything in the repo is English (code, docs, task notes, commits). Talk to the
  owner in Czech.
- **Discuss before writing plans.** Task notes, plans and decisions are written only for what the
  owner agreed to in chat. Your own ideas go to the owner as proposals (options + recommendation),
  never straight into `docs/DECISIONS.md` or a new queue of tasks.
- **`tasks/` is the only work queue.** Rules are in [tasks/README.md](tasks/README.md). Owner calls are
  never decided by a session.
- **Everything runs locally in Docker. Install nothing on the host:** no Node or Python upgrades, no
  global npm/brew tools. Claude Code itself runs on the host. A genuine exception (e.g. Xcode for
  iOS builds) is an owner call.
- **Third-party skills** (anything not from `anthropics/skills`, and not the owner's own) are never
  installed or copied before a skillspector scan, triage and owner approval. Reading them for ideas
  is fine.
- **Licences before borrowing.** Research found code that must not be copied; the list is in
  [research/README.md](research/README.md#licence-flags). Check the licence of anything new before
  copying even a snippet.

## Product rules (from docs/DECISIONS.md)

- **Graphics are code:** programs compute the pixels. No image-generation models, and SVG is not the
  asset format.
- **The studio shows all assets, above all animations and FX.** The owner's verdicts are written back
  into the repo. The studio can create task notes and trigger builds.
- **Games use web tech:** TypeScript, our own runtime on WebGL, wrapped for desktop and mobile. A
  Godot player may come later for consoles, so **games are pure data** and the player is swappable.

## Looking at images (practical limits; see research/code-graphics.md)

- Small images are unreliable to judge. **Upscale pixel art by an integer factor** (nearest
  neighbour) and tile frames into a contact sheet before reading a PNG.
- An animated GIF shows only its first frame. Inspect animation as a strip or sheet of frames, plus
  numeric checks for timing.
- Prefer checking state and numbers over screenshots. Run screenshot-heavy checks in a sub-agent
  and get a text verdict back.

## Verification

Not defined yet. Task `tasks/2026-10-02-docker-dev-environment.md` defines the gate command (run in
Docker) and fills in this section.
