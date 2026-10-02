# Audio: music and SFX as data

Music and sound effects are JSON files that a session writes (D4, D5, D10). One reference synth,
`packages/audio` (`@whz/audio`), turns them into samples: the same file gives the same samples on
every engine, so a WAV file is a build output and what is checked in is the song and the hash of
its PCM. A session cannot hear, so every write comes back as **numbers and pictures**: validator
findings with paths, loudness and peak, a piano roll and a spectrogram.

```sh
./dev npm run audio -- list                               # what exists
./dev npm run audio -- check --all                        # validators + goldens (the gate runs this)
./dev npm run audio -- render examples/music/shop-day     # WAV, stems, pictures, the sidecar
./dev npm run audio -- metrics examples/music/shop-day    # the numbers only, nothing written
```

The API of the package is in [packages/audio/README.md](../packages/audio/README.md). Playback in
a game and the studio screens are separate tasks (runtime audio, studio audio) and build on this.

## Where the files are

| Path | What |
|---|---|
| `audio/<pack>/music/<name>.song.json` | A song or a jingle (`wz.song/0.1`) |
| `audio/<pack>/sfx/<name>.sfx.json` | A sound effect (`wz.sfx/0.1`) |
| `audio/<pack>/…/<name>.render.json` | The sidecar that `render` writes next to each: the golden hash and the numbers. Checked in, never edited by hand. |
| `build/audio/<pack>/<music or sfx>/<name>/` | What `render` writes: WAV files and pictures. Not checked in. |

The **path id** of a file is `<pack>/music/<name>` or `<pack>/sfx/<name>`. The `id` inside the file
(`bgm.shop.day`) is what a game refers to and must be unique. Both find the file on the command
line. The examples are `audio/examples/music/shop-day.song.json` (an 8-bar loop with three
states and one orchestration), `audio/examples/music/fanfare.song.json` (a jingle) and the SFX
`coin`, `click` and `level-up` in `audio/examples/sfx/`.

JSON Schemas of both formats are in `packages/audio/schema/`. They check the structure (fields,
types, ranges); the bar strings, references and music rules are checked by the reader and the
validators, which `check` runs.

## The song format, `wz.song/0.1`

```json
{
  "format": "wz.song/0.1",
  "id": "bgm.shop.day",
  "title": "Morning Counter",
  "tempo": 108,
  "meter": [4, 4],
  "stepsPerBeat": 4,
  "key": "F major",
  "seed": 1,
  "instruments": {
    "lead": { "wave": "pulse", "duty": 0.25, "env": { "a": 0.005, "d": 0.12, "s": 0.6, "r": 0.08 } },
    "bass": { "wave": "triangle", "steps": 32, "env": { "a": 0.003, "d": 0.06, "s": 0.85, "r": 0.05 } },
    "kit": { "drums": { "k": { "wave": "triangle", "pitch": "C3", "slideSemitonesPerSec": -160, "env": { "a": 0, "d": 0.11, "s": 0, "r": 0.02 } } } }
  },
  "channels": {
    "lead": { "instrument": "lead", "gainDb": -17, "pan": -0.15 },
    "bass": { "instrument": "bass", "gainDb": -12 },
    "drums": { "instrument": "kit", "gainDb": -18 }
  },
  "sections": {
    "A": {
      "chords": ["F", "Dm"],
      "lead": ["A4 - C5 - | F5 - - - | . . E5 - | D5 - C5 -", "D5 - - - | . . A4 - | C5 - D5 - | . . . ."],
      "bass": ["F2 - - . | C3 - . . | F2 - - . | C3 - A2 -", "D2 - - . | A2 - . . | D2 - - . | A2 - F2 -"],
      "drums": ["k . . . | . . . . | k . . . | . . k .", "=0"]
    }
  },
  "order": ["A"],
  "loop": { "fromOrderIndex": 0 },
  "layers": { "base": ["bass"], "melody": ["lead"], "groove": ["drums"] },
  "states": { "calm": { "layers": ["base", "melody"] }, "rush": { "layers": ["base", "melody", "groove"] } },
  "orchestrations": { "winter": { "lead": { "wave": "triangle" } } }
}
```

