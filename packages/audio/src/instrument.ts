// Instruments: the sound of one voice, as named parameters in physical units (seconds, Hz,
// cents, semitones). Songs and SFX share this vocabulary.

import type { Report } from "./findings.ts";
import { parseNoteName } from "./pitch.ts";
import { checkFields, join, readChoice, readNames, readNumber, readObject, readString } from "./reader.ts";
import type { JsonObject } from "./reader.ts";

export const WAVES = ["pulse", "triangle", "noise", "wave"] as const;
export type Wave = (typeof WAVES)[number];

/** The pulse duties of the chip: 12.5 %, 25 % and 50 %. */
export const DUTIES = [0.125, 0.25, 0.5] as const;
export const NOISE_MODES = ["long", "short"] as const;
export type NoiseMode = (typeof NOISE_MODES)[number];

/** The number of samples of a wave channel's table, and the highest value of a sample. */
export const WAVE_SAMPLES = 32;
export const WAVE_MAX = 15;

/** A linear ADSR envelope: attack, decay and release in seconds, sustain as a level 0..1. */
export interface Envelope {
  readonly a: number;
  readonly d: number;
  readonly s: number;
  readonly r: number;
}

/** A sine vibrato: depth in cents, rate in Hz, and seconds before it starts to fade in. */
export interface Vibrato {
  readonly cents: number;
  readonly hz: number;
  readonly delay: number;
}

/** Everything a voice needs to sound one note. */
export interface Tone {
  readonly wave: Wave;
  /** Pulse only: the part of the cycle that is high. */
  readonly duty: number;
  /** Triangle only: true for the 32-step, 16-level (4-bit) triangle of the NES. */
  readonly stepped: boolean;
  /** Noise only: `long` is hiss (period 32767), `short` is metallic buzz (period 93). */
  readonly mode: NoiseMode;
  /** Wave only: 32 samples, each 0..15. */
  readonly samples: readonly number[] | null;
  readonly env: Envelope;
  readonly vibrato: Vibrato | null;
  /** How many times a second an arpeggio (`C4@047`) steps to its next note. */
  readonly arpHz: number;
  /** Seconds a note takes to glide in from the pitch of the note before it; 0 for none. */
  readonly glide: number;
  /** A steady pitch slide over the whole note, in semitones per second (negative: down). */
  readonly slideSemitonesPerSec: number;
}

/** A drum of a kit: a tone at a fixed pitch. It sounds for its attack and decay, then releases. */
export interface Drum extends Tone {
  /** The MIDI note the drum is played at. For noise it sets the rate of the noise. */
  readonly pitch: number;
}

export type Instrument = { readonly kind: "tone"; readonly tone: Tone } | { readonly kind: "kit"; readonly drums: Readonly<Record<string, Drum>> };

const TONE_FIELDS = ["duty", "steps", "mode", "samples", "vibrato", "arpHz", "glide", "slideSemitonesPerSec"] as const;

export const DEFAULT_ARP_HZ = 60;

function readEnvelope(report: Report, value: unknown, path: string): Envelope | null {
  const object = readObject(report, value, path);
  if (object === null || !checkFields(report, object, path, ["a", "d", "s", "r"])) return null;
  const a = readNumber(report, object["a"], join(path, "a"), { min: 0, max: 10 });
  const d = readNumber(report, object["d"], join(path, "d"), { min: 0, max: 10 });
  const s = readNumber(report, object["s"], join(path, "s"), { min: 0, max: 1 });
  const r = readNumber(report, object["r"], join(path, "r"), { min: 0, max: 10 });
  return a === null || d === null || s === null || r === null ? null : { a, d, s, r };
}

function readVibrato(report: Report, value: unknown, path: string): Vibrato | null {
  const object = readObject(report, value, path);
  if (object === null || !checkFields(report, object, path, ["cents", "hz"], ["delay"])) return null;
  const cents = readNumber(report, object["cents"], join(path, "cents"), { min: 0, max: 200 });
  const hz = readNumber(report, object["hz"], join(path, "hz"), { min: 0.1, max: 20 });
  const delay = object["delay"] === undefined ? 0 : readNumber(report, object["delay"], join(path, "delay"), { min: 0, max: 5 });
  return cents === null || hz === null || delay === null ? null : { cents, hz, delay };
}

/** The 32 samples of a wave channel, written as 32 hexadecimal digits. */
function readSamples(report: Report, value: unknown, path: string): number[] | null {
  const text = readString(report, value, path);
  if (text === null) return null;
  if (!/^[0-9a-f]{32}$/.test(text)) {
    report.error("parse", path, `must be ${WAVE_SAMPLES} hexadecimal digits (0-9, a-f), one per sample; got ${text.length} characters`);
    return null;
  }
  return Array.from(text, (digit) => Number.parseInt(digit, 16));
}

