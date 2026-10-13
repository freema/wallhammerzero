// Procedural textures (graphics are code): one atlas of 8 x 8 tiles of 64 px, a colour map and
// an emissive map drawn on canvases. A tile covers one cell face (4 m), so 16 px is a metre.

import * as THREE from "three";

export const ATLAS_TILES = 8;
const PX = 64;

/** Atlas rows. A facade row has 8 variants; other rows share theirs. */
export const ROW = { union: 0, habitat: 1, market: 2, derelict: 3, ancient: 4, top: 5, ground: 6, ruin: 7 } as const;
/** Columns of the shared rows. */
export const TOP = { roof: 0, deck: 4, pad: 6, stoneTop: 7 } as const;
export const GROUND = { asphalt: 0, walkway: 4, stairs: 5, metal: 6, concrete: 7 } as const;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

interface Painter {
  c: Ctx;
  e: Ctx;
  r: () => number;
  x: number;
  y: number;
}

function rect(ctx: Ctx, p: Painter, x: number, y: number, w: number, h: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(p.x + x, p.y + y, w, h);
}

function noise(p: Painter, colours: string[], count: number, size = 2): void {
  for (let i = 0; i < count; i++) {
    const colour = colours[Math.floor(p.r() * colours.length)] ?? "#000";
    rect(p.c, p, Math.floor(p.r() * PX), Math.floor(p.r() * PX), size, size, colour);
  }
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)] as T;

function union(p: Painter, v: number): void {
  rect(p.c, p, 0, 0, PX, PX, "#9aa3c4");
  noise(p, ["#8e97b8", "#a7b0cf"], 60);
  // Two tall glass panes per face, cold light behind some of them.
  for (let i = 0; i < 2; i++) {
    const x = 6 + i * 30;
    const lit = p.r() < 0.4 + v * 0.03;
    rect(p.c, p, x, 6, 22, 46, "#1d3d58");
    rect(p.c, p, x + 2, 8, 18, 42, lit ? "#bfe9ff" : "#24506a");
    rect(p.c, p, x + 10, 8, 1, 42, "#1d3d58");
    if (lit) rect(p.e, p, x + 2, 8, 18, 42, p.r() < 0.3 ? "#3a6a8a" : "#5a8aa8");
  }
  // The Union's blue floor line, faintly lit.
  rect(p.c, p, 0, 56, PX, 4, "#2e50a0");
  rect(p.e, p, 0, 57, PX, 2, "#22408a");
}

function habitat(p: Painter, v: number): void {
  rect(p.c, p, 0, 0, PX, PX, "#5d6380");
  noise(p, ["#545a76", "#676e8c", "#4c5170"], 120);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 5 + col * 20;
      const y = 6 + row * 19;
      const lit = p.r() < 0.5;
      const warm = pick(p.r, ["#ffd68c", "#ffbe6a", "#ffe8b0", "#ff9e7a"]);
      rect(p.c, p, x, y, 13, 11, "#20222f");
      rect(p.c, p, x + 1, y + 1, 11, 9, lit ? warm : "#2c3348");
      if (lit) rect(p.e, p, x + 1, y + 1, 11, 9, "#a0703a");
      if (p.r() < 0.25) rect(p.c, p, x - 1, y + 12, 15, 3, "#8a92aa"); // a ledge, an AC unit
      if (p.r() < 0.12) {
        rect(p.c, p, x + 1, y + 12, 5, 4, pick(p.r, ["#c84a5a", "#5aa06a", "#d8b040"])); // laundry
      }
    }
  }
  if (v % 3 === 0) rect(p.c, p, 0, 0, 3, PX, "#474c66");
}

function market(p: Painter, v: number): void {
  rect(p.c, p, 0, 0, PX, PX, "#2c2a40");
  noise(p, ["#26243a", "#343048"], 80);
  // A shopfront of warm light over the lower half, an awning, and a neon sign above.
  const glow = pick(p.r, ["#ffd68c", "#ffb08a", "#a8f0ff"]);
  rect(p.c, p, 4, 34, 56, 26, "#151320");
  rect(p.c, p, 6, 36, 52, 22, glow);
  rect(p.e, p, 6, 36, 52, 22, glow);
  for (let x = 6; x < 58; x += 13) rect(p.c, p, x, 36, 2, 22, "#151320");
  const awning = pick(p.r, ["#c43c6c", "#2e8a9a", "#d89c20"]);
  for (let x = 2; x < 62; x += 6) rect(p.c, p, x, 28, 3, 6, awning);
  const neon = pick(p.r, ["#ff3aa8", "#3aeeff", "#ffe23a", "#5aff7a", "#b46aff"]);
  // Sign glyphs: blocky strokes that read as writing.
  const y0 = 8 + (v % 2) * 4;
  rect(p.c, p, 6, y0 - 2, 52, 16, "#120e24");
  let x = 9;
  while (x < 54) {
    const w = 3 + Math.floor(p.r() * 6);
    const h = 4 + Math.floor(p.r() * 8);
    rect(p.c, p, x, y0 + (12 - h) / 2, w, h, neon);
    rect(p.e, p, x, y0 + (12 - h) / 2, w, h, neon);
    x += w + 2;
  }
}

