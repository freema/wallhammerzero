// The atmosphere: a sky dome (gradient, stars, a ringed gas giant and a moon, all in a shader),
// colour fog, the lights, and the endless city around the district (instanced towers whose
// windows are drawn in the shader from world position), so the planet reads as one city.

import * as THREE from "three";
import { hash3, STOREY, TILE } from "./world.ts";
import type { World } from "./world.ts";

export const PALETTE = {
  zenith: new THREE.Color(0x05031a),
  mid: new THREE.Color(0x2a1458),
  horizon: new THREE.Color(0xd8437e),
  fog: new THREE.Color(0x3a1c5c),
};

const PLANET_DIR = new THREE.Vector3(-0.55, 0.32, -0.77).normalize();

export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: PALETTE.zenith },
      mid: { value: PALETTE.mid },
      horizon: { value: PALETTE.horizon },
      planetDir: { value: PLANET_DIR },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, mid, horizon, planetDir;
      uniform float time;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.28, h));
        col = mix(col, zenith, smoothstep(0.25, 0.85, h));
        col = mix(col, horizon * 0.35, smoothstep(0.0, -0.3, h));
        // Stars.
        vec3 q = floor(d * 420.0);
        float s = hash(q);
        float tw = 0.6 + 0.4 * sin(time * 2.0 + s * 60.0);
        col += vec3(0.8, 0.9, 1.0) * step(0.9975, s) * smoothstep(0.08, 0.5, h) * tw * 1.4;
        // Nebula wisps.
        float n = sin(d.x * 7.0 + d.z * 3.0) * sin(d.y * 9.0 - d.x * 4.0) * sin(d.z * 6.0 + d.y * 2.0);
        col += vec3(0.25, 0.05, 0.35) * smoothstep(0.2, 0.9, n) * smoothstep(0.1, 0.6, h);
        // The gas giant: banded, lit from one side, with a ring.
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 tu = normalize(cross(up, planetDir));
        vec3 tv = cross(planetDir, tu);
        float along = dot(d, planetDir);
        vec2 uv = vec2(dot(d, tu), dot(d, tv)) / max(along, 0.001);
        float R = 0.26;
        float r = length(uv);
        float tilt = 0.35;
        vec2 ru = vec2(uv.x * cos(tilt) - uv.y * sin(tilt), uv.x * sin(tilt) + uv.y * cos(tilt));
        float ring = length(vec2(ru.x, ru.y * 4.2));
        float ringMask = smoothstep(0.012, 0.0, abs(ring - R * 1.75)) * 0.8 + smoothstep(0.02, 0.0, abs(ring - R * 1.5)) * 0.5;
        bool ringBehind = ru.y > 0.0 && r < R;
        if (along > 0.0) {
          if (r < R) {
            float z = sqrt(max(0.0, R * R - r * r)) / R;
            vec3 nrm = normalize(vec3(uv / R, z));
            float light = clamp(dot(nrm, normalize(vec3(0.7, 0.5, 0.4))), 0.0, 1.0);
            float lat = ru.y / R;
            float bands = sin(lat * 18.0 + sin(ru.x * 9.0) * 0.6) * 0.5 + 0.5;
            vec3 pc = mix(vec3(0.95, 0.45, 0.25), vec3(0.25, 0.85, 0.85), bands);
            pc = mix(pc, vec3(1.0, 0.85, 0.55), smoothstep(0.7, 1.0, bands) * 0.5);
            col = mix(col, pc * (0.08 + light * 1.1), smoothstep(R, R * 0.985, r));
            col += vec3(0.9, 0.5, 0.8) * pow(1.0 - z, 3.0) * 0.6;
          } else {
            col += vec3(0.9, 0.4, 0.7) * smoothstep(R * 1.25, R, r) * 0.35;
          }
          if (!ringBehind) col = mix(col, vec3(1.0, 0.82, 0.62), ringMask * 0.85);
        }
        // A small pale moon.
        vec3 moonDir = normalize(vec3(0.6, 0.55, -0.4));
        float m = dot(d, moonDir);
        col = mix(col, vec3(0.85, 0.95, 1.0), smoothstep(0.99955, 0.9997, m));
        col += vec3(0.4, 0.5, 0.8) * smoothstep(0.995, 1.0, m) * 0.3;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

export function addLights(scene: THREE.Scene): THREE.DirectionalLight {
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0031);
  scene.add(new THREE.HemisphereLight(0x8a6aff, 0xff6a5a, 0.9));
  scene.add(new THREE.AmbientLight(0x30285a, 0.6));
  const key = new THREE.DirectionalLight(0x9ae8ff, 1.6);
  key.position.copy(PLANET_DIR).multiplyScalar(-1).setY(0.8).normalize().multiplyScalar(200);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const cam = key.shadow.camera;
  cam.left = -90;
  cam.right = 90;
  cam.top = 90;
  cam.bottom = -90;
  cam.near = 1;
  cam.far = 600;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.05;
  scene.add(key);
  scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xff5aa8, 0.7);
  rim.position.copy(PLANET_DIR).multiplyScalar(100);
  scene.add(rim);
  return key;
}

