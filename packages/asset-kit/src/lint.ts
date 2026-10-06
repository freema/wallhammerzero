// The asset lints: numbers before eyes. Every check here reads palette indices and gives a
// number with a threshold, so a defect that is too small to see in a review sheet (an orphan
// pixel, a 1-pixel jump of the feet, a popping loop) fails a command instead of waiting for
// somebody to notice it. docs/asset-pipeline.md lists the rules; the thresholds and how an
// asset overrides them are in src/lint-config.ts.
//
// Everything is integer arithmetic on the frames, with no I/O: the CLI, the tests and the
// studio run the same code.

import { idiv } from "@whz/det";
import type { AnyAsset, AssetKind, ClipMeta } from "./asset.ts";
import { TRANSPARENT } from "./buffer.ts";
import type { Bounds, IndexedBuffer } from "./buffer.ts";
import { BBOX_CHANGE_FLOOR_PX, clipLint } from "./lint-config.ts";
import type { LintRule, ResolvedLintConfig } from "./lint-config.ts";
import { outputHash, renderAll } from "./output.ts";
import type { FrameRef, RenderedFrame } from "./output.ts";
import type { Palette } from "./palette.ts";

/** The `format` value of lint.json. */
export const LINT_FORMAT = "wz.lint/1";

/** One thing that is linted: a seed with the default params, or with a preset. */
export interface LintSubject {
  readonly seed: number;
  readonly preset: string | null;
}

/** One problem. `seed` and the fields after it say where, as far as the rule knows. */
export interface LintFinding {
  readonly rule: LintRule;
  /** Only errors make the lint fail. */
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly seed?: number;
  readonly preset?: string | null;
  readonly clip?: string;
  readonly facing?: string;
  readonly frame?: number;
}

/** The numbers of one frame: a row of the stats table in lint.json. */
export interface FrameStats extends LintSubject, FrameRef {
  /** The box around the opaque pixels as [x, y, w, h]; null for an empty frame. */
  readonly bbox: readonly [number, number, number, number] | null;
  /** Opaque pixels. */
  readonly area: number;
  /** Palette indices in use, transparent not counted. */
  readonly colors: number;
  readonly orphans: number;
  /** Separate shapes (8-connected), the ground shadow not counted. */
  readonly groups: number;
  /** Fill pixels of an outlined shape that touch a transparent pixel. */
  readonly gaps: number;
  /** The lowest pixel of the largest shape in the columns around the pivot, as rows below the pivot (negative: above). */
  readonly baseline: number | null;
  /** Mean luminance of the opaque pixels, 0..255. */
  readonly luminance: number;
  /** Pixels that change to the next frame of the clip; for the last frame of a loop, to the first. */
  readonly diff: number | null;
}

/** The numbers of one clip in one facing. */
export interface ClipStats extends LintSubject {
  readonly clip: string;
  readonly facing: string;
  readonly frames: number;
  readonly totalMs: number;
  readonly loop: boolean;
  /** The largest change between two neighbouring frames inside the clip, in pixels. */
  readonly maxDiff: number;
  /** The change from the last frame to the first, in pixels; null if the clip does not loop. */
  readonly seam: number | null;
  /** The spread of `baseline` over the clip; null if no frame has pixels near the pivot. */
  readonly baselineDrift: number | null;
  /** The largest area change between neighbouring frames, in percent. */
  readonly maxAreaChange: number;
  /** The largest move of a bounding-box edge between neighbouring frames, in pixels. */
  readonly maxBboxChange: number;
}

/** What `lintFrames` returns for one subject. */
export interface FrameLint {
  readonly findings: LintFinding[];
  readonly frames: FrameStats[];
  readonly clips: ClipStats[];
}

