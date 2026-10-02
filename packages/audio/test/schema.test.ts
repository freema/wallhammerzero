// The JSON Schemas of the two formats agree with the readers: the same fields, the same
// bounds. A schema checks the structure of a file (an editor can use it); the notes in the
// bars, the references and the music are checked by the reader and the validators.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sfxSchema from "../schema/wz.sfx-0.1.schema.json" with { type: "json" };
import songSchema from "../schema/wz.song-0.1.schema.json" with { type: "json" };
import { readSfx, readSong, SFX_FORMAT, SONG_FORMAT } from "../src/index.ts";
import { cleanJson, fixtureJson, REPO, setAt } from "./helpers.ts";

type Schema = Record<string, unknown>;

const ANNOTATIONS = new Set(["$schema", "$id", "$defs", "title", "description"]);

/**
 * A validator for the part of JSON Schema 2020-12 these two schemas use. A keyword it does
 * not know is an error, so a schema cannot grow a rule this test silently skips.
 */
function validate(root: Schema, schema: Schema, value: unknown, path = ""): string[] {
  const errors: string[] = [];
  const fail = (what: string): void => {
    errors.push(`${path === "" ? "(file)" : path}: ${what}`);
  };
  const isObject = (candidate: unknown): candidate is Record<string, unknown> => typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);

  for (const [keyword, rule] of Object.entries(schema)) {
    if (ANNOTATIONS.has(keyword)) continue;
    switch (keyword) {
      case "$ref": {
        const name = /^#\/\$defs\/([a-z]+)$/.exec(rule as string)?.[1];
        const target = name === undefined ? undefined : (root["$defs"] as Record<string, Schema>)[name];
        if (target === undefined) throw new Error(`unknown $ref ${String(rule)}`);
        errors.push(...validate(root, target, value, path));
        break;
      }
      case "type": {
        const fine =
          rule === "object"
            ? isObject(value)
            : rule === "array"
              ? Array.isArray(value)
              : rule === "string"
                ? typeof value === "string"
                : rule === "number"
                  ? typeof value === "number"
                  : rule === "integer"
                    ? Number.isInteger(value)
                    : null;
        if (fine === null) throw new Error(`unknown type ${String(rule)}`);
        if (!fine) fail(`is not ${String(rule)}`);
        break;
      }
      case "const":
        if (value !== rule) fail(`is not ${JSON.stringify(rule)}`);
        break;
      case "enum":
        if (!(rule as unknown[]).includes(value)) fail("is not one of the choices");
        break;
      case "required":
        if (isObject(value)) for (const key of rule as string[]) if (!Object.hasOwn(value, key)) fail(`misses ${key}`);
        break;
      case "properties":
        if (isObject(value)) {
          for (const [key, sub] of Object.entries(rule as Record<string, Schema>)) {
            if (Object.hasOwn(value, key)) errors.push(...validate(root, sub, value[key], path === "" ? key : `${path}.${key}`));
          }
        }
        break;
      case "additionalProperties":
        if (isObject(value)) {
          const known = Object.keys((schema["properties"] as Record<string, unknown> | undefined) ?? {});
          for (const key of Object.keys(value)) {
            if (known.includes(key)) continue;
            const here = path === "" ? key : `${path}.${key}`;
            if (rule === false) errors.push(`${here}: is not a known field`);
            else errors.push(...validate(root, rule as Schema, value[key], here));
          }
        }
        break;
      case "propertyNames":
        if (isObject(value)) {
          const pattern = new RegExp((rule as { pattern: string }).pattern);
          if (Object.keys(rule as object).join() !== "pattern") throw new Error("propertyNames: only a pattern is known");
          for (const key of Object.keys(value)) if (!pattern.test(key)) fail(`has the bad name ${key}`);
        }
        break;
      case "minProperties":
        if (isObject(value) && Object.keys(value).length < (rule as number)) fail("has too few fields");
        break;
      case "items":
        if (Array.isArray(value)) {
          const from = ((schema["prefixItems"] as unknown[] | undefined) ?? []).length;
          value.slice(from).forEach((item, i) => errors.push(...validate(root, rule as Schema, item, `${path}[${from + i}]`)));
        }
        break;
      case "prefixItems":
        if (Array.isArray(value)) (rule as Schema[]).forEach((sub, i) => i < value.length && errors.push(...validate(root, sub, value[i], `${path}[${i}]`)));
        break;
      case "minItems":
        if (Array.isArray(value) && value.length < (rule as number)) fail("is too short");
        break;
      case "maxItems":
        if (Array.isArray(value) && value.length > (rule as number)) fail("is too long");
        break;
      case "pattern":
        if (typeof value === "string" && !new RegExp(rule as string).test(value)) fail("does not match the pattern");
        break;
      case "maxLength":
        if (typeof value === "string" && value.length > (rule as number)) fail("is too long");
        break;
      case "minimum":
        if (typeof value === "number" && value < (rule as number)) fail("is too small");
        break;
      case "maximum":
        if (typeof value === "number" && value > (rule as number)) fail("is too large");
        break;
      case "oneOf": {
        const matches = (rule as Schema[]).filter((sub) => validate(root, sub, value, path).length === 0).length;
        if (matches !== 1) fail(`matches ${matches} of the alternatives, not one`);
        break;
      }
      default:
        throw new Error(`the schema uses the keyword ${keyword}, which this test does not check`);
    }
  }
  return errors;
}

