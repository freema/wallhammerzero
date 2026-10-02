# STUDIO COMPARE: BEFORE / AFTER, LIBRARY REGRESSION, LINEUP (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** M · **Depends on:** studio-verdicts, studio-animation-player

## Origin
D7 and D21 (verdicts are tied to the output hash) and D23. When the kit or a palette changes,
approved assets can change without anyone touching them. The owner must see exactly what
changed, and new work must be judged next to what is already approved.

## Read first
- `research/code-graphics.md` §2.7 (exemplar sheets and lineups; regression on library
  changes) and §2.8 (what a verdict pins).
- `research/studio-stack.md` §3.5 (review tools: before/after) and §8.4 (`/compare`).

## Scope
1. On approval the studio keeps the approved baked sheet under
   `.studio-cache/approved/<id>/<outputHash>/` (derived data, gitignored).
2. `/compare`: two versions (approved vs current) or two variants side by side on one synced
   clock, with a **diff overlay** (changed pixels marked), a flicker toggle and the count of
   changed pixels per frame.
3. **Library regression:** when `packages/asset-kit`, `packages/voxel-kit`, `packages/det` or a
   palette changes, every approved asset is re-baked. An asset whose output changed while its
   own source did not is flagged **"changed by library"** in the gallery and in the INBOX,
   separately from "changed since verdict".
4. **Lineup:** on `/asset/:id`, a row showing the asset at 1× next to up to eight approved
   assets of the same pack and kind. `./dev npm run asset -- review <id>` writes the same
   lineup as an image for Claude (it reads `review.json`, never writes it).

## Out of scope
- Restoring an old version of a generator (git does that).
- Audio diffs (`studio-audio`).

## Acceptance
- Approve an asset, change one pixel in its generator: `/compare` shows before and after and
  marks exactly that pixel (scripted via Chrome DevTools MCP).
- A change to a kit primitive that alters an approved asset flags it "changed by library"; a
  change that leaves its pixels identical does not.
- With the approved cache deleted, the page says the "before" image is missing and nothing
  crashes.
