// The boat: a 9 m sloop. The hull is lofted from sections (a real hull shape, not a box): 3 m
// beam, a fin keel to 1.7 m, a 12 m mast, a mainsail of about 26 m² and a jib of about 16 m².
// The physics is a sail-and-keel force model in the water plane:
//   - the apparent wind is the true wind minus the boat's velocity;
//   - the sail sits at the sheeted angle on the leeward side, or flaps where the wind would
//     push it further; its angle of attack gives lift (up to a stall at about 24°) and drag;
//   - the keel turns sideways force into a small leeway, and the side force heels the boat;
//   - hull resistance climbs steeply past the hull speed (about 6.5 knots);
//   - the rudder turns the boat in proportion to its speed through the water.
// Local frame: +z is the bow, +y up, starboard is -x. Heading h points the bow at (sin h, cos h).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WindNow } from "./wind.ts";

const LOA = 9;
const MASS = 3800;
const SAIL_AREA = 42;
const AIR = 1.225;
const DRAFT = 1.7;
const MAST_Z = 0.9;
const BOOM_Y = 2.05;
const MAST_TOP = 13.2;
const BOOM_LEN = 3.7;
export const KNOT = 1.943844;

/** Sail trim as a word for the HUD and the scripts. */
export type Trim = "luffing" | "good" | "over" | "stalled";

export interface BoatInput {
  /** -1 (port) .. 1 (starboard). */
  steer: number;
  /** -1 (ease out) .. 1 (sheet in). */
  sheet: number;
}

export interface Surface {
  water(x: number, z: number): number;
  ground(x: number, z: number): number;
}

// ---------------------------------------------------------------- the model

function hullHalfBeam(s: number): number {
  // s: 0 at the transom, 1 at the stem.
  if (s > 0.42) return 1.5 * Math.pow(Math.max(0, 1 - Math.pow((s - 0.42) / 0.58, 2)), 0.62);
  return 1.5 - 0.42 * Math.pow((0.42 - s) / 0.42, 1.8);
}
const sheer = (s: number): number => 1.0 + 0.14 * Math.pow(Math.abs(s - 0.4) / 0.6, 2) + (s > 0.4 ? 0.12 * Math.pow((s - 0.4) / 0.6, 2) : 0);
const bottom = (s: number): number => -0.48 * Math.sin(Math.PI * Math.min(1, s * 0.9 + 0.08)) - 0.04;

function colourFor(y: number, c: THREE.Color): THREE.Color {
  if (y < 0.06) return c.set(0x6e2620); // antifouling
  if (y < 0.16) return c.set(0xf2f0ea); // boot stripe
  if (y > 0.92) return c.set(0xf2f0ea); // sheer stripe
  return c.set(0x1c3350); // navy topsides
}

