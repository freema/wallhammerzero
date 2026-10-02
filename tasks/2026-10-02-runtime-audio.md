# RUNTIME AUDIO: THE SYNTH IN THE GAME (2026-10-02)

**GATE:** none · **Priority:** P2 · **Size:** M · **Depends on:** audio-synth-core, player-loop-test-protocol

## Origin
D10 and D23. The game plays the same data through the same synth as the CLI and the studio.
`research/audio-from-code.md`: the real risk is the mobile audio lifecycle, not CPU.

## Read first
- `research/audio-from-code.md` §3.3 (the two clocks), §3.5–3.6 (CPU, the two runtime
  architectures), §5.2–5.5 (adaptive music by state, stingers, mixing, mobile unlock and
  lifecycle), "Recommendations" 5 and 7.
- `research/multiplatform.md` §1.3 and §2.3 (audio in desktop and mobile webviews).

## Scope
1. The **audio adapter** of the host API, web implementation: one `AudioContext`
   (`latencyHint: "balanced"`), the synth in an **AudioWorklet** for music, SFX baked to
   `AudioBuffer`s at load (seeded), a music bus and an SFX bus.
2. **Adaptive music:** states switch layers and orchestrations at a bar boundary with a short
   fade; jingles duck the music.
3. **SFX play rules** from the data: pitch jitter, maximum voices, minimum interval.
4. `games/<id>/audio.json` (schema in `game-data`): a cue table from sim events to SFX and
   jingles, and from game state to music state.
5. **Lifecycle:** "Tap to start" unlock on the first trusted gesture, suspend when hidden,
   resume and verify `currentTime`; music and SFX volume and mute saved through the storage
   adapter. The game runs silently when audio is unavailable.
6. The test protocol reports audio as text: `describe()` lists the music state and the cues
   fired in the last step, so scripts can assert on sound without hearing it.
7. `counter-shop` plays the example loop, a coin SFX on every sale and a jingle on a
   milestone.

## Out of scope
- Real-device iOS and Android checks (`mobile-wrapper`).
- Native audio plugins; a Godot implementation.

## Acceptance
- In the host browser, an `OfflineAudioContext` render of the worklet for the example loop
  equals the CLI render (hash over quantised samples).
- A script asserts the cues: N sales → N coin cues, and the state change switches layers at
  the next bar.
- With the `AudioContext` suspended or missing, the game runs and the script digests are
  unchanged.
