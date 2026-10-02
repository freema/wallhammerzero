// Validation in memory: the layout, the schemas, every reference kind, strings and locales,
// and the sim's last word. The fixtures on disk are in fixtures.test.ts.

import { describe, expect, it } from "vitest";
import { analyseGame, EMPTY_CATALOG, formatProblem, resolveGame, validateGame } from "../src/index.ts";
import type { GameInput, ValidationResult } from "../src/index.ts";
import { brief, CATALOG, lab, mini, miniGame, TEST_SLOTS } from "./helpers.ts";

const run = (input: GameInput): ValidationResult => validateGame(input, CATALOG);
const lines = (input: GameInput): string[] => run(input).problems.map(formatProblem);

describe("a valid game", () => {
  it("has no problems and comes back loaded", () => {
    const { problems, game } = run(mini());
    expect(problems).toEqual([]);
    expect(game?.manifest.id).toBe("mini");
    expect(game?.simData.systems).toEqual(["shop.arrivals"]);
    expect(Object.keys(game?.simData.tables ?? {})).toEqual(["arrivals", "customerKinds"]);
    expect(game?.simDataHash).toMatch(/^[0-9a-f]{16}$/);
    expect([...(game?.locales.keys() ?? [])]).toEqual(["cs", "en"]);
    expect(game?.locales.get("cs")).toEqual({ "customerKinds.student.name": "Student", "customerKinds.tourist.name": "Turista" });
    expect(game?.palettes).toEqual(["example"]);
    expect(game?.assets).toEqual([]);
  });

  it("may hold Markdown notes anywhere", () => {
    expect(run(mini({ "README.md": "", "data/notes.md": "" })).problems).toEqual([]);
  });

  it("keeps the rows in the order of the file: the order is part of the sim data", () => {
    const swapped =
      '[\n  { "id": "tourist", "weight": 1, "budgetMin": 10, "budgetMax": 40, "patience": 6 },\n  { "id": "student", "weight": 5, "budgetMin": 2, "budgetMax": 6, "patience": 12 }\n]\n';
    const a = run(mini()).game;
    const b = run(mini({ "data/customerKinds.json": swapped })).game;
    expect(b?.simDataHash).not.toBe(a?.simDataHash);
  });
});

