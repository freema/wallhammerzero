// Low-poly hover cars built in code: flat shaded, saturated, with emissive accents that the bloom
// picks up. The parts of each kind are merged per material and shared by every car of that kind,
// so a car is 6 or 7 draws and a new car costs no GPU memory. People are in people.ts.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type CarKind = "taxi" | "cruiser" | "civilian";

export interface Car {
  root: THREE.Group;
  /** The body, tilted and bobbed by the flight model. */
  body: THREE.Group;
  /** The Union cruiser's spinning lightbar. */
  lightbar: THREE.Object3D | null;
  /** The pool of underglow on whatever is below. */
  pool: THREE.Mesh;
}

interface KindParts {
  shell: THREE.BufferGeometry;
  dark: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  shellMat: THREE.Material;
  bar: THREE.BufferGeometry | null;
  poolMat: THREE.Material;
}

const at = (geo: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry => geo.translate(x, y, z);

/** Bake an emissive colour (times its power) into a part's vertex colours. */
function lit(geo: THREE.BufferGeometry, hex: number, power: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex).multiplyScalar(power);
  const n = geo.getAttribute("position").count;
  const colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts);
  if (!geo) throw new Error("car parts do not merge");
  for (const p of parts) p.dispose();
  return geo;
}

const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1a2c, flatShading: true, metalness: 0.5, roughness: 0.4 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1a2a, flatShading: true, metalness: 0.9, roughness: 0.05, emissive: 0x0a2a3a });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const poolGeo = new THREE.CircleGeometry(2.6, 20).rotateX(-Math.PI / 2);
const kinds = new Map<CarKind, KindParts>();

function partsOf(kind: CarKind): KindParts {
  const cached = kinds.get(kind);
  if (cached) return cached;
  const colour = kind === "taxi" ? 0xd89818 : kind === "cruiser" ? 0x2e50a0 : 0xd89c20;
  const underglow = kind === "cruiser" ? 0x3aeeff : kind === "taxi" ? 0xff3aa8 : 0xb46aff;
  // A wedge hull: a lower deck, a tapered nose, a cabin, a roof; the skirt and thruster pods.
  const shell = merge([at(new THREE.BoxGeometry(1.9, 0.45, 4.4), 0, 0.45, 0), at(new THREE.BoxGeometry(1.7, 0.3, 1.2), 0, 0.78, 1.45), at(new THREE.BoxGeometry(1.56, 0.08, 1.8), 0, 1.25, -0.25)]);
  const dark: THREE.BufferGeometry[] = [at(new THREE.BoxGeometry(2.1, 0.18, 4.0), 0, 0.18, 0)];
  const glow: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-1.05, 1.5], [1.05, 1.5], [-1.05, -1.5], [1.05, -1.5]] as const) {
    dark.push(at(new THREE.CylinderGeometry(0.28, 0.32, 0.3, 8), x, 0.2, z));
    glow.push(lit(at(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 8), x, 0.04, z), underglow, 2.6));
  }
  for (const x of [-0.7, 0.7]) {
    glow.push(lit(at(new THREE.BoxGeometry(0.4, 0.1, 0.06), x, 0.55, 2.21), 0xe8f6ff, 3));
    glow.push(lit(at(new THREE.BoxGeometry(0.5, 0.1, 0.06), x, 0.55, -2.21), 0xff2a6a, 2.6));
  }
  glow.push(lit(at(new THREE.BoxGeometry(2.0, 0.05, 0.05), 0, 0.12, 2.0), underglow, 2.4));
  glow.push(lit(at(new THREE.BoxGeometry(2.0, 0.05, 0.05), 0, 0.12, -2.0), underglow, 2.4));
  if (kind === "taxi") glow.push(lit(at(new THREE.BoxGeometry(0.7, 0.2, 0.35), 0, 1.4, -0.2), 0xffe23a, 2));
  const bar = kind === "cruiser" ? merge([lit(at(new THREE.BoxGeometry(0.5, 0.12, 0.25), -0.3, 0, 0), 0xff3aa8, 3), lit(at(new THREE.BoxGeometry(0.5, 0.12, 0.25), 0.3, 0, 0), 0x3aeeff, 3)]) : null;
  const parts: KindParts = {
    shell,
    dark: merge(dark),
    glass: at(new THREE.BoxGeometry(1.5, 0.55, 2.0), 0, 0.95, -0.15),
    glow: merge(glow),
    shellMat: new THREE.MeshStandardMaterial({ color: colour, flatShading: true, metalness: 0.45, roughness: 0.35 }),
    bar,
    poolMat: new THREE.MeshBasicMaterial({ color: underglow, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
  };
  kinds.set(kind, parts);
  return parts;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow: boolean): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  return m;
}

/** A hover car about 4.6 m long, nose toward +z, the bottom of its skirt at y = 0. */
export function buildCar(kind: CarKind): Car {
  const p = partsOf(kind);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(p.shell, p.shellMat, true), mesh(p.dark, darkMat, true), mesh(p.glass, glassMat, true), mesh(p.glow, glowMat, false));
  let lightbar: THREE.Object3D | null = null;
  if (p.bar) {
    lightbar = mesh(p.bar, glowMat, false);
    lightbar.position.set(0, 1.36, -0.2);
    body.add(lightbar);
  }
  const pool = mesh(poolGeo, p.poolMat, false);
  pool.position.y = -0.55;
  root.add(pool);
  return { root, body, lightbar, pool };
}
