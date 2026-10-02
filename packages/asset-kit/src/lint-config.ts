// The thresholds of the asset lints (src/lint.ts), and how an asset changes them.
//
// Every rule has a default per asset kind. An asset program overrides them with the `lint`
// field of `defineAsset`: a threshold, a rule turned off, or a looser value for one clip. The
// defaults are strict on purpose: an override in the generator says "this is deliberate", and
// lint.json records the thresholds a report was made with.

import type { AssetKind } from "./asset.ts";
import type { Palette } from "./palette.ts";

/** The rules, in the order they are reported. The first three cannot be turned off. */
export const LINT_RULES = [
  "render",
  "frame-size",
  "palette-index",
  "allowed-slots",
  "orphan-pixels",
  "detached-groups",
  "outline-gaps",
  "color-count",
  "fits-frame",
  "baseline-drift",
  "area-change",
  "bbox-change",
  "loop-seam",
  "timing",
  "scene-luminance",
] as const;
export type LintRule = (typeof LINT_RULES)[number];

/** Rules that guard the contract itself. `off` cannot name them. */
export const LINT_RULES_ALWAYS_ON: readonly LintRule[] = ["render", "frame-size", "palette-index"];

/** The thresholds that can differ per clip. */
export interface ClipLintConfig {
  /** Rules to skip for this clip. */
  readonly off?: readonly LintRule[];
  /** How many pixels the contact row under the pivot may move within the clip. */
  readonly baselineDrift?: number;
  /** The largest change of the opaque area between two frames, in percent. */
  readonly maxAreaChange?: number;
  /** The largest move of a bounding-box edge between two frames, in percent of the frame size. */
  readonly maxBboxChange?: number;
  /** The loop seam (last -> first frame) may change at most this percent of the largest in-clip change. */
  readonly maxSeamRatio?: number;
}

/** What an asset program may write in `defineAsset({ lint: ... })`. Everything is optional. */
export interface LintConfig extends ClipLintConfig {
  /** The slots the asset may use, as slot names or ramp names. The whole palette if not given. */
  readonly allowedSlots?: readonly string[];
  /** How many orphan pixels a frame may have (see `IndexedBuffer.orphanCount`). */
  readonly maxOrphans?: number;
  /** How many separate shapes a frame may have. The ground shadow (the `shadow` slot) is not counted. */
  readonly maxGroups?: number;
  /** The slots that are outline. `ink` and every slot named `ink-...` or `ink....` if not given. */
  readonly outlineSlots?: readonly string[];
  /** Slots of thin details that are drawn after the outline on purpose (a string, a sparkle). */
  readonly unoutlined?: readonly string[];
  /** How many fill pixels of an outlined shape may touch a transparent pixel. */
  readonly maxOutlineGaps?: number;
  /** The most colours (palette indices, transparent not counted) one frame may use. */
  readonly maxColors?: number;
  /** The ring of pixels along the frame edge that must stay empty, in pixels. 0 turns the check off. */
  readonly margin?: number;
  /** The contact row is looked for in the columns pivot.x - band .. pivot.x + band. A quarter of the width if not given. */
  readonly baselineBand?: number;
  /** The shortest and the longest time one frame of a multi-frame clip may be shown, in ms. */
  readonly minFrameMs?: number;
  readonly maxFrameMs?: number;
  /** The floor of a scene's mean luminance, 0..255. */
  readonly minLuminance?: number;
  /** Looser or stricter thresholds for single clips. */
  readonly clips?: Readonly<Record<string, ClipLintConfig>>;
}

/** The thresholds of one clip after the defaults and the overrides are applied. */
export interface ResolvedClipLint {
  readonly off: readonly LintRule[];
  readonly baselineDrift: number;
  readonly maxAreaChange: number;
  readonly maxBboxChange: number;
  readonly maxSeamRatio: number;
}

