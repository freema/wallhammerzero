// The song format, `wz.song/0.1`: a strict reader from JSON to a `Song` whose bars are parsed,
// whose references resolve and whose timeline (the order of sections, flattened into steps)
// is ready for the synth and the validators. docs/audio.md describes the format.

import { AudioDataError, Report } from "./findings.ts";
import type { Finding } from "./findings.ts";
import { parseBar, repeatTarget } from "./grid.ts";
import type { Token } from "./grid.ts";
import { readInstrument, readTone } from "./instrument.ts";
import type { Instrument } from "./instrument.ts";
import { NO_CHORD, parseChord, parseKey } from "./pitch.ts";
import type { Chord, Key } from "./pitch.ts";
import { checkFields, isId, join, readJsonText, readList, readNames, readNumber, readObject, readString, readStrings } from "./reader.ts";
import type { JsonObject } from "./reader.ts";

export const SONG_FORMAT = "wz.song/0.1";

/** A tempo-synced echo on one channel. */
export interface Echo {
  /** The delay in beats (0.75 is a dotted eighth in 4/4). */
  readonly beats: number;
  /** How much of the delayed signal goes back into the delay, 0..0.9. */
  readonly feedback: number;
  /** How loud the echoes are next to the dry signal, 0..1. */
  readonly mix: number;
}

export interface Channel {
  readonly name: string;
  /** The name of its instrument. */
  readonly instrument: string;
  readonly gainDb: number;
  /** -1 is left, 0 the centre, 1 right. */
  readonly pan: number;
  readonly echo: Echo | null;
}

export interface Section {
  readonly name: string;
  /** How many bars the section has: the length of its chord lane. */
  readonly bars: number;
  /** Per bar, one chord per beat; null where the lane says "no chord". */
  readonly chords: readonly (readonly (Chord | null)[])[];
  /** Per channel that plays in the section: its bars, each `stepsPerBar` tokens (repeats resolved). */
  readonly tokens: Readonly<Record<string, readonly (readonly Token[])[]>>;
  /** Per channel: the text of each bar as written, with `=n` repeats left as they are. */
  readonly text: Readonly<Record<string, readonly string[]>>;
}

/** A game state of an adaptive song: which layers play, and an optional low-pass on the mix. */
export interface SongState {
  readonly layers: readonly string[];
  readonly lowpassHz: number | null;
}

/** One bar of the timeline: the song's `order`, flattened. */
export interface TimelineBar {
  /** The position in `order`. */
  readonly orderIndex: number;
  readonly section: string;
  /** The index of the bar in its section. */
  readonly bar: number;
  /** One chord per beat; null for "no chord". */
  readonly chords: readonly (Chord | null)[];
}

/** One note of the timeline. */
export interface TimelineNote {
  /** The index of its channel in `song.channels`. */
  readonly channel: number;
  /** The step it starts on, counted from the start of the song. */
  readonly step: number;
  /** How many steps it is held. A drum hit is 1. */
  readonly steps: number;
  /** The MIDI note; for a drum, -1 (the kit gives the pitch). */
  readonly midi: number;
  readonly arp: readonly number[] | null;
  readonly velocity: number;
  /** The drum key, in a kit channel. */
  readonly drum: string | null;
}

export interface Timeline {
  readonly beatsPerBar: number;
  readonly stepsPerBeat: number;
  readonly stepsPerBar: number;
  readonly bars: readonly TimelineBar[];
  readonly totalSteps: number;
  /** The step the song jumps back to at its end; null if it does not loop. */
  readonly loopStartStep: number | null;
  /** Sorted by step, then by channel. */
  readonly notes: readonly TimelineNote[];
}

