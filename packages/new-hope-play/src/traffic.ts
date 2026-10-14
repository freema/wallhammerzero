// Life in the city: flying traffic on the sky lanes (instanced, streaming in from the horizon)
// and people walking the streets, decks and walkways.

import * as THREE from "three";
import { K } from "@whz/citygen";
import { crowdLook, PeopleMeshes, pose } from "./people.ts";
import type { Pose, PersonLook } from "./people.ts";
import { hash3, STOREY, TILE } from "./world.ts";
import type { World } from "./world.ts";

interface Track {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dz: number;
  length: number;
  yaw: number;
}

interface Flyer {
  track: number;
  t: number;
  speed: number;
}

export class Traffic {
  private readonly tracks: Track[] = [];
  private readonly flyers: Flyer[] = [];
  private readonly body: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly tail: THREE.InstancedMesh;
  readonly group = new THREE.Group();
  private readonly tmp = new THREE.Object3D();
  private readonly m = new THREE.Matrix4();
  private readonly off = new THREE.Matrix4();

  constructor(world: World, count = 320) {
    const d = world.district;
    const W = world.w * TILE, D = world.d * TILE, ext = 1400;
    const [l0, l1] = d.params.bands.lanes;
    const half = (d.params.streetWidth * TILE) / 2;
    const add = (ox: number, oy: number, oz: number, dx: number, dz: number, length: number): void => {
      this.tracks.push({ ox, oy, oz, dx, dz, length, yaw: Math.atan2(dx, dz) });
    };
    // The district's lane grid: over every street row (lower lane level) and column (upper).
    for (const row of d.streets.rows) {
      const z = row * TILE + half;
      const y = (l0 + 0.5) * STOREY;
      add(-ext, y, z - 1.4, 1, 0, W + ext * 2);
      add(W + ext, y, z + 1.4, -1, 0, W + ext * 2);
    }
    for (const col of d.streets.columns) {
      const x = col * TILE + half;
      const y = (l1 + 0.5) * STOREY;
      add(x + 1.4, y, -ext, 0, 1, D + ext * 2);
      add(x - 1.4, y, D + ext, 0, -1, D + ext * 2);
    }
    // High traffic over the endless city.
    for (let i = 0; i < 26; i++) {
      const along = hash3(i, 1, 2) < 0.5;
      const off = (hash3(i, 3, 4) - 0.5) * 2400;
      const y = 70 + hash3(i, 5, 6) * 180;
      const dir = hash3(i, 7, 8) < 0.5 ? 1 : -1;
      if (along) add(dir > 0 ? -1800 : W + 1800, y, D / 2 + off, dir, 0, W + 3600);
      else add(W / 2 + off, y, dir > 0 ? -1800 : D + 1800, 0, dir, D + 3600);
    }
    for (let i = 0; i < count; i++) {
      const track = Math.floor(hash3(i, 9, 10) * this.tracks.length);
      this.flyers.push({ track, t: hash3(i, 11, 12), speed: 22 + hash3(i, 13, 14) * 30 });
    }
    const paints = [0xd89c20, 0x2e50a0, 0x6438a0, 0x3e3a54, 0xb8304c, 0x248256, 0x9aa6c8, 0x1f475c];
    this.body = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.9, 0.7, 4.4),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5, flatShading: true }),
      count,
    );
    this.flyers.forEach((_, i) => this.body.setColorAt(i, new THREE.Color(paints[i % paints.length])));
    this.head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.14, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f6ff).multiplyScalar(3), toneMapped: false }), count);
    this.tail = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 0.14, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a6a).multiplyScalar(3), toneMapped: false }), count);
    for (const mesh of [this.body, this.head, this.tail]) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  update(dt: number): void {
    this.flyers.forEach((f, i) => {
      const tr = this.tracks[f.track] as Track;
      f.t = (f.t + (f.speed * dt) / tr.length) % 1;
      const s = f.t * tr.length;
      this.tmp.position.set(tr.ox + tr.dx * s, tr.oy + Math.sin(f.t * 40 + i) * 0.3, tr.oz + tr.dz * s);
      this.tmp.rotation.set(0, tr.yaw, 0);
      this.tmp.scale.setScalar(1);
      this.tmp.updateMatrix();
      this.body.setMatrixAt(i, this.tmp.matrix);
      this.off.makeTranslation(0, 0, 2.22);
      this.head.setMatrixAt(i, this.m.multiplyMatrices(this.tmp.matrix, this.off));
      this.off.makeTranslation(0, 0, -2.22);
      this.tail.setMatrixAt(i, this.m.multiplyMatrices(this.tmp.matrix, this.off));
    });
    this.body.instanceMatrix.needsUpdate = true;
    this.head.instanceMatrix.needsUpdate = true;
    this.tail.instanceMatrix.needsUpdate = true;
  }
}

