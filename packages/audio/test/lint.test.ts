// The musical validators: key and chords on the beat, range, density, rests, repetition.

import { describe, expect, it } from "vitest";
import { checkSong, lintSong, NOODLING_ONSETS, NOODLING_RESTS, parseSong, REPETITIVE_MIN_BARS, REPETITIVE_RATIO, songStats } from "../src/index.ts";
import { cleanJson, cleanSong, fixtureJson, ofRule, rules, setAt, withBar } from "./helpers.ts";

const SILENT_BAR = ". . . . | . . . . | . . . . | . . . .";
const BUSY_BAR = "C5 D5 E5 G5 | C5 D5 E5 G5 | C5 D5 E5 G5 | C5 D5 E5 G5";

describe("key and chords", () => {
  it("finds nothing in the clean song", () => {
    expect(lintSong(cleanSong())).toEqual([]);
    expect(checkSong(cleanJson()).findings).toEqual([]);
  });

  it("fails a note on the beat that is in neither the key nor the chord", () => {
    const findings = checkSong(fixtureJson("bad/music/off-key")).findings;
    expect(rules(findings)).toEqual(["error off-key"]);
  });

  it("lets the chord bring a note the key does not have", () => {
    // E major over a song in C: G# is a tone of the chord.
    const json = withBar("lead", 0, "G#5 - G5 - | C6 - - - | . . B5 - | A5 - G5 -", (changed) => setAt(changed, ["sections", "A", "chords"], ["E", "G"]));
    expect(ofRule(checkSong(json).findings, "off-key")).toEqual([]);
  });

  it("only warns off the beat: a passing note", () => {
    const findings = checkSong(withBar("lead", 0, "E5 F#5 G5 - | C6 - - - | . . B5 - | A5 - G5 -")).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "warning", rule: "chromatic", path: "sections.A.lead[0]", at: { bar: 0, beat: 0, step: 1 } });
    expect(findings[0]?.message).toBe("beat 1, step 2: F#5 is not in C major and the chord C (fine as a passing note)");
  });

  it("warns about a note on the beat a semitone above a chord tone", () => {
    const findings = checkSong(withBar("lead", 0, "F5 - G5 - | C6 - - - | . . B5 - | A5 - G5 -")).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "warning", rule: "chord-clash", at: { bar: 0, beat: 0, step: 0 } });
    expect(findings[0]?.message).toBe("beat 1: F5 on the beat is a semitone above E, a tone of the chord C");
  });

  it("checks against the key alone where the chord lane says no chord", () => {
    const noChord = (bar: string): unknown => withBar("lead", 0, bar, (changed) => setAt(changed, ["sections", "A", "chords"], ["-", "G"]));
    expect(checkSong(noChord("F5 - G5 - | C6 - - - | . . B5 - | A5 - G5 -")).findings).toEqual([]);
    const findings = checkSong(noChord("F#5 - G5 - | C6 - - - | . . B5 - | A5 - G5 -")).findings;
    expect(rules(findings)).toEqual(["error off-key"]);
    expect(findings[0]?.message).toBe("beat 1: F#5 is on the beat but is not in C major");
  });

  it("uses the chord of the beat, not of the bar", () => {
    // Beats 1-2 are C, beats 3-4 are E: the G# is fine on beat 3 and wrong on beat 1.
    const chords = (changed: Record<string, unknown>): unknown => setAt(changed, ["sections", "A", "chords"], ["C E", "G"]);
    expect(ofRule(checkSong(withBar("lead", 0, "E5 - G5 - | C6 - - - | G#5 - B5 - | E5 - - -", chords)).findings, "off-key")).toEqual([]);
    expect(ofRule(checkSong(withBar("lead", 0, "G#5 - G5 - | C6 - - - | . . B5 - | E5 - - -", chords)).findings, "off-key")).toHaveLength(1);
  });

  it("checks every tone of an arpeggio", () => {
    const findings = checkSong(withBar("lead", 0, "C5@046 - G5 - | C6 - - - | . . B5 - | A5 - G5 -")).findings;
    expect(rules(findings)).toEqual(["error off-key"]);
    expect(findings[0]?.message).toContain("F#5");
  });

  it("does not check drums", () => {
    const song = cleanSong();
    expect(song.timeline.notes.some((note) => note.drum !== null)).toBe(true);
    expect(ofRule(lintSong(song), "range")).toEqual([]);
  });

  it("reports a section that is played twice once", () => {
    const json = setAt(fixtureJson("bad/music/off-key"), ["order"], ["A", "A"]);
    expect(ofRule(checkSong(json).findings, "off-key")).toHaveLength(1);
  });
});

describe("range", () => {
  it("fails a note above C7 or below C1", () => {
    const high = checkSong(withBar("lead", 0, "E5 - G5 - | C8 - - - | . . B5 - | A5 - G5 -")).findings;
    expect(rules(high)).toEqual(["error range"]);
    expect(high[0]).toMatchObject({ path: "sections.A.lead[0]", message: "beat 2: C8 is outside C1..C7", at: { beat: 1, step: 0 } });
    const low = checkSong(withBar("bass", 0, "B0 - - . | G2 - . . | C3 - - . | E3 - G2 -")).findings;
    expect(rules(low)).toEqual(["error range"]);
    expect(low[0]?.message).toBe("beat 1: B0 is outside C1..C7");
  });

  it("takes C1 and C7 themselves", () => {
    expect(checkSong(withBar("bass", 0, "C1 - - . | G2 - . . | C7 - - . | E3 - G2 -")).findings).toEqual([]);
  });

  it("counts the tones of an arpeggio", () => {
    const findings = checkSong(withBar("lead", 0, "E5 - G5 - | C7@07 - - - | . . B5 - | A5 - G5 -")).findings;
    expect(rules(findings)).toEqual(["error range"]);
    expect(findings[0]?.message).toBe("beat 2: G7 is outside C1..C7");
  });
});

