// The chibi rig: a character built from part layers (legs, torso, arms, head, prop) with one
// outline pass, the face stamped last. The same rig draws variant A (16 x 16) and variant B
// (16 x 24) from its scale table; staff and visitors differ in their outfit and prop.
//
// Poses are integer offsets: a walk is "which leg is lifted and how far the arms swing", an
// idle is a 1-pixel bob. Nothing rotates. The side facing is drawn facing left; the player
// mirrors it for the right.

import { compose, IndexedBuffer } from "@whz/asset-kit";
import { createRng } from "@whz/det";
import { CLOTH, HAIR, hairRamp, INK, mendOutline, OUTLINE, ramp, SHADOW, WHITE } from "./style.ts";
import type { Cloth, Hair, Ramp, Scale } from "./style.ts";

export const FACINGS = ["down", "up", "side"] as const;
export type Facing = (typeof FACINGS)[number];

/** What a character looks like: its ramps and its role. */
export interface Look {
  readonly skin: Ramp;
  readonly hair: Ramp;
  readonly cloth: Ramp;
  /** Trousers and shoes: a darker cloth, so the legs read apart from the torso. */
  readonly legs: Ramp;
  readonly role: "staff" | "visitor";
  /** A visitor's cap colour (a second cloth ramp), null for no cap. */
  readonly cap: Ramp | null;
}

/** A pose: every number is a pixel offset. */
export interface Pose {
  /** The body (torso, arms, head) is this many pixels lower than at rest (a squash: the legs are shorter too). */
  readonly bob: number;
  /** The left and right leg are this many pixels shorter (lifted). */
  readonly legL: number;
  readonly legR: number;
  /** The arms swing: negative is up (toward the head). */
  readonly armL: number;
  readonly armR: number;
  /** Side facing only: the legs are this many pixels apart (forward / back). */
  readonly stride: number;
  /** Work clip, front facing: the prop is raised this many pixels. */
  readonly work: number;
  /** Work clip, side facing: the near arm reaches this many pixels forward. */
  readonly reach: number;
}

export const REST: Pose = { bob: 0, legL: 0, legR: 0, armL: 0, armR: 0, stride: 0, work: 0, reach: 0 };

/** The clips every character has, with their timing (ms per frame). */
export const IDLE_DURATIONS = [600, 400];
export const WALK_DURATIONS = [140, 140, 140, 140];
export const WORK_DURATIONS = [400, 300];

/**
 * Idle: a one-pixel squash. Walk: contact, pass, contact, pass; the arms against the legs.
 * Work: from the front the prop goes up and comes down; from the side the near arm reaches
 * forward; from the back the body nods (a squash), since nothing else shows.
 */
export function pose(clip: string, frame: number, facing: Facing = "down"): Pose {
  switch (clip) {
    case "idle":
      return { ...REST, bob: frame === 1 ? 1 : 0, legL: frame === 1 ? 1 : 0, legR: frame === 1 ? 1 : 0 };
    case "walk": {
      const WALK: readonly Pose[] = [
        { ...REST, legL: 1, armL: 1, armR: -1, stride: 2 },
        { ...REST, bob: 1, legL: 1, legR: 1, stride: 0 },
        { ...REST, legR: 1, armL: -1, armR: 1, stride: 2 },
        { ...REST, bob: 1, legL: 1, legR: 1, stride: 0 },
      ];
      return WALK[frame % WALK.length] ?? REST;
    }
    case "work": {
      const step = frame % 2;
      if (facing === "side") return { ...REST, reach: step * 2 };
      if (facing === "up") return { ...REST, bob: step, legL: step, legR: step };
      return { ...REST, work: step };
    }
    default:
      return REST;
  }
}

/** The two skin tones: the palette's skin ramp, and a darker one borrowed from wood. */
export const SKIN = ["light", "dark"] as const;
export type Skin = (typeof SKIN)[number];

/** The look a seed gives (hair, outfit, skin), one random stream per choice so a new choice never changes another. */
export function lookFromSeed(seed: number, role: Look["role"], outfit: Cloth | "random", hair: Hair | "random", skin: Skin | "random" = "random"): Look {
  const clothName = outfit === "random" ? createRng(seed, "cloth").pick(CLOTH) : outfit;
  let hairName = hair === "random" ? createRng(seed, "hair").pick(HAIR) : hair;
  if (hair === "random" && hairName === "red" && clothName === "red") hairName = "brown"; // red on red merges at 1x
  const skinTone = skin === "random" ? createRng(seed, "skin").pick(["light", "light", "dark"] as const) : skin;
  const skinName = skinTone === "light" ? "skin" : "wood";
  const capName = createRng(seed, "cap").pick(CLOTH.filter((name) => name !== clothName));
  return {
    skin: ramp(skinName),
    hair: hairRamp(hairName),
    cloth: ramp(clothName),
    legs: role === "staff" ? ramp("metal") : ramp("wood"),
    role,
    cap: role === "visitor" ? ramp(capName) : null,
  };
}

