// The fuzz test: 1,000 random command sequences, valid and garbage, against the counter shop.
// The sim must never throw and never hold anything but integers, booleans and ids; and the
// commands it accepted must replay to the same digest.

import { createRng } from "@whz/det";
import type { Rng } from "@whz/det";
import { describe, expect, it } from "vitest";
import { canonicalJson, createSim, isId, restoreSim, runReplay } from "../src/index.ts";
import type { Command, Sim } from "../src/index.ts";
import { shopData } from "./helpers.ts";

const SEQUENCES = 1000;
const TYPES = ["shop.set-price", "shop.restock", "shop.set-open"];
const ITEMS = ["apple", "bread", "cake"];

/** An integer that is sometimes ordinary and sometimes at or beyond a bound. */
function wildInt(rng: Rng): number {
  const edges = [0, 1, -1, 1000, 1001, 100000, 100001, 2147483647, 2147483648, -2147483649, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
  return rng.chance(1, 4) ? rng.pick(edges) : rng.range(-5, 60);
}

/** Something that is not what the field wants. */
function junk(rng: Rng): unknown {
  const values = [0.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY, -0, 2 ** 53, 1e308, null, undefined, "", "7", "Apple", "not an id", "ěščř", true, [], [1], {}, { tick: 1 }];
  return rng.pick(values);
}

/** A command of a known type whose payload is well-formed, though maybe out of range. */
function shapedCommand(rng: Rng, now: number): Command {
  const tick = now + (rng.chance(3, 4) ? 0 : rng.int(40));
  const type = rng.pick(TYPES);
  if (type === "shop.set-price") return { tick, type, payload: { item: rng.pick(ITEMS), price: wildInt(rng) } };
  if (type === "shop.restock") return { tick, type, payload: { amount: wildInt(rng), item: rng.pick(ITEMS) } };
  return { tick, type, payload: { open: rng.chance(1, 2) } };
}

/** A command with something broken in it: a field, the tick, the type, or the whole thing. */
function garbageCommand(rng: Rng, now: number): unknown {
  const base = shapedCommand(rng, now) as unknown as Record<string, unknown>;
  switch (rng.int(8)) {
    case 0:
      return junk(rng);
    case 1:
      return { ...base, tick: junk(rng) };
    case 2:
      return { ...base, tick: now - 1 - rng.int(5) };
    case 3:
      return { ...base, type: rng.chance(1, 2) ? "shop.fly" : junk(rng) };
    case 4:
      return { ...base, payload: junk(rng) };
    case 5: {
      const payload = { ...(base.payload as Record<string, unknown>) };
      const keys = Object.keys(payload);
      payload[rng.pick(keys)] = junk(rng);
      return { ...base, payload };
    }
    case 6:
      return { ...base, payload: { ...(base.payload as Record<string, unknown>), [rng.pick(["extra", "id", "__proto__x"])]: wildInt(rng) } };
    default: {
      const { payload: _payload, ...rest } = base;
      return rng.chance(1, 2) ? rest : { ...base, seq: 1 };
    }
  }
}

/** Every number below `value` must be a safe integer, every string printable ASCII. */
function assertIntegersOnly(value: unknown, path: string): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${path} is ${value}`);
  } else if (typeof value === "string") {
    if (!/^[\x20-\x7e]*$/.test(value)) throw new Error(`${path} is not ASCII`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertIntegersOnly(item, `${path}[${index}]`));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) assertIntegersOnly(item, `${path}.${key}`);
  } else if (typeof value !== "boolean") {
    throw new Error(`${path} is a ${typeof value}`);
  }
}

function assertStateIsClean(sim: Sim): void {
  assertIntegersOnly(sim.snapshot(), "snapshot");
  for (const table of sim.tables()) {
    for (const row of sim.read(table.name)) {
      for (const [name, value] of Object.entries(row)) {
        const ok = typeof value === "boolean" || (typeof value === "number" && Number.isSafeInteger(value)) || isId(value);
        if (!ok) throw new Error(`${table.name}.${name} is ${String(value)}`);
      }
    }
  }
  const till = sim.read("till")[0] as { money: number };
  if (till.money < 0) throw new Error(`money is ${till.money}`);
  for (const row of sim.read("shelf")) {
    if ((row.stock as number) < 0 || (row.price as number) < 1) throw new Error(`shelf ${String(row.key)} is ${JSON.stringify(row)}`);
  }
}

describe("fuzz", () => {
  it(`${SEQUENCES} random command sequences never throw and never leave a non-integer in the state`, () => {
    const data = shopData();
    let accepted = 0;
    let refused = 0;
    let rejectedEvents = 0;
    let ticks = 0;

    for (let sequence = 0; sequence < SEQUENCES; sequence += 1) {
      const rng = createRng(sequence, "fuzz");
      const seed = rng.next();
      let sim = createSim({ data, seed });
      const session: Command[] = [];
      let restored = false;
      const rounds = rng.range(5, 40);
      for (let round = 0; round < rounds; round += 1) {
        const commands = rng.int(4);
        for (let i = 0; i < commands; i += 1) {
          const garbage = rng.chance(1, 3);
          const command = garbage ? garbageCommand(rng, sim.tick) : shapedCommand(rng, sim.tick);
          const result = sim.submit(command as Command);
          if (result.ok) session.push(command as Command);
          else {
            refused += 1;
            expect(typeof result.error).toBe("string");
          }
        }
        const steps = rng.int(8);
        const events = sim.step(steps);
        ticks += steps;
        rejectedEvents += events.filter((event) => event.type === "command.rejected").length;
        assertIntegersOnly(events, "events");
        assertStateIsClean(sim);
        // Now and then, go through a save: the fuzzed state must survive it.
        if (rng.chance(1, 10)) {
          const before = sim.digest();
          sim = restoreSim({ data, snapshot: JSON.parse(canonicalJson(sim.snapshot())) as unknown });
          expect(sim.digest()).toBe(before);
          restored = true;
        }
      }
      accepted += session.length;

      // What the sim accepted is a valid replay of the whole session.
      const replayed = runReplay({ data, replay: { seed, commands: session, ticks: sim.tick, digestEvery: 1000 } });
      expect(replayed.finalDigest, `sequence ${sequence}`).toBe(sim.digestHex());
      // And the sim's own log is that session, in the order the commands applied.
      if (!restored) {
        const inOrder = session.map((command, index) => ({ command, index }));
        inOrder.sort((a, b) => a.command.tick - b.command.tick || a.index - b.index);
        // Compared as canonical text: the log holds canonical copies (a tick of -0 is logged as 0).
        expect(canonicalJson(sim.commandLog())).toBe(canonicalJson(inOrder.map((entry) => entry.command)));
      }
    }

    // The fuzz reached all three outcomes, many times.
    expect(ticks).toBeGreaterThan(50000);
    expect(accepted).toBeGreaterThan(5000);
    expect(refused).toBeGreaterThan(5000);
    expect(rejectedEvents).toBeGreaterThan(500);
  });
});
