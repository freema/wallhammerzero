// The wind: one direction and speed over the whole archipelago, veering slowly and gusting,
// stronger and further veered as a storm builds. A function of the game time only.

import { fbm, valueNoise } from "./noise.ts";
import type { Noise2 } from "./noise.ts";

export interface WindNow {
  /** The direction the wind blows toward, radians (0 = +z). */
  to: number;
  /** Metres per second. */
  speed: number;
  /** Velocity in x and z. */
  x: number;
  z: number;
}

export class Wind {
  /** Freeze the veer and the gusts (scripts measure the boat, not the weather). */
  steady = false;
  private readonly noise: Noise2;
  private readonly base: number;

  constructor(seed: number, base: number) {
    this.noise = valueNoise(seed, "wind");
    this.base = base;
  }

  /** The prevailing direction the swell runs with. */
  get baseTo(): number {
    return this.base;
  }

  at(t: number, storm: number, out: WindNow): WindNow {
    const veer = this.steady ? 0 : fbm(this.noise, t / 95, 3.7, 2) * 0.55;
    const gust = this.steady ? 0 : fbm(this.noise, t / 6, 11.2, 2) * 1.4;
    out.to = this.base + veer + storm * 0.5;
    out.speed = 6.2 + gust + storm * 6.5;
    out.x = Math.sin(out.to) * out.speed;
    out.z = Math.cos(out.to) * out.speed;
    return out;
  }
}
