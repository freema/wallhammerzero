// The archipelago from a seed: islands with beaches, shallows and hills, harbours with a pier,
// houses and a lighthouse, pine forests. Real scale throughout: metres, a pier deck 1.2 m above
// the sea, houses of two 2.8 m storeys, pines 8 to 16 m tall. One height function answers
// everything: the terrain meshes, the heightmap the water reads (shallows and surf), and where
// the keel touches the bottom.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng } from "@whz/det";
import { fbm, smoothstep, valueNoise } from "./noise.ts";

export interface Island {
  x: number;
  z: number;
  /** Radius of the shoreline, metres. */
  r: number;
  /** Height of the highest hills, metres. */
  h: number;
  /** Shape exponent: below 1 steep shores, above 1 long beaches. */
  shape: number;
}

export interface Harbour {
  id: number;
  name: string;
  island: number;
  /** Where a boat delivers: open water at the end of the pier. */
  dock: THREE.Vector2;
  /** Out to sea from the pier, unit. */
  out: THREE.Vector2;
  /** The pier's root on the shore. */
  root: THREE.Vector2;
  colour: number;
}

export interface World {
  seed: number;
  islands: Island[];
  harbours: Harbour[];
  /** Terrain height in metres at a world point; negative under the sea. */
  height(x: number, z: number): number;
  /** The heightmap the water shader reads, and its rectangle (min x, min z, size). */
  heightmap: THREE.DataTexture;
  rect: THREE.Vector4;
  /** Everything to add to the scene. */
  group: THREE.Group;
  /** The light columns over the harbours, to highlight the target. */
  beacons: THREE.Mesh[];
}

const NAMES = ["Saltmere", "Gullhaven", "Kestrel Cove", "Brannock", "Thornwick", "Lowmarsh", "Penrose", "Ashby Quay"];
const BEACON_COLOURS = [0xffc65a, 0x6fe0ff, 0xff8a6a, 0xa8ff8a];
const RECT_SIZE = 4096;
const MAP_TEXELS = 1024;

