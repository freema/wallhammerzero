// Union security: heat (wanted stars), cruisers that hunt Kylo through the sky lanes, and the
// arrest. Heat comes from crashes, stolen Union cruisers and body-passing seen by a guard; it
// cools down while no cruiser has Kylo in sight.

import * as THREE from "three";
import type { Rng } from "@whz/det";
import { buildCar } from "./models.ts";
import type { Car } from "./models.ts";
import { blocksPoint, STOREY } from "./world.ts";
import type { World } from "./world.ts";

interface Unit {
  car: Car;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  t: number;
}

export interface PoliceEvents {
  say(text: string): void;
  busted(): void;
}

export class Police {
  readonly group = new THREE.Group();
  /** 0..5 stars. */
  stars = 0;
  private heat = 0;
  private cool = 0;
  private units: Unit[] = [];
  private grip = 0;
  private crashCooldown = 0;
  /** Cruisers off duty, reused by the next spawn. */
  private readonly spare: Car[] = [];
  private readonly aim = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly world: World;
  private readonly rng: Rng;

  /** `rng` drives each unit's chase orbit, which decides arrests: seeded, so a run replays. */
  constructor(world: World, rng: Rng) {
    this.world = world;
    this.rng = rng;
  }

  /** Heat as a number (stars are its whole part), for state snapshots. */
  get heatLevel(): number {
    return this.heat;
  }

  private retire(u: Unit): void {
    this.group.remove(u.car.root);
    this.spare.push(u.car);
  }

  /** Add heat: 1 point per star. */
  report(points: number, why: string, say: (t: string) => void): void {
    const before = this.stars;
    this.heat = Math.min(5.99, this.heat + points);
    this.stars = Math.floor(this.heat);
    this.cool = 0;
    if (this.stars > before) say(`UNION SECURITY<br><small>${why} · ${"★".repeat(this.stars)}</small>`);
  }

  crash(impact: number, say: (t: string) => void): void {
    if (impact < 24 || this.crashCooldown > 0) return;
    this.crashCooldown = 4;
    this.report(impact > 40 ? 1 : 0.5, "reckless flying", say);
  }

  /** Lose them: drop stars (body-passing makes them hunt the old body). */
  shake(points: number): void {
    this.heat = Math.max(0, this.heat - points);
    this.stars = Math.floor(this.heat);
  }

  clear(): void {
    this.heat = 0;
    this.stars = 0;
    for (const u of this.units) this.retire(u);
    this.units = [];
    this.grip = 0;
  }

  /** The units, for the radar. */
  positions(): THREE.Vector3[] {
    return this.units.map((u) => u.pos);
  }

  /** Arrest progress 0..1. */
  arrest(): number {
    return this.grip / 3;
  }

  private spawn(target: THREE.Vector3, i: number): void {
    const car = this.spare.pop() ?? buildCar("cruiser");
    const a = i * 2.4 + this.units.length;
    const pos = new THREE.Vector3(target.x + Math.cos(a) * 160, target.y + 30 + i * 6, target.z + Math.sin(a) * 160);
    this.group.add(car.root);
    this.units.push({ car, pos, vel: new THREE.Vector3(), yaw: 0, t: this.rng.int(10000) / 1000 });
  }

  update(dt: number, target: THREE.Vector3, targetSpeed: number, events: PoliceEvents): void {
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    const want = this.stars === 0 ? 0 : Math.min(6, this.stars + 1);
    while (this.units.length < want) this.spawn(target, this.units.length);
    let inSight = false;
    let close = false;
    for (const u of this.units) {
      u.t += dt;
      // Chase a point beside and above the target; climb over what is in the way.
      const to = this.aim.set(target.x + Math.sin(u.t * 0.7) * 5, target.y + 3, target.z + Math.cos(u.t * 0.7) * 5).sub(u.pos);
      const dist = to.length();
      const max = 34 + this.stars * 5;
      const desired = to.normalize().multiplyScalar(Math.min(max, dist * 1.4));
      const ahead = this.ahead.copy(u.pos).addScaledVector(u.vel, 0.6);
      if (blocksPoint(this.world, ahead.x, ahead.y, ahead.z) || blocksPoint(this.world, ahead.x, ahead.y - 2, ahead.z)) desired.y = Math.max(desired.y, 25);
      u.vel.lerp(desired, Math.min(1, dt * 1.6));
      u.pos.addScaledVector(u.vel, dt);
      if (blocksPoint(this.world, u.pos.x, u.pos.y, u.pos.z)) u.pos.y += 30 * dt;
      u.pos.y = Math.max(u.pos.y, this.world.streetLevel * STOREY + 2);
      if (Math.hypot(u.vel.x, u.vel.z) > 1) u.yaw = Math.atan2(u.vel.x, u.vel.z);
      u.car.root.position.copy(u.pos);
      u.car.root.rotation.y = u.yaw;
      u.car.body.rotation.z = Math.sin(u.t * 3) * 0.05;
      if (u.car.lightbar) u.car.lightbar.rotation.y = u.t * 10;
      const d = u.pos.distanceTo(target);
      if (d < 90) inSight = true;
      if (d < 8) close = true;
    }
    // Arrest: a cruiser on top of a slow target for three seconds.
    if (close && targetSpeed < 10 && this.stars > 0) this.grip += dt;
    else this.grip = Math.max(0, this.grip - dt * 0.5);
    if (this.grip >= 3) {
      this.clear();
      events.busted();
      return;
    }
    // Out of sight cools the heat down, a star every 10 s.
    if (this.stars > 0 && !inSight) {
      this.cool += dt;
      if (this.cool > 10) {
        this.cool = 0;
        this.heat = Math.max(0, this.heat - 1);
        this.stars = Math.floor(this.heat);
        if (this.stars === 0) events.say("LOST THEM<br><small>Union security gives up</small>");
      }
    } else this.cool = 0;
    // Units beyond the current want fly off and vanish.
    while (this.units.length > want) {
      this.retire(this.units.pop() as Unit);
    }
  }
}
