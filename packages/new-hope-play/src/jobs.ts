// Jobs: what Kylo does. Taxi fares from pad to pad across the sky lanes, and signals that pull
// him down on foot into the Ancestors' halls under the streets. A beacon marks the target.

import * as THREE from "three";
import { K } from "@whz/citygen";
import type { Hovercar } from "./actors.ts";
import { cellCentre, cellsOf, hash3 } from "./world.ts";
import type { World } from "./world.ts";

type JobKind = "board" | "fare" | "descend";

interface Job {
  kind: JobKind;
  title: string;
  where: THREE.Vector3;
  reward: number;
  started: number;
}

const FARES = [
  "a Union clerk late for the census",
  "a scavenger with a crate that hums",
  "two colonists and a sleeping child",
  "a medic from the capsule bay",
  "a market trader and her neon stock",
  "a guard off shift, saying nothing",
];
const SIGNALS = [
  "A pull under the streets. Something of the Ancestors knows your name.",
  "Violet light below the market. You remember a shape, not a word.",
  "The Psion crystals answer when you come near. Go down.",
];

export class Jobs {
  private job: Job;
  private credits = 0;
  private done = 0;
  private time = 0;
  private readonly pads: THREE.Vector3[];
  private readonly halls: THREE.Vector3[];
  private readonly beacon: THREE.Group;
  private readonly ring: THREE.Mesh;

  constructor(world: World, scene: THREE.Scene, taxi: Hovercar) {
    this.pads = cellsOf(world, K.pad).map(([x, y, z]) => {
      const c = cellCentre(x, y, z);
      return new THREE.Vector3(c.x, c.y, c.z);
    });
    this.halls = cellsOf(world, K.deck)
      .filter(([, , z]) => z < world.streetLevel)
      .map(([x, y, z]) => {
        const c = cellCentre(x, y, z);
        return new THREE.Vector3(c.x, c.y, c.z);
      });
    this.beacon = new THREE.Group();
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 400, 16, 1, true).translate(0, 200, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe23a, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.12, 6, 32).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe23a).multiplyScalar(1.4), toneMapped: false }),
    );
    this.ring.position.y = 0.3;
    this.beacon.add(column, this.ring);
    scene.add(this.beacon);
    this.job = { kind: "board", title: "Find a way off this roof: the taxi on the pad.", where: taxi.pos.clone(), reward: 0, started: 0 };
  }

  enteredCar(_car: Hovercar): void {
    if (this.job.kind === "board") this.next(null);
  }

  private next(from: THREE.Vector3 | null): void {
    this.done++;
    const n = this.done;
    const origin = from ?? this.job.where;
    if (n % 4 === 0 && this.halls.length) {
      const where = this.halls[Math.floor(hash3(n, 1, 2) * this.halls.length)] as THREE.Vector3;
      this.job = { kind: "descend", title: SIGNALS[n % SIGNALS.length] as string, where: where.clone(), reward: 400, started: this.time };
      return;
    }
    const far = this.pads.filter((p) => p.distanceTo(origin) > 60);
    const list = far.length ? far : this.pads;
    const where = list[Math.floor(hash3(n, 3, 4) * list.length)] as THREE.Vector3;
    const dist = where.distanceTo(origin);
    this.job = { kind: "fare", title: `Fare: ${FARES[n % FARES.length]}. Land on the lit pad.`, where: where.clone(), reward: Math.round(60 + dist * 1.2), started: this.time };
  }

  update(dt: number, kylo: THREE.Vector3, driving: Hovercar | null, _camYaw: number, say: (text: string) => void): void {
    this.time += dt;
    this.beacon.position.copy(this.job.where);
    this.ring.rotation.y += dt * 1.5;
    this.ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.08);
    const at = driving ? driving.pos : kylo;
    const flat = Math.hypot(at.x - this.job.where.x, at.z - this.job.where.z);
    // The column is for finding the target from afar; up close only the ring shows.
    (this.beacon.children[0] as THREE.Object3D).visible = flat > 25;
    if (this.job.kind === "board") return;
    const dy = Math.abs(at.y - this.job.where.y);
    if (this.job.kind === "fare" && driving && flat < 5 && dy < 3 && driving.speed() < 9) {
      const fast = Math.max(0, 90 - (this.time - this.job.started));
      const pay = this.job.reward + Math.round(fast * 2);
      this.credits += pay;
      say(`FARE COMPLETE<br><small>+${pay} ¤${fast > 0 ? " · fast" : ""}</small>`);
      this.next(this.job.where);
    } else if (this.job.kind === "descend" && !driving && flat < 3 && dy < 2) {
      this.credits += this.job.reward;
      say(`THE HALL OF THE ANCESTORS<br><small>a memory returns · +${this.job.reward} ¤</small>`);
      this.next(this.job.where);
    }
  }

  /** Where the current job points. */
  target(): THREE.Vector3 {
    return this.job.where;
  }

  /** Take a share of the credits (an arrest); returns how much was taken. */
  fine(share: number): number {
    const lost = Math.round(this.credits * share);
    this.credits -= lost;
    return lost;
  }

  hud(kylo: THREE.Vector3, camYaw: number): string {
    const d = this.job.where.clone().sub(kylo);
    const dist = Math.round(Math.hypot(d.x, d.z));
    const ang = Math.atan2(d.x, d.z) - camYaw;
    const a = Math.atan2(Math.sin(ang), Math.cos(ang));
    const arrow = Math.abs(a) < 0.4 ? "▲" : Math.abs(a) > 2.6 ? "▼" : a > 0 ? "◀" : "▶";
    const up = d.y > 3 ? " ↑" : d.y < -3 ? " ↓" : "";
    return `<b>${this.credits} ¤</b> · jobs ${Math.max(0, this.done - 1)}<br>${this.job.title}<br>${arrow} ${dist} m${up}`;
  }

  state(): { kind: JobKind; where: number[]; credits: number; done: number } {
    return { kind: this.job.kind, where: this.job.where.toArray(), credits: this.credits, done: this.done };
  }
}