export function createWorld(seed: number): World {
  const rng = createRng(seed, "archipelago");
  const warpNoise = valueNoise(seed, "warp");
  const detailNoise = valueNoise(seed, "detail");
  const ridgeNoise = valueNoise(seed, "ridge");

  // Islands, placed so that channels of at least 120 m stay open between them, close enough
  // that a run between harbours is a few minutes of sailing.
  const islands: Island[] = [];
  for (let tries = 0; islands.length < 8 && tries < 400; tries++) {
    const r = 120 + rng.int(230);
    const a = (rng.int(6283) / 1000);
    const d = rng.int(900);
    const c = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    if (islands.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < (o.r + r) * 1.2 + 120)) continue;
    islands.push({ ...c, r, h: 22 + rng.int(Math.round(r * 0.28)), shape: 0.8 + rng.int(80) / 100 });
  }

  const raw = (x: number, z: number): number => {
    const warp = fbm(warpNoise, x / 260, z / 260, 3);
    let best = -Infinity;
    let isle: Island | null = null;
    for (const i of islands) {
      const e = 1 - (Math.hypot(x - i.x, z - i.z) + warp * 0.32 * i.r) / i.r;
      if (e > best) {
        best = e;
        isle = i;
      }
    }
    if (!isle) return -40;
    if (best <= 0) return Math.max(-42, best * 70);
    const hills = 0.72 + 0.28 * fbm(detailNoise, x / 140, z / 140, 4);
    const ridges = 1 - Math.abs(fbm(ridgeNoise, x / 90, z / 90, 3));
    const land = isle.h * Math.pow(best, isle.shape) * hills + ridges * ridges * 6 * smoothstep(0.05, 0.4, best);
    // A lip of rock slabs at the waterline, so the shore rises out of the sea instead of a flat
    // grey band; where the noise is low the lip is small and a beach stays.
    const lip = (0.5 + 1.3 * smoothstep(-0.2, 0.4, fbm(warpNoise, x / 70 + 9, z / 70, 2))) * smoothstep(0, 0.05, best);
    return land + lip + fbm(detailNoise, x / 18, z / 18, 2) * 0.6 * smoothstep(0, 0.08, best);
  };

  // Harbours on the four largest islands, facing open water. Each levels terraces for its
  // houses and its lighthouse, so the village stands on flat ground.
  const harbours: Harbour[] = [];
  const plans: HarbourPlan[] = [];
  const bySize = islands.map((isle, i) => ({ isle, i })).sort((a, b) => b.isle.r - a.isle.r);
  for (const { isle, i } of bySize) {
    if (harbours.length === 4) break;
    for (let attempt = 0; attempt < 24; attempt++) {
      const a = rng.int(6283) / 1000;
      const out = new THREE.Vector2(Math.cos(a), Math.sin(a));
      let s = 0;
      while (s < isle.r * 2 && raw(isle.x + out.x * s, isle.z + out.y * s) > 0) s += 2;
      const shore = new THREE.Vector2(isle.x + out.x * s, isle.z + out.y * s);
      let reach = 42;
      while (reach < 130 && raw(shore.x + out.x * reach, shore.y + out.y * reach) > -3.5) reach += 4;
      const dock = shore.clone().addScaledVector(out, reach + 10);
      const clear = [30, 60, 90].every((f) => raw(dock.x + out.x * f, dock.y + out.y * f) < -4);
      if (reach >= 130 || !clear) continue;
      const id = harbours.length;
      harbours.push({ id, name: NAMES[(seed + id * 3) % NAMES.length] as string, island: i, dock, out, root: shore.clone().addScaledVector(out, -3), colour: BEACON_COLOURS[id] as number });
      plans.push(planHarbour(shore, out, reach, raw, rng));
      break;
    }
  }
  const pads = plans.flatMap((p) => p.pads);

  const height = (x: number, z: number): number => {
    let y = raw(x, z);
    for (const p of pads) {
      const dx = x - p.x;
      const dz = z - p.z;
      if (Math.abs(dx) > p.r + 8 || Math.abs(dz) > p.r + 8) continue;
      y += (p.y - y) * smoothstep(p.r + 8, p.r, Math.hypot(dx, dz));
    }
    return y;
  };

  // The heightmap for the water: shallows and surf. Edges are deep sea.
  const half = RECT_SIZE / 2;
  const cell = RECT_SIZE / MAP_TEXELS;
  const map = new Uint16Array(MAP_TEXELS * MAP_TEXELS);
  for (let j = 0; j < MAP_TEXELS; j++) {
    for (let i = 0; i < MAP_TEXELS; i++) {
      const edge = i === 0 || j === 0 || i === MAP_TEXELS - 1 || j === MAP_TEXELS - 1;
      map[j * MAP_TEXELS + i] = THREE.DataUtils.toHalfFloat(edge ? -40 : height(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell));
    }
  }
  const heightmap = new THREE.DataTexture(map, MAP_TEXELS, MAP_TEXELS, THREE.RedFormat, THREE.HalfFloatType);
  heightmap.magFilter = THREE.LinearFilter;
  heightmap.minFilter = THREE.LinearFilter;
  heightmap.needsUpdate = true;

  const group = new THREE.Group();
  for (const isle of islands) group.add(terrainMesh(isle, height, seed));
  for (const plan of plans) group.add(harbourMesh(plan));

  group.add(forest(islands, height, seed, harbours));
  group.add(boulders(islands, height, seed, harbours));

  // A column of light over the target harbour: bright at the sea, fading out upward.
  const fade = new Uint8Array(64 * 4);
  for (let i = 0; i < 64; i++) fade.fill(Math.round(255 * Math.pow(1 - i / 63, 1.6)), i * 4, i * 4 + 4);
  const fadeMap = new THREE.DataTexture(fade, 1, 64);
  fadeMap.needsUpdate = true;
  const beacons = harbours.map((h) => {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 140, 20, 1, true).translate(0, 70, 0),
      new THREE.MeshBasicMaterial({ color: h.colour, alphaMap: fadeMap, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    beam.position.set(h.dock.x, 0, h.dock.y);
    group.add(beam);
    // A spar buoy off the pier end in the harbour's colour: a pole and a top mark of two cones.
    const buoy = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.16, 0.22, 3.4, 8).translate(0, 1.1, 0), h.colour),
      paint(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 8).translate(0, 1.6, 0), 0x1a1a1a),
      paint(new THREE.ConeGeometry(0.42, 0.6, 10).translate(0, 3.15, 0), 0x1a1a1a),
      paint(new THREE.ConeGeometry(0.42, 0.6, 10).rotateX(Math.PI).translate(0, 3.85, 0), 0x1a1a1a),
    ]) as THREE.BufferGeometry;
    const spar = new THREE.Mesh(buoy, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    spar.position.set(h.dock.x + h.out.x * 6, -0.3, h.dock.y + h.out.y * 6);
    spar.castShadow = true;
    group.add(spar);
    return beam;
  });

  return { seed, islands, harbours, height, heightmap, rect: new THREE.Vector4(-half, -half, RECT_SIZE, 0), group, beacons };
}

