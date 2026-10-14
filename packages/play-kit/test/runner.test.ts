// The script runner against a fake game: steps, checks, saves, actions, failures, errors.

import { describe, expect, it } from "vitest";
import { at, rounded, runScript } from "../src/runner.ts";
import type { ScriptTarget } from "../src/runner.ts";

/** A body on a line: D moves it right at 2 units per second; one step is 0.5 s. */
function fakeGame(seed = 1): ScriptTarget & { x: number; log: string[]; errs: string[] } {
  const held = new Set<string>();
  const game = {
    seed,
    step: 0.5,
    x: 0,
    log: [] as string[],
    errs: [] as string[],
    advance(seconds: number) {
      const n = Math.max(1, Math.round(seconds / 0.5));
      for (let i = 0; i < n; i++) if (held.has("KeyD")) game.x += 1;
    },
    key(code: string, down: boolean) {
      if (down) held.add(code);
      else held.delete(code);
    },
    scenario(name: string) {
      if (name === "start") {
        game.x = 0;
        return true;
      }
      if (name === "never") return false;
      throw new Error(`unknown scenario "${name}"`);
    },
    action(name: string, args: number[]) {
      if (name === "teleport") return (game.x = args[0] ?? 0);
      if (name === "explode") return game.errs.push("boom");
      throw new Error(`unknown step or action "${name}"`);
    },
    view: () => ({ x: game.x, nested: { list: [game.x * 10] } }),
    describe: () => ({ x: game.x }),
    digest: () => `x${game.x}`,
    async shot(name: string) {
      game.log.push(name);
      return `build/shots/fake/${name}.png`;
    },
    errors: () => game.errs,
    now: () => 0,
  };
  return game;
}

describe("runScript", () => {
  it("holds a key, checks the change since a save and takes a shot", async () => {
    const g = fakeGame();
    const r = await runScript(g, {
      name: "walk",
      steps: [
        { do: "scenario", name: "start" },
        { do: "save", name: "a" },
        { do: "hold", code: "KeyD", seconds: 2, expect: "x", from: "a", eq: 4, shot: "end" },
        { expect: "nested.list.0", gte: 40 },
      ],
    });
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.got)).toEqual([4, 40]);
    expect(r.shots).toEqual(["build/shots/fake/walk-end.png"]);
    expect(r.digest).toBe("x4");
    expect(r.state).toEqual({ x: 4 });
  });

  it("calls a game action with its args", async () => {
    const r = await runScript(fakeGame(), { name: "a", steps: [{ do: "teleport", args: [7], expect: "x", eq: 7 }] });
    expect(r.ok).toBe(true);
  });

  it("stops at the first failed check and reports what it got", async () => {
    const g = fakeGame();
    const r = await runScript(g, {
      name: "f",
      steps: [{ do: "press", code: "KeyD", expect: "x", gt: 5 }, { do: "teleport", args: [9] }],
    });
    expect(r.ok).toBe(false);
    expect(r.failed).toMatchObject({ i: 0, got: 1 });
    expect(g.x).toBe(1);
  });

  it("fails on an unknown step, an impossible scenario, a wrong seed and a new console error", async () => {
    expect((await runScript(fakeGame(), { name: "u", steps: [{ do: "fly" }] })).failed).toMatchObject({ i: 0 });
    expect((await runScript(fakeGame(), { name: "s", steps: [{ do: "scenario", name: "never" }] })).failed).toMatchObject({ reason: 'scenario "never" is not possible here' });
    expect((await runScript(fakeGame(2), { name: "w", seed: 1, steps: [{ do: "advance" }] })).failed).toMatchObject({ reason: "written for seed 1; open ?seed=1" });
    const e = await runScript(fakeGame(), { name: "e", steps: [{ do: "explode" }, { do: "advance" }] });
    expect(e.failed).toMatchObject({ i: 0, reason: "console error", error: "boom" });
    expect(e.errors).toEqual(["boom"]);
  });

  it("compares eq and ne as JSON", async () => {
    const r = await runScript(fakeGame(), { name: "j", steps: [{ expect: "nested", eq: { list: [0] } }, { expect: "x", ne: 1 }] });
    expect(r.ok).toBe(true);
  });
});

describe("helpers", () => {
  it("at follows dots into objects and arrays", () => {
    expect(at({ a: [{ b: 3 }] }, "a.0.b")).toBe(3);
    expect(at({ a: 1 }, "a.b.c")).toBeUndefined();
  });

  it("rounded keeps three decimals", () => {
    expect(rounded({ p: [1.23456, -0.0004] })).toEqual({ p: [1.235, 0] });
  });
});