const song = (value: unknown): string[] => validate(songSchema, songSchema, value);
const sfx = (value: unknown): string[] => validate(sfxSchema, sfxSchema, value);
const readerErrors = (kind: "song" | "sfx", value: unknown): number =>
  (kind === "song" ? readSong(value) : readSfx(value)).findings.filter((finding) => finding.severity === "error").length;

/** The fields a reader names when it meets an unknown one at `path`. */
function knownFields(kind: "song" | "sfx", json: Record<string, unknown>, path: string[]): string[] {
  const probe = setAt(json, [...path, "zzUnknown"], 1);
  const finding = (kind === "song" ? readSong(probe) : readSfx(probe)).findings.find((candidate) => candidate.path.endsWith("zzUnknown"));
  const list = /\(known: (.*)\)$/.exec(finding?.message ?? "")?.[1];
  if (list === undefined) throw new Error(`the reader did not name the known fields at ${path.join(".")}`);
  return list.split(", ").sort();
}

const properties = (schema: unknown): string[] => Object.keys((schema as { properties: object }).properties).sort();
const songDefs = songSchema.$defs;
const sfxDefs = sfxSchema.$defs;
const blipJson = (): Record<string, unknown> => fixtureJson("good/sfx/blip", ".sfx.json");

function exampleFiles(folder: "music" | "sfx"): string[] {
  const dir = `${REPO}audio/examples/${folder}`;
  return readdirSync(dir)
    .filter((name) => name.endsWith(folder === "music" ? ".song.json" : ".sfx.json"))
    .map((name) => `${dir}/${name}`);
}