// A Nordic skerry palette: pink-grey granite (dark where the sea wets it), grey lichen, heather,
// dry grass and moss, dark needles under the forest, pale sand only in the gentle coves.
const SEABED = new THREE.Color(0x4a4a3c);
const ROCK_WET = new THREE.Color(0x4e4842);
const GRANITE = new THREE.Color(0x9a8b7e);
const LICHEN = new THREE.Color(0xa09e8a);
const SAND = new THREE.Color(0xc4b48e);
const DRY_GRASS = new THREE.Color(0x8c8a52);
const HEATHER = new THREE.Color(0x7a6a58);
const MOSS = new THREE.Color(0x4c5c30);
const NEEDLES = new THREE.Color(0x2e3622);

/** Shader detail on the terrain: noise at three scales over the vertex colours, and on rock
 * (the `rock` attribute) layered bands, so close up the ground is not flat paint. */
function terrainMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float rock;\nvarying float vRock;\nvarying vec3 vWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRock = rock;\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vRock;
varying vec3 vWorld;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0)), f.x), f.y);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec2 tp = vWorld.xz;
float tn = tNoise(tp * 0.21) * 0.45 + tNoise(tp * 0.93) * 0.35 + tNoise(tp * 3.7) * 0.2;
diffuseColor.rgb *= 0.74 + 0.5 * tn;
float bands = tNoise(vec2(vWorld.y * 1.6, (vWorld.x + vWorld.z) * 0.07));
diffuseColor.rgb *= mix(1.0, 0.88 + 0.22 * bands, vRock);`,
      );
  };
  return mat;
}

function terrainMesh(isle: Island, height: (x: number, z: number) => number, seed: number): THREE.Mesh {
  const patch = valueNoise(seed, "ground-patch");
  const outcrop = valueNoise(seed, "outcrop");
  const woods = valueNoise(seed, "forest-density");
  const size = isle.r * 2.9;
  const segments = Math.min(240, Math.round(size / 2.8));
  const geo = new THREE.PlaneGeometry(size, size, segments, segments).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const colours = new Float32Array(pos.count * 3);
  const rocky = new Float32Array(pos.count);
  const c = new THREE.Color();
  const veg = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v) + isle.x;
    const z = pos.getZ(v) + isle.z;
    const y = height(x, z);
    pos.setY(v, y);
    const slope = Math.hypot(height(x + 2, z) - y, height(x, z + 2) - y) / 2;
    // Rock: steep ground, the shore wherever it is not a gentle cove, bare tops and outcrops.
    const cove = (1 - smoothstep(0.1, 0.24, slope)) * (1 - smoothstep(1.4, 2.8, y));
    let rock = Math.max(smoothstep(0.32, 0.62, slope), (1 - smoothstep(1.2, 2.6, y)) * (1 - cove), smoothstep(isle.h * 0.72, isle.h * 0.95, y));
    rock = Math.max(rock, smoothstep(0.3, 0.55, fbm(outcrop, x / 38, z / 38, 3)) * smoothstep(3, 8, y));
    // Vegetation: dry grass and heather in patches, moss in hollows, needles under the woods.
    const p = fbm(patch, x / 17, z / 17, 3);
    veg.copy(DRY_GRASS).lerp(HEATHER, smoothstep(-0.1, 0.35, p)).lerp(MOSS, smoothstep(0.1, -0.4, p) * 0.8);
    veg.lerp(NEEDLES, smoothstep(-0.05, 0.25, woods(x / 60, z / 60)) * smoothstep(4, 7, y) * 0.85);
    veg.lerp(SAND, cove);
    // Granite with lichen, wet and dark near the water.
    c.copy(GRANITE).lerp(LICHEN, smoothstep(0.0, 0.5, fbm(patch, x / 9 + 40, z / 9, 2)) * 0.6 * smoothstep(1.5, 3, y));
    c.lerp(ROCK_WET, 1 - smoothstep(0.1, 1.4, y));
    c.lerp(veg, 1 - rock);
    if (y < 0.1) c.copy(SEABED).lerp(cove > 0.5 ? SAND : ROCK_WET, smoothstep(-5, 0.1, y));
    colours.set([c.r, c.g, c.b], v * 3);
    rocky[v] = y < 0.1 ? 0.3 : rock;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geo.setAttribute("rock", new THREE.BufferAttribute(rocky, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.position.set(isle.x, 0, isle.z);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** Granite boulders: on the shore where the sea washes them, and scattered on the hills. */
function boulders(islands: Island[], height: (x: number, z: number) => number, seed: number, harbours: Harbour[]): THREE.InstancedMesh {
  const rng = createRng(seed, "boulders");
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  // One lumpy stone, flattened; instances vary its scale and turn.
  const lump = valueNoise(seed, "boulder");
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + 0.28 * lump(pos.getX(i) * 2.1 + 5, pos.getZ(i) * 2.1 + pos.getY(i) * 1.3);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.62, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const spots: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const isle of islands) {
    const n = Math.round(isle.r * 1.6);
    for (let k = 0; k < n; k++) {
      const a = rng.int(62832) / 10000;
      const d = (rng.int(1350) / 1000) * isle.r;
      const px = isle.x + Math.cos(a) * d;
      const pz = isle.z + Math.sin(a) * d;
      const y = height(px, pz);
      const shore = y > -1.2 && y < 2.2;
      if (!shore && (y < 2.2 || rng.int(100) > 12)) continue;
      if (harbours.some((h) => Math.hypot(h.root.x - px, h.root.y - pz) < 40)) continue;
      const s = shore ? 0.5 + rng.int(220) / 100 : 0.6 + rng.int(150) / 100;
      e.set((rng.int(60) - 30) / 100, rng.int(628) / 100, (rng.int(60) - 30) / 100);
      spots.push(new THREE.Matrix4().compose(new THREE.Vector3(px, y - s * 0.2, pz), q.setFromEuler(e), new THREE.Vector3(s * (0.8 + rng.int(50) / 100), s, s)));
    }
    // Along the waterline: walk out from the middle to the shore, drop a small cluster there.
    const rays = Math.round((isle.r * Math.PI * 2) / 7);
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2 + rng.int(100) / 1000;
      let s = isle.r * 0.3;
      while (s < isle.r * 1.8 && height(isle.x + Math.cos(a) * s, isle.z + Math.sin(a) * s) > 0.9) s += 1.5;
      if (s >= isle.r * 1.8) continue;
      for (let c = 1 + rng.int(3); c > 0; c--) {
        const px = isle.x + Math.cos(a) * (s + rng.int(500) / 100 - 3) + rng.int(400) / 100 - 2;
        const pz = isle.z + Math.sin(a) * (s + rng.int(500) / 100 - 3) + rng.int(400) / 100 - 2;
        if (harbours.some((h) => Math.hypot(h.root.x - px, h.root.y - pz) < 22)) continue;
        const y = height(px, pz);
        const sz = 0.4 + rng.int(180) / 100;
        e.set((rng.int(60) - 30) / 100, rng.int(628) / 100, (rng.int(60) - 30) / 100);
        spots.push(new THREE.Matrix4().compose(new THREE.Vector3(px, y - sz * 0.25, pz), q.setFromEuler(e), new THREE.Vector3(sz * (0.8 + rng.int(50) / 100), sz, sz)));
      }
    }
  }
  const mesh = new THREE.InstancedMesh(geo, terrainMaterial(), spots.length);
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
  geo.setAttribute("rock", new THREE.BufferAttribute(new Float32Array(pos.count).fill(1), 1));
  const tint = new THREE.Color();
  spots.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    const y = m.elements[13] as number;
    tint.copy(GRANITE).lerp(ROCK_WET, 1 - smoothstep(0, 1.6, y)).multiplyScalar(0.85 + rng.int(30) / 100);
    mesh.setColorAt(i, tint);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Bake one colour into a part's vertex colours, so a building is one merged mesh. */
function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute("position").count;
  const colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colours.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  return g;
}

/** A two-storey house: walls 5.6 m, a pitched roof, a door and windows, its long side along x. */
function house(w: number, d: number, wall: number, roof: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [paint(new THREE.BoxGeometry(w, 5.6, d).translate(0, 2.8, 0), wall)];
  const ridge = new THREE.BufferGeometry();
  const hw = w / 2 + 0.35;
  const hd = d / 2 + 0.45;
  const top = 5.6 + d * 0.38;
  // Two roof planes and two gables.
  const v = [
    -hw, 5.5, -hd, hw, 5.5, -hd, hw, top, 0, -hw, 5.5, -hd, hw, top, 0, -hw, top, 0,
    -hw, 5.5, hd, -hw, top, 0, hw, top, 0, -hw, 5.5, hd, hw, top, 0, hw, 5.5, hd,
  ];
  ridge.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  ridge.computeVertexNormals();
  parts.push(paint(ridge, roof));
  const gable = new THREE.BufferGeometry();
  const gw = w / 2;
  const gd = d / 2;
  gable.setAttribute("position", new THREE.Float32BufferAttribute([-gw, 5.6, gd, -gw, 5.6, -gd, -gw, 5.6 + gd * 0.76, 0, gw, 5.6, -gd, gw, 5.6, gd, gw, 5.6 + gd * 0.76, 0], 3));
  gable.computeVertexNormals();
  parts.push(paint(gable, wall));
  // A door (2.1 m) and two rows of windows (1.2 m) on the long sides.
  parts.push(paint(new THREE.BoxGeometry(1.0, 2.1, 0.1).translate(-w * 0.2, 1.05, d / 2 + 0.03), 0x4a3424));
  for (const side of [1, -1]) {
    for (let k = 0; k < Math.max(2, Math.floor(w / 2.6)); k++) {
      const x = -w / 2 + 1.4 + k * 2.6;
      for (const y of [1.6, 4.4]) {
        if (side === 1 && y < 2 && Math.abs(x + w * 0.2) < 1.3) continue;
        parts.push(paint(new THREE.BoxGeometry(0.9, 1.2, 0.1).translate(x, y, side * (d / 2 + 0.05)), 0x2a3440));
        parts.push(paint(new THREE.BoxGeometry(1.15, 1.45, 0.08).translate(x, y, side * (d / 2 + 0.02)), 0xf4f1ea));
        parts.push(paint(new THREE.BoxGeometry(1.3, 0.1, 0.22).translate(x, y - 0.68, side * (d / 2 + 0.08)), 0xf4f1ea));
      }
    }
  }
  // White corner boards and a door frame: the Nordic trim.
  for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    parts.push(paint(new THREE.BoxGeometry(0.24, 5.6, 0.24).translate(cx * (w / 2), 2.8, cz * (d / 2)), 0xf4f1ea));
  }
  parts.push(paint(new THREE.BoxGeometry(1.3, 2.35, 0.06).translate(-w * 0.2, 1.17, d / 2 + 0.01), 0xf4f1ea));
  parts.push(paint(new THREE.BoxGeometry(1.8, 0.25, 1.0).translate(-w * 0.2, 0.05, d / 2 + 0.5), 0x7a746c));
  // A chimney.
  parts.push(paint(new THREE.BoxGeometry(0.7, 2.2, 0.7).translate(w * 0.28, top - 0.6, d * 0.12), 0x8a5a48));
  return mergeGeometries(parts) as THREE.BufferGeometry;
}

/** Houses: vertical boards on the walls and rows of tiles on the roofs, from the world position
 * and the normal, so the merged, turned houses need no UVs. */
function timberMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;\nvarying vec3 vWN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;\nvarying vec3 vWN;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 wn = normalize(vWN);
float along = dot(vWorld.xz, normalize(vec2(-wn.z, wn.x) + 1e-5));
float board = smoothstep(0.0, 0.025, abs(fract(along / 0.22) - 0.5) - 0.44);
float wall = 1.0 - smoothstep(0.3, 0.6, abs(wn.y));
float tile = smoothstep(0.0, 0.04, abs(fract(vWorld.y / 0.32) - 0.5) - 0.4);
float roof = smoothstep(0.3, 0.6, abs(wn.y)) * (1.0 - smoothstep(0.95, 0.99, wn.y));
diffuseColor.rgb *= 1.0 - 0.16 * board * wall - 0.3 * tile * roof;`,
      );
  };
  return mat;
}

