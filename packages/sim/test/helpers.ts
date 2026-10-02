// Shared by the tests: the golden counter-shop data, and a small system set made for the
// tests (every table shape, every field type, commands that misbehave on request).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { command, dataRecord, dataRows, event, field, stateEntities, stateMap, stateOne } from "../src/index.ts";
import type { Replay, SimData, SystemDef } from "../src/index.ts";

export const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export const GOLDEN_DATA_FILE = here("../golden/counter-shop.data.json");
export const GOLDEN_REPLAY_FILE = here("../golden/counter-shop.replay.json");

/** Sim data a test may change before it creates a sim. */
export interface LooseData extends SimData {
  systems: string[];
  tables: Record<string, unknown>;
}

/** A fresh copy of the golden counter-shop sim data. */
export function shopData(): LooseData {
  return JSON.parse(readFileSync(GOLDEN_DATA_FILE, "utf8")) as LooseData;
}

export function goldenReplay(): Replay {
  return JSON.parse(readFileSync(GOLDEN_REPLAY_FILE, "utf8")) as Replay;
}

/** A deep copy of plain data. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// --- the "lab" systems -------------------------------------------------------------------

export const labConfig = dataRecord("lab", { start: field.int(-1000, 1000) });
export const labKinds = dataRows("kinds", { size: field.int(1, 9) });

export const totals = stateOne("totals", {
  big: field.int(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
  flag: field.bool,
  label: field.id,
  small: field.i32,
});
export const things = stateEntities("things", { kind: field.ref("kinds"), size: field.int(0, 100) });
export const bins = stateMap("bins", { amount: field.count });

export const added = event("lab.added", { amount: field.i32 });
export const made = event("lab.made", { thing: field.count });

export const add = command("lab.add", { amount: field.int(-1000000, 1000000) }, (ctx, payload) => {
  if (payload.amount === 13) return "unlucky";
  const row = ctx.one(totals);
  row.small += payload.amount;
  row.big += payload.amount * 4294967296;
  ctx.emit(added, { amount: payload.amount });
  return undefined;
});

export const make = command("lab.make", { kind: field.ref("kinds") }, (ctx, payload) => {
  const thing = ctx.spawn(things, { kind: payload.kind, size: ctx.row(labKinds, payload.kind).size });
  ctx.emit(made, { thing: thing.id });
  return undefined;
});

export const scrap = command("lab.scrap", { thing: field.count }, (ctx, payload) => {
  return ctx.remove(things, payload.thing) ? undefined : "no-such-thing";
});

export const fill = command("lab.fill", { amount: field.int(1, 100), bin: field.id }, (ctx, payload) => {
  const row = ctx.get(bins, payload.bin);
  ctx.put(bins, payload.bin, { amount: (row?.amount ?? 0) + payload.amount });
  return undefined;
});

/** Puts a value that is not allowed into the state: the kernel must stop the sim. */
export const corrupt = command("lab.corrupt", { how: field.id }, (ctx, payload) => {
  const row = ctx.one(totals) as Record<string, unknown>;
  if (payload.how === "float") row.small = 0.5;
  else if (payload.how === "nan") row.small = Number.NaN;
  else if (payload.how === "range") row.small = 2147483648;
  else if (payload.how === "string") row.small = "7";
  else if (payload.how === "extra") row.extra = 1;
  else if (payload.how === "missing") delete row.label;
  else if (payload.how === "reason") return "Not An Id";
  else if (payload.how === "throw") throw new TypeError("a bug in a system");
  return undefined;
});

export const lab: SystemDef = {
  name: "lab",
  data: [labConfig, labKinds],
  state: [totals, things, bins],
  commands: [add, make, scrap, fill, corrupt],
  events: [added, made],
  init(ctx) {
    const row = ctx.one(totals);
    row.small = ctx.config(labConfig).start;
    row.label = "fresh";
  },
  tick(ctx) {
    ctx.one(totals).flag = ctx.tick % 2 === 1;
  },
};

/** A system that only draws random numbers: `rolls` per tick, summed into its own table. */
export const noiseConfig = dataRows("noise", { rolls: field.int(0, 16) });
export const noiseState = stateOne("noiseState", { sum: field.int(0, Number.MAX_SAFE_INTEGER) });
export const noise: SystemDef = {
  name: "noise",
  data: [noiseConfig],
  state: [noiseState],
  tick(ctx) {
    const row = ctx.one(noiseState);
    for (const entry of ctx.table(noiseConfig)) {
      for (let i = 0; i < entry.rolls; i += 1) row.sum += ctx.rng.int(1000);
    }
  },
};

export const LAB_SYSTEMS: readonly SystemDef[] = [lab, noise];

export function labData(): LooseData {
  return {
    systems: ["lab"],
    tables: {
      lab: { start: 5 },
      kinds: [
        { id: "cog", size: 2 },
        { id: "axle", size: 7 },
      ],
    },
  };
}
