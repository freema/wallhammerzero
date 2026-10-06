// The games on disk: the example validates, and every defect fixture fails with exactly its
// defect, reported with the file and the JSON path.

import { cpSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatProblem } from "../src/index.ts";
import { findGame, findGames, openGameProject, readGameFiles, validateGameDir } from "../src/node/index.ts";
import type { ValidateOptions } from "../src/node/index.ts";
import { EXAMPLE, exampleCopy, FIXTURES, LAB_SYSTEMS, replaceInFile, REPO, scratch } from "./helpers.ts";

const repo = openGameProject({ root: REPO });
const fixtures = openGameProject({ root: REPO, games: FIXTURES });
const at = (name: string, rest: string): string => `${FIXTURES}/${name}/${rest}`;

/**
 * The palettes of the checkout, as `validate` lists them. Read from the folder here, so a
 * palette added under assets/palettes does not change what this test expects.
 */
const PALETTES = readdirSync(join(REPO, "assets/palettes"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -".json".length))
  .sort()
  .join(", ");

/** Every fixture and the one line `validate` must print for it (two for unknown-file). */
const DEFECTS: Readonly<Record<string, readonly string[]>> = {
  "dangling-row": [at("dangling-row", 'data/recipes.json:2:46: $[0].output: no row "ingot" in the data table "kinds" (data/kinds.json has: bar, ore) [ref]')],
  "dangling-palette": [at("dangling-palette", 'game.json:9:14: $.palette: no palette "no-such-palette": assets/palettes/no-such-palette.json does not exist (palettes: ' + PALETTES + ") [ref]")],
  "dangling-scene": [at("dangling-scene", 'game.json:18:17: $.entryScene: "shop" does not resolve: scenes/shop.json does not exist [ref]')],
  "dangling-system": [at("dangling-system", 'game.json:12:5: $.systems[1]: unknown system "shop.delivery" (the engine has: shop.arrivals, shop.counter) [ref]')],
  "dangling-table": [at("dangling-table", 'game.json:17:5: $.rowText.staff: no data table "staff" (the game\'s systems declare: arrivals, customerKinds) [ref]')],
  "duplicate-key": [at("duplicate-key", 'data/customerKinds.json:3:84: $[1].weight: duplicate key "weight": an object may hold a key only once [json]')],
  "duplicate-row": [at("duplicate-row", 'data/customerKinds.json:3:11: $[1].id: the id "student" is used twice (first in $[0]) [schema]')],
  "float-integer": [
    at("float-integer", "data/arrivals.json:1:15: $.perMille: 220.5 is not an integer: an integer from 0 to 1000 is declared, written without a fraction or an exponent [schema]"),
  ],
  "missing-string": [
    at("missing-string", 'data/customerKinds.json:3:11: $[1].id: the string "customerKinds.tourist.name" is missing in the locale "cs" (locales/cs.json) [string]'),
  ],
  "sim-refuses": [at("sim-refuses", 'game.json: the sim refuses the game\'s data: data table "customerKinds", row "student": budgetMin is above budgetMax [sim]')],
  "unknown-field": [at("unknown-field", 'data/arrivals.json:1:37: $.rushHour: unknown field "rushHour" (known: perMille, queueLimit) [schema]')],
  "unknown-file": [
    at("unknown-file", 'data/staff.json: no system the game uses declares the data table "staff" (declared: arrivals, customerKinds) [layout]'),
    at(
      "unknown-file",
      "notes.txt: unknown file: it is not a file of a game (a game holds: game.json, data/<table>.json, locales/<lang>.json, scenes/<id>.json, ui/<id>.json, fx.json, audio.json, *.md) [layout]",
    ),
  ],
};

/**
 * The fixtures that need a system the engine does not have. A dangling row id needs a table
 * with a `field.ref`, and no engine system declares one yet, so `dangling-row` is a game on the
 * tests' own "lab" system (helpers.ts).
 */
const TEST_SYSTEMS: Readonly<Record<string, ValidateOptions>> = {
  "dangling-row": { systems: LAB_SYSTEMS },
};

