// The `audio` command line: what it prints, what it writes and its exit codes. Most tests run
// `runCli` in-process on a copy of the fixtures; the last one starts the real entry point.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "@whz/asset-kit/node";
import { afterAll, describe, expect, it } from "vitest";
import { decodeWav, pcmHash } from "../src/index.ts";
import { runCli, SIDECAR_FORMAT } from "../src/node/index.ts";
import { FIXTURES, REPO } from "./helpers.ts";

const BIN = fileURLToPath(new URL("../src/node/bin.ts", import.meta.url));
const FIXTURE_ARGS = ["--audio", FIXTURES];

const temp = mkdtempSync(join(tmpdir(), "whz-audio-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

/** Runs the CLI from the repo root and collects what it prints. */
function run(...argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCli(argv, { out: (line) => out.push(line), err: (line) => err.push(line), cwd: REPO });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** A fresh checkout-like folder with the good fixtures as its audio (no sidecars, no build). */
function project(name: string, packs: readonly string[] = ["good"]): string {
  const root = join(temp, name);
  for (const pack of packs) cpSync(join(REPO, FIXTURES, pack), join(root, "audio", pack), { recursive: true });
  return root;
}

/** Every file under a folder, as relative path -> bytes. */
function snapshot(dir: string, prefix = ""): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) for (const [key, value] of snapshot(path, `${prefix}${name}/`)) files.set(key, value);
    else files.set(`${prefix}${name}`, readFileSync(path));
  }
  return files;
}

