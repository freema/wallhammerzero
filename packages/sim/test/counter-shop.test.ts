// The toy system set: what it does, and its design-intent invariants run headless over long
// sessions (research/game-creator.md §7.1 item 2, adapted: nothing grows without bound, an
// idle shop sells out and stalls, a tended shop earns).

import { describe, expect, it } from "vitest";
import { createSim } from "../src/index.ts";
import type { Command, Sim, SimEvent } from "../src/index.ts";
import { shopData } from "./helpers.ts";

const cmd = (tick: number, type: string, payload: Command["payload"]): Command => ({ tick, type, payload });
const shop = (seed = 1): Sim => createSim({ data: shopData(), seed });
const till = (sim: Sim) => sim.read("till")[0] as { busy: number; money: number; sales: number; served: number };
const door = (sim: Sim) => sim.read("door")[0] as { arrived: number; gaveUp: number; open: boolean; turnedAway: number };
const shelf = (sim: Sim, item: string) => sim.read("shelf").find((row) => row.key === item) as { price: number; sold: number; stock: number };
const ofType = (events: SimEvent[], type: string): SimEvent[] => events.filter((event) => event.type === type);

describe("counter-shop", () => {
  it("starts from its data: an open door, full shelves, the starting money", () => {
    const sim = shop();
    expect(door(sim)).toEqual({ arrived: 0, gaveUp: 0, open: true, turnedAway: 0 });
    expect(till(sim)).toEqual({ busy: 0, money: 20, sales: 0, served: 0 });
    expect(sim.read("shelf")).toEqual([
      { key: "apple", price: 3, sold: 0, stock: 20 },
      { key: "bread", price: 6, sold: 0, stock: 12 },
      { key: "cake", price: 15, sold: 0, stock: 4 },
    ]);
    expect(sim.read("customers")).toEqual([]);
  });

  it("customers arrive at random and buy; money grows by exactly what was sold", () => {
    const sim = shop(4);
    const events = sim.step(300);
    const sales = ofType(events, "sale");
    expect(ofType(events, "customer.arrived").length).toBeGreaterThan(30);
    expect(sales.length).toBeGreaterThan(10);
    const income = sales.reduce((sum, event) => sum + (event.payload.price as number), 0);
    expect(till(sim).money).toBe(20 + income);
    expect(till(sim).sales).toBe(sales.length);
    // Every customer who arrived is in the queue, was served, or gave up.
    expect(door(sim).arrived).toBe(sim.read("customers").length + till(sim).served + door(sim).gaveUp);
    expect(till(sim).served).toBe(sales.length + ofType(events, "customer.left").length);
  });

  it("the first in line is served first, one customer per serviceTicks", () => {
    const sim = shop(4);
    const events = sim.step(300);
    const served = events.filter((event) => event.type === "sale" || event.type === "customer.left");
    const ids = served.map((event) => event.payload.customer as number);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    for (let i = 1; i < served.length; i += 1) {
      expect((served[i] as SimEvent).tick - (served[i - 1] as SimEvent).tick).toBeGreaterThanOrEqual(3);
    }
  });

  it("a command changes the price, and customers pay the new price from that tick on", () => {
    const sim = shop(4);
    sim.submit(cmd(100, "shop.set-price", { item: "apple", price: 5 }));
    const events = sim.step(300);
    expect(ofType(events, "price.changed")).toEqual([{ tick: 100, type: "price.changed", payload: { item: "apple", price: 5 } }]);
    const apples = ofType(events, "sale").filter((event) => event.payload.item === "apple");
    expect(apples.length).toBeGreaterThan(5);
    for (const event of apples) expect(event.payload.price).toBe(event.tick < 100 ? 3 : 5);
    expect(shelf(sim, "apple").price).toBe(5);
  });

  it("a price above every budget sells nothing", () => {
    const sim = shop(4);
    for (const item of ["apple", "bread", "cake"]) sim.submit(cmd(0, "shop.set-price", { item, price: 41 }));
    const events = sim.step(300);
    expect(ofType(events, "sale")).toEqual([]);
    expect(ofType(events, "customer.left").every((event) => event.payload.reason === "too-expensive")).toBe(true);
    expect(till(sim).money).toBe(20);
  });

  it("restocking costs money, and is rejected when the till cannot pay", () => {
    const sim = shop(4);
    sim.submit(cmd(0, "shop.restock", { amount: 5, item: "bread" })); // 15 of the 20
    sim.submit(cmd(0, "shop.restock", { amount: 1, item: "cake" })); // 8, and only 5 are left
    const events = sim.step();
    expect(events.slice(0, 2)).toEqual([
      { tick: 0, type: "shelf.restocked", payload: { amount: 5, cost: 15, item: "bread" } },
      { tick: 0, type: "command.rejected", payload: { command: "shop.restock", reason: "not-enough-money", seq: 1 } },
    ]);
    expect(shelf(sim, "bread").stock).toBe(17);
    expect(shelf(sim, "cake").stock).toBe(4);
    expect(till(sim).money).toBe(5);
  });

  it("a closed door turns customers away, and no change is a rejected command", () => {
    const sim = shop(4);
    sim.submit(cmd(0, "shop.set-open", { open: false }));
    sim.submit(cmd(50, "shop.set-open", { open: false }));
    const events = sim.step(100);
    expect(ofType(events, "customer.arrived")).toEqual([]);
    expect(ofType(events, "customer.turned-away").length).toBe(door(sim).turnedAway);
    expect(door(sim).turnedAway).toBeGreaterThan(5);
    expect(ofType(events, "command.rejected")).toEqual([
      { tick: 50, type: "command.rejected", payload: { command: "shop.set-open", reason: "no-change", seq: 1 } },
    ]);
  });

  it("customers who wait too long give up", () => {
    const data = shopData();
    (data.tables.shop as { serviceTicks: number }).serviceTicks = 60;
    const sim = createSim({ data, seed: 4 });
    const events = sim.step(400);
    expect(ofType(events, "customer.gave-up").length).toBe(door(sim).gaveUp);
    expect(door(sim).gaveUp).toBeGreaterThan(10);
  });
});

