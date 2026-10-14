// The script runner: a whole scripted play-through in one call, so an agent checks a game with
// one browser call instead of dozens. Pure: it drives a `ScriptTarget` and has no DOM, so it
// is tested in Node with a fake game.

/** One step of a script. A step does at most one thing, then may check and take a shot. */
export interface ScriptStep {
  /**
   * advance | press | hold | down | up | scenario | save, or the name of one of the game's
   * actions (called with `args`).
   */
  do?: string;
  seconds?: number;
  code?: string;
  name?: string;
  args?: number[];
  /** A dotted path into the view: the state, the game's derived values and `perf`. */
  expect?: string;
  /** Compare (value − the value saved under this name) instead of the value. */
  from?: string;
  eq?: unknown;
  ne?: unknown;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  /** Take a PNG shot named `<script>-<shot>`. */
  shot?: string;
  note?: string;
}

export interface Script {
  name: string;
  /** The seed the script was written for; it fails fast on another. */
  seed?: number;
  steps: ScriptStep[];
}

/** What the runner needs from a game. `installGameHook` builds it from a `PlayableGame`. */
export interface ScriptTarget {
  seed: number;
  /** Seconds per simulation step. */
  step: number;
  advance(seconds: number): void;
  key(code: string, down: boolean): void;
  /** Put the game in a named state; false when it is not possible here. Throws on an unknown name. */
  scenario(name: string): boolean;
  /** Run a game action; throws on an unknown name. */
  action(name: string, args: number[]): unknown;
  view(): Record<string, unknown>;
  describe(): Record<string, unknown>;
  digest(): string;
  shot(name: string): Promise<string>;
  /** Errors seen since load, in order. */
  errors(): readonly string[];
  now(): number;
}

export interface ScriptResult {
  script: string;
  ok: boolean;
  failed: Record<string, unknown> | null;
  checks: { i: number; expect: string; got: unknown; ok: boolean; note?: string }[];
  digest: string;
  state: Record<string, unknown>;
  errors: string[];
  shots: string[];
  ms: number;
}

/** Follow a dotted path into nested objects and arrays. */
export function at(obj: unknown, path: string): unknown {
  let cur = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Numbers to 3 decimals, so a snapshot is stable text. */
export function rounded<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v: unknown) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v))) as T;
}

export function press(t: ScriptTarget, code: string): void {
  t.key(code, true);
  t.advance(t.step);
  t.key(code, false);
}

export function hold(t: ScriptTarget, code: string, seconds: number): void {
  t.key(code, true);
  t.advance(seconds);
  t.key(code, false);
}

function check(t: ScriptTarget, st: ScriptStep, saved: Map<string, Record<string, unknown>>): { ok: boolean; got: unknown } {
  const path = st.expect as string;
  let got = at(t.view(), path);
  if (st.from !== undefined) {
    const base = at(saved.get(st.from), path);
    got = typeof got === "number" && typeof base === "number" ? got - base : undefined;
  }
  const num = typeof got === "number" ? got : Number.NaN;
  let ok = true;
  if ("eq" in st) ok &&= JSON.stringify(got) === JSON.stringify(st.eq);
  if ("ne" in st) ok &&= JSON.stringify(got) !== JSON.stringify(st.ne);
  if (st.gt !== undefined) ok &&= num > st.gt;
  if (st.gte !== undefined) ok &&= num >= st.gte;
  if (st.lt !== undefined) ok &&= num < st.lt;
  if (st.lte !== undefined) ok &&= num <= st.lte;
  return { ok, got: typeof got === "number" ? Math.round(got * 1000) / 1000 : got };
}

/** Run a script; it stops at the first failed check, unknown step or new console error. */
export async function runScript(t: ScriptTarget, script: Script): Promise<ScriptResult> {
  const t0 = t.now();
  const errorsBefore = t.errors().length;
  const saved = new Map<string, Record<string, unknown>>();
  const shots: string[] = [];
  const checks: ScriptResult["checks"] = [];
  let failed: Record<string, unknown> | null = null;
  if (script.seed !== undefined && script.seed !== t.seed) failed = { reason: `written for seed ${script.seed}; open ?seed=${script.seed}` };
  for (let i = 0; i < script.steps.length && !failed; i++) {
    const st = script.steps[i] as ScriptStep;
    try {
      switch (st.do) {
        case undefined:
          break;
        case "advance":
          t.advance(st.seconds ?? 1);
          break;
        case "press":
          press(t, st.code as string);
          break;
        case "hold":
          hold(t, st.code as string, st.seconds ?? 1);
          break;
        case "down":
        case "up":
          t.key(st.code as string, st.do === "down");
          break;
        case "scenario":
          if (!t.scenario(st.name as string)) failed = { i, reason: `scenario "${st.name}" is not possible here` };
          break;
        case "save":
          saved.set(st.name as string, t.view());
          break;
        default:
          t.action(st.do, st.args ?? []);
      }
      if (st.expect !== undefined && !failed) {
        const r = check(t, st, saved);
        checks.push({ i, expect: st.expect, got: r.got, ok: r.ok, ...(st.note ? { note: st.note } : {}) });
        if (!r.ok) failed = { i, step: st, got: r.got };
      }
      if (st.shot !== undefined && !failed) shots.push(await t.shot(`${script.name}-${st.shot}`));
    } catch (e) {
      failed = { i, step: st, error: String(e) };
    }
    const errors = t.errors();
    if (!failed && errors.length > errorsBefore) failed = { i, reason: "console error", error: errors[errorsBefore] };
  }
  return {
    script: script.name,
    ok: failed === null,
    failed,
    checks,
    digest: t.digest(),
    state: t.describe(),
    errors: t.errors().slice(errorsBefore),
    shots,
    ms: Math.round(t.now() - t0),
  };
}