function hullGeometry(): THREE.BufferGeometry {
  const stations = 48;
  const ring = 14;
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i <= stations; i++) {
    const s = i / stations;
    const z = (s - 0.5) * LOA;
    const b = hullHalfBeam(s);
    const top = sheer(s);
    const keelY = bottom(s);
    for (let k = 0; k <= ring; k++) {
      // From the port sheer, down round the bilge to the keel line, up to the starboard sheer.
      const u = (k / ring) * 2 - 1;
      const a = Math.abs(u);
      const x = Math.sign(u) * b * Math.pow(Math.sin((a * Math.PI) / 2), 0.55);
      const y = keelY + (top - keelY) * (1 - Math.cos((a * Math.PI) / 2)) ** 0.9;
      pos.push(x, y, z);
      colourFor(y, c);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < stations; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * (ring + 1) + k;
      const b = a + ring + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // The transom: its own copy of the first ring, so its normals stay flat and its edge sharp.
  const t0 = pos.length / 3;
  for (let k = 0; k <= ring; k++) {
    pos.push(pos[k * 3] as number, pos[k * 3 + 1] as number, pos[k * 3 + 2] as number);
    colourFor(pos[k * 3 + 1] as number, c);
    col.push(c.r, c.g, c.b);
  }
  const centre = t0 + ring + 1;
  pos.push(0, sheer(0) - 0.05, -LOA / 2);
  col.push(0.95, 0.94, 0.92);
  for (let k = 0; k < ring; k++) index.push(centre, t0 + k + 1, t0 + k);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

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

function deckGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // The teak deck: a fan of strips just under the sheer.
  const pos: number[] = [];
  const n = 40;
  for (let i = 0; i < n; i++) {
    const s0 = i / n;
    const s1 = (i + 1) / n;
    const z0 = (s0 - 0.5) * LOA;
    const z1 = (s1 - 0.5) * LOA;
    const b0 = hullHalfBeam(s0) - 0.04;
    const b1 = hullHalfBeam(s1) - 0.04;
    const y0 = sheer(s0) - 0.03;
    const y1 = sheer(s1) - 0.03;
    pos.push(-b0, y0, z0, b0, y0, z0, b1, y1, z1, -b0, y0, z0, b1, y1, z1, -b1, y1, z1);
  }
  const deck = new THREE.BufferGeometry();
  deck.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  deck.computeVertexNormals();
  parts.push(paint(deck, 0xb48c5c));
  // The cabin trunk, its windows, the cockpit well and the coamings.
  parts.push(paint(new THREE.BoxGeometry(2.0, 0.55, 2.8).translate(0, 1.3, 0.15), 0xf2f0ea));
  for (const x of [-1.01, 1.01]) parts.push(paint(new THREE.BoxGeometry(0.02, 0.18, 1.6).translate(x, 1.36, 0.25), 0x1a2430));
  parts.push(paint(new THREE.BoxGeometry(1.9, 0.08, 2.3).translate(0, 0.86, -2.6), 0x8a6a48));
  for (const x of [-1.0, 1.0]) parts.push(paint(new THREE.BoxGeometry(0.08, 0.3, 2.4).translate(x, 1.12, -2.55), 0xf2f0ea));
  // The fin keel with a bulb, and the skeg.
  parts.push(paint(new THREE.BoxGeometry(0.14, 1.3, 1.25).translate(0, -1.05, 0.25), 0x2a2a2e));
  parts.push(paint(new THREE.CapsuleGeometry(0.2, 1.1, 4, 10).rotateX(Math.PI / 2).translate(0, -DRAFT + 0.12, 0.2), 0x2a2a2e));
  // The mast, the stays (as thin rods) and the pulpit.
  parts.push(paint(new THREE.CylinderGeometry(0.06, 0.09, MAST_TOP - 1.0, 10).translate(0, (MAST_TOP + 1.0) / 2, MAST_Z), 0xc8ccd0));
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry => {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, 4).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    return paint(g.translate(a.x, a.y, a.z), 0x9aa0a8);
  };
  const top = new THREE.Vector3(0, MAST_TOP - 0.2, MAST_Z);
  parts.push(rod(new THREE.Vector3(0, 1.3, LOA / 2 - 0.15), top, 0.012));
  parts.push(rod(new THREE.Vector3(0, 1.1, -LOA / 2 + 0.1), top, 0.012));
  for (const x of [-1.35, 1.35]) parts.push(rod(new THREE.Vector3(x, 1.05, MAST_Z - 0.3), new THREE.Vector3(0, MAST_TOP - 2.2, MAST_Z), 0.01));
  return mergeGeometries(parts) as THREE.BufferGeometry;
}

/** A sail as a grid between three corners, cambered sideways; `fill` sets the belly. */
class Sail {
  readonly mesh: THREE.Mesh;
  private readonly base: Float32Array;
  private readonly chord: Float32Array;
  private readonly rows: number;
  private readonly cols: number;