describe("the schemas", () => {
  it("are JSON Schema 2020-12 and are named after the formats", () => {
    expect(songSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(sfxSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(songSchema.$id).toBe(SONG_FORMAT);
    expect(sfxSchema.$id).toBe(SFX_FORMAT);
    expect(songSchema.properties.format.const).toBe(SONG_FORMAT);
    expect(sfxSchema.properties.format.const).toBe(SFX_FORMAT);
  });

  it("accept every example and every good fixture", () => {
    const songs = [...exampleFiles("music"), `${REPO}packages/audio/test/fixtures/audio/good/music/clean.song.json`, `${REPO}packages/audio/test/fixtures/audio/good/music/seam-click.song.json`];
    expect(songs.length).toBeGreaterThanOrEqual(4);
    for (const file of songs) expect([file, song(JSON.parse(readFileSync(file, "utf8")))]).toEqual([file, []]);
    const sounds = [...exampleFiles("sfx"), `${REPO}packages/audio/test/fixtures/audio/good/sfx/blip.sfx.json`];
    expect(sounds.length).toBeGreaterThanOrEqual(4);
    for (const file of sounds) expect([file, sfx(JSON.parse(readFileSync(file, "utf8")))]).toEqual([file, []]);
  });

  it("check the structure only: a wrong step count and an off-key note are for the validators", () => {
    expect(song(fixtureJson("bad/music/wrong-step-count"))).toEqual([]);
    expect(song(fixtureJson("bad/music/off-key"))).toEqual([]);
    expect(song(fixtureJson("bad/music/short-channel"))).toEqual([]);
    expect(sfx(fixtureJson("bad/sfx/unknown-field", ".sfx.json"))).toEqual(["voices[0].volume: is not a known field"]);
  });
});

describe("the song schema and the reader", () => {
  it("know the same fields", () => {
    expect(properties(songSchema)).toEqual(knownFields("song", cleanJson(), []));
    expect(properties(songDefs.channel)).toEqual(knownFields("song", cleanJson(), ["channels", "lead"]));
    expect(properties(songDefs.channel.properties.echo)).toEqual(
      knownFields("song", setAt(cleanJson(), ["channels", "lead", "echo"], { beats: 1, feedback: 0.5, mix: 0.5 }), ["channels", "lead", "echo"]),
    );
    expect(properties(songDefs.tone)).toEqual(knownFields("song", cleanJson(), ["instruments", "lead"]));
    expect(properties(songDefs.drum)).toEqual(knownFields("song", cleanJson(), ["instruments", "kit", "drums", "k"]));
    expect(properties(songDefs.kit)).toEqual(knownFields("song", cleanJson(), ["instruments", "kit"]));
    expect(properties(songDefs.envelope)).toEqual(knownFields("song", cleanJson(), ["instruments", "lead", "env"]));
    expect(properties(songDefs.vibrato)).toEqual(
      knownFields("song", setAt(cleanJson(), ["instruments", "lead", "vibrato"], { cents: 10, hz: 5 }), ["instruments", "lead", "vibrato"]),
    );
    expect(properties(songDefs.patch)).toEqual(knownFields("song", cleanJson(), ["orchestrations", "soft", "lead"]));
    expect(properties(songSchema.properties.states.additionalProperties)).toEqual(knownFields("song", cleanJson(), ["states", "calm"]));
    expect(properties(songSchema.properties.loop.oneOf[1])).toEqual(knownFields("song", cleanJson(), ["loop"]));
  });

  it("need the same fields", () => {
    for (const field of songSchema.required) {
      const json = setAt(cleanJson(), [field], undefined);
      expect([field, song(json)]).toEqual([field, [`(file): misses ${field}`]]);
      expect(readerErrors("song", json)).toBeGreaterThan(0);
    }
    for (const field of properties(songSchema).filter((name) => !songSchema.required.includes(name))) {
      // Leaving out the layers leaves the states without them: take both out.
      const json = setAt(cleanJson(), [field], undefined);
      if (field === "layers") setAt(json, ["states"], undefined);
      expect([field, song(json), readerErrors("song", json)]).toEqual([field, [], 0]);
    }
  });

  it.each([
    [["swing"], 0.5],
    [["format"], "wz.song/0.2"],
    [["id"], "Bad Id"],
    [["tempo"], 120.5],
    [["tempo"], 29],
    [["tempo"], 301],
    [["meter"], [4, 3]],
    [["meter"], [13, 4]],
    [["meter"], [4, 4, 4]],
    [["stepsPerBeat"], 0],
    [["stepsPerBeat"], 9],
    [["key"], "H major"],
    [["key"], "C blues"],
    [["seed"], -1],
    [["seed"], 4294967296],
    [["loop"], true],
    [["loop"], { fromOrderIndex: -1 }],
    [["loop"], {}],
    [["order"], []],
    [["order"], [1]],
    [["channels"], {}],
    [["channels", "lead", "gainDb"], 7],
    [["channels", "lead", "gainDb"], -61],
    [["channels", "lead", "pan"], 1.5],
    [["channels", "lead", "echo"], { beats: 0.75, feedback: 0.95, mix: 0.3 }],
    [["channels", "lead", "echo"], { beats: 5, feedback: 0.5, mix: 0.3 }],
    [["channels", "lead", "echo"], { beats: 0.75, feedback: 0.5 }],
    [["channels", "bad name"], { instrument: "lead", gainDb: 0 }],
    [["instruments", "lead", "wave"], "saw"],
    [["instruments", "lead", "duty"], 0.3],
    [["instruments", "lead", "env"], { a: 0, d: 0, s: 1.5, r: 0 }],
    [["instruments", "lead", "env"], { a: 11, d: 0, s: 1, r: 0 }],
    [["instruments", "lead", "env"], undefined],
    [["instruments", "lead", "vibrato"], { cents: 201, hz: 5 }],
    [["instruments", "lead", "vibrato"], { cents: 20, hz: 0.05 }],
    [["instruments", "lead", "arpHz"], 0],
    [["instruments", "lead", "glide"], 3],
    [["instruments", "lead", "slideSemitonesPerSec"], 481],
    [["instruments", "lead", "samples"], "xyz"],
    [["instruments", "bass", "steps"], 16],
    [["instruments", "bass", "mode"], "medium"],
    [["instruments", "kit", "drums", "k", "pitch"], undefined],
    [["instruments", "kit", "drums", "k", "pitch"], "low"],
    [["instruments", "kit", "drums", "Kick"], { wave: "noise", pitch: "C4", env: { a: 0, d: 0.1, s: 0, r: 0 } }],
    [["instruments", "kit", "drums"], {}],
    [["instruments", "kit", "volume"], 1],
    [["sections"], {}],
    [["sections", "A", "chords"], []],
    [["sections", "A", "chords"], undefined],
    [["sections", "A", "lead"], "C4 - - -"],
    [["sections", "A", "lead"], [1, 2]],
    [["layers", "base"], "bass"],
    [["states", "calm", "lowpassHz"], 50],
    [["states", "calm", "lowpassHz"], 20001],
    [["states", "calm", "layers"], undefined],
    [["orchestrations", "soft", "lead"], { wave: "saw" }],
    [["orchestrations", "soft", "lead"], { pitch: "C4" }],
  ])("both refuse %j = %j", (path, value) => {
    const json = setAt(cleanJson(), path, value);
    expect(song(json).length).toBeGreaterThan(0);
    expect(readerErrors("song", json)).toBeGreaterThan(0);
  });

  it.each([
    [["tempo"], 30],
    [["tempo"], 300],
    [["meter"], [4, 8]],
    [["meter"], [4, 2]],
    [["seed"], 0],
    [["seed"], 4294967295],
    [["channels", "lead", "gainDb"], 6],
    [["channels", "lead", "gainDb"], -60],
    [["channels", "lead", "pan"], -1],
    [["channels", "lead", "echo"], { beats: 0.05, feedback: 0.9, mix: 1 }],
    [["instruments", "lead", "env"], { a: 10, d: 10, s: 0, r: 10 }],
    [["instruments", "lead", "vibrato"], { cents: 200, hz: 20, delay: 5 }],
    [["instruments", "lead", "arpHz"], 120],
    [["instruments", "lead", "slideSemitonesPerSec"], -480],
    [["instruments", "bass", "steps"], 32],
    [["states", "calm", "lowpassHz"], 100],
    [["states", "calm", "lowpassHz"], 20000],
    [["key"], "F# locrian"],
    [["id"], "bgm.shop_day-2"],
  ])("both take the limit %j = %j", (path, value) => {
    const json = setAt(cleanJson(), path, value);
    expect(song(json)).toEqual([]);
    expect(readerErrors("song", json)).toBe(0);
  });
});

describe("the SFX schema and the reader", () => {
  it("know the same fields", () => {
    expect(properties(sfxSchema)).toEqual(knownFields("sfx", blipJson(), []));
    expect(properties(sfxSchema.properties.play)).toEqual(knownFields("sfx", blipJson(), ["play"]));
    const voices = (blipJson()["voices"] as Record<string, unknown>[])[0] as Record<string, unknown>;
    const probe = { ...blipJson(), voices: [{ ...voices, zzUnknown: 1 }] };
    const message = readSfx(probe).findings.find((finding) => finding.path === "voices[0].zzUnknown")?.message ?? "";
    expect(properties(sfxDefs.voice)).toEqual((/\(known: (.*)\)$/.exec(message)?.[1] ?? "").split(", ").sort());
    // A voice of an SFX and an instrument of a song share the tone fields and their bounds.
    for (const field of properties(songDefs.tone)) {
      expect([field, (sfxDefs.voice.properties as Record<string, unknown>)[field]]).toEqual([field, (songDefs.tone.properties as Record<string, unknown>)[field]]);
    }
    expect(sfxDefs.envelope).toEqual(songDefs.envelope);
    expect(sfxDefs.vibrato).toEqual(songDefs.vibrato);
  });

  it("need the same fields", () => {
    for (const field of sfxSchema.required) {
      const json = setAt(blipJson(), [field], undefined);
      expect([field, sfx(json)]).toEqual([field, [`(file): misses ${field}`]]);
      expect(readerErrors("sfx", json)).toBeGreaterThan(0);
    }
    for (const field of ["seed", "play"]) {
      const json = setAt(blipJson(), [field], undefined);
      expect([field, sfx(json), readerErrors("sfx", json)]).toEqual([field, [], 0]);
    }
  });

  const withVoice = (change: Record<string, unknown>): Record<string, unknown> => {
    const json = blipJson();
    const voices = json["voices"] as Record<string, unknown>[];
    voices[0] = JSON.parse(JSON.stringify({ ...voices[0], ...change })) as Record<string, unknown>;
    return json;
  };

  it.each([
    [{ format: "wz.sfx/1" }, {}],
    [{ id: "Coin!" }, {}],
    [{ gainDb: 7 }, {}],
    [{ seed: 0.5 }, {}],
    [{ voices: [] }, {}],
    [{ play: { maxVoices: 0 } }, {}],
    [{ play: { maxVoices: 17 } }, {}],
    [{ play: { jitterCents: 201 } }, {}],
    [{ play: { minIntervalMs: -1 } }, {}],
    [{ play: { cooldown: 1 } }, {}],
    [{}, { notes: [] }],
    [{}, { notes: undefined }],
    [{}, { notes: [["A4"]] }],
    [{}, { notes: [["A4", 0.1, 1]] }],
    [{}, { notes: [[69, 0.1]] }],
    [{}, { notes: [["A4", 0]] }],
    [{}, { notes: [["A4", 10.5]] }],
    [{}, { wave: "sine" }],
    [{}, { env: undefined }],
    [{}, { lowpassHz: 99 }],
    [{}, { highpassHz: 10001 }],
    [{}, { startSec: -0.1 }],
    [{}, { gainDb: 6.5 }],
    [{}, { volume: 1 }],
  ])("both refuse %j with the voice %j", (top, voice) => {
    const json = { ...withVoice(voice), ...top };
    expect(sfx(json).length).toBeGreaterThan(0);
    expect(readerErrors("sfx", json)).toBeGreaterThan(0);
  });

  it("refuses nine voices in both", () => {
    const json = blipJson();
    const voices = json["voices"] as unknown[];
    json["voices"] = new Array(9).fill(voices[0]);
    expect(sfx(json)).toEqual(["voices: is too long"]);
    expect(readerErrors("sfx", json)).toBeGreaterThan(0);
  });
});
