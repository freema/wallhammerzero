# Audio from code: music and SFX written by an LLM

*Research note for Wallhammer Zero, 2026-10-02. Scope: how a Claude Code session (Opus 5.5) can write game music and sound effects as code or data, how to play them back with our own WebAudio runtime, how to check them in the studio, and what a minimal data format could look like. This is research only. Nothing here is a decision.*

**Notation used in this document**
- **[F]** is a sourced fact. The link is inline or in *Sources*.
- **[O]** is my opinion or engineering judgement.
- **[U]** means uncertain or not verified in this session.

Licences were checked against each project's GitHub licence metadata or its LICENSE file on 2026-10-02. We build from scratch, so any library named here is for learning, not for shipping.

---

## Executive summary

1. **Opus 5.5 can clearly make listenable music from code, but the public evidence is anecdotal and only about 10 days old.** Opus 5.5 was announced on 2026-09-22 [F]. That same day, community posts showed one-shot JS "bass music" and Voxyz_ai's 29-second film *small print*, with music "synthesized in python, then went through the render second by second and polished it again" [F]. No systematic evaluation of Opus 5.5 music exists yet. Posts are highlight reels [F].
2. **The academic failure modes are about older models but are still the right checklist [F]:** invalid notation, misaligned bars across voices, off-key notes, motifs copied from the prompt, unstructured repetition, and weak multi-step musical reasoning. From practice [F/O], add startling loudness jumps, clipping, loop-seam clicks and "noodling" with no memorable hook.
3. **The model cannot hear.** Its feedback loop has to be numeric and visual: LUFS, true peak, bar and step validation, key and chord checks, plus piano-roll and spectrogram images. The studio owner is the only real ear [O].
4. **Representation: use structured data, not free code.** Code-only synthesis (the Python/JS demos) is the most expressive option but the worst for editing, adaptivity and porting to Godot. ABC is the most familiar to LLMs, but multi-voice support is weak [F]. MML is compact but dialect-fragmented and stateful [F]. A tracker-like step grid makes cross-voice alignment structural, which directly fixes the most common LLM error [O].
5. **Proposed format:** a JSON song file with a fixed step grid. Each channel gets one string per bar, with beat separators. Instruments come from a small fixed parameter schema (pulse/triangle/noise/wave, envelope, vibrato, arpeggio). The file also carries a chord lane for automated harmony checks, sections and order, and layers/states for adaptive music [O].
6. **Playback architecture:** write one deterministic reference synth in plain TypeScript at the sample level. Everything else hosts it: Node CLI (offline WAV and metrics for Claude's self-check), studio (render to buffers, with stems for mute/solo), game (AudioWorklet, with the sequencer inside the worklet) and Godot later (a port, or baked stems) [O]. Native WebAudio nodes plus "A Tale of Two Clocks" lookahead scheduling (25 ms timer, 100 ms lookahead [F]) are the simpler fallback, but they don't run in Node or Godot.
7. **CPU is not the problem; mobile lifecycle is.** A 4–8 voice chip arrangement is cheap. Biquads are cheap and ConvolverNode is "very expensive" [F], so prefer a feedback delay to convolution reverb. The real risks are on iOS [F]: Web Audio is silenced by the mute switch, the AudioSession API isn't Baseline, and AudioContexts fail to resume after backgrounding (WebKit bugs). Android output latency ranges from 12.5 to 150 ms [F].
8. **SFX:** sfxr's parameter set is the lingua franca (about 22 normalized 0–1 params, MIT) [F]. ZzFX is the most compact modern take (21 params in physical units, MIT, deterministic noise) [F]. Propose our own named-parameter SFX schema in physical units (Hz, seconds, semitones, dB) with a seed, plus an optional note list for two-tone coins and jingles [O].
9. **Genre audio design [O]:**
   - Short cozy major-key loops (roughly 45–90 s, 90–120 BPM) with lots of space.
   - Adaptive music by **vertical layering** (rush hour adds percussion) and **re-orchestration** (season swaps instruments), with **horizontal switches on bar boundaries** for events [F for the terms].
   - Stingers are key-aware and quantized to the beat. Coin "spam" is rate-limited and pitched to the current scale.
10. **Loudness:** measure ITU-R BS.1770 integrated LUFS and true peak offline [F]. Sony's published targets are −24 LUFS for console and −18 LUFS ±2 LU for mobile/portable [F]. Store a trim gain in a sidecar instead of re-rendering [O].
11. **Studio [O]:**
    - Step-grid / piano-roll view with a chord lane, per-channel mute/solo, and loop-seam audition.
    - Game-state toggles that preview the layers.
    - **Loudness-matched, optionally blind A/B** of variants.
    - An SFX board with "spam ×10" and "over music" tests.
    - Verdicts saved as per-asset review files whose comments are anchored to *musical* coordinates (section/bar/beat/channel), plus a content hash so stale verdicts are detected.
12. **Licences:** sfxr, ZzFX, ZzFXM, BeepBox, JummBox, Tone.js, @tonejs/midi, abcjs, GDSiON, Bosca Ceoil Blue, gdfxr, Signal, bfxr2 and libebur128 are **MIT**. jsfxr is **Unlicense**, the legacy bfxr is **Apache-2.0**, and wavesurfer.js and libopenmpt are **BSD-3** [F]. Furnace (GPL-2.0+), Dn-FamiTracker (GPL-3.0+), the SoundBox editor (GPL-3; its player is zlib) and **Strudel (AGPL-3.0)** are copyleft [F]. Read them for ideas only and never copy code [O].

---

## 1. Evidence: what LLMs can do with music written as code

### 1.1 Opus 5.5 era (September 2026)

| Example | What was done | Notes |
|---|---|---|
| **Voxyz_ai, *small print*** (posted 2026-09-22) [F] | A 29-second film. The visuals were drawn in JS in a single `index.html` and rendered with Hyperframes. Quote: "it synthesized the music in python, then went through the render second by second and polished it again." | Self-review was done against the render. We don't know how: the post doesn't say whether it was numeric analysis or frames plus audio metrics [U]. |
| **@aj_dev_smith** (2026-09-22) [F] | "opus 5.5 passed a real threshold at making music with code! this is one shot from asking 'make some bass music with javascript'". It came with a 2-minute video. | A one-shot claim from a self-described musician-developer. It's a single sample. |
| **awesome-claude-video** list [F] | Several films whose music and SFX were "synthesized in code". Examples: a Python-synthesized score in *A Short History of AI*, and synthesized sound in *Battle of Austerlitz*. | It's a curated highlight list. |
| **PixelKits** (labelled "Opus 5.5 test") [F] | About 30 original chiptune tracks plus SFX, "synthesized live with WebAudio". It also has a procedural "cry" per creature. | Closest to our use case: a game with a chiptune engine in `src/engine`. Its format is undocumented. |
| **claude-animation-studio** (Claude Code plugin) [F] | Music "synthesized in plain JavaScript" from "one score" that drives both picture and sound. It measures loudness and true peak, and a `verify` step checks sync hits within ±20 ms. | The README says MIT, but GitHub's licence detection doesn't confirm it [U]. Measuring before shipping is the pattern to copy. |
| **iart-ai javascript-animation-skills** `soundtrack` skill (MIT) [F] | Web Audio music on a tempo map, "rendered offline to WAV". The sync check fails if cuts miss the beat "or the music jumps loud enough to startle". It notes that "a hit inside a steady groove sounds fine; the same hit after silence is startling." | Documents a real failure mode: isolated loud hits. |
| **Anthropic's Opus 5.5 announcement** (2026-09-22) [F] | It mentions a game-building comparison won on "graphics and polish". It **does not mention music or audio**. | There's no first-party claim about music. |

A reality check from a commentary piece [F]: "People post the attempt that worked, not the ones that didn't, and nobody sharing a clip has to say how many tries it took." I found **no** controlled evaluation of Opus 5.5, or of any Claude model, on composition quality [U].

### 1.2 Academic evidence (older models, symbolic music)

- **ISMIR 2024, "Can LLMs 'Reason' in Music?"** tested GPT-4 and Llama 2 [F].
  - LLMs "typically fail to leverage learned music knowledge when addressing complex musical tasks". The authors conclude that "advanced musical capability is not intrinsically obtained by LLMs".
  - Apart from GPT-4, models struggled to emit valid ABC.
  - Outputs showed "copying motifs provided in the prompt", "unstructured harmonic repetitions or completely off-key notes".
- **ChatMusician** fine-tuned an LLM on ABC as plain text. It beat a GPT-4 baseline on "well-structured, full-length music" with text, chord, melody and form conditioning [F]. So text notation is a viable carrier.
- **MuPT** states that "LLMs are inherently more compatible with ABC Notation" than with MIDI [F]. It introduced **Synchronized Multi-Track ABC** because generating multi-track ABC one track at a time causes **misaligned measures across tracks** [F]. This is the most important format-design lesson in this document.
- **LREC 2026, "LLMs' internal perception of symbolic music"**: GPT-4 emitted JSON lists of `(pitch, duration, velocity, start_time)` tuples for 8-bar, 4/4, four-track pieces [F].
  - The authors say the constraints "severely restrict the complexity of musical structures".
  - LLM-generated data scored far below human data on downstream tasks (genre F1 0.453 vs 0.784) [F].

**Interpretation [O].** Opus 5.5 is far stronger than GPT-4-era models, and code-based demos sidestep notation-validity errors because the program, not the model, does the timing. The *structural* risks still apply as soon as the LLM writes several voices in parallel: bar counts, alignment, harmony and form.

### 1.3 Failure-mode catalogue and what catches each one automatically

| Failure | Source | Automatic detection (no ears needed) | Mitigation |
|---|---|---|---|
| Bars of wrong length; voices drift out of alignment | [F] MuPT, ISMIR'24 | Parser counts steps per beat and per bar for every channel | A fixed step grid with beat separators (§7) |
| Invalid notation | [F] ISMIR'24 | Strict parser with line/bar error messages | A small, unambiguous grammar |
| Off-key or sour notes; chord clashes | [F] ISMIR'24 | Validator flags out-of-scale notes and non-chord tones on strong beats against the declared key and chord lane | Write chords first, then bass, then melody [O] |
| Motif copied from the prompt; mechanical repetition | [F] ISMIR'24 | Ratio of unique bars, longest identical run, similarity to the reference motif | Ask for motif plus variation (sequence, inversion, rhythmic displacement) [O] |
| "Noodling": constant 16th notes, no hook, no form | [O] | Note density per bar, rest ratio, pitch-range histogram | Prescribe a form (AABA, call-and-response) and a rest budget |
| Startling hits, clipping, uneven loudness | [F] iart skill; [O] | Short-term LUFS jumps, true peak, clip count | Gain staging per channel; loudness pass in the CLI |
| Loop-seam click or awkward return | [O] | Sample discontinuity at the loop point; last-bar harmony leads to the first bar | Release tails crossfaded over the loop; turnaround bar (V→I) |
| Harsh or fatiguing timbre (aliasing, too much 12.5% duty in the treble) | [O] | Spectral centroid, energy above about 8 kHz | Low-pass on the music bus; band-limited oscillators |
| Model can't hear its own output | [O] | Render to PNG (piano roll, spectrogram) and metrics JSON for the model to inspect | The owner judges by ear in the studio |

---

## 2. Representations an LLM writes well

### 2.1 Candidates

**(a) Code that synthesizes directly**, such as Python/numpy or a JS Web Audio script. This is what the September demos did [F].
- *Pro:* unlimited expressiveness, and there's no format to design.
- *Con:* notes, instruments and mixing logic end up entangled. The studio can't offer a piano roll or a per-channel verdict, adaptive layering has to be hand-coded per song, Godot would need a re-implementation of every song, and diffs mix logic with notes.
- Good for one-off films, poor for a content pipeline [O].

**(b) ABC notation** (standard 2.1, Dec 2011) [F]. Example:
```
X:1
T:Shop
M:4/4
L:1/8
Q:1/4=108
K:F
A2 c2 f3 e | d2 c2 A2 G2 |
```
- *Pro:* the most LLM-familiar text notation (ChatMusician and MuPT rely on it [F]); readable.
- *Con:*
  - Multi-voice (`V:`) is explicitly marked "VOLATILE" in 2.1 [F], and implementations "not all … follow this standard absolutely" [F].
  - There are no chip-specific parameters (duty, arpeggio macros, noise mode).
  - Durations are relative to `L:`, so the model does arithmetic. Bars can silently be under- or over-filled.
- Parser to learn from: abcjs (MIT) [F]. Godot has no ABC player.

**(c) MML (Music Macro Language)** [F]. Example (GDSiON flavour): `t100 l8 [ ccggaag4 ffeeddc4 ]2`
- *Pro:* very compact, with chip heritage (MCK/PPMCK for NES) [F]. There's an MIT-licensed Godot synth, **GDSiON**, that plays SiON-flavoured MML. It runs on Linux, macOS, Windows, Web (Godot ≥ 4.3) and Android, and is in beta (0.7-beta8) [F].
- *Con:*
  - "A family of related … notations rather than a single fixed language" [F].
  - It's stateful: the current octave (`o`, `<`, `>`) and default length (`l`) carry forward, so one early mistake shifts everything after it [O].
  - One long line per channel gives poor diffs and is hard for the owner to read [O].

**(d) Tracker patterns** [F]: "notes positioned in several channels at chronological positions on a vertical timeline". Patterns are sequenced by an order list. Effects include "volume, portamento, vibrato, retrigger, and arpeggio". The formats are MOD, S3M, XM and IT (binary).
- *Pro:*
  - Time is the row index, so **cross-channel alignment is structural**. This avoids MuPT's misaligned measures [O].
  - Line-per-row text diffs well.
  - It's the native idiom of chiptune.
- *Con:*
  - Verbose: 64 rows × N channels per pattern.
  - Hex effect columns are arcane for the owner.
  - The classic module formats are binary and come with GPL tools: Furnace GPL-2.0+, Dn-FamiTracker GPL-3.0+ [F]. libopenmpt is BSD-3 [F].

**(e) MIDI-like JSON event lists**, for example the @tonejs/midi JSON (MIT): tracks with `notes: [{midi, time, ticks, duration, velocity}]` and `controlChanges` [F].
- *Pro:* unambiguous, trivially parsed anywhere (Godot has a built-in JSON class), and maps 1:1 to a piano roll.
- *Con:*
  - The model must compute absolute times, which invites arithmetic errors [O].
  - It's unreadable and diffs are noisy.
  - The LREC 2026 work used exactly this tuple style and had to restrict itself to 8 bars, 4/4 [F].

**(f) Hybrid step-grid JSON**, the recommendation [O]. It's tracker semantics in a compact text form: JSON for structure, plus one string per bar per channel with beat separators, for example `"A4 . . . | C5 . . . | F5 - - - | E5 . D5 ."`.
- The `|` separators let both the model and the validator count steps per beat.
- Instruments are a small fixed schema rather than code.
- Precedents with permissive licences: **ZzFXM** (MIT) uses nested arrays `[instruments, patterns, sequence, BPM, metadata]`. Its channels are `[instrument, panning, note…]`, notes are integers 1–36 with the fractional part as attenuation, `0` is a rest and `-1` a release [F]. **BeepBox** (MIT) packs whole songs into a URL and ships an embeddable synth [F]. Both show how small a complete chip-song format can be.

### 2.2 Trade-off matrix [O]

| Criterion | Code synth | ABC | MML | Tracker text | MIDI-JSON | **Step-grid JSON** |
|---|---|---|---|---|---|---|
| LLM fluency | ●●● | ●●● | ●● | ●● | ●● | ●● (simple, self-describing) |
| Cross-voice alignment safety | ●● (code does it) | ● | ● | ●●● | ●● | ●●● |
| Machine validation (bars, key) | ● | ●● | ● | ●●● | ●●● | ●●● |
| Diff readability | ● | ●● | ● | ●● | ● | ●●● |
| Studio editing (piano roll round-trip) | ✗ | ●● | ● | ●●● | ●●● | ●●● |
| Chip expressiveness (duty, arp, noise) | ●●● | ● | ●●● | ●●● | ● (needs CC/meta) | ●● (instrument schema) |
| Adaptive layers and states | ✗ (hand-coded) | ● | ● | ●● | ●● | ●●● (declared) |
| Swappable player (Godot) | ✗ | ● | ●● (GDSiON) | ●● | ●●● | ●●● |
| Token cost (32 bars × 4 channels) | high | low | lowest | high | high | moderate (≈2–3k tokens) [O, estimate] |

---

## 3. WebAudio synthesis from scratch

### 3.1 Voices

**Pulse with variable duty (NES/GB style).** The NES has two pulse channels with 12.5/25/50/75% duty, a 32-step 4-bit triangle with no volume control, and an LFSR noise channel with a long mode and a short "buzzing" mode [F].

There are three ways to make a pulse wave:
1. **PeriodicWave** [F]. Use `createPeriodicWave(real, imag, {disableNormalization})`, where `real` holds the cosine terms and `imag` the sine terms.
   - The spec computes `x(t) = Σ_{k≥1} a[k]cos(2πkt) + b[k]sin(2πkt)`. The DC term is not used: the constructor sets index 0 to zero.
   - By default the wave is normalized to a peak of 1.
   - For a bipolar pulse of duty *d* centred at t=0: `a[k] = 4/(kπ)·sin(kπd)` and `b[k] = 0`. This is my derivation from the standard Fourier series; the dropped DC term would be 2d−1.
   - With *d* = 0.5 this reduces to the familiar odd-harmonic square.
   - Duty *d* and 1−*d* differ only by inversion and a shift, so 25% and 75% sound alike. That follows from the same formula.
   - Browsers band-limit oscillators internally with multiple wavetables [F, Adenot]. One PeriodicWave per duty (4 objects) costs almost nothing.
   - *Limitation:* a duty **sweep** (sfxr `p_duty_ramp`) can't be automated on a PeriodicWave.
2. **Two-saw trick [O].** pulse = saw(t) − saw(t − d/f). Use two sawtooth oscillators, with a DelayNode on one and an inverted gain. The delay time can be automated, which gives a duty sweep, but it has to track pitch.
3. **AudioWorklet DSP.** A naive pulse is one comparison per sample. Add **PolyBLEP** corrections at the discontinuities to suppress aliasing at low cost [F, Finke]. Or keep the aliasing deliberately for an authentic harsh chip sound [O].

**Triangle.** Use the built-in `"triangle"` type, or build the NES-style 32-step quantized triangle as a PeriodicWave or a worklet table. The stepping is a large part of the "8-bit bass" character [O].

**Noise.** Pre-generate one AudioBuffer per mode with a 15-bit LFSR and loop it with an `AudioBufferSourceNode`. Pitch it via `playbackRate`, or regenerate it in a worklet. **Seed it** so renders are reproducible [O].
- jsfxr uses `Math.random()` for its noise buffer, so its output is not reproducible [F, source].
- ZzFX uses `Math.sin(t**3)` as deterministic pseudo-noise. Its randomness comes only from the `randomness` pitch-jitter parameter [F, source].

### 3.2 Envelopes, vibrato, arpeggio, slides

- **Envelopes.** Use AudioParam automation on a GainNode: `setValueAtTime`, `linearRampToValueAtTime`, `setTargetAtTime`. Always ramp from the current value, and use attacks and releases of at least about 2–5 ms to avoid clicks [O].
- **Automation cost.** Automation events cost CPU, and "it is even more efficient to not use AudioParam if not necessary" [F, Adenot]. Long event lists on one param are a known cost. Swapping the envelope node periodically clears its list [F, Adenot].
- **Vibrato.** An LFO OscillatorNode feeds a GainNode (depth in cents), which drives the oscillator's `detune` AudioParam. A *delayed* vibrato (depth ramps in after about 150 ms) is the classic chip lead sound [O].
- **Arpeggio (chip "chords").** Step the frequency at a fixed tick, for example 1/60 s, which is the classic frame-rate driver update [U, common practice]. With native nodes that means one `setValueAtTime` per tick. In a worklet it's a counter.
- **Slide/portamento.** Use `exponentialRampToValueAtTime` on frequency.

### 3.3 Sequencer: "A Tale of Two Clocks"

**The technique [F]** (Chris Wilson):
- A JS timer fires every **25 ms** and schedules every note whose time falls within the next **100 ms**, using `audioContext.currentTime` as the master clock.
- JS timers alone are unreliable because "layout, rendering, garbage collection, and XMLHTTPRequest and other callbacks" can delay them by tens of milliseconds.

**Implications for a game [O]:**
- Lookahead must cover the worst main-thread stall. WebGL frame spikes and GC pauses argue for 100–200 ms.
- Interactive SFX should bypass the sequencer and start at `currentTime`. Only *musical* stingers are quantized to the next beat.
- Tempo or layer changes take effect after up to one lookahead window, which is fine for this genre.

**The alternative is a sequencer inside an AudioWorklet** [O, F for AudioWorklet]:
- The worklet runs on the audio rendering thread [F].
- It needs a secure context [F], and has been widely available since April 2021 [F].
- A sequencer that counts samples there is sample-accurate and immune to main-thread jank. The main thread only posts state changes (layers, stingers) over `port`.
- [U] Whether `capacitor://` and `https://localhost` origins count as secure contexts for AudioWorklet on every target needs testing.

### 3.4 Effects

- **Low-pass and high-pass** (BiquadFilterNode): "relatively cheap (five multiplication and four additions per sample)" [F]. A music-bus low-pass is useful for "night", "muffled" or "pause menu" states [O].
- **Delay/echo:** a DelayNode with a feedback GainNode and a low-pass inside the loop. It's moderately priced, and memory scales with delay length × channels [F]. For chiptune, a tempo-synced dotted-eighth echo gives most of the "space" [O].
- **Reverb:** ConvolverNode is "very expensive, and depending on the duration of the convolution impulse" [F]. Prefer one of these:
  - a short synthetic impulse response used *only* in offline renders;
  - a tiny Schroeder or feedback-delay-network reverb in the worklet;
  - no reverb (authentic chip style). [O]
- **Bitcrush:** a WaveShaper or worklet sample-and-hold. WaveShaper supports 2×/4× oversampling to reduce aliasing [F, spec].
- **Safety limiter:** a DynamicsCompressorNode on the master bus. This is a safety net, not the mixing strategy [O].

### 3.5 CPU and mobile

- **Android latency** "can vary between 12.5ms … up to 150ms" [F, Adenot]. That matters for SFX feel, not for music.
- **AudioContext options** [F]:
  - `latencyHint`: `"interactive"` (the default; lowest latency, more power), `"balanced"`, or `"playback"` (minimizes power, suited to music).
  - `sampleRate` can be specified. Typical rates are 8–96 kHz.
  - [O] One shared context with `"balanced"` is a reasonable default for a cozy sim. A 22.05 or 32 kHz synth rate is authentic lo-fi and halves the DSP cost, but the browser then resamples to the device rate.
- **Budget [O, back-of-envelope]:** 8 voices × 48,000 samples/s × about 30 operations ≈ 11.5 M operations/s. That's negligible on any 2020+ phone, whether built from native nodes or worklet DSP. The real costs are GC from creating many nodes per note (native approach), convolution, and keeping the context running in the background (battery). Suspend it on `visibilitychange` [O].
- **Memory if stems are prerendered [O]:** a 90 s loop at 48 kHz in mono float32 is about 17 MB **per stem**. Four stems is about 70 MB, which is too much for low-end mobile. That argues for real-time synthesis in the game and prerendering only in the studio and for SFX.

### 3.6 Two runtime architectures [O]

| | A) Native node graph per note | B) Own DSP (pure TS) in AudioWorklet |
|---|---|---|
| Effort | Lowest. Oscillators, PeriodicWave, gains, biquads | Moderate. Write oscillators, envelopes, LFSR, PolyBLEP and the sequencer |
| Timing | Lookahead scheduler on the main thread | Sample-accurate inside the worklet |
| Determinism | Browser-dependent output | Bit-identical everywhere (same code, same floats) [O] |
| Offline render | OfflineAudioContext in a browser [F]. Not in plain Node | The same code runs in Node, so the CLI can render and measure without a browser |
| Godot port | Rewrite against Godot's audio API | Port about 1k lines of DSP to GDExtension/C#. GDScript is too slow: the docs recommend C# or GDExtension, or 11–22 kHz in GDScript [F]. Or bake stems |
| Risks | Node churn and GC; event-list cost | Worklet availability and secure-context quirks in WebViews [U]; must avoid allocation in `process()` |

