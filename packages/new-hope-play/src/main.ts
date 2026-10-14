// New Hope (D30): the playable 3D game. A district of the city-planet from a seed, Kylo on foot
// and in hover cars, jobs that send him across the sky lanes and down into the undercity.
//
// The loop: `step` is the simulation at a fixed 120 Hz (input, physics, rules), `present` draws
// (camera, HUD, sound, the render) once per browser frame. Same seed + same inputs per step =
// the same run, which is what scripted checks (debug.ts) rely on.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { createRng } from "@whz/det";
import { K } from "@whz/citygen";
import { fixedLoop } from "@whz/play-kit";
import { Hovercar, Walker } from "./actors.ts";
import { Sound } from "./audio.ts";
import { buildCity } from "./city.ts";
import { captureErrors, installDebug } from "./debug.ts";
import { PsiBeam, Rain } from "./fx.ts";
import { Input } from "./input.ts";
import { Jobs } from "./jobs.ts";
import { Police } from "./police.ts";
import { Radar } from "./radar.ts";
import { addLights, createSky, createSkyline } from "./sky.ts";
import { createAtlas } from "./textures.ts";
import { Crowd, Traffic } from "./traffic.ts";
import { blocksPoint, cellCentre, cellsOf, createWorld, hash3, STOREY } from "./world.ts";

captureErrors();

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 2) >>> 0;
/** The simulation step: 120 Hz runs once per frame on 120 Hz screens and twice on 60 Hz ones. */
const STEP = 1 / 120;

// Antialiasing happens in the composer's multisampled target: the default framebuffer only ever
// receives the final full-screen pass, so MSAA there would cost memory and do nothing.
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
const pixelRatio = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Count a whole frame (shadow, scene and post passes), not just the last render call.
renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);

const world = createWorld(seed);
const atlas = createAtlas(seed);
atlas.map.anisotropy = atlas.emissive.anisotropy = renderer.capabilities.getMaxAnisotropy();
const sky = createSky();
scene.add(sky);
const keyLight = addLights(scene);
scene.add(createSkyline(world));
const city = buildCity(world, atlas);
scene.add(city.group);
const traffic = new Traffic(world);
scene.add(traffic.group);
const crowd = new Crowd(world);
scene.add(crowd.group);
const police = new Police(world, createRng(seed, "police"));
scene.add(police.group);
const rain = new Rain();
scene.add(rain.lines);
const beam = new PsiBeam();
scene.add(beam.group);
const sound = new Sound();

// Start: Kylo on the highest roof that has a pad, a taxi waiting on the pad.
const pads = cellsOf(world, K.pad).sort((a, b) => b[2] - a[2] || Math.abs(a[0] - world.w / 2) - Math.abs(b[0] - world.w / 2));
const startPad = pads[0] ?? [world.w >> 1, world.d >> 1, world.streetLevel];
const kylo = new Walker(world);
scene.add(kylo.root);
const home = new THREE.Vector3();
{
  const [px, py, pz] = startPad;
  let spawn = cellCentre(px, py, pz);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const k = world.kind(px + dx, py + dy, pz);
    if (k === K.deck || k === K.pad) {
      spawn = cellCentre(px + dx, py + dy, pz);
      break;
    }
  }
  home.set(spawn.x, spawn.y + 0.5, spawn.z);
  kylo.respawnAt(home);
  kylo.lastSafe.copy(kylo.pos);
}
const cars: Hovercar[] = [];
const parkCar = (cell: [number, number, number], kind: "taxi" | "cruiser" | "civilian", yaw = 0): Hovercar => {
  const car = new Hovercar(world, kind);
  const c = cellCentre(...cell);
  car.pos.set(c.x, c.y + 0.35, c.z);
  car.yaw = yaw;
  scene.add(car.root);
  cars.push(car);
  return car;
};
const taxi = parkCar(startPad, "taxi", Math.PI / 4);
pads.slice(1).forEach((p, i) => {
  if (i % 3 === 0) parkCar(p, i % 2 ? "cruiser" : "civilian", i);
});

const jobs = new Jobs(world, scene, taxi);