function derelict(p: Painter): void {
  rect(p.c, p, 0, 0, PX, PX, "#2a2836");
  noise(p, ["#4a2430", "#8a4038", "#34384e", "#222030"], 200, 3);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x = 7 + col * 30;
      const y = 8 + row * 28;
      rect(p.c, p, x, y, 20, 18, "#0e0c16");
      if (p.r() < 0.4) {
        // Boards across a broken window.
        rect(p.c, p, x - 1, y + 4, 22, 3, "#5a4030");
        rect(p.c, p, x - 1, y + 11, 22, 3, "#5a4030");
      } else if (p.r() < 0.18) {
        rect(p.c, p, x + 2, y + 2, 16, 14, "#9a6a48");
        rect(p.e, p, x + 2, y + 2, 16, 14, "#5a3a20");
      }
    }
  }
}

function ancient(p: Painter, v: number): void {
  rect(p.c, p, 0, 0, PX, PX, "#b89a72");
  noise(p, ["#a88a64", "#c8aa80", "#9a7c5a"], 140, 3);
  // Smooth stone courses and a slit of Psion crystal light.
  for (let y = 15; y < PX; y += 16) rect(p.c, p, 0, y, PX, 1, "#7c6656");
  const x = 26 + (v % 3) * 4;
  rect(p.c, p, x, 6, 8, 52, "#341c56");
  rect(p.c, p, x + 2, 8, 4, 48, "#b46aff");
  rect(p.e, p, x + 2, 8, 4, 48, "#b46aff");
  // A vein branching off.
  let vx = x + 6;
  for (let y = 20 + v * 3; y < 50; y += 2) {
    vx += p.r() < 0.5 ? 1 : 0;
    if (vx >= PX) break;
    rect(p.c, p, vx, y, 2, 2, "#a87ae2");
    rect(p.e, p, vx, y, 2, 2, "#6438a0");
  }
}

function roof(p: Painter): void {
  rect(p.c, p, 0, 0, PX, PX, "#454a66");
  noise(p, ["#3c4160", "#4e5474", "#363a52"], 160, 3);
  if (p.r() < 0.5) {
    rect(p.c, p, 12, 14, 14, 14, "#6a7290");
    rect(p.c, p, 14, 16, 10, 10, "#2a2c42");
  }
  if (p.r() < 0.4) {
    rect(p.c, p, 40, 38, 10, 10, "#606a88");
    rect(p.e, p, 44, 42, 2, 2, "#ff3aa8");
  }
}

function deck(p: Painter): void {
  rect(p.c, p, 0, 0, PX, PX, "#4c5172");
  for (let i = 0; i < PX; i += 16) {
    rect(p.c, p, i, 0, 1, PX, "#34384e");
    rect(p.c, p, 0, i, PX, 1, "#34384e");
  }
  noise(p, ["#565c7e", "#44486a"], 80);
  rect(p.c, p, 0, 0, PX, 2, "#d89c20");
}

function pad(p: Painter): void {
  rect(p.c, p, 0, 0, PX, PX, "#2a2c42");
  rect(p.c, p, 4, 4, 56, 56, "#34384e");
  // An H in a ring of lights.
  rect(p.c, p, 20, 18, 5, 28, "#ffe23a");
  rect(p.c, p, 39, 18, 5, 28, "#ffe23a");
  rect(p.c, p, 20, 30, 24, 5, "#ffe23a");
  rect(p.e, p, 20, 18, 5, 28, "#806a10");
  rect(p.e, p, 39, 18, 5, 28, "#806a10");
  rect(p.e, p, 20, 30, 24, 5, "#806a10");
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = 30 + Math.cos(a) * 26;
    const y = 30 + Math.sin(a) * 26;
    rect(p.c, p, x, y, 4, 4, "#5aff7a");
    rect(p.e, p, x, y, 4, 4, "#5aff7a");
  }
}

function asphalt(p: Painter, v: number): void {
  rect(p.c, p, 0, 0, PX, PX, "#24263a");
  noise(p, ["#1c1e30", "#2c2e44", "#30324a"], 200, 2);
  if (v === 1) {
    for (let y = 4; y < PX; y += 20) rect(p.c, p, 30, y, 3, 10, "#c8c08a");
  }
  if (v === 2) {
    for (let x = 4; x < PX; x += 20) rect(p.c, p, x, 30, 10, 3, "#c8c08a");
  }
  if (v === 3 && p.r() < 1) {
    // A puddle reflecting neon.
    rect(p.c, p, 18, 22, 24, 12, "#1a1438");
    rect(p.c, p, 22, 25, 14, 3, "#ff3aa8");
    rect(p.e, p, 22, 25, 14, 3, "#7a1c62");
  }
}

