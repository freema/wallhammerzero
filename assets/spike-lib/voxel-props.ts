// The six props of the art spike as voxel models (variant C): the same desk, PC, plant, shelf,
// vending machine and sofa as the 2D packs, written as programs on the spike32 palette and
// baked to 2:1 isometric pixel art by @whz/voxel-kit. One voxel is 4 x 4 px, a tile is 4 x 4
// voxels (a 16 x 8 diamond), every prop lives in a 4 x 6 x 4 box, so one frame size fits all.
// The four facings come from the baker (a quarter turn of the grid each), and the vending
// machine has three states (idle, use, broken) as clips: the cost of a state is the program
// that changes a few voxels.

import { defineAsset } from "@whz/asset-kit";
import type { AnyAsset, IndexedBuffer } from "@whz/asset-kit";
import { bakeIso, box, CARVE, defineModel, ellipsoid, ISO_FACINGS, isoFrame, outlineSlots, VoxelBuilder } from "@whz/voxel-kit";
import type { VoxelModel } from "@whz/voxel-kit";
import { CLOTH, palette } from "./style.ts";
import type { Prop } from "./props.ts";

/** The box of every prop: 4 x 4 voxels of floor, 6 voxels tall. */
export const PROP_SIZE = [4, 6, 4] as const;
/** The contact shadow of a full-tile prop reaches 4 px past the diamond's corners, and 1 px stays empty for the fits-frame lint. */
export const PROP_MARGIN = 5;
export const PROP_FRAME = isoFrame(PROP_SIZE, PROP_MARGIN);

export const VENDING_STATES = ["idle", "use", "broken"] as const;
export type VendingState = (typeof VENDING_STATES)[number];

type Build = (seed: number, state: string) => VoxelBuilder;

const builder = (): VoxelBuilder => new VoxelBuilder(palette, PROP_SIZE);

/** A table top on four legs; a sheet of paper or a mug on it from the seed. */
const desk: Build = (seed) => {
  const b = builder().sculpt([
    { a: [0, 2, 0], b: [4, 3, 4], c: ["wood", 1] },
    { a: [0, 0, 0], b: [1, 2, 1], c: ["wood", 0] },
    { a: [3, 0, 0], b: [4, 2, 1], c: ["wood", 0] },
    { a: [0, 0, 3], b: [1, 2, 4], c: ["wood", 0] },
    { a: [3, 0, 3], b: [4, 2, 4], c: ["wood", 0] },
    { a: [1, 1, 0], b: [3, 2, 1], c: ["wood", 0] }, // the drawer under the back edge
  ]);
  const item = seed % 3;
  if (item === 1) b.fill(box([1, 3, 1], [3, 4, 3]), "white");
  if (item === 2) b.fill(box([2, 3, 2], [3, 5, 3]), ["red", 1]);
  return b;
};

/** A monitor with a blue screen at the back of the tile, a keyboard in front. */
const pc: Build = (seed) => {
  const b = builder().sculpt([
    { a: [1, 0, 1], b: [3, 1, 3], c: ["metal", 1] }, // the base
    { a: [1, 0, 3], b: [3, 1, 4], c: ["metal", 0] }, // the keyboard
    { a: [1, 1, 1], b: [3, 2, 2], c: ["metal", 0] }, // the stand
    { a: [0, 2, 0], b: [4, 5, 1], c: ["metal", 1] }, // the monitor's back
    { a: [0, 2, 1], b: [4, 5, 2], c: ["blue", 1] }, // the screen
  ]);
  // What the screen shows, from the seed: a lighter line, a chart, or a blank screen.
  const screen = seed % 3;
  if (screen === 0) b.fill(box([1, 3, 1], [3, 4, 2]), ["blue", 2]);
  if (screen === 1) b.fill(box([1, 2, 1], [2, 4, 2]), ["blue", 2]);
  return b;
};

/** A round bush on a pot; the pot's material and the bush's shape from the seed. */
const plant: Build = (seed) => {
  const pot = seed % 2 === 0 ? "red" : "wood";
  const b = builder().sculpt([
    { a: [1, 0, 1], b: [3, 2, 3], c: [pot, 1] },
    { a: [1, 1, 1], b: [3, 2, 3], c: [pot, 2] }, // the rim
  ]);
  b.fill(ellipsoid([0, 2, 0], [4, 6, 4]), ["plant", 1]);
  b.jitter(box([0, 2, 0], [4, 6, 4]), { seed, chance: [1, 4] });
  return b;
};

/** A case with two boards and 1-voxel books in cloth colours from the seed. */
const shelf: Build = (seed) => {
  const b = builder().sculpt([
    { a: [0, 0, 0], b: [4, 6, 1], c: ["wood", 0] }, // the back
    { a: [0, 0, 0], b: [1, 6, 2], c: ["wood", 1] }, // the sides
    { a: [3, 0, 0], b: [4, 6, 2], c: ["wood", 1] },
    { a: [0, 5, 0], b: [4, 6, 2], c: ["wood", 2] }, // the top
    { a: [1, 0, 1], b: [3, 1, 2], c: ["wood", 1] }, // the bottom board
    { a: [1, 2, 1], b: [3, 3, 2], c: ["wood", 1] }, // the middle board
  ]);
  for (const [x, y] of [[1, 1], [2, 1], [1, 3], [2, 3]] as const) {
    const cloth = CLOTH[(seed + x + y) % CLOTH.length]!;
    b.fill(box([x, y, 1], [x + 1, y + 1, 2]), [cloth, 1]);
  }
  return b;
};