// Post-processing: the neon blooms. The scene pass renders into a 4x multisampled half-float
// target (an explicit target gets pixel ratio 1, so the ratio is set again).
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(innerWidth * pixelRatio, innerHeight * pixelRatio, { type: THREE.HalfFloatType, samples: 4 }),
);
composer.setPixelRatio(pixelRatio);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const input = new Input(renderer.domElement);
const start = document.getElementById("start") as HTMLElement;
start.addEventListener("click", () => {
  start.style.display = "none";
  sound.start();
  void renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener("click", () => void renderer.domElement.requestPointerLock());
document.addEventListener("visibilitychange", () => sound.setHidden(document.hidden));

/** HUD text, written to the DOM only when it changes. */
class Line {
  private last = "";
  private readonly el: HTMLElement;

  constructor(selector: string) {
    this.el = document.querySelector(selector) as HTMLElement;
  }

  set(html: string): void {
    if (html === this.last) return;
    this.last = html;
    this.el.innerHTML = html;
  }

  opacity(value: string): void {
    if (this.el.style.opacity !== value) this.el.style.opacity = value;
  }
}
const hud = { tl: new Line("#hud .tl"), tr: new Line("#hud .tr"), bl: new Line("#hud .bl"), c: new Line("#hud .c"), prompt: new Line("#hud .prompt") };
const radar = new Radar(world, document.getElementById("hud") as HTMLElement);

let camYaw = Math.PI * 0.75;
let camPitch = 0.32;
let camDist = 6;
let driving: Hovercar | null = null;
/** Simulation steps since the start. */
let tick = 0;
let time = 0;
let flash = 0;
/** Psionic energy for body-passing, 0..100. */
let psi = 100;
let passes = 0;
const PASS_COST = 60;
const target = new THREE.Vector3();
const desired = new THREE.Vector3();
const KEY_OFFSET = new THREE.Vector3(60, 140, 40);
const LIFT = new THREE.Vector3(0, 0.3, 0);

function bandName(level: number): string {
  const b = world.district.params.bands;
  for (const [name, range] of Object.entries(b)) if (level >= range[0] && level <= range[1]) return name;
  return "sky";
}

function placeCamera(): void {
  const focus = driving ? driving.pos : kylo.pos;
  target.set(focus.x, focus.y + (driving ? 1.6 : 1.55), focus.z);
  const dist = driving ? camDist * 1.9 : camDist;
  const cp = Math.cos(camPitch);
  desired.set(target.x - Math.sin(camYaw) * cp * dist, target.y + Math.sin(camPitch) * dist, target.z - Math.cos(camYaw) * cp * dist);
  // Pull the camera in front of walls between it and the target.
  const steps = Math.ceil(dist / 0.25);
  let free = 1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocksPoint(world, target.x + (desired.x - target.x) * t, target.y + (desired.y - target.y) * t, target.z + (desired.z - target.z) * t)) {
      free = Math.max(0.05, (i - 2) / steps);
      break;
    }
  }
  camera.position.set(target.x + (desired.x - target.x) * free, target.y + (desired.y - target.y) * free, target.z + (desired.z - target.z) * free);
  camera.lookAt(target);
  // Keep the shadow box on the action.
  keyLight.target.position.copy(target);
  keyLight.position.copy(target).add(KEY_OFFSET);
  sky.position.copy(camera.position);
}

