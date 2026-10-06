# The sim contract

The simulation is the part of the engine a second player (Godot, D10) must reproduce exactly.
It lives in `packages/sim` (`@whz/sim`), depends only on `@whz/det`, and runs headless in Node,
in the browser and on any other JavaScript engine. **Same sim data + same seed + same commands =
same state, on every engine, forever.** Everything below serves that sentence. How to write a
system: [packages/sim/README.md](../packages/sim/README.md).

## The loop

```ts
const sim = createSim({ data, seed });       // data: the systems a game uses + their tables
sim.submit({ tick: 12, type: "shop.set-price", payload: { item: "apple", price: 4 } });
const events = sim.step(60);                 // 60 whole ticks; there is no dt
sim.digestHex();                             // "0a7b53df"
```

- **Ticks.** Time is an integer. `step(n)` runs `n` whole ticks; the host decides how many ticks
  a frame gets and interpolates what it draws. One tick `T`: (1) the commands queued for `T`
  apply, (2) every system runs, in the fixed order of the engine registry, (3) the state is
  checked against the declared tables.
- **Commands in.** `{ tick, type, payload }` is the only way to change the state from outside.
  Commands are ordered by tick, then by the sequence number `submit` gave them. `submit` never
  throws: a malformed command, an unknown type or a tick in the past comes back as
  `{ ok: false, error }` and is not queued. A well-formed command the state does not allow (not
  enough money) becomes a `command.rejected` event in its tick and changes nothing.
- **Events out.** `step` returns what happened, in order: `{ tick, type, payload }`. They are for
  FX, audio cues and UI. Events are output only: they are not state, and nothing reads them back.
- **State.** Plain data in tables that systems declare. Three shapes: `one` (a single row),
  `entities` (rows with a stable integer `id`, never reused, kept in ascending id order) and
  `map` (rows with an id `key`, kept in ascending key order). A field is a bounded integer, a
  boolean or an ASCII id; there are no floats, no free text, no nulls and no nesting.
- **Systems and games.** A system is engine code: it declares its data tables, state tables,
  commands and events. A game is data (D10): `{ systems: [...], tables: {...} }` lists the systems
  it uses and fills their data tables. Unknown systems, tables and fields, floats, duplicate ids
  and dangling refs are refused when the sim is created. `hashSimData(data)` is the
  `simDataHash`.
- **Random numbers.** One stream per system, `createRng(seed, <system name>)` from `@whz/det`.
  The kernel keeps the generators. A system gets `ctx.rng`, a frozen object with the seven draws
  (`next`, `int`, `range`, `chance`, `pick`, `weighted`, `shuffle`) and nothing else. That holds
  when the code runs, not only in the types: the handle has no `fork`, no `state` and no
  `restore`, and the context shows neither the kernel nor another system (they are `#private`
  fields, and the context is frozen). So a system cannot reach another stream, rewind its own
  or make a new one from what it is given, and adding a system or a data row never shifts what
  another system draws (`packages/sim/test/rng-handle.test.ts`,
  `packages/sim/test/streams.test.ts`).
  The handle cannot stop a system file from importing `createRng` itself; the lint does (the
  import is banned in `packages/sim/src/systems/`). Such a stream would be in no digest and in
  no snapshot.

## Ordering rules

- Ordered collections are arrays. A map is walked by ascending key (`sortedKeys`), never in
  insertion order: a Godot dictionary and a JS object disagree on `{"10": …, "2": …}`.
- Every comparator is a total order: end it with a tie-break on a stable id. `sortTotal` throws
  on a tie, because a tie makes the result depend on the sort algorithm (Godot's is not stable).
- Ids are lowercase ASCII (`apple`, `shop.set-price`) and compare by byte (`compareId`).
- Fields are encoded and listed in ascending name order, tables in ascending name order within
  their system, systems in registry order. Nothing depends on declaration order.

## Digest, snapshot, replay

- **Digest.** `digest()` is FNV-1a 32 over `encodeState()`, a canonical binary encoding; never a
  hash of formatted text. Integers are little-endian; a string is a `u16` length and ASCII bytes:

  ```text
  "WHZS"  u16 encoding version  i64 tick  i64 next entity id  u16 system count
  per system:  str name  4 × u32 rng state  u16 table count
    per table: str name  u8 shape (0 one, 1 entities, 2 map)  u32 row count
      per row: [i64 id | str key]  then each field: int → i32 (i64 if its bounds leave 32 bits),
                                                    bool → u8, id → str
  ```

  `digestParts()` gives one digest per system, to trace a difference. Queued commands are not in
  the digest; they are in the snapshot.
- **Snapshot.** `snapshot()` is the whole sim as plain data with a `version` and the
  `simDataHash`; its canonical text is `canonicalJson(snapshot)` (RFC 8785 for integers and
  ASCII). `restoreSim({ data, snapshot })` checks every value and refuses another version or
  other sim data. A restored sim continues exactly as the original. `commandLog()` is the
  commands accepted since creation or restore: a save is a snapshot plus that tail.
- **Replay.** `{ simDataHash, seed, commands, ticks, digestEvery, digests, finalDigest }`. The
  Node runner replays a file and compares the digests:

  ```sh
  ./dev npm run sim -- replay packages/sim/golden/counter-shop.replay.json [--heavy] [--describe]
  ```

  Exit 0 is a match; exit 1 names the first tick count that differs. `--heavy` saves and loads
  the sim on every tick, which finds state that does not survive a snapshot. The gate runs the
  golden replay in both modes.
- **Golden digests change only in a deliberate commit that says why** (a rule change, a new
  field). Record again with `--record`; never edit digests by hand, never to make a red gate green.
- **State as text.** `describe()` prints the tick, the digest and every table in a few lines.
  Agents read that, not screenshots.

## What is banned in the sim, and why

`packages/sim/src` is under the determinism lint (`tools/lint/determinism.js`; what the lint
cannot catch is in [tools/lint/README.md](../tools/lint/README.md)) and is compiled without DOM
or Node types, so most of this does not even type-check. The Node runner in
`packages/sim/src/node/` is the only part that touches files.

| Banned | Why | Instead |
|---|---|---|
| `dt`, `Date`, `performance`, timers | Wall-clock time differs on every run | integer ticks |
| `Math.random`, `crypto` | Not seeded | `ctx.rng`, the system's stream |
| `createRng` and `Rng` in a system (`packages/sim/src/systems/`) | A stream of its own is not in the digest or in a snapshot | `ctx.rng` |
| `eval`, `Function`, `import()`, `require`, `process`, `import.meta`, inline `eslint-disable` | Back doors: code the lint cannot read, the machine, a silenced rule | static imports; a rule changes in `eslint.config.js` |
| `Math.sin/cos/pow/exp/log/sqrt`, `**`, `Math.round` | Engines differ in the last bit; JS and Godot round halves differently | `@whz/det`: `isin`, `ease`, `mulDivRound`, `isqrt`, tables in game data |
| Floats in state, data, commands, events | Formatting and rounding differ between players | bounded integers (basis points, fixed point) |
| DOM, WebGL, `fetch`, storage, `node:*` | The sim is headless; I/O is a host adapter | commands in, events out |
| `Intl`, `localeCompare`, `toLocale*` | Depend on locale and ICU version | ASCII ids, `compareId` |
| Walking a map in insertion order, a comparator with ties | Differs between JS and Godot | `sortedKeys`, `sortTotal`, tie-break on id |
| Code in a game | The player must stay swappable (D10) | systems in the engine, tables in the game |
| Changing the state outside a tick | It would not be in the replay | a command |