// ---------------------------------------------------------------------------------------
// Parts

/** The head: a skin blob with the hair on top; the back facing shows hair only, the side a half. */
function head(scale: Scale, look: Look, facing: Facing): IndexedBuffer {
  const { w, h, hairRows } = scale.head;
  const part = new IndexedBuffer(w, h);
  part.fillEllipse(0, 0, w, h, look.skin[1]);
  // The shadow side of the face: the right column, one step darker, where the ellipse has skin.
  for (let y = hairRows; y < h - 1; y += 1) if (part.get(w - 1, y) !== 0) part.pset(w - 1, y, look.skin[0]);
  // Hair: a cap over the top rows; the back facing is all hair, the side facing (looking
  // left) keeps the back half too. Lit along the top edge.
  const hair = new IndexedBuffer(w, h).fillEllipse(0, 0, w, h, look.hair[1]);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const keep = y < hairRows || facing === "up" || (facing === "side" && x >= w >> 1 && y < h - 1);
      if (!keep) hair.pset(x, y, 0);
    }
  }
  hair.hline(1, 0, w - 2, look.hair[2]);
  hair.pset(0, 1, look.hair[2]);
  part.blit(hair, 0, 0);
  // The hairline: one more row of hair in the mid tone, and a darker fringe pixel off centre.
  if (facing !== "up") part.hline(0, hairRows, facing === "side" ? w >> 1 : w, look.hair[1]);
  if (facing === "down") part.hline(w - 4, hairRows, 2, look.hair[0]);
  if (facing === "side") part.hline(0, hairRows, 2, look.hair[0]);
  if (look.cap !== null) {
    // A visitor's cap: a flat band over the hair with a peak toward the front.
    part.fill(0, 0, w, hairRows, 0).fillEllipse(0, 0, w, hairRows + 1, look.cap[1]).hline(1, 0, w - 2, look.cap[2]);
    if (facing === "down") part.hline(0, hairRows, w, look.cap[0]);
    if (facing === "side") part.hline(0, hairRows, w - 2, look.cap[0]);
    if (facing === "up") part.hline(0, hairRows, w, look.cap[0]);
  }
  return part;
}

/** The torso: a shirt box with the shadow on the right and a belt line at the bottom. */
function torso(scale: Scale, look: Look): IndexedBuffer {
  const { w, h } = scale.torso;
  const part = new IndexedBuffer(w, h).fill(0, 0, w, h, look.cloth[1]);
  part.vline(w - 1, 0, h, look.cloth[0]);
  part.vline(0, 1, h - 1, look.cloth[2]); // the lit left side, under the shoulder row (an arm may cover it)
  if (look.role === "staff") part.hline(1, h - 1, w - 2, look.cloth[0]); // the apron's hem
  return part;
}

/** An arm: a short sleeve of the shirt's cloth, bare skin below, so it reads apart from the torso. */
function arm(scale: Scale, look: Look): IndexedBuffer {
  const { w, h } = scale.arm;
  return new IndexedBuffer(w, h).fill(0, 0, w, 1, look.cloth[1]).fill(0, 1, w, h - 1, look.skin[1]);
}

function leg(scale: Scale, look: Look, lifted: number): IndexedBuffer {
  const { w, h } = scale.leg;
  const height = Math.max(1, h - lifted);
  return new IndexedBuffer(w, height).fill(0, 0, w, height, look.legs[1]).fill(0, height - 1, w, 1, look.legs[0]);
}

/** The prop of the work clip: a clipboard (staff) held in front of the torso. */
function clipboard(scale: Scale): IndexedBuffer {
  const w = scale.name === "A" ? 4 : 5;
  const h = scale.name === "A" ? 3 : 4;
  const part = new IndexedBuffer(w, h).fill(0, 0, w, h, WHITE);
  part.hline(0, 0, w, ramp("wood")[0]);
  if (h > 3) part.hline(1, 2, w - 2, ramp("metal")[1]);
  return part;
}

/**
 * The face, stamped after the outline: 2 x 2 ink eyes (A), or 2 x 3 eyes with a two-pixel
 * shine column on the lit side (B; one shine pixel would be an orphan).
 */
