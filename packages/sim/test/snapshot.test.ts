// Snapshot and restore: a restored sim continues exactly as the original, a snapshot is
// canonical and versioned, and a bad one is refused without being half-loaded.

import { createRng } from "@whz/det";
import { describe, expect, it } from "vitest";
import { canonicalJson, createSim, restoreSim, runReplay, SimError, SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from "../src/index.ts";
import type { Command, Sim, SimEvent, Snapshot } from "../src/index.ts";
import { LAB_SYSTEMS, clone, goldenReplay, labData, shopData } from "./helpers.ts";

const cmd = (tick: number, type: string, payload: Command["payload"]): Command => ({ tick, type, payload });

/** Saves to canonical text and loads from it, as a save file would. */
function saveAndLoad(sim: Sim): Sim {
  const text = canonicalJson(sim.snapshot());
  return restoreSim({ data: shopData(), snapshot: JSON.parse(text) as unknown });
}

/** A shop session with commands spread over its ticks, as (tick, command) pairs. */
function script(seed: number, ticks: number): Command[] {
  const rng = createRng(seed, "script");
  const commands: Command[] = [];
  for (let tick = 0; tick < ticks; tick += rng.range(3, 25)) {
    const item = rng.pick(["apple", "bread", "cake"]);
    const roll = rng.int(4);
    if (roll === 0) commands.push(cmd(tick, "shop.set-price", { item, price: rng.range(1, 20) }));
    else if (roll === 1) commands.push(cmd(tick, "shop.restock", { amount: rng.range(1, 30), item }));
    else commands.push(cmd(tick, "shop.set-open", { open: roll === 2 }));
  }
  return commands;
}

describe("snapshot and restore", () => {
  it("snapshot → restore → continue gives the same digests and events as an uninterrupted run", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const commands = script(seed, 400);
      const straight = createSim({ data: shopData(), seed });
      let resumed = createSim({ data: shopData(), seed });
      for (const command of commands) {
        straight.submit(command);
        resumed.submit(command);
      }
      const digests: string[] = [];
      const events: SimEvent[] = [];
      for (let tick = 0; tick < 400; tick += 1) {
        events.push(...straight.step());
        digests.push(straight.digestHex());
      }
      const resumedDigests: string[] = [];
      const resumedEvents: SimEvent[] = [];
      for (let tick = 0; tick < 400; tick += 1) {
        // Interrupt at a few points, some of them with commands still queued.
        if (tick === 37 || tick === 150 || tick === 151 || tick === 399) resumed = saveAndLoad(resumed);
        resumedEvents.push(...resumed.step());
        resumedDigests.push(resumed.digestHex());
      }
      expect(resumedDigests).toEqual(digests);
      expect(resumedEvents).toEqual(events);
      expect(canonicalJson(resumed.snapshot())).toBe(canonicalJson(straight.snapshot()));
    }
  });

  it("heavy mode (save and load on every tick) gives the same digests and events", () => {
    for (const seed of [11, 12, 13]) {
      const commands = script(seed, 300);
      const straight = createSim({ data: shopData(), seed });
      let heavy = createSim({ data: shopData(), seed });
      for (const command of commands) {
        straight.submit(command);
        heavy.submit(command);
      }
      for (let tick = 0; tick < 300; tick += 1) {
        const expected = straight.step();
        const actual = heavy.step();
        heavy = saveAndLoad(heavy);
        expect(actual).toEqual(expected);
        expect(heavy.digest(), `seed ${seed}, tick ${tick}`).toBe(straight.digest());
      }
    }
  });

  it("the golden replay gives its stored digests in heavy mode", () => {
    const replay = goldenReplay();
    const run = runReplay({ data: shopData(), replay, heavy: true });
    expect(run.digests).toEqual(replay.digests);
    expect(run.finalDigest).toBe(replay.finalDigest);
  });

  it("commands submitted after a restore are ordered after the ones queued before it", () => {
    const original = createSim({ data: shopData(), seed: 3 });
    original.submit(cmd(10, "shop.set-price", { item: "apple", price: 5 }));
    original.step(4);
    const restored = saveAndLoad(original);
    expect(restored.pending()).toEqual(original.pending());
    for (const sim of [original, restored]) {
      expect(sim.submit(cmd(10, "shop.set-price", { item: "apple", price: 9 }))).toEqual({ ok: true, seq: 1 });
      sim.step(10);
      expect(sim.read("shelf")[0]).toMatchObject({ key: "apple", price: 9 });
    }
    expect(restored.digest()).toBe(original.digest());
    // The log of a restored sim is the tail since the snapshot: what a save needs next to it.
    expect(restored.commandLog()).toEqual([cmd(10, "shop.set-price", { item: "apple", price: 9 })]);
    expect(original.commandLog()).toHaveLength(2);
  });

  it("a snapshot is plain data with a version, and its canonical text is stable", () => {
    const sim = createSim({ data: shopData(), seed: 8 });
    sim.submit(cmd(90, "shop.set-open", { open: false }));
    sim.step(60);
    const snapshot = sim.snapshot();
    expect(snapshot).toMatchObject({ format: SNAPSHOT_FORMAT, version: SNAPSHOT_VERSION, seed: 8, tick: 60, simDataHash: sim.simDataHash });
    expect(Object.keys(snapshot.tables).sort()).toEqual(["customers", "door", "shelf", "till"]);
    expect(Object.keys(snapshot.rng).sort()).toEqual(["shop.arrivals", "shop.counter"]);
    expect(snapshot.pending).toEqual([{ tick: 90, seq: 0, type: "shop.set-open", payload: { open: false } }]);
    const text = canonicalJson(snapshot);
    expect(text).toBe(canonicalJson(JSON.parse(text)));
    expect(text).toBe(canonicalJson(saveAndLoad(sim).snapshot()));
    expect(text).not.toMatch(/\s|\d\.\d/); // no whitespace, no fractions
    // Taking a snapshot does not disturb the sim, and the snapshot does not alias its state.
    const before = sim.digest();
    (snapshot.tables.till as Record<string, unknown>[])[0]!.money = 1000000;
    expect(sim.digest()).toBe(before);
  });

  it("restores a state table of every shape and field type", () => {
    const sim = createSim({ data: labData(), seed: 21, systems: LAB_SYSTEMS });
    sim.submit(cmd(0, "lab.make", { kind: "axle" }));
    sim.submit(cmd(0, "lab.fill", { amount: 5, bin: "ore" }));
    sim.submit(cmd(0, "lab.add", { amount: -123456 }));
    sim.submit(cmd(7, "lab.make", { kind: "cog" }));
    sim.step(3);
    const restored = restoreSim({ data: labData(), snapshot: clone(sim.snapshot()), systems: LAB_SYSTEMS });
    expect(restored.encodeState()).toEqual(sim.encodeState());
    expect(restored.describe()).toBe(sim.describe());
    sim.step(10);
    restored.step(10);
    expect(restored.digest()).toBe(sim.digest());
  });
});

