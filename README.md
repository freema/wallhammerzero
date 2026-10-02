# Wallhammer Zero

A **studio + generator** for games written entirely by an AI. A Claude Code session in this
repo writes the code, graphics, music and game data, and a local studio lets the owner see,
verify and steer the results.

Two game types:

1. **Kairosoft-style management sims** in 2D pixel art (Game Dev Story, Hot Springs Story,
   Pocket Academy …). **We start here.**
2. **Voxel games.** These come later and are also rendered as pixel art.

> **Status (2026-10-02): foundation plus the dev environment.** Agreed decisions, research
> reports and the work queue for the whole studio and engine are in place. Everything runs in
> Docker through `./dev`, and the gate is `./dev npm run check`. No engine or studio code yet.

## Where things are

| Path | What |
|---|---|
| [docs/DECISIONS.md](docs/DECISIONS.md) | What the owner has decided (and when) |
| [docs/references.md](docs/references.md) | Where the ideas come from and how others do it |
| [research/README.md](research/README.md) | Deep research reports, security scans and the conclusions that repeat across them |
| [tasks/README.md](tasks/README.md) | The work queue and its rules |
| [docs/dev-environment.md](docs/dev-environment.md) | The Docker dev environment, the `./dev` wrapper and the gate |
| [CLAUDE.md](CLAUDE.md) | Working rules for Claude Code sessions in this repo |