export interface Song {
  readonly format: typeof SONG_FORMAT;
  readonly id: string;
  readonly title: string;
  /** Beats per minute. */
  readonly tempo: number;
  /** Beats per bar, and the note value of a beat (4 = a quarter). */
  readonly meter: readonly [number, number];
  readonly stepsPerBeat: number;
  readonly key: Key;
  /** Seeds the noise generators. */
  readonly seed: number;
  readonly instruments: Readonly<Record<string, Instrument>>;
  /** In the order of the file: the order of the stems and of the mix. */
  readonly channels: readonly Channel[];
  readonly sections: Readonly<Record<string, Section>>;
  readonly order: readonly string[];
  /** The index in `order` the song jumps back to at its end; null for a jingle (`loop: false`). */
  readonly loopFrom: number | null;
  /** Named groups of channels. A channel in no layer always plays. */
  readonly layers: Readonly<Record<string, readonly string[]>>;
  readonly states: Readonly<Record<string, SongState>>;
  /** Per orchestration: the instruments it replaces, already merged with the originals. */
  readonly orchestrations: Readonly<Record<string, Readonly<Record<string, Instrument>>>>;
  readonly timeline: Timeline;
}

/** What reading a song gives: the song if it has no errors, and everything that was found. */
export interface SongReading {
  readonly song: Song | null;
  readonly findings: readonly Finding[];
}

const REQUIRED = ["format", "id", "tempo", "meter", "stepsPerBeat", "key", "instruments", "channels", "sections", "order", "loop"] as const;
const OPTIONAL = ["title", "seed", "layers", "states", "orchestrations"] as const;

/** The word that names the chord lane of a section, so no channel may be called it. */
const CHORDS = "chords";

function readEcho(report: Report, value: unknown, path: string): Echo | null {
  const object = readObject(report, value, path);
  if (object === null || !checkFields(report, object, path, ["beats", "feedback", "mix"])) return null;
  const beats = readNumber(report, object["beats"], join(path, "beats"), { min: 0.05, max: 4 });
  const feedback = readNumber(report, object["feedback"], join(path, "feedback"), { min: 0, max: 0.9 });
  const mix = readNumber(report, object["mix"], join(path, "mix"), { min: 0, max: 1 });
  return beats === null || feedback === null || mix === null ? null : { beats, feedback, mix };
}

function readChannels(report: Report, value: unknown, instruments: Readonly<Record<string, Instrument>> | null): Channel[] | null {
  const object = readObject(report, value, "channels");
  if (object === null) return null;
  const channels: Channel[] = [];
  let fine = true;
  for (const name of readNames(report, object, "channels", "channel")) {
    const path = join("channels", name);
    if (name === CHORDS) {
      report.error("parse", path, `a channel cannot be called "${CHORDS}": that is the chord lane of a section`);
      fine = false;
      continue;
    }
    const channel = readObject(report, object[name], path);
    if (channel === null || !checkFields(report, channel, path, ["instrument", "gainDb"], ["pan", "echo"])) {
      fine = false;
      continue;
    }
    const instrument = readString(report, channel["instrument"], join(path, "instrument"));
    const gainDb = readNumber(report, channel["gainDb"], join(path, "gainDb"), { min: -60, max: 6 });
    const pan = channel["pan"] === undefined ? 0 : readNumber(report, channel["pan"], join(path, "pan"), { min: -1, max: 1 });
    const echo = channel["echo"] === undefined ? null : readEcho(report, channel["echo"], join(path, "echo"));
    if (instrument !== null && instruments !== null && !Object.hasOwn(instruments, instrument)) {
      report.error("reference", join(path, "instrument"), `there is no instrument "${instrument}" (known: ${Object.keys(instruments).join(", ")})`);
      fine = false;
    }
    if (instrument === null || gainDb === null || pan === null || (channel["echo"] !== undefined && echo === null)) fine = false;
    else channels.push({ name, instrument, gainDb, pan, echo });
  }
  if (Object.keys(object).length === 0) {
    report.error("parse", "channels", "a song needs at least one channel");
    return null;
  }
  return fine && channels.length === Object.keys(object).length ? channels : null;
}

