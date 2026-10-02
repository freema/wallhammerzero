// The musical validators: what a pair of ears would notice, as numbers with thresholds.
// Each rule answers one failure from research/audio-from-code.md §1.3.
//
//   range        error    a note outside C1..C7
//   off-key      error    a note on a beat that is neither in the key nor in the bar's chord
//   chromatic    warning  the same, off the beat (a passing note)
//   chord-clash  warning  a note on a beat that is a semitone above a tone of the chord
//   noodling     warning  a channel that starts a note on more than half of its steps and
//                         rests on fewer than a tenth of them
//   repetitive   warning  fewer than a quarter of the song's bars are different
//   silent       warning  a channel without a single note
//
// The step counts, bar counts and tokens are checked while the song is read (song.ts), since
// a song with a wrong bar cannot be laid out in time at all.

import { Report } from "./findings.ts";
import type { Finding } from "./findings.ts";
import { MAX_NOTE, MIN_NOTE, noteName, pitchClassName } from "./pitch.ts";
import type { Chord } from "./pitch.ts";
import { readSong, readSongText } from "./song.ts";
import type { Section, Song, SongReading, TimelineBar } from "./song.ts";

/** More onsets than this per step, with fewer rests than REST_FLOOR, is noodling. */
export const NOODLING_ONSETS = 0.5;
export const NOODLING_RESTS = 0.1;
/** A song of at least REPETITIVE_MIN_BARS bars needs this share of different bars. */
export const REPETITIVE_RATIO = 0.25;
export const REPETITIVE_MIN_BARS = 8;

/** What a channel plays, in numbers. */
export interface ChannelStats {
  readonly channel: string;
  /** True for a kit channel. */
  readonly kit: boolean;
  /** Bars of the song in which the channel has a part. */
  readonly bars: number;
  readonly notes: number;
  /** Notes started per step, over the bars the channel plays in. 1 is a note on every step. */
  readonly onsetsPerStep: number;
  /** The share of silent steps, over the bars the channel plays in. */
  readonly restRatio: number;
  /** The lowest and highest note (with arpeggio offsets); null for a kit or a silent channel. */
  readonly lowest: string | null;
  readonly highest: string | null;
  /** Different bars divided by bars, over the bars the channel plays in. */
  readonly uniqueBarRatio: number;
}

export interface SongStats {
  /** The length of the song: bars of its order, and seconds. */
  readonly bars: number;
  readonly seconds: number;
  /** Different bars (all pitched channels and the chords together) divided by bars. */
  readonly uniqueBarRatio: number;
  readonly channels: readonly ChannelStats[];
}

function barPath(bar: TimelineBar, channel: string): string {
  return `sections.${bar.section}.${channel}[${bar.bar}]`;
}

/** The numbers behind the density, rest and repetition rules. */
export function songStats(song: Song): SongStats {
  const { timeline } = song;
  const perChannel = song.channels.map((channel, index): ChannelStats => {
    const kit = (song.instruments[channel.instrument] as Song["instruments"][string]).kind === "kit";
    const notes = timeline.notes.filter((note) => note.channel === index);
    const playedBars = timeline.bars.filter((bar) => (song.sections[bar.section] as Section).tokens[channel.name] !== undefined);
    const steps = playedBars.length * timeline.stepsPerBar;
    let sounding = 0;
    let low = Infinity;
    let high = -Infinity;
    for (const note of notes) {
      sounding += note.steps;
      if (note.drum === null) {
        low = Math.min(low, note.midi + Math.min(0, ...(note.arp ?? [0])));
        high = Math.max(high, note.midi + Math.max(0, ...(note.arp ?? [0])));
      }
    }
    const texts = playedBars.map((bar) => ((song.sections[bar.section] as Section).tokens[channel.name] as Section["tokens"][string])[bar.bar]);
    const unique = new Set(texts.map((tokens) => JSON.stringify(tokens))).size;
    return {
      channel: channel.name,
      kit,
      bars: playedBars.length,
      notes: notes.length,
      onsetsPerStep: steps === 0 ? 0 : notes.length / steps,
      restRatio: steps === 0 ? 1 : 1 - sounding / steps,
      lowest: Number.isFinite(low) ? noteName(low) : null,
      highest: Number.isFinite(high) ? noteName(high) : null,
      uniqueBarRatio: playedBars.length === 0 ? 1 : unique / playedBars.length,
    };
  });

  // A bar of the whole song: its chords and what every pitched channel plays in it.
  const columns = timeline.bars.map((bar) => {
    const section = song.sections[bar.section] as Section;
    const parts = song.channels.filter((_, index) => !(perChannel[index] as ChannelStats).kit).map((channel) => section.tokens[channel.name]?.[bar.bar] ?? null);
    return JSON.stringify([bar.chords.map((chord) => chord?.name ?? null), parts]);
  });
  const stepSeconds = 60 / (song.tempo * song.stepsPerBeat);
  return {
    bars: timeline.bars.length,
    seconds: timeline.totalSteps * stepSeconds,
    uniqueBarRatio: columns.length === 0 ? 1 : new Set(columns).size / columns.length,
    channels: perChannel,
  };
}