function stampFace(out: IndexedBuffer, scale: Scale, facing: Facing, headX: number, headY: number): void {
  const { w, hairRows } = scale.head;
  const eyeY = headY + hairRows + 1;
  const eyeH = scale.eyeShine ? 3 : 2;
  const eye = (x: number): void => {
    out.fill(x, eyeY, 2, eyeH, INK);
    if (scale.eyeShine) out.vline(x, eyeY, 2, WHITE);
  };
  if (facing === "down") {
    eye(headX + 1);
    eye(headX + w - 3);
  } else if (facing === "side") {
    eye(headX + 1);
  }
}

// ---------------------------------------------------------------------------------------
// The frame

/**
 * One frame of a character: the parts placed from the pose, outlined once, then the face.
 * The character stands on the pivot row; everything is measured up from it.
 */
export function drawChibi(scale: Scale, look: Look, facing: Facing, clip: string, p: Pose, withShadow = true): IndexedBuffer {
  const [W, H] = scale.frame;
  const [px, py] = scale.pivot;
  const { leg: L, torso: T, head: Hd, arm: A } = scale;
  const layers: { part: IndexedBuffer; x: number; y: number; mirror?: boolean }[] = [];

  // Legs stand on the pivot row. Left leg at the left of the pivot, right leg at the right.
  const legsW = L.w * 2 + L.gap;
  const legsX = px - (legsW >> 1);
  const legL = leg(scale, look, p.legL);
  const legR = leg(scale, look, p.legR);
  if (facing === "side") {
    // Seen from the side the legs overlap; the stride pulls them apart, the near leg (left) in front.
    const backX = px - 1 + (p.stride >> 1);
    const frontX = px - 1 - (p.stride >> 1) - (p.stride & 1);
    layers.push({ part: legR, x: backX, y: py - legR.h + 1 });
    layers.push({ part: legL, x: frontX, y: py - legL.h + 1 });
  } else {
    layers.push({ part: legL, x: legsX, y: py - legL.h + 1 });
    layers.push({ part: legR, x: legsX + L.w + L.gap, y: py - legR.h + 1 });
  }

  // The torso sits on the legs (full height), the body bob lifts torso, arms and head.
  const torsoY = py - L.h - T.h + 1 + p.bob;
  const torsoX = px - (T.w >> 1);
  const torsoPart = torso(scale, look);
  const headPart = head(scale, look, facing);
  const headX = px - (Hd.w >> 1);
  const headY = torsoY - Hd.h + 1; // the head overlaps the torso's top row: a chibi has no neck
  const armY = torsoY + 1;

  if (facing === "side") {
    // Far arm behind the torso, near arm in front; the work pose raises the near arm with the prop.
    // The far arm only swings up: swinging down it would hang out under the hem.
    layers.push({ part: arm(scale, look), x: torsoX + T.w - A.w, y: armY + Math.min(0, p.armR) });
    layers.push({ part: torsoPart, x: torsoX, y: torsoY });
    layers.push({ part: headPart, x: headX, y: headY });
    layers.push({ part: arm(scale, look), x: torsoX + 1 - p.reach, y: armY + p.armL });
  } else {
    layers.push({ part: torsoPart, x: torsoX, y: torsoY });
    layers.push({ part: arm(scale, look), x: torsoX - A.w, y: armY + p.armL });
    layers.push({ part: arm(scale, look), x: torsoX + T.w, y: armY + p.armR });
    if (facing === "down" && look.role === "staff" && clip === "work") {
      // The clipboard, held low in front of the apron and lifted a pixel to read it.
      const board = clipboard(scale);
      layers.push({ part: board, x: px - (board.w >> 1), y: armY + 1 - p.work });
    }
    layers.push({ part: headPart, x: headX, y: headY });
  }

  const out = compose(W, H, layers, OUTLINE);
  mendOutline(out);
  stampFace(out, scale, facing, headX, headY);
  if (withShadow) {
    // The ground shadow: two pixels of shadow on either side of the feet's outline, on its row.
    const row = py + 1;
    let left = W;
    let right = -1;
    for (let x = 0; x < W; x += 1) {
      if (out.get(x, row) !== 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    for (const x of [left - 2, left - 1, right + 1, right + 2]) if (out.inside(x, row) && out.get(x, row) === 0) out.pset(x, row, SHADOW);
  }
  return out;
}

/** The lint slots a character may use, whatever its seed: the inks, white, and the ramps of skin, hair, cloth, legs and prop. */
export const CHIBI_SLOTS = ["ink", "ink-deep", "shadow", "white", "skin", "hair", "wood", "gold", "red", "blue", "green", "metal"];
