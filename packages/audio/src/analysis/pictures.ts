// Pictures of sound for a reader that cannot hear: the piano roll (what was written) and the
// spectrogram (what came out). Like the review sheets of the asset kit they are plain RGB
// canvases with the pixel font, never longer than 2000 px on an edge
// (docs/looking-at-images.md); `@whz/audio/node` encodes them as PNG.

import { MAX_REVIEW_EDGE, RgbCanvas } from "@whz/asset-kit";
import type { Finding } from "../findings.ts";
import type { Instrument } from "../instrument.ts";
import { noteName } from "../pitch.ts";
import type { Sfx } from "../sfx.ts";
import type { Song } from "../song.ts";
import { Spectrum } from "./spectrum.ts";

const PAGE = 0x17171c;
const TEXT = 0xe9e9f2;
const DIM = 0x8d8fa3;
const TITLE = 0xffd166;
const BAR_LINE = 0x6a6c80;
const BEAT_LINE = 0x33343f;
const WHITE_KEY = 0x262730;
const BLACK_KEY = 0x1d1e25;
const ERROR = 0xff3030;
const WARNING = 0xff8c1a;
/** One colour per lane, in turn. None is red or orange: those mean a finding. */
const LANE_COLORS = [0x4cc9f0, 0x80ed99, 0xffe066, 0xc77dff, 0x5b8def, 0xf4a6c0, 0x2ec4b6, 0xbfc0c0];

const TEXT_SCALE = 2;
const CHAR_W = 6 * TEXT_SCALE;
const LINE_H = 7 * TEXT_SCALE + 6;
const PAD = 8;
const LEFT = 64;
const MAX_PLOT_W = MAX_REVIEW_EDGE - LEFT - PAD - 20;

// ---------------------------------------------------------------------------------------
// The piano roll

export interface RollNote {
  /** The first column of the note, and how many columns it lasts. */
  readonly column: number;
  readonly length: number;
  /** A MIDI note in a pitch lane; the index of the drum in a drum lane. */
  readonly row: number;
  /** Drawn smaller and paler: the other tones of an arpeggio. */
  readonly ghost?: boolean;
  /** The severity of a finding on the note. */
  readonly flag?: "error" | "warning" | null;
}

export interface RollLane {
  readonly caption: string;
  /** The drum keys of a drum lane, top to bottom; null for a pitch lane. */
  readonly drums: readonly string[] | null;
  readonly notes: readonly RollNote[];
}

/** What a piano roll shows. A column is a step of a song, or 5 ms of an SFX. */
export interface RollModel {
  readonly title: string;
  readonly columns: number;
  /** Columns per bar (or per labelled stretch of time): a strong line and a label. */
  readonly major: number;
  /** Columns per beat: a faint line. 0 for none. */
  readonly minor: number;
  /** Rows of labels above the lanes, one label per major. */
  readonly headers: readonly { readonly name: string; readonly cells: readonly string[] }[];
  readonly lanes: readonly RollLane[];
  /** The last line of the image: what the marks mean. */
  readonly legend: string;
}

function fit(text: string, width: number): string {
  const chars = Math.max(0, Math.floor(width / CHAR_W));
  return text.length <= chars ? text : text.slice(0, chars);
}

function mixColor(a: number, b: number, t: number): number {
  const channel = (shift: number): number => Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** The pitch range a lane is drawn over: its notes and a row of air on each side. */
function pitchRange(lane: RollLane): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const note of lane.notes) {
    low = Math.min(low, note.row);
    high = Math.max(high, note.row);
  }
  if (!Number.isFinite(low)) return { low: 59, high: 61 };
  return { low: low - 1, high: high + 1 };
}

const DRUM_ROW_H = 18;

function laneHeight(lane: RollLane, rowH: number): number {
  if (lane.drums !== null) return lane.drums.length * DRUM_ROW_H;
  const { low, high } = pitchRange(lane);
  return (high - low + 1) * rowH;
}

/** The thinnest a row of a pitch lane gets. */
const MIN_ROW_H = 3;

/**
 * Draws a piano roll. A roll that is too wide for one image is split into pages of whole
 * majors; one with too many lanes to fit under each other, into pages of whole lanes.
 */