/** True if a pitch class sits a semitone above a tone of the chord without being one. */
function clashes(pitchClass: number, chord: Chord): boolean {
  return !(chord.pitchClasses[pitchClass] as boolean) && (chord.pitchClasses[(pitchClass + 11) % 12] as boolean);
}

/** The musical checks of a song that was read without errors. */
export function lintSong(song: Song): Finding[] {
  const report = new Report();
  const { timeline } = song;
  const stats = songStats(song);

  // Key, chords and range, note by note. A section that is played twice is reported once.
  const seen = new Set<string>();
  for (const note of timeline.notes) {
    if (note.drum !== null) continue;
    const barIndex = Math.floor(note.step / timeline.stepsPerBar);
    const bar = timeline.bars[barIndex] as TimelineBar;
    const stepInBar = note.step - barIndex * timeline.stepsPerBar;
    const beat = Math.floor(stepInBar / timeline.stepsPerBeat);
    const step = stepInBar % timeline.stepsPerBeat;
    const channel = (song.channels[note.channel] as Song["channels"][number]).name;
    const place = `${bar.section}/${bar.bar}/${channel}/${stepInBar}`;
    if (seen.has(place)) continue;
    seen.add(place);
    const path = barPath(bar, channel);
    const at = { section: bar.section, channel, bar: bar.bar, beat, step };
    const where = `beat ${beat + 1}${step === 0 ? "" : `, step ${step + 1}`}`;
    const chord = bar.chords[beat] as Chord | null;
    const onBeat = step === 0;

    for (const offset of note.arp ?? [0]) {
      const midi = note.midi + offset;
      const name = noteName(midi);
      if (midi < MIN_NOTE || midi > MAX_NOTE) {
        report.error("range", path, `${where}: ${name} is outside ${noteName(MIN_NOTE)}..${noteName(MAX_NOTE)}`, at);
        continue;
      }
      const pitchClass = midi % 12;
      const inKey = song.key.pitchClasses[pitchClass] as boolean;
      const inChord = chord !== null && (chord.pitchClasses[pitchClass] as boolean);
      if (!inKey && !inChord) {
        const against = chord === null ? song.key.name : `${song.key.name} and the chord ${chord.name}`;
        if (onBeat) report.error("off-key", path, `${where}: ${name} is on the beat but is not in ${against}`, at);
        else report.warning("chromatic", path, `${where}: ${name} is not in ${against} (fine as a passing note)`, at);
      } else if (onBeat && chord !== null && !inChord && clashes(pitchClass, chord)) {
        const below = pitchClassName(pitchClass + 11);
        report.warning("chord-clash", path, `${where}: ${name} on the beat is a semitone above ${below}, a tone of the chord ${chord.name}`, at);
      }
    }
  }

  for (const channel of stats.channels) {
    const path = `channels.${channel.channel}`;
    if (channel.notes === 0) {
      report.warning("silent", path, "the channel does not play a single note", { channel: channel.channel });
      continue;
    }
    if (!channel.kit && channel.onsetsPerStep > NOODLING_ONSETS && channel.restRatio < NOODLING_RESTS) {
      report.warning(
        "noodling",
        path,
        `a note starts on ${Math.floor(channel.onsetsPerStep * 100)} % of the steps and only ${Math.floor(channel.restRatio * 100)} % of them are silent: leave rests and hold notes`,
        { channel: channel.channel },
      );
    }
  }
  if (stats.bars >= REPETITIVE_MIN_BARS && stats.uniqueBarRatio < REPETITIVE_RATIO) {
    report.warning(
      "repetitive",
      "order",
      `only ${Math.floor(stats.uniqueBarRatio * 100)} % of the ${stats.bars} bars are different: vary the motif (sequence, inversion, a shifted rhythm) instead of repeating it`,
    );
  }
  return report.findings;
}

/** Reads a song and, if it has no errors, runs the musical checks too. */
export function checkSong(value: unknown): SongReading {
  const reading = readSong(value);
  return reading.song === null ? reading : { song: reading.song, findings: [...reading.findings, ...lintSong(reading.song)] };
}

/** `checkSong` for JSON text (with the duplicate-key check). */
export function checkSongText(text: string): SongReading {
  const reading = readSongText(text);
  return reading.song === null ? reading : { song: reading.song, findings: [...reading.findings, ...lintSong(reading.song)] };
}