describe("usage", () => {
  it("prints the help with exit code 0", () => {
    for (const argv of [[], ["help"], ["--help"], ["render", "-h"]]) {
      const result = run(...argv);
      expect(result.code).toBe(0);
      expect(result.out).toMatch(/^audio <command> \[options\]/);
      expect(result.out).toContain("Exit codes: 0 fine, 1 a file has an error (or a golden does not match), 2 wrong usage.");
    }
  });

  it.each([
    [["paint"], "audio: unknown command paint (commands: list, check, render, metrics)"],
    [["check"], "audio: check needs ids or --all (not both)"],
    [["check", "good/music/clean", "--all"], "audio: check needs ids or --all (not both)"],
    [["render"], "audio: render needs ids or --all (not both)"],
    [["check", "--all", "--fast"], "audio: unknown option --fast"],
    [["render", "--all", "--pass", "sideways"], 'audio: --pass must be "first" or "steady", got sideways'],
    [["check", "--all", "--root"], "audio: --root needs a value"],
    [["render", "--all", "--orchestration", "--json"], "audio: --orchestration needs a value"],
    [["metrics"], "audio: metrics needs exactly one id or one WAV file"],
    [["metrics", "a", "b"], "audio: metrics needs exactly one id or one WAV file"],
    [["metrics", "nothing-here.wav"], "audio: there is no file nothing-here.wav"],
  ])("refuses %j with exit code 2", (argv, message) => {
    const result = run(...argv, ...FIXTURE_ARGS);
    expect(result).toEqual({ code: 2, out: "", err: message });
  });

  it("names what it found when an id is not known", () => {
    const result = run("check", "good/music/nope", ...FIXTURE_ARGS);
    expect(result.code).toBe(2);
    expect(result.err).toMatch(/^audio: no song or SFX "good\/music\/nope" under .*fixtures\/audio \(found: bad\/music\/off-key, /);
    expect(result.err).toContain("good/sfx/blip)");
  });
});

describe("list", () => {
  it("lists every song, jingle and SFX with what a reader needs to pick one", () => {
    const result = run("list");
    expect(result.code).toBe(0);
    expect(result.out.split("\n")).toEqual([
      "examples/music/fanfare  jingle  jingle.fanfare  2 bars  3.2 s  150 BPM  F major",
      "examples/music/shop-day  song  bgm.shop.day  8 bars  17.78 s  108 BPM  F major  states: calm, rush, night  orchestrations: winter",
      "examples/sfx/click  sfx  sfx.click  1 voice(s)",
      "examples/sfx/coin  sfx  sfx.coin  1 voice(s)",
      "examples/sfx/level-up  sfx  sfx.level-up  2 voice(s)",
    ]);
  });

  it("prints JSON", () => {
    const result = run("list", "--json");
    expect(result.code).toBe(0);
    const rows = JSON.parse(result.out) as Record<string, unknown>[];
    expect(rows.map((row) => `${String(row["kind"])} ${String(row["id"])}`)).toEqual(["jingle jingle.fanfare", "song bgm.shop.day", "sfx sfx.click", "sfx sfx.coin", "sfx sfx.level-up"]);
    expect(rows[1]).toEqual({
      pathId: "examples/music/shop-day",
      kind: "song",
      id: "bgm.shop.day",
      bars: 8,
      seconds: 17.78,
      tempo: 108,
      key: "F major",
      channels: ["lead", "keys", "bass", "drums"],
      states: ["calm", "rush", "night"],
      orchestrations: ["winter"],
    });
  });

  it("shows a file that cannot be read as an error, with exit code 1", () => {
    const result = run("list", ...FIXTURE_ARGS);
    expect(result.code).toBe(1);
    expect(result.out).toContain("bad/music/wrong-step-count  song  ERROR: beat 3 has 5 step(s), stepsPerBeat is 4");
    expect(result.out).toContain("good/music/clean  song  fixture.clean  2 bars  4 s  120 BPM  C major  states: calm, busy, muffled  orchestrations: soft");
    expect(result.out).toContain("good/sfx/blip  sfx  fixture.blip  2 voice(s)");
  });

  it("says so when there is nothing", () => {
    const result = run("list", "--audio", "packages/audio/test/fixtures/nowhere");
    expect(result).toEqual({ code: 0, out: "no songs or SFX under packages/audio/test/fixtures/nowhere", err: "" });
  });
});

describe("check", () => {
  it("fails each broken fixture with its rule and its path", () => {
    const result = run("check", "--all", "--no-golden", ...FIXTURE_ARGS);
    expect(result.code).toBe(1);
    expect(result.out.split("\n")).toEqual([
      "check bad/music/off-key: 1 error(s)",
      "  error off-key  sections.A.lead[0]: beat 1: F#5 is on the beat but is not in C major and the chord C",
      "check bad/music/short-channel: 1 error(s)",
      "  error length  sections.A.bass: has 1 bar(s), but the section has 2 (the length of its chord lane): every channel of a section must have the same number of bars",
      "check bad/music/wrong-step-count: 1 error(s)",
      '  error steps  sections.A.lead[0]: beat 3 has 5 step(s), stepsPerBeat is 4: ". . B5 - -"',
      "check bad/sfx/unknown-field: 2 error(s)",
      "  error parse  voices[0].volume: unknown field (known: wave, env, duty, steps, mode, samples, vibrato, arpHz, glide, slideSemitonesPerSec, notes, startSec, gainDb, lowpassHz, highpassHz)",
      '  error token  voices[0].notes[0][0]: "H5" is not a note ("C4", "F#3", "Bb5"), "-" (hold) or "." (silence)',
      "check good/music/clean: ok",
      "check good/music/seam-click: ok",
      "check good/sfx/blip: ok",
      "check: 4 of 7 file(s) FAILED",
    ]);
  });

  it("finds a file by its path id, by the id inside it and by its path", () => {
    for (const id of ["good/music/clean", "fixture.clean", `${FIXTURES}/good/music/clean.song.json`]) {
      expect(run("check", id, "--no-golden", ...FIXTURE_ARGS)).toEqual({ code: 0, out: "check good/music/clean: ok", err: "" });
    }
    expect(run("check", "bad/music/off-key", "--no-golden", ...FIXTURE_ARGS).code).toBe(1);
  });

  it("needs a sidecar with the golden hash", () => {
    const root = project("no-sidecar");
    const result = run("check", "--all", "--root", root);
    expect(result.code).toBe(1);
    expect(result.out).toContain("check good/music/clean: 1 error(s)");
    expect(result.out).toContain("error golden  (file): there is no sidecar clean.render.json with the golden hash: run `./dev npm run audio -- render good/music/clean` and commit the sidecar");
    expect(result.out).toContain("check: 3 of 3 file(s) FAILED");
    expect(existsSync(join(root, "build"))).toBe(false);
  });

  it("passes once the sidecars are rendered, and fails when the sound changes", () => {
    const root = project("golden");
    expect(run("render", "--all", "--root", root).code).toBe(0);
    const passed = run("check", "--all", "--root", root);
    expect(passed.code).toBe(0);
    expect(passed.out).toMatch(/^check good\/music\/clean: ok {2}\(4 s {2}hash [0-9a-f]{16} {2}-17\.4 LUFS {2}-4\.9 dBTP {2}trim -0\.6 dB {2}above 8 kHz 1\.9 % {2}seam ok\)$/m);
    expect(passed.out).toMatch(/^check good\/sfx\/blip: ok {2}\(0\.145 s {2}hash [0-9a-f]{16} {2}-20\.9 LUFS \(loudest 400 ms\) {2}-7\.2 dBTP {2}trim 0 dB {2}above 8 kHz 0\.5 %\)$/m);
    expect(passed.out).toContain("check: 3 file(s) ok");

    // One note of the song changes: the hash of the render is no longer the golden one.
    const songFile = join(root, "audio/good/music/clean.song.json");
    const original = readFileSync(songFile, "utf8");
    writeFileSync(songFile, original.replace("E5 - G5 - | C6", "E5 - G5 - | E6"));
    const changed = run("check", "good/music/clean", "--root", root);
    expect(changed.code).toBe(1);
    expect(changed.out).toMatch(/error golden {2}\(file\): the render has the PCM hash [0-9a-f]{16}, the sidecar says "[0-9a-f]{16}": run `\.\/dev npm run audio -- render good\/music\/clean`/);
    writeFileSync(songFile, original);
    expect(run("check", "good/music/clean", "--root", root).code).toBe(0);

    // The mix is the same but something else in the sidecar is stale.
    const sidecarFile = join(root, "audio/good/music/clean.render.json");
    const sidecar = readFileSync(sidecarFile, "utf8");
    writeFileSync(sidecarFile, sidecar.replace('"trimDb": -0.6', '"trimDb": -0.7'));
    const stale = run("check", "good/music/clean", "--root", root);
    expect(stale.code).toBe(1);
    expect(stale.out).toContain("error golden  (file): the sidecar clean.render.json is out of date (the hash of the mix is right, something else changed)");
    writeFileSync(sidecarFile, "not json");
    expect(run("check", "good/music/clean", "--root", root).out).toContain("the sidecar says undefined");
  });

  it("with --all, fails a file in the wrong folder and an id that two files use", () => {
    const root = project("layout");
    expect(run("render", "--all", "--root", root).code).toBe(0);
    cpSync(join(root, "audio/good/music/clean.song.json"), join(root, "audio/good/clean.song.json"));
    mkdirSync(join(root, "audio/good/music/deep"));
    cpSync(join(root, "audio/good/sfx/blip.sfx.json"), join(root, "audio/good/music/deep/blip.sfx.json"));
    const strays = run("check", "--all", "--root", root);
    expect(strays.code).toBe(1);
    expect(strays.out).toContain("check good/clean.song.json: 1 error(s)\n  error layout  (file): songs live in audio/<pack>/music/ and SFX in audio/<pack>/sfx/; this file is not checked where it is");
    expect(strays.out).toContain("check good/music/deep/blip.sfx.json: 1 error(s)");
    expect(strays.out).toContain("check: 2 of 3 file(s) FAILED");
    rmSync(join(root, "audio/good/clean.song.json"));
    rmSync(join(root, "audio/good/music/deep"), { recursive: true });

    cpSync(join(root, "audio/good/music/clean.song.json"), join(root, "audio/good/music/copy.song.json"));
    cpSync(join(root, "audio/good/music/clean.render.json"), join(root, "audio/good/music/copy.render.json"));
    const twice = run("check", "--all", "--root", root);
    expect(twice.code).toBe(1);
    expect(twice.out).toContain('check good/music/clean, good/music/copy: 1 error(s)\n  error id  id: the id "fixture.clean" is used by 2 files; an id names one sound');
    // The id no longer names one file on the command line either.
    const ambiguous = run("check", "fixture.clean", "--root", root);
    expect(ambiguous.code).toBe(2);
    expect(ambiguous.err).toBe('audio: the id "fixture.clean" is used by good/music/clean and good/music/copy: name one by its path id');
  });

  it("says so when there is nothing to check", () => {
    const result = run("check", "--all", "--audio", "packages/audio/test/fixtures/nowhere");
    expect(result.code).toBe(0);
    expect(result.out).toBe("check: no songs or SFX under packages/audio/test/fixtures/nowhere\ncheck: 0 file(s) ok");
  });
});

describe("render", () => {
  const root = project("render");
  const first = run("render", "--all", "--root", root);
  const build = join(root, "build/audio/good");

  it("writes the mix, a stem per channel, a mix per state, both pictures and the sidecar", () => {
    expect(first.code).toBe(0);
    expect(first.err).toBe("");
    expect(first.out).toContain(
      `render good/music/clean -> ${join(build, "music/clean")}  (mix.wav, mix.calm.wav, mix.busy.wav, mix.muffled.wav, stems/lead.wav, stems/bass.wav, stems/drums.wav, piano-roll.png, spectrogram.png)`,
    );
    expect(first.out).toContain(`render good/sfx/blip -> ${join(build, "sfx/blip")}  (mix.wav, piano-roll.png, spectrogram.png)`);
    expect(first.out).toContain(`  sidecar ${join(root, "audio/good/music/clean.render.json")}: new`);
    expect([...snapshot(join(root, "build")).keys()]).toEqual([
      "audio/good/music/clean/mix.busy.wav",
      "audio/good/music/clean/mix.calm.wav",
      "audio/good/music/clean/mix.muffled.wav",
      "audio/good/music/clean/mix.wav",
      "audio/good/music/clean/piano-roll.png",
      "audio/good/music/clean/spectrogram.png",
      "audio/good/music/clean/stems/bass.wav",
      "audio/good/music/clean/stems/drums.wav",
      "audio/good/music/clean/stems/lead.wav",
      "audio/good/music/seam-click/mix.wav",
      "audio/good/music/seam-click/piano-roll.png",
      "audio/good/music/seam-click/spectrogram.png",
      "audio/good/music/seam-click/stems/bass.wav",
      "audio/good/sfx/blip/mix.wav",
      "audio/good/sfx/blip/piano-roll.png",
      "audio/good/sfx/blip/spectrogram.png",
    ]);
    expect(readdirSync(join(root, "audio/good/music")).sort()).toEqual(["clean.render.json", "clean.song.json", "seam-click.render.json", "seam-click.song.json"]);
  });

  it("writes 16-bit WAV files whose samples hash to the sidecar's hashes", () => {
    const sidecar = JSON.parse(readFileSync(join(root, "audio/good/music/clean.render.json"), "utf8")) as Record<string, unknown>;
    const hashOf = (file: string): { hash: string; channels: number; sampleRate: number; frames: number } => {
      const wav = decodeWav(new Uint8Array(readFileSync(join(build, "music/clean", file))));
      return { hash: pcmHash(wav.pcm, wav.channels, wav.sampleRate), channels: wav.channels, sampleRate: wav.sampleRate, frames: wav.pcm.length / wav.channels };
    };
    expect(hashOf("mix.wav")).toEqual({ hash: sidecar["hash"], channels: 2, sampleRate: 48000, frames: 192000 });
    expect((sidecar["stems"] as { channel: string; hash: string }[]).map((stem) => [stem.channel, stem.hash])).toEqual([
      ["lead", hashOf("stems/lead.wav").hash],
      ["bass", hashOf("stems/bass.wav").hash],
      ["drums", hashOf("stems/drums.wav").hash],
    ]);
    expect((sidecar["states"] as { state: string; hash: string }[]).map((state) => [state.state, state.hash])).toEqual([
      ["calm", hashOf("mix.calm.wav").hash],
      ["busy", hashOf("mix.busy.wav").hash],
      ["muffled", hashOf("mix.muffled.wav").hash],
    ]);
    const blip = decodeWav(new Uint8Array(readFileSync(join(build, "sfx/blip/mix.wav"))));
    expect(blip).toMatchObject({ channels: 1, sampleRate: 48000 });
    expect(blip.pcm).toHaveLength(6960);
  });

  it("writes pictures no larger than an image can be read at", () => {
    for (const file of ["music/clean/piano-roll.png", "music/clean/spectrogram.png", "sfx/blip/piano-roll.png", "sfx/blip/spectrogram.png"]) {
      const png = decodePng(new Uint8Array(readFileSync(join(build, file))));
      expect(png.w).toBeGreaterThan(300);
      expect(png.h).toBeGreaterThan(100);
      expect(Math.max(png.w, png.h)).toBeLessThanOrEqual(2000);
    }
  });

  it("writes a sidecar with the hash, the loudness, the peak, the trim and the warnings", () => {
    const sidecar = JSON.parse(readFileSync(join(root, "audio/good/music/clean.render.json"), "utf8")) as Record<string, unknown>;
    expect(SIDECAR_FORMAT).toBe("wz.audio-render/0.1");
    expect(Object.keys(sidecar)).toEqual([
      "format",
      "id",
      "kind",
      "source",
      "sampleRate",
      "frames",
      "loop",
      "hash",
      "seconds",
      "lufsI",
      "lufsMomentaryMax",
      "dBTP",
      "clipped",
      "energyAbove8k",
      "seam",
      "trimDb",
      "stems",
      "states",
      "stats",
      "warnings",
    ]);
    expect(sidecar).toMatchObject({
      format: "wz.audio-render/0.1",
      id: "fixture.clean",
      kind: "song",
      source: "clean.song.json",
      sampleRate: 48000,
      frames: 192000,
      loop: true,
      seconds: 4,
      lufsI: -17.4,
      dBTP: -4.9,
      clipped: 0,
      trimDb: -0.6,
      seam: { click: false },
      warnings: [],
    });
    expect(sidecar["hash"]).toMatch(/^[0-9a-f]{16}$/);
    expect((sidecar["states"] as Record<string, unknown>[])[2]).toMatchObject({ state: "muffled", lufsI: -19.6, dBTP: -8.5, trimDb: 1.6 });
    expect((sidecar["stats"] as { channels: unknown[] }).channels[0]).toEqual({
      channel: "lead",
      kit: false,
      bars: 2,
      notes: 10,
      onsetsPerStep: 0.313,
      restRatio: 0.25,
      lowest: "D5",
      highest: "D6",
      uniqueBarRatio: 1,
    });
    const blip = JSON.parse(readFileSync(join(root, "audio/good/sfx/blip.render.json"), "utf8")) as Record<string, unknown>;
    expect(blip).toMatchObject({ format: "wz.audio-render/0.1", id: "fixture.blip", kind: "sfx", source: "blip.sfx.json", frames: 6960, seam: null, trimDb: 0, warnings: [] });
    expect(Object.keys(blip)).not.toContain("stems");
  });

  it("writes the same bytes when it runs again", () => {
    const before = snapshot(root);
    const second = run("render", "--all", "--root", root);
    expect(second.code).toBe(0);
    expect(second.out).toContain(`  sidecar ${join(root, "audio/good/music/clean.render.json")}: unchanged`);
    expect(second.out).not.toContain(": new");
    const after = snapshot(root);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [name, bytes] of before) expect([name, bytes.equals(after.get(name) as Buffer)]).toEqual([name, true]);
    // The lines are the same too, but for the state of the sidecars.
    expect(second.out.replaceAll(": unchanged", ": new")).toBe(first.out);
  });

  it("renders a cold start and an orchestration into subfolders, and leaves the sidecar alone", () => {
    const sidecar = readFileSync(join(root, "audio/good/music/seam-click.render.json"), "utf8");
    const cold = run("render", "good/music/seam-click", "--pass", "first", "--root", root);
    expect(cold.code).toBe(0);
    expect(cold.out).toContain(`render good/music/seam-click -> ${join(build, "music/seam-click/pass-first")}  (mix.wav, stems/bass.wav, piano-roll.png, spectrogram.png)`);
    expect(cold.out).toContain("seam CLICKS");
    expect(cold.out).toMatch(/^ {2}warning loop-seam {2}\(file\): the loop point clicks: the signal jumps by 0\.15\d\d there, \d+(\.\d)? times the steps around it$/m);
    expect(cold.out).not.toContain("sidecar");
    expect(readFileSync(join(root, "audio/good/music/seam-click.render.json"), "utf8")).toBe(sidecar);

    const soft = run("render", "fixture.clean", "--orchestration", "soft", "--root", root);
    expect(soft.code).toBe(0);
    expect(existsSync(join(build, "music/clean/orchestration-soft/stems/lead.wav"))).toBe(true);
    const written = readFileSync(join(build, "music/clean/stems/lead.wav"));
    expect(written.equals(readFileSync(join(build, "music/clean/orchestration-soft/stems/lead.wav")))).toBe(false);
    expect(readFileSync(join(build, "music/clean/stems/bass.wav")).equals(readFileSync(join(build, "music/clean/orchestration-soft/stems/bass.wav")))).toBe(true);

    // Rendering the song again keeps the variants and removes nothing else.
    expect(run("render", "good/music/clean", "--root", root).code).toBe(0);
    expect(existsSync(join(build, "music/clean/orchestration-soft/mix.wav"))).toBe(true);

    const unknown = run("render", "good/music/clean", "--orchestration", "nope", "--root", root);
    expect(unknown.code).toBe(1);
    expect(unknown.out).toContain("render good/music/clean: FAILED, nothing written");
    expect(unknown.out).toContain('error render  (file): the song "fixture.clean" has no orchestration "nope" (known: soft)');
  });

  it("writes nothing for a file that cannot be laid out, and renders one that only fails the lint", () => {
    const bad = project("render-bad", ["bad"]);
    const result = run("render", "--all", "--root", bad);
    expect(result.code).toBe(1);
    expect(result.out).toContain("render bad/music/wrong-step-count: FAILED, nothing written\n  error steps  sections.A.lead[0]: beat 3 has 5 step(s)");
    expect(result.out).toContain("render bad/sfx/unknown-field: FAILED, nothing written");
    expect(existsSync(join(bad, "build/audio/bad/music/wrong-step-count"))).toBe(false);
    expect(existsSync(join(bad, "audio/bad/music/wrong-step-count.render.json"))).toBe(false);
    // The off-key song has a sound and a picture (with the note in red), and still fails.
    expect(result.out).toContain(`render bad/music/off-key -> ${join(bad, "build/audio/bad/music/off-key")}`);
    expect(existsSync(join(bad, "build/audio/bad/music/off-key/piano-roll.png"))).toBe(true);
    const sidecar = JSON.parse(readFileSync(join(bad, "audio/bad/music/off-key.render.json"), "utf8")) as { warnings: string[] };
    expect(sidecar.warnings).toEqual(["error off-key  sections.A.lead[0]: beat 1: F#5 is on the beat but is not in C major and the chord C"]);
  });
});

