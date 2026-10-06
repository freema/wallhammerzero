# @whz/sim

The deterministic simulation kernel: fixed integer ticks, commands in, events out, state in
declared tables, one random stream per system, a canonical state digest, snapshots and replays.
It depends only on `@whz/det` and has no DOM, clock or I/O. The contract (ticks, ordering, the
digest layout, what is banned and why) is in [docs/sim.md](../../docs/sim.md); this file is the
API and how to write a system.

## For a host (player, tests, tools)

| API | What it does |
|---|---|
| `createSim({ data, seed, systems? })` → `Sim` | A sim at tick 0. `data` is `{ systems, tables }`; `seed` is an unsigned 32-bit integer; `systems` is the registry (default `ENGINE_SYSTEMS`). Throws `SimError` on bad data. |
| `sim.submit({ tick, type, payload })` → `{ ok: true, seq }` or `{ ok: false, error }` | Queues a command for `tick` (not before `sim.tick`). Never throws. |
| `sim.step(ticks = 1)` → `SimEvent[]` | Runs whole ticks and returns their events `{ tick, type, payload }` in order. |
| `sim.tick`, `sim.seed`, `sim.simDataHash`, `sim.systems` | Where the sim is and what it runs. |
| `sim.read(table)` → rows, `sim.tables()` → `{ name, shape, system, fields }[]` | Copies of the state, for a view. A host cannot change the sim through them. |
| `sim.describe({ maxRows? })` → text | The state as compact text, for agents. |
| `sim.digest()`, `sim.digestHex()`, `sim.digestParts()`, `sim.encodeState()` | The state digest (FNV-1a 32), per-system digests and the bytes behind them. |
| `sim.snapshot()` → `Snapshot`, `restoreSim({ data, snapshot, systems? })` | Save and load. `canonicalJson(snapshot)` is the canonical text. |
| `sim.commandLog()`, `sim.pending()` | The commands accepted since creation or restore (in the order they apply), and the ones still queued. |
| `recordReplay`, `runReplay`, `checkReplay`, `parseReplay` | Replays: `{ simDataHash, seed, commands, ticks, digestEvery, digests, finalDigest }`. `heavy: true` saves and loads on every tick. |
| `hashSimData(data)` | The `simDataHash`: FNV-1a 64 of the canonical JSON of the sim data. |
| `@whz/sim/node`: `checkReplayFile`, `readReplayFile`, `writeReplayFile`, `readSimDataFile` | Files, for Node tools. The runner: `./dev npm run sim -- replay <file> [--data <file>] [--heavy] [--describe] [--record]`. |

A command's `seq` is a handle for the host (a `command.rejected` event carries it); it is not
part of the state, and a replay may number the same commands differently.

## Writing a system

A system is an engine module in `src/systems/`, registered in `src/systems/index.ts`. The order
of that list is the order systems run in, for every game. A game never contains code.

```ts
import { command, dataRows, event, field, stateMap, stateOne } from "../index.ts";
import type { SystemDef } from "../index.ts";

// Data tables: what the game supplies. Rows have an id; a record (dataRecord) is one object.
const crops = dataRows("crops", { growTicks: field.int(1, 10000), price: field.int(1, 100000) });
// State tables: what the system owns. Shapes: stateOne, stateEntities (integer id), stateMap (id key).
const barn = stateOne("barn", { money: field.int(0, Number.MAX_SAFE_INTEGER) });
const plots = stateMap("plots", { age: field.count, crop: field.ref("crops") });
const harvested = event("farm.harvested", { crop: field.ref("crops"), plot: field.id });

const plant = command("farm.plant", { crop: field.ref("crops"), plot: field.id }, (ctx, payload) => {
  if (ctx.get(plots, payload.plot) !== undefined) return "plot-in-use"; // → a command.rejected event
  ctx.put(plots, payload.plot, { age: 0, crop: payload.crop });
  return undefined;
});

export const farm: SystemDef = {
  name: "farm", // also the name of its random stream
  data: [crops],
  state: [barn, plots],
  commands: [plant],
  events: [harvested],
  init(ctx) {
    ctx.one(barn).money = 10;
  },
  tick(ctx) {
    for (const plot of ctx.all(plots)) { // by ascending key; safe to remove while looping
      plot.age += 1;
      const crop = ctx.row(crops, plot.crop);
      if (plot.age < crop.growTicks) continue;
      ctx.one(barn).money += crop.price + ctx.rng.range(0, 2);
      ctx.remove(plots, plot.key);
      ctx.emit(harvested, { crop: plot.crop, plot: plot.key });
    }
  },
};
```

The context (`SystemContext`) is everything a system can touch:

- data: `ctx.config(record)`, `ctx.table(rows)`, `ctx.row(rows, id)` (frozen);
- state: `ctx.one(table)`, `ctx.all(table)`, `ctx.get(table, idOrKey)`, `ctx.count(table)`,
  `ctx.spawn(entities, fields)`, `ctx.put(map, key, fields)`, `ctx.remove(table, idOrKey)`;
- `ctx.rng` (`next`, `int`, `range`, `chance`, `pick`, `weighted`, `shuffle`), `ctx.emit(event,
  payload)` and `ctx.tick`.

`ctx.rng` is a frozen handle on the system's own stream, not the generator of `@whz/det`: it has
no `fork`, `state` or `restore`, also at run time, and the context holds the kernel in a
`#private` field. A system file may not import `createRng` or `Rng` (the lint bans it under
`src/systems/`): a stream of its own would be in no digest and no snapshot.

Rules the kernel enforces: a table, command or event must be declared by a system in use (the
declaration object is the handle); rows hold exactly their declared fields within their bounds
(checked after every tick; a violation stops the sim for good); a command's `apply` returns
nothing or a reason id, and must not change the state before returning a reason. Field types:
`field.int(min, max)`, `field.i32`, `field.count`, `field.bool`, `field.id`, `field.ref(table)`.
A system that reads another system's tables names it in `requires`.

Rules the kernel cannot see, so keep them yourself: draw random numbers in a way that does not
depend on other systems where you can (so a change there does not shift your stream); sort with
`sortTotal` and a tie-break on an id; walk plain objects with `sortedKeys`; use `@whz/det` for
all maths (`mulDiv`, `divRound`, `isin`, `ease`).

## The toy system set: counter-shop

`src/systems/counter-shop.ts` holds `shop.arrivals` (customers arrive at random and queue) and
`shop.counter` (the first in line buys one item if it is in stock and within budget). Commands:
`shop.set-price { item, price }`, `shop.restock { item, amount }`, `shop.set-open { open }`. It
exists to exercise the kernel and to be the example game's sim; it is not a genre system.

- `golden/counter-shop.data.json`: its sim data. The example game `games/examples/counter-shop/`
  holds the same tables; this file is the sim's own copy (the sim cannot depend on
  `packages/game-data`), and a test there keeps the two equal.
- `golden/counter-shop.replay.json`: the golden replay. `npm run check` replays it in normal and
  in heavy mode. If the digests change, the sim or its data changed: record again with
  `--record` only in a commit that says why.

## Tests

`./dev npm run check -- @whz/sim` runs the type checks, the lint, the tests and the golden
replay: the kernel and its ordering rules, declarations and data validation, the digest layout
against an independent encoder, snapshot → restore (and heavy mode) against uninterrupted runs,
stream independence, what a system can reach of the random streams at run time
(`test/rng-handle.test.ts`), the replay runner's exit codes, design-intent invariants of the toy shop
over 10,000 ticks, and a fuzz of 1,000 random command sequences.
