// Kylo on foot (walk, run, jump, stairs, lifts) and the hover cars he flies, against the
// district's cell grid.

import * as THREE from "three";
import { K } from "@whz/citygen";
import { buildCar } from "./models.ts";
import type { Car, CarKind } from "./models.ts";
import { animatePerson, buildPerson, KYLO } from "./people.ts";
import type { Person, PersonLook } from "./people.ts";
import type { Input } from "./input.ts";
import { blocksPoint, cellOf, floorAt, hash3, STOREY, TILE } from "./world.ts";
import type { World } from "./world.ts";

const GRAVITY = 24;
const RADIUS = 0.32;
const PROBE_HEIGHTS = [0.45, 1.0, 1.7] as const;
const PROBE_CORNERS = [[RADIUS, RADIUS], [-RADIUS, RADIUS], [RADIUS, -RADIUS], [-RADIUS, -RADIUS]] as const;
const HULL_ALONG = [-2.1, 0, 2.1] as const;
const HULL_ACROSS = [-0.95, 0.95] as const;
/** Cars made so far: each gets its own bob phase from its number, not from Math.random. */
let carsMade = 0;

export class Walker {
  person: Person;
  look: PersonLook = KYLO;
  readonly pos = new THREE.Vector3();
  velY = 0;
  yaw = 0;
  onGround = false;
  private phase = 0;
  /** A lift ride in progress: from and to heights, and time. */
  private ride: { from: number; to: number; t: number } | null = null;

  private readonly world: World;

  constructor(world: World) {
    this.world = world;
    this.person = buildPerson(KYLO);
  }

  get root(): THREE.Group {
    return this.person.root;
  }

  /** Take another body: the model changes, the place and the motion stay. */
  setLook(look: PersonLook): void {
    const parent = this.person.root.parent;
    const visible = this.person.root.visible;
    parent?.remove(this.person.root);
    this.look = look;
    this.person = buildPerson(look);
    this.person.root.visible = visible;
    parent?.add(this.person.root);
    this.sync();
  }

  cell(): { x: number; y: number; z: number; kind: number } {
    const x = cellOf(this.pos.x, TILE), y = cellOf(this.pos.z, TILE), z = cellOf(this.pos.y + 0.05, STOREY);
    return { x, y, z, kind: this.world.kind(x, y, z) };
  }

  inLift(): boolean {
    return this.cell().kind === K.lift && this.onGround;
  }

  private blocked(x: number, y: number, z: number): boolean {
    const w = this.world;
    if (x < RADIUS || z < RADIUS || x > w.w * TILE - RADIUS || z > w.d * TILE - RADIUS) return true;
    for (const h of PROBE_HEIGHTS) {
      for (const [dx, dz] of PROBE_CORNERS) {
        if (blocksPoint(w, x + dx, y + h, z + dz)) return true;
      }
    }
    // Walkway railings: from a walkway you cannot step into open air on its level.
    const here = this.cell();
    const nx = cellOf(x, TILE), nz = cellOf(z, TILE);
    if (here.kind === K.walkway && (nx !== here.x || nz !== here.y)) {
      const next = w.kind(nx, nz, here.z);
      if (next === K.empty || next === K.lane) return true;
    }
    return false;
  }

  update(dt: number, input: Input, camYaw: number): void {
    if (this.ride) {
      this.ride.t = Math.min(1, this.ride.t + dt / 1.1);
      const t = this.ride.t;
      this.pos.y = this.ride.from + (this.ride.to - this.ride.from) * (t * t * (3 - 2 * t));
      if (t >= 1) this.ride = null;
      animatePerson(this.person, 0, 0, false);
      this.sync();
      return;
    }
    if (this.inLift()) {
      const here = this.cell();
      const up = input.down("KeyE") && this.world.kind(here.x, here.y, here.z + 1) === K.lift;
      const down = input.down("KeyQ") && this.world.kind(here.x, here.y, here.z - 1) === K.lift;
      if (up || down) {
        const from = here.z * STOREY;
        this.ride = { from, to: from + (up ? STOREY : -STOREY), t: 0 };
        // Centre on the shaft.
        this.pos.x = (here.x + 0.5) * TILE;
        this.pos.z = (here.y + 0.5) * TILE;
        return;
      }
    }

    const fwd = input.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]);
    const side = input.axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]);
    const run = input.down("ShiftLeft", "ShiftRight");
    const speed = run ? 9 : 4.6;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let mx = fx * fwd - fz * side;
    let mz = fz * fwd + fx * side;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      const target = Math.atan2(mx, mz);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 14);
    }
    const step = speed * dt;
    const nx = this.pos.x + mx * step;
    if (!this.blocked(nx, this.pos.y, this.pos.z)) this.pos.x = nx;
    const nz = this.pos.z + mz * step;
    if (!this.blocked(this.pos.x, this.pos.y, nz)) this.pos.z = nz;

    if (this.onGround && input.hit("Space")) {
      this.velY = 7.2;
      this.onGround = false;
    }
    this.velY -= GRAVITY * dt;
    let ny = this.pos.y + this.velY * dt;
    if (this.velY > 0 && blocksPoint(this.world, this.pos.x, ny + 1.85, this.pos.z)) {
      this.velY = 0;
      ny = this.pos.y;
    }
    const floor = floorAt(this.world, this.pos.x, this.pos.z, this.pos.y + 0.65);
    if (ny <= floor || (this.onGround && this.velY <= 0 && this.pos.y - floor < 0.6)) {
      this.pos.y = floor;
      this.velY = 0;
      this.onGround = true;
    } else {
      this.pos.y = ny;
      this.onGround = false;
    }
    if (this.pos.y < -20) this.respawnAt(this.lastSafe);
    if (this.onGround) this.lastSafe.copy(this.pos);

    const moving = len > 0 ? (run ? 1 : 0.7) : 0;
    this.phase += step * (run ? 1.4 : 2.1);
    animatePerson(this.person, this.phase, moving, !this.onGround);
    this.sync();
  }

  readonly lastSafe = new THREE.Vector3();

  respawnAt(p: THREE.Vector3): void {
    this.pos.copy(p);
    this.velY = 0;
    this.ride = null;
  }

  private sync(): void {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
}

