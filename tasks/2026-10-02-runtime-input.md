# RUNTIME INPUT: POINTER, KEYS AND GAMEPAD BECOME COMMANDS (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** runtime-text-ui

## Origin
D10 and D23. `research/multiplatform.md`: input only ever produces commands, and the game must
work with touch, mouse, keyboard and gamepad (consoles are wanted later).

## Read first
- `research/multiplatform.md` "Architectural rules from day one" 2 and 11, §1.3 (input on
  desktop wrappers), §2.4 (safe areas, orientation).
- `research/game-creator.md` §4.2 (action scripts replay buttons and pointer positions).

## Scope
1. An input adapter in `packages/player`: pointer (mouse and touch), keyboard and gamepad are
   normalised into events in **native-resolution integer coordinates** (the inverse of the
   integer upscale rectangle, letterbox aware).
2. **UI hit-testing and focus:** pointer hits on the UI tree; focus navigation with arrows,
   d-pad, confirm and cancel, so every screen is usable without a pointer.
3. Scene input hooks: tap, drag and long-press are passed to the scene with native coordinates
   (the tilemap note maps them to cells).
4. Input never touches the sim: it produces commands or UI actions only.
5. The test protocol gains `tap(x, y)`, `press(key)` and `pad(button)` steps, and scripts can
   record a live session's inputs as commands.

## Out of scope
- Tile picking and camera drag (`runtime-tilemap-scene`).
- Rebinding screens, haptics, on-screen virtual pads.

## Acceptance
- Unit tests for the coordinate mapping at several canvas sizes and integer scales, including
  letterboxed layouts.
- A script drives the `counter-shop` example by taps only, and another by keys only; both reach
  the same digests as the command-only script.
- In the host browser (Chrome DevTools MCP), a real click on the price button changes the
  price.
