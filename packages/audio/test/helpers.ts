// What the tests share: the fixtures, and small tools to build songs and signals.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseSong } from "../src/index.ts";
import type { Finding, Song, Tone } from "../src/index.ts";

export const REPO = fileURLToPath(new URL("../../../", import.meta.url));
/** The fixtures as an audio folder: packs `good` and `bad`. Relative to the repo root. */
export const FIXTURES = "packages/audio/test/fixtures/audio";

type Json = Record<string, unknown>;

export function fixturePath(pathId: string, suffix: ".song.json" | ".sfx.json"): string {
  return `${REPO}${FIXTURES}/${pathId}${suffix}`;
}

export function fixtureText(pathId: string, suffix: ".song.json" | ".sfx.json" = ".song.json"): string {
  return readFileSync(fixturePath(pathId, suffix), "utf8");
}

/** A fixture as a parsed JSON value: a fresh copy, so a test may change it. */
export function fixtureJson(pathId: string, suffix: ".song.json" | ".sfx.json" = ".song.json"): Json {
  return JSON.parse(fixtureText(pathId, suffix)) as Json;
}

/** The clean two-bar loop (lead, bass, drums; states calm, busy, muffled; orchestration soft). */
export function cleanJson(): Json {
  return fixtureJson("good/music/clean");
}

export function cleanSong(): Song {
  return parseSong(cleanJson());
}

/** The clean song with one bar of one channel replaced. */
export function withBar(channel: string, bar: number, text: string, change: (json: Json) => void = () => undefined): Json {
  const json = cleanJson();
  const section = (json["sections"] as Record<string, Record<string, string[]>>)["A"] as Record<string, string[]>;
  (section[channel] as string[])[bar] = text;
  change(json);
  return json;
}

/** Sets `json.a.b.c = value` for the path `["a", "b", "c"]`. */
export function setAt(json: Json, path: readonly string[], value: unknown): Json {
  let at: Json = json;
  for (const key of path.slice(0, -1)) at = at[key] as Json;
  const last = path[path.length - 1] as string;
  if (value === undefined) delete at[last];
  else at[last] = value;
  return json;
}

/** The findings of a rule. */
export function ofRule(findings: readonly Finding[], rule: string): Finding[] {
  return findings.filter((finding) => finding.rule === rule);
}

export function rules(findings: readonly Finding[]): string[] {
  return findings.map((finding) => `${finding.severity} ${finding.rule}`);
}

/** A tone with a square envelope, for tests of one voice. */
export function tone(change: Partial<Tone> = {}): Tone {
  return {
    wave: "pulse",
    duty: 0.5,
    stepped: false,
    mode: "long",
    samples: null,
    env: { a: 0, d: 0, s: 1, r: 0 },
    vibrato: null,
    arpHz: 60,
    glide: 0,
    slideSemitonesPerSec: 0,
    ...change,
  };
}

/** A sine as 32-bit floats. */
export function sine(hz: number, seconds: number, amplitude: number, sampleRate = 48000, phase = 0): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, i) => amplitude * Math.sin(2 * Math.PI * ((hz * i) / sampleRate) + phase));
}

/** How many times a signal goes from below zero to zero or above in `[from, to)`. */
export function risingCrossings(signal: ArrayLike<number>, from: number, to: number): number {
  let count = 0;
  for (let i = Math.max(1, from); i < to; i += 1) if ((signal[i - 1] as number) < 0 && (signal[i] as number) >= 0) count += 1;
  return count;
}

export function peakOf(signal: ArrayLike<number>, from = 0, to = signal.length): number {
  let peak = 0;
  for (let i = from; i < to; i += 1) peak = Math.max(peak, Math.abs(signal[i] as number));
  return peak;
}

export interface TinySong {
  /** The bars of the one channel. */
  readonly bars: readonly string[];
  /** The instrument of the channel (default: a smooth triangle with a 5 ms release). */
  readonly instrument?: Json;
  /** Fields of the channel besides its instrument (default: 0 dB, centre). */
  readonly channel?: Json;
  readonly tempo?: number;
  readonly loop?: boolean;
}

/** A song of one channel `voice` in C major over a C chord, as JSON. */
export function tinyJson(spec: TinySong): Json {
  return {
    format: "wz.song/0.1",
    id: "test.tiny",
    tempo: spec.tempo ?? 120,
    meter: [4, 4],
    stepsPerBeat: 4,
    key: "C major",
    instruments: { tone: spec.instrument ?? { wave: "triangle", env: { a: 0, d: 0, s: 1, r: 0.005 } } },
    channels: { voice: { instrument: "tone", gainDb: 0, ...spec.channel } },
    sections: { A: { chords: spec.bars.map(() => "C"), voice: [...spec.bars] } },
    order: ["A"],
    loop: spec.loop === true ? { fromOrderIndex: 0 } : false,
  };
}

export function tinySong(spec: TinySong): Song {
  return parseSong(tinyJson(spec));
}

/** The index of the first sample in `[from, to)` where two signals differ; -1 if they are the same. */
export function firstDifference(a: ArrayLike<number>, b: ArrayLike<number>, from = 0, to = Math.max(a.length, b.length)): number {
  for (let i = from; i < to; i += 1) if (a[i] !== b[i]) return i;
  return -1;
}