Recommendation: **B as the reference ("the player spec")**, with A acceptable for throwaway prototypes [O].

---

## 4. Sound effects

### 4.1 sfxr (DrPetter, 2007, MIT) [F]

sfxr was made for Ludum Dare 10. You hit randomize or a category button, then tweak sliders [F]. Its parameter set, as named in jsfxr (Unlicense) [F]:

| Group | Parameters (normalized 0–1; "S" marks signed −1..1) |
|---|---|
| Wave | `wave_type` (square, sawtooth, sine, noise) |
| Envelope | `p_env_attack`, `p_env_sustain`, `p_env_punch` (sustain punch), `p_env_decay` |
| Pitch | `p_base_freq` (start frequency), `p_freq_limit` (min frequency cutoff), `p_freq_ramp` S (slide), `p_freq_dramp` S (delta slide) |
| Vibrato | `p_vib_strength`, `p_vib_speed` |
| Arpeggio ("change") | `p_arp_mod` S (change amount), `p_arp_speed` (change speed) |
| Duty | `p_duty` (square duty), `p_duty_ramp` S (duty sweep) |
| Retrigger | `p_repeat_speed` |
| Flanger/phaser | `p_pha_offset` S, `p_pha_ramp` S |
| Filters | `p_lpf_freq`, `p_lpf_ramp` S, `p_lpf_resonance`, `p_hpf_freq`, `p_hpf_ramp` S |
| Output | `sound_vol`, `sample_rate`, `sample_size` |

