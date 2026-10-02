// The pack step and the package: byte-identical output, what each hash covers, the sim on
// the packed example against its golden digests, and what openPackage refuses.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fnv1a64Hex } from "@whz/det";
import { decodePng } from "@whz/asset-kit/node";
import { canonicalJson, checkReplay, createSim, hashSimData } from "@whz/sim";
import type { SimData } from "@whz/sim";
import { readReplayFile } from "@whz/sim/node";
import { describe, expect, it } from "vitest";
import {
  buildPackage,
  canonicalBytes,
  contentHash,
  manifestHash,
  openPackage,
  PACKAGE_FORMAT,
  toCanonicalJson,
  utf8Bytes,
  utf8Text,
  validateGame,
} from "../src/index.ts";
import type { PackageManifest } from "../src/index.ts";
import { findGame, packageDir, packGame, readPackageDir } from "../src/node/index.ts";
import type { GameProject, PackResult } from "../src/node/index.ts";
import { CATALOG, exampleCopy, GOLDEN_DATA, GOLDEN_REPLAY, mini, replaceInFile, scratch, TEST_SLOTS } from "./helpers.ts";

type Packed = Extract<PackResult, { ok: true }>;

async function pack(project: GameProject): Promise<Packed> {
  const result = await packGame(project, findGame(project, "counter-shop"));
  if (!result.ok) throw new Error(`pack failed: ${result.problems.map((problem) => problem.message).join("; ")}`);
  return result;
}

const sameBytes = (a: ReadonlyMap<string, Uint8Array>, b: ReadonlyMap<string, Uint8Array>): boolean =>
  a.size === b.size && [...a].every(([path, bytes]) => Buffer.from(bytes).equals(Buffer.from(b.get(path) ?? new Uint8Array(0))) && b.has(path));

describe("pack on the example game", () => {
  const first = scratch("pack-a");
  const second = scratch("pack-b");

  it("writes the package: manifest, sim data, locales and the palette, all canonical", async () => {
    const result = await pack(exampleCopy(first));
    expect(result.files.map((file) => file.path)).toEqual(["game.json", "locales/cs.json", "locales/en.json", "palettes/example.json", "sim.json"]);
    const files = readPackageDir(result.dir);
    expect([...files.keys()].sort()).toEqual(result.files.map((file) => file.path));
    for (const [path, bytes] of files) {
      const text = utf8Text(bytes);
      expect([path, toCanonicalJson(JSON.parse(text))]).toEqual([path, text]);
    }
    const manifest = JSON.parse(utf8Text(files.get("game.json") as Uint8Array)) as PackageManifest;
    expect(manifest).toEqual(result.manifest);
    expect(manifest.format).toBe(PACKAGE_FORMAT);
    expect(manifest.id).toBe("counter-shop");
    expect(manifest.locales).toEqual(["cs", "en"]);
    expect(manifest.assetManifest.files.map((file) => `${file.kind} ${file.path}`)).toEqual([
      "locale locales/cs.json",
      "locale locales/en.json",
      "palette palettes/example.json",
    ]);
    for (const file of manifest.assetManifest.files) {
      const bytes = files.get(file.path) as Uint8Array;
      expect([file.path, file.bytes, file.hash]).toEqual([file.path, bytes.length, contentHash(bytes)]);
    }
    expect(utf8Text(files.get("locales/cs.json") as Uint8Array)).toContain('"items.bread.name":"Chléb"');
  });

  it("gives byte-identical output when it runs twice", async () => {
    const project = exampleCopy(first);
    const once = readPackageDir((await pack(project)).dir);
    const again = readPackageDir((await pack(project)).dir);
    const elsewhere = readPackageDir((await pack(exampleCopy(second))).dir);
    expect(once.size).toBe(5);
    expect(sameBytes(once, again)).toBe(true);
    expect(sameBytes(once, elsewhere)).toBe(true);
  });

  it("leaves nothing of an older package behind", async () => {
    const project = exampleCopy(first);
    const dir = packageDir(project, "counter-shop");
    mkdirSync(join(dir, "locales"), { recursive: true });
    writeFileSync(join(dir, "locales/de.json"), "{}");
    await pack(project);
    expect([...readPackageDir(dir).keys()]).not.toContain("locales/de.json");
  });

  it("changing a locale string changes the assetManifest and not the simDataHash", async () => {
    const before = (await pack(exampleCopy(first))).manifest;
    const after = (await pack(exampleCopy(second, (game) => replaceInFile(join(game, "locales/cs.json"), "Chléb", "Chleba")))).manifest;
    expect(after.simDataHash).toBe(before.simDataHash);
    expect(after.assetManifest.hash).not.toBe(before.assetManifest.hash);
    const changed = after.assetManifest.files.filter((file, index) => file.hash !== before.assetManifest.files[index]?.hash);
    expect(changed.map((file) => file.path)).toEqual(["locales/cs.json"]);
  });

  it("changing a price changes the simDataHash and not the assetManifest", async () => {
    const before = (await pack(exampleCopy(first))).manifest;
    const after = (await pack(exampleCopy(second, (game) => replaceInFile(join(game, "data/items.json"), '"price": 6', '"price": 7')))).manifest;
    expect(after.simDataHash).not.toBe(before.simDataHash);
    expect(after.assetManifest).toEqual(before.assetManifest);
  });

  it("changing the title or the resolution changes neither hash", async () => {
    const before = (await pack(exampleCopy(first))).manifest;
    const after = (await pack(exampleCopy(second, (game) => replaceInFile(join(game, "game.json"), '"Counter Shop"', '"Counter Shop II"')))).manifest;
    expect(after.title).toBe("Counter Shop II");
    expect(after.simDataHash).toBe(before.simDataHash);
    expect(after.assetManifest).toEqual(before.assetManifest);
  });

  it("writes nothing for a game with a problem, and leaves the older package alone", async () => {
    const good = exampleCopy(first);
    const kept = readPackageDir((await pack(good)).dir);
    const bad = exampleCopy(first, (game) => replaceInFile(join(game, "data/items.json"), '"price": 6', '"price": 6.5'));
    const result = await packGame(bad, findGame(bad, "counter-shop"));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.map((problem) => `${problem.path} [${problem.rule}]`)).toEqual(["$[1].price [schema]"]);
    expect(sameBytes(readPackageDir(packageDir(bad, "counter-shop")), kept)).toBe(true);
  });
});

