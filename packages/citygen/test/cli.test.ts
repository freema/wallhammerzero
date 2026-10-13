// The `city` command line: output, exit codes and usage errors.

import { describe, expect, it } from "vitest";
import { generateDistrict, gridHash } from "../src/index.ts";
import { runCityCli } from "../src/node/index.ts";

function run(args: string[]): { code: number; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const code = runCityCli(args, { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out, err };
}

describe("city", () => {
  it("stats prints the grid hash, the bands and passes the checks", () => {
    const { code, out } = run(["stats", "42"]);
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toContain(`grid hash ${gridHash(generateDistrict(42))}`);
    for (const band of ["undercity", "streets", "middle", "upper", "roofs", "lanes"]) expect(text).toContain(band);
    expect(text).toContain("reachability: ok");
    expect(text).toContain("check: ok");
  });

  it("stats gives the same hash twice", () => {
    expect(run(["stats", "0x2a"]).out).toEqual(run(["stats", "42"]).out);
  });

  it("slice prints one level as depth lines of width characters", () => {
    const { code, out } = run(["slice", "3", "--level", "3", "--width", "20", "--depth", "14"]);
    expect(code).toBe(0);
    const rows = out.slice(out.indexOf("level 3") + 1).join("\n").split("\n");
    expect(rows).toHaveLength(14);
    for (const row of rows) expect(row).toMatch(/^[.#=:\-^>v<HP%~]{20}$/);
  });

  it("slice --facade shows solid cells by style", () => {
    const { out } = run(["slice", "3", "--level", "6", "--facade"]);
    const rows = out.slice(out.indexOf("level 6") + 1).join("");
    expect(rows).toMatch(/[uhmda]/);
    expect(rows).not.toContain("#");
  });

  it("sweep checks a run of seeds", () => {
    const { code, out } = run(["sweep", "100", "5"]);
    expect(code).toBe(0);
    expect(out).toEqual(["sweep: 5 of 5 districts pass"]);
  });

  it("refuses bad usage with exit code 2", () => {
    for (const args of [[], ["fly"], ["slice", "1"], ["slice", "x", "--level", "1"], ["slice", "1", "--level", "99"], ["stats"], ["stats", "1", "--width", "5"], ["stats", "1", "--bogus"]]) {
      const { code, err } = run(args);
      expect(code, args.join(" ")).toBe(2);
      expect(err.join("\n")).toContain("usage: city");
    }
  });
});