interface Walker {
  look: PersonLook;
  pos: THREE.Vector3;
  yaw: number;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  t: number;
  phase: number;
  speed: number;
}

const FLAT = new Set<number>([K.street, K.deck, K.walkway, K.pad]);
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export class Crowd {
  private readonly people: Walker[] = [];
  private readonly meshes: PeopleMeshes;
  private readonly pose: Pose = { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 };
  private readonly options: [number, number][] = [];
  private rnd: () => number;

  private readonly world: World;

  constructor(world: World, count = 70) {
    this.world = world;
    this.meshes = new PeopleMeshes(count);
    let s = (world.district.seed ^ 0x9e3779b9) >>> 0;
    this.rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const spots: [number, number, number][] = [];
    for (let z = 0; z < world.h; z++)
      for (let y = 0; y < world.d; y++)
        for (let x = 0; x < world.w; x++) if (FLAT.has(world.kind(x, y, z)) && this.rnd() < 0.5) spots.push([x, y, z]);
    for (let i = 0; i < count && spots.length; i++) {
      const [x, y, z] = spots[Math.floor(this.rnd() * spots.length)] as [number, number, number];
      const look = crowdLook(this.rnd);
      this.meshes.setLook(i, look);
      this.people.push({ look, pos: new THREE.Vector3(), yaw: 0, x, y, z, tx: x, ty: y, t: 1, phase: this.rnd() * 6, speed: 1.1 + this.rnd() * 0.7 });
    }
  }

  get group(): THREE.Group {
    return this.meshes.group;
  }

  /** The person nearest to a point within `max` metres, or -1. */
  nearest(pos: THREE.Vector3, max: number): number {
    let best = -1;
    let bestD = max;
    this.people.forEach((w, i) => {
      const d = w.pos.distanceTo(pos);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  position(i: number): THREE.Vector3 {
    return (this.people[i] as Walker).pos;
  }

  lookOf(i: number): PersonLook {
    return (this.people[i] as Walker).look;
  }

  /** Everyone's position, for the radar and checks. */
  positions(): THREE.Vector3[] {
    return this.people.map((w) => w.pos);
  }

  /**
   * Give person i another look (the body Kylo left behind) and, when `at` is on a walkable cell,
   * move them there; returns the look they had.
   */
  swap(i: number, look: PersonLook, at?: THREE.Vector3): PersonLook {
    const w = this.people[i] as Walker;
    const old = w.look;
    if (at) {
      const x = Math.floor(at.x / TILE), y = Math.floor(at.z / TILE), z = Math.floor(at.y / STOREY + 0.05);
      if (FLAT.has(this.world.kind(x, y, z))) {
        w.x = w.tx = x;
        w.y = w.ty = y;
        w.z = z;
        w.t = 1;
        w.pos.copy(at);
      }
    }
    w.look = look;
    this.meshes.setLook(i, look);
    return old;
  }

  /** Union guards (visored) within r metres of a point. */
  guardsNear(pos: THREE.Vector3, r: number): number {
    let n = 0;
    for (const w of this.people) if (w.look.visor && w.pos.distanceTo(pos) < r) n++;
    return n;
  }

  /** Walk: the simulation step. */
  update(dt: number): void {
    for (const w of this.people) {
      if (w.t >= 1) {
        w.x = w.tx;
        w.y = w.ty;
        const options = this.options;
        options.length = 0;
        for (const [dx, dy] of STEPS) {
          if (FLAT.has(this.world.kind(w.x + dx, w.y + dy, w.z))) options.push([w.x + dx, w.y + dy]);
        }
        const pick = options.length ? (options[Math.floor(this.rnd() * options.length)] as [number, number]) : [w.x, w.y];
        w.tx = pick[0];
        w.ty = pick[1];
        w.t = 0;
      }
      w.t = Math.min(1, w.t + (dt * w.speed) / TILE);
      const fx = (w.x + (w.tx - w.x) * w.t + 0.5) * TILE;
      const fz = (w.y + (w.ty - w.y) * w.t + 0.5) * TILE;
      w.pos.set(fx + (w.speed - 1.45) * 2.4, w.z * STOREY, fz - (w.speed - 1.45) * 2.4);
      if (w.tx !== w.x || w.ty !== w.y) w.yaw = Math.atan2(w.tx - w.x, w.ty - w.y);
      w.phase += dt * w.speed * 2.2;
    }
  }

  /** Pose the instanced bodies: once per presented frame. */
  draw(): void {
    this.people.forEach((w, i) => {
      this.meshes.set(i, w.pos, w.yaw, pose(this.pose, w.phase * 2, w.tx !== w.x || w.ty !== w.y ? 0.6 : 0, false));
    });
    this.meshes.commit();
  }
}
