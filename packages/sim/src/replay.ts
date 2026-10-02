// Replays: a session is `simDataHash + seed + commands`, and running it again gives the same
// digests on every engine. A replay file also stores the digests it must give, so it is a
// test: the golden replay in the gate, a recorded bug, an entry of the conformance corpus.

import { canonicalJson } from "./canonical.ts";
import { SimError } from "./errors.ts";
import { isPlainObject } from "./fields.ts";
import { createSim, restoreSim } from "./kernel.ts";
import type { Command, Sim } from "./kernel.ts";
import type { SimData } from "./program.ts";
import type { SystemDef } from "./system.ts";

export const REPLAY_FORMAT = "whz-sim-replay";
export const REPLAY_VERSION = 1;

export interface Replay {
  readonly format: typeof REPLAY_FORMAT;
  readonly version: number;
  /** The hash of the sim data the replay was recorded with (`hashSimData`). */
  readonly simDataHash: string;
  readonly seed: number;
  /** The commands, in the order they were applied. All of them are submitted before tick 0. */
  readonly commands: readonly Command[];
  /** How many ticks the replay runs. */
  readonly ticks: number;
  /** A digest is taken after every `digestEvery` ticks. */
  readonly digestEvery: number;
  /** The digests after `digestEvery`, `2 * digestEvery`, ... ticks, as 8 hex digits. */
  readonly digests: readonly string[];
  /** The digest after the last tick. */
  readonly finalDigest: string;
  /** Where the Node runner finds the sim data, relative to the replay file. Not used by the sim. */
  readonly dataFile?: string;
}

/** What a run needs from a replay: the stored digests are not read. */
export type ReplayInput = Pick<Replay, "seed" | "commands" | "ticks" | "digestEvery"> & { readonly simDataHash?: string };

export interface ReplayOptions {
  readonly data: SimData;
  readonly replay: ReplayInput;
  readonly systems?: readonly SystemDef[];
  /**
   * Heavy mode: after every tick the sim is saved to canonical text, thrown away and loaded
   * again. It finds state that does not survive a save (Factorio's desync tool).
   */
  readonly heavy?: boolean;
}

export interface ReplayRun {
  readonly simDataHash: string;
  readonly digests: string[];
  readonly finalDigest: string;
  /** The sim after the last tick. */
  readonly sim: Sim;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Runs a replay and returns the digests it gives. Throws a `SimError` if the replay was
 * recorded with other sim data or if the sim refuses one of its commands.
 */
export function runReplay(options: ReplayOptions): ReplayRun {
  const { data, replay, systems, heavy = false } = options;
  if (!isCount(replay.ticks)) throw new SimError("replay: ticks must be a non-negative integer");
  if (!isCount(replay.digestEvery) || replay.digestEvery < 1) throw new SimError("replay: digestEvery must be a positive integer");
  if (!Array.isArray(replay.commands)) throw new SimError("replay: commands must be a list");

  let sim = createSim({ data, seed: replay.seed, systems });
  if (replay.simDataHash !== undefined && replay.simDataHash !== sim.simDataHash) {
    throw new SimError(`replay: it was recorded with sim data ${JSON.stringify(replay.simDataHash)}, and this sim data is ${sim.simDataHash}`);
  }
  for (let i = 0; i < replay.commands.length; i += 1) {
    const result = sim.submit(replay.commands[i] as Command);
    if (!result.ok) throw new SimError(`replay: command ${i} was refused: ${result.error}`);
  }

  const digests: string[] = [];
  for (let tick = 1; tick <= replay.ticks; tick += 1) {
    sim.step(1);
    if (heavy) sim = restoreSim({ data, snapshot: JSON.parse(canonicalJson(sim.snapshot())) as unknown, systems });
    if (tick % replay.digestEvery === 0) digests.push(sim.digestHex());
  }
  return { simDataHash: sim.simDataHash, digests, finalDigest: sim.digestHex(), sim };
}

/** Records a replay: runs the commands and stores the digests they give. */
export function recordReplay(options: {
  readonly data: SimData;
  readonly seed: number;
  readonly commands: readonly Command[];
  readonly ticks: number;
  readonly digestEvery: number;
  readonly systems?: readonly SystemDef[];
}): Replay {
  const { data, seed, commands, ticks, digestEvery, systems } = options;
  const run = runReplay({ data, replay: { seed, commands, ticks, digestEvery }, systems });
  return {
    format: REPLAY_FORMAT,
    version: REPLAY_VERSION,
    simDataHash: run.simDataHash,
    seed,
    commands: run.sim.commandLog(),
    ticks,
    digestEvery,
    digests: run.digests,
    finalDigest: run.finalDigest,
  };
}

/** Checks the shape of a parsed replay file. Throws a `SimError` that names the problem. */
export function parseReplay(value: unknown): Replay {
  if (!isPlainObject(value)) throw new SimError("replay: not an object");
  if (value.format !== REPLAY_FORMAT) throw new SimError(`replay: the format is not "${REPLAY_FORMAT}"`);
  if (value.version !== REPLAY_VERSION) {
    throw new SimError(`replay: version ${JSON.stringify(value.version)}, and this sim reads version ${REPLAY_VERSION}`);
  }
  const isDigest = (digest: unknown): boolean => typeof digest === "string" && /^[0-9a-f]{8}$/.test(digest);
  if (typeof value.simDataHash !== "string" || !/^[0-9a-f]{16}$/.test(value.simDataHash)) {
    throw new SimError("replay: simDataHash must be 16 hex digits");
  }
  if (!isCount(value.seed) || value.seed > 0xffffffff) throw new SimError("replay: seed must be an unsigned 32-bit integer");
  if (!Array.isArray(value.commands)) throw new SimError("replay: commands must be a list");
  if (!isCount(value.ticks)) throw new SimError("replay: ticks must be a non-negative integer");
  if (!isCount(value.digestEvery) || value.digestEvery < 1) throw new SimError("replay: digestEvery must be a positive integer");
  if (!Array.isArray(value.digests) || !value.digests.every(isDigest)) {
    throw new SimError("replay: digests must be a list of digests (8 hex digits each)");
  }
  if (!isDigest(value.finalDigest)) throw new SimError("replay: finalDigest must be 8 hex digits");
  if (value.dataFile !== undefined && typeof value.dataFile !== "string") throw new SimError("replay: dataFile must be a string");
  return value as unknown as Replay;
}

/** The first place where a run differs from the digests a replay stores. */
export interface ReplayMismatch {
  /** The tick count after which the digest was taken. */
  readonly afterTicks: number;
  readonly expected: string | null;
  readonly actual: string | null;
}

export interface ReplayCheck extends ReplayRun {
  readonly ok: boolean;
  readonly mismatch: ReplayMismatch | null;
}

/** Runs a replay and compares the digests with the stored ones. */
export function checkReplay(options: Omit<ReplayOptions, "replay"> & { readonly replay: Replay }): ReplayCheck {
  const { replay } = options;
  const run = runReplay(options);
  let mismatch: ReplayMismatch | null = null;
  const length = Math.max(run.digests.length, replay.digests.length);
  for (let i = 0; i < length && mismatch === null; i += 1) {
    const expected = replay.digests[i] ?? null;
    const actual = run.digests[i] ?? null;
    if (expected !== actual) mismatch = { afterTicks: (i + 1) * replay.digestEvery, expected, actual };
  }
  if (mismatch === null && run.finalDigest !== replay.finalDigest) {
    mismatch = { afterTicks: replay.ticks, expected: replay.finalDigest, actual: run.finalDigest };
  }
  return { ...run, ok: mismatch === null, mismatch };
}
