# NEW HOPE: THE FIRST PLAYABLE MISSION (2026-10-13)

**GATE:** none · **Priority:** P2 · **Size:** L · **Depends on:** runtime-iso-levels, runtime-input, runtime-text-ui, studio-play-and-builds

## Origin
D28: the game is how the owner tests working with the studio and the sessions. The first slice
ends with something to play: Kylo wakes in a Union med bay high in the city, goes down by lift
and walkway, takes a flying taxi along the sky lanes to another tower
(`games/new-hope/README.md`, "The first slice"). Split this note before starting if it does
not fit one session (the README of `tasks/` says how).

## Read first
- `games/new-hope/README.md`, `games/new-hope/STORY.md`.
- `docs/sim.md` (ticks, commands, digests, replays) and `docs/game-data.md` (systems, tables,
  locales, scenes).
- The notes of the dependencies.

## Scope
1. **Sim systems** for New Hope in `packages/sim`: walking on the cell grid between walkable
   cells, stairs and lifts between levels, boarding and leaving a flying car, flying along a
   lane network and landing on a pad, and a mission of steps with triggers.
2. **The game data** in `games/new-hope/`: the systems in `game.json`, the tables they declare,
   the scene of one district (seed and window), English and Czech locales for the mission
   text.
3. **Playable in the studio** through the play page: keyboard control, the cut-away follows
   Kylo, a short mission text at each step, the end of the mission.
4. A replay of the whole mission as a golden digest in the tests.

## Out of scope
- Body-passing (a proposal in `STORY.md`, waits for the owner), combat, police, economy,
  more districts, audio beyond what the runtime has by then.

## Acceptance
- The mission can be played from start to end in the studio; the replay test reaches the end
  with the same digest twice.
- `./dev npm run game -- validate new-hope` passes; the gate is green.