**Units are non-linear** [F, jsfxr source]:
- Each envelope stage lasts `p² × 100000` samples at 44.1 kHz, so at most about 2.3 s.
- Start frequency in Hz is `8·44100·(p²+0.001)/100`, so p=0.3 gives about 321 Hz and p=1 about 3.5 kHz.

**Presets** [F]: `pickupCoin`, `laserShoot`, `explosion`, `powerUp`, `hitHurt`, `jump`, `blipSelect` (jsfxr adds `synth`, `tone`, `click`, `random`). They are just randomized parameter recipes.
- Example: `pickupCoin` uses a sawtooth, base frequency 0.4–0.9, short sustain, punch 0.3–0.6, and an arpeggio jump half the time. That is the classic two-note coin.
- Serialization [F]: JSON, a base58 short string, or WAV. A Godot port, **gdfxr** (MIT), stores `.sfxr` files of about 100 bytes that are imported as ordinary AudioStreams. Nothing is generated at runtime, and generating long sounds in GDScript can stall the editor [F].

**Bfxr** extends sfxr. The legacy Flash/AIR version is Apache-2.0. In March 2025 it was superseded by **Bfxr2** (MIT, JavaScript), which adds a port of Obiwannabe's footstep generator [F]. Bfxr's extra parameters were not enumerated in this session [U].