/** The chord lane of one bar: one chord for the whole bar, or several that share it equally. */
function readBarChords(report: Report, text: string, beatsPerBar: number, path: string): (Chord | null)[] | null {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0 || beatsPerBar % words.length !== 0) {
    report.error("steps", path, `a bar of ${beatsPerBar} beats takes 1 chord or a number of chords that divides ${beatsPerBar}; got ${words.length}: "${text}"`);
    return null;
  }
  const chords: (Chord | null)[] = [];
  for (const word of words) {
    const chord = word === NO_CHORD ? null : parseChord(word);
    if (word !== NO_CHORD && chord === null) {
      report.error("token", path, `"${word}" is not a chord symbol (e.g. F, Dm, G7, Bbmaj7, C/E; "${NO_CHORD}" for no chord)`);
      return null;
    }
    for (let i = 0; i < beatsPerBar / words.length; i += 1) chords.push(chord);
  }
  return chords;
}

interface Shape {
  readonly beatsPerBar: number;
  readonly stepsPerBeat: number;
}

function readSection(
  report: Report,
  value: unknown,
  name: string,
  shape: Shape,
  channels: readonly Channel[],
  instruments: Readonly<Record<string, Instrument>>,
): Section | null {
  const path = join("sections", name);
  const object = readObject(report, value, path);
  if (object === null) return null;
  const before = report.errors;
  checkFields(
    report,
    object,
    path,
    [CHORDS],
    channels.map((channel) => channel.name),
  );
  const chordTexts = object[CHORDS] === undefined ? null : readStrings(report, object[CHORDS], join(path, CHORDS));
  if (chordTexts === null) return null;
  if (chordTexts.length === 0) {
    report.error("parse", join(path, CHORDS), "a section needs at least one bar");
    return null;
  }
  const chords: (readonly (Chord | null)[])[] = [];
  chordTexts.forEach((text, bar) => {
    const barChords = readBarChords(report, text, shape.beatsPerBar, `${join(path, CHORDS)}[${bar}]`);
    if (barChords !== null) chords.push(barChords);
  });

  const tokens: Record<string, Token[][]> = {};
  const texts: Record<string, readonly string[]> = {};
  for (const channel of channels) {
    if (object[channel.name] === undefined) continue;
    const channelPath = join(path, channel.name);
    const bars = readStrings(report, object[channel.name], channelPath);
    if (bars === null) continue;
    if (bars.length !== chordTexts.length) {
      report.error(
        "length",
        channelPath,
        `has ${bars.length} bar(s), but the section has ${chordTexts.length} (the length of its chord lane): every channel of a section must have the same number of bars`,
        { section: name, channel: channel.name },
      );
      continue;
    }
    const instrument = instruments[channel.instrument] as Instrument;
    const context = { drums: instrument.kind === "kit" ? Object.keys(instrument.drums) : null };
    const parsed: (Token[] | null)[] = bars.map((text, bar) =>
      repeatTarget(text) === null ? parseBar(report, text, shape, context, `${channelPath}[${bar}]`, { section: name, channel: channel.name, bar }) : null,
    );
    // Repeats: `=n` takes the tokens of bar n, which must be written out itself.
    let fine = true;
    bars.forEach((text, bar) => {
      const target = repeatTarget(text);
      if (target === null) {
        if (parsed[bar] === null) fine = false;
        return;
      }
      const at = { section: name, channel: channel.name, bar };
      if (target >= bars.length || repeatTarget(bars[target] as string) !== null) {
        const why = target >= bars.length ? `the section has only ${bars.length} bar(s)` : `bar ${target} is a repeat itself`;
        report.error("reference", `${channelPath}[${bar}]`, `"=${target}" must name a bar of this channel that is written out, but ${why}`, at);
        fine = false;
      } else if (parsed[target] === null) fine = false;
      else parsed[bar] = parsed[target] as Token[];
    });
    if (fine) {
      tokens[channel.name] = parsed as Token[][];
      texts[channel.name] = bars;
    }
  }
  if (report.errors > before) return null;
  return { name, bars: chordTexts.length, chords, tokens, text: texts };
}