  constructor(tack: THREE.Vector3, head: THREE.Vector3, clew: THREE.Vector3, colour: number) {
    this.rows = 14;
    this.cols = 8;
    const pos: number[] = [];
    const chord: number[] = [];
    const index: number[] = [];
    for (let r = 0; r <= this.rows; r++) {
      const v = r / this.rows;
      const luff = tack.clone().lerp(head, v);
      const leech = clew.clone().lerp(head, v);
      for (let c = 0; c <= this.cols; c++) {
        const u = c / this.cols;
        const p = luff.clone().lerp(leech, u);
        pos.push(p.x, p.y, p.z);
        chord.push(u, v);
      }
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const a = r * (this.cols + 1) + c;
        const b = a + this.cols + 1;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    this.base = new Float32Array(pos);
    this.chord = new Float32Array(chord);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.75, side: THREE.DoubleSide }));
    this.mesh.castShadow = true;
  }

  /** Belly toward `side` (+1 is +x, port), `fill` 0..1; `flap` adds flutter. */
  shape(side: number, fill: number, flap: number, t: number): void {
    const pos = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = this.chord[i * 2] as number;
      const v = this.chord[i * 2 + 1] as number;
      const width = 1 - v;
      const belly = Math.sin(Math.PI * Math.pow(u, 0.8)) * width * (0.18 + 0.5 * fill) * 1.1;
      const flutter = flap * Math.sin(t * 19 + u * 9 + v * 5) * 0.16 * u * width;
      pos.setX(i, (this.base[i * 3] as number) + side * belly + flutter);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

// ---------------------------------------------------------------- the boat

export class Boat {
  readonly root = new THREE.Group();
  /** Heel, pitch and the swell's lift live here; root carries position and heading. */
  private readonly body = new THREE.Group();
  private readonly boomPivot = new THREE.Group();
  private readonly jibPivot = new THREE.Group();
  private readonly rudderMesh: THREE.Mesh;
  private readonly main: Sail;
  private readonly jib: Sail;

  x = 0;
  z = 0;
  heading = 0;
  /** Speed through the water along the bow, m/s. */
  u = 0;
  /** Sideways (leeway), m/s, positive to starboard. */
  v = 0;
  yawRate = 0;
  rudder = 0;
  /** How far the sheet lets the boom out, radians from the centreline. */
  sheet = 0.6;
  boom = 0.3;
  boomSide = 1;
  heel = 0;
  pitch = 0;
  roll = 0;
  lift = 0;
  /** Apparent wind angle, signed: positive from starboard. Radians. */
  awa = 0;
  aws = 0;
  aoa = 0;
  trim: Trim = "good";
  groundings = 0;
  aground = false;
  /** Seconds left of the bump after a grounding, for the camera shake and the sound. */
  bump = 0;

  constructor() {
    this.root.add(this.body);
    const hull = new THREE.Mesh(hullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 }));
    const deck = new THREE.Mesh(deckGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
    for (const m of [hull, deck]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.body.add(m);
    }
    this.rudderMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.55).translate(0, -0.55, -0.15), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5 }));
    this.rudderMesh.position.set(0, -0.1, -LOA / 2 + 0.75);
    this.body.add(this.rudderMesh);

    this.boomPivot.position.set(0, 0, MAST_Z);
    this.body.add(this.boomPivot);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, BOOM_LEN, 8).rotateX(Math.PI / 2).translate(0, BOOM_Y, -BOOM_LEN / 2), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.4, metalness: 0.6 }));
    boom.castShadow = true;
    this.boomPivot.add(boom);
    this.main = new Sail(new THREE.Vector3(0, BOOM_Y + 0.05, -0.08), new THREE.Vector3(0, MAST_TOP - 0.4, -0.08), new THREE.Vector3(0, BOOM_Y + 0.08, -BOOM_LEN + 0.1), 0xf4f1e8);
    this.boomPivot.add(this.main.mesh);

    this.jibPivot.position.set(0, 0, LOA / 2 - 0.25);
    this.body.add(this.jibPivot);
    this.jib = new Sail(new THREE.Vector3(0, 1.45, 0), new THREE.Vector3(0, MAST_TOP - 2.4, -(LOA / 2 - 0.25 - MAST_Z) * 0.86), new THREE.Vector3(0, 1.6, -3.6), 0xeeebe2);
    this.jibPivot.add(this.jib.mesh);
  }

  get forward(): [number, number] {
    return [Math.sin(this.heading), Math.cos(this.heading)];
  }

  get knots(): number {
    return this.u * KNOT;
  }

  /** Put the boat somewhere, stopped. */
  place(x: number, z: number, heading: number): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.u = 0;
    this.v = 0;
    this.yawRate = 0;
    this.aground = false;
  }

  step(dt: number, wind: WindNow, input: BoatInput, surface: Surface): void {
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // Starboard.
    const sx = -fz;
    const sz = fx;
    const vx = fx * this.u + sx * this.v;
    const vz = fz * this.u + sz * this.v;

    // The apparent wind and where it comes from.
    const ax = wind.x - vx;
    const az = wind.z - vz;
    this.aws = Math.hypot(ax, az);
    const fromF = -(ax * fx + az * fz);
    const fromS = -(ax * sx + az * sz);
    this.awa = Math.atan2(fromS, fromF);
    const off = Math.abs(this.awa);

    // The sheet, and the boom on the leeward side: it cannot go further out than the wind.
    this.sheet = Math.min(1.45, Math.max(0.06, this.sheet + input.sheet * 0.55 * dt));
    const side = this.awa >= 0 ? -1 : 1;
    if (side !== this.boomSide && off > 0.25) this.boomSide = side;
    const target = Math.min(this.sheet, off);
    this.boom += (target - this.boom) * Math.min(1, dt * 3);
    this.aoa = off - this.boom;

    // Lift peaks at about 24° and stalls past it; drag grows to a flat plate's at 90°.
    const a = this.aoa;
    const lift = a < 0.06 ? 0 : a < 0.42 ? 1.45 * Math.sin(((a - 0.06) / 0.36) * (Math.PI / 2)) : Math.max(0.25, 1.45 - (a - 0.42) * 1.1);
    const drag = 0.07 + 1.2 * Math.sin(Math.min(a, Math.PI / 2)) ** 2;
    // Running before the wind the sail works by drag: eased right out is the best there is.
    const running = off > 1.95 && this.sheet > 1.35;
    this.trim = a < 0.07 ? "luffing" : a < 0.5 || running ? "good" : a < 0.8 ? "over" : "stalled";
    const q = 0.5 * AIR * SAIL_AREA * this.aws * this.aws * Math.cos(this.heel);
    const flowX = this.aws > 1e-6 ? ax / this.aws : 0;
    const flowZ = this.aws > 1e-6 ? az / this.aws : 0;
    // Lift is across the flow, on the side that drives the boat forward.
    let lx = -flowZ;
    let lz = flowX;
    if (lx * fx + lz * fz < 0) {
      lx = -lx;
      lz = -lz;
    }
    const Fx = q * (lift * lx + drag * flowX);
    const Fz = q * (lift * lz + drag * flowZ);
    const drive = Fx * fx + Fz * fz;
    const sideForce = Fx * sx + Fz * sz;

    // The hull: resistance that climbs past the hull speed, the keel against leeway, the
    // rudder. Turning costs speed.
    const au = Math.abs(this.u);
    const resist = Math.sign(this.u) * (40 * au + 95 * au * au + 2600 * Math.max(0, au - 3.25) ** 2) + 700 * Math.abs(this.yawRate) * this.u;
    this.u += ((drive - resist) / MASS) * dt;
    const keel = 6500 * (au + 0.5);
    this.v += ((sideForce - keel * this.v) / (MASS * 1.6)) * dt;

    this.rudder += (input.steer - this.rudder) * Math.min(1, dt * 2.5);
    // Slow and head to wind (in irons) the wind on the bow helps it fall off, so a stalled tack
    // recovers in seconds instead of drifting.
    const irons = Math.abs(this.awa) < 0.75 && au < 1.5 ? 0.07 : 0;
    const turn = -this.rudder * (0.075 * this.u + 0.03 + irons) + (this.aground ? -this.rudder * 0.05 : 0);
    this.yawRate += (turn - this.yawRate) * Math.min(1, dt * 1.4);
    this.heading += this.yawRate * dt;

    // Heel to leeward with the side force, pitch and roll with the swell under the hull.
    const heelTarget = Math.max(-0.52, Math.min(0.52, sideForce / 5600));
    this.heel += (heelTarget - this.heel) * Math.min(1, dt * 1.2);

    const nx = this.x + (fx * this.u + sx * this.v) * dt;
    const nz = this.z + (fz * this.u + sz * this.v) * dt;

    // The keel touches the bottom: stop, bounce back a little, count it.
    const touching = [3.4, 0, -3.4].some((d) => surface.ground(nx + fx * d, nz + fz * d) > -DRAFT);
    if (touching) {
      if (!this.aground && au > 0.5) {
        this.groundings++;
        this.bump = 0.6;
      }
      this.aground = true;
      this.u = -Math.sign(this.u || 1) * Math.min(0.4, au * 0.2);
      this.v = 0;
    } else {
      this.aground = false;
      this.x = nx;
      this.z = nz;
    }
    this.bump = Math.max(0, this.bump - dt);

    // Float on the water: lift, pitch and roll from four points, smoothed by the boat's mass.
    const bow = surface.water(this.x + fx * 3.6, this.z + fz * 3.6);
    const stern = surface.water(this.x - fx * 3.6, this.z - fz * 3.6);
    const port = surface.water(this.x - sx * 1.4, this.z - sz * 1.4);
    const stbd = surface.water(this.x + sx * 1.4, this.z + sz * 1.4);
    const k = Math.min(1, dt * 3);
    this.lift += ((bow + stern + port + stbd) / 4 - this.lift) * k;
    this.pitch += (Math.atan2(bow - stern, 7.2) - this.pitch) * k;
    this.roll += (Math.atan2(port - stbd, 2.8) - this.roll) * k;
  }

  /** Move the meshes to the state; `t` drives the flutter. */
  pose(t: number): void {
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
    this.body.position.y = this.lift - 0.05 + (this.bump > 0 ? Math.sin(this.bump * 40) * 0.06 : 0);
    // Roll about the bow axis: negative is the mast toward port (+x), where a wind from starboard
    // heels it.
    this.body.rotation.set(-this.pitch, 0, this.heel + this.roll, "YXZ");
    this.boomPivot.rotation.y = this.boomSide * this.boom;
    this.jibPivot.rotation.y = this.boomSide * this.boom * 0.85;
    this.rudderMesh.rotation.y = this.rudder * 0.5;
    const flap = this.trim === "luffing" ? 1 : 0;
    const fill = Math.min(1, this.aws / 8) * (flap ? 0.1 : 1);
    this.main.shape(-this.boomSide, fill, flap, t);
    this.jib.shape(-this.boomSide, fill, flap, t + 0.7);
  }
}