The reader is strict: an unknown field, a missing field, a duplicate key, a number out of range
or a name that resolves to nothing is an error with the path of the place.

| Field | Meaning |
|---|---|
| `format`, `id` | `wz.song/0.1`; an id of lowercase letters and digits with `.`, `_` or `-` between them |
| `title` | Optional, for people |
| `tempo` | Beats per minute, a whole number 30–300 |
| `meter` | `[beats per bar, note value of a beat]`: 1–12 beats; 2, 4 or 8 |
| `stepsPerBeat` | 1–8; 4 gives sixteenth steps in 4/4 |
| `key` | A root and a mode: `F major`, `D minor`, `G mixolydian` (also dorian, phrygian, lydian, locrian). Used by the validators only. |
| `seed` | Optional (default 1), 0–4294967295: seeds the noise generators |
| `instruments` | Named sounds: a tone or a kit (below) |
| `channels` | Named channels, in mix order: `instrument`, `gainDb` (−60…6), optional `pan` (−1 left … 1 right) and `echo` |
| `sections` | Named sections: a `chords` lane and one list of bars per channel that plays in it |
| `order` | The sections in the order they are played; a name may repeat |
| `loop` | `{ "fromOrderIndex": n }`: at its end the song jumps back to that entry of `order` (what is before it is an intro). `false`: the song plays once, which is a **jingle**. |
| `layers` | Optional: named groups of channels. A channel in no layer always plays. |
| `states` | Optional: game states of an adaptive song; each lists the `layers` that sound and an optional `lowpassHz` (100–20000) on the whole mix |
| `orchestrations` | Optional: named sets of instrument changes (below) |

A song has at most 512 bars.

### The step grid

A channel's part in a section is **one string per bar**, with `|` between beats and one token per
step. Time is the position in the string, so channels cannot drift apart: a bar with the wrong
number of beats or steps is an error, not a song that slowly falls out of sync.

| Token | Meaning |
|---|---|
| `C#5`, `Bb4` | A note starts: letter, optional `#` or `b`, octave. `C4` is middle C. A melodic channel plays C1 to C7. |
| `-` | The note before it keeps sounding (also across a bar line) |
| `.` | Silence |
| `C4@047` | An arpeggio: the note, then +4 and +7 semitones, cycled at the instrument's `arpHz`. Two to four offsets, each one digit `0`–`9` or `a`, `b`, `c` for 10, 11, 12. One channel sounds like a chord. |
| `C5:9` | A velocity 1–9 after a colon; 7 if not given (the gain is the velocity divided by 7). 9 is an accent, 3 a ghost note. |
| `k`, `s`, `h` | In a kit channel: the keys of the kit's drums. A velocity works here too (`s:4`). |
| `=0` | The whole bar repeats bar 0 of the same channel in the same section. The bar it names must be written out. |

A melodic channel plays one note at a time; a new note starts the release of the one before it.
Chords are arpeggios or several channels.

The **chord lane** (`chords`) has one string per bar, and its length is the length of the section.
A bar holds one chord symbol, or several that share the bar equally (their number must divide
the beats: `"Am Dm"` in 4/4 is two beats each). Symbols: a root with an optional quality (`m`,
`5`, `6`, `m6`, `7`, `maj7`, `m7`, `9`, `add9`, `sus2`, `sus4`, `dim`, `dim7`, `m7b5`, `aug`) and an
optional slash bass (`C/E`); `-` means no chord (a drum break). The chord lane is not played. It
is what the validators check notes against, and what the piano roll prints above the bars.

Every channel that plays in a section has exactly as many bars as the chord lane. A channel may
be left out of a section; then it is silent there.

### Instruments

A **tone** is one voice in named parameters with physical units:

| Field | Meaning |
|---|---|
| `wave` | `pulse`, `triangle`, `noise` or `wave` |
| `env` | A linear ADSR: `a`, `d`, `r` in seconds (0–10), `s` as a level 0–1. Attack and release are never shorter than 1 ms, so no note starts or stops with a click. |
| `duty` | Pulse: `0.125`, `0.25` or `0.5` (default) |
| `steps` | Triangle: `32` for the stepped 4-bit triangle of the NES; left out, the triangle is smooth |
| `mode` | Noise: `long` (hiss, default) or `short` (metallic buzz) |
| `samples` | Wave: 32 hexadecimal digits, one four-bit sample each (`"89abcdeffedcba98…"`) |
| `vibrato` | `{ "cents", "hz", "delay" }`: depth 0–200 cents, rate 0.1–20 Hz, seconds before it fades in |
| `arpHz` | How many times a second an arpeggio steps (1–120, default 60) |
| `glide` | Seconds a note takes to glide in from the pitch of the note before it (0–2) |
| `slideSemitonesPerSec` | A steady pitch slide over the whole note (−480…480; negative is down) |

Fields that belong to another wave (a `duty` on a triangle) are accepted and ignored, so an
orchestration can swap the wave without rewriting the instrument.

A **kit** is `{ "drums": { "<key>": { …a tone…, "pitch": "C3" } } }`. A key is 1 to 4 lowercase
letters or digits. A drum plays at its fixed `pitch` (for noise, the pitch sets the rate of the
noise: `C8` is a hi-hat, `A5` a snare). A drum sounds for its attack and decay and then releases;
it needs no note-off, and `-` after a drum means nothing.

A channel's `echo` is `{ "beats", "feedback", "mix" }`: the delay in beats (0.05–4; 0.75 is a dotted
eighth in 4/4), feedback 0–0.9 and the level of the echoes 0–1. Each repeat is a little duller.

### Layers, states and orchestrations

- A **state** switches layers of the same song on and off (calm ↔ rush) and may low-pass the mix
  (night, a menu over the game). The player changes state on the next bar line and fades the
  layers over one beat; all channels keep playing underneath, so a layer comes back in time.
- An **orchestration** replaces fields of named tone instruments (`{ "lead": { "wave": "triangle" } }`)
  for a seasonal or regional variant of the same notes. A kit cannot be patched. Notes that start
  from the next bar line on use it.
- `render` writes one mix per state. Another orchestration is rendered on request
  (`--orchestration <name>`).

## The SFX format, `wz.sfx/0.1`

```json
{
  "format": "wz.sfx/0.1",
  "id": "sfx.coin",
  "seed": 7,
  "gainDb": -17,
  "play": { "jitterCents": 25, "maxVoices": 3, "minIntervalMs": 40 },
  "voices": [
    { "wave": "pulse", "duty": 0.5, "notes": [["B5", 0.06], ["E6", 0.12]], "env": { "a": 0.001, "d": 0, "s": 1, "r": 0.18 }, "lowpassHz": 9000 }
  ]
}
```

An SFX is 1 to 8 **voices** that start together (or after `startSec`). A voice is a tone (the
fields of the table above) that plays its `notes` one after another: `[note, seconds]`, where the
note is a token of the step grid (`"E6"`, `"C5@047"`, `"A4:9"`, or `"."` for a pause) from C0 to C9
and the seconds are how long it is held before its release. A voice also takes `gainDb`
(default 0), `lowpassHz` (100–20000, two poles) and `highpassHz` (20–10000, one pole). The
vocabulary is that of sfxr and ZzFX (wave, envelope, slide, vibrato, arpeggio, filters), but in
seconds, Hz and note names instead of normalised sliders.

`gainDb` at the top is the level of the whole sound. `seed` (default 1) seeds the noise. `play`
is for the game, and the synth does not use it: each play is detuned by up to `jitterCents`, at
most `maxVoices` copies sound at once, and two starts are at least `minIntervalMs` apart. An SFX
renders to one channel (the player pans it) and lasts at most 10 seconds; a longer sound is a
jingle.

## What `check` checks

Every finding is one line: severity, rule, the path inside the file, and what to do.

```text
error off-key  sections.A.lead[0]: beat 1: F#5 is on the beat but is not in C major and the chord C
```

