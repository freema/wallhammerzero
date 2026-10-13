// The people of New Hope: one voxel rig for every character (Kylo, Union guards, colonists,
// scavengers), baked to 2:1 iso in the four facings.
//
// The rig is 4 x 8 x 4 voxels (x across the shoulders, y up, z: the front looks along +z), so a
// person fits under a storey (12 voxels) with headroom. At this size a face is two voxels wide,
// so characters are read by their silhouette and their colour blocks, never by a face
// (spike-c); faces go to portraits. The head is kept small (2 x 2 x 2) and the legs long, so a
// person reads as a person and not as the spike's mushroom.
//
//   y 6..7   head 2 x 2 x 2: the crown row (hair, helmet, hood or skin), the face row below it
//            (skin, a visor, goggles, a mask on its front; hair or helmet on its back)
//   y 3..5   torso 2 x 3 x 2, arms 1 x 3 x 2 on either side, the hand at the bottom
//   y 0..2   legs 1 x 3 x 2, the shoe at the bottom; a coat hem may cover y 1..2
//
// What makes silhouettes differ inside 4 x 8 x 4 is what hangs at the back (z = 0, behind the
// body): a small bag, a big pack rising behind the head, or a coat tail rising to a high collar;
// and a coat hem that hides the legs and flares to the width of the shoulders. Everything a look does not have is simply not a part.
//
// Clips: `idle` (2 frames, the head sinks one voxel), `walk` (4 frames: a leg one voxel forward,
// the other one back, the arms swung against them) and `run` (4 frames, faster: the same
// stride with the back foot kicked up a voxel and the forward arm pumped up a voxel; between
// strides the upper body dips a voxel). All offsets, no rotations: spike-c showed that a swung
// arm reads as noise in the back facings, and a 45 degree swing leaves the 4 x 8 x 4 box.

import { defineAsset } from "@whz/asset-kit";
import type { AnyAsset, IndexedBuffer, ParamsSchema, ParamValues } from "@whz/asset-kit";
import { bakeIso, defineModel, ISO_FACINGS, isoFrame, ShadeTable, VoxelBuilder } from "@whz/voxel-kit";
import type { Material, PartSpec, Pose, SculptBox, VoxelModel } from "@whz/voxel-kit";
import { FLAT_SLOTS, OUTLINE_SLOTS, palette } from "./style.ts";

export const PERSON_SIZE = [4, 8, 4] as const;
/** The outline and one empty pixel; the contact shadow stays inside the tile. */
export const PERSON_MARGIN = 2;
export const PERSON_FRAME = isoFrame(PERSON_SIZE, PERSON_MARGIN);

/** A material on a ramp, written `[ramp, step]`, or a flat slot by name. */
export type Mat = Material;

/** What a person looks like. Every field is a material; null leaves the part out. */
export interface PersonLook {
  /** The face and, without gloves, the hands. */
  readonly skin: Mat;
  /**
   * What covers the head: `hair` (the crown and the back of the head), `fringe` (the crown
   * only), `bald` (nothing), `helmet` (a shell over all but the face row's front), `hood` (the
   * crown and the back, like `hair` in cloth).
   */
  readonly headStyle: "hair" | "fringe" | "bald" | "helmet" | "hood";
  /** The hair, helmet or hood. Unused for `bald`. */
  readonly headMat: Mat;
  /** The front of the face row: the skin, a lit visor, goggles or a mask. */
  readonly face: Mat;
  readonly torso: Mat;
  /** The torso's lowest row (a belt, a sash, a hem). */
  readonly belt: Mat | null;
  readonly sleeves: Mat;
  /** The top of the arms (pauldrons, a jacket's shoulders); the sleeve if null. */
  readonly shoulders: Mat | null;
  /** The hands: skin, or gloves. */
  readonly hands: Mat;
  readonly legs: Mat;
  readonly shoes: Mat;
  /** A long coat: a hem over the upper legs that flares at the bottom, and a tail down the back up to a collar as tall as the head. */
  readonly coat: Mat | null;
  /** A bag or a pack on the back: `small` is 2 x 2 x 1 at the small of the back, `big` 2 x 4 x 1 and rises behind the head. */
  readonly pack: { readonly mat: Mat; readonly trim: Mat; readonly size: "small" | "big" } | null;
}

function partOf(size: readonly [number, number, number], boxes: readonly SculptBox[]): VoxelBuilder {
  return new VoxelBuilder(palette, [size[0], size[1], size[2]]).sculpt(boxes);
}