function walkway(p: Painter): void {
  rect(p.c, p, 0, 0, PX, PX, "#606a88");
  for (let y = 0; y < PX; y += 6) rect(p.c, p, 0, y, PX, 2, "#4a5270");
  rect(p.c, p, 0, 0, 3, PX, "#3aeeff");
  rect(p.c, p, 61, 0, 3, PX, "#3aeeff");
  rect(p.e, p, 0, 0, 3, PX, "#1a6680");
  rect(p.e, p, 61, 0, 3, PX, "#1a6680");
}

function stairs(p: Painter): void {
  rect(p.c, p, 0, 0, PX, PX, "#606a88");
  for (let y = 0; y < PX; y += 8) {
    rect(p.c, p, 0, y, PX, 2, "#a2acc8");
    rect(p.c, p, 0, y + 2, PX, 1, "#34384e");
  }
  rect(p.c, p, 0, 0, PX, 3, "#d89c20");
}

function metal(p: Painter): void {
  rect(p.c, p, 0, 0, PX, PX, "#34384e");
  rect(p.c, p, 2, 2, 60, 60, "#606a88");
  rect(p.c, p, 8, 8, 48, 48, "#3d4a68");
  rect(p.c, p, 0, 0, PX, 2, "#3aeeff");
  rect(p.e, p, 0, 0, PX, 2, "#3aeeff");
}

function concrete(p: Painter): void {
  rect(p.c, p, 0, 0, PX, PX, "#4c5172");
  noise(p, ["#44486a", "#565c7e"], 160, 2);
}

function ruin(p: Painter, v: number): void {
  rect(p.c, p, 0, 0, PX, PX, "#6a5648");
  noise(p, ["#5a463a", "#7c6656", "#4a3c38", "#8a7058"], 260, 4);
  for (let y = 0; y < PX; y += 21) rect(p.c, p, 0, y, PX, 2, "#3e3238");
  if (v % 2 === 0) {
    const x = 10 + Math.floor(p.r() * 40);
    const y = 10 + Math.floor(p.r() * 30);
    rect(p.c, p, x, y, 6, 14, "#a87ae2");
    rect(p.e, p, x, y, 6, 14, "#8a4ad0");
  }
}

export interface Atlas {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
  /** UV rectangle [u0, v0, u1, v1] of a tile, slightly inset against bleeding. */
  uv(col: number, row: number): [number, number, number, number];
}

export function createAtlas(seed: number): Atlas {
  const size = PX * ATLAS_TILES;
  const colour = document.createElement("canvas");
  const glow = document.createElement("canvas");
  colour.width = colour.height = glow.width = glow.height = size;
  const c = colour.getContext("2d");
  const e = glow.getContext("2d");
  if (!c || !e) throw new Error("no 2D canvas");
  e.fillStyle = "#000";
  e.fillRect(0, 0, size, size);
  const r = rng(seed ^ 0x51a7);
  for (let row = 0; row < ATLAS_TILES; row++) {
    for (let col = 0; col < ATLAS_TILES; col++) {
      const p: Painter = { c, e, r, x: col * PX, y: row * PX };
      switch (row) {
        case ROW.union:
          union(p, col);
          break;
        case ROW.habitat:
          habitat(p, col);
          break;
        case ROW.market:
          market(p, col);
          break;
        case ROW.derelict:
          derelict(p);
          break;
        case ROW.ancient:
          ancient(p, col);
          break;
        case ROW.top:
          if (col < 4) roof(p);
          else if (col < 6) deck(p);
          else if (col === 6) pad(p);
          else ruin(p, col);
          break;
        case ROW.ground:
          if (col < 4) asphalt(p, col);
          else if (col === 4) walkway(p);
          else if (col === 5) stairs(p);
          else if (col === 6) metal(p);
          else concrete(p);
          break;
        default:
          ruin(p, col);
      }
    }
  }
  const make = (canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const inset = 0.5 / size;
  return {
    map: make(colour, true),
    emissive: make(glow, true),
    uv(col, row) {
      const u0 = col / ATLAS_TILES + inset;
      const u1 = (col + 1) / ATLAS_TILES - inset;
      // Canvas y grows down, texture v grows up.
      const v1 = 1 - row / ATLAS_TILES - inset;
      const v0 = 1 - (row + 1) / ATLAS_TILES + inset;
      return [u0, v0, u1, v1];
    },
  };
}