/** The content of lint.json. */
export interface LintReport {
  readonly format: typeof LINT_FORMAT;
  readonly id: string;
  readonly kind: AssetKind;
  readonly size: readonly [number, number];
  readonly pivot: readonly [number, number];
  readonly paletteId: string;
  /** The thresholds this report was made with. */
  readonly config: ResolvedLintConfig;
  /** What was rendered. `outputHash` is null for a subject that could not be rendered. */
  readonly subjects: readonly (LintSubject & { readonly outputHash: string | null })[];
  readonly errors: number;
  readonly warnings: number;
  readonly findings: readonly LintFinding[];
  readonly clips: readonly ClipStats[];
  readonly frames: readonly FrameStats[];
}

/** What the frame checks need to know about the asset. */
export interface LintMeta {
  readonly kind: AssetKind;
  readonly size: readonly [w: number, h: number];
  readonly pivot: readonly [x: number, y: number];
  readonly clips: readonly ClipMeta[];
  readonly facings: readonly string[];
}

// ---------------------------------------------------------------------------------------
// One frame

interface Group {
  readonly area: number;
  /** The first pixel of the group in row order. */
  readonly x: number;
  readonly y: number;
}

interface Measured {
  readonly bounds: Bounds | null;
  readonly area: number;
  readonly used: readonly number[];
  readonly orphans: readonly number[];
  readonly groups: readonly Group[];
  readonly gaps: readonly number[];
  readonly baseline: number | null;
  readonly luminance: number;
  readonly inMargin: readonly number[];
}

interface Indices {
  readonly shadow: number;
  readonly outline: ReadonlySet<number>;
  readonly unoutlined: ReadonlySet<number>;
  readonly allowed: ReadonlySet<number> | null;
  /** Luminance 0..255 per palette index. */
  readonly luma: readonly number[];
}

function indicesOf(palette: Palette, config: ResolvedLintConfig): Indices {
  const set = (names: readonly string[]): Set<number> => new Set(names.map((name) => palette.slot(name)));
  return {
    shadow: palette.shadow,
    outline: set(config.outlineSlots),
    unoutlined: set(config.unoutlined),
    allowed: config.allowedSlots === null ? null : set(config.allowedSlots),
    // ITU-R BT.601 weights in thousandths, rounded to the nearest integer.
    luma: palette.slots.map((slot) => idiv(299 * slot.rgb[0] + 587 * slot.rgb[1] + 114 * slot.rgb[2] + 500, 1000)),
  };
}

const at = (buffer: IndexedBuffer, offset: number): string => `(${offset % buffer.w}, ${idiv(offset, buffer.w)})`;

