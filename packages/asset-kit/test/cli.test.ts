// The `asset` command line: what it prints, what it writes and its exit codes. Most tests run
// `runCli` in-process; the last ones start the real entry point.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { runCli } from "../src/node/index.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURES = "packages/asset-kit/test/lint-fixtures";
const BIN = fileURLToPath(new URL("../src/node/bin.ts", import.meta.url));

const temp = mkdtempSync(join(tmpdir(), "whz-cli-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

/** Runs the CLI from the repo root and collects what it prints. */
async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { out: (line) => out.push(line), err: (line) => err.push(line), cwd: REPO });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const DEFECTS = [
  "area-pop",
  "bad-timing",
  "clipped-prop",
  "dark-scene",
  "detached-group",
  "loop-seam",
  "off-palette",
  "orphan-pixel",
  "outline-gap",
  "pivot-jump",
  "too-many-colors",
  "wrong-frame-size",
  "wrong-slot",
];

describe("usage", () => {
  it("prints the help with exit code 0", async () => {
    for (const argv of [[], ["help"], ["--help"], ["bake", "-h"]]) {
      const result = await run(...argv);
      expect(result.code).toBe(0);
      expect(result.out).toMatch(/^asset <command> \[options\]/);
      expect(result.out).toContain("Exit codes: 0 fine, 1 an asset failed");
    }
  });

  it.each([
    [["paint"], 'asset: unknown command "paint"'],
    [["bake"], "asset: bake needs asset ids or --all (not both)"],
    [["bake", "examples/blinking-dot", "--all"], "asset: bake needs asset ids or --all (not both)"],
    [["lint"], "asset: lint needs asset ids or --all (not both)"],
    [["lint", "--all", "--fast"], "asset: unknown option --fast"],
    [["review"], "asset: review takes one asset id, or --pack <pack>"],
    [["review", "a/b", "c/d"], "asset: review takes one asset id, or --pack <pack>"],
    [["review", "a/b", "--pack", "a"], "asset: review takes one asset id or --pack <pack>, not both"],
    [["review", "examples/blinking-dot", "--zoom", "0"], "asset: --zoom must be an integer in [1, 64], got 0"],
    [["review", "examples/blinking-dot", "--seed", "1.5"], "asset: --seed must be an integer in [0, 4294967295], got 1.5"],
    [["review", "examples/blinking-dot", "--seed"], "asset: --seed needs a value"],
    [["list", "--out"], "asset: --out needs a value"],
  ])("wrong usage %j is exit code 2, with the reason and the help on stderr", async (argv, reason) => {
    const result = await run(...argv);
    expect(result.code).toBe(2);
    expect(result.err.split("\n")[0]).toBe(reason);
    expect(result.err).toContain("asset <command> [options]");
    expect(result.out).toBe("");
  });

  it("an asset that does not exist is exit code 1, and the message lists the assets there are", async () => {
    const result = await run("bake", "examples/missing");
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/^asset: no asset "examples\/missing" under .*assets \(assets: .*examples\/blinking-dot/);
  });
});

describe("list", () => {
  it("prints one line per asset", async () => {
    const result = await run("list");
    expect(result.code).toBe(0);
    expect(result.out).toContain("examples/blinking-dot  sprite 12x12  clips blink(2)  facings default  variants 1,2,5  presets small,big");
    expect(result.out).toMatch(/\n\d+ asset\(s\)$/);
  });

  it("--json prints the same as data", async () => {
    const result = await run("list", "--json", "--assets", FIXTURES);
    expect(result.code).toBe(0);
    const rows = JSON.parse(result.out) as { id: string; kind: string }[];
    expect(rows.length).toBe(15);
    expect(rows[1]).toEqual({ id: "clean/walker", kind: "sprite", size: [20, 22], clips: [{ name: "walk", frames: 4 }], facings: ["default"], variants: [1], presets: [] });
  });
});

describe("bake", () => {
  it("bake --all writes the outputs and prints the output hashes", async () => {
    const out = join(temp, "bake");
    const result = await run("bake", "--all", "--out", out);
    expect(result.code).toBe(0);
    expect(result.out).toContain("bake examples/blinking-dot: 3 variant(s) x 2 frame(s), sheet 27x14");
    expect(result.out).toContain("  seed 1  seed-1.png  output hash ff98ad430bb70a8f");
    expect(result.out).toMatch(/\n\d+ asset\(s\) baked$/);
    expect(readdirSync(join(out, "assets", "examples", "blinking-dot")).sort()).toEqual(["atlas.json", "frames", "seed-1.png", "seed-2.png", "seed-5.png"]);
  });

  it("baking twice gives identical files", async () => {
    const first = join(temp, "twice-1");
    const second = join(temp, "twice-2");
    expect((await run("bake", "examples/blinking-dot", "--out", first)).code).toBe(0);
    expect((await run("bake", "examples/blinking-dot", "--out", second)).code).toBe(0);
    expect((await run("bake", "examples/blinking-dot", "--out", second)).code).toBe(0);
    for (const file of ["atlas.json", "seed-1.png", "seed-2.png", "seed-5.png", "frames/seed-5/blink.default.1.png"]) {
      const a = readFileSync(join(first, "assets", "examples", "blinking-dot", file));
      const b = readFileSync(join(second, "assets", "examples", "blinking-dot", file));
      expect(a.equals(b), file).toBe(true);
    }
  });

  it("an asset that cannot be rendered is exit code 1, and the others are still baked", async () => {
    const out = join(temp, "bake-fixtures");
    const result = await run("bake", "--all", "--assets", FIXTURES, "--out", out);
    expect(result.code).toBe(1);
    expect(result.out).toContain('bake defects/wrong-frame-size: FAILED: asset "defects/wrong-frame-size": clip "walk", facing "default", frame 3: render returned 19 x 22, but "size" is 20 x 22');
    expect(result.out).toMatch(/\n13 asset\(s\) baked, 2 FAILED$/);
    expect(existsSync(join(out, "assets", "clean", "walker", "atlas.json"))).toBe(true);
    expect(readdirSync(join(out, "assets", "defects", "off-palette"))).toEqual(["error.json"]);
  });
});

describe("lint", () => {
  it("is exit code 0 on the example asset and on everything under assets/", async () => {
    const one = await run("lint", "examples/blinking-dot", "--no-write");
    expect(one.code).toBe(0);
    expect(one.out).toBe("lint examples/blinking-dot: ok  (10 renders, 20 frames)\n1 of 1 asset(s) pass the lints");
    const all = await run("lint", "--all", "--no-write");
    expect(all.code).toBe(0);
    expect(all.out).not.toMatch(/error/);
  });

  it.each(DEFECTS)("is exit code 1 on the fixture defects/%s", async (name) => {
    const result = await run("lint", `defects/${name}`, "--assets", FIXTURES, "--no-write");
    expect(result.code).toBe(1);
    expect(result.out).toMatch(new RegExp(`^lint defects/${name}: \\d+ error\\(s\\)  \\(\\d+ renders, \\d+ frames\\)\\n  error `));
    expect(result.out).toMatch(/\n0 of 1 asset\(s\) pass the lints$/);
  });

  it("is exit code 0 on the clean fixtures", async () => {
    const result = await run("lint", "clean/walker", "clean/scene", "--assets", FIXTURES, "--no-write");
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/\n2 of 2 asset\(s\) pass the lints$/);
  });

  it("--all over the fixtures: one finding per line with the seeds grouped, lint.json per asset, exit code 1", async () => {
    const out = join(temp, "lint-fixtures");
    const result = await run("lint", "--all", "--assets", FIXTURES, "--out", out);
    expect(result.code).toBe(1);
    expect(result.out).toContain("  error orphan-pixels  seed 1, 2 walk/default frame 0: 1 orphan pixel(s), 0 allowed: the first is (9, 13) in gold.2, with no pixel of its colour around it");
    expect(result.out).toContain("  error timing  walk frame 1: frame 1 is shown for 5 ms: shorter than 16 ms cannot be seen");
    expect(result.out).toMatch(/\n2 of 15 asset\(s\) pass the lints$/);
    for (const name of DEFECTS) expect(existsSync(join(out, "review", "defects", name, "lint.json")), name).toBe(true);
    expect(existsSync(join(out, "assets"))).toBe(false);
  });

  it("--no-write writes nothing", async () => {
    const out = join(temp, "lint-dry");
    expect((await run("lint", "--all", "--assets", FIXTURES, "--out", out, "--no-write")).code).toBe(1);
    expect(existsSync(out)).toBe(false);
  });
});