describe("the sim on the packed example", () => {
  const dir = scratch("pack-sim");

  it("has the simDataHash of the golden replay, which is the hash of the bytes of sim.json", async () => {
    const result = await pack(exampleCopy(dir));
    const replay = readReplayFile(GOLDEN_REPLAY);
    expect(result.manifest.simDataHash).toBe(replay.simDataHash);
    const bytes = readPackageDir(result.dir).get("sim.json") as Uint8Array;
    expect(fnv1a64Hex(bytes)).toBe(replay.simDataHash);
    const simData = JSON.parse(utf8Text(bytes)) as SimData;
    expect(utf8Text(bytes)).toBe(canonicalJson(simData));
    expect(hashSimData(simData)).toBe(replay.simDataHash);
  });

  it("matches the golden digests, in normal and in heavy mode", async () => {
    const result = await pack(exampleCopy(dir));
    const { opened, problems } = openPackage(readPackageDir(result.dir));
    expect(problems).toEqual([]);
    const replay = readReplayFile(GOLDEN_REPLAY);
    for (const heavy of [false, true]) {
      const check = checkReplay({ data: (opened as { simData: SimData }).simData, replay, heavy });
      expect([heavy, check.mismatch]).toEqual([heavy, null]);
      expect(check.finalDigest).toBe(replay.finalDigest);
      expect(check.digests).toEqual(replay.digests);
    }
    const sim = createSim({ data: (opened as { simData: SimData }).simData, seed: replay.seed });
    expect(sim.simDataHash).toBe(result.manifest.simDataHash);
  });

  it("holds the tables of the sim's own golden data file", async () => {
    const result = await pack(exampleCopy(dir));
    const packed = JSON.parse(utf8Text(readPackageDir(result.dir).get("sim.json") as Uint8Array)) as SimData;
    expect(packed).toEqual(JSON.parse(readFileSync(GOLDEN_DATA, "utf8")));
  });
});

