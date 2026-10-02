import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderAll, renderHash } from "../src/index.ts";
import { loadAsset, loadPaletteFile, readStampFiles } from "../src/node/index.ts";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const FACE = here("./fixtures/stamped-face/gen.ts");
const PALETTES = here("../../../assets/palettes/");
const SRC = here("../src/");

describe("loadPaletteFile", () => {
  it("every palette in assets/palettes is valid, and its id is its file name", () => {
    const files = readdirSync(PALETTES).filter((name) => name.endsWith(".json"));
    expect(files).toContain("example.json");
    for (const name of files) {
      const palette = loadPaletteFile(join(PALETTES, name));
      expect(`${palette.id}.json`).toBe(name);
      expect(palette.slots[0]?.name).toBe("transparent");
    }
  });

  it("the example palette has its reserved slots and hand-built ramps", () => {
    const palette = loadPaletteFile(new URL("../../../assets/palettes/example.json", import.meta.url));
    expect(palette.size).toBe(17);
    expect([palette.ink, palette.shadow]).toEqual([1, 3]);
    expect(palette.rampNames).toEqual(["red", "gold", "teal", "grey"]);
    expect(palette.ramp("gold")).toEqual([8, 9, 10]);
  });

  it("names the file when it cannot be read or parsed", () => {
    expect(() => loadPaletteFile(join(PALETTES, "missing.json"))).toThrow(/palette file .*missing.json: ENOENT/);
    expect(() => loadPaletteFile(FACE)).toThrow(/palette file .*gen.ts: /);
  });
});

describe("loadAsset with stamp files (stamps/*.txt next to the generator)", () => {
  it("reads the stamp files and gives the asset their text", async () => {
    const asset = await loadAsset(FACE);
    expect(asset.meta.id).toBe("fixtures/stamped-face");
    expect(asset.stampFiles).toEqual(["face", "hat"]);
    expect(asset.stampsBound).toBe(true);
    expect(readStampFiles(FACE, ["hat"])).toEqual({ hat: readFileSync(here("./fixtures/stamped-face/stamps/hat.txt"), "utf8") });

    // 1 ink, 9 skin shade, a skin, 4 white.
    const idle = asset.render({ seed: 7, clip: "idle", frame: 0, facing: "down" });
    expect(idle.toText().split("\n")).toEqual([
      "..........",
      "..........",
      "...1111...",
      "..1aaaa1..",
      ".1aaaaaa1.",
      "1aa4aa4aa1",
      "1aa1aa1aa1",
      "1aaaaaaaa1",
      "1a9aaaa9a1",
      ".19a11991.",
      "..199991..",
      "...1111...",
    ]);
  });

  it("renders the clips, facings and params of the fixture: patched rows, shifted rows, a padded hat", async () => {
    const asset = await loadAsset(FACE);
    const text = (request: Parameters<typeof asset.render>[0]): string[] => asset.render(request).toText().split("\n");

    // blink: the eye rows are patched.
    expect(text({ seed: 7, clip: "blink", frame: 0 }).slice(5, 7)).toEqual(["1aaaaaaaa1", "1a11aa11a1"]);
    // idle frame 1: the face is shifted down one row inside its 8 rows, so its last row is gone.
    expect(text({ seed: 7, clip: "idle", frame: 1 }).slice(3, 6)).toEqual(["...1111...", "..1aaaa1..", ".1aaaaaa1."]);
    // side: the face is mirrored (the mouth is off-centre, so it shows).
    expect(text({ seed: 7, clip: "idle", frame: 0, facing: "side" })[9]).toBe(".19911a91.");
    // The preset puts on the hat (rows padded by padRows) and the sad mouth.
    const sadHat = text({ seed: 7, clip: "idle", frame: 0, preset: "sad-hat" });
    expect(sadHat.slice(0, 4)).toEqual(["...1111...", "..166661..", ".16666661.", "1555555551"]);
    expect(sadHat[9]).toBe(".191aa191.");
    // lift moves everything up by one pixel.
    expect(text({ seed: 7, clip: "idle", frame: 0, params: { lift: 1 } })[1]).toBe("...1111...");
  });

  it("its output is stable", async () => {
    const asset = await loadAsset(FACE);
    const first = renderAll(asset, { seed: 7 });
    expect(first.frames.length).toBe(6);
    expect(renderHash(asset, { seed: 7 })).toBe(renderHash(await loadAsset(FACE), { seed: 7 }));
  });

  it("names the file when a stamp file is missing or the module is not an asset", async () => {
    expect(() => readStampFiles(FACE, ["eyes"])).toThrow(/stamp file .*stamps[\\/]eyes.txt: ENOENT/);
    await expect(loadAsset(here("./node.test.ts"))).rejects.toThrow(/the default export must be defineAsset/);
  });
});

describe("the kit runs unchanged in Node and in the browser", () => {
  const sources = (folder: string): string[] =>
    readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? (entry.name === "node" ? [] : sources(join(folder, entry.name))) : [join(folder, entry.name)],
    );

  it("nothing outside src/node imports a Node module or uses a Node or DOM global", () => {
    const files = [...sources(SRC), ...sources(here("../../det/src/"))];
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      const code = readFileSync(file, "utf8");
      const imports = [...code.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1] as string);
      for (const specifier of imports) {
        const allowed = specifier.startsWith("./") || specifier.startsWith("../") || specifier === "@whz/det";
        expect(allowed, `${file} imports ${specifier}`).toBe(true);
      }
      expect(code, file).not.toMatch(/\b(process|Buffer|require|__dirname|document|window|navigator)\b\s*[.([]/);
    }
  });
});