function readLayers(report: Report, value: unknown, channels: readonly Channel[]): Record<string, readonly string[]> | null {
  const object = readObject(report, value, "layers");
  if (object === null) return null;
  const layers: Record<string, readonly string[]> = {};
  let fine = true;
  for (const name of readNames(report, object, "layers", "layer")) {
    const path = join("layers", name);
    const list = readStrings(report, object[name], path);
    if (list === null) {
      fine = false;
      continue;
    }
    list.forEach((channel, i) => {
      if (!channels.some((candidate) => candidate.name === channel)) {
        report.error("reference", `${path}[${i}]`, `there is no channel "${channel}" (known: ${channels.map((candidate) => candidate.name).join(", ")})`);
        fine = false;
      }
    });
    layers[name] = list;
  }
  return fine && Object.keys(layers).length === Object.keys(object).length ? layers : null;
}

function readStates(report: Report, value: unknown, layers: Readonly<Record<string, readonly string[]>>): Record<string, SongState> | null {
  const object = readObject(report, value, "states");
  if (object === null) return null;
  const states: Record<string, SongState> = {};
  let fine = true;
  for (const name of readNames(report, object, "states", "state")) {
    const path = join("states", name);
    const state = readObject(report, object[name], path);
    if (state === null || !checkFields(report, state, path, ["layers"], ["lowpassHz"])) {
      fine = false;
      continue;
    }
    const list = readStrings(report, state["layers"], join(path, "layers"));
    const lowpassHz = state["lowpassHz"] === undefined ? null : readNumber(report, state["lowpassHz"], join(path, "lowpassHz"), { min: 100, max: 20000 });
    if (list === null || (state["lowpassHz"] !== undefined && lowpassHz === null)) {
      fine = false;
      continue;
    }
    list.forEach((layer, i) => {
      if (!Object.hasOwn(layers, layer)) {
        report.error("reference", `${join(path, "layers")}[${i}]`, `there is no layer "${layer}" (known: ${Object.keys(layers).join(", ") || "none"})`);
        fine = false;
      }
    });
    states[name] = { layers: list, lowpassHz };
  }
  return fine && Object.keys(states).length === Object.keys(object).length ? states : null;
}

/**
 * Orchestrations: per name, a patch per instrument. A patch lists only the fields it changes;
 * it is laid over the instrument as written in the file and the result is read like any
 * instrument. Kits cannot be patched.
 */
function readOrchestrations(
  report: Report,
  value: unknown,
  source: JsonObject,
  instruments: Readonly<Record<string, Instrument>>,
): Record<string, Record<string, Instrument>> | null {
  const object = readObject(report, value, "orchestrations");
  if (object === null) return null;
  const orchestrations: Record<string, Record<string, Instrument>> = {};
  let fine = true;
  for (const name of readNames(report, object, "orchestrations", "orchestration")) {
    const path = join("orchestrations", name);
    const patches = readObject(report, object[name], path);
    if (patches === null) {
      fine = false;
      continue;
    }
    const patched: Record<string, Instrument> = {};
    for (const instrumentName of Object.keys(patches)) {
      const patchPath = join(path, instrumentName);
      const original = Object.hasOwn(instruments, instrumentName) ? instruments[instrumentName] : undefined;
      const patch = readObject(report, patches[instrumentName], patchPath);
      if (original === undefined) {
        report.error("reference", patchPath, `there is no instrument "${instrumentName}" (known: ${Object.keys(instruments).join(", ")})`);
        fine = false;
      } else if (original.kind === "kit") {
        report.error("parse", patchPath, "a kit cannot be patched by an orchestration");
        fine = false;
      } else if (patch === null) fine = false;
      else {
        const tone = readTone(report, { ...(source[instrumentName] as JsonObject), ...patch }, patchPath);
        if (tone === null) fine = false;
        else patched[instrumentName] = { kind: "tone", tone };
      }
    }
    orchestrations[name] = patched;
  }
  return fine && Object.keys(orchestrations).length === Object.keys(object).length ? orchestrations : null;
}