function nearestCar(): Hovercar | null {
  let best: Hovercar | null = null;
  let bestD = 4.2;
  for (const car of cars) {
    const d = car.pos.distanceTo(kylo.pos);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

function message(text: string): void {
  hud.c.set(text);
  flash = 3.2;
}

function leaveCar(): void {
  if (!driving) return;
  const car = driving;
  car.occupied = false;
  driving = null;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  kylo.respawnAt(new THREE.Vector3(car.pos.x + fz * 2.2, car.pos.y + 0.2, car.pos.z - fx * 2.2));
  kylo.root.visible = true;
}

function enterCar(car: Hovercar): void {
  driving = car;
  car.occupied = true;
  kylo.root.visible = false;
  camYaw = car.yaw;
  jobs.enteredCar(car);
  if (car.kind === "cruiser") police.report(2, "stolen Union cruiser", message);
}

/** Kylo passes into the nearest body: he takes its place and look, it wakes in his. */
function passBody(): boolean {
  const i = crowd.nearest(kylo.pos, 10);
  if (i < 0 || psi < PASS_COST) return false;
  psi -= PASS_COST;
  passes++;
  const from = kylo.pos.clone();
  const to = crowd.position(i).clone();
  const seen = crowd.guardsNear(from, 18) + crowd.guardsNear(to, 18) > 0;
  const theirs = crowd.lookOf(i);
  crowd.swap(i, kylo.look, from);
  kylo.setLook(theirs);
  kylo.respawnAt(to.add(LIFT));
  beam.fire(from, kylo.pos);
  sound.whoosh();
  if (seen) police.report(1, "a guard saw the passing", message);
  else if (police.stars > 0) {
    police.shake(2);
    message(`ANOTHER BODY<br><small>Union security loses the trail${police.stars ? ` · ${"★".repeat(police.stars)}` : ""}</small>`);
  } else if (passes === 1) message("ANOTHER BODY<br><small>you were someone else a moment ago · the Ancestors did this</small>");
  return true;
}

function busted(): void {
  leaveCar();
  const lost = jobs.fine(0.3);
  kylo.respawnAt(home);
  sound.fail();
  message(`BUSTED<br><small>the Union takes ${lost} ¤ and drops you on the roof</small>`);
}

/** One simulation step: input, actors, rules. Draws nothing. */
function step(dt: number): void {
  tick++;
  time += dt;
  psi = Math.min(100, psi + dt * 6);
  if (driving) {
    // The camera swings behind a car that flies straight while the mouse rests.
    if (input.idle > 1.2 && driving.speed() > 4) {
      let d = driving.yaw - camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      camYaw += d * Math.min(1, dt * 2.5);
    }
    driving.update(dt, input);
    kylo.pos.copy(driving.pos);
    if (driving.impact > 0) {
      sound.crash(driving.impact);
      police.crash(driving.impact, message);
    }
    if (input.hit("KeyF")) leaveCar();
  } else {
    kylo.update(dt, input, camYaw);
    const car = nearestCar();
    if (car && input.hit("KeyF")) enterCar(car);
    if (input.hit("KeyT") && !passBody() && psi < PASS_COST) message("<small>not enough psi</small>");
  }
  if (input.hit("KeyM")) sound.toggleMute();
  for (const car of cars) if (car !== driving) car.update(dt, null);
  crowd.update(dt);
  const doneBefore = jobs.state().done;
  jobs.update(dt, kylo.pos, driving, camYaw, message);
  if (jobs.state().done > doneBefore && doneBefore > 1) sound.chime();
  police.update(dt, kylo.pos, driving ? driving.speed() : 0, { say: message, busted });
  if (input.hit("KeyN")) location.search = `?seed=${(hash3(seed, tick, 77) * 1e9) >>> 0}`;
  input.endStep(dt);
}

/** CPU time of recent render calls in ms, for `perf()`. */
const renderMs: number[] = [];

/** Draw the current state: camera, effects, sound, HUD, radar and the frame. */
function present(dt: number): void {
  camYaw -= input.mouseX * 0.0024;
  camPitch = Math.min(1.25, Math.max(-0.35, camPitch + input.mouseY * 0.0022));
  camDist = Math.min(16, Math.max(2.5, camDist + input.wheel * 0.6));
  input.endFrame();

  traffic.update(dt);
  crowd.draw();
  beam.update(dt);
  (sky.material as THREE.ShaderMaterial).uniforms.time!.value = time;
  city.beacons.visible = Math.sin(time * 3) > 0.2;
  placeCamera();
  rain.update(dt, camera.position);
  const speed = driving ? driving.speed() : 0;
  sound.update(dt, {
    driving: driving !== null,
    speed,
    throttle: driving && (input.down("KeyW") || input.down("KeyR")) ? 1 : 0,
    altitude: kylo.pos.y,
    wanted: police.stars,
    rain: rain.raining(),
  });

  let prompt = "";
  if (!driving) {
    const car = nearestCar();
    if (car) prompt = `<b>F</b> ${car.kind === "cruiser" ? "steal the Union cruiser" : `fly the ${car.kind}`}`;
    else if (kylo.inLift()) prompt = "<b>E</b> up · <b>Q</b> down";
    else if (psi >= PASS_COST && crowd.nearest(kylo.pos, 10) >= 0) prompt = "<b>T</b> pass into their body";
  }
  const level = Math.floor((driving ? driving.pos.y : kylo.pos.y) / STOREY + 0.05);
  const stars = police.stars ? `<br><span class="stars">${"★".repeat(police.stars)}${"☆".repeat(5 - police.stars)}</span>` : "";
  const psiBar = `<br>psi <span class="bar"><i style="width:${psi.toFixed(0)}%;background:${psi >= PASS_COST ? "#b05aff" : "#553a77"}"></i></span>`;
  hud.tl.set(`NEW HOPE · district ${seed}<br>level ${level} · ${bandName(level)}${driving ? ` · ${Math.round(speed * 3.6)} km/h` : ""}${psiBar}${stars}`);
  if (police.arrest() > 0.05) prompt = `UNION SECURITY · STOP · ${"▮".repeat(Math.ceil(police.arrest() * 6))}`;
  hud.tr.set(jobs.hud(kylo.pos, camYaw));
  hud.bl.set(
    driving
      ? "<b>W/S</b> thrust · <b>A/D</b> turn · <b>Space</b> up · <b>Shift</b> down · <b>R</b> boost · <b>F</b> get out"
      : "<b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>T</b> pass into a body · <b>mouse</b> look · <b>wheel</b> zoom · <b>M</b> mute · <b>N</b> new district",
  );
  hud.prompt.set(prompt);
  hud.prompt.opacity(prompt ? "1" : "0");
  flash = Math.max(0, flash - dt);
  hud.c.opacity(flash > 0 ? String(Math.min(1, Math.round(flash * 20) / 20)) : "0");

  radar.draw(dt, kylo.pos, camYaw, {
    target: jobs.target(),
    cars: cars.filter((c) => c !== driving).map((c) => c.pos),
    police: police.positions(),
    crowd: crowd.positions(),
  });
  renderer.info.reset();
  const t0 = performance.now();
  composer.render(dt);
  renderMs.push(performance.now() - t0);
  if (renderMs.length > 240) renderMs.shift();
}

// The simulation at a fixed step, the picture once per frame; `advance` runs the same steps
// without the browser clock (the test hook).
const loop = fixedLoop({ step: STEP, update: step, present });
const advance = loop.advance;
loop.start();

installDebug({
  seed,
  step: STEP,
  renderer,
  composer,
  scene,
  camera,
  renderMs,
  advance,
  render: () => present(0),
  state: () => ({
    tick,
    kylo: { pos: kylo.pos.toArray(), yaw: kylo.yaw, onGround: kylo.onGround, kylosBody: kylo.look.long === true },
    driving: driving ? { kind: driving.kind, pos: driving.pos.toArray(), vel: driving.vel.toArray(), speed: driving.speed() } : null,
    psi,
    passes,
    level: Math.floor((driving ? driving.pos.y : kylo.pos.y) / STOREY + 0.05),
    jobs: jobs.state(),
    police: { stars: police.stars, heat: police.heatLevel, units: police.positions().map((p) => p.toArray()), arrest: police.arrest() },
    crowd: crowd.positions().map((p) => p.toArray()),
  }),
  band: bandName,
  nearestCar: () => nearestCar()?.kind ?? null,
  key: (code, down) => dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code })),
  pointer: (dx, dy) => {
    camYaw -= dx * 0.0024;
    camPitch = Math.min(1.25, Math.max(-0.35, camPitch + dy * 0.0022));
  },
  look: (yaw, pitch, dist) => {
    camYaw = yaw;
    camPitch = pitch;
    camDist = dist;
  },
  place: (x, y, z) => {
    if (driving) {
      driving.pos.set(x, y, z);
      driving.vel.set(0, 0, 0);
    } else kylo.respawnAt(new THREE.Vector3(x, y, z));
  },
  enterNearestCar: () => {
    const car = nearestCar();
    if (!driving && car) enterCar(car);
    return driving !== null;
  },
  leaveCar,
  wanted: (stars) => police.report(stars, "console", message),
  pass: () => passBody(),
  rain: (on) => {
    rain.force = on;
  },
  world,
});
message("KYLO<br><small>no memory · a Union capsule · New Hope</small>");
