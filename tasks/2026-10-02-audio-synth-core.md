# AUDIO SYNTH CORE: MUSIC AND SFX AS DATA, ONE REFERENCE SYNTH (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** L · **Depends on:** asset-kit-core (`packages/det`), asset-render-cli (PNG writer)

## Origin
D4 and D5 (the generator writes music as files), D10 (games are pure data) and D23 (the queue
covers audio). Research conclusion 2: an asset is a program or data whose output is a pure
function; WAV files are build outputs. Claude cannot hear, so every write must come back as
numbers and pictures.

## Read first
- `research/audio-from-code.md`: §1.3 (failure catalogue and the check that catches each),
  §2 (representations), §3 (synthesis: voices, envelopes, sequencer, effects), §4 (SFX: sfxr
  and ZzFX vocabulary), §5.4 (loudness), §5.6 (offline rendering), "Recommendations" 1–6 and
  "Proposed minimal data formats".
- The owner's `code-pixel-game` skill, `references/audio.md` (Gloop's sequencer, the song
  tests, the failure table).
- Licences (`research/README.md`): sfxr, jsfxr, ZzFX and ZzFXM are fine to learn from; Strudel
  (AGPL), Furnace and Dn-FamiTracker (GPL) are concepts only.

## Scope
1. `packages/audio`: a **sample-level synth in plain TypeScript** with no Web Audio dependency:
   pulse with PolyBLEP (duty 12.5 / 25 / 50 %), triangle (with a 4-bit option), seeded LFSR
   noise in two modes, an optional 32-sample wave channel; ADSR, vibrato, arpeggio, slide;
   echo and a low-pass; a sample-counting sequencer. It uses only exact operations (+ − × ÷)
   and checked-in tables (pitch, filter coefficients), and is under the determinism lint, so
   the same song gives the same samples on every engine.
2. **Formats** (JSON, schemas included): `wz.song/0.1` (step grid with one string per bar, a
   chord lane, sections, order, loop point, layers, states, orchestrations) and `wz.sfx/0.1`
   (named parameters in physical units, seed, play limits). A jingle is a song with
   `loop: false`. Files live in `audio/<pack>/music/*.song.json` and
   `audio/<pack>/sfx/*.sfx.json`.
3. **Validators:** strict parse, step count per bar and per channel, key and chord lint on
   strong beats, note range, density and rest ratio, unique-bar ratio.
4. A CLI, `./dev npm run audio -- <list|check|render|metrics>`: a WAV writer (16-bit PCM),
   one stem per channel, and metrics (integrated loudness, true peak, loop-seam discontinuity,
   energy above 8 kHz). It also writes a **piano-roll PNG and a spectrogram PNG** for Claude,
   and a sidecar `*.render.json` (hash over the PCM, loudness, peak, trim, warnings). The
   metrics code is analysis and is exempt from the determinism lint; the synth is not.
5. Examples in `audio/examples/`: one 8-bar loop with two states, three SFX (coin, click,
   level up) and one jingle.
6. `docs/audio.md`: the formats, the composition procedure (form → chords → bass → motif →
   melody → drums → mix; 2–3 variants) and the house loudness targets (music −18 LUFS-I,
   master ≤ −1 dBTP; D27).

## Out of scope
- Playback in the game (`runtime-audio`) and the studio screens (`studio-audio`).
- A Godot port of the synth; importing sfxr strings.

## Acceptance
- Golden hashes over the PCM of every example; rendering twice is byte-identical;
  `npm run check` runs the validators and the goldens.
- Each validator has a failing fixture (a bar with a wrong step count, an off-key note on a
  strong beat, a channel of a different length).
- `render` writes the WAV, stems, both PNGs and the sidecar; the piano-roll PNG read with Read
  shows the bars and channels legibly.
- The loop-seam metric flags a fixture with a click at the loop point.
