// The SFX format, `wz.sfx/0.1`: a sound effect as named parameters in physical units, in the
// vocabulary of sfxr and ZzFX (wave, envelope, slide, vibrato, arpeggio, filters) but in
// seconds, Hz and note names instead of normalised sliders. docs/audio.md describes it.
//
// An SFX is one or more voices that start together (or after `startSec`); a voice plays its
// `notes` one after another. It renders to one channel: the player pans it.

import { hash32 } from "@whz/det";
import { Lowpass, OnePole } from "./filters.ts";
import { AudioDataError, Report } from "./findings.ts";
import type { Finding } from "./findings.ts";
import { DEFAULT_VELOCITY, parseToken } from "./grid.ts";
import { readTone } from "./instrument.ts";
import type { Tone } from "./instrument.ts";
import { noteName } from "./pitch.ts";
import { checkFields, isId, join, readJsonText, readList, readNumber, readObject, readString } from "./reader.ts";
import { A4_MIDI, dbToGain } from "./tables.ts";
import { secondsToFrames, Voice } from "./voice.ts";

export const SFX_FORMAT = "wz.sfx/0.1";

/** The longest SFX, in seconds: anything longer is a jingle (a song with `loop: false`). */
export const MAX_SFX_SECONDS = 10;
/** The notes an SFX may play: C0 to C9. */
export const SFX_MIN_NOTE = 12;
export const SFX_MAX_NOTE = 120;

export interface SfxNote {
  /** The MIDI note; null for a pause. */
  readonly midi: number | null;
  readonly arp: readonly number[] | null;
  readonly velocity: number;
  /** How long the note is held before its release starts. */
  readonly seconds: number;
}

export interface SfxVoice {
  readonly tone: Tone;
  readonly notes: readonly SfxNote[];
  /** Seconds before the voice's first note. */
  readonly startSec: number;
  readonly gainDb: number;
  /** A two-pole low-pass on the voice; null for none. */
  readonly lowpassHz: number | null;
  /** A one-pole high-pass on the voice; null for none. */
  readonly highpassHz: number | null;
}

/** How the game may play the sound. The synth does not use these; `runtime-audio` does. */
export interface SfxPlay {
  /** Each play is detuned by a seeded random amount up to this many cents, up or down. */
  readonly jitterCents: number;
  /** How many copies may sound at once. */
  readonly maxVoices: number;
  /** The shortest time between two starts, in milliseconds. */
  readonly minIntervalMs: number;
}

export interface Sfx {
  readonly format: typeof SFX_FORMAT;
  readonly id: string;
  /** Seeds the noise generators (and, in the game, the pitch jitter). */
  readonly seed: number;
  readonly gainDb: number;
  readonly play: SfxPlay;
  readonly voices: readonly SfxVoice[];
}

export interface SfxReading {
  readonly sfx: Sfx | null;
  readonly findings: readonly Finding[];
}

const DEFAULT_PLAY: SfxPlay = { jitterCents: 0, maxVoices: 4, minIntervalMs: 0 };

function readPlay(report: Report, value: unknown): SfxPlay | null {
  const object = readObject(report, value, "play");
  if (object === null || !checkFields(report, object, "play", [], ["jitterCents", "maxVoices", "minIntervalMs"])) return null;
  const jitterCents = object["jitterCents"] === undefined ? DEFAULT_PLAY.jitterCents : readNumber(report, object["jitterCents"], "play.jitterCents", { min: 0, max: 200 });
  const maxVoices = object["maxVoices"] === undefined ? DEFAULT_PLAY.maxVoices : readNumber(report, object["maxVoices"], "play.maxVoices", { min: 1, max: 16, integer: true });
  const minIntervalMs =
    object["minIntervalMs"] === undefined ? DEFAULT_PLAY.minIntervalMs : readNumber(report, object["minIntervalMs"], "play.minIntervalMs", { min: 0, max: 10000 });
  return jitterCents === null || maxVoices === null || minIntervalMs === null ? null : { jitterCents, maxVoices, minIntervalMs };
}

