// The sim runner: `./dev npm run sim -- replay <file> [options]`.
//
//   replay <file>            run the replay and compare its digests with the stored ones
//     --data <file>          the sim data to run it with (default: the replay's "dataFile",
//                            relative to the replay)
//     --heavy                save and load the sim on every tick (finds state that does not
//                            survive a snapshot)
//     --describe             print the state as text after the last tick
//     --record               write the digests of this run into the file instead of comparing
//                            (only in a commit that says why the golden digests change)
//
// Exit code: 0 the digests match (or were recorded), 1 they do not or the replay cannot run,
// 2 wrong usage.

import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { REPLAY_FORMAT, REPLAY_VERSION, recordReplay, SimError } from "../index.ts";
import type { Command, Replay } from "../index.ts";
import { checkReplayFile, dataFileOf, readJsonFile, readSimDataFile, writeReplayFile } from "./index.ts";

const USAGE = "usage: sim replay <file> [--data <file>] [--heavy] [--describe] [--record]";

class UsageError extends Error {}

function shown(file: string): string {
  const path = relative(process.cwd(), file);
  return path === "" || path.startsWith("..") ? file : path;
}

function replay(args: string[]): number {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      data: { type: "string" },
      heavy: { type: "boolean", default: false },
      describe: { type: "boolean", default: false },
      record: { type: "boolean", default: false },
    },
  });
  if (positionals.length !== 1) throw new UsageError("replay needs exactly one replay file");
  const file = resolve(positionals[0] as string);

  if (values.record) {
    if (values.heavy) throw new UsageError("--record and --heavy do not go together: record first, then check with --heavy");
    // Only what a run needs is read: the stored hash and digests are what gets replaced.
    const source = readJsonFile(file, "the replay") as Partial<Replay>;
    const stub = { ...source, format: REPLAY_FORMAT, version: REPLAY_VERSION } as Replay;
    const dataFile = dataFileOf(file, stub, values.data);
    const recorded = recordReplay({
      data: readSimDataFile(dataFile),
      seed: source.seed as number,
      commands: source.commands as readonly Command[],
      ticks: source.ticks as number,
      digestEvery: source.digestEvery as number,
    });
    writeReplayFile(file, source.dataFile === undefined ? recorded : { ...recorded, dataFile: source.dataFile });
    const changed = recorded.finalDigest !== source.finalDigest || recorded.simDataHash !== source.simDataHash;
    console.log(`recorded ${shown(file)}: ${recorded.ticks} ticks, ${recorded.commands.length} commands, ${recorded.digests.length} digests`);
    console.log(`  simDataHash ${recorded.simDataHash}, final digest ${recorded.finalDigest}${changed ? " (changed)" : " (unchanged)"}`);
    return 0;
  }

  const check = checkReplayFile(file, { data: values.data, heavy: values.heavy });
  const { replay: stored } = check;
  console.log(`replay ${shown(file)}${values.heavy ? " (heavy mode: save and load on every tick)" : ""}`);
  console.log(`  data ${shown(check.dataFile)} (simDataHash ${check.simDataHash})`);
  console.log(`  seed ${stored.seed}, ${stored.ticks} ticks, ${stored.commands.length} commands, a digest every ${stored.digestEvery} ticks`);
  if (values.describe) console.log(check.sim.describe().trimEnd());
  if (check.mismatch !== null) {
    const { afterTicks, expected, actual } = check.mismatch;
    console.log(`MISMATCH after ${afterTicks} ticks: the replay stores ${expected ?? "no digest"}, this run gives ${actual ?? "no digest"}`);
    console.log("  the sim or its data changed. If that was deliberate, record the replay again (--record) and say why in the commit.");
    return 1;
  }
  console.log(`ok: ${check.digests.length} digests and the final digest ${check.finalDigest} match`);
  return 0;
}

function main(argv: string[]): number {
  try {
    const [command, ...rest] = argv;
    if (command === undefined || command === "--help" || command === "-h") {
      console.log(USAGE);
      return command === undefined ? 2 : 0;
    }
    if (command !== "replay") throw new UsageError(`unknown command "${command}"`);
    return replay(rest);
  } catch (error) {
    if (error instanceof SimError) {
      console.error(`sim: ${error.message}`);
      return 1;
    }
    if (error instanceof UsageError || (error instanceof TypeError && "code" in error)) {
      console.error(`sim: ${error.message}`);
      console.error(USAGE);
      return 2;
    }
    throw error;
  }
}

process.exitCode = main(process.argv.slice(2));