/** Where a harbour's buildings stand, decided before the terrain is built so it can be levelled. */
interface HarbourPlan {
  shore: THREE.Vector2;
  out: THREE.Vector2;
  reach: number;
  houses: { x: number; z: number; y: number; w: number; d: number; turn: number; wall: number; roof: number }[];
  lighthouse: { x: number; z: number; y: number } | null;
  /** Level terraces: the ground within r is pulled to y, blending out over 8 m. */
  pads: { x: number; z: number; y: number; r: number }[];
}

function planHarbour(shore: THREE.Vector2, out: THREE.Vector2, reach: number, raw: (x: number, z: number) => number, rng: ReturnType<typeof createRng>): HarbourPlan {
  const plan: HarbourPlan = { shore, out, reach, houses: [], lighthouse: null, pads: [] };
  const walls = [0xf2ead8, 0xe8d4a8, 0xdfe6e8, 0xf0dcc8, 0x9a3a2a, 0xd8b84a];
  const roofs = [0xa8442c, 0x7a3a2c, 0x5a5f66, 0xb8562e];
  const side = new THREE.Vector2(out.y, -out.x);
  for (const sgn of [1, -1]) {
    const x = shore.x + side.x * 26 * sgn - out.x * 6;
    const z = shore.y + side.y * 26 * sgn - out.y * 6;
    const y = raw(x, z);
    if (y < 0.3 || y > 14) continue;
    plan.lighthouse = { x, z, y: Math.max(1.6, y) };
    plan.pads.push({ x, z, y: Math.max(1.6, y), r: 4 });
    break;
  }
  const light = plan.lighthouse;
  for (let k = 0; k < 24 && plan.houses.length < 7; k++) {
    const back = 12 + rng.int(48);
    const across = rng.int(76) - 38;
    const x = shore.x - out.x * back + side.x * across;
    const z = shore.y - out.y * back + side.y * across;
    const y = raw(x, z);
    const slope = Math.abs(raw(x + 4, z) - raw(x - 4, z)) + Math.abs(raw(x, z + 4) - raw(x, z - 4));
    if (y < 1.2 || y > 26 || slope > 10) continue;
    if (plan.houses.some((p) => Math.hypot(p.x - x, p.z - z) < 13)) continue;
    if (light && Math.hypot(light.x - x, light.z - z) < 12) continue;
    const w = 6 + rng.int(4);
    const d = 7 + rng.int(3);
    const level = Math.max(2, y);
    plan.houses.push({ x, z, y: level, w, d, turn: (rng.int(40) - 20) / 100, wall: walls[rng.int(walls.length)] as number, roof: roofs[rng.int(roofs.length)] as number });
    plan.pads.push({ x, z, y: level, r: Math.hypot(w, d) / 2 + 1 });
  }
  return plan;
}

