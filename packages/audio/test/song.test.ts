// Reading `wz.song/0.1`: the strict parse, the step and bar counts, references, the timeline.

import { describe, expect, it } from "vitest";
import { AudioDataError, channelsOfState, checkSongText, duplicateKeys, instrumentsOf, MAX_BARS, parseSong, readSong, readSongText } from "../src/index.ts";
import type { Finding } from "../src/index.ts";
import { cleanJson, cleanSong, fixtureText, ofRule, setAt, withBar } from "./helpers.ts";

/** The errors of reading a changed copy of the clean song, as `rule path` lines. */
function errorsOf(json: unknown): string[] {
  const { song, findings } = readSong(json);
  const errors = findings.filter((finding) => finding.severity === "error");
  expect(song === null).toBe(errors.length > 0);
  return errors.map((finding) => `${finding.rule} ${finding.path}`);
}

function messageAt(json: unknown, path: string): string {
  return readSong(json)
    .findings.filter((finding) => finding.path === path)
    .map((finding) => finding.message)
    .join(" / ");
}

describe("the fixtures that must fail", () => {
  it("a bar with a wrong step count", () => {
    const { song, findings } = checkSongText(fixtureText("bad/music/wrong-step-count"));
    expect(song).toBeNull();
    expect(findings).toEqual<Finding[]>([
      {
        severity: "error",
        rule: "steps",
        path: "sections.A.lead[0]",
        message: 'beat 3 has 5 step(s), stepsPerBeat is 4: ". . B5 - -"',
        at: { section: "A", channel: "lead", bar: 0, beat: 2 },
      },
    ]);
  });

  it("an off-key note on a strong beat", () => {
    const { song, findings } = checkSongText(fixtureText("bad/music/off-key"));
    // The song can be laid out in time (and drawn, with the note in red), but it does not pass.
    expect(song).not.toBeNull();
    expect(findings).toEqual<Finding[]>([
      {
        severity: "error",
        rule: "off-key",
        path: "sections.A.lead[0]",
        message: "beat 1: F#5 is on the beat but is not in C major and the chord C",
        at: { section: "A", channel: "lead", bar: 0, beat: 0, step: 0 },
      },
    ]);
  });

  it("a channel of a different length", () => {
    const { song, findings } = checkSongText(fixtureText("bad/music/short-channel"));
    expect(song).toBeNull();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", rule: "length", path: "sections.A.bass", at: { section: "A", channel: "bass" } });
    expect(findings[0]?.message).toContain("has 1 bar(s), but the section has 2");
  });

  it.each(["good/music/clean", "good/music/seam-click"])("%s passes without a finding", (pathId) => {
    const { song, findings } = checkSongText(fixtureText(pathId));
    expect(findings).toEqual([]);
    expect(song).not.toBeNull();
  });
});

