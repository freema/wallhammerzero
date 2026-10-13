// New Hope (D30): the playable 3D game. A district of the city-planet from a seed, Kylo on foot
// and in hover cars, jobs that send him across the sky lanes and down into the undercity.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { K } from "@whz/citygen";
import { Hovercar, Walker } from "./actors.ts";
import { buildCity } from "./city.ts";
import { Input } from "./input.ts";
import { Jobs } from "./jobs.ts";
import { addLights, createSky, createSkyline } from "./sky.ts";
import { createAtlas } from "./textures.ts";
import { Crowd, Traffic } from "./traffic.ts";
import { blocksPoint, cellCentre, cellsOf, createWorld, STOREY, TILE } from "./world.ts";

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 2) >>> 0;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

// Start: Kylo on the highest roof that has a pad, a taxi waiting on the pad.
const pads = cellsOf(world, K.pad).sort((a, b) => b[2] - a[2] || Math.abs(a[0] - world.w / 2) - Math.abs(b[0] - world.w / 2));
const startPad = pads[0] ?? [world.w >> 1, world.d >> 1, world.streetLevel];
const kylo = new Walker(world);
scene.add(kylo.root);
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
  kylo.respawnAt(new THREE.Vector3(spawn.x, spawn.y + 0.5, spawn.z));
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

// Post-processing: the neon blooms.
const composer = new EffectComposer(renderer);
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
  void renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener("click", () => void renderer.domElement.requestPointerLock());

const hud = {
  tl: document.querySelector("#hud .tl") as HTMLElement,
  tr: document.querySelector("#hud .tr") as HTMLElement,
  bl: document.querySelector("#hud .bl") as HTMLElement,
  c: document.querySelector("#hud .c") as HTMLElement,
  prompt: document.querySelector("#hud .prompt") as HTMLElement,
};

let camYaw = Math.PI * 0.75;
let camPitch = 0.32;
let camDist = 6;
let driving: Hovercar | null = null;
let time = 0;
let flash = 0;
const target = new THREE.Vector3();
const desired = new THREE.Vector3();

function bandName(level: number): string {
  const b = world.district.params.bands;
  for (const [name, range] of Object.entries(b)) if (level >= range[0] && level <= range[1]) return name;
  return "sky";
}

function placeCamera(dt: number): void {
  const focus = driving ? driving.pos : kylo.pos;
  target.set(focus.x, focus.y + (driving ? 1.6 : 1.55), focus.z);
  if (driving && input.idle > 1.2 && driving.speed() > 4) {
    let d = driving.yaw - camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    camYaw += d * Math.min(1, dt * 2.5);
  }
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
  keyLight.position.copy(target).add(new THREE.Vector3(60, 140, 40));
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

export function message(text: string): void {
  hud.c.innerHTML = text;
  flash = 3.2;
}

function frame(dt: number, render = true): void {
  time += dt;
  camYaw -= input.mouseX * 0.0024;
  camPitch = Math.min(1.25, Math.max(-0.35, camPitch + input.mouseY * 0.0022));
  camDist = Math.min(16, Math.max(2.5, camDist + input.wheel * 0.6));

  let prompt = "";
  if (driving) {
    driving.update(dt, input);
    kylo.pos.copy(driving.pos);
    if (input.hit("KeyF")) {
      const car = driving;
      car.occupied = false;
      driving = null;
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      kylo.respawnAt(new THREE.Vector3(car.pos.x + fz * 2.2, car.pos.y + 0.2, car.pos.z - fx * 2.2));
      kylo.root.visible = true;
    }
  } else {
    kylo.update(dt, input, camYaw);
    const car = nearestCar();
    if (car) {
      prompt = `<b>F</b> fly the ${car.kind}`;
      if (input.hit("KeyF")) {
        driving = car;
        car.occupied = true;
        kylo.root.visible = false;
        camYaw = car.yaw;
        jobs.enteredCar(car);
      }
    } else if (kylo.inLift()) {
      prompt = "<b>E</b> up · <b>Q</b> down";
    }
  }
  for (const car of cars) if (car !== driving) car.update(dt, null);
  traffic.update(dt);
  crowd.update(dt);
  jobs.update(dt, kylo.pos, driving, camYaw, message);
  if (input.hit("KeyN")) location.search = `?seed=${(Math.random() * 1e9) >>> 0}`;

  (sky.material as THREE.ShaderMaterial).uniforms.time!.value = time;
  const blink = Math.sin(time * 3) > 0.2;
  city.beacons.visible = blink;

  placeCamera(dt);

  const level = Math.floor((driving ? driving.pos.y : kylo.pos.y) / STOREY + 0.05);
  hud.tl.innerHTML = `NEW HOPE · district ${seed}<br>level ${level} · ${bandName(level)}${driving ? ` · ${Math.round(driving.speed() * 3.6)} km/h` : ""}`;
  hud.tr.innerHTML = jobs.hud(kylo.pos, camYaw);
  hud.bl.innerHTML = driving
    ? "<b>W/S</b> thrust · <b>A/D</b> turn · <b>Space</b> up · <b>Shift</b> down · <b>R</b> boost · <b>F</b> get out"
    : "<b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>mouse</b> look · <b>wheel</b> zoom · <b>N</b> new district";
  hud.prompt.innerHTML = prompt;
  hud.prompt.style.opacity = prompt ? "1" : "0";
  flash = Math.max(0, flash - dt);
  hud.c.style.opacity = flash > 0 ? String(Math.min(1, flash)) : "0";

  if (render) composer.render(dt);
  input.endFrame(dt);
}

let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// A handle for checks from the browser's console and the DevTools MCP.
Object.assign(window, {
  __nh: {
    seed,
    world: { w: world.w, d: world.d, h: world.h, tile: TILE, storey: STOREY },
    kylo: () => kylo.pos.toArray(),
    driving: () => driving !== null,
    jobs: () => jobs.state(),
    teleport: (x: number, y: number, z: number) => kylo.respawnAt(new THREE.Vector3(x, y, z)),
    look: (yaw: number, pitch: number, dist: number) => {
      camYaw = yaw;
      camPitch = pitch;
      camDist = dist;
    },
    info: () => renderer.info.render,
    /** Hold or release a key (KeyboardEvent.code) for scripted play. */
    key: (code: string, down: boolean) => dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code })),
    /** Run the game for `seconds` at 60 fps without waiting for the browser (works in a hidden tab). */
    advance: (seconds: number) => {
      const n = Math.round(seconds * 60);
      for (let i = 0; i < n; i++) frame(1 / 60, i === n - 1);
      return { kylo: kylo.pos.toArray(), driving: driving !== null, jobs: jobs.state() };
    },
  },
});
message("KYLO<br><small>no memory · a Union capsule · New Hope</small>");
