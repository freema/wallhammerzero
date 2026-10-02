// Note names, keys, chords, and the tokens of the step grid.

import { describe, expect, it } from "vitest";
import {
  CHORD_QUALITIES,
  DEFAULT_VELOCITY,
  MAX_NOTE,
  MIN_NOTE,
  MODES,
  noteName,
  parseBar,
  parseChord,
  parseKey,
  parseNoteName,
  parsePitchClass,
  parseToken,
  pitchClassName,
  repeatTarget,
  Report,
} from "../src/index.ts";

const classes = (flags: readonly boolean[]): number[] => flags.flatMap((flag, pitchClass) => (flag ? [pitchClass] : []));

describe("note names", () => {
  it("reads a letter, an accidental and an octave; C4 is 60", () => {
    expect(parseNoteName("C4")).toBe(60);
    expect(parseNoteName("A4")).toBe(69);
    expect(parseNoteName("F#3")).toBe(54);
    expect(parseNoteName("Bb3")).toBe(58);
    expect(parseNoteName("C0")).toBe(12);
    expect(parseNoteName("C9")).toBe(120);
    // The octave belongs to the letter.
    expect(parseNoteName("Cb4")).toBe(59);
    expect(parseNoteName("B#4")).toBe(72);
  });

  it.each(["H2", "c4", "C", "C10", "C-1", "C##4", "4C", "", "C4 "])("refuses %j", (text) => {
    expect(parseNoteName(text)).toBeNull();
  });

  it("names a MIDI note with sharps", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(58)).toBe("A#3");
    expect(noteName(MIN_NOTE)).toBe("C1");
    expect(noteName(MAX_NOTE)).toBe("C7");
    for (let midi = 12; midi <= 120; midi += 1) expect(parseNoteName(noteName(midi))).toBe(midi);
  });

  it("reads pitch classes", () => {
    expect(parsePitchClass("C")).toBe(0);
    expect(parsePitchClass("Bb")).toBe(10);
    expect(parsePitchClass("Cb")).toBe(11);
    expect(parsePitchClass("B#")).toBe(0);
    expect(parsePitchClass("H")).toBeNull();
    expect(pitchClassName(10)).toBe("A#");
    expect(pitchClassName(-1)).toBe("B");
  });
});

describe("keys", () => {
  it("reads a root and a mode", () => {
    const key = parseKey("F major");
    expect(key).toMatchObject({ name: "F major", root: 5, mode: "major" });
    expect(classes(key?.pitchClasses ?? [])).toEqual([0, 2, 4, 5, 7, 9, 10]);
    expect(classes(parseKey("D minor")?.pitchClasses ?? [])).toEqual([0, 2, 4, 5, 7, 9, 10]);
    expect(classes(parseKey("G mixolydian")?.pitchClasses ?? [])).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(classes(parseKey("Bb major")?.pitchClasses ?? [])).toEqual([0, 2, 3, 5, 7, 9, 10]);
  });

  it("knows seven modes of seven notes each", () => {
    expect(Object.keys(MODES)).toEqual(["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian"]);
    for (const mode of Object.keys(MODES)) expect(classes(parseKey(`C ${mode}`)?.pitchClasses ?? [])).toHaveLength(7);
  });

  it.each(["F", "F Major", "F  major", "H major", "F blues", "f major", "F major "])("refuses %j", (text) => {
    expect(parseKey(text)).toBeNull();
  });
});

describe("chords", () => {
  it("reads a root, a quality and a slash bass", () => {
    expect(classes(parseChord("F")?.pitchClasses ?? [])).toEqual([0, 5, 9]);
    expect(classes(parseChord("Dm")?.pitchClasses ?? [])).toEqual([2, 5, 9]);
    expect(classes(parseChord("G7")?.pitchClasses ?? [])).toEqual([2, 5, 7, 11]);
    expect(classes(parseChord("Bbmaj7")?.pitchClasses ?? [])).toEqual([2, 5, 9, 10]);
    expect(classes(parseChord("C/E")?.pitchClasses ?? [])).toEqual([0, 4, 7]);
    expect(classes(parseChord("C/D")?.pitchClasses ?? [])).toEqual([0, 2, 4, 7]);
    expect(classes(parseChord("F#m7b5")?.pitchClasses ?? [])).toEqual([0, 4, 6, 9]);
    expect(parseChord("Dm7")).toMatchObject({ name: "Dm7", root: 2 });
  });

  it("reads every quality it lists", () => {
    for (const quality of Object.keys(CHORD_QUALITIES)) expect(parseChord(`A${quality}`)).not.toBeNull();
  });

  it.each(["", "X", "Cfoo", "c", "C/", "C/H", "Cm/", "-", "C m"])("refuses %j", (text) => {
    expect(parseChord(text)).toBeNull();
  });
});