export function drawPianoRoll(model: RollModel): RgbCanvas[] {
  const cell = Math.max(model.major * 3 > MAX_PLOT_W ? 1 : 3, Math.min(12, Math.floor(MAX_PLOT_W / Math.max(1, model.columns))));
  const majors = Math.ceil(model.columns / model.major);
  const majorsPerPage = Math.max(1, Math.floor(MAX_PLOT_W / (model.major * cell)));
  const pages = Math.ceil(majors / majorsPerPage);

  // The rows of a pitch lane get thinner until the page fits.
  const fixedFor = (lanes: number): number => PAD * 2 + LINE_H * (1 + model.headers.length) + lanes * (LINE_H + PAD) + LINE_H;
  const fixed = fixedFor(model.lanes.length);
  let rowH = 6;
  while (rowH > MIN_ROW_H && fixed + model.lanes.reduce((sum, lane) => sum + laneHeight(lane, rowH), 0) > MAX_REVIEW_EDGE) rowH -= 1;
  const height = fixed + model.lanes.reduce((sum, lane) => sum + laneHeight(lane, rowH), 0);
  if (height > MAX_REVIEW_EDGE && model.lanes.length > 1) {
    // Still too tall with the thinnest rows: as many whole lanes per picture as fit.
    const groups: RollLane[][] = [[]];
    let used = 0;
    for (const lane of model.lanes) {
      const group = groups[groups.length - 1] as RollLane[];
      const h = laneHeight(lane, MIN_ROW_H);
      if (group.length > 0 && fixedFor(group.length + 1) + used + h > MAX_REVIEW_EDGE) {
        groups.push([lane]);
        used = h;
      } else {
        group.push(lane);
        used += h;
      }
    }
    return groups.flatMap((lanes, i) => drawPianoRoll({ ...model, lanes, title: `${model.title}  LANES ${i + 1}/${groups.length}` }));
  }
  const flagged = model.lanes.some((lane) => lane.notes.some((note) => note.flag === "error" || note.flag === "warning"));

  const canvases: RgbCanvas[] = [];
  for (let page = 0; page < pages; page += 1) {
    const firstMajor = page * majorsPerPage;
    const lastMajor = Math.min(majors, firstMajor + majorsPerPage);
    const firstColumn = firstMajor * model.major;
    const columns = Math.min(model.columns, lastMajor * model.major) - firstColumn;
    const plotW = columns * cell;
    const title = `${model.title}${pages > 1 ? `  PAGE ${page + 1}/${pages}` : ""}`;
    const legend = `${flagged ? "RED: ERROR   ORANGE: WARNING   " : ""}${model.legend}`;
    // A short roll is still wide enough for its title, its captions and its legend.
    const longest = Math.max(title.length, legend.length, ...model.lanes.map((lane) => lane.caption.length + 2));
    const canvas = new RgbCanvas(Math.min(MAX_REVIEW_EDGE, Math.max(LEFT + plotW + PAD, longest * CHAR_W + PAD * 2)), height, PAGE);
    const x0 = LEFT;
    const xOf = (column: number): number => x0 + (column - firstColumn) * cell;
    let y = PAD;

    canvas.text(fit(title, canvas.w - PAD * 2), PAD, y + 3, TITLE);
    y += LINE_H;
    for (const header of model.headers) {
      canvas.text(fit(header.name, LEFT - PAD), PAD, y + 3, DIM);
      for (let major = firstMajor; major < lastMajor; major += 1) {
        canvas.text(fit(header.cells[major] ?? "", model.major * cell - 4), xOf(major * model.major) + 3, y + 3, TEXT);
      }
      y += LINE_H;
    }

    const grid = (top: number, h: number): void => {
      for (let column = 0; column <= columns; column += 1) {
        const absolute = firstColumn + column;
        if (absolute % model.major === 0) canvas.fill(x0 + column * cell, top, 1, h, BAR_LINE);
        else if (model.minor > 0 && absolute % model.minor === 0) canvas.fill(x0 + column * cell, top, 1, h, BEAT_LINE);
      }
    };

    model.lanes.forEach((lane, laneIndex) => {
      const color = LANE_COLORS[laneIndex % LANE_COLORS.length] as number;
      canvas.fill(PAD, y + 5, 10, 10, color);
      canvas.text(fit(lane.caption, canvas.w - PAD * 2 - 16), PAD + 16, y + 3, TEXT);
      y += LINE_H;
      const h = laneHeight(lane, rowH);
      const visible = lane.notes.filter((note) => note.column < firstColumn + columns && note.column + note.length > firstColumn);
      const paint = (note: RollNote, top: number, noteH: number): void => {
        const start = Math.max(note.column, firstColumn);
        const end = Math.min(note.column + note.length, firstColumn + columns);
        const fill = note.flag === "error" ? ERROR : note.flag === "warning" ? WARNING : note.ghost === true ? mixColor(color, PAGE, 0.55) : color;
        const w = Math.max(1, (end - start) * cell - 1);
        canvas.fill(xOf(start) + 1, top, w, noteH, fill);
        // The start of a note is brighter, so two notes in a row do not read as one long note.
        if (start === note.column && note.ghost !== true) canvas.fill(xOf(start) + 1, top, Math.min(2, w), noteH, mixColor(fill, 0xffffff, 0.7));
      };
      if (lane.drums !== null) {
        lane.drums.forEach((key, row) => {
          canvas.fill(x0, y + row * DRUM_ROW_H, plotW, DRUM_ROW_H - 1, row % 2 === 0 ? WHITE_KEY : BLACK_KEY);
          canvas.text(fit(key, LEFT - PAD * 2), PAD, y + row * DRUM_ROW_H + 2, DIM);
        });
        grid(y, h);
        for (const note of visible) paint(note, y + note.row * DRUM_ROW_H + 4, DRUM_ROW_H - 9);
      } else {
        const { low, high } = pitchRange(lane);
        let labelled = false;
        for (let midi = high; midi >= low; midi -= 1) {
          const top = y + (high - midi) * rowH;
          const black = [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
          canvas.fill(x0, top, plotW, rowH, black ? BLACK_KEY : WHITE_KEY);
          if (((midi % 12) + 12) % 12 === 0) {
            canvas.fill(x0 - 6, top + rowH - 1, 6, 1, DIM);
            canvas.text(noteName(midi), PAD, Math.min(top - 4, y + h - 14), DIM);
            labelled = true;
          }
        }
        if (!labelled) canvas.text(noteName(low + 1), PAD, y + h - 14, DIM);
        grid(y, h);
        for (const note of visible) paint(note, y + (high - note.row) * rowH + (note.ghost === true ? 1 : 0), note.ghost === true ? rowH - 2 : rowH - 1);
      }
      y += h + PAD;
    });
    canvas.text(fit(legend, canvas.w - PAD * 2), PAD, y + 3, DIM);
    canvases.push(canvas);
  }
  return canvases;
}

function toneCaption(instrument: Instrument): string {
  if (instrument.kind === "kit") return "KIT";
  const { tone } = instrument;
  if (tone.wave === "pulse") return `PULSE ${tone.duty * 100}%`;
  if (tone.wave === "triangle") return tone.stepped ? "TRIANGLE 4-BIT" : "TRIANGLE";
  if (tone.wave === "noise") return `NOISE ${tone.mode.toUpperCase()}`;
  return "WAVE";
}

/** The piano roll of a song: a column per step, a lane per channel, the findings marked. */
export function songRoll(song: Song, findings: readonly Finding[] = []): RollModel {
  const { timeline } = song;
  // The worst finding per note: its section, bar and step in the bar, per channel.
  const flags = new Map<string, "error" | "warning">();
  for (const finding of findings) {
    const at = finding.at;
    if (at?.section === undefined || at.channel === undefined || at.bar === undefined || at.beat === undefined) continue;
    const key = `${at.section}/${at.bar}/${at.channel}/${at.beat * timeline.stepsPerBeat + (at.step ?? 0)}`;
    if (finding.severity === "error" || !flags.has(key)) flags.set(key, finding.severity);
  }

  const lanes = song.channels.map((channel, index): RollLane => {
    const instrument = song.instruments[channel.instrument] as Instrument;
    const drums = instrument.kind === "kit" ? Object.keys(instrument.drums) : null;
    const notes: RollNote[] = [];
    for (const note of timeline.notes) {
      if (note.channel !== index) continue;
      const barIndex = Math.floor(note.step / timeline.stepsPerBar);
      const bar = timeline.bars[barIndex] as Song["timeline"]["bars"][number];
      const flag = flags.get(`${bar.section}/${bar.bar}/${channel.name}/${note.step - barIndex * timeline.stepsPerBar}`) ?? null;
      if (drums !== null) notes.push({ column: note.step, length: 1, row: drums.indexOf(note.drum ?? ""), flag });
      else {
        for (const offset of note.arp ?? []) if (offset !== 0) notes.push({ column: note.step, length: note.steps, row: note.midi + offset, ghost: true });
        notes.push({ column: note.step, length: note.steps, row: note.midi, flag });
      }
    }
    const pan = channel.pan === 0 ? "" : `  PAN ${channel.pan}`;
    return { caption: `${channel.name}  ${toneCaption(instrument)}  ${channel.gainDb} DB${pan}${channel.echo === null ? "" : "  ECHO"}`, drums, notes };
  });

  const loopBar = timeline.loopStartStep === null ? -1 : timeline.loopStartStep / timeline.stepsPerBar;
  const loop = song.loopFrom === null ? "PLAYS ONCE" : "LOOPS";
  return {
    title: `${song.id}  ${song.key.name}  ${song.tempo} BPM  ${song.meter[0]}/${song.meter[1]}  ${timeline.bars.length} BARS  ${loop}`,
    columns: timeline.totalSteps,
    major: timeline.stepsPerBar,
    minor: timeline.stepsPerBeat,
    headers: [
      { name: "BAR", cells: timeline.bars.map((bar, i) => `${i + 1}${i === loopBar ? "<" : ""} ${bar.bar === 0 ? bar.section : ""}`.trim()) },
      { name: "CHD", cells: timeline.bars.map((bar) => [...new Set(bar.chords.map((chord) => chord?.name ?? "-"))].join(" ")) },
    ],
    lanes,
    legend: "PALE: ARPEGGIO TONES   < AFTER A BAR NUMBER: THE LOOP POINT",
  };
}

/** The seconds one column of an SFX roll stands for. */
const SFX_COLUMN_SEC = 0.005;

/** The piano roll of an SFX: a column per 5 ms, a lane per voice. */
export function sfxRoll(sfx: Sfx): RollModel {
  const toColumn = (seconds: number): number => Math.round(seconds / SFX_COLUMN_SEC);
  let end = 0;
  const lanes = sfx.voices.map((voice, index): RollLane => {
    const notes: RollNote[] = [];
    let time = voice.startSec;
    for (const note of voice.notes) {
      const column = toColumn(time);
      const length = Math.max(1, toColumn(time + note.seconds) - column);
      if (note.midi !== null) {
        for (const offset of note.arp ?? []) if (offset !== 0) notes.push({ column, length, row: note.midi + offset, ghost: true });
        notes.push({ column, length, row: note.midi });
      }
      time += note.seconds;
    }
    end = Math.max(end, time + voice.tone.env.r);
    return { caption: `VOICE ${index + 1}  ${toneCaption({ kind: "tone", tone: voice.tone })}  ${voice.gainDb} DB  RELEASE ${Math.round(voice.tone.env.r * 1000)} MS`, drums: null, notes };
  });
  const major = 20;
  const columns = Math.max(major, Math.ceil(toColumn(end) / major) * major);
  return {
    title: `${sfx.id}  ${Math.round(end * 1000)} MS  ${sfx.gainDb} DB`,
    columns,
    major,
    minor: 0,
    headers: [{ name: "MS", cells: Array.from({ length: columns / major }, (_, i) => String(Math.round(i * major * SFX_COLUMN_SEC * 1000))) }],
    lanes,
    legend: "A COLUMN IS 5 MS   PALE: ARPEGGIO TONES",
  };
}

// ---------------------------------------------------------------------------------------
// The spectrogram

export interface SpectrogramOptions {
  readonly title: string;
  /** Vertical marks with a label: the bars of a song, or times of an SFX. */
  readonly marks?: readonly { readonly frame: number; readonly label: string }[];
}

const SPEC_LEFT = 52;
const SPEC_H = 320;
const SPEC_LOW_HZ = 50;
const SPEC_HIGH_HZ = 20000;
const SPEC_FLOOR_DB = -84;
const SPEC_TOP_DB = -6;
/** From silence to full level: black, purple, magenta, orange, pale yellow. */
const RAMP = [0x0b0b14, 0x3b1c6b, 0xb5367a, 0xf9844a, 0xfff3b0];
const EIGHT_K = 0x4cc9f0;

function rampColor(t: number): number {
  const clamped = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
  const index = Math.min(RAMP.length - 2, Math.floor(clamped));
  return mixColor(RAMP[index] as number, RAMP[index + 1] as number, clamped - index);
}

/**
 * Draws a spectrogram: time left to right (600 to 1800 px), frequency on
 * a logarithmic scale from 50 Hz to 20 kHz, level as colour from -84 dB (black) to -6 dB
 * (pale yellow). The line at 8 kHz is the one the "harsh" check measures above.
 */
export function drawSpectrogram(signal: Float32Array, sampleRate: number, options: SpectrogramOptions): RgbCanvas {
  const seconds = signal.length / sampleRate;
  // A song gets 100 px per second; a short sound is stretched to be readable.
  const plotW = Math.min(1800, Math.max(600, Math.ceil(seconds * (seconds < 2 ? 1000 : 100))));
  // A short sound needs sharp time, a song sharp pitch (4096 samples are 12 Hz per bin).
  const size = seconds < 2 ? 512 : 4096;
  const spectrum = new Spectrum(size);
  const top = PAD + LINE_H * 2;
  const canvas = new RgbCanvas(SPEC_LEFT + plotW + PAD, top + SPEC_H + PAD + LINE_H, PAGE);
  canvas.text(fit(options.title, canvas.w - PAD * 2), PAD, PAD + 3, TITLE);

  const hzOfRow = (row: number): number => SPEC_LOW_HZ * (SPEC_HIGH_HZ / SPEC_LOW_HZ) ** (1 - row / SPEC_H);
  const rowOfHz = (hz: number): number => Math.round(SPEC_H * (1 - Math.log(hz / SPEC_LOW_HZ) / Math.log(SPEC_HIGH_HZ / SPEC_LOW_HZ)));
  // The bins of each row: from the frequency at its lower edge to the one at its upper edge.
  const bins = Array.from({ length: SPEC_H }, (_, row) => {
    const low = Math.floor((hzOfRow(row + 1) * size) / sampleRate);
    const high = Math.max(low + 1, Math.ceil((hzOfRow(row) * size) / sampleRate));
    return { low: Math.min(low, size / 2), high: Math.min(high, size / 2 + 1) };
  });

  for (let x = 0; x < plotW; x += 1) {
    const centre = Math.floor(((x + 0.5) * signal.length) / plotW);
    const power = spectrum.at(signal, centre - size / 2);
    for (let row = 0; row < SPEC_H; row += 1) {
      const { low, high } = bins[row] as { low: number; high: number };
      let max = 0;
      for (let bin = low; bin < high; bin += 1) max = Math.max(max, power[bin] as number);
      const db = 10 * Math.log10(max + 1e-12);
      canvas.fill(SPEC_LEFT + x, top + row, 1, 1, rampColor((db - SPEC_FLOOR_DB) / (SPEC_TOP_DB - SPEC_FLOOR_DB)));
    }
  }

  for (const [hz, label] of [
    [100, "100"],
    [1000, "1K"],
    [8000, "8K"],
  ] as const) {
    const y = top + rowOfHz(hz);
    canvas.text(label, PAD, y - 7, hz === 8000 ? EIGHT_K : DIM);
    canvas.fill(SPEC_LEFT - 5, y, 5, 1, hz === 8000 ? EIGHT_K : DIM);
    // A dotted line across the plot, so the picture under it stays readable.
    if (hz === 8000) for (let x = 0; x < plotW; x += 6) canvas.fill(SPEC_LEFT + x, y, 2, 1, EIGHT_K);
  }
  let lastLabelEnd = -1;
  for (const mark of options.marks ?? []) {
    const x = SPEC_LEFT + Math.floor((mark.frame * plotW) / Math.max(1, signal.length));
    canvas.fill(x, top - 4, 1, 4, TEXT);
    for (let y = 0; y < SPEC_H; y += 4) canvas.fill(x, top + y, 1, 1, BAR_LINE);
    if (x > lastLabelEnd && x + 2 + mark.label.length * CHAR_W <= canvas.w) {
      canvas.text(mark.label, x + 2, PAD + LINE_H + 1, TEXT);
      lastLabelEnd = x + 2 + mark.label.length * CHAR_W + 4;
    }
  }
  canvas.text(fit(`HZ, LOG   ${SPEC_FLOOR_DB} DB BLACK .. ${SPEC_TOP_DB} DB PALE   ${seconds.toFixed(2)} S`, canvas.w - PAD * 2), PAD, top + SPEC_H + PAD + 1, DIM);
  return canvas;
}