/** Everything the rules need from one frame, in one pass over its pixels and one flood fill. */
function measure(buffer: IndexedBuffer, pivot: readonly [number, number], config: ResolvedLintConfig, indices: Indices): Measured {
  const { w, h, data } = buffer;
  const used = new Set<number>();
  const inMargin: number[] = [];
  let area = 0;
  let lumaSum = 0;
  const { margin } = config;
  for (let i = 0; i < data.length; i += 1) {
    const index = data[i] as number;
    if (index === TRANSPARENT) continue;
    area += 1;
    used.add(index);
    lumaSum += indices.luma[index] ?? 0;
    const x = i % w;
    const y = (i - x) / w;
    if (x < margin || y < margin || x >= w - margin || y >= h - margin) inMargin.push(i);
  }

  // Shapes: 8-connected groups of opaque pixels. The ground shadow is not part of any shape.
  const body = (offset: number): boolean => data[offset] !== TRANSPARENT && data[offset] !== indices.shadow;
  const label = new Int32Array(data.length);
  const groups: Group[] = [];
  const gaps: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start += 1) {
    if (label[start] !== 0 || !body(start)) continue;
    const id = groups.length + 1;
    const members: number[] = [];
    let outlined = false;
    label[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const offset = stack.pop() as number;
      members.push(offset);
      if (indices.outline.has(data[offset] as number)) outlined = true;
      const x = offset % w;
      const y = (offset - x) / w;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const next = ny * w + nx;
          if (label[next] !== 0 || !body(next)) continue;
          label[next] = id;
          stack.push(next);
        }
      }
    }
    groups.push({ area: members.length, x: start % w, y: idiv(start, w) });
    // A gap: in a shape that has an outline, a fill pixel with a transparent pixel beside it.
    if (!outlined) continue;
    for (const offset of members) {
      const index = data[offset] as number;
      if (indices.outline.has(index) || indices.unoutlined.has(index)) continue;
      const x = offset % w;
      const open =
        (x > 0 && data[offset - 1] === TRANSPARENT) ||
        (x < w - 1 && data[offset + 1] === TRANSPARENT) ||
        (offset >= w && data[offset - w] === TRANSPARENT) ||
        (offset < data.length - w && data[offset + w] === TRANSPARENT);
      if (open) gaps.push(offset);
    }
  }
  gaps.sort((a, b) => a - b);

  // The contact row: the lowest pixel of the main shape (the largest one) in the columns
  // around the pivot. A sparkle or a prop beside the body is not what stands on the ground.
  let main = 0;
  groups.forEach((group, i) => {
    if (main === 0 || group.area > (groups[main - 1] as Group).area) main = i + 1;
  });
  let baseline: number | null = null;
  const x0 = Math.max(0, pivot[0] - config.baselineBand);
  const x1 = Math.min(w - 1, pivot[0] + config.baselineBand);
  for (let y = h - 1; y >= 0 && baseline === null && main > 0; y -= 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (label[y * w + x] === main) {
        baseline = y - pivot[1];
        break;
      }
    }
  }

  return {
    bounds: buffer.bounds(),
    area,
    used: [...used].sort((a, b) => a - b),
    orphans: buffer.orphanPixels(),
    groups,
    gaps,
    baseline,
    luminance: area === 0 ? 0 : idiv(lumaSum, area),
    inMargin,
  };
}

/** The number of pixels that differ between two frames of the same size. */
export function changedPixels(a: IndexedBuffer, b: IndexedBuffer): number {
  let count = 0;
  for (let i = 0; i < a.data.length; i += 1) if (a.data[i] !== b.data[i]) count += 1;
  return count;
}

// ---------------------------------------------------------------------------------------
// One subject

/** What `lintFrames` is given: the frames of one subject in canonical order (see `frameRefs`). */
export interface LintFramesInput {
  readonly meta: LintMeta;
  readonly palette: Palette;
  readonly config: ResolvedLintConfig;
  readonly subject: LintSubject;
  readonly frames: readonly RenderedFrame[];
}

/**
 * Checks the frames of one subject and returns the findings and the stats tables. The frames
 * need not come from `asset.render`: a wrong size and an index outside the palette are
 * findings here (`frame-size`, `palette-index`), not exceptions.
 */