/**
 * The tone fields of an object (`wave`, `env` and the optional ones). Fields that belong to
 * another wave (a `duty` on a triangle) are read and ignored, so that an orchestration can
 * swap the wave of an instrument without rewriting it.
 * @param extra fields of the same object that the caller reads itself
 */
export function readTone(report: Report, object: JsonObject, path: string, extra: readonly string[] = []): Tone | null {
  const before = report.errors;
  checkFields(report, object, path, ["wave", "env"], [...TONE_FIELDS, ...extra]);
  const wave = readChoice(report, object["wave"], join(path, "wave"), WAVES);
  const env = object["env"] === undefined ? null : readEnvelope(report, object["env"], join(path, "env"));
  const duty = object["duty"] === undefined ? 0.5 : readChoice(report, object["duty"], join(path, "duty"), DUTIES);
  const stepped = object["steps"] === undefined ? false : readChoice(report, object["steps"], join(path, "steps"), [WAVE_SAMPLES]) !== null;
  const mode = object["mode"] === undefined ? "long" : readChoice(report, object["mode"], join(path, "mode"), NOISE_MODES);
  const samples = object["samples"] === undefined ? null : readSamples(report, object["samples"], join(path, "samples"));
  const vibrato = object["vibrato"] === undefined ? null : readVibrato(report, object["vibrato"], join(path, "vibrato"));
  const arpHz = object["arpHz"] === undefined ? DEFAULT_ARP_HZ : readNumber(report, object["arpHz"], join(path, "arpHz"), { min: 1, max: 120 });
  const glide = object["glide"] === undefined ? 0 : readNumber(report, object["glide"], join(path, "glide"), { min: 0, max: 2 });
  const slide =
    object["slideSemitonesPerSec"] === undefined
      ? 0
      : readNumber(report, object["slideSemitonesPerSec"], join(path, "slideSemitonesPerSec"), { min: -480, max: 480 });
  if (wave === "wave" && object["samples"] === undefined) report.error("parse", path, `a "wave" instrument needs "samples": ${WAVE_SAMPLES} hexadecimal digits`);
  if (report.errors > before || wave === null || env === null || duty === null || mode === null || arpHz === null || glide === null || slide === null) {
    return null;
  }
  return { wave, duty, stepped, mode, samples, env, vibrato, arpHz, glide, slideSemitonesPerSec: slide };
}

function readDrum(report: Report, value: unknown, path: string): Drum | null {
  const object = readObject(report, value, path);
  if (object === null) return null;
  const tone = readTone(report, object, path, ["pitch"]);
  if (object["pitch"] === undefined) {
    report.error("parse", path, 'the field "pitch" is missing (a note name such as "C2")');
    return null;
  }
  const name = readString(report, object["pitch"], join(path, "pitch"));
  if (name === null) return null;
  const pitch = parseNoteName(name);
  if (pitch === null) {
    report.error("parse", join(path, "pitch"), `must be a note name such as "C2" or "F#4", got ${JSON.stringify(name)}`);
    return null;
  }
  return tone === null ? null : { ...tone, pitch };
}

/** An instrument of a song: a tone, or a kit (`{ "drums": { "k": {...}, "s": {...} } }`). */
export function readInstrument(report: Report, value: unknown, path: string): Instrument | null {
  const object = readObject(report, value, path);
  if (object === null) return null;
  if (Object.hasOwn(object, "drums")) {
    checkFields(report, object, path, ["drums"]);
    const drumsObject = readObject(report, object["drums"], join(path, "drums"));
    if (drumsObject === null) return null;
    const drums: Record<string, Drum> = {};
    let fine = true;
    for (const key of readNames(report, drumsObject, join(path, "drums"), "drum")) {
      if (!/^[a-z][a-z0-9]{0,3}$/.test(key)) {
        report.error("parse", join(join(path, "drums"), key), "a drum key is 1 to 4 lowercase letters or digits, starting with a letter");
        fine = false;
        continue;
      }
      const drum = readDrum(report, drumsObject[key], join(join(path, "drums"), key));
      if (drum === null) fine = false;
      else drums[key] = drum;
    }
    if (Object.keys(drumsObject).length === 0) {
      report.error("parse", join(path, "drums"), "a kit needs at least one drum");
      fine = false;
    }
    return fine && Object.keys(drums).length === Object.keys(drumsObject).length ? { kind: "kit", drums } : null;
  }
  const tone = readTone(report, object, path);
  return tone === null ? null : { kind: "tone", tone };
}
