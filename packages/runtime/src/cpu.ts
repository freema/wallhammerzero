// The CPU reference backend: the draw list blitted into an RGBA buffer, in plain integer
// TypeScript. It needs no GPU, so it runs in Node in the dev container (scene shots, golden
// tests) and anywhere else. The WebGL backend must give the same bytes; when the two differ,
// this one is right.

import { checkDraw, checkTargetSize } from "./backend.ts";
import type { Backend, DrawOptions, Target } from "./backend.ts";
import { spriteRect } from "./draw-list.ts";
import type { DrawList } from "./draw-list.ts";
import { PALETTE_SLOTS } from "./palette.ts";

export interface CpuBackend extends Backend {
  readonly kind: "cpu";
  /** The target's own buffer, not a copy: RGBA bytes, the top row first. The next draw overwrites it. */
  pixels(target: Target): Uint8Array;
}

class CpuTarget implements Target {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }
}

function own(target: Target): CpuTarget {
  if (!(target instanceof CpuTarget)) throw new Error("the CPU backend draws only into targets made by its own createTarget");
  return target;
}

/** A CPU backend. It holds no state besides the targets it made. */
export function createCpuBackend(): CpuBackend {
  return {
    kind: "cpu",

    createTarget(width: number, height: number): Target {
      checkTargetSize(width, height);
      return new CpuTarget(width, height);
    },

    draw(target: Target, list: DrawList, options: DrawOptions): void {
      const { width, height, data } = own(target);
      const clear = checkDraw(list, options);
      for (let at = 0; at < data.length; at += 4) {
        data[at] = clear[0];
        data[at + 1] = clear[1];
        data[at + 2] = clear[2];
        data[at + 3] = clear[3];
      }
      const colors = options.palette.data;
      for (const item of list.sorted()) {
        const rect = spriteRect(item);
        const sheet = item.sheet;
        const row = item.paletteRow * PALETTE_SLOTS * 4;
        const x0 = Math.max(rect.x, 0);
        const y0 = Math.max(rect.y, 0);
        const x1 = Math.min(rect.x + rect.w, width);
        const y1 = Math.min(rect.y + rect.h, height);
        for (let y = y0; y < y1; y += 1) {
          const from = (rect.sy + (y - rect.y)) * sheet.width + rect.sx;
          for (let x = x0; x < x1; x += 1) {
            const column = x - rect.x;
            const index = sheet.pixels[from + (item.mirror ? rect.w - 1 - column : column)] as number;
            const color = row + index * 4;
            if (colors[color + 3] === 0) continue;
            const at = (y * width + x) * 4;
            data[at] = colors[color] as number;
            data[at + 1] = colors[color + 1] as number;
            data[at + 2] = colors[color + 2] as number;
            data[at + 3] = colors[color + 3] as number;
          }
        }
      }
    },

    readPixels(target: Target): Uint8Array {
      return own(target).data.slice();
    },

    pixels(target: Target): Uint8Array {
      return own(target).data;
    },

    release(): void {
      // Nothing to free: a target is its buffer, and sheets and palettes are used as they are.
    },

    dispose(): void {},
  };
}