/** The endless city around the district. */
export function createSkyline(world: World): THREE.Group {
  const group = new THREE.Group();
  const ground = world.streetLevel * STOREY;
  const minX = -30, minZ = -30, maxX = world.w * TILE + 30, maxZ = world.d * TILE + 30;
  const spacing = 22;
  const range = 1700;
  const matrices: THREE.Matrix4[] = [];
  const tmp = new THREE.Object3D();
  const beacons: THREE.Vector3[] = [];
  const cx = (world.w * TILE) / 2;
  const cz = (world.d * TILE) / 2;
  // Boxes per grid cell, for collisions: [x0, z0, x1, z1, top].
  const solids = new Map<string, [number, number, number, number, number][]>();
  const keep = (ix: number, iz: number, x: number, z: number, hw: number, hd: number, top: number): void => {
    const k = `${ix},${iz}`;
    const list = solids.get(k) ?? [];
    list.push([x - hw, z - hd, x + hw, z + hd, top]);
    solids.set(k, list);
  };
  for (let gz = -range; gz <= range; gz += spacing) {
    for (let gx = -range; gx <= range; gx += spacing) {
      const ix = Math.round(gx / spacing), iz = Math.round(gz / spacing);
      if (ix % 5 === 0 || iz % 6 === 0) continue; // avenues
      const x = cx + gx, z = cz + gz;
      if (x > minX - spacing && x < maxX + spacing && z > minZ - spacing && z < maxZ + spacing) continue;
      const r = hash3(ix, iz, 7);
      const dist = Math.hypot(gx, gz);
      let height = 18 + Math.pow(hash3(ix, iz, 8), 2.4) * 120 + Math.max(0, 1 - dist / 900) * 30;
      if (r < 0.006) height = 260 + hash3(ix, iz, 9) * 420;
      const fw = 10 + hash3(ix, iz, 10) * 9;
      const fd = 10 + hash3(ix, iz, 11) * 9;
      tmp.position.set(x, ground, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(fw, height, fd);
      tmp.updateMatrix();
      matrices.push(tmp.matrix.clone());
      keep(ix, iz, x, z, fw / 2, fd / 2, ground + height);
      if (height > 90 && hash3(ix, iz, 12) < 0.5) {
        // A stepped crown on tall towers.
        tmp.position.set(x, ground + height, z);
        tmp.scale.set(fw * 0.6, height * 0.12, fd * 0.6);
        tmp.updateMatrix();
        matrices.push(tmp.matrix.clone());
        keep(ix, iz, x, z, fw * 0.3, fd * 0.3, ground + height * 1.12);
        beacons.push(new THREE.Vector3(x, ground + height * 1.12 + 1, z));
      }
    }
  }
  world.outside = (x, y, z) => {
    const ix = Math.round((x - cx) / spacing), iz = Math.round((z - cz) / spacing);
    for (const b of solids.get(`${ix},${iz}`) ?? []) if (x > b[0] && x < b[2] && z > b[1] && z < b[3] && y < b[4]) return true;
    return false;
  };
  world.outsideFloor = (x, z, maxY) => {
    const ix = Math.round((x - cx) / spacing), iz = Math.round((z - cz) / spacing);
    let best = -Infinity;
    for (const b of solids.get(`${ix},${iz}`) ?? []) if (x > b[0] && x < b[2] && z > b[1] && z < b[3] && b[4] <= maxY + 1e-6 && b[4] > best) best = b[4];
    return best;
  };
  const material = new THREE.MeshStandardMaterial({ color: 0x23263e, roughness: 0.9, metalness: 0.05 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying vec3 vTower;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        mat4 nhM = modelMatrix;
        #ifdef USE_INSTANCING
          nhM = modelMatrix * instanceMatrix;
        #endif
        vWPos = (nhM * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(nhM) * normal);
        vTower = (nhM * vec4(0.0, 0.0, 0.0, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying vec3 vTower;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        if (abs(vWNrm.y) < 0.5) {
          float along = abs(vWNrm.x) > 0.5 ? vWPos.z : vWPos.x;
          vec2 cell = floor(vec2(along / 2.4, vWPos.y / 3.4));
          vec2 f = fract(vec2(along / 2.4, vWPos.y / 3.4));
          float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
          float seed = h21(vTower.xz * 0.013 + cell * 0.71);
          float lit = step(0.74, seed);
          vec3 warm = vec3(1.0, 0.78, 0.45);
          vec3 cold = vec3(0.55, 0.85, 1.0);
          vec3 neonc = h21(vTower.xz) < 0.5 ? vec3(1.0, 0.25, 0.65) : vec3(0.25, 0.95, 1.0);
          vec3 wc = mix(warm, cold, step(0.5, h21(cell + vTower.xz)));
          totalEmissiveRadiance += wc * win * lit * 0.62;
          // A neon band every few storeys on some towers.
          float band = step(0.93, fract(vWPos.y / 27.0)) * step(0.55, h21(vTower.xz * 0.3));
          totalEmissiveRadiance += neonc * band * 0.9;
        }`,
      );
  };
  const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material, matrices.length);
  matrices.forEach((m, i) => towers.setMatrixAt(i, m));
  towers.frustumCulled = false;
  group.add(towers);

  const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a3a).multiplyScalar(3), toneMapped: false }), Math.max(1, beacons.length));
  beaconMesh.count = beacons.length;
  beacons.forEach((p, i) => {
    tmp.position.copy(p);
    tmp.scale.setScalar(1);
    tmp.updateMatrix();
    beaconMesh.setMatrixAt(i, tmp.matrix);
  });
  beaconMesh.frustumCulled = false;
  group.add(beaconMesh);

  // The ground around the district, with a hole where the district is (its streets have their
  // own floor and its stairwells go down into the undercity).
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x15142a, roughness: 1 });
  const W = world.w * TILE, D = world.d * TILE, far = 4000;
  for (const [x0, z0, x1, z1] of [
    [-far, -far, far + W, 0],
    [-far, D, far + W, far + D],
    [-far, 0, 0, D],
    [W, 0, far + W, D],
  ] as const) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), groundMat);
    plane.position.set((x0 + x1) / 2, ground, (z0 + z1) / 2);
    plane.receiveShadow = true;
    group.add(plane);
  }
  return group;
}