describe("the layout", () => {
  it("needs a game.json", () => {
    expect(lines(mini({ "game.json": null }))).toEqual(["games/mini/game.json: is missing: a game is a folder with a game.json [layout]"]);
  });

  it("refuses a file it does not know", () => {
    expect(brief(run(mini({ "notes.txt": "", "data/sub/x.json": "{}", "locales/English.json": "{}", "data/Bad-Name.json": "[]", "saves/a.json": "{}" })).problems)).toEqual([
      "data/Bad-Name.json  [layout]",
      "data/sub/x.json  [layout]",
      "locales/English.json  [layout]",
      "notes.txt  [layout]",
      "saves/a.json  [layout]",
    ]);
    expect(lines(mini({ "locales/English.json": "{}" }))[0]).toMatch(/unknown file: "English" is not a locale \(en, cs, pt-BR\) \(a game holds: game\.json, data\/<table>\.json, locales\/<lang>\.json/);
  });

  it("reports a file that cannot be read", () => {
    const input = mini({}, { unreadable: new Map([["data/arrivals.json", "it is not UTF-8 text"]]) });
    (input.files as Map<string, string>).delete("data/arrivals.json");
    expect(lines(input)).toEqual([
      "games/mini/data/arrivals.json: cannot be read: it is not UTF-8 text [layout]",
      'games/mini/data/arrivals.json: is missing: the system "shop.arrivals" declares the data table "arrivals" [layout]',
    ]);
  });

  it("needs a file for every data table its systems declare, and no other", () => {
    expect(lines(mini({ "data/arrivals.json": null, "data/items.json": "[]" }))).toEqual([
      'games/mini/data/arrivals.json: is missing: the system "shop.arrivals" declares the data table "arrivals" [layout]',
      'games/mini/data/items.json: no system the game uses declares the data table "items" (declared: arrivals, customerKinds) [layout]',
    ]);
  });

  it("needs at least one locale", () => {
    expect(lines(mini({ "locales/en.json": null, "locales/cs.json": null, "game.json": miniGame({ rowText: undefined }) }))).toEqual([
      "games/mini/locales: is missing: a game needs at least one locale, locales/<lang>.json [layout]",
    ]);
  });

  it("refuses a presentation file whose schema has not landed", () => {
    expect(lines(mini({ "fx.json": "{}", "scenes/shop.json": "{}" }))).toEqual([
      'games/mini/fx.json: there is no schema for fx.json yet: the note "fx-emitters" adds it to packages/game-data/src/layout.ts [layout]',
      'games/mini/scenes/shop.json: there is no schema for scenes/<id>.json yet: the note "runtime-tilemap-scene" adds it to packages/game-data/src/layout.ts [layout]',
    ]);
  });
});

describe("game.json", () => {
  it("reports strict JSON problems with line, column and path", () => {
    expect(lines(mini({ "game.json": '{\n  "id": "mini",\n  "id": "other"\n}' }))).toEqual([
      'games/mini/game.json:3:3: $.id: duplicate key "id": an object may hold a key only once [json]',
    ]);
  });

  it("refuses another schemaVersion before anything else", () => {
    expect(lines(mini({ "game.json": miniGame({ schemaVersion: 2, surprise: true }), "data/arrivals.json": "broken" }))).toEqual([
      "games/mini/game.json:2:20: $.schemaVersion: schemaVersion 2: this game-data reads schemaVersion 1 [schema]",
    ]);
  });

  it("checks every field", () => {
    const game = miniGame({ id: "Mini", title: "", resolution: { width: 8, height: 180.5 }, palette: "Bad Palette", systems: [], extra: 1, rowText: { customerKinds: [] } });
    expect(brief(run(mini({ "game.json": game })).problems)).toEqual([
      "game.json $.id [schema]",
      "game.json $.title [schema]",
      "game.json $.resolution.width [schema]",
      "game.json $.resolution.height [schema]",
      "game.json $.palette [schema]",
      "game.json $.systems [schema]",
      "game.json $.rowText.customerKinds [schema]",
      "game.json $.extra [schema]",
    ]);
  });

  it("needs the id to be the folder name", () => {
    expect(lines(mini({ "game.json": miniGame({ id: "other" }) }))).toEqual([
      'games/mini/game.json:3:9: $.id: the id "other" is not the name of the game\'s folder ("mini") [schema]',
    ]);
  });

  it("needs every system to exist, and the systems a system requires", () => {
    expect(lines(mini({ "game.json": miniGame({ systems: ["shop.arrivals", "shop.delivery"] }) }))).toEqual([
      'games/mini/game.json:12:5: $.systems[1]: unknown system "shop.delivery" (the engine has: shop.arrivals, shop.counter) [ref]',
    ]);
    const counterOnly = run(mini({ "game.json": miniGame({ systems: ["shop.counter"], rowText: undefined }), "data/arrivals.json": null, "data/customerKinds.json": null }));
    expect(counterOnly.problems.map(formatProblem)).toContain(
      'games/mini/game.json:11:5: $.systems[0]: the system "shop.counter" requires "shop.arrivals", which the game does not list [ref]',
    );
  });

  it("does not guess at the tables when a system is unknown", () => {
    const problems = brief(run(mini({ "game.json": miniGame({ systems: ["shop.arrivals", "nope"], rowText: { staff: ["name"] } }), "data/staff.json": "[]" })).problems);
    expect(problems).toEqual(["game.json $.systems[1] [ref]"]);
  });

  it("resolves the palette against the catalog", () => {
    const analysis = analyseGame(mini());
    expect(analysis.problems).toEqual([]);
    expect(resolveGame(analysis, EMPTY_CATALOG).problems.map(formatProblem)).toEqual([
      'games/mini/game.json:9:14: $.palette: no palette "example": assets/palettes/example.json does not exist (palettes: none) [ref]',
    ]);
  });
});

describe("data tables", () => {
  it("reports a float where an integer is declared, with the file and the path", () => {
    expect(lines(mini({ "data/arrivals.json": '{\n  "perMille": 220.5,\n  "queueLimit": 6\n}' }))).toEqual([
      "games/mini/data/arrivals.json:2:15: $.perMille: 220.5 is not an integer: an integer from 0 to 1000 is declared, written without a fraction or an exponent [schema]",
    ]);
  });

  it("reports a duplicate key and stops reading that file", () => {
    const text = '[\n  { "id": "student", "weight": 5, "weight": 6, "budgetMin": 2, "budgetMax": 6, "patience": 12 }\n]';
    expect(lines(mini({ "data/customerKinds.json": text, "game.json": miniGame({ rowText: undefined }), "locales/cs.json": "{}", "locales/en.json": "{}" }))).toEqual([
      'games/mini/data/customerKinds.json:2:35: $[0].weight: duplicate key "weight": an object may hold a key only once [json]',
    ]);
  });

  it("reports unknown and missing fields, a bad id and a duplicate row", () => {
    const text =
      '[\n  { "id": "student", "weight": 5, "budgetMin": 2, "budgetMax": 6, "patience": 12, "mood": 1 },\n  { "id": "Tourist", "weight": 1, "budgetMin": 10, "budgetMax": 40 },\n  { "id": "student", "weight": 1, "budgetMin": 10, "budgetMax": 40, "patience": 6 }\n]';
    expect(brief(run(mini({ "data/customerKinds.json": text })).problems)).toEqual([
      "data/customerKinds.json $[0].mood [schema]",
      "data/customerKinds.json $[1] [schema]",
      "data/customerKinds.json $[1].id [schema]",
      "data/customerKinds.json $[2].id [schema]",
    ]);
  });

  it("resolves row references between tables", () => {
    expect(run(lab()).problems).toEqual([]);
    expect(validateGame(lab({ "data/recipes.json": '[\n  { "id": "smelt", "input": "ore", "output": "ingot", "ticks": 5 }\n]', "data/lab.json": '{ "start": "coal", "fast": true, "tag": "x" }' }), CATALOG).problems.map(formatProblem)).toEqual([
      'games/lab/data/lab.json:1:12: $.start: no row "coal" in the data table "kinds" (data/kinds.json has: bar, ore) [ref]',
      'games/lab/data/recipes.json:2:46: $[0].output: no row "ingot" in the data table "kinds" (data/kinds.json has: bar, ore) [ref]',
    ]);
  });

  it("does not report every reference when the table they point at is broken", () => {
    expect(validateGame(lab({ "data/kinds.json": "[" }), CATALOG).problems.map((problem) => problem.rule)).toEqual(["json"]);
  });

  it("lets the sim have the last word on data that fits the schemas", () => {
    const text = '[\n  { "id": "student", "weight": 0, "budgetMin": 2, "budgetMax": 6, "patience": 12 }\n]';
    const input = mini({ "data/customerKinds.json": text, "locales/cs.json": '{ "customerKinds.student.name": "S" }', "locales/en.json": '{ "customerKinds.student.name": "S" }' });
    expect(lines(input)).toEqual([
      'games/mini/game.json: the sim refuses the game\'s data: data table "customerKinds": the weights add up to 0, so nobody can arrive [sim]',
    ]);
    expect(run(input).game).toBeNull();
  });
});

describe("strings and locales", () => {
  it("needs every row text in every locale, and says which row needs it", () => {
    expect(lines(mini({ "locales/cs.json": '{ "customerKinds.student.name": "Student" }' }))).toEqual([
      'games/mini/data/customerKinds.json:3:11: $[1].id: the string "customerKinds.tourist.name" is missing in the locale "cs" (locales/cs.json) [string]',
    ]);
  });

  it("needs a string one locale has in every locale", () => {
    const en = '{\n  "customerKinds.student.name": "Student",\n  "customerKinds.tourist.name": "Tourist",\n  "shop.greeting": "Hello"\n}';
    expect(lines(mini({ "locales/en.json": en }))).toEqual([
      'games/mini/locales/cs.json:1:1: $["shop.greeting"]: the string is missing in this locale (locales/en.json has it) [string]',
    ]);
  });

  it("checks the ids and the text of a locale", () => {
    const en = '{\n  "customerKinds.student.name": "Student",\n  "customerKinds.tourist.name": "",\n  "Bad Key": "x",\n  "count": 3\n}';
    expect(brief(run(mini({ "locales/en.json": en, "locales/cs.json": null })).problems)).toEqual([
      'locales/en.json $["customerKinds.tourist.name"] [schema]',
      'locales/en.json $["Bad Key"] [schema]',
      "locales/en.json $.count [schema]",
    ]);
  });

  it("checks rowText against the tables", () => {
    expect(lines(mini({ "game.json": miniGame({ rowText: { arrivals: ["name"], staff: ["name"] } }) }))).toEqual([
      'games/mini/game.json:14:5: $.rowText.arrivals: "arrivals" is a record, not a table of rows: it has no rows to name [ref]',
      'games/mini/game.json:17:5: $.rowText.staff: no data table "staff" (the game\'s systems declare: arrivals, customerKinds) [ref]',
    ]);
  });

  it("skips a locale that cannot be read instead of reporting every string", () => {
    expect(run(mini({ "locales/cs.json": "{" })).problems.map((problem) => problem.rule)).toEqual(["json"]);
  });
});

describe("presentation and the reference kinds", () => {
  const view = (value: unknown): GameInput =>
    mini(
      { "view.json": JSON.stringify(value, null, 2), "scenes/shop.json": '{ "tileSize": 16, "floor": "examples/floor" }' },
      { presentation: TEST_SLOTS },
    );

  it("accepts a document whose ids all resolve, and lists what the game uses", () => {
    const input = view({
      title: "customerKinds.student.name",
      start: "shop",
      table: "customerKinds",
      bindings: [{ kind: "student", sprite: "examples/blinking-dot", clip: "blink", icon: "examples/floor", sound: "examples/coin" }],
    });
    const analysis = analyseGame(input);
    expect(analysis.assetIds).toEqual(["examples/blinking-dot", "examples/floor"]);
    const { problems, game } = resolveGame(analysis, CATALOG);
    expect(problems).toEqual([]);
    expect(game?.assets).toEqual(["examples/blinking-dot", "examples/floor"]);
    expect(game?.sounds).toEqual(["examples/coin"]);
    expect([...(game?.presentation.keys() ?? [])]).toEqual(["scenes/shop.json", "view.json"]);
  });

  it("reports each kind of dangling id with its path", () => {
    const input = view({
      title: "ui.title",
      start: "cellar",
      table: "staff",
      bindings: [
        { kind: "pensioner" },
        { kind: "student", sprite: "examples/ghost", clip: "walk" },
        { kind: "student", sprite: "examples/floor", clip: "idle" },
        { kind: "student", sprite: "examples/blinking-dot", clip: "walk" },
        { kind: "student", sprite: "examples/broken" },
        { kind: "student", clip: "blink" },
        { kind: "student", icon: "examples/nothing", sound: "examples/boom" },
      ],
    });
    expect(run(input).problems.map((problem) => `${problem.file.slice("games/mini/".length)} ${problem.path}: ${problem.message} [${problem.rule}]`)).toEqual([
      'view.json $.title: the string "ui.title" is missing in the locale "cs" (locales/cs.json) [string]',
      'view.json $.title: the string "ui.title" is missing in the locale "en" (locales/en.json) [string]',
      'view.json $.start: "cellar" does not resolve: scenes/cellar.json does not exist [ref]',
      'view.json $.table: no data table "staff" (the game\'s systems declare: arrivals, customerKinds) [ref]',
      'view.json $.bindings[0].kind: no row "pensioner" in the data table "customerKinds" (data/customerKinds.json has: student, tourist) [ref]',
      'view.json $.bindings[1].sprite: no asset "examples/ghost": assets/examples/ghost/gen.ts does not exist [ref]',
      'view.json $.bindings[2].sprite: the asset "examples/floor" is of kind "tiles", and "sprite" is needed here [ref]',
      'view.json $.bindings[3].clip: the asset "examples/blinking-dot" has no clip "walk" (clips: blink) [ref]',
      'view.json $.bindings[4].sprite: the asset "examples/broken" cannot be loaded: the program throws [ref]',
      'view.json $.bindings[5].clip: the clip belongs to the asset in the field "sprite", which is missing here [ref]',
      'view.json $.bindings[6].icon: no asset "examples/nothing": assets/examples/nothing/gen.ts does not exist [ref]',
      'view.json $.bindings[6].sound: no sound "examples/boom" (sounds: examples/coin) [ref]',
    ]);
  });

  it("checks a presentation document against its schema", () => {
    const input = mini({ "scenes/shop.json": '{ "tileSize": 4, "light": true }' }, { presentation: TEST_SLOTS });
    expect(brief(run(input).problems)).toEqual(["scenes/shop.json $.tileSize [schema]", "scenes/shop.json $.light [schema]"]);
  });

  it("resolves the entry scene", () => {
    const withScene = mini({ "game.json": miniGame({ entryScene: "shop" }), "scenes/shop.json": '{ "tileSize": 16 }' }, { presentation: TEST_SLOTS });
    expect(run(withScene).problems).toEqual([]);
    const without = mini({ "game.json": miniGame({ entryScene: "shop" }) }, { presentation: TEST_SLOTS });
    expect(brief(run(without).problems)).toEqual(["game.json $.entryScene [ref]"]);
  });
});

describe("the report", () => {
  it("is sorted by file, then by position", () => {
    const problems = run(mini({ "data/arrivals.json": '{ "queueLimit": 6.5, "perMille": 1.5 }', "game.json": miniGame({ palette: "nope" }), "zzz.txt": "" })).problems;
    expect(problems.map((problem) => `${problem.file}:${problem.line}:${problem.col}`)).toEqual([
      "games/mini/data/arrivals.json:1:17",
      "games/mini/data/arrivals.json:1:34",
      "games/mini/game.json:9:14",
      "games/mini/zzz.txt:0:0",
    ]);
  });

  it("resolveGame only takes what analyseGame gave", () => {
    expect(() => resolveGame({ dir: "x", problems: [], assetIds: [] }, CATALOG)).toThrow(/does not come from analyseGame/);
  });
});
