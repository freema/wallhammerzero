// The city command line: `./dev npm run city -- <command>`.
//
//   slice <seed> --level <n> [--facade]   one level as ASCII (north at the top)
//   slice <seed> --all [--facade]         every level, from the top down
//   stats <seed>                          counts per kind and band, the checks, the grid hash
//   sweep <first> <count>                 generates and checks seeds first .. first + count - 1
//
// Options for every command: --width <n> --depth <n> --levels <n> (the rest of the params are
// the defaults). A seed is a decimal or 0x-hex unsigned 32-bit integer.
//
// Exit code: 0 ok, 1 a district failed its checks, 2 wrong usage.

import { parseArgs } from "node:util";
import { checkDistrict, districtStats, formatStats, generateDistrict, gridHash, legend, ParamsError, sliceAscii } from "../index.ts";
import type { District, DistrictParams } from "../index.ts";

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

export const CITY_USAGE = [
  "usage: city slice <seed> --level <n> [--facade]",
  "       city slice <seed> --all [--facade]",
  "       city stats <seed>",
  "       city sweep <first> <count>",
  "options: --width <n> --depth <n> --levels <n>",
].join("\n");

class UsageError extends Error {}

function parseInt32(text: string | undefined, what: string, max = 0xffffffff): number {
  if (text === undefined) throw new UsageError(`${what} is missing`);
  const value = /^0x[0-9a-f]+$/i.test(text) ? Number.parseInt(text.slice(2), 16) : /^[0-9]+$/.test(text) ? Number.parseInt(text, 10) : Number.NaN;
  if (!Number.isInteger(value) || value < 0 || value > max) throw new UsageError(`${what} must be an integer in [0, ${max}], got ${text}`);
  return value;
}

export function runCityCli(argv: readonly string[], io: CliIo): number {
  try {
    const { values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        level: { type: "string" },
        all: { type: "boolean", default: false },
        facade: { type: "boolean", default: false },
        width: { type: "string" },
        depth: { type: "string" },
        levels: { type: "string" },
      },
    });
    const [command, ...rest] = positionals;
    const params: { -readonly [K in keyof DistrictParams]?: DistrictParams[K] } = {};
    if (values.width !== undefined) params.width = parseInt32(values.width, "--width", 256);
    if (values.depth !== undefined) params.depth = parseInt32(values.depth, "--depth", 256);
    if (values.levels !== undefined) params.levels = parseInt32(values.levels, "--levels", 64);
    const district = (seed: number): District => generateDistrict(seed, params);

    if (command === "slice") {
      if (rest.length !== 1) throw new UsageError("slice needs one seed");
      const d = district(parseInt32(rest[0], "the seed"));
      const levels: number[] = [];
      if (values.all) for (let z = d.levels - 1; z >= 0; z -= 1) levels.push(z);
      else levels.push(parseInt32(values.level, "--level", d.levels - 1));
      io.out(legend());
      for (const level of levels) {
        io.out("");
        io.out(`level ${level}`);
        io.out(sliceAscii(d, level, { facade: values.facade }));
      }
      return 0;
    }
    if (command === "stats") {
      if (rest.length !== 1) throw new UsageError("stats needs one seed");
      const d = district(parseInt32(rest[0], "the seed"));
      const stats = districtStats(d);
      io.out(formatStats(stats, d));
      return stats.check.ok ? 0 : 1;
    }
    if (command === "sweep") {
      if (rest.length !== 2) throw new UsageError("sweep needs a first seed and a count");
      const first = parseInt32(rest[0], "the first seed");
      const count = parseInt32(rest[1], "the count", 100000);
      let failed = 0;
      for (let n = 0; n < count; n += 1) {
        const seed = (first + n) >>> 0;
        const d = district(seed);
        const check = checkDistrict(d);
        if (!check.ok) {
          failed += 1;
          io.out(`seed ${seed}: FAIL ${gridHash(d)}`);
          for (const problem of check.problems) io.out(`  ${problem}`);
        }
      }
      io.out(`sweep: ${count - failed} of ${count} districts pass`);
      return failed === 0 ? 0 : 1;
    }
    throw new UsageError(command === undefined ? "no command" : `unknown command ${command}`);
  } catch (error) {
    if (error instanceof UsageError || error instanceof ParamsError || (error instanceof TypeError && "code" in error)) {
      io.err(`city: ${error.message}`);
      io.err(CITY_USAGE);
      return 2;
    }
    throw error;
  }
}
