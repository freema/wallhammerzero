// Seeded value noise and fractal sums over it, for the islands and the wind. Floats: the game
// is reproducible within one browser (the same seed and inputs give the same run), which is
// all a code game here promises.

import { createRng } from "@whz/det";

export interface Noise2 {
  (x: number, y: number): number;
}

/** Smooth value noise in [-1, 1] with a period of 256 cells. */
export function valueNoise(seed: number, name: string): Noise2 {
  const rng = createRng(seed, name);
  const table = new Float32Array(256 * 256);
  for (let i = 0; i < table.length; i++) table[i] = rng.int(65536) / 32767.5 - 1;
  const at = (x: number, y: number): number => table[(y & 255) * 256 + (x & 255)] as number;
  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** A fractal sum of octaves, normalised to about [-1, 1]. */
export function fbm(noise: Noise2, x: number, y: number, octaves: number, lacunarity = 2.03, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * f + i * 17.3, y * f - i * 9.1) * amp;
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
