// Tidewright (D32): sail a 9 m sloop through a generated archipelago and deliver cargo before
// the storm. The simulation (`update`) runs at a fixed 120 Hz and holds every rule: the wind,
// the boat, the waves it floats on, the cargo clock. `present` draws once per frame. The same
// seed and the same inputs per step give the same run. `window.__game` (@whz/play-kit) drives
// it from scripts: play/*.json.

import * as THREE from "three";
import { captureErrors, fixedLoop, installGameHook, Keys } from "@whz/play-kit";
import { Sound } from "./audio.ts";
import { Boat, KNOT } from "./boat.ts";
import { Hud } from "./hud.ts";
import { Jobs } from "./jobs.ts";
import type { JobEvent } from "./jobs.ts";
import { calmWithDepth, createOcean, makeWaves, waterAt } from "./ocean.ts";
import { Weather } from "./sky.ts";
import { Wake } from "./wake.ts";
import { Wind } from "./wind.ts";
import type { WindNow } from "./wind.ts";
import { createWorld } from "./world.ts";

captureErrors();

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1) >>> 0;
const STEP = 1 / 120;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- the renderer and the scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;
renderer.domElement.id = "view";
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 30000);

const world = createWorld(seed);
scene.add(world.group);
const wind = new Wind(seed, (((seed * 2654435761) >>> 0) % 6283) / 1000);
const ocean = createOcean(makeWaves(wind.baseTo), world.heightmap, world.rect);
scene.add(ocean.mesh);
const weather = new Weather(renderer, scene);
const boat = new Boat();
scene.add(boat.root);
const wake = new Wake();
scene.add(wake.mesh);
const jobs = new Jobs(world.harbours, seed);
const hud = new Hud();
const sound = new Sound();

// ---------------------------------------------------------------- the simulation

const keys = new Keys().listen();
const windNow: WindNow = { to: 0, speed: 0, x: 0, z: 0 };
let tick = 0;
let t = 0;
/** A storm forced by a script, or null for the cargo clock's. */
let forcedStorm: number | null = null;
let lastEvent: JobEvent | null = null;
const stormLevel = (): number => forcedStorm ?? jobs.storm;
const surface = {
  water: (x: number, z: number) => waterAt(ocean.waves, x, z, t, (1 + stormLevel() * 0.95) * calmWithDepth(-world.height(x, z))).y,
  ground: (x: number, z: number) => world.height(x, z),
};

function castOff(): void {
  const home = world.harbours[0];
  if (!home) throw new Error(`seed ${seed}: no harbour could be placed`);
  boat.place(home.dock.x, home.dock.y, Math.atan2(home.out.x, home.out.y));
  jobs.reset(home, boat.groundings);
  wind.at(t, stormLevel(), windNow);
}
castOff();

const MESSAGES: Record<JobEvent, (pay: number) => string> = {
  delivered: (pay) => `Delivered<small>+${pay} crowns · a new load is aboard</small>`,
  late: (pay) => `Delivered late<small>+${pay} crowns, half pay in the storm</small>`,
  lost: () => `The cargo is lost<small>too many groundings · a new load from the nearest harbour</small>`,
  "too-fast": () => `Too fast to tie up<small>ease the sheet (S) and come in under 4 knots</small>`,
  spoiled: () => `Aground!<small>a quarter of the cargo is spoiled</small>`,
};

function update(dt: number): void {
  t += dt;
  tick++;
  wind.at(t, stormLevel(), windNow);
  const steer = keys.axis(["KeyA", "ArrowLeft"], ["KeyD", "ArrowRight"]);
  const sheet = keys.axis(["KeyS", "ArrowDown"], ["KeyW", "ArrowUp"]);
  boat.step(dt, windNow, { steer, sheet }, surface);
  wake.update(dt, boat.x, boat.z, boat.heading, boat.u);
  const event = jobs.update(dt, boat.x, boat.z, boat.u, boat.groundings);
  if (event) {
    lastEvent = event;
    hud.say(MESSAGES[event](jobs.s.lastPay), event === "delivered" || event === "late" ? 5 : 3.5, t);
    if (event === "delivered" || event === "late") sound.bell();
    if (event === "spoiled" || event === "lost") sound.thud();
  }
  keys.endStep();
}

// ---------------------------------------------------------------- the camera and the picture