describe("tokens", () => {
  const melodic = { drums: null };
  const kit = { drums: ["k", "s", "h"] };

  it("reads silence, a hold and notes", () => {
    expect(parseToken(".", melodic)).toEqual({ kind: "rest" });
    expect(parseToken("-", melodic)).toEqual({ kind: "hold" });
    expect(parseToken("C#5", melodic)).toEqual({ kind: "note", midi: 73, arp: null, velocity: DEFAULT_VELOCITY });
    expect(parseToken("Bb4:3", melodic)).toEqual({ kind: "note", midi: 70, arp: null, velocity: 3 });
  });

  it("reads an arpeggio: offsets in semitones, a b c for 10 11 12", () => {
    expect(parseToken("C4@047", melodic)).toEqual({ kind: "note", midi: 60, arp: [0, 4, 7], velocity: 7 });
    expect(parseToken("C4@0c", melodic)).toMatchObject({ arp: [0, 12] });
    expect(parseToken("A3@037a:9", melodic)).toMatchObject({ midi: 57, arp: [0, 3, 7, 10], velocity: 9 });
  });

  it("reads the drums of the channel's kit", () => {
    expect(parseToken("k", kit)).toEqual({ kind: "drum", key: "k", velocity: 7 });
    expect(parseToken("s:4", kit)).toEqual({ kind: "drum", key: "s", velocity: 4 });
    expect(parseToken(".", kit)).toEqual({ kind: "rest" });
  });

  it.each([
    ["H5", melodic, "is not a note"],
    ["C5:0", melodic, "a velocity is one digit 1-9"],
    ["C5:10", melodic, "a velocity is one digit 1-9"],
    ["C4@0", melodic, "an arpeggio has 2 to 4 offsets"],
    ["C4@01234", melodic, "an arpeggio has 2 to 4 offsets"],
    ["C4@0d", melodic, "is not a token"],
    ["k", melodic, "is not a note"],
    ["x", kit, "is not a drum of this kit (known: k, s, h)"],
    ["C4", kit, "is not a drum of this kit"],
    ["k@04", kit, "a drum cannot have an arpeggio"],
  ])("refuses %j with a reason", (text, context, reason) => {
    const token = parseToken(text, context);
    expect(typeof token).toBe("string");
    expect(token).toContain(reason);
  });
});

describe("bars", () => {
  const shape = { beatsPerBar: 4, stepsPerBeat: 4 };
  const at = { section: "A", channel: "lead", bar: 0 };

  it("reads one token per step", () => {
    const report = new Report();
    const tokens = parseBar(report, "C4 - . . | E4 - . . | G4 - - - | . . . .", shape, { drums: null }, "sections.A.lead[0]", at);
    expect(report.findings).toEqual([]);
    expect(tokens).toHaveLength(16);
    expect(tokens?.[8]).toMatchObject({ kind: "note", midi: 67 });
  });

  it("does not care how the steps are spaced", () => {
    const report = new Report();
    expect(parseBar(report, "C4 - . .|E4  -  . .|\tG4 - - -   |. . . .", shape, { drums: null }, "p", at)).toHaveLength(16);
  });

  it("reports the number of beats", () => {
    const report = new Report();
    expect(parseBar(report, "C4 - . . | E4 - . . | G4 - - -", shape, { drums: null }, "sections.A.lead[0]", at)).toBeNull();
    expect(report.findings).toEqual([
      { severity: "error", rule: "steps", path: "sections.A.lead[0]", message: 'the bar has 3 beat(s) (separated by "|"), the meter needs 4', at },
    ]);
  });

  it("reports every beat with a wrong number of steps, by its number", () => {
    const report = new Report();
    expect(parseBar(report, "C4 - . | E4 - . . | G4 - - - - | . . . .", shape, { drums: null }, "p", at)).toBeNull();
    expect(report.findings.map((finding) => [finding.rule, finding.at?.beat, finding.message])).toEqual([
      ["steps", 0, 'beat 1 has 3 step(s), stepsPerBeat is 4: "C4 - ."'],
      ["steps", 2, 'beat 3 has 5 step(s), stepsPerBeat is 4: "G4 - - - -"'],
    ]);
  });

  it("reports a bad token with its beat and step", () => {
    const report = new Report();
    expect(parseBar(report, "C4 - . . | E4 Q . . | G4 - - - | . . . .", shape, { drums: null }, "p", at)).toBeNull();
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({ rule: "token", at: { ...at, beat: 1, step: 1 } });
    expect(report.findings[0]?.message).toContain("beat 2, step 2");
  });

  it("reads other shapes: 3/4 with triplets", () => {
    const report = new Report();
    expect(parseBar(report, "C4 . . | E4 . . | G4 . .", { beatsPerBar: 3, stepsPerBeat: 3 }, { drums: null }, "p", at)).toHaveLength(9);
  });

  it("knows a repeat", () => {
    expect(repeatTarget("=3")).toBe(3);
    expect(repeatTarget(" =12 ")).toBe(12);
    expect(repeatTarget("=0")).toBe(0);
    expect(repeatTarget("=x")).toBeNull();
    expect(repeatTarget("= 1")).toBeNull();
    expect(repeatTarget("=1234")).toBeNull();
    expect(repeatTarget("C4 - - -")).toBeNull();
  });
});