function readNotes(report: Report, value: unknown, path: string): SfxNote[] | null {
  const list = readList(report, value, path);
  if (list === null) return null;
  if (list.length === 0) {
    report.error("parse", path, "a voice needs at least one note");
    return null;
  }
  const notes: SfxNote[] = [];
  list.forEach((item, i) => {
    const at = `${path}[${i}]`;
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string") {
      report.error("parse", at, 'must be [note, seconds], e.g. ["E6", 0.2]; "." as the note is a pause');
      return;
    }
    const seconds = readNumber(report, item[1], `${at}[1]`, { min: 0.001, max: MAX_SFX_SECONDS });
    const token = parseToken(item[0], { drums: null });
    if (typeof token === "string" || token.kind === "hold" || token.kind === "drum") {
      report.error("token", `${at}[0]`, typeof token === "string" ? token : '"-" has no meaning here: give the note a longer time instead');
      return;
    }
    if (seconds === null) return;
    if (token.kind === "rest") {
      notes.push({ midi: null, arp: null, velocity: DEFAULT_VELOCITY, seconds });
      return;
    }
    const top = token.midi + Math.max(0, ...(token.arp ?? [0]));
    if (token.midi < SFX_MIN_NOTE || top > SFX_MAX_NOTE) {
      report.error("range", `${at}[0]`, `${item[0]} is outside ${noteName(SFX_MIN_NOTE)}..${noteName(SFX_MAX_NOTE)}`);
      return;
    }
    notes.push({ midi: token.midi, arp: token.arp, velocity: token.velocity, seconds });
  });
  return notes.length === list.length ? notes : null;
}

function readVoice(report: Report, value: unknown, path: string): SfxVoice | null {
  const object = readObject(report, value, path);
  if (object === null) return null;
  const tone = readTone(report, object, path, ["notes", "startSec", "gainDb", "lowpassHz", "highpassHz"]);
  if (object["notes"] === undefined) report.error("parse", path, 'the field "notes" is missing');
  const notes = object["notes"] === undefined ? null : readNotes(report, object["notes"], join(path, "notes"));
  const startSec = object["startSec"] === undefined ? 0 : readNumber(report, object["startSec"], join(path, "startSec"), { min: 0, max: MAX_SFX_SECONDS });
  const gainDb = object["gainDb"] === undefined ? 0 : readNumber(report, object["gainDb"], join(path, "gainDb"), { min: -60, max: 6 });
  const lowpassHz = object["lowpassHz"] === undefined ? null : readNumber(report, object["lowpassHz"], join(path, "lowpassHz"), { min: 100, max: 20000 });
  const highpassHz = object["highpassHz"] === undefined ? null : readNumber(report, object["highpassHz"], join(path, "highpassHz"), { min: 20, max: 10000 });
  if (tone === null || notes === null || startSec === null || gainDb === null) return null;
  if ((object["lowpassHz"] !== undefined && lowpassHz === null) || (object["highpassHz"] !== undefined && highpassHz === null)) return null;
  return { tone, notes, startSec, gainDb, lowpassHz, highpassHz };
}

/** The seconds from the start of an SFX to the end of its last note (before the release). */
function heldSeconds(voice: SfxVoice): number {
  return voice.notes.reduce((sum, note) => sum + note.seconds, voice.startSec);
}

/** Reads an SFX from a parsed JSON value. */
export function readSfx(value: unknown, report: Report = new Report()): SfxReading {
  const done = (sfx: Sfx | null): SfxReading => ({ sfx: report.errors > 0 ? null : sfx, findings: report.findings });
  const object = readObject(report, value, "");
  if (object === null) return done(null);
  checkFields(report, object, "", ["format", "id", "gainDb", "voices"], ["seed", "play"]);
  if (object["format"] !== SFX_FORMAT) report.error("parse", "format", `must be "${SFX_FORMAT}", got ${JSON.stringify(object["format"])}`);
  const id = object["id"] === undefined ? null : readString(report, object["id"], "id");
  if (id !== null && !isId(id)) report.error("parse", "id", `an id is lowercase letters and digits with ".", "_" or "-" between them (e.g. "sfx.coin"), got ${JSON.stringify(id)}`);
  const seed = object["seed"] === undefined ? 1 : readNumber(report, object["seed"], "seed", { min: 0, max: 0xffffffff, integer: true });
  const gainDb = object["gainDb"] === undefined ? null : readNumber(report, object["gainDb"], "gainDb", { min: -60, max: 6 });
  const play = object["play"] === undefined ? DEFAULT_PLAY : readPlay(report, object["play"]);

  const voices: SfxVoice[] = [];
  const list = object["voices"] === undefined ? null : readList(report, object["voices"], "voices");
  if (list !== null) {
    if (list.length === 0 || list.length > 8) report.error("parse", "voices", `an SFX has 1 to 8 voices, got ${list.length}`);
    list.forEach((item, i) => {
      const voice = readVoice(report, item, `voices[${i}]`);
      if (voice === null) return;
      if (heldSeconds(voice) + voice.tone.env.r > MAX_SFX_SECONDS) {
        report.error("parse", `voices[${i}]`, `the voice lasts longer than ${MAX_SFX_SECONDS} s; a long sound is a jingle (a song with "loop": false)`);
      }
      voices.push(voice);
    });
  }
  if (report.errors > 0 || id === null || seed === null || gainDb === null || play === null) return done(null);
  return done({ format: SFX_FORMAT, id, seed, gainDb, play, voices });
}