/** The camera orbits the boat: yaw relative to the stern, pitch, distance. */
let camYaw = 0.35;
let camPitch = 0.2;
let camDist = 24;
let dragging = false;
const camPos = new THREE.Vector3();
const camAim = new THREE.Vector3();
let camReady = false;

renderer.domElement.addEventListener("pointerdown", (e) => {
  dragging = true;
  renderer.domElement.setPointerCapture(e.pointerId);
});
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  camYaw -= e.movementX * 0.005;
  camPitch = Math.min(1.2, Math.max(0.03, camPitch + e.movementY * 0.004));
});
addEventListener("wheel", (e) => {
  camDist = Math.min(140, Math.max(9, camDist * (1 + Math.sign(e.deltaY) * 0.1)));
});

function placeCamera(dt: number): void {
  const a = boat.heading + Math.PI + camYaw;
  const want = new THREE.Vector3(boat.x + Math.sin(a) * Math.cos(camPitch) * camDist, 2.5 + Math.sin(camPitch) * camDist, boat.z + Math.cos(a) * Math.cos(camPitch) * camDist);
  const aim = new THREE.Vector3(boat.x, 3.2 + boat.lift, boat.z);
  const k = camReady ? 1 - Math.exp(-dt * 4) : 1;
  camPos.lerp(want, k);
  camAim.lerp(aim, k);
  camReady = true;
  const floor = surface.water(camPos.x, camPos.z) + 1.2;
  if (camPos.y < floor) camPos.y = floor;
  camera.position.copy(camPos);
  camera.lookAt(camAim);
}

const renderMs: number[] = [];
function present(dt: number): void {
  placeCamera(dt);
  ocean.follow(camera);
  sound.update({ wind: boat.aws, speed: boat.u, luff: boat.trim === "luffing" ? 1 : 0, storm: stormLevel() });
  ocean.uniforms.uTime.value = t;
  ocean.uniforms.uStorm.value = 1 + stormLevel() * 0.95;
  weather.storm = stormLevel();
  weather.apply(scene);
  weather.follow(boat.x, boat.z);
  renderer.toneMappingExposure = weather.exposure;
  boat.pose(t);
  wake.draw(surface.water);
  // Only the target's beacon shows, and it fades out as the camera comes close.
  world.beacons.forEach((b, i) => {
    b.visible = i === jobs.s.toId;
    const near = Math.hypot(b.position.x - camera.position.x, b.position.z - camera.position.z);
    (b.material as THREE.MeshBasicMaterial).opacity = (0.3 + 0.08 * Math.sin(t * 2.4)) * Math.min(1, Math.max(0, (near - 30) / 120));
  });
  hud.draw(t, boat, windNow, jobs.s, jobs.target.dock, stormLevel());
  renderer.info.reset();
  const t0 = performance.now();
  renderer.render(scene, camera);
  renderMs.push(performance.now() - t0);
  if (renderMs.length > 240) renderMs.shift();
}

// Nothing moves under the start screen; a click or the hook starts the game.
let playing = false;
const loop = fixedLoop({ step: STEP, update: (dt) => {
    if (playing) update(dt);
  }, present });
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const start = document.getElementById("start") as HTMLElement;
start.addEventListener("click", () => {
  start.remove();
  playing = true;
  sound.start();
});
addEventListener("keydown", (e) => {
  if (e.code === "KeyM") hud.say(sound.toggle() ? "Sound off" : "Sound on", 1.2, t);
});

// ---------------------------------------------------------------- the test hook

/** Open water well clear of every island, for measuring the boat alone. */
function openWater(): [number, number] {
  for (let r = 2300; r < 4000; r += 100) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + seed;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if ([0, 1, 2, 3, 4, 5, 6, 7].every((j) => world.height(x + Math.sin(j * 0.785) * 400, z + Math.cos(j * 0.785) * 400) < -20)) return [x, z];
    }
  }
  throw new Error("no open water");
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

