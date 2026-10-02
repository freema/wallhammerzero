# SIM CONFORMANCE: THE SAME DIGESTS ON A SECOND JS ENGINE (2026-10-02)

**GATE:** none · **Priority:** P3 · **Size:** S · **Depends on:** game-package-format

## Origin
D10: the player may later be Godot, because consoles would be very nice. The research proposal
is to run the same compiled sim on QuickJS inside Godot instead of rewriting it. This note
proves early, in Docker, that our sim gives identical results on QuickJS, so the option stays
real. (Choosing that route is still the owner's call, when a Godot player is on the table.)

## Read first
- `research/multiplatform.md` §4.2 (pitfalls between engines), §4.3 (replays, digests,
  conformance corpus, divergence tooling) and §4.4 (same code vs two implementations).
- pkmn/engine's testing notes, linked there: a second implementation verified against the
  first.

## Scope
1. `tools/conformance/corpus/`: language-neutral files
   `{ gameId, simDataHash, seed, commands, digests, finalDigest }` recorded from the example
   game, plus the `det` test vectors.
2. A runner for **Node (V8)** and one for **QuickJS in Docker** (a pinned QuickJS build in the
   dev image; the sim bundled into one ES file). Both read the corpus and compare digests.
3. **Divergence tooling:** binary search to the first divergent tick, per-system digests, and
   a dump of both states.
4. The rule, written in `docs/sim.md`: golden digests change only in a deliberate commit that
   states the reason.
5. `npm run check` runs the corpus on both engines.

## Out of scope
- JavaScriptCore and SpiderMonkey runs (they need CI, which is not set up). A Godot player.

## Acceptance
- The corpus passes on Node and on QuickJS in Docker.
- A fixture that uses `Math.sin` in a system (lint disabled for the fixture) or iterates a map
  in insertion order is reported with its first divergent tick, if the engines differ; if they
  agree, the test records that and the fixture stays as a tooling test only.
- Nothing is installed on the host.
