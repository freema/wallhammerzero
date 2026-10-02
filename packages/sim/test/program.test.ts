// Declarations and game data: everything wrong is found before the first tick, with a message
// that names the place.

import { describe, expect, it } from "vitest";
import {
  command,
  createSim,
  dataRecord,
  dataRows,
  ENGINE_SYSTEMS,
  event,
  field,
  hashSimData,
  isId,
  isName,
  SimError,
  stateEntities,
  stateMap,
  stateOne,
} from "../src/index.ts";
import type { SimData, SystemDef } from "../src/index.ts";
import { LAB_SYSTEMS, clone, labData, shopData } from "./helpers.ts";

function failure(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SimError);
    return (error as Error).message;
  }
  throw new Error("expected a SimError");
}

const withSystems = (systems: SystemDef[], tables: Record<string, unknown> = {}): string =>
  failure(() => createSim({ data: { systems: systems.map((s) => s.name), tables }, seed: 1, systems }));

describe("ids and names", () => {
  it("an id is lowercase ASCII groups joined by . - _", () => {
    for (const good of ["a", "apple", "shop.set-price", "tier_2", "a1.b2-c3", "x".repeat(64)]) expect(isId(good), good).toBe(true);
    for (const bad of ["", "Apple", "1up", "a..b", "a.", ".a", "a b", "jablíčko", "a/b", "x".repeat(65), 7, null]) {
      expect(isId(bad), String(bad)).toBe(false);
    }
  });

  it("a table or field name is a camelCase identifier", () => {
    for (const good of ["a", "budgetMin", "x2"]) expect(isName(good), good).toBe(true);
    for (const bad of ["", "Budget", "budget_min", "budget-min", "2x", "a.b"]) expect(isName(bad), bad).toBe(false);
  });
});

