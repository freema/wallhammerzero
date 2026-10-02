// README.md, kept honest: its example runs as written, every name it lists is exported from
// the entry it is listed under, and it stays the one page the task asked for.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as core from "../src/index.ts";
import { clipFrame, createCpuBackend, DrawList, findClip, frameIndex, PaletteTable, parseAtlas, sheetFromPng } from "../src/index.ts";
import * as node from "../src/node/index.ts";
import { bakeExample, cpuHashes } from "./helpers.ts";
import type { BakedExample } from "./helpers.ts";

const read = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const readme = read("../README.md");
// The WebGL entry needs the DOM types, so it is not imported here (the tests are typechecked
// for Node); what it exports is read from its source.
const webgl = Object.fromEntries([...read("../src/webgl/index.ts").matchAll(/^export \{ (\w+) \}/gm)].map((match) => [match[1] as string, true]));

let example: BakedExample;
beforeAll(async () => {
  example = await bakeExample();
});
afterAll(() => example.remove());

describe("README.md", () => {
  it("is at most one page", () => {
    expect(readme.split("\n").length).toBeLessThanOrEqual(80);
  });

  it("imports only names the package exports", () => {
    const imported = /import \{ ([^}]+) \} from "@whz\/runtime";/.exec(readme)?.[1]?.split(", ") ?? [];
    expect(imported.length).toBeGreaterThan(5);
    for (const name of imported) expect(core, name).toHaveProperty(name);
  });

  it("lists, per entry, only names that entry exports", () => {
    const entries: Record<string, object> = { "@whz/runtime": core, "@whz/runtime/webgl": webgl, "@whz/runtime/node": node };
    for (const [entry, exports] of Object.entries(entries)) {
      const row = readme.split("\n").find((line) => line.startsWith(`| \`${entry}\` |`));
      if (row === undefined) throw new Error(`the README has no table row for ${entry}`);
      // Backticked words that look like identifiers; `name(args)` counts as `name`.
      const names = [...(row.split("|")[2] ?? "").matchAll(/`([A-Za-z]\w*)(?:\([^`]*\))?`/g)].map((match) => match[1] as string);
      expect(names.length, entry).toBeGreaterThan(0);
      for (const name of names) {
        // Methods of a backend are not exports of the module.
        if (["release", "createTarget", "draw", "readPixels"].includes(name)) continue;
        if (entry === "@whz/runtime/webgl" && name !== "createWebGLBackend") continue;
        expect(exports, `${entry}: ${name}`).toHaveProperty(name);
      }
    }
  });

  it("its example draws the example asset's first frame", () => {
    const atlasJson: unknown = JSON.parse(readFileSync(`${example.dir}/atlas.json`, "utf8"));
    const pngBytes = readFileSync(`${example.dir}/seed-1.png`);
    const timeMs = 250;

    // The code of the README, as written there.
    const atlas = parseAtlas(atlasJson);
    const sheet = sheetFromPng(atlas, pngBytes);
    const palette = new PaletteTable([atlas.palette.colors]);
    const clip = findClip(atlas, "blink");
    const list = new DrawList().sprite({
      sheet,
      frame: frameIndex(atlas, clip.name, clipFrame(clip, timeMs)),
      x: 6,
      y: 6,
      mirror: false,
      paletteRow: 0,
      depth: 0,
    });
    const backend = createCpuBackend();
    const target = backend.createTarget(12, 12);
    backend.draw(target, list, { palette });
    const rgba = backend.readPixels(target);

    expect(core.pixelHash(12, 12, rgba)).toBe(cpuHashes(example)["frame seed-1 blink.default.0"]);
    for (const line of ["const atlas = parseAtlas(atlasJson);", "const sheet = sheetFromPng(atlas, pngBytes);", "backend.draw(target, list, { palette });"]) {
      expect(readme).toContain(line);
    }
  });

  it("the backends have the methods the README names", () => {
    const backend = createCpuBackend();
    for (const method of ["createTarget", "draw", "readPixels", "release", "dispose"] as const) expect(typeof backend[method]).toBe("function");
    expect(read("../src/webgl/backend.ts")).toMatch(/^export function createWebGLBackend\(gl: WebGL2RenderingContext\): WebGLBackend \{$/m);
    for (const method of ["present(target: Target, rect: Rect, options?: PresentOptions): Placement;", "reset(): void;"]) {
      expect(read("../src/webgl/backend.ts")).toContain(method);
    }
  });
});
