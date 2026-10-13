// Low-poly models built in code: people (Kylo and the city's crowd) and hover cars. Flat shaded,
// saturated, with emissive accents that the bloom picks up.

import * as THREE from "three";

const std = (color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, metalness: 0.1, ...opts });
const glow = (color: number, power = 2.2): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), toneMapped: false });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

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

export interface Person {
  root: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  body: THREE.Object3D;
}

/** A person about 1.8 m tall, feet at y = 0, facing +z. */
export function buildPerson(look: PersonLook): Person {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const coat = std(look.coat);
  const skin = std(look.skin);
  const legs = std(look.trousers);

  const mkLeg = (side: number): THREE.Object3D => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12, 0.9, 0);
    pivot.add(part(new THREE.BoxGeometry(0.17, 0.86, 0.2).translate(0, -0.43, 0), legs, 0, 0, 0));
    pivot.add(part(new THREE.BoxGeometry(0.19, 0.1, 0.3).translate(0, -0.86, 0.04), std(0x1c182c), 0, 0, 0));
    root.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // Torso: a tapered prism; a long coat flares down past the knees.
  const torso = new THREE.CylinderGeometry(0.27, look.long ? 0.36 : 0.24, look.long ? 1.05 : 0.62, 6);
  body.add(part(torso, coat, 0, look.long ? 1.02 : 1.2, 0));
  if (look.long) {
    body.add(part(new THREE.CylinderGeometry(0.2, 0.26, 0.26, 6), coat, 0, 1.6, 0)); // high collar
    if (look.accent !== undefined) body.add(part(new THREE.TorusGeometry(0.22, 0.025, 4, 12).rotateX(Math.PI / 2), glow(look.accent), 0, 1.72, 0));
  }
  const head = new THREE.Group();
  head.position.set(0, 1.66, 0);
  head.add(part(new THREE.IcosahedronGeometry(0.15, 0), skin, 0, 0.07, 0));
  if (look.visor) {
    head.add(part(new THREE.BoxGeometry(0.3, 0.24, 0.3), std(look.hair, { metalness: 0.6, roughness: 0.3 }), 0, 0.1, -0.01));
    head.add(part(new THREE.BoxGeometry(0.26, 0.06, 0.05), glow(look.accent ?? 0x3aeeff), 0, 0.08, 0.15));
  } else {
    head.add(part(new THREE.BoxGeometry(0.28, 0.1, 0.28), std(look.hair), 0, 0.17, -0.02));
  }
  body.add(head);

  const mkArm = (side: number): THREE.Object3D => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.33, 1.48, 0);
    pivot.add(part(new THREE.BoxGeometry(0.13, 0.62, 0.14).translate(0, -0.31, 0), coat, 0, 0, 0));
    pivot.add(part(new THREE.BoxGeometry(0.11, 0.11, 0.11), skin, 0, -0.66, 0));
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  return { root, legL, legR, armL, armR, body };
}

/** Swings the limbs: `phase` advances with distance walked, `amount` 0..1 with speed. */
export function animatePerson(p: Person, phase: number, amount: number, airborne: boolean): void {
  const s = Math.sin(phase) * 0.7 * amount;
  p.legL.rotation.x = airborne ? -0.5 : s;
  p.legR.rotation.x = airborne ? 0.3 : -s;
  p.armL.rotation.x = airborne ? -1.2 : -s * 0.9;
  p.armR.rotation.x = airborne ? -1.2 : s * 0.9;
  p.body.position.y = Math.abs(Math.cos(phase)) * 0.05 * amount;
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

export type CarKind = "taxi" | "cruiser" | "civilian";

export interface Car {
  root: THREE.Group;
  /** The body, tilted and bobbed by the flight model. */
  body: THREE.Group;
  lights: THREE.Mesh[];
}

/** A hover car about 4.6 m long, nose toward +z, the bottom of its skirt at y = 0. */
export function buildCar(kind: CarKind, paint = 0xd89c20): Car {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const colour = kind === "taxi" ? 0xd89818 : kind === "cruiser" ? 0x2e50a0 : paint;
  const shell = std(colour, { metalness: 0.45, roughness: 0.35 });
  const dark = std(0x1c1a2c, { metalness: 0.5, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0a1a2a, metalness: 0.9, roughness: 0.05, emissive: 0x0a2a3a });
  const underglow = kind === "cruiser" ? 0x3aeeff : kind === "taxi" ? 0xff3aa8 : 0xb46aff;
  // A wedge hull: a lower deck, a tapered nose, a cabin.
  body.add(part(new THREE.BoxGeometry(1.9, 0.45, 4.4), shell, 0, 0.45, 0));
  body.add(part(new THREE.BoxGeometry(1.7, 0.3, 1.2).translate(0, 0, 0), shell, 0, 0.78, 1.45));
  const cabin = part(new THREE.BoxGeometry(1.5, 0.55, 2.0), glass, 0, 0.95, -0.15);
  body.add(cabin);
  body.add(part(new THREE.BoxGeometry(1.56, 0.08, 1.8), shell, 0, 1.25, -0.25));
  body.add(part(new THREE.BoxGeometry(2.1, 0.18, 4.0), dark, 0, 0.18, 0)); // the skirt
  // Thruster pods at the four corners.
  for (const [x, z] of [[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.5], [1.05, -1.5]] as const) {
    body.add(part(new THREE.CylinderGeometry(0.28, 0.32, 0.3, 8), dark, x, 0.2, z));
    body.add(part(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 8), glow(underglow, 2.6), x, 0.04, z));
  }
  const lights: THREE.Mesh[] = [];
  const head = glow(0xe8f6ff, 3);
  const tail = glow(0xff2a6a, 2.6);
  for (const x of [-0.7, 0.7]) {
    lights.push(part(new THREE.BoxGeometry(0.4, 0.1, 0.06), head, x, 0.55, 2.21));
    lights.push(part(new THREE.BoxGeometry(0.5, 0.1, 0.06), tail, x, 0.55, -2.21));
  }
  lights.push(part(new THREE.BoxGeometry(2.0, 0.05, 0.05), glow(underglow, 2.4), 0, 0.12, 2.0));
  lights.push(part(new THREE.BoxGeometry(2.0, 0.05, 0.05), glow(underglow, 2.4), 0, 0.12, -2.0));
  for (const l of lights) body.add(l);
  if (kind === "taxi") {
    body.add(part(new THREE.BoxGeometry(0.7, 0.2, 0.35), glow(0xffe23a, 2), 0, 1.4, -0.2));
  }
  if (kind === "cruiser") {
    const bar = new THREE.Group();
    bar.add(part(new THREE.BoxGeometry(0.5, 0.12, 0.25), glow(0xff3aa8, 3), -0.3, 0, 0));
    bar.add(part(new THREE.BoxGeometry(0.5, 0.12, 0.25), glow(0x3aeeff, 3), 0.3, 0, 0));
    bar.position.set(0, 1.36, -0.2);
    bar.name = "lightbar";
    body.add(bar);
  }
  // A pool of underglow on whatever is below: an additive disc.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: underglow, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  pool.position.y = -0.55;
  pool.name = "pool";
  root.add(pool);
  return { root, body, lights };
}