/** The voxel model of a look. The part names are fixed; poses move them by name. */
export function buildPerson(look: PersonLook): VoxelModel {
  const leg = (): VoxelBuilder =>
    partOf([1, 3, 2], [
      { a: [0, 0, 0], b: [1, 3, 2], c: look.legs },
      { a: [0, 0, 0], b: [1, 1, 2], c: look.shoes },
    ]);
  const arm = (): VoxelBuilder =>
    partOf([1, 3, 2], [
      { a: [0, 0, 0], b: [1, 3, 2], c: look.sleeves },
      ...(look.shoulders === null ? [] : [{ a: [0, 2, 0], b: [1, 3, 2], c: look.shoulders } as const]),
      { a: [0, 0, 0], b: [1, 1, 2], c: look.hands },
    ]);
  const torso = partOf([2, 3, 2], [
    { a: [0, 0, 0], b: [2, 3, 2], c: look.torso },
    ...(look.belt === null ? [] : [{ a: [0, 0, 0], b: [2, 1, 2], c: look.belt } as const]),
  ]);

  // The head, 2 x 2 x 2: row 0 is the face row (its front at z = 1), row 1 the crown.
  const h = look.headMat;
  const head: SculptBox[] = [{ a: [0, 0, 0], b: [2, 2, 2], c: look.skin }];
  if (look.headStyle === "hair" || look.headStyle === "hood") head.push({ a: [0, 1, 0], b: [2, 2, 2], c: h }, { a: [0, 0, 0], b: [2, 1, 1], c: h });
  if (look.headStyle === "fringe") head.push({ a: [0, 1, 0], b: [2, 2, 2], c: h });
  if (look.headStyle === "helmet") head.push({ a: [0, 0, 0], b: [2, 2, 2], c: h });
  head.push({ a: [0, 0, 1], b: [2, 1, 2], c: look.face });

  // Back to front in stacking order: a later part overwrites an earlier one where they meet.
  const parts: PartSpec[] = [
    { name: "leg-r", grid: leg().grid, at: [1, 0, 1], pivot: [0, 3, 1] },
    { name: "leg-l", grid: leg().grid, at: [2, 0, 1], pivot: [1, 3, 1] },
  ];
  if (look.coat !== null) {
    // The hem covers the legs down to the shins and flares to the width of the shoulders at
    // the bottom, so the coat is one long block where everyone else narrows to two legs. The
    // tail hangs behind the body from the hem and rises to a collar as tall as the head.
    const hem = partOf([4, 2, 2], [
      { a: [1, 0, 0], b: [3, 2, 2], c: look.coat },
      { a: [0, 0, 0], b: [4, 1, 2], c: look.coat },
    ]);
    parts.push({ name: "hem", grid: hem.grid, at: [0, 1, 1], pivot: [2, 2, 1] });
    parts.push({ name: "tail", grid: partOf([2, 7, 1], [{ a: [0, 0, 0], b: [2, 7, 1], c: look.coat }]).grid, at: [1, 1, 0], pivot: [1, 6, 1] });
  }
  parts.push({ name: "body", grid: torso.grid, at: [1, 3, 1], pivot: [1, 0, 1] });
  if (look.pack !== null) {
    // A small bag hangs at the small of the back; a big pack rises behind the head.
    const tall = look.pack.size === "big" ? 4 : 2;
    const pack = partOf([2, tall, 1], [
      { a: [0, 0, 0], b: [2, tall, 1], c: look.pack.mat },
      { a: [0, tall - 1, 0], b: [2, tall, 1], c: look.pack.trim },
    ]);
    parts.push({ name: "pack", grid: pack.grid, at: [1, 3, 0], pivot: [1, tall, 1] });
  }
  parts.push(
    { name: "arm-r", grid: arm().grid, at: [0, 3, 1], pivot: [0, 3, 1] },
    { name: "arm-l", grid: arm().grid, at: [3, 3, 1], pivot: [1, 3, 1] },
    { name: "head", grid: partOf([2, 2, 2], head).grid, at: [1, 6, 1], pivot: [1, 0, 1] },
  );

  return defineModel({
    size: [PERSON_SIZE[0], PERSON_SIZE[1], PERSON_SIZE[2]],
    palette,
    parts,
    flatSlots: [...FLAT_SLOTS],
    budget: 4 * 8 * 4,
    tile: [4, 4],
    poses: personPoses(look.pack !== null),
  });
}

/** The named poses of the rig; `pack`: the look has a pack, which dips with the body. */
function personPoses(pack: boolean): Record<string, Pose> {
  const down = { offset: [0, -1, 0] as const };
  return {
    breathe: { head: down },
    // A step: one leg a voxel forward, the other a voxel back, the arms against the legs.
    "step-l": {
      "leg-l": { offset: [0, 0, 1] },
      "leg-r": { offset: [0, 0, -1] },
      "arm-l": { offset: [0, 0, -1] },
      "arm-r": { offset: [0, 0, 1] },
    },
    "step-r": {
      "leg-l": { offset: [0, 0, -1] },
      "leg-r": { offset: [0, 0, 1] },
      "arm-l": { offset: [0, 0, 1] },
      "arm-r": { offset: [0, 0, -1] },
    },
    // A running stride: the back foot leaves the ground, the forward arm pumps up a voxel.
    "sprint-l": {
      "leg-l": { offset: [0, 0, 1] },
      "leg-r": { offset: [0, 1, -1] },
      "arm-l": { offset: [0, 0, -1] },
      "arm-r": { offset: [0, 1, 1] },
    },
    "sprint-r": {
      "leg-l": { offset: [0, 1, -1] },
      "leg-r": { offset: [0, 0, 1] },
      "arm-l": { offset: [0, 1, 1] },
      "arm-r": { offset: [0, 0, -1] },
    },
    // Between the strides both feet are down and the upper body dips a voxel onto the legs: the
    // bounce that tells a run from a walk. (A frame on one foot moves the contact row by 2 px,
    // which reads as a hop.) A coat's hem and tail stay where they are.
    dip: { body: down, "arm-l": down, "arm-r": down, head: down, ...(pack ? { pack: down } : {}) },
  };
}

