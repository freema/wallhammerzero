// The district as meshes: every visible face of the cell grid, slabs, ramps, lift shafts and
// railings, built in chunks against one procedural atlas; plus instanced details (blade signs,
// rooftop gear, Psion crystals in the undercity).

import * as THREE from "three";
import { K } from "@whz/citygen";
import { GROUND, ROW, TOP } from "./textures.ts";
import type { Atlas } from "./textures.ts";
import { hash3, isOpaque, STOREY, TILE } from "./world.ts";
import type { World } from "./world.ts";

type V3 = [number, number, number];
type UV = [number, number, number, number];

class GeometryBuilder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  quad(a: V3, b: V3, c: V3, d: V3, uv: UV): void {
    const base = this.pos.length / 3;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c, d]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(nx, ny, nz);
    }
    const [u0, v0, u1, v1] = uv;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** One face of a box: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z. */
  face(f: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, uv: UV): void {
    switch (f) {
      case 0: return this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uv);
      case 1: return this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uv);
      case 2: return this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uv);
      case 3: return this.quad([x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x1, y0, z0], uv);
      case 4: return this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uv);
      default: return this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uv);
    }
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, uvSide: UV, uvTop: UV = uvSide, skip = 0): void {
    for (let f = 0; f < 6; f++) if (!(skip & (1 << f))) this.face(f, x0, y0, z0, x1, y1, z1, f === 2 ? uvTop : uvSide);
  }

  build(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Neighbour offsets per face, in citygen cell space (x, y = south, z = level). */
const NEIGHBOUR: readonly V3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
];
const FACADE_ROW = [ROW.union, ROW.union, ROW.habitat, ROW.market, ROW.derelict, ROW.ancient] as const;

export interface CityMeshes {
  group: THREE.Group;
  /** Positions of rooftop beacon lights, for blinking. */
  beacons: THREE.InstancedMesh;
}

const CHUNK = 16;
const SLAB = 0.35;