| Rule | Severity | What it catches |
|---|---|---|
| `parse` | error | Not JSON, a duplicate key, an unknown or missing field, a wrong type, a number out of range |
| `steps` | error | A bar with the wrong number of beats, or a beat with the wrong number of steps; a chord lane whose chords do not divide the bar |
| `length` | error | A channel with another number of bars than its section's chord lane |
| `token` | error | A token that is not a note, a drum of the kit, `-` or `.`; a chord symbol that is not one |
| `reference` | error | An instrument, channel, layer, section or repeated bar that does not exist |
| `range` | error | A note outside C1–C7 (SFX: C0–C9) |
| `off-key` | error | A note on a beat that is neither in the key nor in the bar's chord |
| `chromatic` | warning | The same off the beat: fine as a passing note |
| `chord-clash` | warning | A note on a beat a semitone above a tone of the chord |
| `hold` | warning | A `-` with no note before it; it is read as silence |
| `noodling` | warning | A channel that starts a note on more than half of its steps and rests on fewer than a tenth |
| `repetitive` | warning | A song of 8 bars or more in which fewer than a quarter of the bars are different |
| `silent` | warning | A channel without a note; a render that is silent |
| `clip` | error | Samples above full scale |
| `peak` | warning | A true peak above −1 dBTP |
| `loudness` | warning | Music more than 3 LU from −18 LUFS |
| `harsh` | warning | More than 10 % of the energy above 8 kHz |
| `loop-seam` | warning | The loop point clicks |
| `golden` | error | The render does not match the checked-in sidecar, or there is none |
| `layout`, `id` | error | With `--all`: a file outside `music/` or `sfx/`; an id used by two files |

"On a beat" is the first step of a beat. The exit code of `check` is 1 if any file has an error;
warnings are printed and stored in the sidecar, and do not fail.

## The `audio` command

| Command | What it does |
|---|---|
| `list` | Every song, jingle and SFX: path id, kind, id, bars, seconds, tempo, key, states, orchestrations |
| `check <id>… \| --all` | The validators above, then the golden: the file is rendered and its PCM hash must be the one in its sidecar. `--no-golden` validates only. |
| `render <id>… \| --all` | Writes the outputs below and the sidecar. A file that cannot be read writes nothing. |
| `metrics <id> \| <file.wav>` | Prints the numbers of a render without writing anything. For a WAV file, `--loop` says it is a loop and measures its seam. |

Options: `--orchestration <name>` and `--pass first` (render and metrics), `--json` (list and
metrics), `--root`, `--audio` and `--out` for other folders. Exit codes: 0 fine, 1 a file has an
error, 2 wrong usage.

`render` writes to `build/audio/<path id>/`:

| File | What |
|---|---|
| `mix.wav` | The whole mix, 16-bit PCM at 48 kHz: stereo for a song, one channel for an SFX |
| `mix.<state>.wav` | Songs: the mix of every state |
| `stems/<channel>.wav` | Songs: every channel on its own, before the layer gains |
| `piano-roll.png` | What was written: bars and chords along the top, one lane per channel with its instrument, gain and pan, notes at their pitch (arpeggio tones pale; a note with an error red, with a warning orange), drums as one row per key |
| `spectrogram.png` | What came out: time against frequency up to 20 kHz, with a line at 8 kHz |

Both pictures are at most 2000 pixels on a side and are made to be read with the Read tool; a
long song splits its piano roll into `piano-roll-1.png`, `piano-roll-2.png` and so on. With
`--orchestration` or `--pass first` the files go to a subfolder (`orchestration-<name>`,
`pass-first`) and the sidecar is left alone.

### Steady and first pass

A loop is rendered as it sounds **once it has come round** (`steady`, the default): the second
pass from the loop point to the end, with the releases and echoes of the first pass ringing over
its start. Played end to start it is seamless, and this is what the hash and the loop-seam
metric are taken over. `--pass first` renders the cold start instead (with the intro, and with
nothing ringing over its start); a note held up to the loop point shows there as a click, since
nothing continues it. A jingle has one render: from its start until it has rung out.

### The sidecar and the golden

`<name>.render.json` (`wz.audio-render/0.1`) holds what a reviewer needs without a render:

