# OWNER CALLS (2026-10-02)

**GATE:** owner answers · **Priority:** P1 · **Size:** n/a · **Depends on:** none

## Origin
Open questions from the conversations of 2026-10-01/02 and from the research reports in
`research/`. A session never decides these. When the owner answers, the call becomes a row in
`docs/DECISIONS.md` and is deleted from this note; the note goes when empty. Every report also
ends with a longer list of open questions; only the ones that block or shape queued work are
here.

Answered so far: OC-A1 → D18, OC-A2 → D19 (pick after the spike), OC-A3 → D20, OC-A4 → D21,
OC-A5 → D22, OC-B1 → D24 (desktop) and D27 (mobile), OC-B3 → D25 (hosting) and D27 (licence),
OC-A6 for the first game → D28 (New Hope), OC-D2 for New Hope → D29.
The smaller calls (OC-A7, OC-M1, OC-M2, OC-S1, OC-S2, OC-D1, OC-D3, OC-D4) were delegated to
the session and resolved with their defaults in D27.

**Blocking today:** OC-A2-pick is **ready to answer** (both art spikes are done); it gates
`runtime-tilemap-scene` (the Kairosoft tilemap; New Hope's iso view is D29).

## A. Art and the first game

**OC-A2-pick: Which spike variant wins.** **Ready to answer since 2026-10-07:** both art spikes
are done (`art-spike-2d`, `art-spike-voxel`); the owner had no preference before seeing them
(D26). In the studio (`./dev compose up studio`, http://127.0.0.1:4100): the three scene
mockups side by side at one zoom at `/gallery?kind=scene&zoom=2`, the packs at
`/gallery?pack=spike-a`, `/gallery?pack=spike-b`, `/gallery?pack=spike-c`, the scenes at
`/asset/spike-a/scene`, `/asset/spike-b/scene`, `/asset/spike-c/scene`. The sessions' reads
are in [assets/spike-a/README.md](../assets/spike-a/README.md),
[assets/spike-b/README.md](../assets/spike-b/README.md) and
[assets/spike-c/README.md](../assets/spike-c/README.md) (the voxel chibi loses the face; the
voxel props are the cheapest and gain states and facings for free). The owner picks:
(a) 16×16 3/4, (b) 16×24 chibi 3/4, (c) 2:1 iso voxel-baked, or a mix (e.g. 2D characters +
voxel-baked props). Also: the number of facings. Gates `runtime-tilemap-scene` and the art
notes of the first game.

**OC-A6: Which Kairosoft game comes after New Hope?** The first real game is New Hope (D28),
so this call now only picks the first Kairosoft sim of D1. Parked: do not ask until the owner
raises it. Options: (a) a placement-and-visitors sim like *Hot Springs Story* / *Mega Mall
Story*; (b) a staff-and-projects sim like *Game Dev Story*; (c) something else.
Recommendation: (a).

## B. Platform

**OC-B2: Company or individual?** This affects code signing (EU individuals can't use
Microsoft's signing service) and console contracts. Not urgent; nothing queued depends on it.

**OC-B4: Host tools for builds.** iOS builds need Xcode on the host, and macOS signing needs the
Keychain. Both are exceptions to D16 (nothing installed on the host). Until the owner allows
them, we keep to targets that build in Docker (web, Linux, Windows, Android).

## C. Later

**OC-D2: Three.js for voxel games.** Answered for New Hope by D29 (fixed iso, baked sprites,
our runtime). Still open for a later voxel game with a free camera (the Light No Fire plan in
the owner's Vellum).
