// The pictures for a reader that cannot hear: what the piano roll and the spectrogram show,
// and that they stay inside the size an image can be read at.

import { MAX_REVIEW_EDGE } from "@whz/asset-kit";
import type { RgbCanvas } from "@whz/asset-kit";
import { decodePng, encodeRgbPng } from "@whz/asset-kit/node";
import { describe, expect, it } from "vitest";
import { drawPianoRoll, drawSpectrogram, sfxRoll, songRoll } from "../src/analysis/index.ts";
import { checkSong, parseSfx, parseSong, renderSfx, renderSong } from "../src/index.ts";
import { cleanJson, cleanSong, fixtureJson, setAt, sine, tinySong, withBar } from "./helpers.ts";

const ERROR = 0xff3030;
const WARNING = 0xff8c1a;
const EIGHT_K = 0x4cc9f0;

function pixel(canvas: RgbCanvas, x: number, y: number): number {
  const at = (y * canvas.w + x) * 3;
  return ((canvas.data[at] as number) << 16) | ((canvas.data[at + 1] as number) << 8) | (canvas.data[at + 2] as number);
}

function count(canvas: RgbCanvas, rgb: number): number {
  let found = 0;
  for (let i = 0; i < canvas.data.length; i += 3) {
    if (canvas.data[i] === rgb >> 16 && canvas.data[i + 1] === ((rgb >> 8) & 0xff) && canvas.data[i + 2] === (rgb & 0xff)) found += 1;
  }
  return found;
}