```json
{
  "format": "wz.audio-render/0.1", "id": "bgm.shop.day", "kind": "song", "source": "shop-day.song.json",
  "sampleRate": 48000, "frames": 853333, "loop": true, "hash": "b4294ab4e2bafbf7",
  "seconds": 17.778, "lufsI": -17.9, "lufsMomentaryMax": -16.2, "dBTP": -5.7, "clipped": 0,
  "energyAbove8k": 0.017, "seam": { "jump": 0.0019, "ratio": 0, "click": false }, "trimDb": -0.1,
  "stems": [{ "channel": "lead", "hash": "d419f541d0fd6f7c" }],
  "states": [{ "state": "calm", "hash": "fe056cebc63a451b", "lufsI": -18.5, "dBTP": -6.2, "trimDb": 0.5 }],
  "stats": { "bars": 8, "seconds": 17.778, "uniqueBarRatio": 1, "channels": [] },
  "warnings": []
}
```

`hash` is the **golden**: FNV-1a 64 over the tag `wz.pcm16/1`, the sample rate (u32), the channel
count (u16), the samples per channel (u32) and every 16-bit sample, all little-endian. `check`
renders the file again and fails if the hash differs or if anything else in the sidecar is out
of date. So a change of the synth that moves one sample of one example fails the gate. When a
sound is meant to change, run `render`, commit the sidecar with the song, and say why in the
commit.

## Loudness and the house targets

The targets (D27): **music at −18 LUFS integrated, the master at most −1 dBTP**.

| Number | How it is measured | Target |
|---|---|---|
| `lufsI` | Integrated loudness, ITU-R BS.1770 (K-weighting, 400 ms blocks, both gates) | Music and jingles: −18, written within 3 LU |
| `lufsMomentaryMax` | The loudest 400 ms; for a short SFX this is the useful loudness | Compare SFX with each other |
| `dBTP` | True peak at 4× oversampling | ≤ −1 |
| `clipped` | Samples outside full scale | 0 |
| `energyAbove8k` | Share of the energy above 8 kHz | ≤ 0.1 |
| `seam` | Loops: the jump from the last sample to the first, next to the largest sample-to-sample step within 5 ms of it. A click is a jump above 0.02 that is more than 4 times those steps. | no click |
| `trimDb` | The gain a player applies to reach the house level | — |

`trimDb` closes the last gap without touching the composed gains: for music it moves the mix to
−18 LUFS, but never so far up that the true peak passes −1 dBTP; for an SFX it only brings a peak
above −1 dBTP down. Mix with the channel gains until the trim is within a decibel or so; the trim
is for the player, not a way to mix. Each state has its own loudness and trim.

The 8 kHz threshold is calibrated on this synth: a whole mix reads about 0.02; a lead alone 0.01
to 0.05; a 12.5 % pulse alone in its top octave 0.15; hi-hats alone 0.2 to 0.5.

## Composing a piece

Write in this order, and run `check` (or `metrics`) after each step. Each step fixes what the
next one is checked against.

1. **Form.** Decide the length in bars, the sections and their order, the loop point, the tempo,
   the meter and the key. Shop and menu loops: 8 or 16 bars, 90–130 BPM, a major or mixolydian
   key. A jingle: 1–4 bars with `loop: false`.
2. **Chords.** Fill the chord lane of every section. End the last bar on a chord that leads back
   to the first (V or IV to I).
3. **Bass.** Roots on the strong beats, fifths and approach notes between them, with rests.
   A stepped triangle (`"steps": 32`) at C2–C3.
4. **Motif.** One or two bars of melody with a clear rhythm: this is the idea people remember.
   Start and end it on chord tones.
5. **Melody.** Develop the motif instead of writing new material: repeat it over the next chord,
   move it up or down (a sequence), invert it, shift its rhythm, answer it. Leave rests; hold
   notes. Keep it between about A4 and G5 so it stays out of the bass and below the harsh top.
6. **Drums.** A kick on the strong beats, a snare on the weak ones, hats between; a fill in the
   last bar of a section (`s:4 s:5 s s:9`). Use `=0` for bars that repeat.
