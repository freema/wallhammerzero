// The lint specimen: a small front-view walker (20 x 22, a 4-frame walk) that passes every
// lint, and the same walker with one planted defect. Each folder under clean/ and defects/ is
// an asset made here, so the CLI can lint it by id:
//
//   ./dev npm run asset -- lint --all --assets packages/asset-kit/test/lint-fixtures
//
// The vision calibration (scripts/calibration.ts) plants four of the defects at random places
// in a sheet of these walkers, to measure at which zoom a model sees them.

import { compose, defineAsset, IndexedBuffer, parsePalette } from "@whz/asset-kit";
import type { AnyAsset, Layer, LintConfig, RenderRequest } from "@whz/asset-kit";
import paletteJson from "../../../../assets/palettes/example.json" with { type: "json" };

export const WALKER_DEFECTS = [
  "orphan-pixel", // one pixel of a foreign colour inside a fill
  "wrong-slot", // a part painted with the wrong palette slot
  "pivot-jump", // one frame is drawn 1 px higher or lower than the others
  "twinned", // both arms swing together instead of against each other (no lint: eyes only)
  "detached-group", // a stray block beside the body
  "outline-gap", // one pixel of the outline is missing
  "too-many-colors", // more colours than the asset allows itself
  "area-pop", // one frame is much larger than its neighbours
  "loop-seam", // the clip drifts and snaps back at the loop
  "clipped-prop", // a staff leaves the frame in one pose
  "bbox-jump", // a staff is thrust out sideways for one frame
  "bad-timing", // a frame that is shown for 5 ms
  "wrong-frame-size", // one frame has another size than the meta says
  "off-palette", // an index the palette does not have
] as const;
export type WalkerDefect = (typeof WALKER_DEFECTS)[number];

const palette = parsePalette(paletteJson);
const W = 20;
const H = 22;
const SKIN = palette.slot("gold.2");
const SKIN_SHADE = palette.slot("gold.1");
const HAIR = palette.slot("red.0");
const SHIRT = palette.slot("teal.1");
const SHIRT_SHADE = palette.slot("teal.0");
const SLEEVE = palette.slot("teal.2");
const PANTS = palette.slot("grey.1");
const SHOE = palette.slot("grey.0");

/** The slots a correct walker uses. */
const ALLOWED = ["ink", "gold.1", "gold.2", "red.0", "teal", "grey.0", "grey.1"];

// Where the planted defects can sit. `pick` chooses one, so the calibration can vary them.
const ORPHANS = [
  { x: 9, y: 13, slot: "gold.2" }, // skin in the shirt
  { x: 10, y: 4, slot: "teal.2" }, // sleeve colour in the hair
  { x: 12, y: 8, slot: "red.0" }, // hair colour on the cheek
  { x: 8, y: 12, slot: "grey.1" }, // pants colour in the shirt
] as const;
const WRONG_SLOTS = [
  { from: SKIN, to: "red.2", part: "hands" }, // not in ALLOWED: the lint catches this one
  { from: SHIRT_SHADE, to: "grey.1", part: "torso" },
  { from: SHOE, to: "grey.1", part: "legs" },
  { from: HAIR, to: "red.1", part: "head" },
] as const;

/** Where the limbs are in each frame of the walk: arm offsets (negative is up) and the lifted leg. */
const WALK = [
  { left: -1, right: 1, lifted: null },
  { left: 0, right: 0, lifted: "left" },
  { left: 1, right: -1, lifted: null },
  { left: 0, right: 0, lifted: "right" },
] as const;

function head(hair: number): IndexedBuffer {
  const top = new IndexedBuffer(8, 7).fillEllipse(0, 0, 8, 7, hair).fill(0, 3, 8, 4, 0);
  return new IndexedBuffer(8, 7).fillEllipse(0, 0, 8, 7, SKIN).fill(7, 3, 1, 2, SKIN_SHADE).blit(top, 0, 0);
}

function torso(shade: number): IndexedBuffer {
  return new IndexedBuffer(6, 5).fill(0, 0, 6, 5, SHIRT).fill(5, 0, 1, 5, shade);
}

function arm(hand: number): IndexedBuffer {
  return new IndexedBuffer(2, 4).fill(0, 0, 2, 2, SLEEVE).fill(0, 2, 2, 2, hand);
}

function leg(lifted: boolean, shoe: number): IndexedBuffer {
  const height = lifted ? 2 : 3;
  return new IndexedBuffer(2, height).fill(0, 0, 2, height - 1, PANTS).fill(0, height - 1, 2, 1, shoe);
}

/** What a planted defect is and where, in words: the answer key of the calibration sheet. */
export function describeDefect(defect: WalkerDefect, pick = 0): string {
  switch (defect) {
    case "orphan-pixel": {
      const spot = ORPHANS[(pick >> 2) % ORPHANS.length] as (typeof ORPHANS)[number];
      return `frame ${pick % 4}: one ${spot.slot} pixel at (${spot.x}, ${spot.y})`;
    }
    case "wrong-slot": {
      const wrong = WRONG_SLOTS[pick % WRONG_SLOTS.length] as (typeof WRONG_SLOTS)[number];
      return `all frames: ${wrong.part} use ${wrong.to} instead of ${palette.slots[wrong.from]?.name ?? "?"}`;
    }
    case "pivot-jump":
      return `frame ${pick % 4}: the whole sprite is 1 px ${(pick >> 2) % 2 === 0 ? "higher" : "lower"}`;
    case "twinned":
      return "frames 0 and 2: both arms are up, then both down, instead of one up and one down";
    default:
      return defect;
  }
}

