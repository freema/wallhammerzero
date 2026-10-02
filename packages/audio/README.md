# @whz/audio

Music and SFX as data, and the one reference synth that plays them: the `wz.song/0.1` and
`wz.sfx/0.1` formats with strict readers and musical validators, a sample-level chip synth in
plain TypeScript, loudness and seam metrics, piano-roll and spectrogram pictures, and the
`audio` command. The formats, the rules, the command and the composition procedure are in
[docs/audio.md](../../docs/audio.md); this file is the API.

Three entries, by what they may depend on:

| Entry | What | Runs in |
|---|---|---|
| `@whz/audio` | Formats, validators, the synth, PCM and WAV bytes. Under the determinism lint: no `Math.sin`, no clock, no I/O. | Node, a Web Worker, an AudioWorklet |
| `@whz/audio/analysis` | Loudness, true peak, loop seam, spectrum, the pictures. Floating-point analysis; the synth never imports it. | Node and the browser |
| `@whz/audio/node` | Finding files, rendering to disk, the sidecar and the golden check, the CLI | Node |

It depends on `@whz/det` (hashes, the integer sine) and on `@whz/asset-kit` (the canvas and PNG
writer of the pictures, canonical JSON).

## Reading and checking

| API | What it does |
|---|---|
| `checkSongText(text)` → `{ song, findings }` | Strict parse (with the duplicate-key check), the layout in time, then the musical lint. `song` is null if there is an error. `checkSong(value)` takes a parsed value. |
| `readSongText(text)`, `readSong(value)` | The same without the musical lint. `parseSong(value)` returns the `Song` or throws `AudioDataError`. |
| `lintSong(song)` → `Finding[]`, `songStats(song)` → `SongStats` | The musical rules, and the numbers behind them (onsets per step, rest ratio, range, unique-bar ratio). |
| `readSfxText(text)`, `readSfx(value)`, `parseSfx(value)` | The same for an SFX. |
| `formatFinding(finding)` | One line: `error off-key  sections.A.lead[0]: beat 1: …`. A `Finding` is `{ severity, rule, path, message, at? }`; `at` anchors it to a section, channel, bar, beat and step. |
| `parseBar`, `parseToken`, `parseChord`, `parseKey`, `parseNoteName`, `noteName` | The step grid and the music theory, for tools. |

A `Song` holds its `timeline`: the order of sections flattened into bars and notes
(`{ channel, step, steps, midi, arp, velocity, drum }`, sorted by step), which is what the synth
plays and the validators read.

## Playing

```ts
import { parseSong, SongPlayer } from "@whz/audio";

const player = new SongPlayer(parseSong(json), { sampleRate: 48000, state: "calm" });
const left = new Float32Array(128);
const right = new Float32Array(128);
player.process(left, right);          // the next 128 samples
player.setState("rush");              // at the next bar line, faded over one beat
player.setOrchestration("winter");    // notes from the next bar line on
player.position();                    // { frame, timelineBar, section, bar, loops, ended, … }
```

| API | What it does |
|---|---|
| `new SongPlayer(song, { sampleRate?, state?, orchestration? })` | A streaming player. `process(left, right, frames?, offset?, stems?)` renders the next samples; block sizes do not change the result. A looping song jumps back by itself and its tails ring on. |
| `player.setState(state, fadeBeats = 1)`, `player.setOrchestration(name)` | Asked for at any time, applied on the next bar line. `null` is every channel, or the instruments as written. |
| `renderSong(song, { sampleRate?, state?, orchestration?, pass? })` → `SongRender` | The whole song offline: `left`, `right`, `frames`, `loop`, one stem per channel, the first sample of every bar. `pass` is `steady` (default) or `first`; see docs/audio.md. |
| `mixState(song, render, state)` → `StereoBuffer` | The mix of one state from a render's stems, without rendering again. |
| `renderSfx(sfx, { sampleRate?, detuneCents? })` → `{ sampleRate, frames, samples }` | An SFX, one channel. `detuneCents` is the game's pitch jitter. |
| `Voice`, `OnePole`, `Lowpass`, `EchoLine`, `MasterBus` | The parts, for a player that mixes its own way. |
| `toPcm16(channels)`, `pcmHash(pcm, channels, sampleRate)`, `stereoHash`, `monoHash` | 16-bit PCM and its hash (FNV-1a 64; the layout is in docs/audio.md). |
| `encodeWav(pcm, channels, sampleRate)`, `decodeWav(bytes)`, `pcmToFloat(pcm, channels)` | WAV bytes, 16-bit PCM. |
| `pow2Cents`, `centsToHz`, `midiToHz`, `dbToGain`, `tanRatio`, `sinTurns`, `panGains` | The table-backed numbers of the synth. |

The sample rate is a whole number from 8000 to 96000; 48000 is the default and the rate of the
goldens. Samples are `Float32Array` in −1…1.

## Measuring and drawing (`@whz/audio/analysis`)

| API | What it does |
|---|---|
| `measure(channels, sampleRate, { loop? })` → `Metrics` | `seconds`, `lufsI`, `lufsMomentaryMax`, `dBTP`, `clipped`, `energyAbove8k`, `seam`; all rounded. |
| `metricFindings(metrics, targetLufs \| null, path?)`, `trimDb(metrics, targetLufs \| null)` | The warnings of a render, and the gain that brings it to the house level. |
| `measureLoudness`, `truePeak`, `loopSeam`, `energyAbove`, `Spectrum`, `fft`, `toMono`, `toDb` | The parts. |
| `songRoll(song, findings?)`, `sfxRoll(sfx)` → `RollModel`; `drawPianoRoll(model)` → `RgbCanvas[]` | The piano roll, one canvas per page. |
| `drawSpectrogram(signal, sampleRate, options)` → `RgbCanvas` | The spectrogram. |
| `MUSIC_TARGET_LUFS`, `MAX_TRUE_PEAK_DB`, `LOUDNESS_TOLERANCE_LU`, `HARSH_RATIO`, `SEAM_FLOOR`, `SEAM_RATIO` | The thresholds. |

## Files (`@whz/audio/node`)

| API | What it does |
|---|---|
| `openProject({ root?, audio?, out? })`, `findEntries(project)`, `findStrays(project)` | The songs and SFX on disk, sorted by path id, and the files that are in the wrong folder. |
| `loadEntry(entry)` → `Loaded`, `analyse(loaded, options?)` → `Analysis` | Read and validate one file; render and measure it in memory. `analysis.sidecar` is what the studio shows. |
| `checkEntry(entry, { golden? })` → `CheckResult` | Validators and the golden check. |
| `renderToDisk(project, entry, options?)` → `RenderResult` | What `audio render` does for one file. |
| `sidecarText(sidecar)`, `SIDECAR_FORMAT` | The text of a sidecar. |
| `runCli(argv, { out, err, cwd })` → exit code | The whole `audio` command as a function. |

## Scripts

```sh
./dev npm run check -- @whz/audio          # types, lint, tests, then `audio check --all`
./dev npm run make-data -w @whz/audio      # rebuild data/pow2.json and data/tan.json
```

`data/*.json` are generated by `scripts/make-data.ts` with integer arithmetic and are part of the
determinism contract: a test rebuilds them and compares. The tests keep their songs in
`test/fixtures/audio/` (`good` and `bad` packs, one failing fixture per validator, and a loop that
clicks on its cold start).
