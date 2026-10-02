// counter-shop: the toy system set. Customers arrive at random and queue; the counter serves
// the first in line, who buys one item if it is in stock and within budget; money grows.
// Commands change a price, restock a shelf and open or close the door.
//
// It is here to exercise the kernel (commands, events, two random streams, the three table
// shapes, 32- and 64-bit fields) and to be the example game's sim. It is not a genre system.

import { SimError } from "../errors.ts";
import { field } from "../fields.ts";
import { command, dataRecord, dataRows, event, stateEntities, stateMap, stateOne } from "../system.ts";
import type { SystemDef } from "../system.ts";

// --- shop.arrivals -------------------------------------------------------------------------

/** Settings: the chance of an arrival per tick (per mille) and the longest queue. */
export const arrivalsConfig = dataRecord("arrivals", {
  perMille: field.int(0, 1000),
  queueLimit: field.int(0, 1000),
});

/** Kinds of customer: how often they come, what they can spend, how long they wait. */
export const customerKinds = dataRows("customerKinds", {
  budgetMax: field.int(1, 100000),
  budgetMin: field.int(1, 100000),
  patience: field.int(1, 100000),
  weight: field.int(0, 1000),
});

/** The queue. The lowest id is first in line. */
export const customers = stateEntities("customers", {
  budget: field.int(1, 100000),
  kind: field.ref("customerKinds"),
  /** Ticks the customer still waits. */
  patience: field.int(0, 100000),
});

export const door = stateOne("door", {
  arrived: field.count,
  gaveUp: field.count,
  open: field.bool,
  turnedAway: field.count,
});

export const customerArrived = event("customer.arrived", { customer: field.count, kind: field.ref("customerKinds") });
export const customerTurnedAway = event("customer.turned-away", { kind: field.ref("customerKinds") });
export const customerGaveUp = event("customer.gave-up", { customer: field.count });
export const doorChanged = event("door.changed", { open: field.bool });

export const setOpen = command("shop.set-open", { open: field.bool }, (ctx, payload) => {
  const state = ctx.one(door);
  if (state.open === payload.open) return "no-change";
  state.open = payload.open;
  ctx.emit(doorChanged, { open: payload.open });
  return undefined;
});

export const shopArrivals: SystemDef = {
  name: "shop.arrivals",
  data: [arrivalsConfig, customerKinds],
  state: [customers, door],
  commands: [setOpen],
  events: [customerArrived, customerTurnedAway, customerGaveUp, doorChanged],

  init(ctx) {
    let weights = 0;
    for (const kind of ctx.table(customerKinds)) {
      if (kind.budgetMin > kind.budgetMax) {
        throw new SimError(`data table "customerKinds", row "${kind.id}": budgetMin is above budgetMax`);
      }
      weights += kind.weight;
    }
    if (weights === 0) throw new SimError('data table "customerKinds": the weights add up to 0, so nobody can arrive');
    ctx.one(door).open = true;
  },

  tick(ctx) {
    const state = ctx.one(door);
    for (const customer of ctx.all(customers)) {
      if (customer.patience === 0) {
        ctx.remove(customers, customer.id);
        state.gaveUp += 1;
        ctx.emit(customerGaveUp, { customer: customer.id });
      } else {
        customer.patience -= 1;
      }
    }

    // The draws do not depend on the state: the stream is the same whatever the player does.
    const config = ctx.config(arrivalsConfig);
    if (!ctx.rng.chance(config.perMille, 1000)) return;
    const kinds = ctx.table(customerKinds);
    const kind = kinds[ctx.rng.weighted(kinds.map((row) => row.weight))] as (typeof kinds)[number];
    const budget = ctx.rng.range(kind.budgetMin, kind.budgetMax);

    if (!state.open || ctx.count(customers) >= config.queueLimit) {
      state.turnedAway += 1;
      ctx.emit(customerTurnedAway, { kind: kind.id });
      return;
    }
    const customer = ctx.spawn(customers, { budget, kind: kind.id, patience: kind.patience });
    state.arrived += 1;
    ctx.emit(customerArrived, { customer: customer.id, kind: kind.id });
  },
};

// --- shop.counter --------------------------------------------------------------------------

const MAX_PRICE = 100000;
const MAX_STOCK = 1000000;