export class Hovercar {
  readonly car: Car;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  occupied = false;
  /** The speed lost in the last collision this frame (m/s), for crash sounds and heat. */
  impact = 0;
  private yawRate = 0;
  private time = hash3(carsMade++, 5, 17) * 10;
  /** Seconds at rest: a parked car that has settled skips the flight model. */
  private still = 0;

  private readonly world: World;
  readonly kind: CarKind;

  constructor(world: World, kind: CarKind) {
    this.world = world;
    this.kind = kind;
    this.car = buildCar(kind);
  }

  get root(): THREE.Group {
    return this.car.root;
  }

  speed(): number {
    return this.vel.length();
  }

  private hits(x: number, y: number, z: number): boolean {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const along of HULL_ALONG) {
      for (const across of HULL_ACROSS) {
        const px = x + fx * along - fz * across;
        const pz = z + fz * along + fx * across;
        if (blocksPoint(this.world, px, y + 0.35, pz) || blocksPoint(this.world, px, y + 1.25, pz)) return true;
      }
    }
    return false;
  }

  update(dt: number, input: Input | null): void {
    this.time += dt;
    if (!this.occupied && this.still > 1) {
      if (this.vel.lengthSq() > 1e-4) this.still = 0;
      else {
        this.pose(this.lastFloor);
        return;
      }
    }
    if (input && this.occupied) {
      const thrust = input.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]);
      const turn = input.axis(["KeyD", "ArrowRight"], ["KeyA", "ArrowLeft"]);
      const lift = input.axis(["ShiftLeft", "ShiftRight", "KeyC"], ["Space"]);
      const boost = input.down("KeyR") ? 1.8 : 1;
      this.yawRate += (turn * 1.9 - this.yawRate) * Math.min(1, dt * 5);
      this.yaw += this.yawRate * dt;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const accel = thrust > 0 ? 30 * boost : thrust < 0 ? -16 : 0;
      this.vel.x += fx * accel * dt;
      this.vel.z += fz * accel * dt;
      this.vel.y += lift * 22 * dt;
      // Grip: the velocity turns toward the heading, so the car carves instead of sliding.
      const along = this.vel.x * fx + this.vel.z * fz;
      const latX = this.vel.x - fx * along, latZ = this.vel.z - fz * along;
      const grip = Math.exp(-3.2 * dt);
      this.vel.x = fx * along + latX * grip;
      this.vel.z = fz * along + latZ * grip;
    } else {
      this.yawRate *= Math.exp(-4 * dt);
    }
    const drag = Math.exp(-(this.occupied ? 0.55 : 2.5) * dt);
    this.vel.x *= drag;
    this.vel.z *= drag;
    this.vel.y *= Math.exp(-2.8 * dt);
    const max = 62;
    const flat = Math.hypot(this.vel.x, this.vel.z);
    if (flat > max) {
      this.vel.x *= max / flat;
      this.vel.z *= max / flat;
    }

    // Move one axis at a time and bounce off what blocks it.
    const nx = this.pos.x + this.vel.x * dt;
    this.impact = 0;
    if (this.hits(nx, this.pos.y, this.pos.z)) {
      this.impact = Math.max(this.impact, Math.abs(this.vel.x) * 1.35);
      this.vel.x *= -0.35;
    }
    else this.pos.x = nx;
    const nz = this.pos.z + this.vel.z * dt;
    if (this.hits(this.pos.x, this.pos.y, nz)) {
      this.impact = Math.max(this.impact, Math.abs(this.vel.z) * 1.35);
      this.vel.z *= -0.35;
    }
    else this.pos.z = nz;
    const ny = this.pos.y + this.vel.y * dt;
    if (this.vel.y > 0 && this.hits(this.pos.x, ny + 0.5, this.pos.z)) this.vel.y = 0;
    else this.pos.y = Math.min(ny, 420);
    const floor = floorAt(this.world, this.pos.x, this.pos.z, this.pos.y + 1.2);
    const hover = 0.35;
    if (this.pos.y < floor + hover) {
      this.pos.y = floor + hover;
      this.vel.y = Math.max(0, this.vel.y);
    }
    this.lastFloor = floor;
    if (this.occupied || this.vel.lengthSq() > 1e-4) this.still = 0;
    else {
      this.still += dt;
      this.vel.set(0, 0, 0);
    }
    this.pose(floor);
  }

  private lastFloor = 0;

  private pose(floor: number): void {
    const flat = Math.hypot(this.vel.x, this.vel.z);
    const bob = Math.sin(this.time * 2.1) * (this.occupied ? 0.06 : 0.1);
    this.car.body.position.y = bob;
    this.car.body.rotation.z = -this.yawRate * Math.min(1, flat / 25) * 0.35;
    this.car.body.rotation.x = -this.vel.y * 0.012;
    if (this.car.lightbar) this.car.lightbar.rotation.y = this.time * 8;
    const gap = this.pos.y - floor;
    this.car.pool.position.y = -gap + 0.02;
    this.car.pool.visible = gap < 12;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
}
