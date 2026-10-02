# STUDIO AUDIO: MUSIC REVIEW SCREEN AND SFX BOARD (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** L · **Depends on:** audio-synth-core, studio-verdicts

## Origin
D6 (the studio shows all generated assets), D7 (verdicts go back into the repo) and D23 (audio
moves from "later" in D22 into the queue). The owner is the only ear: Claude sees numbers and
pictures, the owner listens and answers in musical coordinates Claude can act on.

## Read first
- `research/audio-from-code.md` §6 (music review screen, SFX board, verdicts back to data),
  §5.2 (adaptive states), §5.4 (loudness), "Recommendations" 8.
- `research/studio-stack.md` §5 (the review file rules this reuses).

## Scope
1. The asset index and live reload cover `audio/**` (topic `audio`); `/audio` lists songs,
   jingles and SFX with their status and metrics from the sidecars.
2. **Playback:** the synth runs in a Web Worker and renders stems to `AudioBuffer`s, so mute
   and solo are gain changes, with no re-render.
3. **Music page:** a step grid per channel with a chord lane and validator highlights;
   play, loop, loop region, **loop-seam audition** (last 2 bars into the first 2), tempo
   ±10 % preview; a **state simulator** (toggle states, hear the layers and transitions);
   **A/B variants** at matched loudness, with an optional blind mode; a "phone speaker"
   toggle; a metrics panel.
4. **SFX board:** a tile per SFX with waveform, duration and loudness; **spam ×10**, **over
   music**, and **mutate ×6** (six seeded variations from the CLI; the owner's pick is written
   as a review entry for Claude to apply).
5. **Verdicts** through the review service: `*.review.json` next to the song or SFX
   (studio-only writer), tied to the render hash, with comments anchored to
   `{ section, bar, beat, channel }` or `{ state }`, never to seconds. They appear in
   `reviews/INBOX.md`.
6. `audio:<id>` embeds work in concept pages.

## Out of scope
- Editing notes in the studio (Claude edits the data).
- A piano-roll diff between revisions (a follow-up if the owner wants it).

## Acceptance
- The example loop plays; mute and solo do not re-render (checked by script); the state
  simulator switches layers at a bar boundary.
- A comment placed on bar 6 of the lead writes that anchor into the review file and the INBOX.
- Editing the song file marks its verdict stale and reloads the page without losing the loop
  region.
- Blind verifier (Chrome DevTools MCP): `/audio` and both pages load with no console errors.
