// Cargo runs: take a load from one harbour to another before the storm. The clock is the
// weather: with less than 45 % of the time left the storm starts to build, and at zero it is
// full. Late cargo pays half. Every grounding spoils a quarter of the load; a fourth loses it.
// Tie up slowly: under 2.2 m/s (about 4 knots) at the end of the pier.

import { createRng } from "@whz/det";
import type { Rng } from "@whz/det";
import { smoothstep } from "./noise.ts";
import type { Harbour } from "./world.ts";

const CARGO = ["salt fish", "wool bales", "lamp oil", "oak timber", "the mail", "cider casks", "hemp rope", "medicine"];
const DOCK_RADIUS = 24;
const DOCK_SPEED = 2.2;
const SAIL_SPEED = 2.1;

export type JobEvent = "delivered" | "late" | "lost" | "too-fast" | "spoiled";

export interface JobState {
  from: string;
  to: string;
  toId: number;
  cargo: string;
  distance: number;
  deadline: number;
  timeLeft: number;
  /** 1 = sound, each grounding takes 0.25. */
  condition: number;
  credits: number;
  delivered: number;
  lost: number;
  lastPay: number;
}

export class Jobs {
  private rng: Rng;
  private readonly seed: number;
  private readonly harbours: Harbour[];
  private warned = false;
  private seenGroundings = 0;
  /** 0..1, follows the clock, and calms after a delivery. */
  storm = 0;
  readonly s: JobState;

  constructor(harbours: Harbour[], seed: number) {
    this.harbours = harbours;
    this.seed = seed;
    this.rng = createRng(seed, "jobs");
    this.s = { from: "", to: "", toId: 0, cargo: "", distance: 0, deadline: 1, timeLeft: 1, condition: 1, credits: 0, delivered: 0, lost: 0, lastPay: 0 };
  }

  /** A new game: no credits, a fresh draw of loads, the first one from `from`. */
  reset(from: Harbour, groundings: number): void {
    this.rng = createRng(this.seed, "jobs");
    Object.assign(this.s, { credits: 0, delivered: 0, lost: 0, lastPay: 0 });
    this.seenGroundings = groundings;
    this.storm = 0;
    this.start(from);
  }

  get target(): Harbour {
    return this.harbours[this.s.toId] as Harbour;
  }

  /** A new load from the harbour `from` to another one. */
  start(from: Harbour): void {
    // One of the two nearest other harbours: a run is a few minutes, not a voyage.
    const others = this.harbours.filter((h) => h.id !== from.id).sort((a, b) => a.dock.distanceTo(from.dock) - b.dock.distanceTo(from.dock));
    const to = others[this.rng.int(Math.min(2, others.length))] as Harbour;
    const distance = Math.hypot(to.dock.x - from.dock.x, to.dock.y - from.dock.y);
    this.s.from = from.name;
    this.s.to = to.name;
    this.s.toId = to.id;
    this.s.cargo = CARGO[this.rng.int(CARGO.length)] as string;
    this.s.distance = Math.round(distance);
    // Enough time to beat upwind to it with tacks, plus a minute and a half.
    this.s.deadline = Math.round((distance * 1.9) / SAIL_SPEED + 90);
    this.s.timeLeft = this.s.deadline;
    this.s.condition = 1;
    this.warned = false;
  }

  update(dt: number, x: number, z: number, speed: number, groundings: number): JobEvent | null {
    this.s.timeLeft -= dt;
    const target = smoothstep(0.45, 0, this.s.timeLeft / this.s.deadline);
    this.storm += (target - this.storm) * Math.min(1, dt * (target > this.storm ? 0.25 : 0.05));
    let event: JobEvent | null = null;
    if (groundings > this.seenGroundings) {
      this.seenGroundings = groundings;
      this.s.condition = Math.max(0, this.s.condition - 0.25);
      event = "spoiled";
      if (this.s.condition <= 0) {
        this.s.lost++;
        this.start(this.nearest(x, z));
        return "lost";
      }
    }
    const to = this.target;
    const d = Math.hypot(to.dock.x - x, to.dock.y - z);
    if (d < DOCK_RADIUS) {
      if (Math.abs(speed) < DOCK_SPEED) {
        const late = this.s.timeLeft < 0;
        const pay = Math.round((30 + this.s.distance / 12) * (late ? 0.5 : 1 + (0.6 * this.s.timeLeft) / this.s.deadline) * this.s.condition);
        this.s.credits += pay;
        this.s.lastPay = pay;
        this.s.delivered++;
        this.start(to);
        return late ? "late" : "delivered";
      }
      if (!this.warned) {
        this.warned = true;
        event = "too-fast";
      }
    } else if (d > DOCK_RADIUS * 2) this.warned = false;
    return event;
  }

  nearest(x: number, z: number): Harbour {
    let best = this.harbours[0] as Harbour;
    for (const h of this.harbours) if (Math.hypot(h.dock.x - x, h.dock.y - z) < Math.hypot(best.dock.x - x, best.dock.y - z)) best = h;
    return best;
  }
}