/**
 * The walker, as an asset with the given id.
 * @param defect the planted defect, or null for the clean walker
 * @param pick   which place, frame or direction the defect takes (see ORPHANS, WRONG_SLOTS)
 */
export function makeWalker(id: string, defect: WalkerDefect | null = null, pick = 0): AnyAsset {
  const wrong = defect === "wrong-slot" ? (WRONG_SLOTS[pick % WRONG_SLOTS.length] as (typeof WRONG_SLOTS)[number]) : null;
  const swap = (slot: number, part: string): number => (wrong !== null && wrong.part === part && wrong.from === slot ? palette.slot(wrong.to) : slot);
  const lint: LintConfig = {
    allowedSlots: ALLOWED,
    ...(defect === "too-many-colors" ? { maxColors: 6 } : {}),
    // The walker fills half of its 20 px frame, so no prop can move an edge by the default 25 %
    // (5 px) and stay inside the frame. This asset allows itself 10 % (2 px), as a small
    // character would; the clean walk stays inside that.
    ...(defect === "bbox-jump" ? { maxBboxChange: 10 } : {}),
  };

  return defineAsset({
    id,
    kind: "sprite",
    size: [W, H],
    pivot: [10, 19],
    palette,
    clips: { walk: { frames: 4, durations: defect === "bad-timing" ? [150, 5, 150, 150] : 150 } },
    params: {},
    variantSeeds: [1],
    reviewSeeds: [1, 2],
    lint,

    render({ frame }) {
      const pose = WALK[frame] as (typeof WALK)[number];
      let left: number = pose.left;
      let right: number = pose.right;
      let lifted: string | null = pose.lifted;
      if (defect === "twinned") right = left;
      if (defect === "loop-seam") {
        // No walk: the right arm rises one pixel per frame and snaps back when the clip loops.
        left = 0;
        right = -frame;
        lifted = null;
      }

      const layers: Layer[] = [];
      if (defect === "area-pop" && frame === 2) layers.push({ part: new IndexedBuffer(16, 12).fill(0, 0, 16, 12, SHIRT_SHADE), x: 2, y: 7 });
      if (defect === "clipped-prop") {
        // A staff in the right hand. In frame 1 it is raised, and its top leaves the frame.
        const top = frame === 1 ? -2 : 4;
        layers.push({ part: new IndexedBuffer(2, 15).fill(0, 0, 2, 15, SHOE), x: 16, y: top });
      }
      if (defect === "bbox-jump" && frame === 1) {
        // A short staff in the right hand, thrust out sideways in this frame only: the right
        // edge of the bounding box moves 3 px and comes back.
        layers.push({ part: new IndexedBuffer(3, 2).fill(0, 0, 3, 2, SHOE), x: 15, y: 13 });
      }
      layers.push(
        { part: leg(lifted === "left", swap(SHOE, "legs")), x: 7, y: 16 },
        { part: leg(lifted === "right", swap(SHOE, "legs")), x: 11, y: 16 },
        { part: arm(swap(SKIN, "hands")), x: 5, y: 11 + left },
        { part: arm(swap(SKIN, "hands")), x: 13, y: 11 + right },
        { part: torso(swap(SHIRT_SHADE, "torso")), x: 7, y: 11 },
        { part: head(swap(HAIR, "head")), x: 6, y: 3 },
      );
      let out = compose(W, H, layers, { ink: palette.ink });
      // The eyes go on after the outline: two pixels each, so they are not orphans.
      out.fill(8, 6, 1, 2, palette.ink).fill(11, 6, 1, 2, palette.ink);

      if (defect === "orphan-pixel" && frame === pick % 4) {
        const spot = ORPHANS[(pick >> 2) % ORPHANS.length] as (typeof ORPHANS)[number];
        out.pset(spot.x, spot.y, palette.slot(spot.slot));
      }
      if (defect === "pivot-jump" && frame === pick % 4) {
        out = new IndexedBuffer(W, H).blit(out, 0, (pick >> 2) % 2 === 0 ? -1 : 1);
      }
      if (defect === "detached-group") out.fill(1, 14, 2, 2, PANTS);
      if (defect === "outline-gap") out.pset(4, 12, 0);
      if (defect === "off-palette") out.pset(10, 13, 200);
      if (defect === "wrong-frame-size" && frame === 3) return out.crop(0, 0, W - 1, H);
      return out;
    },
  });
}

/**
 * An asset whose frames skip the kit's contract check. `defineAsset` checks every frame it
 * renders (its size, its indices), so a program that breaks the contract fails with the rule
 * `render`. An Asset object that a caller builds itself has no such check: then the lint's own
 * rules `frame-size` and `palette-index` are what catches a bad frame. This wraps a defined
 * asset in such an object; `change` gets every checked frame and may return anything.
 */
export function withUncheckedFrames(asset: AnyAsset, change: (frame: IndexedBuffer, request: RenderRequest) => IndexedBuffer): AnyAsset {
  const raw: AnyAsset = {
    format: asset.format,
    meta: asset.meta,
    palette: asset.palette,
    params: asset.params,
    presets: asset.presets,
    variantSeeds: asset.variantSeeds,
    reviewSeeds: asset.reviewSeeds,
    stampFiles: asset.stampFiles,
    stampsBound: asset.stampsBound,
    lint: asset.lint,
    resolveParams: (choice) => asset.resolveParams(choice),
    render: (request) => change(asset.render(request), request),
    withStamps: () => raw,
  };
  return raw;
}
