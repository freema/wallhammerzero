// The lints: every defect fixture fails with its own rule and nothing else, the clean
// fixtures and the example asset pass, and the numbers in the stats tables are right.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import blinkingDot from "../../../assets/examples/blinking-dot/gen.ts";
import paletteJson from "../../../assets/palettes/example.json" with { type: "json" };
import {
  changedPixels,
  defineAsset,
  IndexedBuffer,
  LINT_FORMAT,
  LINT_RULES,
  lintAsset,
  lintFrames,
  lintSubjects,
  lintTiming,
  parsePalette,
  renderAll,
  resolveLintConfig,
} from "../src/index.ts";
import type { AnyAsset, LintConfig, LintReport, LintRule, RenderedFrame } from "../src/index.ts";
import { findAsset, findAssets, lintToDisk, openProject } from "../src/node/index.ts";
import { makeScene } from "./lint-fixtures/scene.ts";
import { makeWalker, WALKER_DEFECTS } from "./lint-fixtures/walker.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURES = fileURLToPath(new URL("./lint-fixtures/", import.meta.url));
const palette = parsePalette(paletteJson);
const dot = blinkingDot as AnyAsset;

const temp = mkdtempSync(join(tmpdir(), "whz-lint-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

/** The rules that reported an error, without repeats, in rule order. */
function errorRules(report: LintReport): LintRule[] {
  const rules = new Set(report.findings.filter((finding) => finding.severity === "error").map((finding) => finding.rule));
  return LINT_RULES.filter((rule) => rules.has(rule));
}

/** The frames of one seed of an asset, with one of them replaced. */
function framesWith(asset: AnyAsset, replace: number, buffer: IndexedBuffer): RenderedFrame[] {
  return renderAll(asset, { seed: 1 }).frames.map((frame, i) => (i === replace ? { ...frame, buffer } : frame));
}

/** The one rule each defect fixture must fail with. The folder names under lint-fixtures/defects. */
const DEFECT_RULE: Record<string, LintRule> = {
  "area-pop": "area-change",
  "bad-timing": "timing",
  "clipped-prop": "fits-frame",
  "dark-scene": "scene-luminance",
  "detached-group": "detached-groups",
  "loop-seam": "loop-seam",
  "off-palette": "render",
  "orphan-pixel": "orphan-pixels",
  "outline-gap": "outline-gaps",
  "pivot-jump": "baseline-drift",
  "too-many-colors": "color-count",
  "wrong-frame-size": "render",
  "wrong-slot": "allowed-slots",
};

describe("the defect fixtures (test/lint-fixtures)", () => {
  const project = openProject({ root: REPO, assets: FIXTURES, out: join(temp, "fixtures") });
  const entries = findAssets(project);

  it("there is an expectation for every fixture folder", () => {
    expect(entries.map((entry) => entry.id)).toEqual(["clean/scene", "clean/walker", ...Object.keys(DEFECT_RULE).map((name) => `defects/${name}`)]);
  });

  it.each(Object.entries(DEFECT_RULE))("defects/%s fails the lint, with the rule %s and no other", async (name, rule) => {
    const result = await lintToDisk(project, findAsset(project, `defects/${name}`), { write: false });
    expect(result.error).toBeNull();
    expect(result.ok).toBe(false);
    const report = result.report as LintReport;
    expect(report.errors).toBeGreaterThan(0);
    expect(errorRules(report)).toEqual([rule]);
    expect(report.warnings).toBe(0);
  });

  it.each(["clean/walker", "clean/scene"])("%s passes with no finding at all", async (id) => {
    const result = await lintToDisk(project, findAsset(project, id), { write: false });
    expect(result.ok).toBe(true);
    expect(result.report?.findings).toEqual([]);
  });

  it("every lintable walker defect has a fixture (twinned arms are for eyes only)", () => {
    const folders = Object.keys(DEFECT_RULE);
    expect(WALKER_DEFECTS.filter((defect) => !folders.includes(defect))).toEqual(["twinned"]);
  });
});

describe("what the findings say", () => {
  const findings = (defect: (typeof WALKER_DEFECTS)[number], pick = 0) => lintAsset(makeWalker("tests/walker", defect, pick), { subjects: [{ seed: 1, preset: null }] }).findings;

  it("an orphan pixel: the frame, the pixel and its colour", () => {
    expect(findings("orphan-pixel")).toEqual([
      {
        rule: "orphan-pixels",
        severity: "error",
        message: "1 orphan pixel(s), 0 allowed: the first is (9, 13) in gold.2, with no pixel of its colour around it",
        seed: 1,
        preset: null,
        clip: "walk",
        facing: "default",
        frame: 0,
      },
    ]);
    // pick = 2 + 4 * 2: frame 2, the third place (hair colour on the cheek).
    expect(findings("orphan-pixel", 10)).toMatchObject([{ rule: "orphan-pixels", frame: 2, message: expect.stringContaining("(12, 8) in red.0") }]);
  });

  it("a pivot jump: the frame that is the odd one out, up or down", () => {
    expect(findings("pivot-jump")).toMatchObject([{ rule: "baseline-drift", frame: 0, message: expect.stringContaining("moves 1 px within the clip (0 allowed): rows below the pivot per frame: -1, 0, 0, 0") }]);
    // pick = 3 + 4: frame 3, one pixel lower. The feet leave the frame's safe margin too.
    const lower = findings("pivot-jump", 7);
    expect(lower.find((finding) => finding.rule === "baseline-drift")).toMatchObject({ frame: 3, message: expect.stringContaining("0, 0, 0, 1") });
  });

  it("a wrong slot: the slot's name and the first pixel", () => {
    expect(findings("wrong-slot")[0]).toMatchObject({ rule: "allowed-slots", frame: 0, message: "uses red.2, which the asset's allowedSlots do not list; the first pixel is (5, 12)" });
  });

  it("a popping frame, a popping loop, a clipped prop, a detached block and an open outline", () => {
    expect(findings("area-pop").map((finding) => [finding.rule, finding.frame, finding.message])).toEqual([
      ["area-change", 2, "the opaque area goes from 154 to 276 px between frames 1 and 2 (44%, 35% allowed)"],
      ["area-change", 3, "the opaque area goes from 276 to 154 px between frames 2 and 3 (44%, 35% allowed)"],
    ]);
    expect(findings("loop-seam")).toMatchObject([
      { rule: "loop-seam", frame: 0, message: "the loop pops: 21 px change from the last frame to the first, the largest change inside the clip is 11 px (150% allowed)" },
    ]);
    expect(findings("clipped-prop")).toMatchObject([{ rule: "fits-frame", frame: 1, message: expect.stringContaining("4 pixel(s) in the 1-pixel margin of the frame, the first at (15, 0)") }]);
    expect(findings("detached-group")[0]).toMatchObject({ rule: "detached-groups", frame: 0, message: "2 separate shapes, 1 allowed: detached 4 px at (1, 14)" });
    expect(findings("outline-gap")[0]).toMatchObject({ rule: "outline-gaps", frame: 0, message: expect.stringContaining("the outline is open at (5, 12) (gold.2)") });
  });

  it("a frame nobody can see, and one that freezes the animation", () => {
    expect(findings("bad-timing")).toEqual([
      { rule: "timing", severity: "error", message: "frame 1 is shown for 5 ms: shorter than 16 ms cannot be seen", clip: "walk", frame: 1 },
    ]);
    const config = resolveLintConfig({ kind: "sprite", size: [8, 8], clips: [{ name: "idle" }] }, palette);
    const clip = (durations: number[]) => [{ name: "idle", frames: durations.length, durations, loop: true }];
    expect(lintTiming(clip([100, 20000]), config)).toMatchObject([{ frame: 1, message: "frame 1 is shown for 20000 ms: longer than 10000 ms reads as a frozen animation" }]);
    expect(lintTiming(clip([16, 10000]), config)).toEqual([]);
    // A still (one frame) may be shown for any time.
    expect(lintTiming(clip([60000]), config)).toEqual([]);
  });

  it("a render that breaks the contract is one `render` error per subject, and the report has no frames for it", () => {
    const report = lintAsset(makeWalker("tests/walker", "wrong-frame-size"));
    expect(report.findings).toEqual([
      { rule: "render", severity: "error", message: 'asset "tests/walker": clip "walk", facing "default", frame 3: render returned 19 x 22, but "size" is 20 x 22', seed: 1, preset: null },
      { rule: "render", severity: "error", message: 'asset "tests/walker": clip "walk", facing "default", frame 3: render returned 19 x 22, but "size" is 20 x 22', seed: 2, preset: null },
    ]);
    expect(report.subjects).toEqual([
      { seed: 1, preset: null, outputHash: null },
      { seed: 2, preset: null, outputHash: null },
    ]);
    expect([report.errors, report.frames.length, report.clips.length]).toEqual([2, 0, 0]);
  });

  it("a subject that throws does not stop the others", () => {
    const flaky = defineAsset({
      id: "tests/flaky",
      kind: "sprite",
      size: [8, 8],
      pivot: [4, 6],
      palette,
      clips: { idle: { frames: 1, durations: 100 } },
      params: {},
      variantSeeds: [1, 2, 3],
      reviewSeeds: [1],
      render({ seed }) {
        if (seed === 2) throw new Error("seed 2 is cursed");
        return new IndexedBuffer(8, 8).fill(2, 2, 4, 4, palette.slot("red.1")).outline(palette.ink);
      },
    });
    const report = lintAsset(flaky);
    expect(report.findings).toMatchObject([{ rule: "render", seed: 2, message: expect.stringContaining("seed 2 is cursed") }]);
    expect(report.subjects.map((subject) => subject.outputHash === null)).toEqual([false, true, false]);
    expect(report.frames.map((frame) => frame.seed)).toEqual([1, 3]);
  });
});

describe("lintFrames on frames that did not come from render", () => {
  const walker = makeWalker("tests/walker");
  const input = { meta: walker.meta, palette, config: walker.lint, subject: { seed: 1, preset: null } };

  it("a frame of the wrong size is a `frame-size` finding, and the clip is not measured", () => {
    const result = lintFrames({ ...input, frames: framesWith(walker, 3, new IndexedBuffer(19, 22)) });
    expect(result.findings).toMatchObject([{ rule: "frame-size", frame: 3, message: "the frame is 19 x 22, but the asset's size is 20 x 22" }]);
    expect(result.frames).toEqual([]);
  });

  it("an index outside the palette is a `palette-index` finding", () => {
    const bad = renderAll(walker, { seed: 1 }).frames[1]?.buffer.clone().pset(10, 13, 200) as IndexedBuffer;
    const result = lintFrames({ ...input, frames: framesWith(walker, 1, bad) });
    expect(result.findings).toMatchObject([{ rule: "palette-index", frame: 1, message: 'pixel (10, 13) has index 200, but palette "example" has only 17 slots' }]);
  });

  it("refuses a frame list that is not the asset's", () => {
    const frames = renderAll(walker, { seed: 1 }).frames;
    expect(() => lintFrames({ ...input, frames: frames.slice(1) })).toThrow(/the asset has 4 frames, got 3/);
    expect(() => lintFrames({ ...input, frames: [...frames].reverse() })).toThrow(/frame 0 is out of order/);
  });

  it("two identical frames in a row are a warning, not an error", () => {
    const frames = renderAll(walker, { seed: 1 }).frames;
    const result = lintFrames({ ...input, frames: framesWith(walker, 1, (frames[0] as RenderedFrame).buffer.clone()) });
    expect(result.findings).toEqual([
      { rule: "timing", severity: "warning", message: "frames 0 and 1 are identical: use one frame with a longer duration", seed: 1, preset: null, clip: "walk", facing: "default", frame: 1 },
    ]);
  });

  it("a frame that loses contact with the ground is a baseline finding on that frame", () => {
    const result = lintFrames({ ...input, config: resolveLintConfig(walker.meta, palette, { off: ["area-change", "bbox-change", "loop-seam"] }), frames: framesWith(walker, 2, new IndexedBuffer(20, 22)) });
    expect(result.findings).toMatchObject([{ rule: "baseline-drift", frame: 2, message: "no pixel within 5 columns of the pivot, while other frames of the clip have some" }]);
    expect(result.frames[2]).toMatchObject({ bbox: null, area: 0, groups: 0, baseline: null, luminance: 0 });
  });
});

describe("the stats tables", () => {
  it("one row per frame and per clip, with the numbers of the clean walker", () => {
    const report = lintAsset(makeWalker("tests/walker"));
    expect(report).toMatchObject({ format: LINT_FORMAT, id: "tests/walker", kind: "sprite", size: [20, 22], pivot: [10, 19], paletteId: "example", errors: 0, warnings: 0 });
    expect(report.frames.length).toBe(8);
    expect(report.frames[0]).toEqual({
      seed: 1,
      preset: null,
      clip: "walk",
      facing: "default",
      frame: 0,
      bbox: [4, 2, 12, 18],
      area: 158,
      colors: 9,
      orphans: 0,
      groups: 1,
      gaps: 0,
      baseline: 0,
      luminance: 112,
      diff: 30,
    });
    expect(report.frames.map((frame) => frame.area)).toEqual([158, 154, 158, 154, 158, 154, 158, 154]);
    expect(report.clips[0]).toEqual({
      seed: 1,
      preset: null,
      clip: "walk",
      facing: "default",
      frames: 4,
      totalMs: 600,
      loop: true,
      maxDiff: 30,
      seam: 30,
      baselineDrift: 0,
      maxAreaChange: 2,
      maxBboxChange: 0,
    });
    // The walker draws the same for every seed.
    expect(new Set(report.subjects.map((subject) => subject.outputHash)).size).toBe(1);
  });

  it("the numbers of a hand-made frame: area, colours, groups, luminance, the bounding box", () => {
    const red = palette.slot("red.1");
    const frame = new IndexedBuffer(8, 8).fill(1, 1, 3, 3, red).fill(5, 5, 2, 2, palette.slot("white"));
    const still = { kind: "tiles" as const, size: [8, 8] as const, pivot: [0, 0] as const, clips: [{ name: "still", frames: 1, durations: [100], loop: true }], facings: ["default"] };
    const result = lintFrames({
      meta: still,
      palette,
      config: resolveLintConfig(still, palette),
      subject: { seed: 0, preset: null },
      frames: [{ clip: "still", facing: "default", frame: 0, buffer: frame }],
    });
    const [r, g, b] = palette.slots[red]?.rgb as readonly [number, number, number];
    const luma = Math.floor((299 * r + 587 * g + 114 * b + 500) / 1000);
    const white = palette.slots[palette.slot("white")]?.rgb as readonly [number, number, number];
    const lumaWhite = Math.floor((299 * white[0] + 587 * white[1] + 114 * white[2] + 500) / 1000);
    expect(result.findings).toEqual([]);
    expect(result.frames).toEqual([
      {
        seed: 0,
        preset: null,
        clip: "still",
        facing: "default",
        frame: 0,
        bbox: [1, 1, 6, 6],
        area: 13,
        colors: 2,
        orphans: 0,
        groups: 2,
        gaps: 0,
        baseline: 3, // the larger shape ends in row 3, and the pivot is row 0
        luminance: Math.floor((9 * luma + 4 * lumaWhite) / 13),
        diff: null,
      },
    ]);
    expect(result.clips[0]).toMatchObject({ frames: 1, seam: null, maxDiff: 0, baselineDrift: 0 });
  });

  it("changedPixels counts the pixels that differ", () => {
    const a = new IndexedBuffer(4, 4).fill(0, 0, 2, 2, 5);
    expect(changedPixels(a, a.clone())).toBe(0);
    expect(changedPixels(a, a.clone().pset(3, 3, 1).pset(0, 0, 0))).toBe(2);
  });
});

describe("what a lint run renders", () => {
  it("every variant seed and review seed with the default params, then every preset with the first variant seed", () => {
    expect(lintSubjects(dot)).toEqual([
      ...[1, 2, 5, 3, 4, 6, 7, 8].map((seed) => ({ seed, preset: null })),
      { seed: 1, preset: "small" },
      { seed: 1, preset: "big" },
    ]);
  });

  it("the example asset passes: 10 renders, 20 frames, no finding", () => {
    const report = lintAsset(dot);
    expect([report.errors, report.warnings, report.subjects.length, report.frames.length]).toEqual([0, 0, 10, 20]);
    expect(report.subjects.every((subject) => subject.outputHash !== null)).toBe(true);
    expect(report.config).toMatchObject({ maxGroups: 2, margin: 0, unoutlined: ["shadow", "white"] });
  });

  it("the example asset needs its `lint` field: with the plain sprite defaults the sparkle is reported", () => {
    const strict = resolveLintConfig(dot.meta, dot.palette);
    const result = lintFrames({ meta: dot.meta, palette: dot.palette, config: strict, subject: { seed: 1, preset: null }, frames: renderAll(dot, { seed: 1 }).frames });
    const rules = new Set(result.findings.map((finding) => finding.rule));
    expect([...rules].sort()).toEqual(["detached-groups", "fits-frame"]);
  });
});

describe("resolveLintConfig", () => {
  const sprite = { kind: "sprite" as const, size: [20, 22] as const, clips: [{ name: "walk" }, { name: "idle" }] };
  const resolve = (config: unknown, target: Parameters<typeof resolveLintConfig>[0] = sprite) => resolveLintConfig(target, palette, config as LintConfig);

  it("the defaults of a sprite", () => {
    expect(resolve({})).toEqual({
      off: ["scene-luminance"],
      baselineDrift: 0,
      maxAreaChange: 35,
      maxBboxChange: 25,
      maxSeamRatio: 150,
      allowedSlots: null,
      maxOrphans: 0,
      maxGroups: 1,
      outlineSlots: ["ink", "ink-deep"],
      unoutlined: ["shadow"],
      maxOutlineGaps: 0,
      maxColors: 16,
      margin: 1,
      baselineBand: 5,
      minFrameMs: 16,
      maxFrameMs: 10000,
      minLuminance: 64,
      clips: {},
    });
  });

  it("tiles and scenes turn the shape rules off; only a scene has the luminance floor", () => {
    const tiles = resolve({}, { ...sprite, kind: "tiles" });
    const scene = resolve({}, { ...sprite, kind: "scene" });
    expect(tiles.off).toEqual(["orphan-pixels", "detached-groups", "fits-frame", "baseline-drift", "scene-luminance"]);
    expect(scene.off).toEqual(["orphan-pixels", "detached-groups", "fits-frame", "baseline-drift", "color-count"]);
    expect([tiles.margin, tiles.maxColors, scene.maxColors]).toEqual([0, 16, 255]);
  });

  it("slot lists take slot names and ramp names, and come out in palette order", () => {
    const config = resolve({ allowedSlots: ["teal", "ink", "red.0"], unoutlined: ["white"], outlineSlots: ["ink"] });
    expect(config.allowedSlots).toEqual(["ink", "red.0", "teal.0", "teal.1", "teal.2"]);
    expect(config.unoutlined).toEqual(["shadow", "white"]);
    expect(config.outlineSlots).toEqual(["ink"]);
  });

  it("a clip gets the asset's thresholds with its own laid over them", () => {
    const config = resolve({ off: ["loop-seam"], maxAreaChange: 50, clips: { walk: { baselineDrift: 1, off: ["area-change"] } } });
    expect(config.clips).toEqual({ walk: { off: ["scene-luminance", "loop-seam", "area-change"], baselineDrift: 1, maxAreaChange: 50, maxBboxChange: 25, maxSeamRatio: 150 } });
    expect(config.baselineDrift).toBe(0);
  });

  it("names the field on a typo", () => {
    expect(() => resolve({ maxOrphan: 1 })).toThrow(/^lint: unknown field "maxOrphan" \(fields: off, baselineDrift, /);
    expect(() => resolve({ off: ["orphans"] })).toThrow(/^lint\.off: no rule named "orphans" \(rules: render, frame-size, /);
    expect(() => resolve({ off: ["palette-index"] })).toThrow(/^lint\.off: the rule "palette-index" cannot be turned off$/);
    expect(() => resolve({ maxColors: 0 })).toThrow(/^lint\.maxColors must be an integer in \[1, 255\], got 0$/);
    expect(() => resolve({ maxAreaChange: 12.5 })).toThrow(/^lint\.maxAreaChange must be an integer in \[0, 100\], got 12\.5$/);
    expect(() => resolve({ allowedSlots: ["purple"] })).toThrow(/^lint\.allowedSlots: palette "example" has no slot or ramp named "purple"$/);
    expect(() => resolve({ allowedSlots: "ink" })).toThrow(/^lint\.allowedSlots must be a list of slot or ramp names$/);
    expect(() => resolve({ clips: { run: {} } })).toThrow(/^lint\.clips: no clip named "run" \(clips: walk, idle\)$/);
    expect(() => resolve({ clips: { walk: { margin: 2 } } })).toThrow(/^lint\.clips\.walk: unknown field "margin" \(fields: off, baselineDrift, maxAreaChange, maxBboxChange, maxSeamRatio\)$/);
    expect(() => resolve({ clips: { walk: { maxSeamRatio: 50 } } })).toThrow(/^lint\.clips\.walk\.maxSeamRatio must be an integer in \[100, 100000\], got 50$/);
    expect(() => resolve({ minFrameMs: 500, maxFrameMs: 100 })).toThrow(/^lint\.minFrameMs \(500\) is above lint\.maxFrameMs \(100\)$/);
    expect(() => resolve([])).toThrow(/^lint must be an object of thresholds, got \[\]$/);
  });

  it("defineAsset reports a bad `lint` field as an error of the asset", () => {
    const spec = { id: "tests/typo", kind: "sprite" as const, size: [8, 8] as const, pivot: [4, 6] as const, palette, clips: { idle: { frames: 1, durations: 100 } }, params: {}, variantSeeds: [1] };
    expect(() => defineAsset({ ...spec, lint: { maxGroup: 2 } as LintConfig, render: () => new IndexedBuffer(8, 8) })).toThrow(/asset "tests\/typo": lint: unknown field "maxGroup"/);
  });
});

describe("thresholds an asset sets", () => {
  /** The walker with a defect, linted with the walker's own config plus overrides. */
  function rules(defect: (typeof WALKER_DEFECTS)[number], overrides: LintConfig, pick = 0): LintRule[] {
    const asset = makeWalker("tests/walker", defect, pick);
    const config = resolveLintConfig(asset.meta, palette, { allowedSlots: [...(asset.lint.allowedSlots ?? [])], maxColors: asset.lint.maxColors, ...overrides });
    const result = lintFrames({ meta: asset.meta, palette, config, subject: { seed: 1, preset: null }, frames: renderAll(asset, { seed: 1 }).frames });
    return [...new Set(result.findings.map((finding) => finding.rule))];
  }

  it("a looser threshold, a rule turned off and a per-clip override each let the defect through", () => {
    expect(rules("orphan-pixel", {})).toEqual(["orphan-pixels"]);
    expect(rules("orphan-pixel", { maxOrphans: 1 })).toEqual([]);
    expect(rules("orphan-pixel", { off: ["orphan-pixels"] })).toEqual([]);
    expect(rules("pivot-jump", { clips: { walk: { baselineDrift: 1 } } })).toEqual([]);
    expect(rules("detached-group", { maxGroups: 2 })).toEqual([]);
    expect(rules("outline-gap", { maxOutlineGaps: 1 })).toEqual([]);
    expect(rules("area-pop", { maxAreaChange: 44 })).toEqual([]);
    expect(rules("area-pop", { maxAreaChange: 43 })).toEqual(["area-change"]);
    expect(rules("loop-seam", { maxSeamRatio: 200 })).toEqual([]);
    expect(rules("clipped-prop", { margin: 0 })).toEqual([]);
    expect(rules("too-many-colors", { maxColors: 9 })).toEqual([]);
    expect(rules("too-many-colors", { maxColors: 8 })).toEqual(["color-count"]);
  });

  it("a stricter threshold catches what the default lets through", () => {
    // The clean walk changes 30 px per frame and its area by 2 %.
    const clean = makeWalker("tests/walker");
    const lint = (overrides: LintConfig) =>
      lintFrames({ meta: clean.meta, palette, config: resolveLintConfig(clean.meta, palette, overrides), subject: { seed: 1, preset: null }, frames: renderAll(clean, { seed: 1 }).frames }).findings;
    expect(lint({})).toEqual([]);
    expect(new Set(lint({ maxAreaChange: 1 }).map((finding) => finding.rule))).toEqual(new Set(["area-change"]));
    expect(new Set(lint({ maxColors: 8 }).map((finding) => finding.rule))).toEqual(new Set(["color-count"]));
    expect(new Set(lint({ allowedSlots: ["ink", "gold", "teal", "grey"] }).map((finding) => finding.rule))).toEqual(new Set(["allowed-slots"]));
  });

  it("known limits: a wrong slot that the asset allows elsewhere, and twinned limbs, pass every lint", () => {
    // Shoes in grey.1 instead of grey.0: both are in the walker's allowedSlots.
    expect(rules("wrong-slot", {}, 2)).toEqual([]);
    expect(rules("twinned", {})).toEqual([]);
  });

  it("a scene is judged by its brightness, with a floor the asset can move", () => {
    const night = makeScene("tests/night", true);
    expect(errorRules(lintAsset(night))).toEqual(["scene-luminance"]);
    expect(lintAsset(night).frames[0]?.luminance).toBe(32);
    const config = resolveLintConfig(night.meta, palette, { minLuminance: 32 });
    expect(lintFrames({ meta: night.meta, palette, config, subject: { seed: 1, preset: null }, frames: renderAll(night, { seed: 1 }).frames }).findings).toEqual([]);
    expect(lintAsset(makeScene("tests/day", false)).frames[0]?.luminance).toBeGreaterThan(120);
  });
});

describe("lintToDisk", () => {
  it("writes lint.json with the findings, the thresholds, the source hash and one row per frame", async () => {
    const project = openProject({ root: REPO, assets: FIXTURES, out: join(temp, "disk") });
    const result = await lintToDisk(project, findAsset(project, "defects/orphan-pixel"));
    expect(result.file).toBe(join(temp, "disk", "review", "defects", "orphan-pixel", "lint.json"));
    const text = readFileSync(result.file as string, "utf8");
    const json = JSON.parse(text) as LintReport & { sourceHash: string };
    expect(json).toMatchObject({ format: "wz.lint/1", id: "defects/orphan-pixel", errors: 2, warnings: 0 });
    expect(json.sourceHash).toMatch(/^[0-9a-f]{16}$/);
    expect(json.findings).toEqual(JSON.parse(JSON.stringify(result.report?.findings)));
    expect(json.config.maxOrphans).toBe(0);
    expect(json.frames.length).toBe(8);
    expect(json.frames[0]?.orphans).toBe(1);
    // The table is one line per frame.
    expect(text.split("\n").filter((line) => line.startsWith('    { "seed": ') && line.includes('"orphans": ')).length).toBe(8);

    // The same report again gives the same file.
    await lintToDisk(project, findAsset(project, "defects/orphan-pixel"));
    expect(readFileSync(result.file as string, "utf8")).toBe(text);
  });

  it("`write: false` checks only, and an asset that cannot be loaded is an error, not an exception", async () => {
    const project = openProject({ root: REPO, assets: FIXTURES, out: join(temp, "dry") });
    const result = await lintToDisk(project, findAsset(project, "clean/walker"), { write: false });
    expect([result.ok, result.file]).toEqual([true, null]);
    expect(existsSync(join(temp, "dry"))).toBe(false);

    const broken = await lintToDisk(project, { id: "clean/missing", folder: join(FIXTURES, "clean", "walker"), genFile: join(FIXTURES, "clean", "walker", "gen.ts") }, { write: false });
    expect(broken).toMatchObject({ ok: false, report: null, file: null });
    expect(broken.error).toMatch(/its id is "clean\/walker", but its folder says "clean\/missing"/);
  });
});