export function buildCity(world: World, atlas: Atlas): CityMeshes {
  const group = new THREE.Group();
  const cityMat = new THREE.MeshStandardMaterial({
    map: atlas.map,
    emissiveMap: atlas.emissive,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.1,
    roughness: 0.82,
    metalness: 0.08,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x5ad8ff,
    emissive: 0x0a3040,
    transparent: true,
    opacity: 0.22,
    roughness: 0.08,
    metalness: 0.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const signs: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const gear: THREE.Matrix4[] = [];
  const beacons: THREE.Vector3[] = [];
  const crystals: THREE.Matrix4[] = [];
  const neon = [0xff3aa8, 0x3aeeff, 0xffe23a, 0x5aff7a, 0xb46aff].map((c) => new THREE.Color(c));
  const tmp = new THREE.Object3D();

  const kindAt = (x: number, y: number, z: number): number => world.kind(x, y, z);
  const opaqueAt = (x: number, y: number, z: number): boolean => {
    if (z < 0) return true;
    if (x < 0 || y < 0 || x >= world.w || y >= world.d) return z < world.streetLevel;
    return isOpaque(kindAt(x, y, z));
  };

  for (let cy0 = 0; cy0 < world.d; cy0 += CHUNK) {
    for (let cx0 = 0; cx0 < world.w; cx0 += CHUNK) {
      const g = new GeometryBuilder();
      const glass = new GeometryBuilder();
      for (let z = 0; z < world.h; z++) {
        for (let y = cy0; y < Math.min(world.d, cy0 + CHUNK); y++) {
          for (let x = cx0; x < Math.min(world.w, cx0 + CHUNK); x++) {
            const kind = kindAt(x, y, z);
            if (kind === K.empty || kind === K.lane) continue;
            const x0 = x * TILE, x1 = x0 + TILE;
            const z0 = y * TILE, z1 = z0 + TILE;
            const y0 = z * STOREY, y1 = y0 + STOREY;
            const h = (salt: number): number => hash3(x, y, z, salt);

            if (isOpaque(kind)) {
              const solid = kind === K.solid;
              const facade = world.facade(x, y, z);
              for (let f = 0; f < 6; f++) {
                const [dx, dy, dz] = NEIGHBOUR[f] as V3;
                if (opaqueAt(x + dx, y + dy, z + dz)) continue;
                let uv: UV;
                if (f === 2) {
                  const above = kindAt(x, y, z + 1);
                  uv =
                    above === K.street ? atlas.uv(h(3) < 0.12 ? GROUND.asphalt + 3 : GROUND.asphalt, ROW.ground)
                    : above === K.deck ? atlas.uv(TOP.deck + Math.floor(h(4) * 2), ROW.top)
                    : above === K.pad ? atlas.uv(TOP.pad, ROW.top)
                    : above === K.walkway ? atlas.uv(GROUND.walkway, ROW.ground)
                    : above === K.lift ? atlas.uv(GROUND.metal, ROW.ground)
                    : solid ? atlas.uv(TOP.roof + Math.floor(h(5) * 4), ROW.top)
                    : atlas.uv(TOP.stoneTop, ROW.top);
                } else if (f === 3) {
                  uv = atlas.uv(GROUND.concrete, ROW.ground);
                } else if (solid) {
                  uv = atlas.uv(Math.floor(h(f + 10) * 8), FACADE_ROW[facade] ?? ROW.habitat);
                } else {
                  uv = atlas.uv(Math.floor(h(f + 20) * 8), ROW.ruin);
                }
                g.face(f, x0, y0, z0, x1, y1, z1, uv);

                // Details on exposed faces.
                if (solid && f !== 2 && f !== 3 && z > world.streetLevel && h(f + 30) < (facade === 3 ? 0.35 : 0.06)) {
                  // A blade sign sticking out of the wall.
                  const c = neon[Math.floor(h(f + 40) * neon.length)] as THREE.Color;
                  const nx = dx * TILE, nz = dy * TILE;
                  tmp.position.set((x0 + x1) / 2 + nx * 0.5 + nx * 0.09, y0 + 1.6 + h(f + 50) * 1.6, (z0 + z1) / 2 + nz * 0.5 + nz * 0.09);
                  tmp.rotation.set(0, dx !== 0 ? 0 : Math.PI / 2, 0);
                  tmp.scale.set(1.3, 2.2 + h(f + 60) * 1.4, 0.18);
                  tmp.updateMatrix();
                  signs.push({ m: tmp.matrix.clone(), c });
                }
                if (!solid && f !== 2 && f !== 3 && h(f + 70) < 0.18) {
                  tmp.position.set((x0 + x1) / 2 + dx * 2.05, y0 + 0.4 + h(f + 80) * 3, (z0 + z1) / 2 + dy * 2.05);
                  tmp.rotation.set(h(1) * 3, h(2) * 3, h(3) * 3);
                  const s = 0.3 + h(f + 90) * 0.6;
                  tmp.scale.set(s, s * 2.2, s);
                  tmp.updateMatrix();
                  crystals.push(tmp.matrix.clone());
                }
                if (solid && f === 2 && kindAt(x, y, z + 1) !== K.pad) {
                  const r = h(100);
                  if (r < 0.22) {
                    tmp.position.set(x0 + 1 + h(101) * 2, y1, z0 + 1 + h(102) * 2);
                    tmp.rotation.set(0, h(103) * 6, 0);
                    tmp.scale.set(0.8 + h(104), 0.6 + h(105) * 1.2, 0.8 + h(106));
                    tmp.updateMatrix();
                    gear.push(tmp.matrix.clone());
                  } else if (r < 0.27) {
                    // An antenna mast with a red beacon on top.
                    const mast = 3 + h(107) * 9;
                    tmp.position.set(x0 + 2, y1, z0 + 2);
                    tmp.rotation.set(0, 0, 0);
                    tmp.scale.set(0.12, mast, 0.12);
                    tmp.updateMatrix();
                    gear.push(tmp.matrix.clone());
                    beacons.push(new THREE.Vector3(x0 + 2, y1 + mast + 0.2, z0 + 2));
                  }
                }
              }
              continue;
            }

            const belowOpaque = opaqueAt(x, y, z - 1);
            if (kind === K.deck || kind === K.street || kind === K.walkway || kind === K.pad) {
              if (!belowOpaque) {
                const top =
                  kind === K.walkway ? atlas.uv(GROUND.walkway, ROW.ground)
                  : kind === K.pad ? atlas.uv(TOP.pad, ROW.top)
                  : kind === K.street ? atlas.uv(GROUND.asphalt, ROW.ground)
                  : atlas.uv(TOP.deck, ROW.top);
                g.box(x0, y0 - SLAB, z0, x1, y0, z1, atlas.uv(GROUND.metal, ROW.ground), top);
              }
              if (kind === K.walkway) {
                // Railings on the open sides.
                const metal = atlas.uv(GROUND.metal, ROW.ground);
                for (const f of [0, 1, 4, 5]) {
                  const [dx, dy] = NEIGHBOUR[f] as V3;
                  const n = kindAt(x + dx, y + dy, z);
                  if (n !== K.empty && n !== K.lane) continue;
                  const rx0 = f === 0 ? x1 - 0.12 : x0, rx1 = f === 1 ? x0 + 0.12 : x1;
                  const rz0 = f === 4 ? z1 - 0.12 : z0, rz1 = f === 5 ? z0 + 0.12 : z1;
                  g.box(rx0, y0 + 1.0, rz0, rx1, y0 + 1.12, rz1, metal);
                  g.box(rx0, y0, rz0, rx1, y0 + 0.08, rz1, metal);
                  glass.box(rx0, y0, rz0, rx1, y0 + 1.0, rz1, metal);
                }
              }
              continue;
            }

            if (kind === K.stairs) {
              const d = world.dir(x, y, z);
              const hAt = (fx: number, fz: number): number => {
                const t = d === 0 ? 1 - fz : d === 1 ? fx : d === 2 ? fz : 1 - fx;
                return y0 + t * STOREY;
              };
              const uv = atlas.uv(GROUND.stairs, ROW.ground);
              g.quad([x0, hAt(0, 1), z1], [x1, hAt(1, 1), z1], [x1, hAt(1, 0), z0], [x0, hAt(0, 0), z0], uv);
              continue;
            }

            if (kind === K.lift) {
              const metal = atlas.uv(GROUND.metal, ROW.ground);
              const door = world.dir(x, y, z);
              const below = kindAt(x, y, z - 1);
              const above = kindAt(x, y, z + 1);
              if (!belowOpaque && below !== K.lift) g.box(x0, y0 - SLAB, z0, x1, y0, z1, metal);
              if (below !== K.lift && belowOpaque) g.box(x0 + 0.3, y0, z0 + 0.3, x1 - 0.3, y0 + 0.05, z1 - 0.3, metal);
              if (above !== K.lift) g.box(x0, y1 - 0.25, z0, x1, y1, z1, metal);
              for (const [px, pz] of [[x0, z0], [x1 - 0.25, z0], [x0, z1 - 0.25], [x1 - 0.25, z1 - 0.25]] as const) {
                g.box(px, y0, pz, px + 0.25, y1, pz + 0.25, metal, metal, 0b001100);
              }
              // Glass on every side but the door (n, e, s, w = -z, +x, +z, -x).
              const doorFace = [5, 0, 4, 1][door];
              for (const f of [0, 1, 4, 5]) {
                if (f === doorFace) continue;
                const [dx, dy] = NEIGHBOUR[f] as V3;
                if (opaqueAt(x + dx, y + dy, z)) continue;
                glass.face(f, x0 + 0.1, y0, z0 + 0.1, x1 - 0.1, y1, z1 - 0.1, metal);
              }
              continue;
            }
          }
        }
      }
      const geo = g.build();
      if (geo) {
        const mesh = new THREE.Mesh(geo, cityMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      const glassGeo = glass.build();
      if (glassGeo) group.add(new THREE.Mesh(glassGeo, glassMat));
    }
  }

  if (signs.length) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), signs.length);
    signs.forEach((s, i) => {
      mesh.setMatrixAt(i, s.m);
      mesh.setColorAt(i, s.c.clone().multiplyScalar(1.25));
    });
    group.add(mesh);
  }
  if (gear.length) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x606a88, roughness: 0.6, metalness: 0.4 }), gear.length);
    gear.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    group.add(mesh);
  }
  if (crystals.length) {
    const mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb46aff).multiplyScalar(2.4), toneMapped: false }), crystals.length);
    crystals.forEach((m, i) => mesh.setMatrixAt(i, m));
    group.add(mesh);
  }
  const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a3a).multiplyScalar(3), toneMapped: false }), Math.max(1, beacons.length));
  beaconMesh.count = beacons.length;
  beacons.forEach((p, i) => {
    tmp.position.copy(p);
    tmp.rotation.set(0, 0, 0);
    tmp.scale.setScalar(1);
    tmp.updateMatrix();
    beaconMesh.setMatrixAt(i, tmp.matrix);
  });
  group.add(beaconMesh);

  return { group, beacons: beaconMesh };
}