describe("density, rests and repetition", () => {
  it("measures every channel", () => {
    const stats = songStats(cleanSong());
    expect(stats).toMatchObject({ bars: 2, seconds: 4, uniqueBarRatio: 1 });
    expect(stats.channels).toEqual([
      { channel: "lead", kit: false, bars: 2, notes: 10, onsetsPerStep: 10 / 32, restRatio: 0.25, lowest: "D5", highest: "D6", uniqueBarRatio: 1 },
      { channel: "bass", kit: false, bars: 2, notes: 9, onsetsPerStep: 9 / 32, restRatio: 10 / 32, lowest: "G2", highest: "E3", uniqueBarRatio: 1 },
      { channel: "drums", kit: true, bars: 2, notes: 14, onsetsPerStep: 14 / 32, restRatio: 18 / 32, lowest: null, highest: null, uniqueBarRatio: 0.5 },
    ]);
  });

  it("warns about a channel that never stops", () => {
    expect(NOODLING_ONSETS).toBe(0.5);
    expect(NOODLING_RESTS).toBe(0.1);
    const json = withBar("lead", 0, BUSY_BAR, (changed) => withBarIn(changed, "lead", 1, BUSY_BAR));
    const findings = ofRule(checkSong(json).findings, "noodling");
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "warning", path: "channels.lead", at: { channel: "lead" } });
    expect(findings[0]?.message).toBe("a note starts on 100 % of the steps and only 0 % of them are silent: leave rests and hold notes");
  });

  it("does not call long held notes noodling, nor a busy drum channel", () => {
    const held = "C5 - - - | - - - - | E5 - - - | - - - -";
    const json = withBar("lead", 0, held, (changed) => {
      withBarIn(changed, "lead", 1, "D5 - - - | - - - - | G5 - - - | - - - -");
      withBarIn(changed, "drums", 0, "h h h h | h h h h | h h h h | h h h h");
    });
    const { song, findings } = checkSong(json);
    expect(ofRule(findings, "noodling")).toEqual([]);
    const stats = songStats(song as NonNullable<typeof song>);
    expect(stats.channels[0]).toMatchObject({ onsetsPerStep: 4 / 32, restRatio: 0 });
    expect(stats.channels[2]).toMatchObject({ kit: true, onsetsPerStep: 1 });
  });

  it("warns about a song whose bars are all the same", () => {
    expect(REPETITIVE_RATIO).toBe(0.25);
    expect(REPETITIVE_MIN_BARS).toBe(8);
    // Two different bars in ten: 20 %.
    const findings = checkSong(setAt(cleanJson(), ["order"], ["A", "A", "A", "A", "A"])).findings;
    expect(rules(findings)).toEqual(["warning repetitive"]);
    expect(findings[0]).toMatchObject({ path: "order", message: expect.stringContaining("only 20 % of the 10 bars are different") as string });
    // Two in eight is a quarter: the limit itself passes.
    expect(checkSong(setAt(cleanJson(), ["order"], ["A", "A", "A", "A"])).findings).toEqual([]);
  });

  it("does not judge a short song for repeating", () => {
    const json = setAt(cleanJson(), ["sections", "A", "chords"], ["C", "C"]);
    for (const channel of ["lead", "bass", "drums"]) withBarIn(json, channel, 1, "=0");
    setAt(json, ["order"], ["A", "A", "A"]);
    const { song, findings } = checkSong(json);
    expect(songStats(song as NonNullable<typeof song>)).toMatchObject({ bars: 6, uniqueBarRatio: 1 / 6 });
    expect(ofRule(findings, "repetitive")).toEqual([]);
  });

  it("warns about a channel without a note", () => {
    const json = withBar("bass", 0, SILENT_BAR, (changed) => withBarIn(changed, "bass", 1, SILENT_BAR));
    const findings = checkSong(json).findings;
    expect(rules(findings)).toEqual(["warning silent"]);
    expect(findings[0]).toMatchObject({ path: "channels.bass", at: { channel: "bass" } });
  });

  it("counts drums out of the unique-bar ratio of the song", () => {
    // The drums repeat their bar; the song's two bars are still different.
    expect(songStats(cleanSong()).uniqueBarRatio).toBe(1);
    const sameDrums = parseSong(withBar("drums", 1, "k . . . | . . . . | k . . . | . . . ."));
    expect(songStats(sameDrums).uniqueBarRatio).toBe(1);
  });
});

function withBarIn(json: Record<string, unknown>, channel: string, bar: number, text: string): void {
  const section = (json["sections"] as Record<string, Record<string, string[]>>)["A"] as Record<string, string[]>;
  (section[channel] as string[])[bar] = text;
}