export function lintFrames(input: LintFramesInput): FrameLint {
  const { meta, palette, config, subject } = input;
  const [w, h] = meta.size;
  const indices = indicesOf(palette, config);
  const findings: LintFinding[] = [];
  const frameStats: FrameStats[] = [];
  const clipStats: ClipStats[] = [];
  const slotName = (index: number): string => palette.slots[index]?.name ?? `#${index}`;
  const expected = meta.clips.reduce((sum, clip) => sum + clip.frames, 0) * meta.facings.length;
  if (input.frames.length !== expected) {
    throw new Error(`lintFrames: the asset has ${expected} frames, got ${input.frames.length}`);
  }

  let cursor = 0;
  for (const clip of meta.clips) {
    const limits = clipLint(config, clip.name);
    const on = (rule: LintRule): boolean => !limits.off.includes(rule);
    for (const facing of meta.facings) {
      const frames = input.frames.slice(cursor, cursor + clip.frames);
      cursor += clip.frames;
      const where = { seed: subject.seed, preset: subject.preset, clip: clip.name, facing };
      const add = (rule: LintRule, message: string, frame?: number, severity: "error" | "warning" = "error"): void => {
        findings.push({ rule, severity, message, ...where, ...(frame === undefined ? {} : { frame }) });
      };

      // The contract first: a frame of the wrong size or with an unknown index is not measured.
      let broken = false;
      frames.forEach((frame, i) => {
        const { buffer } = frame;
        if (frame.clip !== clip.name || frame.facing !== facing || frame.frame !== i) {
          throw new Error(`lintFrames: frame ${cursor - clip.frames + i} is out of order`);
        }
        if (buffer.w !== w || buffer.h !== h) {
          add("frame-size", `the frame is ${buffer.w} x ${buffer.h}, but the asset's size is ${w} x ${h}`, i);
          broken = true;
          return;
        }
        const bad = buffer.data.findIndex((index) => index >= palette.size);
        if (bad >= 0) {
          add("palette-index", `pixel ${at(buffer, bad)} has index ${buffer.data[bad]}, but palette "${palette.id}" has only ${palette.size} slots`, i);
          broken = true;
        }
      });
      if (broken) continue;

      const measured = frames.map((frame) => measure(frame.buffer, meta.pivot, config, indices));
      const diffs: (number | null)[] = frames.map((frame, i) => {
        const next = frames[i + 1];
        if (next !== undefined) return changedPixels(frame.buffer, next.buffer);
        return clip.loop && clip.frames > 1 ? changedPixels(frame.buffer, (frames[0] as RenderedFrame).buffer) : null;
      });

      measured.forEach((m, i) => {
        const buffer = (frames[i] as RenderedFrame).buffer;
        if (indices.allowed !== null && on("allowed-slots")) {
          const wrong = m.used.filter((index) => !(indices.allowed as ReadonlySet<number>).has(index));
          if (wrong.length > 0) {
            const first = buffer.data.findIndex((index) => wrong.includes(index));
            add("allowed-slots", `uses ${wrong.map(slotName).join(", ")}, which the asset's allowedSlots do not list; the first pixel is ${at(buffer, first)}`, i);
          }
        }
        if (on("orphan-pixels") && m.orphans.length > config.maxOrphans) {
          const first = m.orphans[0] as number;
          add(
            "orphan-pixels",
            `${m.orphans.length} orphan pixel(s), ${config.maxOrphans} allowed: the first is ${at(buffer, first)} in ${slotName(buffer.data[first] as number)}, with no pixel of its colour around it`,
            i,
          );
        }
        if (on("detached-groups") && m.groups.length > config.maxGroups) {
          const extra = [...m.groups].sort((a, b) => a.area - b.area || a.y - b.y || a.x - b.x).slice(0, m.groups.length - config.maxGroups);
          add(
            "detached-groups",
            `${m.groups.length} separate shapes, ${config.maxGroups} allowed: detached ${extra.map((group) => `${group.area} px at (${group.x}, ${group.y})`).join(", ")}`,
            i,
          );
        }
        if (on("outline-gaps") && m.gaps.length > config.maxOutlineGaps) {
          const first = m.gaps[0] as number;
          add(
            "outline-gaps",
            `${m.gaps.length} fill pixel(s) touch a transparent pixel, ${config.maxOutlineGaps} allowed: the outline is open at ${at(buffer, first)} (${slotName(buffer.data[first] as number)})`,
            i,
          );
        }
        if (on("color-count") && m.used.length > config.maxColors) {
          add("color-count", `${m.used.length} colours in one frame, ${config.maxColors} allowed`, i);
        }
        if (on("fits-frame") && m.inMargin.length > 0) {
          add(
            "fits-frame",
            `${m.inMargin.length} pixel(s) in the ${config.margin}-pixel margin of the frame, the first at ${at(buffer, m.inMargin[0] as number)}: the pose is clipped or touches the edge`,
            i,
          );
        }
        if (on("scene-luminance") && m.luminance < config.minLuminance) {
          add("scene-luminance", `mean luminance ${m.luminance} of 255 is below the floor of ${config.minLuminance}: the scene is too dark`, i);
        }
      });

      // Between the frames of the clip.
      let maxAreaChange = 0;
      let maxBboxChange = 0;
      const pairs = clip.frames > 2 && clip.loop ? clip.frames : clip.frames - 1;
      for (let i = 0; i < pairs; i += 1) {
        const j = (i + 1) % clip.frames;
        const a = measured[i] as Measured;
        const b = measured[j] as Measured;
        const larger = Math.max(a.area, b.area);
        const areaChange = larger === 0 ? 0 : idiv(100 * Math.abs(a.area - b.area), larger);
        maxAreaChange = Math.max(maxAreaChange, areaChange);
        if (on("area-change") && areaChange > limits.maxAreaChange) {
          add("area-change", `the opaque area goes from ${a.area} to ${b.area} px between frames ${i} and ${j} (${areaChange}%, ${limits.maxAreaChange}% allowed)`, j);
        }
        if (a.bounds === null || b.bounds === null) continue;
        const moves: [string, number, number][] = [
          ["left", Math.abs(a.bounds.x - b.bounds.x), w],
          ["right", Math.abs(a.bounds.x + a.bounds.w - b.bounds.x - b.bounds.w), w],
          ["top", Math.abs(a.bounds.y - b.bounds.y), h],
          ["bottom", Math.abs(a.bounds.y + a.bounds.h - b.bounds.y - b.bounds.h), h],
        ];
        for (const [edge, move, size] of moves) {
          maxBboxChange = Math.max(maxBboxChange, move);
          const allowed = Math.max(BBOX_CHANGE_FLOOR_PX, idiv(size * limits.maxBboxChange, 100));
          if (on("bbox-change") && move > allowed) {
            add("bbox-change", `the ${edge} edge of the bounding box moves ${move} px between frames ${i} and ${j} (${allowed} px allowed)`, j);
          }
        }
      }

      // Feet on the ground: the contact row under the pivot must not move.
      const baselines = measured.map((m) => m.baseline);
      const known = baselines.filter((value): value is number => value !== null);
      const baselineDrift = known.length === 0 ? null : Math.max(...known) - Math.min(...known);
      if (on("baseline-drift") && known.length > 0) {
        const lost = baselines.indexOf(null);
        if (lost >= 0) {
          add("baseline-drift", `no pixel within ${config.baselineBand} columns of the pivot, while other frames of the clip have some`, lost);
        } else if ((baselineDrift as number) > limits.baselineDrift) {
          // Point at the frame that is the odd one out: the rarer of the two extremes.
          const low = Math.max(...known);
          const odd = 2 * known.filter((value) => value === low).length <= known.length ? low : Math.min(...known);
          add(
            "baseline-drift",
            `the lowest pixel under the pivot moves ${baselineDrift} px within the clip (${limits.baselineDrift} allowed): rows below the pivot per frame: ${known.join(", ")}`,
            baselines.indexOf(odd),
          );
        }
      }

      // The loop seam against the changes inside the clip.
      const inClip = diffs.slice(0, clip.frames - 1) as number[];
      const maxDiff = inClip.length === 0 ? 0 : Math.max(...inClip);
      const seam = clip.loop && clip.frames > 1 ? (diffs[clip.frames - 1] as number) : null;
      if (on("loop-seam") && seam !== null && clip.frames > 2 && seam * 100 > maxDiff * limits.maxSeamRatio) {
        add(
          "loop-seam",
          `the loop pops: ${seam} px change from the last frame to the first, the largest change inside the clip is ${maxDiff} px (${limits.maxSeamRatio}% allowed)`,
          0,
        );
      }
      if (on("timing")) {
        inClip.forEach((diff, i) => {
          if (diff === 0) add("timing", `frames ${i} and ${i + 1} are identical: use one frame with a longer duration`, i + 1, "warning");
        });
      }

      measured.forEach((m, i) => {
        frameStats.push({
          seed: subject.seed,
          preset: subject.preset,
          clip: clip.name,
          facing,
          frame: i,
          bbox: m.bounds === null ? null : [m.bounds.x, m.bounds.y, m.bounds.w, m.bounds.h],
          area: m.area,
          colors: m.used.length,
          orphans: m.orphans.length,
          groups: m.groups.length,
          gaps: m.gaps.length,
          baseline: m.baseline,
          luminance: m.luminance,
          diff: diffs[i] as number | null,
        });
      });
      clipStats.push({
        seed: subject.seed,
        preset: subject.preset,
        clip: clip.name,
        facing,
        frames: clip.frames,
        totalMs: clip.durations.reduce((sum, ms) => sum + ms, 0),
        loop: clip.loop,
        maxDiff,
        seam,
        baselineDrift,
        maxAreaChange,
        maxBboxChange,
      });
    }
  }
  return { findings, frames: frameStats, clips: clipStats };
}

