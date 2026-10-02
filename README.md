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
> with its `asset` command (bake, review sheets, lints), the determinism kit, the voxel kit
> (voxel models baked to 2:1 isometric pixel art) and the sim core exist (`packages/asset-kit`,
> `packages/det`, `packages/voxel-kit`, `packages/sim`). No runtime, studio or game code yet.

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
| [packages/voxel-kit/](packages/voxel-kit/README.md) | Voxel models as programs (grid, builder, parts, poses, validation) and the software baker that turns them into 2:1 isometric pixel art: `bakeIso` returns an `IndexedBuffer`, so a voxel model is an ordinary asset |
| [docs/asset-pipeline.md](docs/asset-pipeline.md) | The `asset` command: bake (indexed PNG sheets + `atlas.json`), review sheets, numeric lints, and the same as library functions |
| [docs/looking-at-images.md](docs/looking-at-images.md) | How a session looks at pixel art: the review views, the rules, and the vision calibration behind them |
| [docs/sim.md](docs/sim.md) | The sim contract: ticks, commands, events, ordering, the digest, snapshots and replays |
| [packages/sim/](packages/sim/README.md) | The sim core: the deterministic tick kernel, the toy `counter-shop` systems and the `sim` replay runner |
| [packages/runtime/](packages/runtime/README.md) | The renderer games and the studio share: a draw list of sprites, a WebGL2 backend (palette lookup texture, integer upscale into a rectangle), a CPU reference backend for Node, the clip player, and a dev page for the browser parity check |
| `assets/` | Asset programs (one folder each, e.g. `assets/examples/blinking-dot/gen.ts`; voxel-built: `assets/examples/voxel-crate/gen.ts`, `assets/examples/voxel-chibi/gen.ts`) and palettes (`assets/palettes/example.json`) |
| [docs/studio.md](docs/studio.md) | The studio (`packages/studio`): how to start it, its port, pages, server services and guards |
| [docs/docs-check.md](docs/docs-check.md) | The check that keeps links, paths, the queue and ids in the docs true |
| [CLAUDE.md](CLAUDE.md) | Working rules for Claude Code sessions in this repo |
