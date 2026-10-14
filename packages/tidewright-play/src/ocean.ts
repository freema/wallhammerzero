// The ocean: a sum of Gerstner waves, computed the same way on the GPU (the surface you see)
// and on the CPU (the surface the boat floats on). The mesh is a polar grid centred under the
// camera, fine near and coarse to the horizon; short waves fade with distance so the far sea
// does not alias. The look is MeshPhysicalMaterial (sky reflections, the sun's glint, fog)
// with three things patched in: the waves, turquoise shallows and foam from the terrain's
// heightmap, and small ripples in the normal.

import * as THREE from "three";
import { createRng } from "@whz/det";

const G = 9.81;
export const WAVE_COUNT = 6;

export interface Wave {
  /** Unit direction the wave travels, in x and z. */
  dx: number;
  dz: number;
  /** Steepness k·a; the sum stays under 1 or the crests loop. */
  steep: number;
  /** Wavelength in metres. */
  length: number;
}

/** A swell running downwind and shorter waves spread around it. */
export function makeWaves(windTo: number): Wave[] {
  const spec: [number, number, number][] = [
    // angle offset, steepness, wavelength
    [0, 0.05, 64],
    [0.45, 0.046, 37],
    [-0.38, 0.045, 23],
    [0.9, 0.04, 14.5],
    [-0.8, 0.035, 9.3],
    [0.2, 0.03, 6.1],
  ];
  return spec.map(([off, steep, length]) => ({ dx: Math.sin(windTo + off), dz: Math.cos(windTo + off), steep, length }));
}

export interface WaterPoint {
  /** Surface height in metres. */
  y: number;
  /** The surface normal. */
  nx: number;
  ny: number;
  nz: number;
}

function displace(waves: readonly Wave[], x: number, z: number, t: number, storm: number, out: number[]): void {
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  for (const w of waves) {
    const k = (2 * Math.PI) / w.length;
    const c = Math.sqrt(G / k);
    const s = w.steep * storm;
    const a = s / k;
    const f = k * (w.dx * x + w.dz * z - c * t);
    const cf = Math.cos(f);
    const sf = Math.sin(f);
    dx += w.dx * a * cf;
    dz += w.dz * a * cf;
    dy += a * sf;
    nx -= w.dx * s * cf;
    nz -= w.dz * s * cf;
    ny -= s * sf;
  }
  out[0] = dx;
  out[1] = dy;
  out[2] = dz;
  out[3] = nx;
  out[4] = ny;
  out[5] = nz;
}

const scratch = [0, 0, 0, 0, 0, 0];

/** The water surface above the world point (x, z): Gerstner moves points sideways, so the
 * point that lands on (x, z) is found by a few fixed-point steps. */
/** Waves die down in shallow water: full from 9 m of depth, flat at the beach. */
export function calmWithDepth(depth: number): number {
  const k = Math.min(1, Math.max(0, (depth - 0.3) / 8.7));
  return k * k * (3 - 2 * k);
}

export function waterAt(waves: readonly Wave[], x: number, z: number, t: number, storm: number): WaterPoint {
  let px = x;
  let pz = z;
  for (let i = 0; i < 4; i++) {
    displace(waves, px, pz, t, storm, scratch);
    px = x - (scratch[0] as number);
    pz = z - (scratch[2] as number);
  }
  displace(waves, px, pz, t, storm, scratch);
  const len = Math.hypot(scratch[3] as number, scratch[4] as number, scratch[5] as number);
  return { y: scratch[1] as number, nx: (scratch[3] as number) / len, ny: (scratch[4] as number) / len, nz: (scratch[5] as number) / len };
}

/** A disc of rings whose spacing grows with the radius: 0.5 m near the centre, kilometres out. */
function polarGrid(rings: number, segments: number, first: number, growth: number): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const index: number[] = [];
  let r = 0;
  let step = first;
  for (let i = 1; i <= rings; i++) {
    r += step;
    step *= growth;
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  for (let j = 0; j < segments; j++) index.push(0, 1 + ((j + 1) % segments), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segments;
    const a1 = 1 + i * segments;
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      index.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(index);
  return geo;
}

const VERTEX_PARS = /* glsl */ `
uniform float uTime;
uniform float uStorm;
uniform vec4 uWaves[${WAVE_COUNT}];
uniform vec3 uCam;
uniform sampler2D uHeight;
uniform vec4 uHeightRect;
varying vec3 vWorld;
varying float vCrest;

// Waves die down in shallow water: full from 9 m of depth, flat at the beach.
float calmWithDepth(vec2 p) {
  float ground = texture2D(uHeight, (p - uHeightRect.xy) / uHeightRect.z).r;
  return smoothstep(0.3, 9.0, -ground);
}

vec3 gerstner(vec2 p, float calm, out vec3 n, out float jac) {
  vec3 d = vec3(0.0);
  n = vec3(0.0, 1.0, 0.0);
  jac = 1.0;
  float dist = length(p - uCam.xz);
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 w = uWaves[i];
    float k = 6.2831853 / w.w;
    float c = sqrt(9.81 / k);
    float s = w.z * uStorm * calm * (1.0 - smoothstep(w.w * 8.0, w.w * 25.0, dist));
    float a = s / k;
    float f = k * (dot(w.xy, p) - c * uTime);
    float cf = cos(f);
    float sf = sin(f);
    d += vec3(w.x * a * cf, a * sf, w.y * a * cf);
    n -= vec3(w.x * s * cf, s * sf, w.y * s * cf);
    jac -= s * sf;
  }
  n = normalize(n);
  return d;
}
`;

const FRAGMENT_PARS = /* glsl */ `
uniform float uTime;
uniform sampler2D uHeight;
uniform vec4 uHeightRect;
uniform sampler2D uRipple;
varying vec3 vWorld;
varying float vCrest;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const COLOR_FRAGMENT = /* glsl */ `
#include <color_fragment>
float ground = texture2D(uHeight, (vWorld.xz - uHeightRect.xy) / uHeightRect.z).r;
float depth = max(vWorld.y - ground, 0.0);
vec3 shallow = vec3(0.07, 0.3, 0.27);
diffuseColor.rgb = mix(shallow, diffuseColor.rgb, smoothstep(0.5, 7.0, depth));
float grain = vnoise(vWorld.xz * 0.9 + vec2(uTime * 0.3, -uTime * 0.2)) * 0.6 + vnoise(vWorld.xz * 3.1 - uTime * 0.5) * 0.4;
float shore = 1.0 - smoothstep(0.15, 1.2 + grain * 1.2, depth);
float crest = smoothstep(0.25, 0.75, vCrest + (grain - 0.5) * 0.35);
float wFoam = clamp(max(shore * (0.55 + 0.45 * grain), crest * grain * 1.4), 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.9), wFoam);
`;

const ROUGHNESS_FRAGMENT = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.7, wFoam);
`;

