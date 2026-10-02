// The atlas: the part of a bake's atlas.json (`format: "wz.atlas/1"`, docs/asset-pipeline.md)
// the runtime needs to draw. The runtime does not depend on the asset kit: the format is the
// contract, and `parseAtlas` checks a file against it. The asset kit's own `Atlas` type has
// these fields and more, so an atlas baked in memory can be passed without a round trip.

/** The `format` value the runtime reads. */
export const ATLAS_FORMAT = "wz.atlas/1";

/** The largest width or height of a sheet (the asset kit's limit). */
export const MAX_SHEET_SIZE = 4096;

/** One frame: where it is in the sheet and how long it is shown. */
export interface AtlasFrame {
  /** Its place in `frames`. A sprite of the draw list names a frame by this number. */
  readonly index: number;
  readonly clip: string;
  readonly facing: string;
  /** The frame number inside the clip, from 0. */
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Milliseconds. */
  readonly duration: number;
}

/** One clip. It has the fields the clip player needs (`ClipTiming`). */
export interface AtlasClip {
  readonly name: string;
  readonly frames: number;
  /** One duration per frame, in whole milliseconds. */
  readonly durations: readonly number[];
  readonly loop: boolean;
  /** Per facing: the `index` of the clip's first frame. The clip's frames follow it. */
  readonly start: Readonly<Record<string, number>>;
}

/** One baked variant: a seed and the file name of its sheet. */
export interface AtlasVariant {
  readonly seed: number;
  readonly sheet: string;
}

export interface Atlas {
  readonly format: typeof ATLAS_FORMAT;
  readonly id: string;
  /** Frame width and height. Every frame has this size. */
  readonly size: readonly [number, number];
  /** The pixel of a frame that sits on a sprite's position. */
  readonly pivot: readonly [number, number];
  readonly palette: {
    readonly id: string;
    /** `#rrggbb` per slot. Slot 0 is transparent. */
    readonly colors: readonly string[];
  };
  readonly clips: readonly AtlasClip[];
  readonly facings: readonly string[];
  readonly sheet: { readonly w: number; readonly h: number };
  readonly frames: readonly AtlasFrame[];
  readonly variants: readonly AtlasVariant[];
}

const COLOR = /^#[0-9a-f]{6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

const show = (value: unknown): string => JSON.stringify(value) ?? String(value);

/**
 * Checks the content of an atlas.json and returns the fields the runtime uses, frozen.
 * Throws an error that names the atlas and the field.
 */