/** The pose of every frame of every clip; undefined is the rest pose. */
export const PERSON_POSES: Readonly<Record<string, readonly (string | undefined)[]>> = {
  idle: [undefined, "breathe"],
  walk: ["step-l", undefined, "step-r", undefined],
  run: ["sprint-l", "dip", "sprint-r", "dip"],
};

export const PERSON_CLIPS = {
  idle: { frames: 2, durations: [600, 400] },
  walk: { frames: 4, durations: 140 },
  run: { frames: 4, durations: 100 },
} as const;

// A look is a fresh object per render, so models are cached by the look's JSON.
const MODELS = new Map<string, VoxelModel>();

/** Bakes one frame of a person. */
export function drawPerson(look: PersonLook, clip: string, frame: number, facing: string): IndexedBuffer {
  const key = JSON.stringify(look);
  let model = MODELS.get(key);
  if (model === undefined) {
    model = buildPerson(look);
    if (MODELS.size >= 256) MODELS.clear();
    MODELS.set(key, model);
  }
  return settleShades(bakeIso(model, { facing, pose: PERSON_POSES[clip]?.[frame], margin: PERSON_MARGIN }));
}

const SHADES = new ShadeTable(palette);
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

/**
 * Where two parts of one ramp meet (a sleeve on a torso of the same cloth), ambient occlusion
 * can leave a single pixel of a shade that none of its neighbours has: noise at this size, and
 * an orphan for the lint. Such a pixel takes the shade of its own ramp that most of its
 * neighbours have (the darker one on a tie). Pixels of flat slots and inks are details and stay.
 */
export function settleShades(out: IndexedBuffer): IndexedBuffer {
  const src = out.data.slice();
  for (let y = 0; y < out.h; y += 1) {
    for (let x = 0; x < out.w; x += 1) {
      const color = src[y * out.w + x] as number;
      const ramp = color === 0 ? null : SHADES.rampOf(color);
      if (ramp === null) continue;
      const votes = new Map<number, number>();
      let alone = true;
      for (const [dx, dy] of AROUND) {
        if (!out.inside(x + dx, y + dy)) continue;
        const near = src[(y + dy) * out.w + x + dx] as number;
        if (near === color) alone = false;
        else if (near !== 0 && SHADES.rampOf(near) === ramp) votes.set(near, (votes.get(near) ?? 0) + 1);
      }
      if (!alone || votes.size === 0) continue;
      let best = 0;
      let count = 0;
      for (const [near, n] of votes) {
        if (n > count || (n === count && SHADES.stepOf(near) < SHADES.stepOf(best))) [best, count] = [near, n];
      }
      out.data[y * out.w + x] = best;
    }
  }
  return out;
}

/** What a person asset varies; the look is a function of its params and the seed. */
export interface PersonAssetSpec<S extends ParamsSchema> {
  readonly id: string;
  readonly params: S;
  readonly presets?: Readonly<Record<string, Partial<ParamValues<S>>>>;
  readonly variantSeeds: readonly number[];
  /** The ramps and flat slots the asset may use (the inks and the shadow are added). */
  readonly slots: readonly string[];
  readonly look: (params: ParamValues<S>, seed: number) => PersonLook;
}

/** A person asset: the rig's frame, clips, facings and lints, with the look of `spec`. */
export function definePerson<S extends ParamsSchema>(spec: PersonAssetSpec<S>): AnyAsset {
  return defineAsset({
    id: spec.id,
    kind: "sprite",
    size: PERSON_FRAME.size,
    pivot: PERSON_FRAME.pivot,
    palette,
    clips: PERSON_CLIPS,
    facings: ISO_FACINGS,
    params: spec.params,
    presets: spec.presets ?? {},
    variantSeeds: spec.variantSeeds,
    lint: {
      allowedSlots: ["ink", "ink-deep", "shadow", ...spec.slots],
      // The lit rim of a baked model is the darkest step of the ramp it touches, not ink.
      outlineSlots: OUTLINE_SLOTS,
      // A step forward on the 2:1 grid is one pixel down the screen: the forward foot is lower.
      clips: { walk: { baselineDrift: 1 }, run: { baselineDrift: 1 } },
    },
    render({ params, seed, clip, frame, facing }) {
      return drawPerson(spec.look(params, seed), clip, frame, facing ?? "sw");
    },
  }) as AnyAsset;
}
