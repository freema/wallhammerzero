// The radar in the corner: the district's outline, the job target, cars, Union units. It turns
// with the camera, so up on the radar is where the camera looks.

import type * as THREE from "three";
import type { World } from "./world.ts";
import { TILE } from "./world.ts";

const SIZE = 180;
const RANGE = 160; // metres from the centre to the rim

export interface RadarBlips {
  target: THREE.Vector3;
  cars: THREE.Vector3[];
  police: THREE.Vector3[];
  crowd?: THREE.Vector3[];
}

export class Radar {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly world: World;
  private time = 0;

  constructor(world: World, parent: HTMLElement) {
    this.world = world;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = SIZE * 2;
    this.canvas.className = "radar";
    parent.appendChild(this.canvas);
    this.g = this.canvas.getContext("2d") as CanvasRenderingContext2D;
  }

  draw(dt: number, at: THREE.Vector3, camYaw: number, blips: RadarBlips): void {
    this.time += dt;
    const g = this.g;
    const r = SIZE;
    const scale = r / RANGE;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    // World (x, z) relative to `at` → radar pixels: the camera's forward is up, its right is right.
    const map = (x: number, z: number): [number, number] => {
      const dx = x - at.x, dz = z - at.z;
      return [r + (-dx * fz + dz * fx) * scale, r - (dx * fx + dz * fz) * scale];
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, r * 2, r * 2);
    g.save();
    g.beginPath();
    g.arc(r, r, r - 2, 0, Math.PI * 2);
    g.fillStyle = "rgba(10,6,24,0.72)";
    g.fill();
    g.clip();

    // Range rings and the district's outline.
    g.strokeStyle = "rgba(58,238,255,0.18)";
    g.lineWidth = 2;
    for (const k of [0.33, 0.66]) {
      g.beginPath();
      g.arc(r, r, r * k, 0, Math.PI * 2);
      g.stroke();
    }
    const W = this.world.w * TILE, D = this.world.d * TILE;
    g.strokeStyle = "rgba(255,58,168,0.55)";
    g.lineWidth = 3;
    g.beginPath();
    for (const [i, [x, z]] of ([[0, 0], [W, 0], [W, D], [0, D], [0, 0]] as const).entries()) {
      const [sx, sy] = map(x, z);
      if (i === 0) g.moveTo(sx, sy);
      else g.lineTo(sx, sy);
    }
    g.stroke();

    const dot = (p: THREE.Vector3, color: string, size: number, clamp: boolean): void => {
      let [sx, sy] = map(p.x, p.z);
      const dx = sx - r, dy = sy - r;
      const d = Math.hypot(dx, dy);
      if (d > r - 10) {
        if (!clamp) return;
        sx = r + (dx / d) * (r - 10);
        sy = r + (dy / d) * (r - 10);
      }
      g.fillStyle = color;
      g.beginPath();
      g.arc(sx, sy, size, 0, Math.PI * 2);
      g.fill();
    };
    for (const p of blips.crowd ?? []) dot(p, "rgba(200,220,255,0.35)", 2.5, false);
    for (const p of blips.cars) dot(p, "rgba(232,246,255,0.8)", 4, false);
    const blink = Math.sin(this.time * 12) > 0;
    for (const p of blips.police) dot(p, blink ? "#ff2a4a" : "#3a7aff", 7, true);
    // The target pulses; above or below is a triangle.
    const t = blips.target;
    const pulse = 8 + Math.sin(this.time * 5) * 2;
    dot(t, "#ffe23a", pulse, true);
    if (Math.abs(t.y - at.y) > 3) {
      const [sx, sy] = map(t.x, t.z);
      const d = Math.hypot(sx - r, sy - r);
      const k = d > r - 10 ? (r - 10) / d : 1;
      const cx = r + (sx - r) * k, cy = r + (sy - r) * k;
      const up = t.y > at.y ? -1 : 1;
      g.fillStyle = "#07040f";
      g.beginPath();
      g.moveTo(cx - 5, cy - up * 3);
      g.lineTo(cx + 5, cy - up * 3);
      g.lineTo(cx, cy + up * 5);
      g.fill();
    }
    g.restore();

    // Kylo: an arrow in the centre, pointing up (the camera's forward).
    g.fillStyle = "#ff3aa8";
    g.beginPath();
    g.moveTo(r, r - 11);
    g.lineTo(r + 8, r + 8);
    g.lineTo(r, r + 3);
    g.lineTo(r - 8, r + 8);
    g.fill();
    g.strokeStyle = "rgba(58,238,255,0.6)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(r, r, r - 2, 0, Math.PI * 2);
    g.stroke();
  }
}