describe("design-intent invariants, over ten thousand ticks", () => {
  const TICKS = 10000;

  it("nothing grows without bound, and no number goes negative", () => {
    for (const seed of [1, 2, 3]) {
      const sim = shop(seed);
      for (let tick = 0; tick < TICKS; tick += 100) {
        sim.submit(cmd(tick, "shop.restock", { amount: 10, item: "apple" }));
        sim.step(100);
        expect(sim.read("customers").length).toBeLessThanOrEqual(6); // queueLimit
        expect(till(sim).money).toBeGreaterThanOrEqual(0);
        for (const row of sim.read("shelf")) expect(row.stock as number).toBeGreaterThanOrEqual(0);
      }
      const { arrived, gaveUp, turnedAway } = door(sim);
      expect(arrived + turnedAway).toBeGreaterThan(TICKS / 10);
      expect(gaveUp).toBeLessThan(arrived);
    }
  });

  it("an idle shop sells out and then stalls: no income without restocking", () => {
    const sim = shop(9);
    sim.step(TICKS / 2);
    const money = till(sim).money;
    expect(sim.read("shelf").every((row) => row.stock === 0)).toBe(true);
    expect(money).toBe(20 + 20 * 3 + 12 * 6 + 4 * 15);
    const later = sim.step(TICKS / 2);
    expect(till(sim).money).toBe(money);
    expect(ofType(later, "sale")).toEqual([]);
  });

  it("a shop that restocks from its income out-earns the idle one", () => {
    const sim = shop(9);
    for (let tick = 50; tick < TICKS; tick += 50) {
      for (const item of ["apple", "bread"]) sim.submit(cmd(tick, "shop.restock", { amount: 4, item }));
    }
    sim.step(TICKS);
    expect(till(sim).money).toBeGreaterThan(2 * (20 + 20 * 3 + 12 * 6 + 4 * 15));
  });
});
