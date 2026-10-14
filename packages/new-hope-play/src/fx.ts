// Effects: rain that falls around the camera, the weather cycle, and the violet beam of
// body-passing.

import * as THREE from "three";

const DROPS = 4000;
const BOX = 70;

export class Rain {
  readonly lines: THREE.LineSegments;
  /** 0..1, how hard it rains now. */
  amount = 0;
  private readonly pos: Float32Array;
  private readonly speed: Float32Array;
  private readonly material: THREE.LineBasicMaterial;
  private clock = 0;
  /** Forced on or off from the console; null follows the cycle. */
  force: boolean | null = null;

  constructor() {
    this.pos = new Float32Array(DROPS * 6);
    this.speed = new Float32Array(DROPS);
    for (let i = 0; i < DROPS; i++) {
      const x = (Math.random() - 0.5) * BOX, y = Math.random() * BOX, z = (Math.random() - 0.5) * BOX;
      this.pos.set([x, y, z, x, y - 0.9, z], i * 6);
      this.speed[i] = 38 + Math.random() * 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.material = new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
  }

  raining(): boolean {
    return this.amount > 0.3;
  }

  update(dt: number, camera: THREE.Vector3): void {
    this.clock += dt;
    // A storm every three minutes or so, a minute long.
    const cycle = this.clock % 190;
    const on = this.force ?? (cycle > 120 && cycle < 180);
    this.amount += ((on ? 1 : 0) - this.amount) * Math.min(1, dt * 0.4);
    this.material.opacity = this.amount * 0.5;
    this.lines.visible = this.amount > 0.02;
    if (!this.lines.visible) return;
    const p = this.pos;
    const half = BOX / 2;
    for (let i = 0; i < DROPS; i++) {
      const o = i * 6;
      let x = p[o] as number, y = p[o + 1] as number, z = p[o + 2] as number;
      y -= (this.speed[i] as number) * dt;
      // Wrap the drops around the camera so the rain is always where we look.
      if (y < camera.y - half) y += BOX;
      if (y > camera.y + half) y -= BOX;
      if (x < camera.x - half) x += BOX;
      if (x > camera.x + half) x -= BOX;
      if (z < camera.z - half) z += BOX;
      if (z > camera.z + half) z -= BOX;
      p[o] = x + dt * 3;
      p[o + 1] = y;
      p[o + 2] = z;
      p[o + 3] = x + dt * 3 - 0.08;
      p[o + 4] = y - 0.9;
      p[o + 5] = z;
    }
    (this.lines.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** The violet beam between Kylo's old body and the new one, and a flash of light. */
export class PsiBeam {
  readonly group = new THREE.Group();
  private readonly beam: THREE.Mesh;
  private readonly light: THREE.PointLight;
  private life = 0;

  constructor() {
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb05aff).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.light = new THREE.PointLight(0xb05aff, 0, 30, 1.5);
    this.group.add(this.beam, this.light);
    this.group.visible = false;
  }

  fire(from: THREE.Vector3, to: THREE.Vector3): void {
    const a = from.clone().add(new THREE.Vector3(0, 1.4, 0));
    const b = to.clone().add(new THREE.Vector3(0, 1.4, 0));
    this.beam.position.copy(a);
    this.beam.lookAt(b);
    this.beam.scale.set(1, 1, Math.max(0.1, a.distanceTo(b)));
    this.light.position.copy(b);
    this.life = 0.8;
    this.group.visible = true;
  }

  update(dt: number): void {
    if (this.life <= 0) return;
    this.life -= dt;
    const k = Math.max(0, this.life / 0.8);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = k;
    this.beam.scale.x = this.beam.scale.y = 0.5 + k * 1.5;
    this.light.intensity = k * 80;
    if (this.life <= 0) this.group.visible = false;
  }
}
