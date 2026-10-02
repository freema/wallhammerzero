# Wallhammer Zero

A **studio + generator** for games written entirely by an AI. A Claude Code session in this
repo writes the code, graphics, music and game data, and a local studio lets the owner see,
verify and steer the results.

Two game types:

1. **Kairosoft-style management sims** in 2D pixel art (Game Dev Story, Hot Springs Story,
   Pocket Academy …). **We start here.**
2. **Voxel games.** These come later and are also rendered as pixel art.

> **Status (2026-10-02): foundation, the dev environment and the first packages.** Agreed
> decisions, research reports and the work queue for the whole studio and engine are in place.
> Everything runs in Docker through `./dev`, and the gate is `./dev npm run check`. The asset kit
> and the determinism kit exist (`packages/asset-kit`, `packages/det`). No runtime, studio or
> game code yet.

## Where things are

| Path | What |
|---|---|
| [docs/DECISIONS.md](docs/DECISIONS.md) | What the owner has decided (and when) |
| [docs/references.md](docs/references.md) | Where the ideas come from and how others do it |
| [research/README.md](research/README.md) | Deep research reports and the conclusions that repeat across them |
| [security/skill-intake/README.md](security/skill-intake/README.md) | Third-party skill intake: the procedure, the scan command, the registry and the scan evidence |
| [tasks/README.md](tasks/README.md) | The work queue and its rules |
| [docs/dev-environment.md](docs/dev-environment.md) | The Docker dev environment, the `./dev` wrapper and the gate |
| [packages/asset-kit/](packages/asset-kit/README.md) | The library asset programs are written with: `defineAsset`, `IndexedBuffer`, palettes, stamps, the output hash |
| [packages/det/](packages/det/README.md) | The determinism kit: seeded integer RNG, hashes, integer trig and easing, test vectors for ports |
| `assets/` | Asset programs (one folder each, e.g. `assets/examples/blinking-dot/gen.ts`) and palettes (`assets/palettes/example.json`) |
| [docs/docs-check.md](docs/docs-check.md) | The check that keeps links, paths, the queue and ids in the docs true |
| [CLAUDE.md](CLAUDE.md) | Working rules for Claude Code sessions in this repo |