/** Settings: the money at the start and how many ticks serving one customer takes. */
export const shopConfig = dataRecord("shop", {
  serviceTicks: field.int(1, 1000),
  startMoney: field.int(0, 1000000000),
});

/** What the shop sells. `weight` is how often a customer wants the item. */
export const items = dataRows("items", {
  price: field.int(1, MAX_PRICE),
  stock: field.int(0, MAX_STOCK),
  unitCost: field.int(0, MAX_PRICE),
  weight: field.int(0, 1000),
});

export const till = stateOne("till", {
  /** Ticks until the counter can serve again. */
  busy: field.int(0, 1000),
  money: field.int(0, Number.MAX_SAFE_INTEGER),
  sales: field.count,
  served: field.count,
});

/** One row per item, by item id. */
export const shelf = stateMap("shelf", {
  price: field.int(1, MAX_PRICE),
  sold: field.count,
  stock: field.int(0, MAX_STOCK),
});

export const sale = event("sale", { customer: field.count, item: field.ref("items"), price: field.int(1, MAX_PRICE) });
export const customerLeft = event("customer.left", { customer: field.count, item: field.ref("items"), reason: field.id });
export const priceChanged = event("price.changed", { item: field.ref("items"), price: field.int(1, MAX_PRICE) });
export const shelfRestocked = event("shelf.restocked", {
  amount: field.int(1, 1000),
  cost: field.int(0, MAX_PRICE * 1000),
  item: field.ref("items"),
});

export const setPrice = command("shop.set-price", { item: field.ref("items"), price: field.int(1, MAX_PRICE) }, (ctx, payload) => {
  const row = ctx.get(shelf, payload.item);
  if (row === undefined) return "no-such-shelf";
  if (row.price === payload.price) return "no-change";
  row.price = payload.price;
  ctx.emit(priceChanged, { item: payload.item, price: payload.price });
  return undefined;
});

export const restock = command("shop.restock", { amount: field.int(1, 1000), item: field.ref("items") }, (ctx, payload) => {
  const row = ctx.get(shelf, payload.item);
  if (row === undefined) return "no-such-shelf";
  const cost = ctx.row(items, payload.item).unitCost * payload.amount;
  const cash = ctx.one(till);
  if (cost > cash.money) return "not-enough-money";
  if (row.stock + payload.amount > MAX_STOCK) return "shelf-full";
  cash.money -= cost;
  row.stock += payload.amount;
  ctx.emit(shelfRestocked, { amount: payload.amount, cost, item: payload.item });
  return undefined;
});

export const shopCounter: SystemDef = {
  name: "shop.counter",
  requires: ["shop.arrivals"],
  data: [shopConfig, items],
  state: [till, shelf],
  commands: [setPrice, restock],
  events: [sale, customerLeft, priceChanged, shelfRestocked],

  init(ctx) {
    let weights = 0;
    for (const item of ctx.table(items)) {
      ctx.put(shelf, item.id, { price: item.price, sold: 0, stock: item.stock });
      weights += item.weight;
    }
    if (weights === 0) throw new SimError('data table "items": the weights add up to 0, so nobody wants anything');
    ctx.one(till).money = ctx.config(shopConfig).startMoney;
  },

  tick(ctx) {
    const cash = ctx.one(till);
    if (cash.busy > 0) {
      cash.busy -= 1;
      return;
    }
    const customer = ctx.all(customers)[0];
    if (customer === undefined) return;

    // The shelf is walked by ascending key, so the weights are in a fixed order.
    const shelves = ctx.all(shelf);
    const wanted = shelves[ctx.rng.weighted(shelves.map((row) => ctx.row(items, row.key).weight))] as (typeof shelves)[number];
    if (wanted.stock === 0) {
      ctx.emit(customerLeft, { customer: customer.id, item: wanted.key, reason: "sold-out" });
    } else if (wanted.price > customer.budget) {
      ctx.emit(customerLeft, { customer: customer.id, item: wanted.key, reason: "too-expensive" });
    } else {
      wanted.stock -= 1;
      wanted.sold += 1;
      cash.money += wanted.price;
      cash.sales += 1;
      ctx.emit(sale, { customer: customer.id, item: wanted.key, price: wanted.price });
    }
    ctx.remove(customers, customer.id);
    cash.served += 1;
    cash.busy = ctx.config(shopConfig).serviceTicks - 1;
  },
};