describe("the piano roll of a song", () => {
  it("has a column per step, a lane per channel and a label per bar", () => {
    const model = songRoll(cleanSong());
    expect(model).toMatchObject({ title: "fixture.clean  C major  120 BPM  4/4  2 BARS  LOOPS", columns: 32, major: 16, minor: 4 });
    expect(model.headers).toEqual([
      { name: "BAR", cells: ["1< A", "2"] },
      { name: "CHD", cells: ["C", "G"] },
    ]);
    expect(model.lanes.map((lane) => [lane.caption, lane.drums, lane.notes.length])).toEqual([
      ["lead  PULSE 25%  -16 DB  PAN -0.2", null, 10],
      ["bass  TRIANGLE  -12 DB", null, 9],
      ["drums  KIT  -18 DB  PAN 0.1", ["k", "h"], 14],
    ]);
    expect(model.lanes[0]?.notes[0]).toEqual({ column: 0, length: 2, row: 76, flag: null });
    // Drums: the row is the index of the drum in its kit.
    expect(model.lanes[2]?.notes.slice(0, 2)).toEqual([
      { column: 0, length: 1, row: 0, flag: null },
      { column: 2, length: 1, row: 1, flag: null },
    ]);
  });

  it("says what a jingle and an echo are, and where a later loop point is", () => {
    const jingle = songRoll(parseSong(setAt(cleanJson(), ["loop"], false)));
    expect(jingle.title).toContain("PLAYS ONCE");
    expect(jingle.headers[0]?.cells).toEqual(["1 A", "2"]);
    const later = songRoll(parseSong(setAt(setAt(cleanJson(), ["order"], ["A", "A"]), ["loop"], { fromOrderIndex: 1 })));
    expect(later.headers[0]?.cells).toEqual(["1 A", "2", "3< A", "4"]);
    const echo = songRoll(tinySong({ bars: ["C4 - - - | . . . . | . . . . | . . . ."], channel: { echo: { beats: 0.5, feedback: 0.3, mix: 0.3 } } }));
    expect(echo.lanes[0]?.caption).toBe("voice  TRIANGLE  0 DB  ECHO");
  });

  it("draws the tones of an arpeggio as paler notes", () => {
    const model = songRoll(tinySong({ bars: ["C4@047 - - - | . . . . | . . . . | . . . ."] }));
    expect(model.lanes[0]?.notes).toEqual([
      { column: 0, length: 4, row: 64, ghost: true },
      { column: 0, length: 4, row: 67, ghost: true },
      { column: 0, length: 4, row: 60, flag: null },
    ]);
  });

  it("marks the note of a finding: red for an error, orange for a warning", () => {
    const offKey = checkSong(fixtureJson("bad/music/off-key"));
    const flagged = songRoll(offKey.song as NonNullable<typeof offKey.song>, offKey.findings);
    expect(flagged.lanes[0]?.notes[0]).toMatchObject({ column: 0, row: 78, flag: "error" });
    expect(flagged.lanes[0]?.notes.filter((note) => note.flag !== null)).toHaveLength(1);
    const [page] = drawPianoRoll(flagged);
    expect(count(page as RgbCanvas, ERROR)).toBeGreaterThan(10);

    const passing = checkSong(withBar("lead", 0, "E5 F#5 G5 - | C6 - - - | . . B5 - | A5 - G5 -"));
    const warned = songRoll(passing.song as NonNullable<typeof passing.song>, passing.findings);
    expect(warned.lanes[0]?.notes[1]).toMatchObject({ column: 1, row: 78, flag: "warning" });
    const [warnedPage] = drawPianoRoll(warned);
    expect(count(warnedPage as RgbCanvas, WARNING)).toBeGreaterThan(5);
    expect(count(warnedPage as RgbCanvas, ERROR)).toBe(0);

    const [clean] = drawPianoRoll(songRoll(cleanSong()));
    expect(count(clean as RgbCanvas, ERROR) + count(clean as RgbCanvas, WARNING)).toBe(0);
  });

  it("marks the note in every repeat of its section", () => {
    const json = setAt(fixtureJson("bad/music/off-key"), ["order"], ["A", "A"]);
    const { song, findings } = checkSong(json);
    const model = songRoll(song as NonNullable<typeof song>, findings);
    expect(model.lanes[0]?.notes.filter((note) => note.flag === "error").map((note) => note.column)).toEqual([0, 32]);
  });

  it("is one page for a short song, wide enough for its title and legend", () => {
    const model = songRoll(cleanSong());
    const pages = drawPianoRoll(model);
    expect(pages).toHaveLength(1);
    const [page] = pages as [RgbCanvas];
    expect(page.w).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    expect(page.h).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    // 12 px per character and 8 px on each side.
    expect(page.w).toBeGreaterThanOrEqual(model.title.length * 12 + 16);
    expect(page.w).toBeGreaterThanOrEqual(model.legend.length * 12 + 16);
    expect(page.h).toBeGreaterThan(200);
  });

  it("splits a long song into pages of whole bars, none larger than an image can be read at", () => {
    const song = parseSong(setAt(cleanJson(), ["order"], new Array(40).fill("A")));
    const model = songRoll(song);
    expect(model.columns).toBe(1280);
    const pages = drawPianoRoll(model);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.length).toBeLessThanOrEqual(4);
    for (const page of pages) {
      expect(page.w).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
      expect(page.h).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    }
  });

  it("keeps a song of many channels and a wide range inside the limit", () => {
    const json = cleanJson();
    const channels = json["channels"] as Record<string, unknown>;
    const section = (json["sections"] as Record<string, Record<string, unknown>>)["A"] as Record<string, unknown>;
    for (let i = 0; i < 9; i += 1) {
      channels[`wide${i}`] = { instrument: "lead", gainDb: -30 };
      section[`wide${i}`] = ["C1 - - - | C7 - - - | C1 - - - | C7 - - -", "=0"];
    }
    // Twelve lanes, nine of them six octaves tall: more than one picture holds.
    const pages = drawPianoRoll(songRoll(parseSong(json)));
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.h).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
      expect(page.w).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    }
  });

  it("draws the same picture every time", () => {
    const a = drawPianoRoll(songRoll(cleanSong()))[0] as RgbCanvas;
    const b = drawPianoRoll(songRoll(cleanSong()))[0] as RgbCanvas;
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    const png = encodeRgbPng(a);
    expect(decodePng(png)).toMatchObject({ w: a.w, h: a.h });
  });
});