/** Flattens `order` into bars and notes. Holds run across bar lines and section changes. */
function buildTimeline(
  report: Report,
  shape: Shape,
  channels: readonly Channel[],
  sections: Readonly<Record<string, Section>>,
  order: readonly string[],
  loopFrom: number | null,
  isKit: readonly boolean[],
): Timeline {
  const stepsPerBar = shape.beatsPerBar * shape.stepsPerBeat;
  const bars: TimelineBar[] = [];
  let loopStartStep: number | null = null;
  order.forEach((name, orderIndex) => {
    if (orderIndex === loopFrom) loopStartStep = bars.length * stepsPerBar;
    const section = sections[name] as Section;
    for (let bar = 0; bar < section.bars; bar += 1) bars.push({ orderIndex, section: name, bar, chords: section.chords[bar] as readonly (Chord | null)[] });
  });

  const notes: TimelineNote[] = [];
  channels.forEach((channel, channelIndex) => {
    // The note that is sounding, as an index into `notes`; -1 for silence.
    let open = -1;
    // True while a run of "-" with nothing to hold is being read: it is reported once.
    let dangling = false;
    bars.forEach((bar, barIndex) => {
      const tokens = (sections[bar.section] as Section).tokens[channel.name]?.[bar.bar];
      if (tokens === undefined) {
        open = -1;
        return;
      }
      tokens.forEach((token, stepInBar) => {
        const step = barIndex * stepsPerBar + stepInBar;
        if (token.kind === "hold") {
          if (open >= 0) {
            const held = notes[open] as TimelineNote;
            notes[open] = { ...held, steps: held.steps + 1 };
          } else if (!dangling && !(isKit[channelIndex] as boolean)) {
            dangling = true;
            const beat = Math.floor(stepInBar / shape.stepsPerBeat);
            report.warning(
              "hold",
              `${join(join("sections", bar.section), channel.name)}[${bar.bar}]`,
              `beat ${beat + 1}, step ${(stepInBar % shape.stepsPerBeat) + 1}: "-" has no note to hold (the step before it is silent); it is read as silence`,
              { section: bar.section, channel: channel.name, bar: bar.bar, beat, step: stepInBar % shape.stepsPerBeat },
            );
          }
          return;
        }
        dangling = false;
        if (token.kind === "rest") open = -1;
        else if (token.kind === "note") {
          open = notes.length;
          notes.push({ channel: channelIndex, step, steps: 1, midi: token.midi, arp: token.arp, velocity: token.velocity, drum: null });
        } else {
          // A drum hit is a point in time: a "-" after it holds nothing.
          open = -1;
          notes.push({ channel: channelIndex, step, steps: 1, midi: -1, arp: null, velocity: token.velocity, drum: token.key });
        }
      });
    });
  });
  notes.sort((a, b) => a.step - b.step || a.channel - b.channel);
  return { beatsPerBar: shape.beatsPerBar, stepsPerBeat: shape.stepsPerBeat, stepsPerBar, bars, totalSteps: bars.length * stepsPerBar, loopStartStep, notes };
}

/** The longest song the format takes, in bars of its order. */
export const MAX_BARS = 512;

/**
 * Reads a song from a parsed JSON value. The findings are parse errors only; the musical
 * checks are in lint.ts (`lintSong`), and `checkSong` runs both.
 */
