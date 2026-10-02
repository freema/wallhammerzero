// One random stream per system: adding a stream, a system or a data row of one system never
// changes what another system draws. Without this, every content change would shift every
// roll in the game and no replay would survive it.

import { describe, expect, it } from "vitest";
import { createSim, ENGINE_SYSTEMS } from "../src/index.ts";
import type { Sim, SimData, SimEvent } from "../src/index.ts";
import { noise, shopData } from "./helpers.ts";

const TICKS = 400;
const WITH_NOISE = [...ENGINE_SYSTEMS, noise];

interface Trace {
  /** The stream state of the system after every tick. */
  readonly stream: string[];
  /** The digest of the system (its stream and its tables) after every tick. */
  readonly digests: string[];
  readonly events: SimEvent[];
  readonly sim: Sim;
}

function trace(data: SimData, system: string, systems = WITH_NOISE): Trace {
  const sim = createSim({ data, seed: 2026, systems });
  const stream: string[] = [];
  const digests: string[] = [];
  const events: SimEvent[] = [];
  for (let tick = 0; tick < TICKS; tick += 1) {
    events.push(...sim.step());
    stream.push(sim.rngState(system).join(","));
    digests.push(sim.digestParts().find((part) => part.system === system)?.digest ?? "");
  }
  return { stream, digests, events, sim };
}

describe("streams are independent", () => {
  it("adding an unrelated system with its own stream changes nothing in the shop", () => {
    const base = shopData();
    const more = shopData();
    more.systems = [...more.systems, "noise"];
    more.tables.noise = [{ id: "a", rolls: 3 }];

    for (const system of ["shop.arrivals", "shop.counter"]) {
      const before = trace(base, system);
      const after = trace(more, system);
      expect(after.stream, system).toEqual(before.stream);
      expect(after.digests, system).toEqual(before.digests);
      expect(after.events).toEqual(before.events);
    }
    // The new stream really was drawn from, and the whole-state digest does change.
    const after = trace(more, "noise");
    expect(new Set(after.stream).size).toBe(TICKS);
    expect(after.sim.read("noiseState")[0]?.sum).toBeGreaterThan(0);
    expect(after.sim.digest()).not.toBe(trace(base, "shop.arrivals").sim.digest());
  });

  it("the unrelated system drawing more or fewer numbers changes nothing in the shop", () => {
    const few = shopData();
    few.systems = [...few.systems, "noise"];
    few.tables.noise = [{ id: "a", rolls: 1 }];
    const many = shopData();
    many.systems = [...many.systems, "noise"];
    many.tables.noise = [{ id: "a", rolls: 9 }, { id: "b", rolls: 16 }, { id: "c", rolls: 0 }];

    for (const system of ["shop.arrivals", "shop.counter"]) {
      expect(trace(many, system).digests, system).toEqual(trace(few, system).digests);
    }
    expect(trace(many, "noise").stream).not.toEqual(trace(few, "noise").stream);
  });

  it("adding a data row to one system does not change another system's stream", () => {
    const base = shopData();
    const more = shopData();
    // A new item belongs to shop.counter: customers now want it, so the counter's own draws
    // and sales change. shop.arrivals must not notice.
    (more.tables.items as unknown[]).push({ id: "donut", price: 2, stock: 30, unitCost: 1, weight: 4 });

    const before = trace(base, "shop.arrivals");
    const after = trace(more, "shop.arrivals");
    expect(after.stream).toEqual(before.stream);

    // Same arrivals: the same customers of the same kinds come at the same ticks.
    const arrivals = (events: SimEvent[]): string[] =>
      events.filter((event) => event.type === "customer.arrived").map((event) => `${event.tick}:${String(event.payload.kind)}`);
    expect(arrivals(before.events).length).toBeGreaterThan(40);
    // The queue differs (the donut sells), so compare the arrival draws on a queue that never fills.
    const roomy = (data: ReturnType<typeof shopData>): SimData => {
      (data.tables.arrivals as { queueLimit: number }).queueLimit = 1000;
      return data;
    };
    const roomyMore = roomy(shopData());
    (roomyMore.tables.items as unknown[]).push({ id: "donut", price: 2, stock: 30, unitCost: 1, weight: 4 });
    expect(arrivals(trace(roomyMore, "shop.arrivals").events)).toEqual(arrivals(trace(roomy(shopData()), "shop.arrivals").events));

    // And the row did matter to its own system.
    expect(trace(more, "shop.counter").digests).not.toEqual(trace(base, "shop.counter").digests);
  });

  it("the streams of one seed differ from each other and between seeds", () => {
    const a = createSim({ data: shopData(), seed: 1 });
    const b = createSim({ data: shopData(), seed: 2 });
    expect(a.rngState("shop.arrivals")).not.toEqual(a.rngState("shop.counter"));
    expect(a.rngState("shop.arrivals")).not.toEqual(b.rngState("shop.arrivals"));
  });
});
