// The wake: patches of foam dropped behind the stern that spread and fade, riding the waves.
// One instanced mesh; the foam texture is drawn in code.

import * as THREE from "three";

const COUNT = 140;
const LIFE = 10;

function foamTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - size / 2) / (size / 2);
      const dy = (y - size / 2) / (size / 2);
      const r = Math.hypot(dx, dy);
      // A ring of foam with holes in it: brightest just inside the edge.
      const ring = Math.max(0, 1 - Math.abs(r - 0.62) / 0.38);
      const holes = 0.5 + 0.5 * Math.sin(x * 0.61 + Math.sin(y * 0.33) * 3) * Math.sin(y * 0.47 + Math.cos(x * 0.29) * 2);
      const a = Math.max(0, Math.min(1, ring * (0.45 + 0.75 * holes))) * (r < 1 ? 1 : 0);
      const i = (y * size + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Patch {
  x: number;
  z: number;
  age: number;
  size: number;
  spin: number;
}

export class Wake {
  readonly mesh: THREE.InstancedMesh;
  private readonly patches: Patch[] = [];
  private next = 0;
  private timer = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly spin = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 0, 1);
  private readonly fade = new THREE.Color();

  constructor() {
    // Additive, so a patch fading to black fades out.
    const material = new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, depthWrite: false, opacity: 0.16, color: 0xe8f0f0, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
  }

  /** Simulation step: drop patches behind the stern in proportion to speed. */
  update(dt: number, x: number, z: number, heading: number, speed: number): void {
    for (const p of this.patches) p.age += dt;
    this.timer += dt * Math.max(0, speed - 0.3);
    while (this.timer > 0.55) {
      this.timer -= 0.55;
      const p: Patch = { x: x - Math.sin(heading) * 4.4, z: z - Math.cos(heading) * 4.4, age: 0, size: 1.2 + speed * 0.35, spin: this.next * 2.39 };
      this.patches[this.next] = p;
      this.next = (this.next + 1) % COUNT;
    }
  }

  /** Draw: each patch on the water, grown and faded with its age. */
  draw(water: (x: number, z: number) => number): void {
    let n = 0;
    for (const p of this.patches) {
      if (p.age > LIFE) continue;
      const k = p.age / LIFE;
      const size = p.size * (1 + k * 3.2);
      this.p.set(p.x, water(p.x, p.z) + 0.06, p.z);
      this.spin.setFromAxisAngle(this.up, p.spin + k);
      this.q.copy(this.flat).multiply(this.spin);
      this.s.set(size, size, 1);
      this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
      this.mesh.setColorAt(n, this.fade.setScalar(1 - k));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
