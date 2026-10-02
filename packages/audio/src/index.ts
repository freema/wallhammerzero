// @whz/audio: music and SFX as data, and the one reference synth that plays them.
// This entry runs unchanged in Node, in a Web Worker and in an AudioWorklet: no Web Audio, no
// I/O, no clock. See README.md and docs/audio.md.
//
//   @whz/audio            the formats, the validators and the synth (under the determinism lint)
//   @whz/audio/analysis   loudness, true peak, seam, spectrum, the pictures (floating-point analysis)
//   @whz/audio/node       files: finding songs, the `audio` command, WAV and PNG on disk

export { AudioDataError, formatFinding, Report } from "./findings.ts";
export type { Anchor, Finding, Severity } from "./findings.ts";
export { EchoLine, Lowpass, OnePole } from "./filters.ts";
export { DEFAULT_VELOCITY, MAX_VELOCITY, parseBar, parseToken, repeatTarget } from "./grid.ts";
export type { BarShape, Token, TokenContext } from "./grid.ts";
export { DEFAULT_ARP_HZ, DUTIES, NOISE_MODES, readInstrument, readTone, WAVE_MAX, WAVE_SAMPLES, WAVES } from "./instrument.ts";
export type { Drum, Envelope, Instrument, NoiseMode, Tone, Vibrato, Wave } from "./instrument.ts";
export { checkSong, checkSongText, lintSong, NOODLING_ONSETS, NOODLING_RESTS, REPETITIVE_MIN_BARS, REPETITIVE_RATIO, songStats } from "./lint.ts";
export type { ChannelStats, SongStats } from "./lint.ts";
export { CHORD_QUALITIES, MAX_NOTE, MIN_NOTE, MODES, NO_CHORD, noteName, parseChord, parseKey, parseNoteName, parsePitchClass, pitchClassName } from "./pitch.ts";
export type { Chord, Key } from "./pitch.ts";
export {
  DEFAULT_FADE_BEATS,
  DEFAULT_SAMPLE_RATE,
  MasterBus,
  MAX_SAMPLE_RATE,
  MIN_SAMPLE_RATE,
  SongPlayer,
  stepFrame,
  VOICES_PER_CHANNEL,
} from "./player.ts";
export type { PlayerOptions, PlayerPosition, StereoBuffer } from "./player.ts";
export { duplicateKeys } from "./reader.ts";
export { clippedSamples, mixState, monoHash, PCM_HASH_TAG, pcmHash, renderSong, stereoHash, toPcm16 } from "./render.ts";
export type { RenderOptions, RenderPass, SongRender, Stem } from "./render.ts";
export { MAX_SFX_SECONDS, parseSfx, readSfx, readSfxText, renderSfx, SFX_FORMAT, SFX_MAX_NOTE, SFX_MIN_NOTE } from "./sfx.ts";
export type { Sfx, SfxNote, SfxPlay, SfxReading, SfxRender, SfxRenderOptions, SfxVoice } from "./sfx.ts";
export { channelsOfState, instrumentsOf, MAX_BARS, parseSong, readSong, readSongText, SONG_FORMAT } from "./song.ts";
export type { Channel, Echo, Section, Song, SongReading, SongState, Timeline, TimelineBar, TimelineNote } from "./song.ts";
export { A4_HZ, A4_MIDI, centsToHz, dbToGain, MAX_CUTOFF_RATIO, midiToHz, panGains, pow2Cents, sinTurns, tanRatio } from "./tables.ts";
export { lfsrSeed, secondsToFrames, Voice } from "./voice.ts";
export type { NoteSpec } from "./voice.ts";
export { decodeWav, encodeWav, pcmToFloat } from "./wav.ts";
export type { DecodedWav } from "./wav.ts";
