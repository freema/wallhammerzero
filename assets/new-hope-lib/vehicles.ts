// The flying cars of New Hope: one hover-car rig for every body (the taxi, the Union cruiser),
// baked to 2:1 iso in the four facings.
//
// A car is 4 x 7 x 8 voxels (x across, y up, z along: the nose points along +z): a footprint of
// 1 x 2 tiles. It hovers one voxel over the ground and bobs one more, so the model's box is
// 4 x 9 x 8, under one storey of 12.
//
//   y 6      on the roof: a taxi sign or a light bar (optional)
//   y 5      the roof panel
//   y 3..4   the cabin's windows, set back: a long bonnet in front, a short boot behind; the
//            upper row is a voxel shorter at the front, so the windscreen leans back
//   y 1..2   the body; headlights (cold white) on the nose, tail lights (pink) on the tail
//   y 0      the skirt: steel inside, the underglow along its two long sides
//
// The facing is read from the ends: white headlights, a long bonnet and a leaning windscreen at
// the front, pink tail lights and a short boot at the back. The underglow and the lights are flat slots (they emit),
// and the contact shadow under the car is recoloured to the dim step of the underglow: a pool
// of light on the ground.
//
// Clips: `idle` (4 frames: the hover bob of one voxel, the underglow pulsing between its
// bright and dim slot so no two neighbouring frames are the same) and `fly` (4 frames, held one
// voxel up: the lights blink).

import { defineAsset } from "@whz/asset-kit";
import type { AnyAsset, IndexedBuffer, ParamsSchema, ParamValues } from "@whz/asset-kit";
import { bakeIso, defineModel, ISO_FACINGS, isoFrame, VoxelBuilder } from "@whz/voxel-kit";
import type { Material, SculptBox, VoxelModel } from "@whz/voxel-kit";
import { FLAT_SLOTS, OUTLINE_SLOTS, palette } from "./style.ts";

/** The car itself, x by y by z. */
const BODY = [4, 7, 8] as const;
/** The model's box: the car, the gap under it and the voxel it bobs up. */
export const CAR_SIZE = [4, 9, 8] as const;
/** The outline, one empty pixel, and the shadow pool, which reaches a voxel past the car. */
export const CAR_MARGIN = 3;
export const CAR_FRAME = isoFrame(CAR_SIZE, CAR_MARGIN);

/** The underglows a car can have: the neon slots that have a dim step for the pool on the ground. */
export const GLOWS = { "neon-cyan": "neon-cyan-dim", "neon-pink": "neon-pink-dim" } as const;
export type Glow = keyof typeof GLOWS;

/** What a car body looks like. */
export interface CarLook {
  /** The body, the bonnet, the boot and the roof panel. */
  readonly body: Material;
  /** A stripe along the body's lower row (null: the body colour). */
  readonly stripe: Material | null;
  /** The skirt under the body and the pillars of the cabin. */
  readonly trim: Material;
  readonly glass: Material;
  readonly glow: Glow;
  /** What sits on the roof: a lit taxi sign, a two-colour light bar, or nothing. */
  readonly roof: "taxi-sign" | "light-bar" | "none";
}

/** Which lights are lit in one frame. */
export interface CarLights {
  /** The underglow strip in its bright slot (else its dim one). */
  readonly glow: boolean;
  readonly tail: boolean;
  /** For a light bar: which half is lit, the pink one (0) or the cyan one (1). */
  readonly bar: 0 | 1;
}

/** The car's grid at rest, for one set of lights. */
function carGrid(look: CarLook, lights: CarLights): VoxelBuilder {
  const [nx, , nz] = BODY;
  const glow = lights.glow ? look.glow : GLOWS[look.glow];
  const boxes: SculptBox[] = [
    // The skirt: steel inside, the underglow on its long sides, a voxel short of either end.
    { a: [0, 0, 1], b: [nx, 1, nz - 1], c: glow },
    { a: [1, 0, 1], b: [nx - 1, 1, nz - 1], c: look.trim },
    // The body, its corners rounded off at the top.
    { a: [0, 1, 0], b: [nx, 3, nz], c: look.body },
    ...(look.stripe === null ? [] : [{ a: [0, 1, 0], b: [nx, 2, nz], c: look.stripe } as SculptBox]),
    // The nose: headlights at the corners, a dark grille between them. The tail: the lights.
    { a: [0, 2, nz - 1], b: [1, 3, nz], c: "light-cold" },
    { a: [nx - 1, 2, nz - 1], b: [nx, 3, nz], c: "light-cold" },
    { a: [1, 1, nz - 1], b: [nx - 1, 2, nz], c: look.trim },
    { a: [0, 2, 0], b: [1, 3, 1], c: lights.tail ? "neon-pink" : "neon-pink-dim" },
    { a: [nx - 1, 2, 0], b: [nx, 3, 1], c: lights.tail ? "neon-pink" : "neon-pink-dim" },
    // The cabin over z = 1 to 5: two rows of windows, the upper one a voxel shorter at the
    // front (the windscreen leans back), a pillar behind the doors, the roof on top.
    { a: [0, 3, 1], b: [nx, 4, 5], c: look.glass },
    { a: [0, 4, 1], b: [nx, 5, 4], c: look.glass },
    { a: [0, 3, 2], b: [nx, 5, 3], c: look.trim },
    { a: [0, 5, 1], b: [nx, 6, 4], c: look.body },
  ];
  if (look.roof === "taxi-sign") boxes.push({ a: [1, 6, 2], b: [nx - 1, 7, 3], c: "neon-yellow" });
  if (look.roof === "light-bar") {
    boxes.push(
      { a: [0, 6, 2], b: [2, 7, 3], c: lights.bar === 0 ? "neon-pink" : "neon-pink-dim" },
      { a: [2, 6, 2], b: [nx, 7, 3], c: lights.bar === 1 ? "neon-cyan" : "neon-cyan-dim" },
    );
  }
  return new VoxelBuilder(palette, [BODY[0], BODY[1], BODY[2]]).sculpt(boxes);
}