function harbourMesh(plan: HarbourPlan): THREE.Group {
  const { shore, out, reach } = plan;
  const g = new THREE.Group();
  const yaw = Math.atan2(out.x, out.y);
  const parts: THREE.BufferGeometry[] = [];
  // The pier: a deck 2.8 m wide, 1.2 m above the sea, on piles every 4 m.
  // Planks 24 cm wide with gaps, weathered to different greys, on two stringers.
  for (let s = -6; s < reach; s += 0.28) {
    const grey = [0x8a7a64, 0x7e705c, 0x948670, 0x76695a][Math.floor((s + 6) * 7.3) % 4] as number;
    parts.push(paint(new THREE.BoxGeometry(2.8 + ((Math.floor(s * 13) % 3) - 1) * 0.06, 0.07, 0.24).translate(0, 1.32, s + 0.12), grey));
  }
  for (const x of [-1.1, 1.1]) parts.push(paint(new THREE.BoxGeometry(0.2, 0.3, reach + 6).translate(x, 1.13, (reach + 6) / 2 - 6), 0x4a3c2e));
  for (let s = 0; s <= reach; s += 4) {
    for (const x of [-1.25, 1.25]) parts.push(paint(new THREE.CylinderGeometry(0.16, 0.18, 9, 6).translate(x, -3.3, s), 0x4a3a2c));
  }
  for (let s = 6; s <= reach; s += 8) parts.push(paint(new THREE.CylinderGeometry(0.14, 0.18, 0.5, 8).translate(1.15, 1.6, s), 0x2a2a2a));
  const pierMesh = new THREE.Mesh(mergeGeometries(parts) as THREE.BufferGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  pierMesh.position.set(shore.x, 0, shore.y);
  pierMesh.rotation.y = yaw;
  pierMesh.castShadow = true;
  pierMesh.receiveShadow = true;
  g.add(pierMesh);

  // Houses on their terraces above the pier, each facing the sea, on a stone plinth.
  const houses = plan.houses.map((h) => {
    const geo = mergeGeometries([house(h.w, h.d, h.wall, h.roof), paint(new THREE.BoxGeometry(h.w + 0.5, 2, h.d + 0.5).translate(0, -0.8, 0), 0x6e6862)]) as THREE.BufferGeometry;
    return geo.rotateY(yaw + h.turn).translate(h.x, h.y - 0.1, h.z);
  });
  if (houses.length) {
    const m = new THREE.Mesh(mergeGeometries(houses) as THREE.BufferGeometry, timberMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }

  // A lighthouse on the shore beside the pier: 18 m, white with a red band, a lit lantern.
  if (plan.lighthouse) {
    const { x, y, z } = plan.lighthouse;
    const tower = mergeGeometries([
      paint(new THREE.CylinderGeometry(3.0, 3.3, 2.4, 18).translate(0, -0.6, 0), 0x6e6862),
      paint(new THREE.CylinderGeometry(1.5, 2.3, 16, 18).translate(0, 8, 0), 0xf4f2ec),
      paint(new THREE.CylinderGeometry(1.78, 1.95, 3.2, 18).translate(0, 9, 0), 0xb83a2e),
      paint(new THREE.CylinderGeometry(2.0, 2.0, 0.4, 18).translate(0, 16.2, 0), 0x2a2a2a),
      paint(new THREE.CylinderGeometry(1.0, 1.4, 1.2, 12).translate(0, 18.9, 0), 0xb83a2e),
    ]) as THREE.BufferGeometry;
    const t = new THREE.Mesh(tower, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    t.position.set(x, y, z);
    t.castShadow = true;
    g.add(t);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd88a, emissiveIntensity: 2.2, roughness: 0.2 }));
    lantern.position.set(x, y + 17.4, z);
    g.add(lantern);
  }
  return g;
}