**Takeaway [O].** sfxr's *vocabulary* is excellent, because LLMs and humans both know it. Its *units* are LLM-hostile: normalized, squared and sample-based. We should keep the vocabulary and use physical units.

### 4.2 ZzFX and ZzFXM (Frank Force; Keith Clark; MIT) [F]

ZzFX v1.4.0 takes **21 positional params** with these defaults:

`volume=1, randomness=.05, frequency=220, attack=0, sustain=0, release=.1, shape=0, shapeCurve=1, slide=0, deltaSlide=0, pitchJump=0, pitchJumpTime=0, repeatTime=0, noise=0, modulation=0, bitCrush=0, delay=0, sustainVolume=1, decay=0, tremolo=0, filter=0`

- **Shapes:** 0 sine, 1 triangle, 2 saw, 3 tangent, 4 noise, 5 square with duty via `shapeCurve`.
- **Units:** seconds and Hz.
- **Filter:** a biquad whose sign selects high-pass (positive) or low-pass (negative). I read this from the coefficients in the source [F/O].
- **Size:** the micro build is under 1 KB.
- **Exports:** compact or full code, LittleJS, Lua and WAV. The designer page has Pickup, Powerup, Shoot, Note, Jump, Blip, Hit and Explosion buttons, plus Random and Mutate.
- **Positional arrays are compact but opaque.** `zzfx(...[,,925,.04,.3,.6,1,.3,,6.27,-184,.09,.17])` is neither diffable nor reviewable by the owner [O].