/** Reads an SFX from JSON text: `readSfx` plus the duplicate-key check. */
export function readSfxText(text: string): SfxReading {
  const report = new Report();
  const value = readJsonText(report, text);
  return report.errors > 0 ? { sfx: null, findings: report.findings } : readSfx(value, report);
}

/** The SFX of a parsed JSON value; throws `AudioDataError` if it has errors. */
export function parseSfx(value: unknown): Sfx {
  const { sfx, findings } = readSfx(value);
  if (sfx === null) throw new AudioDataError("the SFX", findings);
  return sfx;
}

// ---------------------------------------------------------------------------------------
// Rendering

export interface SfxRenderOptions {
  /** Samples per second (default 48000). */
  readonly sampleRate?: number | undefined;
  /** Plays the whole sound this many cents higher (negative: lower): the game's pitch jitter. */
  readonly detuneCents?: number | undefined;
}

/** A rendered SFX: one channel. */
export interface SfxRender {
  readonly sampleRate: number;
  readonly frames: number;
  readonly samples: Float32Array;
}

/** Silence after the last release, so that a filter's tail is not cut: 5 ms. */
const TAIL_SEC = 0.005;
const POOL = 3;

/** Renders an SFX. The same SFX, sample rate and detune always give the same samples. */
export function renderSfx(sfx: Sfx, options: SfxRenderOptions = {}): SfxRender {
  const sampleRate = options.sampleRate ?? 48000;
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new RangeError(`the sample rate must be an integer from 8000 to 96000, got ${String(sampleRate)}`);
  }
  const detune = options.detuneCents ?? 0;
  const minRelease = 0.001;
  let seconds = 0;
  for (const voice of sfx.voices) seconds = Math.max(seconds, heldSeconds(voice) + Math.max(voice.tone.env.r, minRelease));
  const frames = secondsToFrames(seconds + TAIL_SEC, sampleRate);
  const mix = new Float64Array(frames);
  const scratch = new Float64Array(frames);
  const master = dbToGain(sfx.gainDb);

  sfx.voices.forEach((spec, index) => {
    scratch.fill(0);
    const pool = Array.from({ length: POOL }, (_, slot) => new Voice(sampleRate, hash32(index, slot, sfx.seed)));
    // The notes follow each other; each releases when the next one starts.
    let at = secondsToFrames(spec.startSec, sampleRate);
    let rendered = 0;
    let next = 0;
    let time = spec.startSec;
    for (const note of spec.notes) {
      for (const voice of pool) voice.render(scratch, rendered, Math.min(at, frames));
      rendered = Math.min(at, frames);
      time += note.seconds;
      const end = secondsToFrames(time, sampleRate);
      if (note.midi !== null) {
        const voice = pool[next] as Voice;
        next = (next + 1) % POOL;
        voice.noteOn({
          tone: spec.tone,
          cents: (note.midi - A4_MIDI) * 100 + detune,
          arp: note.arp,
          gain: note.velocity / DEFAULT_VELOCITY,
          glideFromCents: null,
          gateFrames: end - at,
        });
      }
      at = end;
    }
    for (const voice of pool) voice.render(scratch, rendered, frames);

    const lowpass = spec.lowpassHz === null ? null : new Lowpass(spec.lowpassHz, sampleRate);
    const highpass = spec.highpassHz === null ? null : new OnePole(spec.highpassHz, sampleRate);
    const gain = dbToGain(spec.gainDb) * master;
    for (let i = 0; i < frames; i += 1) {
      let sample = scratch[i] as number;
      if (lowpass !== null) sample = lowpass.process(sample);
      if (highpass !== null) sample = highpass.highpass(sample);
      mix[i] = (mix[i] as number) + sample * gain;
    }
  });
  return { sampleRate, frames, samples: Float32Array.from(mix) };
}
