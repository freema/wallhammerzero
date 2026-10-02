# PLAYER SAVES: SNAPSHOT + COMMAND TAIL (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** S · **Depends on:** player-loop-test-protocol

## Origin
D10 and D23. `research/multiplatform.md` rule 10: a save is a versioned snapshot plus the
command tail, written through a host storage adapter, so a save is also a replay.

## Read first
- `research/multiplatform.md` §4.1 item 5, §2.6 (offline assets, size, saves on mobile),
  "Architectural rules from day one" 10.
- `research/ref-nms-procgen.md` §3.10 (a save must pin the generator and data version).

## Scope
1. The save format: `{ saveVersion, gameId, simDataHash, seed, snapshot, commandTail }`,
   canonical JSON, with a checksum.
2. A **storage adapter** in the host API, with a web implementation (IndexedDB, falling back
   to `localStorage`); desktop and mobile adapters come with the wrapper notes.
3. Slots and an autosave on a sim event (for example the start of a day), never mid-tick.
4. Loading checks `simDataHash` and `saveVersion`. A mismatch goes through a **migration
   table** (version → function over the snapshot) or is refused with a clear message.
5. Export and import of a save as a file, which doubles as a bug report: the runner can
   replay it.
6. The test protocol gains `save()` and `load()`.

## Out of scope
- Cloud saves, Steam Auto-Cloud paths (`desktop-wrapper`), native mobile storage
  (`mobile-wrapper`).

## Acceptance
- Save → load → continue gives the same digests as an uninterrupted run, in Node and in the
  host browser.
- A corrupt or truncated save is refused without crashing; a save with an older `saveVersion`
  loads through a fixture migration.
- An exported save replays in `./dev npm run sim -- replay`.
