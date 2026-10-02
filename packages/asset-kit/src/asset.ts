// defineAsset: the contract between an asset program and everything that runs it (the bake
// CLI, the studio, tests, the game build).
//
// An asset program is a module, assets/<pack>/<name>/gen.ts, whose default export is
// `defineAsset({ ... })`: what the asset is (meta), which knobs it has (params, presets,
// seeds) and a pure `render` that returns one frame. Every frame is a function of
// (params, seed, clip, frame, facing) and nothing else: no clock, no unseeded randomness, no
// state kept between calls. The determinism lint (tools/lint) holds asset programs to that.

import { MAX_BUFFER_SIZE } from "./buffer.ts";
import type { IndexedBuffer } from "./buffer.ts";
import { Palette } from "./palette.ts";

/** Marks an object as an asset made by `defineAsset`. */
export const ASSET_FORMAT = "wz.asset/1";

/** The kinds of asset. Later notes add `font`, `ui` and `fx`. */
export const ASSET_KINDS = ["sprite", "tiles", "scene"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** The review seeds of an asset that does not list its own. Fixed, and never curated. */
export const REVIEW_SEEDS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

/** The most frames one clip can have. */
export const MAX_CLIP_FRAMES = 1024;

// ---------------------------------------------------------------------------------------
// Params

/** An integer knob with an inclusive range. */
export interface IntParam {
  readonly type: "int";
  readonly min: number;
  readonly max: number;
  readonly default: number;
  /** One line: what the knob changes. The studio shows it next to the slider. */
  readonly description: string;
}

/** A choice from a fixed list of names. */
export interface EnumParam<V extends string = string> {
  readonly type: "enum";
  readonly values: readonly V[];
  readonly default: NoInfer<V>;
  readonly description: string;
}

/** An on/off switch. */
export interface BoolParam {
  readonly type: "bool";
  readonly default: boolean;
  readonly description: string;
}

export type ParamSpec = IntParam | EnumParam | BoolParam;
/** The params schema of an asset: knob name -> what it is. */
export type ParamsSchema = Readonly<Record<string, ParamSpec>>;
export type ParamValue = number | string | boolean;

type ValueOf<P> = P extends IntParam ? number : P extends EnumParam<infer V> ? V : P extends BoolParam ? boolean : never;
/** The values of a schema: an int knob is a number, an enum knob one of its names, a bool knob a boolean. */
export type ParamValues<S extends ParamsSchema = ParamsSchema> = { readonly [K in keyof S]: ValueOf<S[K]> };

/** Which params to use: the defaults, then a named preset, then single overrides. */
export interface ParamChoice<S extends ParamsSchema = ParamsSchema> {
  readonly preset?: string | undefined;
  readonly params?: Partial<ParamValues<S>> | undefined;
}

// ---------------------------------------------------------------------------------------
// Meta

/** A clip as written in `defineAsset`. */
export interface ClipSpec {
  /** The number of frames. */
  readonly frames: number;
  /** How long each frame is shown, in milliseconds: one number for all frames, or one per frame. */
  readonly durations: number | readonly number[];
  /** Whether the clip repeats. True if not given. */
  readonly loop?: boolean;
}

/** A clip in the asset's meta. */
export interface ClipMeta {
  readonly name: string;
  readonly frames: number;
  /** One duration per frame, in milliseconds. */
  readonly durations: readonly number[];
  readonly loop: boolean;
}

/** What an asset is. Plain data: it can be written to JSON as it is. */
export interface AssetMeta {
  /** `<pack>/<name>`: the folder of the generator under assets/. */
  readonly id: string;
  readonly kind: AssetKind;
  /** Frame width and height in pixels. Every frame has this size. */
  readonly size: readonly [w: number, h: number];
  readonly paletteId: string;
  /** The clips, in the order they were written. */
  readonly clips: readonly ClipMeta[];
  /** The facings each clip is drawn in. A side facing is drawn once; the player mirrors it. */
  readonly facings: readonly string[];
  /** The pixel of a frame that sits on the asset's position (for a character, between the feet). */
  readonly pivot: readonly [x: number, y: number];
}

// ---------------------------------------------------------------------------------------
// The program

/** What `render` gets. */
export interface RenderContext<S extends ParamsSchema = ParamsSchema> {
  /** Every param of the schema, validated. */
  readonly params: ParamValues<S>;
  /** An unsigned 32-bit integer. Pass it to `createRng(seed, stream)` and `hash32(x, y, seed)`. */
  readonly seed: number;
  readonly clip: string;
  /** The frame of the clip, from 0. */
  readonly frame: number;
  readonly facing: string;
  /** The text of each file named in `stampFiles` (stamps/<name>.txt). Parse with `parseStamp`. */
  readonly stamps: Readonly<Record<string, string>>;
}

/** What an asset program passes to `defineAsset`. */
export interface AssetSpec<S extends ParamsSchema> {
  readonly id: string;
  readonly kind: AssetKind;
  readonly size: readonly [w: number, h: number];
  readonly palette: Palette;
  readonly clips: Readonly<Record<string, ClipSpec>>;
  /** `["default"]` if not given. */
  readonly facings?: readonly string[];
  /** Required for a sprite; `[0, 0]` otherwise if not given. */
  readonly pivot?: readonly [x: number, y: number];
  readonly params: S;
  /** Named sets of param values, laid over the defaults. */
  readonly presets?: Readonly<Record<string, Partial<ParamValues<NoInfer<S>>>>>;
  /** The curated seeds: the variants worth showing. At least one. */
  readonly variantSeeds: readonly number[];
  /** Uncurated seeds that review sheets always render. `REVIEW_SEEDS` if not given; never edit them to hide a bad result. */
  readonly reviewSeeds?: readonly number[];
  /** Names of stamp files next to the generator: `"face"` is stamps/face.txt. */
  readonly stampFiles?: readonly string[];
  /** One frame. Pure: the same context always gives the same pixels. */
  render(context: RenderContext<NoInfer<S>>): IndexedBuffer;
}

/** A request for one frame. */
export interface RenderRequest<S extends ParamsSchema = ParamsSchema> extends ParamChoice<S> {
  readonly seed: number;
  readonly clip: string;
  readonly frame: number;
  /** The first facing if not given. */
  readonly facing?: string | undefined;
}

/** A defined asset. */
export interface Asset<S extends ParamsSchema = ParamsSchema> {
  readonly format: typeof ASSET_FORMAT;
  readonly meta: AssetMeta;
  readonly palette: Palette;
  /** The params schema. */
  readonly params: S;
  readonly presets: Readonly<Record<string, Partial<ParamValues<S>>>>;
  readonly variantSeeds: readonly number[];
  readonly reviewSeeds: readonly number[];
  readonly stampFiles: readonly string[];
  /** False while an asset with `stampFiles` has not been given their text (see `withStamps`). */
  readonly stampsBound: boolean;
  /** The full, validated params for a choice. Throws on an unknown preset, param or value. */
  resolveParams(choice?: ParamChoice<S>): ParamValues<S>;
  /**
   * Renders one frame and checks it: the frame has the meta's size and uses only indices of
   * the palette. Throws on an unknown clip, frame or facing.
   */
  render(request: RenderRequest<S>): IndexedBuffer;
  /**
   * The same asset with the text of its stamp files. `loadAsset` of @whz/asset-kit/node does
   * this from disk; a bundler-based host does it from imported text.
   */
  withStamps(texts: Readonly<Record<string, string>>): Asset<S>;
}

/** An asset of any params schema. */
export type AnyAsset = Asset<ParamsSchema>;

/** True for an object made by `defineAsset` (of this or another copy of the kit). */
export function isAsset(value: unknown): value is AnyAsset {
  return typeof value === "object" && value !== null && (value as { format?: unknown }).format === ASSET_FORMAT;
}

// ---------------------------------------------------------------------------------------
// Validation

const ASSET_ID = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)+$/;
const NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PARAM_NAME = /^[a-z][A-Za-z0-9]*$/;