describe("assets in the package", () => {
  const dir = scratch("pack-assets");
  const VIEW = { bindings: [{ kind: "student", sprite: "examples/blinking-dot", clip: "blink" }] };
  const options = { presentation: TEST_SLOTS };

  it("packs the baked atlas and sheets of every asset the game refers to", async () => {
    const project = exampleCopy(dir, (game) => writeFileSync(join(game, "view.json"), JSON.stringify(VIEW)));
    const entry = findGame(project, "counter-shop");
    const result = await packGame(project, entry, options);
    expect(result.ok).toBe(true);
    const { manifest } = result as Packed;
    const files = readPackageDir((result as Packed).dir);
    const assets = manifest.assetManifest.files.filter((file) => file.path.startsWith("assets/"));
    expect(assets.map((file) => `${file.kind} ${file.path}`)).toEqual([
      "atlas assets/examples/blinking-dot/atlas.json",
      "atlas assets/examples/blinking-dot/seed-1.png",
      "atlas assets/examples/blinking-dot/seed-2.png",
      "atlas assets/examples/blinking-dot/seed-5.png",
    ]);
    expect(manifest.assetManifest.files.find((file) => file.path === "view.json")?.kind).toBe("presentation");
    expect(utf8Text(files.get("view.json") as Uint8Array)).toBe(toCanonicalJson(VIEW));

    const atlasText = utf8Text(files.get("assets/examples/blinking-dot/atlas.json") as Uint8Array);
    const atlas = JSON.parse(atlasText) as { id: string; format: string; sheet: { w: number; h: number }; clips: { name: string }[] };
    expect(toCanonicalJson(atlas)).toBe(atlasText);
    expect([atlas.format, atlas.id, atlas.clips.map((clip) => clip.name)]).toEqual(["wz.atlas/1", "examples/blinking-dot", ["blink"]]);
    const sheet = decodePng(files.get("assets/examples/blinking-dot/seed-1.png") as Uint8Array);
    expect([sheet.type, sheet.w, sheet.h]).toEqual(["indexed", atlas.sheet.w, atlas.sheet.h]);

    // Presentation and art are not sim data.
    const plain = await pack(exampleCopy(scratch("pack-plain")));
    expect(manifest.simDataHash).toBe(plain.manifest.simDataHash);
    expect(manifest.assetManifest.hash).not.toBe(plain.manifest.assetManifest.hash);

    const again = await packGame(project, entry, options);
    expect(sameBytes(readPackageDir((again as Packed).dir), files)).toBe(true);
  });

  it("does not pack a game that refers to a clip the asset does not have", async () => {
    const view = { bindings: [{ kind: "student", sprite: "examples/blinking-dot", clip: "walk" }] };
    const project = exampleCopy(dir, (game) => writeFileSync(join(game, "view.json"), JSON.stringify(view)));
    const result = await packGame(project, findGame(project, "counter-shop"), options);
    expect(!result.ok && result.problems.map((problem) => `${problem.path}: ${problem.message}`)).toEqual([
      '$.bindings[0].clip: the asset "examples/blinking-dot" has no clip "walk" (clips: blink)',
    ]);
  });
});

describe("buildPackage", () => {
  const game = validateGame(mini({ "view.json": '{ "title": "customerKinds.student.name" }' }, { presentation: TEST_SLOTS }), CATALOG).game;
  if (game === null) throw new Error("the mini game must validate");

  it("lists every file but game.json and sim.json in the asset manifest, in path order", () => {
    const built = buildPackage(game, [
      { path: "palettes/example.json", kind: "palette", bytes: canonicalBytes({ id: "example" }) },
      { path: "audio/coin.sfx.json", kind: "audio", bytes: canonicalBytes({}) },
    ]);
    expect([...built.files.keys()]).toEqual(["audio/coin.sfx.json", "game.json", "locales/cs.json", "locales/en.json", "palettes/example.json", "sim.json", "view.json"]);
    expect(built.manifest.assetManifest.files.map((file) => file.path)).toEqual([
      "audio/coin.sfx.json",
      "locales/cs.json",
      "locales/en.json",
      "palettes/example.json",
      "view.json",
    ]);
    expect(built.manifest.assetManifest.hash).toBe(manifestHash(built.manifest.assetManifest.files));
    expect(built.manifest.simDataHash).toBe(game.simDataHash);
    expect(utf8Text(built.files.get("game.json") as Uint8Array)).toBe(toCanonicalJson(built.manifest));
  });

  it.each([
    ["game.json", /game\.json is written by the pack step itself/],
    ["sim.json", /sim\.json is written by the pack step itself/],
    ["locales/en.json", /two files want the path locales\/en\.json/],
    ["../evil.json", /is not a path inside a package/],
    ["/abs.json", /is not a path inside a package/],
    ["a/./b.json", /is not a path inside a package/],
    ["a b.json", /is not a path inside a package/],
  ])("refuses the external path %s", (path, message) => {
    expect(() => buildPackage(game, [{ path, kind: "audio", bytes: new Uint8Array(0) }])).toThrow(message);
  });
});

