// New Hope's side of the test hook `window.__game` (@whz/play-kit; the older name `window.__nh`
// is kept): the state, the brief, the derived values scripts check, the scenarios, the game's
// actions and the shot through the bloom composer. The runner, digests, shots and errors are
// the kit's.

import type * as THREE from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { K } from "@whz/citygen";
import { installGameHook, rounded } from "@whz/play-kit";
import { cellCentre, cellsOf, STOREY, TILE } from "./world.ts";
import type { World } from "./world.ts";

export { captureErrors } from "@whz/play-kit";

/** What main.ts hands the hook. */
export interface GameHandle {
  seed: number;
  /** Seconds per simulation step. */
  step: number;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderMs: number[];
  advance(seconds: number): void;
  /** Draw the current state without advancing it. */
  render(): void;
  state(): GameState;
  band(level: number): string;
  nearestCar(): string | null;
  key(code: string, down: boolean): void;
  pointer(dx: number, dy: number): void;
  look(yaw: number, pitch: number, dist: number): void;
  place(x: number, y: number, z: number): void;
  enterNearestCar(): boolean;
  leaveCar(): void;
  wanted(stars: number): void;
  pass(): boolean;
  rain(on: boolean | null): void;
  world: World;
}

export interface GameState {
  tick: number;
  kylo: { pos: number[]; yaw: number; onGround: boolean; kylosBody: boolean };
  driving: { kind: string; pos: number[]; vel: number[]; speed: number } | null;
  psi: number;
  passes: number;
  level: number;
  jobs: { kind: string; where: number[]; credits: number; done: number };
  police: { stars: number; heat: number; units: number[][]; arrest: number };
  crowd: number[][];
}

export function installDebug(h: GameHandle): void {
  const here = (s: GameState): number[] => (s.driving ? s.driving.pos : s.kylo.pos);

  /** Derived values scripts may check: `nearestCar`, `band`, `jobDist`, `jobDy`. */
  const view = (): Record<string, unknown> => {
    const s = h.state();
    const [kx = 0, ky = 0, kz = 0] = here(s);
    const [jx = 0, jy = 0, jz = 0] = s.jobs.where;
    return { nearestCar: h.nearestCar(), band: h.band(s.level), jobDist: Math.hypot(jx - kx, jz - kz), jobDy: jy - ky };
  };

  const describe = (): Record<string, unknown> => {
    const s = h.state();
    const v = view() as { nearestCar: string | null; band: string; jobDist: number; jobDy: number };
    const p = here(s);
    const near = (q: number[], r: number): boolean => Math.hypot((q[0] ?? 0) - (p[0] ?? 0), (q[1] ?? 0) - (p[1] ?? 0), (q[2] ?? 0) - (p[2] ?? 0)) < r;
    return {
      v: 1,
      axes: "y up, metres; a tile is 4 m, a storey 4 m",
      tick: s.tick,
      mode: s.driving ? "car" : "foot",
      pos: p.map((n) => Math.round(n * 10) / 10),
      level: s.level,
      band: v.band,
      car: s.driving ? { kind: s.driving.kind, kmh: Math.round(s.driving.speed * 3.6) } : null,
      nearestCar: v.nearestCar,
      job: { kind: s.jobs.kind, dist: Math.round(v.jobDist), dy: Math.round(v.jobDy), credits: s.jobs.credits, done: s.jobs.done },
      heat: { stars: s.police.stars, units: s.police.units.length, arrest: s.police.arrest },
      psi: Math.round(s.psi),
      peopleWithin20m: s.crowd.filter((q) => near(q, 20)).length,
    };
  };

  const nearestCell = (kind: number, accept: (x: number, y: number, z: number) => boolean = () => true): [number, number, number] | null => {
    const [px = 0, py = 0, pz = 0] = here(h.state());
    let best: [number, number, number] | null = null;
    let bestD = Infinity;
    for (const c of cellsOf(h.world, kind)) {
      if (!accept(...c)) continue;
      const m = cellCentre(...c);
      const d = Math.hypot(m.x - px, m.y - py, m.z - pz);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  };

  const standOn = (c: [number, number, number] | null): boolean => {
    if (!c) return false;
    const m = cellCentre(...c);
    h.place(m.x, m.y + 0.2, m.z);
    return true;
  };

  const perf = (): Record<string, unknown> => {
    const sorted = [...h.renderMs].sort((a, b) => a - b);
    const q = (f: number): number => Math.round((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] ?? 0) * 10) / 10;
    const info = h.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      renderCpuMs: { p50: q(0.5), p95: q(0.95), frames: sorted.length },
    };
  };

  const hook = installGameHook<GameState>({
    id: "new-hope",
    seed: h.seed,
    step: h.step,
    state: h.state,
    describe,
    view,
    advance: h.advance,
    key: h.key,
    capture: (ratio) => {
      const old = h.renderer.getPixelRatio();
      h.renderer.setPixelRatio(ratio);
      h.composer.setPixelRatio(ratio);
      h.render();
      // Read the canvas in the same task as the render: the drawing buffer is not preserved.
      const url = h.renderer.domElement.toDataURL("image/png");
      h.renderer.setPixelRatio(old);
      h.composer.setPixelRatio(old);
      h.render();
      return url;
    },
    scenarios: {
      // The bottom of a shaft that goes up at least one storey, on foot.
      lift: () => {
        h.leaveCar();
        return standOn(nearestCell(K.lift, (x, y, z) => h.world.kind(x, y, z + 1) === K.lift && h.world.kind(x, y, z - 1) !== K.lift));
      },
      street: () => {
        h.leaveCar();
        return standOn(nearestCell(K.street));
      },
      car: () => h.enterNearestCar(),
      // On the job's spot.
      target: () => {
        const [x = 0, y = 0, z = 0] = h.state().jobs.where;
        h.place(x, y + (h.state().driving ? 0.35 : 0.2), z);
        return true;
      },
    },
    actions: {
      look: (yaw = 0, pitch = 0.3, dist = 6) => h.look(yaw, pitch, dist),
      pointer: (dx = 0, dy = 0) => h.pointer(dx, dy),
      place: (x = 0, y = 0, z = 0) => h.place(x, y, z),
      wanted: (stars = 1) => h.wanted(stars),
      pass: () => h.pass(),
      rain: (on?: number) => h.rain(on === undefined ? null : on > 0),
      enter: () => h.enterNearestCar(),
      leave: () => h.leaveCar(),
    },
    perf,
    extra: {
      world: { w: h.world.w, d: h.world.d, h: h.world.h, tile: TILE, storey: STOREY },
      teleport: h.place,
      place: h.place,
      look: h.look,
      pointer: h.pointer,
      wanted: h.wanted,
      pass: h.pass,
      rain: h.rain,
      enterCar: h.enterNearestCar,
      leaveCar: h.leaveCar,
      nearestCar: h.nearestCar,
      // The getters of the first hook, kept for old notes and scripts.
      kylo: () => h.state().kylo.pos,
      driving: () => h.state().driving !== null,
      jobs: () => h.state().jobs,
      target: () => h.state().jobs.where,
      police: () => {
        const p = h.state().police;
        return { stars: p.stars, units: p.units.length, arrest: p.arrest };
      },
      crowd: () => rounded(h.state().crowd),
      psi: () => h.state().psi,
      info: () => perf(),
      /** The live three.js objects, for poking around in the console. */
      three: { scene: h.scene, camera: h.camera, renderer: h.renderer },
    },
  });
  Object.assign(window, { __nh: hook });
}