/** The thresholds a lint run uses. Plain data: it is written into lint.json as it is. */
export interface ResolvedLintConfig extends ResolvedClipLint {
  /** Slot names; null = the whole palette. */
  readonly allowedSlots: readonly string[] | null;
  readonly maxOrphans: number;
  readonly maxGroups: number;
  readonly outlineSlots: readonly string[];
  readonly unoutlined: readonly string[];
  readonly maxOutlineGaps: number;
  readonly maxColors: number;
  readonly margin: number;
  readonly baselineBand: number;
  readonly minFrameMs: number;
  readonly maxFrameMs: number;
  readonly minLuminance: number;
  /** Only the clips that have overrides. */
  readonly clips: Readonly<Record<string, ResolvedClipLint>>;
}

/** A bounding-box edge may always move this many pixels, whatever the percentage gives. */
export const BBOX_CHANGE_FLOOR_PX = 2;

interface KindDefaults {
  readonly off: readonly LintRule[];
  readonly maxColors: number;
  readonly margin: number;
}

// A sprite is one outlined shape that stands on its pivot. Tiles and scenes fill the frame
// and are full of separate shapes and of single pixels (texture, dither), so the shape rules
// are off for them. Only a scene has a brightness floor.
const KIND_DEFAULTS: Readonly<Record<AssetKind, KindDefaults>> = {
  sprite: { off: ["scene-luminance"], maxColors: 16, margin: 1 },
  tiles: { off: ["orphan-pixels", "detached-groups", "fits-frame", "baseline-drift", "scene-luminance"], maxColors: 16, margin: 0 },
  scene: { off: ["orphan-pixels", "detached-groups", "fits-frame", "baseline-drift", "color-count"], maxColors: 255, margin: 0 },
};

const CLIP_KEYS = ["off", "baselineDrift", "maxAreaChange", "maxBboxChange", "maxSeamRatio"] as const;
const TOP_KEYS = [
  ...CLIP_KEYS,
  "allowedSlots",
  "maxOrphans",
  "maxGroups",
  "outlineSlots",
  "unoutlined",
  "maxOutlineGaps",
  "maxColors",
  "margin",
  "baselineBand",
  "minFrameMs",
  "maxFrameMs",
  "minLuminance",
  "clips",
] as const;