export function readSong(value: unknown, report: Report = new Report()): SongReading {
  const done = (song: Song | null): SongReading => ({ song: report.errors > 0 ? null : song, findings: report.findings });
  const object = readObject(report, value, "");
  if (object === null) return done(null);
  checkFields(report, object, "", REQUIRED, OPTIONAL);

  if (object["format"] !== SONG_FORMAT) report.error("parse", "format", `must be "${SONG_FORMAT}", got ${JSON.stringify(object["format"])}`);
  const id = object["id"] === undefined ? null : readString(report, object["id"], "id");
  if (id !== null && !isId(id)) report.error("parse", "id", `an id is lowercase letters and digits with ".", "_" or "-" between them (e.g. "bgm.shop.day"), got ${JSON.stringify(id)}`);
  const title = object["title"] === undefined ? "" : readString(report, object["title"], "title");
  const tempo = object["tempo"] === undefined ? null : readNumber(report, object["tempo"], "tempo", { min: 30, max: 300, integer: true });
  const stepsPerBeat = object["stepsPerBeat"] === undefined ? null : readNumber(report, object["stepsPerBeat"], "stepsPerBeat", { min: 1, max: 8, integer: true });
  const seed = object["seed"] === undefined ? 1 : readNumber(report, object["seed"], "seed", { min: 0, max: 0xffffffff, integer: true });

  let meter: [number, number] | null = null;
  const meterList = object["meter"] === undefined ? null : readList(report, object["meter"], "meter");
  if (meterList !== null) {
    if (meterList.length !== 2) report.error("parse", "meter", `must be [beats per bar, note value of a beat], e.g. [4, 4]; got ${meterList.length} entries`);
    else {
      const beats = readNumber(report, meterList[0], "meter[0]", { min: 1, max: 12, integer: true });
      const unit = meterList[1] === 2 || meterList[1] === 4 || meterList[1] === 8 ? meterList[1] : null;
      if (unit === null) report.error("parse", "meter[1]", `must be 2, 4 or 8, got ${JSON.stringify(meterList[1])}`);
      if (beats !== null && unit !== null) meter = [beats, unit];
    }
  }

  const keyText = object["key"] === undefined ? null : readString(report, object["key"], "key");
  const key = keyText === null ? null : parseKey(keyText);
  if (keyText !== null && key === null) {
    report.error("parse", "key", `must be a root and a mode, e.g. "F major", "D minor", "G mixolydian" (modes: major, minor, dorian, phrygian, lydian, mixolydian, locrian); got ${JSON.stringify(keyText)}`);
  }

  // Instruments, then channels (which name instruments).
  let instruments: Record<string, Instrument> | null = null;
  const instrumentsObject = object["instruments"] === undefined ? null : readObject(report, object["instruments"], "instruments");
  if (instrumentsObject !== null) {
    instruments = {};
    for (const name of readNames(report, instrumentsObject, "instruments", "instrument")) {
      const instrument = readInstrument(report, instrumentsObject[name], join("instruments", name));
      if (instrument !== null) instruments[name] = instrument;
    }
    if (Object.keys(instruments).length !== Object.keys(instrumentsObject).length) instruments = null;
  }
  const channels = object["channels"] === undefined ? null : readChannels(report, object["channels"], instruments);

  // Sections need the shape of a bar and the channels.
  let sections: Record<string, Section> | null = null;
  const sectionsObject = object["sections"] === undefined ? null : readObject(report, object["sections"], "sections");
  if (sectionsObject !== null && meter !== null && stepsPerBeat !== null && channels !== null && instruments !== null) {
    sections = {};
    const shape = { beatsPerBar: meter[0], stepsPerBeat };
    for (const name of readNames(report, sectionsObject, "sections", "section")) {
      const section = readSection(report, sectionsObject[name], name, shape, channels, instruments);
      if (section !== null) sections[name] = section;
    }
    if (Object.keys(sectionsObject).length === 0) report.error("parse", "sections", "a song needs at least one section");
    if (Object.keys(sections).length !== Object.keys(sectionsObject).length) sections = null;
  }

  const order = object["order"] === undefined ? null : readStrings(report, object["order"], "order");
  if (order !== null && order.length === 0) report.error("parse", "order", "must name at least one section");
  if (order !== null && sectionsObject !== null) {
    order.forEach((name, i) => {
      if (!Object.hasOwn(sectionsObject, name)) report.error("reference", `order[${i}]`, `there is no section "${name}" (known: ${Object.keys(sectionsObject).join(", ")})`);
    });
  }

  // loop: false for a jingle, or { fromOrderIndex } for where the song jumps back to.
  let loopFrom: number | null = null;
  if (object["loop"] !== undefined && object["loop"] !== false) {
    const loop = readObject(report, object["loop"], "loop");
    if (loop === null) report.error("parse", "loop", 'use false for a song that plays once (a jingle), or { "fromOrderIndex": 0 } for a loop');
    else if (checkFields(report, loop, "loop", ["fromOrderIndex"])) {
      loopFrom = readNumber(report, loop["fromOrderIndex"], "loop.fromOrderIndex", { min: 0, max: Math.max(0, (order?.length ?? 1) - 1), integer: true });
    }
  }

  const layers = object["layers"] === undefined ? {} : channels === null ? null : readLayers(report, object["layers"], channels);
  const states = object["states"] === undefined ? {} : layers === null ? null : readStates(report, object["states"], layers);
  const orchestrations =
    object["orchestrations"] === undefined
      ? {}
      : instruments === null || instrumentsObject === null
        ? null
        : readOrchestrations(report, object["orchestrations"], instrumentsObject, instruments);

  if (
    report.errors > 0 ||
    id === null ||
    title === null ||
    tempo === null ||
    stepsPerBeat === null ||
    seed === null ||
    meter === null ||
    key === null ||
    instruments === null ||
    channels === null ||
    sections === null ||
    order === null ||
    layers === null ||
    states === null ||
    orchestrations === null
  ) {
    return done(null);
  }

  const bars = order.reduce((sum, name) => sum + (sections[name] as Section).bars, 0);
  if (bars > MAX_BARS) {
    report.error("parse", "order", `the song is ${bars} bars long; the limit is ${MAX_BARS}`);
    return done(null);
  }
  const isKit = channels.map((channel) => (instruments[channel.instrument] as Instrument).kind === "kit");
  const timeline = buildTimeline(report, { beatsPerBar: meter[0], stepsPerBeat }, channels, sections, order, loopFrom, isKit);
  return done({ format: SONG_FORMAT, id, title, tempo, meter, stepsPerBeat, key, seed, instruments, channels, sections, order, loopFrom, layers, states, orchestrations, timeline });
}