installGameHook({
  id: "tidewright",
  seed,
  step: STEP,
  state: () => ({
    tick,
    t,
    boat: {
      pos: [boat.x, boat.z],
      heading: boat.heading,
      knots: boat.knots,
      awaDeg: boat.awa / DEG,
      aoaDeg: boat.aoa / DEG,
      trim: boat.trim,
      sheet: boat.sheet,
      heelDeg: boat.heel / DEG,
      groundings: boat.groundings,
      aground: boat.aground,
    },
    wind: { toDeg: windNow.to / DEG, knots: windNow.speed * KNOT },
    job: { ...jobs.s },
    storm: stormLevel(),
    event: lastEvent,
  }),
  describe: () => ({
    boat: { pos: [Math.round(boat.x), Math.round(boat.z)], kn: round1(boat.knots), awa: Math.round(boat.awa / DEG), trim: boat.trim, sheet: round1(boat.sheet), heel: Math.round(boat.heel / DEG), aground: boat.aground },
    wind: { kn: round1(windNow.speed * KNOT) },
    job: { to: jobs.s.to, dist: Math.round(Math.hypot(jobs.target.dock.x - boat.x, jobs.target.dock.y - boat.z)), left: Math.round(jobs.s.timeLeft), cargo: jobs.s.condition, credits: jobs.s.credits, delivered: jobs.s.delivered },
    storm: round1(stormLevel()),
  }),
  view: () => ({ targetDist: Math.hypot(jobs.target.dock.x - boat.x, jobs.target.dock.y - boat.z), harbours: world.harbours.length }),
  advance: (seconds) => {
    playing = true;
    loop.advance(seconds);
  },
  key: (code, down) => keys.set(code, down),
  capture: (ratio) => {
    const old = renderer.getPixelRatio();
    renderer.setPixelRatio(ratio);
    present(0);
    // Read the canvas in the same task as the render: the drawing buffer is not preserved.
    const url = renderer.domElement.toDataURL("image/png");
    renderer.setPixelRatio(old);
    present(0);
    return url;
  },
  scenarios: {
    start: () => {
      castOff();
      return true;
    },
    open: () => {
      const [x, z] = openWater();
      boat.place(x, z, 0);
      return true;
    },
    // Just off the target's pier, slow: the next steps tie up.
    dock: () => {
      const h = jobs.target;
      boat.place(h.dock.x + h.out.x * 12, h.dock.y + h.out.y * 12, Math.atan2(-h.out.x, -h.out.y));
      boat.u = 0.8;
      return true;
    },
    // Heading for a beach at speed: the keel finds the bottom.
    shoal: () => {
      const isle = world.islands[world.harbours[0]?.island ?? 0];
      if (!isle) return false;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + 0.4;
        let s = isle.r * 0.5;
        while (s < isle.r * 2.5 && world.height(isle.x + Math.sin(a) * s, isle.z + Math.cos(a) * s) > -4) s += 1;
        const x = isle.x + Math.sin(a) * (s + 6);
        const z = isle.z + Math.cos(a) * (s + 6);
        if (world.height(x, z) > -4) continue;
        boat.place(x, z, a + Math.PI);
        boat.u = 3;
        return true;
      }
      return false;
    },
  },
  actions: {
    /** Point the bow so the true wind comes from `deg` off it (positive: from starboard). */
    point: (deg = 90) => {
      boat.heading = windNow.to + Math.PI + deg * DEG;
      boat.yawRate = 0;
    },
    sheet: (rad = 0.6) => {
      boat.sheet = rad;
    },
    speed: (mps = 0) => {
      boat.u = mps;
    },
    /** 1 freezes the wind's veer and gusts; 0 lets them run. */
    steady: (on = 1) => {
      wind.steady = on > 0;
      wind.at(t, stormLevel(), windNow);
    },
    /** The camera: yaw from the stern and pitch in degrees, distance in metres. */
    camera: (yawDeg = 20, pitchDeg = 11, dist = 24) => {
      camYaw = yawDeg * DEG;
      camPitch = pitchDeg * DEG;
      camDist = dist;
      camReady = false;
    },
    /** Force the storm (0..1), or give it back to the cargo clock with -1. */
    storm: (level = 1) => {
      forcedStorm = level < 0 ? null : level;
    },
  },
  perf: () => {
    const info = renderer.info;
    const sorted = [...renderMs].sort((a, b) => a - b);
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      renderCpuMsP50: Math.round((sorted[Math.floor(sorted.length / 2)] ?? 0) * 10) / 10,
    };
  },
  extra: { three: { scene, camera, renderer }, world },
});
loop.start();