describe("openPackage", () => {
  const built = buildPackage(game(), [{ path: "palettes/example.json", kind: "palette", bytes: canonicalBytes({ id: "example" }) }]);

  function game(): NonNullable<ReturnType<typeof validateGame>["game"]> {
    const loaded = validateGame(mini(), CATALOG).game;
    if (loaded === null) throw new Error("the mini game must validate");
    return loaded;
  }

  /** The problems of the package after a change to its files. */
  function problemsAfter(change: (files: Map<string, Uint8Array>) => void): readonly string[] {
    const files = new Map(built.files);
    change(files);
    const result = openPackage(files);
    expect(result.opened === null).toBe(result.problems.length > 0);
    return result.problems;
  }

  /** Replaces game.json by a manifest with a change. */
  const withManifest = (edit: (manifest: Record<string, unknown>) => void) => (files: Map<string, Uint8Array>): void => {
    const manifest = JSON.parse(utf8Text(files.get("game.json") as Uint8Array)) as Record<string, unknown>;
    edit(manifest);
    files.set("game.json", canonicalBytes(manifest));
  };

  it("opens what buildPackage built", () => {
    const { opened, problems } = openPackage(built.files);
    expect(problems).toEqual([]);
    expect(opened?.manifest).toEqual(built.manifest);
    expect(opened?.simData).toEqual(game().simData);
    expect(createSim({ data: opened?.simData as SimData, seed: 1 }).simDataHash).toBe(built.manifest.simDataHash);
  });

  it("notices a changed, a missing and an extra file", () => {
    expect(problemsAfter((files) => files.set("locales/cs.json", canonicalBytes({ "customerKinds.student.name": "X", "customerKinds.tourist.name": "Y" })))[0]).toMatch(
      /^locales\/cs\.json is not the file the asset manifest lists/,
    );
    expect(problemsAfter((files) => files.delete("palettes/example.json"))).toEqual(["palettes/example.json is in the asset manifest and not in the package"]);
    expect(problemsAfter((files) => files.set("locales/de.json", canonicalBytes({})))).toEqual(["locales/de.json is in the package and not in the asset manifest"]);
  });

  it("notices sim data that is not the sim data of the manifest", () => {
    const other = { systems: ["shop.arrivals"], tables: { ...game().simData.tables, arrivals: { perMille: 1, queueLimit: 6 } } };
    expect(problemsAfter((files) => files.set("sim.json", canonicalBytes(other)))[0]).toMatch(/^sim\.json hashes to [0-9a-f]{16}, and the manifest says simDataHash [0-9a-f]{16}$/);
    expect(problemsAfter((files) => files.delete("sim.json"))).toEqual(["sim.json is missing"]);
  });

  it("notices a file that is not canonical JSON, not JSON or not UTF-8", () => {
    const pretty = utf8Bytes(JSON.stringify(JSON.parse(utf8Text(built.files.get("sim.json") as Uint8Array)), null, 2));
    expect(problemsAfter((files) => files.set("sim.json", pretty))).toEqual(["sim.json is not canonical JSON: a package is written by the pack step, never by hand"]);
    expect(problemsAfter((files) => files.set("game.json", utf8Bytes("{")))[0]).toMatch(/^game\.json cannot be read: /);
    expect(problemsAfter((files) => files.set("game.json", new Uint8Array([0xff])))[0]).toMatch(/^game\.json cannot be read: byte 0 is not valid UTF-8/);
    expect(problemsAfter((files) => files.delete("game.json"))).toEqual(["game.json is missing"]);
  });

  it("notices a manifest of another format or shape", () => {
    expect(problemsAfter(withManifest((manifest) => (manifest["format"] = "wz.game-package/2")))).toEqual([
      'game.json: the format is "wz.game-package/2", and this game-data reads "wz.game-package/1"',
    ]);
    expect(problemsAfter(withManifest((manifest) => delete manifest["simDataHash"]))).toEqual(['game.json: $: the field "simDataHash" is missing']);
    expect(problemsAfter(withManifest((manifest) => (manifest["surprise"] = 1)))[0]).toMatch(/unknown field "surprise"/);
  });

  it("notices an asset manifest that was edited", () => {
    expect(
      problemsAfter(
        withManifest((manifest) => {
          const assets = manifest["assetManifest"] as { files: { bytes: number }[] };
          (assets.files[0] as { bytes: number }).bytes += 1;
        }),
      ),
    ).toEqual([
      "assetManifest.hash is not the hash of its file list",
      expect.stringMatching(/^locales\/cs\.json is not the file the asset manifest lists/),
    ]);
    expect(problemsAfter(withManifest((manifest) => (manifest["locales"] = ["cs", "de", "en"])))).toEqual([
      'the manifest lists the locale "de", and locales/de.json is not in the asset manifest',
    ]);
  });
});
