# OWNER CALLS (2026-10-02)

**GATE:** owner answers · **Priority:** P1 · **Size:** n/a · **Depends on:** none

## Origin
Open questions from the conversations of 2026-10-01/02 and from the research reports in
`research/`. A session never decides these. When the owner answers, the call becomes a row in
`docs/DECISIONS.md` and is deleted from this note; the note goes when empty. Every report also
ends with a longer list of open questions; only the ones that block or shape queued work are
here.

Answered so far: OC-A1 → D18, OC-A2 → D19 (pick after the spike), OC-A3 → D20, OC-A4 → D21,
OC-A5 → D22, OC-B1 → D24 (desktop) and D27 (mobile), OC-B3 → D25 (hosting) and D27 (licence).
The smaller calls (OC-A7, OC-M1, OC-M2, OC-S1, OC-S2, OC-D1, OC-D3, OC-D4) were delegated to
the session and resolved with their defaults in D27.

**Blocking today:** nothing. Only `runtime-tilemap-scene` waits (for OC-A2-pick), and the first
real game's notes wait for OC-A6.

## A. Art and the first game

**OC-A2-pick: Which spike variant wins.** Asked once both art spikes are done
(`art-spike-2d`, `art-spike-voxel`); the owner has no preference before seeing them (D26). The
owner compares the three scene mockups and their contact sheets in the studio and picks:
(a) 16×16 3/4, (b) 16×24 chibi 3/4, (c) 2:1 iso voxel-baked, or a mix (e.g. 2D characters +
voxel-baked props). Also: the number of facings. Gates `runtime-tilemap-scene` and the art
notes of the first game.

**OC-A6: Which Kairosoft game do we copy first?** **Parked by the owner (D26): do not ask
again until the owner raises it.** It gates the first game's notes (sim systems, content,
concept page). Options: (a) a placement-and-visitors sim like *Hot Springs Story* / *Mega Mall
Story* (grid building, visitors walking, combos, rank; exercises most of the engine); (b) a
staff-and-projects sim like *Game Dev Story* (mostly menus and staff stats, little map);
(c) something else. Recommendation: (a). Goes with it: whether the sims get bigger creatures
or pets (the 3D-baked creature style pays off from about 30 px, not at 16×24).

## B. Platform

**OC-B2: Company or individual?** This affects code signing (EU individuals can't use
Microsoft's signing service) and console contracts. Not urgent; nothing queued depends on it.

**OC-B4: Host tools for builds.** iOS builds need Xcode on the host, and macOS signing needs the
Keychain. Both are exceptions to D16 (nothing installed on the host). Until the owner allows
them, we keep to targets that build in Docker (web, Linux, Windows, Android).

## C. Later

**OC-D2: Three.js for voxel games.** Deferred. `voxels.md` says it depends on the voxel game's
camera (a pixel-stable look needs a fixed orthographic camera; a free perspective flight camera
crawls). Revisit before the first voxel game.