function isUint32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function show(value: unknown): string {
  return typeof value === "number" || typeof value === "bigint" ? String(value) : (JSON.stringify(value) ?? String(value));
}

function checkValue(spec: ParamSpec, value: unknown): string | null {
  switch (spec.type) {
    case "int":
      return isIntIn(value, spec.min, spec.max) ? null : `must be an integer in [${spec.min}, ${spec.max}]`;
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? null : `must be one of ${spec.values.join(", ")}`;
    case "bool":
      return typeof value === "boolean" ? null : "must be true or false";
  }
}

function checkSeeds(fail: (message: string) => never, name: string, seeds: readonly number[]): readonly number[] {
  if (!Array.isArray(seeds) || seeds.length === 0) fail(`${name} must list at least one seed`);
  seeds.forEach((seed, i) => {
    if (!isUint32(seed)) fail(`${name}[${i}] must be an integer in [0, 4294967295], got ${show(seed)}`);
  });
  if (new Set(seeds).size !== seeds.length) fail(`${name} lists a seed twice`);
  return Object.freeze([...seeds]);
}

function checkNames(fail: (message: string) => never, what: string, names: readonly string[], pattern: RegExp): void {
  names.forEach((name) => {
    if (typeof name !== "string" || !pattern.test(name)) {
      fail(`${what} ${show(name)} must be lowercase letters, digits and dashes, starting with a letter`);
    }
  });
  if (new Set(names).size !== names.length) fail(`a ${what} is listed twice`);
}

