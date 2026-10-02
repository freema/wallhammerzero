// Palettes as data. A palette is a JSON file, assets/palettes/<id>.json:
//
//   {
//     "format": "wz.palette/1",
//     "id": "example",
//     "about": "optional free text",
//     "slots": [
//       { "name": "transparent", "rgb": "#000000" },
//       { "name": "ink", "rgb": "#3b2f4a" },
//       { "name": "shadow", "rgb": "#1c1626" },
//       { "name": "red.0", "rgb": "#8f2d4a" }
//     ],
//     "ramps": { "red": ["red.0", "red.1", "red.2"] }
//   }
//
// A slot's position in `slots` is its palette index. Slot 0 is always `transparent`; `ink`
// (the outline colour) and `shadow` (the ground shadow) must exist. A ramp lists slots from
// dark to light. Ramps are built by hand; there is no generator. Asset programs name slots
// and never write RGB, so the same frames can be shown with another palette.

/** The `format` value of a palette file. */
export const PALETTE_FORMAT = "wz.palette/1";
/** The most slots a palette can have: an index is one byte. */
export const MAX_PALETTE_SLOTS = 256;

const NAME = /^[a-z][a-z0-9]*([.-][a-z0-9]+)*$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RGB = /^#[0-9a-f]{6}$/;
const LEGEND_KEY = /^[A-Za-z0-9]$/;

/** One colour of a palette. */
export interface PaletteSlot {
  readonly index: number;
  readonly name: string;
  /** Red, green and blue, 0..255. */
  readonly rgb: readonly [number, number, number];
}

/** A stamp legend: one character per palette index. */
export type Legend = Readonly<Record<string, number>>;