describe("game data", () => {
  it("the golden counter-shop data loads on the engine registry", () => {
    const sim = createSim({ data: shopData(), seed: 1 });
    expect(sim.systems).toEqual(ENGINE_SYSTEMS.map((system) => system.name));
    expect(sim.simDataHash).toBe(hashSimData(shopData()));
    expect(sim.simDataHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("the hash covers the content, not the layout of the JSON", () => {
    const data = shopData();
    const reordered: SimData = { tables: Object.fromEntries(Object.entries(data.tables).reverse()), systems: data.systems };
    expect(hashSimData(reordered)).toBe(hashSimData(data));
    const pricier = shopData();
    (pricier.tables.items as { price: number }[])[0]!.price += 1;
    expect(hashSimData(pricier)).not.toBe(hashSimData(data));
  });

  const broken: [string, (data: ReturnType<typeof shopData>) => void, RegExp][] = [
    ["an unknown system", (d) => void (d.systems = ["shop.arrivals", "shop.banana"]), /unknown system "shop.banana" \(the engine has: shop.arrivals, shop.counter\)/],
    ["a system listed twice", (d) => void (d.systems = ["shop.arrivals", "shop.arrivals"]), /"shop.arrivals" is listed twice/],
    ["a required system left out", (d) => void (d.systems = ["shop.counter"]), /"shop.counter" requires "shop.arrivals"/],
    ["a missing table", (d) => void delete d.tables.items, /the data table "items" of system "shop.counter" is missing/],
    ["a table nobody declares", (d) => void (d.tables.extras = []), /no system in use declares the data table "extras"/],
    ["a float where an integer is declared", (d) => void ((d.tables.shop as Record<string, unknown>).startMoney = 20.5), /data table "shop": startMoney: 20.5 is not an integer/],
    ["a number out of bounds", (d) => void ((d.tables.arrivals as Record<string, unknown>).perMille = 1001), /data table "arrivals": perMille: 1001 is outside \[0, 1000\]/],
    ["a string where an integer is declared", (d) => void ((d.tables.items as Record<string, unknown>[])[1]!.price = "6"), /data table "items", row 1: price: "6" is not an integer/],
    ["an unknown field", (d) => void ((d.tables.items as Record<string, unknown>[])[0]!.colour = 3), /data table "items", row 0: unknown field "colour"/],
    ["a missing field", (d) => void delete (d.tables.items as Record<string, unknown>[])[2]!.weight, /data table "items", row 2: the field "weight" is missing/],
    ["a duplicate id", (d) => void ((d.tables.items as Record<string, unknown>[])[2]!.id = "apple"), /data table "items", row 2: the id "apple" is used twice/],
    ["an id that is not an id", (d) => void ((d.tables.items as Record<string, unknown>[])[0]!.id = "Apple Pie"), /data table "items", row 0: the id "Apple Pie" is not an id/],
    ["rows that are not an array", (d) => void (d.tables.items = { apple: {} }), /data table "items": must be an array of rows/],
    ["a record that is an array", (d) => void (d.tables.shop = []), /data table "shop": not a plain object/],
    ["data the system itself rejects", (d) => void ((d.tables.customerKinds as Record<string, unknown>[])[0]!.budgetMin = 99), /row "student": budgetMin is above budgetMax/],
    ["weights that add up to nothing", (d) => { for (const row of d.tables.items as Record<string, unknown>[]) row.weight = 0; }, /the weights add up to 0/],
  ];
  it.each(broken)("refuses %s", (_name, change, message) => {
    const data = shopData();
    change(data);
    expect(failure(() => createSim({ data, seed: 1 }))).toMatch(message);
  });

  it("refuses sim data that is not { systems, tables }", () => {
    for (const data of [null, [], { systems: [] }, { systems: [], tables: {}, more: 1 }, { systems: "lab", tables: {} }, { systems: [], tables: [] }]) {
      expect(failure(() => createSim({ data: data as unknown as SimData, seed: 1 }))).toMatch(/^sim data: /);
    }
  });

  it("checks refs inside the data", () => {
    const pets = dataRows("pets", { owner: field.ref("owners") });
    const owners = dataRows("owners", {});
    const system: SystemDef = { name: "pets", data: [pets, owners] };
    const good = { systems: ["pets"], tables: { owners: [{ id: "ann" }], pets: [{ id: "rex", owner: "ann" }] } };
    expect(createSim({ data: good, seed: 1, systems: [system] }).tick).toBe(0);
    const bad = clone(good);
    bad.tables.pets[0]!.owner = "bob";
    expect(failure(() => createSim({ data: bad, seed: 1, systems: [system] }))).toMatch(
      /data table "pets", row 0: owner: "bob" is not a row of the data table "owners"/,
    );
  });

  it("data rows are frozen: a system cannot change the game data", () => {
    const kinds = dataRows("kinds", { size: field.int(1, 9) });
    const config = dataRecord("lab", { start: field.i32 });
    const vandal: SystemDef = {
      name: "lab",
      data: [config, kinds],
      tick(ctx) {
        (ctx.table(kinds)[0] as { size: number }).size = 5;
      },
    };
    const sim = createSim({ data: labData(), seed: 1, systems: [vandal] });
    expect(() => sim.step()).toThrow(TypeError);
  });
});

describe("declarations", () => {
  const one = stateOne("box", { level: field.i32 });

  it("refuses broken declarations and names them", () => {
    expect(withSystems([{ name: "Bad Name" }])).toMatch(/the name is not an id/);
    expect(failure(() => createSim({ data: { systems: [], tables: {} }, seed: 1, systems: [{ name: "a" }, { name: "a" }] }))).toMatch(
      /system "a" is registered twice/,
    );
    expect(withSystems([{ name: "a", state: [stateOne("Box", {})] }])).toMatch(/state table "Box" of system "a": the name is not a camelCase identifier/);
    expect(withSystems([{ name: "a", state: [one] }, { name: "b", state: [one] }])).toMatch(/another system in use declares a state table of that name/);
    expect(withSystems([{ name: "a", state: [stateOne("box", { "bad-field": field.i32 })] }])).toMatch(/"bad-field" is not a field name/);
    expect(withSystems([{ name: "a", state: [stateOne("box", { level: field.int(5, 1) })] }])).toMatch(/box" of system "a".level: int needs safe integer bounds/);
    expect(withSystems([{ name: "a", state: [stateOne("box", { level: field.int(0, 2 ** 53) })] }])).toMatch(/int needs safe integer bounds/);
    expect(withSystems([{ name: "a", state: [stateEntities("rows", { id: field.i32 })] }])).toMatch(/the field name "id" is reserved/);
    expect(withSystems([{ name: "a", state: [stateMap("rows", { key: field.id })] }])).toMatch(/the field name "key" is reserved/);
    expect(withSystems([{ name: "a", state: [stateEntities("rows", { kind: field.ref("kinds") })] }])).toMatch(
      /state table "rows".kind: refers to the data table "kinds", which no system in use declares/,
    );
    expect(withSystems([{ name: "a", data: [dataRecord("cfg", {})], state: [stateEntities("rows", { kind: field.ref("cfg") })] }], { cfg: {} })).toMatch(
      /refers to "cfg", which is a record, not a table of rows/,
    );
    expect(withSystems([{ name: "a", state: [stateOne("box", { kind: field.ref("kinds") })] }])).toMatch(/a one-row table cannot hold a ref/);
    expect(withSystems([{ name: "a", commands: [command("Do It", {}, () => undefined)] }])).toMatch(/command "Do It" of system "a": the type is not an id/);
    const twice = command("do.it", {}, () => undefined);
    expect(withSystems([{ name: "a", commands: [twice] }, { name: "b", commands: [twice] }])).toMatch(/another system in use declares that command/);
    expect(withSystems([{ name: "a", events: [event("command.rejected", {})] }])).toMatch(/that event type is already declared/);
    expect(withSystems([{ name: "a", state: [{ name: "box", shape: "heap" as "one", fields: {} }] }])).toMatch(/unknown shape/);
    expect(withSystems([{ name: "a", state: [stateOne("box", { level: { kind: "float" } as never })] }])).toMatch(/unknown field kind "float"/);
  });

  it("a system may only touch tables and events that a system in use declares", () => {
    const stray = stateOne("stray", { n: field.i32 });
    const reader: SystemDef = { name: "reader", tick: (ctx) => void ctx.one(stray) };
    const sim = createSim({ data: { systems: ["reader"], tables: {} }, seed: 1, systems: [reader] });
    expect(() => sim.step()).toThrow(/the state table "stray" is not declared by a system in use/);

    // The same name declared a second time is another table: the declaration object is the handle.
    const copy = stateOne("box", { level: field.i32 });
    const owner: SystemDef = { name: "owner", state: [one], tick: (ctx) => void ctx.one(copy) };
    const sim2 = createSim({ data: { systems: ["owner"], tables: {} }, seed: 1, systems: [owner] });
    expect(() => sim2.step()).toThrow(/the state table "box" is not declared by a system in use/);
  });

  it("spawn and put check the row they are given", () => {
    const sim = createSim({ data: labData(), seed: 1, systems: LAB_SYSTEMS });
    sim.submit({ tick: 0, type: "lab.fill", payload: { amount: 100, bin: "a" } });
    sim.submit({ tick: 1, type: "lab.fill", payload: { amount: 100, bin: "a" } });
    sim.step(2);
    expect(sim.read("bins")).toEqual([{ key: "a", amount: 200 }]);
    const things = stateEntities("things", { size: field.int(0, 3) });
    const spawner: SystemDef = { name: "spawner", state: [things], tick: (ctx) => void ctx.spawn(things, { size: 4 }) };
    const sim2 = createSim({ data: { systems: ["spawner"], tables: {} }, seed: 1, systems: [spawner] });
    expect(() => sim2.step()).toThrow(/spawn in "things": size: 4 is outside \[0, 3\]/);
  });
});