/** One tier of needles: a cone whose rim is ragged and drooping, nudged off the trunk. */
function tier(rng: ReturnType<typeof createRng>, radius: number, tall: number, y: number, hex: number): THREE.BufferGeometry {
  const cone = new THREE.ConeGeometry(radius, tall, 9, 1, true);
  const pos = cone.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) continue;
    const k = 0.75 + rng.int(50) / 100;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) - rng.int(45) / 100, pos.getZ(i) * k);
  }
  cone.computeVertexNormals();
  return paint(cone.translate((rng.int(30) - 15) / 100, y, (rng.int(30) - 15) / 100), hex);
}

/** A spruce or a pine: a thin trunk and five to seven ragged tiers. Height about 9 m at scale 1. */
function conifer(rng: ReturnType<typeof createRng>, narrow: boolean): THREE.BufferGeometry {
  const parts = [paint(new THREE.CylinderGeometry(0.1, 0.22, 4, 6).translate(0, 2, 0), 0x4a3828)];
  const tiers = narrow ? 7 : 5;
  const greens = [0x1e2e1c, 0x223420, 0x283a24, 0x2c3e26];
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const radius = (narrow ? 1.5 : 2.1) * (1 - f * 0.78);
    const y = (narrow ? 2.2 : 3.0) + f * (narrow ? 6.4 : 5.2);
    parts.push(tier(rng, radius, narrow ? 2.0 : 2.3, y, greens[(t + (narrow ? 1 : 0)) % greens.length] as number));
  }
  return mergeGeometries(parts) as THREE.BufferGeometry;
}

