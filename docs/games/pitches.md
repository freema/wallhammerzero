# Pitches

Every game concept a session pitched, and what the owner said about it. `/make-game`
([.claude/skills/make-game/SKILL.md](../../.claude/skills/make-game/SKILL.md)) reads this
before pitching and appends its pitches here, so no run pitches a rejected idea again (the
role of PixelDen's ledger, [research/pixelden-flow.md](../../research/pixelden-flow.md) §6).

Status: `pitched` (waiting for the owner), `picked`, `built` (the first playable build is
committed), `passed` (the owner chose another), `rejected` (with the owner's reason), `parked`.
A verdict is only ever the owner's words, quoted and dated.

## What the owner has said about games in general

- 2026-10-13: wants a real, playable game early, not paperwork: „potřebuji abychom pracovali na
  real hře, prostě!“
- 2026-10-13: for New Hope, 3D in Three.js with a No Man's Sky look and a procedurally generated
  world; no second (2D) version (D30).
- 2026-10-14: does not like New Hope as a game (D31): „celkově hra se mi nelíbí ani“. Why: „hra je
  jednoduchá, grafika, postavy jsou divný, dimenze postav, velikosti objektů jsou nerealistické,
  celkově je to trochu hloupě jednoduché“. So a pitch needs: real-world scale and proportions
  that hold together, graphics a step above flat low-poly boxes, and play with real decisions,
  not a toy. Avoid humans seen up close unless the pitch can make them look right.
- The original genre of the repo is Kairosoft-style management sims (D1); they wait for their
  own pick (OC-A6).

## Ledger

| Date | Game | Pitch | Engine | Status | Owner's words |
|---|---|---|---|---|---|
| 2026-10-13 | New Hope | A cyberpunk, GTA-like game on a generated city-planet: walk the buildings, fly cars, many levels (D28) | Three.js (D30) | parked (D31) | „celkově hra se mi nelíbí ani“ |
| 2026-10-13 | New Hope, iso | The same game in a fixed 2:1 isometric view over baked voxel sprites (D29) | our runtime | rejected | „chci aby to bylo 3D three js hratelná hra žádný verze dva“ |
| 2026-10-14 | Tidewright (recommended) | Sail a 9 m sloop through a generated archipelago and deliver cargo between harbours before the weather turns. Verb: steer and trim the sail against a shifting wind (tack upwind, run downwind; the angle to the wind decides the speed). Hook: a Gerstner-wave ocean with foam and a sail-and-keel force model at real scale. First build: one island group, one delivery, the wind, waves and sky. Ceiling: no people up close, no combat. | Three.js (departs from D10) | built (D32) | „je mi to jedno, nechám plně na tobě!“ (the session took the recommended one) |
| 2026-10-14 | Harbourlight | A town builder on a generated coast: lay lots and roads, the town assembles itself into houses, quays and a lighthouse, and must get through the winter. Verb: place a lot, read what the town lacks (food, wood, warmth). Hook: wave-function-collapse architecture at real scale (a storey 3 m, a door 2 m) and seasonal light. First build: lots on a grid, houses that assemble, fish to food, a winter that can starve the town. Ceiling: no citizens up close, no combat. | Three.js (departs from D10) | passed | „je mi to jedno, nechám plně na tobě!“ |
| 2026-10-14 | Dockyard | A Kairosoft-style sim of a small space dock: build berths, hire crews, serve ships, raise prices and reputation. Verb: build and assign, then read the queue. Hook: a generator of pixel-art ships and dock modules. First build: two berths, ships that arrive, wait and pay, one upgrade. Ceiling: one station, no real-time action. | 2D canvas pixel art (departs from D10; would also settle OC-A6) | passed | „je mi to jedno, nechám plně na tobě!“ |