// ---------------------------------------------------------------------------------------

class DefinedAsset<S extends ParamsSchema> implements Asset<S> {
  readonly format = ASSET_FORMAT;
  readonly meta: AssetMeta;
  readonly palette: Palette;
  readonly params: S;
  readonly presets: Readonly<Record<string, Partial<ParamValues<S>>>>;
  readonly variantSeeds: readonly number[];
  readonly reviewSeeds: readonly number[];
  readonly stampFiles: readonly string[];
  readonly stampsBound: boolean;

  private readonly spec: AssetSpec<S>;
  private readonly program: (context: RenderContext<S>) => IndexedBuffer;
  private readonly stamps: Readonly<Record<string, string>>;
  private readonly defaults: ParamValues<S>;

  constructor(spec: AssetSpec<S>, stamps: Readonly<Record<string, string>> | null) {
    const id = typeof spec.id === "string" ? spec.id : "?";
    const fail: (message: string) => never = (message) => {
      throw new Error(`asset ${JSON.stringify(id)}: ${message}`);
    };

    if (typeof spec.id !== "string" || !ASSET_ID.test(spec.id)) {
      fail(`"id" must be <pack>/<name> in lowercase letters, digits and dashes (the folder under assets/), got ${show(spec.id)}`);
    }
    if (!ASSET_KINDS.includes(spec.kind)) fail(`"kind" must be one of ${ASSET_KINDS.join(", ")}, got ${show(spec.kind)}`);
    if (!Array.isArray(spec.size) || spec.size.length !== 2 || !spec.size.every((n) => isIntIn(n, 1, MAX_BUFFER_SIZE))) {
      fail(`"size" must be [w, h] with integers in [1, ${MAX_BUFFER_SIZE}], got ${show(spec.size)}`);
    }
    const [w, h] = spec.size;
    if (!(spec.palette instanceof Palette)) fail(`"palette" must be a Palette (from parsePalette)`);

    // Clips.
    const clipNames = Object.keys(spec.clips ?? {});
    if (clipNames.length === 0) fail(`"clips" must have at least one clip`);
    checkNames(fail, "clip name", clipNames, NAME);
    const clips = clipNames.map((name): ClipMeta => {
      const clip = spec.clips[name] as ClipSpec;
      if (!isIntIn(clip.frames, 1, MAX_CLIP_FRAMES)) {
        fail(`clip ${show(name)}: "frames" must be an integer in [1, ${MAX_CLIP_FRAMES}], got ${show(clip.frames)}`);
      }
      const durations =
        typeof clip.durations === "number" ? new Array<number>(clip.frames).fill(clip.durations) : [...(clip.durations ?? [])];
      if (durations.length !== clip.frames) {
        fail(`clip ${show(name)}: ${durations.length} durations for ${clip.frames} frames`);
      }
      durations.forEach((ms, i) => {
        if (!isIntIn(ms, 1, 600000)) {
          fail(`clip ${show(name)}: the duration of frame ${i} must be whole milliseconds in [1, 600000], got ${show(ms)}`);
        }
      });
      if (clip.loop !== undefined && typeof clip.loop !== "boolean") fail(`clip ${show(name)}: "loop" must be true or false`);
      return Object.freeze({ name, frames: clip.frames, durations: Object.freeze(durations), loop: clip.loop ?? true });
    });

    // Facings and pivot.
    const facings = spec.facings ?? ["default"];
    if (!Array.isArray(facings) || facings.length === 0) fail(`"facings" must list at least one facing`);
    checkNames(fail, "facing", facings, NAME);
    if (spec.pivot === undefined && spec.kind === "sprite") {
      fail(`a sprite needs a "pivot": the [x, y] pixel that sits on its position (for a character, between the feet)`);
    }
    const pivot = spec.pivot ?? [0, 0];
    if (!Array.isArray(pivot) || pivot.length !== 2 || !isIntIn(pivot[0], 0, w) || !isIntIn(pivot[1], 0, h)) {
      fail(`"pivot" must be [x, y] with 0 <= x <= ${w} and 0 <= y <= ${h}, got ${show(spec.pivot)}`);
    }

    // Params and presets.
    const defaults: Record<string, ParamValue> = {};
    for (const [name, param] of Object.entries(spec.params ?? fail(`"params" is missing (use {} for none)`))) {
      const where = `param ${show(name)}`;
      if (!PARAM_NAME.test(name)) fail(`${where}: a param name is camelCase letters and digits`);
      if (param.type === "int") {
        if (!Number.isSafeInteger(param.min) || !Number.isSafeInteger(param.max) || param.min > param.max) {
          fail(`${where}: "min" and "max" must be integers with min <= max`);
        }
      } else if (param.type === "enum") {
        if (!Array.isArray(param.values) || param.values.length === 0) fail(`${where}: "values" must list at least one name`);
        if (!param.values.every((value) => typeof value === "string" && value !== "")) fail(`${where}: "values" must be names`);
        if (new Set(param.values).size !== param.values.length) fail(`${where}: "values" lists a name twice`);
      } else if (param.type !== "bool") {
        fail(`${where}: "type" must be int, enum or bool, got ${show((param as { type?: unknown }).type)}`);
      }
      const problem = checkValue(param, param.default);
      if (problem !== null) fail(`${where}: "default" ${problem}, got ${show(param.default)}`);
      if (typeof param.description !== "string" || param.description.trim() === "" || param.description.includes("\n")) {
        fail(`${where}: "description" must be one line saying what the param changes`);
      }
      defaults[name] = param.default;
    }
    const presets = spec.presets ?? {};
    checkNames(fail, "preset name", Object.keys(presets), NAME);

    // Seeds and stamp files.
    const variantSeeds = checkSeeds(fail, `"variantSeeds"`, spec.variantSeeds);
    const reviewSeeds = checkSeeds(fail, `"reviewSeeds"`, spec.reviewSeeds ?? REVIEW_SEEDS);
    const stampFiles = spec.stampFiles ?? [];
    if (!Array.isArray(stampFiles)) fail(`"stampFiles" must be a list of names`);
    checkNames(fail, "stamp file name", stampFiles, NAME);
    if (typeof spec.render !== "function") fail(`"render" must be a function`);

    if (stamps !== null) {
      for (const name of stampFiles) {
        if (typeof stamps[name] !== "string") fail(`withStamps: the text of stamp file ${show(name)} (stamps/${name}.txt) is missing`);
      }
      for (const name of Object.keys(stamps)) {
        if (!stampFiles.includes(name)) fail(`withStamps: ${show(name)} is not in "stampFiles"`);
      }
    }

    this.meta = Object.freeze({
      id: spec.id,
      kind: spec.kind,
      size: Object.freeze([w, h] as const),
      paletteId: spec.palette.id,
      clips: Object.freeze(clips),
      facings: Object.freeze([...facings]),
      pivot: Object.freeze([pivot[0], pivot[1]] as const),
    });
    this.palette = spec.palette;
    this.params = spec.params;
    this.presets = presets as Readonly<Record<string, Partial<ParamValues<S>>>>;
    this.variantSeeds = variantSeeds;
    this.reviewSeeds = reviewSeeds;
    this.stampFiles = Object.freeze([...stampFiles]);
    this.stampsBound = stampFiles.length === 0 || stamps !== null;
    this.program = spec.render.bind(spec) as (context: RenderContext<S>) => IndexedBuffer;
    this.stamps = Object.freeze({ ...(stamps ?? {}) });
    this.defaults = defaults as ParamValues<S>;
    this.spec = spec;

    // Every preset must resolve, so a typo shows when the asset is defined, not when it is picked.
    for (const name of Object.keys(presets)) this.resolveParams({ preset: name });
  }