export function parseAtlas(json: unknown): Atlas {
  if (!isRecord(json)) throw new Error("atlas: the file must hold a JSON object");
  const id = typeof json["id"] === "string" ? json["id"] : "?";
  const fail = (message: string): never => {
    throw new Error(`atlas ${show(id)}: ${message}`);
  };
  const list = (value: unknown, field: string): unknown[] => {
    if (!Array.isArray(value) || value.length === 0) return fail(`"${field}" must be a list with at least one entry`);
    return value;
  };
  const record = (value: unknown, field: string): Record<string, unknown> => (isRecord(value) ? value : fail(`${field} must be an object`));
  const pair = (value: unknown, field: string, min: number, max: number): readonly [number, number] => {
    if (!Array.isArray(value) || value.length !== 2 || !isInt(value[0], min, max) || !isInt(value[1], min, max)) {
      return fail(`"${field}" must be two integers in [${min}, ${max}], got ${show(value)}`);
    }
    return Object.freeze([value[0], value[1]] as const);
  };

  if (json["format"] !== ATLAS_FORMAT) fail(`"format" must be ${show(ATLAS_FORMAT)}, got ${show(json["format"])}`);
  if (typeof json["id"] !== "string" || json["id"] === "") fail(`"id" must be a non-empty string`);

  const size = pair(json["size"], "size", 1, MAX_SHEET_SIZE);
  const [fw, fh] = size;
  const pivot = pair(json["pivot"], "pivot", -MAX_SHEET_SIZE, MAX_SHEET_SIZE);

  const rawPalette = record(json["palette"], `"palette"`);
  if (typeof rawPalette["id"] !== "string") fail(`"palette.id" must be a string`);
  const colors = list(rawPalette["colors"], "palette.colors").map((color, slot) => {
    if (typeof color !== "string" || !COLOR.test(color)) return fail(`palette.colors[${slot}] must be "#rrggbb" in lowercase hex, got ${show(color)}`);
    return color;
  });
  if (colors.length > 256) fail(`palette.colors has ${colors.length} slots, but an index is one byte: at most 256`);

  const facings = list(json["facings"], "facings").map((facing, i) => {
    if (typeof facing !== "string" || facing === "") return fail(`facings[${i}] must be a non-empty string`);
    return facing;
  });
  if (new Set(facings).size !== facings.length) fail(`"facings" names a facing twice: ${show(facings)}`);

  const rawSheet = record(json["sheet"], `"sheet"`);
  const sheetW = rawSheet["w"];
  const sheetH = rawSheet["h"];
  if (!isInt(sheetW, 1, MAX_SHEET_SIZE) || !isInt(sheetH, 1, MAX_SHEET_SIZE)) {
    return fail(`"sheet.w" and "sheet.h" must be integers in [1, ${MAX_SHEET_SIZE}], got ${show(sheetW)} x ${show(sheetH)}`);
  }

  const rawFrames = list(json["frames"], "frames");

  const clipNames = new Set<string>();
  const clips = list(json["clips"], "clips").map((raw, i): AtlasClip => {
    const clip = record(raw, `clips[${i}]`);
    const name = clip["name"];
    if (typeof name !== "string" || name === "") return fail(`clips[${i}].name must be a non-empty string`);
    if (clipNames.has(name)) fail(`the clip ${show(name)} is listed twice`);
    clipNames.add(name);
    const frames = clip["frames"];
    if (!isInt(frames, 1, rawFrames.length)) return fail(`clip ${show(name)}: "frames" must be an integer in [1, ${rawFrames.length}], got ${show(frames)}`);
    const durations = clip["durations"];
    if (!Array.isArray(durations) || durations.length !== frames) return fail(`clip ${show(name)}: "durations" must list ${frames} durations`);
    durations.forEach((ms: unknown, frame) => {
      if (!isInt(ms, 1, 600000)) fail(`clip ${show(name)}: the duration of frame ${frame} must be whole milliseconds in [1, 600000], got ${show(ms)}`);
    });
    if (typeof clip["loop"] !== "boolean") fail(`clip ${show(name)}: "loop" must be true or false`);
    const rawStart = record(clip["start"], `clip ${show(name)}: "start"`);
    const start: Record<string, number> = {};
    for (const facing of facings) {
      const first = rawStart[facing];
      if (!isInt(first, 0, rawFrames.length - frames)) {
        return fail(`clip ${show(name)}: start.${facing} must be the index of its first frame (0..${rawFrames.length - frames}), got ${show(first)}`);
      }
      start[facing] = first;
    }
    return Object.freeze({ name, frames, durations: Object.freeze([...(durations as number[])]), loop: clip["loop"] as boolean, start: Object.freeze(start) });
  });
  const clipByName = new Map(clips.map((clip) => [clip.name, clip]));

  const frames = rawFrames.map((raw, i): AtlasFrame => {
    const frame = record(raw, `frames[${i}]`);
    const where = `frames[${i}]`;
    if (frame["index"] !== i) fail(`${where}.index must be ${i}, got ${show(frame["index"])}`);
    const clipName = frame["clip"];
    const clip = typeof clipName === "string" ? clipByName.get(clipName) : undefined;
    if (clip === undefined) return fail(`${where}.clip ${show(clipName)} is not a clip of the atlas`);
    const facing = frame["facing"];
    if (typeof facing !== "string" || !facings.includes(facing)) return fail(`${where}.facing ${show(facing)} is not a facing of the atlas`);
    const n = frame["frame"];
    if (!isInt(n, 0, clip.frames - 1)) return fail(`${where}.frame must be in [0, ${clip.frames - 1}], got ${show(n)}`);
    if ((clip.start[facing] as number) + n !== i) {
      fail(`${where} is frame ${n} of ${clip.name}.${facing}, but that clip starts at index ${show(clip.start[facing])}`);
    }
    const { x, y, w, h } = frame;
    if (w !== fw || h !== fh) fail(`${where} is ${show(w)} x ${show(h)}, but every frame must be ${fw} x ${fh}`);
    if (!isInt(x, 0, sheetW - fw) || !isInt(y, 0, sheetH - fh)) {
      return fail(`${where} at (${show(x)}, ${show(y)}) is not inside the ${sheetW} x ${sheetH} sheet`);
    }
    const duration = frame["duration"];
    if (duration !== clip.durations[n]) fail(`${where}.duration is ${show(duration)}, but the clip says ${show(clip.durations[n])}`);
    return Object.freeze({ index: i, clip: clip.name, facing, frame: n, x, y, w: fw, h: fh, duration: clip.durations[n] as number });
  });

  const seeds = new Set<number>();
  const variants = list(json["variants"], "variants").map((raw, i): AtlasVariant => {
    const variant = record(raw, `variants[${i}]`);
    const seed = variant["seed"];
    if (typeof seed !== "number" || !Number.isSafeInteger(seed)) return fail(`variants[${i}].seed must be an integer, got ${show(seed)}`);
    if (seeds.has(seed)) fail(`the variant seed ${seed} is listed twice`);
    seeds.add(seed);
    const sheet = variant["sheet"];
    if (typeof sheet !== "string" || sheet === "") return fail(`variants[${i}].sheet must be a file name`);
    return Object.freeze({ seed, sheet });
  });

  return Object.freeze({
    format: ATLAS_FORMAT,
    id: json["id"] as string,
    size,
    pivot,
    palette: Object.freeze({ id: rawPalette["id"] as string, colors: Object.freeze(colors) }),
    clips: Object.freeze(clips),
    facings: Object.freeze(facings),
    sheet: Object.freeze({ w: sheetW, h: sheetH }),
    frames: Object.freeze(frames),
    variants: Object.freeze(variants),
  });
}

