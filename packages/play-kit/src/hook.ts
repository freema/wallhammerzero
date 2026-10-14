// The test hook every game exposes as `window.__game`: state as JSON and its digest, stepping
// without the browser's clock (a hidden tab works), input, named scenarios, game actions,
// whole scripts run in the page (`play/<name>.json`), PNG shots written by the dev server
// (`POST /__shot`, see vite.ts), counts and the errors seen since load. The same verbs for
// every game, whatever draws it (Three.js, a 2D canvas).

import { fnv1a64Hex } from "@whz/det";
import { hold, press, rounded, runScript } from "./runner.ts";
import type { Script, ScriptResult, ScriptTarget } from "./runner.ts";

/** What a game hands the hook. */
export interface PlayableGame<S = unknown> {
  /** The game's id, as its folder under games/. */
  id: string;
  seed: number;
  /** Seconds per simulation step. */
  step: number;
  /** The whole simulation state as plain JSON (positions, scores, timers). It is digested. */
  state(): S;
  /** The state in brief, under about 1 KB, for an agent to read. Default: the rounded state. */
  describe?(): Record<string, unknown>;
  /** Derived values scripts may check besides the state (distances, what is near). */
  view?(): Record<string, unknown>;
  /** Run whole simulation steps for `seconds` of game time, then draw once. */
  advance(seconds: number): void;
  key(code: string, down: boolean): void;
  /** Draw now at this pixel ratio and return the frame as a PNG data URL, in the same task. */
  capture(pixelRatio: number): string;
  /** Named situations for scripts; each returns false when it is not possible here. */
  scenarios?: Record<string, () => boolean>;
  /** Game verbs for scripts (`{"do": "<name>", "args": [...]}`) and the console. */
  actions?: Record<string, (...args: number[]) => unknown>;
  /** Draw counts and timings (`renderer.info` for Three.js). */
  perf?(): Record<string, unknown>;
  /** More members for `window.__game` (live objects, old names). */
  extra?: Record<string, unknown>;
}

export interface GameHook {
  id: string;
  version: 1;
  seed: number;
  stepHz: number;
  describe(): Record<string, unknown>;
  state(): unknown;
  digest(): string;
  advance(seconds: number): Record<string, unknown>;
  key(code: string, down: boolean): void;
  press(code: string): void;
  hold(code: string, seconds: number): void;
  scenario(name: string): boolean;
  act(name: string, ...args: number[]): unknown;
  runScript(script: Script | string): Promise<ScriptResult>;
  shot(name?: string, pixelRatio?: number): Promise<string>;
  perf(): Record<string, unknown>;
  errors(): string[];
  [extra: string]: unknown;
}

const errors: string[] = [];

/** Record uncaught errors, rejections and console errors from here on. Call it first. */
export function captureErrors(): void {
  addEventListener("error", (e) => errors.push(String(e.message)));
  addEventListener("unhandledrejection", (e) => errors.push(`unhandled rejection: ${String(e.reason)}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
    original(...args);
  };
}

/** Install `window.__game` for this game and return it. */
export function installGameHook<S>(game: PlayableGame<S>): GameHook {
  const perf = (): Record<string, unknown> => game.perf?.() ?? {};
  const view = (): Record<string, unknown> => ({ ...(game.state() as Record<string, unknown>), ...game.view?.(), perf: perf() });
  const describe = (): Record<string, unknown> => rounded({ game: game.id, seed: game.seed, ...(game.describe?.() ?? (game.state() as Record<string, unknown>)) });
  const digest = (): string => fnv1a64Hex(new TextEncoder().encode(JSON.stringify(rounded(game.state()))));

  const scenario = (name: string): boolean => {
    const s = game.scenarios?.[name];
    if (!s) throw new Error(`unknown scenario "${name}" (${Object.keys(game.scenarios ?? {}).join(", ") || "none"})`);
    return s();
  };
  const action = (name: string, args: number[]): unknown => {
    const a = game.actions?.[name];
    if (!a) throw new Error(`unknown step or action "${name}" (actions: ${Object.keys(game.actions ?? {}).join(", ") || "none"})`);
    return a(...args);
  };

  const shot = async (name = "shot", pixelRatio = 1): Promise<string> => {
    const safe = name.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 60) || "shot";
    const png = await (await fetch(game.capture(pixelRatio))).blob();
    const res = await fetch(`/__shot?name=${safe}`, { method: "POST", body: png });
    if (!res.ok) throw new Error(`/__shot answered ${res.status}`);
    return ((await res.json()) as { path: string }).path;
  };

  const target: ScriptTarget = {
    seed: game.seed,
    step: game.step,
    advance: (s) => game.advance(s),
    key: (c, d) => game.key(c, d),
    scenario,
    action,
    view,
    describe,
    digest,
    shot,
    errors: () => errors,
    now: () => performance.now(),
  };

  const hook: GameHook = {
    ...game.extra,
    id: game.id,
    version: 1,
    seed: game.seed,
    stepHz: Math.round(1 / game.step),
    describe,
    state: () => rounded(game.state()),
    digest,
    advance: (seconds) => {
      game.advance(seconds);
      return describe();
    },
    key: target.key,
    press: (code) => press(target, code),
    hold: (code, seconds) => hold(target, code, seconds),
    scenario,
    act: (name, ...args) => action(name, args),
    runScript: async (input) => {
      const script = typeof input === "string" ? ((await (await fetch(`/play/${input}.json`)).json()) as Script) : input;
      return runScript(target, script);
    },
    shot,
    perf,
    errors: () => [...errors],
  };
  Object.assign(window, { __game: hook });
  return hook;
}
