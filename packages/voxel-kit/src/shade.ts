// Shading by palette ramps. A voxel holds a palette index; light never makes a new colour, it
// moves the index along the ramp the slot belongs to (dark -> light) and stops at the ends.
// A slot that is in no ramp is "flat": it is drawn as it is on every face.
//
// A slot that two ramps list belongs to the first of them, in the order the model gives its
// ramps (the palette's own order if it gives none).

import type { Palette } from "@whz/asset-kit";

/** A voxel colour as an author writes it: a slot name, a palette index, or `[ramp, step]`. */
export type Material = string | number | readonly [ramp: string, step: number];

export class ShadeTable {
  readonly palette: Palette;
  /** The ramps the table knows, in lookup order. */
  readonly ramps: readonly string[];

  private readonly rampAt: Int16Array;
  private readonly stepAt: Uint8Array;
  private readonly slots: readonly (readonly number[])[];

  /** `ramps`: the ramps to shade along, in lookup order; all ramps of the palette if not given. */
  constructor(palette: Palette, ramps: readonly string[] = palette.rampNames) {
    this.palette = palette;
    this.ramps = Object.freeze([...ramps]);
    this.rampAt = new Int16Array(256).fill(-1);
    this.stepAt = new Uint8Array(256);
    this.slots = this.ramps.map((name) => palette.ramp(name));
    this.slots.forEach((indices, ramp) => {
      indices.forEach((index, step) => {
        if (this.rampAt[index] !== -1) return;
        this.rampAt[index] = ramp;
        this.stepAt[index] = step;
      });
    });
  }

  /** The name of the ramp a palette index is shaded along, or null for a flat slot. */
  rampOf(index: number): string | null {
    const ramp = this.rampAt[index];
    return ramp === undefined || ramp < 0 ? null : (this.ramps[ramp] as string);
  }

  /** The step of a palette index in its ramp (0 = darkest), or -1 for a flat slot. */
  stepOf(index: number): number {
    const ramp = this.rampAt[index];
    return ramp === undefined || ramp < 0 ? -1 : (this.stepAt[index] as number);
  }

  /** The index `delta` steps along the ramp (positive: lighter), stopping at its ends. A flat slot stays. */
  shift(index: number, delta: number): number {
    const ramp = this.rampAt[index];
    if (ramp === undefined || ramp < 0) return index;
    const slots = this.slots[ramp] as readonly number[];
    const step = Math.min(slots.length - 1, Math.max(0, (this.stepAt[index] as number) + delta));
    return slots[step] as number;
  }

  /** The darkest step of the ramp of a palette index; the palette's ink for a flat slot. */
  darkest(index: number): number {
    const ramp = this.rampAt[index];
    if (ramp === undefined || ramp < 0) return this.palette.ink;
    return (this.slots[ramp] as readonly number[])[0] as number;
  }
}

/**
 * The palette index of a material. Throws on an unknown slot or ramp, on a step the ramp does
 * not have, and on the transparent slot (an empty voxel is carved, not painted).
 */
export function materialIndex(palette: Palette, material: Material): number {
  let index: number;
  if (typeof material === "number") {
    if (!Number.isInteger(material) || material < 0 || material >= palette.size) {
      throw new RangeError(`material ${String(material)}: palette "${palette.id}" has the indices 1..${palette.size - 1}`);
    }
    index = material;
  } else if (typeof material === "string") {
    index = palette.slot(material);
  } else {
    const [name, step] = material;
    const ramp = palette.ramp(name);
    if (!Number.isInteger(step) || step < 0 || step >= ramp.length) {
      throw new RangeError(`material ["${name}", ${String(step)}]: the ramp "${name}" of palette "${palette.id}" has the steps 0..${ramp.length - 1}`);
    }
    index = ramp[step] as number;
  }
  if (index === 0) throw new RangeError(`material ${JSON.stringify(material)}: a voxel cannot be painted transparent; carve it`);
  return index;
}