/** The clip of that name. Throws on an unknown name. */
export function findClip(atlas: Atlas, name: string): AtlasClip {
  const clip = atlas.clips.find((candidate) => candidate.name === name);
  if (clip === undefined) {
    throw new Error(`atlas ${show(atlas.id)}: no clip named ${show(name)} (clips: ${atlas.clips.map((candidate) => candidate.name).join(", ")})`);
  }
  return clip;
}

/** The variant of that seed; without a seed, the first one. Throws on an unknown seed. */
export function findVariant(atlas: Atlas, seed?: number): AtlasVariant {
  const variant = seed === undefined ? atlas.variants[0] : atlas.variants.find((candidate) => candidate.seed === seed);
  if (variant === undefined) {
    throw new Error(`atlas ${show(atlas.id)}: no variant with seed ${show(seed)} (seeds: ${atlas.variants.map((candidate) => candidate.seed).join(", ")})`);
  }
  return variant;
}

/**
 * The atlas frame index of frame `frame` of a clip, for a facing (the first facing if not
 * given). This is the number a sprite of the draw list takes; `clipFrame` gives `frame`.
 */
export function frameIndex(atlas: Atlas, clip: string, frame: number, facing?: string): number {
  const found = findClip(atlas, clip);
  const side = facing ?? (atlas.facings[0] as string);
  const start = found.start[side];
  if (start === undefined) {
    throw new Error(`atlas ${show(atlas.id)}: no facing named ${show(side)} (facings: ${atlas.facings.join(", ")})`);
  }
  if (!isInt(frame, 0, found.frames - 1)) {
    throw new RangeError(`atlas ${show(atlas.id)}: clip ${show(clip)} has frames 0..${found.frames - 1}, got ${show(frame)}`);
  }
  return start + frame;
}