describe("the piano roll of an SFX", () => {
  it("has a column per 5 ms and a lane per voice", () => {
    const sfx = parseSfx(fixtureJson("good/sfx/blip", ".sfx.json"));
    const model = sfxRoll(sfx);
    expect(model).toMatchObject({ title: "fixture.blip  140 MS  -12 DB", columns: 40, major: 20, minor: 0 });
    expect(model.headers).toEqual([{ name: "MS", cells: ["0", "100"] }]);
    expect(model.lanes.map((lane) => lane.caption)).toEqual(["VOICE 1  PULSE 50%  0 DB  RELEASE 50 MS", "VOICE 2  NOISE SHORT  -8 DB  RELEASE 10 MS"]);
    expect(model.lanes[0]?.notes).toEqual([
      { column: 0, length: 6, row: 81 },
      { column: 6, length: 12, row: 88 },
    ]);
    const pages = drawPianoRoll(model);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.w).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
  });

  it("leaves a pause empty and starts a late voice late", () => {
    const sfx = parseSfx({
      format: "wz.sfx/0.1",
      id: "test.sfx",
      gainDb: 0,
      voices: [{ wave: "triangle", env: { a: 0, d: 0, s: 1, r: 0 }, startSec: 0.1, notes: [["A4", 0.05], [".", 0.05], ["A4@07", 0.05]] }],
    });
    expect(sfxRoll(sfx).lanes[0]?.notes).toEqual([
      { column: 20, length: 10, row: 69 },
      { column: 40, length: 10, row: 76, ghost: true },
      { column: 40, length: 10, row: 69 },
    ]);
  });
});

describe("the spectrogram", () => {
  it("puts a tone on the row of its frequency", () => {
    const canvas = drawSpectrogram(sine(1000, 4, 0.5), 48000, { title: "TEST" });
    expect([canvas.w, canvas.h]).toEqual([52 + 600 + 8, 396]);
    // The plot starts at y = 48 and is 320 rows of a logarithmic scale from 20 kHz down to
    // 50 Hz: 1 kHz is half way.
    const column = 52 + 300;
    let brightest = 0;
    let brightestRow = -1;
    for (let row = 0; row < 320; row += 1) {
      const rgb = pixel(canvas, column, 48 + row);
      const light = (rgb >> 16) + ((rgb >> 8) & 0xff) + (rgb & 0xff);
      if (light > brightest) {
        brightest = light;
        brightestRow = row;
      }
    }
    expect(Math.abs(brightestRow - 160)).toBeLessThanOrEqual(2);
    expect(brightest).toBeGreaterThan(600);
    // Far from the tone the plot is black.
    expect(pixel(canvas, column, 48 + 40)).toBe(0x0b0b14);
    expect(pixel(canvas, column, 48 + 300)).toBe(0x0b0b14);
  });

  it("draws the 8 kHz line the harsh check measures above", () => {
    const canvas = drawSpectrogram(new Float32Array(4 * 48000), 48000, { title: "SILENCE" });
    expect(pixel(canvas, 52, 48 + 49)).toBe(EIGHT_K);
    expect(count(canvas, EIGHT_K)).toBeGreaterThan(200);
  });

  it("stretches a short sound, and limits a long one", () => {
    const sfx = renderSfx(parseSfx(fixtureJson("good/sfx/blip", ".sfx.json")));
    const short = drawSpectrogram(sfx.samples, 48000, { title: "BLIP", marks: [{ frame: 0, label: "0" }, { frame: 4800, label: "100" }] });
    expect(short.w).toBe(660);
    const long = drawSpectrogram(new Float32Array(60 * 8000), 8000, { title: "LONG" });
    expect(long.w).toBe(52 + 1800 + 8);
    expect(long.w).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
    expect(long.h).toBeLessThanOrEqual(MAX_REVIEW_EDGE);
  });

  it("marks the bars of a song", () => {
    const render = renderSong(cleanSong());
    const marks = render.bars.map((bar) => ({ frame: bar.frame, label: String(bar.timelineBar + 1) }));
    const plain = drawSpectrogram(render.left, 48000, { title: "CLEAN" });
    const marked = drawSpectrogram(render.left, 48000, { title: "CLEAN", marks });
    expect(Buffer.from(plain.data).equals(Buffer.from(marked.data))).toBe(false);
    // The tick of bar 2 sits above the middle of the plot (4 s on 600 px).
    expect(pixel(marked, 52 + 300, 45)).toBe(0xe9e9f2);
    expect(pixel(plain, 52 + 300, 45)).toBe(0x17171c);
  });
});
