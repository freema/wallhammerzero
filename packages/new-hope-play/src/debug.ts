// The test hook: `window.__game` (and the older name `window.__nh`). Scripted play from the
// browser's console or the DevTools MCP: state as JSON and a digest of it, stepping without the
// browser's clock (a hidden tab works), named scenarios, whole action scripts run in the page
// (`play/*.json`), PNG shots written by the dev server (`/__shot`), draw-call counts and the
// errors seen since load.

import type * as THREE from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { fnv1a64Hex } from "@whz/det";
import { K } from "@whz/citygen";
import { cellCentre, cellsOf, STOREY, TILE } from "./world.ts";
import type { World } from "./world.ts";

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

const errors: string[] = [];

/** Record uncaught errors, rejections and console errors from here on. */
export function captureErrors(): void {
  addEventListener("error", (e) => errors.push(String(e.message)));
  addEventListener("unhandledrejection", (e) => errors.push(`unhandled rejection: ${String(e.reason)}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
}

/** Numbers to millimetres (3 decimals), so a snapshot is stable text. */
function rounded<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v: unknown) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v))) as T;
}

function at(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export interface ScriptStep {
  /** advance | press | hold | down | up | scenario | look | pointer | place | wanted | pass | rain | enter | leave | save */
  do?: string;
  seconds?: number;
  code?: string;
  name?: string;
  args?: number[];
  /** A path into `view()`: the state plus `nearestCar`, `band`, `jobDist`, `jobDy` and `perf`. */
  expect?: string;
  /** Compare against (value − the value saved under this name) instead of the value. */
  from?: string;
  eq?: unknown;
  ne?: unknown;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  /** Take a PNG shot with this name. */
  shot?: string;
  note?: string;
}

export interface Script {
  name: string;
  /** The district the script was written for; it fails fast on another seed. */
  seed?: number;
  steps: ScriptStep[];
}

export function installDebug(h: GameHandle): void {
  const view = (): Record<string, unknown> => {
    const s = h.state();
    const [kx, ky, kz] = s.driving ? s.driving.pos : s.kylo.pos;
    const [jx, jy, jz] = s.jobs.where;
    return {
      ...s,
      nearestCar: h.nearestCar(),
      band: h.band(s.level),
      jobDist: Math.hypot((jx ?? 0) - (kx ?? 0), (jz ?? 0) - (kz ?? 0)),
      jobDy: (jy ?? 0) - (ky ?? 0),
      perf: perf(),
    };
  };

  const describe = (): Record<string, unknown> => {
    const v = view();
    const s = v as unknown as GameState & { nearestCar: string | null; band: string; jobDist: number; jobDy: number };
    const here = s.driving ? s.driving.pos : s.kylo.pos;
    const near = (p: number[], r: number): boolean => Math.hypot((p[0] ?? 0) - (here[0] ?? 0), (p[1] ?? 0) - (here[1] ?? 0), (p[2] ?? 0) - (here[2] ?? 0)) < r;
    return rounded({
      game: "new-hope",
      v: 1,
      axes: "y up, metres; a tile is 4 m, a storey 4 m",
      seed: h.seed,
      tick: s.tick,
      mode: s.driving ? "car" : "foot",
      pos: here.map((n) => Math.round(n * 10) / 10),
      level: s.level,
      band: s.band,
      car: s.driving ? { kind: s.driving.kind, kmh: Math.round(s.driving.speed * 3.6) } : null,
      nearestCar: s.nearestCar,
      job: { kind: s.jobs.kind, dist: Math.round(s.jobDist), dy: Math.round(s.jobDy), credits: s.jobs.credits, done: s.jobs.done },
      heat: { stars: s.police.stars, units: s.police.units.length, arrest: s.police.arrest },
      psi: Math.round(s.psi),
      peopleWithin20m: s.crowd.filter((p) => near(p, 20)).length,
    });
  };

  const digest = (): string => fnv1a64Hex(new TextEncoder().encode(JSON.stringify(rounded(h.state()))));

  const nearestCell = (kind: number, accept: (x: number, y: number, z: number) => boolean = () => true): [number, number, number] | null => {
    const s = h.state();
    const [px = 0, py = 0, pz = 0] = s.driving ? s.driving.pos : s.kylo.pos;
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

  /** Put the game in a named state. Returns false when the district has no such place. */
  const scenario = (name: string): boolean => {
    const w = h.world;
    switch (name) {
      case "lift": {
        // The bottom of a shaft that goes up at least one storey, on foot.
        h.leaveCar();
        const c = nearestCell(K.lift, (x, y, z) => w.kind(x, y, z + 1) === K.lift && w.kind(x, y, z - 1) !== K.lift);
        if (!c) return false;
        const m = cellCentre(...c);
        h.place(m.x, m.y + 0.2, m.z);
        return true;
      }
      case "street": {
        h.leaveCar();
        const c = nearestCell(K.street);
        if (!c) return false;
        const m = cellCentre(...c);
        h.place(m.x, m.y + 0.2, m.z);
        return true;
      }
      case "car":
        return h.enterNearestCar();
      case "target": {
        const [x = 0, y = 0, z = 0] = h.state().jobs.where;
        h.place(x, y + (h.state().driving ? 0.35 : 0.2), z);
        return true;
      }
      default:
        throw new Error(`unknown scenario "${name}" (lift, street, car, target)`);
    }
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

  const shot = async (name = "shot", pixelRatio = 1): Promise<string> => {
    const safe = name.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 60) || "shot";
    const old = h.renderer.getPixelRatio();
    h.renderer.setPixelRatio(pixelRatio);
    h.composer.setPixelRatio(pixelRatio);
    h.render();
    // Read the canvas in the same task as the render: the drawing buffer is not preserved.
    const url = h.renderer.domElement.toDataURL("image/png");
    h.renderer.setPixelRatio(old);
    h.composer.setPixelRatio(old);
    h.render();
    const png = await (await fetch(url)).blob();
    const res = await fetch(`/__shot?name=${safe}`, { method: "POST", body: png });
    if (!res.ok) throw new Error(`/__shot answered ${res.status}`);
    return ((await res.json()) as { path: string }).path;
  };

  const press = (code: string): void => {
    h.key(code, true);
    h.advance(h.step);
    h.key(code, false);
  };

  const hold = (code: string, seconds: number): void => {
    h.key(code, true);
    h.advance(seconds);
    h.key(code, false);
  };

  const check = (st: ScriptStep, saved: Map<string, Record<string, unknown>>): { ok: boolean; got: unknown } => {
    const path = st.expect as string;
    let got = at(view(), path);
    if (st.from !== undefined) {
      const base = at(saved.get(st.from), path);
      got = typeof got === "number" && typeof base === "number" ? got - base : undefined;
    }
    const num = typeof got === "number" ? got : NaN;
    let ok = true;
    if ("eq" in st) ok &&= JSON.stringify(got) === JSON.stringify(st.eq);
    if ("ne" in st) ok &&= JSON.stringify(got) !== JSON.stringify(st.ne);
    if (st.gt !== undefined) ok &&= num > st.gt;
    if (st.gte !== undefined) ok &&= num >= st.gte;
    if (st.lt !== undefined) ok &&= num < st.lt;
    if (st.lte !== undefined) ok &&= num <= st.lte;
    return { ok, got: typeof got === "number" ? Math.round(got * 1000) / 1000 : got };
  };

  /** Run a script (an object, or the name of `play/<name>.json`); stops at the first failure. */
  const runScript = async (input: Script | string): Promise<Record<string, unknown>> => {
    const script: Script = typeof input === "string" ? ((await (await fetch(`/play/${input}.json`)).json()) as Script) : input;
    const t0 = performance.now();
    const errorsBefore = errors.length;
    const saved = new Map<string, Record<string, unknown>>();
    const shots: string[] = [];
    const checks: unknown[] = [];
    let failed: Record<string, unknown> | null = null;
    if (script.seed !== undefined && script.seed !== h.seed) failed = { reason: `written for seed ${script.seed}; open ?seed=${script.seed}` };
    for (let i = 0; i < script.steps.length && !failed; i++) {
      const st = script.steps[i] as ScriptStep;
      try {
        const a = st.args ?? [];
        switch (st.do) {
          case undefined:
            break;
          case "advance":
            h.advance(st.seconds ?? 1);
            break;
          case "press":
            press(st.code as string);
            break;
          case "hold":
            hold(st.code as string, st.seconds ?? 1);
            break;
          case "down":
          case "up":
            h.key(st.code as string, st.do === "down");
            break;
          case "scenario":
            if (!scenario(st.name as string)) failed = { i, reason: `scenario "${st.name}" not possible here` };
            break;
          case "look":
            h.look(a[0] ?? 0, a[1] ?? 0.3, a[2] ?? 6);
            break;
          case "pointer":
            h.pointer(a[0] ?? 0, a[1] ?? 0);
            break;
          case "place":
            h.place(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0);
            break;
          case "wanted":
            h.wanted(a[0] ?? 1);
            break;
          case "pass":
            h.pass();
            break;
          case "rain":
            h.rain(a[0] === undefined ? null : a[0] > 0);
            break;
          case "enter":
            h.enterNearestCar();
            break;
          case "leave":
            h.leaveCar();
            break;
          case "save":
            saved.set(st.name as string, view());
            break;
          default:
            failed = { i, reason: `unknown step "${st.do}"` };
        }
        if (st.expect !== undefined && !failed) {
          const r = check(st, saved);
          checks.push({ i, expect: st.expect, got: r.got, ok: r.ok, ...(st.note ? { note: st.note } : {}) });
          if (!r.ok) failed = { i, step: st, got: r.got };
        }
        if (st.shot !== undefined && !failed) shots.push(await shot(`${script.name}-${st.shot}`));
      } catch (e) {
        failed = { i, step: st, error: String(e) };
      }
      if (!failed && errors.length > errorsBefore) failed = { i, reason: "console error", error: errors[errorsBefore] };
    }
    return {
      script: script.name,
      ok: failed === null,
      failed,
      checks,
      digest: digest(),
      state: describe(),
      errors: errors.slice(errorsBefore),
      shots,
      ms: Math.round(performance.now() - t0),
    };
  };

  const api = {
    id: "new-hope",
    version: 1,
    seed: h.seed,
    stepHz: Math.round(1 / h.step),
    world: { w: h.world.w, d: h.world.d, h: h.world.h, tile: TILE, storey: STOREY },
    describe,
    state: () => rounded(h.state()),
    digest,
    /** Run the game for `seconds` (fixed steps, no browser clock), draw once; returns describe(). */
    advance: (seconds: number) => {
      h.advance(seconds);
      return describe();
    },
    key: h.key,
    press,
    hold,
    pointer: h.pointer,
    look: h.look,
    place: h.place,
    teleport: h.place,
    scenario,
    runScript,
    shot,
    perf,
    errors: () => [...errors],
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
    crowd: () => h.state().crowd,
    psi: () => h.state().psi,
    info: () => perf(),
    /** The live three.js objects, for poking around in the console. */
    three: { scene: h.scene, camera: h.camera, renderer: h.renderer },
  };
  Object.assign(window, { __game: api, __nh: api });
}