describe("review", () => {
  it("writes the review set of one asset and prints every image with its size and zoom", async () => {
    const out = join(temp, "review");
    const result = await run("review", "examples/blinking-dot", "--out", out);
    expect(result.code).toBe(0);
    const dir = join(out, "review", "examples", "blinking-dot");
    expect(readdirSync(dir).sort()).toEqual(["contact.png", "context.png", "lint.json", "seeds.png", "silhouette.png", "strip-blink.png"]);
    expect(result.out).toMatch(/contact\.png {2}\d+x\d+ {2}zoom 8x {2}every frame of seed 1, numbered as in atlas\.json/);
    expect(result.out).toMatch(/context\.png {2}\d+x\d+ {2}zoom 3x/);
    expect(result.out).toContain("lint examples/blinking-dot: ok  (10 renders, 20 frames)");
    // A trailing slash (shell completion of the folder) names the same asset.
    expect((await run("review", "examples/blinking-dot/", "--out", out, "--zoom", "4", "--seed", "2", "--preset", "big")).code).toBe(0);
  });

  it("is exit code 1 when the asset has a lint error, and still writes the images", async () => {
    const out = join(temp, "review-defect");
    const result = await run("review", "defects/orphan-pixel", "--assets", FIXTURES, "--out", out);
    expect(result.code).toBe(1);
    expect(existsSync(join(out, "review", "defects", "orphan-pixel", "contact.png"))).toBe(true);
    expect(result.out).toContain("lint defects/orphan-pixel: 2 error(s)");
  });

  it("--pack writes one group sheet, and reports the assets it could not draw", async () => {
    const out = join(temp, "review-pack");
    const clean = await run("review", "--pack", "clean", "--assets", FIXTURES, "--out", out);
    expect(clean.code).toBe(0);
    expect(readdirSync(join(out, "review", "clean"))).toEqual(["pack.png"]);
    const defects = await run("review", "--pack", "defects/", "--assets", FIXTURES, "--out", out);
    expect(defects.code).toBe(1);
    expect(defects.out).toContain("  ERROR defects/off-palette: ");
    // 13 rows of walkers at 8x do not fit one image: the sheet has two pages.
    expect(readdirSync(join(out, "review", "defects")).sort()).toEqual(["pack-1.png", "pack-2.png"]);
    const none = await run("review", "--pack", "nothing", "--assets", FIXTURES, "--out", out);
    expect(none.code).toBe(1);
    expect(none.out).toContain('review nothing: FAILED: no assets in the pack "nothing"');
  });
});

describe("the entry point (node packages/asset-kit/src/node/bin.ts)", () => {
  const start = (...argv: string[]) => spawnSync(process.execPath, [BIN, ...argv], { cwd: REPO, encoding: "utf8" });

  it("passes the exit code and the lines on", () => {
    const ok = start("lint", "examples/blinking-dot", "--no-write");
    expect([ok.status, ok.stderr]).toEqual([0, ""]);
    expect(ok.stdout).toBe("lint examples/blinking-dot: ok  (10 renders, 20 frames)\n1 of 1 asset(s) pass the lints\n");

    const failed = start("lint", "defects/pivot-jump", "--assets", FIXTURES, "--no-write");
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain("error baseline-drift  seed 1, 2 walk/default frame 0");

    const usage = start("bake");
    expect(usage.status).toBe(2);
    expect(usage.stderr).toMatch(/^asset: bake needs asset ids or --all/);
  });
});