  private fail(message: string): never {
    throw new Error(`asset ${JSON.stringify(this.meta.id)}: ${message}`);
  }

  resolveParams(choice: ParamChoice<S> = {}): ParamValues<S> {
    const values: Record<string, unknown> = { ...this.defaults };
    const layers: [string, Readonly<Record<string, unknown>>][] = [];
    if (choice.preset !== undefined) {
      const preset = Object.hasOwn(this.presets, choice.preset) ? this.presets[choice.preset] : undefined;
      if (preset === undefined) {
        this.fail(`no preset named ${show(choice.preset)} (presets: ${Object.keys(this.presets).join(", ") || "none"})`);
      }
      layers.push([`preset ${show(choice.preset)}`, preset]);
    }
    if (choice.params !== undefined) layers.push(["params", choice.params]);
    for (const [where, layer] of layers) {
      for (const [name, value] of Object.entries(layer)) {
        const param = Object.hasOwn(this.params, name) ? this.params[name] : undefined;
        if (param === undefined) {
          this.fail(`${where}: no param named ${show(name)} (params: ${Object.keys(this.params).join(", ") || "none"})`);
        }
        const problem = checkValue(param, value);
        if (problem !== null) this.fail(`${where}: ${name} ${problem}, got ${show(value)}`);
        values[name] = value;
      }
    }
    return Object.freeze(values) as ParamValues<S>;
  }