describe("the strict parse", () => {
  it("refuses what is not a song object", () => {
    expect(errorsOf([])).toEqual(["parse "]);
    expect(errorsOf(null)).toEqual(["parse "]);
    expect(messageAt("song", "")).toBe('must be an object, got "song"');
  });

  it("refuses an unknown field, by its path", () => {
    expect(errorsOf(setAt(cleanJson(), ["swing"], 0.5))).toEqual(["parse swing"]);
    expect(errorsOf(setAt(cleanJson(), ["channels", "lead", "volume"], 1))).toEqual(["parse channels.lead.volume"]);
    expect(errorsOf(setAt(cleanJson(), ["instruments", "lead", "attack"], 1))).toEqual(["parse instruments.lead.attack"]);
    expect(errorsOf(setAt(cleanJson(), ["states", "calm", "gain"], 1))).toEqual(["parse states.calm.gain"]);
    expect(messageAt(setAt(cleanJson(), ["swing"], 0.5), "swing")).toContain("unknown field (known: format, id, tempo");
  });

  it.each(["format", "id", "tempo", "meter", "stepsPerBeat", "key", "instruments", "channels", "sections", "order", "loop"])("needs the field %s", (field) => {
    const json = setAt(cleanJson(), [field], undefined);
    const { song, findings } = readSong(json);
    expect(song).toBeNull();
    expect(findings.some((finding) => finding.rule === "parse" && finding.path === "" && finding.message === `the field "${field}" is missing`)).toBe(true);
  });

  it("does not need title, seed, layers, states or orchestrations", () => {
    const json = cleanJson();
    for (const field of ["title", "seed", "layers", "states", "orchestrations"]) setAt(json, [field], undefined);
    const song = parseSong(json);
    expect(song).toMatchObject({ title: "", seed: 1, layers: {}, states: {}, orchestrations: {} });
  });

  it.each([
    [["format"], "wz.song/9", "parse format"],
    [["id"], "Bad Id", "parse id"],
    [["tempo"], 120.5, "parse tempo"],
    [["tempo"], 20, "parse tempo"],
    [["tempo"], "120", "parse tempo"],
    [["meter"], [4, 3], "parse meter[1]"],
    [["meter"], [4], "parse meter"],
    [["meter"], [0, 4], "parse meter[0]"],
    [["stepsPerBeat"], 9, "parse stepsPerBeat"],
    [["key"], "H major", "parse key"],
    [["seed"], -1, "parse seed"],
    [["channels", "lead", "gainDb"], 12, "parse channels.lead.gainDb"],
    [["channels", "lead", "pan"], 2, "parse channels.lead.pan"],
    [["channels", "lead", "echo"], { beats: 0.75, feedback: 0.95, mix: 0.3 }, "parse channels.lead.echo.feedback"],
    [["channels", "lead", "instrument"], "nope", "reference channels.lead.instrument"],
    [["channels", "chords"], { instrument: "lead", gainDb: -12 }, "parse channels.chords"],
    [["channels"], {}, "parse channels"],
    [["instruments", "lead", "duty"], 0.3, "parse instruments.lead.duty"],
    [["instruments", "lead", "wave"], "saw", "parse instruments.lead.wave"],
    [["instruments", "lead", "env"], { a: 0, d: 0, s: 2, r: 0 }, "parse instruments.lead.env.s"],
    [["instruments", "lead", "env"], { a: 0, d: 0, s: 1 }, "parse instruments.lead.env"],
    [["instruments", "lead", "vibrato"], { cents: 10 }, "parse instruments.lead.vibrato"],
    [["instruments", "bass", "steps"], 16, "parse instruments.bass.steps"],
    [["instruments", "lead", "samples"], "0123456789abcdef0123456789abcde", "parse instruments.lead.samples"],
    [["instruments", "kit", "drums", "Kick"], { wave: "noise", pitch: "C4", env: { a: 0, d: 0.1, s: 0, r: 0 } }, "parse instruments.kit.drums.Kick"],
    [["instruments", "kit", "drums", "k", "pitch"], "low", "parse instruments.kit.drums.k.pitch"],
    [["instruments", "kit", "drums", "k", "pitch"], undefined, "parse instruments.kit.drums.k"],
    [["instruments", "kit", "drums"], {}, "parse instruments.kit.drums"],
    [["sections", "A", "piano"], ["=0", "=0"], "parse sections.A.piano"],
    [["sections", "A", "chords"], ["Cfoo", "G"], "token sections.A.chords[0]"],
    [["sections", "A", "chords"], ["C", "C G Am"], "steps sections.A.chords[1]"],
    [["sections", "A", "chords"], [], "parse sections.A.chords"],
    [["sections", "A", "lead"], "C4", "parse sections.A.lead"],
    [["sections"], {}, "parse sections"],
    [["order"], ["A", "Z"], "reference order[1]"],
    [["order"], [], "parse order"],
    [["loop"], { fromOrderIndex: 3 }, "parse loop.fromOrderIndex"],
    [["loop"], { from: 0 }, "parse loop"],
    [["layers", "base"], ["nope"], "reference layers.base[0]"],
    [["states", "calm", "layers"], ["nope"], "reference states.calm.layers[0]"],
    [["states", "calm", "lowpassHz"], 50, "parse states.calm.lowpassHz"],
    [["orchestrations", "soft", "nope"], { wave: "noise" }, "reference orchestrations.soft.nope"],
    [["orchestrations", "soft", "kit"], { wave: "noise" }, "parse orchestrations.soft.kit"],
    [["orchestrations", "soft", "lead"], { wave: "saw" }, "parse orchestrations.soft.lead.wave"],
  ])("refuses %j = %j", (path, value, expected) => {
    expect(errorsOf(setAt(cleanJson(), path, value))).toContain(expected);
  });

  it("says how to write a loop", () => {
    const json = setAt(cleanJson(), ["loop"], true);
    expect(errorsOf(json)).toContain("parse loop");
    expect(messageAt(json, "loop")).toContain('use false for a song that plays once (a jingle), or { "fromOrderIndex": 0 } for a loop');
  });

  it("needs samples for a wave instrument, and reads them as 32 hexadecimal digits", () => {
    const missing = setAt(cleanJson(), ["instruments", "lead"], { wave: "wave", env: { a: 0, d: 0, s: 1, r: 0 } });
    expect(errorsOf(missing)).toEqual(["parse instruments.lead"]);
    const json = setAt(cleanJson(), ["instruments", "lead"], { wave: "wave", samples: "0123456789abcdeffedcba9876543210", env: { a: 0, d: 0, s: 1, r: 0 } });
    const instrument = parseSong(json).instruments["lead"];
    expect(instrument).toMatchObject({ kind: "tone", tone: { wave: "wave" } });
    expect(instrument?.kind === "tone" ? instrument.tone.samples : null).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it("reports a key that is written twice (JSON.parse would keep the last one)", () => {
    const text = fixtureText("good/music/clean").replace('"order": [', '"tempo": 90,\n  "order": [');
    expect(JSON.parse(text)).toMatchObject({ tempo: 90 });
    const { song, findings } = readSongText(text);
    expect(song).toBeNull();
    expect(findings).toEqual([{ severity: "error", rule: "parse", path: "tempo", message: "this key appears twice in the same object; JSON keeps only the last one" }]);
    expect(duplicateKeys('{"a":{"b":1,"b":2},"c":[{"d":"x\\"y","e":[1,2],"d":2}],"a":3}')).toEqual(["a.b", "c[0].d", "a"]);
    expect(duplicateKeys('{"a":{"b":1},"c":{"b":1},"d":[{},{"b":[]}]}')).toEqual([]);
  });

  it("reports text that is not JSON", () => {
    const { song, findings } = readSongText("{ format: ");
    expect(song).toBeNull();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", rule: "parse", path: "" });
    expect(findings[0]?.message).toMatch(/^not valid JSON: /);
  });

  it("reports every problem of a file, not only the first", () => {
    const json = withBar("lead", 0, "E5 - G5 | C6 - - - | . . B5 - | A5 - G5 -", (changed) => {
      setAt(changed, ["tempo"], 1000);
      setAt(changed, ["sections", "A", "bass"], ["C3 - - . | G2 - . . | C3 - - . | E3 - G2 -"]);
    });
    expect(errorsOf(json)).toEqual(["parse tempo", "steps sections.A.lead[0]", "length sections.A.bass"]);
  });

  it("throws from parseSong with every error in the message", () => {
    const json = withBar("lead", 1, "D5 - - - | . . G5 - | B5 - D6 - | . . .");
    expect(() => parseSong(json)).toThrow(AudioDataError);
    expect(() => parseSong(json)).toThrow("the song has 1 error(s):\n  error steps  sections.A.lead[1]: beat 4 has 3 step(s), stepsPerBeat is 4");
  });
});

describe("repeats", () => {
  it("takes the tokens of the bar it names", () => {
    const { timeline } = cleanSong();
    const drums = timeline.notes.filter((note) => note.channel === 2);
    expect(drums).toHaveLength(14);
    const first = drums.filter((note) => note.step < 16).map((note) => [note.step, note.drum]);
    const second = drums.filter((note) => note.step >= 16).map((note) => [note.step - 16, note.drum]);
    expect(second).toEqual(first);
  });

  it("must name a bar that is written out", () => {
    const itself = withBar("drums", 1, "=1");
    expect(errorsOf(itself)).toEqual(["reference sections.A.drums[1]"]);
    expect(messageAt(itself, "sections.A.drums[1]")).toContain("bar 1 is a repeat itself");
    const beyond = withBar("drums", 1, "=5");
    expect(errorsOf(beyond)).toEqual(["reference sections.A.drums[1]"]);
    expect(messageAt(beyond, "sections.A.drums[1]")).toContain("the section has only 2 bar(s)");
  });

  it("is not itself parsed as a bar, but a broken target fails once", () => {
    const json = withBar("drums", 0, "k . h . | . . h . | k . h . | . . h");
    expect(errorsOf(json)).toEqual(["steps sections.A.drums[0]"]);
  });
});

describe("the timeline", () => {
  it("flattens the order into bars and steps", () => {
    const song = cleanSong();
    expect(song.timeline).toMatchObject({ beatsPerBar: 4, stepsPerBeat: 4, stepsPerBar: 16, totalSteps: 32, loopStartStep: 0 });
    expect(song.timeline.bars.map((bar) => [bar.orderIndex, bar.section, bar.bar, bar.chords.map((chord) => chord?.name)])).toEqual([
      [0, "A", 0, ["C", "C", "C", "C"]],
      [0, "A", 1, ["G", "G", "G", "G"]],
    ]);
    expect(song.channels.map((channel) => channel.name)).toEqual(["lead", "bass", "drums"]);
  });

  it("turns notes and holds into notes with a length", () => {
    const lead = cleanSong().timeline.notes.filter((note) => note.channel === 0);
    expect(lead.map((note) => [note.step, note.steps, note.midi])).toEqual([
      [0, 2, 76],
      [2, 2, 79],
      [4, 4, 84],
      [10, 2, 83],
      [12, 2, 81],
      [14, 2, 79],
      [16, 4, 74],
      [22, 2, 79],
      [24, 2, 83],
      [26, 2, 86],
    ]);
    expect(lead[0]).toEqual({ channel: 0, step: 0, steps: 2, midi: 76, arp: null, velocity: 7, drum: null });
  });

  it("sorts notes by step, then by channel", () => {
    const { notes } = cleanSong().timeline;
    for (let i = 1; i < notes.length; i += 1) {
      const before = notes[i - 1] as (typeof notes)[number];
      const here = notes[i] as (typeof notes)[number];
      expect(before.step < here.step || (before.step === here.step && before.channel < here.channel)).toBe(true);
    }
  });

  it("holds a note across a bar line", () => {
    const song = parseSong(withBar("lead", 1, "- - - - | . . G5 - | B5 - D6 - | . . . ."));
    const held = song.timeline.notes.find((note) => note.channel === 0 && note.step === 14);
    expect(held).toMatchObject({ midi: 79, steps: 6 });
  });

  it("warns about a hold with nothing to hold, once per run", () => {
    const { song, findings } = readSong(withBar("lead", 0, ". - - - | C6 - - - | . . B5 - | A5 - G5 -"));
    expect(song).not.toBeNull();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "warning", rule: "hold", path: "sections.A.lead[0]", at: { section: "A", channel: "lead", bar: 0, beat: 0, step: 1 } });
  });

  it("lets a drum channel write - after a hit: a hit is a point in time", () => {
    const { song, findings } = readSong(withBar("drums", 0, "k - - - | . . h . | k . h . | . . h h"));
    expect(findings).toEqual([]);
    expect(song?.timeline.notes.find((note) => note.channel === 2 && note.step === 0)).toMatchObject({ drum: "k", steps: 1, midi: -1 });
  });

  it("spreads several chords over the beats of a bar", () => {
    const song = parseSong(setAt(cleanJson(), ["sections", "A", "chords"], ["C G", "-"]));
    expect(song.timeline.bars[0]?.chords.map((chord) => chord?.name)).toEqual(["C", "C", "G", "G"]);
    expect(song.timeline.bars[1]?.chords).toEqual([null, null, null, null]);
  });

  it("plays a section that is named twice twice, and loops from the order index", () => {
    const json = setAt(setAt(cleanJson(), ["order"], ["A", "A"]), ["loop"], { fromOrderIndex: 1 });
    const song = parseSong(json);
    expect(song.loopFrom).toBe(1);
    expect(song.timeline).toMatchObject({ totalSteps: 64, loopStartStep: 32 });
    expect(song.timeline.bars.map((bar) => `${bar.orderIndex}:${bar.section}${bar.bar}`)).toEqual(["0:A0", "0:A1", "1:A0", "1:A1"]);
    expect(song.timeline.notes).toHaveLength(2 * cleanSong().timeline.notes.length);
  });

  it("has no loop point for a jingle", () => {
    const song = parseSong(setAt(cleanJson(), ["loop"], false));
    expect(song.loopFrom).toBeNull();
    expect(song.timeline.loopStartStep).toBeNull();
  });

  it("lets a section leave a channel out", () => {
    const json = setAt(cleanJson(), ["sections", "A", "drums"], undefined);
    const song = parseSong(json);
    expect(song.sections["A"]?.tokens["drums"]).toBeUndefined();
    expect(song.timeline.notes.some((note) => note.channel === 2)).toBe(false);
  });

  it(`refuses a song longer than ${MAX_BARS} bars`, () => {
    const json = setAt(cleanJson(), ["order"], new Array(257).fill("A"));
    expect(errorsOf(json)).toEqual(["parse order"]);
    expect(messageAt(json, "order")).toBe("the song is 514 bars long; the limit is 512");
  });
});

