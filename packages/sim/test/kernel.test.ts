import { describe, expect, it } from "vitest";
import { createSim, SimError, stateOne, field } from "../src/index.ts";
import type { Command, Sim, SystemDef } from "../src/index.ts";
import { LAB_SYSTEMS, lab, labData, noise } from "./helpers.ts";

function labSim(seed = 1): Sim {
  return createSim({ data: labData(), seed, systems: LAB_SYSTEMS });
}

const cmd = (tick: number, type: string, payload: Command["payload"]): Command => ({ tick, type, payload });

describe("ticks", () => {
  it("starts at tick 0 with the state its systems initialise from the data", () => {
    const sim = labSim();
    expect(sim.tick).toBe(0);
    expect(sim.systems).toEqual(["lab"]);
    expect(sim.read("totals")).toEqual([{ big: 0, flag: false, label: "fresh", small: 5 }]);
    expect(sim.read("things")).toEqual([]);
  });

  it("step(n) runs n whole ticks; step() runs one; step(0) runs none", () => {
    const sim = labSim();
    sim.step();
    expect(sim.tick).toBe(1);
    sim.step(9);
    expect(sim.tick).toBe(10);
    sim.step(0);
    expect(sim.tick).toBe(10);
    // The lab's tick writes the parity of the tick it ran in: the last one was tick 9.
    expect(sim.read("totals")[0]?.flag).toBe(true);
  });

  it("n steps of one tick and one step of n ticks give the same state", () => {
    const a = labSim();
    const b = labSim();
    for (const sim of [a, b]) sim.submit(cmd(3, "lab.make", { kind: "cog" }));
    for (let i = 0; i < 20; i += 1) a.step();
    b.step(20);
    expect(a.digest()).toBe(b.digest());
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it("refuses a step that is not a whole number of ticks: there is no dt", () => {
    const sim = labSim();
    for (const ticks of [0.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => sim.step(ticks)).toThrow(SimError);
    }
    expect(sim.tick).toBe(0);
  });

  it("runs systems in the order of the registry, whatever order the game lists them in", () => {
    const order: string[] = [];
    const first: SystemDef = { name: "first", tick: () => void order.push("first") };
    const second: SystemDef = { name: "second", tick: () => void order.push("second") };
    const sim = createSim({ data: { systems: ["second", "first"], tables: {} }, seed: 1, systems: [first, second] });
    sim.step(2);
    expect(order).toEqual(["first", "second", "first", "second"]);
    expect(sim.systems).toEqual(["first", "second"]);
  });
});

describe("commands", () => {
  it("apply at the start of their tick, before the systems, and not earlier", () => {
    const sim = labSim();
    expect(sim.submit(cmd(2, "lab.add", { amount: 10 }))).toEqual({ ok: true, seq: 0 });
    sim.step(2);
    expect(sim.read("totals")[0]?.small).toBe(5);
    const events = sim.step();
    expect(sim.read("totals")[0]?.small).toBe(15);
    expect(events).toEqual([{ tick: 2, type: "lab.added", payload: { amount: 10 } }]);
  });

  it("are ordered by tick, then by the order they were submitted in", () => {
    const sim = labSim();
    sim.submit(cmd(5, "lab.make", { kind: "axle" }));
    sim.submit(cmd(1, "lab.make", { kind: "cog" }));
    sim.submit(cmd(5, "lab.make", { kind: "cog" }));
    sim.submit(cmd(1, "lab.make", { kind: "axle" }));
    expect(sim.pending().map((c) => [c.tick, c.seq])).toEqual([[1, 1], [1, 3], [5, 0], [5, 2]]);
    sim.step(6);
    // Entity ids are given in the order the commands applied.
    expect(sim.read("things").map((row) => [row.id, row.kind])).toEqual([[1, "cog"], [2, "axle"], [3, "axle"], [4, "cog"]]);
    expect(sim.commandLog().map((c) => c.tick)).toEqual([1, 1, 5, 5]);
    expect(sim.pending()).toEqual([]);
  });

  it("never throw from outside: a command that cannot be accepted comes back with the reason", () => {
    const sim = labSim();
    sim.step(4);
    const refused: [unknown, RegExp][] = [
      [cmd(3, "lab.add", { amount: 1 }), /tick 3 is in the past \(the sim is at tick 4\)/],
      [cmd(4.5, "lab.add", { amount: 1 }), /not a non-negative integer/],
      [cmd(-1, "lab.add", { amount: 1 }), /not a non-negative integer/],
      [cmd(9, "lab.nope", {}), /unknown command type "lab.nope"/],
      [cmd(9, "lab.add", { amount: 1.5 }), /amount: 1.5 is not an integer/],
      [cmd(9, "lab.add", { amount: 1000001 }), /amount: 1000001 is outside \[-1000000, 1000000\]/],
      [cmd(9, "lab.add", {}), /the field "amount" is missing/],
      [cmd(9, "lab.add", { amount: 1, more: 2 }), /unknown field "more"/],
      [cmd(9, "lab.make", { kind: "gear" }), /"gear" is not a row of the data table "kinds"/],
      [cmd(9, "lab.fill", { amount: 1, bin: "Not An Id" }), /is not an id/],
      [{ tick: 9, type: "lab.add" }, /exactly the fields tick, type and payload/],
      [{ tick: 9, type: "lab.add", payload: { amount: 1 }, seq: 0 }, /exactly the fields tick, type and payload/],
      [{ tick: 9, type: 7, payload: {} }, /the type must be a string/],
      [null, /must be an object/],
      ["lab.add", /must be an object/],
      [[4, "lab.add", {}], /must be an object/],
    ];
    for (const [command, reason] of refused) {
      const result = sim.submit(command as Command);
      expect(result.ok, JSON.stringify(command)).toBe(false);
      if (!result.ok) expect(result.error).toMatch(reason);
    }
    expect(sim.pending()).toEqual([]);
    expect(sim.commandLog()).toEqual([]);
    expect(sim.submit(cmd(4, "lab.add", { amount: 1 })).ok).toBe(true);
  });

  it("keep their own copy of the payload: changing the object afterwards changes nothing", () => {
    const sim = labSim();
    const payload = { amount: 2 };
    sim.submit(cmd(0, "lab.add", payload));
    payload.amount = 900;
    sim.step();
    expect(sim.read("totals")[0]?.small).toBe(7);
  });

  it("cannot be changed through the lists the sim hands out", () => {
    const sim = labSim();
    sim.submit(cmd(2, "lab.add", { amount: 1 }));
    expect(() => void ((sim.pending()[0] as { tick: number }).tick = 0)).toThrow(TypeError);
    expect(() => void ((sim.commandLog()[0]?.payload as { amount: number }).amount = 99)).toThrow(TypeError);
    sim.pending().length = 0;
    const events = sim.step(3);
    expect(events).toEqual([{ tick: 2, type: "lab.added", payload: { amount: 1 } }]);
    expect(() => void ((events[0] as { tick: number }).tick = 0)).toThrow(TypeError);
  });

  it("that the state does not allow become a command.rejected event, and change nothing", () => {
    const sim = labSim();
    sim.submit(cmd(0, "lab.add", { amount: 1 }));
    const { seq } = sim.submit(cmd(0, "lab.add", { amount: 13 })) as { seq: number };
    sim.submit(cmd(0, "lab.scrap", { thing: 77 }));
    const events = sim.step();
    expect(events).toEqual([
      { tick: 0, type: "lab.added", payload: { amount: 1 } },
      { tick: 0, type: "command.rejected", payload: { command: "lab.add", reason: "unlucky", seq } },
      { tick: 0, type: "command.rejected", payload: { command: "lab.scrap", reason: "no-such-thing", seq: 2 } },
    ]);
    expect(sim.read("totals")[0]?.small).toBe(6);
  });
});

describe("events", () => {
  it("come back from step in order, each with the tick it happened in", () => {
    const sim = labSim();
    sim.submit(cmd(1, "lab.make", { kind: "cog" }));
    sim.submit(cmd(3, "lab.add", { amount: -4 }));
    sim.submit(cmd(3, "lab.make", { kind: "axle" }));
    expect(sim.step(5).map((event) => [event.tick, event.type])).toEqual([
      [1, "lab.made"],
      [3, "lab.added"],
      [3, "lab.made"],
    ]);
    expect(sim.step(5)).toEqual([]);
  });

  it("are checked against their declaration", () => {
    const bad: SystemDef = {
      ...lab,
      tick(ctx) {
        ctx.emit(lab.events?.[0] as never, { amount: 0.25 } as never);
      },
    };
    const sim = createSim({ data: labData(), seed: 1, systems: [bad] });
    expect(() => sim.step()).toThrow(/event "lab.added": amount: 0.25 is not an integer/);
  });
});

describe("state", () => {
  it("entities keep their ids, and ids are never reused", () => {
    const sim = labSim();
    for (const kind of ["cog", "axle", "cog"]) sim.submit(cmd(0, "lab.make", { kind }));
    sim.submit(cmd(1, "lab.scrap", { thing: 2 }));
    sim.submit(cmd(2, "lab.make", { kind: "axle" }));
    sim.step(3);
    expect(sim.read("things")).toEqual([
      { id: 1, kind: "cog", size: 2 },
      { id: 3, kind: "cog", size: 2 },
      { id: 4, kind: "axle", size: 7 },
    ]);
  });

  it("a map is kept and read by ascending key, whatever order its rows were put in", () => {
    const sim = labSim();
    for (const bin of ["pears", "apples", "zinc", "b-2", "b-10", "apples"]) sim.submit(cmd(0, "lab.fill", { amount: 3, bin }));
    sim.step();
    expect(sim.read("bins")).toEqual([
      { key: "apples", amount: 6 },
      { key: "b-10", amount: 3 },
      { key: "b-2", amount: 3 },
      { key: "pears", amount: 3 },
      { key: "zinc", amount: 3 },
    ]);
  });

  it("read gives copies: a host cannot change the sim through them", () => {
    const sim = labSim();
    const before = sim.digest();
    const rows = sim.read("totals");
    (rows[0] as Record<string, unknown>).small = 999;
    expect(sim.read("totals")[0]?.small).toBe(5);
    expect(sim.digest()).toBe(before);
    expect(() => sim.read("nope")).toThrow(SimError);
  });

  it.each(["float", "nan", "range", "string", "extra", "missing"])(
    "a system that leaves a bad value in the state (%s) stops the sim in that tick",
    (how) => {
      const sim = labSim();
      sim.step(2);
      sim.submit(cmd(2, "lab.corrupt", { how }));
      expect(() => sim.step()).toThrow(/state table "totals" after tick 2: row 0: /);
      // A stopped sim stays stopped: its state cannot be reached by any replay.
      expect(() => sim.step()).toThrow(/the sim stopped in tick 2/);
      expect(sim.submit(cmd(5, "lab.add", { amount: 1 }))).toMatchObject({ ok: false });
      expect(sim.tick).toBe(2);
    },
  );

  it("a system that throws, or returns a reason that is not an id, stops the sim too", () => {
    for (const [how, message] of [["throw", /a bug in a system/], ["reason", /apply must return nothing or a reason id/]] as const) {
      const sim = labSim();
      sim.submit(cmd(0, "lab.corrupt", { how }));
      expect(() => sim.step()).toThrow(message);
      expect(() => sim.step()).toThrow(/the sim stopped in tick 0/);
    }
  });

  it("a one-row table starts with zeros, and an id that init does not set is an error", () => {
    const table = stateOne("box", { level: field.int(3, 9), name: field.id, on: field.bool });
    const unset: SystemDef = { name: "unset", state: [table] };
    expect(() => createSim({ data: { systems: ["unset"], tables: {} }, seed: 1, systems: [unset] })).toThrow(
      /state table "box" after init: row 0: name: "" is not an id/,
    );
    const set: SystemDef = { name: "set", state: [table], init: (ctx) => void (ctx.one(table).name = "a") };
    const sim = createSim({ data: { systems: ["set"], tables: {} }, seed: 1, systems: [set] });
    // 0 is outside [3, 9], so the default is the nearest bound.
    expect(sim.read("box")).toEqual([{ level: 3, name: "a", on: false }]);
  });

  it("events cannot be emitted during init", () => {
    const eager: SystemDef = { ...lab, init: (ctx) => ctx.emit(lab.events?.[0] as never, { amount: 1 } as never) };
    expect(() => createSim({ data: labData(), seed: 1, systems: [eager] })).toThrow(/events can only be emitted during a tick/);
  });
});

describe("the random streams", () => {
  it("one stream per system, named after it, from @whz/det", async () => {
    const { createRng } = await import("@whz/det");
    const data = labData();
    data.systems = ["lab", "noise"];
    data.tables.noise = [{ id: "a", rolls: 2 }];
    const sim = createSim({ data, seed: 99, systems: LAB_SYSTEMS });
    expect(sim.rngState("noise")).toEqual(createRng(99, "noise").state());
    sim.step(3);
    const reference = createRng(99, "noise");
    let sum = 0;
    for (let i = 0; i < 6; i += 1) sum += reference.int(1000);
    expect(sim.read("noiseState")).toEqual([{ sum }]);
    expect(sim.rngState("noise")).toEqual(reference.state());
    // The lab drew nothing.
    expect(sim.rngState("lab")).toEqual(createRng(99, "lab").state());
    expect(() => sim.rngState("nope")).toThrow(SimError);
  });

  it("a system cannot fork or reseed its stream through the context type", () => {
    // Compile-time: SimRng has no fork, state or restore. This keeps "one stream per system".
    const system: SystemDef = {
      name: "typed",
      tick(ctx) {
        // @ts-expect-error fork is not part of SimRng
        void ctx.rng.fork;
      },
    };
    expect(system.name).toBe("typed");
    expect(noise.name).toBe("noise");
  });

  it("refuses a seed that is not an unsigned 32-bit integer", () => {
    for (const seed of [-1, 0.5, 4294967296, Number.NaN]) {
      expect(() => createSim({ data: labData(), seed, systems: LAB_SYSTEMS })).toThrow(/the seed must be an unsigned 32-bit integer/);
    }
  });
});

describe("describe", () => {
  it("gives the state as compact text", () => {
    const sim = labSim(7);
    sim.submit(cmd(0, "lab.make", { kind: "axle" }));
    sim.submit(cmd(0, "lab.make", { kind: "cog" }));
    sim.submit(cmd(0, "lab.fill", { amount: 4, bin: "ore" }));
    sim.submit(cmd(9, "lab.add", { amount: -2 }));
    sim.step(2);
    expect(sim.describe()).toBe(
      [
        `sim tick 2 seed 7 data ${sim.simDataHash} digest ${sim.digestHex()}`,
        "systems: lab",
        "bins (1 by key): key amount",
        "  ore 4",
        "things (2 by id): id kind size",
        "  1 axle 7",
        "  2 cog 2",
        "totals: big=0 flag=yes label=fresh small=5",
        "pending commands (1): tick seq type payload",
        "  9 3 lab.add amount=-2",
        "",
      ].join("\n"),
    );
  });

  it("cuts long tables and says how many rows it left out", () => {
    const sim = labSim();
    for (let i = 0; i < 5; i += 1) sim.submit(cmd(0, "lab.make", { kind: "cog" }));
    sim.step();
    const text = sim.describe({ maxRows: 2 });
    expect(text).toContain("things (5 by id): id kind size\n  1 cog 2\n  2 cog 2\n  ... 3 more\n");
  });
});
