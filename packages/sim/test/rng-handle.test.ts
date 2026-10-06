// What a system holds of its random stream at run time. The type `SimRng` has no `fork`, no
// `state` and no `restore`, but a type is gone once the code runs: a system written in plain
// JavaScript, or one that casts, sees the real object. So the object itself must give a system
// its own draws and nothing else: no way to make a stream, to rewind one, or to reach the
// kernel and through it the stream of another system.

import { createRng, Rng } from "@whz/det";
import { describe, expect, it } from "vitest";
import { createSim, field, stateOne } from "../src/index.ts";
import type { SimData, SystemContext, SystemDef } from "../src/index.ts";
import { noise } from "./helpers.ts";

const SEED = 2026;
const TICKS = 50;

/** Everything reachable from `start` by reading properties (own and inherited), without calling anything. */
function reachable(start: object): object[] {
  const seen = new Set<object>([start]);
  const queue: object[] = [start];
  // What every object inherits is not part of the handle.
  const skip = new Set<unknown>([Object.prototype, Function.prototype, Array.prototype]);
  while (queue.length > 0) {
    const current = queue.shift() as object;
    for (let holder: object | null = current; holder !== null && !skip.has(holder); holder = Object.getPrototypeOf(holder) as object | null) {
      for (const key of Reflect.ownKeys(holder)) {
        let value: unknown;
        try {
          value = Reflect.get(holder, key, current);
        } catch {
          continue;
        }
        if ((typeof value === "object" || typeof value === "function") && value !== null && !seen.has(value) && !skip.has(value)) {
          seen.add(value);
          queue.push(value);
        }
      }
    }
  }
  return [...seen];
}

/** What a system found when it tried to leave its own stream. */
interface Findings {
  context: SystemContext | null;
  /** The ways that worked: each is a short name. Must stay empty. */
  escapes: string[];
}

/**
 * A system that tries, in every tick, each way to get random numbers that are not the next
 * draws of its own stream. It draws nothing itself, so its own stream must not move either.
 */
function prober(findings: Findings): SystemDef {
  const state = stateOne("proberState", { ticks: field.count });
  const attempt = (name: string, action: () => unknown): void => {
    let result: unknown;
    try {
      result = action();
    } catch {
      return;
    }
    if (result !== undefined) findings.escapes.push(name);
  };
  return {
    name: "prober",
    state: [state],
    tick(ctx) {
      findings.context = ctx;
      // The casts are the point: this is what untyped code can write.
      const rng = ctx.rng as unknown as Record<string, ((...args: unknown[]) => unknown) | undefined>;
      const loose = ctx as unknown as Record<string, Record<string, unknown> | undefined>;
      attempt("rng.fork", () => rng["fork"]?.("child"));
      attempt("rng.state", () => rng["state"]?.());
      attempt("rng.restore", () => rng["restore"]?.([1, 2, 3, 4]));
      attempt("rng.seed", () => rng["seed"]);
      attempt("rng.stream", () => rng["stream"]);
      attempt("new rng.constructor", () => {
        const Made = (ctx.rng as unknown as { constructor: new (seed: number, stream: string) => unknown }).constructor;
        const made = new Made(SEED, "noise");
        return made instanceof Rng ? made : undefined;
      });
      attempt("ctx.kernel", () => loose["kernel"]);
      attempt("ctx.kernel.rngs", () => loose["kernel"]?.["rngs"]);
      attempt("ctx.kernel.contexts", () => loose["kernel"]?.["contexts"]);
      attempt("ctx.system", () => loose["system"]);
      attempt("replace ctx.rng", () => {
        (ctx as { rng: unknown }).rng = createRng(SEED, "noise");
        return ctx.rng instanceof Rng ? ctx.rng : undefined;
      });
      attempt("add a method to ctx.rng", () => {
        (ctx.rng as unknown as Record<string, unknown>)["fork"] = () => createRng(SEED, "noise");
        return rng["fork"];
      });
      attempt("replace a method of ctx.rng", () => {
        const before = ctx.rng.next;
        (ctx.rng as { next: () => number }).next = () => 4;
        return ctx.rng.next === before ? undefined : ctx.rng.next;
      });
      ctx.one(state).ticks += 1;
    },
  };
}

function data(systems: string[]): SimData {
  return { systems, tables: { noise: [{ id: "a", rolls: 3 }] } };
}