const NORMAL_FRAGMENT = /* glsl */ `
#include <normal_fragment_maps>
{
  // Two layers of the ripple map drifting across each other, fading with distance.
  vec2 r1 = texture2D(uRipple, vWorld.xz / 9.0 + uTime * vec2(0.021, 0.013)).xy * 2.0 - 1.0;
  vec2 r2 = texture2D(uRipple, vWorld.xz / 3.1 + uTime * vec2(-0.034, 0.027)).xy * 2.0 - 1.0;
  float fade = (1.0 - smoothstep(20.0, 400.0, length(vViewPosition))) * (1.0 - wFoam) * 0.42;
  vec3 tilt = vec3(r1.x + r2.x * 0.6, 0.0, r1.y + r2.y * 0.6) * fade;
  normal = normalize(normal + (viewMatrix * vec4(tilt, 0.0)).xyz);
}
`;

/** A tileable normal map of small ripples: periodic value noise in four octaves, its slope
 * packed into red and green. Computed once, in code. */
function rippleMap(): THREE.DataTexture {
  const size = 256;
  const rng = createRng(7, "ripples");
  const octaves = [8, 16, 32, 64].map((cells) => {
    const table = new Float32Array(cells * cells);
    for (let i = 0; i < table.length; i++) table[i] = rng.int(65536) / 65535;
    return { cells, table };
  });
  const heightAt = (x: number, y: number): number => {
    let h = 0;
    let amp = 1;
    for (const { cells, table } of octaves) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const sx = (fx - x0) * (fx - x0) * (3 - 2 * (fx - x0));
      const sy = (fy - y0) * (fy - y0) * (3 - 2 * (fy - y0));
      const at = (i: number, j: number): number => table[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)] as number;
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      h += (a + (b - a) * sy) * amp;
      amp *= 0.55;
    }
    return h;
  };
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) heights[y * size + x] = heightAt(x, y);
  const data = new Uint8Array(size * size * 4);
  const h = (x: number, y: number): number => heights[((y + size) % size) * size + ((x + size) % size)] as number;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 6;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 6;
      const i = (y * size + x) * 4;
      data[i] = Math.round(Math.max(0, Math.min(1, 0.5 - dx * 0.5)) * 255);
      data[i + 1] = Math.round(Math.max(0, Math.min(1, 0.5 - dy * 0.5)) * 255);
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export interface Ocean {
  mesh: THREE.Mesh;
  waves: Wave[];
  uniforms: { uTime: { value: number }; uStorm: { value: number }; uCam: { value: THREE.Vector3 } };
  /** Keep the grid under the camera. */
  follow(camera: THREE.Camera): void;
}

export function createOcean(waves: Wave[], heightmap: THREE.Texture, rect: THREE.Vector4): Ocean {
  const uniforms = {
    uTime: { value: 0 },
    uStorm: { value: 1 },
    uCam: { value: new THREE.Vector3() },
    uWaves: { value: waves.map((w) => new THREE.Vector4(w.dx, w.dz, w.steep, w.length)) },
    uHeight: { value: heightmap },
    uHeightRect: { value: rect },
    uRipple: { value: rippleMap() },
  };
  const material = new THREE.MeshPhysicalMaterial({ color: 0x0a3348, roughness: 0.07, metalness: 0, ior: 1.333, envMapIntensity: 1 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_PARS}`)
      .replace(
        "#include <beginnormal_vertex>",
        `vec3 gWorld = (modelMatrix * vec4(position, 1.0)).xyz;
vec3 gNormal;
float gJac;
vec3 gMove = gerstner(gWorld.xz, calmWithDepth(gWorld.xz), gNormal, gJac);
vec3 objectNormal = gNormal;
vWorld = gWorld + gMove;
vCrest = 1.0 - gJac;`,
      )
      .replace("#include <begin_vertex>", "vec3 transformed = position + gMove;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", COLOR_FRAGMENT)
      .replace("#include <roughnessmap_fragment>", ROUGHNESS_FRAGMENT)
      .replace("#include <normal_fragment_maps>", NORMAL_FRAGMENT);
  };
  const mesh = new THREE.Mesh(polarGrid(230, 320, 0.45, 1.032), material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return {
    mesh,
    waves,
    uniforms,
    follow(camera) {
      mesh.position.set(camera.position.x, 0, camera.position.z);
      uniforms.uCam.value.copy(camera.position);
    },
  };
}