/** A birch: a pale trunk and a loose crown of three lumps. About 8 m at scale 1. */
function birch(rng: ReturnType<typeof createRng>): THREE.BufferGeometry {
  const parts = [paint(new THREE.CylinderGeometry(0.1, 0.17, 5.5, 6).translate(0, 2.75, 0), 0xd8d2c4)];
  const greens = [0x4e6a2c, 0x5a7232, 0x46602a];
  for (let k = 0; k < 3; k++) {
    const blob = new THREE.IcosahedronGeometry(1.6 - k * 0.25, 1);
    const pos = blob.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const j = 0.82 + rng.int(36) / 100;
      pos.setXYZ(i, pos.getX(i) * j, pos.getY(i) * j * 1.15, pos.getZ(i) * j);
    }
    blob.computeVertexNormals();
    const a = (k / 3) * Math.PI * 2;
    parts.push(paint(blob.translate(Math.cos(a) * 0.7, 5.4 + k * 0.9, Math.sin(a) * 0.7), greens[k] as number));
  }
  return mergeGeometries(parts) as THREE.BufferGeometry;
}

/**
 * The woods: spruce, pine and birch, one instanced mesh each. Trees stand at random points
 * (not a grid) where the forest noise is high, thicker in its core; birches keep to the low
 * ground and the forest edges. 7 to 16 m tall.
 */
