// @whz/sim: the deterministic simulation kernel. Headless and pure: no DOM, no clock, no I/O.
// The contract is in docs/sim.md; how to write a system is in README.md.

export { createSim, restoreSim, hex32, ENCODING_VERSION, SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from "./kernel.ts";
export type {
  Command,
  DescribeOptions,
  QueuedCommand,
  RestoreOptions,
  Sim,
  SimEvent,
  SimOptions,
  Snapshot,
  SubmitResult,
  TableInfo,
} from "./kernel.ts";
export { describeSim } from "./describe.ts";
export { commandRejected, hashSimData } from "./program.ts";
export type { SimData } from "./program.ts";
export { checkReplay, parseReplay, recordReplay, runReplay, REPLAY_FORMAT, REPLAY_VERSION } from "./replay.ts";
export type { Replay, ReplayCheck, ReplayInput, ReplayMismatch, ReplayOptions, ReplayRun } from "./replay.ts";
export { canonicalJson } from "./canonical.ts";
export { SimError } from "./errors.ts";
export { field, isId, isName, I32_MAX, I32_MIN } from "./fields.ts";
export type { BoolField, Fields, FieldType, IdField, IntField, Row, RowOf, Value } from "./fields.ts";
export { compareBy, compareId, compareInt, sortedKeys, sortTotal } from "./order.ts";
export type { Compare } from "./order.ts";
export { command, dataRecord, dataRows, event, stateEntities, stateMap, stateOne } from "./system.ts";
export type {
  CommandDecl,
  DataRecordDecl,
  DataRow,
  DataRowsDecl,
  DataTableDecl,
  EntitiesDecl,
  EntityRow,
  EventDecl,
  MapDecl,
  MapRow,
  OneDecl,
  SimRng,
  StateTableDecl,
  SystemContext,
  SystemDef,
} from "./system.ts";
export { ENGINE_SYSTEMS } from "./systems/index.ts";
export * as counterShop from "./systems/counter-shop.ts";