function fail(id: string, message: string): never {
  throw new Error(`palette ${JSON.stringify(id)}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Perceived brightness of a colour as an integer (0 .. 255000), for ordering ramps. */
function luma(rgb: readonly [number, number, number]): number {
  return 299 * rgb[0] + 587 * rgb[1] + 114 * rgb[2];
}

export class Palette {
  readonly id: string;
  /** All slots, in index order. `slots[0]` is `transparent`. */
  readonly slots: readonly PaletteSlot[];
  /** The index of the reserved outline colour. */
  readonly ink: number;
  /** The index of the reserved ground-shadow colour. */
  readonly shadow: number;
  /** The names of the ramps, in file order. */
  readonly rampNames: readonly string[];

  private readonly byName: ReadonlyMap<string, number>;
  private readonly ramps: ReadonlyMap<string, readonly number[]>;

  /** Use `parsePalette`. */
  constructor(id: string, slots: readonly PaletteSlot[], ramps: ReadonlyMap<string, readonly number[]>) {
    this.id = id;
    this.slots = Object.freeze([...slots]);
    this.byName = new Map(slots.map((slot) => [slot.name, slot.index]));
    this.ramps = ramps;
    this.rampNames = Object.freeze([...ramps.keys()]);
    this.ink = this.slot("ink");
    this.shadow = this.slot("shadow");
  }

  /** The number of slots, transparent included. Valid indices are `0 .. size - 1`. */
  get size(): number {
    return this.slots.length;
  }

  /** True if the palette has a slot of that name. */
  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** The palette index of a named slot. Throws on an unknown name. */
  slot(name: string): number {
    const index = this.byName.get(name);
    if (index === undefined) fail(this.id, `no slot named ${JSON.stringify(name)}`);
    return index;
  }

  /** The palette indices of a named ramp, dark to light. Throws on an unknown name. */
  ramp(name: string): readonly number[] {
    const indices = this.ramps.get(name);
    if (indices === undefined) {
      fail(this.id, `no ramp named ${JSON.stringify(name)} (ramps: ${this.rampNames.join(", ") || "none"})`);
    }
    return indices;
  }

  /**
   * A stamp legend from slot names: `legend({ o: "ink", r: "red.2", R: "red.1" })`.
   * A key is one letter or digit. By convention a lowercase letter is the light colour of a
   * material and the uppercase letter its shade, so when both are given the uppercase slot
   * must be the darker one.
   */
  legend(names: Readonly<Record<string, string>>): Legend {
    const legend: Record<string, number> = {};
    for (const [key, name] of Object.entries(names)) {
      if (!LEGEND_KEY.test(key)) {
        fail(this.id, `legend key ${JSON.stringify(key)} must be one letter or digit ("." is always transparent)`);
      }
      const index = this.slot(name);
      if (index === 0) fail(this.id, `legend key ${JSON.stringify(key)}: write "." for transparent pixels`);
      legend[key] = index;
    }
    for (const [key, index] of Object.entries(legend)) {
      const upper = key.toUpperCase();
      if (key === upper || legend[upper] === undefined) continue;
      const light = this.slots[index] as PaletteSlot;
      const shade = this.slots[legend[upper]] as PaletteSlot;
      if (luma(shade.rgb) >= luma(light.rgb)) {
        fail(
          this.id,
          `legend: "${upper}" (${shade.name}) must be darker than "${key}" (${light.name}): uppercase is the shade of the lowercase material`,
        );
      }
    }
    return Object.freeze(legend);
  }

  /** The colours as RGBA bytes, four per slot; slot 0 has alpha 0, the others 255. */
  rgba(): Uint8Array {
    const out = new Uint8Array(this.slots.length * 4);
    for (const slot of this.slots) {
      out.set(slot.rgb, slot.index * 4);
      out[slot.index * 4 + 3] = slot.index === 0 ? 0 : 255;
    }
    return out;
  }
}

/**
 * Validates the content of a palette JSON file and returns the palette. Throws an error that
 * names the palette and the field.
 */
export function parsePalette(json: unknown): Palette {
  if (!isRecord(json)) throw new Error("palette: the file must hold a JSON object");
  const id = typeof json["id"] === "string" ? json["id"] : "?";
  if (json["format"] !== PALETTE_FORMAT) {
    fail(id, `"format" must be ${JSON.stringify(PALETTE_FORMAT)}, got ${JSON.stringify(json["format"])}`);
  }
  if (typeof json["id"] !== "string" || !ID.test(json["id"])) {
    fail(id, `"id" must be lowercase letters, digits and dashes, got ${JSON.stringify(json["id"])}`);
  }
  for (const key of Object.keys(json)) {
    if (!["format", "id", "about", "slots", "ramps"].includes(key)) fail(id, `unknown field ${JSON.stringify(key)}`);
  }
  if (json["about"] !== undefined && typeof json["about"] !== "string") fail(id, `"about" must be a string`);

  const rawSlots = json["slots"];
  if (!Array.isArray(rawSlots)) fail(id, `"slots" must be a list`);
  if (rawSlots.length > MAX_PALETTE_SLOTS) {
    fail(id, `${rawSlots.length} slots, but an index is one byte: at most ${MAX_PALETTE_SLOTS}`);
  }
  const slots: PaletteSlot[] = [];
  const seen = new Set<string>();
  rawSlots.forEach((raw: unknown, index) => {
    const where = `slots[${index}]`;
    if (!isRecord(raw)) fail(id, `${where} must be an object with "name" and "rgb"`);
    for (const key of Object.keys(raw)) {
      if (key !== "name" && key !== "rgb") fail(id, `${where}: unknown field ${JSON.stringify(key)}`);
    }
    const name = raw["name"];
    const rgb = raw["rgb"];
    if (typeof name !== "string" || !NAME.test(name)) {
      fail(id, `${where}.name must look like "skin.2" (lowercase letters, digits, "." and "-"), got ${JSON.stringify(name)}`);
    }
    if (seen.has(name)) fail(id, `${where}: the name ${JSON.stringify(name)} is used twice`);
    seen.add(name);
    if (typeof rgb !== "string" || !RGB.test(rgb)) {
      fail(id, `${where}.rgb must be "#rrggbb" in lowercase hex, got ${JSON.stringify(rgb)}`);
    }
    const value = Number.parseInt(rgb.slice(1), 16);
    slots.push({ index, name, rgb: Object.freeze([value >>> 16, (value >>> 8) & 0xff, value & 0xff] as const) });
  });
  const first = slots[0];
  if (first === undefined || first.name !== "transparent") {
    fail(id, `slots[0] must be { "name": "transparent", "rgb": "#000000" }: index 0 is the transparent pixel`);
  }
  if (luma(first.rgb) !== 0) fail(id, `slots[0] (transparent) must have rgb "#000000"`);
  for (const reserved of ["ink", "shadow"]) {
    if (!seen.has(reserved)) fail(id, `the reserved slot ${JSON.stringify(reserved)} is missing`);
  }

  const rawRamps = json["ramps"] ?? {};
  if (!isRecord(rawRamps)) fail(id, `"ramps" must be an object of ramp name -> list of slot names`);
  const byName = new Map(slots.map((slot) => [slot.name, slot]));
  const ramps = new Map<string, readonly number[]>();
  for (const [rampName, rawRamp] of Object.entries(rawRamps)) {
    const where = `ramps.${rampName}`;
    if (!NAME.test(rampName)) fail(id, `${where}: a ramp name looks like a slot name, e.g. "skin"`);
    if (!Array.isArray(rawRamp) || rawRamp.length < 2) fail(id, `${where} must list at least two slot names`);
    const indices: number[] = [];
    let previous: PaletteSlot | undefined;
    for (const slotName of rawRamp as unknown[]) {
      const slot = typeof slotName === "string" ? byName.get(slotName) : undefined;
      if (slot === undefined) fail(id, `${where}: no slot named ${JSON.stringify(slotName)}`);
      if (slot.index === 0) fail(id, `${where}: "transparent" cannot be part of a ramp`);
      if (previous !== undefined && luma(slot.rgb) <= luma(previous.rgb)) {
        fail(id, `${where} must go from dark to light, but ${slot.name} is not lighter than ${previous.name}`);
      }
      indices.push(slot.index);
      previous = slot;
    }
    ramps.set(rampName, Object.freeze(indices));
  }

  return new Palette(json["id"], slots.map((slot) => Object.freeze(slot)), ramps);
}