/** The timing rule: it reads the clip table only, so it runs once per asset. */
export function lintTiming(clips: readonly ClipMeta[], config: ResolvedLintConfig): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const clip of clips) {
    if (clip.frames < 2 || clipLint(config, clip.name).off.includes("timing")) continue;
    clip.durations.forEach((ms, frame) => {
      if (ms < config.minFrameMs) {
        findings.push({
          rule: "timing",
          severity: "error",
          message: `frame ${frame} is shown for ${ms} ms: shorter than ${config.minFrameMs} ms cannot be seen`,
          clip: clip.name,
          frame,
        });
      } else if (ms > config.maxFrameMs) {
        findings.push({
          rule: "timing",
          severity: "error",
          message: `frame ${frame} is shown for ${ms} ms: longer than ${config.maxFrameMs} ms reads as a frozen animation`,
          clip: clip.name,
          frame,
        });
      }
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------------------
// The whole asset

/**
 * What a lint run renders: every variant seed and review seed with the default params, then
 * every preset with the first variant seed.
 */
export function lintSubjects(asset: AnyAsset): LintSubject[] {
  const seeds = [...new Set([...asset.variantSeeds, ...asset.reviewSeeds])];
  const first = asset.variantSeeds[0] as number;
  return [
    ...seeds.map((seed): LintSubject => ({ seed, preset: null })),
    ...Object.keys(asset.presets).map((preset): LintSubject => ({ seed: first, preset })),
  ];
}

/** Options of `lintAsset`. */
export interface LintOptions {
  /** What to render. `lintSubjects(asset)` if not given. */
  readonly subjects?: readonly LintSubject[];
}

/**
 * Renders an asset and runs every rule. A subject that cannot be rendered (the program
 * throws, returns a frame of another size or uses an index outside the palette) is one
 * `render` error, and the other subjects are still checked.
 */
export function lintAsset(asset: AnyAsset, options: LintOptions = {}): LintReport {
  const { meta, palette } = asset;
  const config = asset.lint;
  const findings: LintFinding[] = lintTiming(meta.clips, config);
  const frames: FrameStats[] = [];
  const clips: ClipStats[] = [];
  const subjects = (options.subjects ?? lintSubjects(asset)).map((subject) => {
    try {
      const output = renderAll(asset, { seed: subject.seed, preset: subject.preset ?? undefined });
      const result = lintFrames({ meta, palette, config, subject, frames: output.frames });
      findings.push(...result.findings);
      frames.push(...result.frames);
      clips.push(...result.clips);
      // Frames that break the contract have no output hash: the finding above says why.
      const broken = result.findings.some((finding) => finding.rule === "frame-size" || finding.rule === "palette-index");
      return { ...subject, outputHash: broken ? null : outputHash(output) };
    } catch (error) {
      findings.push({ rule: "render", severity: "error", message: (error as Error).message, ...subject });
      return { ...subject, outputHash: null };
    }
  });
  return {
    format: LINT_FORMAT,
    id: meta.id,
    kind: meta.kind,
    size: meta.size,
    pivot: meta.pivot,
    paletteId: meta.paletteId,
    config,
    subjects,
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
    findings,
    clips,
    frames,
  };
}