7. **Mix.** Set the channel gains until `lufsI` is near −18 and nothing is flagged; pan the lead
   and the harmony a little apart; keep the bass and the kick in the centre. Then split the
   channels into layers and define the states.

Then render and read the piano roll: bars and channels line up, the melody has a contour, the
bass is under it, nothing is red. Read the spectrogram for a wall of energy at the top.

**Write 2–3 variants per brief** (D27), as separate files that differ in something a listener
would name (the motif, the groove, the key or the tempo), and let the owner choose in the studio.
The target sound is "chip-inspired cozy": few voices, clear melodies, soft attacks, no harsh top.

What goes wrong, and which check catches it:

| Failure | Check |
|---|---|
| Channels drift out of sync | `steps`, `length`: time is the position in the bar string |
| Wrong notes against the harmony | `off-key`, `chord-clash`, `chromatic` |
| Notes nobody can hear or stand | `range`, `harsh` |
| A wall of notes without a phrase | `noodling` (onsets per step, rest ratio) |
| The same bar forever | `repetitive` (unique-bar ratio) |
| Too loud, too quiet, clipping | `loudness`, `peak`, `clip`, `trimDb` |
| A click every time the loop comes round | `loop-seam` |
| The sound changed and nobody said so | `golden` |

## The synth

A sample-level synth in plain TypeScript, with no Web Audio: it runs unchanged in Node, in a Web
Worker and in an AudioWorklet.

- **Voices.** Pulse at 12.5, 25 or 50 % duty, band-limited with PolyBLEP; triangle, smooth or
  in 32 steps of 16 levels; noise from a seeded 15-bit LFSR clocked at 8 times the note's
  frequency, in a long (period 32767) and a short (period 93) mode; a wave channel of 32 four-bit
  samples. Each channel has three voices: the note that sounds and the release tails of the two
  before it.
- **Modulation.** Linear ADSR, sine vibrato with a delay, arpeggio, glide from the note before,
  a steady slide. Pitch is recomputed every 16 samples of a voice's age, not per block, so a
  render does not depend on how it is cut into blocks.
- **Effects.** A tempo-synced echo per channel and a two-pole low-pass (on the master for a
  state, on a voice for an SFX).
- **Sequencer.** Events are placed by counting samples from the start of the song
  (`floor(step × 60 × sampleRate / (tempo × stepsPerBeat))`), never by a clock or by adding up
  rounded step lengths. The mix order is the order of the channels in the file.

### The determinism contract

`packages/audio/src` is under the determinism lint, except its `analysis` and `node` folders.
The synth uses only `+ − × ÷` on doubles, `Math.floor` and table reads, which IEEE 754 defines
exactly. Everything that would need `Math.pow`, `Math.exp`, `Math.sin` or `Math.tan` comes from
checked-in tables of integers (the value times 2^40), interpolated linearly:

| Table | Holds | Used for |
|---|---|---|
| `packages/audio/data/pow2.json` | 2^(i/1200), one octave in cents | Pitch (cents from A4 = 440 Hz), vibrato, slide, decibels |
| `packages/audio/data/tan.json` | tan(π × cutoff / sampleRate) | The one coefficient of both filters |
| `isin` of `@whz/det` | sine | The vibrato LFO and the pan law |

`./dev npm run make-data -w @whz/audio` rebuilds the two tables with exact integer arithmetic;
a test rebuilds them and compares. A second player (Godot, D10) ports the synth with the same
tables and must reach the same PCM hashes. 16-bit PCM is `floor(sample × 32767 + 0.5)`, limited
to −32768…32767.

The metrics and the pictures are analysis: they use floating-point `Math` freely, their results
are rounded before they are stored, and the synth never imports them.

## Limits of 0.1

- Waves are the four above; there are no samples, FM or filters per song channel.
- No swing and no per-transition rules: a state change always waits for the bar line and fades
  over one beat (the player takes another fade length).
- The `play` limits of an SFX, ducking music under SFX, and key-aware SFX belong to runtime audio.
  Mutating an SFX with sliders belongs to studio audio.
- sfxr strings are not imported.
