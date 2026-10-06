// The `game` command line: what it prints, what it writes and its exit codes. Most tests run
// `runCli` in-process; the last ones start the real entry point.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JSON_SCHEMA_DIALECT } from "../src/index.ts";
import { GAME_COMMANDS, readPackageDir, runCli, selectGames, UsageError } from "../src/node/index.ts";
import type { GameCommand } from "../src/node/index.ts";
import { EXAMPLE, FIXTURES, here, REPO, scratch } from "./helpers.ts";

const BIN = here("../src/node/bin.ts");
const temp = scratch("cli");

/** Runs the CLI from the repo root and collects what it prints. */
async function run(argv: string[], commands?: readonly GameCommand[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { out: (line) => out.push(line), err: (line) => err.push(line), cwd: REPO }, commands);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("usage", () => {
  it("prints the help with exit code 0", async () => {
    for (const argv of [[], ["help"], ["--help"], ["validate", "-h"]]) {
      const result = await run(argv);
      expect(result.code).toBe(0);
      expect(result.out).toMatch(/^game <command> \[options\]/);
      expect(result.out).toContain("validate <id>... | --all");
      expect(result.out).toContain("Exit codes: 0 fine, 1 a game has problems, 2 wrong usage.");
    }
  });

  it.each([
    [["paint"], 'game: unknown command "paint"'],
    [["validate"], "game: validate needs game ids or --all (not both)"],
    [["validate", "counter-shop", "--all"], "game: validate needs game ids or --all (not both)"],
    [["pack"], "game: pack needs game ids or --all (not both)"],
    [["validate", "--all", "--fast"], "game: unknown option --fast"],
    [["validate", "--games"], "game: --games needs a value"],
    [["validate", "no-such-game"], 'game: no game "no-such-game" under games (games: '],
    [["schema", "a", "b"], "game: schema takes one name"],
    [["schema", "nope"], 'game: no schema "nope" (schemas: game, locale, package, table:arrivals, table:customerKinds, table:shop, table:items)'],
  ])("%j is wrong usage: exit code 2", async (argv, message) => {
    const result = await run(argv);
    expect(result.code).toBe(2);
    expect(result.err.split("\n")[0]).toContain(message);
    expect(result.err).toContain("game <command> [options]");
    expect(result.out).toBe("");
  });
});

describe("list", () => {
  it("lists the games of the checkout", async () => {
    const result = await run(["list"]);
    expect(result.code).toBe(0);
    expect(result.out.split("\n")).toContain(`counter-shop\t${EXAMPLE}\tCounter Shop`);
    const json = JSON.parse((await run(["list", "--json"])).out) as unknown[];
    expect(json).toContainEqual({ id: "counter-shop", dir: EXAMPLE, title: "Counter Shop" });
  });

  it("still lists a game whose game.json is broken", async () => {
    const result = await run(["list", "--games", FIXTURES]);
    expect(result.out.split("\n")).toHaveLength(13);
    expect(result.out).toContain(`ok-shop\t${FIXTURES}/ok-shop\tFixture`);
  });

  it("says when there are none", async () => {
    expect((await run(["list", "--games", "docs"])).out).toBe("no games under docs");
  });
});

describe("validate", () => {
  it("passes on the example: exit code 0 and one line", async () => {
    const result = await run(["validate", "counter-shop"]);
    expect(result).toEqual({
      code: 0,
      out: `ok counter-shop (${EXAMPLE}): 2 systems, 4 tables, 2 locales, 12 strings, simDataHash 6cbfd194efd4e042`,
      err: "",
    });
    expect((await run(["validate", EXAMPLE])).code).toBe(0);
    expect((await run(["validate", "--all"])).code).toBe(0);
  });

  it.each([
    ["dangling-palette", "game.json:9:14: $.palette: no palette"],
    ["duplicate-key", 'data/customerKinds.json:3:84: $[1].weight: duplicate key "weight"'],
    ["float-integer", "data/arrivals.json:1:15: $.perMille: 220.5 is not an integer"],
    ["missing-string", 'data/customerKinds.json:3:11: $[1].id: the string "customerKinds.tourist.name" is missing in the locale "cs"'],
  ])("fails on the fixture %s: exit code 1, with the file and the JSON path", async (name, line) => {
    const result = await run(["validate", "--games", FIXTURES, name]);
    expect(result.code).toBe(1);
    const lines = result.out.split("\n");
    expect(lines[0]).toContain(`${FIXTURES}/${name}/${line}`);
    expect(lines.at(-1)).toBe(`FAILED ${name} (${FIXTURES}/${name}): 1 problem`);
    expect(result.err).toBe("");
  });

  it("validates every game with --all and counts the failures", async () => {
    const result = await run(["validate", "--games", FIXTURES, "--all"]);
    expect(result.code).toBe(1);
    expect(result.out).toContain(`ok ok-shop (${FIXTURES}/ok-shop): 1 system, 2 tables, 2 locales, 4 strings, simDataHash `);
    expect(result.out.split("\n").at(-1)).toBe("validate: 12 of 13 games failed");
  });
});

describe("pack", () => {
  it("writes the package and prints both hashes", async () => {
    const result = await run(["pack", "counter-shop", "--out", temp]);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    const lines = result.out.split("\n");
    expect(lines[0]).toMatch(/^packed counter-shop: .*\/games\/counter-shop\/package \(5 files, \d+ bytes\)$/);
    expect(lines[1]).toBe("  simDataHash 6cbfd194efd4e042");
    expect(lines[2]).toMatch(/^ {2}assetManifest [0-9a-f]{16} \(3 files\)$/);
    expect([...readPackageDir(join(temp, "games/counter-shop/package")).keys()].sort()).toEqual([
      "game.json",
      "locales/cs.json",
      "locales/en.json",
      "palettes/example.json",
      "sim.json",
    ]);
  });

  it("fails on a game with a problem and writes nothing", async () => {
    const result = await run(["pack", "--games", FIXTURES, "float-integer", "--out", temp]);
    expect(result.code).toBe(1);
    expect(result.out.split("\n").at(-1)).toBe(`FAILED float-integer (${FIXTURES}/float-integer): 1 problem, nothing was written`);
    expect(existsSync(join(temp, "games/float-integer"))).toBe(false);
  });
});

describe("schema", () => {
  it("lists the schemas and prints one as a JSON Schema", async () => {
    expect((await run(["schema"])).out.split("\n")).toEqual(["game", "locale", "package", "table:arrivals", "table:customerKinds", "table:shop", "table:items"]);
    const result = await run(["schema", "table:items"]);
    expect(result.code).toBe(0);
    const json = JSON.parse(result.out) as { $schema: string; $id: string; items: { properties: { price: unknown } } };
    expect(json.$schema).toBe(JSON_SCHEMA_DIALECT);
    expect(json.$id).toBe("wz:game-data/table/items");
    expect(json.items.properties.price).toEqual({ type: "integer", minimum: 1, maximum: 100000 });
  });
});

describe("commands of another package", () => {
  const hello: GameCommand = {
    name: "hello",
    help: ["hello <id> [--loud]          greet a game"],
    flags: ["--loud"],
    options: ["--from"],
    optionHelp: ["--loud           hello: in capitals"],
    run(args, io) {
      const [entry] = selectGames("hello", args);
      if (entry === undefined) throw new UsageError("hello needs a game");
      const text = `hello ${entry.id} from ${args.values.get("--from") ?? "nobody"}`;
      io.out(args.flags.has("--loud") ? text.toUpperCase() : text);
      return 0;
    },
  };
  const commands = [...GAME_COMMANDS, hello];

  it("join the table: their own options, the shared ones, the help", async () => {
    expect(await run(["hello", "counter-shop", "--loud", "--from", "tests"], commands)).toEqual({ code: 0, out: "HELLO COUNTER-SHOP FROM TESTS", err: "" });
    expect((await run(["help"], commands)).out).toContain("hello <id> [--loud]          greet a game");
    expect((await run(["help"], commands)).out).toContain("--loud           hello: in capitals");
    expect((await run(["validate", "counter-shop", "--loud"], commands)).code).toBe(2);
    expect((await run(["hello", "counter-shop"])).code).toBe(2);
  });

  it("an error that is not a usage error is exit code 1", async () => {
    const broken: GameCommand = {
      name: "broken",
      help: ["broken"],
      run() {
        throw new Error("the disk is full");
      },
    };
    expect(await run(["broken"], [broken])).toEqual({ code: 1, out: "", err: "game: the disk is full" });
  });
});

describe("the entry point", () => {
  const start = (...argv: string[]): { status: number | null; stdout: string; stderr: string } =>
    spawnSync(process.execPath, [BIN, ...argv], { cwd: REPO, encoding: "utf8" });

  it("exits 0 on the example and 1 on a fixture, with the problem on stdout", () => {
    const good = start("validate", "counter-shop");
    expect([good.status, good.stderr]).toEqual([0, ""]);
    expect(good.stdout).toMatch(/^ok counter-shop /);
    const bad = start("validate", "--games", FIXTURES, "dangling-system");
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('$.systems[1]: unknown system "shop.delivery"');
  });

  it("exits 2 on wrong usage", () => {
    const result = start("validate");
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/^game: validate needs game ids or --all/);
  });

  it("resolves --root from the folder it is started in", () => {
    const result = spawnSync(process.execPath, [BIN, "validate", "--all", "--root", "../.."], { cwd: here(".."), encoding: "utf8" });
    expect([result.status, result.stderr]).toEqual([0, ""]);
    expect(result.stdout).toContain(`ok counter-shop (${EXAMPLE})`);
  });
});
