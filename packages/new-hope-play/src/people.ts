// People: one list of body parts serves both Kylo (a normal mesh tree) and the crowd (one
// instanced mesh per part, so the whole crowd is about 17 draws instead of 12 per person).
// Geometry and materials are shared, so a new body costs no GPU memory.

import * as THREE from "three";

export interface PersonLook {
  coat: number;
  skin: number;
  hair: number;
  trousers: number;
  /** A long coat (Kylo) instead of a jacket. */
  long?: boolean;
  /** A glowing accent: Kylo's collar line, a guard's visor. */
  accent?: number;
  visor?: boolean;
}

export const KYLO: PersonLook = { coat: 0xb8304c, skin: 0x9aa6c8, hair: 0x3a3456, trousers: 0x221f30, long: true, accent: 0xff3aa8 };

export function crowdLook(r: () => number): PersonLook {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)] as T;
  if (r() < 0.15) return { coat: 0x2e50a0, skin: 0xc8805e, hair: 0x1a2858, trousers: 0x1a2858, visor: true, accent: 0x3aeeff }; // Union guard
  return {
    coat: pick([0x3e3a54, 0x248256, 0xd89c20, 0x6438a0, 0x686282, 0x8a4038, 0x1f475c]),
    skin: pick([0x844a3e, 0xc8805e, 0xf0b890, 0x9a6a48]),
    hair: pick([0x1c182c, 0x3a3456, 0x7e4a3c, 0xc4a67a, 0xa87ae2]),
    trousers: pick([0x221f30, 0x34384e, 0x2a2c42, 0x4a2430]),
  };
}

type Pivot = "legL" | "legR" | "body" | "head" | "armL" | "armR";
type Surface = "matte" | "metal" | "glow";

interface Part {
  geo: THREE.BufferGeometry;
  pivot: Pivot;
  at: readonly [number, number, number];
  surface: Surface;
  colour: (look: PersonLook) => number;
  has?: (look: PersonLook) => boolean;
}

const SHOE = 0x1c182c;
const GLOW = 2.2;

/** A person about 1.8 m tall, feet at y = 0, facing +z. */
const PARTS: readonly Part[] = (() => {
  const leg = new THREE.BoxGeometry(0.17, 0.86, 0.2).translate(0, -0.43, 0);
  const shoe = new THREE.BoxGeometry(0.19, 0.1, 0.3).translate(0, -0.86, 0.04);
  const arm = new THREE.BoxGeometry(0.13, 0.62, 0.14).translate(0, -0.31, 0);
  const hand = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  const long = (l: PersonLook): boolean => l.long === true;
  const parts: Part[] = [];
  for (const side of ["L", "R"] as const) {
    parts.push({ geo: leg, pivot: `leg${side}`, at: [0, 0, 0], surface: "matte", colour: (l) => l.trousers });
    parts.push({ geo: shoe, pivot: `leg${side}`, at: [0, 0, 0], surface: "matte", colour: () => SHOE });
    parts.push({ geo: arm, pivot: `arm${side}`, at: [0, 0, 0], surface: "matte", colour: (l) => l.coat });
    parts.push({ geo: hand, pivot: `arm${side}`, at: [0, -0.66, 0], surface: "matte", colour: (l) => l.skin });
  }
  // Torso: a tapered prism; a long coat flares down past the knees, with a high collar.
  parts.push({ geo: new THREE.CylinderGeometry(0.27, 0.24, 0.62, 6), pivot: "body", at: [0, 1.2, 0], surface: "matte", colour: (l) => l.coat, has: (l) => !long(l) });
  parts.push({ geo: new THREE.CylinderGeometry(0.27, 0.36, 1.05, 6), pivot: "body", at: [0, 1.02, 0], surface: "matte", colour: (l) => l.coat, has: long });
  parts.push({ geo: new THREE.CylinderGeometry(0.2, 0.26, 0.26, 6), pivot: "body", at: [0, 1.6, 0], surface: "matte", colour: (l) => l.coat, has: long });
  parts.push({
    geo: new THREE.TorusGeometry(0.22, 0.025, 4, 12).rotateX(Math.PI / 2),
    pivot: "body",
    at: [0, 1.72, 0],
    surface: "glow",
    colour: (l) => l.accent ?? 0,
    has: (l) => long(l) && l.accent !== undefined,
  });
  parts.push({ geo: new THREE.IcosahedronGeometry(0.15, 0), pivot: "head", at: [0, 0.07, 0], surface: "matte", colour: (l) => l.skin });
  parts.push({ geo: new THREE.BoxGeometry(0.3, 0.24, 0.3), pivot: "head", at: [0, 0.1, -0.01], surface: "metal", colour: (l) => l.hair, has: (l) => l.visor === true });
  parts.push({ geo: new THREE.BoxGeometry(0.26, 0.06, 0.05), pivot: "head", at: [0, 0.08, 0.15], surface: "glow", colour: (l) => l.accent ?? 0x3aeeff, has: (l) => l.visor === true });
  parts.push({ geo: new THREE.BoxGeometry(0.28, 0.1, 0.28), pivot: "head", at: [0, 0.17, -0.02], surface: "matte", colour: (l) => l.hair, has: (l) => l.visor !== true });
  return parts;
})();

const PIVOT_AT: Record<Pivot, readonly [number, number, number]> = {
  legL: [-0.12, 0.9, 0],
  legR: [0.12, 0.9, 0],
  body: [0, 0, 0],
  head: [0, 1.66, 0],
  armL: [-0.33, 1.48, 0],
  armR: [0.33, 1.48, 0],
};