/** What `resolveLintConfig` needs to know about the asset. */
export interface LintTarget {
  readonly kind: AssetKind;
  readonly size: readonly [w: number, h: number];
  readonly clips: readonly { readonly name: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function show(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

/** The slot names a list of slot or ramp names stands for, in palette order, without repeats. */
function expandSlots(palette: Palette, names: unknown, where: string): string[] {
  if (!Array.isArray(names)) throw new Error(`lint.${where} must be a list of slot or ramp names`);
  const indices = new Set<number>();
  for (const name of names as unknown[]) {
    if (typeof name !== "string") throw new Error(`lint.${where}: ${show(name)} is not a name`);
    if (palette.has(name)) indices.add(palette.slot(name));
    else if (palette.rampNames.includes(name)) for (const index of palette.ramp(name)) indices.add(index);
    else throw new Error(`lint.${where}: palette ${show(palette.id)} has no slot or ramp named ${show(name)}`);
  }
  return palette.slots.filter((slot) => indices.has(slot.index)).map((slot) => slot.name);
}

function readInt(source: Record<string, unknown>, key: string, where: string, min: number, max: number, fallback: number): number {
  const value = source[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`lint.${where}${key} must be an integer in [${min}, ${max}], got ${show(value)}`);
  }
  return value;
}

function readOff(source: Record<string, unknown>, where: string): LintRule[] {
  const value = source["off"];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`lint.${where}off must be a list of rule names`);
  return (value as unknown[]).map((rule) => {
    if (!LINT_RULES.includes(rule as LintRule)) {
      throw new Error(`lint.${where}off: no rule named ${show(rule)} (rules: ${LINT_RULES.join(", ")})`);
    }
    if (LINT_RULES_ALWAYS_ON.includes(rule as LintRule)) {
      throw new Error(`lint.${where}off: the rule ${show(rule)} cannot be turned off`);
    }
    return rule as LintRule;
  });
}

function checkKeys(source: Record<string, unknown>, known: readonly string[], where: string): void {
  for (const key of Object.keys(source)) {
    if (!known.includes(key)) throw new Error(`lint${where === "" ? "" : `.${where}`}: unknown field ${show(key)} (fields: ${known.join(", ")})`);
  }
}

function readClip(source: Record<string, unknown>, where: string, base: ResolvedClipLint): ResolvedClipLint {
  return {
    off: [...new Set([...base.off, ...readOff(source, where)])],
    baselineDrift: readInt(source, "baselineDrift", where, 0, 4096, base.baselineDrift),
    maxAreaChange: readInt(source, "maxAreaChange", where, 0, 100, base.maxAreaChange),
    maxBboxChange: readInt(source, "maxBboxChange", where, 0, 100, base.maxBboxChange),
    maxSeamRatio: readInt(source, "maxSeamRatio", where, 100, 100000, base.maxSeamRatio),
  };
}

/**
 * The thresholds for one asset: the defaults of its kind with the asset's `lint` field laid
 * over them. Throws an error that names the field on an unknown field, rule, slot or clip, so
 * a typo shows when the asset is defined.
 */
export function resolveLintConfig(target: LintTarget, palette: Palette, config: LintConfig = {}): ResolvedLintConfig {
  if (!isRecord(config)) throw new Error(`lint must be an object of thresholds, got ${show(config)}`);
  const source = config as Record<string, unknown>;
  checkKeys(source, TOP_KEYS, "");
  const kind = KIND_DEFAULTS[target.kind];
  const base = readClip(source, "", { off: kind.off, baselineDrift: 0, maxAreaChange: 35, maxBboxChange: 25, maxSeamRatio: 150 });

  const defaultOutline = palette.slots.filter((slot) => /^ink([.-]|$)/.test(slot.name)).map((slot) => slot.name);
  const unoutlined = new Set(["shadow", ...(source["unoutlined"] === undefined ? [] : expandSlots(palette, source["unoutlined"], "unoutlined"))]);

  const clips: Record<string, ResolvedClipLint> = {};
  const rawClips = source["clips"] ?? {};
  if (!isRecord(rawClips)) throw new Error("lint.clips must be an object of clip name -> thresholds");
  for (const [name, raw] of Object.entries(rawClips)) {
    if (!target.clips.some((clip) => clip.name === name)) {
      throw new Error(`lint.clips: no clip named ${show(name)} (clips: ${target.clips.map((clip) => clip.name).join(", ")})`);
    }
    if (!isRecord(raw)) throw new Error(`lint.clips.${name} must be an object of thresholds`);
    checkKeys(raw, CLIP_KEYS, `clips.${name}`);
    clips[name] = readClip(raw, `clips.${name}.`, base);
  }

  const minFrameMs = readInt(source, "minFrameMs", "", 1, 600000, 16);
  const maxFrameMs = readInt(source, "maxFrameMs", "", 1, 600000, 10000);
  if (minFrameMs > maxFrameMs) throw new Error(`lint.minFrameMs (${minFrameMs}) is above lint.maxFrameMs (${maxFrameMs})`);

  return {
    ...base,
    allowedSlots: source["allowedSlots"] === undefined ? null : expandSlots(palette, source["allowedSlots"], "allowedSlots"),
    maxOrphans: readInt(source, "maxOrphans", "", 0, 1000000, 0),
    maxGroups: readInt(source, "maxGroups", "", 1, 1000000, 1),
    outlineSlots: source["outlineSlots"] === undefined ? defaultOutline : expandSlots(palette, source["outlineSlots"], "outlineSlots"),
    unoutlined: palette.slots.filter((slot) => unoutlined.has(slot.name)).map((slot) => slot.name),
    maxOutlineGaps: readInt(source, "maxOutlineGaps", "", 0, 1000000, 0),
    maxColors: readInt(source, "maxColors", "", 1, 255, kind.maxColors),
    margin: readInt(source, "margin", "", 0, 2048, kind.margin),
    baselineBand: readInt(source, "baselineBand", "", 0, 4096, target.size[0] >> 2),
    minFrameMs,
    maxFrameMs,
    minLuminance: readInt(source, "minLuminance", "", 0, 255, 64),
    clips,
  };
}

/** The thresholds of one clip of a resolved config. */
export function clipLint(config: ResolvedLintConfig, clip: string): ResolvedClipLint {
  return Object.hasOwn(config.clips, clip) ? (config.clips[clip] as ResolvedClipLint) : config;
}