/** A tall box with a window of goods and a hatch; the states change the window and the hatch. */
const vending: Build = (seed, state) => {
  const body = CLOTH[seed % CLOTH.length]!;
  const b = builder().sculpt([
    { a: [0, 0, 0], b: [4, 6, 3], c: [body, 1] },
    { a: [0, 5, 0], b: [4, 6, 3], c: [body, 2] }, // the lit top
    { a: [1, 2, 2], b: [3, 5, 3], c: ["metal", 0] }, // the window: dark glass on the front
    { a: [3, 3, 2], b: [4, 4, 3], c: ["gold", 2] }, // the button
    { a: [1, 0, 2], b: [3, 1, 3], c: ["metal", 0] }, // the hatch
  ]);
  if (state !== "broken") {
    // Goods: two rows of cans in the window.
    b.sculpt([
      { a: [1, 3, 2], b: [2, 4, 3], c: ["gold", 1] },
      { a: [2, 4, 2], b: [3, 5, 3], c: ["green", 1] },
    ]);
  }
  if (state === "use") {
    // A can drops into the hatch, the button lights white.
    b.fill(box([1, 0, 2], [2, 1, 3]), ["gold", 1]);
    b.fill(box([3, 3, 2], [4, 4, 3]), "white");
  }
  if (state === "broken") {
    // A dark window with a crack carved through the front, and the top panel knocked askew.
    b.sculpt([
      { a: [1, 3, 2], b: [2, 4, 3], c: CARVE },
      { a: [2, 2, 2], b: [3, 3, 3], c: CARVE },
      { a: [0, 5, 0], b: [1, 6, 3], c: CARVE },
      { a: [3, 3, 2], b: [4, 4, 3], c: ["metal", 0], paint: true },
    ]);
  }
  return b;
};

/** A two-seat sofa: a base, a seat, a back along the back edge, two armrests; the cloth from the seed. */
const sofa: Build = (seed) => {
  const cloth = CLOTH[seed % CLOTH.length]!;
  return builder().sculpt([
    { a: [0, 0, 0], b: [4, 1, 4], c: ["wood", 0] }, // the base
    { a: [0, 1, 1], b: [4, 2, 4], c: [cloth, 2] }, // the seat
    { a: [0, 1, 0], b: [4, 3, 1], c: [cloth, 1] }, // the back
    { a: [0, 1, 1], b: [1, 3, 4], c: [cloth, 1] }, // the armrests
    { a: [3, 1, 1], b: [4, 3, 4], c: [cloth, 1] },
  ]);
};

const BUILD: Record<Prop, Build> = { desk, pc, plant, shelf, vending, sofa };

/** The ramps each prop is shaded along (the outline lint needs their darkest steps). */
export const VOXEL_PROP_RAMPS: Record<Prop, readonly string[]> = {
  desk: ["wood", "red"],
  pc: ["metal", "blue"],
  plant: ["plant", "wood", "red"],
  shelf: ["wood", ...CLOTH],
  vending: ["red", "blue", "metal", "gold", "green"],
  sofa: ["wood", ...CLOTH],
};

export function buildProp(prop: Prop, seed: number, state = "idle"): VoxelModel {
  return defineModel({
    size: PROP_SIZE,
    palette,
    parts: [{ name: prop, grid: BUILD[prop](seed, state).grid, pivot: [2, 0, 2] }],
    ramps: VOXEL_PROP_RAMPS[prop],
    flatSlots: ["white"],
    budget: PROP_SIZE[0] * PROP_SIZE[1] * PROP_SIZE[2],
    tile: [4, 4],
  });
}

export function drawVoxelProp(prop: Prop, seed: number, facing: string, state = "idle"): IndexedBuffer {
  return bakeIso(buildProp(prop, seed, state), { facing, margin: PROP_MARGIN });
}

/** The asset of one voxel prop: `spike-c/desk`, ... The vending machine's states are its clips. */
export function defineVoxelProp(pack: string, prop: Prop): AnyAsset {
  const clips = prop === "vending" ? Object.fromEntries(VENDING_STATES.map((state) => [state, { frames: 1, durations: 1000 }])) : { idle: { frames: 1, durations: 1000 } };
  return defineAsset({
    id: `${pack}/${prop}`,
    kind: "sprite",
    size: PROP_FRAME.size,
    pivot: PROP_FRAME.pivot,
    palette,
    clips,
    facings: ISO_FACINGS,
    params: {},
    presets: {},
    variantSeeds: [1, 2, 3],
    lint: { allowedSlots: ["ink", "ink-deep", "shadow", "white", ...VOXEL_PROP_RAMPS[prop]], outlineSlots: outlineSlots(palette, VOXEL_PROP_RAMPS[prop]) },
    render({ seed, clip, facing }) {
      return drawVoxelProp(prop, seed, facing, clip);
    },
  });
}