function surfaceMaterial(surface: Surface, colour: THREE.Color): THREE.Material {
  if (surface === "glow") return new THREE.MeshBasicMaterial({ color: colour.multiplyScalar(GLOW), toneMapped: false });
  return new THREE.MeshStandardMaterial({ color: colour, flatShading: true, ...(surface === "metal" ? { metalness: 0.6, roughness: 0.3 } : { metalness: 0.1, roughness: 0.7 }) });
}

const materials = new Map<string, THREE.Material>();
function material(surface: Surface, hex: number): THREE.Material {
  const key = `${surface}:${hex}`;
  let m = materials.get(key);
  if (!m) {
    m = surfaceMaterial(surface, new THREE.Color(hex));
    materials.set(key, m);
  }
  return m;
}

/** The limb angles and the bob: `phase` advances with distance walked, `amount` 0..1 with speed. */
export interface Pose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  bob: number;
}

export function pose(out: Pose, phase: number, amount: number, airborne: boolean): Pose {
  const s = Math.sin(phase) * 0.7 * amount;
  out.legL = airborne ? -0.5 : s;
  out.legR = airborne ? 0.3 : -s;
  out.armL = airborne ? -1.2 : -s * 0.9;
  out.armR = airborne ? -1.2 : s * 0.9;
  out.bob = Math.abs(Math.cos(phase)) * 0.05 * amount;
  return out;
}

export interface Person {
  root: THREE.Group;
  pivots: Record<Pivot, THREE.Object3D>;
}

/** One person as a tree of meshes (Kylo). */
export function buildPerson(look: PersonLook): Person {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const pivot = (id: Pivot): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(...PIVOT_AT[id]);
    (id.startsWith("leg") ? root : body).add(g);
    return g;
  };
  const pivots: Record<Pivot, THREE.Object3D> = { body, legL: pivot("legL"), legR: pivot("legR"), head: pivot("head"), armL: pivot("armL"), armR: pivot("armR") };
  for (const p of PARTS) {
    if (p.has && !p.has(look)) continue;
    const m = new THREE.Mesh(p.geo, material(p.surface, p.colour(look)));
    m.position.set(...p.at);
    m.castShadow = p.surface !== "glow";
    pivots[p.pivot].add(m);
  }
  return { root, pivots };
}

export function animatePerson(p: Person, phase: number, amount: number, airborne: boolean): void {
  const q = pose(SCRATCH_POSE, phase, amount, airborne);
  p.pivots.legL.rotation.x = q.legL;
  p.pivots.legR.rotation.x = q.legR;
  p.pivots.armL.rotation.x = q.armL;
  p.pivots.armR.rotation.x = q.armR;
  p.pivots.body.position.y = q.bob;
}

const SCRATCH_POSE: Pose = { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 };
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** Many people drawn as one instanced mesh per body part. */
export class PeopleMeshes {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[];
  private readonly looks: PersonLook[] = [];
  private readonly root = new THREE.Matrix4();
  private readonly pivot = new THREE.Matrix4();
  private readonly m = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();
  private readonly colour = new THREE.Color();

  constructor(capacity: number) {
    const white = new THREE.Color(0xffffff);
    const shared: Record<Surface, THREE.Material> = {
      matte: surfaceMaterial("matte", white.clone()),
      metal: surfaceMaterial("metal", white.clone()),
      glow: surfaceMaterial("glow", white.clone()),
    };
    this.meshes = PARTS.map((p) => {
      const mesh = new THREE.InstancedMesh(p.geo, shared[p.surface], capacity);
      mesh.castShadow = p.surface !== "glow";
      // The crowd moves around the whole district; one bounding sphere would be stale.
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      return mesh;
    });
  }

  get count(): number {
    return this.looks.length;
  }

  /** Set person i's look (adds a person when i is the count). */
  setLook(i: number, look: PersonLook): void {
    this.looks[i] = look;
    PARTS.forEach((p, k) => {
      const mesh = this.meshes[k] as THREE.InstancedMesh;
      mesh.count = this.looks.length;
      mesh.setColorAt(i, this.colour.set(p.colour(look)));
      if (!p.has || p.has(look)) return;
      mesh.setMatrixAt(i, HIDDEN);
    });
    for (const mesh of this.meshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Place and pose person i. */
  set(i: number, pos: THREE.Vector3, yaw: number, q: Pose): void {
    const look = this.looks[i] as PersonLook;
    this.root.makeRotationY(yaw).setPosition(pos);
    PARTS.forEach((p, k) => {
      if (p.has && !p.has(look)) return;
      const [px, py, pz] = PIVOT_AT[p.pivot];
      switch (p.pivot) {
        case "legL":
        case "legR":
          this.pivot.multiplyMatrices(this.root, this.t.makeRotationX(q[p.pivot]).setPosition(px, py, pz));
          break;
        case "armL":
        case "armR":
          this.pivot.multiplyMatrices(this.root, this.t.makeRotationX(q[p.pivot]).setPosition(px, py + q.bob, pz));
          break;
        default:
          this.pivot.multiplyMatrices(this.root, this.t.makeTranslation(px, py + q.bob, pz));
      }
      this.m.multiplyMatrices(this.pivot, this.t.makeTranslation(p.at[0], p.at[1], p.at[2]));
      (this.meshes[k] as THREE.InstancedMesh).setMatrixAt(i, this.m);
    });
  }

  /** Call once after the frame's `set` calls. */
  commit(): void {
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }
}
