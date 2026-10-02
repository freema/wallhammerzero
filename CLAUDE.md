# CLAUDE.md

## Project

**Wallhammer Zero** is a studio + generator for games written entirely by an AI. A Claude Code
session in this repo is the generator: it writes code, graphics, music and game data as files.
The studio is a local web app where the owner sees and verifies the results.

There are two game types:
- **Kairosoft-style 2D pixel-art sims**: first.
- **Voxel games**: later, also rendered as pixel art.

Status: the Docker dev environment and the gate exist
([docs/dev-environment.md](docs/dev-environment.md)); no engine or studio code yet. The queue for
the whole studio and engine is in `tasks/` (D23): the studio MVP and the art spikes first, then
the engine, audio, the rest of the studio and the wrappers. The first real game is parked by the
owner (D26): don't ask about it.

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
  never decided by a session. The loop that works through the queue is the `/implement-tasks`
  skill; its state between iterations is [docs/progress.md](docs/progress.md).
- **If the docs and the code disagree, the code wins, and the doc is fixed in the same commit.**
  The gate compares the docs with the repo (links, backticked paths, the queue, the research
  index, decision ids, npm script names): [docs/docs-check.md](docs/docs-check.md).
- **Everything runs locally in Docker. Install nothing on the host:** no Node or Python upgrades, no
  global npm/brew tools. Claude Code itself runs on the host. A genuine exception (e.g. Xcode for
  iOS builds) is an owner call.
- **Third-party skills** (anything not from `anthropics/skills`, and not the owner's own) are never
  installed or copied before a skillspector scan, triage and owner approval. Reading them for ideas
  is fine. The procedure, the scan command and the registry of what was scanned:
  [security/skill-intake/README.md](security/skill-intake/README.md).
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
- **For an asset: lint first, then the review sheets, never the raw sprite.**
  `./dev npm run asset -- lint <id>`, then `./dev npm run asset -- review <id>` and Read the
  images in `build/review/<id>/`. The measured limits (nothing is seen at 1x, 4x is the minimum,
  Read resamples images over 2000 px) and how to read each view:
  [docs/looking-at-images.md](docs/looking-at-images.md).

## Verification

The gate is one command, run from the repo root:

```sh
./dev npm run check
```

- It runs every check of the repo in the Docker dev container and exits 0 only if all passed.
  A fresh clone or worktree needs nothing else first: `./dev` installs dependencies by itself.
- **The exit code is the verdict. Never pipe the gate** through `tail` or `grep`; chain with
  `&&` (`./dev npm run check && git commit ...`).
- Every command goes through `./dev <cmd>` (Node 24 in Docker); nothing runs on the host's Node.
  `./dev npm run check -- <package>` runs one check while iterating; only the full run is the
  gate.
- A new package joins the gate by having a `check` script in its own `package.json`. The root
  script is never edited for that.
- Asset programs (`assets/`), `packages/det`, `packages/asset-kit`, `packages/voxel-kit` and
  `packages/sim` are under the **determinism lint** (`tools/lint/determinism.js`): no
  `Math.random`, clocks or float `Math`; use `@whz/det`. The asset contract is in
  [packages/asset-kit/README.md](packages/asset-kit/README.md); voxel models and the iso baker
  are in [packages/voxel-kit/README.md](packages/voxel-kit/README.md); the sim contract (ticks,
  commands, digests, replays) is in [docs/sim.md](docs/sim.md).
- The renderer is `packages/runtime` (also under the determinism lint): the host passes the time
  and the rectangle, the runtime has no frame loop, and the CPU backend is the reference for
  the WebGL2 one. The contract and the browser parity check
  (`window.__runtime.parity()` on its dev page) are in
  [packages/runtime/README.md](packages/runtime/README.md).
- The studio (`packages/studio`) is the Compose service `studio`: `./dev compose up studio`,
  then `http://127.0.0.1:4100` (`WHZ_STUDIO_PORT=<port>` in front picks another port). Its pages,
  services, guards and checks are in [docs/studio.md](docs/studio.md).
- A game is a folder of data under `games/`; after changing one, run
  `./dev npm run game -- validate <id>` (the gate validates all of them). The layout, the id
  rules and the package are in [docs/game-data.md](docs/game-data.md).
- The synth of `packages/audio` is under the same lint (its `analysis` and `node` folders are
  not). Songs and SFX in `audio/` are checked by `./dev npm run audio -- check --all`, which the
  gate runs: validators, then the PCM hash of each render against its checked-in sidecar
  ([docs/audio.md](docs/audio.md)).
- Containers have no GPU, so no headless WebGL there. Check graphics with numbers and hashes from
  CPU renderers, or in the host browser through Chrome DevTools MCP (`./dev -p 4101 <server>`
  publishes a port on 127.0.0.1).

Details: [docs/dev-environment.md](docs/dev-environment.md) (the container, worktrees and their
volumes, ports, the file-watch probe).