describe("metrics", () => {
  it("prints the numbers of a song without writing anything", () => {
    const result = run("metrics", "good/music/clean", ...FIXTURE_ARGS);
    expect(result.code).toBe(0);
    expect(result.out.split("\n")).toEqual([
      "metrics good/music/clean  (fixture.clean, loop, steady pass)",
      "  length        4 s",
      "  loudness      -17.4 LUFS integrated (target -18), loudest 400 ms -15.7 LUFS",
      "  true peak     -4.9 dBTP (limit -1), 0 clipped sample(s)",
      "  trim          -0.6 dB",
      "  above 8 kHz   1.9 % of the energy (warning above 10 %)",
      "  loop seam     jump 0.0003, 0 x the steps around it: ok",
      expect.stringMatching(/^ {2}hash {10}[0-9a-f]{16}$/),
      "  bars          2, 100 % of them different",
      "  channel  notes  onsets/step  rests   range   unique bars",
      "  lead     10     0.31         25 %    D5..D6  100 %",
      "  bass     9      0.28         31.3 %  G2..E3  100 %",
      "  drums    14     0.44         56.3 %  -       50 %",
      expect.stringMatching(/^ {2}state calm: -17\.6 LUFS, -5\.7 dBTP, trim -0\.4 dB, hash [0-9a-f]{16}$/),
      expect.stringMatching(/^ {2}state busy: -17\.4 LUFS, -4\.9 dBTP, trim -0\.6 dB, hash [0-9a-f]{16}$/),
      expect.stringMatching(/^ {2}state muffled: -19\.6 LUFS, -8\.5 dBTP, trim \+1\.6 dB, hash [0-9a-f]{16}$/),
    ]);
    expect(existsSync(join(REPO, FIXTURES, "good/music/clean.render.json"))).toBe(false);
  });

  it("prints the sidecar as JSON", () => {
    const result = run("metrics", "good/sfx/blip", "--json", ...FIXTURE_ARGS);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out)).toMatchObject({ format: "wz.audio-render/0.1", id: "fixture.blip", kind: "sfx", frames: 6960, dBTP: -7.2, warnings: [] });
  });

  it("measures the cold start of a loop: the fixture clicks at its loop point", () => {
    const steady = run("metrics", "good/music/seam-click", ...FIXTURE_ARGS);
    expect(steady.code).toBe(0);
    expect(steady.out).toMatch(/^ {2}loop seam {5}jump 0\.00\d\d, 0\.\d x the steps around it: ok$/m);
    expect(steady.out).not.toContain("warning loop-seam");
    const cold = run("metrics", "good/music/seam-click", "--pass", "first", ...FIXTURE_ARGS);
    expect(cold.code).toBe(0);
    expect(cold.out).toContain("metrics good/music/seam-click  (fixture.seam-click, loop, first pass)");
    expect(cold.out).toMatch(/^ {2}loop seam {5}jump 0\.15\d\d, \d\d(\.\d)? x the steps around it: CLICK$/m);
    expect(cold.out).toContain("  warning loop-seam  (file): the loop point clicks");
  });

  it("measures a WAV file, as a loop if told so", () => {
    const root = project("metrics-wav");
    expect(run("render", "good/music/seam-click", "--root", root).code).toBe(0);
    expect(run("render", "good/music/seam-click", "--pass", "first", "--root", root).code).toBe(0);
    const steadyWav = join(root, "build/audio/good/music/seam-click/mix.wav");
    const coldWav = join(root, "build/audio/good/music/seam-click/pass-first/mix.wav");

    const plain = run("metrics", coldWav);
    expect(plain.code).toBe(0);
    expect(plain.out).toContain(`metrics ${coldWav}  (2 channel(s), 48000 Hz)`);
    expect(plain.out).not.toContain("loop seam");
    const cold = run("metrics", coldWav, "--loop");
    expect(cold.out).toContain(`metrics ${coldWav}  (2 channel(s), 48000 Hz, loop)`);
    expect(cold.out).toMatch(/loop seam {5}jump 0\.15\d\d, \d\d(\.\d)? x the steps around it: CLICK/);
    expect(cold.out).toContain("warning loop-seam");
    const steady = run("metrics", steadyWav, "--loop");
    expect(steady.out).toMatch(/loop seam .*: ok/);
    expect(steady.out).not.toContain("warning loop-seam");

    // The hash of a WAV file is the hash in the sidecar of the song it was rendered from.
    const sidecar = JSON.parse(readFileSync(join(root, "audio/good/music/seam-click.render.json"), "utf8")) as { hash: string };
    const json = JSON.parse(run("metrics", steadyWav, "--loop", "--json").out) as Record<string, unknown>;
    expect(json).toMatchObject({ sampleRate: 48000, channels: 2, hash: sidecar.hash, seam: { click: false }, warnings: [] });
  });

  it("fails for a file with errors", () => {
    const result = run("metrics", "bad/music/short-channel", ...FIXTURE_ARGS);
    expect(result.code).toBe(1);
    expect(result.out).toContain("metrics bad/music/short-channel: FAILED\n  error length  sections.A.bass");
  });
});

describe("the entry point", () => {
  it("runs under Node as `npm run audio` starts it", () => {
    const result = spawnSync(process.execPath, [BIN, "check", "--all", "--no-golden", ...FIXTURE_ARGS], { cwd: REPO, encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("check good/music/clean: ok");
    expect(result.stdout).toContain("check: 4 of 7 file(s) FAILED");
    const help = spawnSync(process.execPath, [BIN], { cwd: REPO, encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/^audio <command> \[options\]/);
    const usage = spawnSync(process.execPath, [BIN, "paint"], { cwd: REPO, encoding: "utf8" });
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain("audio: unknown command paint");
  });
});