function forest(islands: Island[], height: (x: number, z: number) => number, seed: number, harbours: Harbour[]): THREE.Group {
  const rng = createRng(seed, "forest");
  const density = valueNoise(seed, "forest-density");
  const kinds = [conifer(rng, true), conifer(rng, false), birch(rng)];
  const spots: THREE.Matrix4[][] = [[], [], []];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let total = 0;
  for (const isle of islands) {
    const tries = Math.round(isle.r * isle.r * 0.06);
    for (let k = 0; k < tries && total < 7000; k++) {
      const a = rng.int(62832) / 10000;
      const d = Math.sqrt(rng.int(10000) / 10000) * isle.r * 1.3;
      const px = isle.x + Math.cos(a) * d;
      const pz = isle.z + Math.sin(a) * d;
      const y = height(px, pz);
      if (y < 3.5 || y > isle.h * 0.86) continue;
      const w = density(px / 60, pz / 60);
      // The core of a wood is dense; its fringe thins out to single trees.
      if (rng.int(1000) / 1000 > smoothstep(-0.2, 0.2, w) * 0.95 + 0.02) continue;
      const slope = Math.hypot(height(px + 2, pz) - y, height(px, pz + 2) - y) / 2;
      if (slope > 0.62) continue;
      if (harbours.some((h) => Math.hypot(h.root.x - px, h.root.y - pz) < 70)) continue;
      const edge = 1 - smoothstep(0, 0.25, w);
      const kind = rng.int(100) < 12 + 50 * edge * (1 - smoothstep(6, 16, y)) ? 2 : rng.int(100) < 55 ? 0 : 1;
      const s = 0.8 + rng.int(100) / 100;
      q.setFromAxisAngle(up, rng.int(628) / 100);
      (spots[kind] as THREE.Matrix4[]).push(new THREE.Matrix4().compose(new THREE.Vector3(px, y - 0.3, pz), q, new THREE.Vector3(s * (0.85 + rng.int(30) / 100), s * (0.85 + rng.int(40) / 100), s)));
      total++;
    }
  }
  const g = new THREE.Group();
  const tint = new THREE.Color();
  kinds.forEach((geo, i) => {
    const list = spots[i] as THREE.Matrix4[];
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), list.length);
    list.forEach((m, j) => {
      mesh.setMatrixAt(j, m);
      mesh.setColorAt(j, tint.setHSL(0.2 + rng.int(80) / 1000, 0.18, 0.62 + rng.int(30) / 100));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  });
  return g;
}