ZzFXM songs (format summarized in §2.1 (f)) reuse ZzFX parameter arrays as instruments [F].

### 4.3 Typical Kairosoft-style event sounds

I found no sourced description of Kairosoft's audio direction or composers [U]. One review notes Hot Springs Story "has barely any sound effects" [F, Pocket Gamer via search]. Everything below is **design opinion [O]**, based on music-theory conventions.

| Event | Recipe | Notes |
|---|---|---|
| Coin / sale | 2 notes, short pulse at 50% duty. Rising fourth (e.g. B5→E6), ≈50 ms + 150 ms decay | Rate-limit it. When many sales land at once, play the pitches **up the current scale** (pentatonic) so it sounds like a glissando, not noise |
| Heart / like / happy customer | Triangle or sine, rising major third, soft attack, light vibrato | Quieter than coins, −6 dB relative |
| Level-up / skill up | Ascending major arpeggio 1-3-5-8 at 16ths, held top note with delayed vibrato, ≈0.8–1.2 s | **Key-aware:** transpose to the music's key, or duck the music by 6–9 dB |
| Combo ×n | Same blip, pitch +1 scale step per combo count, capped at an octave, then a "sparkle" | Stops the combo from sounding like spam |
| Rank-up / award / new product hit (fanfare) | 1–2 bars, I–IV–V–I, pulse "brass" in 3rds, noise snare roll into a final chord | Quantize to the next beat and duck the music. This is musically a mini-song, so use the song format |
| Fail / complaint | Descending minor second or tritone, low pulse at 12.5% duty, short | Never louder than the success sounds; cozy genre |
| UI click / select | sfxr-style "blip": 20–40 ms square, slight downward slide | The most frequent sound, so the quietest and least bright |

---

## 5. Game-audio design for this genre

### 5.1 Cozy loops

**[F]** Precedent for time-aware cozy music: the Animal Crossing series is "known for its 'hourly music'" (Wikipedia). I didn't verify the weather and seasonal variants in this session [U].

**[O]** Practical guidance:
- **Tempo, key and harmony:** 90–120 BPM, major or Mixolydian keys, I–vi–IV–V and ii–V–I loops.
- **Form:** 16–32 bars (≈45–90 s) in AABA or ABAC form. The last bar is a turnaround that leads seamlessly back to bar 1.
- **Density:** leave rests. A melody with ≥25% silent steps and long notes fatigues less over hours of play.
- **Brightness:** limit high-duty brightness. Use a 25% duty lead and triangle bass, and add a gentle bus low-pass (e.g. 8–10 kHz).
- **Melodic interest:** one hummable 2-bar motif, varied rather than repeated verbatim.
- **Fatigue test:** the real test is "the 40th loop", not the first listen. The studio should make that test easy (§6).

### 5.2 Adaptive music by game state

**[F]** Vertical re-orchestration means "musical layers are added and removed in response to game events … without interrupting the flow". Horizontal re-sequencing transitions between pieces by crossfade, phrase branching or bridge transitions (Wikipedia, *Adaptive music*).

**[F]** For the future Godot port: Godot 4.3 added `AudioStreamInteractive`, `AudioStreamPlaylist` and `AudioStreamSynchronized` "to create complex, layered music and transitions". Interactive transitions can trigger immediately, on the next beat, on the next bar or at clip end, with cross-fades measured in beats.

**[O] Mapping to Wallhammer Zero states:**

| Game state | Technique | Data mechanism |
|---|---|---|
| Rush hour / busy shop | Vertical: add a percussion layer, maybe a counter-melody | `states.rush = [base, melody, groove]` |
| Season (spring→winter) | Re-orchestration of the *same* notes: swap instruments (pulse lead → triangle and bell; add echo) | `orchestrations.winter` patches the instruments |
| Night / closing time | Drop drums; bus low-pass | `states.night = {layers, lowpassHz}` |
| Festival / special event | Horizontal: switch section or song at the next bar boundary | `transitions` with `at: "bar"` |
| Year-end ranking ceremony | Stop the loop, play a fanfare jingle, then resume | Stinger with `duck` and `resume: "bar"` |

Avoid tempo changes inside a loop. They complicate sync, and layering conveys intensity better [O].

### 5.3 Stingers [O]

- **Priority classes:** UI (immediate, unquantized) < reward (immediate) < musical stinger (quantized to the next beat, key-aware, ducks music).
- **Polyphony caps per sound id** (e.g. max 3 coins at once) plus a minimum retrigger interval (≈40 ms). Seeded pitch jitter of ±20–30 cents avoids the "machine gun" effect. ZzFX's default 5% randomness serves the same purpose [F].
- **Ducking** is a gain ramp on the music bus (−6 to −9 dB, 30 ms attack, 300 ms release). No real sidechain is needed.

### 5.4 Mixing and loudness

- **[F] Measurement** follows ITU-R BS.1770:
  - K-weighting filter;
  - momentary loudness (400 ms), short-term (3 s) and integrated (gated: absolute gate −70 LKFS, relative gate −10 LU);
  - **true peak** via oversampling.
- **[F] Targets:** Sony's ASWG-R001 (2013) set **−24 LUFS** for home consoles, later echoed by Microsoft, Nintendo and IESD. PlayStation's guidance cites **−18 LUFS ±2 LU for mobile/portable**. Commentators argue a single mobile standard makes little sense, and iTunes Sound Check's −16.2 LUFS is another benchmark.
- **[O] Proposed internal targets:**
  - music loops at −18 LUFS integrated (±1);
  - SFX measured by short-term peak loudness relative to the music (UI −6 LU below the music, rewards about level, fanfares +2 LU but ducking the music);
  - true peak ≤ −1 dBTP on the master.