describe("the example game", () => {
  it("validates", async () => {
    const { problems, game } = await validateGameDir(repo, findGame(repo, "counter-shop"));
    expect(problems.map(formatProblem)).toEqual([]);
    expect(game?.manifest).toEqual({
      schemaVersion: 1,
      id: "counter-shop",
      title: "Counter Shop",
      resolution: { width: 320, height: 180 },
      palette: "example",
      systems: ["shop.arrivals", "shop.counter"],
      rowText: { customerKinds: ["name"], items: ["name"] },
    });
    expect(Object.keys(game?.simData.tables ?? {})).toEqual(["arrivals", "customerKinds", "items", "shop"]);
    expect([...(game?.locales.keys() ?? [])]).toEqual(["cs", "en"]);
  });

  it("is found by id and by folder", () => {
    expect(findGames(repo).map((entry) => entry.dir)).toContain(EXAMPLE);
    expect(findGame(repo, "counter-shop").dir).toBe(EXAMPLE);
    expect(findGame(repo, EXAMPLE).id).toBe("counter-shop");
    expect(findGame(repo, `${EXAMPLE}/`).id).toBe("counter-shop");
    expect(() => findGame(repo, "counter-shop-2")).toThrow(/no game "counter-shop-2" under games \(games: .*counter-shop/);
  });
});

describe("the defect fixtures", () => {
  it("are all listed here", () => {
    const folders = readdirSync(join(REPO, FIXTURES), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(folders.sort()).toEqual([...Object.keys(DEFECTS), "ok-shop"].sort());
  });

  it("ok-shop, the base of every fixture, validates", async () => {
    const { problems, game } = await validateGameDir(fixtures, findGame(fixtures, "ok-shop"));
    expect(problems.map(formatProblem)).toEqual([]);
    expect(game).not.toBeNull();
  });

  it.each(Object.keys(DEFECTS))("%s fails with its defect, the file and the JSON path", async (name) => {
    const { problems, game } = await validateGameDir(fixtures, findGame(fixtures, name), TEST_SYSTEMS[name]);
    expect(problems.map(formatProblem)).toEqual(DEFECTS[name]);
    expect(game).toBeNull();
  });

  it("dangling-row is the lab game with one row id changed: with the id put right it validates", async () => {
    const dir = scratch("dangling-row");
    cpSync(join(REPO, FIXTURES, "dangling-row"), join(dir, "games", "dangling-row"), { recursive: true });
    replaceInFile(join(dir, "games", "dangling-row", "data/recipes.json"), '"ingot"', '"bar"');
    const project = openGameProject({ root: REPO, games: join(dir, "games") });
    const { problems, game } = await validateGameDir(project, findGame(project, "dangling-row"), TEST_SYSTEMS["dangling-row"]);
    expect(problems.map(formatProblem)).toEqual([]);
    expect(game).not.toBeNull();
  });

  it("without the test's system, the command line reports dangling-row as a game on an unknown system", async () => {
    const { problems } = await validateGameDir(fixtures, findGame(fixtures, "dangling-row"));
    expect(problems.map(formatProblem)).toEqual([at("dangling-row", 'game.json:11:5: $.systems[0]: unknown system "lab" (the engine has: shop.arrivals, shop.counter) [ref]')]);
  });
});

describe("reading a folder", () => {
  const dir = scratch("read");

  it("reports a file that is not UTF-8, refuses a byte order mark, and skips hidden files", async () => {
    const project = exampleCopy(dir, (game) => {
      writeFileSync(join(game, "data/shop.json"), Buffer.from([0x7b, 0xff, 0x7d]));
      writeFileSync(join(game, "data/arrivals.json"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{ "perMille": 220, "queueLimit": 6 }')]));
      writeFileSync(join(game, ".DS_Store"), "x");
    });
    const entry = findGame(project, "counter-shop");
    const { files, unreadable } = readGameFiles(entry);
    expect([...unreadable]).toEqual([["data/shop.json", "it is not UTF-8 text"]]);
    expect(files.has(".DS_Store")).toBe(false);
    const { problems } = await validateGameDir(project, entry);
    expect(problems.map((problem) => `${problem.file.slice(entry.dir.length + 1)}: ${problem.message} [${problem.rule}]`)).toEqual([
      "data/arrivals.json: the file starts with a byte order mark: save it as UTF-8 without one [json]",
      "data/shop.json: cannot be read: it is not UTF-8 text [layout]",
      'data/shop.json: is missing: the system "shop.counter" declares the data table "shop" [layout]',
    ]);
  });

  it("refuses two games with one id", () => {
    const project = exampleCopy(dir, (game) => cpSync(game, join(game, "..", "group", "counter-shop"), { recursive: true }));
    expect(() => findGames(project)).toThrow(/two games have the id "counter-shop"/);
    expect(() => findGame(project, "counter-shop")).toThrow(/two games have the id "counter-shop"/);
  });
});