/** Reads a song from JSON text: `readSong` plus the checks only the text allows (duplicate keys). */
export function readSongText(text: string): SongReading {
  const report = new Report();
  const value = readJsonText(report, text);
  return report.errors > 0 ? { song: null, findings: report.findings } : readSong(value, report);
}

/** The song of a parsed JSON value; throws `AudioDataError` if it has errors. */
export function parseSong(value: unknown): Song {
  const { song, findings } = readSong(value);
  if (song === null) throw new AudioDataError("the song", findings);
  return song;
}

/** The channels that play in a state: those of its layers, and every channel that is in no layer. */
export function channelsOfState(song: Song, state: string | null): boolean[] {
  if (state === null) return song.channels.map(() => true);
  const chosen = song.states[state];
  if (chosen === undefined) throw new RangeError(`the song "${song.id}" has no state "${state}" (known: ${Object.keys(song.states).join(", ") || "none"})`);
  const layered = new Set(Object.values(song.layers).flat());
  const playing = new Set(chosen.layers.flatMap((layer) => song.layers[layer] ?? []));
  return song.channels.map((channel) => !layered.has(channel.name) || playing.has(channel.name));
}

/** The instruments of a song under an orchestration (null: as written). */
export function instrumentsOf(song: Song, orchestration: string | null): Readonly<Record<string, Instrument>> {
  if (orchestration === null) return song.instruments;
  const patched = song.orchestrations[orchestration];
  if (patched === undefined) {
    throw new RangeError(`the song "${song.id}" has no orchestration "${orchestration}" (known: ${Object.keys(song.orchestrations).join(", ") || "none"})`);
  }
  return { ...song.instruments, ...patched };
}