describe("the random stream handle of a system", () => {
  it("has the draws and nothing else: no fork, no state, no restore, not the Rng itself", () => {
    const findings: Findings = { context: null, escapes: [] };
    const sim = createSim({ data: data(["prober", "noise"]), seed: SEED, systems: [prober(findings), noise] });
    sim.step(1);
    const ctx = findings.context as SystemContext;

    expect(ctx.rng).not.toBeInstanceOf(Rng);
    expect(Reflect.ownKeys(ctx.rng).sort()).toEqual(["chance", "int", "next", "pick", "range", "shuffle", "weighted"]);
    expect(Object.getPrototypeOf(ctx.rng)).toBe(Object.prototype);
    expect(Object.isFrozen(ctx.rng)).toBe(true);
    expect(Object.isFrozen(ctx)).toBe(true);
    for (const name of ["fork", "state", "restore", "seed", "stream"]) expect(name in ctx.rng, name).toBe(false);
  });

  it("nothing reachable from the context is a generator, the kernel or another system's context", () => {
    const findings: Findings = { context: null, escapes: [] };
    const sim = createSim({ data: data(["prober", "noise"]), seed: SEED, systems: [prober(findings), noise] });
    sim.step(1);
    const ctx = findings.context as SystemContext;

    const objects = reachable(ctx);
    // The walk did see the handle and its methods, so it is not empty by accident.
    expect(objects).toContain(ctx.rng);
    expect(objects).toContain(ctx.rng.next);
    for (const value of objects) {
      expect(value).not.toBeInstanceOf(Rng);
      expect(value).not.toBe(sim);
      for (const key of ["rngs", "contexts", "fork", "restore", "rngState", "snapshot"]) {
        expect(key in value, `a reachable object has "${key}"`).toBe(false);
      }
    }
    // The context shows its own fields only: the kernel and the system are not properties.
    expect(Reflect.ownKeys(ctx)).toEqual(["rng"]);
  });

  it("a system that tries every way out gets nothing, and moves no stream", () => {
    const findings: Findings = { context: null, escapes: [] };
    const probed = createSim({ data: data(["prober", "noise"]), seed: SEED, systems: [prober(findings), noise] });
    const alone = createSim({ data: data(["noise"]), seed: SEED, systems: [noise] });
    const fresh = createRng(SEED, "prober").state();
    for (let tick = 0; tick < TICKS; tick += 1) {
      probed.step();
      alone.step();
      // The other system's stream is exactly where it is without the prober ...
      expect(probed.rngState("noise")).toEqual(alone.rngState("noise"));
      // ... and the prober's own stream was not drawn from, rewound or replaced.
      expect(probed.rngState("prober")).toEqual(fresh);
    }
    expect(findings.escapes).toEqual([]);
    expect(probed.read("noiseState")).toEqual(alone.read("noiseState"));
    expect(probed.read("proberState")).toEqual([{ ticks: TICKS }]);
  });

  it("the handle draws from the system's own stream: the same numbers as createRng(seed, name)", () => {
    const drawn: number[] = [];
    const dice: SystemDef = {
      name: "dice",
      tick(ctx) {
        drawn.push(ctx.rng.next(), ctx.rng.int(6), ctx.rng.range(-3, 3), ctx.rng.chance(1, 2) ? 1 : 0, ctx.rng.pick([10, 20, 30]), ctx.rng.weighted([1, 2, 3]));
        drawn.push(...ctx.rng.shuffle([1, 2, 3, 4, 5]));
      },
    };
    const sim = createSim({ data: { systems: ["dice"], tables: {} }, seed: SEED, systems: [dice] });
    sim.step(3);

    const rng = createRng(SEED, "dice");
    const expected: number[] = [];
    for (let tick = 0; tick < 3; tick += 1) {
      expected.push(rng.next(), rng.int(6), rng.range(-3, 3), rng.chance(1, 2) ? 1 : 0, rng.pick([10, 20, 30]), rng.weighted([1, 2, 3]));
      expected.push(...rng.shuffle([1, 2, 3, 4, 5]));
    }
    expect(drawn).toEqual(expected);
    expect(sim.rngState("dice")).toEqual(rng.state());
  });

  it("the methods work when taken off the handle (they do not need `this`)", () => {
    let roll = -1;
    const loose: SystemDef = {
      name: "loose",
      tick(ctx) {
        const { int } = ctx.rng;
        roll = int(6);
      },
    };
    createSim({ data: { systems: ["loose"], tables: {} }, seed: SEED, systems: [loose] }).step();
    expect(roll).toBe(createRng(SEED, "loose").int(6));
  });
});