- **[O] Gain staging for chip voices:** a full-scale square wave has an RMS equal to its peak (a sine's RMS is 0.707 of peak). Summing 4 square voices at unity gain clips at once. Default channel gains should sit around −10 to −16 dB.
- **[O] Normalization** belongs in a sidecar `trimDb` computed by the CLI. Don't re-render, and don't edit composed gains.

### 5.5 Mobile audio unlock and lifecycle

- **[F] Browsers.** "If an AudioContext is created before the document receives a user gesture, it will be created in the 'suspended' state, and you will need to call resume() after the user gesture" (Chrome). MDN: "Create or resume context from inside a user gesture."
- **[F] iOS.** Web Audio "only plays if the device isn't muted", unlike `<audio>` (2023). The **AudioSession API** (`navigator.audioSession.type`, values `auto`/`playback`/`ambient`/…) was behind a flag in Safari 16.4 beta, and is *experimental and not Baseline* (MDN).
  - Open WebKit bugs describe AudioContexts that report `running` with `currentTime` frozen after foregrounding (bug 263627), contexts failing to resume in WKWebView after suspend when playback started without a gesture (240646), and an incoming call permanently muting WKWebView audio (243727; reported on iOS 15.6, and a WebKit engineer could not reproduce it on the iOS 16 beta).
  - [U] Whether `audioSession` is exposed in WKWebView, and therefore in Capacitor, needs a device test.
  - [O] A native audio-session plugin may be the robust route for Capacitor iOS.
- **[F] Desktop wrappers.**
  - Electron's `webPreferences.autoplayPolicy` defaults to `no-user-gesture-required`.
  - Tauri uses WebView2 (Chromium) on Windows, the system WebView on Android, WKWebView on macOS and iOS, and **webkit2gtk on Linux, whose versions "vary significantly across distributions"**.
  - [O] So Tauri inherits WebKit's Web Audio quirks on macOS and Linux. Electron gives the most uniform audio behaviour.
- **[O] Lifecycle checklist:**
  - one AudioContext;
  - an unlock on the first tap (title screen "Tap to start" is genre-appropriate);
  - `visibilitychange`: suspend; on return, resume and verify that `currentTime` advances, otherwise recreate the context;
  - persist a mute toggle;
  - separate music and SFX volume sliders.

### 5.6 Offline rendering for previews and waveforms

- **[F]** `OfflineAudioContext(channels, length, sampleRate)` renders "as fast as it can" to an AudioBuffer via `startRendering()`. `suspend()` and `resume()` allow mid-render changes. This covers browser-side previews if the runtime uses native nodes.
- **[O]** With architecture B, the same DSP runs in a Web Worker (studio) or in Node (CLI) to produce:
  - WAV;
  - min/max peak arrays for waveform drawing;
  - a spectrogram PNG and a piano-roll PNG;
  - `metrics.json` (LUFS-I, max short-term, dBTP, clip count, loop-seam discontinuity, note range per channel, out-of-key count, unique-bar ratio).

  Renders are cached by content hash.
- **Learning references:** libebur128 (MIT) for BS.1770 metering; wavesurfer.js (BSD-3) for waveform UI [F].

---

## 6. Studio: how the owner previews and judges audio

### 6.1 Music review screen [O]

1. **Step-grid / piano-roll view per channel.** Colour by instrument. Add a **chord lane and key** above, and highlight notes flagged by the validator (out of key, clashing on a strong beat). Learning references: Signal (web piano-roll MIDI editor, MIT) and BeepBox/JummBox pattern UI (MIT) [F].
2. **Transport:**
   - play / loop / loop region;
   - **loop-seam audition**: play the last 2 bars into the first 2 bars;
   - tempo ±10% preview (non-destructive);
   - **"40× loop"**: background play while the owner works, to judge fatigue.
3. **Per-channel mute/solo.** Render each channel as a stem once, then mute/solo is just a gain change, with no re-render.
4. **Game-state simulator.** Toggle buttons for states (calm / rush / night / winter) apply layers and orchestration live, including the transitions.
5. **A/B variants:**
   - The generator should usually produce 2–3 variants per brief.
   - Studio playback is **loudness-matched** (same LUFS), because louder versions tend to be preferred regardless of quality. That's general audio-practice knowledge; I didn't find a source in this session [U].
   - Optional **blind mode**: X is randomly A or B, ABX-style [F, for the procedure].
6. **In-context preview.** Play the loop under the actual game scene, or a screenshot plus a recorded SFX bed, at in-game mix levels.
7. **Device check.** A "phone speaker" toggle (high-pass at about 250–300 Hz plus mono) reveals bass lines that vanish on phones [O].
8. **Metrics panel:** LUFS-I, dBTP, length, BPM, key, note ranges, validator warnings and the render hash.

### 6.2 SFX board [O]

- A grid of all SFX tiles, each with a waveform, play button, duration and loudness.
- **"Spam ×10"** (rapid retrigger at the declared rate limit) and **"over music"** (plays on top of the current loop with ducking).
- **"Mutate ×6"**: the CLI makes six seeded variations, as in sfxr and ZzFX's mutate idea [F]. The owner picks one and the pick is written back.
- Group tiles by event family (coins, UI, rewards, fanfares) so consistency within a family is visible.

### 6.3 Verdicts back to data [O]

- **One review file per asset revision.** It sits next to the asset and is written by the studio.
- **Content hash.** The file references the asset's content hash. If the asset changes, the verdict is marked stale automatically.
- **Musical anchors.** Comments are anchored to `{section, bar, beat, channel}` or `{state}`, never to seconds, because tempo edits move seconds. Claude can then map "bar 6, lead, sounds sour" to `sections.B.lead[1]` deterministically.
- **Statuses:** `approved`, `rejected` or `changes`, plus a `variantPick` field for A/B.
- **Claude's loop:** read open comments → edit data → re-render plus metrics → write a short change log into the review thread → the owner re-listens. The studio shows a **piano-roll diff** between revisions: added notes in green, removed in red.

---

## Recommendations for Wallhammer Zero

*These are proposals for the owner to decide on, not decisions.*

1. **Treat music and SFX as data, played by one deterministic reference synth [O].**
   - Write the synth in plain TypeScript with no Web Audio dependency, at about 1k lines: pulse with PolyBLEP, a 4-bit triangle option, a seeded LFSR noise with two modes, an optional 32-sample wave channel, ADSR, vibrato, arpeggio, slide, echo, a one-pole/biquad low-pass, and a sample-counting sequencer.
   - Host it in four places: (a) a Node CLI for render, metrics and PNGs; (b) the studio, in a Web Worker rendering to AudioBuffers and stems; (c) the game, in an AudioWorklet; (d) Godot later, as a GDExtension/C# port, or by baking stems and using `AudioStreamSynchronized` and `AudioStreamInteractive` [F].
2. **Adopt a step-grid JSON song format with a chord lane and validators.** It structurally prevents the misaligned-bar errors seen in LLM music research [F] and gives the studio a piano roll for free (see the proposal below).
3. **Give the generator ears by proxy.** Every write goes through the CLI and returns a strict parse, step counts, key and chord lint, repetition and density stats, LUFS and dBTP, a loop-seam check, and piano-roll and spectrogram PNGs that Opus can inspect. Treat failures as compile errors [O]. This mirrors the "measure then ship" pattern of the September demos [F].
4. **Composition procedure in the generator prompt [O]:** brief → form and length → chords → bass → 2-bar motif → melody as variations of the motif → drums → orchestration and states → mix. Produce 2–3 variants and let the owner A/B them.
5. **SFX:** a named-parameter schema in physical units, inspired by the sfxr and ZzFX vocabulary [F]. Seeded and baked to AudioBuffers at load time. Short multi-note jingles and fanfares use the song format with `loop: false` [O].
6. **Loudness pipeline [O]:** music −18 LUFS-I (±1), master ≤ −1 dBTP, SFX levels relative to the music, trims stored in sidecars.
7. **Mobile [O]:**
   - one AudioContext with `latencyHint: "balanced"`;
   - unlock via "Tap to start";
   - suspend on hide, then resume and verify `currentTime`;
   - test early on a real iPhone inside Capacitor for the mute switch, backgrounding and incoming calls [F, WebKit bugs];
   - prefer Electron over Tauri for desktop if audio uniformity matters [O, F for the webview matrix].
8. **Studio [O]:** step grid / piano roll with a chord lane, mute/solo via stems, a state simulator, loop-seam audition, loudness-matched (optionally blind) A/B, an SFX board with spam and over-music tests, and review files anchored to musical coordinates.
9. **Licences [O]:** learn from MIT/BSD/Unlicense projects (sfxr, jsfxr, ZzFX/ZzFXM, BeepBox, GDSiON, Tone.js, abcjs, Signal). Read GPL/AGPL projects (Furnace, FamiTracker forks, the SoundBox editor, Strudel, TidalCycles) only for concepts and never paste their code.

### Proposed minimal data formats (proposal only)

**Music: `audio/music/bgm.shop.day.song.json`**

```json
{
  "format": "wz.song/0.1",
  "id": "bgm.shop.day",
  "title": "Morning Counter",
  "tempo": 108, "meter": [4, 4], "stepsPerBeat": 4, "swing": 0.1,
  "key": "F major",
  "instruments": {
    "lead": { "wave": "pulse", "duty": 0.25,
              "env": { "a": 0.004, "d": 0.12, "s": 0.55, "r": 0.08 },
              "vibrato": { "cents": 15, "hz": 5.5, "delay": 0.18 } },
    "keys": { "wave": "pulse", "duty": 0.125, "arpHz": 60,
              "env": { "a": 0.002, "d": 0.20, "s": 0.0, "r": 0.05 } },
    "bass": { "wave": "triangle", "steps": 32,
              "env": { "a": 0.002, "d": 0.05, "s": 0.9, "r": 0.04 } },
    "kit":  { "drums": {
              "k": { "wave": "noise", "mode": "long",  "pitch": "C2", "env": { "a": 0, "d": 0.08, "s": 0, "r": 0 } },
              "s": { "wave": "noise", "mode": "long",  "pitch": "A4", "env": { "a": 0, "d": 0.12, "s": 0, "r": 0 } },
              "h": { "wave": "noise", "mode": "short", "pitch": "C7", "env": { "a": 0, "d": 0.03, "s": 0, "r": 0 } } } }
  },
  "channels": {
    "lead":  { "instrument": "lead", "gainDb": -11, "pan": -0.15 },
    "keys":  { "instrument": "keys", "gainDb": -17, "pan": 0.20,
               "echo": { "beats": 0.75, "feedback": 0.3, "mix": 0.2 } },
    "bass":  { "instrument": "bass", "gainDb": -9 },
    "drums": { "instrument": "kit",  "gainDb": -15 }
  },
  "sections": {
    "A": {
      "chords": ["F", "Dm", "Bb", "C"],
      "lead":  ["A4 . . . | C5 . . . | F5 - - - | E5 . D5 .",
                "D5 - - - | . . . . | A4 . C5 . | D5 . . .",
                "Bb4 . D5 . | F5 - - - | G5 . F5 . | D5 . . .",
                "E5 - - - | G5 - - - | . . . . | . . . ."],
      "keys":  ["F4@047 . . . | . . . . | F4@047 . . . | . . . .",
                "D4@037 . . . | . . . . | D4@037 . . . | . . . .",
                "Bb3@047 . . . | . . . . | Bb3@047 . . . | . . . .",
                "C4@047 . . . | . . . . | C4@047 . . . | . . . ."],
      "bass":  ["F2 . . . | C3 . . . | F2 . . . | C3 . A2 .",
                "D2 . . . | A2 . . . | D2 . . . | A2 . F2 .",
                "Bb1 . . . | F2 . . . | Bb1 . . . | F2 . D2 .",
                "C2 . . . | G2 . . . | C2 . . . | E2 . G2 ."],
      "drums": ["k . h . | s . h . | k . h k | s . h .", "=0", "=0", "k . h . | s . h . | k . s . | s s s s"]
    },
    "B": { "chords": ["Bb", "C", "Am", "Dm"], "...": "same shape" }
  },
  "order": ["A", "A", "B", "A"],
  "loop": { "fromOrderIndex": 0 },
  "layers": { "base": ["bass", "keys"], "melody": ["lead"], "groove": ["drums"] },
  "states": {
    "calm":  { "layers": ["base", "melody"] },
    "rush":  { "layers": ["base", "melody", "groove"] },
    "night": { "layers": ["base"], "lowpassHz": 1800 }
  },
  "orchestrations": {
    "winter": { "lead": { "wave": "triangle" }, "keys": { "duty": 0.5 } }
  },
  "transitions": { "default": { "at": "bar", "fadeBeats": 1 } }
}
```

**Grammar sketch:**
- One string = one bar. `|` separates beats, and each beat has exactly `stepsPerBeat` tokens.
- `C#5` or `Bb4` triggers a note.
- `-` holds the previous note and `.` is silence.
- `X@047` is an arpeggio with semitone offsets 0, 4, 7.
- An optional `:1`–`:9` suffix sets velocity.
- `"=0"` repeats bar 0 of the same channel and section. This makes repetition explicit, cheap and measurable.

**Sidecar written by the CLI, never by hand:** `bgm.shop.day.render.json` holding `{hash, lufsI, dBTP, trimDb, warnings[]}`.

**SFX: `audio/sfx/sfx.coin.sfx.json`**

```json
{
  "format": "wz.sfx/0.1",
  "id": "sfx.coin",
  "seed": 7,
  "gainDb": -8,
  "play": { "jitterCents": 25, "maxVoices": 3, "minIntervalMs": 40, "scaleAware": true },
  "voices": [
    { "wave": "pulse", "duty": 0.5,
      "notes": [["B5", 0.05], ["E6", 0.20]],
      "env": { "a": 0.001, "d": 0.0, "s": 1.0, "r": 0.15 },
      "slideSemitonesPerSec": 0, "lowpassHz": 9000 }
  ]
}
```

Further optional voice fields: `vibrato`, `dutySweep`, `repeatSec`, `noiseMode`, `hpHz` and `bitcrushHz`. These are the sfxr vocabulary in physical units. An `import: {sfxr: "...b58..."}` field could convert legacy sfxr sounds into this schema [O].

**Jingle: a song with `loop: false`.** For example, `jingle.levelup` with `"tempo": 150`, one section of 2 bars, `"keyAware": true` and `"duckMusicDb": -8`.

**Review (written by the studio): `audio/music/bgm.shop.day.review.json`**

```json
{
  "asset": "audio/music/bgm.shop.day.song.json",
  "revision": "sha256:…",
  "verdict": "changes",
  "variantPick": null,
  "comments": [
    { "id": "c1", "at": { "section": "B", "bar": 2, "beat": 3, "channel": "lead" },
      "text": "This note sounds sour", "status": "open" },
    { "id": "c2", "at": { "state": "rush" }, "text": "Hi-hats too loud in rush", "status": "open" }
  ],
  "reviewedAt": "2026-10-02T10:00:00Z"
}
```

---

## Open questions for the owner

1. **Aesthetic target:** strict NES/Game Boy authenticity (aliasing, 4 channels, no reverb), or "chip-inspired cozy" (band-limited, echo, soft low-pass, 6–8 channels)? This drives the synth spec.
2. **Voxel games:** should they share the chip palette, or get a softer "music-box / FM" instrument set?
3. **Godot later:** port the synth for real-time adaptive music, or bake stems and use Godot's interactive streams? Baking is simpler, but costs memory and per-state stems.
4. **Desktop wrapper:** is audio uniformity a reason to prefer Electron over Tauri (WebKit on macOS and Linux)?
5. **Loudness:** do you accept −18 LUFS-I music and ≤ −1 dBTP as house targets? Should the game offer separate Music and SFX sliders plus a master mute?
6. **Review workload:** how many variants per brief do you want to A/B (2 or 3)? Should blind A/B be the default?
7. **Adaptivity scope for game 1:** which states matter (season, time of day, rush, event, ceremony)? How many loops per game: 4–6 BGM plus about 30 SFX plus 5 jingles?
8. **Sound identity:** should every game have a recurring "studio signature" (e.g. the same coin sound or level-up motif across titles)?
9. **Reference listening:** can you name 3–5 tracks or games whose feel you want, so the generator can be briefed with concrete descriptors?

---

## Sources

**Evidence (LLM music)**
- Voxyz_ai, *small print* post (2026-09-22): https://x.com/Voxyz_ai/status/2102531681450119426 (text read via https://api.fxtwitter.com/Voxyz_ai/status/2102531681450119426)
- A.J. (@aj_dev_smith), one-shot "bass music with javascript" (2026-09-22): https://x.com/aj_dev_smith/status/2102504509637587339
- "Opus 5.5 paints, animates and scores music with code alone" (reality-check quote): https://newfacedesign.com/blog/claude-opus-5-5-art-animation-from-code
- awesome-claude-video list: https://github.com/opusvideo/awesome-claude-video
- PixelKits (Opus 5.5 test game, WebAudio chiptune): https://github.com/aryanyaksh-art/PixelKits
- claude-animation-studio plugin: https://github.com/i-afaqrashid/claude-animation-studio
- iart-ai javascript-animation-skills (soundtrack skill, MIT): https://github.com/iart-ai/javascript-animation-skills and https://www.iart.ai/blog/ai-javascript-animation
- game-creator "game-audio" skill (lookahead sequencer; Strudel AGPL note): https://www.claudepluginhub.com/skills/opusgamelabs-game-creator/game-audio
- Anthropic, Claude Opus 5.5 announcement: https://www.anthropic.com/news/claude-opus-5-5
- Can LLMs "Reason" in Music? (ISMIR 2024): https://arxiv.org/abs/2407.21531
- ChatMusician: https://arxiv.org/abs/2402.16153
- MuPT (SMT-ABC): https://arxiv.org/abs/2404.06393
- LLMs' Internal Perception of Symbolic Music (LREC 2026): https://arxiv.org/html/2507.12808v1 and https://aclanthology.org/2026.lrec-1.733/

**Representations**
- ABC standard 2.1: https://abcnotation.com/wiki/abc:standard:v2.1
- Music Macro Language: https://en.wikipedia.org/wiki/Music_Macro_Language
- Music tracker: https://en.wikipedia.org/wiki/Music_tracker
- @tonejs/midi (MIT): https://github.com/Tonejs/Midi
- ZzFXM (MIT): https://github.com/keithclark/ZzFXM
- BeepBox (MIT): https://github.com/johnnesky/beepbox; JummBox (MIT): https://github.com/jummbus/jummbox
- GDSiON (MIT, MML for Godot): https://github.com/YuriSizov/gdsion; Bosca Ceoil Blue (MIT): https://github.com/YuriSizov/boscaceoil-blue
- abcjs (MIT): https://github.com/paulrosen/abcjs
- Furnace (GPL-2.0+): https://github.com/tildearrow/furnace; Dn-FamiTracker (GPL-3.0+): https://github.com/Dn-Programming-Core-Management/Dn-FamiTracker
- libopenmpt (BSD-3): https://github.com/OpenMPT/openmpt; chiptune2.js: https://github.com/deskjet/chiptune2.js
- SoundBox (editor GPL-3, player zlib): https://github.com/mbitsnbites/soundbox
- Strudel (AGPL-3.0): https://codeberg.org/uzu/strudel; TidalCycles (GPL-3.0): https://github.com/tidalcycles/Tidal
- Tone.js (MIT): https://github.com/Tonejs/Tone.js; Signal (MIT): https://github.com/ryohey/signal

**WebAudio**
- A Tale of Two Clocks (Chris Wilson): https://web.dev/articles/audio-scheduling
- createPeriodicWave (MDN): https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/createPeriodicWave
- Web Audio API spec (PeriodicWave generation and normalization, oscillator aliasing, WaveShaper oversampling): https://webaudio.github.io/web-audio-api/
- Web Audio performance notes (Paul Adenot): https://padenot.github.io/web-audio-perf/
- AudioWorklet (MDN): https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- AudioContext constructor (MDN): https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext
- OfflineAudioContext (MDN): https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext
- Web Audio best practices (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- PolyBLEP oscillator (Martin Finke): https://www.martin-finke.de/articles/audio-plugins-018-polyblep-oscillator/
- NES APU (NESdev wiki): https://www.nesdev.org/wiki/APU

**SFX**
- sfxr (MIT): https://drpetter.se/project_sfxr.html
- jsfxr (Unlicense; parameter names and presets read from source): https://github.com/chr15m/jsfxr
- Bfxr (Apache-2.0, legacy): https://github.com/increpare/bfxr; Bfxr2 (MIT): https://github.com/increpare/bfxr2
- ZzFX (MIT; parameter order read from source v1.4.0): https://github.com/KilledByAPixel/ZzFX and https://killedbyapixel.github.io/ZzFX/
- gdfxr (Godot sfxr port, MIT): https://github.com/timothyqiu/gdfxr

**Game-audio design, loudness, platforms**
- Adaptive music: https://en.wikipedia.org/wiki/Adaptive_music
- Animal Crossing (hourly music): https://en.wikipedia.org/wiki/Animal_Crossing
- Hot Springs Story review (Pocket Gamer): https://www.pocketgamer.com/hot-springs-story/review/
- Godot 4.3 release (interactive music streams): https://godotengine.org/releases/4.3/
- AudioStreamInteractive: https://docs.godotengine.org/en/stable/classes/class_audiostreaminteractive.html
- AudioStreamGenerator: https://docs.godotengine.org/en/stable/classes/class_audiostreamgenerator.html
- Mobile loudness (ASWG-R001, −24/−18 LUFS): https://audiomediainternational.com/mobile-loudness-an-adaptive-approach/
- BS.1770 glossary (gating, true peak): https://lupy-nocarryr.readthedocs.io/en/stable/glossary.html
- libebur128 (MIT): https://github.com/jiixyj/libebur128; wavesurfer.js (BSD-3): https://github.com/katspaugh/wavesurfer.js
- Chrome autoplay policy: https://developer.chrome.com/blog/autoplay
- AudioSession.type (MDN): https://developer.mozilla.org/docs/Web/API/AudioSession/type
- Jeremy Keith, Web Audio on iOS (mute switch, 2023): https://adactio.com/journal/19929
- WebKit bug 263627 (AudioContext not resumed on foreground): https://bugs.webkit.org/show_bug.cgi?id=263627
- WebKit bug 240646 (AudioContext fails to resume in WKWebView): https://bugs.webkit.org/show_bug.cgi?id=240646
- WebKit bug 243727 (WKWebView audio muted after call): https://bugs.webkit.org/show_bug.cgi?id=243727
- Electron WebPreferences (autoplayPolicy): https://www.electronjs.org/docs/latest/api/structures/web-preferences
- Tauri webview versions: https://v2.tauri.app/reference/webview-versions/
- ABX test: https://en.wikipedia.org/wiki/ABX_test
