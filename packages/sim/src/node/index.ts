// The Node side of @whz/sim: reading replay and sim data files, and the replay runner behind
// `./dev npm run sim -- replay <file>`. The sim itself never touches a file.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checkReplay, parseReplay, SimError } from "../index.ts";
import type { Replay, ReplayCheck, SimData, SystemDef } from "../index.ts";

/** Reads a JSON file; a missing file or broken JSON is a `SimError` that names the file. */
export function readJsonFile(file: string, what: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new SimError(`cannot read ${what} ${file}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new SimError(`${what} ${file} is not JSON: ${(error as Error).message}`);
  }
}

/** Reads and checks a replay file. */
export function readReplayFile(file: string): Replay {
  return parseReplay(readJsonFile(file, "the replay"));
}

/** Reads a sim data file. The sim checks its content when it is created. */
export function readSimDataFile(file: string): SimData {
  return readJsonFile(file, "the sim data") as SimData;
}

/** The sim data file of a replay: `dataFile` beside the replay, unless one is given. */
export function dataFileOf(replayFile: string, replay: Replay, given?: string): string {
  if (given !== undefined) return resolve(given);
  if (replay.dataFile === undefined) {
    throw new SimError(`${replayFile} names no dataFile: pass the sim data with --data <file>`);
  }
  return resolve(dirname(replayFile), replay.dataFile);
}

export interface ReplayFileOptions {
  /** A sim data file to use instead of the replay's `dataFile`. */
  readonly data?: string;
  readonly heavy?: boolean;
  readonly systems?: readonly SystemDef[];
}

export interface ReplayFileCheck extends ReplayCheck {
  readonly replay: Replay;
  readonly dataFile: string;
}

/** Runs a replay file against its sim data and compares the digests. */
export function checkReplayFile(file: string, options: ReplayFileOptions = {}): ReplayFileCheck {
  const replay = readReplayFile(file);
  const dataFile = dataFileOf(file, replay, options.data);
  const data = readSimDataFile(dataFile);
  return { ...checkReplay({ data, replay, heavy: options.heavy, systems: options.systems }), replay, dataFile };
}

/**
 * Writes a replay file: one field per line, one command per line, digests eight per line.
 * The layout is stable, so a regenerated golden file gives a small diff.
 */
export function writeReplayFile(file: string, replay: Replay): void {
  const commands = replay.commands.map((command) => `    ${JSON.stringify(command)}`);
  const digests: string[] = [];
  for (let i = 0; i < replay.digests.length; i += 8) {
    digests.push(`    ${replay.digests.slice(i, i + 8).map((digest) => JSON.stringify(digest)).join(", ")}`);
  }
  const list = (lines: string[]): string => (lines.length === 0 ? "[]" : `[\n${lines.join(",\n")}\n  ]`);
  const lines = [
    `  "format": ${JSON.stringify(replay.format)}`,
    `  "version": ${replay.version}`,
    ...(replay.dataFile === undefined ? [] : [`  "dataFile": ${JSON.stringify(replay.dataFile)}`]),
    `  "simDataHash": ${JSON.stringify(replay.simDataHash)}`,
    `  "seed": ${replay.seed}`,
    `  "ticks": ${replay.ticks}`,
    `  "digestEvery": ${replay.digestEvery}`,
    `  "commands": ${list(commands)}`,
    `  "digests": ${list(digests)}`,
    `  "finalDigest": ${JSON.stringify(replay.finalDigest)}`,
  ];
  writeFileSync(file, `{\n${lines.join(",\n")}\n}\n`);
}