/** The voxel model of a car: one part, the whole car, over a voxel of air. */
export function buildCar(look: CarLook, lights: CarLights): VoxelModel {
  return defineModel({
    size: [CAR_SIZE[0], CAR_SIZE[1], CAR_SIZE[2]],
    palette,
    parts: [{ name: "car", grid: carGrid(look, lights).grid, at: [0, 1, 0], pivot: [2, 0, 4] }],
    flatSlots: [...FLAT_SLOTS],
    budget: 4 * 7 * 8,
    tile: [4, 8],
    poses: { up: { car: { offset: [0, 1, 0] } } },
  });
}

/** One frame of a clip: how high the car is (0 or 1 voxel up) and its lights. */
interface CarFrame {
  readonly up: boolean;
  readonly lights: CarLights;
}

function carFrame(clip: string, frame: number): CarFrame {
  if (clip === "fly") {
    // Held up; the tail lights blink every other frame pair, the underglow every frame, and a
    // light bar swaps its halves every frame.
    return { up: true, lights: { glow: frame % 2 === 0, tail: frame < 2, bar: frame % 2 === 0 ? 0 : 1 } };
  }
  // Idle: down, up, up, down; the underglow bright on the first pair and dim on the second.
  return { up: frame === 1 || frame === 2, lights: { glow: frame < 2, tail: true, bar: 0 } };
}

export const CAR_CLIPS = {
  idle: { frames: 4, durations: [400, 300, 400, 300] },
  fly: { frames: 4, durations: 160 },
} as const;

const MODELS = new Map<string, VoxelModel>();

/** Bakes one frame of a car. */
export function drawCar(look: CarLook, clip: string, frame: number, facing: string): IndexedBuffer {
  const { up, lights } = carFrame(clip, frame);
  const key = JSON.stringify([look, lights]);
  let model = MODELS.get(key);
  if (model === undefined) {
    model = buildCar(look, lights);
    if (MODELS.size >= 256) MODELS.clear();
    MODELS.set(key, model);
  }
  // The shadow is cast by the skirt (the lowest voxels, at y = 1) and reaches a voxel past it.
  const out = bakeIso(model, { facing, pose: up ? "up" : undefined, margin: CAR_MARGIN, shadow: { height: 2, grow: 1 } });
  return lightPool(out, palette.slot(GLOWS[look.glow]));
}

/**
 * The pool of light: the shadow under the car takes the dim step of the underglow, solid
 * inside and checkered at its rim (the glow fades out instead of ending in a hard edge).
 */
function lightPool(out: IndexedBuffer, dim: number): IndexedBuffer {
  const src = out.data.slice();
  const shadow = palette.shadow;
  for (let y = 0; y < out.h; y += 1) {
    for (let x = 0; x < out.w; x += 1) {
      if (src[y * out.w + x] !== shadow) continue;
      let rim = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!out.inside(x + dx, y + dy) || src[(y + dy) * out.w + x + dx] === 0) rim = true;
      }
      out.data[y * out.w + x] = rim && (x + y) % 2 === 1 ? 0 : dim;
    }
  }
  return out;
}

/** What a car asset varies; the look is a function of its params and the seed. */
export interface CarAssetSpec<S extends ParamsSchema> {
  readonly id: string;
  readonly params: S;
  readonly presets?: Readonly<Record<string, Partial<ParamValues<S>>>>;
  readonly variantSeeds: readonly number[];
  /** The ramps and flat slots the asset may use (the inks are added). */
  readonly slots: readonly string[];
  readonly look: (params: ParamValues<S>, seed: number) => CarLook;
}

/** A car asset: the rig's frame, clips, facings and lints, with the look of `spec`. */
export function defineCar<S extends ParamsSchema>(spec: CarAssetSpec<S>): AnyAsset {
  return defineAsset({
    id: spec.id,
    kind: "sprite",
    size: CAR_FRAME.size,
    pivot: CAR_FRAME.pivot,
    palette,
    clips: CAR_CLIPS,
    facings: ISO_FACINGS,
    params: spec.params,
    presets: spec.presets ?? {},
    variantSeeds: spec.variantSeeds,
    lint: {
      allowedSlots: ["ink", "ink-deep", ...spec.slots],
      outlineSlots: OUTLINE_SLOTS,
      // The pool of light on the ground is drawn like a shadow: no outline.
      unoutlined: ["shadow", "neon-cyan-dim", "neon-pink-dim"],
    },
    render({ params, seed, clip, frame, facing }) {
      return drawCar(spec.look(params, seed), clip, frame, facing ?? "sw");
    },
  }) as AnyAsset;
}
