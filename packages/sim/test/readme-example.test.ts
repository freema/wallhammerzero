// The system in README.md ("Writing a system"), kept honest: if this file needs a change, the
// README needs the same one.

import { describe, expect, it } from "vitest";
import { command, createSim, dataRows, event, field, stateMap, stateOne } from "../src/index.ts";
import type { SystemDef } from "../src/index.ts";

const crops = dataRows("crops", { growTicks: field.int(1, 10000), price: field.int(1, 100000) });
const barn = stateOne("barn", { money: field.int(0, Number.MAX_SAFE_INTEGER) });
const plots = stateMap("plots", { age: field.count, crop: field.ref("crops") });
const harvested = event("farm.harvested", { crop: field.ref("crops"), plot: field.id });

const plant = command("farm.plant", { crop: field.ref("crops"), plot: field.id }, (ctx, payload) => {
  if (ctx.get(plots, payload.plot) !== undefined) return "plot-in-use";
  ctx.put(plots, payload.plot, { age: 0, crop: payload.crop });
  return undefined;
});

const farm: SystemDef = {
  name: "farm",
  data: [crops],
  state: [barn, plots],
  commands: [plant],
  events: [harvested],
  init(ctx) {
    ctx.one(barn).money = 10;
  },
  tick(ctx) {
    for (const plot of ctx.all(plots)) {
      plot.age += 1;
      const crop = ctx.row(crops, plot.crop);
      if (plot.age < crop.growTicks) continue;
      ctx.one(barn).money += crop.price + ctx.rng.range(0, 2);
      ctx.remove(plots, plot.key);
      ctx.emit(harvested, { crop: plot.crop, plot: plot.key });
    }
  },
};

describe("the README's example system", () => {
  const data = { systems: ["farm"], tables: { crops: [{ id: "wheat", growTicks: 3, price: 5 }, { id: "corn", growTicks: 5, price: 9 }] } };

  it("plants, grows, harvests and rejects a plot in use", () => {
    const sim = createSim({ data, seed: 1, systems: [farm] });
    sim.submit({ tick: 0, type: "farm.plant", payload: { crop: "wheat", plot: "north" } });
    sim.submit({ tick: 0, type: "farm.plant", payload: { crop: "corn", plot: "south" } });
    sim.submit({ tick: 1, type: "farm.plant", payload: { crop: "corn", plot: "north" } });
    const events = sim.step(6);
    expect(events.map((e) => [e.tick, e.type, e.payload.plot ?? e.payload.reason])).toEqual([
      [1, "command.rejected", "plot-in-use"],
      [2, "farm.harvested", "north"],
      [4, "farm.harvested", "south"],
    ]);
    const money = sim.read("barn")[0]?.money as number;
    expect(money).toBeGreaterThanOrEqual(10 + 5 + 9);
    expect(money).toBeLessThanOrEqual(10 + 5 + 9 + 4);
    expect(sim.read("plots")).toEqual([]);
    expect(sim.describe()).toContain("plots (0 by key): key age crop");
  });
});