describe("a snapshot that cannot be trusted is refused", () => {
  const good = (): Snapshot => {
    const sim = createSim({ data: shopData(), seed: 8 });
    sim.submit(cmd(90, "shop.set-open", { open: false }));
    sim.submit(cmd(95, "shop.set-open", { open: true }));
    sim.step(60);
    return clone(sim.snapshot());
  };
  type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  const broken: [string, (snapshot: Loose) => void, RegExp][] = [
    ["another version", (s) => void (s.version = SNAPSHOT_VERSION + 1), /snapshot: version 2, and this sim reads version 1/],
    ["another format", (s) => void (s.format = "save"), /the format is not "whz-sim-snapshot"/],
    ["other sim data", (s) => void (s.simDataHash = "0000000000000000"), /it was taken with sim data "0000000000000000"/],
    ["an unknown field", (s) => void (s.extra = 1), /the fields must be exactly/],
    ["a missing field", (s) => void delete s.nextSeq, /the fields must be exactly/],
    ["a bad seed", (s) => void (s.seed = -1), /the seed is not an unsigned 32-bit integer/],
    ["a float tick", (s) => void (s.tick = 60.5), /tick is not a non-negative integer/],
    ["a float in a table", (s) => void (s.tables.till[0].money = 0.1), /state table "till": row 0: money: 0.1 is not an integer/],
    ["a value out of bounds", (s) => void (s.tables.till[0].busy = -1), /state table "till": row 0: busy: -1 is outside/],
    ["a missing table", (s) => void delete s.tables.shelf, /the state table "shelf" is missing/],
    ["an unknown table", (s) => void (s.tables.vault = []), /no system in use has a state table "vault"/],
    ["an unknown field in a row", (s) => void (s.tables.door[0].ajar = true), /state table "door": row 0: unknown field "ajar"/],
    ["two rows in a one-row table", (s) => void s.tables.door.push(s.tables.door[0]), /a one-row table must have exactly one row, not 2/],
    ["map rows out of order", (s) => void s.tables.shelf.reverse(), /state table "shelf": row 1: the key "bread" is not above the one before it/],
    ["a duplicate entity id", (s) => void (s.tables.customers = [{ id: 1, budget: 3, kind: "student", patience: 2 }, { id: 1, budget: 3, kind: "student", patience: 2 }]), /row 1: the id 1 is not above the one before it/],
    ["an entity id the sim never gave out", (s) => void (s.tables.customers = [{ id: s.nextId, budget: 3, kind: "student", patience: 2 }]), /is not an entity id the sim gave out/],
    ["a dangling ref", (s) => void (s.tables.customers = [{ id: 1, budget: 3, kind: "ghost", patience: 2 }]), /kind: "ghost" is not a row of the data table "customerKinds"/],
    ["a missing stream", (s) => void delete s.rng["shop.counter"], /rng must hold one stream state per system in use/],
    ["a broken stream state", (s) => void (s.rng["shop.counter"] = [1, 2, 3]), /the rng state of "shop.counter" is not four unsigned 32-bit integers/],
    ["a pending command in the past", (s) => void (s.pending[0].tick = 3), /pending command 0: tick 3 is in the past/],
    ["pending commands out of order", (s) => void s.pending.reverse(), /pending command 1 is not after command 0/],
    ["a pending command with a bad payload", (s) => void (s.pending[0].payload = { open: 1 }), /pending command 0: payload of shop.set-open: open: 1 is not a boolean/],
    ["a pending seq that was never given", (s) => void (s.pending[1].seq = 2), /seq is not below nextSeq/],
    ["something that is not a snapshot", (s) => void Object.keys(s).forEach((key) => delete s[key]), /the seed is not an unsigned 32-bit integer/],
  ];
  it.each(broken)("%s", (_name, change, message) => {
    const snapshot = good() as Loose;
    change(snapshot);
    expect(() => restoreSim({ data: shopData(), snapshot })).toThrow(message);
    expect(() => restoreSim({ data: shopData(), snapshot })).toThrow(SimError);
  });

  it("an untouched one restores", () => {
    expect(restoreSim({ data: shopData(), snapshot: good() }).tick).toBe(60);
    for (const junk of [null, 7, "snapshot", []]) {
      expect(() => restoreSim({ data: shopData(), snapshot: junk })).toThrow(SimError);
    }
  });

  it("a snapshot is refused when the game data changed since it was taken", () => {
    const data = shopData();
    (data.tables.items as { price: number }[])[0]!.price = 4;
    expect(() => restoreSim({ data, snapshot: good() })).toThrow(/it was taken with sim data/);
  });
});