describe("states and orchestrations", () => {
  it("plays the channels of a state's layers, and every channel that is in no layer", () => {
    const song = cleanSong();
    expect(channelsOfState(song, null)).toEqual([true, true, true]);
    expect(channelsOfState(song, "calm")).toEqual([true, true, false]);
    expect(channelsOfState(song, "busy")).toEqual([true, true, true]);
    const loose = parseSong(setAt(setAt(cleanJson(), ["layers"], { groove: ["drums"] }), ["states"], undefined));
    expect(loose.states).toEqual({});
    const partly = parseSong(setAt(setAt(cleanJson(), ["layers"], { groove: ["drums"] }), ["states"], { quiet: { layers: [] }, full: { layers: ["groove"] } }));
    expect(channelsOfState(partly, "quiet")).toEqual([true, true, false]);
    expect(channelsOfState(partly, "full")).toEqual([true, true, true]);
    expect(() => channelsOfState(song, "nope")).toThrow('the song "fixture.clean" has no state "nope" (known: calm, busy, muffled)');
  });

  it("keeps a state's low-pass", () => {
    const song = cleanSong();
    expect(song.states["muffled"]).toEqual({ layers: ["base", "melody"], lowpassHz: 900 });
    expect(song.states["calm"]?.lowpassHz).toBeNull();
  });

  it("lays an orchestration's patch over the instrument as written", () => {
    const song = cleanSong();
    const soft = instrumentsOf(song, "soft");
    const lead = soft["lead"];
    expect(lead?.kind === "tone" ? lead.tone : null).toMatchObject({ wave: "triangle", env: { a: 0.005, d: 0.1, s: 0.6, r: 0.05 } });
    expect(soft["bass"]).toBe(song.instruments["bass"]);
    expect(soft["kit"]).toBe(song.instruments["kit"]);
    expect(instrumentsOf(song, null)).toBe(song.instruments);
    expect(() => instrumentsOf(song, "nope")).toThrow('the song "fixture.clean" has no orchestration "nope" (known: soft)');
  });
});

describe("findings", () => {
  it("anchors in bars and beats, not in seconds", () => {
    const { findings } = checkSongText(fixtureText("bad/music/off-key"));
    const [finding] = ofRule(findings, "off-key");
    expect(Object.keys(finding?.at ?? {}).sort()).toEqual(["bar", "beat", "channel", "section", "step"]);
  });
});