  render(request: RenderRequest<S>): IndexedBuffer {
    const { meta } = this;
    if (!isUint32(request.seed)) this.fail(`the seed must be an integer in [0, 4294967295], got ${show(request.seed)}`);
    const clip = meta.clips.find((candidate) => candidate.name === request.clip);
    if (clip === undefined) {
      this.fail(`no clip named ${show(request.clip)} (clips: ${meta.clips.map((candidate) => candidate.name).join(", ")})`);
    }
    if (!isIntIn(request.frame, 0, clip.frames - 1)) {
      this.fail(`clip ${show(clip.name)} has frames 0..${clip.frames - 1}, got ${show(request.frame)}`);
    }
    const facing = request.facing ?? (meta.facings[0] as string);
    if (!meta.facings.includes(facing)) this.fail(`no facing named ${show(facing)} (facings: ${meta.facings.join(", ")})`);
    if (!this.stampsBound) {
      this.fail(
        `needs its stamp files (${this.stampFiles.map((name) => `stamps/${name}.txt`).join(", ")}): ` +
          `load it with loadAsset from @whz/asset-kit/node, or give their text with withStamps()`,
      );
    }

    const frame = this.program({
      params: this.resolveParams(request),
      seed: request.seed,
      clip: clip.name,
      frame: request.frame,
      facing,
      stamps: this.stamps,
    });

    const where = `clip ${show(clip.name)}, facing ${show(facing)}, frame ${request.frame}`;
    if (typeof frame !== "object" || frame === null || !(frame.data instanceof Uint8Array)) {
      this.fail(`${where}: render must return an IndexedBuffer`);
    }
    const [w, h] = meta.size;
    if (frame.w !== w || frame.h !== h || frame.data.length !== w * h) {
      this.fail(`${where}: render returned ${frame.w} x ${frame.h}, but "size" is ${w} x ${h}`);
    }
    const slots = this.palette.size;
    for (let i = 0; i < frame.data.length; i += 1) {
      const index = frame.data[i] as number;
      if (index >= slots) {
        this.fail(
          `${where}: pixel (${i % w}, ${Math.floor(i / w)}) has index ${index}, but palette ${show(meta.paletteId)} has only ${slots} slots`,
        );
      }
    }
    return frame;
  }

  withStamps(texts: Readonly<Record<string, string>>): Asset<S> {
    return new DefinedAsset(this.spec, texts);
  }
}

/**
 * Defines an asset. Checks the whole definition and throws an error that names the asset and
 * the field. The result is the default export of the asset's gen.ts.
 */
export function defineAsset<const S extends ParamsSchema>(spec: AssetSpec<S>): Asset<S> {
  return new DefinedAsset<S>(spec, null);
}
